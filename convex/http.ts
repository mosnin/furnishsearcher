import {
  upload as uploadDocument,
  download as downloadDocument,
  options as documentOptions,
} from "./documentFiles";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { uploadPhoto, uploadOptions } from "./files";
import { receive as receiveEmail } from "./emailIngress";
import {
  upload as uploadProfileImage,
  options as profileImageOptions,
} from "./profileImageFiles";
async function verified(body: string, signature: string, secret: string) {
  const supplied = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body)),
  );
  const expected = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  let mismatch = 0;
  for (let i = 0; i < 64; i++)
    mismatch |= expected.charCodeAt(i) ^ supplied.toLowerCase().charCodeAt(i);
  return mismatch === 0;
}
const webhook = httpAction(async (ctx, request) => {
  const respond = (status: number, data: object) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  if (!secret)
    return respond(503, { error: "Billing webhook is not configured" });
  const limit = 256 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return respond(413, { error: "Webhook body too large" });
  const reader = request.body?.getReader();
  if (!reader) return respond(400, { error: "Missing webhook body" });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return respond(413, { error: "Webhook body too large" });
      }
      chunks.push(value);
    }
  } catch {
    return respond(400, { error: "Invalid webhook body" });
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return respond(400, { error: "Invalid webhook encoding" });
  }
  if (
    !(await verified(
      body,
      request.headers.get("creem-signature") ?? "",
      secret,
    ))
  )
    return respond(401, { error: "Invalid signature" });
  try {
    JSON.parse(body);
  } catch {
    return respond(400, { error: "Invalid JSON" });
  }
  try {
    const result = await ctx.runMutation(internal.billingWebhook.process, {
      payload: body,
    });
    return respond(200, { ok: true, ...result });
  } catch {
    return respond(503, {
      error: "Webhook could not be applied. Delivery can be retried.",
    });
  }
});
const http = httpRouter();
http.route({
  path: "/webhooks/resend-replies",
  method: "POST",
  handler: receiveEmail,
});
http.route({ path: "/photos/upload", method: "POST", handler: uploadPhoto });
http.route({
  path: "/photos/upload",
  method: "OPTIONS",
  handler: uploadOptions,
});
http.route({
  path: "/documents/upload",
  method: "POST",
  handler: uploadDocument,
});
http.route({
  path: "/documents/upload",
  method: "OPTIONS",
  handler: documentOptions,
});
http.route({
  path: "/documents/download",
  method: "GET",
  handler: downloadDocument,
});
http.route({
  path: "/documents/download",
  method: "OPTIONS",
  handler: documentOptions,
});
http.route({ path: "/webhooks/creem", method: "POST", handler: webhook });
http.route({
  path: "/profile-images/upload",
  method: "POST",
  handler: uploadProfileImage,
});
http.route({
  path: "/profile-images/upload",
  method: "OPTIONS",
  handler: profileImageOptions,
});
export default http;
