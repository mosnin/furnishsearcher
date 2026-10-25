import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  MAX_DOCUMENT_BYTES,
  documentHash,
  encryptDocument,
  decryptDocument,
  validatePdf,
  documentKeys,
} from "./lib/documentCrypto";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};
const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
export const options = httpAction(
  async () => new Response(null, { status: 204, headers }),
);
export const upload = httpAction(async (ctx, request) => {
  if (!(await ctx.auth.getUserIdentity()))
    return json(401, "Sign in to upload a rental document.");
  const id = new URL(request.url).searchParams.get(
    "upload",
  ) as Id<"rentalDocumentUploads">;
  let info;
  try {
    documentKeys();
    info = await ctx.runQuery(internal.rentalDocs.uploadInfo, { id });
  } catch {
    return json(403, "Upload reservation or private storage is unavailable.");
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/pdf")
    return json(415, "Choose a PDF document.");
  if (Number(request.headers.get("content-length")) > MAX_DOCUMENT_BYTES)
    return json(413, "PDFs must be at most 10 MB.");
  const reader = request.body?.getReader();
  if (!reader) return json(400, "Choose a PDF.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_DOCUMENT_BYTES) {
        await reader.cancel();
        return json(413, "PDFs must be at most 10 MB.");
      }
      chunks.push(value);
    }
  } catch {
    return json(400, "Upload was interrupted.");
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    validatePdf(bytes);
  } catch {
    return json(400, "Use a valid PDF up to 10 MB.");
  }
  const sha256 = await documentHash(bytes);
  if (info.versionId) {
    if (info.sha256 !== sha256)
      return json(409, "This upload reference was used for different content.");
    return new Response(JSON.stringify({ versionId: info.versionId }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  let storageId: Id<"_storage"> | undefined;
  try {
    const encrypted = await encryptDocument(bytes);
    storageId = await ctx.storage.store(
      new Blob([encrypted.payload], { type: "application/octet-stream" }),
    );
    const saved = await ctx.runMutation(internal.rentalDocs.completeUpload, {
      id,
      storageId,
      keyId: encrypted.keyId,
      bytes: size,
      sha256,
    });
    if (saved.reused) await ctx.storage.delete(storageId);
    return new Response(JSON.stringify({ versionId: saved.versionId }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(
      "Rental document commit failed",
      e instanceof Error ? e.name : "Unknown storage failure",
    );
    if (storageId) await ctx.storage.delete(storageId);
    return json(
      409,
      "The document changed or storage is unavailable. Start a fresh upload.",
    );
  }
});
export const download = httpAction(async (ctx, request) => {
  if (!(await ctx.auth.getUserIdentity()))
    return json(401, "Sign in to download this document.");
  const versionId = new URL(request.url).searchParams.get(
    "version",
  ) as Id<"rentalDocumentVersions">;
  try {
    const info = await ctx.runQuery(internal.rentalDocs.downloadInfo, {
        versionId,
      }),
      blob = await ctx.storage.get(info.storageId);
    if (!blob) return json(404, "Document is unavailable.");
    const bytes = await decryptDocument(blob, info.keyId);
    if ((await documentHash(bytes)) !== info.sha256)
      return json(409, "Document integrity check failed.");
    await ctx.runMutation(internal.rentalDocs.recordDownload, { versionId });
    return new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rental-document.pdf"; filename*=UTF-8''${encodeURIComponent(info.filename).replace(/'/g, "%27")}`,
      },
    });
  } catch {
    return json(403, "Document is unavailable or access was revoked.");
  }
});
