import { randomUUID } from "node:crypto";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
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
  subject = `qa-recommended-${randomUUID()}`,
  traveler = make(subject),
  anonymous = new ConvexHttpClient(url, { logger: false });
const admin = new ConvexHttpClient(url, { logger: false });
admin.setAdminAuth(cfg.adminKey);
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me.email, "qa-owner@example.test");
const tenant = await call(traveler, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic ranking traveler",
  email: "recommended@example.test",
});
const listings = [],
  borrowed = [];
let conversationId, prerequisites;
const search = JSON.parse(
  readFileSync("docs/evidence/local-search-smoke.json", "utf8"),
);
assert(search.hosted === false && search.target === url);
const waitReady = async (name) => {
  for (let i = 0; i < 100; i++) {
    if (await call(anonymous, "query", name, {})) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error(`${name} did not finish`);
};
try {
  await call(admin, "mutation", "responsiveness:backfill");
  await call(admin, "mutation", "geo:reindex", { cursor: null });
  await waitReady("geo:indexStatus");
  await call(admin, "mutation", "recommendations:refreshPage", {
    cursor: null,
  });
  await waitReady("recommendations:status");
  const active = (
    await call(owner, "query", "listings:getByLandlord", { landlordId: me._id })
  ).filter((l) => l.status === "active");
  let needed = Math.max(0, active.length + 2 - 5);
  for (const id of search.syntheticListingIds) {
    if (!needed) break;
    const l = await call(owner, "query", "listings:getById", { id });
    assert(
      l.landlordId === me._id &&
        [
          "[QA] Flexible Austin apartment",
          "[QA] Exact Austin apartment",
        ].includes(l.title),
    );
    if (l.status === "active" && l.publicationRequested === true) {
      borrowed.push(id);
      await call(owner, "mutation", "listings:unpublish", { id });
      needed--;
    }
  }
  assert.equal(
    needed,
    0,
    "Only receipt-bound QA listings may lend publication capacity",
  );
  assert.equal(
    (await call(anonymous, "query", "geo:capabilities")).provider,
    "census",
  );
  for (let i = 0; i < 2; i++) {
    const id = await call(owner, "mutation", "listings:create", {
      landlordId: me._id,
      title: `[QA] Recommended order ${i} — not a rental`,
      description:
        "Synthetic native ordering check at the public Census office address. No stay or property ownership is claimed.",
      address: "4600 Silver Hill Rd",
      city: "Suitland",
      state: "MD",
      zip: "20746",
      price: 19400 + i,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: false,
      parkingIncluded: false,
      availableFrom: Date.UTC(2027, 0, 1),
      minStay: 1,
    });
    listings.push(id);
    await call(owner, "action", "geo:lookupListing", {
      listingId: id,
      consent: true,
    });
    const location = await call(owner, "query", "geo:mine", { listingId: id });
    assert.equal(location.status, "candidate");
    assert(location.candidates.length);
    await call(owner, "mutation", "geo:confirm", {
      listingId: id,
      generation: location.generation,
      candidate: 0,
    });
  }
  prerequisites = await prepareLocalPublication(listings);
  const a = await call(owner, "query", "listings:getById", { id: listings[0] });
  assert(a.mapLatitude !== undefined && a.mapLongitude !== undefined);
  const bounds = {
    west: a.mapLongitude - 0.05,
    east: a.mapLongitude + 0.05,
    south: a.mapLatitude - 0.05,
    north: a.mapLatitude + 0.05,
  };
  const filters = { minPrice: 19400, maxPrice: 19401 };
  const all = async (extra) => {
    let cursor = null,
      rows = [];
    for (let i = 0; i < 100; i++) {
      const page = await call(anonymous, "query", "search:listings", {
        ...filters,
        ...extra,
        paginationOpts: { cursor, numItems: 24 },
      });
      rows.push(...page.page);
      if (page.isDone) return rows;
      cursor = page.continueCursor;
    }
    throw Error("Search did not finish");
  };
  const ordered = async (extra) => (await all(extra)).map((r) => r._id);
  const first = await call(traveler, "mutation", "messages:sendMessage", {
    senderId: tenant._id,
    receiverId: me._id,
    listingId: listings[0],
    content: "[QA] First synthetic ranking message",
    origin: "inbox",
  });
  assert.deepEqual(await ordered({ sort: "recommended" }), [
    listings[1],
    listings[0],
  ]);
  assert.deepEqual(await ordered({ sort: "recommended", mapBounds: bounds }), [
    listings[1],
    listings[0],
  ]);
  await call(owner, "mutation", "messages:sendMessage", {
    senderId: me._id,
    receiverId: tenant._id,
    listingId: listings[0],
    content: "[QA] First synthetic ranking reply",
    origin: "inbox",
  });
  assert.deepEqual(await ordered({ sort: "recommended" }), [
    listings[0],
    listings[1],
  ]);
  assert.deepEqual(await ordered({ sort: "recommended", mapBounds: bounds }), [
    listings[0],
    listings[1],
  ]);
  assert.deepEqual(
    await ordered({
      sort: "recommended",
      nearLatitude: a.mapLatitude,
      nearLongitude: a.mapLongitude,
      radiusMiles: 5,
    }),
    [listings[0], listings[1]],
  );
  assert.deepEqual(await ordered({ sort: "newest", mapBounds: bounds }), [
    listings[1],
    listings[0],
  ]);
  assert.deepEqual(await ordered({ sort: "price_asc", mapBounds: bounds }), [
    listings[0],
    listings[1],
  ]);
  assert.deepEqual(await ordered({ sort: "price_desc", mapBounds: bounds }), [
    listings[1],
    listings[0],
  ]);
  const rows = await all({ sort: "recommended" });
  assert(rows.every((r) => !("score" in r) && !("percent" in r)));
  const convs = await call(owner, "query", "messages:getConversations", {
    userId: me._id,
  });
  conversationId = convs.find(
    (c) => c.listingId === listings[0] && c.tenantId === tenant._id,
  )?._id;
  assert(conversationId && first);
  await call(owner, "mutation", "listings:unpublish", { id: listings[0] });
  assert.deepEqual(await ordered({ sort: "recommended", mapBounds: bounds }), [
    listings[1],
  ]);
} finally {
  if (conversationId)
    for (const client of [owner, traveler])
      await call(client, "mutation", "messages:setArchived", {
        conversationId,
        archived: true,
      });
  for (const id of listings) {
    const l = await call(owner, "query", "listings:getById", { id });
    assert(
      l.landlordId === me._id && l.title.startsWith("[QA] Recommended order "),
    );
    await call(owner, "mutation", "listings:deleteListing", { id });
  }
  for (const id of borrowed) {
    const restored = await call(owner, "mutation", "listings:publish", { id });
    assert(restored.live);
  }
}
writeFileSync(
  "docs/evidence/local-recommended-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      privilegedLocalQaIdentities: true,
      publicationPrerequisites: prerequisites,
      actualCensusLookups: 2,
      publicCensusOfficeExampleOnly: true,
      nativeFirstReplyReordersWholeListAndMap: true,
      radiusOrderAgrees: true,
      explicitSpatialPriceAndNewestSortsVerified: true,
      privateScoresNotReturned: true,
      hiddenRentalExcluded: true,
      ownRentalsDeletedAndConversationArchived: true,
      borrowedReceiptBoundCapacityRestored: true,
      realEmailOrSmsSent: false,
      productionChanged: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Native recommended list/map/price/recency order verified; own rentals removed and receipt-bound capacity restored.",
);
