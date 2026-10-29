"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
export const deliver = internalAction({
  args: { id: v.id("bookingEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internal.bookings.claimNotice, args);
    if (!claim) return null;
    let status: "sent" | "failed" | "unconfigured" | "suppressed" = "failed";
    if (claim.suppressed) status = "suppressed";
    else if (
      !process.env.RESEND_API_KEY ||
      !process.env.EMAIL_FROM ||
      !process.env.NEXT_PUBLIC_APP_URL
    )
      status = "unconfigured";
    else
      try {
        const url = new URL(
          `/dashboard/inquiries/${claim.inquiryId}`,
          process.env.NEXT_PUBLIC_APP_URL,
        );
        if (!["http:", "https:"].includes(url.protocol))
          throw new Error("Invalid app URL");
        const response = await new Resend(
          process.env.RESEND_API_KEY,
        ).emails.send(
          {
            from: process.env.EMAIL_FROM,
            to: claim.email,
            subject: "Booking update · globe",
            text: `Your private rental workspace has an update. Review its current stay details, document or setup instruction. Review the current details and private history in your account: ${url}\n\nRental agreements, cancellation terms and payments are arranged directly with your stay partner.`,
          },
          { idempotencyKey: `booking-event-${args.id}` },
        );
        status = response.error || !response.data?.id ? "failed" : "sent";
      } catch {
        status = "failed";
      }
    await ctx.runMutation(internal.bookings.recordNotice, {
      id: args.id,
      attempt: claim.attempt,
      status,
    });
    return null;
  },
});
