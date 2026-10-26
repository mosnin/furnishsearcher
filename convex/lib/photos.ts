import { listingAmenities } from "../../lib/listing-features";
import { verifiedFeature } from "./billing";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
type Asset = {
  storageId?: Id<"_storage">;
  legacyUrl?: string;
  caption: string;
};
export async function validatePhotoAssets(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  assets: Asset[],
  legacyAllowed: string[],
) {
  if (assets.length > 30) throw new Error("Use at most 30 photos.");
  const seen = new Set<string>();
  const result: Asset[] = [];
  for (const asset of assets) {
    if (asset.caption.trim().length > 240)
      throw new Error("Photo captions must be at most 240 characters.");
    if (!!asset.storageId === !!asset.legacyUrl)
      throw new Error("Each photo must have one source.");
    const key = asset.storageId ?? asset.legacyUrl!;
    if (seen.has(key)) throw new Error("Remove duplicate photos.");
    seen.add(key);
    if (asset.storageId) {
      const upload = await ctx.db
        .query("photoUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", asset.storageId!))
        .unique();
      if (
        !upload ||
        upload.ownerId !== ownerId ||
        !(await ctx.storage.getUrl(asset.storageId))
      )
        throw new Error("Photo not found or not owned by this property owner.");
    } else if (!legacyAllowed.includes(asset.legacyUrl!))
      throw new Error("Upload new photos using the photo editor.");
    result.push({ ...asset, caption: asset.caption.trim() });
  }
  return result;
}
export async function listingPhotos<T extends Doc<"listings">>(
  ctx: QueryCtx,
  listing: T,
) {
  const featured = await verifiedFeature(ctx, listing);
  const effective = { ...listing, amenities: listingAmenities(listing) };
  if (!listing.photoAssets)
    return {
      ...effective,
      featured,
      photoCaptions: listing.photos.map(() => ""),
      photoDrafts: listing.photos.map((url) => ({
        url,
        caption: "",
        storageId: undefined as Id<"_storage"> | undefined,
      })),
    };
  const resolved = await Promise.all(
    listing.photoAssets.map(async (asset) => ({
      url: asset.storageId
        ? await ctx.storage.getUrl(asset.storageId)
        : asset.legacyUrl,
      caption: asset.caption,
      storageId: asset.storageId,
    })),
  );
  const existing = resolved.filter(
    (
      photo,
    ): photo is {
      url: string;
      caption: string;
      storageId: Id<"_storage"> | undefined;
    } => !!photo.url,
  );
  return {
    ...effective,
    featured,
    photos: existing.map((p) => p.url),
    photoCaptions: existing.map((p) => p.caption),
    photoDrafts: existing,
  };
}
