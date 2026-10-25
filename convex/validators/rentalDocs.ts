import { v } from "convex/values";
export const documentKind = v.union(
  v.literal("lease"),
  v.literal("addendum"),
  v.literal("signed_copy"),
  v.literal("inventory"),
  v.literal("notice"),
);
export const documentState = v.union(
  v.literal("draft"),
  v.literal("shared"),
  v.literal("archived"),
);
export const documentFields = {
  inquiryId: v.id("bookingInquiries"),
  creatorId: v.id("users"),
  title: v.string(),
  kind: documentKind,
  state: documentState,
  latestVersionId: v.optional(v.id("rentalDocumentVersions")),
  sharedVersionId: v.optional(v.id("rentalDocumentVersions")),
  versionCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  signingSessionId: v.optional(v.id("rentalSignatures")),
};
export const versionFields = {
  documentId: v.id("rentalDocuments"),
  uploaderId: v.id("users"),
  storageId: v.id("_storage"),
  keyId: v.string(),
  filename: v.string(),
  bytes: v.number(),
  sha256: v.string(),
  version: v.number(),
  createdAt: v.number(),
  providerMode: v.optional(v.union(v.literal("sandbox"), v.literal("prod"))),
  source: v.union(v.literal("member_upload"), v.literal("rocketlawyer_signed")),
  acknowledgedBy: v.optional(v.id("users")),
  acknowledgedAt: v.optional(v.number()),
};
export const versionView = v.object({
  _id: v.id("rentalDocumentVersions"),
  filename: v.string(),
  bytes: v.number(),
  sha256: v.string(),
  version: v.number(),
  createdAt: v.number(),
  providerMode: v.optional(v.union(v.literal("sandbox"), v.literal("prod"))),
  source: v.union(v.literal("member_upload"), v.literal("rocketlawyer_signed")),
  acknowledgedBy: v.optional(v.id("users")),
  acknowledgedAt: v.optional(v.number()),
});
export const signatureState = v.union(
  v.literal("creating"),
  v.literal("created"),
  v.literal("uploaded"),
  v.literal("finalised"),
  v.literal("invited"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("unknown"),
  v.literal("cancelled"),
);

export const signatureFields = {
  documentId: v.id("rentalDocuments"),
  versionId: v.id("rentalDocumentVersions"),
  ownerId: v.id("users"),
  tenantId: v.id("users"),
  mode: v.union(v.literal("sandbox"), v.literal("prod")),
  state: signatureState,
  generation: v.number(),
  creationAttemptedAt: v.optional(v.number()),
  setupLeaseUntil: v.optional(v.number()),
  binderId: v.optional(v.string()),
  providerDocumentId: v.optional(v.string()),
  ownerPartyId: v.optional(v.string()),
  tenantPartyId: v.optional(v.string()),
  ownerLegalName: v.string(),
  tenantLegalName: v.string(),
  ownerEmail: v.string(),
  tenantEmail: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastPollAt: v.optional(v.number()),
  providerStatus: v.optional(v.string()),
  signedVersionId: v.optional(v.id("rentalDocumentVersions")),
  error: v.optional(v.string()),
};
export const signatureDoc = v.object({
  ...signatureFields,
  _id: v.id("rentalSignatures"),
  _creationTime: v.number(),
});
export const rentalDocumentDoc = v.object({
  ...documentFields,
  _id: v.id("rentalDocuments"),
  _creationTime: v.number(),
});
export const versionDoc = v.object({
  ...versionFields,
  _id: v.id("rentalDocumentVersions"),
  _creationTime: v.number(),
});
