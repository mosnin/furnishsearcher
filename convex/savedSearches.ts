import { v } from "convex/values";
import { mutation, query } from "convex/server";

/**
 * Saves a new search for the given user. Returns the new document's ID.
 */
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
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error(`User ${args.userId} not found`);

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
      createdAt: Date.now(),
    });
  },
});

/**
 * Deletes a saved search by its ID.
 */
export const remove = mutation({
  args: {
    id: v.id("savedSearches"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error(`Saved search ${args.id} not found`);
    await ctx.db.delete(args.id);
  },
});

/**
 * Returns all saved searches for a user, sorted newest first.
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("savedSearches")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return results.sort((a, b) => b.createdAt - a.createdAt);
  },
});
