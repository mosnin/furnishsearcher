"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function deliver(
  ctx: ActionCtx,
  args: { id?: Id<"supportCases">; replyId?: Id<"supportReplies"> },
) {
  const details = await ctx.runQuery(internal.support.emailDetails, args);
  if (!details) return null;
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.NEXT_PUBLIC_APP_URL ||
    (!details.toRequester && !process.env.SUPPORT_EMAIL)
  ) {
    await ctx.runMutation(internal.support.recordEmail, {
      ...args,
      status: "unconfigured",
    });
    return null;
  }
  try {
    const url = new URL(
      `/dashboard/support/${details.caseId}`,
      process.env.NEXT_PUBLIC_APP_URL,
    ).toString();
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from: process.env.EMAIL_FROM,
        to: details.toRequester ? details.email : process.env.SUPPORT_EMAIL!,
        ...(details.toRequester && process.env.SUPPORT_EMAIL
          ? { replyTo: process.env.SUPPORT_EMAIL }
          : {}),
        subject: details.toRequester
          ? `Support reply • case ${details.caseId}`
          : `New support case ${details.caseId}`,
        text: `${details.body}\n\nCase reference: ${details.caseId}\n${details.toRequester ? "If you submitted this case while signed in, you can follow up here" : "Staff review"}: ${url}\n${details.toRequester ? "You can also use our contact form and include your case reference." : ""}`,
      },
      { idempotencyKey: `support-${args.replyId ?? args.id}` },
    );
    await ctx.runMutation(internal.support.recordEmail, {
      ...args,
      status: result.error || !result.data?.id ? "failed" : "sent",
    });
  } catch {
    await ctx.runMutation(internal.support.recordEmail, {
      ...args,
      status: "failed",
    });
  }
  return null;
}
export const notifyStaff = internalAction({
  args: { id: v.id("supportCases") },
  returns: v.null(),
  handler: deliver,
});
export const sendReply = internalAction({
  args: { replyId: v.id("supportReplies") },
  returns: v.null(),
  handler: deliver,
});
