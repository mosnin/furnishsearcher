import { v } from "convex/values";
export const listingDetails = v.object({
  bathroomDetails: v.optional(
    v.array(v.object({ name: v.string(), description: v.string() })),
  ),
  rooms: v.array(v.object({ name: v.string(), beds: v.string() })),
  fees: v.array(
    v.object({
      name: v.string(),
      amount: v.number(),
      refundable: v.boolean(),
      frequency: v.union(v.literal("once"), v.literal("monthly")),
    }),
  ),
  smoking: v.union(
    v.literal("unspecified"),
    v.literal("allowed"),
    v.literal("prohibited"),
  ),
  maxVehicles: v.optional(v.number()),
  rules: v.string(),
  facilities: v.array(v.object({ name: v.string(), miles: v.number() })),
});
