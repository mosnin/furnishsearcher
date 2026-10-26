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
  other = make("qa-tenant-search"),
  anon = new ConvexHttpClient(url, { logger: false });
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const user = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(user.role, "landlord");
let id;
try {
  id = await call(owner, "mutation", "listings:create", {
    landlordId: user._id,
    title: "[QA] Synthetic authoritative feature fixture",
    description: "Never published. Native local feature consistency check.",
    address: "Synthetic private",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: ["Pet Friendly", "Parking", "Utilities Included", "WiFi"],
    photos: [],
    petFriendly: false,
    parkingIncluded: false,
    utilitiesIncluded: false,
    availableFrom: Date.UTC(2027, 0, 1),
    minStay: 1,
  });
  let listing = await call(owner, "query", "listings:getById", { id });
  assert.deepEqual(listing.amenities, ["WiFi"]);
  assert.equal(listing.publicationRequested, false);
  await call(owner, "mutation", "listings:update", {
    id,
    petFriendly: true,
    parkingIncluded: true,
  });
  listing = await call(owner, "query", "listings:getById", { id });
  assert.deepEqual(listing.amenities, ["WiFi", "Pet Friendly", "Parking"]);
  await call(owner, "mutation", "listings:update", {
    id,
    amenities: ["Utilities Included", "Dedicated Workspace"],
  });
  listing = await call(owner, "query", "listings:getById", { id });
  assert.deepEqual(listing.amenities, [
    "Dedicated Workspace",
    "Pet Friendly",
    "Parking",
  ]);
  assert.equal(listing.utilitiesIncluded, false);
  await assert.rejects(
    call(other, "mutation", "listings:update", { id, utilitiesIncluded: true }),
    /Not authorized/,
  );
  assert.equal(await call(anon, "query", "listings:getById", { id }), null);
} finally {
  if (id) await call(owner, "mutation", "listings:deleteListing", { id });
}
writeFileSync(
  "docs/evidence/local-listing-features-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      privilegedLocalQaIdentities: true,
      nativeCreateAndPartialUpdateConsistency: true,
      foreignWriteAndAnonymousReadDenied: true,
      ownPrivateFixtureDeleted: true,
      noPublicationOrPaidIdentityFixtures: true,
      productionChanged: false,
      realEmailOrSmsSent: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Native listing feature consistency passed; only own private fixture removed.",
);
