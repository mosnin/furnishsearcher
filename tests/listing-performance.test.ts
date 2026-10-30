import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import geospatial from "./helpers/geospatial";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
import {
  performanceSeries,
  performanceReportSeries,
  reportRefreshDelay,
  performanceCsv,
  PERFORMANCE_DAY as DAY,
} from "../lib/listing-performance";
import {
  eligibilityReportSeries,
  eligibilityCsv,
} from "../lib/map-eligibility";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 25, 12),
  clientId = "00000000-0000-4000-8000-000000000001";
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
async function fixture() {
  const t = convexTest(schema, modules);
  await geospatial.register(t);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkId: "owner",
      role: "landlord",
      name: "Owner",
      email: "owner@example.test",
      createdAt: now,
    });
    const other = await ctx.db.insert("users", {
      clerkId: "other",
      role: "landlord",
      name: "Other",
      email: "other@example.test",
      createdAt: now,
    });
    const tenant = await ctx.db.insert("users", {
      clerkId: "tenant",
      role: "tenant",
      name: "Tenant",
      email: "tenant@example.test",
      createdAt: now,
    });
    const staff = await ctx.db.insert("users", {
      clerkId: "staff",
      role: "admin",
      name: "Staff",
      email: "staff@example.test",
      createdAt: now,
    });
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Synthetic rental",
      description: "QA only",
      address: "Private street",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 1900.55,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: true,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: now - 30 * DAY,
      minStay: 1,
      status: "active",
      createdAt: now - 100 * DAY,
      views: 123,
      mapLatitude: 30.267,
      mapLongitude: -97.743,
    });
    return { owner, other, tenant, staff, listing };
  });
  await seedPublishedFixtures(t);
  const owner = t.withIdentity({ subject: "owner" }),
    other = t.withIdentity({ subject: "other" }),
    tenant = t.withIdentity({ subject: "tenant" }),
    staff = t.withIdentity({ subject: "staff" });
  const observe = (
    kind: "impressions" | "views" | "shares",
    client: ReturnType<typeof t.withIdentity> = t,
    reference = clientId,
  ) =>
    client.mutation(api.listingPerformance.observe, {
      listingIds: [ids.listing],
      kind,
      clientId: reference,
    });
  const report = (client = owner, days = 90) =>
    client.query(api.listingPerformance.report, {
      listingId: ids.listing,
      days,
    });
  return { t, ids, owner, other, tenant, staff, observe, report };
}
it("records browser events once per UTC day and keeps legacy history separate", async () => {
  const f = await fixture();
  await f.observe("impressions");
  await f.observe("views");
  await f.observe("shares");
  await f.observe("views");
  let report = await f.report();
  expect(report.legacyViews).toBe(124);
  expect(report.startedAt).toBeGreaterThanOrEqual(now);
  expect(report.startedAt).toBeLessThan(now + 1000);
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0]).toMatchObject({ impressions: 1, views: 1, shares: 1 });
  vi.setSystemTime(now + DAY);
  await f.observe("views");
  report = await f.report();
  expect(report.rows).toHaveLength(2);
  expect(report.legacyViews).toBe(125);
  const series = performanceSeries(report.rows, 90, report.startedAt);
  expect(series.filter((row) => row.recorded)).toHaveLength(2);
  expect(series[0].recorded).toBe(false);
  const csv = performanceCsv(series, "test");
  expect(csv).toContain("Environment");
  const unavailable = csv.split("\r\n")[1].split(",");
  expect(unavailable.slice(1, 5)).toEqual([
    "test",
    "unavailable",
    "unavailable",
    "unavailable",
  ]);
  expect(unavailable.slice(5).every((value) => value === "")).toBe(true);
});
it("excludes owners and staff, rejects malformed/bulk observations, and prevents legacy inflation", async () => {
  const f = await fixture();
  await f.observe("views", f.owner);
  await f.observe("views", f.staff);
  await f.t.mutation(api.listings.incrementViews, { id: f.ids.listing });
  expect((await f.report()).rows).toEqual([]);
  expect((await f.report()).legacyViews).toBe(123);
  await expect(
    f.t.mutation(api.listingPerformance.observe, {
      listingIds: Array(25).fill(f.ids.listing),
      kind: "views",
      clientId,
    }),
  ).rejects.toThrow("Invalid");
  await expect(
    f.t.mutation(api.listingPerformance.observe, {
      listingIds: [f.ids.listing],
      kind: "views",
      clientId: "untrusted-reference",
    }),
  ).rejects.toThrow("Invalid");
});
it("rechecks publication and native signed actors despite page-reference rotation", async () => {
  const f = await fixture();
  await f.observe("views", f.tenant);
  await f.observe("views", f.tenant, "00000000-0000-4000-8000-000000000002");
  expect((await f.report()).rows[0].views).toBe(1);
  await f.t.run((ctx) => ctx.db.patch(f.ids.listing, { moderationHold: true }));
  await f.observe("shares", f.tenant);
  expect((await f.report()).rows[0].shares).toBe(0);
});
it("protects all reports and paginates every owned property/unit", async () => {
  const f = await fixture();
  await expect(f.report(f.t)).rejects.toThrow("sign in");
  await expect(f.report(f.other)).rejects.toThrow("Not authorized");
  expect(await f.report(f.staff)).toBeTruthy();
  await expect(f.report(f.owner, 91)).rejects.toThrow("7, 30 or 90");
  await f.t.run(async (ctx) => {
    const original = (await ctx.db.get(f.ids.listing))!;
    const { _id, _creationTime, ...copy } = original;
    for (let n = 0; n < 34; n++)
      await ctx.db.insert("listings", {
        ...copy,
        title: `Synthetic unit ${n}`,
        status: "inactive",
      });
  });
  const first = await f.owner.query(api.listingPerformance.properties, {
    paginationOpts: { cursor: null, numItems: 30 },
  });
  expect(first.page).toHaveLength(30);
  expect(first.isDone).toBe(false);
  const next = await f.owner.query(api.listingPerformance.properties, {
    paginationOpts: { cursor: first.continueCursor, numItems: 30 },
  });
  expect(next.page).toHaveLength(5);
  expect(new Set([...first.page, ...next.page].map((r) => r.id)).size).toBe(35);
  expect(
    (
      await f.other.query(api.listingPerformance.properties, {
        paginationOpts: { cursor: null, numItems: 30 },
      })
    ).page,
  ).toEqual([]);
});
it("partitions test/prod and ownership history, and cleans only outside the ninety-day window", async () => {
  const f = await fixture();
  await f.observe("views");
  vi.stubEnv("CREEM_API_KEY", "creem_live_synthetic");
  expect((await f.report()).rows).toEqual([]);
  vi.stubEnv("CREEM_API_KEY", "creem_test_publication_fixture");
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.listing, { landlordId: f.ids.other }),
  );
  await expect(f.report()).rejects.toThrow("Not authorized");
  expect((await f.report(f.other)).rows).toEqual([]);
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.listing, { landlordId: f.ids.owner }),
  );
  vi.setSystemTime(now + 89 * DAY);
  expect((await f.report()).rows).toHaveLength(1);
  vi.setSystemTime(now + 90 * DAY);
  await f.t.mutation(internal.listingPerformance.cleanup, {});
  expect((await f.report()).rows).toEqual([]);
  expect(
    await f.t.run((ctx) => ctx.db.query("listingObservationLimits").collect()),
  ).toEqual([]);
});
it("counts saves and removals atomically without retries or self-save inflation", async () => {
  const f = await fixture(),
    args = { tenantId: f.ids.tenant, listingId: f.ids.listing };
  await f.tenant.mutation(api.saved.save, args);
  await f.tenant.mutation(api.saved.save, args);
  await f.tenant.mutation(api.saved.unsave, args);
  await f.tenant.mutation(api.saved.unsave, args);
  expect((await f.report()).rows[0]).toMatchObject({ saves: 1, unsaves: 1 });
  await f.owner.mutation(api.saved.save, {
    tenantId: f.ids.owner,
    listingId: f.ids.listing,
  });
  expect((await f.report()).rows[0].saves).toBe(1);
  await f.t.run((ctx) => ctx.db.patch(f.ids.listing, { moderationHold: true }));
  await expect(f.tenant.mutation(api.saved.save, args)).rejects.toThrow(
    "unavailable",
  );
});
it("counts native requests, first traveler threads and actual housing matches once", async () => {
  const f = await fixture(),
    moveIn = Math.floor(now / DAY) * DAY + 60 * DAY;
  await f.tenant.mutation(api.inquiries.create, {
    listingId: f.ids.listing,
    moveIn,
    moveOut: moveIn + 30 * DAY,
    occupants: 1,
    pets: false,
    message: "Synthetic stay request",
  });
  await expect(
    f.tenant.mutation(api.inquiries.create, {
      listingId: f.ids.listing,
      moveIn,
      moveOut: moveIn + 30 * DAY,
      occupants: 1,
      pets: false,
      message: "Synthetic retry",
    }),
  ).rejects.toThrow();
  const clientRequestId = "00000000-0000-4000-8000-000000000012";
  await f.tenant.mutation(api.messages.sendMessage, {
    senderId: f.ids.tenant,
    receiverId: f.ids.owner,
    listingId: f.ids.listing,
    content: "Synthetic follow-up",
    clientRequestId,
  });
  await f.tenant.mutation(api.messages.sendMessage, {
    senderId: f.ids.tenant,
    receiverId: f.ids.owner,
    listingId: f.ids.listing,
    content: "Synthetic follow-up",
    clientRequestId,
  });
  expect((await f.report()).rows[0]).toMatchObject({
    bookingRequests: 1,
    threads: 1,
  });
  const request = await f.tenant.mutation(api.housingRequests.create, {
    userId: f.ids.tenant,
    city: "Austin",
    state: "TX",
    moveInDate: moveIn,
    duration: 1,
    maxBudget: 2500,
    bedrooms: 1,
    petFriendly: false,
    description: "Synthetic housing request",
  });
  await f.t.mutation(internal.housingRequests.scanRequest, {
    requestId: request,
    cursor: null,
  });
  await f.t.mutation(internal.housingRequests.scanRequest, {
    requestId: request,
    cursor: null,
  });
  expect((await f.report()).rows[0].matchedLeads).toBe(1);
});
it("rejects invalid ranges and labels missing days without reconstructing old views", () => {
  expect(() => performanceSeries([], 91, null, now)).toThrow();
  const series = performanceSeries([], 7, null, now);
  expect(series.every((row) => !row.recorded)).toBe(true);
  expect(performanceCsv(series, "prod")).not.toContain("123");
});

