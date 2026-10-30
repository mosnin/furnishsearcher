import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
const source = readFileSync(".env.local", "utf8");
const url = source
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
const make = (subject) => {
  const c = new ConvexHttpClient(url, { logger: false });
  c.setAdminAuth(cfg.adminKey, {
    subject,
    issuer: "https://qa.furnishsearcher.invalid",
  });
  return c;
};
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const owner = make("qa-owner-search"),
  travelerSubject = `qa-favorites-${randomUUID()}`,
  traveler = make(travelerSubject),
  otherSubject = `qa-favorites-other-${randomUUID()}`,
  other = make(otherSubject);
const landlord = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(landlord?.email, "qa-owner@example.test");
const tenant = await call(traveler, "mutation", "users:getOrCreate", {
  clerkId: travelerSubject,
  name: "[QA] Favorites traveler",
  email: "favorites@example.test",
});
const outsider = await call(other, "mutation", "users:getOrCreate", {
  clerkId: otherSubject,
  name: "[QA] Favorites outsider",
  email: "favorites-other@example.test",
});
const listingId = await call(owner, "mutation", "listings:create", {
  landlordId: landlord._id,
  title: "[QA] Native favorites lifecycle",
  description: "Synthetic unpublished-at-end fixture",
  address: "Synthetic private fixture",
  city: "Austin",
  state: "TX",
  zip: "78701",
  price: 1500,
  bedrooms: 1,
  bathrooms: 1,
  propertyType: "Apartment",
  amenities: [],
  photos: [],
  petFriendly: false,
  utilitiesIncluded: true,
  parkingIncluded: false,
  availableFrom: Date.UTC(2027, 0, 1),
});
const page = () =>
  call(traveler, "query", "saved:mine", {
    paginationOpts: { numItems: 18, cursor: null },
  });
try {
  await prepareLocalPublication([listingId]);
  const args = { tenantId: tenant._id, listingId };
  const saved = await call(traveler, "mutation", "saved:save", args);
  assert.equal(await call(traveler, "mutation", "saved:save", args), saved);
  let result = await page();
  assert.equal(result.page.length, 1);
  assert.equal(result.page[0].listing._id, listingId);
  assert(!("address" in result.page[0].listing));
  assert(!("photoAssets" in result.page[0].listing));
  assert.equal(
    (
      await call(other, "query", "saved:mine", {
        paginationOpts: { numItems: 18, cursor: null },
      })
    ).page.length,
    0,
  );
  await assert.rejects(
    call(other, "mutation", "saved:unsave", args),
    /Not authorized/,
  );
  await owner.mutation(makeFunctionReference("listings:unpublish"), {
    id: listingId,
  });
  result = await page();
  assert.equal(result.page.length, 1);
  assert.equal(result.page[0].listing, null);
  assert.equal(
    (await call(traveler, "query", "saved:summary")).recent[0].listing,
    null,
  );
  await assert.rejects(
    call(other, "mutation", "saved:save", {
      tenantId: outsider._id,
      listingId,
    }),
    /unavailable/,
  );
  await owner.mutation(makeFunctionReference("listings:publish"), {
    id: listingId,
  });
  assert.equal((await page()).page[0].listing._id, listingId);
  await owner.mutation(makeFunctionReference("listings:unpublish"), {
    id: listingId,
  });
  assert.equal(await call(traveler, "mutation", "saved:unsave", args), saved);
  assert.equal(await call(traveler, "mutation", "saved:unsave", args), null);
  assert.equal((await call(traveler, "query", "saved:summary")).count, 0);
  writeFileSync(
    "docs/evidence/local-favorites-smoke.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        target: url,
        hosted: false,
        authentication:
          "Privileged local development identities and explicit synthetic paid/identity/staff publication fixture, not real provider acceptance",
        actualPublicSaveAndIdempotentRetry: true,
        privatePagedCardProjection: true,
        unrelatedAccountDenied: true,
        hiddenEntryRetainedWithoutDetails: true,
        republishedEntryRestoresCurrentCard: true,
        hiddenEntryRemovalAndRetry: true,
        productionChanged: false,
        realEmailOrSmsSent: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Native local favorites lifecycle passed: public save, privacy, hide/restore and unavailable removal.",
  );
} finally {
  await call(traveler, "mutation", "saved:unsave", {
    tenantId: tenant._id,
    listingId,
  });
  await call(owner, "mutation", "listings:deleteListing", { id: listingId });
}
