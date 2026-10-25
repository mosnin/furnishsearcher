import { findActiveUser } from "./lib/auth";
import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireUser } from "./lib/auth";
import { activePaidSubscription, requireBillingOwner } from "./lib/billing";
import { billingPlan } from "./validators/billing";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Get active subscription for a user.
 */
export const getActiveSubscription = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireBillingOwner(ctx, args.userId);
    return activePaidSubscription(ctx, args.userId);
  },
});

/**
 * List payment history for a user (most recent first).
 */
export const getPaymentsByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireBillingOwner(ctx, args.userId);
    return ctx.db
      .query("payments")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
  },
});

/**
 * Called from the app after creating a Creem checkout session so the client
 * can look up the pending checkout.
 */
export const recordPendingCheckout = mutation({
  args: {
    userId: v.id("users"),
    creemCheckoutId: v.string(),
    productId: v.string(),
    purpose: v.union(
      v.literal("feature_listing"),
      v.literal("subscription"),
      v.literal("security_deposit"),
      v.literal("other"),
    ),
    listingId: v.optional(v.id("listings")),
    amountCents: v.number(),
    currency: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBillingOwner(ctx, args.userId);
    throw new Error(
      "Checkouts must be created through the authenticated billing action.",
    );
  },
});

/**
 * Idempotent webhook processing: returns the existing event row if we've
 * already seen this (source, eventId) pair.
 */
export const findWebhookEvent = internalQuery({
  args: { source: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("webhookEvents")
      .withIndex("by_source_event", (q) =>
        q.eq("source", args.source).eq("eventId", args.eventId),
      )
      .first();
  },
});

export const recordWebhookEvent = internalMutation({
  args: {
    source: v.string(),
    eventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("webhookEvents", {
      source: args.source,
      eventId: args.eventId,
      eventType: args.eventType,
      payload: args.payload,
      processedAt: Date.now(),
    });
  },
});

/**
 * Handle a completed checkout payment — marks payment complete and applies
 * any side effects (featuring a listing, etc.). Called from the webhook route.
 */
export const applyCheckoutCompleted = internalMutation({
  args: {
    creemCheckoutId: v.string(),
    creemTransactionId: v.optional(v.string()),
    creemCustomerId: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error(
      "Use the atomic signed webhook processor for billing state changes.",
    );
  },
});

/**
 * Upsert a subscription row based on Creem webhook data.
 */
export const upsertSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    creemSubscriptionId: v.string(),
    creemCustomerId: v.optional(v.string()),
    creemProductId: v.string(),
    plan: v.union(
      v.literal("landlord_pro"),
      v.literal("landlord_premium"),
      v.literal("tenant_plus"),
    ),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("paused"),
      v.literal("canceled"),
      v.literal("expired"),
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async () => {
    throw new Error(
      "Use the atomic signed webhook processor for billing state changes.",
    );
  },
});

/**
 * Mark a subscription as canceled/paused/expired via webhook.
 */
export const patchSubscriptionStatus = internalMutation({
  args: {
    creemSubscriptionId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("paused"),
      v.literal("canceled"),
      v.literal("expired"),
    ),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async () => {
    throw new Error(
      "Use the atomic signed webhook processor for billing state changes.",
    );
  },
});

/**
 * Internal helper used by webhook to look up user by Clerk id.
 */
export const findUserByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

/**
 * Lookup a payment by checkout id (used when webhook needs to find the user).
 */
export const findPaymentByCheckoutId = internalQuery({
  args: { creemCheckoutId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_creem_checkout", (q) =>
        q.eq("creemCheckoutId", args.creemCheckoutId),
      )
      .first();
  },
});

/**
 * Resolve a user's id by either Convex id or Clerk id. Used by the checkout
 * action so the client doesn't need to pre-resolve.
 */
export const resolveUserId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<Id<"users"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.subject !== args.clerkId) return null;
    const user = await findActiveUser(ctx, args.clerkId);
    return user?._id ?? null;
  },
});

