"use node";
import { internalAction, action } from "convex/server";
import { v } from "convex/values";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "noreply@furnishfinder.com";

// ---------------------------------------------------------------------------
// Internal action — not publicly callable. Triggered by the sendMessage
// mutation via ctx.scheduler to notify the landlord of a new message.
// ---------------------------------------------------------------------------
export const sendNewMessageNotification = internalAction({
  args: {
    toEmail: v.string(),
    toName: v.string(),
    fromName: v.string(),
    listingTitle: v.string(),
    messagePreview: v.string(),
    conversationId: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      await resend.emails.send({
        from: FROM,
        to: args.toEmail,
        subject: `New message about "${args.listingTitle}" — FurnishFinder`,
        html: newMessageEmailHtml(args),
      });
    } catch (e) {
      console.error("Failed to send email:", e);
    }
  },
});

// ---------------------------------------------------------------------------
// Public action — called from the client after a user completes onboarding.
// ---------------------------------------------------------------------------
export const sendWelcomeEmail = action({
  args: {
    toEmail: v.string(),
    toName: v.string(),
    role: v.union(
      v.literal("tenant"),
      v.literal("landlord"),
      v.literal("admin")
    ),
  },
  handler: async (_ctx, args) => {
    try {
      await resend.emails.send({
        from: FROM,
        to: args.toEmail,
        subject: "Welcome to FurnishFinder!",
        html: welcomeEmailHtml(args),
      });
    } catch (e) {
      console.error("Failed to send welcome email:", e);
    }
  },
});

// ---------------------------------------------------------------------------
// Public action — called when an admin approves a listing.
// ---------------------------------------------------------------------------
export const sendListingApprovedEmail = action({
  args: {
    toEmail: v.string(),
    toName: v.string(),
    listingTitle: v.string(),
    listingId: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      await resend.emails.send({
        from: FROM,
        to: args.toEmail,
        subject: `Your listing "${args.listingTitle}" is now live!`,
        html: listingApprovedEmailHtml(args),
      });
    } catch (e) {
      console.error("Failed to send listing approved email:", e);
    }
  },
});

// ---------------------------------------------------------------------------
// HTML template helpers
// ---------------------------------------------------------------------------

interface NewMessageArgs {
  toName: string;
  fromName: string;
  listingTitle: string;
  messagePreview: string;
  conversationId: string;
}

function newMessageEmailHtml(args: NewMessageArgs): string {
  const preview = args.messagePreview.slice(0, 200);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Message — FurnishFinder</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#0f2044;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">FurnishFinder</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:16px;color:#111827;">Hi ${escapeHtml(args.toName)},</p>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                <strong>${escapeHtml(args.fromName)}</strong> sent you a message about your listing:
              </p>
              <!-- Message preview box -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Listing</p>
                    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#111827;">${escapeHtml(args.listingTitle)}</p>
                    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Message</p>
                    <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(preview)}${args.messagePreview.length > 200 ? "…" : ""}</p>
                  </td>
                </tr>
              </table>
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    <a href="https://furnishfinder.com/dashboard/messages"
                       style="display:inline-block;background:#0f2044;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                      View Message
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                You're receiving this because you're a landlord on FurnishFinder.<br />
                &copy; ${new Date().getFullYear()} FurnishFinder. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface WelcomeArgs {
  toName: string;
  role: "tenant" | "landlord" | "admin";
}

function welcomeEmailHtml(args: WelcomeArgs): string {
  const isTenant = args.role === "tenant";
  const headline = isTenant
    ? "Welcome! Start searching 300,000+ furnished rentals."
    : "Welcome! Ready to list your property?";
  const bodyText = isTenant
    ? "Find your perfect furnished rental from verified landlords — no booking fees, no hassle. Browse thousands of listings and move in fast."
    : "Connect directly with quality tenants. List your furnished property in minutes and start receiving enquiries today — with no platform fees.";
  const ctaText = isTenant ? "Browse Listings" : "Create Your First Listing";
  const ctaHref = isTenant
    ? "https://furnishfinder.com/listings"
    : "https://furnishfinder.com/dashboard/landlord";
  const accentColor = isTenant ? "#2563eb" : "#059669";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to FurnishFinder!</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#0f2044;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">FurnishFinder</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:16px;color:#111827;">Hi ${escapeHtml(args.toName)},</p>
              <h1 style="margin:0 0 20px;font-size:24px;font-weight:800;color:#0f2044;line-height:1.3;">
                ${headline}
              </h1>
              <p style="margin:0 0 32px;font-size:16px;color:#374151;line-height:1.7;">
                ${bodyText}
              </p>
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    <a href="${ctaHref}"
                       style="display:inline-block;background:${accentColor};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                      ${ctaText}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                &copy; ${new Date().getFullYear()} FurnishFinder. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface ListingApprovedArgs {
  toName: string;
  listingTitle: string;
  listingId: string;
}

function listingApprovedEmailHtml(args: ListingApprovedArgs): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Listing is Live — FurnishFinder</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#0f2044;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">FurnishFinder</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <!-- Status badge -->
              <div style="display:inline-block;background:#d1fae5;color:#065f46;font-size:13px;font-weight:700;padding:6px 14px;border-radius:999px;margin-bottom:20px;letter-spacing:0.3px;">
                APPROVED &amp; LIVE
              </div>
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0f2044;">
                Your listing is live!
              </h1>
              <p style="margin:0 0 20px;font-size:16px;color:#374151;line-height:1.6;">
                Hi ${escapeHtml(args.toName)}, your property <strong>${escapeHtml(args.listingTitle)}</strong> has been approved by our team and is now publicly visible on FurnishFinder.
              </p>
              <p style="margin:0 0 32px;font-size:16px;color:#374151;line-height:1.6;">
                Tenants can now find and contact you directly. You'll receive an email notification whenever someone sends you a message.
              </p>
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    <a href="https://furnishfinder.com/listings/${escapeHtml(args.listingId)}"
                       style="display:inline-block;background:#0f2044;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                      View Listing
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                &copy; ${new Date().getFullYear()} FurnishFinder. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
