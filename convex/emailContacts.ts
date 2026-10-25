import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { emailContactMode } from "./lib/emailContact";
import {
  canonicalEmail,
  EMAIL_PROOF_LIFETIME,
  emailProofCurrent,
} from "../lib/email-contact";

export const settings = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    confirmed: v.boolean(),
    email: v.union(v.string(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
    mode: v.union(v.literal("test"), v.literal("prod")),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx),
      mode = emailContactMode();
    return {
      enabled: user.messageEmailsEnabled === true,
      confirmed: emailProofCurrent(user, mode),
      email: user.notificationEmail ?? null,
      expiresAt: user.notificationEmailExpiresAt ?? null,
      mode,
    };
  },
});

export const setMessageEmails = mutation({
  args: { clerkId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { clerkId, enabled }) => {
    const user = await requireUser(ctx);
    if (user.clerkId !== clerkId)
      throw new Error("Your account changed. Reload this page and try again.");
    if (!enabled) {
      // Revoke the binding as well, so old tokens cannot silently re-enable it.
      await ctx.db.patch(user._id, {
        messageEmailsEnabled: false,
        notificationEmail: undefined,
        notificationEmailVerifiedAt: undefined,
        notificationEmailExpiresAt: undefined,
        notificationEmailMode: undefined,
        notificationEmailProofAfter: Math.floor(Date.now() / 1000) + 1,
        notificationEmailRevision: (user.notificationEmailRevision ?? 0) + 1,
      });
      return null;
    }
    const identity = (await ctx.auth.getUserIdentity())!,
      now = Date.now(),
      issued = identity.iat;
    if (
      identity.emailVerified !== true ||
      typeof identity.email !== "string" ||
      typeof issued !== "number" ||
      !Number.isFinite(issued) ||
      issued * 1000 > now ||
      issued * 1000 < now - 120000 ||
      issued < (user.notificationEmailProofAfter ?? 0)
    )
      throw new Error(
        "Confirm your primary email in your sign-in account, then refresh confirmation. Contact support if it is unavailable.",
      );
    const email = canonicalEmail(identity.email),
      mode = emailContactMode();
    if (
      mode === "prod" &&
      new URL(identity.issuer).hostname.endsWith(".clerk.accounts.dev")
    )
      throw new Error(
        "Development sign-in accounts cannot establish production email confirmation.",
      );
    await ctx.db.patch(user._id, {
      messageEmailsEnabled: true,
      notificationEmail: email,
      notificationEmailVerifiedAt: now,
      notificationEmailExpiresAt: now + EMAIL_PROOF_LIFETIME,
      notificationEmailMode: mode,
      notificationEmailRevision: (user.notificationEmailRevision ?? 0) + 1,
    });
    await ctx.scheduler.runAt(
      now + EMAIL_PROOF_LIFETIME,
      internal.emailContacts.expire,
      {
        userId: user._id,
        expiresAt: now + EMAIL_PROOF_LIFETIME,
      },
    );
    return null;
  },
});

export const expire = internalMutation({
  args: { userId: v.id("users"), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (
      user?.notificationEmailExpiresAt === args.expiresAt &&
      Date.now() >= args.expiresAt
    )
      await ctx.db.patch(user._id, { notificationEmailExpiresAt: undefined });
    return null;
  },
});

// One attempt per account. A public action must never be an arbitrary-recipient mail relay.
export const claimWelcome = internalMutation({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ userId: v.id("users"), email: v.string(), name: v.string() }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx),
      identity = (await ctx.auth.getUserIdentity())!;
    if (
      user.welcomeEmailAttemptedAt !== undefined ||
      identity.emailVerified !== true ||
      typeof identity.email !== "string"
    )
      return null;
    let email: string;
    try {
      email = canonicalEmail(identity.email);
    } catch {
      return null;
    }
    await ctx.db.patch(user._id, { welcomeEmailAttemptedAt: Date.now() });
    return { userId: user._id, email, name: user.name };
  },
});
