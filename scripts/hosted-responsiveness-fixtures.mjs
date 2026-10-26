import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-responsiveness.private.json";
assert(["setup", "check", "reply", "cleanup"].includes(mode));
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
  assert(!fixture || fixture.cleaned);
  const suffix = randomUUID().slice(0, 8);
  fixture = {
    ownerId: me._id,
    externalId: `furnishsearcher-qa-response-${suffix}`,
    email: `response-${suffix}+clerk_test@example.com`,
    title: `[QA] Response measurement ${suffix}`,
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
  fixture.tenantSessionId = (
    await clerk.sessions.createSession({ userId: user.id })
  ).id;
  save();
  const tenant = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
  await refresh(tenant, fixture.tenantSessionId);
  fixture.tenantId = (
    await call(tenant, "mutation", "users:getOrCreate", {
      clerkId: user.id,
      name: "[QA] Synthetic response traveler",
      email: fixture.email,
    })
  )._id;
  save();
  const DAY = 86400000,
    today = Math.floor(Date.now() / DAY) * DAY;
  fixture.listingId = await call(owner, "mutation", "listings:create", {
    landlordId: me._id,
    title: fixture.title,
    description:
      "Private synthetic response fixture; never published or actually booked.",
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
    availableFrom: today + 30 * DAY,
    minStay: 1,
  });
  save();
  // Explicit privileged historical pending-inquiry precondition only. No paid/identity/publication grant.
  append("bookingInquiries", {
    listingId: fixture.listingId,
    tenantId: fixture.tenantId,
    landlordId: me._id,
    moveIn: today + 30 * DAY,
    moveOut: today + 61 * DAY,
    occupants: 1,
    pets: false,
    message:
      "[QA] Privileged private historical inquiry fixture; not an actual booking",
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const inquiries = await call(tenant, "query", "inquiries:getMine", {
    as: "tenant",
    paginationOpts: { cursor: null, numItems: 20 },
  });
  const inquiry = inquiries.page.find((i) => i.listingId === fixture.listingId);
  assert(
    inquiry &&
      inquiry.tenantId === fixture.tenantId &&
      inquiry.landlordId === me._id,
  );
  fixture.inquiryId = inquiry._id;
  save();
  fixture.firstRequestId = randomUUID();
  save();
  fixture.conversationId = await call(tenant, "mutation", "bookings:message", {
    id: fixture.inquiryId,
    content: "[QA] Actual native synthetic traveler first message",
    clientRequestId: fixture.firstRequestId,
  });
  save();
  for (let i = 0; i < 100; i++) {
    const adoption = JSON.parse(cli("run", "responsiveness:backfill", "{}"));
    if (adoption.complete) break;
  }
  fixture.initial = await call(owner, "query", "responsiveness:report", {
    listingId: fixture.listingId,
  });
  assert(
    fixture.initial.ready &&
      fixture.initial.received === 1 &&
      fixture.initial.onTime === 0,
  );
  save();
  console.log(
    JSON.stringify({
      title: fixture.title,
      listingId: fixture.listingId,
      received: 1,
      percent: 0,
    }),
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === me._id &&
      fixture.title.startsWith("[QA] Response measurement "),
  );
  const listing = await call(owner, "query", "listings:getById", {
    id: fixture.listingId,
  });
  assert(
    listing &&
      listing.title === fixture.title &&
      listing.landlordId === me._id &&
      listing.publicationRequested === false,
  );
  const tenant = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
  await refresh(tenant, fixture.tenantSessionId);
  const receiptPath = "docs/evidence/hosted-responsiveness-native.json";
  const receipt = existsSync(receiptPath)
    ? JSON.parse(readFileSync(receiptPath, "utf8"))
    : {};
  if (mode === "reply") {
    fixture.replyRequestId ??= randomUUID();
    save();
    await call(owner, "mutation", "bookings:message", {
      id: fixture.inquiryId,
      content: "[QA] Actual native synthetic owner first reply",
      clientRequestId: fixture.replyRequestId,
    });
    fixture.replied = true;
    save();
  }
  if (mode === "cleanup") {
    await call(tenant, "mutation", "inquiries:respond", {
      id: fixture.inquiryId,
      decision: "withdrawn",
    });
    for (const client of [owner, tenant])
      await call(client, "mutation", "messages:setArchived", {
        conversationId: fixture.conversationId,
        archived: true,
      });
    const disposable = await clerk.users.getUser(fixture.clerkUserId);
    assert(
      disposable.externalId === fixture.externalId &&
        disposable.emailAddresses.every(
          (e) => e.emailAddress === fixture.email,
        ),
    );
    await clerk.users.deleteUser(disposable.id);
    await call(owner, "mutation", "listings:deleteListing", {
      id: fixture.listingId,
    });
    fixture.cleaned = true;
    save();
    receipt.ownRentalAndDisposableClerkAccountDeleted = true;
    receipt.pendingInquiryWithdrawnAndConversationArchived = true;
    receipt.nativePrivateHistoryRetained = true;
  } else {
    const report = await call(owner, "query", "responsiveness:report", {
      listingId: fixture.listingId,
    });
    assert.equal(report.ready, true);
    assert.equal(report.received, 1);
    assert.equal(report.onTime, fixture.replied ? 1 : 0);
    assert.equal(report.percent, fixture.replied ? 100 : 0);
    await assert.rejects(
      call(tenant, "query", "responsiveness:report", {
        listingId: fixture.listingId,
      }),
      /Not authorized/,
    );
    const anon = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
      logger: false,
    });
    await assert.rejects(
      call(anon, "query", "responsiveness:report", {
        listingId: fixture.listingId,
      }),
      /sign in/,
    );
    assert.equal(
      await call(anon, "query", "responsiveness:publicTime", {
        listingId: fixture.listingId,
      }),
      null,
    );
    receipt.checkedAt = new Date().toISOString();
    receipt.development = deployment;
    receipt.actualClerkParticipantJwts = true;
    receipt.privatePendingInquiryPrivilegedPrecondition = true;
    receipt.actualNativeFirstMessagesAndReply = !!fixture.replied;
    receipt.privateRate = report.percent;
    receipt.received = report.received;
    receipt.onTime = report.onTime;
    receipt.typical = report.typical;
    receipt.privateBoundariesAndHiddenPublicLabel = true;
    receipt.noPaidIdentityOrPublicationException = true;
    receipt.sharedOwnerResetUnused = !report.resetUsed;
    receipt.realPersonMailOrSmsSent = false;
  }
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(`Hosted native response ${mode} verified.`);
}
