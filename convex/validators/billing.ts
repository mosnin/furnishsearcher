import { v } from "convex/values";
export const billingPlan = v.union(
  v.literal("landlord_pro"),
  v.literal("landlord_premium"),
  v.literal("tenant_plus"),
);
export const subscriptionStatus = v.union(
  v.literal("active"),
  v.literal("trialing"),
  v.literal("paused"),
  v.literal("canceled"),
  v.literal("expired"),
  v.literal("past_due"),
  v.literal("unpaid"),
);
