import { findActiveUser } from "./lib/auth";
import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireDocument, docAudit } from "./lib/rentalDocs";
import { requireMessagingAllowed, blockState } from "./lib/messageAccess";
import { rocketConfig } from "./lib/rocket";
import { activePaidSubscription } from "./lib/billing";
import {
  signatureState,
  signatureDoc,
  rentalDocumentDoc,
  versionDoc,
} from "./validators/rentalDocs";
export const capabilities = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    mode: v.union(v.literal("sandbox"), v.literal("prod"), v.null()),
  }),
  handler: async () => {
    try {
      const cfg = rocketConfig();
      return { configured: true, mode: cfg.mode };
    } catch {
      return { configured: false, mode: null };
    }
  },
});
export const consent = mutation({
  args: {
    documentId: v.id("rentalDocuments"),
    versionId: v.id("rentalDocumentVersions"),
    legalName: v.string(),
    agreed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { doc, user, inquiry } = await requireDocument(ctx, args.documentId),
      identity = await ctx.auth.getUserIdentity();
    if (
      !args.agreed ||
      doc.state !== "shared" ||
      doc.sharedVersionId !== args.versionId ||
      doc.latestVersionId !== args.versionId ||
      doc.signingSessionId ||
      !["lease", "addendum"].includes(doc.kind) ||
      doc.creatorId !== inquiry.landlordId
    )
      throw new Error(
        "Review the current owner-shared lease or addendum and confirm permission for Rocket Lawyer signing.",
      );
    if (
      identity?.emailVerified !== true ||
      typeof identity.email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(identity.email)
    )
      throw new Error(
        "Electronic signing requires a verified email from your sign-in account. Verify your email or contact support.",
      );
    await requireMessagingAllowed(ctx, inquiry.tenantId, inquiry.landlordId);
    const legalName = args.legalName.trim();
    if (legalName.length < 2 || legalName.length > 160)
      throw new Error("Enter your own legal name of 2–160 characters.");
    const old = await ctx.db
        .query("rentalSignatureConsents")
        .withIndex("by_version_user", (q) =>
          q.eq("versionId", args.versionId).eq("userId", user._id),
        )
        .unique(),
      fields = {
        documentId: doc._id,
        versionId: args.versionId,
        userId: user._id,
        legalName,
        email: identity.email.toLowerCase(),
        verifiedAt: Date.now(),
        expiresAt: Date.now() + 24 * 3600000,
      };
    if (old) await ctx.db.patch(old._id, fields);
    else await ctx.db.insert("rentalSignatureConsents", fields);
    await docAudit(
      ctx,
      doc,
      user._id,
      "rocketlawyer_signing_consent",
      args.versionId,
    );
    return null;
  },
});
export const status = query({
  args: { documentId: v.id("rentalDocuments") },
  returns: v.object({
    canStopPreparation: v.boolean(),
    myConsent: v.boolean(),
    otherConsent: v.boolean(),
    state: v.union(signatureState, v.null()),
    providerStatus: v.optional(v.string()),
    mode: v.union(v.literal("sandbox"), v.literal("prod"), v.null()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { doc, user, inquiry } = await requireDocument(ctx, args.documentId);
    const my = doc.latestVersionId
        ? await ctx.db
            .query("rentalSignatureConsents")
            .withIndex("by_version_user", (q) =>
              q.eq("versionId", doc.latestVersionId!).eq("userId", user._id),
            )
            .unique()
        : null,
      other = doc.latestVersionId
        ? await ctx.db
            .query("rentalSignatureConsents")
            .withIndex("by_version_user", (q) =>
              q
                .eq("versionId", doc.latestVersionId!)
                .eq(
                  "userId",
                  user._id === inquiry.landlordId
                    ? inquiry.tenantId
                    : inquiry.landlordId,
                ),
            )
            .unique()
        : null;
    const s = doc.signingSessionId
      ? await ctx.db.get(doc.signingSessionId)
      : null;
    return {
      canStopPreparation:
        !!s &&
        !s.binderId &&
        !s.creationAttemptedAt &&
        !["completed", "cancelled"].includes(s.state),
      myConsent: !!my && my.expiresAt > Date.now(),
      otherConsent: !!other && other.expiresAt > Date.now(),
      state: s?.state ?? null,
      providerStatus: s?.providerStatus,
      mode: s?.mode ?? null,
      error: s?.error,
    };
  },
});
export const begin = internalMutation({
  args: {
    documentId: v.id("rentalDocuments"),
    versionId: v.id("rentalDocumentVersions"),
    confirmed: v.boolean(),
  },
  returns: v.id("rentalSignatures"),
  handler: async (ctx, args) => {
    const cfg = rocketConfig(),
      { doc, user, inquiry } = await requireDocument(ctx, args.documentId);
    if (
      user._id !== inquiry.landlordId ||
      doc.creatorId !== user._id ||
      !args.confirmed
    )
      throw new Error(
        "Only the owner can send the mutually approved document for signatures.",
      );
    const previous = doc.signingSessionId
      ? await ctx.db.get(doc.signingSessionId)
      : null;
    if (!previous?.creationAttemptedAt) {
      const paid = await activePaidSubscription(ctx, user._id, true);
      if (!paid)
        throw new Error(
          "An active paid landlord subscription is required to start signing.",
        );
      if ((paid.mode === "test" ? "sandbox" : "prod") !== cfg.mode)
        throw new Error("Signing and subscription environments must match.");
    }
    if (previous) return previous._id;
    if (
      doc.latestVersionId !== args.versionId ||
      doc.sharedVersionId !== args.versionId ||
      doc.state !== "shared" ||
      !["lease", "addendum"].includes(doc.kind)
    )
      throw new Error("Review and share this exact lease version first.");
    await requireMessagingAllowed(ctx, inquiry.tenantId, inquiry.landlordId);
    const owner = await ctx.db
        .query("rentalSignatureConsents")
        .withIndex("by_version_user", (q) =>
          q.eq("versionId", args.versionId).eq("userId", inquiry.landlordId),
        )
        .unique(),
      tenant = await ctx.db
        .query("rentalSignatureConsents")
        .withIndex("by_version_user", (q) =>
          q.eq("versionId", args.versionId).eq("userId", inquiry.tenantId),
        )
        .unique();
    if (
      !owner ||
      !tenant ||
      owner.expiresAt < Date.now() ||
      tenant.expiresAt < Date.now()
    )
      throw new Error(
        "Both stay participants must confirm this version, their own legal names and verified emails within the last 24 hours.",
      );
    if (owner.email === tenant.email)
      throw new Error("Each signer needs their own verified email account.");
    const id = await ctx.db.insert("rentalSignatures", {
      documentId: doc._id,
      versionId: args.versionId,
      ownerId: inquiry.landlordId,
      tenantId: inquiry.tenantId,
      ownerLegalName: owner.legalName,
      tenantLegalName: tenant.legalName,
      ownerEmail: owner.email,
      tenantEmail: tenant.email,
      mode: cfg.mode,
      state: "creating",
      generation: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(doc._id, { signingSessionId: id });
    await docAudit(
      ctx,
      doc,
      user._id,
      "rocketlawyer_preparation_started",
      args.versionId,
    );
    return id;
  },
});
export const session = internalQuery({
  args: { id: v.id("rentalSignatures"), requireParticipant: v.boolean() },
  returns: v.object({
    s: signatureDoc,
    doc: rentalDocumentDoc,
    version: versionDoc,
  }),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (!s) throw new Error("Signing session unavailable.");
    const doc = await ctx.db.get(s.documentId);
    if (
      !doc ||
      doc.signingSessionId !== s._id ||
      (doc.latestVersionId !== s.versionId && s.state !== "completed")
    )
      throw new Error("The document version or signing session changed.");
    if (args.requireParticipant) await requireDocument(ctx, s.documentId);
    const version = await ctx.db.get(s.versionId);
    if (!version) throw new Error("Signing source version is unavailable.");
    if (rocketConfig().mode !== s.mode)
      throw new Error(
        "Signing environment changed. Review this session before continuing.",
      );
    return { s, doc, version };
  },
});
export const checkpoint = internalMutation({
  args: {
    id: v.id("rentalSignatures"),
    generation: v.number(),
    expectedPollAt: v.optional(v.number()),
    state: signatureState,
    binderId: v.optional(v.string()),
    providerDocumentId: v.optional(v.string()),
    ownerPartyId: v.optional(v.string()),
    tenantPartyId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (
      !s ||
      s.generation !== args.generation ||
      (args.expectedPollAt !== undefined &&
        s.lastPollAt !== args.expectedPollAt) ||
      s.state === "completed" ||
      s.state === "cancelled"
    )
      return null;
    const { id, generation, expectedPollAt, ...patch } = args;
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
    return null;
  },
});
export const claimPoll = internalMutation({
  args: {
    id: v.id("rentalSignatures"),
    requireParticipant: v.boolean(),
    insideSetup: v.optional(v.boolean()),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (!s) return null;
    if (args.requireParticipant) await requireDocument(ctx, s.documentId);
    const now = Date.now();
    if (
      (s.lastPollAt ?? 0) > now - 10000 ||
      (!args.insideSetup && (s.setupLeaseUntil ?? 0) > now)
    )
      return null;
    await ctx.db.patch(s._id, { lastPollAt: now });
    return now;
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("rentalSignatures"),
    generation: v.number(),
    expectedPollAt: v.optional(v.number()),
    storageId: v.id("_storage"),
    keyId: v.string(),
    bytes: v.number(),
    sha256: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id),
      doc = s ? await ctx.db.get(s.documentId) : null;
    if (
      !s ||
      !doc ||
      s.generation !== args.generation ||
      (args.expectedPollAt !== undefined &&
        s.lastPollAt !== args.expectedPollAt) ||
      doc.signingSessionId !== s._id ||
      s.state === "completed" ||
      doc.latestVersionId !== s.versionId
    )
      return false;
    const versionId = await ctx.db.insert("rentalDocumentVersions", {
      documentId: doc._id,
      uploaderId: s.ownerId,
      storageId: args.storageId,
      keyId: args.keyId,
      filename:
        s.mode === "sandbox"
          ? "sandbox-signed-rental-document.pdf"
          : "signed-rental-document.pdf",
      bytes: args.bytes,
      sha256: args.sha256,
      version: doc.versionCount + 1,
      source: "rocketlawyer_signed",
      providerMode: s.mode,
      createdAt: Date.now(),
    });
    await ctx.db.patch(doc._id, {
      latestVersionId: versionId,
      sharedVersionId: versionId,
      versionCount: doc.versionCount + 1,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(s._id, {
      state: "completed",
      providerStatus: "SIGN_COMPLETED",
      signedVersionId: versionId,
      error: undefined,
      updatedAt: Date.now(),
    });
    await docAudit(
      ctx,
      doc,
      s.ownerId,
      s.mode === "sandbox"
        ? "rocketlawyer_sandbox_signature_result"
        : "rocketlawyer_signed_pdf_received",
      versionId,
    );
    return true;
  },
});
export const recordCancellation = internalMutation({
  args: {
    id: v.id("rentalSignatures"),
    generation: v.number(),
    expectedPollAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id),
      doc = s ? await ctx.db.get(s.documentId) : null;
    if (
      !s ||
      !doc ||
      s.generation !== args.generation ||
      (args.expectedPollAt !== undefined &&
        s.lastPollAt !== args.expectedPollAt) ||
      s.state === "completed"
    )
      return null;
    await ctx.db.patch(s._id, {
      state: "cancelled",
      providerStatus: "IN_PREPARATION",
      updatedAt: Date.now(),
    });
    if (doc.signingSessionId === s._id)
      await ctx.db.patch(doc._id, {
        signingSessionId: undefined,
        updatedAt: Date.now(),
      });
    await docAudit(
      ctx,
      doc,
      s.ownerId,
      "rocketlawyer_signing_cancelled",
      s.versionId,
    );
    return null;
  },
});
export const due = internalQuery({
  args: { before: v.optional(v.number()) },
  returns: v.array(v.id("rentalSignatures")),
  handler: async (ctx, args) => {
    const before = Math.min(
      args.before ?? Date.now() - 5 * 60000,
      Date.now() - 5 * 60000,
    );
    const rows = [];
    for (const state of [
      "invited",
      "finalised",
      "uploaded",
      "created",
      "failed",
    ] as const) {
      const batch = await ctx.db
        .query("rentalSignatures")
        .withIndex("by_state_poll", (q) =>
          q.eq("state", state).lt("lastPollAt", before),
        )
        .take(8 - rows.length);
      rows.push(...batch.map((r) => r._id));
      if (rows.length >= 8) break;
    }
    return rows;
  },
});

export const claimSetup = internalMutation({
  args: {
    id: v.id("rentalSignatures"),
    release: v.optional(v.boolean()),
    creation: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (!s) return false;
    if (args.release) {
      await ctx.db.patch(s._id, { setupLeaseUntil: 0 });
      return true;
    }
    const document = await ctx.db.get(s.documentId);
    if (
      document?.signingSessionId !== s._id ||
      ["completed", "cancelled"].includes(s.state)
    )
      return false;
    const inquiry = document ? await ctx.db.get(document.inquiryId) : null;
    if (
      !inquiry ||
      (await blockState(ctx, inquiry.tenantId, inquiry.landlordId))
        .cannotMessage
    )
      return false;
    if (args.creation) {
      if (s.creationAttemptedAt) return false;
      await ctx.db.patch(s._id, { creationAttemptedAt: Date.now() });
      return true;
    }
    if ((s.setupLeaseUntil ?? 0) > Date.now()) return false;
    await ctx.db.patch(s._id, { setupLeaseUntil: Date.now() + 240000 });
    return true;
  },
});
export const forDocument = internalQuery({
  args: { documentId: v.id("rentalDocuments") },
  returns: v.union(v.id("rentalSignatures"), v.null()),
  handler: async (ctx, args) => {
    const { doc } = await requireDocument(ctx, args.documentId);
    return doc.signingSessionId ?? null;
  },
});
export const caller = internalQuery({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in.");
    const user = await findActiveUser(ctx, identity.subject);
    if (!user) throw new Error("Complete your profile.");
    return user._id;
  },
});

export const withdrawConsent = mutation({
  args: {
    documentId: v.id("rentalDocuments"),
    versionId: v.id("rentalDocumentVersions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { doc, user } = await requireDocument(ctx, args.documentId);
    if (doc.signingSessionId)
      throw new Error(
        "Signing has started. Manage the current provider request with your stay partner.",
      );
    const consent = await ctx.db
      .query("rentalSignatureConsents")
      .withIndex("by_version_user", (q) =>
        q.eq("versionId", args.versionId).eq("userId", user._id),
      )
      .unique();
    if (consent?.documentId === doc._id) {
      await ctx.db.delete(consent._id);
      await docAudit(
        ctx,
        doc,
        user._id,
        "rocketlawyer_consent_withdrawn",
        args.versionId,
      );
    }
    return null;
  },
});
export const pollFailure = internalMutation({
  args: { id: v.id("rentalSignatures") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (s && !["completed", "cancelled"].includes(s.state))
      await ctx.db.patch(s._id, {
        state: "failed",
        error:
          "Unable to refresh the provider result. Retry or contact support.",
        updatedAt: Date.now(),
      });
    return null;
  },
});

export const stopPreparation = mutation({
  args: { documentId: v.id("rentalDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { doc, user } = await requireDocument(ctx, args.documentId),
      s = doc.signingSessionId ? await ctx.db.get(doc.signingSessionId) : null;
    if (
      !s ||
      s.binderId ||
      s.creationAttemptedAt ||
      ["completed", "cancelled"].includes(s.state)
    )
      throw new Error(
        "The provider may already have this document. Review its signing state or contact support before stopping it.",
      );
    await ctx.db.patch(s._id, { state: "cancelled", updatedAt: Date.now() });
    await ctx.db.patch(doc._id, {
      signingSessionId: undefined,
      updatedAt: Date.now(),
    });
    const consent = await ctx.db
      .query("rentalSignatureConsents")
      .withIndex("by_version_user", (q) =>
        q.eq("versionId", s.versionId).eq("userId", user._id),
      )
      .unique();
    if (consent) await ctx.db.delete(consent._id);
    await docAudit(
      ctx,
      doc,
      user._id,
      "preparation_stopped_before_provider_transfer",
      s.versionId,
    );
    return null;
  },
});
