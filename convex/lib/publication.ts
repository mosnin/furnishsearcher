import { syncRecommendation } from "./recommendations";
import { subjectDeleted } from "./auth";
import { recordMapEligibility } from "./mapEligibility";
import { propertyIssues } from "./units";
import { syncGeo } from "./geo";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { billingMode } from "../../lib/billing";
import { activePaidSubscription } from "./billing";
type Ctx = QueryCtx | MutationCtx;
export async function contentIssues(ctx: Ctx, listing: Doc<"listings">) {
  const issues: string[] = [];
  if (!listing.title.trim() || !listing.description.trim())
    issues.push("Add a title and property description.");
  if (!listing.propertyType.trim()) issues.push("Choose a property type.");
  if (!listing.city.trim() || !listing.state.trim() || !listing.address.trim())
    issues.push("Complete the property location.");
  if (!Number.isFinite(listing.price) || listing.price <= 0)
    issues.push("Enter a valid monthly rent.");
  if (!Number.isInteger(listing.minStay) || listing.minStay < 1)
    issues.push("Set a minimum stay of at least one month.");
  if (!Number.isFinite(listing.availableFrom) || listing.availableFrom < 0)
    issues.push("Choose an availability date.");
  let count = 0;
  if (listing.photoAssets)
    for (const asset of listing.photoAssets) {
      if (
        asset.storageId
          ? !!(await ctx.storage.getUrl(asset.storageId))
          : !!asset.legacyUrl?.startsWith("https://")
      )
        count++;
      if (count >= 2) break;
    }
  else
    count = listing.photos.filter((url) => url.startsWith("https://")).length;
  if (count < 2) issues.push("Upload at least two property photos.");
  return issues;
}
export async function identityPassed(ctx: Ctx, user: Doc<"users">) {
  if (
    user.clerkDeletedAt !== undefined ||
    (await subjectDeleted(ctx, user.clerkId)) ||
    user.identityHold ||
    !user.identityCheckId
  )
    return false;
  const check = await ctx.db.get(user.identityCheckId);
  let mode;
  try {
    mode = billingMode();
  } catch {
    return false;
  }
  return (
    check?.userId === user._id &&
    check.status === "passed" &&
    check.verifiedAt !== undefined &&
    check.mode === mode
  );
}
export async function readiness(ctx: Ctx, listing: Doc<"listings">) {
  const issues = await contentIssues(ctx, listing),
    revision = listing.revision ?? 0;
  issues.push(...(await propertyIssues(ctx, listing)));
  if (listing.moderationHold)
    issues.push("This listing is under staff review. Contact support.");
  if (
    listing.approvalStatus !== "approved" ||
    listing.approvedRevision !== revision
  )
    issues.push(
      listing.approvalStatus === "rejected"
        ? "Staff rejected this revision. Edit and request a new review."
        : "Await approval of this listing revision.",
    );
  const owner = await ctx.db.get(listing.landlordId);
  if (owner && owner.role !== "landlord") issues.push("This property requires a property owner account.");
  if (!owner || !(await identityPassed(ctx, owner)))
    issues.push("Complete owner identity verification.");
  const subscription = await activePaidSubscription(
    ctx,
    listing.landlordId,
    true,
  );
  if (!subscription)
    issues.push("Confirm an active paid landlord subscription.");
  if (subscription?.plan === "landlord_pro") {
    const slots = await ctx.db
      .query("listings")
      .withIndex("by_landlord_status", (q) =>
        q.eq("landlordId", listing.landlordId).eq("status", "active"),
      )
      .order("asc")
      .take(5);
    if (slots.length >= 5 && !slots.some((l) => l._id === listing._id))
      issues.push(
        "Landlord Pro includes five active rental spaces. Hide another listing or upgrade to Premium to publish this space.",
      );
  }
  const eligible = issues.length === 0,
    requested = listing.publicationRequested === true;
  return {
    eligible,
    requested,
    approval: listing.approvalStatus ?? "pending",
    revision,
    issues,
    live: eligible && requested && listing.status === "active",
  };
}
export async function publiclyVisible(ctx: Ctx, listing: Doc<"listings">) {
  if (
    listing.status !== "active" ||
    !listing.publicationRequested ||
    listing.moderationHold ||
    listing.approvalStatus !== "approved" ||
    listing.approvedRevision !== (listing.revision ?? 0)
  )
    return false;
  return (await readiness(ctx, listing)).live;
}
export async function reconcileListing(
  ctx: MutationCtx,
  listing: Doc<"listings">,
) {
  const state = await readiness(ctx, listing);
  const owner = await ctx.db.get(listing.landlordId);
  const removed =
    !!owner &&
    (owner.clerkDeletedAt !== undefined ||
      (await subjectDeleted(ctx, owner.clerkId)));
  const status = removed
    ? "inactive"
    : state.requested && state.eligible
      ? "active"
      : listing.approvalStatus === "rejected"
        ? "rejected"
        : listing.approvalStatus !== "approved"
          ? "pending"
          : "inactive";
  const activating =
    status === "active" &&
    (listing.status !== "active" || !listing.firstPublishedAt);
  await ctx.db.patch(listing._id, {
    status,
    ...(activating && !listing.firstPublishedAt
      ? { firstPublishedAt: Date.now() }
      : {}),
  });
  if (listing.status !== status) await syncGeo(ctx, { ...listing, status });
  else {
    await recordMapEligibility(ctx, { ...listing, status });
    await syncRecommendation(ctx, { ...listing, status });
  }
  if (activating) {
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
      listingId: listing._id,
      cursor: null,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendSavedSearchAlerts, {
      listingId: listing._id,
      listingTitle: listing.title,
      city: listing.city,
      state: listing.state,
      price: listing.price,
      bedrooms: listing.bedrooms,
      petFriendly: listing.petFriendly,
      propertyType: listing.propertyType,
    });
  }
  return { ...state, live: status === "active" };
}
export async function ownerReadiness(ctx: Ctx, listing: Doc<"listings">) {
  const state = await readiness(ctx, listing),
    review = await ctx.db
      .query("listingReviews")
      .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
      .order("desc")
      .first();
  return {
    ...state,
    ...(review?.revision === state.revision ? { reviewNote: review.note } : {}),
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const sameContent = (left: unknown, right: unknown) =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
