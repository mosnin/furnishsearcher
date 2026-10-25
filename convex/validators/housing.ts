import { v } from "convex/values";

export const leadResponse = v.object({
  conversationId: v.id("conversations"),
  listingId: v.id("listings"),
  propertyId: v.optional(v.id("properties")),
  propertyTitle: v.optional(v.string()),
  title: v.string(),
  unitName: v.optional(v.string()),
  respondedAt: v.optional(v.number()),
});

export const housingCriteria = {
  allowUnmatched: v.optional(v.boolean()),
  city: v.string(),
  state: v.string(),
  moveInDate: v.number(),
  duration: v.number(),
  maxBudget: v.number(),
  bedrooms: v.number(),
  petFriendly: v.boolean(),
  description: v.string(),
  moveOutDate: v.optional(v.number()),
  nearbyCities: v.optional(v.array(v.string())),
  propertyType: v.optional(v.string()),
  utilitiesIncluded: v.optional(v.boolean()),
  parkingIncluded: v.optional(v.boolean()),
  amenities: v.optional(v.array(v.string())),
  occupants: v.optional(v.number()),
  workplace: v.optional(v.string()),
  contactPreference: v.optional(
    v.union(v.literal("platform"), v.literal("phone")),
  ),
};
export const housingRequestFields = {
  ...housingCriteria,
  userId: v.id("users"),
  contactPhoneRevision: v.optional(v.number()),
  status: v.union(
    v.literal("open"),
    v.literal("fulfilled"),
    v.literal("closed"),
  ),
  createdAt: v.number(),
  requesterType: v.optional(
    v.union(v.literal("traveler"), v.literal("agency")),
  ),
  agencyName: v.optional(v.string()),
  travelerName: v.optional(v.string()),
  matchingStatus: v.optional(
    v.union(v.literal("matching"), v.literal("complete")),
  ),
  matchedProperties: v.optional(v.number()),
};
export const housingRequestDoc = v.object({
  ...housingRequestFields,
  _id: v.id("housingRequests"),
  _creationTime: v.number(),
});
