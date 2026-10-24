import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FunctionReturnType } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  normalizeSearch,
  parseSearchParams,
  buildSearchUrl,
  availableSearchStay,
} from "../lib/search";
import { DAY } from "../lib/stays";
const modules = import.meta.glob("../convex/**/*.ts");
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  send.mockReset();
});
const start = Date.UTC(2027, 2, 1),
  end = start + 60 * DAY;
const paginationOpts = { cursor: null, numItems: 20 };
async function fixture(count = 1) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "tenant" | "landlord") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        createdAt: 0,
      });
    const owner = await make("owner", "landlord"),
      tenant = await make("tenant", "tenant"),
      other = await make("other", "tenant");
    const data = {
      landlordId: owner,
      title: "Austin work rental",
      description: "Synthetic rental",
      address: "PRIVATE_ADDRESS",
      city: "Austin",
      state: "Texas",
      zip: "78701",
      price: 1800,
      bedrooms: 2,
      bathrooms: 1.5,
      maxOccupancy: 3,
      propertyType: "Apartment",
      amenities: ["WiFi", "Step-free Entry", "Dedicated Workspace"],
      photos: [],
      petFriendly: true,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: start,
      minStay: 1,
      status: "active" as const,
      createdAt: 0,
      views: 0,
    };
    const listings = [];
    for (let i = 0; i < count; i++)
      listings.push(
        await ctx.db.insert("listings", {
          ...data,
          price: 1000 + i,
          createdAt: i,
          views: count - i,
        }),
      );
    return { owner, tenant, other, listings, data };
  });
  return {
    t,
    ids,
    owner: t.withIdentity({ subject: "owner" }),
    tenant: t.withIdentity({ subject: "tenant" }),
    other: t.withIdentity({ subject: "other" }),
  };
}
async function all(t: ReturnType<typeof convexTest>, filters = {}) {
  let cursor: string | null = null;
  const results = [];
  for (let i = 0; i < 100; i++) {
    const result: FunctionReturnType<typeof api.search.listings> =
      await t.query(api.search.listings, {
        ...filters,
        paginationOpts: { numItems: 24, cursor },
      });
    results.push(...result.page);
    if (result.isDone) return results;
    cursor = result.continueCursor;
  }
  throw new Error("Search failed to exhaust cursor pages.");
}
describe("search criteria and dates", () => {
  it("round-trips complete criteria and restores old budget/type links", () => {
    const filters = normalizeSearch({
      city: "Austin",
      state: "Texas",
      minPrice: 1000,
      maxPrice: 2500,
      bedrooms: 2,
      bathrooms: 1.5,
      occupants: 3,
      propertyTypes: ["House", "Apartment"],
      amenities: ["WiFi", "Step-free Entry"],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: false,
      moveIn: start,
      moveOut: end,
      flexibleDays: 14,
      sort: "price_asc",
    });
    const url = buildSearchUrl(filters);
    expect(
      parseSearchParams(new URL(url, "https://app.example.test").searchParams),
    ).toEqual(filters);
    expect(
      parseSearchParams(
        new URLSearchParams(
          "budget=2500&propertyType=Room&city=Austin&state=Texas",
        ),
      ),
    ).toMatchObject({ maxPrice: 2500, propertyTypes: ["Room"], state: "TX" });
    expect(
      parseSearchParams(
        new URLSearchParams("date=next-month&budget=any"),
        new Date("2027-01-17T12:00Z"),
      ),
    ).toMatchObject({
      moveIn: Date.UTC(2027, 1, 1),
      moveOut: Date.UTC(2027, 1, 1) + 30 * DAY,
    });
    expect(normalizeSearch({ location: "Austin, Texas" })).toMatchObject({
      city: "Austin",
      state: "TX",
    });
    expect(normalizeSearch({ location: "fs 123456" })).toMatchObject({
      propertyId: "FS-123456",
    });
  });
  it("rejects invalid calendars, ranges and unsafe numeric/filter inputs", () => {
    expect(() =>
      parseSearchParams(
        new URLSearchParams("moveIn=2027-02-30&moveOut=2027-04-30"),
      ),
    ).toThrow("valid calendar");
    expect(() =>
      parseSearchParams(new URLSearchParams("moveIn=2027-03-01")),
    ).toThrow("both stay dates");
    expect(() =>
      normalizeSearch({ moveIn: start, moveOut: start + 29 * DAY }),
    ).toThrow("30 days");
    expect(() => normalizeSearch({ minPrice: 3000, maxPrice: 2000 })).toThrow(
      "Minimum rent",
    );
    expect(() => normalizeSearch({ flexibleDays: 3 })).toThrow("flexibility");
    expect(() => normalizeSearch({ minPrice: NaN })).toThrow("valid price");
    expect(() => normalizeSearch({ moveIn: Date.UTC(10000, 0, 1), moveOut: Date.UTC(10000, 2, 1) })).toThrow("four-digit year");
    expect(() => normalizeSearch({ amenities: ["Invented amenity"] })).toThrow(
      "Unknown amenity",
    );
    expect(() => normalizeSearch({ propertyTypes: ["Invented type"] })).toThrow(
      "Unknown property",
    );
  });
  it("finds the nearest independently flexible dates without shortening below the minimum", () => {
    const listing = { availableFrom: start + 5 * DAY, minStay: 1 };
    const blocks = [{ startDate: start + 55 * DAY, endDate: end + 30 * DAY }];
    expect(
      availableSearchStay(listing, blocks, { moveIn: start, moveOut: end }),
    ).toBeNull();
    expect(
      availableSearchStay(listing, blocks, {
        moveIn: start,
        moveOut: end,
        flexibleDays: 7,
      }),
    ).toEqual({ moveIn: start + 5 * DAY, moveOut: start + 55 * DAY });
    expect(
      availableSearchStay({ ...listing, minStay: 2 }, blocks, {
        moveIn: start,
        moveOut: end,
        flexibleDays: 7,
      }),
    ).toBeNull();
    expect(
      availableSearchStay(
        { availableFrom: start, minStay: 1, calendarSyncThrough: end - DAY },
        [],
        { moveIn: start, moveOut: end },
      ),
    ).toBeNull();
    expect(
      availableSearchStay(
        { availableFrom: start, minStay: 1 },
        [{ startDate: end, endDate: end + DAY }],
        { moveIn: start, moveOut: end },
      ),
    ).toEqual({ moveIn: start, moveOut: end });
    expect(
      availableSearchStay({ availableFrom: start + DAY / 2, minStay: 1 }, [], {
        moveIn: start,
        moveOut: end,
        flexibleDays: 7,
      }),
    ).toEqual({ moveIn: start + DAY, moveOut: end });
  });
});
describe("paged marketplace search and IDs", () => {
  it("searches beyond 500 listings in global sort order with honest cursor continuation", async () => {
    const { t, ids } = await fixture(615);
    const ascending = await all(t, {
      city: "austin",
      state: "TX",
      sort: "price_asc",
    });
    expect(ascending).toHaveLength(615);
    expect(ascending[0].price).toBe(1000);
    expect(ascending.at(-1)?.price).toBe(1614);
    expect(new Set(ascending.map((l) => l._id)).size).toBe(615);
    expect(JSON.stringify(ascending)).not.toContain("PRIVATE_ADDRESS");
    const descending = await all(t, {
      city: "Austin",
      sort: "price_desc",
      minPrice: 1600,
    });
    expect(descending.map((l) => l.price)).toEqual(
      Array.from({ length: 15 }, (_, i) => 1614 - i),
    );
    const narrow = await all(t, { maxPrice: 1010, minPrice: 1005 });
    expect(narrow.map((l) => l.price)).toHaveLength(6);
    expect((await all(t, { sort: "most_viewed" }))[0]._id).toBe(
      ids.listings[0],
    );
  });
  it("backfills existing IDs/normalized fields in bounded pages and keeps lookups safe", async () => {
    const { t, ids, owner } = await fixture(85);
    await t.mutation(internal.migrations.searchIndexV1, {});
    expect(await all(t, { city: "Austin", state: "TX" })).toHaveLength(85);
    for (let i = 0; i < 2; i++)
      await t.mutation(internal.migrations.searchIndexV1, {});
    const records = await t.run((ctx) => ctx.db.query("listings").collect());
    expect(
      records.every(
        (l) =>
          l.publicId?.startsWith("FS-") &&
          l.searchCity === "austin" &&
          l.searchState === "TX",
      ),
    ).toBe(true);
    expect(new Set(records.map((l) => l.publicId)).size).toBe(85);
    expect(await all(t, { city: "AUSTIN", state: "Texas" })).toHaveLength(85);
    expect((await all(t, { propertyId: records[40].publicId }))[0]._id).toBe(
      records[40]._id,
    );
    expect((await all(t, { location: records[40]._id }))[0]._id).toBe(
      records[40]._id,
    );
    await t.run((ctx) => ctx.db.patch(records[40]._id, { status: "inactive" }));
    expect(await all(t, { propertyId: records[40].publicId })).toEqual([]);
    await owner.mutation(api.listings.update, {
      id: ids.listings[0],
      city: "  Round Rock ",
      state: "TX",
    });
    expect(await all(t, { city: "Round Rock", state: "Texas" })).toHaveLength(
      1,
    );
    await t.mutation(internal.migrations.searchIndexV1, {});
    expect((await t.run((ctx) => ctx.db.get(records[10]._id)))?.publicId).toBe(
      records[10].publicId,
    );
  });
  it("allocates distinct public IDs under concurrent listing creation and skips existing IDs", async () => {
    const { t, owner, ids } = await fixture();
    await t.run((ctx) =>
      ctx.db.patch(ids.listings[0], { publicId: "FS-100001" }),
    );
    const { status, createdAt, views, ...data } = ids.data;
    const created = await Promise.all(
      [1, 2, 3].map((n) =>
        owner.mutation(api.listings.create, {
          ...data,
          title: `Concurrent listing ${n}`,
        }),
      ),
    );
    const rows = await t.run(async (ctx) =>
      Promise.all(created.map((id) => ctx.db.get(id))),
    );
    expect(new Set(rows.map((l) => l?.publicId)).size).toBe(3);
    expect(rows.every((l) => l?.publicId && l.publicId !== "FS-100001")).toBe(
      true,
    );
  });
  it("filters all required features and returns the actual available stay", async () => {
    const { t, ids } = await fixture();
    const id = ids.listings[0];
    await t.run((ctx) =>
      ctx.db.patch(id, {
        availableFrom: start + 5 * DAY,
        publicId: "FS-999999",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("availabilityBlocks", {
        listingId: id,
        startDate: start + 55 * DAY,
        endDate: end + DAY,
        type: "booked",
        note: "PRIVATE_NOTE",
        createdAt: 0,
      }),
    );
    const filters = {
      location: "Austin, Texas",
      minPrice: 900,
      maxPrice: 2000,
      bathrooms: 1.5,
      occupants: 3,
      propertyTypes: ["House", "Apartment"],
      amenities: ["WiFi", "Step-free Entry"],
      utilitiesIncluded: true,
      parkingIncluded: true,
      petFriendly: true,
      moveIn: start,
      moveOut: end,
      flexibleDays: 7,
    };
    expect(await all(t, { ...filters, flexibleDays: 0 })).toEqual([]);
    expect((await all(t, filters))[0]).toMatchObject({
      _id: id,
      matchedMoveIn: start + 5 * DAY,
      matchedMoveOut: start + 55 * DAY,
    });
    for (const extra of [
      { amenities: ["Accessible Bathroom"] },
      { occupants: 4 },
      { propertyTypes: ["Room"] },
      { petFriendly: false },
      { parkingIncluded: false },
      { maxPrice: 950 },
    ])
      expect(await all(t, { ...filters, ...extra })).toEqual([]);
    expect(await all(t, { propertyId: "FS-999999" })).toHaveLength(1);
    await t.run((ctx) => ctx.db.patch(id, { moderationHold: true }));
    expect(await all(t, { propertyId: "FS-999999" })).toEqual([]);
  });
});
describe("private saved searches and alerts", () => {
  it("revalidates opt-in, publication and blocks before delivering a queued alert", async () => {
    const { t, ids, tenant, owner } = await fixture(3);
    const searchId = await tenant.mutation(api.savedSearches.save, {
      userId: ids.tenant,
      name: "Live eligibility",
      city: "Austin",
      emailAlerts: true,
    });
    const deliveryFor = async (listingId: (typeof ids.listings)[number]) => {
      await t.mutation(internal.searchAlerts.scanListing, {
        listingId,
        cursor: null,
      });
      return (await t.run((ctx) =>
        ctx.db
          .query("savedSearchDeliveries")
          .withIndex("by_search_listing", (q) =>
            q.eq("searchId", searchId).eq("listingId", listingId),
          )
          .unique(),
      ))!;
    };
    const first = await deliveryFor(ids.listings[0]);
    await tenant.mutation(api.savedSearches.toggleEmailAlerts, {
      id: searchId,
      enabled: false,
    });
    await t.action(internal.searchAlertEmails.deliver, {
      deliveryId: first._id,
    });
    expect((await t.run((ctx) => ctx.db.get(first._id)))?.status).toBe(
      "suppressed",
    );
    await tenant.mutation(api.savedSearches.toggleEmailAlerts, {
      id: searchId,
      enabled: true,
    });
    const second = await deliveryFor(ids.listings[1]);
    await owner.mutation(api.listings.unpublish, { id: ids.listings[1] });
    await t.action(internal.searchAlertEmails.deliver, {
      deliveryId: second._id,
    });
    expect((await t.run((ctx) => ctx.db.get(second._id)))?.status).toBe(
      "suppressed",
    );
    const third = await deliveryFor(ids.listings[2]);
    await tenant.mutation(api.messages.sendMessage, {
      senderId: ids.tenant,
      receiverId: ids.owner,
      listingId: ids.listings[2],
      content: "Synthetic contact",
    });
    const conv = (
      await tenant.query(api.messages.getConversations, { userId: ids.tenant })
    )[0];
    await tenant.mutation(api.messages.setBlocked, {
      conversationId: conv._id,
      blocked: true,
    });
    await t.action(internal.searchAlertEmails.deliver, {
      deliveryId: third._id,
    });
    expect((await t.run((ctx) => ctx.db.get(third._id)))?.status).toBe(
      "suppressed",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("persists and reopens every filter while enforcing saved-search ownership", async () => {
    const { t, tenant, other, ids } = await fixture();
    const filters = {
      location: "Austin",
      minPrice: 500,
      maxPrice: 2000,
      bathrooms: 1.5,
      occupants: 2,
      propertyTypes: ["Apartment", "Room"],
      amenities: ["WiFi"],
      parkingIncluded: true,
      moveIn: start,
      moveOut: end,
      flexibleDays: 14,
      sort: "price_desc" as const,
    };
    const id = await tenant.mutation(api.savedSearches.save, {
      ...filters,
      userId: ids.tenant,
      name: "Complete criteria",
      emailAlerts: true,
    });
    const saved = (
      await tenant.query(api.savedSearches.mine, { paginationOpts })
    ).page[0];
    expect(saved).toMatchObject(filters);
    expect(
      parseSearchParams(
        new URL(buildSearchUrl(saved), "https://app.example.test").searchParams,
      ),
    ).toEqual(normalizeSearch(filters));
    expect(
      await t.query(api.savedSearches.getByUser, { userId: ids.tenant }),
    ).toEqual([]);
    expect(
      await other.query(api.savedSearches.getByUser, { userId: ids.tenant }),
    ).toEqual([]);
    await expect(
      other.mutation(api.savedSearches.remove, { id }),
    ).rejects.toThrow("not found");
    await expect(
      other.mutation(api.savedSearches.replaceFilters, { id, filters: {} }),
    ).rejects.toThrow("not found");
    await tenant.mutation(api.savedSearches.replaceFilters, {
      id,
      filters: { propertyType: "Room" },
    });
    const updated = (
      await tenant.query(api.savedSearches.mine, { paginationOpts })
    ).page[0];
    expect(updated.propertyTypes).toEqual(["Room"]);
    expect(updated.moveIn).toBeUndefined();
    expect(updated.location).toBeUndefined();
  });
  it("pages saved search matching beyond one job and deduplicates repeat publication", async () => {
    const { t, ids } = await fixture();
    await t.run(async (ctx) => {
      for (let i = 0; i < 61; i++)
        await ctx.db.insert("savedSearches", {
          userId: ids.tenant,
          name: `Saved ${i}`,
          city: i === 60 ? "Austin" : "Seattle",
          amenities: ["WiFi"],
          emailAlerts: true,
          createdAt: i,
        });
    });
    let cursor: string | null = null;
    // Execute the same bounded pages the scheduled chain uses.
    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.searchAlerts.scanListing, {
        listingId: ids.listings[0],
        cursor,
      });
      const page = await t.run((ctx) =>
        ctx.db
          .query("savedSearches")
          .withIndex("by_email_alerts", (q) => q.eq("emailAlerts", true))
          .paginate({ cursor, numItems: 25 }),
      );
      cursor = page.continueCursor;
    }
    expect(
      await t.run((ctx) => ctx.db.query("savedSearchDeliveries").collect()),
    ).toHaveLength(1);
    await t.mutation(internal.searchAlerts.scanListing, {
      listingId: ids.listings[0],
      cursor: null,
    });
    expect(
      await t.run((ctx) => ctx.db.query("savedSearchDeliveries").collect()),
    ).toHaveLength(1);
  });
  it("matches alerts against dates, full filters and live opt-in, preserving provider failures", async () => {
    const { t, tenant, other, ids } = await fixture();
    const id = ids.listings[0];
    const searchId = await tenant.mutation(api.savedSearches.save, {
      userId: ids.tenant,
      name: "Work stay",
      location: "Austin",
      maxPrice: 2000,
      amenities: ["WiFi", "Step-free Entry"],
      parkingIncluded: true,
      moveIn: start,
      moveOut: end,
      emailAlerts: true,
    });
    await t.run((ctx) =>
      ctx.db.insert("availabilityBlocks", {
        listingId: id,
        startDate: start + DAY,
        endDate: start + 2 * DAY,
        type: "unavailable",
        createdAt: 0,
      }),
    );
    await t.mutation(internal.searchAlerts.scanListing, {
      listingId: id,
      cursor: null,
    });
    expect(
      await t.run((ctx) => ctx.db.query("savedSearchDeliveries").collect()),
    ).toEqual([]);
    await t.run(async (ctx) => {
      for (const b of await ctx.db.query("availabilityBlocks").collect())
        await ctx.db.delete(b._id);
    });
    await t.mutation(internal.searchAlerts.scanListing, {
      listingId: id,
      cursor: null,
    });
    const delivery = (
      await t.run((ctx) => ctx.db.query("savedSearchDeliveries").collect())
    )[0];
    vi.stubEnv("RESEND_API_KEY", "");
    await t.action(internal.searchAlertEmails.deliver, {
      deliveryId: delivery._id,
    });
    expect((await t.run((ctx) => ctx.db.get(delivery._id)))?.status).toBe(
      "unconfigured",
    );
    await expect(
      other.mutation(api.searchAlerts.retry, { deliveryId: delivery._id }),
    ).rejects.toThrow("not found");
    vi.setSystemTime(Date.now() + 61_000);
    vi.stubEnv("RESEND_API_KEY", "synthetic");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    await tenant.mutation(api.searchAlerts.retry, { deliveryId: delivery._id });
    send.mockResolvedValue({ data: null, error: { message: "Rejected" } });
    await t.action(internal.searchAlertEmails.deliver, {
      deliveryId: delivery._id,
    });
    expect((await t.run((ctx) => ctx.db.get(delivery._id)))?.status).toBe(
      "failed",
    );
    vi.setSystemTime(Date.now() + 61_000);
    await tenant.mutation(api.searchAlerts.retry, { deliveryId: delivery._id });
    send.mockResolvedValue({ data: { id: "accepted" }, error: null });
    await t.action(internal.searchAlertEmails.deliver, {
      deliveryId: delivery._id,
    });
    expect((await t.run((ctx) => ctx.db.get(delivery._id)))?.status).toBe(
      "sent",
    );
    expect(send.mock.calls.at(-1)?.[1].idempotencyKey).toBe(
      `saved-search-${delivery._id}`,
    );
    expect(send.mock.calls.at(-1)?.[0].text).toContain("moveIn=2027-03-01");
    await tenant.mutation(api.savedSearches.toggleEmailAlerts, {
      id: searchId,
      enabled: false,
    });
    expect(
      (await tenant.query(api.savedSearches.mine, { paginationOpts })).page[0]
        .emailAlerts,
    ).toBe(false);
  });
});
