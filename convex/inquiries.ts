import { recordPerformance } from "./lib/performance";
import { inquiryStatus } from "./validators/bookings";
import {
  recordBookingEvent,
  bookingRevision,
  reviewableBooking,
} from "./lib/bookings";
import { sendListingMessage } from "./lib/messaging";
import { publiclyVisible } from "./lib/publication";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { recordDemand } from "./lib/market";
import { demandShape } from "../lib/market-insights";
import { mutation, query } from "./_generated/server";
import { requireMessagingAllowed } from "./lib/messageAccess";
import { requireUser } from "./lib/auth";
import { DAY, isAvailable, validateStay } from "../lib/stays";

const status = inquiryStatus;
const summary = v.object({
  _id: v.id("bookingInquiries"),
  listingId: v.id("listings"),
  tenantId: v.id("users"),
  landlordId: v.id("users"),
  title: v.string(),
  otherName: v.string(),
  moveIn: v.number(),
  moveOut: v.number(),
  occupants: v.number(),
  pets: v.boolean(),
  message: v.string(),
  status,
  createdAt: v.number(),
  canReview: v.boolean(),
  lifecycleRevision: v.number(),
  pendingBookingChangeId: v.optional(v.id("bookingChanges")),
  cancelledEffectiveEnd: v.optional(v.number()),
});

export const create = mutation({
  args: {
    listingId: v.id("listings"),
    moveIn: v.number(),
    moveOut: v.number(),
    occupants: v.number(),
    pets: v.boolean(),
    message: v.string(),
  },
  returns: v.id("bookingInquiries"),
  handler: async (ctx, args) => {
    const tenant = await requireUser(ctx);
    const listing = await ctx.db.get(args.listingId);
    if (!listing || !(await publiclyVisible(ctx, listing)))
      throw new Error("This listing is unavailable.");
    if (tenant._id === listing.landlordId)
      throw new Error("You cannot inquire about your own property.");
    await requireMessagingAllowed(ctx, tenant._id, listing.landlordId);
    validateStay(args.moveIn, args.moveOut, Math.max(1, listing.minStay) * 30);
    if (args.moveIn < Math.floor(Date.now() / DAY) * DAY)
      throw new Error("Move-in cannot be in the past.");
    if (
      !Number.isInteger(args.occupants) ||
      args.occupants < 1 ||
      args.occupants > 30
    )
      throw new Error("Enter 1–30 occupants.");
    if (
      listing.maxOccupancy !== undefined &&
      args.occupants > listing.maxOccupancy
    )
      throw new Error("This party exceeds the maximum occupancy.");
    if (args.pets && !listing.petFriendly)
      throw new Error("This property does not allow pets.");
    const message = args.message.trim();
    if (!message || message.length > 2000)
      throw new Error("Enter a message of up to 2,000 characters.");
    const blocks = await ctx.db
      .query("availabilityBlocks")
      .withIndex("by_listing_end", (q) =>
        q.eq("listingId", listing._id).gt("endDate", args.moveIn),
      )
      .take(4001);
    if (blocks.length > 4000)
      throw new Error("Please contact the owner to confirm availability.");
    if (!isAvailable(listing, blocks, args.moveIn, args.moveOut))
      throw new Error("These dates are unavailable.");
    const pending = await ctx.db
      .query("bookingInquiries")
      .withIndex("by_listing_tenant_status_dates", (q) =>
        q
          .eq("listingId", listing._id)
          .eq("tenantId", tenant._id)
          .eq("status", "pending")
          .eq("moveIn", args.moveIn)
          .eq("moveOut", args.moveOut),
      )
      .first();
    if (pending)
      throw new Error("You have already sent an inquiry for these dates.");
    await recordDemand(
      ctx,
      "inquiry",
      `account:${tenant._id}`,
      demandShape({
        city: listing.city,
        state: listing.state,
        bedrooms: listing.bedrooms,
        maxPrice: listing.price,
        propertyType: listing.propertyType,
        petFriendly: args.pets,
        moveIn: args.moveIn,
        moveOut: args.moveOut,
      }),
    );
    await recordPerformance(ctx, listing, "bookingRequests");
    const id = await ctx.db.insert("bookingInquiries", {
      ...args,
      message,
      tenantId: tenant._id,
      landlordId: listing.landlordId,
      status: "pending",
      lifecycleRevision: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      originalRequest: {
        moveIn: args.moveIn,
        moveOut: args.moveOut,
        occupants: args.occupants,
        pets: args.pets,
        message,
        createdAt: Date.now(),
      },
    });
    await sendListingMessage(ctx, {
      senderId: tenant._id,
      receiverId: listing.landlordId,
      listingId: listing._id,
      content: message,
      origin: "property",
      rentalInquiryId: id,
    });
    await recordBookingEvent(
      ctx,
      (await ctx.db.get(id))!,
      tenant._id,
      "inquiry_created",
      "Traveler sent a dated booking inquiry",
      { notify: false },
    );
    return id;
  },
});

