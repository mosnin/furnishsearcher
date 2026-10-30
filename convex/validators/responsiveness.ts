import { v } from "convex/values";
export const responseCounts = {
  received: v.number(),
  onTime: v.number(),
  replied: v.number(),
  bands: v.array(v.number()),
};
export const responseReport = v.object({
  ready: v.boolean(),
  hasUnmeasuredHistory: v.boolean(),
  received: v.number(),
  onTime: v.number(),
  replied: v.number(),
  percent: v.union(v.number(), v.null()),
  grade: v.string(),
  typical: v.union(v.string(), v.null()),
  basis: v.union(v.literal("90_days"), v.literal("last_three")),
  windowStart: v.number(),
  resetAt: v.union(v.number(), v.null()),
  resetUsed: v.boolean(),
  canReset: v.boolean(),
});
