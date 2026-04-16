import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

/** Creem.io product IDs — set these in Convex dashboard env vars or here. */
const CREEM_PRODUCTS = {
  landlord_pro: process.env.CREEM_PRODUCT_LANDLORD_PRO ?? "prod_landlord_pro",
  landlord_premium:
    process.env.CREEM_PRODUCT_LANDLORD_PREMIUM ?? "prod_landlord_premium",
  tenant_plus: process.env.CREEM_PRODUCT_TENANT_PLUS ?? "prod_tenant_plus",
  feature_listing:
    process.env.CREEM_PRODUCT_FEATURE_LISTING ?? "prod_feature_listing",
} as const;

type CreemCheckoutResponse = {
  id: string;
  checkout_url: string;
};

async function creemFetch<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CREEM_API_KEY is not configured in Convex environment variables"
    );
  }
  const baseUrl = apiKey.startsWith("creem_test_")
    ? "https://test-api.creem.io"
    : "https://api.creem.io";

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Creem API error ${res.status}: ${text.slice(0, 500)}`
    );
  }
  return (await res.json()) as T;
}

/**
 * Create a checkout session for a landlord plan subscription.
 */
export const createSubscriptionCheckout = action({
  args: {
    userId: v.id("users"),
    plan: v.union(
      v.literal("landlord_pro"),
      v.literal("landlord_premium"),
      v.literal("tenant_plus")
    ),
    customerEmail: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ checkoutUrl: string; checkoutId: string }> => {
    const productId = CREEM_PRODUCTS[args.plan];
    if (!productId) {
      throw new Error(`Unknown plan: ${args.plan}`);
    }

    const requestId = `sub_${args.userId}_${Date.now()}`;

    const response = await creemFetch<CreemCheckoutResponse>("/v1/checkouts", {
      product_id: productId,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      customer_email: args.customerEmail,
      request_id: requestId,
      metadata: {
        userId: args.userId,
        purpose: "subscription",
        plan: args.plan,
      },
    });

    await ctx.runMutation(api.payments.recordPendingCheckout, {
      userId: args.userId,
      creemCheckoutId: response.id,
      productId,
      purpose: "subscription",
      amountCents: 0,
      currency: "USD",
      metadata: JSON.stringify({ plan: args.plan }),
    });

    return { checkoutUrl: response.checkout_url, checkoutId: response.id };
  },
});

/**
 * Create a checkout session for a one-time "feature my listing" boost.
 */
export const createFeatureListingCheckout = action({
  args: {
    userId: v.id("users"),
    listingId: v.id("listings"),
    customerEmail: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ checkoutUrl: string; checkoutId: string }> => {
    const productId = CREEM_PRODUCTS.feature_listing;
    const requestId = `feat_${args.listingId}_${Date.now()}`;

    const response = await creemFetch<CreemCheckoutResponse>("/v1/checkouts", {
      product_id: productId,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      customer_email: args.customerEmail,
      request_id: requestId,
      metadata: {
        userId: args.userId,
        listingId: args.listingId,
        purpose: "feature_listing",
      },
    });

    await ctx.runMutation(api.payments.recordPendingCheckout, {
      userId: args.userId,
      creemCheckoutId: response.id,
      productId,
      purpose: "feature_listing",
      listingId: args.listingId,
      amountCents: 2900, // $29.00 default; real amount comes via webhook
      currency: "USD",
    });

    return { checkoutUrl: response.checkout_url, checkoutId: response.id };
  },
});
