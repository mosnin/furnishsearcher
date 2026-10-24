import { billingMode } from "../../lib/billing";
import { requireUser } from "./auth";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
export async function requireBillingOwner(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const user = await requireUser(ctx);
  if (user._id !== userId && user.role !== "admin")
    throw new Error("Not authorized to view this billing account.");
  return user;
}

export async function activePaidSubscription(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  landlordOnly = false,
) {
  let mode: "test" | "prod";
  try {
    mode = billingMode();
  } catch {
    return null;
  }
  const now = Date.now();
  return ctx.db
    .query("subscriptions")
    .withIndex("by_user_paid", (q) =>
      q
        .eq("userId", userId)
        .eq("mode", mode)
        .eq("status", "active")
        .gt("paidThrough", now),
    )
    .filter((q) =>
      q.and(
        ...(landlordOnly ? [q.or(q.eq(q.field("plan"),"landlord_pro"),q.eq(q.field("plan"),"landlord_premium"))] : []),
        q.neq(q.field("billingHold"), true),
        q.gt(q.field("verifiedAt"), 0),
        q.gt(q.field("currentPeriodEnd"), now),
      ),
    )
    .order("desc")
    .first();
}
export async function verifiedFeature(
  ctx: QueryCtx | MutationCtx,
  listing: import("../_generated/dataModel").Doc<"listings">,
) {
  if (
    !listing.featured ||
    !listing.featuredPaymentId ||
    (listing.featuredUntil ?? 0) <= Date.now()
  )
    return false;
  let mode: "test" | "prod";
  try {
    mode = billingMode();
  } catch {
    return false;
  }
  const payment = await ctx.db.get(listing.featuredPaymentId);
  return (
    !!payment?.trustedCheckout &&
    payment.mode === mode &&
    payment.status === "completed" &&
    payment.purpose === "feature_listing" &&
    payment.listingId === listing._id &&
    payment.userId === listing.landlordId
  );
}
