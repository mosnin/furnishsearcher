export type BillingPlan = "landlord_pro" | "landlord_premium" | "tenant_plus";
export function billingProduct(plan: BillingPlan | "feature_listing") {
  const key = {
    landlord_pro: "CREEM_PRODUCT_LANDLORD_PRO",
    landlord_premium: "CREEM_PRODUCT_LANDLORD_PREMIUM",
    tenant_plus: "CREEM_PRODUCT_TENANT_PLUS",
    feature_listing: "CREEM_PRODUCT_FEATURE_LISTING",
  }[plan];
  const value = process.env[key];
  if (!value || !/^prod_[a-zA-Z0-9]+$/.test(value))
    throw new Error("Billing product is not configured. Contact support.");
  return value;
}
export function configuredPlan(product: string): BillingPlan | null {
  for (const plan of [
    "landlord_pro",
    "landlord_premium",
    "tenant_plus",
  ] as const) {
    try {
      if (billingProduct(plan) === product) return plan;
    } catch {
      /* Unconfigured products never grant access. */
    }
  }
  return null;
}
export function billingMode(): "test" | "prod" {
  const key = process.env.CREEM_API_KEY;
  if (key?.startsWith("creem_test_")) return "test";
  if (key?.startsWith("creem_")) return "prod";
  throw new Error("Billing is not configured. Contact support.");
}
export function paidAccess(
  subscription: {
    status: string;
    verifiedAt?: number;
    paidThrough?: number;
    currentPeriodEnd: number;
    plan: string;
    mode?: string;
    billingHold?: boolean;
  },
  now = Date.now(),
) {
  let mode: string;
  try {
    mode = billingMode();
  } catch {
    return false;
  }
  return (
    !subscription.billingHold &&
    subscription.mode === mode &&
    subscription.verifiedAt !== undefined &&
    subscription.status === "active" &&
    Math.min(subscription.paidThrough ?? 0, subscription.currentPeriodEnd) > now
  );
}
export function providerUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "creem.io" && !url.hostname.endsWith(".creem.io")) ||
    url.username ||
    url.password
  )
    throw new Error("Billing provider returned an invalid link.");
  return url.toString();
}
export function billingReturnUrl(value: string) {
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("Billing return address is not configured.");
  const url = new URL(value),
    origin = new URL(base);
  if (
    url.origin !== origin.origin ||
    url.username ||
    url.password ||
    ![
      "/billing/success",
      "/pricing",
      "/dashboard/landlord/listings",
      "/dashboard/landlord/billing",
    ].includes(url.pathname)
  )
    throw new Error("Invalid billing return address.");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Billing requires a secure return address.");
  return value;
}
