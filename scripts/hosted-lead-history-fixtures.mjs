import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-lead-history.private.json";
assert(["setup", "prepare-browser", "check", "cleanup"].includes(mode));
const credentials = JSON.parse(
  readFileSync(".clerk/.tmp/keyless.json", "utf8"),
);
assert(credentials.publishableKey.startsWith("pk_test_"));
const instanceResponse = await fetch("https://api.clerk.com/v1/instance", {
  headers: { Authorization: `Bearer ${credentials.secretKey}` },
});
assert.equal(instanceResponse.status, 200);
const instance = await instanceResponse.json();
assert.equal(instance.environment_type, "development");
assert.equal(instance.id, "ins_3L9oPR1TeW643w6zPX1vgsOFAxU");
const env = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete env[key];
const cli = (...args) => {
  const r = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--deployment", deployment],
    { env, encoding: "utf8" },
  );
  assert.equal(
    r.status,
    0,
    "Development CLI operation failed; output withheld",
  );
  return r.stdout;
};
assert.equal(cli("env", "get", "RESEND_API_KEY").trim(), "");
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const session = JSON.parse(
  readFileSync("../hosted-auth-session.private.json", "utf8"),
);
const account = await clerk.users.getUser(session.userId);
assert(account.externalId?.startsWith("furnishsearcher-qa-"));
assert(
  account.emailAddresses.every((e) =>
    e.emailAddress.endsWith("+clerk_test@example.com"),
  ),
);
const owner = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const refresh = async (client, sessionId) => {
  const jwt = (await clerk.sessions.getToken(sessionId, "convex")).jwt;
  assert(jwt);
  client.setAuth(jwt);
};
await refresh(owner, session.sessionId);
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: account.id,
});
assert.equal(me?.role, "landlord");
let fixture = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : null;
const save = () =>
  writeFileSync(privatePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const append = (table, row) => {
  const path = `../.lead-history-${table}.private.json`;
  writeFileSync(path, JSON.stringify([row]), { mode: 0o600 });
  try {
    cli("import", path, "--table", table, "--append");
  } finally {
    unlinkSync(path);
  }
};
if (mode === "setup") {
  assert(
    !fixture || fixture.cleaned,
    "An existing fixture must be checked/cleaned first",
  );
  const suffix = randomUUID().slice(0, 8);
  fixture = {
    ownerId: me._id,
    externalId: `furnishsearcher-qa-lead-history-${suffix}`,
    email: `lead-history-${suffix}+clerk_test@example.com`,
    title: `[QA] Historical garden suite ${suffix}`,
    cleaned: false,
  };
  save();
  const user = await clerk.users.createUser({
    externalId: fixture.externalId,
    emailAddress: [fixture.email],
    skipPasswordRequirement: true,
  });
  fixture.clerkUserId = user.id;
  save();
  const tenantSession = await clerk.sessions.createSession({ userId: user.id });
  fixture.tenantSessionId = tenantSession.id;
  save();
  const tenant = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
  await refresh(tenant, tenantSession.id);
  const profile = await call(tenant, "mutation", "users:getOrCreate", {
    clerkId: user.id,
    name: "[QA] Synthetic historical lead traveler",
    email: fixture.email,
  });
  fixture.tenantId = profile._id;
  save();
  const DAY = 86400000,
    today = Math.floor(Date.now() / DAY) * DAY;
  fixture.requestId = await call(tenant, "mutation", "housingRequests:create", {
    userId: profile._id,
    city: "Austin",
    state: "TX",
    moveInDate: today + 45 * DAY,
    moveOutDate: today + 75 * DAY,
    duration: 1,
    maxBudget: 2000,
    bedrooms: 1,
    petFriendly: false,
    description:
      "[QA] Synthetic historical response; not an actual rental request",
    contactPreference: "platform",
  });
  save();
  await refresh(owner, session.sessionId);
  fixture.listingId = await call(owner, "mutation", "listings:create", {
    landlordId: me._id,
    title: fixture.title,
    description:
      "Private synthetic historical-response fixture; never published",
    address: "Synthetic private fixture",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: true,
    parkingIncluded: false,
    availableFrom: today,
  });
  save();
  const now = Date.now(),
    key = [profile._id, me._id].sort().join("_") + "_" + fixture.listingId;
  // Explicit privileged private history ONLY. No entitlement, public visibility,
  // native message sending or historical provider event is fabricated as acceptance.
  append("conversations", {
    listingId: fixture.listingId,
    tenantId: profile._id,
    landlordId: me._id,
    key,
    lastMessage:
      "[QA] Synthetic historical offer; no rental or delivery occurred",
    lastMessageAt: now,
    tenantRead: true,
    landlordRead: true,
  });
  const conversations = JSON.parse(
    cli("data", "conversations", "--format", "json", "--limit", "100"),
  ).filter((c) => c.key === key && c.listingId === fixture.listingId);
  assert.equal(conversations.length, 1);
  fixture.conversationId = conversations[0]._id;
  save();
  append("messages", {
    conversationId: key,
    conversationDocId: fixture.conversationId,
    senderId: me._id,
    receiverId: profile._id,
    listingId: fixture.listingId,
    housingRequestId: fixture.requestId,
    content:
      "[QA] Synthetic historical offer. This is seeded test history; no rental, booking, email or provider delivery occurred.",
    read: true,
    createdAt: now,
    origin: "housing_request",
    emailStatus: "suppressed",
  });
  // Deliberately omit response/response time, proving legacy conversation lookup
  // without inventing a timestamp or rebinding the thread to a different unit.
  append("housingRequestMatches", {
    requestId: fixture.requestId,
    listingId: fixture.listingId,
    landlordId: me._id,
    kind: "matched",
    createdAt: now,
    conversationId: fixture.conversationId,
  });
  append("housingRequestDeliveries", {
    requestId: fixture.requestId,
    landlordId: me._id,
    kind: "matched",
    createdAt: now,
    emailStatus: "suppressed",
  });
  await call(owner, "mutation", "messages:setArchived", {
    conversationId: fixture.conversationId,
    archived: false,
  });
  fixture.seeded = true;
  save();
  console.log(
    "Private synthetic response history prepared; no cloud publication/paid/identity exception.",
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === me._id &&
      fixture.title.startsWith("[QA] Historical garden suite "),
  );
  if (mode === "prepare-browser") {
    const listing = await call(owner, "query", "listings:getById", {
      id: fixture.listingId,
    });
    assert(
      listing.landlordId === me._id &&
        listing.title === fixture.title &&
        listing.publicationRequested === false,
    );
    await call(owner, "mutation", "messages:setArchived", {
      conversationId: fixture.conversationId,
      archived: false,
    });
    console.log("Own private synthetic history is reachable in the inbox.");
  } else if (mode === "cleanup") {
    if (fixture.tenantSessionId && fixture.requestId) {
      const tenant = new ConvexHttpClient(
        `https://${deployment}.convex.cloud`,
        { logger: false },
      );
      await refresh(tenant, fixture.tenantSessionId);
      await call(tenant, "mutation", "housingRequests:close", {
        id: fixture.requestId,
      });
    }
    if (fixture.listingId) {
      const listing = await call(owner, "query", "listings:getById", {
        id: fixture.listingId,
      });
      assert(
        listing.title === fixture.title &&
          listing.landlordId === me._id &&
          listing.publicationRequested === false,
      );
      await call(owner, "mutation", "listings:unpublish", {
        id: fixture.listingId,
      });
    }
    if (fixture.conversationId)
      await call(owner, "mutation", "messages:setArchived", {
        conversationId: fixture.conversationId,
        archived: true,
      });
    if (fixture.clerkUserId) {
      const user = await clerk.users.getUser(fixture.clerkUserId);
      assert(
        user.externalId === fixture.externalId &&
          user.emailAddresses.length === 1 &&
          user.emailAddresses[0].emailAddress === fixture.email,
      );
      await clerk.users.deleteUser(fixture.clerkUserId);
    }
    const after = await call(owner, "query", "housingRequests:inbox", {
      paginationOpts: { cursor: null, numItems: 25 },
    });
    assert(!after.page.some((row) => row.request._id === fixture.requestId));
    fixture.cleaned = true;
    save();
    console.log(
      "Own synthetic request closed, rental hidden, conversation archived and disposable Clerk account deleted; native history retained.",
    );
  } else {
    const page = await call(owner, "query", "housingRequests:inbox", {
      paginationOpts: { cursor: null, numItems: 25 },
    });
    const item = page.page.find((row) => row.request._id === fixture.requestId);
    assert(
      item?.response &&
        item.response.conversationId === fixture.conversationId &&
        item.response.listingId === fixture.listingId,
    );
    assert.equal(item.response.respondedAt, undefined);
    assert.equal(item.historyNeedsReview, false);
    assert.equal(item.phone, null);
    assert.equal(
      (
        await call(owner, "query", "housingRequests:leadContact", {
          requestId: fixture.requestId,
          listingId: fixture.listingId,
        })
      ).phone,
      null,
    );
    assert.equal(
      (
        await call(owner, "query", "housingRequests:matchingProperties", {
          requestId: fixture.requestId,
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page.length,
      0,
    );
    await assert.rejects(
      call(owner, "mutation", "housingRequests:reply", {
        requestId: fixture.requestId,
        listingId: fixture.listingId,
        message: "Must not send to a private fixture",
      }),
      /no longer matches/,
    );
    const messages = await call(owner, "query", "messages:listMessages", {
      conversationId: fixture.conversationId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    assert.equal(messages.page.length, 1);
    assert.equal(messages.page[0].housingRequestId, fixture.requestId);
    const offered = await call(owner, "query", "housingRequests:offerLink", {
      messageId: messages.page[0]._id,
    });
    assert.equal(offered.listingId, fixture.listingId);
    assert(offered.moveIn && offered.moveOut);
    const traveler = new ConvexHttpClient(
      `https://${deployment}.convex.cloud`,
      { logger: false },
    );
    await refresh(traveler, fixture.tenantSessionId);
    assert.equal(
      await call(traveler, "query", "housingRequests:offerLink", {
        messageId: messages.page[0]._id,
      }),
      null,
    );
    writeFileSync(
      "docs/evidence/hosted-lead-history-native.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          deployment,
          actualOwnerClerkDevelopmentJwt: true,
          privilegedPrivateSyntheticHistoryOnly: true,
          nativeLegacyResponseLookupWithoutTimestamp: true,
          responseBoundToOwnRentalAndTraveler: true,
          currentPrivateRentalCannotGenerateNewOfferOrPhoneDisclosure: true,
          seededMessageRequestBindingPreserved: true,
          ownerOfferLinkCarriesOriginalDates: true,
          privateOfferLinkDeniedToTraveler: true,
          publicOfferOrRealMessageCreationAcceptance: false,
          productionChanged: false,
          realEmailOrSmsSent: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Actual Clerk private legacy-response reads and send/contact denial passed; no historical timestamp invented.",
    );
  }
}
