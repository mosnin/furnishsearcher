"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { replyDomain, repliesConfigured } from "./lib/emailReplies";
import { receivedReply } from "../lib/received-email";
import { limitedText } from "../lib/email-webhook";

export const receive = internalAction({
  args: { id: v.id("inboundEmailReceipts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internal.inboundEmails.claim, args);
    if (!claim) return null;
    try {
      if (!repliesConfigured()) throw new Error("unconfigured");
      const response = await fetch(
        `https://api.resend.com/emails/receiving/${claim.emailId}?html_format=cid`,
        {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("provider_unavailable");
      }
      const body = await limitedText(response, 1024 * 1024);
      const result = receivedReply(
        JSON.parse(body),
        claim.emailId,
        replyDomain()!,
      );
      await ctx.runMutation(internal.inboundEmails.finalize, {
        ...args,
        attempt: claim.attempt,
        ...result,
      });
    } catch {
      // Retain no raw provider error, mail body, header, attachment URL or credential.
      await ctx.runMutation(internal.inboundEmails.retry, {
        ...args,
        attempt: claim.attempt,
      });
    }
    return null;
  },
});