it("maintains complete portfolio days without reading every property or historical message", async () => {
  const f = await fixture();
  await f.observe("views");
  await f.observe("shares");
  const all = await f.owner.query(api.listingPerformance.report, { days: 90 });
  expect(all.listingId).toBeNull();
  expect(all.price).toBeNull();
  expect(all.rows[0]).toMatchObject({ views: 1, shares: 1 });
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.listing, { landlordId: f.ids.other }),
  );
  expect(
    (await f.owner.query(api.listingPerformance.report, { days: 90 })).rows[0]
      .views,
  ).toBe(1);
  expect(
    (await f.other.query(api.listingPerformance.report, { days: 90 })).rows,
  ).toEqual([]);
});
it("caps compatibility scans with an explicit error instead of partial portfolio totals", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    const original = (await ctx.db.get(f.ids.listing))!;
    const { _id, _creationTime, ...copy } = original;
    for (let n = 0; n < 50; n++)
      await ctx.db.insert("listings", {
        ...copy,
        title: `Synthetic old client ${n}`,
      });
  });
  await expect(
    f.owner.query(api.analytics.getListingStats, { landlordId: f.ids.owner }),
  ).rejects.toThrow("paginated");
  let cursor: string | null = null,
    total = 0;
  for (;;) {
    const page: FunctionReturnType<typeof api.listingPerformance.properties> =
      await f.owner.query(api.listingPerformance.properties, {
        paginationOpts: { cursor, numItems: 30 },
      });
    total += page.page.length;
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(total).toBe(51);
});

