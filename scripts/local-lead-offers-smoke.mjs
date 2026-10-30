import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
const env = readFileSync(".env.local", "utf8"),
  url = env
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
    .trim()
    .replace(/^"|"$/g, "");
assert(
  url &&
    new URL(url).protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(env) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(env),
);
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const testDeletion = process.argv.includes("--delete-lead");
const testContactReview = process.argv.includes("--contact-review");
assert(!(testDeletion && testContactReview));
const subject = `qa-lead-offers-${randomUUID()}`,
  phone = "+12025550123";
const make = (clerkId, claims = {}) => {
  const c = new ConvexHttpClient(url, { logger: false });
  c.setAdminAuth(cfg.adminKey, {
    subject: clerkId,
    issuer: "https://qa.clerk.accounts.dev",
    ...claims,
  });
  return c;
};
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const owner = make("qa-owner-search"),
  traveler = make(subject),
  other = make("qa-tenant-search");
const known = JSON.parse(
  readFileSync("docs/evidence/local-units-smoke.json", "utf8"),
);
assert.equal(known.hosted, false);
assert.equal(known.target, url);
const root = await call(owner, "query", "listings:getById", {
  id: known.mainListingId,
});
const unit = await call(owner, "query", "listings:getById", {
  id: known.unitListingId,
});
assert(
  root.title.startsWith("[QA] Census public-address") &&
    unit.title === "[QA] Synthetic additional unit — not a rental",
);
assert(
  root.landlordId === unit.landlordId &&
    root.propertyGroupId === unit.propertyGroupId,
);
assert.equal(root.publicationRequested, false);
assert.equal(unit.publicationRequested, false);
// Also verifies local-only synthetic billing and disabled real email delivery.
await prepareLocalPublication([]);
const user = await call(traveler, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic multi-unit traveler",
  email: "lead-offers@example.test",
});
const confirmed = make(subject, {
  phoneNumber: phone,
  phoneNumberVerified: true,
  iat: Math.floor(Date.now() / 1000),
});
let requestId, receipt;
const borrowed = [];
try {
  const active = (
    await call(owner, "query", "listings:getByLandlord", {
      landlordId: root.landlordId,
    })
  ).filter((l) => l.status === "active");
  let needed = Math.max(0, active.length + 2 - 5);
  if (needed) {
    const search = JSON.parse(
      readFileSync("docs/evidence/local-search-smoke.json", "utf8"),
    );
    assert(search.hosted === false && search.target === url);
    for (const id of search.syntheticListingIds) {
      if (!needed) break;
      const known = await call(owner, "query", "listings:getById", { id });
      assert(
        known.landlordId === root.landlordId &&
          [
            "[QA] Flexible Austin apartment",
            "[QA] Exact Austin apartment",
          ].includes(known.title),
      );
      if (known.status === "active" && known.publicationRequested === true) {
        borrowed.push(id);
        await call(owner, "mutation", "listings:unpublish", { id });
        needed--;
      }
    }
    assert.equal(
      needed,
      0,
      "Only receipt-bound QA listings may temporarily lend publication capacity",
    );
  }
  await prepareLocalPublication([root._id, unit._id]);
  await call(confirmed, "mutation", "users:confirmPhone", { phone });
  const moveInDate = Date.UTC(2027, 1, 1),
    moveOutDate = Date.UTC(2027, 4, 2);
  requestId = await call(traveler, "mutation", "housingRequests:create", {
    userId: user._id,
    city: root.city,
    state: root.state,
    moveInDate,
    moveOutDate,
    duration: 3,
    maxBudget: 50000,
    bedrooms: 0,
    petFriendly: false,
    description: "[QA] Synthetic multi-unit request; no actual stay",
    contactPreference: "phone",
  });
  let item;
  for (let attempt = 0; attempt < 40; attempt++) {
    item = (
      await call(owner, "query", "housingRequests:inbox", {
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).page.find((row) => row.request._id === requestId);
    if (item) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(item);
  assert.equal(item.phone, null);
  const options = (
    await call(owner, "query", "housingRequests:matchingProperties", {
      requestId,
      orderVersion: 1,
      paginationOpts: { cursor: null, numItems: 25 },
    })
  ).page;
  const chosen = options.find((row) => row.listingId === unit._id);
  assert(chosen && options.some((row) => row.listingId === root._id));
  assert.equal(chosen.propertyId, root.propertyGroupId);
  assert.equal(chosen.unitName, unit.unitName);
  assert.equal(
    (
      await call(owner, "query", "housingRequests:leadContact", {
        requestId,
        listingId: unit._id,
      })
    ).phone,
    phone,
  );
  await assert.rejects(
    call(other, "query", "housingRequests:leadContact", {
      requestId,
      listingId: unit._id,
    }),
    /Not authorized/,
  );
  const conversationId = await call(
    owner,
    "mutation",
    "housingRequests:reply",
    {
      requestId,
      listingId: unit._id,
      message:
        "[QA] This specific synthetic unit is offered for discussion; no stay is booked.",
    },
  );
  assert.equal(
    await call(owner, "mutation", "housingRequests:reply", {
      requestId,
      listingId: unit._id,
      message: "Uncertain first-reply retry",
    }),
    conversationId,
  );
  await assert.rejects(
    call(owner, "mutation", "housingRequests:reply", {
      requestId,
      listingId: root._id,
      message: "Another first offer",
    }),
    /already replied/,
  );
  const response = (
    await call(owner, "query", "housingRequests:inbox", {
      paginationOpts: { cursor: null, numItems: 25 },
    })
  ).page.find((row) => row.request._id === requestId).response;
  assert.equal(response.conversationId, conversationId);
  assert.equal(response.listingId, unit._id);
  assert.equal(response.unitName, unit.unitName);
  const messages = (
    await call(traveler, "query", "messages:listMessages", {
      conversationId,
      paginationOpts: { cursor: null, numItems: 25 },
    })
  ).page;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].housingRequestId, requestId);
  assert(
    messages[0].content.includes(unit.unitName) &&
      messages[0].content.includes(`/listings/${unit._id}`) &&
      messages[0].content.includes("2027-02-01") &&
      messages[0].content.includes("no booking is confirmed"),
  );
  assert.deepEqual(
    await call(traveler, "query", "housingRequests:offerLink", {
      messageId: messages[0]._id,
    }),
    { listingId: unit._id, moveIn: moveInDate, moveOut: moveOutDate },
  );
  if (testContactReview) {
    const staff = make("qa-publication-staff");
    assert.equal(
      (
        await call(staff, "query", "users:getByClerkId", {
          clerkId: "qa-publication-staff",
        })
      ).role,
      "admin",
    );
    const reportedMessage = await call(
      traveler,
      "mutation",
      "messages:sendMessage",
      {
        senderId: user._id,
        receiverId: root.landlordId,
        listingId: unit._id,
        content: "[QA] Synthetic contact-review test message",
        origin: "inbox",
      },
    );
    const caseId = await call(owner, "mutation", "support:report", {
      messageId: reportedMessage,
      category: "Spam or suspicious message",
      details:
        "[QA] Synthetic precautionary contact review, no actual allegation",
    });
    await assert.rejects(
      call(owner, "mutation", "support:review", {
        id: caseId,
        status: "reviewing",
        note: "Must not grant staff authority",
        contactAction: "hold",
        expectedContactRevision: 0,
      }),
      /Staff/,
    );
    await call(staff, "mutation", "support:review", {
      id: caseId,
      status: "reviewing",
      note: "[QA] Synthetic contact pause",
      contactAction: "hold",
      expectedContactRevision: 0,
    });
    assert(
      (
        await call(owner, "query", "housingRequests:inbox", {
          paginationOpts: { cursor: null, numItems: 25 },
        })
      ).page.find((row) => row.request._id === requestId)?.contactRestricted,
    );
    assert.equal(
      (
        await call(owner, "query", "housingRequests:leadContact", {
          requestId,
          listingId: unit._id,
        })
      ).phone,
      null,
    );
    await assert.rejects(
      call(owner, "mutation", "housingRequests:reply", {
        requestId,
        listingId: unit._id,
        message: "Must not send during review",
      }),
      /unavailable/,
    );
    await assert.rejects(
      call(traveler, "mutation", "messages:sendMessage", {
        senderId: user._id,
        receiverId: root.landlordId,
        listingId: unit._id,
        content: "Must not send during review",
      }),
      /unavailable/,
    );
    assert(
      (
        await call(traveler, "query", "messages:listMessages", {
          conversationId,
          paginationOpts: { cursor: null, numItems: 25 },
        })
      ).page.some((row) => row._id === reportedMessage),
    );
    await call(staff, "mutation", "support:review", {
      id: caseId,
      status: "resolved",
      note: "[QA] Synthetic review cleared",
      contactAction: "release",
      expectedContactRevision: 1,
    });
    assert.equal(
      (
        await call(owner, "query", "housingRequests:leadContact", {
          requestId,
          listingId: unit._id,
        })
      ).phone,
      phone,
    );
    const info = await call(staff, "query", "support:get", { id: caseId });
    assert(info.contactReview.revision === 2 && !info.contactReview.restricted);
  }
  await call(owner, "mutation", "listings:unpublish", { id: unit._id });
  assert.equal(
    (
      await call(owner, "query", "housingRequests:leadContact", {
        requestId,
        listingId: unit._id,
      })
    ).phone,
    null,
  );
  assert.equal(
    (
      await call(owner, "query", "housingRequests:inbox", {
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).page.find((row) => row.request._id === requestId).response.conversationId,
    conversationId,
  );
  assert.equal(
    await call(traveler, "query", "housingRequests:offerLink", {
      messageId: messages[0]._id,
    }),
    null,
  );
  if (testDeletion) {
    await call(owner, "mutation", "listings:publish", { id: unit._id });
    assert.equal(
      (
        await call(owner, "query", "housingRequests:leadContact", {
          requestId,
          listingId: unit._id,
        })
      ).phone,
      phone,
    );
    await assert.rejects(
      call(other, "mutation", "housingRequests:deleteLead", {
        deliveryId: item.deliveryId,
      }),
      /Not authorized/,
    );
    await call(owner, "mutation", "housingRequests:deleteLead", {
      deliveryId: item.deliveryId,
    });
    await call(owner, "mutation", "housingRequests:deleteLead", {
      deliveryId: item.deliveryId,
    });
    const admin = new ConvexHttpClient(url, { logger: false });
    admin.setAdminAuth(cfg.adminKey);
    await call(admin, "mutation", "housingRequests:scanRequest", {
      requestId,
      cursor: null,
    });
    assert(
      !(
        await call(owner, "query", "housingRequests:inbox", {
          paginationOpts: { cursor: null, numItems: 25 },
        })
      ).page.some((row) => row.request._id === requestId),
    );
    assert.equal(
      (
        await call(owner, "query", "housingRequests:leadContact", {
          requestId,
          listingId: unit._id,
        })
      ).phone,
      null,
    );
    assert.equal(
      (
        await call(owner, "query", "housingRequests:matchingProperties", {
          requestId,
          orderVersion: 1,
          paginationOpts: { cursor: null, numItems: 25 },
        })
      ).page.length,
      0,
    );
    await assert.rejects(
      call(owner, "mutation", "housingRequests:reply", {
        requestId,
        listingId: unit._id,
        message: "Must not send",
      }),
      /deleted/,
    );
    const retained = await call(traveler, "query", "messages:listMessages", {
      conversationId,
      paginationOpts: { cursor: null, numItems: 25 },
    });
    assert.deepEqual(retained.page, messages);
    assert(
      (
        await call(traveler, "query", "housingRequests:getMine", {
          paginationOpts: { cursor: null, numItems: 25 },
        })
      ).page.some((row) => row._id === requestId && row.status === "open"),
    );
  }
  receipt = {
    checkedAt: new Date().toISOString(),
    target: url,
    hosted: false,
    authentication:
      "Privileged local development identities, synthetic signed-phone claims and explicit local paid/identity/staff publication prerequisites; not real Clerk/SMS/provider acceptance",
    ...(testDeletion
      ? {
          nativeOwnerDeletionRetryAndForeignDenial: true,
          removedLeadDoesNotReturnAfterNativeScan: true,
          deletedLeadPhoneOptionsAndReplyDenied: true,
          travelerRequestAndMessagesRetained: true,
        }
      : {}),
    ...(testContactReview
      ? {
          nativeCaseBoundStaffHoldAndRelease: true,
          nonstaffActionDenied: true,
          pausedLeadVisibleAndPhoneHidden: true,
          newMessagesAndLeadRepliesDeniedDuringReview: true,
          historyRetainedAndContactRestoredAfterRelease: true,
        }
      : {}),
    actualNativeGroupedPublicOptions: true,
    offerLinkCarriesRequestedDatesAndHonorsVisibility: true,
    oneOwnerLeadForGroupedUnits: true,
    selectedExactUnitContactAndForeignDenial: true,
    oneBoundFirstResponseAndIdempotentRetry: true,
    differentUnitCannotCreateAnotherFirstResponse: true,
    privateTravelerMessageHasRequestUnitDatesAndNoBookingNotice: true,
    hidingOfferedUnitRevokesFreshPhoneButKeepsResponseHistory: true,
    fixturesReturnedHiddenAndRequestClosed: true,
    productionChanged: false,
    realEmailOrSmsSent: false,
  };
} finally {
  if (requestId)
    await call(traveler, "mutation", "housingRequests:close", {
      id: requestId,
    });
  await call(traveler, "mutation", "users:revokePhone");
  for (const id of [root._id, unit._id])
    await call(owner, "mutation", "listings:unpublish", { id });
  for (const id of borrowed) {
    await call(owner, "mutation", "listings:publish", { id });
    assert.equal(
      (await call(owner, "query", "listings:getById", { id })).status,
      "active",
    );
  }
}
receipt.borrowedLocalQaCapacityRestored = true;
writeFileSync(
  testContactReview
    ? "docs/evidence/local-contact-review-smoke.json"
    : testDeletion
      ? "docs/evidence/local-lead-deletion-smoke.json"
      : "docs/evidence/local-lead-offers-smoke.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(
  "Native local grouped lead offers passed; fixture hidden, request closed and borrowed QA capacity restored.",
);
