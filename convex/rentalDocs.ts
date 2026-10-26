import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import {
  documentKind,
  documentState,
  versionView,
} from "./validators/rentalDocs";
import { requireBooking, recordBookingEvent } from "./lib/bookings";
import { requireUser } from "./lib/auth";
import { requireMessagingAllowed } from "./lib/messageAccess";
import { requireDocumentWork } from "../lib/rental-document-policy";
import {
  requireDocument,
  requireVersion,
  versionProjection,
  docAudit,
  draftVersions,
} from "./lib/rentalDocs";
import {
  documentFilename,
  documentKeys,
  MAX_DOCUMENT_BYTES,
} from "./lib/documentCrypto";
export const capabilities = query({
  args: {},
  returns: v.object({ privateFiles: v.boolean(), maxBytes: v.number() }),
  handler: async () => {
    let privateFiles = false;
    try {
      documentKeys();
      privateFiles = true;
    } catch {}
    return { privateFiles, maxBytes: MAX_DOCUMENT_BYTES };
  },
});
export const list = query({
  args: {
    inquiryId: v.id("bookingInquiries"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("rentalDocuments"),
      title: v.string(),
      kind: documentKind,
      state: documentState,
      creatorId: v.id("users"),
      latest: v.union(versionView, v.null()),
      shared: v.union(versionView, v.null()),
      signingSessionId: v.optional(v.id("rentalSignatures")),
      canRemoveDraft: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const { user } = await requireBooking(ctx, args.inquiryId),
      page = await ctx.db
        .query("rentalDocuments")
        .withIndex("by_inquiry", (q) => q.eq("inquiryId", args.inquiryId))
        .order("desc")
        .paginate({
          ...args.paginationOpts,
          numItems: Math.min(20, args.paginationOpts.numItems),
        }),
      rows = [];
    for (const d of page.page) {
      const own = d.creatorId === user._id;
      if (!own && (d.state !== "shared" || !d.sharedVersionId)) continue;
      const latest =
          own && d.latestVersionId ? await ctx.db.get(d.latestVersionId) : null,
        shared = d.sharedVersionId ? await ctx.db.get(d.sharedVersionId) : null;
      rows.push({
        _id: d._id,
        title: d.title,
        kind: d.kind,
        state: d.state,
        creatorId: d.creatorId,
        latest: latest ? versionProjection(latest) : null,
        shared: shared ? versionProjection(shared) : null,
        signingSessionId: d.signingSessionId,
        canRemoveDraft:
          own && !d.sharedVersionId && !d.signingSessionId
            ? (await draftVersions(ctx, d._id)).removable
            : false,
      });
    }
    return { ...page, page: rows };
  },
});
export const versions = query({
  args: {
    documentId: v.id("rentalDocuments"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(versionView),
  handler: async (ctx, args) => {
    const { doc, user } = await requireDocument(ctx, args.documentId);
    if (user._id !== doc.creatorId) {
      const row = doc.sharedVersionId
        ? await ctx.db.get(doc.sharedVersionId)
        : null;
      return {
        page: row ? [versionProjection(row)] : [],
        isDone: true,
        continueCursor: "",
      };
    }
    const page = await ctx.db
      .query("rentalDocumentVersions")
      .withIndex("by_document", (q) => q.eq("documentId", doc._id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, args.paginationOpts.numItems),
      });
    return { ...page, page: page.page.map(versionProjection) };
  },
});
export const reserveUpload = mutation({
  args: {
    inquiryId: v.id("bookingInquiries"),
    documentId: v.optional(v.id("rentalDocuments")),
    expectedVersionId: v.optional(v.id("rentalDocumentVersions")),
    title: v.string(),
    kind: documentKind,
    filename: v.string(),
    requestId: v.string(),
  },
  returns: v.id("rentalDocumentUploads"),
  handler: async (ctx, args) => {
    documentKeys();
    const { user, inquiry } = await requireBooking(ctx, args.inquiryId);
    requireDocumentWork(inquiry.status);
    const title = args.title.trim(),
      filename = documentFilename(args.filename);
    if (
      title.length < 3 ||
      title.length > 120 ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(args.requestId)
    )
      throw new Error(
        "Enter a document title of 3–120 characters and a valid upload reference.",
      );
    const old = await ctx.db
      .query("rentalDocumentUploads")
      .withIndex("by_request", (q) =>
        q.eq("creatorId", user._id).eq("requestId", args.requestId),
      )
      .unique();
    if (old) {
      if (
        old.inquiryId !== args.inquiryId ||
        old.documentId !== args.documentId ||
        old.expectedVersionId !== args.expectedVersionId ||
        old.title !== title ||
        old.kind !== args.kind ||
        old.filename !== filename
      )
        throw new Error("Upload reference already used for another file.");
      return old._id;
    }
    if (args.documentId) {
      const { doc } = await requireDocument(ctx, args.documentId);
      if (
        doc.inquiryId !== inquiry._id ||
        doc.creatorId !== user._id ||
        doc.latestVersionId !== args.expectedVersionId ||
        doc.kind !== args.kind ||
        doc.title !== title ||
        doc.signingSessionId
      )
        throw new Error(
          "Review the current document before adding a version. Signing documents are immutable; create an addendum or new document.",
        );
      if (doc.versionCount >= 20)
        throw new Error(
          "This document has 20 versions. Create a new document.",
        );
    } else {
      if (args.expectedVersionId)
        throw new Error("Choose the existing document for this version.");
      const docs = await ctx.db
        .query("rentalDocuments")
        .withIndex("by_inquiry", (q) => q.eq("inquiryId", inquiry._id))
        .take(51);
      if (docs.length >= 50)
        throw new Error(
          "This stay has 50 documents. Remove unshared drafts before uploading more.",
        );
    }
    const recent = await ctx.db
      .query("rentalDocumentUploads")
      .withIndex("by_creator_time", (q) =>
        q.eq("creatorId", user._id).gt("createdAt", Date.now() - 3600000),
      )
      .take(21);
    if (recent.length >= 20)
      throw new Error(
        "Document upload allowance reached. Try again in an hour.",
      );
    return ctx.db.insert("rentalDocumentUploads", {
      ...args,
      title,
      filename,
      creatorId: user._id,
      state: "reserved",
      createdAt: Date.now(),
    });
  },
});
export const uploadInfo = internalQuery({
  args: { id: v.id("rentalDocumentUploads") },
  returns: v.object({
    versionId: v.optional(v.id("rentalDocumentVersions")),
    sha256: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const u = await requireUser(ctx),
      r = await ctx.db.get(args.id);
    if (
      !r ||
      r.creatorId !== u._id ||
      (r.state !== "completed" && r.createdAt < Date.now() - 15 * 60000)
    )
      throw new Error("Upload reservation expired or unavailable.");
    const { inquiry } = await requireBooking(ctx, r.inquiryId);
    if (r.state !== "completed") requireDocumentWork(inquiry.status);
    const version = r.versionId ? await ctx.db.get(r.versionId) : null;
    return { versionId: r.versionId, sha256: version?.sha256 };
  },
});
export const completeUpload = internalMutation({
  args: {
    id: v.id("rentalDocumentUploads"),
    storageId: v.id("_storage"),
    keyId: v.string(),
    bytes: v.number(),
    sha256: v.string(),
  },
  returns: v.object({
    versionId: v.id("rentalDocumentVersions"),
    reused: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const u = await requireUser(ctx),
      r = await ctx.db.get(args.id);
    if (
      !r ||
      r.creatorId !== u._id ||
      (r.state !== "completed" && r.createdAt < Date.now() - 15 * 60000)
    )
      throw new Error("Upload reservation expired or unavailable.");
    const { inquiry } = await requireBooking(ctx, r.inquiryId);
    if (r.state === "completed") {
      const prior = r.versionId ? await ctx.db.get(r.versionId) : null;
      if (!prior || prior.sha256 !== args.sha256)
        throw new Error("Upload reference already used for different content.");
      return { versionId: prior._id, reused: true };
    }
    requireDocumentWork(inquiry.status);
    if (
      args.bytes < 12 ||
      args.bytes > MAX_DOCUMENT_BYTES ||
      !/^[a-f0-9]{64}$/.test(args.sha256) ||
      !documentKeys().keys[args.keyId]
    )
      throw new Error("Invalid stored document metadata.");
    const stored = await ctx.db.system.get(args.storageId);
    if (
      !stored ||
      stored.contentType !== "application/octet-stream" ||
      stored.size !== args.bytes + 28
    )
      throw new Error("Private encrypted storage metadata is invalid.");
    let documentId = r.documentId;
    let count = 0;
    if (documentId) {
      const { doc } = await requireDocument(ctx, documentId);
      if (
        doc.creatorId !== u._id ||
        doc.latestVersionId !== r.expectedVersionId ||
        doc.signingSessionId ||
        doc.versionCount >= 20
      )
        throw new Error(
          "The document changed during upload. Start a new version upload.",
        );
      count = doc.versionCount;
    } else {
      const docs = await ctx.db
        .query("rentalDocuments")
        .withIndex("by_inquiry", (q) => q.eq("inquiryId", r.inquiryId))
        .take(51);
      if (docs.length >= 50)
        throw new Error("This stay has reached its document allowance.");
      documentId = await ctx.db.insert("rentalDocuments", {
        inquiryId: r.inquiryId,
        creatorId: u._id,
        title: r.title,
        kind: r.kind,
        state: "draft",
        versionCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    const versionId = await ctx.db.insert("rentalDocumentVersions", {
      documentId,
      uploaderId: u._id,
      storageId: args.storageId,
      keyId: args.keyId,
      filename: r.filename,
      bytes: args.bytes,
      sha256: args.sha256,
      version: count + 1,
      createdAt: Date.now(),
      source: "member_upload",
    });
    await ctx.db.patch(documentId, {
      latestVersionId: versionId,
      versionCount: count + 1,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(r._id, { state: "completed", versionId });
    await docAudit(
      ctx,
      (await ctx.db.get(documentId))!,
      u._id,
      "uploaded",
      versionId,
    );
    return { versionId, reused: false };
  },
});
export const share = mutation({
  args: {
    documentId: v.id("rentalDocuments"),
    versionId: v.id("rentalDocumentVersions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { doc, user, inquiry } = await requireDocument(ctx, args.documentId);
    if (
      doc.creatorId !== user._id ||
      doc.latestVersionId !== args.versionId ||
      doc.signingSessionId
    )
      throw new Error(
        "Only the uploader can share the current document version; active signing copies are locked.",
      );
    if (!(doc.state === "shared" && doc.sharedVersionId === args.versionId))
      requireDocumentWork(inquiry.status);
    await requireMessagingAllowed(ctx, inquiry.tenantId, inquiry.landlordId);
    if (doc.state === "shared" && doc.sharedVersionId === args.versionId)
      return null;
    await ctx.db.patch(doc._id, {
      state: "shared",
      sharedVersionId: args.versionId,
      updatedAt: Date.now(),
    });
    await docAudit(ctx, doc, user._id, "shared", args.versionId);
    await recordBookingEvent(
      ctx,
      inquiry,
      user._id,
      "document_shared",
      "A private rental document version was shared. Review it in the stay’s document workspace.",
    );
    return null;
  },
});
export const unshare = mutation({
  args: { documentId: v.id("rentalDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { doc, user, inquiry } = await requireDocument(ctx, args.documentId);
    if (doc.creatorId !== user._id || doc.signingSessionId)
      throw new Error(
        "Only the uploader can revoke a shared draft; signing copies retain their signed history.",
      );
    if (!doc.sharedVersionId) return null;
    await ctx.db.patch(doc._id, {
      sharedVersionId: undefined,
      state: "draft",
      updatedAt: Date.now(),
    });
    await docAudit(ctx, doc, user._id, "unshared");
    await recordBookingEvent(
      ctx,
      inquiry,
      user._id,
      "document_unshared",
      "Future access to an unsigned document version was revoked. Previously downloaded copies remain with their recipients.",
    );
    return null;
  },
});
export const acknowledge = mutation({
  args: { versionId: v.id("rentalDocumentVersions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { version, doc, user, inquiry } = await requireVersion(
      ctx,
      args.versionId,
    );
    if (
      doc.creatorId === user._id ||
      doc.sharedVersionId !== version._id ||
      doc.state !== "shared"
    )
      throw new Error("Acknowledge the version shared with you.");
    if (version.acknowledgedBy === user._id) return null;
    await ctx.db.patch(version._id, {
      acknowledgedBy: user._id,
      acknowledgedAt: Date.now(),
    });
    await docAudit(ctx, doc, user._id, "receipt_acknowledged", version._id);
    await recordBookingEvent(
      ctx,
      inquiry,
      user._id,
      "document_received",
      "The stay partner acknowledged receipt of a shared document. This is not an electronic signature or agreement to its terms.",
    );
    return null;
  },
});
export const removeDraft = mutation({
  args: { documentId: v.id("rentalDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { doc, user } = await requireDocument(ctx, args.documentId);
    if (
      doc.creatorId !== user._id ||
      doc.sharedVersionId ||
      doc.signingSessionId
    )
      throw new Error(
        "Only the uploader can remove an unshared draft without signing history.",
      );
    const { versions, removable } = await draftVersions(ctx, doc._id);
    if (!removable)
      throw new Error(
        "This copy has receipt or signing history. Contact support for controlled deletion.",
      );
    await docAudit(ctx, doc, user._id, "draft_deleted");
    for (const version of versions) {
      await ctx.storage.delete(version.storageId);
      await ctx.db.delete(version._id);
    }
    await ctx.db.delete(doc._id);
    return null;
  },
});
export const downloadInfo = internalQuery({
  args: { versionId: v.id("rentalDocumentVersions") },
  returns: v.object({
    storageId: v.id("_storage"),
    keyId: v.string(),
    filename: v.string(),
    sha256: v.string(),
  }),
  handler: async (ctx, args) => {
    const { version } = await requireVersion(ctx, args.versionId);
    return {
      storageId: version.storageId,
      keyId: version.keyId,
      filename: version.filename,
      sha256: version.sha256,
    };
  },
});
export const recordDownload = internalMutation({
  args: { versionId: v.id("rentalDocumentVersions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { doc, version, user } = await requireVersion(ctx, args.versionId);
    await docAudit(ctx, doc, user._id, "downloaded", version._id);
    return null;
  },
});
export const audit = query({
  args: {
    inquiryId: v.id("bookingInquiries"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      documentId: v.id("rentalDocuments"),
      actorId: v.id("users"),
      action: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { user } = await requireBooking(ctx, args.inquiryId),
      page = await ctx.db
        .query("rentalDocumentAudit")
        .withIndex("by_inquiry", (q) => q.eq("inquiryId", args.inquiryId))
        .order("desc")
        .paginate({
          ...args.paginationOpts,
          numItems: Math.min(20, args.paginationOpts.numItems),
        }),
      rows = [];
    for (const r of page.page) {
      const doc = await ctx.db.get(r.documentId);
      if (
        doc &&
        doc.creatorId !== user._id &&
        r.actorId !== user._id &&
        r.versionId &&
        r.versionId !== doc.sharedVersionId
      )
        continue;
      if (
        r.actorId !== user._id &&
        (!doc || (doc.creatorId !== user._id && doc.state !== "shared"))
      )
        continue;
      rows.push({
        documentId: r.documentId,
        actorId: r.actorId,
        action: r.action,
        createdAt: r.createdAt,
      });
    }
    return { ...page, page: rows };
  },
});
