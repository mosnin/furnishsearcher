import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function deriveCode(userId: string): string {
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) + hash) ^ userId.charCodeAt(i);
    hash = hash >>> 0;
  }
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  let h = hash;
  for (let i = 0; i < 7; i++) {
    code += chars[h % chars.length];
    h = Math.floor(h / chars.length) || (h * 37 + i + 1);
  }
  return code;
}

export const getOrCreateCode = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller._id !== args.userId) throw new Error("Not authorized");

    if (caller.referralCode) return caller.referralCode;

    const code = deriveCode(args.userId);
    await ctx.db.patch(args.userId, { referralCode: code });

    // Create a record so we can query by code
    await ctx.db.insert("referrals", {
      referrerId: args.userId,
      referralCode: code,
      status: "code_created",
      createdAt: Date.now(),
    });

    return code;
  },
});

export const applyReferralCode = mutation({
  args: {
    code: v.string(),
    newUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const referrer = await ctx.db
      .query("users")
      .withIndex("by_referral_code", (q) => q.eq("referralCode", args.code))
      .first();

    if (!referrer) throw new Error("Invalid referral code");
    if (referrer._id === args.newUserId) {
      throw new Error("You cannot use your own referral code");
    }

    // Check not already referred
    const alreadyReferred = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user", (q) => q.eq("referredUserId", args.newUserId))
      .first();
    if (alreadyReferred) return;

    await ctx.db.insert("referrals", {
      referrerId: referrer._id,
      referralCode: args.code,
      referredUserId: args.newUserId,
      status: "signed_up",
      createdAt: Date.now(),
    });
  },
});

export const getReferralStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller._id !== args.userId) return null;

    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", args.userId))
      .collect();

    const signedUp = referrals.filter(
      (r) => r.status === "signed_up" || r.status === "converted"
    );
    const converted = referrals.filter((r) => r.status === "converted");

    return {
      code: caller.referralCode ?? null,
      totalReferrals: signedUp.length,
      converted: converted.length,
      referrals: referrals.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});
