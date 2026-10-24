import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { billingMode, configuredPlan } from "../lib/billing";
import type { Doc } from "./_generated/dataModel";
type ObjectValue = Record<string, any>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid webhook object");
  return value as ObjectValue;
}
function identifier(value: unknown): string {
  const id = typeof value === "string" ? value : object(value).id;
  if (typeof id !== "string" || !id || id.length > 200)
    throw new Error("Invalid provider identifier");
  return id;
}
function date(value: unknown): number {
  const ts = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ts) || ts < 0)
    throw new Error("Invalid subscription period");
  return ts;
}
export const process = internalMutation({
  args: { payload: v.string() },
  returns: v.object({ outcome: v.string() }),
  handler: async (ctx, { payload }) => {
    const event = object(JSON.parse(payload));
    const eventId = identifier(event.id),
      type = event.eventType,
      at = event.created_at;
    if (
      typeof type !== "string" ||
      type.length > 100 ||
      !Number.isSafeInteger(at) ||
      at <= 0 ||
      at > Date.now() + 300000
    )
      throw new Error("Invalid webhook envelope");
    const duplicate = await ctx.db
      .query("webhookEvents")
      .withIndex("by_source_event", (q) =>
        q.eq("source", "creem").eq("eventId", eventId),
      )
      .unique();
    if (duplicate) return { outcome: "duplicate" };
    const source = object(event.object);
    const record = async (outcome: string) => {
      await ctx.db.insert("webhookEvents", {
        source: "creem",
        eventId,
        eventType: type,
        payload: JSON.stringify({ objectId: source.id, outcome }),
        processedAt: Date.now(),
      });
      return { outcome };
    };
    const subscriptionTypes = [
      "subscription.paid",
      "subscription.active",
      "subscription.update",
      "subscription.trialing",
      "subscription.scheduled_cancel",
      "subscription.past_due",
      "subscription.unpaid",
      "subscription.paused",
      "subscription.canceled",
      "subscription.expired",
    ];
    if (
      type !== "checkout.completed" &&
      type !== "refund.created" &&
      type !== "dispute.created" &&
      !subscriptionTypes.includes(type)
    )
      return record("ignored_event_type");
    const mode = billingMode();
    if (source.mode !== mode)
      throw new Error(
        "Webhook environment does not match billing configuration",
      );
    if (type === "refund.created" || type === "dispute.created") {
      if (type === "refund.created" && source.status !== "succeeded")
        return record("refund_not_completed");
      const transaction = object(source.transaction),
        customerId = identifier(source.customer);
      let payment = source.checkout
        ? await ctx.db
            .query("payments")
            .withIndex("by_creem_checkout", (q) =>
              q.eq("creemCheckoutId", identifier(source.checkout)),
            )
            .filter((q) => q.eq(q.field("trustedCheckout"), true))
            .unique()
        : null;
      if (!payment && source.checkout?.request_id)
        payment = await ctx.db
          .query("payments")
          .withIndex("by_request", (q) =>
            q.eq("requestId", source.checkout.request_id),
          )
          .unique();
      const subId = transaction.subscription
        ? identifier(transaction.subscription)
        : source.subscription
          ? identifier(source.subscription)
          : null;
      const sub = subId
        ? await ctx.db
            .query("subscriptions")
            .withIndex("by_creem_subscription", (q) =>
              q.eq("creemSubscriptionId", subId),
            )
            .unique()
        : null;
      if (!payment && !sub)
        throw new Error("Adjustment is not associated with this app");
      if (
        payment &&
        (!payment.trustedCheckout ||
          payment.mode !== mode ||
          (payment.creemCustomerId && payment.creemCustomerId !== customerId) ||
          payment.productId !==
            identifier(source.order?.product ?? source.subscription?.product))
      )
        throw new Error("Adjustment account mismatch");
      if (sub && (sub.mode !== mode || sub.creemCustomerId !== customerId))
        throw new Error("Adjustment subscription mismatch");
      const paid = transaction.amount_paid,
        refunded = transaction.refunded_amount ?? source.refund_amount;
      if (
        !Number.isSafeInteger(paid) ||
        paid <= 0 ||
        (type === "refund.created" &&
          (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > paid))
      )
        throw new Error("Invalid adjustment amount");
      const transactionId = identifier(transaction.id);
      const previous = await ctx.db
        .query("billingAdjustments")
        .withIndex("by_transaction_mode", (q) =>
          q.eq("transactionId", transactionId).eq("mode", mode),
        )
        .unique();
      const cumulative = Math.max(
          type === "refund.created" ? refunded : 0,
          previous?.refundedAmount ?? 0,
        ),
        disputed = type === "dispute.created" || !!previous?.disputed;
      const adjustment = {
        transactionId,
        mode,
        refundedAmount: cumulative,
        paidAmount: paid,
        disputed,
        updatedAt: Date.now(),
      };
      if (previous) await ctx.db.patch(previous._id, adjustment);
      else await ctx.db.insert("billingAdjustments", adjustment);
      const full = disputed || cumulative >= paid;
      if (payment) {
        await ctx.db.patch(payment._id, {
          creemCustomerId: customerId,
          status: disputed
            ? "disputed"
            : full
              ? "refunded"
              : "partially_refunded",
          refundedAmountCents: cumulative,
        });
        if (full && payment.listingId) {
          const listing = await ctx.db.get(payment.listingId);
          if (listing?.featuredPaymentId === payment._id)
            await ctx.db.patch(listing._id, {
              featured: false,
              featuredUntil: undefined,
              featuredPaymentId: undefined,
            });
        }
      }
      if (
        full &&
        sub &&
        sub.lastPaidTransactionId === identifier(transaction.id)
      )
        await ctx.db.patch(sub._id, {
          paidThrough: 0,
          status: disputed ? "paused" : "canceled",
          billingHold: disputed ? true : sub.billingHold,
          lastEventAt: Math.max(sub.lastEventAt ?? 0, at),
          updatedAt: Date.now(),
        });
      if(sub)await ctx.scheduler.runAfter(0,internal.publication.reconcileOwner,{userId:sub.userId,cursor:null});
      return record(
        type === "dispute.created"
          ? "billing_disputed"
          : full
            ? "payment_refunded"
            : "payment_partially_refunded",
      );
    }
    const productId = identifier(source.product),
      customerId = identifier(source.customer);
    async function bindCustomer(userId: Doc<"users">["_id"]) {
      const customer = await ctx.db
        .query("billingCustomers")
        .withIndex("by_customer_mode", (q) =>
          q.eq("customerId", customerId).eq("mode", mode),
        )
        .unique();
      if (customer && customer.userId !== userId)
        throw new Error("Billing customer belongs to another account");
      if (!customer)
        await ctx.db.insert("billingCustomers", {
          userId,
          customerId,
          mode,
          verifiedAt: Date.now(),
        });
    }
    if (type === "checkout.completed") {
      const checkoutId = identifier(source.id);
      let payment = await ctx.db
        .query("payments")
        .withIndex("by_creem_checkout", (q) =>
          q.eq("creemCheckoutId", checkoutId),
        )
        .unique();
      if (!payment && typeof source.request_id === "string")
        payment = await ctx.db
          .query("payments")
          .withIndex("by_request", (q) => q.eq("requestId", source.request_id))
          .unique();
      if (!payment || !payment.trustedCheckout)
        throw new Error(
          "Checkout is not associated with a trusted pending request",
        );
      if (
        payment.productId !== productId ||
        payment.mode !== mode ||
        source.status !== "completed"
      )
        throw new Error("Checkout product or environment mismatch");
      const order = object(source.order);
      if (
        order.status !== "paid" ||
        identifier(order.product) !== productId ||
        identifier(order.customer) !== customerId ||
        !Number.isSafeInteger(order.amount) ||
        order.amount < 0 ||
        typeof order.currency !== "string" ||
        !/^[A-Z]{3}$/i.test(order.currency)
      )
        throw new Error("Invalid paid checkout order");
      if (
        ["refunded", "partially_refunded", "disputed"].includes(payment.status)
      )
        return record("already_refunded");
      await bindCustomer(payment.userId);
      if (payment.status !== "completed") {
        await ctx.db.patch(payment._id, {
          creemCheckoutId: checkoutId,
          status: "completed",
          completedAt: Date.now(),
          creemCustomerId: customerId,
          creemTransactionId: identifier(order.id),
          amountCents: order.amount,
          currency: order.currency.toUpperCase(),
        });
        if (payment.purpose === "feature_listing" && payment.listingId) {
          const listing = await ctx.db.get(payment.listingId);
          if (listing && listing.landlordId === payment.userId) {
            const featuredUntil = Date.now() + 30 * 86400000;
            await ctx.db.patch(listing._id, {
              featured: true,
              featuredMode: mode,
              featuredPaymentId: payment._id,
              featuredUntil,
            });
            await ctx.scheduler.runAt(
              featuredUntil,
              internal.payments.expireFeature,
              {
                listingId: listing._id,
                paymentId: payment._id,
                expectedUntil: featuredUntil,
              },
            );
          }
        }
      }
      if (
        payment.purpose === "subscription" &&
        source.subscription &&
        payment.plan
      ) {
        const sub = object(source.subscription),
          subId = identifier(sub.id);
        const existing = await ctx.db
          .query("subscriptions")
          .withIndex("by_creem_subscription", (q) =>
            q.eq("creemSubscriptionId", subId),
          )
          .unique();
        if (
          existing &&
          (existing.userId !== payment.userId ||
            existing.creemCustomerId !== customerId ||
            existing.mode !== mode)
        )
          throw new Error("Subscription association mismatch");
        if (!existing)
          await ctx.db.insert("subscriptions", {
            userId: payment.userId,
            creemCustomerId: customerId,
            creemSubscriptionId: subId,
            creemProductId: productId,
            plan: payment.plan,
            status: "active",
            mode,
            verifiedAt: Date.now(),
            paidThrough: 0,
            currentPeriodStart: 0,
            currentPeriodEnd: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
      }
      return record("checkout_completed");
    }
    const subId = identifier(source.id);
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_creem_subscription", (q) =>
        q.eq("creemSubscriptionId", subId),
      )
      .unique();
    let userId = existing?.userId;
    let plan = existing?.plan;
    if (
      existing &&
      (existing.creemCustomerId !== customerId || existing.mode !== mode)
    )
      throw new Error("Subscription identity changed");
    const productChanged = !!existing && existing.creemProductId !== productId;
    if (productChanged) {
      const changedPlan = configuredPlan(productId);
      if (!changedPlan)
        throw new Error("Updated subscription product is not configured");
      plan = changedPlan;
    }
    if (!existing) {
      const requestId = source.metadata?.requestId;
      const payment =
        typeof requestId === "string"
          ? await ctx.db
              .query("payments")
              .withIndex("by_request", (q) => q.eq("requestId", requestId))
              .unique()
          : null;
      if (
        !payment?.trustedCheckout ||
        payment.purpose !== "subscription" ||
        payment.productId !== productId ||
        payment.mode !== mode ||
        !payment.plan
      )
        throw new Error(
          "Subscription is not associated with a trusted checkout",
        );
      userId = payment.userId;
      plan = payment.plan;
    }
    if (!userId || !plan || (!existing && configuredPlan(productId) !== plan))
      throw new Error("Subscription product is not configured for this plan");
    await bindCustomer(userId);
    if (type === "subscription.paid") {
      const reversed = await ctx.db
        .query("billingAdjustments")
        .withIndex("by_transaction_mode", (q) =>
          q
            .eq("transactionId", identifier(source.last_transaction_id))
            .eq("mode", mode),
        )
        .unique();
      if (
        reversed &&
        (reversed.disputed || reversed.refundedAmount >= reversed.paidAmount)
      )
        return record("paid_transaction_reversed");
    }
    const statusMap: Record<string, Doc<"subscriptions">["status"]> = {
      "subscription.paid": "active",
      "subscription.active": "active",
      "subscription.trialing": "trialing",
      "subscription.scheduled_cancel": "active",
      "subscription.past_due": "past_due",
      "subscription.unpaid": "unpaid",
      "subscription.paused": "paused",
      "subscription.canceled": "canceled",
      "subscription.expired": "expired",
    };
    const status =
      type === "subscription.update"
        ? source.status === "scheduled_cancel"
          ? "active"
          : source.status
        : statusMap[type];
    if (
      ![
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "paused",
        "canceled",
        "expired",
      ].includes(status)
    )
      throw new Error("Unknown subscription status");
    const granting = status === "active" || status === "trialing";
    if (
      granting &&
      type !== "subscription.update" &&
      source.status !== status &&
      !(status === "active" && source.status === "scheduled_cancel")
    )
      throw new Error("Subscription event and status disagree");
    if (
      existing &&
      ((existing.lastEventAt ?? 0) > at ||
        ((existing.lastEventAt ?? 0) === at &&
          !["active", "trialing"].includes(existing.status) &&
          granting))
    )
      return record("stale_event");
    const start = source.current_period_start_date
      ? date(source.current_period_start_date)
      : (existing?.currentPeriodStart ?? 0);
    const end = source.current_period_end_date
      ? date(source.current_period_end_date)
      : (existing?.currentPeriodEnd ?? 0);
    if (
      type === "subscription.paid" &&
      (!start || end <= start || !source.last_transaction_id)
    )
      throw new Error("Paid subscription is missing a valid payment period");
    const paidThrough =
      type === "subscription.paid"
        ? end
        : productChanged
          ? 0
          : (existing?.paidThrough ?? 0);
    const expiration = Math.min(paidThrough, end);
    const values = {
      userId,
      creemCustomerId: customerId,
      creemSubscriptionId: subId,
      creemProductId: productId,
      plan,
      status: status as Doc<"subscriptions">["status"],
      mode,
      verifiedAt: Date.now(),
      lastPaidTransactionId:
        type === "subscription.paid"
          ? identifier(source.last_transaction_id)
          : existing?.lastPaidTransactionId,
      paidThrough,
      entitlementExpiresAt:
        status === "active" && expiration > Date.now() ? expiration : undefined,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      cancelAtPeriodEnd:
        type === "subscription.scheduled_cancel" ||
        source.status === "scheduled_cancel",
      lastEventAt: at,
      updatedAt: Date.now(),
    };
    let subscriptionId;
    if (existing) {
      await ctx.db.patch(existing._id, values);
      subscriptionId = existing._id;
    } else
      subscriptionId = await ctx.db.insert("subscriptions", {
        ...values,
        createdAt: Date.now(),
      });
    if (
      values.entitlementExpiresAt &&
      values.entitlementExpiresAt !== existing?.entitlementExpiresAt
    )
      await ctx.scheduler.runAt(
        values.entitlementExpiresAt,
        internal.payments.refreshEntitlement,
        { subscriptionId, expectedExpiration: values.entitlementExpiresAt },
      );
    await ctx.scheduler.runAfter(0,internal.publication.reconcileOwner,{userId,cursor:null});
    return record("subscription_updated");
  },
});
