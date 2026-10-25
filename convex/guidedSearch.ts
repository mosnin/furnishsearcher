import { getServiceToken } from "convex/server";
import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeSearch } from "../lib/search";
import {
  guidedSchema,
  guidedInstructions,
  interpretGuided,
  validateDescription,
} from "../lib/guided-search";
import { searchFields } from "./validators/search";
import { limitedText } from "../lib/email-webhook";
const DAY = 86400000;
const configuration = () => process.env.AI_SEARCH_ENABLED === "1";
export const availability = action({
  args: {},
  returns: v.object({
    available: v.boolean(),
    reason: v.union(
      v.literal("ready"),
      v.literal("not_enabled"),
      v.literal("provider_unavailable"),
    ),
  }),
  handler: async () => {
    // Capability probing mints a deployment-scoped token, never calls a model.
    try {
      await getServiceToken("ai-gateway");
    } catch {
      return { available: false, reason: "provider_unavailable" as const };
    }
    return configuration()
      ? { available: true, reason: "ready" as const }
      : { available: false, reason: "not_enabled" as const };
  },
});
export const claim = internalMutation({
  args: { actor: v.string(), requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now(),
      day = Math.floor(now / DAY),
      minute = Math.floor(now / 60000);
    const actorKey = `actor:${args.actor}`,
      globalKey = "global";
    const actor = await ctx.db
      .query("guidedSearchLimits")
      .withIndex("by_key", (q) => q.eq("key", actorKey))
      .unique();
    const global = await ctx.db
      .query("guidedSearchLimits")
      .withIndex("by_key", (q) => q.eq("key", globalKey))
      .unique();
    if (actor?.day === day && actor.requestIds?.includes(args.requestId))
      throw new Error(
        "This description was already submitted. Edit it or start a new interpretation.",
      );
    if ((actor?.busyUntil ?? 0) > now)
      throw new Error(
        "One description is already being interpreted. Wait a moment.",
      );
    if (
      (actor?.day === day && actor.dayCount >= 30) ||
      (actor?.minute === minute && actor.minuteCount >= 5) ||
      (global?.day === day && global.dayCount >= 100)
    )
      throw new Error(
        "AI search limit reached. Use standard search or try again later.",
      );
    for (const [key, row] of [
      [actorKey, actor],
      [globalKey, global],
    ] as const) {
      const patch = {
        key,
        day,
        minute,
        dayCount: row?.day === day ? row.dayCount + 1 : 1,
        minuteCount: row?.minute === minute ? row.minuteCount + 1 : 1,
        updatedAt: now,
        ...(key === actorKey
          ? {
              lastRequest: args.requestId,
              requestIds: [
                ...(row?.day === day ? (row.requestIds ?? []) : []),
                args.requestId,
              ],
              busyUntil: now + 30000,
            }
          : {}),
      };
      if (row) await ctx.db.patch(row._id, patch);
      else await ctx.db.insert("guidedSearchLimits", patch);
    }
    return null;
  },
});
export const finish = internalMutation({
  args: { actor: v.string(), requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("guidedSearchLimits")
      .withIndex("by_key", (q) => q.eq("key", `actor:${args.actor}`))
      .unique();
    if (row?.lastRequest === args.requestId)
      await ctx.db.patch(row._id, { busyUntil: 0 });
    return null;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("guidedSearchLimits")
      .withIndex("by_updated", (q) => q.lt("updatedAt", Date.now() - 3 * DAY))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.guidedSearch.cleanup, {});
    return null;
  },
});
export const interpret = action({
  args: {
    description: v.string(),
    base: v.object(searchFields),
    clientId: v.string(),
    requestId: v.string(),
    consent: v.boolean(),
    unapplied: v.optional(v.array(v.string())),
  },
  returns: v.object({
    filters: v.object(searchFields),
    unapplied: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    if (!args.consent)
      throw new Error(
        "Allow the description to be processed by AI, or use standard search.",
      );
    if (
      (args.unapplied?.length ?? 0) > 16 ||
      args.unapplied?.some((note) => note.length > 200)
    )
      throw new Error("Review the unresolved preferences and try again.");
    const description = validateDescription(args.description),
      base = normalizeSearch(args.base);
    if (
      JSON.stringify(base).length > 4096 ||
      ![args.clientId, args.requestId].every((s) =>
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          s,
        ),
      )
    )
      throw new Error("Refresh AI search and try again.");
    if (!configuration())
      throw new Error(
        "AI search is not enabled. You can still use all standard search filters.",
      );
    let token: string;
    try {
      token = await getServiceToken("ai-gateway");
    } catch {
      throw new Error(
        "AI search is unavailable for this deployment. Please use standard search.",
      );
    }
    const identity = await ctx.auth.getUserIdentity();
    const actorSource = identity
      ? `${identity.issuer}|${identity.subject}`
      : `page:${args.clientId}`;
    const actor = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(actorSource),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    await ctx.runMutation(internal.guidedSearch.claim, {
      actor,
      requestId: args.requestId,
    });
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch(
        "https://ai-gateway.convex.dev/v1/chat/completions",
        {
          method: "POST",
          redirect: "error",
          signal: abort.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            stream: false,
            temperature: 0,
            max_tokens: 1600,
            provider: {
              zdr: true,
              data_collection: "deny",
              require_parameters: true,
              max_price: { prompt: "0.5", completion: "2" },
            },
            messages: [
              {
                role: "system",
                content: guidedInstructions(Date.now(), base, args.unapplied),
              },
              { role: "user", content: description },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "rental_search",
                strict: true,
                schema: guidedSchema,
              },
            },
          }),
        },
      );
      if (!response.ok) throw new Error("provider_failed");
      const result = JSON.parse(await limitedText(response, 128 * 1024));
      const choice = result.choices?.[0];
      if (
        choice?.finish_reason !== "stop" ||
        choice.message?.refusal ||
        typeof choice.message?.content !== "string"
      )
        throw new Error("invalid_output");
      return interpretGuided(
        JSON.parse(choice.message.content),
        base,
        Date.now(),
      );
    } catch {
      // Never expose provider response bodies, prompts or tokens through errors/logs.
      throw new Error(
        "We could not reliably interpret that description. Clarify the dates and must-haves, try again, or use standard search.",
      );
    } finally {
      clearTimeout(timer);
      await ctx.runMutation(internal.guidedSearch.finish, {
        actor,
        requestId: args.requestId,
      });
    }
  },
});
