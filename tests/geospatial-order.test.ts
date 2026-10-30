import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import geospatial from "./helpers/geospatial";
import { seedPublishedFixtures } from "./helpers/publication";
import {
  encodeTupleKey,
  decodeTupleKey,
} from "../node_modules/@convex-dev/geospatial/dist/component/lib/tupleKey.js";
import { encodeTupleKey as oldEncode } from "../node_modules/geospatial-legacy/dist/component/lib/tupleKey.js";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("orders signed numeric keys, fractional response scores, prices and timestamps; legacy bytes remain unchanged", () => {
  const values = [
    -1e12, -1000000, -1, -0.5, 0, 0.5, 1, 100, 1000, 5000.641, 6667.641,
    1000000, 1e12,
  ];
  const keys = values.map((n) => encodeTupleKey(n, "point" as never));
  expect([...keys].sort().map((key) => decodeTupleKey(key).sortKey)).toEqual(
    values,
  );
  expect(values.map((n) => oldEncode(n, "point" as never))).not.toEqual(keys);
  // The unchanged legacy encoding still round-trips; only v2 uses numeric order.
  expect(oldEncode(100, "point" as never)).toBe("2F.......4b.:point");
});
it("migrates existing spatial rows in bounded pages, gates new queries and preserves an unprefixed legacy cursor", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 26));
  const t = convexTest(schema, modules);
  await geospatial.register(t);
  const ids = await t.run(async (ctx) => {
    const ready = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", "geospatialV2"))
      .unique();
    await ctx.db.patch(ready!._id, { complete: false });
    const owner = await ctx.db.insert("users", {
      clerkId: "migration-owner",
      name: "Synthetic owner",
      email: "migration@example.test",
      role: "landlord",
      createdAt: 0,
    });
    const listings = [];
    for (let i = 0; i < 12; i++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: `[QA] Old spatial ${i}`,
          description: "Synthetic migration fixture",
          address: "Private synthetic",
          city: "Austin",
          state: "TX",
          zip: "78701",
          price: 1000 + i * 500,
          bedrooms: 1,
          bathrooms: 1,
          propertyType: "Apartment",
          amenities: [],
          photos: [],
          petFriendly: false,
          utilitiesIncluded: false,
          parkingIncluded: false,
          availableFrom: 0,
          minStay: 1,
          status: "active",
          createdAt: Date.now() - i * 1000,
          views: i,
          mapLatitude: 30.27,
          mapLongitude: -97.74,
        }),
      );
    return listings;
  });
  await seedPublishedFixtures(t);
  const old = await t.run(async (ctx) => {
    const { legacyGeo } = await import("../convex/lib/geo");
    for (let i = 0; i < ids.length; i++)
      await legacyGeo.insert(
        ctx,
        `price_asc:${ids[i]}`,
        { latitude: 30.27, longitude: -97.74 },
        { sort: "price_asc", status: "active" },
        1000 + i * 500,
      );
    return legacyGeo.query(ctx, {
      shape: {
        type: "rectangle",
        rectangle: { west: -98, east: -97, south: 30, north: 31 },
      },
      filter: (q) => q.eq("sort", "price_asc").eq("status", "active"),
      limit: 3,
    });
  });
  expect(old.nextCursor).toBeTruthy();
  const args = {
    mapBounds: { west: -98, east: -97, south: 30, north: 31 },
    sort: "price_asc" as const,
  };
  await expect(
    t.query(api.search.listings, {
      ...args,
      paginationOpts: { cursor: null, numItems: 3 },
    }),
  ).rejects.toThrow("being prepared");
  await t.mutation(internal.geo.reindex, { cursor: null });
  expect(await t.query(api.geo.indexStatus, {})).toBe(false);
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await t.query(api.geo.indexStatus, {})).toBe(true);
  const first = await t.query(api.search.listings, {
    ...args,
    paginationOpts: { cursor: null, numItems: 3 },
  });
  expect(first.page.map((row) => row._id)).toEqual(ids.slice(0, 3));
  expect(first.continueCursor.startsWith("geo2:")).toBe(true);
  const second = await t.query(api.search.listings, {
    ...args,
    paginationOpts: { cursor: first.continueCursor, numItems: 3 },
  });
  expect(second.page.map((row) => row._id)).toEqual(ids.slice(3, 6));
  const rest = await t.query(api.search.listings, {
    ...args,
    paginationOpts: { cursor: old.nextCursor!, numItems: 24 },
  });
  const oldFirst = old.results.map((row) => row.key.slice("price_asc:".length));
  expect(new Set([...oldFirst, ...rest.page.map((row) => row._id)]).size).toBe(
    12,
  );
  expect(rest.page.every((row) => !oldFirst.includes(row._id))).toBe(true);
});
