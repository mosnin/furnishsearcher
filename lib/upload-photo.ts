"use client";
import type { Id } from "../convex/_generated/dataModel";
import { convexSiteUrl } from "./photos";
export async function uploadPhotoFile(file: File, token: string | null) {
  if (!token) throw new Error("Sign in to upload a photo.");
  const site = convexSiteUrl(
    process.env.NEXT_PUBLIC_CONVEX_URL!,
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  );
  const result = await fetch(`${site}/photos/upload`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
  });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error ?? "Photo upload failed.");
  if (!data.url || !data.storageId)
    throw new Error("Could not retrieve the uploaded photo.");
  return data as { url: string; storageId: Id<"_storage"> };
}
