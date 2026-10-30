import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2027, 0, 1);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture(count = 2) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "tenant" | "landlord") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        createdAt: now,
      });
    const owner = await make("saved-owner", "landlord"),
      traveler = await make("saved-traveler", "tenant"),
      other = await make("saved-other", "tenant");
    const listings = [];
    for (let i = 0; i < count; i++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: `Synthetic rental ${i}`,
          description: "Synthetic",
          address: "Private exact address",
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
          parkingIncluded: false,
          availableFrom: now,
          minStay: 1,
          status: "active",
          createdAt: now,
          views: 0,
        }),
      );
    return { owner, traveler, other, listings };
  });
  await seedPublishedFixtures(t);
  const traveler = t.withIdentity({ subject: "saved-traveler" }),
    other = t.withIdentity({ subject: "saved-other" });
  const save = (listingId = ids.listings[0]) =>
    traveler.mutation(api.saved.save, { tenantId: ids.traveler, listingId });
  return { t, ids, traveler, other, save };
}
it("deduplicates repeated and concurrent native saves without double-counting activity", async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([f.save(), f.save()]);
  expect(a).toBe(b);
  expect(await f.save()).toBe(a);
  expect(
    (
      await f.traveler.query(api.saved.mine, {
        paginationOpts: { cursor: null, numItems: 18 },
      })
    ).page,
  ).toHaveLength(1);
  const performance = await f.t.run((ctx) =>
    ctx.db.query("listingPerformanceDays").first(),
  );
  expect(performance?.saves).toBe(1);
});
it("reaches every saved entry beyond one page in saved-time order, with current public-card projections", async () => {
  const f = await fixture(130);
  await f.t.run(async (ctx) => {
    for (const [i, listingId] of f.ids.listings.entries())
      await ctx.db.insert("savedListings", {
        tenantId: f.ids.traveler,
        listingId,
        savedAt: now + ((i * 7) % 130),
      });
    for (const listingId of f.ids.listings.slice(0, 20))
      await ctx.db.patch(listingId, { status: "inactive" });
  });
  let cursor: string | null = null;
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const result: FunctionReturnType<typeof api.saved.mine> =
      await f.traveler.query(api.saved.mine, {
        paginationOpts: { cursor, numItems: 18 },
      });
    rows.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(rows).toHaveLength(130);
  expect(new Set(rows.map((r) => r.listingId)).size).toBe(130);
  expect(rows.map((r) => r.savedAt)).toEqual(
    [...rows.map((r) => r.savedAt)].sort((a, b) => b - a),
  );
  expect(rows.filter((r) => r.listing === null)).toHaveLength(20);
  const card = rows.find((r) => r.listing)?.listing;
  expect(card?.photos).toHaveLength(2);
  for (const key of [
    "address",
    "zip",
    "identityCheckId",
    "moderationHold",
    "approvedRevision",
    "photoAssets",
  ])
    expect(card).not.toHaveProperty(key);
});
it("retains unavailable favorites privately, restores current public details and allows removal while hidden", async () => {
  const f = await fixture(),
    id = f.ids.listings[0];
  await f.save();
  await f.t.run((ctx) =>
    ctx.db.patch(id, {
      status: "inactive",
      title: "Private unpublished replacement",
    }),
  );
  let page = await f.traveler.query(api.saved.mine, {
    paginationOpts: { cursor: null, numItems: 18 },
  });
  expect(page.page).toHaveLength(1);
  expect(page.page[0].listing).toBeNull();
  expect(JSON.stringify(page)).not.toContain("Private unpublished replacement");
  expect(
    await f.traveler.query(api.saved.getSaved, { tenantId: f.ids.traveler }),
  ).toEqual([]);
  await f.t.run((ctx) => ctx.db.patch(id, { status: "active" }));
  page = await f.traveler.query(api.saved.mine, {
    paginationOpts: { cursor: null, numItems: 18 },
  });
  expect(page.page[0].listing?.title).toBe("Private unpublished replacement");
  await f.t.run((ctx) => ctx.db.patch(id, { status: "inactive" }));
  await f.traveler.mutation(api.saved.unsave, {
    tenantId: f.ids.traveler,
    listingId: id,
  });
  expect((await f.traveler.query(api.saved.summary, {})).count).toBe(0);
});
it("allows removing a dangling favorite without revealing a missing listing", async () => {
  const f = await fixture(),
    id = f.ids.listings[0];
  await f.save();
  await f.t.run((ctx) => ctx.db.delete(id));
  expect(
    (
      await f.traveler.query(api.saved.mine, {
        paginationOpts: { cursor: null, numItems: 18 },
      })
    ).page[0].listing,
  ).toBeNull();
  await f.traveler.mutation(api.saved.unsave, {
    tenantId: f.ids.traveler,
    listingId: id,
  });
  expect((await f.traveler.query(api.saved.summary, {})).count).toBe(0);
});
it("bounds dashboard/compatibility previews and labels large counts as lower bounds", async () => {
  const f = await fixture(125);
  await f.t.run(async (ctx) => {
    for (const [i, listingId] of f.ids.listings.entries())
      await ctx.db.insert("savedListings", {
        tenantId: f.ids.traveler,
        listingId,
        savedAt: now + i,
      });
  });
  const summary = await f.traveler.query(api.saved.summary, {});
  expect(summary.count).toBe(100);
  expect(summary.hasMore).toBe(true);
  expect(summary.recent).toHaveLength(3);
  expect(
    await f.traveler.query(api.saved.getSaved, { tenantId: f.ids.traveler }),
  ).toHaveLength(10);
  expect((await f.other.query(api.saved.summary, {})).count).toBe(0);
});
it("enforces account ownership and rejects anonymous/deleted identities across modern and legacy access", async () => {
  const f = await fixture();
  await f.save();
  await expect(
    f.t.query(api.saved.mine, {
      paginationOpts: { cursor: null, numItems: 18 },
    }),
  ).rejects.toThrow("sign in");
  await expect(f.t.query(api.saved.summary, {})).rejects.toThrow("sign in");
  expect(
    await f.other.query(api.saved.getSaved, { tenantId: f.ids.traveler }),
  ).toEqual([]);
  expect(
    await f.other.query(api.saved.isSaved, {
      tenantId: f.ids.traveler,
      listingId: f.ids.listings[0],
    }),
  ).toBe(false);
  await expect(
    f.other.mutation(api.saved.unsave, {
      tenantId: f.ids.traveler,
      listingId: f.ids.listings[0],
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    f.other.mutation(api.saved.save, {
      tenantId: f.ids.traveler,
      listingId: f.ids.listings[1],
    }),
  ).rejects.toThrow("Not authorized");
  await f.t.run((ctx) => ctx.db.patch(f.ids.traveler, { clerkDeletedAt: now }));
  await expect(f.traveler.query(api.saved.summary, {})).rejects.toThrow(
    "no longer available",
  );
  expect(
    await f.traveler.query(api.saved.getSaved, { tenantId: f.ids.traveler }),
  ).toEqual([]);
});
it("will not newly save an unavailable or unqualified listing", async () => {
  const f = await fixture(),
    id = f.ids.listings[0];
  await f.t.run((ctx) => ctx.db.patch(id, { status: "inactive" }));
  await expect(f.save()).rejects.toThrow("unavailable");
  await f.t.run((ctx) =>
    ctx.db.patch(id, { status: "active", approvedRevision: 999 }),
  );
  await expect(f.save()).rejects.toThrow("unavailable");
  expect((await f.traveler.query(api.saved.summary, {})).count).toBe(0);
});
it("deduplicates uncertain unsave retries and records one real removal", async () => {
  const f = await fixture();
  const id = await f.save();
  const results = await Promise.all(
    [0, 1].map(() =>
      f.traveler.mutation(api.saved.unsave, {
        tenantId: f.ids.traveler,
        listingId: f.ids.listings[0],
      }),
    ),
  );
  expect(results.filter((r) => r === id)).toHaveLength(1);
  expect(results.filter((r) => r === null)).toHaveLength(1);
  const performance = await f.t.run((ctx) =>
    ctx.db.query("listingPerformanceDays").first(),
  );
  expect(performance?.saves).toBe(1);
  expect(performance?.unsaves).toBe(1);
});
