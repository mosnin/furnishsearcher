import { v } from "convex/values";
export const point = v.object({ latitude: v.number(), longitude: v.number() });
export const bounds = v.object({
  south: v.number(),
  west: v.number(),
  north: v.number(),
  east: v.number(),
});
export const placeCandidate = v.object({
  ...point.fields,
  label: v.string(),
  provider: v.union(v.literal("census"), v.literal("geoapify")),
  placeId: v.optional(v.string()),
});
