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

it("distinguishes public traveler views from authorized private detail previews", async () => {
  const { t, owner, staff, traveler, ids } = await fixture();
  const args = { id: ids.listings[0] };
  expect(await t.query(api.listings.getById, args)).toMatchObject({
    isPublic: true,
    canManage: false,
    address: "",
  });
  expect(await owner.query(api.listings.getById, args)).toMatchObject({
    isPublic: true,
    canManage: true,
    address: "PRIVATE ADDRESS",
  });
  await t.run((ctx) =>
    ctx.db.patch(ids.listings[0], { publicationRequested: false }),
  );
  expect(await t.query(api.listings.getById, args)).toBeNull();
  expect(await traveler.query(api.listings.getById, args)).toBeNull();
  for (const manager of [owner, staff])
    expect(await manager.query(api.listings.getById, args)).toMatchObject({
      isPublic: false,
      canManage: true,
    });
});

const privateListingFields = [
  "photoAssets",
  "photoDrafts",
  "revision",
  "approvedRevision",
  "approvalStatus",
  "publicationRequested",
  "moderationHold",
  "featuredPaymentId",
  "featuredUntil",
  "featuredMode",
  "searchCity",
  "searchState",
  "propertyLocationVersion",
  "locationConfirmedAt",
  "locationGeneration",
  "firstPublishedAt",
  "calendarSyncThrough",
  "unitNameKey",
  "independentSpaceConfirmedAt",
  "_creationTime",
];
it("public detail preserves complete ordered gallery/captions, fees, rules and maps without editing or publication fields", async () => {
  const { t, owner, traveler, ids } = await fixture();
  const details = {
    rooms: [{ name: "Bedroom", beds: "Queen" }],
    bathroomDetails: [{ name: "Bath", description: "Shower" }],
    fees: [
      {
        name: "Cleaning",
        amount: 45.25,
        refundable: false,
        frequency: "once" as const,
      },
    ],
    smoking: "prohibited" as const,
    rules: "Quiet evenings",
    facilities: [{ name: "Synthetic hospital", miles: 2 }],
  };
  await t.run(async (ctx) => {
    const first = await ctx.storage.store(
        new Blob(["synthetic image one"], { type: "image/png" }),
      ),
      second = await ctx.storage.store(
        new Blob(["synthetic image two"], { type: "image/png" }),
      );
    await ctx.db.patch(ids.listings[0], {
      photoAssets: [
        { storageId: second, caption: "Cover second" },
        { storageId: first, caption: "First interior" },
        {
          legacyUrl: "https://images.example.test/third",
          caption: "Third caption",
        },
      ],
      details,
      mapLatitude: 30.25,
      mapLongitude: -97.75,
      locationConfirmedAt: now,
      locationGeneration: 7,
      firstPublishedAt: now,
      calendarSyncThrough: now + 86400000,
      searchCity: "PRIVATE SEARCH KEY",
      searchState: "TX",
      unitNameKey: "private normalized unit",
    });
  });
  const manager = await owner.query(api.listings.getById, {
    id: ids.listings[0],
  });
  expect(manager?.photoDrafts).toHaveLength(3);
  expect(manager?.photoAssets).toHaveLength(3);
  expect(manager?.address).toBe("PRIVATE ADDRESS");
  expect(manager?.zip).toBe("PRIVATE ZIP");
  expect(manager?.revision).toBeDefined();
  for (const client of [t, traveler]) {
    const publicView = await client.query(api.listings.getById, {
      id: ids.listings[0],
    });
    expect(publicView?.photos).toEqual(manager?.photos);
    expect(publicView?.photoCaptions).toEqual([
      "Cover second",
      "First interior",
      "Third caption",
    ]);
    expect(publicView?.details).toEqual(details);
    expect(publicView).toMatchObject({
      isPublic: true,
      canManage: false,
      address: "",
      zip: "",
      mapLatitude: 30.25,
      mapLongitude: -97.75,
    });
    for (const key of privateListingFields)
      expect(Object.hasOwn(publicView!, key), key).toBe(false);
  }
});
it("legacy search and featured cards do not expose owner metadata or precise address", async () => {
  const { t, ids } = await fixture();
  await t.run((ctx) =>
    ctx.db.patch(ids.listings[0], {
      searchCity: "PRIVATE SEARCH KEY",
      locationGeneration: 42,
    }),
  );
  const results = [
    ...(await t.query(api.listings.search, {})),
    ...(await t.query(api.listings.getFeatured, {})),
  ];
  expect(results).toHaveLength(2);
  for (const row of results) {
    expect(row.address).toBe("");
    for (const key of privateListingFields)
      expect(Object.hasOwn(row, key), key).toBe(false);
  }
  expect((await t.query(api.listings.getFeatured, {}))[0].photos).toHaveLength(
    1,
  );
});
it("the bounded showcase finds eligible recent cards behind held candidates and only verified paid boosts receive sponsorship", async () => {
  const { t, ids } = await fixture(40);
  await t.run(async (ctx) => {
    for (const id of ids.listings.slice(6))
      await ctx.db.patch(id, { moderationHold: true });
    const paid = await ctx.db.insert("payments", {
      userId: ids.owner,
      creemCheckoutId: "synthetic-showcase",
      productId: "synthetic-boost",
      purpose: "feature_listing",
      listingId: ids.listings[0],
      amountCents: 1200,
      currency: "USD",
      status: "completed",
      trustedCheckout: true,
      mode: "test",
      createdAt: now,
    });
    await ctx.db.patch(ids.listings[0], {
      featured: true,
      featuredMode: "test",
      featuredUntil: now + 86400000,
      featuredPaymentId: paid,
    });
    await ctx.db.patch(ids.listings[1], {
      featured: true,
      featuredMode: "test",
      featuredUntil: now + 86400000,
      featuredPaymentId: paid,
    });
  });
  const cards = await t.query(api.listings.getFeatured, {});
  expect(cards).toHaveLength(6);
  expect(cards[0]).toMatchObject({ _id: ids.listings[0], featured: true });
  expect(cards.filter((c) => c.featured)).toHaveLength(1);
  expect(cards.find((c) => c._id === ids.listings[1])?.featured).toBe(false);
  expect(new Set(cards.map((c) => c._id)).size).toBe(6);
  await t.run((ctx) => ctx.db.patch(ids.owner, { identityHold: true }));
  expect(await t.query(api.listings.getFeatured, {})).toEqual([]);
  expect(
    await t.query(api.listings.getById, { id: ids.listings[0] }),
  ).toBeNull();
});
it("a bounded showcase is not a substitute for complete paged marketplace search", async () => {
  const { t, ids } = await fixture(67);
  await t.run(async (ctx) => {
    for (const id of ids.listings.slice(6))
      await ctx.db.patch(id, { moderationHold: true });
  });
  expect(await t.query(api.listings.getFeatured, {})).toEqual([]);
  let cursor: string | null = null,
    done = false;
  const matches = [];
  for (let n = 0; !done && n < 10; n++) {
    const result: FunctionReturnType<typeof api.search.listings> =
      await t.query(api.search.listings, {
        paginationOpts: { cursor, numItems: 10 },
        sort: "newest",
      });
    matches.push(...result.page);
    cursor = result.continueCursor;
    done = result.isDone;
  }
  expect(done).toBe(true);
  expect(new Set(matches.map((row) => row._id))).toEqual(
    new Set(ids.listings.slice(0, 6)),
  );
});
