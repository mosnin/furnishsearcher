import { randomUUID } from "node:crypto";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
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
const make = (subject) => {
  const client = new ConvexHttpClient(url, { logger: false });
  client.setAdminAuth(cfg.adminKey, {
    subject,
    issuer: "https://qa.clerk.accounts.dev",
  });
  return client;
};
const owner = make("qa-owner-search"),
  subject = `qa-response-${randomUUID()}`,
  traveler = make(subject),
  other = make("qa-tenant-search"),
  anonymous = new ConvexHttpClient(url, { logger: false });
const admin = new ConvexHttpClient(url, { logger: false });
admin.setAdminAuth(cfg.adminKey);
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const user = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(user.email, "qa-owner@example.test");
const tenant = await call(traveler, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic response traveler",
  email: "response@example.test",
});
let id, conversationId, prerequisites;
try {
  id = await call(owner, "mutation", "listings:create", {
    landlordId: user._id,
    title: "[QA] Synthetic response measurement — not a rental",
    description:
      "Synthetic local response measurement fixture, no actual property or traveler.",
    address: "Synthetic QA address",
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
    availableFrom: Date.UTC(2027, 0, 1),
    minStay: 1,
  });
  prerequisites = await prepareLocalPublication([id]);
  let adoption;
  for (let i = 0; i < 100; i++) {
    adoption = await call(admin, "mutation", "responsiveness:backfill");
    if (adoption.complete) break;
  }
  assert(adoption.complete);
  const request = {
    senderId: tenant._id,
    receiverId: user._id,
    listingId: id,
    content: "[QA] First synthetic traveler message",
    origin: "inbox",
    clientRequestId: randomUUID(),
  };
  const first = await call(
    traveler,
    "mutation",
    "messages:sendMessage",
    request,
  );
  assert.equal(
    await call(traveler, "mutation", "messages:sendMessage", request),
    first,
  );
  let report = await call(owner, "query", "responsiveness:report", {
    listingId: id,
  });
  assert.equal(report.received, 1);
  assert.equal(report.onTime, 0);
  await assert.rejects(
    call(other, "query", "responsiveness:report", { listingId: id }),
    /Not authorized/,
  );
  await assert.rejects(
    call(anonymous, "query", "responsiveness:report", { listingId: id }),
    /sign in/,
  );
  await call(owner, "mutation", "messages:sendMessage", {
    senderId: user._id,
    receiverId: tenant._id,
    listingId: id,
    content: "[QA] First synthetic owner reply",
    origin: "inbox",
  });
  report = await call(owner, "query", "responsiveness:report", {
    listingId: id,
  });
  assert.equal(report.received, 1);
  assert.equal(report.onTime, 1);
  assert.equal(report.percent, 100);
  assert.equal(report.typical, "Typically within an hour");
  assert.deepEqual(
    await call(anonymous, "query", "responsiveness:publicTime", {
      listingId: id,
    }),
    { label: "Typically within an hour" },
  );
  await assert.rejects(
    call(owner, "mutation", "responsiveness:reset", {
      listingId: id,
      confirmAllRentalSpaces: true,
    }),
    /below 75/,
  );
  const conversations = await call(
    owner,
    "query",
    "messages:getConversations",
    { userId: user._id },
  );
  conversationId = conversations.find(
    (c) => c.listingId === id && c.tenantId === tenant._id,
  )?._id;
  assert(conversationId);
  await call(owner, "mutation", "listings:unpublish", { id });
  assert.equal(
    await call(anonymous, "query", "responsiveness:publicTime", {
      listingId: id,
    }),
    null,
  );
  assert.equal(
    (await call(owner, "query", "responsiveness:report", { listingId: id }))
      .onTime,
    1,
  );
} finally {
  if (conversationId) {
    await call(owner, "mutation", "messages:setArchived", {
      conversationId,
      archived: true,
    });
    await call(traveler, "mutation", "messages:setArchived", {
      conversationId,
      archived: true,
    });
  }
  if (id) await call(owner, "mutation", "listings:deleteListing", { id });
}
writeFileSync(
  "docs/evidence/local-responsiveness-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      privilegedLocalQaIdentities: true,
      publicationPrerequisites: prerequisites,
      nativeTravelerFirstAndRetry: true,
      nativeOwnerReply: true,
      privateRate100: true,
      publicLabelOnly: true,
      foreignAndAnonymousPrivateReadsDenied: true,
      ineligibleResetDenied: true,
      publicLabelHiddenAfterUnpublish: true,
      ownRentalDeletedAndConversationArchived: true,
      historyRetained: true,
      sharedOwnerResetNotUsed: true,
      actualEmailOrSmsSent: false,
      productionChanged: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Native response measurement passed; own rental removed and message history archived.",
);
