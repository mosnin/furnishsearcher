import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const source = readFileSync(".env.local", "utf8"),
  url = source
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
    .trim()
    .replace(/^"|"$/g, "");
assert(
  url &&
    new URL(url).protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(source) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(source),
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
const cli = (args) =>
  spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--env-file", ".env.local"],
    { env: childEnv, encoding: "utf8" },
  );
const readEnv = (name) => {
  const result = cli(["env", "get", name]);
  return result.status === 0 ? result.stdout.trim() : "";
};
// Never print keys, including on guard failures.
assert(
  readEnv("CREEM_API_KEY") === "creem_test_local_synthetic",
  "Market QA requires the existing synthetic billing fixture",
);
assert(
  readEnv("RESEND_API_KEY") === "",
  "Synthetic QA refuses live email configuration",
);
const anonymous = new ConvexHttpClient(url),
  owner = new ConvexHttpClient(url);
owner.setAdminAuth(cfg.adminKey, {
  subject: "qa-owner-search",
  issuer: "https://qa.furnishsearcher.invalid",
});
const call = (client, method, name, args) =>
  client[method](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert(me && me.email === "qa-owner@example.test");
await assert.rejects(
  call(anonymous, "query", "analytics:getListingStats", { landlordId: me._id }),
);
const own = await call(owner, "query", "analytics:getListingStats", {
  landlordId: me._id,
});
assert(own.totalListings > 0);
const city = `QA Market ${randomUUID().slice(0, 8)}`,
  state = "TX",
  sessions = Array.from({ length: 10 }, () => randomUUID());
const shape = {
  city,
  state,
  bedrooms: "1",
  budget: "$1,000–1,999",
  types: ["Apartment"],
  amenities: ["WiFi"],
  pets: true,
  lead: "30–89 days",
  duration: "61–90 days",
};
for (const clientId of sessions.slice(0, 9))
  assert.equal(
    await call(anonymous, "mutation", "marketInsights:recordSearch", {
      clientId,
      shape,
    }),
    true,
  );
let report = await call(anonymous, "query", "marketInsights:overview", {
  city,
  state,
});
assert.equal(report.mode, "test");
assert.equal(report.demand[0].visible, false);
assert.equal(report.demand[0].count, null);
assert.equal(
  await call(anonymous, "mutation", "marketInsights:recordSearch", {
    clientId: sessions[0],
    shape: { ...shape, city: city.toUpperCase(), state: "Texas" },
  }),
  false,
);
await call(anonymous, "mutation", "marketInsights:recordSearch", {
  clientId: sessions[9],
  shape,
});
report = await call(anonymous, "query", "marketInsights:overview", {
  city,
  state,
});
assert.equal(report.demand[0].count, 10);
assert.equal(report.demand[0].visible, true);
assert.equal(
  report.demand[0].buckets.find((x) => x.dimension === "budget").count,
  10,
);
for (const id of sessions) assert(!JSON.stringify(report).includes(id));
const startedAt = Date.now();
assert(
  cli(["run", "marketSupply:refresh", "{}"]).status === 0,
  "Could not start the local inventory snapshot",
);
let national;
for (let n = 0; n < 180; n++) {
  national = await call(anonymous, "query", "marketInsights:overview", {});
  if (national.supply && national.supply.completedAt >= startedAt) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert(
  national.supply && national.supply.completedAt >= startedAt,
  "Local snapshot did not finish",
);
const validStates = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);
const found = new Map();
let cursor = null,
  exhausted = false;
for (let n = 0; n < 200; n++) {
  const page = await call(anonymous, "query", "search:listings", {
    paginationOpts: { cursor, numItems: 24 },
  });
  for (const row of page.page)
    if (validStates.has(row.state) && row.city.trim()) found.set(row._id, row);
  if (page.isDone) {
    exhausted = true;
    break;
  }
  cursor = page.continueCursor;
}
assert(exhausted, "Public inventory comparison did not exhaust its pages");
assert.equal(national.supply.listings, found.size);
const expectedCents = found.size
  ? Math.round(
      [...found.values()].reduce(
        (sum, row) => sum + Math.round(row.price * 100),
        0,
      ) / found.size,
    )
  : null;
assert.equal(national.supply.avgCents, expectedCents);
writeFileSync(
  "docs/evidence/local-market-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      mode: "test",
      privilegedOwnerFixture: true,
      actualClerkJwt: false,
      actualTravelers: false,
      anonymousOwnerStatsDenied: true,
      ownStatsAccessible: true,
      nineSessionCohortSuppressed: true,
      tenthSessionAggregateVisible: true,
      equivalentSearchDeduplicated: true,
      publicReportOmitsSessionReferences: true,
      completeSnapshotMatchesPagedPublicInventory: true,
      eligibleRentalSpaces: found.size,
      exactCentAverageMatchesPublicInventory: true,
      syntheticSearchProfilesRetainedUntilNormalExpiry: 10,
      providerEffects: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Local market smoke passed; synthetic search observations and inventory comparison, no real travelers/provider effects.",
);
