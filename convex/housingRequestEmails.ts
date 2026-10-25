"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
export const notifyOwner = internalAction({
  args: {
    deliveryId: v.id("housingRequestDeliveries"),
    generation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const configured = !!(
      process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      process.env.NEXT_PUBLIC_APP_URL
    );
    const details = await ctx.runMutation(
      internal.leadNotifications.prepareSend,
      { ...args, configured },
    );
    if (!details) return null;
    try {
      const url = new URL(
        "/dashboard/landlord/requests",
        process.env.NEXT_PUBLIC_APP_URL,
      ).toString();
      const result = await new Resend(process.env.RESEND_API_KEY!).emails.send(
        {
          from: process.env.EMAIL_FROM!,
          to: details.email,
          subject:
            details.kind === "unmatched"
              ? `A housing request may be a fit in ${details.city}`
              : `A housing request matches your property in ${details.city}`,
          text: `A traveler is looking for housing in ${details.city}, ${details.state}. Review the dates, property details and any mismatched criteria, then reply in your dashboard: ${url}`,
        },
        { idempotencyKey: `housing-request-${args.deliveryId}` },
      );
      await ctx.runMutation(internal.leadNotifications.finish, {
        deliveryId: args.deliveryId,
        generation: details.generation,
        status: result.error
          ? result.error.name === "application_error"
            ? "unknown"
            : "failed"
          : result.data?.id
            ? "sent"
            : "unknown",
        ...(result.data?.id ? { providerId: result.data.id } : {}),
      });
    } catch {
      await ctx.runMutation(internal.leadNotifications.finish, {
        deliveryId: args.deliveryId,
        generation: details.generation,
        status: "unknown",
      });
    }
    return null;
  },
});
