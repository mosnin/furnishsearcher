import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { publiclyVisible } from "./lib/publication";
import { responseStats, trackConversation } from "./lib/responsiveness";
import { responseReport } from "./validators/responsiveness";
export const report = query({
  args: { listingId: v.id("listings") },
  returns: responseReport,
  handler: async (ctx, { listingId }) => {
    const me = await requireUser(ctx),
      listing = await ctx.db.get(listingId);
    if (!listing || listing.landlordId !== me._id)
      throw new Error("Not authorized to read this response rate.");
    return responseStats(ctx, listing);
  },
});
export const publicTime = query({
  args: { listingId: v.id("listings") },
  returns: v.union(v.null(), v.object({ label: v.string() })),
  handler: async (ctx, { listingId }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing || !(await publiclyVisible(ctx, listing))) return null;
    const report = await responseStats(ctx, listing);
    return report.typical ? { label: report.typical } : null;
  },
});
export const reset = mutation({
  args: { listingId: v.id("listings"), confirmAllRentalSpaces: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx),
      listing = await ctx.db.get(args.listingId);
    if (!listing || listing.landlordId !== me._id)
      throw new Error("Not authorized to reset this response rate.");
    if (!args.confirmAllRentalSpaces)
      throw new Error("Confirm the one-time reset for all your rental spaces.");
    if (me.responseRateResetAt !== undefined)
      throw new Error("Your one-time account reset has already been used.");
    const stats = await responseStats(ctx, listing);
    if (!stats.canReset)
      throw new Error("A measured response rate below 75% is required.");
    await ctx.db.patch(me._id, { responseRateResetAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.recommendations.refreshPage, {
      ownerId: me._id,
      cursor: null,
    });
    return null;
  },
});
export const backfill = internalMutation({
  args: {},
  returns: v.object({ complete: v.boolean(), examined: v.number() }),
  handler: async (ctx) => {
    let state = await ctx.db
      .query("responseTrackingState")
      .withIndex("by_key", (q) => q.eq("key", "v1"))
      .unique();
    if (state?.complete) return { complete: true, examined: 0 };
    if (!state) {
      const id = await ctx.db.insert("responseTrackingState", {
        key: "v1",
        cursor: null,
        complete: false,
        updatedAt: Date.now(),
      });
      state = (await ctx.db.get(id))!;
    }
    const page = await ctx.db
      .query("conversations")
      .paginate({ cursor: state.cursor, numItems: 25 });
    for (const conversation of page.page)
      await trackConversation(ctx, conversation);
    await ctx.db.patch(state._id, {
      cursor: page.isDone ? null : page.continueCursor,
      complete: page.isDone,
      updatedAt: Date.now(),
    });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.responsiveness.backfill, {});
    return { complete: page.isDone, examined: page.page.length };
  },
});
export const tick = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const state = await ctx.db
      .query("responseTrackingState")
      .withIndex("by_key", (q) => q.eq("key", "v1"))
      .unique();
    if (state) await ctx.db.patch(state._id, { updatedAt: Date.now() });
    if (!state?.complete)
      await ctx.scheduler.runAfter(0, internal.responsiveness.backfill, {});
    else
      await ctx.scheduler.runAfter(0, internal.recommendations.refreshPage, {
        cursor: null,
      });
    return null;
  },
});
