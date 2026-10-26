import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { subjectDeleted } from "./lib/auth";
import { publiclyVisible } from "./lib/publication";
import { listingPhotos } from "./lib/photos";
const card = v.object({
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
export const list = query({
  args: { landlordId: v.id("users"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(card),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.landlordId);
    if (
      !owner ||
      owner.role !== "landlord" ||
      owner.clerkDeletedAt !== undefined ||
      (await subjectDeleted(ctx, owner.clerkId))
    )
      return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("listings")
      .withIndex("by_owner_public_created", (q) =>
        q.eq("landlordId", owner._id).eq("status", "active"),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(1, Math.min(10, args.paginationOpts.numItems)),
      });
    const page = [];
    for (const listing of result.page) {
      // Identical visibility for anonymous visitors, the owner and staff.
      if (!(await publiclyVisible(ctx, listing))) continue;
      const photos = await listingPhotos(ctx, listing);
      page.push({
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
      });
    }
    return { ...result, page };
  },
});
