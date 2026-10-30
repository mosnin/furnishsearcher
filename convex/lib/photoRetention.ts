import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const PHOTO_RECOVERY_MS = 7 * 86400000;
export const PHOTO_REFERENCE_MIGRATION = "listing-photo-references-v1";
export async function photoUrlKey(url: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// Legacy URLs are recognized only when they exactly match a native storage URL.
// External URLs and documents/profile photos are never storage deletion inputs.
async function legacyStorageId(ctx: MutationCtx, value: string) {
  // Storage serving URLs contain a separate UUID, not the native storage ID.
  const key = await photoUrlKey(value);
  const found = await ctx.db
    .query("photoUploads")
    .withIndex("by_url_key", (q) => q.eq("urlKey", key))
    .unique();
  return found && (await ctx.storage.getUrl(found.storageId)) === value
    ? found.storageId
    : null;
}

export async function syncPhotoReferences(
  ctx: MutationCtx,
  listing: Doc<"listings">,
  remove = false,
) {
  const sources =
    listing.photoAssets ?? listing.photos.map((legacyUrl) => ({ legacyUrl }));
  if (sources.length > 30)
    throw new Error("This gallery needs support review before photo cleanup.");
  const desired = new Set<Id<"_storage">>();
  if (!remove)
    for (const source of sources) {
      const id =
        "storageId" in source && source.storageId
          ? source.storageId
          : source.legacyUrl
            ? await legacyStorageId(ctx, source.legacyUrl)
            : null;
      if (id) desired.add(id);
    }
  const previous = await ctx.db
    .query("listingPhotoReferences")
    .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
    .take(31);
  if (previous.length > 30)
    throw new Error("Photo references need support review.");
  const existing = new Set(previous.map((row) => row.storageId));
  for (const row of previous)
    if (!desired.has(row.storageId)) await ctx.db.delete(row._id);
  for (const storageId of desired)
    if (!existing.has(storageId))
      await ctx.db.insert("listingPhotoReferences", {
        listingId: listing._id,
        storageId,
      });
  // An upload shared by several listings expires only after its final reference.
  // Upload adoption separately establishes a full seven-day recovery period.
  for (const storageId of new Set([...existing, ...desired])) {
    const upload = await ctx.db
      .query("photoUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (!upload || upload.cleanupVersion !== 1) continue;
    const referenced = await ctx.db
      .query("listingPhotoReferences")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (referenced) {
      if (upload.expiresAt !== undefined)
        await ctx.db.patch(upload._id, { expiresAt: undefined });
    } else if (upload.expiresAt === undefined) {
      await ctx.db.patch(upload._id, {
        expiresAt: Date.now() + PHOTO_RECOVERY_MS,
      });
    }
  }
}
