import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
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
