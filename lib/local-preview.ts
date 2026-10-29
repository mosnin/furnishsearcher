type PreviewEnvironment = {
  NODE_ENV?: string;
  LOCAL_PREVIEW_ENABLED?: string;
  LOCAL_PREVIEW_ORIGIN?: string;
  LOCAL_PREVIEW_USER_ID?: string;
  NEXT_PUBLIC_CONVEX_URL?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
};

export function localPreviewEnabled(env: PreviewEnvironment): boolean {
  try {
    const origin = new URL(env.LOCAL_PREVIEW_ORIGIN ?? "");
    const backend = new URL(env.NEXT_PUBLIC_CONVEX_URL ?? "");
    return (
      env.NODE_ENV === "development" &&
      env.LOCAL_PREVIEW_ENABLED === "1" &&
      origin.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(origin.hostname) &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash &&
      !origin.username &&
      !origin.password &&
      backend.protocol === "http:" &&
      backend.hostname === "127.0.0.1" &&
      Boolean(env.LOCAL_PREVIEW_USER_ID) &&
      Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"))
    );
  } catch {
    return false;
  }
}

export function localPreviewRequestAllowed(
  env: PreviewEnvironment,
  headers: Headers,
): boolean {
  if (!localPreviewEnabled(env)) return false;
  const expected = new URL(env.LOCAL_PREVIEW_ORIGIN!).origin;
  return (
    headers.get("host") === new URL(expected).host &&
    headers.get("origin") === expected &&
    (!headers.has("x-forwarded-host") ||
      headers.get("x-forwarded-host") === new URL(expected).host) &&
    (!headers.has("sec-fetch-site") ||
      headers.get("sec-fetch-site") === "same-origin")
  );
}
