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
  subject = `qa-lead-email-${suffix}`,
  traveler = make(subject),
  other = make(`qa-lead-email-other-${suffix}`);
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
  name: "[QA] Synthetic lead email traveler",
  email: "qa-lead-email@example.test",
});
await call(other, "mutation", "users:getOrCreate", {
  clerkId: `qa-lead-email-other-${suffix}`,
  name: "[QA] Synthetic unrelated account",
  email: "qa-lead-email-other@example.test",
});
const DAY = 86400000,
  today = Math.floor(Date.now() / DAY) * DAY,
  city = `QA Lead Email ${suffix}`,
  paginationOpts = { cursor: null, numItems: 25 };
const listingId = await call(owner, "mutation", "listings:create", {
  landlordId: me._id,
  title: `[QA] Synthetic lead email lead ${suffix}`,
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
const savedEmail = await call(owner, "query", "emailContacts:settings", {});
assert(
  !savedEmail.enabled && !savedEmail.confirmed,
  "Do not replace an existing email confirmation",
);
const proof = new ConvexHttpClient(url, { logger: false });
try {
  await prepareLocalPublication([listingId]);
  const before = await call(owner, "query", "listings:getById", {
    id: listingId,
  });
  await call(owner, "mutation", "emailContacts:setMessageEmails", {
    clerkId: "qa-owner-search",
    enabled: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  proof.setAdminAuth(cfg.adminKey, {
    subject: "qa-owner-search",
    issuer: "https://synthetic.clerk.accounts.dev",
    email: "qa-owner@example.test",
    emailVerified: true,
    iat: Math.floor(Date.now() / 1000),
  });
  await call(proof, "mutation", "emailContacts:setMessageEmails", {
    clerkId: "qa-owner-search",
    enabled: true,
  });
  await call(owner, "mutation", "housingRequests:setLeadPreferences", {
    emailEnabled: false,
  });
  await call(owner, "mutation", "leadNotifications:setPreference", {
    listingId,
    emailEnabled: true,
  });
  assert.deepEqual(
    await call(owner, "query", "leadNotifications:preferences", { listingId }),
    {
      listingId,
      title: before.title,
      override: true,
      enabled: true,
      defaultEnabled: false,
      canEmail: true,
    },
  );
  await assert.rejects(
    call(anonymous, "query", "leadNotifications:preferences", { listingId }),
    /sign in/,
  );
  await assert.rejects(
    call(other, "mutation", "leadNotifications:setPreference", {
      listingId,
      emailEnabled: false,
    }),
    /authorized/,
  );
  const criteria = {
    userId: tenant._id,
    city,
    state: "TX",
    moveInDate: today + 10 * DAY,
    moveOutDate: today + 40 * DAY,
    duration: 1,
    maxBudget: 3000,
    bedrooms: 1,
    petFriendly: false,
    description:
      "[QA] Synthetic email settings acceptance; no rental requested.",
    contactPreference: "platform",
  };
  const requestId = await call(
    traveler,
    "mutation",
    "housingRequests:create",
    criteria,
  );
  requestIds.push(requestId);
  const delivery = await poll(async () =>
    (
      await call(owner, "query", "housingRequests:inbox", { paginationOpts })
    ).page.find((d) => d.request._id === requestId),
  );
  const details = await poll(() =>
    call(owner, "query", "housingRequests:notificationDetails", {
      deliveryId: delivery.deliveryId,
    }),
  );
  assert.equal(details.email, "qa-owner@example.test");
  assert.equal(details.kind, "matched");
  await call(owner, "mutation", "leadNotifications:setPreference", {
    listingId,
    emailEnabled: false,
  });
  assert.equal(
    await call(owner, "query", "housingRequests:notificationDetails", {
      deliveryId: delivery.deliveryId,
    }),
    null,
  );
  assert(
    (
      await call(owner, "query", "housingRequests:inbox", { paginationOpts })
    ).page.some((d) => d.deliveryId === delivery.deliveryId),
  );
  assert.equal(
    (await call(owner, "query", "leadNotifications:preferences", { listingId }))
      .enabled,
    false,
  );
  await call(owner, "mutation", "leadNotifications:setPreference", {
    listingId,
    emailEnabled: null,
  });
  assert.equal(
    (await call(owner, "query", "leadNotifications:preferences", { listingId }))
      .override,
    null,
  );
  const after = await call(owner, "query", "listings:getById", {
    id: listingId,
  });
  assert.equal(after.revision, before.revision);
  assert.equal(after.approvedRevision, before.approvedRevision);
  assert.equal(after.status, before.status);
  writeFileSync(
    "docs/evidence/local-lead-email-smoke.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        target: url,
        hosted: false,
        privilegedSyntheticIdentities: true,
        syntheticEmailProof: true,
        defaultOffPropertyOverrideOnAccepted: true,
        nativeCandidateSelectionResolved: true,
        effectiveSettingRecheckedAfterMute: true,
        inboxPreservedAfterMute: true,
        anonymousAndForeignOwnerDenied: true,
        inheritanceResetAccepted: true,
        listingRevisionAndStatusUnchanged: true,
        realEmailSent: false,
        providerAcceptance: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Native local per-space email preferences passed; inbox retained, no email sent.",
  );
} finally {
  for (const id of requestIds)
    await call(traveler, "mutation", "housingRequests:close", { id });
  await call(owner, "mutation", "leadNotifications:setPreference", {
    listingId,
    emailEnabled: null,
  });
  await call(owner, "mutation", "listings:unpublish", { id: listingId });
  await call(owner, "mutation", "housingRequests:setLeadPreferences", {
    receiveUnmatched: savedPreferences.receiveUnmatched,
    emailEnabled: savedPreferences.emailEnabled,
  });
  await call(owner, "mutation", "emailContacts:setMessageEmails", {
    clerkId: "qa-owner-search",
    enabled: false,
  });
}
