import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireUser } from "./auth";
import { DAY, isAvailable, validateStay } from "../../lib/stays";
import type { Infer } from "convex/values";
import { eventAction } from "../validators/bookings";
export async function requireBooking(
  ctx: QueryCtx | MutationCtx,
  id: Id<"bookingInquiries">,
) {
  const user = await requireUser(ctx),
    inquiry = await ctx.db.get(id);
  if (!inquiry || ![inquiry.tenantId, inquiry.landlordId].includes(user._id))
    throw new Error("This booking is private.");
  return { user, inquiry };
}
export const bookingRevision = (i: Doc<"bookingInquiries">) =>
  i.lifecycleRevision ?? 0;
export function requireCurrentBooking(
  i: Doc<"bookingInquiries">,
  revision: number,
  allowEnded = false,
) {
  if (i.status !== "accepted")
    throw new Error("Only a confirmed booking can be changed.");
  if (bookingRevision(i) !== revision)
    throw new Error(
      "This booking changed. Review its current dates and try again.",
    );
  if (!allowEnded && i.moveOut <= Math.floor(Date.now() / DAY) * DAY)
    throw new Error(
      "This stay has ended. Ask the owner to record any agreed correction.",
    );
}
export async function bookingBlock(
  ctx: QueryCtx | MutationCtx,
  i: Doc<"bookingInquiries">,
) {
  const b = i.availabilityBlockId
    ? await ctx.db.get(i.availabilityBlockId)
    : null;
  if (
    !b ||
    b.listingId !== i.listingId ||
    b.calendarFeedId ||
    (b.inquiryId && b.inquiryId !== i._id) ||
    b.startDate !== i.moveIn ||
    b.endDate !== i.moveOut ||
    b.type !== "booked"
  )
    throw new Error(
      "The booking calendar needs repair before changing the stay.",
    );
  return b;
}
export async function requireFreeDates(
  ctx: QueryCtx | MutationCtx,
  i: Doc<"bookingInquiries">,
  start: number,
  end: number,
  excluded?: Id<"availabilityBlocks">,
  allowPast = false,
) {
  const l = await ctx.db.get(i.listingId);
  if (!l || l.landlordId !== i.landlordId)
    throw new Error("Property ownership needs review.");
  const minimumDays =
    i.minimumStayDaysAtConfirmation ??
    Math.max(
      30,
      Math.min(Math.max(1, l.minStay) * 30, (i.moveOut - i.moveIn) / DAY),
    );
  validateStay(start, end, minimumDays);
  const today = Math.floor(Date.now() / DAY) * DAY;
  if (!allowPast && i.moveIn < today && start !== i.moveIn)
    throw new Error(
      "Check-in has already occurred; keep the original move-in date.",
    );
  if (!allowPast && i.moveIn >= today && start < today)
    throw new Error("Move-in cannot be in the past.");
  if (!allowPast && end <= today)
    throw new Error("Choose a future checkout date.");
  const blocks = await ctx.db
    .query("availabilityBlocks")
    .withIndex("by_listing_end", (q) =>
      q.eq("listingId", i.listingId).gt("endDate", start),
    )
    .take(4001);
  if (blocks.length > 4000)
    throw new Error(
      "This calendar needs review before availability can be confirmed.",
    );
  // Current occupancy remains valid after owner rules change; new dates still require calendar coverage and the agreed unit.
  const baseline = {
    ...l,
    minStay: minimumDays / 30,
    availableFrom: Math.min(
      l.availableFrom,
      i.moveIn,
      ...(allowPast ? [start] : []),
    ),
  };
  if (
    !isAvailable(
      baseline,
      blocks.filter((b) => b._id !== excluded),
      start,
      end,
    )
  )
    throw new Error("The proposed dates are no longer available.");
}
export async function recordBookingEvent(
  ctx: MutationCtx,
  i: Doc<"bookingInquiries">,
  actorId: Id<"users">,
  action: Infer<typeof eventAction>,
  reason: string,
  extra: {
    changeId?: Id<"bookingChanges">;
    moveIn?: number;
    moveOut?: number;
    revision?: number;
    notify?: boolean;
  } = {},
) {
  const id = await ctx.db.insert("bookingEvents", {
    inquiryId: i._id,
    actorId,
    recipientId: actorId === i.tenantId ? i.landlordId : i.tenantId,
    action,
    reason,
    beforeMoveIn: i.moveIn,
    beforeMoveOut: i.moveOut,
    afterMoveIn: extra.moveIn ?? i.moveIn,
    afterMoveOut: extra.moveOut ?? i.moveOut,
    revision: extra.revision ?? bookingRevision(i),
    createdAt: Date.now(),
    emailStatus: extra.notify === false ? "suppressed" : "pending",
    ...(extra.changeId ? { changeId: extra.changeId } : {}),
  });
  if (extra.notify !== false)
    await ctx.scheduler.runAfter(0, internal.bookingEmails.deliver, { id });
  return id;
}
export async function supersedePending(
  ctx: MutationCtx,
  i: Doc<"bookingInquiries">,
  actor: Id<"users">,
) {
  if (i.pendingBookingChangeId) {
    const p = await ctx.db.get(i.pendingBookingChangeId);
    if (p?.status === "pending" && p.inquiryId === i._id)
      await ctx.db.patch(p._id, {
        status: "superseded",
        decidedAt: Date.now(),
        decidedBy: actor,
      });
  }
}
export async function applyChange(
  ctx: MutationCtx,
  i: Doc<"bookingInquiries">,
  change: Doc<"bookingChanges">,
  actor: Id<"users">,
) {
  requireCurrentBooking(
    i,
    change.baseRevision,
    change.agreementRecorded === true,
  );
  const b = await bookingBlock(ctx, i),
    revision = bookingRevision(i) + 1;
  await supersedePending(ctx, i, actor);
  if (change.kind === "dates") {
    if (change.moveIn === undefined || change.moveOut === undefined)
      throw new Error("Missing proposed dates.");
    await requireFreeDates(
      ctx,
      i,
      change.moveIn,
      change.moveOut,
      b._id,
      change.agreementRecorded === true,
    );
    await ctx.db.patch(b._id, {
      inquiryId: i._id,
      startDate: change.moveIn,
      endDate: change.moveOut,
    });
    await ctx.db.patch(i._id, {
      moveIn: change.moveIn,
      moveOut: change.moveOut,
      lifecycleRevision: revision,
      pendingBookingChangeId: undefined,
      updatedAt: Date.now(),
    });
    await recordBookingEvent(ctx, i, actor, "dates_changed", change.reason, {
      changeId: change._id,
      moveIn: change.moveIn,
      moveOut: change.moveOut,
      revision,
    });
  } else {
    const effectiveEnd = Math.max(
      i.moveIn,
      Math.min(i.moveOut, Math.floor(Date.now() / DAY) * DAY),
    );
    if (effectiveEnd > i.moveIn)
      await ctx.db.patch(b._id, { inquiryId: i._id, endDate: effectiveEnd });
    else await ctx.db.delete(b._id);
    await ctx.db.patch(i._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledEffectiveEnd: effectiveEnd,
      availabilityBlockId: effectiveEnd > i.moveIn ? b._id : undefined,
      lifecycleRevision: revision,
      pendingBookingChangeId: undefined,
      updatedAt: Date.now(),
    });
    await recordBookingEvent(ctx, i, actor, "cancelled", change.reason, {
      changeId: change._id,
      moveOut: effectiveEnd,
      revision,
    });
  }
  await ctx.db.patch(change._id, {
    status: "accepted",
    decidedAt: Date.now(),
    decidedBy: actor,
  });
  await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
    listingId: i.listingId,
    cursor: null,
  });
}
/** Calendar dates are context, never proof that the traveler actually stayed. */
export function reviewableBooking(i: Doc<"bookingInquiries">) {
  return (
    i.moveIn <= Date.now() &&
    (i.status === "accepted" ||
      (i.status === "cancelled" &&
        (i.cancelledEffectiveEnd ?? i.moveIn) > i.moveIn))
  );
}
export const reviewEnd = (i: Doc<"bookingInquiries">) =>
  i.status === "cancelled" ? (i.cancelledEffectiveEnd ?? i.moveOut) : i.moveOut;
