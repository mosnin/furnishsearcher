import { reviewableBooking } from "./lib/bookings";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { blockState, requireMessagingAllowed } from "./lib/messageAccess";
import { requireUser } from "./lib/auth";
import { deliveryStatus } from "./validators/support";
import { pageMetadata } from "./validators/reviews";
export const requestReview = mutation({
  args: { inquiryId: v.id("bookingInquiries") },
  returns: v.id("reviewNotices"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      i = await ctx.db.get(args.inquiryId);
    if (!i || ![i.landlordId, i.tenantId].includes(user._id))
      throw new Error("This stay is private.");
    if (!reviewableBooking(i))
      throw new Error("Request a review after the accepted stay has started.");
    const recipientId = user._id === i.landlordId ? i.tenantId : i.landlordId;
    await requireMessagingAllowed(ctx, user._id, recipientId);
    const existing = await ctx.db
      .query("reviewNotices")
      .withIndex("by_inquiry_recipient", (q) =>
        q.eq("inquiryId", i._id).eq("recipientId", recipientId),
      )
      .order("desc")
      .first();
    if (existing && existing.createdAt > Date.now() - 3 * 86400000)
      return existing._id;
    const recent = await ctx.db
      .query("reviewNotices")
      .withIndex("by_recipient_kind", (q) =>
        q.eq("recipientId", recipientId).eq("kind", "invitation"),
      )
      .order("desc")
      .take(10);
    if (
      recent.filter(
        (n) => n.kind === "invitation" && n.createdAt > Date.now() - 86400000,
      ).length >= 5
    )
      throw new Error(
        "This recipient's review invitation limit has been reached.",
      );
    const id = await ctx.db.insert("reviewNotices", {
      inquiryId: i._id,
      recipientId,
      senderId: user._id,
      kind: "invitation",
      body: "Your stay partner has requested an honest review of your stay. Only submit if the stay actually occurred. Reviews are moderated before publication.",
      emailStatus: "pending",
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.reviewEmails.deliver, { id });
    return id;
  },
});
export const mine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("reviewNotices"),
        kind: v.union(v.literal("decision"), v.literal("invitation")),
        body: v.string(),
        emailStatus: deliveryStatus,
        inquiryId: v.optional(v.id("bookingInquiries")),
        createdAt: v.number(),
      }),
    ),
    ...pageMetadata,
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      page = await ctx.db
        .query("reviewNotices")
        .withIndex("by_recipient", (q) => q.eq("recipientId", user._id))
        .order("desc")
        .paginate({
          ...args.paginationOpts,
          numItems: Math.max(1, Math.min(50, args.paginationOpts.numItems)),
        });
    return {
      ...page,
      page: page.page.map(
        ({ _id, kind, body, emailStatus, inquiryId, createdAt }) => ({
          _id,
          kind,
          body,
          emailStatus,
          inquiryId,
          createdAt,
        }),
      ),
    };
  },
});
export const retry = mutation({
  args: { id: v.id("reviewNotices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      notice = await ctx.db.get(args.id);
    if (
      !notice ||
      (![notice.recipientId, notice.senderId].includes(user._id) &&
        user.role !== "admin")
    )
      throw new Error("Not authorized.");
    if (notice.emailStatus === "sent") return null;
    if ((notice.lastAttemptAt ?? 0) > Date.now() - 60000)
      throw new Error("Wait a minute before retrying.");
    await ctx.db.patch(notice._id, {
      emailStatus: "pending",
      lastAttemptAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.reviewEmails.deliver, args);
    return null;
  },
});
export const emailDetails = internalQuery({
  args: { id: v.id("reviewNotices") },
  returns: v.union(
    v.null(),
    v.object({ email: v.string(), body: v.string(), path: v.string() }),
  ),
  handler: async (ctx, args) => {
    const n = await ctx.db.get(args.id);
    if (!n || n.emailStatus === "sent") return null;
    if (
      n.kind === "invitation" &&
      n.senderId &&
      (await blockState(ctx, n.senderId, n.recipientId)).cannotMessage
    )
      return null;
    const user = await ctx.db.get(n.recipientId);
    if (!user || user.clerkDeletedAt !== undefined) return null;
    return {
      email: user.email,
      body: n.body,
      path: n.inquiryId
        ? `/dashboard/reviews?inquiry=${n.inquiryId}`
        : "/dashboard/reviews",
    };
  },
});
export const record = internalMutation({
  args: { id: v.id("reviewNotices"), status: deliveryStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    const n = await ctx.db.get(args.id);
    if (n && n.emailStatus !== "sent")
      await ctx.db.patch(n._id, {
        emailStatus: args.status,
        lastAttemptAt: Date.now(),
      });
    return null;
  },
});
