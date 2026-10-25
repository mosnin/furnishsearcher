import type { MutationCtx, QueryCtx } from "../_generated/server";
import { billingMode } from "../../lib/billing";
import {
  marketScope,
  MARKET_DAY,
  shapeBuckets,
  mergeBuckets,
  type DemandShape,
} from "../../lib/market-insights";
export function marketMode(): "test" | "prod" {
  try {
    return billingMode();
  } catch {
    return "test";
  }
}
export async function marketState(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("marketState")
    .withIndex("by_key", (q) => q.eq("key", `market-v1:${marketMode()}`))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("marketState", {
    key: `market-v1:${marketMode()}`,
    collectedSince: Date.now(),
  });
  return (await ctx.db.get(id))!;
}
export async function marketHash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function recordDemand(
  ctx: MutationCtx,
  kind: "search" | "inquiry" | "conversation" | "housing_request",
  actor: string,
  shape: DemandShape,
) {
  await marketState(ctx);
  const now = Date.now(),
    day = Math.floor(now / MARKET_DAY) * MARKET_DAY;
  let cityScope: string | undefined;
  if (shape.city && shape.state) {
    try {
      cityScope = marketScope(shape.city, shape.state);
    } catch {
      /* Legacy location data does not block a rental workflow. */
    }
  }
  const scopes = ["all", ...(cityScope ? [cityScope] : [])];
  const mode = marketMode(),
    hashed = await marketHash(`${mode}:${actor}`);
  for (const rawScope of scopes) {
    const scope = `${mode}|${rawScope}`;
    const row = await ctx.db
      .query("marketDemandDays")
      .withIndex("by_scope", (q) =>
        q.eq("scope", scope).eq("kind", kind).eq("day", day),
      )
      .unique();
    const buckets = shapeBuckets(shape);
    if (row)
      await ctx.db.patch(row._id, {
        count: row.count + 1,
        buckets: mergeBuckets(row.buckets, buckets),
      });
    else
      await ctx.db.insert("marketDemandDays", {
        scope,
        kind,
        day,
        count: 1,
        buckets,
      });
    const member = await ctx.db
      .query("marketContributors")
      .withIndex("by_actor", (q) =>
        q.eq("scope", scope).eq("kind", kind).eq("actor", hashed),
      )
      .unique();
    if (member) await ctx.db.patch(member._id, { lastSeen: day });
    else
      await ctx.db.insert("marketContributors", {
        scope,
        kind,
        actor: hashed,
        lastSeen: day,
      });
  }
}
export async function currentSupply(ctx: QueryCtx, scope = "all") {
  const state = await ctx.db
    .query("marketState")
    .withIndex("by_key", (q) => q.eq("key", `market-v1:${marketMode()}`))
    .unique();
  const run = state?.latestSupplyId
    ? await ctx.db.get(state.latestSupplyId)
    : null;
  if (!run || run.state !== "complete" || run.mode !== marketMode())
    return { run: null, row: null, state };
  const row = await ctx.db
    .query("marketSupply")
    .withIndex("by_scope", (q) => q.eq("runId", run._id).eq("scope", scope))
    .unique();
  return { run, row, state };
}
