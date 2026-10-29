import { seedPublishedFixtures } from "./helpers/publication";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { DAY } from "../lib/stays";

const modules = import.meta.glob("../convex/**/*.ts");
const start = Date.UTC(2027, 2, 1);

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (clerkId: string, role: "tenant" | "landlord") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        createdAt: 0,
      });
    const owner = await user("owner", "landlord"),
      tenant = await user("tenant", "tenant"),
      other = await user("other", "tenant");
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Quiet Austin apartment",
      description: "Synthetic test property",
      city: "Austin",
      state: "TX",
      zip: "78701",
      address: "Private test address",
      price: 1800,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: "Apartment",
      amenities: ["WiFi"],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: start,
      minStay: 1,
      status: "active",
      createdAt: 0,
      views: 0,
    });
    return { owner, tenant, other, listing };
  });
  await seedPublishedFixtures(t);
  const tenant = t.withIdentity({ subject: "tenant" });
  const owner = t.withIdentity({ subject: "owner" });
  const other = t.withIdentity({ subject: "other" });
  const request = {
    listingId: ids.listing,
    moveIn: start,
    moveOut: start + 30 * DAY,
    occupants: 1,
    pets: false,
    message: "Traveling for work",
  };
  return { t, ids, tenant, owner, other, request };
}

