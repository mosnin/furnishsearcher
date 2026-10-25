import { reviewableBooking, reviewEnd } from "./lib/bookings";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { publiclyVisible } from "./lib/publication";
import {
  reviewStatus,
  reviewKind,
  publicReview,
  reviewPage,
  pageMetadata,
} from "./validators/reviews";
import {
  requireReviewStaff,
  validateReview,
  checkStay,
  canReadTraveler,
  publicProjection,
  adjustStats,
  stats,
  audit,
} from "./lib/reviews";
const privateReview = v.object({
  ...publicReview.fields,
  listingId: v.id("listings"),
  landlordId: v.id("users"),
  reviewerId: v.id("users"),
  subjectId: v.optional(v.id("users")),
  kind: reviewKind,
  status: reviewStatus,
  revision: v.number(),
  needsDetails: v.boolean(),
  phone: v.string(),
  stayStart: v.optional(v.number()),
  stayEnd: v.optional(v.number()),
  bookingId: v.optional(v.id("bookingInquiries")),
  stayEvidence: v.string(),
  moderationNote: v.string(),
  removalRequested: v.boolean(),
  removalReason: v.string(),
  responseDraft: v.string(),
  responseStatus: v.optional(reviewStatus),
  responseRevision: v.number(),
  responseNote: v.string(),
  listingTitle: v.string(),
});
async function privateProjection(
  ctx: QueryCtx | MutationCtx,
  r: Doc<"reviews">,
  staff = false,
) {
  return {
    ...(await publicProjection(ctx, r)),
    listingId: r.listingId,
    landlordId: r.landlordId,
    reviewerId: r.reviewerId,
    subjectId: r.subjectId,
    kind: r.kind ?? "property",
    status: r.status ?? "pending",
    revision: r.revision ?? 0,
    needsDetails: !r.status,
    phone: r.phone ?? "",
    stayStart: r.stayStart,
    stayEnd: r.stayEnd,
    bookingId: r.bookingId,
    stayEvidence: r.stayEvidence ?? "",
    moderationNote:
      r.moderationNote ?? "Legacy review requires submission of stay details.",
    removalRequested: !!r.removalRequested,
    removalReason: staff ? (r.removalReason ?? "") : "",
    responseDraft: r.response ?? "",
    responseStatus: r.responseStatus,
    responseRevision: r.responseRevision ?? 0,
    responseNote: r.responseNote ?? "",
    listingTitle:
      (await ctx.db.get(r.listingId))?.title ?? "Unavailable property",
  };
}
async function existingReview(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  listingId: Id<"listings">,
  kind: "property" | "traveler",
  subjectId?: Id<"users">,
) {
  return kind === "property"
    ? ctx.db
        .query("reviews")
        .withIndex("by_reviewer_listing", (q) =>
          q.eq("reviewerId", userId).eq("listingId", listingId),
        )
        .first()
    : ctx.db
        .query("reviews")
        .withIndex("by_reviewer_kind_subject", (q) =>
          q
            .eq("reviewerId", userId)
            .eq("kind", "traveler")
            .eq("subjectId", subjectId),
        )
        .first();
}
export const create = mutation({
  args: {
    listingId: v.id("listings"),
    landlordId: v.id("users"),
    reviewerId: v.id("users"),
    kind: v.optional(reviewKind),
    subjectId: v.optional(v.id("users")),
    rating: v.number(),
    comment: v.string(),
    title: v.optional(v.string()),
    phone: v.optional(v.string()),
    stayStart: v.optional(v.number()),
    stayEnd: v.optional(v.number()),
    experienceConfirmed: v.optional(v.boolean()),
    bookingId: v.optional(v.id("bookingInquiries")),
    stayEvidence: v.optional(v.string()),
  },
  returns: v.id("reviews"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user._id !== args.reviewerId) throw new Error("Not authorized.");
    const listing = await ctx.db.get(args.listingId);
    if (!listing || listing.landlordId !== args.landlordId)
      throw new Error("Property owner does not match.");
    const kind = args.kind ?? "property",
      subjectId = kind === "property" ? listing.landlordId : args.subjectId;
    if (!subjectId || subjectId === user._id)
      throw new Error("You cannot review yourself.");
    if (
      kind === "traveler" &&
      (user._id !== listing.landlordId ||
        !(await canReadTraveler(ctx, subjectId)))
    )
      throw new Error(
        "Only this property's owner can review a traveler with an established inquiry or conversation.",
      );
    if (!(await ctx.db.get(subjectId)))
      throw new Error("Review subject not found.");
    const details = validateReview(args);
    await checkStay(ctx, { ...args, ...details, kind, subjectId });
    const existing = await existingReview(
      ctx,
      user._id,
      args.listingId,
      kind,
      subjectId,
    );
    if (existing?.status && existing.status !== "rejected")
      throw new Error(
        "You have already submitted this review. Contact support for removal.",
      );
    const recent = await ctx.db
      .query("reviews")
      .withIndex("by_reviewer", (q) => q.eq("reviewerId", user._id))
      .order("desc")
      .take(11);
    if (
      !existing &&
      recent.filter((r) => r.createdAt > Date.now() - 86400000).length >= 10
    )
      throw new Error("Daily review limit reached.");
    const fields = {
      ...details,
      kind,
      subjectId,
      bookingId: args.bookingId,
      rating: args.rating,
      status: "pending" as const,
      revision: (existing?.revision ?? 0) + 1,
      updatedAt: Date.now(),
      moderationNote: "",
      removalRequested: false,
      removalReason: undefined,
      counted: false,
    };
    if (existing) {
      await audit(
        ctx,
        existing,
        user._id,
        "resubmitted",
        "Author resubmitted review",
      );
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    const id = await ctx.db.insert("reviews", {
      listingId: listing._id,
      landlordId: listing.landlordId,
      reviewerId: user._id,
      ...fields,
      createdAt: Date.now(),
    });
    await audit(
      ctx,
      (await ctx.db.get(id))!,
      user._id,
      "submitted",
      "Awaiting staff moderation",
    );
    return id;
  },
});
export const context = query({
  args: {
    listingId: v.id("listings"),
    kind: v.optional(reviewKind),
    subjectId: v.optional(v.id("users")),
  },
  returns: v.object({
    existing: v.union(privateReview, v.null()),
    listingTitle: v.string(),
    landlordId: v.id("users"),
    canSubmit: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error("Property not found.");
    const kind = args.kind ?? "property",
      subjectId = kind === "property" ? listing.landlordId : args.subjectId;
    const existing = await existingReview(
      ctx,
      user._id,
      listing._id,
      kind,
      subjectId,
    );
    if (
      !existing &&
      user._id !== listing.landlordId &&
      !(await publiclyVisible(ctx, listing))
    ) {
      const history = await ctx.db
        .query("bookingInquiries")
        .withIndex("by_listing_tenant", (q) =>
          q.eq("listingId", listing._id).eq("tenantId", user._id),
        )
        .first();
      if (!history)
        throw new Error(
          "Property is unavailable. Contact support about a past stay.",
        );
    }
    return {
      existing: existing ? await privateProjection(ctx, existing) : null,
      listingTitle: listing.title,
      landlordId: listing.landlordId,
      canSubmit:
        !!subjectId &&
        subjectId !== user._id &&
        (!existing || !existing.status || existing.status === "rejected"),
    };
  },
});
export const canReview = query({
  args: { reviewerId: v.id("users"), listingId: v.id("listings") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user._id !== args.reviewerId) return false;
    const listing = await ctx.db.get(args.listingId);
    if (!listing || listing.landlordId === user._id) return false;
    const existing = await existingReview(
      ctx,
      user._id,
      args.listingId,
      "property",
    );
    return !existing || !existing.status || existing.status === "rejected";
  },
});
export const getByListing = query({
  args: { listingId: v.id("listings") },
  returns: v.array(publicReview),
  handler: async (ctx, args) =>
    Promise.all(
      (
        await ctx.db
          .query("reviews")
          .withIndex("by_listing_kind_status", (q) =>
            q
              .eq("listingId", args.listingId)
              .eq("kind", "property")
              .eq("status", "approved"),
          )
          .order("desc")
          .take(100)
      )
        .filter((r) => r.kind !== "traveler")
        .map((r) => publicProjection(ctx, r)),
    ),
});
export const getByLandlord = query({
  args: { landlordId: v.id("users") },
  returns: v.array(publicReview),
  handler: async (ctx, args) =>
    Promise.all(
      (
        await ctx.db
          .query("reviews")
          .withIndex("by_landlord_kind_status", (q) =>
            q
              .eq("landlordId", args.landlordId)
              .eq("kind", "property")
              .eq("status", "approved"),
          )
          .order("desc")
          .take(100)
      ).map((r) => publicProjection(ctx, r)),
    ),
});
export const listPublic = query({
  args: {
    listingId: v.optional(v.id("listings")),
    landlordId: v.optional(v.id("users")),
    travelerId: v.optional(v.id("users")),
    paginationOpts: paginationOptsValidator,
  },
  returns: reviewPage,
  handler: async (ctx, args) => {
    if (
      [args.listingId, args.landlordId, args.travelerId].filter(Boolean)
        .length !== 1
    )
      throw new Error("Choose one review subject.");
    if (args.travelerId && !(await canReadTraveler(ctx, args.travelerId)))
      throw new Error(
        "Traveler reviews are private to the traveler and established counterparties.",
      );
    const q = args.listingId
      ? ctx.db
          .query("reviews")
          .withIndex("by_listing_kind_status", (q) =>
            q
              .eq("listingId", args.listingId!)
              .eq("kind", "property")
              .eq("status", "approved"),
          )
      : args.travelerId
        ? ctx.db
            .query("reviews")
            .withIndex("by_subject_kind_status", (q) =>
              q
                .eq("subjectId", args.travelerId!)
                .eq("kind", "traveler")
                .eq("status", "approved"),
            )
        : ctx.db
            .query("reviews")
            .withIndex("by_landlord_kind_status", (q) =>
              q
                .eq("landlordId", args.landlordId!)
                .eq("kind", "property")
                .eq("status", "approved"),
            );
    const result = await q.order("desc").paginate({
      ...args.paginationOpts,
      numItems: Math.max(1, Math.min(50, args.paginationOpts.numItems)),
    });
    return {
      ...result,
      page: await Promise.all(
        result.page
          .filter((r) => !args.listingId || r.kind !== "traveler")
          .map((r) => publicProjection(ctx, r)),
      ),
    };
  },
});
export const getAverageRating = query({
  args: { landlordId: v.id("users"), listingId: v.optional(v.id("listings")) },
  returns: v.object({ average: v.number(), count: v.number() }),
  handler: async (ctx, args) =>
    stats(
      ctx,
      args.listingId
        ? `listing:${args.listingId}`
        : `landlord:${args.landlordId}`,
    ),
});
export const getByReviewer = query({
  args: { reviewerId: v.id("users") },
  returns: v.array(privateReview),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user._id !== args.reviewerId && user.role !== "admin")
      throw new Error("Not authorized.");
    return Promise.all(
      (
        await ctx.db
          .query("reviews")
          .withIndex("by_reviewer", (q) => q.eq("reviewerId", args.reviewerId))
          .order("desc")
          .take(100)
      ).map((r) => privateProjection(ctx, r)),
    );
  },
});
export const mine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(privateReview),
    ...pageMetadata,
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      page = await ctx.db
        .query("reviews")
        .withIndex("by_reviewer", (q) => q.eq("reviewerId", user._id))
        .order("desc")
        .paginate({
          ...args.paginationOpts,
          numItems: Math.max(1, Math.min(50, args.paginationOpts.numItems)),
        });
    return {
      ...page,
      page: await Promise.all(page.page.map((r) => privateProjection(ctx, r))),
    };
  },
});
export const received = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(publicReview),
    ...pageMetadata,
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      page = await ctx.db
        .query("reviews")
        .withIndex("by_subject_kind_status", (q) => q.eq("subjectId", user._id))
        .order("desc")
        .paginate({
          ...args.paginationOpts,
          numItems: Math.max(1, Math.min(50, args.paginationOpts.numItems)),
        });
    return {
      ...page,
      page: await Promise.all(
        page.page
          .filter((r) => r.status === "approved")
          .map((r) => publicProjection(ctx, r)),
      ),
    };
  },
});
export const respond = mutation({
  args: { id: v.id("reviews"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      r = await ctx.db.get(args.id);
    if (
      !r ||
      (r.subjectId ?? r.landlordId) !== user._id ||
      r.status !== "approved"
    )
      throw new Error(
        "Only the reviewed party can respond to an approved review.",
      );
    const body = args.body.trim();
    if (body.length < 3 || body.length > 1000)
      throw new Error("Enter a response of 3–1000 characters.");
    if (r.responseStatus && r.responseStatus !== "rejected")
      throw new Error(
        "A response is already submitted. Contact support to change it.",
      );
    await audit(
      ctx,
      r,
      user._id,
      "response_submitted",
      "Awaiting response moderation",
    );
    await ctx.db.patch(r._id, {
      response: body,
      responseStatus: "pending",
      responseRevision: (r.responseRevision ?? 0) + 1,
      responseAt: Date.now(),
      responseNote: "",
    });
    return null;
  },
});
export const flag = mutation({
  args: { id: v.id("reviews"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      r = await ctx.db.get(args.id),
      reason = args.reason.trim();
    if (!r || (r.status !== "approved" && r.reviewerId !== user._id))
      throw new Error("Review not found.");
    if (r.kind === "traveler" && !(await canReadTraveler(ctx, r.subjectId!)))
      throw new Error("Not authorized.");
    if (reason.length < 10 || reason.length > 1000)
      throw new Error("Explain the concern in 10–1000 characters.");
    if (r.removalRequested) return null;
    await ctx.db.patch(r._id, {
      removalRequested: true,
      removalReason: reason,
    });
    await audit(ctx, r, user._id, "removal_requested", reason);
    return null;
  },
});
export const queue = query({
  args: {
    view: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("removed"),
      v.literal("responses"),
      v.literal("reports"),
      v.literal("legacy"),
    ),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(privateReview),
    ...pageMetadata,
  }),
  handler: async (ctx, args) => {
    await requireReviewStaff(ctx);
    const q =
      args.view === "responses"
        ? ctx.db
            .query("reviews")
            .withIndex("by_response_status", (q) =>
              q.eq("responseStatus", "pending"),
            )
        : args.view === "reports"
          ? ctx.db
              .query("reviews")
              .withIndex("by_removal", (q) => q.eq("removalRequested", true))
          : ctx.db
              .query("reviews")
              .withIndex("by_status", (q) =>
                q.eq(
                  "status",
                  args.view === "pending" ||
                    args.view === "approved" ||
                    args.view === "rejected" ||
                    args.view === "removed"
                    ? args.view
                    : undefined,
                ),
              );
    const page = await q.order("desc").paginate({
      ...args.paginationOpts,
      numItems: Math.max(1, Math.min(50, args.paginationOpts.numItems)),
    });
    return {
      ...page,
      page: await Promise.all(
        page.page.map((r) => privateProjection(ctx, r, true)),
      ),
    };
  },
});
export const moderate = mutation({
  args: {
    id: v.id("reviews"),
    part: v.union(v.literal("review"), v.literal("response")),
    decision: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("removed"),
    ),
    expectedRevision: v.number(),
    note: v.string(),
    experienceChecked: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requireReviewStaff(ctx),
      r = await ctx.db.get(args.id),
      note = args.note.trim();
    if (!r) throw new Error("Review not found.");
    if (note.length < 3 || note.length > 2000)
      throw new Error("Enter a moderation note of 3–2000 characters.");
    if (
      args.expectedRevision !==
      (args.part === "review" ? (r.revision ?? 0) : (r.responseRevision ?? 0))
    )
      throw new Error("The revision changed. Inspect the current submission.");
    if (args.part === "response") {
      if (!r.response || !r.responseStatus)
        throw new Error("Response not found.");
      if (args.decision === "approved" && r.status !== "approved")
        throw new Error("Approve the parent review first.");
      if (r.responseStatus === args.decision) return null;
      await ctx.db.patch(r._id, {
        responseStatus: args.decision,
        responseNote: note,
      });
    } else {
      if (r.status === args.decision) return null;
      if (args.decision === "approved") {
        validateReview(r);
        await checkStay(ctx, r);
        if (!args.experienceChecked)
          throw new Error(
            "Confirm that you checked the stay context and content standards.",
          );
        if (!r.kind || !r.subjectId)
          throw new Error(
            "The author must resubmit this legacy review with stay details.",
          );
      }
      const counted = args.decision === "approved";
      if (!!r.counted !== counted) await adjustStats(ctx, r, counted ? 1 : -1);
      await ctx.db.patch(r._id, {
        status: args.decision,
        moderationNote: note,
        counted,
        removalRequested: false,
      });
    }
    await audit(ctx, r, staff._id, `${args.part}_${args.decision}`, note);
    const recipientId =
      args.part === "review" ? r.reviewerId : (r.subjectId ?? r.landlordId);
    const noticeId = await ctx.db.insert("reviewNotices", {
      reviewId: r._id,
      recipientId,
      kind: "decision",
      body: `Your ${args.part} was ${args.decision}. Staff note: ${note}${args.decision === "rejected" ? " You can revise and resubmit it from your account." : ""}`,
      emailStatus: "pending",
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.reviewEmails.deliver, {
      id: noticeId,
    });
    return null;
  },
});
export const resolveFlag = mutation({
  args: { id: v.id("reviews"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requireReviewStaff(ctx),
      r = await ctx.db.get(args.id),
      note = args.note.trim();
    if (!r || !r.removalRequested) throw new Error("No open report.");
    if (note.length < 3 || note.length > 2000)
      throw new Error("Enter a moderation note of 3–2000 characters.");
    await ctx.db.patch(r._id, { removalRequested: false });
    await audit(ctx, r, staff._id, "report_resolved", note);
    return null;
  },
});
export const history = query({
  args: { id: v.id("reviews"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        action: v.string(),
        note: v.string(),
        revision: v.number(),
        snapshot: v.optional(v.string()),
        createdAt: v.number(),
      }),
    ),
    ...pageMetadata,
  }),
  handler: async (ctx, args) => {
    await requireReviewStaff(ctx);
    const page = await ctx.db
      .query("reviewEvents")
      .withIndex("by_review", (q) => q.eq("reviewId", args.id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(1, Math.min(50, args.paginationOpts.numItems)),
      });
    return {
      ...page,
      page: page.page.map(
        ({ action, note, revision, snapshot, createdAt }) => ({
          action,
          note,
          revision,
          snapshot,
          createdAt,
        }),
      ),
    };
  },
});