it("deduplicates concurrent observations, enforces actor ceilings and rejects native-event spoofing", async () => {
  const f = await fixture();
  await Promise.all([f.observe("views"), f.observe("views")]);
  expect((await f.report()).rows[0].views).toBe(1);
  await expect(
    f.t.mutation(api.listingPerformance.observe, {
      listingIds: [f.ids.listing],
      kind: "bookingRequests" as "views",
      clientId,
    }),
  ).rejects.toThrow();
  const actor = await import("../convex/lib/market").then((m) =>
    m.marketHash(`test:page:${clientId}`),
  );
  await f.t.run(async (ctx) => {
    const row = await ctx.db
      .query("listingObservationLimits")
      .withIndex("by_actor_day", (q) =>
        q.eq("actor", actor).eq("day", Math.floor(now / DAY) * DAY),
      )
      .unique();
    await ctx.db.patch(row!._id, {
      keys: Array.from({ length: 600 }, (_, i) => `synthetic-cap-${i}`),
    });
  });
  await f.observe("shares");
  expect((await f.report()).rows[0].shares).toBe(0);
  expect(JSON.stringify(await f.report())).not.toContain(clientId);
});
it("continues bounded cleanup without deleting recent owner or listing days", async () => {
  const f = await fixture();
  await f.observe("views");
  await f.t.run(async (ctx) => {
    const current = (await ctx.db.query("listingPerformanceDays").collect())[0];
    const { _id, _creationTime, ...copy } = current;
    for (let i = 0; i < 105; i++)
      await ctx.db.insert("listingPerformanceDays", {
        ...copy,
        day: Math.floor(now / DAY) * DAY - (100 + i) * DAY,
      });
  });
  await f.t.mutation(internal.listingPerformance.cleanup, {});
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await f.t.run((ctx) => ctx.db.query("listingPerformanceDays").collect()),
  ).toHaveLength(1);
  expect(
    (await f.owner.query(api.listingPerformance.report, { days: 90 })).rows[0]
      .views,
  ).toBe(1);
});

