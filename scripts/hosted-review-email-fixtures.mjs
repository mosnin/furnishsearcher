import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-review-email.private.json";
assert(["setup", "check", "cleanup"].includes(mode));
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
const page = { cursor: null, numItems: 20 },
  receiptPath = "docs/evidence/hosted-review-email-native.json";
const receipt = (fields, reset = false) =>
  writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        ...(!reset && existsSync(receiptPath)
          ? JSON.parse(readFileSync(receiptPath, "utf8"))
          : {}),
        ...fields,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
const client = () =>
  new ConvexHttpClient(`https://${deployment}.convex.cloud`, { logger: false });
const primary = account.emailAddresses.find(
  (e) => e.id === account.primaryEmailAddressId,
);
assert(primary?.verification?.status === "verified");
if (mode === "setup") {
  assert(!fixture || fixture.cleaned);
  fixture = { ownerId: me._id, tag: randomUUID().slice(0, 8), cleaned: false };
  fixture.externalId = `furnishsearcher-qa-review-email-${fixture.tag}`;
  fixture.email = `review-email-${fixture.tag}+clerk_test@example.com`;
  fixture.title = `[QA] Private email-review context ${fixture.tag}`;
  save();
  const user = await clerk.users.createUser({
    externalId: fixture.externalId,
    emailAddress: [fixture.email],
    skipPasswordRequirement: true,
  });
  fixture.clerkId = user.id;
  save();
  fixture.sessionId = (
    await clerk.sessions.createSession({ userId: user.id })
  ).id;
  save();
  const tenant = client();
  await refresh(tenant, fixture.sessionId);
  fixture.tenantId = (
    await call(tenant, "mutation", "users:getOrCreate", {
      clerkId: user.id,
      email: fixture.email,
      name: "[QA] Synthetic review-email traveler",
    })
  )._id;
  save();
  fixture.listingId = await call(owner, "mutation", "listings:create", {
    landlordId: me._id,
    title: fixture.title,
    description:
      "Private synthetic review-request acceptance. No actual rental, stay, review approval or payment.",
    address: "Synthetic private address — do not geocode",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1800,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: false,
    parkingIncluded: false,
    availableFrom: Date.UTC(2027, 0, 15),
    minStay: 1,
  });
  save();
  const listing = await call(owner, "query", "listings:getById", {
    id: fixture.listingId,
  });
  assert(listing.title === fixture.title);
  fixture.reference = listing.publicId;
  assert(fixture.reference);
  save();
  fixture.ownerRequestId = randomUUID();
  fixture.tenantRequestId = randomUUID();
  save();
  const request = async (c, email, requestId) => {
    // Allow signed Clerk creation events to arrive; failed lookups remain bounded
    // by the same native ten-attempt/day control. No native contact proof is imported.
    let r;
    for (let n = 0; n < 5; n++) {
      r = await call(c, "mutation", "reviewInvitations:request", {
        propertyReference: fixture.reference,
        email,
        agreed: true,
        requestId,
      });
      if (r.status !== "unavailable") break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(
      r.status === "created",
      "Verified account request unavailable; preserve this exact fixture for diagnosis/cleanup",
    );
    return r.id;
  };
  fixture.toTenant = await request(
    owner,
    fixture.email,
    fixture.ownerRequestId,
  );
  save();
  fixture.toOwner = await request(
    tenant,
    primary.emailAddress,
    fixture.tenantRequestId,
  );
  save();
  assert.deepEqual(
    await call(owner, "mutation", "reviewInvitations:request", {
      propertyReference: fixture.reference,
      email: fixture.email.toUpperCase(),
      agreed: true,
      requestId: fixture.ownerRequestId,
    }),
    { status: "existing", id: fixture.toTenant },
  );
  receipt(
    {
      deployment,
      actualReservedClerkJwts: true,
      signedProviderContactMatchingWithoutImportedProof: true,
      noImportedInquiryOrConversation: true,
      newPrivateRentalOnly: true,
      noPublicPaidIdentityOrStayGrant: true,
      twoDirectionsPersisted: true,
      canonicalEmailRetrySameId: true,
      realEmailDelivery: false,
      realPersonCommunication: false,
      cleaned: false,
    },
    true,
  );
  console.log(
    "Both account-email request directions persisted through actual Clerk sessions; no imported stay/contact authority.",
  );
} else {
  assert(fixture && !fixture.cleaned && fixture.ownerId === me._id);
  const user = await clerk.users.getUser(fixture.clerkId);
  assert(
    user.externalId === fixture.externalId &&
      user.externalId.startsWith("furnishsearcher-qa-review-email-") &&
      user.emailAddresses.length === 1 &&
      user.emailAddresses[0].emailAddress === fixture.email,
  );
  const tenant = client();
  await refresh(tenant, fixture.sessionId);
  const sent = await call(owner, "query", "reviewInvitations:list", {
      direction: "sent",
      paginationOpts: page,
    }),
    received = await call(owner, "query", "reviewInvitations:list", {
      direction: "received",
      paginationOpts: page,
    });
  if (fixture.toTenant)
    assert(sent.page.some((r) => r.id === fixture.toTenant));
  if (fixture.toOwner)
    assert(received.page.some((r) => r.id === fixture.toOwner));
  if (mode === "check") {
    assert(fixture.toTenant && fixture.toOwner);
    for (const [c, id, kind, subjectId] of [
      [tenant, fixture.toTenant, "property", me._id],
      [owner, fixture.toOwner, "traveler", fixture.tenantId],
    ]) {
      const context = await call(c, "query", "reviewInvitations:context", {
        id,
      });
      assert(
        context && context.kind === kind && context.subjectId === subjectId,
      );
      assert(
        !("email" in context) &&
          !("phone" in context) &&
          !("address" in context),
      );
      const review = await call(c, "query", "reviews:context", {
        listingId: fixture.listingId,
        kind,
        subjectId,
        invitationId: id,
      });
      assert.equal(review.canSubmit, true);
      assert.equal(review.existing, null);
    }
    if (fixture.toOwner)
      assert.equal(
        await call(owner, "query", "reviewInvitations:context", {
          id: fixture.toTenant,
        }),
        null,
      );
    if (fixture.toTenant)
      assert.equal(
        await call(tenant, "query", "reviewInvitations:context", {
          id: fixture.toOwner,
        }),
        null,
      );
    const anon = client();
    await assert.rejects(
      call(anon, "query", "reviewInvitations:context", { id: fixture.toOwner }),
    );
    let ready = false;
    for (let n = 0; n < 20; n++) {
      const rows = await call(owner, "query", "reviewInvitations:list", {
        direction: "sent",
        paginationOpts: page,
      });
      if (
        rows.page.find((r) => r.id === fixture.toTenant)?.emailStatus ===
        "unconfigured"
      ) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(ready, "Native scheduled delivery must report unconfigured");
    assert.equal(
      await call(owner, "query", "reviews:travelerProfile", {
        id: fixture.tenantId,
      }),
      null,
    );
    receipt({
      bothExactRecipientsCanOpenCorrectPendingForm: true,
      senderCannotOpenRecipientsRequest: true,
      anonymousAccessDenied: true,
      noPrivateContactOrStreetInRequestContext: true,
      noGeneralTravelerProfileAccessGranted: true,
      scheduledMailTruthfullyUnconfigured: true,
      noReviewSubmittedOrPublished: true,
    });
    console.log(
      "Exact recipients can open both review forms; foreign access denied; native scheduled mail is unconfigured.",
    );
  } else {
    if (fixture.toTenant)
      await call(owner, "mutation", "reviewInvitations:close", {
        id: fixture.toTenant,
      });
    if (fixture.toOwner)
      await call(owner, "mutation", "reviewInvitations:close", {
        id: fixture.toOwner,
      });
    assert.equal(
      await call(tenant, "query", "reviewInvitations:context", {
        id: fixture.toTenant,
      }),
      null,
    );
    assert.equal(
      await call(owner, "query", "reviewInvitations:context", {
        id: fixture.toOwner,
      }),
      null,
    );
    const listing = await call(owner, "query", "listings:getById", {
      id: fixture.listingId,
    });
    assert(listing.title === fixture.title && listing.landlordId === me._id);
    await call(owner, "mutation", "listings:deleteListing", {
      id: fixture.listingId,
    });
    await clerk.users.deleteUser(fixture.clerkId);
    const finalSent = (
      await call(owner, "query", "reviewInvitations:list", {
        direction: "sent",
        paginationOpts: page,
      })
    ).page.find((r) => r.id === fixture.toTenant);
    const finalReceived = (
      await call(owner, "query", "reviewInvitations:list", {
        direction: "received",
        paginationOpts: page,
      })
    ).page.find((r) => r.id === fixture.toOwner);
    if (fixture.toTenant) assert.equal(finalSent.state, "revoked");
    if (fixture.toTenant) assert.equal(finalSent.available, false);
    if (fixture.toOwner) assert.equal(finalReceived.state, "declined");
    if (fixture.toOwner) assert.equal(finalReceived.available, false);
    fixture.cleaned = true;
    save();
    receipt({
      cleaned: true,
      outgoingRevoked: !!fixture.toTenant,
      incomingDeclined: !!fixture.toOwner,
      onlyOwnPrivateRentalAndDisposableClerkActorRemoved: true,
      privateRequestHistoryRetained: true,
      requestContextUnavailableAfterClosure: true,
    });
    console.log(
      "Own private rental and disposable actor removed; revoked/declined request history retained.",
    );
  }
}
