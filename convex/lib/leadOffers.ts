import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { normalizeCity } from "../../lib/locations";
import { classifyLead } from "./housing";
type Ctx = QueryCtx | MutationCtx;
type Classification = Awaited<ReturnType<typeof classifyLead>>;

export function offerRank(
  request: Doc<"housingRequests">,
  listing: Doc<"listings">,
  classification: Classification,
) {
  return {
    rankVersion: 1 as const,
    offerKind: !classification ? 2 : classification.kind === "matched" ? 0 : 1,
    offerDifferences: classification?.differences.length ?? 0,
    offerArea:
      normalizeCity(request.city) === normalizeCity(listing.city) ? 0 : 1,
    offerBedrooms: Math.abs(listing.bedrooms - request.bedrooms),
    offerPrice: listing.price,
  };
}
export function orderedOffers(
  ctx: Ctx,
  requestId: Id<"housingRequests">,
  ownerId: Id<"users">,
) {
  // Keep one index and one range throughout adoption so live pagination cursors
  // do not switch query signatures. Unranked legacy rows remain reachable.
  return ctx.db
    .query("housingRequestMatches")
    .withIndex("by_request_owner_rank", (q) =>
      q.eq("requestId", requestId).eq("landlordId", ownerId),
    )
    .order("asc");
}
export async function offerContext(ctx: Ctx, listing: Doc<"listings">) {
  const property = listing.propertyGroupId
    ? await ctx.db.get(listing.propertyGroupId)
    : null;
  const root =
    property?.ownerId === listing.landlordId
      ? await ctx.db.get(property.primaryListingId)
      : null;
  return {
    propertyId:
      property?.ownerId === listing.landlordId ? property._id : undefined,
    propertyTitle:
      root?.landlordId === listing.landlordId ? root.title : undefined,
    unitName: listing.unitName,
  };
}
export function offerPrefix(
  listing: Doc<"listings">,
  classification: NonNullable<Classification>,
  request: Doc<"housingRequests">,
) {
  const date = (value: number) => new Date(value).toISOString().slice(0, 10);
  const scope = `Housing request: ${request._id}${request.travelerName ? ` · ${request.travelerName.replace(/\s+/g, " ")}` : ""}\nRequested stay: ${date(request.moveInDate)} – ${date(request.moveOutDate ?? request.moveInDate + request.duration * 30 * 86400000)}\n`;
  const rental = `Offered rental: ${listing.publicId ?? listing._id}${listing.unitName ? ` · ${listing.unitName.replace(/\s+/g, " ")}` : ""}\nListed rent: ${listing.price.toFixed(2)} USD/month\n/listings/${listing._id}\nThis is a rental proposal; no booking is confirmed.\n\n`;
  const alternative =
    classification.kind === "unmatched"
      ? `Alternative proposal for a housing request. This rental does not currently meet: ${classification.differences.map((d) => d.field).join("; ")}. No booking or change of terms is confirmed.\n\n`
      : "";
  return scope + rental + alternative;
}
export function replyLimit(
  listing: Doc<"listings">,
  classification: NonNullable<Classification>,
  request: Doc<"housingRequests">,
) {
  return Math.min(
    classification.kind === "unmatched" ? 1700 : 2000,
    2000 - offerPrefix(listing, classification, request).length,
  );
}
export async function existingLeadResponse(
  ctx: Ctx,
  delivery: Doc<"housingRequestDeliveries">,
  request: Doc<"housingRequests">,
) {
  let response = delivery.response;
  let historyFound = !!response;
  if (!response) {
    const dated = await ctx.db
      .query("housingRequestMatches")
      .withIndex("by_request_owner_response", (q) =>
        q
          .eq("requestId", request._id)
          .eq("landlordId", delivery.landlordId)
          .gt("respondedAt", 0),
      )
      .order("asc")
      .first();
    const legacy =
      dated ??
      (await ctx.db
        .query("housingRequestMatches")
        .withIndex("by_request_owner_conversation", (q) =>
          q
            .eq("requestId", request._id)
            .eq("landlordId", delivery.landlordId)
            .gt("conversationId", undefined),
        )
        .order("asc")
        .first());
    historyFound = !!legacy;
    if (legacy?.conversationId) {
      const listing = await ctx.db.get(legacy.listingId);
      response = {
        conversationId: legacy.conversationId,
        listingId: legacy.listingId,
        title: listing?.title ?? "Previously offered rental",
        respondedAt: legacy.respondedAt,
        ...(listing ? await offerContext(ctx, listing) : {}),
      };
    }
  }
  if (!response) return { response: null, historyNeedsReview: historyFound };
  const conversation = await ctx.db.get(response.conversationId);
  const valid =
    conversation?.tenantId === request.userId &&
    conversation.landlordId === delivery.landlordId &&
    conversation.listingId === response.listingId;
  return { response: valid ? response : null, historyNeedsReview: !valid };
}
