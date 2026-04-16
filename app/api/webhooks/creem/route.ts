import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creem.io webhook proxy.
 *
 * The canonical webhook handler lives in Convex (`convex/http.ts` →
 * `/webhooks/creem`). Point your Creem dashboard webhook URL directly at
 * `${NEXT_PUBLIC_CONVEX_URL}/webhooks/creem` (replace `.convex.cloud` with
 * `.convex.site` for the HTTP route domain).
 *
 * This Next.js route exists only as a fallback — if Creem is configured to
 * send webhooks to this URL, we forward the raw body and headers to the
 * Convex HTTP action so signature verification and event processing happen
 * in one place.
 */
export async function POST(req: NextRequest) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 }
    );
  }

  // Convex HTTP actions live on the .convex.site domain
  const httpEndpoint =
    convexUrl.replace(".convex.cloud", ".convex.site") + "/webhooks/creem";

  const rawBody = await req.text();
  const headers = new Headers();
  // Forward only the headers Creem + our handler care about
  const signature =
    req.headers.get("creem-signature") ?? req.headers.get("x-creem-signature");
  if (signature) headers.set("creem-signature", signature);
  headers.set("content-type", "application/json");

  const upstream = await fetch(httpEndpoint, {
    method: "POST",
    headers,
    body: rawBody,
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
