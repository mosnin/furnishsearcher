import type { MutationCtx } from "./_generated/server";
import { publiclyVisible } from "./lib/publication";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

async function requireManualBlock(
  ctx: MutationCtx,
  block: Doc<"availabilityBlocks">,
) {
  const booking = block.inquiryId
    ? await ctx.db.get(block.inquiryId)
    : await ctx.db
        .query("bookingInquiries")
        .withIndex("by_availability_block", (q) =>
          q.eq("availabilityBlockId", block._id),
        )
        .first();
  if (booking)
    throw new Error(
      "Manage this confirmed stay through Booking inquiries so its dates, status and history stay together.",
    );
}

export const getByListing = query({
  args: { listingId: v.id("listings") },
  returns: v.array(
    v.object({
      _id: v.id("availabilityBlocks"),
      _creationTime: v.number(),
      listingId: v.id("listings"),
      startDate: v.number(),
      endDate: v.number(),
      type: v.union(v.literal("unavailable"), v.literal("booked")),
      inquiryId: v.optional(v.id("bookingInquiries")),
      title: v.optional(v.string()),
      note: v.optional(v.string()),
      calendarFeedId: v.optional(v.id("calendarFeeds")),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<Doc<"availabilityBlocks">[]> => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing) return [];
    const identity = await ctx.auth.getUserIdentity();
    const user = identity
      ? await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
          .unique()
      : null;
    const canManage =
      user?._id === listing.landlordId || user?.role === "admin";
    if (!canManage && !(await publiclyVisible(ctx, listing))) return [];
    const blocks = await ctx.db
      .query("availabilityBlocks")
      .withIndex("by_listing_start", (q) => q.eq("listingId", args.listingId))
      .take(4001);
    if (blocks.length > 4000)
      throw new Error(
        "This property's calendar requires an availability review.",
      );
    return blocks.map((block) => {
      if (canManage) return block;
      const {
        note: _note,
        title: _title,
        inquiryId: _inquiry,
        calendarFeedId: _feed,
        ...publicBlock
      } = block;
      return publicBlock;
    });
  },
});

export const addBlock = mutation({
  returns: v.id("availabilityBlocks"),
  args: {
    listingId: v.id("listings"),
    startDate: v.number(),
    endDate: v.number(),
    type: v.union(v.literal("unavailable"), v.literal("booked")),
    title: v.optional(v.string()),
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
    if (
      !Number.isFinite(args.startDate) ||
      !Number.isFinite(args.endDate) ||
      args.startDate >= args.endDate
    ) {
      throw new Error("Start date must be before end date");
    }

    if ((args.title?.length ?? 0) > 100 || (args.note?.length ?? 0) > 2000)
      throw new Error(
        "Use an event name up to 100 characters and note up to 2000 characters.",
      );
    return await ctx.db.insert("availabilityBlocks", {
      listingId: args.listingId,
      startDate: args.startDate,
      endDate: args.endDate,
      type: args.type,
      title: args.title?.trim(),
      note: args.note,
      createdAt: Date.now(),
    });
  },
});

export const updateBlock = mutation({
  returns: v.null(),
  args: {
    id: v.id("availabilityBlocks"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    type: v.optional(v.union(v.literal("unavailable"), v.literal("booked"))),
    title: v.optional(v.string()),
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

    if (block.calendarFeedId)
      throw new Error(
        "Imported dates are managed through the linked calendar.",
      );
    await requireManualBlock(ctx, block);
    const { id, ...fields } = args;
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined),
    );

    const newStart =
      (updates.startDate as number | undefined) ?? block.startDate;
    const newEnd = (updates.endDate as number | undefined) ?? block.endDate;
    if (
      !Number.isFinite(newStart) ||
      !Number.isFinite(newEnd) ||
      newStart >= newEnd
    )
      throw new Error("Start date must be before end date");

    if ((args.title?.length ?? 0) > 100 || (args.note?.length ?? 0) > 2000)
      throw new Error(
        "Use an event name up to 100 characters and note up to 2000 characters.",
      );
    await ctx.db.patch(args.id, updates);
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
      listingId: listing._id,
      cursor: null,
    });
    return null;
  },
});

export const removeBlock = mutation({
  returns: v.null(),
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

    if (block.calendarFeedId)
      throw new Error(
        "Imported dates are managed through the linked calendar.",
      );
    await requireManualBlock(ctx, block);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
      listingId: listing._id,
      cursor: null,
    });
    return null;
  },
});
