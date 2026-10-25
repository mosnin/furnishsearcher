import { assertProviderContact } from "./lib/providerContacts";
import type { MutationCtx } from "./_generated/server";
import { billingMode } from "../lib/billing";
import { identityPassed } from "./lib/publication";
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  canonicalPhone,
  PHONE_PROOF_LIFETIME,
} from "../lib/contact-verification";
import { currentPhoneProof, contactMode } from "./lib/contacts";
import { requireUser } from "./lib/auth";
import { queueNameSync } from "./lib/inbox";
import { profileView } from "./lib/profileImages";
import { canReadTraveler } from "./lib/reviews";

export const getOrCreate = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== args.clerkId)
      throw new Error("Not authorized");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        avatar: args.avatar,
      });
      if (args.name !== existing.name) await queueNameSync(ctx, existing._id);
      return await ctx.db.get(existing._id);
    }

    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      name: args.name,
      email: args.email,
      avatar: args.avatar,
      role: "tenant",
      createdAt: Date.now(),
    });

    return await ctx.db.get(userId);
  },
});

export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== args.clerkId) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    return user
      ? {
          ...(await profileView(ctx, user)),
          phoneVerified: currentPhoneProof(user),
        }
      : null;
  },
});

export const updateRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("tenant"),
      v.literal("landlord"),
      v.literal("admin"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (
      !caller ||
      (caller.role !== "admin" &&
        (caller._id !== args.userId || args.role === "admin"))
    ) {
      throw new Error("Not authorized to change this role");
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error(`User ${args.userId} not found`);

    await ctx.db.patch(args.userId, { role: args.role });
    return await ctx.db.get(args.userId);
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || (caller._id !== args.id && caller.role !== "admin"))
      return null;
    const found = await ctx.db.get(args.id);
    return found ? profileView(ctx, found) : null;
  },
});

export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    hometown: v.optional(v.string()),
    occupation: v.optional(v.string()),
    company: v.optional(v.string()),
    bio: v.optional(v.string()),
    petInfo: v.optional(v.string()),
    petPhoto: v.optional(v.string()),
    linkedinVerified: v.optional(v.boolean()),
    profilePhoto: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");

    // Only allow editing own profile (admins can edit any)
    if (caller.role !== "admin" && caller._id !== args.userId) {
      throw new Error("Not authorized to edit this profile");
    }

    if (args.linkedinVerified === true)
      throw new Error(
        "A LinkedIn badge requires a verified provider connection.",
      );
    const { userId, ...fields } = args;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    if (
      (args.profilePhoto !== undefined &&
        args.profilePhoto !== user.profilePhoto) ||
      (args.petPhoto !== undefined && args.petPhoto !== user.petPhoto)
    )
      throw new Error(
        "Use the profile photo editor to upload, replace or remove photos.",
      );
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    if (args.phone !== undefined) {
      const phone = args.phone.trim() ? canonicalPhone(args.phone) : "";
      patch.phone = phone;
      if (phone !== user.phone) {
        patch.listingPhoneConsent = undefined;
        patch.phoneVerified = false;
        patch.phoneVerificationSource = undefined;
        patch.phoneVerificationMode = undefined;
        patch.phoneVerifiedAt = undefined;
        patch.phoneVerificationExpiresAt = undefined;
        patch.phoneRevision = (user.phoneRevision ?? 0) + 1;
        patch.phoneProofAfter = Math.floor(Date.now() / 1000) + 1;
      }
    }
    await ctx.db.patch(userId, patch);
    if (args.displayName !== undefined && args.displayName !== user.displayName)
      await queueNameSync(ctx, userId);
    return await ctx.db.get(userId);
  },
});

