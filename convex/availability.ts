import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

export const getByListing = query({
  args: { listingId: v.id("listings") },
  returns: v.array(v.object({
    _id: v.id("availabilityBlocks"), _creationTime: v.number(), listingId: v.id("listings"),
    startDate: v.number(), endDate: v.number(), type: v.union(v.literal("unavailable"), v.literal("booked")),
    note: v.optional(v.string()), calendarFeedId: v.optional(v.id("calendarFeeds")), createdAt: v.number(),
  })),
  handler: async (ctx, args): Promise<Doc<"availabilityBlocks">[]> => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing) return [];
    const identity = await ctx.auth.getUserIdentity();
    const user = identity ? await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject)).unique() : null;
    const canManage = user?._id === listing.landlordId || user?.role === "admin";
    if (listing.status !== "active" && !canManage) return [];
    const blocks = await ctx.db.query("availabilityBlocks").withIndex("by_listing_start", q => q.eq("listingId", args.listingId)).take(4001);
    if (blocks.length > 4000) throw new Error("This property's calendar requires an availability review.");
    return blocks.map(block => {
      if (canManage) return block;
      const { note: _note, calendarFeedId: _feed, ...publicBlock } = block;
      return publicBlock;
    });
  },
});

export const addBlock = mutation({
  args: {
    listingId: v.id("listings"),
    startDate: v.number(),
    endDate: v.number(),
    type: v.union(v.literal("unavailable"), v.literal("booked")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error("Listing not found");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller._id !== listing.landlordId && caller.role !== "admin") {
      throw new Error("Not authorized");
    }
    if (!Number.isFinite(args.startDate) || !Number.isFinite(args.endDate) || args.startDate >= args.endDate) {
      throw new Error("Start date must be before end date");
    }

    return await ctx.db.insert("availabilityBlocks", {
      listingId: args.listingId,
      startDate: args.startDate,
      endDate: args.endDate,
      type: args.type,
      note: args.note,
      createdAt: Date.now(),
    });
  },
});

export const updateBlock = mutation({
  args: {
    id: v.id("availabilityBlocks"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    type: v.optional(v.union(v.literal("unavailable"), v.literal("booked"))),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const block = await ctx.db.get(args.id);
    if (!block) throw new Error("Block not found");

    const listing = await ctx.db.get(block.listingId);
    if (!listing) throw new Error("Listing not found");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller._id !== listing.landlordId && caller.role !== "admin") {
      throw new Error("Not authorized");
    }

    if (block.calendarFeedId) throw new Error("Imported dates are managed through the linked calendar.");
    const { id, ...fields } = args;
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined)
    );

    const newStart = (updates.startDate as number | undefined) ?? block.startDate;
    const newEnd = (updates.endDate as number | undefined) ?? block.endDate;
    if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newStart >= newEnd) throw new Error("Start date must be before end date");

    await ctx.db.patch(args.id, updates);
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, { listingId: listing._id, cursor: null });
  },
});

export const removeBlock = mutation({
  args: { id: v.id("availabilityBlocks") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const block = await ctx.db.get(args.id);
    if (!block) throw new Error("Block not found");

    const listing = await ctx.db.get(block.listingId);
    if (!listing) throw new Error("Listing not found");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller._id !== listing.landlordId && caller.role !== "admin") {
      throw new Error("Not authorized");
    }

    if (block.calendarFeedId) throw new Error("Imported dates are managed through the linked calendar.");
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, { listingId: listing._id, cursor: null });
  },
});
