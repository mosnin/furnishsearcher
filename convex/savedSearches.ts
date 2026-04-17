import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";

export const save = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    location: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    maxPrice: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    propertyType: v.optional(v.string()),
    petFriendly: v.optional(v.boolean()),
    emailAlerts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller._id !== args.userId) throw new Error("Not authorized");

    return await ctx.db.insert("savedSearches", {
      userId: args.userId,
      name: args.name,
      location: args.location,
      city: args.city,
      state: args.state,
      maxPrice: args.maxPrice,
      bedrooms: args.bedrooms,
      propertyType: args.propertyType,
      petFriendly: args.petFriendly,
      emailAlerts: args.emailAlerts ?? false,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("savedSearches") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error(`Saved search ${args.id} not found`);

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller.role !== "admin" && caller._id !== existing.userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.id);
  },
});

export const toggleEmailAlerts = mutation({
  args: { id: v.id("savedSearches"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error(`Saved search ${args.id} not found`);

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || (caller.role !== "admin" && caller._id !== existing.userId)) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.id, { emailAlerts: args.enabled });
  },
});

export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("savedSearches")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return results.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Internal: returns saved searches with email alerts enabled that match a city/state
export const getAlertMatchesInternal = internalQuery({
  args: {
    city: v.string(),
    state: v.string(),
    price: v.number(),
    bedrooms: v.number(),
    petFriendly: v.boolean(),
    propertyType: v.string(),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("savedSearches").collect();
    const cityLower = args.city.toLowerCase();
    const stateLower = args.state.toLowerCase();

    const matches = all.filter((s) => {
      if (!s.emailAlerts) return false;
      // Exact city match (case-insensitive) — listing city must equal saved search city
      if (s.city && cityLower !== s.city.toLowerCase()) return false;
      if (s.state && s.state.toLowerCase() !== stateLower) return false;
      if (s.maxPrice !== undefined && args.price > s.maxPrice) return false;
      if (s.bedrooms !== undefined && args.bedrooms < s.bedrooms) return false;
      if (s.petFriendly !== undefined && s.petFriendly && !args.petFriendly) return false;
      if (
        s.propertyType &&
        s.propertyType.toLowerCase() !== args.propertyType.toLowerCase()
      )
        return false;
      return true;
    });

    // Enrich with user email
    const enriched = await Promise.all(
      matches.map(async (s) => {
        const user = await ctx.db.get(s.userId);
        return user ? { ...s, userEmail: user.email, userName: user.name } : null;
      })
    );

    return enriched.filter(Boolean) as Array<
      typeof matches[number] & { userEmail: string; userName: string }
    >;
  },
});
