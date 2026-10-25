import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { currentPhoneProof } from "./lib/contacts";
import { publiclyVisible } from "./lib/publication";
import { recordPerformance } from "./lib/performance";
import { blockState } from "./lib/messageAccess";
const DAY = 86400000;
function enabled(owner: Doc<"users">) {
  const consent = owner.listingPhoneConsent;
  return (
    owner.role === "landlord" &&
    !!consent &&
    currentPhoneProof(owner) &&
    consent.revision === (owner.phoneRevision ?? 0) &&
    consent.expiresAt > Date.now() &&
    consent.expiresAt <= owner.phoneVerificationExpiresAt!
  );
}
export const settings = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    canEnable: v.boolean(),
    expiresAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const owner = await requireUser(ctx);
    return {
      enabled: enabled(owner),
      canEnable: owner.role === "landlord" && currentPhoneProof(owner),
      expiresAt: enabled(owner) ? owner.listingPhoneConsent!.expiresAt : null,
    };
  },
});
export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireUser(ctx);
    if (!args.enabled) {
      await ctx.db.patch(owner._id, { listingPhoneConsent: undefined });
      return null;
    }
    if (owner.role !== "landlord" || !currentPhoneProof(owner))
      throw new Error(
        "Confirm your saved phone number before enabling listing calls.",
      );
    const consent = {
      revision: owner.phoneRevision ?? 0,
      expiresAt: owner.phoneVerificationExpiresAt!,
    };
    await ctx.db.patch(owner._id, { listingPhoneConsent: consent });
    await ctx.scheduler.runAt(
      consent.expiresAt,
      internal.phoneContacts.expireConsent,
      { userId: owner._id, ...consent },
    );
    return null;
  },
});
export const expireConsent = internalMutation({
  args: { userId: v.id("users"), revision: v.number(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.userId),
      consent = owner?.listingPhoneConsent;
    if (
      consent?.revision === args.revision &&
      consent.expiresAt === args.expiresAt &&
      args.expiresAt <= Date.now()
    )
      await ctx.db.patch(args.userId, { listingPhoneConsent: undefined });
    return null;
  },
});
export const availability = query({
  args: { listingId: v.id("listings") },
  returns: v.object({
    status: v.union(
      v.literal("unavailable"),
      v.literal("sign-in"),
      v.literal("available"),
    ),
    revision: v.union(v.number(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const unavailable = {
      status: "unavailable" as const,
      revision: null,
      expiresAt: null,
    };
    const listing = await ctx.db.get(args.listingId);
    if (!listing || !(await publiclyVisible(ctx, listing))) return unavailable;
    const owner = await ctx.db.get(listing.landlordId);
    if (!owner || !enabled(owner)) return unavailable;
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      return { status: "sign-in" as const, revision: null, expiresAt: null };
    const viewer = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!viewer) return unavailable;
    if (
      viewer._id === owner._id ||
      (await blockState(ctx, viewer._id, owner._id)).cannotMessage
    )
      return unavailable;
    return {
      status: "available" as const,
      revision: owner.phoneRevision ?? 0,
      expiresAt: owner.listingPhoneConsent!.expiresAt,
    };
  },
});
export const reveal = mutation({
  args: { listingId: v.id("listings") },
  returns: v.object({
    phone: v.string(),
    revision: v.number(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx),
      listing = await ctx.db.get(args.listingId);
    if (!listing || !(await publiclyVisible(ctx, listing)))
      throw new Error("Phone contact is unavailable for this listing.");
    const owner = await ctx.db.get(listing.landlordId);
    if (
      !owner ||
      !enabled(owner) ||
      owner._id === viewer._id ||
      (await blockState(ctx, viewer._id, owner._id)).cannotMessage
    )
      throw new Error("Phone contact is unavailable for this listing.");
    const day = Math.floor(Date.now() / DAY) * DAY;
    const limit = await ctx.db
      .query("listingPhoneLimits")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", viewer._id).eq("day", day),
      )
      .unique();
    const ids = limit?.listingIds ?? [];
    if (!ids.includes(listing._id)) {
      if (ids.length >= 20)
        throw new Error(
          "You have reached today's phone-contact limit. You can still use listing messages.",
        );
      if (limit)
        await ctx.db.patch(limit._id, { listingIds: [...ids, listing._id] });
      else
        await ctx.db.insert("listingPhoneLimits", {
          userId: viewer._id,
          day,
          listingIds: [listing._id],
        });
      if (viewer.role !== "admin")
        await recordPerformance(ctx, listing, "phoneReveals");
    }
    return {
      phone: owner.phone!,
      revision: owner.phoneRevision ?? 0,
      expiresAt: owner.listingPhoneConsent!.expiresAt,
    };
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Math.floor(Date.now() / DAY) * DAY - 2 * DAY;
    const rows = await ctx.db
      .query("listingPhoneLimits")
      .withIndex("by_day", (q) => q.lt("day", cutoff))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.phoneContacts.cleanup, {});
    return null;
  },
});
