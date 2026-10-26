"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
export const deliver = internalAction({
  args: { id: v.id("reviewInvitations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const details = await ctx.runQuery(
      internal.reviewInvitations.emailDetails,
      args,
    );
    if (!details) return null;
    if (
      !process.env.RESEND_API_KEY ||
      !process.env.EMAIL_FROM ||
      !process.env.NEXT_PUBLIC_APP_URL
    ) {
      await ctx.runMutation(internal.reviewInvitations.record, {
        ...args,
        status: "unconfigured",
      });
      return null;
    }
    try {
      const url = new URL(details.path, process.env.NEXT_PUBLIC_APP_URL);
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      )
        throw new Error("Invalid app URL");
      // Recheck contact and closure after preparing configuration, before transfer.
      if (!(await ctx.runQuery(internal.reviewInvitations.emailDetails, args)))
        return null;
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
        {
          from: process.env.EMAIL_FROM,
          to: details.email,
          subject: "An honest review was requested · FurnishSearcher",
          text: `A member has requested an honest review. Only review a stay you personally experienced. This request does not confirm a booking or verify a stay. Reviews require staff moderation before publication.\n\nSign in to the account associated with this email to view or decline the private request:\n${url.toString()}`,
        },
        { idempotencyKey: `review-invitation-${args.id}` },
      );
      await ctx.runMutation(internal.reviewInvitations.record, {
        ...args,
        status: result.error || !result.data?.id ? "failed" : "sent",
      });
    } catch {
      await ctx.runMutation(internal.reviewInvitations.record, {
        ...args,
        status: "failed",
      });
    }
    return null;
  },
});
