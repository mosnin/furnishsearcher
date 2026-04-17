import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller._id !== args.userId) throw new Error("Not authorized");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error(`User ${args.userId} not found`);

    return await ctx.db.insert("housingRequests", {
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
  },
});

export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || (caller.role !== "admin" && caller._id !== args.userId)) return [];

    const requests = await ctx.db
      .query("housingRequests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    requests.sort((a, b) => b.createdAt - a.createdAt);
    return requests;
  },
});

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

export const close = mutation({
  args: { id: v.id("housingRequests") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const request = await ctx.db.get(args.id);
    if (!request) throw new Error(`Housing request ${args.id} not found`);

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller.role !== "admin" && caller._id !== request.userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.id, { status: "closed" });
  },
});
