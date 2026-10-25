import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { demandShapeValidator, bucket } from "./validators/market";
import {
  marketScope,
  MARKET_DAY,
  MIN_MARKET_CONTRIBUTORS,
  mergeBuckets,
  type DemandShape,
} from "../lib/market-insights";
import { PROPERTY_TYPES, AMENITIES } from "../lib/search-options";
import {
  recordDemand,
  marketHash,
  currentSupply,
  marketMode,
} from "./lib/market";
import { normalizeCity, normalizeState } from "../lib/locations";

function validated(shape: DemandShape) {
  marketScope(shape.city, shape.state);
  const sets: Record<string, readonly string[]> = {
    bedrooms: ["Any", "Studio", "1", "2", "3", "4+"],
    budget: [
      "Not specified",
      "Under $1,000",
      "$1,000–1,999",
      "$2,000–2,999",
      "$3,000–3,999",
      "$4,000+",
    ],
    lead: ["Not specified", "Under 30 days", "30–89 days", "90+ days"],
    duration: [
      "Not specified",
      "30–60 days",
      "61–90 days",
      "91–180 days",
      "181+ days",
    ],
  };
  for (const key of ["bedrooms", "budget", "lead", "duration"] as const)
    if (!sets[key].includes(shape[key]))
      throw new Error("Invalid market category");
  if (
    shape.types.length > PROPERTY_TYPES.length ||
    shape.amenities.length > AMENITIES.length ||
    shape.types.some(
      (x) => !(PROPERTY_TYPES as readonly string[]).includes(x),
    ) ||
    shape.amenities.some((x) => !(AMENITIES as readonly string[]).includes(x))
  )
    throw new Error("Invalid market category");
  return {
    ...shape,
    ...(shape.city
      ? { city: normalizeCity(shape.city), state: normalizeState(shape.state!) }
      : {}),
    types: [...new Set(shape.types)].sort(),
    amenities: [...new Set(shape.amenities)].sort(),
  };
}
export const recordSearch = mutation({
  args: { clientId: v.string(), shape: demandShapeValidator },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        args.clientId,
      )
    )
      throw new Error("Invalid observation reference");
    const shape = validated(args.shape),
      actor = await marketHash(`${marketMode()}:browser:${args.clientId}`),
      day = Math.floor(Date.now() / MARKET_DAY) * MARKET_DAY;
    const fingerprint = await marketHash(
      JSON.stringify({ ...shape, city: shape.city?.toLowerCase() }),
    );
    const limit = await ctx.db
      .query("marketSearchLimits")
      .withIndex("by_actor", (q) => q.eq("actor", actor).eq("day", day))
      .unique();
    if (
      limit &&
      (limit.fingerprints.includes(fingerprint) ||
        limit.fingerprints.length >= 20)
    )
      return false;
    if (limit)
      await ctx.db.patch(limit._id, {
        fingerprints: [...limit.fingerprints, fingerprint],
      });
    else
      await ctx.db.insert("marketSearchLimits", {
        actor,
        day,
        fingerprints: [fingerprint],
      });
    await recordDemand(ctx, "search", `browser:${args.clientId}`, shape);
    return true;
  },
});

export const overview = query({
  args: { city: v.optional(v.string()), state: v.optional(v.string()) },
  returns: v.object({
    scope: v.string(),
    mode: v.union(v.literal("test"), v.literal("prod")),
    collectedSince: v.union(v.number(), v.null()),
    from: v.number(),
    through: v.number(),
    supply: v.union(
      v.null(),
      v.object({
        startedAt: v.number(),
        completedAt: v.number(),
        listings: v.number(),
        avgCents: v.union(v.number(), v.null()),
        owners: v.number(),
        cities: v.number(),
        buckets: v.array(bucket),
      }),
    ),
    demand: v.array(
      v.object({
        kind: v.string(),
        visible: v.boolean(),
        count: v.union(v.number(), v.null()),
        buckets: v.array(bucket),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const scope = marketScope(args.city, args.state),
      { run, row, state } = await currentSupply(ctx, scope);
    const through =
        Math.floor(Date.now() / MARKET_DAY) * MARKET_DAY + MARKET_DAY,
      from = through - 30 * MARKET_DAY;
    const mode = marketMode(),
      demandScope = `${mode}|${scope}`,
      demand = [];
    for (const kind of [
      "search",
      "inquiry",
      "conversation",
      "housing_request",
    ] as const) {
      const contributors = await ctx.db
        .query("marketContributors")
        .withIndex("by_recent", (q) =>
          q
            .eq("scope", demandScope)
            .eq("kind", kind)
            .gte("lastSeen", from)
            .lt("lastSeen", through),
        )
        .take(MIN_MARKET_CONTRIBUTORS);
      if (contributors.length < MIN_MARKET_CONTRIBUTORS) {
        demand.push({ kind, visible: false, count: null, buckets: [] });
        continue;
      }
      const days = await ctx.db
        .query("marketDemandDays")
        .withIndex("by_scope", (q) =>
          q
            .eq("scope", demandScope)
            .eq("kind", kind)
            .gte("day", from)
            .lt("day", through),
        )
        .take(31);
      if (days.length > 30) {
        demand.push({ kind, visible: false, count: null, buckets: [] });
        continue;
      }
      demand.push({
        kind,
        visible: true,
        count: days.reduce((n, x) => n + x.count, 0),
        buckets: days.reduce(
          (out, x) => mergeBuckets(out, x.buckets),
          [] as Array<{ dimension: string; key: string; count: number }>,
        ),
      });
    }
    return {
      scope,
      mode,
      collectedSince: state?.collectedSince ?? null,
      from,
      through: Math.min(through, Date.now()),
      supply: run
        ? {
            startedAt: run.startedAt,
            completedAt: run.completedAt!,
            listings: row?.count ?? 0,
            avgCents: row?.count ? row.avgCents : null,
            owners: row?.owners ?? 0,
            cities: row?.cities ?? 0,
            buckets: row?.buckets ?? [],
          }
        : null,
      demand,
    };
  },
});

export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 45 * MARKET_DAY;
    const days = await ctx.db
      .query("marketDemandDays")
      .withIndex("by_day", (q) => q.lt("day", cutoff))
      .take(100);
    const actors = await ctx.db
      .query("marketContributors")
      .withIndex("by_time", (q) => q.lt("lastSeen", cutoff))
      .take(100);
    const limits = await ctx.db
      .query("marketSearchLimits")
      .withIndex("by_day", (q) => q.lt("day", Date.now() - 2 * MARKET_DAY))
      .take(100);
    for (const row of [...days, ...actors, ...limits])
      await ctx.db.delete(row._id);
    if (days.length === 100 || actors.length === 100 || limits.length === 100)
      await ctx.scheduler.runAfter(0, internal.marketInsights.cleanup, {});
    return null;
  },
});
