import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { requireBooking } from "./bookings";
export async function draftVersions(
  ctx: QueryCtx | MutationCtx,
  documentId: Id<"rentalDocuments">,
) {
  const versions = await ctx.db
    .query("rentalDocumentVersions")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .take(21);
  return {
    versions,
    removable: versions.length <= 20 && !versions.some((v) => v.acknowledgedBy),
  };
}
export async function requireDocument(
  ctx: QueryCtx | MutationCtx,
  id: Id<"rentalDocuments">,
) {
  const doc = await ctx.db.get(id);
  if (!doc) throw new Error("Document is unavailable.");
  const { user, inquiry } = await requireBooking(ctx, doc.inquiryId);
  if (
    user._id !== doc.creatorId &&
    (doc.state !== "shared" || !doc.sharedVersionId)
  )
    throw new Error("Document is unavailable.");
  return { doc, user, inquiry };
}
export async function requireVersion(
  ctx: QueryCtx | MutationCtx,
  id: Id<"rentalDocumentVersions">,
) {
  const version = await ctx.db.get(id);
  if (!version) throw new Error("Document is unavailable.");
  const details = await requireDocument(ctx, version.documentId);
  if (
    details.user._id !== details.doc.creatorId &&
    details.doc.sharedVersionId !== id
  )
    throw new Error("This document version is private.");
  return { ...details, version };
}
export const versionProjection = (r: Doc<"rentalDocumentVersions">) => ({
  _id: r._id,
  filename: r.filename,
  bytes: r.bytes,
  sha256: r.sha256,
  version: r.version,
  createdAt: r.createdAt,
  source: r.source,
  providerMode: r.providerMode,
  acknowledgedBy: r.acknowledgedBy,
  acknowledgedAt: r.acknowledgedAt,
});
export async function docAudit(
  ctx: MutationCtx,
  d: Doc<"rentalDocuments">,
  actor: Id<"users">,
  action: string,
  versionId?: Id<"rentalDocumentVersions">,
) {
  await ctx.db.insert("rentalDocumentAudit", {
    inquiryId: d.inquiryId,
    documentId: d._id,
    actorId: actor,
    action,
    versionId,
    createdAt: Date.now(),
  });
}
