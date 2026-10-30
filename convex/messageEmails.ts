"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createHash, createHmac } from "node:crypto";
import { repliesConfigured, replyDomain } from "./lib/emailReplies";
import { REPLY_MARKER } from "../lib/received-email";
export const notify = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const details = await ctx.runQuery(
      internal.messages.notificationDetails,
      args,
    );
    if (!details) {
      await ctx.runMutation(internal.messages.recordNotification, {
        ...args,
        status: "suppressed",
      });
      return null;
    }
    if (details.suppressed) {
      await ctx.runMutation(internal.messages.recordNotification, {
        ...args,
        status: "suppressed",
      });
      return null;
    }
    if (
      !process.env.RESEND_API_KEY ||
      !process.env.EMAIL_FROM ||
      !process.env.NEXT_PUBLIC_APP_URL
    ) {
      await ctx.runMutation(internal.messages.recordNotification, {
        ...args,
        status: "unconfigured",
      });
      return null;
    }
    try {
      const url = new URL(
        "/dashboard/messages",
        process.env.NEXT_PUBLIC_APP_URL,
      );
      url.searchParams.set("conv", details.conversationId);
      let replyTo: string | undefined;
      if (repliesConfigured()) {
        const token = createHmac(
          "sha256",
          Buffer.from(process.env.MESSAGE_REPLY_KEY!, "hex"),
        )
          .update(`${args.messageId}:${details.recipientRevision}`)
          .digest("hex");
        const prepared = await ctx.runMutation(
          internal.inboundEmails.prepareBinding,
          {
            ...args,
            revision: details.recipientRevision,
            digest: createHash("sha256").update(token).digest("hex"),
          },
        );
        if (prepared) replyTo = `${token}@${replyDomain()}`;
      }
      // Binding preparation adds an asynchronous step; recheck consent and blocks
      // before the external send. Emails already accepted cannot be recalled.
      const current = await ctx.runQuery(
        internal.messages.notificationDetails,
        args,
      );
      if (
        !current ||
        current.suppressed ||
        current.email !== details.email ||
        current.recipientRevision !== details.recipientRevision
      ) {
        await ctx.runMutation(internal.messages.recordNotification, {
          ...args,
          status: "suppressed",
        });
        return null;
      }
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
        {
          from: process.env.EMAIL_FROM,
          to: details.email,
          ...(replyTo ? { replyTo } : {}),
          headers: {
            "Auto-Submitted": "auto-generated",
            "X-Auto-Response-Suppress": "All",
          },
          subject: `New message about ${details.title.slice(0, 150)}`,
          text: `${replyTo ? REPLY_MARKER + "\n" : ""}Hi ${details.name},\n\n${details.sender} sent a message about ${details.title}:\n\n${details.preview}\n\n${replyTo ? "Reply above the line from your confirmed account email (up to 2,000 characters). Images and attachments are not imported. Check email reply activity in your profile if a reply does not appear.\n\n" : "Reply in your inbox.\n\n"}View the conversation: ${url}`,
        },
        { idempotencyKey: `listing-message-${args.messageId}` },
      );
      await ctx.runMutation(internal.messages.recordNotification, {
        ...args,
        status: result.error || !result.data?.id ? "failed" : "sent",
      });
    } catch {
      await ctx.runMutation(internal.messages.recordNotification, {
        ...args,
        status: "failed",
      });
    }
    return null;
  },
});
