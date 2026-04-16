import { v } from "convex/values";
import { mutation, query } from "convex/server";

/**
 * Upserts a user by clerkId. If the user already exists, their name, email,
 * and avatar are refreshed from Clerk (they may have changed). Returns the
 * full user document.
 */
export const getOrCreate = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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

/**
 * Looks up a user by their Clerk ID. Returns null if not found.
 */
export const getByClerkId = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

/**
 * Updates the role of a user. Only admins should call this in practice —
 * enforce that in application-level auth middleware.
 */
export const updateRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("tenant"), v.literal("landlord"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error(`User ${args.userId} not found`);
    }
    await ctx.db.patch(args.userId, { role: args.role });
    return await ctx.db.get(args.userId);
  },
});

/**
 * Returns a user by their Convex ID, or null if not found.
 */
export const getById = query({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Updates optional profile fields for a user. Patches only provided fields.
 * Returns the updated user document.
 */
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
    const { userId, ...fields } = args;
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    // Only patch fields that were explicitly passed (not undefined)
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    await ctx.db.patch(userId, patch);
    return await ctx.db.get(userId);
  },
});

/**
 * Returns all users sorted by createdAt descending.
 * Intended for admin dashboards only.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    users.sort((a, b) => b.createdAt - a.createdAt);
    return users;
  },
});

/**
 * Returns public profile information for a user — safe to expose to other users.
 * Does NOT include email or phone.
 */
export const getPublicProfile = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      displayName: user.displayName,
      avatar: user.avatar,
      profilePhoto: user.profilePhoto,
      city: user.city,
      state: user.state,
      occupation: user.occupation,
      bio: user.bio,
      linkedinVerified: user.linkedinVerified,
      role: user.role,
      createdAt: user.createdAt,
    };
  },
});
