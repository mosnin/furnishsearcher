import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  syncRecommendation,
  removeRecommendation,
  recommendationsReady,
} from "./lib/recommendations";
export const status = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => recommendationsReady(ctx),
});
export const refresh = internalMutation({
  args: { listingId: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, { listingId }) => {
    const listing = await ctx.db.get(listingId);
    if (listing) await syncRecommendation(ctx, listing);
    else await removeRecommendation(ctx, listingId);
    return null;
  },
});
export const refreshPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    ownerId: v.optional(v.id("users")),
  },
  returns: v.object({
    complete: v.boolean(),
    examined: v.number(),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const response = await ctx.db
      .query("responseTrackingState")
      .withIndex("by_key", (q) => q.eq("key", "v1"))
      .unique();
    if (!response?.complete)
      return { complete: false, examined: 0, cursor: null };
    const page = await (
      args.ownerId
        ? ctx.db
            .query("listings")
            .withIndex("by_landlord", (q) => q.eq("landlordId", args.ownerId!))
        : ctx.db.query("listings")
    ).paginate({ cursor: args.cursor, numItems: 20 });
    for (const listing of page.page) await syncRecommendation(ctx, listing);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.recommendations.refreshPage, {
        ...args,
        cursor: page.continueCursor,
      });
    else if (!args.ownerId) {
      const state = await ctx.db
        .query("dataMigrations")
        .withIndex("by_name", (q) => q.eq("name", "recommendationsV1"))
        .unique();
      if (state) await ctx.db.patch(state._id, { complete: true });
      else
        await ctx.db.insert("dataMigrations", {
          name: "recommendationsV1",
          cursor: null,
          complete: true,
        });
    }
    return {
      complete: page.isDone,
      examined: page.page.length,
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});
