import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import {
  emptyListingDetails,
  validateListingDetails,
  type ListingDetails,
} from "../lib/listing-details";
import { formatStayDate } from "../lib/utils";
const modules = import.meta.glob("../convex/**/*.ts");
const details: ListingDetails = {
  bathroomDetails: [{ name: "Bathroom 1", description: "Private full bath" }],
  rooms: [{ name: " Bedroom 1 ", beds: "One queen and one twin bed" }],
  fees: [
    {
      name: "Security deposit",
      amount: 1000.25,
      refundable: true,
      frequency: "once",
    },
    { name: "Pet rent", amount: 30, refundable: false, frequency: "monthly" },
  ],
  smoking: "prohibited",
  maxVehicles: 0,
  rules: " Quiet hours after 10 PM. ",
  facilities: [{ name: "Synthetic hospital", miles: 1.2 }],
};
async function fixture() {
  const t = convexTest(schema, modules);
  const owner = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "owner",
      name: "Owner",
      email: "owner@example.test",
      role: "landlord",
      createdAt: 0,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "other",
      name: "Other",
      email: "other@example.test",
      role: "landlord",
      createdAt: 0,
    }),
  );
  const data = {
    landlordId: owner,
    title: "Synthetic rental",
    description: "Synthetic",
    city: "Austin",
    state: "TX",
    address: "Synthetic",
    zip: "78701",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: [],
    photos: [],
    petFriendly: true,
    utilitiesIncluded: true,
    parkingIncluded: false,
    availableFrom: Date.UTC(2027, 0, 1),
    minStay: 1,
  };
  return {
    t,
    owner: t.withIdentity({ subject: "owner" }),
    other: t.withIdentity({ subject: "other" }),
    data,
  };
}
describe("owner-supplied listing details", () => {
  it("preserves the rental date in time zones west of UTC", () => {
    expect(formatStayDate(Date.UTC(2027, 2, 6))).toBe("Mar 6, 2027");
  });
  it("persists create, partial updates, public display data, explicit clearing and legacy omissions", async () => {
    const { t, owner, data } = await fixture();
    const id = await owner.mutation(api.listings.create, { ...data, details });
    await owner.mutation(api.listings.update, { id, title: "Updated" });
    await t.run((ctx) => ctx.db.patch(id, { status: "active" }));
    const listing = await owner.query(api.listings.getById, { id });
    expect(listing?.details).toEqual({
      ...details,
      rooms: [{ ...details.rooms[0], name: "Bedroom 1" }],
      rules: "Quiet hours after 10 PM.",
    });
    await owner.mutation(api.listings.update, {
      id,
      details: emptyListingDetails(),
    });
    expect(
      (await owner.query(api.listings.getById, { id }))?.details?.fees,
    ).toEqual([]);
    const legacy = await owner.mutation(api.listings.create, data);
    expect(
      (await owner.query(api.listings.getById, { id: legacy }))?.details,
    ).toBeUndefined();
  });
  it("rejects unauthenticated and unrelated owner writes", async () => {
    const { t, owner, other, data } = await fixture();
    const id = await owner.mutation(api.listings.create, data);
    await expect(
      t.mutation(api.listings.update, { id, details }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      other.mutation(api.listings.update, { id, details }),
    ).rejects.toThrow("Not authorized");
    expect(
      (await owner.query(api.listings.getById, { id }))?.details,
    ).toBeUndefined();
  });
  it("enforces limits and dollar precision on both create and edit", async () => {
    const { owner, data } = await fixture();
    const invalid = { ...details, fees: [{ ...details.fees[0], amount: -1 }] };
    await expect(
      owner.mutation(api.listings.create, { ...data, details: invalid }),
    ).rejects.toThrow("Fee amounts");
    const id = await owner.mutation(api.listings.create, data);
    await expect(
      owner.mutation(api.listings.update, {
        id,
        details: { ...details, fees: [{ ...details.fees[0], amount: 1.001 }] },
      }),
    ).rejects.toThrow("Fee amounts");
    for (const bad of [
      { maxVehicles: 0.5 },
      { facilities: [{ name: "Hospital", miles: 501 }] },
      { rooms: [{ name: " ", beds: "Queen" }] },
      { rules: "x".repeat(4001) },
      { rooms: Array(31).fill(details.rooms[0]) },
    ])
      expect(() => validateListingDetails({ ...details, ...bad })).toThrow();
    expect(validateListingDetails(details).fees[0].amount).toBe(1000.25);
  });
});
