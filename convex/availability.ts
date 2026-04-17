import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByListing = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const blocks = await ctx.db
      .query("availabilityBlocks")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .collect();
    blocks.sort((a, b) => a.startDate - b.startDate);
    return blocks;
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
    if (args.startDate >= args.endDate) {
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

    const { id, ...fields } = args;
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined)
    );

    const newStart = (updates.startDate as number | undefined) ?? block.startDate;
    const newEnd = (updates.endDate as number | undefined) ?? block.endDate;
    if (newStart >= newEnd) throw new Error("Start date must be before end date");

    await ctx.db.patch(args.id, updates);
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

    await ctx.db.delete(args.id);
  },
});
