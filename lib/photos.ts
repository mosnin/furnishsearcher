import type { Id } from "../convex/_generated/dataModel";
export interface PhotoDraft {
  url: string;
  storageId?: Id<"_storage">;
  caption: string;
}
export const photoAssetsFromDrafts = (photos: PhotoDraft[]) =>
  photos.map((photo) => ({
    ...(photo.storageId
      ? { storageId: photo.storageId }
      : { legacyUrl: photo.url }),
    caption: photo.caption,
  }));
export const MAX_PHOTOS = 30;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export function validatePhotoBytes(bytes: Uint8Array, contentType: string) {
  if (!bytes.length || bytes.length >= MAX_PHOTO_BYTES)
    throw new Error("Photos must be smaller than 20 MB.");
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (
    !(
      (contentType === "image/png" && png) ||
      (contentType === "image/jpeg" && jpeg) ||
      (contentType === "image/webp" && webp)
    )
  )
    throw new Error("Use a JPEG, PNG or WebP photo with a matching file type.");
}
export function convexSiteUrl(deploymentUrl: string, explicit?: string) {
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(deploymentUrl);
  if (url.hostname.endsWith(".convex.cloud"))
    url.hostname = url.hostname.replace(/\.convex.cloud$/, ".convex.site");
  else if (
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.port === "3210"
  )
    url.port = "3211";
  else
    throw new Error("Configure NEXT_PUBLIC_CONVEX_SITE_URL for photo uploads.");
  return url.origin;
}
