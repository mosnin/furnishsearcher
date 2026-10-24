import {
  mutation,
  internalQuery,
  internalMutation,
  httpAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";
import {
  MAX_PHOTO_BYTES,
  PHOTO_TYPES,
  validatePhotoBytes,
} from "../lib/photos";

// Retain the old export but stop issuing unbound upload capabilities.
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    throw new Error("Use the authenticated photo upload endpoint.");
  },
});
export const getUrl = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    const photo = await ctx.db
      .query("photoUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (!photo || photo.ownerId !== user._id) return null;
    return ctx.storage.getUrl(storageId);
  },
});
export const uploadOwner = internalQuery({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const recent = await ctx.db
      .query("photoUploads")
      .withIndex("by_owner_time", (q) =>
        q.eq("ownerId", user._id).gte("createdAt", Date.now() - 3600000),
      )
      .take(61);
    if (recent.length >= 60)
      throw new Error("Photo upload limit reached. Try again in an hour.");
    return user._id;
  },
});
export const register = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    const recent = await ctx.db
      .query("photoUploads")
      .withIndex("by_owner_time", (q) =>
        q.eq("ownerId", user._id).gte("createdAt", Date.now() - 3600000),
      )
      .take(61);
    if (recent.length >= 60)
      throw new Error("Photo upload limit reached. Try again in an hour.");
    await ctx.db.insert("photoUploads", {
      storageId,
      ownerId: user._id,
      createdAt: Date.now(),
    });
    return null;
  },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
export const uploadOptions = httpAction(
  async () => new Response(null, { status: 204, headers: cors }),
);
export const uploadPhoto = httpAction(async (ctx, request) => {
  const response = (data: object, status: number) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  if (!(await ctx.auth.getUserIdentity()))
    return response({ error: "Sign in to upload a photo." }, 401);
  try {
    await ctx.runQuery(internal.files.uploadOwner, {});
  } catch {
    return response(
      {
        error:
          "Complete your profile or wait for your upload allowance to reset.",
      },
      403,
    );
  }
  const contentType =
    request.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!PHOTO_TYPES.includes(contentType))
    return response({ error: "Use JPEG, PNG or WebP photos." }, 415);
  if (Number(request.headers.get("content-length")) >= MAX_PHOTO_BYTES)
    return response({ error: "Photos must be smaller than 20 MB." }, 413);
  const reader = request.body?.getReader();
  if (!reader) return response({ error: "Choose a photo." }, 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length >= MAX_PHOTO_BYTES) {
        await reader.cancel();
        return response({ error: "Photos must be smaller than 20 MB." }, 413);
      }
      chunks.push(value);
    }
  } catch {
    return response({ error: "Photo upload was interrupted. Try again." }, 400);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    validatePhotoBytes(bytes, contentType);
  } catch (error) {
    return response(
      { error: error instanceof Error ? error.message : "Invalid photo." },
      400,
    );
  }
  const storageId = await ctx.storage.store(
    new Blob([bytes], { type: contentType }),
  );
  try {
    await ctx.runMutation(internal.files.register, { storageId });
    return response(
      { storageId, url: await ctx.storage.getUrl(storageId) },
      200,
    );
  } catch {
    await ctx.storage.delete(storageId);
    return response({ error: "Unable to save photo. Try again later." }, 409);
  }
});