it.each([7, 30, 90])(
  "anchors %i-day activity and eligibility exports to the native window despite device clock changes",
  async (days) => {
    const f = await fixture();
    await f.observe("views");
    await f.owner.mutation(api.mapEligibility.check, {
      listingId: f.ids.listing,
    });
    const report = await f.owner.query(api.listingPerformance.report, {
      listingId: f.ids.listing,
      days,
      refreshKey: Number.MAX_SAFE_INTEGER,
    });
    const eligibility = await f.owner.query(api.mapEligibility.report, {
      listingId: f.ids.listing,
      days,
      refreshKey: -Number.MAX_SAFE_INTEGER,
    });
    const activityBefore = performanceCsv(
        performanceReportSeries(report),
        report.mode,
      ),
      mapBefore = eligibilityCsv(
        eligibilityReportSeries(eligibility),
        eligibility.mode,
        false,
      );
    for (const deviceTime of [now - 366 * DAY, now + 366 * DAY]) {
      vi.setSystemTime(deviceTime);
      const rows = performanceReportSeries(report),
        mapRows = eligibilityReportSeries(eligibility);
      expect(rows).toHaveLength(days);
      expect(rows[0].day).toBe(report.start);
      expect(rows.at(-1)!.day).toBe(report.end - DAY);
      expect(rows.reduce((n, r) => n + r.views, 0)).toBe(1);
      expect(rows.every((r) => !r.phoneRecorded && !r.unmatchedRecorded)).toBe(
        true,
      );
      expect(performanceCsv(rows, report.mode)).toBe(activityBefore);
      expect(eligibilityCsv(mapRows, eligibility.mode, false)).toBe(mapBefore);
      expect(mapRows[0].day).toBe(eligibility.start);
      expect(mapRows.at(-1)!.day).toBe(eligibility.end - DAY);
    }
  },
);
it("uses only server time across UTC rollover and refreshes ignored clock keys without changing authority", async () => {
  const f = await fixture();
  const before = Date.UTC(2026, 9, 25, 23, 59, 59);
  vi.setSystemTime(before);
  await f.observe("views");
  await f.owner.mutation(api.mapEligibility.check, {
    listingId: f.ids.listing,
  });
  const old = await f.owner.query(api.listingPerformance.report, {
    listingId: f.ids.listing,
    days: 7,
    refreshKey: Date.UTC(2036, 0, 1),
  });
  expect(old.generatedAt).toBeGreaterThanOrEqual(before);
  expect(old.end).toBe(Date.UTC(2026, 9, 26));
  expect(reportRefreshDelay(old)).toBeLessThanOrEqual(2000);
  const oldMap = await f.owner.query(api.mapEligibility.report, {
    listingId: f.ids.listing,
    days: 7,
    refreshKey: 0,
  });
  vi.setSystemTime(Date.UTC(2026, 9, 26, 0, 0, 1));
  const fresh = await f.owner.query(api.listingPerformance.report, {
    listingId: f.ids.listing,
    days: 7,
    refreshKey: -1,
  });
  const freshMap = await f.owner.query(api.mapEligibility.report, {
    listingId: f.ids.listing,
    days: 7,
    refreshKey: Number.MAX_SAFE_INTEGER,
  });
  expect(fresh.start).toBe(old.start + DAY);
  expect(fresh.end).toBe(old.end + DAY);
  expect(freshMap.start).toBe(oldMap.start + DAY);
  expect(freshMap.end).toBe(oldMap.end + DAY);
  expect(performanceReportSeries(fresh).at(-2)!.views).toBe(1);
  expect(performanceReportSeries(fresh).at(-1)!.views).toBe(0);
  expect(eligibilityReportSeries(freshMap).at(-2)!.observation).not.toBeNull();
  expect(eligibilityReportSeries(freshMap).at(-1)!.observation).toBeNull();
  expect(reportRefreshDelay(fresh)).toBeLessThanOrEqual(DAY);
});
