import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { readiness, ownerReadiness, reconcileListing } from "./lib/publication";
export const readinessValidator = v.object({
  eligible: v.boolean(),
  requested: v.boolean(),
  approval: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
  ),
  revision: v.number(),
  issues: v.array(v.string()),
  live: v.boolean(),
  reviewNote: v.optional(v.string()),
});
export const getReadiness = query({
  args: { id: v.id("listings") },
  returns: readinessValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      listing = await ctx.db.get(args.id);
    if (!listing || (listing.landlordId !== user._id && user.role !== "admin"))
      throw new Error("Not authorized");
    return ownerReadiness(ctx, listing);
  },
});
export const reconcileOwner = internalMutation({
  args: { userId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("listings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.userId))
      .paginate({ cursor: args.cursor, numItems: 25 });
    for (const listing of page.page) await reconcileListing(ctx, listing);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.publication.reconcileOwner, {
        userId: args.userId,
        cursor: page.continueCursor,
      });
    return null;
  },
});
