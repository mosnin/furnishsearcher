import { v } from "convex/values";
import { mutation, query } from "convex/server";

/**
 * Creates a new review. Validates that rating is between 1 and 5.
 * Returns the new review's ID.
 */
export const create = mutation({
  args: {
    listingId: v.id("listings"),
    landlordId: v.id("users"),
    reviewerId: v.id("users"),
    rating: v.number(),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating)) {
      throw new Error("Rating must be a whole number between 1 and 5.");
    }

    const reviewId = await ctx.db.insert("reviews", {
      listingId: args.listingId,
      landlordId: args.landlordId,
      reviewerId: args.reviewerId,
      rating: args.rating,
      comment: args.comment,
      createdAt: Date.now(),
    });

    return reviewId;
  },
});

/**
 * Returns all reviews for a landlord, sorted newest-first, joined with
 * the reviewer's name and avatar.
 */
export const getByLandlord = query({
  args: {
    landlordId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();

    reviews.sort((a, b) => b.createdAt - a.createdAt);

    const enriched = await Promise.all(
      reviews.map(async (review) => {
        const reviewer = await ctx.db.get(review.reviewerId);
        return {
          ...review,
          reviewerName: reviewer?.name ?? "Anonymous",
          reviewerAvatar: reviewer?.avatar ?? null,
        };
      })
    );

    return enriched;
  },
});

/**
 * Returns all reviews for a specific listing, sorted newest-first, joined
 * with the reviewer's name and avatar.
 */
export const getByListing = query({
  args: {
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .collect();

    reviews.sort((a, b) => b.createdAt - a.createdAt);

    const enriched = await Promise.all(
      reviews.map(async (review) => {
        const reviewer = await ctx.db.get(review.reviewerId);
        return {
          ...review,
          reviewerName: reviewer?.name ?? "Anonymous",
          reviewerAvatar: reviewer?.avatar ?? null,
        };
      })
    );

    return enriched;
  },
});

/**
 * Returns the average rating and total review count for a landlord.
 */
export const getAverageRating = query({
  args: {
    landlordId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();

    if (reviews.length === 0) {
      return { average: 0, count: 0 };
    }

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const average = Math.round((sum / reviews.length) * 10) / 10;

    return { average, count: reviews.length };
  },
});

/**
 * Returns all reviews submitted by a specific reviewer, sorted newest-first,
 * joined with the landlord and listing info.
 */
export const getByReviewer = query({
  args: {
    reviewerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_reviewer", (q) => q.eq("reviewerId", args.reviewerId))
      .collect();

    reviews.sort((a, b) => b.createdAt - a.createdAt);

    const enriched = await Promise.all(
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

    return enriched;
  },
});

/**
 * Returns true if the reviewer has already submitted a review for this listing.
 */
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

    // Returns true if the user CAN review (hasn't reviewed yet)
    return existing === null;
  },
});
