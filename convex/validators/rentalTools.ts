import { v } from "convex/values";
export const rentalTool = v.union(
  v.literal("screening"),
  v.literal("lease"),
  v.literal("rent_collection"),
);
export const toolStatus = v.union(
  v.literal("requested"),
  v.literal("received"),
  v.literal("owner_reported_complete"),
  v.literal("cancelled"),
);
export const toolFields = {
  inquiryId: v.id("bookingInquiries"),
  ownerId: v.id("users"),
  tenantId: v.id("users"),
  kind: rentalTool,
  status: toolStatus,
  note: v.string(),
  requestId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
};
