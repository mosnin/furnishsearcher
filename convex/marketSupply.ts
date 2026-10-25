import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { marketState, marketMode } from "./lib/market";
import { publiclyVisible } from "./lib/publication";
import {
  marketScope,
  mergeBuckets,
  bedroomBucket,
  type Bucket,
} from "../lib/market-insights";
import { PROPERTY_TYPES, AMENITIES } from "../lib/search-options";

export const refresh = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const state = await marketState(ctx);
    const previous = state.buildingSupplyId
      ? await ctx.db.get(state.buildingSupplyId)
      : null;
    if (
      previous?.state === "building" &&
      previous.updatedAt > Date.now() - 1800000
    )
      return null;
    if (previous?.state === "building")
      await ctx.db.patch(previous._id, { state: "failed" });
    const runId = await ctx.db.insert("marketSupplyRuns", {
      state: "building",
      cursor: null,
      mode: marketMode(),
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("marketSupply", {
      runId,
      scope: "all",
      count: 0,
      sumCents: 0,
      avgCents: 0,
      owners: 0,
      cities: 0,
      buckets: [],
    });
    await ctx.db.patch(state._id, { buildingSupplyId: runId });
    await ctx.scheduler.runAfter(0, internal.marketSupply.scan, {
      runId,
      cursor: null,
    });
    return null;
  },
});
export const scan = internalMutation({
  args: {
    runId: v.id("marketSupplyRuns"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await marketState(ctx),
      run = await ctx.db.get(args.runId);
    if (
      !run ||
      run.state !== "building" ||
      run.cursor !== args.cursor ||
      state.buildingSupplyId !== run._id
    )
      return null;
    if (run.mode !== marketMode()) {
      await ctx.db.patch(run._id, { state: "failed" });
      return null;
    }
    const page = await ctx.db
      .query("listings")
      .paginate({ cursor: args.cursor, numItems: 30 });
    for (const listing of page.page) {
      if (!(await publiclyVisible(ctx, listing))) continue;
      let scope: string;
      try {
        scope = marketScope(listing.city, listing.state);
      } catch {
        continue;
      }
      const country = (await ctx.db
        .query("marketSupply")
        .withIndex("by_scope", (q) => q.eq("runId", run._id).eq("scope", "all"))
        .unique())!;
      const city = await ctx.db
        .query("marketSupply")
        .withIndex("by_scope", (q) => q.eq("runId", run._id).eq("scope", scope))
        .unique();
      const owner = await ctx.db
        .query("marketSupplyOwners")
        .withIndex("by_owner", (q) =>
          q.eq("runId", run._id).eq("ownerId", listing.landlordId),
        )
        .unique();
      if (!owner)
        await ctx.db.insert("marketSupplyOwners", {
          runId: run._id,
          ownerId: listing.landlordId,
        });
      const type = (PROPERTY_TYPES as readonly string[]).includes(
        listing.propertyType,
      )
        ? listing.propertyType
        : "Other";
      const buckets: Bucket[] = [
        { dimension: "type", key: type, count: 1 },
        {
          dimension: "bedrooms",
          key: bedroomBucket(listing.bedrooms),
          count: 1,
        },
        ...[...new Set(listing.amenities)]
          .filter((x) => (AMENITIES as readonly string[]).includes(x))
          .map((key) => ({ dimension: "amenity", key, count: 1 })),
      ];
      const cents = Math.round(listing.price * 100);
      await ctx.db.patch(country._id, {
        count: country.count + 1,
        sumCents: country.sumCents + cents,
        avgCents: Math.round((country.sumCents + cents) / (country.count + 1)),
        owners: country.owners + (owner ? 0 : 1),
        cities: country.cities + (city ? 0 : 1),
        buckets: mergeBuckets(country.buckets, buckets),
      });
      if (city)
        await ctx.db.patch(city._id, {
          count: city.count + 1,
          sumCents: city.sumCents + cents,
          avgCents: Math.round((city.sumCents + cents) / (city.count + 1)),
          buckets: mergeBuckets(city.buckets, buckets),
        });
      else
        await ctx.db.insert("marketSupply", {
          runId: run._id,
          scope,
          city: listing.city.trim(),
          state: scope.split("|")[0],
          count: 1,
          sumCents: cents,
          avgCents: cents,
          owners: 0,
          cities: 1,
          buckets,
        });
    }
    await ctx.db.patch(run._id, {
      cursor: page.continueCursor,
      updatedAt: Date.now(),
      ...(page.isDone
        ? { state: "complete" as const, completedAt: Date.now() }
        : {}),
    });
    if (page.isDone)
      await ctx.db.patch(state._id, {
        latestSupplyId: run._id,
        buildingSupplyId: undefined,
      });
    else
      await ctx.scheduler.runAfter(0, internal.marketSupply.scan, {
        runId: run._id,
        cursor: page.continueCursor,
      });
    return null;
  },
});

export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const state = await marketState(ctx);
    const building = state.buildingSupplyId
      ? await ctx.db.get(state.buildingSupplyId)
      : null;
    const latest = state.latestSupplyId
      ? await ctx.db.get(state.latestSupplyId)
      : null;
    if (
      (building?.state === "building" &&
        building.updatedAt < Date.now() - 1800000) ||
      (!building && (!latest || latest.completedAt! < Date.now() - 86400000)) ||
      (building && building.state !== "building")
    )
      await ctx.scheduler.runAfter(0, internal.marketSupply.refresh, {});
    return null;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("marketSupplyRuns")
      .withIndex("by_started", (q) =>
        q.lt("startedAt", Date.now() - 7 * 86400000),
      )
      .take(10);
    let more = false;
    for (const run of runs) {
      const state = await ctx.db
        .query("marketState")
        .withIndex("by_key", (q) => q.eq("key", `market-v1:${run.mode}`))
        .unique();
      if (
        state?.latestSupplyId === run._id ||
        state?.buildingSupplyId === run._id
      )
        continue;
      const rows = await ctx.db
        .query("marketSupply")
        .withIndex("by_scope", (q) => q.eq("runId", run._id))
        .take(100);
      const owners = await ctx.db
        .query("marketSupplyOwners")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .take(100);
      for (const row of [...rows, ...owners]) await ctx.db.delete(row._id);
      if (rows.length < 100 && owners.length < 100)
        await ctx.db.delete(run._id);
      else more = true;
    }
    if (more)
      await ctx.scheduler.runAfter(0, internal.marketSupply.cleanup, {});
    return null;
  },
});