export const listPayments = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireBillingOwner(ctx, args.userId);
    return ctx.db
      .query("payments")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(args.paginationOpts.numItems, 30),
      });
  },
});
export const getSubscription = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireBillingOwner(ctx, args.userId);
    const active = await activePaidSubscription(ctx, args.userId);
    const subscription =
      active ??
      (await ctx.db
        .query("subscriptions")
        .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
        .order("desc")
        .first());
    return subscription
      ? { ...subscription, paidAccessGranted: !!active }
      : null;
  },
});
export const checkoutAccount = internalQuery({
  args: { userId: v.id("users"), listingId: v.optional(v.id("listings")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user._id !== args.userId)
      throw new Error("Not authorized to bill another account.");
    if (args.listingId) {
      const listing = await ctx.db.get(args.listingId);
      if (!listing || listing.landlordId !== user._id)
        throw new Error("Not authorized to purchase a boost for this listing.");
    }
    return { email: user.email };
  },
});
export const prepareCheckout = internalMutation({
  args: {
    userId: v.id("users"),
    listingId: v.optional(v.id("listings")),
    productId: v.string(),
    purpose: v.union(v.literal("subscription"), v.literal("feature_listing")),
    plan: v.optional(billingPlan),
    mode: v.union(v.literal("test"), v.literal("prod")),
    returnUrl: v.string(),
    clientRequestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user._id !== args.userId) throw new Error("Not authorized");
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        args.clientRequestId,
      )
    )
      throw new Error("Invalid checkout request reference.");
    const requestId = `${user._id}_${args.mode}_${args.clientRequestId}`;
    const previous = await ctx.db
      .query("payments")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .unique();
    if (previous) {
      if (
        previous.userId !== user._id ||
        previous.productId !== args.productId ||
        previous.listingId !== args.listingId ||
        previous.plan !== args.plan ||
        previous.returnUrl !== args.returnUrl
      )
        throw new Error("Checkout reference already used for another request.");
      return previous;
    }
    const recent = await ctx.db
      .query("payments")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", user._id).gte("createdAt", Date.now() - 3600000),
      )
      .take(21);
    if (recent.length >= 20)
      throw new Error("Checkout request limit reached. Try later.");
    const id = await ctx.db.insert("payments", {
      userId: user._id,
      listingId: args.listingId,
      productId: args.productId,
      purpose: args.purpose,
      plan: args.plan,
      mode: args.mode,
      requestId,
      trustedCheckout: true,
      returnUrl: args.returnUrl,
      creemCheckoutId: `pending:${requestId}`,
      amountCents: 0,
      currency: "USD",
      status: "pending",
      createdAt: Date.now(),
    });
    return (await ctx.db.get(id))!;
  },
});
export const finishCheckout = internalMutation({
  args: {
    paymentId: v.id("payments"),
    checkoutId: v.string(),
    checkoutUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.userId !== user._id || !payment.trustedCheckout)
      throw new Error("Not authorized");
    if (
      !payment.creemCheckoutId.startsWith("pending:") &&
      payment.creemCheckoutId !== args.checkoutId
    )
      throw new Error("Provider checkout changed for the same request.");
    await ctx.db.patch(payment._id, {
      creemCheckoutId: args.checkoutId,
      checkoutUrl: args.checkoutUrl,
    });
  },
});
export const portalAccount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (!customer)
      throw new Error("No verified billing account is available yet.");
    return customer;
  },
});

export const getCheckout = query({
  args: { checkoutId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_creem_checkout", (q) =>
        q.eq("creemCheckoutId", args.checkoutId),
      )
      .unique();
    if (!payment || !payment.trustedCheckout || payment.userId !== user._id)
      return null;
    return {
      status: payment.status,
      purpose: payment.purpose,
      amountCents: payment.amountCents,
      currency: payment.currency,
    };
  },
});

export const refreshEntitlement = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    expectedExpiration: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (
      subscription &&
      subscription.status === "active" &&
      subscription.entitlementExpiresAt === args.expectedExpiration &&
      Math.min(subscription.paidThrough ?? 0, subscription.currentPeriodEnd) <=
        Date.now()
    ) {
      await ctx.db.patch(subscription._id, {
        entitlementExpiresAt: undefined,
        entitlementCheckedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.publication.reconcileOwner, {
        userId: subscription.userId,
        cursor: null,
      });
    }
    return null;
  },
});
export const expireFeature = internalMutation({
  args: {
    listingId: v.id("listings"),
    paymentId: v.id("payments"),
    expectedUntil: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (
      listing?.featuredPaymentId === args.paymentId &&
      listing.featuredUntil === args.expectedUntil &&
      listing.featuredUntil <= Date.now()
    )
      await ctx.db.patch(listing._id, {
        featured: false,
        featuredUntil: undefined,
        featuredPaymentId: undefined,
      });
    return null;
  },
});
