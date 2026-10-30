import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { imageFields, profileImage, retireImage } from "./lib/profileImages";
import { imageKind, imageUploadArgs } from "./validators/profileImages";
import { PHOTO_TYPES } from "../lib/photos";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
function validateRequest(requestId: string, revision: number) {
  if (
    !/^[a-zA-Z0-9-]{16,80}$/.test(requestId) ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    revision >= Number.MAX_SAFE_INTEGER
  )
    throw new Error("Refresh this profile photo editor and try again.");
}
async function allowance(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
  const recent = await ctx.db
    .query("profileImageUploads")
    .withIndex("by_owner_time", (q) =>
      q.eq("ownerId", user._id).gte("createdAt", Date.now() - 3600000),
    )
    .take(25);
  if (recent.length >= 24)
    throw new Error(
      "Profile photo upload limit reached. Try again in an hour.",
    );
}
const view = v.object({
  url: v.union(v.string(), v.null()),
  revision: v.number(),
});
export const mine = query({
  args: {},
  returns: v.object({ profile: view, pet: view }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return {
      profile: {
        url: await profileImage(ctx, user, "profile"),
        revision: user.profilePhotoRevision ?? 0,
      },
      pet: {
        url: await profileImage(ctx, user, "pet"),
        revision: user.petPhotoRevision ?? 0,
      },
    };
  },
});
export const prepare = internalMutation({
  args: {
    kind: imageKind,
    requestId: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    validateRequest(args.requestId, args.expectedRevision);
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("profileImageUploads")
      .withIndex("by_owner_request", (q) =>
        q.eq("ownerId", user._id).eq("requestId", args.requestId),
      )
      .unique();
    if (existing) return null;
    if ((user[imageFields(args.kind).revision] ?? 0) !== args.expectedRevision)
      throw new Error("This photo changed elsewhere. Refresh and try again.");
    await allowance(ctx, user);
    return null;
  },
});
export const commit = internalMutation({
  args: { ...imageUploadArgs, storageId: v.id("_storage") },
  returns: v.object({
    ...view.fields,
    keepStorage: v.boolean(),
    applied: v.boolean(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    validateRequest(args.requestId, args.expectedRevision);
    const user = await requireUser(ctx),
      f = imageFields(args.kind);
    if (
      !PHOTO_TYPES.includes(args.contentType) ||
      !Number.isSafeInteger(args.bytes) ||
      args.bytes < 1 ||
      args.bytes >= MAX_PROFILE_IMAGE_BYTES ||
      !/^[a-f0-9]{64}$/.test(args.digest)
    )
      throw new Error("Use a JPEG, PNG or WebP photo smaller than 5 MB.");
    const prior = await ctx.db
      .query("profileImageUploads")
      .withIndex("by_owner_request", (q) =>
        q.eq("ownerId", user._id).eq("requestId", args.requestId),
      )
      .unique();
    if (prior) {
      if (
        prior.kind !== args.kind ||
        prior.expectedRevision !== args.expectedRevision ||
        prior.bytes !== args.bytes ||
        prior.contentType !== args.contentType ||
        prior.digest !== args.digest
      )
        throw new Error(
          "This upload reference already belongs to another photo.",
        );
      return {
        url: await profileImage(ctx, user, args.kind),
        revision: user[f.revision] ?? 0,
        keepStorage: prior.storageId === args.storageId,
        duplicate: true,
        applied:
          user[f.id] === prior.storageId && prior.storageId !== undefined,
      };
    }
    if ((user[f.revision] ?? 0) !== args.expectedRevision)
      throw new Error("This photo changed elsewhere. Refresh and try again.");
    await allowance(ctx, user);
    const meta = await ctx.db.system.get(args.storageId);
    if (
      !meta ||
      meta.size !== args.bytes ||
      meta.contentType !== args.contentType
    )
      throw new Error("The uploaded photo could not be confirmed.");
    const other = await ctx.db
      .query("profileImageUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    const listingPhoto = await ctx.db
      .query("photoUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (other || listingPhoto)
      throw new Error("This storage object already belongs to another upload.");
    const revision = args.expectedRevision + 1;
    await retireImage(ctx, user, args.kind);
    await ctx.db.insert("profileImageUploads", {
      ownerId: user._id,
      ...args,
      revision,
      createdAt: Date.now(),
    });
    await ctx.db.patch(user._id, {
      [f.id]: args.storageId,
      [f.legacy]: undefined,
      [f.removed]: false,
      [f.revision]: revision,
    });
    return {
      url: await ctx.storage.getUrl(args.storageId),
      revision,
      keepStorage: true,
      applied: true,
      duplicate: false,
    };
  },
});
export const remove = mutation({
  args: { kind: imageKind, expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.expectedRevision) ||
      args.expectedRevision < 0
    )
      throw new Error("Refresh this editor.");
    const user = await requireUser(ctx),
      f = imageFields(args.kind),
      current = user[f.revision] ?? 0;
    if (current === args.expectedRevision + 1 && user[f.removed]) return null;
    if (current !== args.expectedRevision)
      throw new Error("This photo changed elsewhere. Refresh and try again.");
    await retireImage(ctx, user, args.kind);
    await ctx.db.patch(user._id, {
      [f.id]: undefined,
      [f.legacy]: undefined,
      [f.removed]: true,
      [f.revision]: current + 1,
    });
    return null;
  },
});
export const discardUncommitted = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const registered = await ctx.db
      .query("profileImageUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    const listingPhoto = await ctx.db
      .query("photoUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    const meta = await ctx.db.system.get(args.storageId);
    if (
      !registered &&
      !listingPhoto &&
      meta &&
      PHOTO_TYPES.includes(meta.contentType ?? "") &&
      meta.size < MAX_PROFILE_IMAGE_BYTES
    )
      await ctx.storage.delete(args.storageId);
    return null;
  },
});
export const cleanupReceipts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("profileImageUploads")
      .withIndex("by_retired", (q) =>
        q.gt("retiredAt", 0).lt("retiredAt", Date.now() - 7 * 86400000),
      )
      .take(50);
    let deleted = 0;
    for (const row of rows) {
      if (!row.storageId) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    if (deleted === 50)
      await ctx.scheduler.runAfter(
        0,
        internal.profileImages.cleanupReceipts,
        {},
      );
    return deleted;
  },
});
