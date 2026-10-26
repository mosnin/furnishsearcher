import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2026, 9, 26);
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
    const user = async (clerkId: string, role: "landlord" | "tenant") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: "Synthetic",
        email: `${clerkId}@example.test`,
        createdAt: now,
      });
    const owner = await user("directory-owner", "landlord"),
      other = await user("directory-other", "landlord"),
      tenant = await user("directory-tenant", "tenant");
    const listings = [];
    for (let n = 0; n < count; n++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: `Synthetic property ${n}`,
          description: "Synthetic private rental",
          address: n === 0 ? "123 Juniper Lane" : "456 Other Street",
          publicId: `FS-${100000 + n}`,
          city: n === 0 ? "San José" : "Austin",
          state: n === 0 ? "CA" : "TX",
          zip: "78701",
          price: 1800,
          bedrooms: 1,
          bathrooms: 1,
          propertyType: "House",
          amenities: [],
          photos: [
            "https://images.example.test/a",
            "https://images.example.test/b",
          ],
          petFriendly: false,
          utilitiesIncluded: false,
          parkingIncluded: false,
          availableFrom: now,
          minStay: 1,
          status: "active",
          views: 0,
          revision: 2,
          approvedRevision: 2,
          approvalStatus: "approved",
          publicationRequested: false,
          // The explicit createdAt index is also checked after a timestamp correction below.
          createdAt: now + n,
        }),
      );
    const { _id, _creationTime, ...fields } = (await ctx.db.get(listings[0]))!;
    const foreign = await ctx.db.insert("listings", {
      ...fields,
      landlordId: other,
      title: "Foreign private headline",
    });
    return { owner, other, tenant, listings, foreign };
  });
  return {
    t,
    ids,
    owner: t.withIdentity({ subject: "directory-owner" }),
    other: t.withIdentity({ subject: "directory-other" }),
    tenant: t.withIdentity({ subject: "directory-tenant" }),
  };
}
const first = { paginationOpts: { cursor: null, numItems: 10 } };
it("requires an active landlord, binds ownership and never leaks private search results", async () => {
  const { t, owner, tenant, ids } = await fixture();
  await expect(t.query(api.ownerDirectory.list, first)).rejects.toThrow(
    "sign in",
  );
  await expect(tenant.query(api.ownerDirectory.list, first)).rejects.toThrow(
    "owners",
  );
  await expect(
    owner.query(api.ownerDirectory.list, {
      ...first,
      landlordId: ids.other,
    } as never),
  ).rejects.toThrow();
  expect(
    (
      await owner.query(api.ownerDirectory.list, {
        ...first,
        keyword: "Foreign private headline",
      })
    ).page,
  ).toEqual([]);
  expect(
    (await owner.query(api.ownerDirectory.list, first)).page[0].address,
  ).toBe("123 Juniper Lane");
  await t.run((ctx) => ctx.db.patch(ids.owner, { clerkDeletedAt: now }));
  await expect(owner.query(api.ownerDirectory.list, first)).rejects.toThrow(
    "no longer available",
  );
});
it("pages 127 candidates without losing matches beyond empty pages or claiming exhaustive results early", async () => {
  const { owner, ids } = await fixture(127);
  const oversized = await owner.query(api.ownerDirectory.list, {
    paginationOpts: { cursor: null, numItems: 1000 },
  });
  expect(oversized.page).toHaveLength(10);
  expect(oversized.page[0]._id).toBe(ids.listings[126]);
  let cursor: string | null = null,
    done = false,
    pages = 0;
  const matches = [];
  while (!done) {
    const result: FunctionReturnType<typeof api.ownerDirectory.list> =
      await owner.query(api.ownerDirectory.list, {
        paginationOpts: { cursor, numItems: 10 },
        keyword: "juniper",
        city: "san jose",
        state: " ca ",
      });
    if (!pages) {
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(false);
    }
    matches.push(...result.page);
    cursor = result.continueCursor;
    done = result.isDone;
    expect(++pages).toBeLessThan(20);
  }
  expect(pages).toBe(13);
  expect(matches.map((row) => row._id)).toEqual([ids.listings[0]]);
});
it("searches normalized headline, private address, property number, native ID and unit name with combined filters", async () => {
  const { t, owner, ids } = await fixture();
  await t.run((ctx) =>
    ctx.db.patch(ids.listings[0], { unitName: "Garden Suite" }),
  );
  for (const keyword of [
    "synthetic property",
    "123 JUNIPER",
    "fs-100000",
    "FS100000",
    ids.listings[0],
    "garden suite",
  ])
    expect(
      (
        await owner.query(api.ownerDirectory.list, {
          ...first,
          keyword,
          city: "SAN JOSE",
          state: "CA",
        })
      ).page,
    ).toHaveLength(1);
  expect(
    (await owner.query(api.ownerDirectory.list, { ...first, city: "San" }))
      .page,
  ).toHaveLength(0);
  expect(
    (await owner.query(api.ownerDirectory.list, { ...first, state: "TX" }))
      .page,
  ).toHaveLength(0);
  await expect(
    owner.query(api.ownerDirectory.list, { ...first, state: "XX" }),
  ).rejects.toThrow("valid state");
  await expect(
    owner.query(api.ownerDirectory.list, {
      ...first,
      keyword: "a".repeat(201),
    }),
  ).rejects.toThrow("Shorten");
});
it("excludes only explicitly hidden child units, preserving roots, pending units and legacy unknown intent", async () => {
  const { t, owner, ids } = await fixture(4);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.listings[1], {
      parentListingId: ids.listings[0],
      publicationRequested: false,
    });
    await ctx.db.patch(ids.listings[2], {
      parentListingId: ids.listings[0],
      publicationRequested: true,
      approvalStatus: "pending",
    });
    await ctx.db.patch(ids.listings[3], {
      parentListingId: ids.listings[0],
      publicationRequested: undefined,
    });
  });
  const all = await owner.query(api.ownerDirectory.list, first);
  expect(all.page.find((row) => row._id === ids.listings[1])?.hiddenUnit).toBe(
    true,
  );
  const shown = await owner.query(api.ownerDirectory.list, {
    ...first,
    includeHiddenUnits: false,
  });
  expect(shown.page.map((row) => row._id)).toEqual([
    ids.listings[3],
    ids.listings[2],
    ids.listings[0],
  ]);
});
it("uses current live eligibility, content and approved revision rather than raw active flags", async () => {
  const { t, owner, ids } = await fixture(5);
  await seedPublishedFixtures(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.listings[1], { approvedRevision: 1 });
    await ctx.db.patch(ids.listings[2], { description: "" });
    await ctx.db.patch(ids.listings[3], { approvalStatus: "rejected" });
    await ctx.db.patch(ids.listings[4], { publicationRequested: false });
  });
  const rows = (await owner.query(api.ownerDirectory.list, first)).page;
  expect(Object.fromEntries(rows.map((row) => [row._id, row.status]))).toEqual({
    [ids.listings[0]]: "active",
    [ids.listings[1]]: "pending",
    [ids.listings[2]]: "incomplete",
    [ids.listings[3]]: "rejected",
    [ids.listings[4]]: "inactive",
  });
  for (const status of [
    "active",
    "pending",
    "incomplete",
    "rejected",
    "inactive",
  ] as const)
    expect(
      (
        await owner.query(api.ownerDirectory.list, { ...first, status })
      ).page.map((row) => row.status),
    ).toEqual([status]);
  await t.run((ctx) => ctx.db.patch(ids.owner, { identityHold: true }));
  expect(
    (await owner.query(api.ownerDirectory.list, { ...first, status: "active" }))
      .page,
  ).toEqual([]);
});

it("orders by the listing creation timestamp and immediately reflects native edits", async () => {
  const { t, owner, ids } = await fixture(12);
  await t.run((ctx) =>
    ctx.db.patch(ids.listings[0], {
      createdAt: now + 1000,
      title: "Updated private headline",
      city: "Boston",
      state: "MA",
    }),
  );
  expect((await owner.query(api.ownerDirectory.list, first)).page[0]._id).toBe(
    ids.listings[0],
  );
  expect(
    (
      await owner.query(api.ownerDirectory.list, {
        ...first,
        keyword: "updated headline",
        city: "boston",
        state: "MA",
      })
    ).page.map((row) => row._id),
  ).toEqual([ids.listings[0]]);
  expect(
    (await owner.query(api.ownerDirectory.list, { ...first, city: "san jose" }))
      .page,
  ).toEqual([]);
});
