"use client";
import { convexSiteUrl } from "./photos";
export async function confirmContact(
  token: string,
  contact:
    | { kind: "email"; clerkId: string }
    | { kind: "phone"; clerkId: string; phone: string },
) {
  const deployment = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!deployment)
    throw new Error("Contact confirmation is unavailable. Contact support.");
  const site = convexSiteUrl(
    deployment,
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  );
  const result = await fetch(`${site}/contacts/confirm`, {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(contact),
  });
  const data = await result.json();
  if (!result.ok)
    throw new Error(data.error ?? "Could not confirm your contact. Try again.");
  return data as { phone?: string; expiresAt?: number; ok?: boolean };
}
