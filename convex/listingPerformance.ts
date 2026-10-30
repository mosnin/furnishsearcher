import { findActiveUser } from "./lib/auth";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { publiclyVisible } from "./lib/publication";
import { marketMode, marketHash } from "./lib/market";
import { recordPerformance } from "./lib/performance";
import { syncGeo } from "./lib/geo";
import { browserActivity, performanceCounts } from "./validators/performance";
import { performanceWindow, PERFORMANCE_DAY } from "../lib/listing-performance";
export const properties = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id("listings"),
      title: v.string(),
      status: v.string(),
      price: v.number(),
      unitName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    const me = await requireUser(ctx);
    const result = await ctx.db
      .query("listings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", me._id))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(30, paginationOpts.numItems),
      });
    return {
      ...result,
      page: result.page.map((l) => ({
        id: l._id,
        title: l.title,
        status: l.status,
        price: l.price,
        unitName: l.unitName,
      })),
    };
  },
});
export const report = query({
  args: {
    listingId: v.optional(v.id("listings")),
    days: v.number(),
    refreshKey: v.optional(v.union(v.string(), v.number())),
  },
  returns: v.object({
    listingId: v.union(v.id("listings"), v.null()),
    title: v.string(),
    price: v.union(v.number(), v.null()),
    status: v.union(v.string(), v.null()),
    mode: v.union(v.literal("test"), v.literal("prod")),
    startedAt: v.union(v.number(), v.null()),
    phoneStartedAt: v.union(v.number(), v.null()),
    unmatchedStartedAt: v.union(v.number(), v.null()),
    legacyViews: v.union(v.number(), v.null()),
    generatedAt: v.number(),
    start: v.number(),
    end: v.number(),
    rows: v.array(v.object({ day: v.number(), ...performanceCounts })),
  }),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx),
      l = args.listingId ? await ctx.db.get(args.listingId) : null;
    if (
      args.listingId &&
      (!l || (l.landlordId !== me._id && me.role !== "admin"))
    )
      throw new Error("Not authorized to read these listing statistics.");
    const { start, end } = performanceWindow(args.days),
      mode = marketMode();
    const state = l
      ? await ctx.db
          .query("listingPerformanceState")
          .withIndex("by_listing_owner_mode", (q) =>
            q
              .eq("listingId", l._id)
              .eq("ownerId", l.landlordId)
              .eq("mode", mode),
          )
          .unique()
      : await ctx.db
          .query("ownerPerformanceState")
          .withIndex("by_owner_mode", (q) =>
            q.eq("ownerId", me._id).eq("mode", mode),
          )
          .unique();
    const rows = l
      ? await ctx.db
          .query("listingPerformanceDays")
          .withIndex("by_listing_day", (q) =>
            q
              .eq("listingId", l._id)
              .eq("ownerId", l.landlordId)
              .eq("mode", mode)
              .gte("day", start)
              .lt("day", end),
          )
          .take(91)
      : await ctx.db
          .query("ownerPerformanceDays")
          .withIndex("by_owner_day", (q) =>
            q
              .eq("ownerId", me._id)
              .eq("mode", mode)
              .gte("day", start)
              .lt("day", end),
          )
          .take(91);
    return {
      listingId: l?._id ?? null,
      title: l?.title ?? "All my rental spaces",
      price: l?.price ?? null,
      status: l?.status ?? null,
      mode,
      startedAt: state?.startedAt ?? null,
      phoneStartedAt: state?.phoneStartedAt ?? null,
      unmatchedStartedAt: state?.unmatchedStartedAt ?? null,
      legacyViews: l?.views ?? null,
      generatedAt: Date.now(),
      start,
      end,
      rows: rows.map(
        ({
          day,
          impressions,
          views,
          shares,
          saves,
          unsaves,
          bookingRequests,
          threads,
          matchedLeads,
          phoneReveals,
          unmatchedLeads,
        }) => ({
          day,
          impressions,
          views,
          shares,
          saves,
          unsaves,
          bookingRequests,
          threads,
          matchedLeads,
          phoneReveals: phoneReveals ?? 0,
          unmatchedLeads: unmatchedLeads ?? 0,
        }),
      ),
    };
  },
});
export const observe = mutation({
  args: {
    listingIds: v.array(v.id("listings")),
    kind: browserActivity,
    clientId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      args.listingIds.length > 24 ||
      !/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(
        args.clientId,
      )
    )
      throw new Error("Invalid listing observation.");
    const identity = await ctx.auth.getUserIdentity(),
      me = identity ? await findActiveUser(ctx, identity.subject) : null;
    if (me?.role === "admin") return null;
    const mode = marketMode(),
      day = Math.floor(Date.now() / PERFORMANCE_DAY) * PERFORMANCE_DAY;
    const actor = await marketHash(
      `${mode}:${identity ? `${identity.issuer}|${identity.subject}` : `page:${args.clientId}`}`,
    );
    const existing = await ctx.db
      .query("listingObservationLimits")
      .withIndex("by_actor_day", (q) => q.eq("actor", actor).eq("day", day))
      .unique();
    const seen = new Set(existing?.keys ?? []);
    let changed = false;
    for (const id of new Set(args.listingIds)) {
      const key = `${args.kind}:${id}`;
      if (seen.has(key) || seen.size >= 600) continue;
      const listing = await ctx.db.get(id);
      if (
        !listing ||
        me?._id === listing.landlordId ||
        !(await publiclyVisible(ctx, listing))
      )
        continue;
      seen.add(key);
      changed = true;
      await recordPerformance(ctx, listing, args.kind);
      if (args.kind === "views") {
        await ctx.db.patch(id, { views: listing.views + 1 });
        await syncGeo(ctx, { ...listing, views: listing.views + 1 }, true);
      }
    }
    if (changed) {
      const patch = { actor, day, keys: [...seen] };
      if (existing) await ctx.db.patch(existing._id, patch);
      else await ctx.db.insert("listingObservationLimits", patch);
    }
    return null;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const today = Math.floor(Date.now() / PERFORMANCE_DAY) * PERFORMANCE_DAY;
    const days = await ctx.db
      .query("listingPerformanceDays")
      .withIndex("by_day", (q) => q.lt("day", today - 89 * PERFORMANCE_DAY))
      .take(100);
    for (const row of days) await ctx.db.delete(row._id);
    const ownerDays = await ctx.db
      .query("ownerPerformanceDays")
      .withIndex("by_day", (q) => q.lt("day", today - 89 * PERFORMANCE_DAY))
      .take(100);
    for (const row of ownerDays) await ctx.db.delete(row._id);
    const observations = await ctx.db
      .query("listingObservationLimits")
      .withIndex("by_day", (q) => q.lt("day", today - 2 * PERFORMANCE_DAY))
      .take(100);
    for (const row of observations) await ctx.db.delete(row._id);
    if (
      days.length === 100 ||
      ownerDays.length === 100 ||
      observations.length === 100
    )
      await ctx.scheduler.runAfter(0, internal.listingPerformance.cleanup, {});
    return null;
  },
});
