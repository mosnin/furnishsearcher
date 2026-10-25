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
  subject = `qa-performance-${suffix}`,
  tenant = make(subject),
  other = make(`qa-performance-other-${suffix}`);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert(me && me.email === "qa-owner@example.test");
const traveler = await call(tenant, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic performance traveler",
  email: "qa-performance@example.test",
});
await call(other, "mutation", "users:getOrCreate", {
  clerkId: `qa-performance-other-${suffix}`,
  name: "[QA] Synthetic unrelated account",
  email: "qa-performance-other@example.test",
});
const day = 86400000,
  today = Math.floor(Date.now() / day) * day,
  city = `QA Performance ${suffix}`;
const listingId = await call(owner, "mutation", "listings:create", {
  landlordId: me._id,
  title: `[QA] Synthetic performance ${suffix}`,
  description:
    "Local synthetic performance acceptance; no property is offered.",
  city,
  state: "TX",
  zip: "78701",
  address: "PUBLIC QA PLACEHOLDER",
  price: 1900.55,
  bedrooms: 1,
  bathrooms: 1,
  propertyType: "Apartment",
  amenities: ["WiFi"],
  photos: [],
  petFriendly: true,
  utilitiesIncluded: true,
  parkingIncluded: true,
  availableFrom: today,
  minStay: 1,
});
await prepareLocalPublication([listingId]);
const report = () =>
  call(owner, "query", "listingPerformance:report", { listingId, days: 90 });
assert.equal((await report()).startedAt, null);
await assert.rejects(
  call(anonymous, "query", "listingPerformance:report", {
    listingId,
    days: 90,
  }),
);
await assert.rejects(
  call(other, "query", "listingPerformance:report", { listingId, days: 90 }),
);
const clientId = randomUUID(),
  observe = (kind, c = anonymous) =>
    call(c, "mutation", "listingPerformance:observe", {
      listingIds: [listingId],
      kind,
      clientId,
    });
await observe("views", owner);
assert.equal((await report()).rows.length, 0);
for (const kind of ["impressions", "views", "shares"]) {
  await observe(kind);
  await observe(kind);
}
const saveArgs = { tenantId: traveler._id, listingId };
await call(tenant, "mutation", "saved:save", saveArgs);
await call(tenant, "mutation", "saved:save", saveArgs);
await call(tenant, "mutation", "saved:unsave", saveArgs);
const requestArgs = {
  listingId,
  moveIn: today + 60 * day,
  moveOut: today + 90 * day,
  occupants: 1,
  pets: false,
  message: "[QA] Synthetic availability inquiry",
};
await call(tenant, "mutation", "inquiries:create", requestArgs);
await assert.rejects(call(tenant, "mutation", "inquiries:create", requestArgs));
await call(tenant, "mutation", "housingRequests:create", {
  userId: traveler._id,
  city,
  state: "TX",
  moveInDate: today + 60 * day,
  duration: 1,
  maxBudget: 2500,
  bedrooms: 1,
  petFriendly: false,
  description: "[QA] Synthetic performance matching",
});
let result;
for (let n = 0; n < 100; n++) {
  result = await report();
  if (result.rows[0]?.matchedLeads === 1) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(result.rows.length, 1);
assert.deepEqual(
  Object.fromEntries(
    [
      "impressions",
      "views",
      "shares",
      "saves",
      "unsaves",
      "bookingRequests",
      "threads",
      "matchedLeads",
    ].map((k) => [k, result.rows[0][k]]),
  ),
  {
    impressions: 1,
    views: 1,
    shares: 1,
    saves: 1,
    unsaves: 1,
    bookingRequests: 1,
    threads: 1,
    matchedLeads: 1,
  },
);
assert.equal(result.legacyViews, 1);
assert.equal(result.mode, "test");
const portfolio = await call(owner, "query", "listingPerformance:report", {
  days: 90,
});
assert.equal(portfolio.listingId, null);
assert(portfolio.rows.reduce((n, r) => n + r.views, 0) >= 1);
writeFileSync(
  "docs/evidence/local-performance-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      fixture:
        "isolated local synthetic publication/identity/payment prerequisites; privileged QA identities",
      listingId,
      mode: result.mode,
      metrics: result.rows[0],
      legacyViews: result.legacyViews,
      anonymousPrivateReadDenied: true,
      foreignOwnerReadDenied: true,
      ownerPreviewExcluded: true,
      duplicateObservationsSuppressed: true,
      nativeSaveInquiryThreadAndScheduledMatchAccepted: true,
      portfolioAccepted: true,
      realEmailSent: false,
      providerOrHumanAcceptance: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Native local performance smoke passed; synthetic fixtures, no provider delivery.",
);
