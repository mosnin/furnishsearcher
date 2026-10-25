import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
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
const childEnv = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete childEnv[key];
function envValue(name) {
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
  envValue("CREEM_API_KEY"),
  "creem_test_local_synthetic",
  "Refusing real payment configuration",
);
assert.equal(
  envValue("RESEND_API_KEY"),
  "",
  "Refusing real email configuration",
);
assert(
  ["", "test"].includes(envValue("CLERK_CONTACT_MODE")),
  "Only local test contact mode allowed",
);
const make = (subject, claims = {}) => {
  const c = new ConvexHttpClient(url, { logger: false });
  if (subject)
    c.setAdminAuth(cfg.adminKey, {
      subject,
      issuer: "https://qa.clerk.accounts.dev",
      ...claims,
    });
  return c;
};
const call = (c, type, name, args) =>
  c[type](makeFunctionReference(name), args);
const owner = make("qa-owner-search"),
  anonymous = make(),
  suffix = randomUUID().slice(0, 8),
  subject = `qa-phone-reveal-${suffix}`,
  viewer = make(subject),
  phone = "+12025550123";
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me?.email, "qa-owner@example.test");
assert(
  !me.phone && !me.listingPhoneConsent,
  "Refusing to overwrite an existing owner contact",
);
await call(viewer, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic phone reveal traveler",
  email: "qa-phone-reveal@example.test",
});
const listingId = await call(owner, "mutation", "listings:create", {
  landlordId: me._id,
  title: `[QA] Synthetic phone reveal ${suffix}`,
  description: "Local synthetic phone contact acceptance; no real rental.",
  city: `QA Phone ${suffix}`,
  state: "TX",
  zip: "78701",
  address: "PUBLIC QA PLACEHOLDER",
  price: 2000,
  bedrooms: 1,
  bathrooms: 1,
  propertyType: "Apartment",
  amenities: [],
  photos: [],
  petFriendly: true,
  utilitiesIncluded: true,
  parkingIncluded: true,
  availableFrom: Math.floor(Date.now() / 86400000) * 86400000,
  minStay: 1,
});
try {
  await prepareLocalPublication([listingId]);
  await assert.rejects(
    call(owner, "mutation", "phoneContacts:setEnabled", { enabled: true }),
    /Confirm/,
  );
  const confirmed = make("qa-owner-search", {
    phoneNumber: phone,
    phoneNumberVerified: true,
    iat: Math.floor(Date.now() / 1000),
  });
  await call(confirmed, "mutation", "users:confirmPhone", { phone });
  const args = { listingId };
  assert.equal(
    (await call(viewer, "query", "phoneContacts:availability", args)).status,
    "unavailable",
  );
  await call(owner, "mutation", "phoneContacts:setEnabled", { enabled: true });
  assert.equal(
    (await call(anonymous, "query", "phoneContacts:availability", args)).status,
    "sign-in",
  );
  await assert.rejects(
    call(anonymous, "mutation", "phoneContacts:reveal", args),
    /sign in/,
  );
  const availability = await call(
    viewer,
    "query",
    "phoneContacts:availability",
    args,
  );
  assert.equal(availability.status, "available");
  assert(!JSON.stringify(availability).includes(phone));
  const revealed = await Promise.all(
    Array.from({ length: 4 }, () =>
      call(viewer, "mutation", "phoneContacts:reveal", args),
    ),
  );
  for (const value of revealed) assert.equal(value.phone, phone);
  const publicListing = await call(anonymous, "query", "listings:getById", {
    id: listingId,
  });
  assert(publicListing);
  assert(!JSON.stringify(publicListing).includes(phone));
  await call(owner, "mutation", "phoneContacts:setEnabled", { enabled: false });
  await assert.rejects(
    call(viewer, "mutation", "phoneContacts:reveal", args),
    /unavailable/,
  );
  await call(owner, "mutation", "phoneContacts:setEnabled", { enabled: true });
  await call(owner, "mutation", "users:revokePhone", {});
  await assert.rejects(
    call(viewer, "mutation", "phoneContacts:reveal", args),
    /unavailable/,
  );
  writeFileSync(
    "docs/evidence/local-phone-contact-smoke.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        target: url,
        hosted: false,
        privilegedSyntheticIdentity: true,
        actualClerkSms: false,
        defaultPrivate: true,
        verifiedOwnerOptInRequired: true,
        anonymousRevealDenied: true,
        concurrentRevealsAccepted: true,
        availabilityAndListingProjectionOmitPhone: true,
        optOutAndRevocationRechecked: true,
        realCallOrSmsPlaced: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Native local phone contact smoke passed; no SMS, phone call or real contact.",
  );
} finally {
  await call(owner, "mutation", "phoneContacts:setEnabled", { enabled: false });
  await call(owner, "mutation", "users:revokePhone", {});
  await call(owner, "mutation", "users:updateProfile", {
    userId: me._id,
    phone: "",
  });
  await call(owner, "mutation", "listings:unpublish", { id: listingId });
}
