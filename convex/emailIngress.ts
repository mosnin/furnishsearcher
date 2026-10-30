import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { limitedText, verifyEmailWebhook } from "../lib/email-webhook";
import { repliesConfigured, replyDomain } from "./lib/emailReplies";

export const receive = httpAction(async (ctx, request) => {
  const respond = (status: number) =>
    new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!repliesConfigured()) return respond(503);
  let body: string;
  try {
    body = await limitedText(request, 256 * 1024);
  } catch {
    return respond(413);
  }
  if (
    !(await verifyEmailWebhook(
      body,
      request.headers,
      process.env.RESEND_RECEIVING_WEBHOOK_SECRET!,
    ))
  )
    return respond(401);
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return respond(400);
  }
  if (event?.type !== "email.received") return respond(204);
  if (
    typeof event.data?.email_id !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(event.data.email_id)
  )
    return respond(400);
  try {
    if (!Array.isArray(event.data.to) || event.data.to.length > 50)
      return respond(400);
    const addresses = new Set<string>(
      event.data.to
        .filter((x: unknown): x is string => typeof x === "string")
        .map((x: string) => x.trim().toLowerCase())
        .filter(
          (x: string) =>
            x.endsWith(`@${replyDomain()}`) &&
            /^[a-f0-9]{64}$/.test(x.split("@")[0]),
        ),
    );
    if (addresses.size !== 1) return respond(204);
    const token = [...addresses][0].split("@")[0];
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    await ctx.runMutation(internal.inboundEmails.enqueue, {
      emailId: event.data.email_id.toLowerCase(),
      digest,
    });
    return respond(202);
  } catch {
    return respond(503);
  }
});
