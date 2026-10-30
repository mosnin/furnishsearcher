import { v } from "convex/values";
export const imageKind = v.union(v.literal("profile"), v.literal("pet"));
export const imageUploadArgs = {
  kind: imageKind,
  requestId: v.string(),
  expectedRevision: v.number(),
  bytes: v.number(),
  contentType: v.string(),
  digest: v.string(),
};
