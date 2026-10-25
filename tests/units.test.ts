import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
import { parseSearchParams, searchParams } from "../lib/search";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 24),
  paginationOpts = { cursor: null, numItems: 10 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture() {
  const t = convexTest(schema, modules);
  geospatial.register(t);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "landlord" | "admin" | "tenant") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: clerkId + "@example.test",
        createdAt: now,
      });
    return {
      owner: await make("owner", "landlord"),
      other: await make("other", "landlord"),
      staff: await make("staff", "admin"),
      tenant: await make("tenant", "tenant"),
    };
  });
  const owner = t.withIdentity({ subject: "owner" }),
    other = t.withIdentity({ subject: "other" }),
    staff = t.withIdentity({ subject: "staff" });
  const fields = {
    landlordId: ids.owner,
    title: "Synthetic rental space",
    description: "Synthetic independently rentable space",
    address: "100 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "House",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: true,
    parkingIncluded: true,
    availableFrom: now,
    minStay: 1,
  };
  const root = await owner.mutation(api.listings.create, fields);
  await t.run((ctx) =>
    ctx.db.patch(root, {
      status: "active",
      firstPublishedAt: now,
      locationConfirmedAt: now,
      mapLatitude: 30.265,
      mapLongitude: -97.745,
    }),
  );
  await seedPublishedFixtures(t);
  await t.mutation(internal.geo.reindex, { cursor: null });
  async function unit(name = "Garden suite") {
    return owner.mutation(api.listings.create, {
      ...fields,
      parentListingId: root,
      unitName: name,
      independentSpace: true,
    });
  }
  async function publish(id: typeof root) {
    await t.run((ctx) =>
      ctx.db.patch(id, {
        photos: ["https://example.test/a.jpg", "https://example.test/b.jpg"],
      }),
    );
    const l = await t.run((ctx) => ctx.db.get(id));
    await staff.mutation(api.listings.approveListing, {
      id,
      expectedRevision: l!.revision,
    });
    return owner.mutation(api.listings.publish, { id });
  }
  return { t, ids, owner, other, staff, root, fields, unit, publish };
}
describe("property groups and independent units", () => {
  it("creates a real independent listing with shared private address and paginated public alternatives", async () => {
    const { t, owner, other, root, unit, publish } = await fixture();
    const child = await unit();
    const c = await owner.query(api.units.context, { listingId: child });
    expect(c.unitCount).toBe(2);
    expect(c.primaryListingId).toBe(root);
    expect(
      (await owner.query(api.listings.getById, { id: child }))?.mapLatitude,
    ).toBe(30.265);
    expect(
      await t.query(api.units.publicUnits, {
        propertyGroupId: c.propertyGroupId!,
        paginationOpts,
      }),
    ).toMatchObject({ page: [{ _id: root }] });
    await publish(child);
    const page = await t.query(api.units.publicUnits, {
      propertyGroupId: c.propertyGroupId!,
      paginationOpts,
    });
    expect(page.page).toHaveLength(2);
    expect(JSON.stringify(page)).not.toContain("100 Main");
    await owner.mutation(api.listings.unpublish, { id: root });
    expect(await t.query(api.listings.getById, { id: root })).toBeNull();
    expect((await t.query(api.listings.getById, { id: child }))?._id).toBe(
      child,
    );
    await expect(
      other.query(api.units.context, { listingId: child }),
    ).rejects.toThrow("Not authorized");
    await expect(
      owner.mutation(api.listings.deleteListing, { id: root }),
    ).rejects.toThrow("anchors");
  });
  it("requires initial setup, same address, distinct names and an independent-space attestation", async () => {
    const { owner, root, fields, unit, t } = await fixture();
    await expect(
      owner.mutation(api.listings.create, {
        ...fields,
        parentListingId: root,
        unitName: "Room",
        independentSpace: false,
      }),
    ).rejects.toThrow("separate rentable");
    await expect(
      owner.mutation(api.listings.create, {
        ...fields,
        parentListingId: root,
        unitName: "Room",
        independentSpace: true,
        address: "200 Other St",
      }),
    ).rejects.toThrow("same property address");
    await unit();
    await expect(unit("  GARDEN   suite ")).rejects.toThrow("already uses");
    const before = (await owner.query(api.units.context, { listingId: root }))
      .unitCount;
    const draft = await owner.mutation(api.listings.create, fields);
    await expect(
      owner.mutation(api.listings.create, {
        ...fields,
        parentListingId: draft,
        unitName: "Room",
        independentSpace: true,
      }),
    ).rejects.toThrow("Finish and publish");
    expect(
      (await owner.query(api.units.context, { listingId: root })).unitCount,
    ).toBe(before);
    expect((await t.run((ctx) => ctx.db.get(root)))?.revision).toBe(1);
  });
  it("attaches same-address existing listings without replacing their IDs and guards child address changes", async () => {
    const { owner, fields, root, other, t } = await fixture();
    const child = await owner.mutation(api.listings.create, fields);
    await expect(
      other.mutation(api.units.attachExisting, {
        parentListingId: root,
        listingId: child,
        unitName: "Room A",
        independentSpace: true,
      }),
    ).rejects.toThrow("Not authorized");
    await owner.mutation(api.units.attachExisting, {
      parentListingId: root,
      listingId: child,
      unitName: "Room A",
      independentSpace: true,
    });
    const l = await t.run((ctx) => ctx.db.get(child));
    expect(l?.parentListingId).toBe(root);
    expect(l?.approvalStatus).toBe("pending");
    await expect(
      owner.mutation(api.units.attachExisting, {
        parentListingId: root,
        listingId: child,
        unitName: "Room B",
        independentSpace: true,
      }),
    ).rejects.toThrow("ungrouped");
    await expect(
      owner.mutation(api.listings.update, {
        id: child,
        address: "101 Main St",
      }),
    ).rejects.toThrow("address is locked");
    await expect(
      owner.action(api.geo.lookupListing, { listingId: child, consent: true }),
    ).rejects.toThrow("main rental space");
  });
  it("invalidates every unit immediately during a shared address correction and restores only after current confirmation and staff review", async () => {
    const { t, owner, staff, root, unit, publish } = await fixture();
    const child = await unit();
    await publish(child);
    const group = (await owner.query(api.units.context, { listingId: root }))
      .propertyGroupId!;
    await staff.mutation(api.geo.correctAddress, {
      listingId: root,
      address: "100 Main Street",
      city: "Austin",
      state: "TX",
      zip: "78701",
      note: "Correct the street spelling",
    });
    expect(await t.query(api.listings.getById, { id: child })).toBeNull();
    expect(
      (
        await t.query(api.units.publicUnits, {
          propertyGroupId: group,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(0);
    await expect(
      staff.mutation(api.geo.correctAddress, {
        listingId: child,
        address: "100 Main Street",
        city: "Austin",
        state: "TX",
        zip: "78701",
        note: "Child should not correct",
      }),
    ).rejects.toThrow("main rental space");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                addressMatches: [
                  {
                    matchedAddress: "100 MAIN ST, AUSTIN, TX, 78701",
                    addressComponents: { state: "TX", zip: "78701" },
                    coordinates: { x: -97.7432, y: 30.2671 },
                  },
                ],
              },
            }),
          ),
      ),
    );
    await owner.action(api.geo.lookupListing, {
      listingId: root,
      consent: true,
    });
    const state = await owner.query(api.geo.mine, { listingId: root });
    await owner.mutation(api.geo.confirm, {
      listingId: root,
      generation: state!.generation,
      candidate: 0,
    });
    await t.mutation(internal.units.syncLocation, {
      propertyId: group,
      version: 2,
      cursor: null,
    });
    expect(await t.query(api.listings.getById, { id: child })).toBeNull();
    const l = await t.run((ctx) => ctx.db.get(root));
    await staff.mutation(api.listings.approveListing, {
      id: root,
      expectedRevision: l!.revision,
    });
    await t.mutation(internal.units.syncLocation, {
      propertyId: group,
      version: 2,
      cursor: null,
    });
    expect((await t.query(api.listings.getById, { id: child }))?._id).toBe(
      child,
    );
  });
  it("counts units against Pro's five slots, preserves existing active spaces and prefers a paid Premium entitlement", async () => {
    const { t, ids, unit, publish, owner, root } = await fixture();
    await t.run(async (ctx) => {
      const subscription = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", ids.owner))
        .first();
      await ctx.db.patch(subscription!._id, { plan: "landlord_pro" });
    });
    const children = [];
    for (let i = 0; i < 5; i++) {
      const child = await unit("Space " + i);
      children.push(child);
      const state = await publish(child);
      expect(state.live).toBe(i < 4);
      if (i === 4) expect(state.issues.join(" ")).toContain("five active");
    }
    await owner.mutation(api.listings.unpublish, { id: root });
    expect(
      (await owner.mutation(api.listings.publish, { id: children[4] })).live,
    ).toBe(true);
    await t.run((ctx) =>
      ctx.db.insert("subscriptions", {
        userId: ids.owner,
        creemSubscriptionId: "synthetic-premium",
        creemProductId: "prod_QA",
        plan: "landlord_premium",
        mode: "test",
        status: "active",
        verifiedAt: now,
        paidThrough: now + 1000,
        currentPeriodStart: now - 1,
        currentPeriodEnd: now + 1000,
        createdAt: now,
        updatedAt: now,
      }),
    );
    expect(
      (await owner.mutation(api.listings.publish, { id: root })).live,
    ).toBe(true);
  });
  it("keeps unit date availability separate and prevents deleting a unit with an accepted future stay", async () => {
    const { t, ids, owner, root, unit, publish } = await fixture();
    const child = await unit();
    await publish(child);
    const group = (await owner.query(api.units.context, { listingId: root }))
      .propertyGroupId!;
    const start = now + 86400000,
      end = start + 31 * 86400000;
    await t.run(async (ctx) => {
      await ctx.db.insert("availabilityBlocks", {
        listingId: child,
        startDate: start,
        endDate: end,
        type: "unavailable",
        createdAt: now,
      });
    });
    const page = await t.query(api.units.publicUnits, {
      propertyGroupId: group,
      moveIn: start,
      moveOut: end,
      paginationOpts,
    });
    expect(page.page.map((l) => l._id)).toEqual([root]);
    await expect(
      t.query(api.units.publicUnits, {
        propertyGroupId: group,
        moveIn: start,
        paginationOpts,
      }),
    ).rejects.toThrow();
    // Accepted stays retain their unit association; deleting a unit must not erase its calendar anchor.
    await t.run((ctx) =>
      ctx.db.insert("bookingInquiries", {
        listingId: child,
        landlordId: ids.owner,
        tenantId: ids.tenant,
        moveIn: start,
        moveOut: end,
        status: "accepted",
        createdAt: now,
        message: "Synthetic stay",
        updatedAt: now,
        occupants: 1,
        pets: false,
      }),
    );
    await expect(
      owner.mutation(api.listings.deleteListing, { id: child }),
    ).rejects.toThrow("accepted stay");
  });
  it("synchronizes shared corrections in bounded pages, ignores stale jobs and audits unit deletion", async () => {
    const { t, owner, staff, root, unit } = await fixture();
    const children = [];
    for (let i = 0; i < 10; i++) children.push(await unit(`Paged space ${i}`));
    const propertyId = (
      await owner.query(api.units.context, { listingId: root })
    ).propertyGroupId!;
    const first = await owner.query(api.units.mine, {
      listingId: root,
      paginationOpts: { cursor: null, numItems: 8 },
    });
    expect(first.isDone).toBe(false);
    await staff.mutation(api.geo.correctAddress, {
      listingId: root,
      address: "100 Main Street",
      city: "Austin",
      state: "TX",
      zip: "78701",
      note: "Correct shared street spelling",
    });
    await t.mutation(internal.units.syncLocation, {
      propertyId,
      version: 2,
      cursor: null,
    });
    const count = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("listings")
            .withIndex("by_property", (q) =>
              q.eq("propertyGroupId", propertyId),
            )
            .collect()
        ).filter((l) => l.propertyLocationVersion === 2).length,
    );
    expect(count).toBe(8);
    await t.mutation(internal.units.syncLocation, {
      propertyId,
      version: 2,
      cursor: first.continueCursor,
    });
    await t.mutation(internal.units.syncLocation, {
      propertyId,
      version: 1,
      cursor: null,
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("listings")
        .withIndex("by_property", (q) => q.eq("propertyGroupId", propertyId))
        .collect(),
    );
    expect(rows).toHaveLength(11);
    expect(
      rows.every(
        (l) => l.propertyLocationVersion === 2 && l.mapLatitude === undefined,
      ),
    ).toBe(true);
    await owner.mutation(api.listings.update, {
      id: children[0],
      unitName: "Renamed room",
    });
    await expect(
      owner.mutation(api.listings.update, {
        id: children[1],
        unitName: "Renamed room",
      }),
    ).rejects.toThrow("already uses");
    await owner.mutation(api.listings.deleteListing, { id: children[0] });
    expect(
      (await owner.query(api.units.context, { listingId: root })).unitCount,
    ).toBe(10);
    const history = await owner.query(api.units.history, {
      listingId: root,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    expect(history.page.some((e) => e.action === "unit_deleted")).toBe(true);
  });
  it("persists the group criterion through URL and saved-search normalization", () => {
    expect(
      parseSearchParams(
        searchParams({ propertyGroupId: "test-group", sort: "price_asc" }),
      ),
    ).toMatchObject({ propertyGroupId: "test-group", sort: "price_asc" });
  });
});
