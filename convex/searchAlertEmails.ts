"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
export const deliver = internalAction({
  args: { deliveryId: v.id("savedSearchDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const details = await ctx.runQuery(internal.searchAlerts.details, args);
    if (!details) {
      await ctx.runMutation(internal.searchAlerts.record, {
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
      await ctx.runMutation(internal.searchAlerts.record, {
        ...args,
        status: "unconfigured",
      });
      return null;
    }
    try {
      const property = new URL(
        `/listings/${details.listingId}`,
        process.env.NEXT_PUBLIC_APP_URL,
      );
      if (details.moveIn !== undefined && details.moveOut !== undefined) {
        property.searchParams.set(
          "moveIn",
          new Date(details.moveIn).toISOString().slice(0, 10),
        );
        property.searchParams.set(
          "moveOut",
          new Date(details.moveOut).toISOString().slice(0, 10),
        );
      }
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
        {
          from: process.env.EMAIL_FROM,
          to: details.email,
          subject: `New match for ${details.searchName.slice(0, 100)}`,
          text: `Hi ${details.name},\n\n${details.title} matches your saved search “${details.searchName}”.\n${details.moveIn !== undefined ? `Matching stay: ${new Date(details.moveIn).toISOString().slice(0, 10)} through ${new Date(details.moveOut!).toISOString().slice(0, 10)} (checkout).\n` : ""}\nView property: ${property}\nRun your search: ${new URL(details.searchUrl, process.env.NEXT_PUBLIC_APP_URL)}\nManage or turn off alerts: ${new URL("/dashboard/tenant/searches", process.env.NEXT_PUBLIC_APP_URL)}`,
        },
        { idempotencyKey: `saved-search-${args.deliveryId}` },
      );
      await ctx.runMutation(internal.searchAlerts.record, {
        ...args,
        status: result.error || !result.data?.id ? "failed" : "sent",
      });
    } catch {
      await ctx.runMutation(internal.searchAlerts.record, {
        ...args,
        status: "failed",
      });
    }
    return null;
  },
});
