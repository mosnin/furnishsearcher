import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Get active subscription for a user.
 */
export const getActiveSubscription = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    return (
      subs.find(
        (s) =>
          (s.status === "active" || s.status === "trialing") &&
          s.currentPeriodEnd > now
      ) ?? null
    );
  },
});

/**
 * List payment history for a user (most recent first).
 */
export const getPaymentsByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
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
      v.literal("other")
    ),
    listingId: v.optional(v.id("listings")),
    amountCents: v.number(),
    currency: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("payments", {
      userId: args.userId,
      creemCheckoutId: args.creemCheckoutId,
      productId: args.productId,
      purpose: args.purpose,
      listingId: args.listingId,
      amountCents: args.amountCents,
      currency: args.currency,
      status: "pending",
      metadata: args.metadata,
      createdAt: Date.now(),
    });
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
        q.eq("source", args.source).eq("eventId", args.eventId)
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
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_creem_checkout", (q) =>
        q.eq("creemCheckoutId", args.creemCheckoutId)
      )
      .first();

    if (!payment) {
      return { ok: false, reason: "payment_not_found" as const };
    }
    if (payment.status === "completed") {
      return { ok: true, reason: "already_completed" as const };
    }

    await ctx.db.patch(payment._id, {
      status: "completed",
      completedAt: Date.now(),
      creemTransactionId: args.creemTransactionId,
      creemCustomerId: args.creemCustomerId,
    });

    // Side effects based on purpose
    if (payment.purpose === "feature_listing" && payment.listingId) {
      // Feature the listing for 30 days from now
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      await ctx.db.patch(payment.listingId, {
        featured: true,
        featuredUntil: Date.now() + thirtyDays,
      });
    }

    return { ok: true, reason: "applied" as const, paymentId: payment._id };
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
      v.literal("tenant_plus")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("paused"),
      v.literal("canceled"),
      v.literal("expired")
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_creem_subscription", (q) =>
        q.eq("creemSubscriptionId", args.creemSubscriptionId)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        updatedAt: now,
        creemCustomerId: args.creemCustomerId ?? existing.creemCustomerId,
      });
      return existing._id;
    }

    return await ctx.db.insert("subscriptions", {
      userId: args.userId,
      creemSubscriptionId: args.creemSubscriptionId,
      creemCustomerId: args.creemCustomerId,
      creemProductId: args.creemProductId,
      plan: args.plan,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      createdAt: now,
      updatedAt: now,
    });
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
      v.literal("expired")
    ),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_creem_subscription", (q) =>
        q.eq("creemSubscriptionId", args.creemSubscriptionId)
      )
      .first();
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      status: args.status,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      updatedAt: Date.now(),
    });
    return existing._id;
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
        q.eq("creemCheckoutId", args.creemCheckoutId)
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    return user?._id ?? null;
  },
});
