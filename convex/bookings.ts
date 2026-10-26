import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  requireBooking,
  bookingRevision,
  requireCurrentBooking,
  bookingBlock,
  requireFreeDates,
  recordBookingEvent,
  applyChange,
  supersedePending,
  reviewableBooking,
  reviewEnd,
} from "./lib/bookings";
import {
  changeKind,
  changeDoc,
  inquiryDoc,
  eventAction,
} from "./validators/bookings";
import { blockState, requireMessagingAllowed } from "./lib/messageAccess";
import { sendListingMessage } from "./lib/messaging";
function reason(value: string) {
  const r = value.trim();
  if (r.length < 10 || r.length > 2000)
    throw new Error(
      "Describe the agreed change or request in 10–2000 characters. Do not include payment or identity documents.",
    );
  return r;
}
function requestId(value: string) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(value))
    throw new Error("Invalid change reference.");
}
export const get = query({
  args: { id: v.id("bookingInquiries") },
  returns: v.object({
    inquiry: inquiryDoc,
    title: v.string(),
    unitName: v.optional(v.string()),
    otherName: v.string(),
    revision: v.number(),
    canReview: v.boolean(),
    reviewEnd: v.number(),
    cannotMessage: v.boolean(),
    calendarReserved: v.union(v.boolean(), v.null()),
  }),
  handler: async (ctx, { id }) => {
    const { user, inquiry: i } = await requireBooking(ctx, id),
      l = await ctx.db.get(i.listingId),
      other = await ctx.db.get(
        user._id === i.landlordId ? i.tenantId : i.landlordId,
      );
    let calendarReserved: boolean | null = null;
    if (i.status === "accepted") {
      try {
        await bookingBlock(ctx, i);
        calendarReserved = true;
      } catch {
        calendarReserved = false;
      }
    }
    return {
      inquiry: i,
      title: l?.title ?? "Past property",
      unitName: l?.unitName,
      otherName: other?.displayName ?? other?.name ?? "Member",
      revision: bookingRevision(i),
      canReview: reviewableBooking(i),
      reviewEnd: reviewEnd(i),
      cannotMessage: (await blockState(ctx, i.tenantId, i.landlordId))
        .cannotMessage,
      calendarReserved,
    };
  },
});
export const changes = query({
  args: {
    id: v.id("bookingInquiries"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(changeDoc),
  handler: async (ctx, args) => {
    await requireBooking(ctx, args.id);
    return ctx.db
      .query("bookingChanges")
      .withIndex("by_inquiry", (q) => q.eq("inquiryId", args.id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, args.paginationOpts.numItems),
      });
  },
});
export const events = query({
  args: {
    id: v.id("bookingInquiries"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("bookingEvents"),
      action: eventAction,
      actorId: v.id("users"),
      recipientId: v.id("users"),
      reason: v.string(),
      beforeMoveIn: v.number(),
      beforeMoveOut: v.number(),
      afterMoveIn: v.number(),
      afterMoveOut: v.number(),
      createdAt: v.number(),
      emailStatus: v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("unconfigured"),
        v.literal("suppressed"),
      ),
      emailAttempt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireBooking(ctx, args.id);
    const page = await ctx.db
      .query("bookingEvents")
      .withIndex("by_inquiry", (q) => q.eq("inquiryId", args.id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, args.paginationOpts.numItems),
      });
    return {
      ...page,
      page: page.page.map(
        ({
          _id,
          action,
          actorId,
          recipientId,
          reason,
          beforeMoveIn,
          beforeMoveOut,
          afterMoveIn,
          afterMoveOut,
          createdAt,
          emailStatus,
          emailAttempt,
        }) => ({
          _id,
          action,
          actorId,
          recipientId,
          reason,
          beforeMoveIn,
          beforeMoveOut,
          afterMoveIn,
          afterMoveOut,
          createdAt,
          emailStatus,
          emailAttempt,
        }),
      ),
    };
  },
});
const changeArgs = {
  inquiryId: v.id("bookingInquiries"),
  kind: changeKind,
  moveIn: v.optional(v.number()),
  moveOut: v.optional(v.number()),
  reason: v.string(),
  expectedRevision: v.number(),
  clientRequestId: v.string(),
};
export const propose = mutation({
  args: changeArgs,
  returns: v.id("bookingChanges"),
  handler: async (ctx, args) => {
    const { user, inquiry: i } = await requireBooking(ctx, args.inquiryId);
    requestId(args.clientRequestId);
    const note = reason(args.reason);
    const existing = await ctx.db
      .query("bookingChanges")
      .withIndex("by_request", (q) =>
        q
          .eq("inquiryId", i._id)
          .eq("proposerId", user._id)
          .eq("clientRequestId", args.clientRequestId),
      )
      .unique();
    if (existing) {
      if (
        existing.baseRevision !== args.expectedRevision ||
        existing.kind !== args.kind ||
        existing.moveIn !== args.moveIn ||
        existing.moveOut !== args.moveOut ||
        existing.reason !== note
      )
        throw new Error("Change reference already used for another request.");
      return existing._id;
    }
    requireCurrentBooking(i, args.expectedRevision);
    await requireMessagingAllowed(
      ctx,
      user._id,
      user._id === i.tenantId ? i.landlordId : i.tenantId,
    );
    const b = await bookingBlock(ctx, i);
    if (i.pendingBookingChangeId)
      throw new Error("Resolve or withdraw the current change request first.");
    if (args.kind === "dates") {
      if (args.moveIn === undefined || args.moveOut === undefined)
        throw new Error("Choose both proposed dates.");
      if (args.moveIn === i.moveIn && args.moveOut === i.moveOut)
        throw new Error("Choose dates different from the current booking.");
      await requireFreeDates(ctx, i, args.moveIn, args.moveOut, b._id);
    } else if (args.moveIn !== undefined || args.moveOut !== undefined)
      throw new Error("Cancellation requests do not change stay dates.");
    const id = await ctx.db.insert("bookingChanges", {
      inquiryId: i._id,
      proposerId: user._id,
      kind: args.kind,
      status: "pending",
      baseRevision: bookingRevision(i),
      moveIn: args.moveIn,
      moveOut: args.moveOut,
      reason: note,
      clientRequestId: args.clientRequestId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(i._id, {
      pendingBookingChangeId: id,
      updatedAt: Date.now(),
    });
    await recordBookingEvent(ctx, i, user._id, "change_requested", note, {
      changeId: id,
      moveIn: args.moveIn,
      moveOut: args.moveOut,
    });
    return id;
  },
});
export const decide = mutation({
  args: {
    id: v.id("bookingChanges"),
    decision: v.union(
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("withdrawn"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const change = await ctx.db.get(args.id);
    if (!change) throw new Error("Change request not found.");
    const { user, inquiry: i } = await requireBooking(ctx, change.inquiryId);
    if (
      args.decision === "withdrawn"
        ? user._id !== change.proposerId
        : user._id === change.proposerId
    )
      throw new Error(
        "Only the other stay partner can accept or decline a request; its author can withdraw it.",
      );
    if (change.status === args.decision && change.decidedBy === user._id)
      return null;
    if (change.status !== "pending" || i.pendingBookingChangeId !== change._id)
      throw new Error("This request has already been resolved or replaced.");
    if (args.decision === "accepted") {
      requireCurrentBooking(i, change.baseRevision);
      await requireMessagingAllowed(ctx, i.tenantId, i.landlordId);
      await applyChange(ctx, i, change, user._id);
    } else {
      await ctx.db.patch(change._id, {
        status: args.decision,
        decidedAt: Date.now(),
        decidedBy: user._id,
      });
      await ctx.db.patch(i._id, {
        pendingBookingChangeId: undefined,
        updatedAt: Date.now(),
      });
      await recordBookingEvent(
        ctx,
        i,
        user._id,
        args.decision === "declined" ? "change_declined" : "change_withdrawn",
        change.reason,
        { changeId: change._id },
      );
    }
    return null;
  },
});
export const recordAgreed = mutation({
  args: { ...changeArgs, agreementConfirmed: v.boolean() },
  returns: v.id("bookingChanges"),
  handler: async (ctx, args) => {
    const { user, inquiry: i } = await requireBooking(ctx, args.inquiryId);
    if (user._id !== i.landlordId || !args.agreementConfirmed)
      throw new Error(
        "Only the owner may record a change agreed with the traveler.",
      );
    requestId(args.clientRequestId);
    const note = reason(args.reason);
    const previous = await ctx.db
      .query("bookingChanges")
      .withIndex("by_request", (q) =>
        q
          .eq("inquiryId", i._id)
          .eq("proposerId", user._id)
          .eq("clientRequestId", args.clientRequestId),
      )
      .unique();
    if (previous) {
      if (
        previous.status !== "accepted" ||
        previous.baseRevision !== args.expectedRevision ||
        previous.kind !== args.kind ||
        previous.moveIn !== args.moveIn ||
        previous.moveOut !== args.moveOut ||
        previous.reason !== note
      )
        throw new Error("Change reference already used for another request.");
      return previous._id;
    }
    requireCurrentBooking(i, args.expectedRevision, true);
    if (
      args.kind === "dates" &&
      args.moveIn === i.moveIn &&
      args.moveOut === i.moveOut
    )
      throw new Error("Choose dates different from the current booking.");
    if (
      args.kind === "cancel" &&
      (args.moveIn !== undefined || args.moveOut !== undefined)
    )
      throw new Error("Cancellation does not change requested dates.");
    const id = await ctx.db.insert("bookingChanges", {
      inquiryId: i._id,
      proposerId: user._id,
      kind: args.kind,
      status: "pending",
      agreementRecorded: true,
      baseRevision: bookingRevision(i),
      moveIn: args.moveIn,
      moveOut: args.moveOut,
      reason: note,
      clientRequestId: args.clientRequestId,
      createdAt: Date.now(),
    });
    await applyChange(ctx, i, (await ctx.db.get(id))!, user._id);
    return id;
  },
});
export const linkLegacyBlocks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    scanned: v.number(),
    linked: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("bookingInquiries")
      .paginate({ cursor: args.cursor, numItems: 40 });
    let linked = 0;
    for (const i of page.page) {
      if (i.status !== "accepted" || !i.availabilityBlockId) continue;
      const b = await ctx.db.get(i.availabilityBlockId);
      if (
        b &&
        !b.inquiryId &&
        !b.calendarFeedId &&
        b.listingId === i.listingId &&
        b.type === "booked" &&
        b.startDate === i.moveIn &&
        b.endDate === i.moveOut
      ) {
        await ctx.db.patch(b._id, { inquiryId: i._id });
        linked++;
      }
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.bookings.linkLegacyBlocks, {
        cursor: page.continueCursor,
      });
    return {
      scanned: page.page.length,
      linked,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
export const repairCalendar = mutation({
  args: {
    id: v.id("bookingInquiries"),
    expectedRevision: v.number(),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, inquiry: i } = await requireBooking(ctx, args.id);
    if (user._id !== i.landlordId)
      throw new Error("Only the owner can repair this calendar.");
    requireCurrentBooking(i, args.expectedRevision, true);
    const note = reason(args.note),
      existing = i.availabilityBlockId
        ? await ctx.db.get(i.availabilityBlockId)
        : null;
    if (existing) {
      await bookingBlock(ctx, i);
      if (existing.inquiryId === i._id) return null;
      await ctx.db.patch(existing._id, { inquiryId: i._id });
    } else {
      const orphan = await ctx.db
        .query("availabilityBlocks")
        .withIndex("by_inquiry", (q) => q.eq("inquiryId", i._id))
        .first();
      if (orphan)
        throw new Error(
          "This booking already has a calendar entry. Contact support about its linkage.",
        );
      await requireFreeDates(ctx, i, i.moveIn, i.moveOut, undefined, true);
      const availabilityBlockId = await ctx.db.insert("availabilityBlocks", {
        listingId: i.listingId,
        inquiryId: i._id,
        startDate: i.moveIn,
        endDate: i.moveOut,
        type: "booked",
        note: "Confirmed booking calendar repaired",
        createdAt: Date.now(),
      });
      await ctx.db.patch(i._id, { availabilityBlockId });
    }
    await supersedePending(ctx, i, user._id);
    await ctx.db.patch(i._id, {
      lifecycleRevision: bookingRevision(i) + 1,
      pendingBookingChangeId: undefined,
      updatedAt: Date.now(),
    });
    await recordBookingEvent(ctx, i, user._id, "calendar_repaired", note, {
      revision: bookingRevision(i) + 1,
    });
    return null;
  },
});
export const message = mutation({
  args: {
    id: v.id("bookingInquiries"),
    content: v.string(),
    clientRequestId: v.string(),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const { user, inquiry: i } = await requireBooking(ctx, args.id);
    return (
      await sendListingMessage(ctx, {
        senderId: user._id,
        receiverId: user._id === i.tenantId ? i.landlordId : i.tenantId,
        listingId: i.listingId,
        content: args.content,
        clientRequestId: args.clientRequestId,
        origin: "inbox",
        rentalInquiryId: i._id,
      })
    ).conversationId;
  },
});
export const retryNotice = mutation({
  args: { id: v.id("bookingEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.id);
    if (!e) throw new Error("Update not found.");
    const { user } = await requireBooking(ctx, e.inquiryId);
    if (user._id !== e.recipientId)
      throw new Error("Only the recipient can retry their notification.");
    if (e.emailStatus === "sent" || e.emailStatus === "suppressed") return null;
    if (
      (e.emailAttempt ?? 0) >= 3 ||
      Date.now() - (e.emailAttemptedAt ?? 0) < 60000
    )
      throw new Error(
        "Wait before retrying; a notification allows three attempts.",
      );
    await ctx.db.patch(e._id, { emailStatus: "pending" });
    await ctx.scheduler.runAfter(0, internal.bookingEmails.deliver, args);
    return null;
  },
});
export const claimNotice = internalMutation({
  args: { id: v.id("bookingEvents") },
  returns: v.union(
    v.null(),
    v.object({
      inquiryId: v.id("bookingInquiries"),
      email: v.string(),
      attempt: v.number(),
      suppressed: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.id);
    if (
      !e ||
      e.emailStatus !== "pending" ||
      (e.emailAttempt ?? 0) >= 3 ||
      Date.now() - (e.emailAttemptedAt ?? 0) < 60000
    )
      return null;
    const i = await ctx.db.get(e.inquiryId),
      recipient = await ctx.db.get(e.recipientId);
    const attempt = (e.emailAttempt ?? 0) + 1;
    await ctx.db.patch(e._id, {
      emailAttempt: attempt,
      emailAttemptedAt: Date.now(),
    });
    return {
      inquiryId: e.inquiryId,
      email: recipient?.email ?? "",
      attempt,
      suppressed:
        !i ||
        !recipient ||
        (await blockState(ctx, i.tenantId, i.landlordId)).cannotMessage,
    };
  },
});
export const recordNotice = internalMutation({
  args: {
    id: v.id("bookingEvents"),
    attempt: v.number(),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("unconfigured"),
      v.literal("suppressed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.id);
    if (e?.emailAttempt === args.attempt && e.emailStatus === "pending")
      await ctx.db.patch(e._id, { emailStatus: args.status });
    return null;
  },
});