describe("booking inquiries", () => {
  it("creates a private inquiry and lets its tenant withdraw", async () => {
    const { tenant, owner, other, request } = await fixture();
    const id = await tenant.mutation(api.inquiries.create, request);
    const own = await tenant.query(api.inquiries.getMine, {
      as: "tenant",
      paginationOpts: { cursor: null, numItems: 20 },
    });
    expect(own.page.map((i) => i._id)).toEqual([id]);
    expect(
      (
        await other.query(api.inquiries.getMine, {
          as: "tenant",
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await owner.query(api.inquiries.getMine, {
          as: "landlord",
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page[0].otherName,
    ).toBe("tenant");
    await expect(
      other.mutation(api.inquiries.respond, { id, decision: "withdrawn" }),
    ).rejects.toThrow();
    await tenant.mutation(api.inquiries.respond, { id, decision: "withdrawn" });
    await expect(
      owner.mutation(api.inquiries.respond, { id, decision: "accepted" }),
    ).rejects.toThrow("resolved");
  });

  it("rejects blocked dates, short stays, invalid occupants, pets, duplicates and self-inquiries", async () => {
    const { t, ids, tenant, owner, request } = await fixture();
    await expect(owner.mutation(api.inquiries.create, request)).rejects.toThrow(
      "traveler account",
    );
    await expect(
      tenant.mutation(api.inquiries.create, { ...request, pets: true }),
    ).rejects.toThrow("pets");
    await expect(
      tenant.mutation(api.inquiries.create, { ...request, occupants: 0 }),
    ).rejects.toThrow("occupants");
    await expect(
      tenant.mutation(api.inquiries.create, {
        ...request,
        moveOut: start + DAY,
      }),
    ).rejects.toThrow("30 days");
    await tenant.mutation(api.inquiries.create, request);
    await expect(
      tenant.mutation(api.inquiries.create, request),
    ).rejects.toThrow("already sent");
    await t.run((ctx) =>
      ctx.db.insert("availabilityBlocks", {
        listingId: ids.listing,
        startDate: start + DAY,
        endDate: start + 2 * DAY,
        type: "booked",
        createdAt: 0,
      }),
    );
    await expect(
      tenant.mutation(api.inquiries.create, {
        ...request,
        moveOut: start + 31 * DAY,
      }),
    ).rejects.toThrow("unavailable");
  });

  it("accepts once, blocks the calendar and prevents a competing acceptance", async () => {
    const { t, tenant, owner, other, request } = await fixture();
    const first = await tenant.mutation(api.inquiries.create, request);
    const second = await other.mutation(api.inquiries.create, request);
    const outcomes = await Promise.allSettled([
      owner.mutation(api.inquiries.respond, {
        id: first,
        decision: "accepted",
      }),
      owner.mutation(api.inquiries.respond, {
        id: second,
        decision: "accepted",
      }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(
      await t.run((ctx) => ctx.db.query("availabilityBlocks").collect()),
    ).toHaveLength(1);
    expect(
      await t.query(api.listings.search, {
        moveIn: start,
        moveOut: start + 30 * DAY,
      }),
    ).toEqual([]);
  });
});

describe("search and account behavior", () => {
  it("applies location, budget, utilities, parking, amenities and availability", async () => {
    const { t, ids } = await fixture();
    expect(await t.query(api.listings.search, { location: "Seattle" })).toEqual(
      [],
    );
    expect(await t.query(api.listings.search, { maxPrice: 1700 })).toEqual([]);
    expect(await t.query(api.listings.search, { amenities: ["Pool"] })).toEqual(
      [],
    );
    expect(
      await t.query(api.listings.search, {
        moveIn: start - DAY,
        moveOut: start + 30 * DAY,
      }),
    ).toEqual([]);
    expect(
      await t.query(api.listings.search, {
        location: "Austin, TX",
        amenities: ["WiFi"],
        utilitiesIncluded: true,
        parkingIncluded: true,
      }),
    ).toHaveLength(1);
    await t.run((ctx) =>
      ctx.db.insert("availabilityBlocks", {
        listingId: ids.listing,
        startDate: start - 5 * DAY,
        endDate: start,
        type: "booked",
        createdAt: 0,
      }),
    );
    expect(
      await t.query(api.listings.search, {
        moveIn: start,
        moveOut: start + 30 * DAY,
      }),
    ).toHaveLength(1);
  });

  it("prevents account spoofing while allowing self-service landlord onboarding", async () => {
    const { t, ids, tenant } = await fixture();
    await expect(
      t.mutation(api.users.getOrCreate, {
        clerkId: "tenant",
        name: "Hijacked",
        email: "x@example.test",
      }),
    ).rejects.toThrow();
    await expect(
      tenant.mutation(api.users.getOrCreate, {
        clerkId: "owner",
        name: "Hijacked",
        email: "x@example.test",
      }),
    ).rejects.toThrow();
    await expect(tenant.mutation(api.users.updateRole, {
      userId: ids.tenant,
      role: "landlord",
    })).rejects.toThrow("platform admin");
    const signup = t.withIdentity({subject:"new-owner"});
    const newUser = await signup.mutation(api.users.getOrCreate,{clerkId:"new-owner",name:"New owner",email:"new-owner@example.test"});
    await signup.mutation(api.users.updateRole,{userId:newUser!._id,role:"landlord"});
    await expect(signup.mutation(api.users.updateRole,{userId:newUser!._id,role:"tenant"})).rejects.toThrow("platform admin");
    await expect(
      tenant.mutation(api.users.updateRole, {
        userId: ids.tenant,
        role: "admin",
      }),
    ).rejects.toThrow();
    expect(
      await t.query(api.users.getByClerkId, { clerkId: "tenant" }),
    ).toBeNull();
  });
});

describe("inquiry retry acknowledgement", () => {
  it("concurrent retries create one inquiry, initial message, event and performance count", async () => {
    const { t, tenant, request } = await fixture();
    const args = { ...request, clientRequestId: crypto.randomUUID() };
    const ids = await Promise.all([
      tenant.mutation(api.inquiries.create, args),
      tenant.mutation(api.inquiries.create, args),
    ]);
    expect(ids[0]).toBe(ids[1]);
    expect(
      (await tenant.query(api.bookings.get, { id: ids[0] })).inquiry
        .clientRequestId,
    ).toBe(args.clientRequestId);
    const counts = await t.run(async (ctx) => ({
      inquiries: (await ctx.db.query("bookingInquiries").collect()).length,
      messages: (await ctx.db.query("messages").collect()).length,
      events: (await ctx.db.query("bookingEvents").collect()).length,
      requests: (await ctx.db.query("listingPerformanceDays").collect()).reduce(
        (sum, row) => sum + row.bookingRequests,
        0,
      ),
    }));
    expect(counts).toEqual({
      inquiries: 1,
      messages: 1,
      events: 1,
      requests: 1,
    });
  });
  it("binds a retry reference to the original listing, dates, party, pets and normalized message", async () => {
    const { t, tenant, request } = await fixture(),
      args = { ...request, clientRequestId: crypto.randomUUID() };
    const id = await tenant.mutation(api.inquiries.create, args);
    expect(
      await tenant.mutation(api.inquiries.create, {
        ...args,
        message: ` ${args.message} `,
      }),
    ).toBe(id);
    const secondListing = await t.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = (await ctx.db.get(
        request.listingId,
      ))!;
      return ctx.db.insert("listings", {
        ...fields,
        title: "Different synthetic rental",
      });
    });
    for (const change of [
      { listingId: secondListing },
      { moveIn: request.moveIn + DAY },
      { moveOut: request.moveOut + DAY },
      { occupants: 2 },
      { pets: true },
      { message: "Changed request" },
    ])
      await expect(
        tenant.mutation(api.inquiries.create, { ...args, ...change }),
      ).rejects.toThrow("already used");
  });
  it("recovers the original acknowledgement after confirmation, agreed date changes and hiding without replaying work", async () => {
    const { t, tenant, owner, ids, request } = await fixture(),
      args = { ...request, clientRequestId: crypto.randomUUID() };
    const id = await tenant.mutation(api.inquiries.create, args);
    await owner.mutation(api.inquiries.respond, { id, decision: "accepted" });
    await owner.mutation(api.bookings.recordAgreed, {
      inquiryId: id,
      kind: "dates",
      moveIn: request.moveIn,
      moveOut: request.moveOut + DAY,
      expectedRevision: 1,
      reason: "Synthetic agreed extension",
      agreementConfirmed: true,
      clientRequestId: crypto.randomUUID(),
    });
    await owner.mutation(api.listings.unpublish, { id: ids.listing });
    const before = await t.run(async (ctx) => ({
      events: await ctx.db.query("bookingEvents").collect(),
      blocks: await ctx.db.query("availabilityBlocks").collect(),
      messages: await ctx.db.query("messages").collect(),
    }));
    expect(await tenant.mutation(api.inquiries.create, args)).toBe(id);
    const after = await t.run(async (ctx) => ({
      events: await ctx.db.query("bookingEvents").collect(),
      blocks: await ctx.db.query("availabilityBlocks").collect(),
      messages: await ctx.db.query("messages").collect(),
    }));
    expect(after).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get(id)))?.moveOut).toBe(
      request.moveOut + DAY,
    );
  });
  it("scopes references to the active traveler and does not disclose another traveler's inquiry", async () => {
    const { t, tenant, owner, other, ids, request } = await fixture(),
      args = { ...request, clientRequestId: crypto.randomUUID() };
    const id = await tenant.mutation(api.inquiries.create, args),
      otherId = await other.mutation(api.inquiries.create, args);
    expect(otherId).not.toBe(id);
    await expect(t.mutation(api.inquiries.create, args)).rejects.toThrow(
      "sign in",
    );
    await expect(owner.mutation(api.inquiries.create, args)).rejects.toThrow(
      "traveler account",
    );
    await t.run((ctx) =>
      ctx.db.patch(ids.tenant, { clerkDeletedAt: Date.now() }),
    );
    await expect(tenant.mutation(api.inquiries.create, args)).rejects.toThrow(
      "no longer available",
    );
  });
  it("returns the existing withdrawn request for retries and permits a deliberate fresh request with a new reference", async () => {
    const { tenant, request } = await fixture(),
      args = { ...request, clientRequestId: crypto.randomUUID() };
    const id = await tenant.mutation(api.inquiries.create, args);
    await tenant.mutation(api.inquiries.respond, { id, decision: "withdrawn" });
    expect(await tenant.mutation(api.inquiries.create, args)).toBe(id);
    expect(
      await tenant.mutation(api.inquiries.create, {
        ...args,
        clientRequestId: crypto.randomUUID(),
      }),
    ).not.toBe(id);
  });
  it("refuses empty or malformed references rather than treating them as untracked sends", async () => {
    const { tenant, request } = await fixture();
    for (const clientRequestId of [
      "",
      "invalid",
      "00000000-0000-0000-0000-000000000000",
    ])
      await expect(
        tenant.mutation(api.inquiries.create, { ...request, clientRequestId }),
      ).rejects.toThrow("Invalid inquiry");
  });
});
