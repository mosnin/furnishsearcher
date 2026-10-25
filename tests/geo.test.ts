import { retainedSpatialPages } from "../lib/spatial-pages";
import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FunctionReturnType } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  seedPublishedFixtures,
  approveFixtureEdit,
} from "./helpers/publication";
import {
  approximatePoint,
  distanceMiles,
  parseCensus,
  parseGeoapify,
} from "../lib/geo";
import {
  normalizeSearch,
  parseSearchParams,
  searchParams,
} from "../lib/search";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 24),
  paginationOpts = { cursor: null, numItems: 10 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("GEOAPIFY_API_KEY", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function response(latitude = 30.2671, longitude = -97.7432) {
  return {
    result: {
      addressMatches: [
        {
          matchedAddress: "100 MAIN ST, AUSTIN, TX, 78701",
          addressComponents: { state: "TX", zip: "78701" },
          coordinates: { x: longitude, y: latitude },
        },
      ],
    },
  };
}
async function setup() {
  const t = convexTest(schema, modules);
  geospatial.register(t);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "landlord" | "tenant" | "admin") =>
      ctx.db.insert("users", {
        clerkId,
        name: clerkId,
        email: `${clerkId}@example.test`,
        role,
        createdAt: now,
      });
    return {
      owner: await make("owner", "landlord"),
      other: await make("other", "landlord"),
      tenant: await make("tenant", "tenant"),
      staff: await make("staff", "admin"),
    };
  });
  const owner = t.withIdentity({ subject: "owner" }),
    other = t.withIdentity({ subject: "other" }),
    tenant = t.withIdentity({ subject: "tenant" }),
    staff = t.withIdentity({ subject: "staff" });
  const listing = await owner.mutation(api.listings.create, {
    landlordId: ids.owner,
    title: "Synthetic map home",
    description: "Synthetic geometry fixture",
    address: "100 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "House",
    amenities: ["WiFi"],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: true,
    parkingIncluded: true,
    availableFrom: now,
    minStay: 1,
  });
  async function locate(latitude = 30.2671, longitude = -97.7432) {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify(response(latitude, longitude))),
      ),
    );
    await owner.action(api.geo.lookupListing, {
      listingId: listing,
      consent: true,
    });
    const state = await owner.query(api.geo.mine, { listingId: listing });
    await owner.mutation(api.geo.confirm, {
      listingId: listing,
      generation: state!.generation,
      candidate: 0,
    });
  }
  async function publish() {
    await t.run((ctx) => ctx.db.patch(listing, { status: "active" }));
    await seedPublishedFixtures(t);
    await t.mutation(internal.geo.reindex, { cursor: null });
  }
  return { t, ids, owner, other, tenant, staff, listing, locate, publish };
}
async function all(
  t: Awaited<ReturnType<typeof setup>>["t"],
  filters: Record<string, unknown>,
) {
  const rows: FunctionReturnType<typeof api.search.listings>["page"] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 100; i++) {
    const page: FunctionReturnType<typeof api.search.listings> = await t.query(
      api.search.listings,
      { ...filters, paginationOpts: { cursor, numItems: 10 } },
    );
    rows.push(...page.page);
    if (page.isDone) return rows;
    cursor = page.continueCursor;
  }
  throw new Error("Spatial query did not finish.");
}
describe("private geocoding and map-area search", () => {
  it("requires owner consent and authority, confirms a provider candidate and stores only approximate public coordinates", async () => {
    const f = await setup();
    await expect(
      f.owner.action(api.geo.lookupListing, {
        listingId: f.listing,
        consent: false,
      }),
    ).rejects.toThrow("Confirm sending");
    await expect(
      f.other.query(api.geo.mine, { listingId: f.listing }),
    ).rejects.toThrow("authorized");
    await expect(
      f.other.action(api.geo.lookupListing, {
        listingId: f.listing,
        consent: true,
      }),
    ).rejects.toThrow("authorized");
    await f.locate();
    await f.publish();
    const privateLocation = await f.t.run((ctx) =>
      ctx.db.query("listingLocations").first(),
    );
    expect(privateLocation).toMatchObject({
      exactLatitude: 30.2671,
      exactLongitude: -97.7432,
      status: "confirmed",
      candidates: [],
    });
    const rows = await all(f.t, {
      mapBounds: { south: 30.2, west: -97.9, north: 30.4, east: -97.6 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      mapLatitude: 30.265,
      mapLongitude: -97.745,
    });
    for (const secret of [
      "100 Main",
      "30.2671",
      "97.7432",
      "exactLatitude",
      "matchedAddress",
    ])
      expect(JSON.stringify(rows)).not.toContain(secret);
    expect((await f.t.query(api.listings.getFeatured, {}))[0].address).toBe("");
    expect((await f.t.query(api.listings.search, {}))[0].address).toBe("");
    await expect(
      f.owner.action(api.geo.lookupListing, {
        listingId: f.listing,
        consent: true,
      }),
    ).rejects.toThrow("confirmed");
  });
  it("rejects fallback city matches or different street numbers, states and ZIP codes", async () => {
    const f = await setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                addressMatches: [
                  {
                    matchedAddress: "101 MAIN ST, AUSTIN, TX, 78701",
                    addressComponents: { state: "TX", zip: "78701" },
                    coordinates: { x: -97.74, y: 30.26 },
                  },
                ],
              },
            }),
          ),
      ),
    );
    await f.owner.action(api.geo.lookupListing, {
      listingId: f.listing,
      consent: true,
    });
    expect(
      await f.owner.query(api.geo.mine, { listingId: f.listing }),
    ).toMatchObject({ status: "failed", candidates: [] });
    vi.setSystemTime(now + 30001);
    vi.stubEnv("GEOAPIFY_API_KEY", "synthetic");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              features: [
                {
                  properties: {
                    formatted: "Austin, TX",
                    country_code: "us",
                    lat: 30.2,
                    lon: -97.7,
                    result_type: "city",
                    state_code: "TX",
                    postcode: "78701",
                    housenumber: "100",
                  },
                },
              ],
            }),
          ),
      ),
    );
    await f.owner.action(api.geo.lookupListing, {
      listingId: f.listing,
      consent: true,
    });
    expect(
      (await f.owner.query(api.geo.mine, { listingId: f.listing }))?.status,
    ).toBe("failed");
  });
  it("rejects stale address results and invalid candidate selection without moving the public point", async () => {
    const f = await setup(),
      request = await f.owner.mutation(internal.geo.begin, {
        listingId: f.listing,
      });
    await f.owner.mutation(api.listings.update, {
      id: f.listing,
      address: "102 Main St",
    });
    await f.t.mutation(internal.geo.finish, {
      listingId: f.listing,
      generation: request.generation,
      addressKey: request.addressKey,
      candidates: parseCensus(response()),
    });
    expect(
      await f.owner.query(api.geo.mine, { listingId: f.listing }),
    ).toBeNull();
    await expect(
      f.owner.mutation(api.geo.confirm, {
        listingId: f.listing,
        generation: request.generation,
        candidate: 0,
      }),
    ).rejects.toThrow("changed");
  });
  it("clears a draft location and spatial index on address edits, locks published addresses and audits staff corrections", async () => {
    const f = await setup();
    await f.locate();
    await f.publish();
    expect(
      await all(f.t, {
        nearLatitude: 30.265,
        nearLongitude: -97.745,
        radiusMiles: 1,
      }),
    ).toHaveLength(1);
    await f.owner.mutation(api.listings.update, {
      id: f.listing,
      address: "102 Main St",
    });
    await approveFixtureEdit(f.t, f.listing);
    expect(
      await all(f.t, {
        nearLatitude: 30.265,
        nearLongitude: -97.745,
        radiusMiles: 1,
      }),
    ).toHaveLength(0);
    await expect(
      f.owner.mutation(api.listings.update, {
        id: f.listing,
        address: "104 Main St",
      }),
    ).rejects.toThrow("locked");
    await expect(
      f.other.mutation(api.geo.correctAddress, {
        listingId: f.listing,
        address: "102 Main Street",
        city: "Austin",
        state: "TX",
        zip: "78701",
        note: "Synthetic minor typo correction",
      }),
    ).rejects.toThrow("Staff");
    await expect(
      f.staff.mutation(api.geo.correctAddress, {
        listingId: f.listing,
        address: "104 Main Street",
        city: "Austin",
        state: "TX",
        zip: "78701",
        note: "A different property is not a correction",
      }),
    ).rejects.toThrow("different property");
    await f.staff.mutation(api.geo.correctAddress, {
      listingId: f.listing,
      address: "102 Main Street",
      city: "Austin",
      state: "TX",
      zip: "78701",
      note: "Synthetic minor street abbreviation correction",
    });
    expect(
      (await f.t.run((ctx) => ctx.db.query("locationAudit").collect())).some(
        (a) => a.action === "address_corrected",
      ),
    ).toBe(true);
  });
  it("keeps spatial filters, sort and radius in URLs and private saved searches", async () => {
    const f = await setup();
    const filters = normalizeSearch({
      mapBounds: { south: 30.1, west: -98, north: 30.5, east: -97.5 },
      nearLatitude: 30.26,
      nearLongitude: -97.74,
      radiusMiles: 5,
      nearLabel: "Synthetic public workplace",
      sort: "price_asc",
      amenities: ["WiFi"],
    });
    expect(parseSearchParams(searchParams(filters))).toEqual(filters);
    const id = await f.tenant.mutation(api.savedSearches.save, {
      ...filters,
      userId: f.ids.tenant,
      name: "Near workplace",
      emailAlerts: true,
    });
    const own = await f.t.run((ctx) => ctx.db.get(id));
    expect(own).toMatchObject(filters);
    for (const invalid of [
      { nearLatitude: 200, nearLongitude: 0, radiusMiles: 5 },
      { nearLatitude: 30 },
      { nearLatitude: 30, nearLongitude: 0, radiusMiles: 0 },
      { mapBounds: { south: 30, west: -98, north: 29, east: -97 } },
    ])
      expect(() => normalizeSearch(invalid)).toThrow();
  });
  it("paginates every spatial match in price order, applies filters and excludes unplaced or hidden listings", async () => {
    const f = await setup();
    await f.locate();
    await f.publish();
    const template = await f.t.run((ctx) => ctx.db.get(f.listing));
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 35; i++)
        await ctx.db.insert("listings", {
          ...(Object.fromEntries(
            Object.entries(template!).filter(([k]) => !k.startsWith("_")),
          ) as any),
          title: `Synthetic ${i}`,
          price: 1000 + i,
          createdAt: now + i,
          mapLatitude: 30.265,
          mapLongitude: -97.745,
        });
    });
    await f.t.mutation(internal.geo.reindex, { cursor: null });
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const bounds = { south: 30.2, west: -97.8, north: 30.3, east: -97.7 };
    const found = await all(f.t, {
      mapBounds: bounds,
      sort: "price_asc",
      maxPrice: 1020,
    });
    expect(found).toHaveLength(21);
    expect(found.map((l) => l.price)).toEqual(
      Array.from({ length: 21 }, (_, i) => 1000 + i),
    );
    expect(new Set(found.map((l) => l._id)).size).toBe(21);
    expect(
      await all(f.t, {
        mapBounds: { south: 40, west: -75, north: 41, east: -74 },
      }),
    ).toHaveLength(0);
    await f.owner.mutation(api.listings.unpublish, { id: f.listing });
    expect(
      (await all(f.t, { mapBounds: bounds })).some((l) => l._id === f.listing),
    ).toBe(false);
  });
  it("uses public approximate points for radius boundaries and keeps paid/identity/content gates in spatial results", async () => {
    const f = await setup();
    await f.locate();
    await f.publish();
    const point = approximatePoint({ latitude: 30.2671, longitude: -97.7432 });
    const found = await all(f.t, {
      nearLatitude: point.latitude,
      nearLongitude: point.longitude,
      radiusMiles: 0.5,
    });
    expect(found[0].distanceMiles).toBe(0);
    await f.owner.mutation(api.listings.update, { id: f.listing, price: 1600 });
    expect(
      await all(f.t, {
        nearLatitude: point.latitude,
        nearLongitude: point.longitude,
        radiusMiles: 1,
      }),
    ).toHaveLength(0);
    await approveFixtureEdit(f.t, f.listing);
    expect(
      (
        await all(f.t, {
          nearLatitude: point.latitude,
          nearLongitude: point.longitude,
          radiusMiles: 1,
          sort: "price_desc",
        })
      )[0].price,
    ).toBe(1600);
  });
  it("bounds provider requests and fails honestly on network errors, redirects and oversized bodies", async () => {
    const f = await setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Synthetic outage");
      }),
    );
    await expect(
      f.owner.action(api.geo.lookupListing, {
        listingId: f.listing,
        consent: true,
      }),
    ).rejects.toThrow("Could not confirm");
    expect(
      (await f.owner.query(api.geo.mine, { listingId: f.listing }))?.status,
    ).toBe("failed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        expect(options.redirect).toBe("error");
        return new Response("x".repeat(512001));
      }),
    );
    await expect(
      f.t.action(api.geo.searchPlaces, {
        text: "Synthetic public address",
        consent: true,
      }),
    ).rejects.toThrow("failed");
  });
  it("parses provider coordinates defensively and calculates labeled straight-line distances", () => {
    expect(parseCensus(response())).toHaveLength(1);
    expect(
      parseCensus({
        result: {
          addressMatches: [
            { matchedAddress: "Invalid", coordinates: { x: 999, y: 0 } },
          ],
        },
      }),
    ).toHaveLength(0);
    expect(
      parseGeoapify({
        features: [
          {
            properties: {
              lat: 0,
              lon: 0,
              country_code: "ca",
              formatted: "Elsewhere",
            },
          },
        ],
      }),
    ).toHaveLength(0);
    expect(
      distanceMiles(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ),
    ).toBeCloseTo(69.09, 1);
  });
  it("revalidates radius criteria for saved-search alerts rather than alerting on city alone", async () => {
    const f = await setup();
    await f.locate();
    await f.publish();
    await f.tenant.mutation(api.savedSearches.save, {
      userId: f.ids.tenant,
      name: "Within one mile",
      emailAlerts: true,
      nearLatitude: 30.265,
      nearLongitude: -97.745,
      radiusMiles: 1,
    });
    await f.tenant.mutation(api.savedSearches.save, {
      userId: f.ids.tenant,
      name: "Outside area",
      emailAlerts: true,
      nearLatitude: 40,
      nearLongitude: -75,
      radiusMiles: 1,
    });
    await f.t.mutation(internal.searchAlerts.scanListing, {
      listingId: f.listing,
      cursor: null,
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("savedSearchDeliveries").collect()),
    ).toHaveLength(1);
  });
  it("throttles repeated lookups before provider calls and rejects unsafe response origins", async () => {
    const f = await setup();
    for (let i = 0; i < 20; i++)
      await f.owner.mutation(internal.geo.reserve, {});
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      f.owner.action(api.geo.searchPlaces, {
        text: "Synthetic workplace address",
        consent: true,
      }),
    ).rejects.toThrow("limit");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("invalidates later spatial cursors when an earlier reactive page changes and retains unchanged prefixes", () => {
    expect(
      retainedSpatialPages(["a", "b", "c"], ["changed", "b", "c"], 3),
    ).toBe(1);
    expect(
      retainedSpatialPages(["a", "b", "c"], ["a", "changed", "c"], 3),
    ).toBe(2);
    expect(retainedSpatialPages(["a"], ["a", "new"], 2)).toBe(2);
    expect(retainedSpatialPages(["a", "b"], ["a", "b"], 2)).toBe(2);
  });
  it("handles a radius across the date line and clamps public cell centers at valid map edges", async () => {
    expect(approximatePoint({ latitude: 85, longitude: 180 })).toEqual({
      latitude: 84.995,
      longitude: 179.995,
    });
    const f = await setup();
    await f.locate();
    await f.publish();
    const template = (await f.t.run((ctx) => ctx.db.get(f.listing)))!;
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.listing, { mapLatitude: 51, mapLongitude: 179.995 });
      await ctx.db.insert("listings", {
        ...(Object.fromEntries(
          Object.entries(template).filter(([k]) => !k.startsWith("_")),
        ) as any),
        title: "Synthetic date-line point",
        mapLatitude: 51,
        mapLongitude: -179.995,
      });
    });
    await f.t.mutation(internal.geo.reindex, { cursor: null });
    expect(
      await all(f.t, {
        nearLatitude: 51,
        nearLongitude: 179.999,
        radiusMiles: 5,
      }),
    ).toHaveLength(2);
  });
  it("retains location decisions privately and expires bounded request metadata after seven days", async () => {
    const f = await setup();
    await f.locate();
    await expect(
      f.owner.query(api.geo.history, { listingId: f.listing, paginationOpts }),
    ).rejects.toThrow("Staff");
    expect(
      (
        await f.staff.query(api.geo.history, {
          listingId: f.listing,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1);
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 205; i++)
        await ctx.db.insert("geoRequests", {
          userId: f.ids.owner,
          createdAt: now - 8 * 86400000,
        });
    });
    await f.t.mutation(internal.geo.cleanupRequests, {});
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(
      (await f.t.run((ctx) => ctx.db.query("geoRequests").collect())).every(
        (r) => r.createdAt >= now - 7 * 86400000,
      ),
    ).toBe(true);
  });
  it("rejects an old lookup even when the address changes away and back to the same text", async () => {
    const f = await setup(),
      first = await f.owner.mutation(internal.geo.begin, {
        listingId: f.listing,
      });
    await f.owner.mutation(api.listings.update, {
      id: f.listing,
      address: "102 Main St",
    });
    await f.owner.mutation(internal.geo.begin, { listingId: f.listing });
    await f.owner.mutation(api.listings.update, {
      id: f.listing,
      address: "100 Main St",
    });
    const current = await f.owner.mutation(internal.geo.begin, {
      listingId: f.listing,
    });
    expect(current.generation).toBeGreaterThan(first.generation);
    await f.t.mutation(internal.geo.finish, {
      listingId: f.listing,
      generation: first.generation,
      addressKey: first.addressKey,
      candidates: parseCensus(response()),
    });
    expect(
      await f.owner.query(api.geo.mine, { listingId: f.listing }),
    ).toMatchObject({
      status: "looking_up",
      generation: current.generation,
      candidates: [],
    });
  });
  it("requires refreshed provider permission if configuration changed after the consent screen loaded", async () => {
    const f = await setup();
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      f.owner.action(api.geo.lookupListing, {
        listingId: f.listing,
        consent: true,
        expectedProvider: "geoapify",
      }),
    ).rejects.toThrow("provider changed");
    await expect(
      f.t.action(api.geo.searchPlaces, {
        text: "Synthetic address",
        consent: true,
        expectedProvider: "geoapify",
      }),
    ).rejects.toThrow("provider changed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("applies exact and flexible stay availability inside the spatial result path", async () => {
    const f = await setup();
    await f.locate();
    await f.publish();
    const day = 86400000,
      filters = {
        nearLatitude: 30.265,
        nearLongitude: -97.745,
        radiusMiles: 1,
        moveIn: now + day,
        moveOut: now + 31 * day,
      };
    expect(await all(f.t, filters)).toHaveLength(1);
    await f.owner.mutation(api.availability.addBlock, {
      listingId: f.listing,
      startDate: now + day,
      endDate: now + 2 * day,
      type: "booked",
      note: "Synthetic external occupancy",
    });
    expect(await all(f.t, filters)).toHaveLength(0);
    const flexible = await all(f.t, { ...filters, flexibleDays: 7 });
    expect(flexible).toHaveLength(1);
    expect(flexible[0].matchedMoveIn).toBe(now + 2 * day);
  });
});
