import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { marketMode } from "./lib/market";
import { publiclyVisible } from "./lib/publication";
import { recordMapEligibility } from "./lib/mapEligibility";
import { performanceWindow } from "../lib/listing-performance";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
async function scope(ctx: QueryCtx | MutationCtx, listingId?: Id<"listings">) {
  const me = await requireUser(ctx),
    listing = listingId ? await ctx.db.get(listingId) : null;
  if (
    listingId &&
    (!listing || (listing.landlordId !== me._id && me.role !== "admin"))
  )
    throw new Error("Not authorized to view this map eligibility history.");
  return { me, listing };
}
export const report = query({
  args: { listingId: v.optional(v.id("listings")), days: v.number() },
  returns: v.object({
    mode: v.union(v.literal("test"), v.literal("prod")),
    listingId: v.union(v.id("listings"), v.null()),
    currentEligible: v.union(v.boolean(), v.null()),
    totals: v.union(
      v.null(),
      v.object({
        eligibleSpaceDays: v.number(),
        observedSpaceDays: v.number(),
        firstCheckedAt: v.number(),
      }),
    ),
    rows: v.array(
      v.object({
        day: v.number(),
        observedSpaces: v.number(),
        eligibleSpaces: v.number(),
        firstCheckedAt: v.number(),
        lastCheckedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { me, listing } = await scope(ctx, args.listingId),
      mode = marketMode(),
      { start, end } = performanceWindow(args.days);
    const rows = listing
      ? (
          await ctx.db
            .query("mapEligibilityDays")
            .withIndex("by_listing_owner_mode_day", (q) =>
              q
                .eq("listingId", listing._id)
                .eq("ownerId", listing.landlordId)
                .eq("mode", mode)
                .gte("day", start)
                .lt("day", end),
            )
            .take(91)
        ).map((r) => ({
          day: r.day,
          observedSpaces: 1,
          eligibleSpaces: r.qualified ? 1 : 0,
          firstCheckedAt: r.firstCheckedAt,
          lastCheckedAt: r.lastCheckedAt,
        }))
      : (
          await ctx.db
            .query("ownerMapEligibilityDays")
            .withIndex("by_owner_mode_day", (q) =>
              q
                .eq("ownerId", me._id)
                .eq("mode", mode)
                .gte("day", start)
                .lt("day", end),
            )
            .take(91)
        ).map(
          ({
            day,
            observedSpaces,
            eligibleSpaces,
            firstCheckedAt,
            lastCheckedAt,
          }) => ({
            day,
            observedSpaces,
            eligibleSpaces,
            firstCheckedAt,
            lastCheckedAt,
          }),
        );
    const point =
      listing &&
      Number.isFinite(listing.mapLatitude) &&
      Number.isFinite(listing.mapLongitude) &&
      Math.abs(listing.mapLatitude!) <= 90 &&
      Math.abs(listing.mapLongitude!) <= 180;
    const totals = await ctx.db
      .query("mapEligibilityTotals")
      .withIndex("by_listing_owner_mode", (q) =>
        q
          .eq("listingId", listing?._id)
          .eq("ownerId", listing?.landlordId ?? me._id)
          .eq("mode", mode),
      )
      .unique();
    return {
      totals: totals
        ? {
            eligibleSpaceDays: totals.eligibleSpaceDays,
            observedSpaceDays: totals.observedSpaceDays,
            firstCheckedAt: totals.firstCheckedAt,
          }
        : null,
      mode,
      listingId: listing?._id ?? null,
      currentEligible: listing
        ? !!point && (await publiclyVisible(ctx, listing))
        : null,
      rows,
    };
  },
});
export const check = mutation({
  args: { listingId: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { listing } = await scope(ctx, args.listingId);
    await recordMapEligibility(ctx, listing!);
    return null;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Math.floor(Date.now() / 86400000) * 86400000 - 91 * 86400000;
    let more = false;
    for (const table of [
      "mapEligibilityDays",
      "ownerMapEligibilityDays",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_day", (q) => q.lt("day", cutoff))
        .take(100);
      for (const row of rows) await ctx.db.delete(row._id);
      if (rows.length === 100) more = true;
    }
    if (more)
      await ctx.scheduler.runAfter(0, internal.mapEligibility.cleanup, {});
    return null;
  },
});
