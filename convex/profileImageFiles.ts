import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { PHOTO_TYPES, validatePhotoBytes } from "../lib/photos";
import { MAX_PROFILE_IMAGE_BYTES } from "./profileImages";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
export const options = httpAction(
  async () => new Response(null, { status: 204, headers: cors }),
);
export const upload = httpAction(async (ctx, request) => {
  const respond = (status: number, data: object) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  if (!(await ctx.auth.getUserIdentity()))
    return respond(401, { error: "Sign in to save a profile photo." });
  const url = new URL(request.url),
    kind = url.searchParams.get("kind"),
    requestId = url.searchParams.get("requestId") ?? "",
    rawRevision = url.searchParams.get("revision") ?? "";
  if ((kind !== "profile" && kind !== "pet") || !/^\d{1,15}$/.test(rawRevision))
    return respond(400, { error: "Refresh the photo editor and try again." });
  const expectedRevision = Number(rawRevision);
  try {
    await ctx.runMutation(internal.profileImages.prepare, {
      kind,
      requestId,
      expectedRevision,
    });
  } catch (error) {
    return respond(409, {
      error:
        error instanceof Error
          ? error.message
          : "Refresh your profile or try again later.",
    });
  }
  const contentType =
    request.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!PHOTO_TYPES.includes(contentType))
    return respond(415, { error: "Use JPEG, PNG or WebP photos." });
  if (Number(request.headers.get("content-length")) >= MAX_PROFILE_IMAGE_BYTES)
    return respond(413, {
      error: "Profile and pet photos must be smaller than 5 MB.",
    });
  const reader = request.body?.getReader();
  if (!reader) return respond(400, { error: "Choose a photo." });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size >= MAX_PROFILE_IMAGE_BYTES) {
        await reader.cancel();
        return respond(413, {
          error: "Profile and pet photos must be smaller than 5 MB.",
        });
      }
      chunks.push(value);
    }
  } catch {
    return respond(400, { error: "The upload was interrupted. Try again." });
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    validatePhotoBytes(bytes, contentType);
  } catch {
    return respond(400, {
      error: "Use a JPEG, PNG or WebP photo with a matching file type.",
    });
  }
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const storageId = await ctx.storage.store(
    new Blob([bytes], { type: contentType }),
  );
  try {
    const result = await ctx.runMutation(internal.profileImages.commit, {
      kind,
      requestId,
      expectedRevision,
      storageId,
      bytes: size,
      contentType,
      digest,
    });
    if (!result.keepStorage)
      await ctx.runMutation(internal.profileImages.discardUncommitted, {
        storageId,
      });
    return respond(200, {
      url: result.url,
      revision: result.revision,
      applied: result.applied,
      duplicate: result.duplicate,
    });
  } catch (error) {
    // A lost response may follow a successful commit. Only discard if unregistered.
    try {
      await ctx.runMutation(internal.profileImages.discardUncommitted, {
        storageId,
      });
    } catch {
      /* Preserve the object for reconciliation if cleanup cannot be confirmed. */
    }
    return respond(409, {
      error:
        error instanceof Error
          ? error.message
          : "The photo could not be saved. Refresh and try again.",
    });
  }
});
