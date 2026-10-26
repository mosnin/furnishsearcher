import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 26);
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
  const ids = await t.run(async (ctx) => {
    const user = async (
      clerkId: string,
      role: "landlord" | "admin" | "tenant",
    ) =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        createdAt: now,
      });
    const owner = await user("public-owner", "landlord"),
      other = await user("other-owner", "landlord"),
      staff = await user("public-staff", "admin"),
      tenant = await user("public-traveler", "tenant"),
      listings = [];
    for (let n = 0; n < count; n++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: `Public synthetic ${n}`,
          description: "PRIVATE DESCRIPTION",
          address: "PRIVATE ADDRESS",
          zip: "PRIVATE ZIP",
          city: "Austin",
          state: "TX",
          price: 1800,
          bedrooms: 1,
          bathrooms: 1,
          propertyType: "House",
          amenities: [],
          photos: [],
          petFriendly: false,
          parkingIncluded: false,
          utilitiesIncluded: false,
          availableFrom: now,
          minStay: 1,
          status: "active",
          views: 0,
          createdAt: now + n,
        }),
      );
    return { owner, other, staff, tenant, listings };
  });
  await seedPublishedFixtures(t);
  return {
    t,
    ids,
    owner: t.withIdentity({ subject: "public-owner" }),
    staff: t.withIdentity({ subject: "public-staff" }),
    traveler: t.withIdentity({ subject: "public-traveler" }),
  };
}
const page = { cursor: null, numItems: 10 };
it("gives visitors, owners and staff the same explicit public card allowlist", async () => {
  const { t, ids, owner, staff, traveler } = await fixture(3);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.listings[1], { publicationRequested: false });
    await ctx.db.patch(ids.listings[2], { moderationHold: true });
  });
  const args = { landlordId: ids.owner, paginationOpts: page },
    result = await t.query(api.publicOwnerListings.list, args);
  expect(result.page.map((r) => r._id)).toEqual([ids.listings[0]]);
  for (const client of [owner, staff, traveler])
    expect(await client.query(api.publicOwnerListings.list, args)).toEqual(
      result,
    );
  expect(Object.keys(result.page[0]).sort()).toEqual(
    [
      "_id",
      "title",
      "city",
      "state",
      "price",
      "bedrooms",
      "bathrooms",
      "propertyType",
      "photos",
      "petFriendly",
      "parkingIncluded",
      "utilitiesIncluded",
      "availableFrom",
      "minStay",
      "featured",
    ].sort(),
  );
  const encoded = JSON.stringify(result);
  for (const secret of [
    "PRIVATE ADDRESS",
    "PRIVATE DESCRIPTION",
    "PRIVATE ZIP",
    "publication",
    "landlordId",
    "approvedRevision",
    "photoAssets",
  ])
    expect(encoded).not.toContain(secret);
  expect(result.page[0].photos).toHaveLength(1);
  expect(
    (
      await t.query(api.publicOwnerListings.list, {
        ...args,
        landlordId: ids.other,
      })
    ).page,
  ).toEqual([]);
  expect(
    (
      await t.query(api.publicOwnerListings.list, {
        ...args,
        landlordId: ids.tenant,
      })
    ).page,
  ).toEqual([]);
});
it("continues after twelve empty pages and returns every eligible rental beyond the initial window", async () => {
  const { t, ids } = await fixture(127);
  await t.run(async (ctx) => {
    for (const id of ids.listings.slice(2))
      await ctx.db.patch(id, { moderationHold: true });
  });
  let cursor: string | null = null,
    done = false,
    pages = 0;
  const rows = [];
  while (!done) {
    const r: FunctionReturnType<typeof api.publicOwnerListings.list> =
      await t.query(api.publicOwnerListings.list, {
        landlordId: ids.owner,
        paginationOpts: { cursor, numItems: 1000 },
      });
    expect(r.page.length).toBeLessThanOrEqual(10);
    if (pages < 12) expect(r.page).toEqual([]);
    rows.push(...r.page);
    cursor = r.continueCursor;
    done = r.isDone;
    expect(++pages).toBeLessThan(20);
  }
  expect(pages).toBe(13);
  expect(rows.map((r) => r._id)).toEqual([ids.listings[1], ids.listings[0]]);
});
it("rechecks content, approval revision, explicit publication and paid/identity eligibility", async () => {
  const { t, ids } = await fixture(4),
    args = { landlordId: ids.owner, paginationOpts: page };
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.listings[1], { approvedRevision: 0, revision: 2 });
    await ctx.db.patch(ids.listings[2], { description: "" });
    await ctx.db.patch(ids.listings[3], { publicationRequested: false });
  });
  expect(
    (await t.query(api.publicOwnerListings.list, args)).page.map((r) => r._id),
  ).toEqual([ids.listings[0]]);
  await t.run((ctx) => ctx.db.patch(ids.owner, { identityHold: true }));
  expect((await t.query(api.publicOwnerListings.list, args)).page).toEqual([]);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.owner, { identityHold: false });
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", ids.owner))
      .first();
    await ctx.db.patch(sub!._id, { paidThrough: now - 1 });
  });
  expect((await t.query(api.publicOwnerListings.list, args)).page).toEqual([]);
});
it("honors owner offboarding before paging and current creation order rather than insertion order", async () => {
  const { t, ids } = await fixture(2),
    args = { landlordId: ids.owner, paginationOpts: page };
  await t.run((ctx) => ctx.db.patch(ids.listings[0], { createdAt: now + 100 }));
  expect((await t.query(api.publicOwnerListings.list, args)).page[0]._id).toBe(
    ids.listings[0],
  );
  await t.run((ctx) => ctx.db.patch(ids.owner, { clerkDeletedAt: now }));
  expect(await t.query(api.publicOwnerListings.list, args)).toEqual({
    page: [],
    isDone: true,
    continueCursor: "",
  });
});
it("bounds the legacy array API and directs oversized portfolios to pagination instead of silently truncating", async () => {
  const { t, owner, ids } = await fixture(101);
  for (const client of [t, owner])
    await expect(
      client.query(api.listings.getByLandlord, { landlordId: ids.owner }),
    ).rejects.toThrow("paged");
});

it("also strips management metadata from the bounded legacy public array while preserving owner management access", async () => {
  const { t, owner, ids } = await fixture();
  const publicRows = await t.query(api.listings.getByLandlord, {
    landlordId: ids.owner,
  });
  expect(Object.keys(publicRows[0]).sort()).toEqual(
    [
      "_id",
      "title",
      "city",
      "state",
      "price",
      "bedrooms",
      "bathrooms",
      "propertyType",
      "photos",
      "petFriendly",
      "parkingIncluded",
      "utilitiesIncluded",
      "availableFrom",
      "minStay",
      "featured",
      "amenities",
      "address",
      "status",
    ].sort(),
  );
  expect(publicRows[0].address).toBe("");
  const ownRows = await owner.query(api.listings.getByLandlord, {
    landlordId: ids.owner,
  });
  expect(ownRows[0].address).toBe("PRIVATE ADDRESS");
  expect(ownRows[0]).toHaveProperty("publication");
});
