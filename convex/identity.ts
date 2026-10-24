import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  internalAction,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { identityStatus } from "./validators/identity";
import {
  identityConfig,
  identityConfigured,
  hostedIdentityUrl,
  identityDecision,
} from "../lib/identity";
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx),
      check = user.identityCheckId
        ? await ctx.db.get(user.identityCheckId)
        : null;
    let mode;
    try {
      mode = identityConfig().mode;
    } catch {
      mode = check?.mode;
    }
    const current = check?.mode === mode ? check : null;
    return {
      configured: identityConfigured(),
      status: user.identityHold ? "review" : (current?.status ?? "not_started"),
      mode,
      verifiedAt: current?.verifiedAt,
      reference: current?._id,
      sessionExpired:
        current?.status === "pending" && (current.expiresAt ?? 0) <= Date.now(),
    };
  },
});
export const begin = internalMutation({
  args: {
    region: v.string(),
    workflowKey: v.string(),
    mode: v.union(v.literal("test"), v.literal("prod")),
    retryExpired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      previous = user.identityCheckId
        ? await ctx.db.get(user.identityCheckId)
        : null;
    if (user.identityHold)
      throw new Error("Your identity verification needs staff review.");
    if (previous && previous.mode === args.mode) {
      if (
        previous.status === "passed" ||
        previous.status === "review" ||
        previous.status === "creating" ||
        (previous.status === "pending" &&
          !(args.retryExpired && previous.accountId))
      )
        return { check: previous, fresh: false };
      if (previous.createdAt > Date.now() - 600000)
        throw new Error("Please wait before starting another identity check.");
    }
    const recent = await ctx.db
      .query("identityChecks")
      .withIndex("by_user", (q) =>
        q.eq("userId", user._id).gte("createdAt", Date.now() - 86400000),
      )
      .take(4);
    if (recent.length >= 3)
      throw new Error("Identity check limit reached. Contact support.");
    if (previous?.status === "pending")
      await ctx.db.patch(previous._id, {
        status: "failed",
        lastPollAt: Date.now(),
      });
    const { retryExpired, ...configuration } = args;
    const accountId =
      retryExpired && previous?.mode === args.mode
        ? previous.accountId
        : undefined;
    const id = await ctx.db.insert("identityChecks", {
      userId: user._id,
      ...configuration,
      ...(accountId ? { accountId } : {}),
      status: "creating",
      createdAt: Date.now(),
      lastPollAt: 0,
    });
    await ctx.db.patch(user._id, { identityCheckId: id });
    return { check: (await ctx.db.get(id))!, fresh: true };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("identityChecks"),
    accountId: v.string(),
    workflowId: v.string(),
    hostedUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.id);
    if (!check || check.status !== "creating") return null;
    await ctx.db.patch(check._id, {
      status: "pending",
      accountId: args.accountId,
      workflowId: args.workflowId,
      hostedUrl: hostedIdentityUrl(args.hostedUrl),
      expiresAt: Date.now() + 3600000,
      lastPollAt: 0,
    });
    return null;
  },
});
export const initFailed = internalMutation({
  args: { id: v.id("identityChecks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.id);
    if (check?.status === "creating")
      await ctx.db.patch(check._id, {
        status: "review",
        checkedAt: Date.now(),
      });
    return null;
  },
});
export const getCheck = internalQuery({
  args: { id: v.id("identityChecks"), own: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.id);
    if (args.own) {
      const user = await requireUser(ctx);
      if (check?.userId !== user._id) throw new Error("Not authorized");
    }
    return check;
  },
});
export const apply = internalMutation({
  args: {
    id: v.id("identityChecks"),
    status: identityStatus,
    generation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.id);
    if (
      !check ||
      !["pending", "review"].includes(check.status) ||
      (check.refreshGeneration ?? 0) !== (args.generation ?? 0)
    )
      return null;
    const user = await ctx.db.get(check.userId);
    if (!user || user.identityCheckId !== check._id || user.identityHold)
      return null;
    if (check.status !== args.status)
      await ctx.db.insert("identityResultAudit", {
        checkId: check._id,
        status: args.status,
        observedAt: Date.now(),
      });
    await ctx.db.patch(check._id, {
      status: args.status,
      checkedAt: Date.now(),
      lastPollAt: Date.now(),
      ...(args.status === "passed"
        ? { verifiedAt: Date.now(), hostedUrl: undefined }
        : {}),
    });
    await ctx.scheduler.runAfter(0, internal.publication.reconcileOwner, {
      userId: check.userId,
      cursor: null,
    });
    return null;
  },
});
export const token = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("providerTokens")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return token && token.expiresAt > Date.now() + 60000 ? token.token : null;
  },
});
export const cacheToken = internalMutation({
  args: { key: v.string(), token: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("providerTokens")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (current) await ctx.db.patch(current._id, args);
    else await ctx.db.insert("providerTokens", args);
    return null;
  },
});
async function accessToken(
  ctx: any,
  config: ReturnType<typeof identityConfig>,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${config.region}:${config.clientId}:${config.clientSecret}`,
    ),
  );
  const key = Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  const cached = await ctx.runQuery(internal.identity.token, { key });
  if (cached) return cached;
  const encoded = btoa(
    String.fromCharCode(
      ...new TextEncoder().encode(`${config.clientId}:${config.clientSecret}`),
    ),
  );
  const response = await fetch(
    `https://auth.${config.region}.jumio.ai/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${encoded}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error("Identity verification is temporarily unavailable.");
  const data = await response.json();
  if (
    typeof data.access_token !== "string" ||
    typeof data.expires_in !== "number" ||
    data.expires_in < 120 ||
    data.expires_in > 86400
  )
    throw new Error("Invalid identity authentication response.");
  await ctx.runMutation(internal.identity.cacheToken, {
    key,
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}
export const start = action({
  args: { retryExpired: v.optional(v.boolean()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Please sign in.");
    const config = identityConfig();
    const { check, fresh } = await ctx.runMutation(internal.identity.begin, {
      region: config.region,
      workflowKey: config.workflowKey,
      mode: config.mode,
      retryExpired: args.retryExpired,
    });
    if (!fresh) {
      if (check.status === "passed") return null;
      if (
        check.status === "pending" &&
        check.hostedUrl &&
        (check.expiresAt ?? 0) > Date.now()
      )
        return check.hostedUrl;
      throw new Error(
        "This verification needs a status refresh or support review before another attempt.",
      );
    }
    try {
      const token = await accessToken(ctx, config);
      const response = await fetch(
        `https://account.${config.region}.jumio.ai/api/v1/accounts${check.accountId ? `/${encodeURIComponent(check.accountId)}` : ""}`,
        {
          method: check.accountId ? "PUT" : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            customerInternalReference: check._id,
            workflowDefinition: { key: config.workflowKey },
          }),
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        throw new Error("Unable to start identity verification.");
      const data = await response.json();
      if (
        typeof data.account?.id !== "string" ||
        typeof data.workflowExecution?.id !== "string" ||
        typeof data.web?.href !== "string"
      )
        throw new Error("Identity provider returned an incomplete session.");
      const url = hostedIdentityUrl(data.web.href);
      await ctx.runMutation(internal.identity.finish, {
        id: check._id,
        accountId: data.account.id,
        workflowId: data.workflowExecution.id,
        hostedUrl: url,
      });
      return url;
    } catch {
      await ctx.runMutation(internal.identity.initFailed, { id: check._id });
      throw new Error(
        "The identity session could not be confirmed. Contact support with the reference shown on this page before starting again.",
      );
    }
  },
});
export const refresh = action({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const user = await ctx.runQuery(internal.identity.currentUser, {});
    if (!user.identityCheckId) throw new Error("Start verification first.");
    await ctx.runQuery(internal.identity.getCheck, {
      id: user.identityCheckId,
      own: true,
    });
    await ctx.runAction(internal.identity.refreshCheck, {
      id: user.identityCheckId,
    });
    return null;
  },
});
export const currentUser = internalQuery({
  args: {},
  handler: async (ctx) => requireUser(ctx),
});
export const refreshCheck = internalAction({
  args: { id: v.id("identityChecks") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const check = await ctx.runMutation(internal.identity.claim, args);
    if (!check || !check.accountId || !check.workflowId) return null;
    const config = identityConfig();
    if (
      config.region !== check.region ||
      config.mode !== check.mode ||
      config.workflowKey !== check.workflowKey
    )
      throw new Error(
        "Identity provider configuration changed. Contact support.",
      );
    const token = await accessToken(ctx, config);
    const response = await fetch(
      `https://retrieval.${config.region}.jumio.ai/api/v1/accounts/${encodeURIComponent(check.accountId)}/workflow-executions/${encodeURIComponent(check.workflowId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new Error(
        "The verification result is not available yet. Try again later.",
      );
    const status = identityDecision(await response.json(), {
      accountId: check.accountId,
      workflowId: check.workflowId,
      reference: check._id,
      workflowKey: check.workflowKey,
    });
    await ctx.runMutation(internal.identity.apply, {
      id: check._id,
      status,
      generation: check.refreshGeneration,
    });
    return null;
  },
});
export const pollPending = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!identityConfigured()) return null;
    const checks = await ctx.db
      .query("identityChecks")
      .withIndex("by_status_poll", (q) =>
        q.eq("status", "pending").lt("lastPollAt", Date.now() - 300000),
      )
      .take(25);
    for (const check of checks) {
      await ctx.db.patch(check._id, { lastPollAt: Date.now() - 30001 });
      await ctx.scheduler.runAfter(0, internal.identity.refreshCheck, {
        id: check._id,
      });
    }
    return null;
  },
});

export const claim = internalMutation({
  args: { id: v.id("identityChecks") },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.id);
    if (
      !check ||
      !["pending", "review"].includes(check.status) ||
      (check.lastPollAt ?? 0) > Date.now() - 30000
    )
      return null;
    const user = await ctx.db.get(check.userId);
    if (!user || user.identityHold || user.identityCheckId !== check._id)
      return null;
    const refreshGeneration = (check.refreshGeneration ?? 0) + 1;
    await ctx.db.patch(check._id, {
      lastPollAt: Date.now(),
      refreshGeneration,
    });
    return { ...check, refreshGeneration };
  },
});

export const forListing = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const reviewer = await requireUser(ctx);
    if (reviewer.role !== "admin") throw new Error("Staff access required.");
    const listing = await ctx.db.get(args.listingId),
      owner = listing ? await ctx.db.get(listing.landlordId) : null;
    const check = owner?.identityCheckId
      ? await ctx.db.get(owner.identityCheckId)
      : null;
    return check
      ? {
          id: check._id,
          status: check.status,
          onHold: !!owner?.identityHold,
          hasProviderSession: !!check.accountId && !!check.workflowId,
        }
      : null;
  },
});
export const review = mutation({
  args: {
    id: v.id("identityChecks"),
    action: v.union(
      v.literal("hold"),
      v.literal("recheck"),
      v.literal("recover"),
    ),
    note: v.string(),
    accountId: v.optional(v.string()),
    workflowId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reviewer = await requireUser(ctx);
    if (reviewer.role !== "admin") throw new Error("Staff access required.");
    const check = await ctx.db.get(args.id),
      note = args.note.trim();
    if (!check) throw new Error("Identity check not found.");
    if (note.length < 3 || note.length > 2000)
      throw new Error("Enter a review note of 3–2000 characters.");
    const owner = await ctx.db.get(check.userId);
    if (!owner || owner.identityCheckId !== check._id)
      throw new Error("Review the current identity attempt.");
    if (args.action === "hold") {
      await ctx.db.patch(owner._id, { identityHold: true });
      await ctx.db.patch(check._id, {
        status: "review",
        refreshGeneration: (check.refreshGeneration ?? 0) + 1,
        verifiedAt: undefined,
      });
    } else {
      const accountId =
          args.action === "recover" ? args.accountId : check.accountId,
        workflowId =
          args.action === "recover" ? args.workflowId : check.workflowId;
      if (
        !accountId ||
        !workflowId ||
        ![accountId, workflowId].every((value) =>
          /^[A-Za-z0-9-]{1,128}$/.test(value),
        )
      )
        throw new Error(
          "Confirm the provider account and workflow references first.",
        );
      await ctx.db.patch(owner._id, { identityHold: false });
      await ctx.db.patch(check._id, {
        accountId,
        workflowId,
        status: "pending",
        refreshGeneration: (check.refreshGeneration ?? 0) + 1,
        verifiedAt: undefined,
        lastPollAt: 0,
        hostedUrl: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.identity.refreshCheck, {
        id: check._id,
      });
    }
    await ctx.db.insert("identityReviewAudit", {
      checkId: check._id,
      reviewerId: reviewer._id,
      action: args.action,
      note,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.publication.reconcileOwner, {
      userId: owner._id,
      cursor: null,
    });
    return null;
  },
});
