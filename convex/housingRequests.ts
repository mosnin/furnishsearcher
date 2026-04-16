import { v } from "convex/values";
import { mutation, query } from "convex/server";

/**
 * Creates a new housing request for a tenant. Returns the new request's ID.
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    city: v.string(),
    state: v.string(),
    moveInDate: v.number(),
    duration: v.number(),
    maxBudget: v.number(),
    bedrooms: v.number(),
    petFriendly: v.boolean(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error(`User ${args.userId} not found`);
    }

    const id = await ctx.db.insert("housingRequests", {
      userId: args.userId,
      city: args.city,
      state: args.state,
      moveInDate: args.moveInDate,
      duration: args.duration,
      maxBudget: args.maxBudget,
      bedrooms: args.bedrooms,
      petFriendly: args.petFriendly,
      description: args.description,
      status: "open",
      createdAt: Date.now(),
    });

    return id;
  },
});

/**
 * Returns all housing requests for a specific user, sorted newest first.
 */
export const getByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("housingRequests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    requests.sort((a, b) => b.createdAt - a.createdAt);

    return requests;
  },
});

/**
 * Returns all open housing requests, sorted newest first.
 * Intended for landlords browsing tenant requests.
 */
export const getOpen = query({
  args: {},
  handler: async (ctx) => {
    const requests = await ctx.db
      .query("housingRequests")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    requests.sort((a, b) => b.createdAt - a.createdAt);

    return requests;
  },
});

/**
 * Sets a housing request's status to "closed".
 */
export const close = mutation({
  args: {
    id: v.id("housingRequests"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) {
      throw new Error(`Housing request ${args.id} not found`);
    }
    await ctx.db.patch(args.id, { status: "closed" });
  },
});
