import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
import { demandShape, marketScope, MARKET_DAY } from "../lib/market-insights";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 25);
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const shape = () =>
  demandShape(
    {
      city: "Austin",
      state: "TX",
      maxPrice: 1900,
      bedrooms: 1,
      amenities: ["WiFi"],
      petFriendly: true,
    },
    now,
  );
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("CREEM_API_KEY", "creem_test_market_synthetic");
  vi.stubEnv("RESEND_API_KEY", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture(count = 1) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkId: "owner",
      name: "Owner",
      email: "private-owner@example.test",
      role: "landlord",
      createdAt: now,
    });
    const other = await ctx.db.insert("users", {
      clerkId: "other",
      name: "Other",
      email: "other@example.test",
      role: "landlord",
      createdAt: now,
    });
    const staff = await ctx.db.insert("users", {
      clerkId: "staff",
      name: "Staff",
      email: "staff@example.test",
      role: "admin",
      createdAt: now,
    });
    const listings = [];
    for (let i = 0; i < count; i++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: `Synthetic ${i}`,
          description: "Fixture",
          address: "Private street",
          city: "Austin",
          state: "TX",
          zip: "78701",
          price: 1900.55,
          bedrooms: 1,
          bathrooms: 1,
          propertyType: "Apartment",
          amenities: ["WiFi", "WiFi", "Parking"],
          photos: [],
          petFriendly: true,
          utilitiesIncluded: true,
          parkingIncluded: true,
          availableFrom: now,
          minStay: 1,
          status: "active",
          createdAt: now,
          views: 123,
        }),
      );
    return { owner, other, staff, listings };
  });
  await seedPublishedFixtures(t);
  const owner = t.withIdentity({ subject: "owner" }),
    other = t.withIdentity({ subject: "other" }),
    staff = t.withIdentity({ subject: "staff" });
  const build = async () => {
    await t.mutation(internal.marketSupply.refresh, {});
    const state = (await t.run((ctx) =>
      ctx.db
        .query("marketState")
        .withIndex("by_key", (q) => q.eq("key", "market-v1:test"))
        .unique(),
    ))!;
    for (let n = 0; n < 100; n++) {
      const run = (await t.run((ctx) => ctx.db.get(state.buildingSupplyId!)))!;
      if (run.state !== "building") return run;
      await t.mutation(internal.marketSupply.scan, {
        runId: run._id,
        cursor: run.cursor,
      });
    }
    throw new Error("Snapshot did not finish");
  };
  return { t, ids, owner, other, staff, build };
}
it("keeps market projections coarse and excludes query text, IDs, exact places and stay dates", () => {
  const projected = demandShape(
    {
      ...shape(),
      city: "Austin",
      state: "Texas",
      location: "Private employer",
      nearLabel: "PRIVATE WORKPLACE",
      nearLatitude: 30.1,
      nearLongitude: -97.2,
      radiusMiles: 10,
      propertyId: "PRIVATE_ID",
      bedrooms: 2,
      maxPrice: 2500,
      moveIn: now + 45 * MARKET_DAY,
      moveOut: now + 120 * MARKET_DAY,
    } as Parameters<typeof demandShape>[0],
    now,
  );
  expect(projected).toMatchObject({
    city: "Austin",
    state: "TX",
    budget: "$2,000–2,999",
    lead: "30–89 days",
    duration: "61–90 days",
  });
  for (const value of ["PRIVATE", "nearLatitude", "moveIn", "propertyId"])
    expect(JSON.stringify(projected)).not.toContain(value);
  expect(marketScope(" Springfield ", "Illinois")).toBe("IL|springfield");
  expect(marketScope("Springfield", "MO")).not.toBe(
    marketScope("Springfield", "IL"),
  );
  expect(() => marketScope("Austin")).toThrow();
});
it("publishes only a complete eligible inventory snapshot across every bounded scan page", async () => {
  const f = await fixture(67);
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.ids.listings[0], {
      publicationRequested: false,
      price: 99999,
    });
    await ctx.db.patch(f.ids.listings[1], {
      moderationHold: true,
      price: 88888,
    });
    await ctx.db.patch(f.ids.listings[2], {
      approvedRevision: 0,
      price: 77777,
    });
    await ctx.db.patch(f.ids.listings[3], {
      city: "Springfield",
      state: "IL",
      price: 1500.25,
    });
    await ctx.db.patch(f.ids.listings[4], {
      city: "Springfield",
      state: "MO",
      price: 1600.75,
    });
  });
  expect((await f.t.query(api.marketInsights.overview, {})).supply).toBeNull();
  await f.t.mutation(internal.marketSupply.refresh, {});
  const state = (await f.t.run((ctx) => ctx.db.query("marketState").first()))!;
  await f.t.mutation(internal.marketSupply.scan, {
    runId: state.buildingSupplyId!,
    cursor: null,
  });
  expect((await f.t.query(api.marketInsights.overview, {})).supply).toBeNull();
  // Duplicate continuations cannot add the same page again.
  await f.t.mutation(internal.marketSupply.scan, {
    runId: state.buildingSupplyId!,
    cursor: null,
  });
  await f.build();
  const data = await f.t.query(api.marketInsights.overview, {});
  expect(data.supply).toMatchObject({ listings: 64, owners: 1, cities: 3 });
  expect(data.supply?.buckets.find((x) => x.key === "WiFi")?.count).toBe(64);
  expect(
    (
      await f.t.query(api.marketInsights.overview, {
        city: "Springfield",
        state: "IL",
      })
    ).supply,
  ).toMatchObject({ listings: 1, avgCents: 150025 });
  expect(
    (
      await f.t.query(api.marketInsights.overview, {
        city: "Springfield",
        state: "MO",
      })
    ).supply,
  ).toMatchObject({ listings: 1, avgCents: 160075 });
  expect(
    (await f.t.query(api.analytics.getPricesByCity, {})).every(
      (x) => x.avgPrice < 2000,
    ),
  ).toBe(true);
  expect(JSON.stringify(data)).not.toContain("Private street");
});
it("retains the previous completed snapshot while rebuilding and fences superseded collectors", async () => {
  const f = await fixture(2);
  const old = await f.build();
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.listings[0], { publicationRequested: false }),
  );
  await f.t.mutation(internal.marketSupply.refresh, {});
  expect(
    (await f.t.query(api.marketInsights.overview, {})).supply?.listings,
  ).toBe(2);
  const state = (await f.t.run((ctx) => ctx.db.query("marketState").first()))!;
  vi.setSystemTime(now + 1800001);
  await f.t.mutation(internal.marketSupply.refresh, {});
  await f.t.mutation(internal.marketSupply.scan, {
    runId: state.buildingSupplyId!,
    cursor: null,
  });
  expect(
    (await f.t.run((ctx) => ctx.db.get(state.buildingSupplyId!)))?.state,
  ).toBe("failed");
  await f.build();
  expect(
    (await f.t.query(api.marketInsights.overview, {})).supply?.listings,
  ).toBe(1);
  await f.t.mutation(internal.marketSupply.scan, {
    runId: old._id,
    cursor: null,
  });
  expect(
    (await f.t.query(api.marketInsights.overview, {})).supply?.listings,
  ).toBe(1);
});
it("deduplicates coarse searches, suppresses sparse cohorts and exposes only aggregate buckets", async () => {
  const f = await fixture();
  for (let n = 1; n <= 9; n++)
    expect(
      await f.t.mutation(api.marketInsights.recordSearch, {
        clientId: uuid(n),
        shape: shape(),
      }),
    ).toBe(true);
  const before = await f.t.query(api.marketInsights.overview, {
    city: "Austin",
    state: "TX",
  });
  expect(before.demand[0]).toEqual({
    kind: "search",
    visible: false,
    count: null,
    buckets: [],
  });
  expect(
    await f.t.mutation(api.marketInsights.recordSearch, {
      clientId: uuid(1),
      shape: { ...shape(), city: " AUSTIN ", state: "Texas" },
    }),
  ).toBe(false);
  await f.t.mutation(api.marketInsights.recordSearch, {
    clientId: uuid(10),
    shape: shape(),
  });
  const after = await f.t.query(api.marketInsights.overview, {
    city: "austin",
    state: "TX",
  });
  expect(after.demand[0]).toMatchObject({ visible: true, count: 10 });
  expect(
    after.demand[0].buckets.find((x) => x.dimension === "budget")?.count,
  ).toBe(10);
  expect(
    (await f.t.query(api.marketInsights.overview, {})).demand[0].count,
  ).toBe(10);
  expect(
    (
      await f.t.query(api.marketInsights.overview, {
        city: "Austin",
        state: "MN",
      })
    ).demand[0].visible,
  ).toBe(false);
  const stored = JSON.stringify(
    await f.t.run((ctx) => ctx.db.query("marketContributors").collect()),
  );
  expect(stored).not.toContain(uuid(1));
  expect(JSON.stringify(after)).not.toContain("actor");
});
it("caps a page-session at twenty coarse searches per day and rejects arbitrary category payloads", async () => {
  const f = await fixture();
  let accepted = 0;
  const names = ["WiFi", "Parking", "Washer/Dryer", "Kitchen", "Gym"];
  for (let n = 0; n < 25; n++)
    accepted += Number(
      await f.t.mutation(api.marketInsights.recordSearch, {
        clientId: uuid(1),
        shape: {
          ...shape(),
          amenities: names.filter((_, bit) => n & (1 << bit)),
        },
      }),
    );
  expect(accepted).toBe(20);
  expect(
    (await f.t.query(api.marketInsights.overview, {})).demand[0].visible,
  ).toBe(false);
  await expect(
    f.t.mutation(api.marketInsights.recordSearch, {
      clientId: uuid(2),
      shape: { ...shape(), budget: "private arbitrary text" },
    }),
  ).rejects.toThrow("Invalid market");
  await expect(
    f.t.mutation(api.marketInsights.recordSearch, {
      clientId: "not-a-reference",
      shape: shape(),
    }),
  ).rejects.toThrow();
});
it("isolates test and production data and excludes expired reporting windows", async () => {
  const f = await fixture();
  await f.build();
  for (let n = 1; n <= 10; n++)
    await f.t.mutation(api.marketInsights.recordSearch, {
      clientId: uuid(n),
      shape: shape(),
    });
  vi.stubEnv("CREEM_API_KEY", "creem_live_synthetic_not_used_for_requests");
  const production = await f.t.query(api.marketInsights.overview, {});
  expect(production.mode).toBe("prod");
  expect(production.supply).toBeNull();
  expect(production.demand[0].visible).toBe(false);
  expect(
    await f.t.mutation(api.marketInsights.recordSearch, {
      clientId: uuid(1),
      shape: shape(),
    }),
  ).toBe(true);
  vi.stubEnv("CREEM_API_KEY", "creem_test_market_synthetic");
  vi.setSystemTime(now + 31 * MARKET_DAY);
  expect(
    (await f.t.query(api.marketInsights.overview, {})).demand[0].visible,
  ).toBe(false);
  vi.setSystemTime(now + 46 * MARKET_DAY);
  await f.t.mutation(internal.marketInsights.cleanup, {});
  expect(
    await f.t.run((ctx) => ctx.db.query("marketDemandDays").collect()),
  ).toEqual([]);
});
it("requires the owner or staff for every private statistics endpoint", async () => {
  const f = await fixture();
  for (const endpoint of [
    api.analytics.getListingStats,
    api.analytics.getListingPerformance,
  ]) {
    await expect(
      f.t.query(endpoint, { landlordId: f.ids.owner }),
    ).rejects.toThrow("sign in");
    await expect(
      f.other.query(endpoint, { landlordId: f.ids.owner }),
    ).rejects.toThrow("Not authorized");
    expect(
      await f.owner.query(endpoint, { landlordId: f.ids.owner }),
    ).toBeTruthy();
    expect(
      await f.staff.query(endpoint, { landlordId: f.ids.owner }),
    ).toBeTruthy();
  }
  expect(
    await f.owner.query(api.analytics.getListingStats, {
      landlordId: f.ids.owner,
    }),
  ).toMatchObject({ totalViews: 123, totalListings: 1, savedCount: 0 });
});
it("counts native accepted inquiry writes and only the first traveler conversation, without retry inflation", async () => {
  const f = await fixture();
  const moveIn = now + 60 * MARKET_DAY;
  for (let n = 1; n <= 10; n++) {
    const subject = `tenant-${n}`;
    const tenantId = await f.t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: subject,
        name: subject,
        email: "private@example.test",
        role: "tenant",
        createdAt: now,
      }),
    );
    const tenant = f.t.withIdentity({ subject });
    const inquiry = {
      listingId: f.ids.listings[0],
      moveIn,
      moveOut: moveIn + 45 * MARKET_DAY,
      occupants: 1,
      pets: false,
      message: "Private inquiry content",
    };
    await tenant.mutation(api.inquiries.create, inquiry);
    await expect(
      tenant.mutation(api.inquiries.create, inquiry),
    ).rejects.toThrow("already sent");
    await tenant.mutation(api.messages.sendMessage, {
      senderId: tenantId,
      receiverId: f.ids.owner,
      listingId: f.ids.listings[0],
      content: "Existing conversation reply",
    });
  }
  const report = await f.t.query(api.marketInsights.overview, {
    city: "Austin",
    state: "TX",
  });
  expect(report.demand.find((x) => x.kind === "inquiry")).toMatchObject({
    visible: true,
    count: 10,
  });
  expect(report.demand.find((x) => x.kind === "conversation")).toMatchObject({
    visible: true,
    count: 10,
  });
  expect(JSON.stringify(report)).not.toContain("Private inquiry content");
});
it("does not require billing configuration to record native housing demand and keeps it sparse", async () => {
  const f = await fixture();
  vi.stubEnv("CREEM_API_KEY", "");
  const id = await f.owner.mutation(api.housingRequests.create, {
    userId: f.ids.owner,
    city: "Austin",
    state: "TX",
    moveInDate: now + 60 * MARKET_DAY,
    duration: 2,
    maxBudget: 1800,
    bedrooms: 1,
    petFriendly: false,
    description: "Synthetic private housing request",
  });
  expect(id).toBeTruthy();
  const report = await f.t.query(api.marketInsights.overview, {});
  expect(report.mode).toBe("test");
  expect(report.demand.find((x) => x.kind === "housing_request")?.visible).toBe(
    false,
  );
  const days = await f.t.run((ctx) =>
    ctx.db.query("marketDemandDays").collect(),
  );
  expect(
    days.find((x) => x.kind === "housing_request" && x.scope === "test|all")
      ?.count,
  ).toBe(1);
});
it("cleans retired snapshots without deleting either environment's current snapshot", async () => {
  const f = await fixture();
  const old = await f.build();
  vi.setSystemTime(now + MARKET_DAY);
  const latest = await f.build();
  vi.setSystemTime(now + 9 * MARKET_DAY);
  await f.t.mutation(internal.marketSupply.cleanup, {});
  expect(await f.t.run((ctx) => ctx.db.get(old._id))).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.get(latest._id))).not.toBeNull();
  expect(
    (await f.t.query(api.marketInsights.overview, {})).supply?.listings,
  ).toBe(1);
});
