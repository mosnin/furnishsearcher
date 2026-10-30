import { v } from "convex/values";
export const calendarProvider = v.union(v.literal("airbnb"), v.literal("vrbo"));
export const importedInterval = v.object({
  startDate: v.number(),
  endDate: v.number(),
});
export const calendarFeedFields = {
  listingId: v.id("listings"),
  landlordId: v.id("users"),
  provider: calendarProvider,
  url: v.string(),
  status: v.union(
    v.literal("syncing"),
    v.literal("synced"),
    v.literal("error"),
  ),
  generation: v.number(),
  createdAt: v.number(),
  lastAttemptAt: v.number(),
  nextSyncAt: v.number(),
  lastSyncedAt: v.optional(v.number()),
  coveredThrough: v.optional(v.number()),
  importedBlocks: v.optional(v.number()),
  error: v.optional(v.string()),
};
