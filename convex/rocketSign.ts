import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  rocketConfig,
  rocketToken,
  rocketRequest,
  rocketId,
  binderReference,
  bindRocket,
} from "./lib/rocket";
import {
  documentHash,
  validatePdf,
  decryptDocument,
  encryptDocument,
} from "./lib/documentCrypto";
const providerFields = (b: {
  ownerPartyId: string;
  tenantPartyId: string;
  providerDocumentId: string;
  status: string;
}) => ({
  ownerPartyId: b.ownerPartyId,
  tenantPartyId: b.tenantPartyId,
  providerDocumentId: b.providerDocumentId,
  providerStatus: b.status,
});
async function sourceCheck(
  token: string,
  s: Pick<Doc<"rentalSignatures">, "binderId" | "providerDocumentId">,
  version: Pick<Doc<"rentalDocumentVersions">, "sha256">,
) {
  const r = await rocketRequest(
    `/document-manager/v1/binders/${rocketId(s.binderId)}/documents/${rocketId(s.providerDocumentId)}?unsigned`,
    token,
    "GET",
    undefined,
    true,
  );
  validatePdf(r.bytes);
  if ((await documentHash(r.bytes)) !== version.sha256)
    throw new Error(
      "The provider’s original PDF differs from this document version.",
    );
}
async function setup(ctx: ActionCtx, id: Id<"rentalSignatures">) {
  let details = await ctx.runQuery(internal.rocketSignData.session, {
      id,
      requireParticipant: true,
    }),
    s = details.s;
  if (!(await ctx.runMutation(internal.rocketSignData.claimSetup, { id })))
    return;
  let attemptedCreation = false;
  const beforeTransfer = () =>
    ctx.runQuery(internal.rocketSignData.beforeTransfer, {
      id,
      generation: s.generation,
    });
  const checkpoint = async (fields: any) => {
    await ctx.runMutation(internal.rocketSignData.checkpoint, {
      id,
      generation: s.generation,
      ...fields,
    });
  };
  try {
    if (s.state === "completed" || s.state === "cancelled") return;
    const token = await rocketToken();
    if (!s.binderId) {
      if (
        !(await ctx.runMutation(internal.rocketSignData.claimSetup, {
          id,
          creation: true,
        }))
      )
        throw new Error(
          "Creation outcome is uncertain. Recover the existing provider binder through support before retrying.",
        );
      attemptedCreation = true;
      const created = await rocketRequest(
        "/document-manager/v1/binders",
        token,
        "POST",
        {
          name: binderReference(s.versionId),
          defaultMessage: "Review and sign this rental document",
          parties: [
            {
              legalName: s.ownerLegalName,
              reference: s.ownerId,
              jobTitle: "Landlord",
              email: s.ownerEmail,
              roles: ["OWNER", "SIGNER"],
            },
            {
              legalName: s.tenantLegalName,
              reference: s.tenantId,
              jobTitle: "Tenant",
              email: s.tenantEmail,
              roles: ["SIGNER"],
            },
          ],
          documents: [
            {
              order: 1,
              name: `Rental PDF ${s.versionId}`,
              signable: true,
              inputs: [
                {
                  type: "SIGNATURE_TEXT",
                  partyReference: s.ownerId,
                  position: { type: "SIGNATURE_PAGE" },
                },
                {
                  type: "SIGNATURE_TEXT",
                  partyReference: s.tenantId,
                  position: { type: "SIGNATURE_PAGE" },
                },
              ],
            },
          ],
        },
      );
      let binderId = created.data?.id;
      if (!binderId && created.location) {
        const location = new URL(created.location, rocketConfig().origin);
        if (
          location.origin !== rocketConfig().origin ||
          !/^\/document-manager\/v1\/binders\/[a-zA-Z0-9_-]+$/.test(
            location.pathname,
          )
        )
          throw new Error("Unexpected provider binder location.");
        binderId = location.pathname.split("/").at(-1);
      }
      binderId = rocketId(binderId);
      await checkpoint({ state: "created", binderId });
      s = { ...s, binderId };
    }
    let binder = (
        await rocketRequest(`/document-manager/v1/binders/${s.binderId}`, token)
      ).data,
      bound = bindRocket(binder, {
        ...s,
        binderId: rocketId(s.binderId),
        versionId: s.versionId,
      });
    if (
      bound.status === "IN_PREPARATION" &&
      ["SIGN_IN_PROGRESS", "REVIEW_AND_SHARE"].includes(s.providerStatus ?? "")
    ) {
      await ctx.runMutation(internal.rocketSignData.recordCancellation, {
        id,
        generation: s.generation,
      });
      return;
    }
    await checkpoint({
      state: s.state === "creating" ? "created" : s.state,
      ...providerFields(bound),
      providerStatus: bound.status,
    });
    s = { ...s, ...bound };
    if (bound.status !== "IN_PREPARATION")
      await sourceCheck(token, s, details.version);
    if (bound.status === "IN_PREPARATION") {
      const blob = await ctx.storage.get(details.version.storageId);
      if (!blob) throw new Error("Source PDF is unavailable.");
      const bytes = await decryptDocument(blob, details.version.keyId);
      if ((await documentHash(bytes)) !== details.version.sha256)
        throw new Error("Source PDF integrity check failed.");
      await beforeTransfer();
      await rocketRequest(
        `/document-manager/v1/binders/${s.binderId}/documents/${s.providerDocumentId}`,
        token,
        "PUT",
        bytes,
      );
      await sourceCheck(token, s, details.version);
      await checkpoint({ state: "uploaded", providerStatus: "IN_PREPARATION" });
      await beforeTransfer();
      await rocketRequest(
        `/document-manager/v1/binders/${s.binderId}/requests/finalisations`,
        token,
        "POST",
        {
          subject: "Review rental document",
          message:
            "Review the exact rental document you approved in FurnishSearcher",
          recipients: [
            { partyId: s.ownerPartyId, notification: false },
            { partyId: s.tenantPartyId, notification: false },
          ],
        },
      );
      await checkpoint({
        state: "finalised",
        providerStatus: "REVIEW_AND_SHARE",
      });
      bound.status = "REVIEW_AND_SHARE";
    }
    if (bound.status === "REVIEW_AND_SHARE") {
      await sourceCheck(token, s, details.version);
      await beforeTransfer();
      await rocketRequest(
        `/document-manager/v1/binders/${s.binderId}/requests/invitations`,
        token,
        "POST",
        {
          subject: "Rental document ready for signature",
          message:
            "Open this document through your private FurnishSearcher account",
          recipients: [
            { partyId: s.ownerPartyId, notification: false },
            { partyId: s.tenantPartyId, notification: false },
          ],
        },
      );
      await checkpoint({
        state: "invited",
        providerStatus: "SIGN_IN_PROGRESS",
        error: undefined,
      });
    } else if (bound.status === "SIGN_IN_PROGRESS")
      await checkpoint({
        state: "invited",
        providerStatus: bound.status,
        error: undefined,
      });
    else if (bound.status === "SIGN_COMPLETED")
      await refresh(ctx, id, true, token, true);
    else throw new Error("Provider returned an unsupported signing state.");
  } catch (e) {
    await checkpoint({
      state: s.binderId
        ? "failed"
        : s.creationAttemptedAt || attemptedCreation
          ? "unknown"
          : "failed",
      error: e instanceof Error ? e.message : "Provider setup needs review.",
    });
    throw e;
  } finally {
    await ctx.runMutation(internal.rocketSignData.claimSetup, {
      id,
      release: true,
    });
  }
}
async function refresh(
  ctx: ActionCtx,
  id: Id<"rentalSignatures">,
  requireParticipant: boolean,
  tokenInput?: string,
  insideSetup = false,
) {
  const expectedPollAt = await ctx.runMutation(
    internal.rocketSignData.claimPoll,
    { id, requireParticipant, insideSetup },
  );
  if (expectedPollAt === null) return;
  const { s, version } = await ctx.runQuery(internal.rocketSignData.session, {
    id,
    requireParticipant,
  });
  if (s.lastPollAt !== expectedPollAt) return;
  if (s.state === "completed" || s.state === "cancelled") return;
  if (!s.binderId) return;
  const token = tokenInput ?? (await rocketToken());
  const binder = (
      await rocketRequest(`/document-manager/v1/binders/${s.binderId}`, token)
    ).data,
    bound = bindRocket(binder, { ...s, binderId: rocketId(s.binderId) });
  if (
    bound.status === "IN_PREPARATION" &&
    ["SIGN_IN_PROGRESS", "REVIEW_AND_SHARE"].includes(s.providerStatus ?? "")
  ) {
    await ctx.runMutation(internal.rocketSignData.recordCancellation, {
      id,
      generation: s.generation,
      expectedPollAt,
    });
    return;
  }
  if (bound.status === "SIGN_COMPLETED") {
    await sourceCheck(token, s, version);
    const signed = (
      await rocketRequest(
        `/document-manager/v1/binders/${s.binderId}/documents/${s.providerDocumentId}`,
        token,
        "GET",
        undefined,
        true,
      )
    ).bytes;
    validatePdf(signed);
    const encrypted = await encryptDocument(signed),
      storageId = await ctx.storage.store(
        new Blob([encrypted.payload], { type: "application/octet-stream" }),
      );
    try {
      const kept = await ctx.runMutation(internal.rocketSignData.finish, {
        id,
        generation: s.generation,
        expectedPollAt,
        storageId,
        keyId: encrypted.keyId,
        bytes: signed.length,
        sha256: await documentHash(signed),
      });
      if (!kept) await ctx.storage.delete(storageId);
    } catch (e) {
      await ctx.storage.delete(storageId);
      throw e;
    }
  } else {
    const state =
      bound.status === "SIGN_IN_PROGRESS"
        ? "invited"
        : bound.status === "REVIEW_AND_SHARE"
          ? "finalised"
          : bound.status === "IN_PREPARATION"
            ? "created"
            : "failed";
    await ctx.runMutation(internal.rocketSignData.checkpoint, {
      id,
      generation: s.generation,
      expectedPollAt,
      state,
      ...providerFields(bound),
      error:
        state === "failed"
          ? "Provider signing state requires review."
          : undefined,
    });
  }
}
export const start = action({
  args: {
    documentId: v.id("rentalDocuments"),
    versionId: v.id("rentalDocumentVersions"),
    confirmed: v.boolean(),
  },
  returns: v.id("rentalSignatures"),
  handler: async (ctx, args): Promise<Id<"rentalSignatures">> => {
    rocketConfig();
    const id: Id<"rentalSignatures"> = await ctx.runMutation(
      internal.rocketSignData.begin,
      args,
    );
    await setup(ctx, id);
    return id;
  },
});
export const check = action({
  args: { documentId: v.id("rentalDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.runQuery(
      internal.rocketSignData.forDocument,
      args,
    );
    if (!status) throw new Error("Signing session is unavailable.");
    await refresh(ctx, status, true);
    return null;
  },
});
export const recover = action({
  args: { documentId: v.id("rentalDocuments"), binderId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const id = await ctx.runQuery(
      internal.rocketSignData.forDocument,
      args.documentId ? { documentId: args.documentId } : (args as never),
    );
    if (!id) throw new Error("Signing session is unavailable.");
    const { s } = await ctx.runQuery(internal.rocketSignData.session, {
        id,
        requireParticipant: true,
      }),
      user = await ctx.runQuery(internal.rocketSignData.caller, {});
    if (s.ownerId !== user || s.binderId)
      throw new Error(
        "Only the owner can recover a setup without a provider reference.",
      );
    const binderId = rocketId(args.binderId),
      token = await rocketToken(),
      binder = (
        await rocketRequest(`/document-manager/v1/binders/${binderId}`, token)
      ).data,
      bound = bindRocket(binder, { ...s, binderId });
    await ctx.runMutation(internal.rocketSignData.checkpoint, {
      id,
      generation: s.generation,
      state: "created",
      binderId,
      ...providerFields(bound),
    });
    await setup(ctx, id);
    return null;
  },
});
export const signingUrl = action({
  args: { documentId: v.id("rentalDocuments") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const id = await ctx.runQuery(internal.rocketSignData.forDocument, args);
    if (!id) throw new Error("Signing is not prepared.");
    const { s } = await ctx.runQuery(internal.rocketSignData.session, {
        id,
        requireParticipant: true,
      }),
      user = await ctx.runQuery(internal.rocketSignData.caller, {});
    if (!s.binderId || !["invited", "completed", "finalised"].includes(s.state))
      throw new Error(
        "Finish preparing this document before opening Rocket Lawyer.",
      );
    const token = await rocketToken(),
      binder = (
        await rocketRequest(`/document-manager/v1/binders/${s.binderId}`, token)
      ).data,
      bound = bindRocket(binder, { ...s, binderId: rocketId(s.binderId) }),
      partyId = user === s.ownerId ? bound.ownerPartyId : bound.tenantPartyId;
    if (
      !["SIGN_IN_PROGRESS", "REVIEW_AND_SHARE", "SIGN_COMPLETED"].includes(
        bound.status,
      )
    )
      throw new Error(
        "The provider signing process changed. Refresh its current status first.",
      );
    const original = await ctx.runQuery(internal.rocketSignData.session, {
      id,
      requireParticipant: true,
    });
    await sourceCheck(token, s, original.version);
    const expires = Math.floor(Date.now() / 1000) + 60,
      r = await rocketRequest("/partners/v1/auth/servicetoken", token, "POST", {
        purpose: "api.rocketlawyer.com/binder-party-access",
        expirationTime: expires,
        upid: partyId,
      });
    if (
      typeof r.data?.token !== "string" ||
      r.data.token.length < 8 ||
      r.data.token.length > 16000 ||
      r.data.purpose !== "api.rocketlawyer.com/binder-party-access" ||
      typeof r.data.expirationTime !== "number" ||
      !Number.isSafeInteger(r.data.expirationTime) ||
      r.data.expirationTime > expires + 5 ||
      r.data.expirationTime < Math.floor(Date.now() / 1000)
    )
      throw new Error(
        "Provider returned an invalid signer-scoped access token.",
      );
    const url = new URL(rocketConfig().signUrl);
    url.hash = `serviceToken=${encodeURIComponent(r.data.token)}`;
    return url.toString();
  },
});
export const pollDue = internalAction({
  args: { before: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const before = Math.min(
      args.before ?? Date.now() - 5 * 60000,
      Date.now() - 5 * 60000,
    );
    try {
      rocketConfig();
    } catch {
      return null;
    }
    const ids = await ctx.runQuery(internal.rocketSignData.due, { before });
    for (const id of ids)
      try {
        await refresh(ctx, id, false);
      } catch {
        await ctx.runMutation(internal.rocketSignData.pollFailure, { id });
      }
    if (ids.length === 8)
      await ctx.scheduler.runAfter(5000, internal.rocketSign.pollDue, {
        before,
      });
    return null;
  },
});
