import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import geospatial from "./helpers/geospatial";
import { seedPublishedFixtures } from "./helpers/publication";
import { recommendationScore } from "../lib/recommendations";
import { buildSearchUrl, parseSearchParams } from "../lib/search";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 26),
  DAY = 86400000;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("RESEND_API_KEY", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture(count = 3) {
  const t = convexTest(schema, modules);
  await geospatial.register(t);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkId: "rank-owner",
      name: "Owner",
      email: "owner@example.test",
      role: "landlord",
      createdAt: 0,
    });
    const tenant = await ctx.db.insert("users", {
      clerkId: "rank-tenant",
      name: "Traveler",
      email: "traveler@example.test",
      role: "tenant",
      createdAt: 0,
    });
    const data = {
      landlordId: owner,
      title: "[QA] Ranked rental",
      description: "Synthetic rental",
      address: "Private synthetic address",
      city: "Austin",
      state: "TX",
      zip: "78701",
      bedrooms: 1,
      bathrooms: 1,
      price: 1800,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: false,
      parkingIncluded: false,
      availableFrom: 0,
      minStay: 1,
      status: "active" as const,
      views: 0,
      mapLatitude: 30.27,
      mapLongitude: -97.74,
    };
    const listings = [];
    for (let i = 0; i < count; i++)
      listings.push(
        await ctx.db.insert("listings", {
          ...data,
          title: `[QA] Ranked rental ${i}`,
          price: 1800 - i,
          createdAt: now - count + i,
        }),
      );
    return { owner, tenant, listings };
  });
  await seedPublishedFixtures(t);
  await t.mutation(internal.responsiveness.backfill, {});
  const owner = t.withIdentity({ subject: "rank-owner" }),
    tenant = t.withIdentity({ subject: "rank-tenant" });
  async function refresh() {
    let cursor: string | null = null;
    for (let i = 0; i < 100; i++) {
      const result: FunctionReturnType<
        typeof internal.recommendations.refreshPage
      > = await t.mutation(internal.recommendations.refreshPage, { cursor });
      if (result.complete) return;
      cursor = result.cursor;
    }
    throw Error("Ranking adoption failed to finish");
  }
  const send = (index: number, fromOwner = false) =>
    (fromOwner ? owner : tenant).mutation(api.messages.sendMessage, {
      senderId: fromOwner ? ids.owner : ids.tenant,
      receiverId: fromOwner ? ids.tenant : ids.owner,
      listingId: ids.listings[index],
      content: "Synthetic native ranking message",
      origin: "inbox",
    });
  return { t, ids, owner, tenant, refresh, send };
}
async function all(t: ReturnType<typeof convexTest>, filters = {}) {
  let cursor: string | null = null;
  const rows = [];
  for (let i = 0; i < 100; i++) {
    const page: FunctionReturnType<typeof api.search.listings> = await t.query(
      api.search.listings,
      { ...filters, paginationOpts: { cursor, numItems: 7 } },
    );
    rows.push(...page.page);
    if (page.isDone) return rows;
    cursor = page.continueCursor;
  }
  throw Error("Search failed to exhaust pages");
}
it("keeps recommendations unavailable until the complete indexed adoption; pages beyond a first result slice", async () => {
  const f = await fixture(61);
  expect(await f.t.query(api.recommendations.status, {})).toBe(false);
  await expect(all(f.t, { sort: "recommended" })).rejects.toThrow(
    "being prepared",
  );
  const first = await f.t.mutation(internal.recommendations.refreshPage, {
    cursor: null,
  });
  expect(first.examined).toBe(20);
  expect(first.complete).toBe(false);
  await f.refresh();
  expect(await f.t.query(api.recommendations.status, {})).toBe(true);
  await f.send(0);
  await f.send(0, true);
  const rows = await all(f.t, { sort: "recommended" });
  expect(rows.length).toBe(61);
  expect(new Set(rows.map((r) => r._id)).size).toBe(61);
  expect(rows[0]._id).toBe(f.ids.listings[0]);
  expect(rows[1]._id).toBe(f.ids.listings[60]);
  expect(
    rows.every(
      (r) =>
        !("score" in r) && !("percent" in r) && !("responseRateResetAt" in r),
    ),
  ).toBe(true);
});
it("places an unanswered listing below a neutral new listing and an answered one above it, independent of payment plan", async () => {
  const f = await fixture();
  await f.refresh();
  await f.send(0);
  expect((await all(f.t, { sort: "recommended" })).map((r) => r._id)).toEqual([
    f.ids.listings[2],
    f.ids.listings[1],
    f.ids.listings[0],
  ]);
  await f.send(0, true);
  expect((await all(f.t, { sort: "recommended" }))[0]._id).toBe(
    f.ids.listings[0],
  );
  const privateListing = await f.owner.query(api.listings.getById, {
    id: f.ids.listings[0],
  });
  expect(privateListing).not.toHaveProperty("score");
});
it("uses the same global order in normalized city, group, rectangle and radius queries", async () => {
  const f = await fixture();
  await f.refresh();
  await f.send(0);
  await f.send(0, true);
  await f.t.run(async (ctx) => {
    const { syncGeo } = await import("../convex/lib/geo");
    for (const id of f.ids.listings)
      await syncGeo(ctx, (await ctx.db.get(id))!);
  });
  const expected = [f.ids.listings[0], f.ids.listings[2], f.ids.listings[1]];
  for (const filters of [
    { city: "  AUSTIN  " },
    { mapBounds: { west: -98, east: -97, south: 30, north: 31 } },
    { nearLatitude: 30.27, nearLongitude: -97.74, radiusMiles: 5 },
  ])
    expect(
      (await all(f.t, { ...filters, sort: "recommended" })).map((r) => r._id),
      JSON.stringify(filters),
    ).toEqual(expected);
  const group = await f.t.run(async (ctx) => {
    const id = await ctx.db.insert("properties", {
      ownerId: f.ids.owner,
      primaryListingId: f.ids.listings[0],
      address: "Private synthetic address",
      city: "Austin",
      state: "TX",
      zip: "78701",
      locationVersion: 1,
      unitCount: 3,
      setupCompletedAt: now,
      createdAt: now,
    });
    for (const listingId of f.ids.listings)
      await ctx.db.patch(listingId, { propertyGroupId: id });
    return id;
  });
  // Group publication is intentionally not fabricated here: invalid/incomplete groups
  // are ineligible even if recommendation rows and scores exist.
  await f.refresh();
  expect(
    await all(f.t, { sort: "recommended", propertyGroupId: group }),
  ).toEqual([]);
  // Explicit synthetic group prerequisites, matching the existing publication fixtures.
  await f.t.run(async (ctx) => {
    await ctx.db.patch(group, {
      approvedLocationVersion: 1,
      locationConfirmedAt: now,
    });
    for (const id of f.ids.listings)
      await ctx.db.patch(id, { propertyLocationVersion: 1 });
  });
  await f.refresh();
  expect(
    (await all(f.t, { sort: "recommended", propertyGroupId: group })).map(
      (row) => row._id,
    ),
  ).toEqual(expected);
});
it("preserves explicit newest/price/view ordering, dates and current visibility gates", async () => {
  const f = await fixture();
  await f.refresh();
  await f.send(0);
  await f.send(0, true);
  expect((await all(f.t, { sort: "newest" }))[0]._id).toBe(f.ids.listings[2]);
  expect((await all(f.t, { sort: "price_asc" }))[0]._id).toBe(
    f.ids.listings[2],
  );
  expect((await all(f.t, { sort: "price_desc" }))[0]._id).toBe(
    f.ids.listings[0],
  );
  const start = now + 10 * DAY,
    end = start + 31 * DAY;
  await f.t.run((ctx) =>
    ctx.db.insert("availabilityBlocks", {
      listingId: f.ids.listings[0],
      type: "unavailable",
      startDate: start,
      endDate: end,
      createdAt: now,
    }),
  );
  expect(
    (await all(f.t, { sort: "recommended", moveIn: start, moveOut: end })).some(
      (r) => r._id === f.ids.listings[0],
    ),
  ).toBe(false);
  await f.owner.mutation(api.listings.unpublish, { id: f.ids.listings[0] });
  expect(
    (await all(f.t, { sort: "recommended" })).some(
      (r) => r._id === f.ids.listings[0],
    ),
  ).toBe(false);
});
it("does not trust stale projection ownership or status and removes the row on normal deletion", async () => {
  const f = await fixture();
  await f.refresh();
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.listings[0], { moderationHold: true }),
  );
  expect(
    (await all(f.t, { sort: "recommended" })).some(
      (r) => r._id === f.ids.listings[0],
    ),
  ).toBe(false);
  await f.t.run(async (ctx) => {
    const row = await ctx.db
      .query("listingRecommendations")
      .withIndex("by_listing", (q) => q.eq("listingId", f.ids.listings[1]))
      .unique();
    await ctx.db.patch(row!._id, { ownerId: f.ids.tenant });
  });
  expect(
    (await all(f.t, { sort: "recommended" })).some(
      (r) => r._id === f.ids.listings[1],
    ),
  ).toBe(false);
  await f.owner.mutation(api.listings.deleteListing, { id: f.ids.listings[2] });
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("listingRecommendations")
        .withIndex("by_listing", (q) => q.eq("listingId", f.ids.listings[2]))
        .unique(),
    ),
  ).toBeNull();
});
it("recomputes all owner scores from the current epoch after reset and uses neutral after history leaves the window", async () => {
  const f = await fixture();
  await f.refresh();
  await f.send(0);
  await f.send(1);
  await f.send(1, true);
  const snapshot = () =>
    f.t.run(async (ctx) =>
      Promise.all(
        f.ids.listings.map((id) =>
          ctx.db
            .query("listingRecommendations")
            .withIndex("by_listing", (q) => q.eq("listingId", id))
            .unique(),
        ),
      ),
    );
  const before = await snapshot();
  expect(before[0]!.score).toBeLessThan(before[2]!.score);
  vi.setSystemTime(now + 1);
  await f.owner.mutation(api.responsiveness.reset, {
    listingId: f.ids.listings[0],
    confirmAllRentalSpaces: true,
  });
  await f.t.mutation(internal.recommendations.refreshPage, {
    ownerId: f.ids.owner,
    cursor: null,
  });
  const after = await snapshot();
  expect(Math.floor(after[0]!.score)).toBe(50);
  expect(Math.floor(after[1]!.score)).toBe(50);
  // Current epoch has no observations. An hourly recomputation stays neutral.
  vi.setSystemTime(now + 100 * DAY);
  await f.refresh();
  expect(Math.floor((await snapshot())[0]!.score)).toBe(50);
});
it("round-trips recommended sort without changing legacy default or explicit sort links", () => {
  const url = buildSearchUrl({
    city: "Austin",
    sort: "recommended",
    minPrice: 1000,
  });
  expect(
    parseSearchParams(new URLSearchParams(url.split("?")[1])),
  ).toMatchObject({ city: "Austin", sort: "recommended", minPrice: 1000 });
  expect(parseSearchParams(new URLSearchParams())).toMatchObject({
    sort: "newest",
  });
  expect(recommendationScore(0, 0, now)).toBeGreaterThan(
    recommendationScore(1, 0, now + DAY),
  );
  expect(recommendationScore(1, 1, now - DAY)).toBeGreaterThan(
    recommendationScore(0, 0, now),
  );
});

it("withholds an existing recommendation index while response-source adoption is incomplete", async () => {
  const f = await fixture();
  await f.refresh();
  await f.t.run(async (ctx) => {
    const state = await ctx.db
      .query("responseTrackingState")
      .withIndex("by_key", (q) => q.eq("key", "v1"))
      .unique();
    await ctx.db.patch(state!._id, { complete: false });
  });
  expect(await f.t.query(api.recommendations.status, {})).toBe(false);
  await expect(all(f.t, { sort: "recommended" })).rejects.toThrow(
    "being prepared",
  );
});
