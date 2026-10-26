import { GeospatialIndex } from "@convex-dev/geospatial";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { responseStats } from "./responsiveness";
import { recommendationScore } from "../../lib/recommendations";
import { normalizeCity } from "../../lib/locations";
const geo = new GeospatialIndex<string, { sort: string; status: string }>(
  components.geospatialV2,
  { logLevel: "ERROR" },
);
export async function syncRecommendation(
  ctx: MutationCtx,
  listing: Doc<"listings">,
) {
  const stats = await responseStats(ctx, listing);
  const score = recommendationScore(
    stats.received,
    stats.onTime,
    listing.createdAt,
  );
  const previous = await ctx.db
    .query("listingRecommendations")
    .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
    .unique();
  const row = {
    listingId: listing._id,
    ownerId: listing.landlordId,
    city: normalizeCity(listing.city),
    propertyGroupId: listing.propertyGroupId,
    status: listing.status,
    score,
    updatedAt: Date.now(),
    geoIndexed:
      listing.mapLatitude !== undefined && listing.mapLongitude !== undefined,
  };
  if (previous) await ctx.db.patch(previous._id, row);
  else await ctx.db.insert("listingRecommendations", row);
  if (listing.mapLatitude !== undefined && listing.mapLongitude !== undefined)
    await geo.insert(
      ctx,
      `recommended:${listing._id}`,
      { latitude: listing.mapLatitude, longitude: listing.mapLongitude },
      { sort: "recommended", status: listing.status },
      -score,
    );
  else if (previous?.geoIndexed)
    await geo.remove(ctx, `recommended:${listing._id}`);
}
export async function removeRecommendation(
  ctx: MutationCtx,
  id: Id<"listings">,
) {
  const row = await ctx.db
    .query("listingRecommendations")
    .withIndex("by_listing", (q) => q.eq("listingId", id))
    .unique();
  if (row) await ctx.db.delete(row._id);
  if (row?.geoIndexed) await geo.remove(ctx, `recommended:${id}`);
}

export async function recommendationsReady(ctx: QueryCtx | MutationCtx) {
  const [rank, response] = await Promise.all([
    ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", "recommendationsV1"))
      .unique(),
    ctx.db
      .query("responseTrackingState")
      .withIndex("by_key", (q) => q.eq("key", "v1"))
      .unique(),
  ]);
  return !!rank?.complete && !!response?.complete;
}
