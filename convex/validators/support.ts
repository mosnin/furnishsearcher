import { v } from "convex/values";
export const caseStatus = v.union(
  v.literal("open"),
  v.literal("reviewing"),
  v.literal("resolved"),
  v.literal("dismissed"),
);
export const deliveryStatus = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("unconfigured"),
);
export const caseFields = {
  userId: v.optional(v.id("users")),
  name: v.string(),
  email: v.string(),
  kind: v.union(
    v.literal("support"),
    v.literal("listing_report"),
    v.literal("message_report"),
  ),
  subject: v.string(),
  body: v.string(),
  category: v.optional(v.string()),
  listingId: v.optional(v.id("listings")),
  messageId: v.optional(v.id("messages")),
  // Snapshots survive changes/deletion of the reported source. Staff access only.
  evidence: v.optional(v.string()),
  reportedUserId: v.optional(v.id("users")),
  status: caseStatus,
  createdAt: v.number(),
  updatedAt: v.number(),
  notificationStatus: deliveryStatus,
};
export const replyFields = {
  caseId: v.id("supportCases"),
  authorId: v.id("users"),
  staff: v.boolean(),
  internal: v.boolean(),
  body: v.string(),
  createdAt: v.number(),
  emailStatus: v.optional(deliveryStatus),
};
export const auditFields = {
  caseId: v.id("supportCases"),
  actorId: v.id("users"),
  action: v.string(),
  note: v.string(),
  createdAt: v.number(),
};
