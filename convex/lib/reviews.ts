import { reviewableBooking, reviewEnd } from "./bookings";
import { requireUser } from "./auth";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
type Ctx = QueryCtx | MutationCtx;
export async function requireReviewStaff(ctx: Ctx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new Error("Staff access required.");
  return user;
}
export function validateReview(input: {
  title?: string;
  rating: number;
  comment: string;
  phone?: string;
  stayStart?: number;
  stayEnd?: number;
  experienceConfirmed?: boolean;
  stayEvidence?: string;
}) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    throw new Error("Choose a whole-number rating from 1 to 5.");
  const title = input.title?.trim() ?? "",
    comment = input.comment.trim(),
    phone = input.phone?.trim() ?? "";
  if (title.length < 3 || title.length > 100)
    throw new Error("Enter a review title of 3–100 characters.");
  if (comment.length < 20 || comment.length > 1000)
    throw new Error("Enter a review of 20–1000 characters.");
  if (
    !/^[+()\d\s.-]{7,30}$/.test(phone) ||
    phone.replace(/\D/g, "").length < 7 ||
    phone.replace(/\D/g, "").length > 15
  )
    throw new Error("Enter a valid private contact phone number.");
  const start = input.stayStart,
    end = input.stayEnd;
  if (
    start === undefined ||
    end === undefined ||
    ![start, end].every(
      (x) =>
        Number.isSafeInteger(x) &&
        x >= 0 &&
        Number.isFinite(new Date(x).getTime()) &&
        x % 86400000 === 0,
    ) ||
    end <= start ||
    start > Date.now()
  )
    throw new Error(
      "Enter valid stay dates in UTC. Check-in must have occurred.",
    );
  if (!input.experienceConfirmed)
    throw new Error("Confirm your first-hand experience and review standards.");
  if ((input.stayEvidence?.length ?? 0) > 1000)
    throw new Error("Stay context must be at most 1000 characters.");
  return {
    title,
    comment,
    phone,
    stayStart: start,
    stayEnd: end,
    experienceConfirmed: true,
    stayEvidence: input.stayEvidence?.trim(),
  };
}
export async function checkStay(
  ctx: Ctx,
  review: {
    listingId: Id<"listings">;
    landlordId: Id<"users">;
    reviewerId: Id<"users">;
    subjectId?: Id<"users">;
    kind?: "property" | "traveler";
    bookingId?: Id<"bookingInquiries">;
    stayStart?: number;
    stayEnd?: number;
    stayEvidence?: string;
  },
) {
  const tenantId =
    review.kind === "traveler" ? review.subjectId : review.reviewerId;
  if (!tenantId || tenantId === review.landlordId)
    throw new Error("You cannot review yourself.");
  if (review.bookingId) {
    const booking = await ctx.db.get(review.bookingId);
    if (
      !booking ||
      !reviewableBooking(booking) ||
      booking.listingId !== review.listingId ||
      booking.landlordId !== review.landlordId ||
      booking.tenantId !== tenantId ||
      booking.moveIn > Date.now()
    )
      throw new Error(
        "Choose an accepted inquiry that has started, with matching stay dates.",
      );
    if (
      review.stayStart !== booking.moveIn ||
      (review.stayEnd !== reviewEnd(booking) &&
        review.stayEnd !== booking.moveOut)
    ) {
      const prior =
        review.stayStart !== undefined && review.stayEnd !== undefined
          ? await ctx.db
              .query("bookingEvents")
              .withIndex("by_prior_stay", (q) =>
                q
                  .eq("inquiryId", booking._id)
                  .eq("beforeMoveIn", review.stayStart!)
                  .eq("beforeMoveOut", review.stayEnd!)
                  .eq("action", "dates_changed"),
              )
              .first()
          : null;
      if (!prior)
        throw new Error(
          "Choose the current or a previously confirmed stay period.",
        );
    }
  } else if ((review.stayEvidence?.trim().length ?? 0) < 20)
    throw new Error(
      "Describe how the off-platform stay was confirmed for staff review (20–1000 characters). Do not include documents or payment details.",
    );
}
export async function canReadTraveler(ctx: Ctx, subjectId: Id<"users">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) return false;
  if (user._id === subjectId || user.role === "admin") return true;
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_tenant_landlord", (q) =>
      q.eq("tenantId", subjectId).eq("landlordId", user._id),
    )
    .first();
  const inquiry = await ctx.db
    .query("bookingInquiries")
    .withIndex("by_tenant_landlord", (q) =>
      q.eq("tenantId", subjectId).eq("landlordId", user._id),
    )
    .first();
  return !!conversation || !!inquiry;
}
export async function publicProjection(ctx: Ctx, review: Doc<"reviews">) {
  const author = await ctx.db.get(review.reviewerId);
  return {
    _id: review._id,
    rating: review.rating,
    title: review.title ?? "Review",
    comment: review.comment,
    reviewerName:
      author?.displayName?.trim().split(/\s+/)[0] ||
      author?.name?.trim().split(/\s+/)[0] ||
      "Member",
    reviewerAvatar: null,
    createdAt: review.createdAt,
    ...(review.responseStatus === "approved" && review.response
      ? {
          response: {
            body: review.response,
            createdAt: review.responseAt ?? review.createdAt,
          },
        }
      : {}),
  };
}
export async function adjustStats(
  ctx: MutationCtx,
  review: Doc<"reviews">,
  delta: number,
) {
  const keys =
    review.kind === "traveler"
      ? [`traveler:${review.subjectId}`]
      : [`listing:${review.listingId}`, `landlord:${review.landlordId}`];
  for (const key of keys) {
    const row = await ctx.db
      .query("reviewStats")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const count = (row?.count ?? 0) + delta,
      sum = (row?.sum ?? 0) + delta * review.rating;
    if (count < 0 || sum < 0)
      throw new Error("Review totals need staff reconciliation.");
    if (row) await ctx.db.patch(row._id, { count, sum });
    else await ctx.db.insert("reviewStats", { key, count, sum });
  }
}
export async function stats(ctx: Ctx, key: string) {
  const row = await ctx.db
    .query("reviewStats")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return {
    count: row?.count ?? 0,
    average: row?.count ? Math.round((row.sum / row.count) * 10) / 10 : 0,
  };
}
export async function audit(
  ctx: MutationCtx,
  review: Doc<"reviews">,
  actorId: Id<"users">,
  action: string,
  note: string,
) {
  await ctx.db.insert("reviewEvents", {
    reviewId: review._id,
    actorId,
    action,
    note,
    revision: review.revision ?? 0,
    snapshot: JSON.stringify({
      title: review.title,
      comment: review.comment,
      rating: review.rating,
      response: review.response,
      reviewRevision: review.revision ?? 0,
      responseRevision: review.responseRevision ?? 0,
    }),
    createdAt: Date.now(),
  });
}
