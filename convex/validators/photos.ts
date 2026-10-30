import { v } from "convex/values";
export const photoAsset = v.object({
  storageId: v.optional(v.id("_storage")),
  legacyUrl: v.optional(v.string()),
  caption: v.string(),
});