export const getMine = query({
  args: {
    as: v.union(v.literal("tenant"), v.literal("landlord")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(summary),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await (
      args.as === "landlord"
        ? ctx.db
            .query("bookingInquiries")
            .withIndex("by_landlordId", (q) => q.eq("landlordId", user._id))
        : ctx.db
            .query("bookingInquiries")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", user._id))
    )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(30, args.paginationOpts.numItems),
      });
    const page = await Promise.all(
      result.page.map(async (i) => {
        const listing = await ctx.db.get(i.listingId);
        const other = await ctx.db.get(
          args.as === "landlord" ? i.tenantId : i.landlordId,
        );
        return {
          _id: i._id,
          listingId: i.listingId,
          tenantId: i.tenantId,
          landlordId: i.landlordId,
          title: listing?.title ?? "Unavailable property",
          otherName: other?.displayName ?? other?.name ?? "Member",
          moveIn: i.moveIn,
          moveOut: i.moveOut,
          occupants: i.occupants,
          pets: i.pets,
          message: i.message,
          status: i.status,
          createdAt: i.createdAt,
          canReview: reviewableBooking(i),
          lifecycleRevision: bookingRevision(i),
          pendingBookingChangeId: i.pendingBookingChangeId,
          cancelledEffectiveEnd: i.cancelledEffectiveEnd,
        };
      }),
    );
    return {
      page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const respond = mutation({
  args: {
    id: v.id("bookingInquiries"),
    decision: v.union(
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("withdrawn"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found.");
    if (
      args.decision === "withdrawn"
        ? user._id !== inquiry.tenantId
        : user._id !== inquiry.landlordId
    ) {
      throw new Error("You cannot change this inquiry.");
    }
    if (inquiry.status !== "pending")
      throw new Error("This inquiry has already been resolved.");
    if (args.decision === "accepted") {
      await requireMessagingAllowed(ctx, inquiry.tenantId, inquiry.landlordId);
      if (inquiry.moveIn < Math.floor(Date.now() / DAY) * DAY)
        throw new Error(
          "This inquiry’s move-in date has passed. Request current dates before confirming.",
        );
      const listing = await ctx.db.get(inquiry.listingId);
      if (!listing || !(await publiclyVisible(ctx, listing)))
        throw new Error("This property is unavailable.");
      if (
        (inquiry.pets && !listing.petFriendly) ||
        (listing.maxOccupancy !== undefined &&
          inquiry.occupants > listing.maxOccupancy)
      )
        throw new Error("The party no longer meets the property rules.");
      const blocks = await ctx.db
        .query("availabilityBlocks")
        .withIndex("by_listing_end", (q) =>
          q.eq("listingId", listing._id).gt("endDate", inquiry.moveIn),
        )
        .take(4001);
      if (
        blocks.length > 4000 ||
        !isAvailable(listing, blocks, inquiry.moveIn, inquiry.moveOut)
      ) {
        throw new Error("These dates are no longer available.");
      }
      // The conflict check and block write share a Convex transaction: concurrent accepts cannot double-book.
      const availabilityBlockId = await ctx.db.insert("availabilityBlocks", {
        listingId: listing._id,
        inquiryId: inquiry._id,
        startDate: inquiry.moveIn,
        endDate: inquiry.moveOut,
        type: "booked",
        note: "Accepted booking inquiry",
        createdAt: Date.now(),
      });
      await ctx.db.patch(inquiry._id, {
        availabilityBlockId,
        minimumStayDaysAtConfirmation: Math.max(1, listing.minStay) * 30,
      });
    }
    await ctx.db.patch(inquiry._id, {
      status: args.decision,
      lifecycleRevision: bookingRevision(inquiry) + 1,
      updatedAt: Date.now(),
    });
    await recordBookingEvent(
      ctx,
      inquiry,
      user._id,
      args.decision === "accepted" ? "confirmed" : args.decision,
      args.decision === "accepted"
        ? "Owner confirmed the requested dates and reserved this unit’s calendar"
        : "Inquiry " + args.decision,
      { revision: bookingRevision(inquiry) + 1 },
    );
    return null;
  },
});
