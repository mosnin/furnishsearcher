import { convexSiteUrl } from "@/lib/photos";
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
      { status: 500 },
    );
  }

  // Convex HTTP actions live on the .convex.site domain
  const httpEndpoint =
    convexSiteUrl(convexUrl, process.env.NEXT_PUBLIC_CONVEX_SITE_URL) +
    "/webhooks/creem";

  const limit = 256 * 1024;
  if (Number(req.headers.get("content-length")) > limit)
    return NextResponse.json(
      { error: "Webhook body too large" },
      { status: 413 },
    );
  const reader = req.body?.getReader();
  if (!reader)
    return NextResponse.json(
      { error: "Missing webhook body" },
      { status: 400 },
    );
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Webhook body too large" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook body" },
      { status: 400 },
    );
  }
  const rawBody = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    rawBody.set(chunk, offset);
    offset += chunk.length;
  }
  const headers = new Headers();
  // Forward only the headers Creem + our handler care about
  const signature =
    req.headers.get("creem-signature") ?? req.headers.get("x-creem-signature");
  if (signature) headers.set("creem-signature", signature);
  headers.set("content-type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(httpEndpoint, {
      method: "POST",
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return NextResponse.json(
      { error: "Billing webhook is temporarily unavailable" },
      { status: 503 },
    );
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
