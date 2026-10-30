import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { canonicalEmail } from "../lib/email-contact";
import { contactHash } from "../lib/clerk-contact-event";
import { emailContactMode } from "./lib/emailContact";
import { blockState } from "./lib/messageAccess";
import {
  verifiedEmailAccount,
  invitationUsable,
  INVITATION_UNAVAILABLE,
} from "./lib/reviewInvitations";
import { pageMetadata, reviewKind } from "./validators/reviews";
import { invitationDeliveryStatus } from "./validators/reviewInvitations";
const day = 86400000;
export const request = mutation({
  args: {
    propertyReference: v.string(),
    email: v.string(),
    agreed: v.boolean(),
    requestId: v.string(),
  },
  returns: v.object({
    status: v.union(
      v.literal("created"),
      v.literal("existing"),
      v.literal("unavailable"),
      v.literal("limited"),
    ),
    id: v.optional(v.id("reviewInvitations")),
  }),
  handler: async (ctx, args) => {
    const sender = await requireUser(ctx);
    if (!args.agreed)
      throw new Error(
        "Confirm that you are requesting an honest review of an actual stay.",
      );
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(args.requestId))
      throw new Error("Invalid request reference.");
    const reference = args.propertyReference.trim();
    if (!reference || reference.length > 100)
      throw new Error("Enter a property number or listing ID.");
    const email = canonicalEmail(args.email),
      identity = await ctx.auth.getUserIdentity();
    if (
      identity?.emailVerified !== true ||
      typeof identity.email !== "string" ||
      (await verifiedEmailAccount(ctx, canonicalEmail(identity.email)))?._id !==
        sender._id
    )
      throw new Error(
        "Confirm your sign-in email and refresh this page before requesting reviews.",
      );
    const prior = await ctx.db
      .query("reviewInvitations")
      .withIndex("by_sender_request", (q) =>
        q.eq("senderId", sender._id).eq("requestId", args.requestId),
      )
      .unique();
    if (prior) {
      if (
        prior.recipientEmail !== email ||
        prior.propertyReference !== reference
      )
        throw new Error("Request reference already used. Start a new request.");
      return { status: "existing" as const, id: prior._id };
    }
    const date = Math.floor(Date.now() / day) * day,
      limit = await ctx.db
        .query("reviewInvitationLimits")
        .withIndex("by_user_day", (q) =>
          q.eq("userId", sender._id).eq("day", date),
        )
        .unique();
    if ((limit?.attempts ?? 0) >= 10) return { status: "limited" as const };
    if (limit) await ctx.db.patch(limit._id, { attempts: limit.attempts + 1 });
    else
      await ctx.db.insert("reviewInvitationLimits", {
        userId: sender._id,
        day: date,
        attempts: 1,
      });
    const id = ctx.db.normalizeId("listings", reference);
    const listing = id
      ? await ctx.db.get(id)
      : await ctx.db
          .query("listings")
          .withIndex("by_publicId", (q) =>
            q.eq("publicId", reference.toUpperCase()),
          )
          .unique();
    const recipient = await verifiedEmailAccount(ctx, email);
    if (
      !listing ||
      !recipient ||
      sender._id === recipient._id ||
      (await blockState(ctx, sender._id, recipient._id)).cannotMessage
    )
      return { status: "unavailable" as const };
    const ownerRequests = listing.landlordId === sender._id;
    if (!ownerRequests && listing.landlordId !== recipient._id)
      return { status: "unavailable" as const };
    const priorReview = ownerRequests
      ? await ctx.db
          .query("reviews")
          .withIndex("by_reviewer_listing", (q) =>
            q.eq("reviewerId", recipient._id).eq("listingId", listing._id),
          )
          .first()
      : await ctx.db
          .query("reviews")
          .withIndex("by_reviewer_kind_subject", (q) =>
            q
              .eq("reviewerId", recipient._id)
              .eq("kind", "traveler")
              .eq("subjectId", sender._id),
          )
          .first();
    if (priorReview) return { status: "unavailable" as const };
    const duplicates = await ctx.db
      .query("reviewInvitations")
      .withIndex("by_pair_listing", (q) =>
        q
          .eq("senderId", sender._id)
          .eq("recipientId", recipient._id)
          .eq("listingId", listing._id),
      )
      .order("desc")
      .take(1);
    if (duplicates[0] && duplicates[0].createdAt > Date.now() - 3 * day)
      return { status: "existing" as const, id: duplicates[0]._id };
    const recent = await ctx.db
      .query("reviewInvitations")
      .withIndex("by_recipient", (q) => q.eq("recipientId", recipient._id))
      .order("desc")
      .take(5);
    if (recent.length === 5 && recent[4].createdAt > Date.now() - day)
      return { status: "unavailable" as const };
    const invitationId = await ctx.db.insert("reviewInvitations", {
      senderId: sender._id,
      recipientId: recipient._id,
      listingId: listing._id,
      landlordId: listing.landlordId,
      kind: ownerRequests ? "property" : "traveler",
      subjectId: sender._id,
      recipientEmail: email,
      recipientEmailHash: await contactHash(email),
      mode: emailContactMode(),
      propertyReference: reference,
      requestId: args.requestId,
      state: "active",
      emailStatus: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * day,
    });
    await ctx.scheduler.runAfter(0, internal.reviewInvitationEmails.deliver, {
      id: invitationId,
    });
    await ctx.scheduler.runAt(
      Date.now() + 30 * day,
      internal.reviewInvitations.expire,
      { id: invitationId },
    );
    return { status: "created" as const, id: invitationId };
  },
});
const row = v.object({
  id: v.id("reviewInvitations"),
  propertyReference: v.string(),
  email: v.optional(v.string()),
  kind: reviewKind,
  state: v.union(
    v.literal("active"),
    v.literal("revoked"),
    v.literal("declined"),
    v.literal("expired"),
  ),
  emailStatus: invitationDeliveryStatus,
  createdAt: v.number(),
  expiresAt: v.number(),
  submitted: v.boolean(),
  available: v.boolean(),
});
export const list = query({
  args: {
    direction: v.union(v.literal("sent"), v.literal("received")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ page: v.array(row), ...pageMetadata }),
  handler: async (ctx, args) => {
    const u = await requireUser(ctx),
      page = await ctx.db
        .query("reviewInvitations")
        .withIndex(
          args.direction === "sent" ? "by_sender" : "by_recipient",
          (q) =>
            args.direction === "sent"
              ? q.eq("senderId", u._id)
              : q.eq("recipientId", u._id),
        )
        .order("desc")
        .paginate({
          ...args.paginationOpts,
          numItems: Math.max(1, Math.min(20, args.paginationOpts.numItems)),
        });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (r) => ({
          id: r._id,
          propertyReference: r.propertyReference,
          ...(args.direction === "sent" ? { email: r.recipientEmail } : {}),
          kind: r.kind,
          state: r.state,
          emailStatus: r.emailStatus,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          submitted: !!r.reviewId,
          available: !r.reviewId && (await invitationUsable(ctx, r)),
        })),
      ),
    };
  },
});
export const context = query({
  args: { id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("reviewInvitations"),
      listingId: v.id("listings"),
      landlordId: v.id("users"),
      subjectId: v.id("users"),
      kind: reviewKind,
      title: v.string(),
      requesterName: v.string(),
    }),
  ),
  handler: async (ctx, { id }) => {
    const u = await requireUser(ctx),
      nativeId = ctx.db.normalizeId("reviewInvitations", id),
      r = nativeId ? await ctx.db.get(nativeId) : null;
    if (
      !r ||
      r.recipientId !== u._id ||
      r.reviewId ||
      !(await invitationUsable(ctx, r))
    )
      return null;
    const listing = await ctx.db.get(r.listingId),
      sender = await ctx.db.get(r.senderId);
    return {
      id: r._id,
      listingId: r.listingId,
      landlordId: r.landlordId,
      subjectId: r.subjectId,
      kind: r.kind,
      title: listing!.title,
      requesterName:
        (sender!.displayName ?? sender!.name).trim().split(/\s+/)[0] ||
        "Member",
    };
  },
});
export const close = mutation({
  args: { id: v.id("reviewInvitations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const u = await requireUser(ctx),
      r = await ctx.db.get(id);
    if (!r || ![r.senderId, r.recipientId].includes(u._id))
      throw new Error(INVITATION_UNAVAILABLE);
    if (r.state === "active")
      await ctx.db.patch(id, {
        state: u._id === r.senderId ? "revoked" : "declined",
      });
    return null;
  },
});
export const retry = mutation({
  args: { id: v.id("reviewInvitations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const u = await requireUser(ctx),
      r = await ctx.db.get(id);
    if (
      !r ||
      r.senderId !== u._id ||
      r.reviewId ||
      !(await invitationUsable(ctx, r))
    )
      throw new Error(INVITATION_UNAVAILABLE);
    if (r.emailStatus === "sent") return null;
    if ((r.lastAttemptAt ?? r.createdAt) > Date.now() - 60000)
      throw new Error("Wait a minute before retrying.");
    await ctx.db.patch(id, {
      emailStatus: "pending",
      lastAttemptAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.reviewInvitationEmails.deliver, {
      id,
    });
    return null;
  },
});
export const emailDetails = internalQuery({
  args: { id: v.id("reviewInvitations") },
  returns: v.union(v.null(), v.object({ email: v.string(), path: v.string() })),
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    if (
      !r ||
      r.emailStatus === "sent" ||
      r.reviewId ||
      !(await invitationUsable(ctx, r))
    )
      return null;
    return {
      email: r.recipientEmail,
      path: `/dashboard/reviews?reviewRequest=${r._id}`,
    };
  },
});
export const record = internalMutation({
  args: { id: v.id("reviewInvitations"), status: invitationDeliveryStatus },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    const r = await ctx.db.get(id);
    if (r && r.emailStatus !== "sent")
      await ctx.db.patch(id, {
        emailStatus:
          status !== "sent" &&
          (r.state !== "active" || r.expiresAt <= Date.now() || r.reviewId)
            ? "suppressed"
            : status,
        lastAttemptAt: Date.now(),
      });
    return null;
  },
});

export const properties = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        id: v.id("listings"),
        title: v.string(),
        publicId: v.optional(v.string()),
      }),
    ),
    ...pageMetadata,
  }),
  handler: async (ctx, args) => {
    const u = await requireUser(ctx),
      p = await ctx.db
        .query("listings")
        .withIndex("by_landlord", (q) => q.eq("landlordId", u._id))
        .order("desc")
        .paginate({
          ...args.paginationOpts,
          numItems: Math.max(1, Math.min(20, args.paginationOpts.numItems)),
        });
    return {
      ...p,
      page: p.page.map((r) => ({
        id: r._id,
        title: r.title,
        publicId: r.publicId,
      })),
    };
  },
});

export const expire = internalMutation({
  args: { id: v.id("reviewInvitations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    if (r?.state === "active" && r.expiresAt <= Date.now())
      await ctx.db.patch(id, { state: "expired" });
    return null;
  },
});
