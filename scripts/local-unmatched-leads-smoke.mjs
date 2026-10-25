import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
const envText = readFileSync(".env.local", "utf8"),
  url = envText
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
    .trim()
    .replace(/^"|"$/g, "");
assert(
  url &&
    new URL(url).protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(envText) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(envText),
);
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const childEnv = { ...process.env };
for (const name of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete childEnv[name];
function readEnv(name) {
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/convex/bin/main.js",
      "env",
      "get",
      name,
      "--env-file",
      ".env.local",
    ],
    { encoding: "utf8", env: childEnv },
  );
  assert.equal(r.status, 0, "Cannot verify local configuration");
  return r.stdout.trim();
}
assert.equal(
  readEnv("CREEM_API_KEY"),
  "creem_test_local_synthetic",
  "Refusing real billing configuration",
);
assert.equal(
  readEnv("RESEND_API_KEY"),
  "",
  "Refusing real email configuration",
);
const make = (subject) => {
  const c = new ConvexHttpClient(url, { logger: false });
  if (subject)
    c.setAdminAuth(cfg.adminKey, {
      subject,
      issuer: "https://qa.furnishsearcher.invalid",
    });
  return c;
};
const call = (c, type, name, args) =>
    c[type](makeFunctionReference(name), args),
  owner = make("qa-owner-search"),
  anonymous = make(),
  suffix = randomUUID().slice(0, 8),
  subject = `qa-unmatched-${suffix}`,
  traveler = make(subject),
  other = make(`qa-unmatched-other-${suffix}`);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me?.email, "qa-owner@example.test");
const savedPreferences = await call(
  owner,
  "query",
  "housingRequests:leadPreferences",
  {},
);
const tenant = await call(traveler, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic unmatched traveler",
  email: "qa-unmatched@example.test",
});
await call(other, "mutation", "users:getOrCreate", {
  clerkId: `qa-unmatched-other-${suffix}`,
  name: "[QA] Synthetic unrelated account",
  email: "qa-unmatched-other@example.test",
});
const DAY = 86400000,
  today = Math.floor(Date.now() / DAY) * DAY,
  city = `QA Unmatched ${suffix}`,
  paginationOpts = { cursor: null, numItems: 25 };