export const actions = query({
  args: { id: v.id("reviews") },
  returns: v.union(
    v.null(),
    v.object({
      canRespond: v.boolean(),
      isAuthor: v.boolean(),
      responseStatus: v.optional(reviewStatus),
      responseDraft: v.string(),
      responseNote: v.string(),
      reported: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique(),
      r = await ctx.db.get(args.id);
    if (!user || !r) return null;
    if (r.kind === "traveler" && !(await canReadTraveler(ctx, r.subjectId!)))
      return null;
    const isSubject = (r.subjectId ?? r.landlordId) === user._id;
    return {
      canRespond:
        isSubject &&
        r.status === "approved" &&
        (!r.responseStatus || r.responseStatus === "rejected"),
      isAuthor: r.reviewerId === user._id,
      responseStatus: isSubject ? r.responseStatus : undefined,
      responseDraft: isSubject ? (r.response ?? "") : "",
      responseNote: isSubject ? (r.responseNote ?? "") : "",
      reported: !!r.removalRequested,
    };
  },
});

export const invitationContext = query({
  args: { inquiryId: v.id("bookingInquiries") },
  returns: v.object({
    id: v.id("bookingInquiries"),
    listingId: v.id("listings"),
    landlordId: v.id("users"),
    subjectId: v.id("users"),
    kind: reviewKind,
    title: v.string(),
    moveIn: v.number(),
    moveOut: v.number(),
    eligible: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      i = await ctx.db.get(args.inquiryId);
    if (!i || ![i.tenantId, i.landlordId].includes(user._id))
      throw new Error("This stay is private.");
    return {
      id: i._id,
      listingId: i.listingId,
      landlordId: i.landlordId,
      subjectId: user._id === i.tenantId ? i.landlordId : i.tenantId,
      kind:
        user._id === i.tenantId ? ("property" as const) : ("traveler" as const),
      title: (await ctx.db.get(i.listingId))?.title ?? "Past property",
      moveIn: i.moveIn,
      moveOut: reviewEnd(i),
      eligible: reviewableBooking(i),
    };
  },
});

export const travelerProfile = query({
  args: { id: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({ name: v.string(), count: v.number(), average: v.number() }),
  ),
  handler: async (ctx, args) => {
    if (!(await canReadTraveler(ctx, args.id))) return null;
    const user = await ctx.db.get(args.id);
    if (!user) return null;
    return {
      name:
        user.displayName?.trim().split(/\s+/)[0] ||
        user.name?.trim().split(/\s+/)[0] ||
        "Traveler",
      ...(await stats(ctx, `traveler:${args.id}`)),
    };
  },
});
