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
  const ids = await t.run(async ctx => {
    const user = (clerkId: string, role: "tenant" | "landlord") => ctx.db.insert("users", {
      clerkId, role, name: clerkId, email: `${clerkId}@example.test`, createdAt: 0,
    });
    const owner = await user("owner", "landlord"), tenant = await user("tenant", "tenant"), other = await user("other", "tenant");
    const listing = await ctx.db.insert("listings", {
      landlordId: owner, title: "Quiet Austin apartment", description: "Synthetic test property", city: "Austin", state: "TX", zip: "78701",
      address: "Private test address", price: 1800, bedrooms: 2, bathrooms: 1, propertyType: "Apartment", amenities: ["WiFi"],
      photos: [], petFriendly: false, utilitiesIncluded: true, parkingIncluded: true,
      availableFrom: start, minStay: 1, status: "active", createdAt: 0, views: 0,
    });
    return { owner, tenant, other, listing };
  });
  await seedPublishedFixtures(t);
  const tenant = t.withIdentity({ subject: "tenant" });
  const owner = t.withIdentity({ subject: "owner" });
  const other = t.withIdentity({ subject: "other" });
  const request = { listingId: ids.listing, moveIn: start, moveOut: start + 30 * DAY, occupants: 1, pets: false, message: "Traveling for work" };
  return { t, ids, tenant, owner, other, request };
}

describe("booking inquiries", () => {
  it("creates a private inquiry and lets its tenant withdraw", async () => {
    const { tenant, owner, other, request } = await fixture();
    const id = await tenant.mutation(api.inquiries.create, request);
    const own = await tenant.query(api.inquiries.getMine, { as: "tenant", paginationOpts: { cursor: null, numItems: 20 } });
    expect(own.page.map(i => i._id)).toEqual([id]);
    expect((await other.query(api.inquiries.getMine, { as: "tenant", paginationOpts: { cursor: null, numItems: 20 } })).page).toEqual([]);
    expect((await owner.query(api.inquiries.getMine, { as: "landlord", paginationOpts: { cursor: null, numItems: 20 } })).page[0].otherName).toBe("tenant");
    await expect(other.mutation(api.inquiries.respond, { id, decision: "withdrawn" })).rejects.toThrow();
    await tenant.mutation(api.inquiries.respond, { id, decision: "withdrawn" });
    await expect(owner.mutation(api.inquiries.respond, { id, decision: "accepted" })).rejects.toThrow("resolved");
  });

  it("rejects blocked dates, short stays, invalid occupants, pets, duplicates and self-inquiries", async () => {
    const { t, ids, tenant, owner, request } = await fixture();
    await expect(owner.mutation(api.inquiries.create, request)).rejects.toThrow("own property");
    await expect(tenant.mutation(api.inquiries.create, { ...request, pets: true })).rejects.toThrow("pets");
    await expect(tenant.mutation(api.inquiries.create, { ...request, occupants: 0 })).rejects.toThrow("occupants");
    await expect(tenant.mutation(api.inquiries.create, { ...request, moveOut: start + DAY })).rejects.toThrow("30 days");
    await tenant.mutation(api.inquiries.create, request);
    await expect(tenant.mutation(api.inquiries.create, request)).rejects.toThrow("already sent");
    await t.run(ctx => ctx.db.insert("availabilityBlocks", { listingId: ids.listing, startDate: start + DAY, endDate: start + 2 * DAY, type: "booked", createdAt: 0 }));
    await expect(tenant.mutation(api.inquiries.create, { ...request, moveOut: start + 31 * DAY })).rejects.toThrow("unavailable");
  });

  it("accepts once, blocks the calendar and prevents a competing acceptance", async () => {
    const { t, tenant, owner, other, request } = await fixture();
    const first = await tenant.mutation(api.inquiries.create, request);
    const second = await other.mutation(api.inquiries.create, request);
    const outcomes = await Promise.allSettled([
      owner.mutation(api.inquiries.respond, { id: first, decision: "accepted" }),
      owner.mutation(api.inquiries.respond, { id: second, decision: "accepted" }),
    ]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    expect((await t.run(ctx => ctx.db.query("availabilityBlocks").collect()))).toHaveLength(1);
    expect(await t.query(api.listings.search, { moveIn: start, moveOut: start + 30 * DAY })).toEqual([]);
  });
});

describe("search and account behavior", () => {
  it("applies location, budget, utilities, parking, amenities and availability", async () => {
    const { t, ids } = await fixture();
    expect(await t.query(api.listings.search, { location: "Seattle" })).toEqual([]);
    expect(await t.query(api.listings.search, { maxPrice: 1700 })).toEqual([]);
    expect(await t.query(api.listings.search, { amenities: ["Pool"] })).toEqual([]);
    expect(await t.query(api.listings.search, { moveIn: start - DAY, moveOut: start + 30 * DAY })).toEqual([]);
    expect(await t.query(api.listings.search, { location: "Austin, TX", amenities: ["WiFi"], utilitiesIncluded: true, parkingIncluded: true })).toHaveLength(1);
    await t.run(ctx => ctx.db.insert("availabilityBlocks", { listingId: ids.listing, startDate: start - 5 * DAY, endDate: start, type: "booked", createdAt: 0 }));
    expect(await t.query(api.listings.search, { moveIn: start, moveOut: start + 30 * DAY })).toHaveLength(1);
  });

  it("prevents account spoofing while allowing self-service landlord onboarding", async () => {
    const { t, ids, tenant } = await fixture();
    await expect(t.mutation(api.users.getOrCreate, { clerkId: "tenant", name: "Hijacked", email: "x@example.test" })).rejects.toThrow();
    await expect(tenant.mutation(api.users.getOrCreate, { clerkId: "owner", name: "Hijacked", email: "x@example.test" })).rejects.toThrow();
    await tenant.mutation(api.users.updateRole, { userId: ids.tenant, role: "landlord" });
    await expect(tenant.mutation(api.users.updateRole, { userId: ids.tenant, role: "admin" })).rejects.toThrow();
    expect(await t.query(api.users.getByClerkId, { clerkId: "tenant" })).toBeNull();
  });
});
