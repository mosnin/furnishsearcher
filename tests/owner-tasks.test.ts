import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import geospatial from "./helpers/geospatial";
import { seedPublishedFixtures } from "./helpers/publication";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 26),
  DAY = 86400000;
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
    const owner = await ctx.db.insert("users", {
      clerkId: "tasks-owner",
      role: "landlord",
      name: "Synthetic owner",
      email: "tasks@example.test",
      bio: "Synthetic introduction",
      createdAt: now,
    });
    const tenant = await ctx.db.insert("users", {
      clerkId: "tasks-tenant",
      role: "tenant",
      name: "Traveler",
      email: "traveler@example.test",
      createdAt: now,
    });
    const listings = [];
    for (let n = 0; n < count; n++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: `Synthetic property ${n}`,
          description: "Synthetic",
          address: "Private synthetic street",
          city: "Austin",
          state: "TX",
          zip: "78701",
          bedrooms: 1,
          bathrooms: 1,
          price: 1800,
          minStay: 1,
          availableFrom: now,
          propertyType: "House",
          amenities: [],
          photos: [],
          status: "active",
          petFriendly: false,
          parkingIncluded: false,
          utilitiesIncluded: false,
          views: 0,
          createdAt: now + n,
        }),
      );
    return { owner, tenant, listings };
  });
  if (count) await seedPublishedFixtures(t);
  return {
    t,
    ids,
    owner: t.withIdentity({ subject: "tasks-owner" }),
    tenant: t.withIdentity({ subject: "tasks-tenant" }),
  };
}
const pageArgs = { paginationOpts: { cursor: null, numItems: 10 } };
it("requires an active landlord and never accepts a caller-selected account", async () => {
  const { t, owner, tenant, ids } = await fixture();
  await expect(t.query(api.ownerTasks.account, { refresh: 0 })).rejects.toThrow(
    "sign in",
  );
  await expect(
    tenant.query(api.ownerTasks.account, { refresh: 0 }),
  ).rejects.toThrow("owners");
  await expect(tenant.query(api.ownerTasks.listings, pageArgs)).rejects.toThrow(
    "owners",
  );
  await t.run((ctx) => ctx.db.patch(ids.owner, { clerkDeletedAt: now }));
  await expect(owner.query(api.ownerTasks.listings, pageArgs)).rejects.toThrow(
    "no longer available",
  );
});
it("offers first-listing and optional introduction tasks, which resolve from saved data", async () => {
  const { t, owner, ids } = await fixture(0);
  await t.run((ctx) => ctx.db.patch(ids.owner, { bio: "" }));
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 0 })).tasks.map(
      (t) => t.id,
    ),
  ).toEqual(["identity", "billing", "first-listing", "introduction"]);
  await owner.mutation(api.users.updateProfile, {
    userId: ids.owner,
    bio: "My synthetic introduction",
  });
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 1 })).tasks.some(
      (t) => t.id === "introduction",
    ),
  ).toBe(false);
  await owner.mutation(api.listings.create, {
    landlordId: ids.owner,
    title: "Synthetic draft",
    description: "Synthetic unpublished property",
    address: "123 Synthetic St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    bedrooms: 1,
    bathrooms: 1,
    price: 1800,
    propertyType: "House",
    amenities: [],
    photos: [],
    petFriendly: false,
    parkingIncluded: false,
    utilitiesIncluded: false,
    availableFrom: now,
    minStay: 1,
  });
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 2 })).tasks.some(
      (t) => t.id === "first-listing",
    ),
  ).toBe(false);
});
it("uses actual publication eligibility and follows native hide and publish changes", async () => {
  const { owner, ids } = await fixture();
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 0 })).tasks,
  ).toEqual([]);
  expect((await owner.query(api.ownerTasks.listings, pageArgs)).page).toEqual(
    [],
  );
  await owner.mutation(api.listings.unpublish, { id: ids.listings[0] });
  const hidden = (await owner.query(api.ownerTasks.listings, pageArgs)).page;
  expect(hidden[0].title).toContain("Publish when you are ready");
  expect(hidden[0].href).toBe("/dashboard/landlord/listings");
  expect(hidden[0].issues).toContain(
    "You have not requested publication of this listing.",
  );
  await owner.mutation(api.listings.publish, { id: ids.listings[0] });
  expect((await owner.query(api.ownerTasks.listings, pageArgs)).page).toEqual(
    [],
  );
});
it("directs incomplete, rejected, held and stale-revision listings to the correct resolution", async () => {
  const { t, owner, ids } = await fixture(4);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.listings[0], { description: "" });
    await ctx.db.patch(ids.listings[1], { approvalStatus: "rejected" });
    await ctx.db.patch(ids.listings[2], { moderationHold: true });
    await ctx.db.patch(ids.listings[3], { revision: 2 });
  });
  const items = (await owner.query(api.ownerTasks.listings, pageArgs)).page;
  const find = (id: string) => items.find((t) => t.id === id)!;
  expect(find(ids.listings[0]).href).toBe(
    `/dashboard/landlord/listings/${ids.listings[0]}/edit`,
  );
  expect(find(ids.listings[0]).issues).toContain(
    "Add a title and property description.",
  );
  expect(find(ids.listings[1]).title).toContain("Revise");
  expect(find(ids.listings[2])).toMatchObject({
    href: "/dashboard/support",
    priority: "attention",
  });
  expect(find(ids.listings[3]).title).toContain("Await staff review");
  const encoded = JSON.stringify(items);
  expect(encoded).not.toContain("tasks@example.test");
  expect(encoded).not.toContain("Private synthetic street");
});
it("reads every property page, including empty pages of already-public rentals", async () => {
  const { t, owner, ids } = await fixture(31);
  await t.run(async (ctx) => {
    for (const id of ids.listings.slice(0, 21))
      await ctx.db.patch(id, {
        publicationRequested: false,
        status: "inactive",
      });
  });
  let cursor: string | null = null,
    done = false;
  const seen: string[] = [];
  let pages = 0,
    empty = 0;
  while (!done) {
    const p: FunctionReturnType<typeof api.ownerTasks.listings> =
      await owner.query(api.ownerTasks.listings, {
        paginationOpts: { cursor, numItems: 100 },
      });
    pages++;
    if (!p.page.length) empty++;
    expect(p.page.length).toBeLessThanOrEqual(10);
    seen.push(...p.page.map((t) => t.id));
    cursor = p.continueCursor;
    done = p.isDone;
  }
  expect(pages).toBe(4);
  expect(empty).toBeGreaterThan(0);
  expect(new Set(seen)).toEqual(new Set(ids.listings.slice(0, 21)));
});
it("shows the 35-day verified paid-period boundary, cancellation and actual expiry without trusting refresh time", async () => {
  const { t, owner, ids } = await fixture();
  const sub = await t.run((ctx) =>
    ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", ids.owner))
      .unique(),
  );
  const period = async (days: number, cancelAtPeriodEnd = false) =>
    t.run((ctx) =>
      ctx.db.patch(sub!._id, {
        paidThrough: now + days * DAY,
        currentPeriodEnd: now + days * DAY,
        cancelAtPeriodEnd,
      }),
    );
  await period(36);
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 999999999999999 }))
      .tasks,
  ).toEqual([]);
  await period(35);
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 0 })).tasks[0],
  ).toMatchObject({ id: "renewal", title: "Review your upcoming renewal" });
  await period(1, true);
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 1 })).tasks[0].title,
  ).toBe("Paid access is ending soon");
  vi.setSystemTime(now + DAY);
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 2 })).tasks.map(
      (t) => t.id,
    ),
  ).toContain("billing");
  expect(
    (await owner.query(api.ownerTasks.listings, pageArgs)).page[0].issues,
  ).toContain("Confirm an active paid landlord subscription.");
});
it("does not let wrong-environment or held provider records complete account setup", async () => {
  const { t, owner, ids } = await fixture();
  await t.run(async (ctx) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", ids.owner))
      .unique();
    await ctx.db.patch(sub!._id, { mode: "prod" });
    await ctx.db.patch(ids.owner, { identityHold: true });
  });
  expect(
    (await owner.query(api.ownerTasks.account, { refresh: 0 })).tasks.map(
      (t) => t.id,
    ),
  ).toEqual(["identity", "billing"]);
});
it("isolates another landlord's task collection", async () => {
  const { t } = await fixture(2);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "other-owner",
      role: "landlord",
      name: "Other",
      email: "other@example.test",
      createdAt: now,
    }),
  );
  const other = t.withIdentity({ subject: "other-owner" });
  expect((await other.query(api.ownerTasks.listings, pageArgs)).page).toEqual(
    [],
  );
  expect(
    (await other.query(api.ownerTasks.account, { refresh: 0 })).tasks.map(
      (t) => t.id,
    ),
  ).toContain("first-listing");
});
