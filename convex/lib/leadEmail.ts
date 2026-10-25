import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { emailProofCurrent } from "../../lib/email-contact";
import { emailContactMode } from "./emailContact";
import { blockState } from "./messageAccess";
import { classifyLead } from "./housing";
import { DAY } from "../../lib/stays";
type Ctx = QueryCtx | MutationCtx;
export async function leadEmailPreference(
  ctx: Ctx,
  owner: Doc<"users">,
  listing: Doc<"listings">,
) {
  if (listing.landlordId !== owner._id)
    return { enabled: false, override: null };
  const row = await ctx.db
    .query("listingLeadEmailPreferences")
    .withIndex("by_listing_owner", (q) =>
      q.eq("listingId", listing._id).eq("ownerId", owner._id),
    )
    .unique();
  return {
    enabled: row?.enabled ?? owner.housingLeadEmailsEnabled === true,
    override: row?.enabled ?? null,
  };
}
export async function leadEmailContext(
  ctx: Ctx,
  delivery: Doc<"housingRequestDeliveries">,
) {
  const [request, owner] = await Promise.all([
    ctx.db.get(delivery.requestId),
    ctx.db.get(delivery.landlordId),
  ]);
  if (
    !request ||
    !owner ||
    delivery.deletedAt !== undefined ||
    !!delivery.response ||
    request.status !== "open" ||
    request.moveInDate < Math.floor(Date.now() / DAY) * DAY ||
    !emailProofCurrent(owner, emailContactMode()) ||
    (await blockState(ctx, request.userId, owner._id)).cannotMessage
  )
    return null;
  return { owner, request };
}
export async function leadEmailDetails(
  ctx: Ctx,
  delivery: Doc<"housingRequestDeliveries">,
) {
  if (delivery.emailStatus === "sent" || !delivery.notificationListingId)
    return null;
  const context = await leadEmailContext(ctx, delivery);
  if (!context) return null;
  const listing = await ctx.db.get(delivery.notificationListingId);
  if (
    !listing ||
    listing.landlordId !== context.owner._id ||
    !(await leadEmailPreference(ctx, context.owner, listing)).enabled
  )
    return null;
  const classification = await classifyLead(ctx, listing, context.request);
  if (
    !classification ||
    (classification.kind === "unmatched" &&
      !context.owner.receiveUnmatchedLeads)
  )
    return null;
  return {
    email: context.owner.notificationEmail!,
    city: context.request.city,
    state: context.request.state,
    kind: classification.kind,
  };
}
export async function queueLeadEmail(
  ctx: MutationCtx,
  delivery: Doc<"housingRequestDeliveries">,
  force = false,
) {
  if (
    delivery.deletedAt !== undefined ||
    !!delivery.response ||
    delivery.emailStatus === "sent" ||
    delivery.emailAttemptedAt !== undefined ||
    delivery.emailStatus === "failed" ||
    delivery.emailStatus === "unknown" ||
    (!force && delivery.emailStatus === "queued")
  )
    return;
  const generation = (delivery.emailGeneration ?? 0) + 1;
  await ctx.db.patch(delivery._id, {
    emailStatus: "queued",
    emailGeneration: generation,
    emailSelectionStartedAt: Date.now(),
    notificationListingId: undefined,
  });
  await ctx.scheduler.runAfter(0, internal.leadNotifications.selectProperty, {
    orderVersion: 1,
    deliveryId: delivery._id,
    generation,
    cursor: null,
  });
}
