import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { listingPhotos } from "./photos";
export const publicListingCardValidator = v.object({
  _id: v.id("listings"),
  title: v.string(),
  city: v.string(),
  state: v.string(),
  price: v.number(),
  bedrooms: v.number(),
  bathrooms: v.number(),
  propertyType: v.string(),
  photos: v.array(v.string()),
  petFriendly: v.boolean(),
  parkingIncluded: v.boolean(),
  utilitiesIncluded: v.boolean(),
  availableFrom: v.number(),
  minStay: v.number(),
  featured: v.boolean(),
});

export async function publicListingCard(
  ctx: QueryCtx,
  listing: Doc<"listings">,
) {
  const photos = await listingPhotos(ctx, listing);
  return {
    _id: listing._id,
    title: listing.title,
    city: listing.city,
    state: listing.state,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    propertyType: listing.propertyType,
    photos: photos.photos.slice(0, 1),
    petFriendly: listing.petFriendly,
    parkingIncluded: listing.parkingIncluded,
    utilitiesIncluded: listing.utilitiesIncluded,
    availableFrom: listing.availableFrom,
    minStay: listing.minStay,
    featured: photos.featured,
  };
}
