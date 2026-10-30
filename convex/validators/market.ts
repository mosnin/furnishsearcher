import { v } from "convex/values";
export const bucket = v.object({
  dimension: v.string(),
  key: v.string(),
  count: v.number(),
});
export const demandKind = v.union(
  v.literal("search"),
  v.literal("inquiry"),
  v.literal("conversation"),
  v.literal("housing_request"),
);
export const demandShapeValidator = v.object({
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  bedrooms: v.string(),
  budget: v.string(),
  types: v.array(v.string()),
  amenities: v.array(v.string()),
  pets: v.boolean(),
  lead: v.string(),
  duration: v.string(),
});
