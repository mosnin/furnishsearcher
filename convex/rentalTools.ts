import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query, mutation } from "./_generated/server";
import { requireBooking, recordBookingEvent } from "./lib/bookings";
import { requireMessagingAllowed } from "./lib/messageAccess";
import { rentalTool, toolStatus, toolFields } from "./validators/rentalTools";
import { RENTAL_TOOLS } from "../lib/rental-tools";
export const list = query({
  args: {
    inquiryId: v.id("bookingInquiries"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      ...toolFields,
      _id: v.id("rentalToolRequests"),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireBooking(ctx, args.inquiryId);
    return ctx.db
      .query("rentalToolRequests")
      .withIndex("by_inquiry", (q) => q.eq("inquiryId", args.inquiryId))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, args.paginationOpts.numItems),
      });
  },
});
export const request = mutation({
  args: {
    inquiryId: v.id("bookingInquiries"),
    kind: rentalTool,
    note: v.string(),
    requestId: v.string(),
  },
  returns: v.id("rentalToolRequests"),
  handler: async (ctx, args) => {
    const { user, inquiry } = await requireBooking(ctx, args.inquiryId);
    if (user._id !== inquiry.landlordId)
      throw new Error(
        "Only this property’s owner can request a rental setup step.",
      );
    if (["withdrawn", "declined", "cancelled"].includes(inquiry.status))
      throw new Error("Use a current rental discussion or confirmed stay.");
    await requireMessagingAllowed(ctx, inquiry.landlordId, inquiry.tenantId);
    const note = args.note.trim();
    if (
      note.length < 10 ||
      note.length > 1500 ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(args.requestId)
    )
      throw new Error(
        "Enter instructions of 10–1500 characters and a valid request reference. Keep personal and payment information in the provider account.",
      );
    const old = await ctx.db
      .query("rentalToolRequests")
      .withIndex("by_owner_request", (q) =>
        q.eq("ownerId", user._id).eq("requestId", args.requestId),
      )
      .unique();
    if (old) {
      if (
        old.inquiryId !== inquiry._id ||
        old.kind !== args.kind ||
        old.note !== note
      )
        throw new Error("Request reference already used for another step.");
      return old._id;
    }
    for (const status of ["requested", "received"] as const) {
      const pending = await ctx.db
        .query("rentalToolRequests")
        .withIndex("by_inquiry_kind_status", (q) =>
          q
            .eq("inquiryId", inquiry._id)
            .eq("kind", args.kind)
            .eq("status", status),
        )
        .first();
      if (pending)
        throw new Error("Resolve the current request for this tool first.");
    }
    const id = await ctx.db.insert("rentalToolRequests", {
      ...args,
      note,
      ownerId: inquiry.landlordId,
      tenantId: inquiry.tenantId,
      status: "requested",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await recordBookingEvent(
      ctx,
      inquiry,
      user._id,
      "rental_tool_requested",
      `Owner requested coordination for ${RENTAL_TOOLS[args.kind].title}. This is an in-app instruction, not a provider order or completed screening/payment.`,
    );
    return id;
  },
});
export const update = mutation({
  args: { id: v.id("rentalToolRequests"), status: toolStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Rental step is unavailable.");
    const { user, inquiry } = await requireBooking(ctx, row.inquiryId);
    if (
      args.status === "requested" ||
      (args.status === "received" && user._id !== row.tenantId) ||
      (args.status !== "received" && user._id !== row.ownerId)
    )
      throw new Error(
        "Only the traveler can acknowledge instructions; the owner records completion or cancellation.",
      );
    if (row.status === args.status) return null;
    if (row.status === "cancelled" || row.status === "owner_reported_complete")
      throw new Error("This step has closed. Create a new request if needed.");
    await ctx.db.patch(row._id, { status: args.status, updatedAt: Date.now() });
    await recordBookingEvent(
      ctx,
      inquiry,
      user._id,
      args.status === "received"
        ? "rental_tool_received"
        : "rental_tool_owner_update",
      args.status === "owner_reported_complete"
        ? "Owner reports this setup step was completed outside globe. No provider screening result or rent payment was verified."
        : args.status === "cancelled"
          ? "Owner cancelled the setup instruction."
          : "Traveler acknowledged receipt of setup instructions. This is not screening consent or a payment authorization.",
    );
    return null;
  },
});
