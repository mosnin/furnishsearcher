import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  PHOTO_RECOVERY_MS,
  PHOTO_REFERENCE_MIGRATION,
  syncPhotoReferences,
  photoUrlKey,
} from "./lib/photoRetention";

// One bounded transaction at a time. The migration must finish before deletion.
export const maintenance = internalMutation({
  args: {},
  returns: v.object({
    ready: v.boolean(),
    adopted: v.number(),
    deleted: v.number(),
  }),
  handler: async (ctx) => {
    // Build exact native-URL lookup before resolving old URL-only galleries.
    const unkeyed = await ctx.db
      .query("photoUploads")
      .withIndex("by_url_key", (q) => q.eq("urlKey", undefined))
      .take(25);
    if (unkeyed.length) {
      for (const row of unkeyed) {
        const url = await ctx.storage.getUrl(row.storageId);
        await ctx.db.patch(row._id, {
          urlKey: url ? await photoUrlKey(url) : `missing:${row.storageId}`,
        });
      }
      await ctx.scheduler.runAfter(0, internal.photoRetention.maintenance, {});
      return { ready: false, adopted: 0, deleted: 0 };
    }
    let migration = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", PHOTO_REFERENCE_MIGRATION))
      .unique();
    if (!migration) {
      const id = await ctx.db.insert("dataMigrations", {
        name: PHOTO_REFERENCE_MIGRATION,
        cursor: null,
        complete: false,
      });
      migration = (await ctx.db.get(id))!;
    }
    if (!migration.complete) {
      const page = await ctx.db
        .query("listings")
        .paginate({ cursor: migration.cursor, numItems: 25 });
      for (const listing of page.page) await syncPhotoReferences(ctx, listing);
      await ctx.db.patch(migration._id, {
        cursor: page.isDone ? null : page.continueCursor,
        complete: page.isDone,
      });
      await ctx.scheduler.runAfter(0, internal.photoRetention.maintenance, {});
      return { ready: false, adopted: 0, deleted: 0 };
    }
    // Upgraded uploads receive a NEW recovery period, never an immediate purge.
    const legacy = await ctx.db
      .query("photoUploads")
      .withIndex("by_cleanup_version", (q) => q.eq("cleanupVersion", undefined))
      .take(25);
    for (const upload of legacy) {
      const referenced = await ctx.db
        .query("listingPhotoReferences")
        .withIndex("by_storage", (q) => q.eq("storageId", upload.storageId))
        .first();
      await ctx.db.patch(upload._id, {
        cleanupVersion: 1,
        expiresAt: referenced ? undefined : Date.now() + PHOTO_RECOVERY_MS,
      });
    }
    const due = await ctx.db
      .query("photoUploads")
      .withIndex("by_expiry", (q) =>
        q.gt("expiresAt", 0).lte("expiresAt", Date.now()),
      )
      .take(25);
    let deleted = 0;
    for (const upload of due) {
      if (upload.cleanupVersion !== 1) continue;
      const [reference, profile] = await Promise.all([
        ctx.db
          .query("listingPhotoReferences")
          .withIndex("by_storage", (q) => q.eq("storageId", upload.storageId))
          .first(),
        ctx.db
          .query("profileImageUploads")
          .withIndex("by_storage", (q) => q.eq("storageId", upload.storageId))
          .first(),
      ]);
      // Revalidate in the SAME mutation as deletion; attaching concurrently is serialized.
      if (reference || profile) {
        await ctx.db.patch(upload._id, { expiresAt: undefined });
        continue;
      }
      if (await ctx.db.system.get(upload.storageId))
        await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
      deleted++;
    }
    if (legacy.length === 25 || due.length === 25)
      await ctx.scheduler.runAfter(0, internal.photoRetention.maintenance, {});
    return { ready: true, adopted: legacy.length, deleted };
  },
});
