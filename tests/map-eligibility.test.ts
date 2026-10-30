import { convexTest } from "convex-test";
import geospatial from "./helpers/geospatial";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
import { eligibilitySeries, eligibilityCsv } from "../lib/map-eligibility";
const modules = import.meta.glob("../convex/**/*.ts"),
  DAY = 86400000,
  now = Date.UTC(2026, 9, 25, 12),
  today = Math.floor(now / DAY) * DAY;
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
async function fixture(count = 1) {
  const t = convexTest(schema, modules);
  await geospatial.register(t);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "landlord" | "admin" = "landlord") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: "Synthetic " + clerkId,
        email: clerkId + "@example.test",
        createdAt: now,
      });
    const owner = await make("owner"),
      other = await make("other"),
      staff = await make("staff", "admin"),
      listings = [];
    for (let i = 0; i < count; i++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: "Synthetic eligible space " + i,
          description: "QA only",
          address: "Private street",
          city: "Austin",
          state: "TX",
          zip: "78701",
          price: 1800,
          bedrooms: 1,
          bathrooms: 1,
          propertyType: "Apartment",
          amenities: [],
          photos: [],
          petFriendly: false,
          utilitiesIncluded: true,
          parkingIncluded: true,
          availableFrom: today,
          minStay: 1,
          status: "active",
          createdAt: now - 200 * DAY,
          firstPublishedAt: now - 100 * DAY,
          views: 999,
          mapLatitude: 30.26,
          mapLongitude: -97.74,
        }),
      );
    return { owner, other, staff, listings };
  });
  await seedPublishedFixtures(t);
  const owner = t.withIdentity({ subject: "owner" }),
    other = t.withIdentity({ subject: "other" }),
    staff = t.withIdentity({ subject: "staff" }),
    listingId = ids.listings[0];
  const report = (days = 7) =>
    owner.query(api.mapEligibility.report, { listingId, days });
  return {
    t,
    ids,
    owner,
    other,
    staff,
    listingId,
    report,
    check: () => owner.mutation(api.mapEligibility.check, { listingId }),
  };
}
it("keeps historical unknown separate from current eligibility and rejects arbitrary windows", async () => {
  const f = await fixture(),
    r = await f.report();
  expect(r.currentEligible).toBe(true);
  expect(r.rows).toEqual([]);
  const rows = eligibilitySeries(r.rows, 7, now);
  expect(rows.every((r) => r.observation === null)).toBe(true);
  const csv = eligibilityCsv(rows, "test", false).split("\r\n");
  expect(csv).toHaveLength(8);
  expect(csv[1].split(",")).toEqual([
    "2026-10-19",
    "test",
    "rental space",
    "unavailable",
    "",
    "",
    "",
    "",
  ]);
  await expect(f.report(365)).rejects.toThrow("7, 30 or 90");
});
it("deduplicates concurrent positive checks and preserves the date after native hide", async () => {
  const f = await fixture();
  await Promise.all([f.check(), f.check()]);
  expect((await f.report()).rows).toMatchObject([
    { day: today, eligibleSpaces: 1, observedSpaces: 1 },
  ]);
  await f.owner.mutation(api.listings.unpublish, { id: f.listingId });
  const r = await f.report();
  expect(r.currentEligible).toBe(false);
  expect(r.rows[0].eligibleSpaces).toBe(1);
  expect(
    (await f.owner.query(api.mapEligibility.report, { days: 7 })).rows[0],
  ).toMatchObject({ eligibleSpaces: 1, observedSpaces: 1 });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("records checks on actual UTC dates, leaves missed days unknown and never backfills first-published or view history", async () => {
  const f = await fixture();
  await f.check();
  vi.setSystemTime(now + 3 * DAY);
  await f.check();
  const r = await f.report(),
    rows = eligibilitySeries(r.rows, 7, Date.now());
  expect(r.rows.map((r) => r.day)).toEqual([today, today + 3 * DAY]);
  expect(rows.filter((r) => r.observation)).toHaveLength(2);
  expect(rows.filter((r) => !r.observation)).toHaveLength(5);
  expect(
    eligibilityCsv(rows, "test", false).split("\r\n")[7].split(",")[5],
  ).toBe("1");
});
it.each(["hidden", "unapproved", "identity", "expired", "coordinates", "held"])(
  "records a negative current check instead of inventing eligibility for %s",
  async (reason) => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      if (reason === "hidden")
        await ctx.db.patch(f.listingId, { publicationRequested: false });
      if (reason === "unapproved")
        await ctx.db.patch(f.listingId, { approvedRevision: 999 });
      if (reason === "identity")
        await ctx.db.patch(f.ids.owner, { identityHold: true });
      if (reason === "expired") {
        const sub = (await ctx.db.query("subscriptions").collect())[0];
        await ctx.db.patch(sub._id, { paidThrough: Date.now() - 1 });
      }
      if (reason === "coordinates")
        await ctx.db.patch(f.listingId, {
          mapLatitude: undefined,
          mapLongitude: undefined,
        });
      if (reason === "held")
        await ctx.db.patch(f.listingId, { moderationHold: true });
    });
    await f.check();
    const r = await f.report();
    expect(r.currentEligible).toBe(false);
    expect(r.rows).toMatchObject([{ observedSpaces: 1, eligibleSpaces: 0 }]);
  },
);
it("counts independently rentable spaces separately in portfolio totals without duplicate dates", async () => {
  const f = await fixture(2);
  for (const listingId of f.ids.listings)
    await f.owner.mutation(api.mapEligibility.check, { listingId });
  await f.check();
  expect(
    (await f.owner.query(api.mapEligibility.report, { days: 7 })).rows,
  ).toMatchObject([{ day: today, observedSpaces: 2, eligibleSpaces: 2 }]);
  vi.setSystemTime(now + DAY);
  await f.owner.mutation(api.listings.unpublish, { id: f.listingId });
  for (const listingId of f.ids.listings)
    await f.owner.mutation(api.mapEligibility.check, { listingId });
  const portfolio = await f.owner.query(api.mapEligibility.report, { days: 7 });
  expect(portfolio.rows[1]).toMatchObject({
    observedSpaces: 2,
    eligibleSpaces: 1,
  });
  expect((await f.report()).rows[1].eligibleSpaces).toBe(0);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("keeps listing/portfolio history private, preserves current-owner boundaries and allows staff review", async () => {
  const f = await fixture();
  await f.check();
  await expect(
    f.t.query(api.mapEligibility.report, { listingId: f.listingId, days: 7 }),
  ).rejects.toThrow("sign in");
  await expect(
    f.other.query(api.mapEligibility.report, {
      listingId: f.listingId,
      days: 7,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    f.other.mutation(api.mapEligibility.check, { listingId: f.listingId }),
  ).rejects.toThrow("Not authorized");
  expect(
    (
      await f.staff.query(api.mapEligibility.report, {
        listingId: f.listingId,
        days: 7,
      })
    ).rows[0].eligibleSpaces,
  ).toBe(1);
  await f.t.run((ctx) =>
    ctx.db.patch(f.listingId, { landlordId: f.ids.other }),
  );
  await expect(f.report()).rejects.toThrow("Not authorized");
  expect(
    (
      await f.other.query(api.mapEligibility.report, {
        listingId: f.listingId,
        days: 7,
      })
    ).rows,
  ).toEqual([]);
  expect(
    (await f.owner.query(api.mapEligibility.report, { days: 7 })).rows[0]
      .eligibleSpaces,
  ).toBe(1);
});
it("pages the daily scan beyond thirty listings, stores no private address and does not count view-only map sorting writes", async () => {
  const f = await fixture(35);
  await f.t.mutation(api.listingPerformance.observe, {
    listingIds: [f.listingId],
    kind: "views",
    clientId: "00000000-0000-4000-8000-000000000001",
  });
  expect((await f.report()).rows).toEqual([]);
  await f.t.mutation(internal.marketSupply.refresh, {});
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const r = await f.owner.query(api.mapEligibility.report, { days: 7 });
  expect(r.rows).toMatchObject([{ observedSpaces: 35, eligibleSpaces: 35 }]);
  expect(JSON.stringify(r)).not.toContain("Private street");
  const rows = await f.t.run((ctx) =>
    ctx.db.query("mapEligibilityDays").collect(),
  );
  expect(rows).toHaveLength(35);
});
it("uses the check execution day when a scheduled scan crosses midnight", async () => {
  const f = await fixture();
  await f.t.mutation(internal.marketSupply.refresh, {});
  vi.setSystemTime(today + DAY + 1000);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await f.report()).rows.map((r) => r.day)).toEqual([today + DAY]);
});
it("isolates test/production rows and supports a fresh negative check after access expiry", async () => {
  const f = await fixture();
  await f.check();
  vi.stubEnv("CREEM_API_KEY", "creem_production_qa");
  expect((await f.report()).rows).toEqual([]);
  await f.check();
  expect((await f.report()).rows[0].eligibleSpaces).toBe(0);
  vi.stubEnv("CREEM_API_KEY", "creem_test_publication_fixture");
  expect((await f.report()).rows[0].eligibleSpaces).toBe(1);
  vi.setSystemTime(now + 366 * DAY);
  await f.check();
  expect((await f.report()).rows).toMatchObject([{ eligibleSpaces: 0 }]);
});
it("records ordinary native publication transitions without changing owner content or approvals", async () => {
  const f = await fixture();
  await f.owner.mutation(api.listings.unpublish, { id: f.listingId });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const before = await f.t.run((ctx) => ctx.db.get(f.listingId));
  const published = await f.owner.mutation(api.listings.publish, {
    id: f.listingId,
  });
  expect(published.live).toBe(true);
  expect((await f.report()).rows[0].eligibleSpaces).toBe(1);
  const after = await f.t.run((ctx) => ctx.db.get(f.listingId));
  expect(after?.revision).toBe(before?.revision);
  expect(after?.approvedRevision).toBe(before?.approvedRevision);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("cleans old indexed history in bounded pages while preserving recent observations", async () => {
  const f = await fixture();
  await f.check();
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 101; i++) {
      const day = today - (200 + i) * DAY;
      await ctx.db.insert("mapEligibilityDays", {
        listingId: f.listingId,
        ownerId: f.ids.owner,
        mode: "test",
        day,
        qualified: true,
        lastQualified: true,
        firstCheckedAt: day,
        lastCheckedAt: day,
      });
      await ctx.db.insert("ownerMapEligibilityDays", {
        ownerId: f.ids.owner,
        mode: "test",
        day,
        observedSpaces: 1,
        eligibleSpaces: 1,
        firstCheckedAt: day,
        lastCheckedAt: day,
      });
    }
  });
  await f.t.mutation(internal.mapEligibility.cleanup, {});
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await f.t.run((ctx) => ctx.db.query("mapEligibilityDays").collect()),
  ).toHaveLength(1);
  expect(
    await f.t.run((ctx) => ctx.db.query("ownerMapEligibilityDays").collect()),
  ).toHaveLength(1);
});
it("retains since-collection totals after daily retention and initializes older native observations exactly once", async () => {
  const f = await fixture();
  await f.check();
  const firstCheckedAt = (await f.report()).totals!.firstCheckedAt;
  expect((await f.report()).totals?.eligibleSpaceDays).toBe(1);
  await f.t.run(async (ctx) => {
    for (const row of await ctx.db.query("mapEligibilityTotals").collect())
      await ctx.db.delete(row._id);
  });
  await f.check();
  await f.check();
  expect((await f.report()).totals).toMatchObject({
    eligibleSpaceDays: 1,
    observedSpaceDays: 1,
    firstCheckedAt,
  });
  vi.setSystemTime(now + 100 * DAY);
  await f.check();
  await f.t.mutation(internal.mapEligibility.cleanup, {});
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const report = await f.report();
  expect(report.rows).toHaveLength(1);
  expect(report.totals).toMatchObject({
    eligibleSpaceDays: 2,
    observedSpaceDays: 2,
    firstCheckedAt,
  });
  expect(
    (await f.owner.query(api.mapEligibility.report, { days: 7 })).totals
      ?.eligibleSpaceDays,
  ).toBe(2);
});
