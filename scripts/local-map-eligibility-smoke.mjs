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
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete childEnv[key];
const readEnv = (name) => {
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
  return r.status === 0 ? r.stdout.trim() : "";
};
assert(
  readEnv("CREEM_API_KEY") === "creem_test_local_synthetic",
  "Only synthetic local billing is allowed",
);
assert(readEnv("RESEND_API_KEY") === "", "Refusing real email delivery");
const make = (subject) => {
  const c = new ConvexHttpClient(url);
  if (subject)
    c.setAdminAuth(cfg.adminKey, {
      subject,
      issuer: "https://qa.furnishsearcher.invalid",
    });
  return c;
};
const call = (c, method, name, args) =>
  c[method](makeFunctionReference(name), args);
const owner = make("qa-owner-search"),
  anonymous = make(),
  suffix = randomUUID().slice(0, 8),
  subject = `qa-map-eligibility-${suffix}`,
  tenant = make(subject),
  other = make(`qa-map-eligibility-other-${suffix}`);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert(me && me.email === "qa-owner@example.test");
await call(other, "mutation", "users:getOrCreate", {
  clerkId: `qa-map-eligibility-other-${suffix}`,
  name: "[QA] Synthetic unrelated account",
  email: "qa-map-eligibility-other@example.test",
});
assert.equal(
  (await call(anonymous, "query", "geo:capabilities", {})).provider,
  "census",
  "Only the keyless public example geocoder is allowed",
);
const listingId = await call(owner, "mutation", "listings:create", {
  landlordId: me._id,
  title: `[QA] Map eligibility public Census fixture ${suffix}`,
  description:
    "Synthetic map eligibility acceptance using the public Census office address; no rental or ownership is claimed.",
  address: "4600 Silver Hill Rd",
  city: "Suitland",
  state: "MD",
  zip: "20746",
  price: 1800,
  bedrooms: 1,
  bathrooms: 1,
  propertyType: "Apartment",
  amenities: [],
  photos: [],
  petFriendly: false,
  utilitiesIncluded: true,
  parkingIncluded: true,
  availableFrom: Date.now(),
  minStay: 1,
});
const report = () =>
  call(owner, "query", "mapEligibility:report", { listingId, days: 7 });
try {
  assert.equal((await report()).currentEligible, false);
  await call(owner, "action", "geo:lookupListing", {
    listingId,
    consent: true,
  });
  const place = await call(owner, "query", "geo:mine", { listingId });
  assert.equal(
    place.status,
    "candidate",
    "No fabricated geocoder fallback is allowed",
  );
  assert(place.candidates.length > 0);
  await call(owner, "mutation", "geo:confirm", {
    listingId,
    generation: place.generation,
    candidate: 0,
  });
  await prepareLocalPublication([listingId]);
  await Promise.all([
    call(owner, "mutation", "mapEligibility:check", { listingId }),
    call(owner, "mutation", "mapEligibility:check", { listingId }),
  ]);
  const before = await report(),
    day = Math.floor(Date.now() / 86400000) * 86400000,
    row = before.rows.find((r) => r.day === day);
  assert(before.currentEligible);
  assert.equal(before.totals.eligibleSpaceDays, 1);
  assert.equal(row.eligibleSpaces, 1);
  assert.equal(row.observedSpaces, 1);
  assert.equal(before.rows.length, 1);
  const visibleListing = await call(owner, "query", "listings:getById", {
    id: listingId,
  });
  const mapResults = await call(anonymous, "query", "search:listings", {
    nearLatitude: visibleListing.mapLatitude,
    nearLongitude: visibleListing.mapLongitude,
    radiusMiles: 0.5,
    paginationOpts: { cursor: null, numItems: 24 },
  });
  assert(
    mapResults.page.some((r) => r._id === listingId),
    "The synthetic listing must actually be reachable in native map-area search",
  );
  const portfolio = await call(owner, "query", "mapEligibility:report", {
    days: 7,
  });
  assert(portfolio.rows.some((r) => r.day === day && r.eligibleSpaces >= 1));
  await assert.rejects(
    call(anonymous, "query", "mapEligibility:report", { listingId, days: 7 }),
  );
  await assert.rejects(
    call(other, "mutation", "mapEligibility:check", { listingId }),
    /Not authorized/,
  );
  await call(owner, "mutation", "listings:unpublish", { id: listingId });
  const hidden = await report();
  assert.equal(hidden.currentEligible, false);
  assert.equal(hidden.totals.eligibleSpaceDays, 1);
  assert.equal(hidden.rows.find((r) => r.day === day).eligibleSpaces, 1);
  assert.equal(
    await call(anonymous, "query", "listings:getById", { id: listingId }),
    null,
  );
  writeFileSync(
    "docs/evidence/local-map-eligibility-smoke.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        target: url,
        privilegedSyntheticIdentityAndPayment: true,
        realPublicCensusAddressLookup: true,
        realRentalOrOwnershipClaim: false,
        nativePublicationCheckEligible: true,
        nativeMapAreaSearchContainsSpace: true,
        concurrentChecksCountOnce: true,
        propertyAndPortfolioRowsAccepted: true,
        earlierDaysNotBackfilled: true,
        anonymousAndOtherOwnerDenied: true,
        hiddenListingNoLongerEligible: true,
        recordedPositiveDayRetained: true,
        sinceCollectionTotalRetained: true,
        completedSyntheticFixtureHidden: true,
        realEmailSmsPaymentOrInsurance: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Native local map eligibility checks passed; one recorded eligible day retained after hiding the synthetic fixture.",
  );
} finally {
  await call(owner, "mutation", "listings:unpublish", { id: listingId });
}
