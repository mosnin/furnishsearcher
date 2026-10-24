import { v } from "convex/values";
export const identityStatus=v.union(v.literal("creating"),v.literal("pending"),v.literal("passed"),v.literal("rejected"),v.literal("review"),v.literal("failed"));