export const confirmPhone = mutation({
  args: { phone: v.string() },
  returns: v.object({ phone: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) =>
    confirmPhoneProof(ctx, args.phone, (await ctx.auth.getUserIdentity())?.iat),
});

export const confirmPhoneFromHttp = internalMutation({
  args: { phone: v.string(), clerkId: v.string(), issuedAt: v.number() },
  returns: v.object({ phone: v.string(), expiresAt: v.number() }),
  handler: (ctx, args) =>
    confirmPhoneProof(ctx, args.phone, args.issuedAt, args.clerkId),
});
async function confirmPhoneProof(
  ctx: MutationCtx,
  number: string,
  issued: unknown,
  clerkId?: string,
) {
  const user = await requireUser(ctx),
    identity = (await ctx.auth.getUserIdentity())!;
  if (clerkId !== undefined && user.clerkId !== clerkId)
    throw new Error("Your account changed. Reload and try again.");
  const phone = canonicalPhone(number),
    now = Date.now();
  if (
    identity.phoneNumberVerified !== true ||
    identity.phoneNumber !== phone ||
    typeof issued !== "number" ||
    !Number.isFinite(issued) ||
    issued * 1000 > now ||
    issued * 1000 < now - 120000 ||
    issued < (user.phoneProofAfter ?? 0)
  )
    throw new Error(
      "Your sign-in account has not confirmed this number. Verify it and refresh your account confirmation. Contact support if confirmation is unavailable.",
    );
  const mode = contactMode();
  if (
    mode === "prod" &&
    new URL(identity.issuer).hostname.endsWith(".clerk.accounts.dev")
  )
    throw new Error(
      "Development sign-in accounts cannot establish production phone confirmation.",
    );
  await assertProviderContact(
    ctx,
    user.clerkId,
    mode,
    "phone",
    phone,
    issued as number,
  );
  const expiresAt = now + PHONE_PROOF_LIFETIME;
  await ctx.db.patch(user._id, {
    phone,
    phoneVerified: true,
    phoneVerificationSource: "clerk",
    phoneVerificationMode: mode,
    phoneVerifiedAt: now,
    phoneVerificationExpiresAt: expiresAt,
    phoneRevision: (user.phoneRevision ?? 0) + (user.phone === phone ? 0 : 1),
  });
  await ctx.scheduler.runAt(expiresAt, internal.users.expirePhone, {
    userId: user._id,
    expiresAt,
  });
  return { phone, expiresAt };
}

export const expirePhone = internalMutation({
  args: { userId: v.id("users"), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (
      user &&
      user.phoneVerificationExpiresAt === args.expiresAt &&
      Date.now() >= args.expiresAt
    )
      await ctx.db.patch(user._id, { phoneVerified: false });
    return null;
  },
});

export const revokePhone = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      listingPhoneConsent: undefined,
      phoneVerified: false,
      phoneVerificationSource: undefined,
      phoneVerificationMode: undefined,
      phoneVerifiedAt: undefined,
      phoneVerificationExpiresAt: undefined,
      phoneRevision: (user.phoneRevision ?? 0) + 1,
      phoneProofAfter: Math.floor(Date.now() / 1000) + 1,
    });
    return null;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller.role !== "admin") return [];

    const users = await ctx.db.query("users").collect();
    users.sort((a, b) => b.createdAt - a.createdAt);
    return users;
  },
});

export const getPublicProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    if (user.role !== "landlord" && !(await canReadTraveler(ctx, user._id)))
      return null;
    const visible = await profileView(ctx, user);
    const identityVerified = await identityPassed(ctx, user);
    return {
      _id: user._id,
      name: user.name,
      displayName: user.displayName,
      avatar: visible.avatar,
      profilePhoto: visible.profilePhoto,
      petInfo: user.petInfo,
      petPhoto: visible.petPhoto,
      city: user.city,
      state: user.state,
      occupation: user.occupation,
      bio: user.bio,
      linkedinVerified: false,
      identityVerified,
      identityTestMode: identityVerified ? billingMode() === "test" : false,
      createdAt: user.createdAt,
    };
  },
});
