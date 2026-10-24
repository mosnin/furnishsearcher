import type { Doc } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  matchesSearch,
  availableSearchStay,
  type SearchFilters,
} from "../../lib/search";
import { DAY } from "../../lib/stays";
export async function matchSearch(
  ctx: QueryCtx | MutationCtx,
  listing: Doc<"listings">,
  filters: SearchFilters,
) {
  if (
    listing.status !== "active" ||
    listing.moderationHold ||
    !matchesSearch(listing, filters)
  )
    return null;
  if (
    filters.propertyId &&
    filters.propertyId !== listing.publicId &&
    filters.propertyId !== listing._id
  )
    return null;
  let stay: { moveIn: number; moveOut: number } | null = null;
  if (filters.moveIn !== undefined && filters.moveOut !== undefined) {
    const earliest = filters.moveIn - (filters.flexibleDays ?? 0) * DAY,
      latest = filters.moveOut + (filters.flexibleDays ?? 0) * DAY;
    // Do not return a partial calendar as confirmed availability.
    const blocks = await ctx.db
      .query("availabilityBlocks")
      .withIndex("by_listing_start", (q) =>
        q.eq("listingId", listing._id).lt("startDate", latest),
      )
      .filter((q) => q.gt(q.field("endDate"), earliest))
      .take(4001);
    if (blocks.length > 4000)
      throw new Error(
        "A property's calendar needs review before dates can be confirmed.",
      );
    stay = availableSearchStay(listing, blocks, filters);
    if (!stay) return null;
  }
  return {
    _id: listing._id,
    publicId: listing.publicId,
    title: listing.title,
    city: listing.city,
    state: listing.state,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    propertyType: listing.propertyType,
    photos: listing.photos.slice(0, 5),
    amenities: listing.amenities,
    petFriendly: listing.petFriendly,
    utilitiesIncluded: listing.utilitiesIncluded,
    parkingIncluded: listing.parkingIncluded,
    availableFrom: listing.availableFrom,
    minStay: listing.minStay,
    views: listing.views,
    createdAt: listing.createdAt,
    ...(stay
      ? { matchedMoveIn: stay.moveIn, matchedMoveOut: stay.moveOut }
      : {}),
  };
}
