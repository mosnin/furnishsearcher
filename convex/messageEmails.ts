"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
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
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
        {
          from: process.env.EMAIL_FROM,
          to: details.email,
          subject: `New message about ${details.title.slice(0, 150)}`,
          text: `Hi ${details.name},\n\n${details.sender} sent a message about ${details.title}:\n\n${details.preview}\n\nView the conversation: ${url}`,
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
