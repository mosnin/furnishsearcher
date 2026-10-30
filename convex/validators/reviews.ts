import { v } from "convex/values";
export const reviewStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("removed"),
);
export const reviewKind = v.union(v.literal("property"), v.literal("traveler"));
export const reviewInput = {
  title: v.string(),
  rating: v.number(),
  comment: v.string(),
  phone: v.string(),
  stayStart: v.number(),
  stayEnd: v.number(),
  experienceConfirmed: v.boolean(),
  bookingId: v.optional(v.id("bookingInquiries")),
  stayEvidence: v.optional(v.string()),
};
export const publicReview = v.object({
  _id: v.id("reviews"),
  rating: v.number(),
  title: v.string(),
  comment: v.string(),
  reviewerName: v.string(),
  reviewerAvatar: v.union(v.string(), v.null()),
  createdAt: v.number(),
  response: v.optional(v.object({ body: v.string(), createdAt: v.number() })),
});
export const pageMetadata = {
  continueCursor: v.string(),
  isDone: v.boolean(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(
      v.literal("SplitRecommended"),
      v.literal("SplitRequired"),
      v.null(),
    ),
  ),
};
export const reviewPage = v.object({
  page: v.array(publicReview),
  ...pageMetadata,
});
