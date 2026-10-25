import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { marketMode } from "./market";
import {
  emptyPerformance,
  PERFORMANCE_DAY,
  type PerformanceMetric,
} from "../../lib/listing-performance";
export async function recordPerformance(
  ctx: MutationCtx,
  listing: Doc<"listings">,
  kind: PerformanceMetric,
) {
  const now = Date.now(),
    day = Math.floor(now / PERFORMANCE_DAY) * PERFORMANCE_DAY,
    mode = marketMode(),
    ownerId = listing.landlordId;
  const state = await ctx.db
    .query("listingPerformanceState")
    .withIndex("by_listing_owner_mode", (q) =>
      q.eq("listingId", listing._id).eq("ownerId", ownerId).eq("mode", mode),
    )
    .unique();
  if (!state)
    await ctx.db.insert("listingPerformanceState", {
      listingId: listing._id,
      ownerId,
      mode,
      startedAt: now,
    });
  const row = await ctx.db
    .query("listingPerformanceDays")
    .withIndex("by_listing_day", (q) =>
      q
        .eq("listingId", listing._id)
        .eq("ownerId", ownerId)
        .eq("mode", mode)
        .eq("day", day),
    )
    .unique();
  if (row) await ctx.db.patch(row._id, { [kind]: row[kind] + 1 });
  else
    await ctx.db.insert("listingPerformanceDays", {
      listingId: listing._id,
      ownerId,
      mode,
      day,
      ...emptyPerformance(),
      [kind]: 1,
    });
  const ownerState = await ctx.db
    .query("ownerPerformanceState")
    .withIndex("by_owner_mode", (q) =>
      q.eq("ownerId", ownerId).eq("mode", mode),
    )
    .unique();
  if (!ownerState)
    await ctx.db.insert("ownerPerformanceState", {
      ownerId,
      mode,
      startedAt: now,
    });
  const ownerDay = await ctx.db
    .query("ownerPerformanceDays")
    .withIndex("by_owner_day", (q) =>
      q.eq("ownerId", ownerId).eq("mode", mode).eq("day", day),
    )
    .unique();
  if (ownerDay)
    await ctx.db.patch(ownerDay._id, { [kind]: ownerDay[kind] + 1 });
  else
    await ctx.db.insert("ownerPerformanceDays", {
      ownerId,
      mode,
      day,
      ...emptyPerformance(),
      [kind]: 1,
    });
}
