import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { publiclyVisible } from "./publication";
import { marketMode } from "./market";
const DAY = 86400000;
export async function recordMapEligibility(
  ctx: MutationCtx,
  listing: Doc<"listings">,
  removed = false,
): Promise<void> {
  const now = Date.now(),
    day = Math.floor(now / DAY) * DAY,
    mode = marketMode(),
    ownerId = listing.landlordId;
  const point =
    Number.isFinite(listing.mapLatitude) &&
    Number.isFinite(listing.mapLongitude) &&
    Math.abs(listing.mapLatitude!) <= 90 &&
    Math.abs(listing.mapLongitude!) <= 180;
  const qualified = !removed && point && (await publiclyVisible(ctx, listing));
  const existing = await ctx.db
    .query("mapEligibilityDays")
    .withIndex("by_listing_owner_mode_day", (q) =>
      q
        .eq("listingId", listing._id)
        .eq("ownerId", ownerId)
        .eq("mode", mode)
        .eq("day", day),
    )
    .unique();
  // Initialize once from retained native observations when upgrading this collector.
  // Read before this check so the current day's delta cannot be counted twice.
  const totals = [];
  for (const listingId of [listing._id, undefined]) {
    let total = await ctx.db
      .query("mapEligibilityTotals")
      .withIndex("by_listing_owner_mode", (q) =>
        q.eq("listingId", listingId).eq("ownerId", ownerId).eq("mode", mode),
      )
      .unique();
    if (!total) {
      const previous = listingId
        ? (
            await ctx.db
              .query("mapEligibilityDays")
              .withIndex("by_listing_owner_mode_day", (q) =>
                q
                  .eq("listingId", listingId)
                  .eq("ownerId", ownerId)
                  .eq("mode", mode),
              )
              .order("desc")
              .take(92)
          ).map((r) => ({
            eligible: r.qualified ? 1 : 0,
            observed: 1,
            first: r.firstCheckedAt,
          }))
        : (
            await ctx.db
              .query("ownerMapEligibilityDays")
              .withIndex("by_owner_mode_day", (q) =>
                q.eq("ownerId", ownerId).eq("mode", mode),
              )
              .order("desc")
              .take(92)
          ).map((r) => ({
            eligible: r.eligibleSpaces,
            observed: r.observedSpaces,
            first: r.firstCheckedAt,
          }));
      const id = await ctx.db.insert("mapEligibilityTotals", {
        ...(listingId ? { listingId } : {}),
        ownerId,
        mode,
        eligibleSpaceDays: previous.reduce((n, r) => n + r.eligible, 0),
        observedSpaceDays: previous.reduce((n, r) => n + r.observed, 0),
        firstCheckedAt: Math.min(now, ...previous.map((r) => r.first)),
        lastCheckedAt: now,
      });
      total = (await ctx.db.get(id))!;
    }
    totals.push(total);
  }
  // A positive check establishes eligibility for at least part of this UTC day.
  // Later hiding does not erase it. Negative checks never invent full-day absence.
  const firstPositive = qualified && !existing?.qualified;
  for (const total of totals)
    await ctx.db.patch(total._id, {
      eligibleSpaceDays: total.eligibleSpaceDays + (firstPositive ? 1 : 0),
      observedSpaceDays: total.observedSpaceDays + (existing ? 0 : 1),
      lastCheckedAt: now,
    });
  if (existing)
    await ctx.db.patch(existing._id, {
      qualified: existing.qualified || qualified,
      lastQualified: qualified,
      lastCheckedAt: now,
    });
  else
    await ctx.db.insert("mapEligibilityDays", {
      listingId: listing._id,
      ownerId,
      mode,
      day,
      qualified,
      lastQualified: qualified,
      firstCheckedAt: now,
      lastCheckedAt: now,
    });
  const portfolio = await ctx.db
    .query("ownerMapEligibilityDays")
    .withIndex("by_owner_mode_day", (q) =>
      q.eq("ownerId", ownerId).eq("mode", mode).eq("day", day),
    )
    .unique();
  if (portfolio)
    await ctx.db.patch(portfolio._id, {
      observedSpaces: portfolio.observedSpaces + (existing ? 0 : 1),
      eligibleSpaces: portfolio.eligibleSpaces + (firstPositive ? 1 : 0),
      lastCheckedAt: now,
    });
  else
    await ctx.db.insert("ownerMapEligibilityDays", {
      ownerId,
      mode,
      day,
      observedSpaces: 1,
      eligibleSpaces: firstPositive ? 1 : 0,
      firstCheckedAt: now,
      lastCheckedAt: now,
    });
}