const listingId = await call(owner, "mutation", "listings:create", {
  landlordId: me._id,
  title: `[QA] Synthetic unmatched lead ${suffix}`,
  description: "Local synthetic acceptance; no real rental is offered.",
  city,
  state: "TX",
  zip: "78701",
  address: "PUBLIC QA PLACEHOLDER",
  price: 2500,
  bedrooms: 1,
  bathrooms: 1,
  propertyType: "Apartment",
  amenities: [],
  photos: [],
  petFriendly: false,
  utilitiesIncluded: false,
  parkingIncluded: false,
  availableFrom: today,
  minStay: 1,
});
const requestIds = [];
async function poll(check) {
  for (let i = 0; i < 50; i++) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Native scheduled lead work did not settle");
}
try {
  await call(owner, "mutation", "housingRequests:setLeadPreferences", {
    receiveUnmatched: false,
    emailEnabled: false,
  });
  await prepareLocalPublication([listingId]);
  const criteria = {
    userId: tenant._id,
    city,
    state: "TX",
    moveInDate: today + 10 * DAY,
    moveOutDate: today + 40 * DAY,
    duration: 1,
    maxBudget: 1500,
    bedrooms: 2,
    petFriendly: true,
    description: "[QA] Synthetic alternatives test; no real housing need.",
    contactPreference: "platform",
  };
  const exactOnly = await call(
    traveler,
    "mutation",
    "housingRequests:create",
    criteria,
  );
  requestIds.push(exactOnly);
  const requestId = await call(traveler, "mutation", "housingRequests:create", {
    ...criteria,
    allowUnmatched: true,
  });
  requestIds.push(requestId);
  await poll(async () => {
    const mine = await call(traveler, "query", "housingRequests:getMine", {
      paginationOpts,
    });
    return mine.page
      .filter((r) => requestIds.includes(r._id))
      .every((r) => r.matchingStatus === "complete");
  });
  assert.equal(
    (
      await call(owner, "query", "housingRequests:matchingProperties", {
        requestId,
        paginationOpts,
      })
    ).page.length,
    0,
  );
  await call(owner, "mutation", "housingRequests:setLeadPreferences", {
    receiveUnmatched: true,
  });
  const property = await poll(async () => {
    const page = await call(
      owner,
      "query",
      "housingRequests:matchingProperties",
      { requestId, paginationOpts },
    );
    return page.page.find((p) => p.listingId === listingId);
  });
  assert.equal(property.kind, "unmatched");
  const firstReport = await call(owner, "query", "listingPerformance:report", {
    listingId,
    days: 7,
  });
  assert(
    firstReport.unmatchedStartedAt &&
      firstReport.rows.reduce((n, r) => n + r.unmatchedLeads, 0) === 1,
    "One new partial match must be counted",
  );
  const portfolioReport = await call(
    owner,
    "query",
    "listingPerformance:report",
    { days: 7 },
  );
  assert(
    portfolioReport.unmatchedStartedAt &&
      portfolioReport.rows.reduce((n, r) => n + r.unmatchedLeads, 0) >= 1,
  );

  assert(property.differences.some((d) => d.field === "Monthly budget"));
  assert(property.differences.some((d) => d.field === "Pets"));
  assert.equal(
    (
      await call(owner, "query", "housingRequests:matchingProperties", {
        requestId: exactOnly,
        paginationOpts,
      })
    ).page.length,
    0,
  );
  const delivery = (
    await call(owner, "query", "housingRequests:inbox", { paginationOpts })
  ).page.find((item) => item.request._id === requestId);
  assert(delivery);
  assert.equal(delivery.phone, null);
  await assert.rejects(
    call(anonymous, "query", "housingRequests:inbox", { paginationOpts }),
    /sign in/,
  );
  const reply = {
    requestId,
    listingId,
    message: "[QA] Synthetic alternative proposal; no booking agreed.",
  };
  await assert.rejects(
    call(owner, "mutation", "housingRequests:reply", reply),
    /acknowledge/,
  );
  await assert.rejects(
    call(owner, "mutation", "housingRequests:reply", {
      ...reply,
      acknowledgeDifferences: true,
      expectedDifferences: "stale",
    }),
    /criteria changed/,
  );
  await assert.rejects(
    call(other, "mutation", "housingRequests:reply", {
      ...reply,
      acknowledgeDifferences: true,
      expectedDifferences: property.differenceKey,
    }),
    /authorized/,
  );
  const accepted = {
    ...reply,
    acknowledgeDifferences: true,
    expectedDifferences: property.differenceKey,
  };
  const conversations = await Promise.all([
    call(owner, "mutation", "housingRequests:reply", accepted),
    call(owner, "mutation", "housingRequests:reply", accepted),
  ]);
  assert.equal(conversations[0], conversations[1]);
  const messages = await call(traveler, "query", "messages:listMessages", {
    conversationId: conversations[0],
    paginationOpts,
  });
  assert.equal(messages.page.length, 1);
  assert(
    messages.page[0].content.includes(
      "No booking or change of terms is confirmed.",
    ),
  );
  await call(owner, "mutation", "housingRequests:setLeadPreferences", {
    receiveUnmatched: false,
  });
  assert.equal(
    (
      await call(owner, "query", "housingRequests:matchingProperties", {
        requestId,
        paginationOpts,
      })
    ).page.length,
    0,
  );
  writeFileSync(
    "docs/evidence/local-unmatched-leads-smoke.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        target: url,
        hosted: false,
        privilegedSyntheticIdentities: true,
        nativeScheduledBackfill: true,
        travelerAlternativeConsentRequired: true,
        ownerUnmatchedOptInRequired: true,
        currentDifferencesShown: true,
        nativeUnmatchedCount: 1,
        propertyAndPortfolioUnmatchedCoverageAccepted: true,
        phoneWithheld: true,
        anonymousAndForeignOwnerDenied: true,
        missingAndStaleAcknowledgementDenied: true,
        concurrentReplyCount: 1,
        privateTravelerConversationAccepted: true,
        ownerOptOutRechecked: true,
        realEmailSent: false,
        realProviderOrHumanAcceptance: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Native local unmatched lead smoke passed; synthetic requests, one private proposal, no email or provider effect.",
  );
} finally {
  for (const id of requestIds)
    await call(traveler, "mutation", "housingRequests:close", { id });
  await call(owner, "mutation", "listings:unpublish", { id: listingId });
  await call(owner, "mutation", "housingRequests:setLeadPreferences", {
    receiveUnmatched: savedPreferences.receiveUnmatched,
    emailEnabled: savedPreferences.emailEnabled,
  });
}
