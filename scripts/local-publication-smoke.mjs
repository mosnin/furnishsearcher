import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) &&
    /^CONVEX_DEPLOYMENT=anonymous:/m.test(env) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(env),
  "Publication smoke refuses hosted or non-anonymous targets",
);
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const make = (subject) => {
  const client = new ConvexHttpClient(url);
  client.setAdminAuth(cfg.adminKey, {
    subject,
    issuer: "https://qa.furnishsearcher.invalid",
  });
  return client;
};
const owner = make("qa-owner-search"),
  staff = make("qa-publication-staff"),
  other = make("qa-tenant-search"),
  publicClient = new ConvexHttpClient(url);
const call = (client, type, name, args) =>
  client[type](makeFunctionReference(name), args);
const user = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(user?.email, "qa-owner@example.test");
const listing = (
  await call(owner, "query", "listings:getByLandlord", { landlordId: user._id })
).find((l) => l.title === "[QA] Flexible Austin apartment");
assert(listing, "Run test:local-search first");
const prerequisites = await prepareLocalPublication([listing._id]);
const initial = await call(owner, "query", "listings:getById", {
  id: listing._id,
});
assert(
  (await call(owner, "query", "publication:getReadiness", { id: listing._id }))
    .live,
);
assert.equal(
  (await call(publicClient, "query", "listings:getById", { id: listing._id }))
    .address,
  "",
);
await assert.rejects(
  call(other, "mutation", "listings:approveListing", {
    id: listing._id,
    expectedRevision: initial.revision,
  }),
);
await call(owner, "mutation", "listings:update", {
  id: listing._id,
  price: initial.price + 1,
});
assert.equal(
  await call(publicClient, "query", "listings:getById", { id: listing._id }),
  null,
);
await assert.rejects(
  call(staff, "mutation", "listings:approveListing", {
    id: listing._id,
    expectedRevision: initial.revision,
  }),
);
let current = await call(owner, "query", "listings:getById", {
  id: listing._id,
});
await call(staff, "mutation", "listings:approveListing", {
  id: listing._id,
  expectedRevision: current.revision,
  note: "Synthetic local changed revision reviewed",
});
assert.equal(
  (await call(publicClient, "query", "listings:getById", { id: listing._id }))
    .price,
  initial.price + 1,
);
await call(owner, "mutation", "listings:unpublish", { id: listing._id });
await call(staff, "mutation", "listings:approveListing", {
  id: listing._id,
  expectedRevision: current.revision,
  note: "Synthetic content approval must preserve owner-hidden choice",
});
assert.equal(
  await call(publicClient, "query", "listings:getById", { id: listing._id }),
  null,
);
await call(owner, "mutation", "listings:update", {
  id: listing._id,
  price: initial.price,
});
await prepareLocalPublication([listing._id]);
const receipt = {
  checkedAt: new Date().toISOString(),
  target: url,
  hosted: false,
  prerequisites,
  listingId: listing._id,
  privateStreetHidden: true,
  unrelatedApprovalRejected: true,
  editImmediatelyHidesListing: true,
  staleApprovalRejected: true,
  reviewedRevisionBecomesLive: true,
  staffCannotUnhideOwnerHiddenListing: true,
  fixtureRestored: true,
  actualJumioVerification: false,
  actualCreemPayment: false,
};
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/local-publication-smoke.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt, null, 2));
