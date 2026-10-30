import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { billingPlan } from "./validators/billing";
import {
  billingProduct,
  billingMode,
  billingReturnUrl,
  providerUrl,
} from "../lib/billing";
async function creemFetch(
  path: string,
  body: object,
): Promise<Record<string, unknown>> {
  const mode = billingMode();
  const response = await fetch(
    `${mode === "test" ? "https://test-api.creem.io" : "https://api.creem.io"}${path}`,
    {
      method: "POST",
      headers: {
        "x-api-key": process.env.CREEM_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error(
      "Billing provider could not complete the request. Retry with the same checkout request or contact support.",
    );
  return await response.json();
}
const common = {
  userId: v.id("users"),
  customerEmail: v.optional(v.string()),
  successUrl: v.string(),
  cancelUrl: v.optional(v.string()),
  clientRequestId: v.optional(v.string()),
};
export const createSubscriptionCheckout = action({
  args: { ...common, plan: billingPlan },
  returns: v.object({ checkoutUrl: v.string(), checkoutId: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ checkoutUrl: string; checkoutId: string }> => {
    const user = await ctx.runQuery(internal.payments.checkoutAccount, {
      userId: args.userId,
    });
    const productId = billingProduct(args.plan),
      mode = billingMode();
    billingReturnUrl(args.successUrl);
    if (args.cancelUrl) billingReturnUrl(args.cancelUrl);
    const pending = await ctx.runMutation(internal.payments.prepareCheckout, {
      userId: args.userId,
      productId,
      plan: args.plan,
      purpose: "subscription",
      mode,
      returnUrl: args.successUrl,
      clientRequestId: args.clientRequestId ?? crypto.randomUUID(),
    });
    if (pending.checkoutUrl)
      return {
        checkoutUrl: pending.checkoutUrl,
        checkoutId: pending.creemCheckoutId,
      };
    const response = await creemFetch("/v1/checkouts", {
      product_id: productId,
      success_url: args.successUrl,
      customer: { email: user.email },
      request_id: pending.requestId,
      metadata: {
        userId: args.userId,
        plan: args.plan,
        purpose: "subscription",
        requestId: pending.requestId,
      },
    });
    if (
      typeof response.id !== "string" ||
      typeof response.checkout_url !== "string"
    )
      throw new Error("Billing provider returned an incomplete checkout.");
    const checkoutUrl = providerUrl(response.checkout_url);
    await ctx.runMutation(internal.payments.finishCheckout, {
      paymentId: pending._id,
      checkoutId: response.id,
      checkoutUrl,
    });
    return { checkoutUrl, checkoutId: response.id };
  },
});
export const createFeatureListingCheckout = action({
  args: { ...common, listingId: v.id("listings") },
  returns: v.object({ checkoutUrl: v.string(), checkoutId: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ checkoutUrl: string; checkoutId: string }> => {
    const user = await ctx.runQuery(internal.payments.checkoutAccount, {
      userId: args.userId,
      listingId: args.listingId,
    });
    const productId = billingProduct("feature_listing"),
      mode = billingMode();
    billingReturnUrl(args.successUrl);
    if (args.cancelUrl) billingReturnUrl(args.cancelUrl);
    const pending = await ctx.runMutation(internal.payments.prepareCheckout, {
      userId: args.userId,
      listingId: args.listingId,
      productId,
      purpose: "feature_listing",
      mode,
      returnUrl: args.successUrl,
      clientRequestId: args.clientRequestId ?? crypto.randomUUID(),
    });
    if (pending.checkoutUrl)
      return {
        checkoutUrl: pending.checkoutUrl,
        checkoutId: pending.creemCheckoutId,
      };
    const response = await creemFetch("/v1/checkouts", {
      product_id: productId,
      success_url: args.successUrl,
      customer: { email: user.email },
      request_id: pending.requestId,
      metadata: {
        userId: args.userId,
        listingId: args.listingId,
        purpose: "feature_listing",
        requestId: pending.requestId,
      },
    });
    if (
      typeof response.id !== "string" ||
      typeof response.checkout_url !== "string"
    )
      throw new Error("Billing provider returned an incomplete checkout.");
    const checkoutUrl = providerUrl(response.checkout_url);
    await ctx.runMutation(internal.payments.finishCheckout, {
      paymentId: pending._id,
      checkoutId: response.id,
      checkoutUrl,
    });
    return { checkoutUrl, checkoutId: response.id };
  },
});
export const createCustomerPortal = action({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const customer = await ctx.runQuery(internal.payments.portalAccount, {});
    if (customer.mode !== billingMode())
      throw new Error(
        "This billing account belongs to a different environment. Contact support.",
      );
    const response = await creemFetch("/v1/customers/billing", {
      customer_id: customer.customerId,
    });
    if (typeof response.customer_portal_link !== "string")
      throw new Error("Billing provider did not return a portal link.");
    return providerUrl(response.customer_portal_link);
  },
});
