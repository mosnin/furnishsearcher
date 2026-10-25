import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  limitedText,
  verifyEmailWebhook as verifySvixWebhook,
} from "../lib/email-webhook";
import {
  parseClerkContactEvent,
  contactHash,
} from "../lib/clerk-contact-event";
import { contactMode } from "./lib/contacts";
import { emailContactMode } from "./lib/emailContact";
function configuration(): {
  secret: string;
  instance: string;
  mode: "test" | "prod";
} | null {
  const secret = process.env.CLERK_CONTACT_WEBHOOK_SECRET,
    instance = process.env.CLERK_CONTACT_WEBHOOK_INSTANCE_ID,
    mode = process.env.CLERK_CONTACT_WEBHOOK_MODE;
  if (
    !secret?.startsWith("whsec_") ||
    !instance ||
    !/^ins_[A-Za-z0-9_-]{1,200}$/.test(instance) ||
    (mode !== "test" && mode !== "prod") ||
    mode !== contactMode() ||
    mode !== emailContactMode()
  )
    return null;
  return { secret, instance, mode };
}
export const receive = httpAction(async (ctx, request) => {
  const respond = (status: number) =>
    new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  let config;
  try {
    config = configuration();
  } catch {
    return respond(503);
  }
  if (!config) return respond(503);
  let payload: string;
  try {
    payload = await limitedText(request, 256 * 1024);
  } catch {
    return respond(413);
  }
  if (!(await verifySvixWebhook(payload, request.headers, config.secret)))
    return respond(401);
  try {
    if (!parseClerkContactEvent(payload, config.instance)) return respond(204);
  } catch {
    return respond(400);
  }
  try {
    await ctx.runMutation(internal.clerkContactWebhook.apply, {
      payload,
      eventId: request.headers.get("svix-id")!,
    });
    return respond(200);
  } catch {
    return respond(503);
  }
});
export const apply = internalMutation({
  args: { payload: v.string(), eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = configuration();
    if (!config) throw new Error("Contact event receiver is not configured");
    const event = parseClerkContactEvent(args.payload, config.instance);
    if (!event) return null;
    const prior = await ctx.db
      .query("clerkContactSnapshots")
      .withIndex("by_clerk_mode", (q) =>
        q.eq("clerkId", event.clerkId).eq("mode", config.mode),
      )
      .unique();
    if (prior?.deleted) return null;
    if (
      prior &&
      !event.deleted &&
      (event.updatedAt < prior.updatedAt ||
        (event.updatedAt === prior.updatedAt && event.eventAt < prior.eventAt))
    )
      return null;
    let emailHash = event.email ? await contactHash(event.email) : null,
      phoneHash = event.phone ? await contactHash(event.phone) : null;
    const tied =
      prior &&
      event.updatedAt === prior.updatedAt &&
      event.eventAt === prior.eventAt &&
      !event.deleted;
    if (tied && prior.uncertain) return null;
    if (tied && prior.emailHash === emailHash && prior.phoneHash === phoneHash)
      return null;
    // Contradictory snapshots with indistinguishable ordering cannot grant contact authority.
    const uncertain = !!(
      tied &&
      (prior.uncertain ||
        prior.emailHash !== emailHash ||
        prior.phoneHash !== phoneHash)
    );
    if (uncertain) {
      emailHash = null;
      phoneHash = null;
    }
    const fields = {
      clerkId: event.clerkId,
      mode: config.mode,
      instanceId: config.instance,
      updatedAt: event.updatedAt,
      eventAt: event.eventAt,
      deleted: event.deleted,
      uncertain,
      emailHash,
      phoneHash,
      emailChangedAt:
        !prior || prior.emailHash !== emailHash || event.deleted
          ? event.eventAt
          : prior.emailChangedAt,
      phoneChangedAt:
        !prior || prior.phoneHash !== phoneHash || event.deleted
          ? event.eventAt
          : prior.phoneChangedAt,
      eventId: args.eventId,
      appliedAt: Date.now(),
    };
    if (prior) await ctx.db.patch(prior._id, fields);
    else await ctx.db.insert("clerkContactSnapshots", fields);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", event.clerkId))
      .unique();
    if (!user) return null;
    const revokeEmail =
      event.deleted ||
      uncertain ||
      (!!user.notificationEmail &&
        (user.notificationEmailMode !== config.mode ||
          !emailHash ||
          (await contactHash(user.notificationEmail)) !== emailHash));
    const revokePhone =
      event.deleted ||
      uncertain ||
      (!!user.phone &&
        (user.phoneVerificationMode !== config.mode ||
          !phoneHash ||
          (await contactHash(user.phone)) !== phoneHash));
    const barrier = Math.floor(Math.max(Date.now(), event.eventAt) / 1000) + 1;
    if (revokeEmail)
      await ctx.db.patch(user._id, {
        messageEmailsEnabled: false,
        notificationEmail: undefined,
        notificationEmailVerifiedAt: undefined,
        notificationEmailExpiresAt: undefined,
        notificationEmailMode: undefined,
        notificationEmailProofAfter: Math.max(
          user.notificationEmailProofAfter ?? 0,
          barrier,
        ),
        notificationEmailRevision: (user.notificationEmailRevision ?? 0) + 1,
      });
    if (revokePhone)
      await ctx.db.patch(user._id, {
        phoneVerified: false,
        phoneVerificationSource: undefined,
        phoneVerificationMode: undefined,
        phoneVerifiedAt: undefined,
        phoneVerificationExpiresAt: undefined,
        listingPhoneConsent: undefined,
        phoneProofAfter: Math.max(user.phoneProofAfter ?? 0, barrier),
        phoneRevision: (user.phoneRevision ?? 0) + 1,
      });
    return null;
  },
});
