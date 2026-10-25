import { v } from "convex/values";
export const messageOrigin = v.union(
  v.literal("inbox"),
  v.literal("property"),
  v.literal("housing_request"),
);
export const messageEmailStatus = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("unconfigured"),
  v.literal("suppressed"),
);
export const messageFields = {
  requestBindingVersion: v.optional(v.literal(2)),
  rentalInquiryId: v.optional(v.id("bookingInquiries")),
  conversationId: v.string(),
  conversationDocId: v.optional(v.id("conversations")),
  senderId: v.id("users"),
  receiverId: v.id("users"),
  listingId: v.id("listings"),
  content: v.string(),
  read: v.boolean(),
  readAt: v.optional(v.number()),
  createdAt: v.number(),
  origin: v.optional(messageOrigin),
  clientRequestId: v.optional(v.string()),
  emailStatus: v.optional(messageEmailStatus),
};
export const messageDoc = v.object({
  ...messageFields,
  _id: v.id("messages"),
  _creationTime: v.number(),
});
export const conversationFields = {
  termsAtStart: v.optional(
    v.object({
      title: v.string(),
      city: v.string(),
      state: v.string(),
      monthlyRateCents: v.union(v.number(), v.null()),
      currency: v.literal("USD"),
      capturedAt: v.number(),
    }),
  ),
  listingId: v.id("listings"),
  tenantId: v.id("users"),
  landlordId: v.id("users"),
  lastMessage: v.string(),
  lastMessageAt: v.number(),
  tenantRead: v.boolean(),
  landlordRead: v.boolean(),
  tenantArchived: v.optional(v.boolean()),
  landlordArchived: v.optional(v.boolean()),
  tenantReadGeneration: v.optional(v.number()),
  landlordReadGeneration: v.optional(v.number()),
  key: v.optional(v.string()),
};
export const conversationSummary = v.object({
  ...conversationFields,
  _id: v.id("conversations"),
  _creationTime: v.number(),
  blockedByMe: v.boolean(),
  cannotMessage: v.boolean(),
  archived: v.boolean(),
  listing: v.union(
    v.null(),
    v.object({
      _id: v.id("listings"),
      title: v.string(),
      photos: v.array(v.string()),
    }),
  ),
  otherUser: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.string(),
      avatar: v.optional(v.string()),
    }),
  ),
});
export const templateFields = {
  userId: v.id("users"),
  name: v.string(),
  normalizedName: v.string(),
  body: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const templateDoc = v.object({
  ...templateFields,
  _id: v.id("messageTemplates"),
  _creationTime: v.number(),
});
