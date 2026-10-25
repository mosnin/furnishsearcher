import { v } from "convex/values";
export const performanceCounts = {
  impressions: v.number(),
  views: v.number(),
  shares: v.number(),
  saves: v.number(),
  unsaves: v.number(),
  bookingRequests: v.number(),
  threads: v.number(),
  matchedLeads: v.number(),
  phoneReveals: v.number(),
};
// Existing daily rows predate phone-reveal collection.
export const storedPerformanceCounts = {
  ...performanceCounts,
  phoneReveals: v.optional(v.number()),
};
export const browserActivity = v.union(
  v.literal("impressions"),
  v.literal("views"),
  v.literal("shares"),
);
