import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const contents = readFileSync(".env.local", "utf8");
const url = contents
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
  .trim()
  .replace(/^"|"$/g, "");
const deployment = contents.match(/^CONVEX_DEPLOYMENT=([^\s#]+)/m)?.[1];
assert(
  url && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
  "Local smoke refuses a hosted target",
);
assert(
  deployment?.startsWith("anonymous:"),
  "Local smoke requires an isolated anonymous deployment",
);
assert(
  !/^CONVEX_DEPLOY_KEY=/m.test(contents),
  "Do not use a deploy key for local smoke",
);
const env = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete env[key];
function run(fn, args, subject) {
  const argv = [
    "node_modules/convex/bin/main.js",
    "run",
    fn,
    JSON.stringify(args),
    "--env-file",
    ".env.local",
  ];
  if (subject)
    argv.push(
      "--identity",
      JSON.stringify({ subject, issuer: "https://qa.furnishsearcher.invalid" }),
    );
  const result = spawnSync(process.execPath, argv, { env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${fn} failed: ${result.stderr}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
const ownerSubject = "qa-owner-search",
  tenantSubject = "qa-tenant-search";
const owner = run(
  "users:getOrCreate",
  {
    clerkId: ownerSubject,
    name: "Synthetic QA Owner",
    email: "qa-owner@example.test",
  },
  ownerSubject,
);
run("users:updateRole", { userId: owner._id, role: "landlord" }, ownerSubject);
const tenant = run(
  "users:getOrCreate",
  {
    clerkId: tenantSubject,
    name: "Synthetic QA Traveler",
    email: "qa-traveler@example.test",
  },
  tenantSubject,
);
const day = 86400000,
  start = Date.UTC(2027, 2, 1),
  end = Date.UTC(2027, 4, 1);
const existing = run(
  "listings:getByLandlord",
  { landlordId: owner._id },
  ownerSubject,
);
const created = [];
for (const sample of [
  {
    title: "[QA] Flexible Austin apartment",
    price: 1200,
    availableFrom: start + 5 * day,
  },
  { title: "[QA] Exact Austin apartment", price: 2200, availableFrom: start },
]) {
  let listing = existing.find((l) => l.title === sample.title);
  if (!listing) {
    const id = run(
      "listings:create",
      {
        landlordId: owner._id,
        ...sample,
        description: "Synthetic local smoke fixture. No rental is offered.",
        address: "Synthetic QA address",
        city: "Austin",
        state: "TX",
        zip: "78701",
        bedrooms: 2,
        bathrooms: 1.5,
        maxOccupancy: 3,
        propertyType: "Apartment",
        amenities: ["WiFi", "Step-free Entry", "Dedicated Workspace"],
        photos: [],
        petFriendly: true,
        utilitiesIncluded: true,
        parkingIncluded: true,
        minStay: 1,
      },
      ownerSubject,
    );
    listing = { ...sample, _id: id };
    if (sample.price === 1200)
      run(
        "availability:addBlock",
        {
          listingId: id,
          startDate: Date.UTC(2027, 3, 25),
          endDate: Date.UTC(2027, 5, 1),
          type: "unavailable",
          note: "Synthetic QA conflict",
        },
        ownerSubject,
      );
    run("listings:publish", { id }, ownerSubject);
  }
  created.push(listing._id);
}
const filters = {
  city: "Austin",
  state: "TX",
  minPrice: 1000,
  maxPrice: 1500,
  bedrooms: 2,
  bathrooms: 1.5,
  occupants: 3,
  propertyTypes: ["Apartment", "House"],
  amenities: ["WiFi", "Step-free Entry"],
  parkingIncluded: true,
  utilitiesIncluded: true,
  petFriendly: true,
  moveIn: start,
  moveOut: end,
};
const exact = run("search:listings", {
  ...filters,
  paginationOpts: { cursor: null, numItems: 24 },
});
const flexible = run("search:listings", {
  ...filters,
  flexibleDays: 14,
  paginationOpts: { cursor: null, numItems: 24 },
});
assert.equal(exact.page.length, 0);
assert.equal(flexible.page.length, 1);
assert.equal(flexible.page[0].matchedMoveIn, start + 5 * day);
assert.equal(flexible.page[0].matchedMoveOut, Date.UTC(2027, 3, 25));
assert(!JSON.stringify(flexible).includes("Synthetic QA address"));
let saved = run(
  "savedSearches:getByUser",
  { userId: tenant._id },
  tenantSubject,
).find((s) => s.name === "[QA] Full flexible search");
if (!saved) {
  const id = run(
    "savedSearches:save",
    {
      ...filters,
      flexibleDays: 14,
      sort: "price_asc",
      userId: tenant._id,
      name: "[QA] Full flexible search",
      emailAlerts: false,
    },
    tenantSubject,
  );
  saved = run(
    "savedSearches:getByUser",
    { userId: tenant._id },
    tenantSubject,
  ).find((s) => s._id === id);
}
assert.equal(saved.flexibleDays, 14);
assert.deepEqual(saved.propertyTypes, ["Apartment", "House"]);
assert.deepEqual(run("savedSearches:getByUser", { userId: tenant._id }), []);
const byId = run("search:listings", {
  propertyId: flexible.page[0].publicId,
  paginationOpts: { cursor: null, numItems: 24 },
});
assert.equal(byId.page[0]._id, flexible.page[0]._id);
const receipt = {
  checkedAt: new Date().toISOString(),
  target: url,
  hosted: false,
  authentication:
    "Privileged CLI development identities; not a Clerk browser/JWT acceptance test",
  syntheticListingIds: created,
  exactBudgetMatches: exact.page.length,
  flexibleBudgetMatches: flexible.page.length,
  matchedStay: {
    moveIn: new Date(flexible.page[0].matchedMoveIn).toISOString().slice(0, 10),
    moveOut: new Date(flexible.page[0].matchedMoveOut)
      .toISOString()
      .slice(0, 10),
  },
  propertyId: flexible.page[0].publicId,
  savedSearchId: saved._id,
  privateSavedSearchReadRejected: true,
  actualEmailSent: false,
};
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/local-search-smoke.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt, null, 2));
