import type { UserIdentity } from "convex/server";

// This only reads claims. Call ONLY after Convex authenticates this request's
// Authorization header; parsing a JWT alone never verifies its signature.
export function authenticatedIssuance(
  header: string | null,
  identity: UserIdentity | null,
) {
  if (!identity || !header || header.length > 16384)
    throw new Error("Sign in again.");
  const match =
    /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/i.exec(
      header,
    );
  if (!match) throw new Error("Sign in again.");
  const encoded = match[2].replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(
    atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
  const claims = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (
    !claims ||
    claims.sub !== identity.subject ||
    claims.iss !== identity.issuer ||
    !(
      claims.aud === "convex" ||
      (Array.isArray(claims.aud) && claims.aud.includes("convex"))
    ) ||
    typeof claims.iat !== "number" ||
    !Number.isSafeInteger(claims.iat)
  )
    throw new Error("Sign in again.");
  return claims.iat as number;
}
