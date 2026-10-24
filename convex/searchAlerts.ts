import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { searchDeliveryStatus } from "./validators/search";
import { criteriaOnly, normalizeSearch, buildSearchUrl } from "../lib/search";
import { matchSearch } from "./lib/search";
import { requireUser } from "./lib/auth";
import { blockState } from "./lib/messageAccess";
export const start = internalMutation({
  args: { listingId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("listings", args.listingId);
    if (id)
      await ctx.scheduler.runAfter(0, internal.searchAlerts.scanListing, {
        listingId: id,
        cursor: null,
      });
    return null;
  },
});
export const scanListing = internalMutation({
  args: { listingId: v.id("listings"), cursor: v.union(v.null(), v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing || listing.status !== "active" || listing.moderationHold)
      return null;
    const result = await ctx.db
      .query("savedSearches")
      .withIndex("by_email_alerts", (q) => q.eq("emailAlerts", true))
      .paginate({ cursor: args.cursor, numItems: 25 });
    for (const search of result.page) {
      let filters;
      try {
        filters = normalizeSearch(criteriaOnly(search));
      } catch {
        continue;
      }
      if (
        !(await matchSearch(ctx, listing, filters)) ||
        (await blockState(ctx, search.userId, listing.landlordId)).cannotMessage
      )
        continue;
      const previous = await ctx.db
        .query("savedSearchDeliveries")
        .withIndex("by_search_listing", (q) =>
          q.eq("searchId", search._id).eq("listingId", listing._id),
        )
        .unique();
      if (previous) continue;
      const deliveryId = await ctx.db.insert("savedSearchDeliveries", {
        searchId: search._id,
        listingId: listing._id,
        createdAt: Date.now(),
        lastAttemptAt: Date.now(),
        status: "pending",
      });
      await ctx.scheduler.runAfter(0, internal.searchAlertEmails.deliver, {
        deliveryId,
      });
    }
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.searchAlerts.scanListing, {
        listingId: listing._id,
        cursor: result.continueCursor,
      });
    return null;
  },
});
export const details = internalQuery({
  args: { deliveryId: v.id("savedSearchDeliveries") },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      name: v.string(),
      searchName: v.string(),
      searchUrl: v.string(),
      listingId: v.id("listings"),
      title: v.string(),
      moveIn: v.optional(v.number()),
      moveOut: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "pending") return null;
    const search = await ctx.db.get(delivery.searchId),
      listing = await ctx.db.get(delivery.listingId);
    if (!search?.emailAlerts || !listing) return null;
    const user = await ctx.db.get(search.userId);
    if (
      !user ||
      (await blockState(ctx, user._id, listing.landlordId)).cannotMessage
    )
      return null;
    let filters;
    try {
      filters = normalizeSearch(criteriaOnly(search));
    } catch {
      return null;
    }
    const match = await matchSearch(ctx, listing, filters);
    if (!match) return null;
    return {
      email: user.email,
      name: user.name,
      searchName: search.name,
      searchUrl: buildSearchUrl(filters),
      listingId: listing._id,
      title: listing.title,
      moveIn: match.matchedMoveIn,
      moveOut: match.matchedMoveOut,
    };
  },
});
export const record = internalMutation({
  args: {
    deliveryId: v.id("savedSearchDeliveries"),
    status: searchDeliveryStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (delivery?.status === "pending")
      await ctx.db.patch(delivery._id, { status: args.status });
    return null;
  },
});
export const retry = mutation({
  args: { deliveryId: v.id("savedSearchDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      delivery = await ctx.db.get(args.deliveryId);
    const search = delivery ? await ctx.db.get(delivery.searchId) : null;
    if (!delivery || !search || search.userId !== user._id)
      throw new Error("Alert not found.");
    if (!["failed", "unconfigured"].includes(delivery.status))
      throw new Error(
        "This alert is already sent, pending or no longer relevant.",
      );
    if (Date.now() - delivery.lastAttemptAt < 60_000)
      throw new Error("Wait a minute before retrying.");
    await ctx.db.patch(delivery._id, {
      status: "pending",
      lastAttemptAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.searchAlertEmails.deliver, args);
    return null;
  },
});
