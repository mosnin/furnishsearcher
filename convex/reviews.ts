import { v } from "convex/values";
import { mutation, query } from "convex/server";

export const create = mutation({
  args: {
    listingId: v.id("listings"),
    landlordId: v.id("users"),
    reviewerId: v.id("users"),
    rating: v.number(),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller._id !== args.reviewerId) throw new Error("Not authorized");

    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating)) {
      throw new Error("Rating must be a whole number between 1 and 5.");
    }

    // Prevent self-reviews
    if (args.reviewerId === args.landlordId) {
      throw new Error("You cannot review your own listing.");
    }

    // Prevent duplicate reviews per listing
    const duplicate = await ctx.db
      .query("reviews")
      .withIndex("by_reviewer", (q) => q.eq("reviewerId", args.reviewerId))
      .filter((q) => q.eq(q.field("listingId"), args.listingId))
      .first();

    if (duplicate) {
      throw new Error("You have already reviewed this listing.");
    }

    return await ctx.db.insert("reviews", {
      listingId: args.listingId,
      landlordId: args.landlordId,
      reviewerId: args.reviewerId,
      rating: args.rating,
      comment: args.comment,
      createdAt: Date.now(),
    });
  },
});

export const getByLandlord = query({
  args: { landlordId: v.id("users") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();

    reviews.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      reviews.map(async (review) => {
        const reviewer = await ctx.db.get(review.reviewerId);
        return {
          ...review,
          reviewerName: reviewer?.name ?? "Anonymous",
          reviewerAvatar: reviewer?.avatar ?? null,
        };
      })
    );
  },
});

export const getByListing = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .collect();

    reviews.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      reviews.map(async (review) => {
        const reviewer = await ctx.db.get(review.reviewerId);
        return {
          ...review,
          reviewerName: reviewer?.name ?? "Anonymous",
          reviewerAvatar: reviewer?.avatar ?? null,
        };
      })
    );
  },
});

export const getAverageRating = query({
  args: { landlordId: v.id("users") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();

    if (reviews.length === 0) return { average: 0, count: 0 };

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const average = Math.round((sum / reviews.length) * 10) / 10;
    return { average, count: reviews.length };
  },
});

export const getByReviewer = query({
  args: { reviewerId: v.id("users") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_reviewer", (q) => q.eq("reviewerId", args.reviewerId))
      .collect();

    reviews.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      reviews.map(async (review) => {
        const landlord = await ctx.db.get(review.landlordId);
        const listing = await ctx.db.get(review.listingId);
        return {
          ...review,
          landlordName: landlord?.name ?? "Unknown Landlord",
          listingTitle: listing?.title ?? "Unknown Listing",
        };
      })
    );
  },
});

export const canReview = query({
  args: {
    reviewerId: v.id("users"),
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_reviewer", (q) => q.eq("reviewerId", args.reviewerId))
      .filter((q) => q.eq(q.field("listingId"), args.listingId))
      .first();
    return existing === null;
  },
});
