import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import {
  emptyPerformance,
  performanceSeries,
  performanceCsv,
  metricRecorded,
} from "../lib/listing-performance";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 25, 12),
  DAY = 86400000,
  phone = "+12025550123";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("CLERK_CONTACT_MODE", "test");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const t = convexTest(schema, modules);
  geospatial.register(t);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkId: "owner",
      role: "landlord",
      name: "Synthetic owner",
      email: "owner@example.test",
      createdAt: now,
      phone,
      phoneVerified: true,
      phoneVerificationSource: "clerk",
      phoneVerificationMode: "test",
      phoneVerifiedAt: now,
      phoneVerificationExpiresAt: now + DAY,
      phoneRevision: 2,
    });
    const viewer = await ctx.db.insert("users", {
      clerkId: "viewer",
      role: "tenant",
      name: "Synthetic traveler",
      email: "viewer@example.test",
      createdAt: now,
    });
    const listing = await ctx.db.insert("listings", {
      views: 0,
      landlordId: owner,
      title: "Synthetic phone QA",
      description: "Local fixture",
      address: "Private street",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 2000,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: true,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: now,
      minStay: 1,
      status: "active",
      createdAt: now,
    });
    return { owner, viewer, listing };
  });
  await seedPublishedFixtures(t);
  return {
    t,
    ids,
    owner: t.withIdentity({ subject: "owner" }),
    viewer: t.withIdentity({ subject: "viewer" }),
  };
}
it("keeps phone private by default and requires owner consent and an authenticated reveal", async () => {
  const f = await fixture();
  const args = { listingId: f.ids.listing };
  expect(await f.viewer.query(api.phoneContacts.availability, args)).toEqual({
    status: "unavailable",
    revision: null,
    expiresAt: null,
  });
  await expect(
    f.viewer.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/unavailable/);
  await expect(
    f.t.mutation(api.phoneContacts.setEnabled, { enabled: true }),
  ).rejects.toThrow(/sign in/);
  await expect(
    f.viewer.mutation(api.phoneContacts.setEnabled, { enabled: true }),
  ).rejects.toThrow(/Confirm/);
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  expect((await f.t.query(api.phoneContacts.availability, args)).status).toBe(
    "sign-in",
  );
  await expect(f.t.mutation(api.phoneContacts.reveal, args)).rejects.toThrow(
    /sign in/,
  );
  const state = await f.viewer.query(api.phoneContacts.availability, args);
  expect(state.status).toBe("available");
  expect(JSON.stringify(state)).not.toContain(phone);
  expect(await f.viewer.mutation(api.phoneContacts.reveal, args)).toEqual({
    phone,
    revision: 2,
    expiresAt: now + DAY,
  });
  expect(
    JSON.stringify(
      await f.t.query(api.listings.getById, { id: f.ids.listing }),
    ),
  ).not.toContain(phone);
});
it("rechecks owner opt-out and visibility instead of trusting a previously available card", async () => {
  const f = await fixture(),
    args = { listingId: f.ids.listing };
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await f.viewer.mutation(api.phoneContacts.reveal, args);
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: false });
  await expect(
    f.viewer.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/unavailable/);
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.listing, { publicationRequested: false }),
  );
  await expect(
    f.viewer.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/unavailable/);
  expect(
    (await f.viewer.query(api.phoneContacts.availability, args)).status,
  ).toBe("unavailable");
});
it("denies both block directions, self reveals and missing profiles", async () => {
  const f = await fixture(),
    args = { listingId: f.ids.listing };
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await expect(
    f.owner.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/unavailable/);
  await expect(
    f.t
      .withIdentity({ subject: "missing" })
      .mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/profile/);
  for (const [a, b] of [
    [f.ids.owner, f.ids.viewer],
    [f.ids.viewer, f.ids.owner],
  ]) {
    const block = await f.t.run((ctx) =>
      ctx.db.insert("userBlocks", {
        blockerId: a,
        blockedId: b,
        createdAt: now,
      }),
    );
    await expect(
      f.viewer.mutation(api.phoneContacts.reveal, args),
    ).rejects.toThrow(/unavailable/);
    expect(
      (await f.viewer.query(api.phoneContacts.availability, args)).status,
    ).toBe("unavailable");
    await f.t.run((ctx) => ctx.db.delete(block));
  }
});
it("changing or revoking a phone removes listing consent; reconfirmation cannot restore it", async () => {
  const f = await fixture(),
    args = { listingId: f.ids.listing };
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await f.owner.mutation(api.users.updateProfile, {
    userId: f.ids.owner,
    phone: "+12025550124",
  });
  expect((await f.owner.query(api.phoneContacts.settings, {})).enabled).toBe(
    false,
  );
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.ids.owner)))?.listingPhoneConsent,
  ).toBeUndefined();
  await expect(
    f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true }),
  ).rejects.toThrow(/Confirm/);
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.owner, {
      phoneVerified: true,
      phoneVerificationSource: "clerk",
      phoneVerificationMode: "test",
      phoneVerifiedAt: now,
      phoneVerificationExpiresAt: now + DAY,
    }),
  );
  await expect(
    f.viewer.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/unavailable/);
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await f.owner.mutation(api.users.revokePhone, {});
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.ids.owner)))?.listingPhoneConsent,
  ).toBeUndefined();
});
it("expires consent independently of a refreshed phone proof and isolates provider modes", async () => {
  const f = await fixture(),
    args = { listingId: f.ids.listing };
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.owner, { phoneVerificationExpiresAt: now + 2 * DAY }),
  );
  vi.setSystemTime(now + DAY + 1);
  await expect(
    f.viewer.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/unavailable/);
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await f.t.mutation(internal.phoneContacts.expireConsent, {
    userId: f.ids.owner,
    revision: 2,
    expiresAt: now + DAY,
  });
  expect((await f.owner.query(api.phoneContacts.settings, {})).enabled).toBe(
    true,
  );
  vi.stubEnv("CLERK_CONTACT_MODE", "prod");
  await expect(
    f.viewer.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/unavailable/);
});
it("atomically bounds unique daily reveals, deduplicates concurrent retries and cleans old metadata", async () => {
  const f = await fixture(),
    args = { listingId: f.ids.listing };
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await Promise.all(
    Array.from({ length: 8 }, () =>
      f.viewer.mutation(api.phoneContacts.reveal, args),
    ),
  );
  const limit = await f.t.run((ctx) =>
    ctx.db.query("listingPhoneLimits").unique(),
  );
  expect(limit?.listingIds).toEqual([f.ids.listing]);
  await f.t.run(async (ctx) => {
    const ids = [];
    for (let n = 0; n < 20; n++) {
      const l = await ctx.db.get(f.ids.listing);
      const { _id, _creationTime, ...fields } = l!;
      ids.push(await ctx.db.insert("listings", fields));
    }
    await ctx.db.patch(limit!._id, { listingIds: ids });
  });
  await expect(
    f.viewer.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/limit/);
  await f.t.run((ctx) => ctx.db.patch(limit!._id, { day: now - 4 * DAY }));
  await f.t.mutation(internal.phoneContacts.cleanup, {});
  expect(
    await f.t.run((ctx) => ctx.db.query("listingPhoneLimits").collect()),
  ).toHaveLength(0);
});
it("counts successful reveals once while preserving older per-metric coverage and legacy rows", async () => {
  const f = await fixture(),
    args = { listingId: f.ids.listing };
  const day = Math.floor(now / DAY) * DAY;
  const { phoneReveals: unused, ...legacyCounts } = emptyPerformance();
  await f.t.run(async (ctx) => {
    await ctx.db.insert("listingPerformanceState", {
      listingId: f.ids.listing,
      ownerId: f.ids.owner,
      mode: "test",
      startedAt: now - 3 * DAY,
    });
    await ctx.db.insert("ownerPerformanceState", {
      ownerId: f.ids.owner,
      mode: "test",
      startedAt: now - 3 * DAY,
    });
    for (const d of [day - DAY, day]) {
      await ctx.db.insert("listingPerformanceDays", {
        listingId: f.ids.listing,
        ownerId: f.ids.owner,
        mode: "test",
        day: d,
        ...legacyCounts,
        views: 4,
      });
      await ctx.db.insert("ownerPerformanceDays", {
        ownerId: f.ids.owner,
        mode: "test",
        day: d,
        ...legacyCounts,
        views: 4,
      });
    }
  });
  const report = () =>
    f.owner.query(api.listingPerformance.report, {
      listingId: f.ids.listing,
      days: 7,
    });
  expect((await report()).phoneStartedAt).toBeNull();
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await Promise.all(
    Array.from({ length: 10 }, () =>
      f.viewer.mutation(api.phoneContacts.reveal, args),
    ),
  );
  const counted = await report(),
    portfolio = await f.owner.query(api.listingPerformance.report, { days: 7 });
  expect(counted.phoneStartedAt).toBeGreaterThanOrEqual(now);
  expect(counted.phoneStartedAt).toBeLessThan(now + 1000);
  expect(portfolio.phoneStartedAt).toBe(counted.phoneStartedAt);
  expect(counted.rows[1]).toMatchObject({ views: 4, phoneReveals: 1 });
  expect(portfolio.rows[1]).toMatchObject({ views: 4, phoneReveals: 1 });
  const series = performanceSeries(
    counted.rows,
    7,
    counted.startedAt,
    now,
    counted.phoneStartedAt,
  );
  expect(series[5]).toMatchObject({
    recorded: true,
    phoneRecorded: false,
    views: 4,
  });
  expect(metricRecorded(series[5], "phoneReveals")).toBe(false);
  expect(series[6]).toMatchObject({
    recorded: true,
    phoneRecorded: true,
    views: 4,
    phoneReveals: 1,
  });
  const csv = performanceCsv(series, "test")
    .split("\r\n")
    .map((line) => line.split(","));
  const phoneColumn = csv[0].indexOf("Phone number reveals"),
    coverageColumn = csv[0].indexOf("Phone reveal coverage");
  expect(csv[6][phoneColumn]).toBe("");
  expect(csv[6][coverageColumn]).toBe("unavailable");
  expect(csv[7][phoneColumn]).toBe("1");
  expect(csv[7][coverageColumn]).toBe("recorded");
});
it("excludes staff, failed reveals and caller-forged observations from phone statistics", async () => {
  const f = await fixture(),
    args = { listingId: f.ids.listing };
  const report = () =>
    f.owner.query(api.listingPerformance.report, {
      listingId: f.ids.listing,
      days: 7,
    });
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await f.t.run((ctx) => ctx.db.patch(f.ids.viewer, { role: "admin" }));
  await f.viewer.mutation(api.phoneContacts.reveal, args);
  expect((await report()).phoneStartedAt).toBeNull();
  await expect(f.t.mutation(api.phoneContacts.reveal, args)).rejects.toThrow(
    /sign in/,
  );
  await expect(
    f.viewer.mutation(api.listingPerformance.observe, {
      listingIds: [f.ids.listing],
      kind: "phoneReveals" as "views",
      clientId: "00000000-0000-4000-8000-000000000001",
    }),
  ).rejects.toThrow();
  expect((await report()).rows).toHaveLength(0);
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: false });
  await expect(
    f.viewer.mutation(api.phoneContacts.reveal, args),
  ).rejects.toThrow(/unavailable/);
  expect((await report()).rows).toHaveLength(0);
});
it("keeps account/day counts independent and never exposes reveals through another owner's report or mode", async () => {
  const f = await fixture(),
    args = { listingId: f.ids.listing };
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.owner, { phoneVerificationExpiresAt: now + 3 * DAY }),
  );
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  await f.viewer.mutation(api.phoneContacts.reveal, args);
  const initialStart = (
    await f.owner.query(api.listingPerformance.report, {
      listingId: f.ids.listing,
      days: 7,
    })
  ).phoneStartedAt;
  await f.t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "second",
      name: "Second synthetic viewer",
      email: "second@example.test",
      role: "tenant",
      createdAt: now,
    }),
  );
  const second = f.t.withIdentity({ subject: "second" });
  await second.mutation(api.phoneContacts.reveal, args);
  await expect(
    second.query(api.listingPerformance.report, {
      listingId: f.ids.listing,
      days: 7,
    }),
  ).rejects.toThrow(/authorized/);
  const other = await second.query(api.listingPerformance.report, { days: 7 });
  expect(other.phoneStartedAt).toBeNull();
  expect(other.rows).toHaveLength(0);
  vi.setSystemTime(now + DAY);
  await f.viewer.mutation(api.phoneContacts.reveal, args);
  const report = await f.owner.query(api.listingPerformance.report, {
    listingId: f.ids.listing,
    days: 7,
  });
  expect(report.rows.map((row) => row.phoneReveals)).toEqual([2, 1]);
  const state = await f.t.run((ctx) =>
    ctx.db.query("listingPerformanceState").unique(),
  );
  expect(state?.phoneStartedAt).toBe(initialStart);
  vi.stubEnv("CREEM_API_KEY", "creem_synthetic_mode_only");
  const production = await f.owner.query(api.listingPerformance.report, {
    listingId: f.ids.listing,
    days: 7,
  });
  expect(production.mode).toBe("prod");
  expect(production.rows).toHaveLength(0);
  expect(production.phoneStartedAt).toBeNull();
});
