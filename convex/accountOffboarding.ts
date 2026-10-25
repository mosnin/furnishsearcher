import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { offboardNativeUser } from "./lib/accountOffboarding";
export const closeRequests = internalMutation({
  args: { userId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.clerkDeletedAt === undefined) return null;
    const result = await ctx.db
      .query("housingRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .paginate({ cursor: args.cursor, numItems: 25 });
    for (const request of result.page)
      if (request.status === "open")
        await ctx.db.patch(request._id, { status: "closed" });
    if (!result.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.accountOffboarding.closeRequests,
        { ...args, cursor: result.continueCursor },
      );
    return null;
  },
});
export const reconcile = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("clerkContactSnapshots")
      .withIndex("by_deleted", (q) => q.eq("deleted", true))
      .paginate({ cursor: args.cursor, numItems: 25 });
    for (const snapshot of result.page) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", snapshot.clerkId))
        .unique();
      if (user) await offboardNativeUser(ctx, user, snapshot.eventAt, true);
    }
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.accountOffboarding.reconcile, {
        cursor: result.continueCursor,
      });
    return null;
  },
});

export const activeOwnerRecipient = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user && user.clerkDeletedAt === undefined ? user.email : null;
  },
});
