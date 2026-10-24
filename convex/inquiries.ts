import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { DAY, isAvailable, validateStay } from "../lib/stays";

const status = v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"), v.literal("withdrawn"));
const summary = v.object({
  _id: v.id("bookingInquiries"), listingId: v.id("listings"), tenantId: v.id("users"),
  landlordId: v.id("users"), title: v.string(), otherName: v.string(), moveIn: v.number(),
  moveOut: v.number(), occupants: v.number(), pets: v.boolean(), message: v.string(),
  status, createdAt: v.number(),
});

export const create = mutation({
  args: {
    listingId: v.id("listings"), moveIn: v.number(), moveOut: v.number(),
    occupants: v.number(), pets: v.boolean(), message: v.string(),
  },
  returns: v.id("bookingInquiries"),
  handler: async (ctx, args) => {
    const tenant = await requireUser(ctx);
    const listing = await ctx.db.get(args.listingId);
    if (!listing || listing.status !== "active") throw new Error("This listing is unavailable.");
    if (tenant._id === listing.landlordId) throw new Error("You cannot inquire about your own property.");
    validateStay(args.moveIn, args.moveOut, Math.max(1, listing.minStay) * 30);
    if (args.moveIn < Math.floor(Date.now() / DAY) * DAY) throw new Error("Move-in cannot be in the past.");
    if (!Number.isInteger(args.occupants) || args.occupants < 1 || args.occupants > 30) throw new Error("Enter 1–30 occupants.");
    if (args.pets && !listing.petFriendly) throw new Error("This property does not allow pets.");
    const message = args.message.trim();
    if (!message || message.length > 2000) throw new Error("Enter a message of up to 2,000 characters.");
    const blocks = await ctx.db.query("availabilityBlocks")
      .withIndex("by_listing_start", q => q.eq("listingId", listing._id).lt("startDate", args.moveOut)).take(500);
    if (blocks.length === 500) throw new Error("Please contact the owner to confirm availability.");
    if (!isAvailable(listing, blocks, args.moveIn, args.moveOut)) throw new Error("These dates are unavailable.");
    const pending = await ctx.db.query("bookingInquiries")
      .withIndex("by_listingId_and_status", q => q.eq("listingId", listing._id).eq("status", "pending")).take(500);
    if (pending.length === 500) throw new Error("Please contact the owner directly.");
    if (pending.some(i => i.tenantId === tenant._id && i.moveIn === args.moveIn && i.moveOut === args.moveOut)) {
      throw new Error("You have already sent an inquiry for these dates.");
    }
    return ctx.db.insert("bookingInquiries", {
      ...args, message, tenantId: tenant._id, landlordId: listing.landlordId,
      status: "pending", createdAt: Date.now(), updatedAt: Date.now(),
    });
  },
});

export const getMine = query({
  args: { as: v.union(v.literal("tenant"), v.literal("landlord")), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(summary), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await (args.as === "landlord"
      ? ctx.db.query("bookingInquiries").withIndex("by_landlordId", q => q.eq("landlordId", user._id))
      : ctx.db.query("bookingInquiries").withIndex("by_tenantId", q => q.eq("tenantId", user._id)))
      .order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async i => {
      const listing = await ctx.db.get(i.listingId);
      const other = await ctx.db.get(args.as === "landlord" ? i.tenantId : i.landlordId);
      return { _id: i._id, listingId: i.listingId, tenantId: i.tenantId, landlordId: i.landlordId,
        title: listing?.title ?? "Unavailable property", otherName: other?.displayName ?? other?.name ?? "Member",
        moveIn: i.moveIn, moveOut: i.moveOut, occupants: i.occupants, pets: i.pets,
        message: i.message, status: i.status, createdAt: i.createdAt };
    }));
    return { page, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

export const respond = mutation({
  args: { id: v.id("bookingInquiries"), decision: v.union(v.literal("accepted"), v.literal("declined"), v.literal("withdrawn")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found.");
    if (args.decision === "withdrawn" ? user._id !== inquiry.tenantId : user._id !== inquiry.landlordId) {
      throw new Error("You cannot change this inquiry.");
    }
    if (inquiry.status !== "pending") throw new Error("This inquiry has already been resolved.");
    if (args.decision === "accepted") {
      const listing = await ctx.db.get(inquiry.listingId);
      if (!listing || listing.status !== "active") throw new Error("This property is unavailable.");
      const blocks = await ctx.db.query("availabilityBlocks")
        .withIndex("by_listing_start", q => q.eq("listingId", listing._id).lt("startDate", inquiry.moveOut)).take(500);
      if (blocks.length === 500 || !isAvailable(listing, blocks, inquiry.moveIn, inquiry.moveOut)) {
        throw new Error("These dates are no longer available.");
      }
      // The conflict check and block write share a Convex transaction: concurrent accepts cannot double-book.
      const availabilityBlockId = await ctx.db.insert("availabilityBlocks", {
        listingId: listing._id, startDate: inquiry.moveIn, endDate: inquiry.moveOut,
        type: "booked", note: "Accepted booking inquiry", createdAt: Date.now(),
      });
      await ctx.db.patch(inquiry._id, { availabilityBlockId });
    }
    await ctx.db.patch(inquiry._id, { status: args.decision, updatedAt: Date.now() });
    return null;
  },
});
