import { recordMapEligibility } from "./mapEligibility";
import { GeospatialIndex } from "@convex-dev/geospatial";
import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { SORT_OPTIONS } from "../../lib/search-options";
export const geo = new GeospatialIndex<
  string,
  { sort: string; status: string }
>(components.geospatial, { logLevel: "ERROR" });
export async function syncGeo(
  ctx: MutationCtx,
  l: Doc<"listings">,
  onlyViews = false,
) {
  if (!onlyViews) await recordMapEligibility(ctx, l);
  if (l.mapLatitude === undefined || l.mapLongitude === undefined) return;
  for (const sort of onlyViews ? (["most_viewed"] as const) : SORT_OPTIONS) {
    const score =
      sort === "newest"
        ? -l.createdAt
        : sort === "price_asc"
          ? l.price
          : sort === "price_desc"
            ? -l.price
            : -l.views;
    await geo.insert(
      ctx,
      `${sort}:${l._id}`,
      { latitude: l.mapLatitude, longitude: l.mapLongitude },
      { sort, status: l.status },
      score,
    );
  }
}
export async function removeGeo(ctx: MutationCtx, l: Doc<"listings">) {
  await recordMapEligibility(ctx, l, true);
  if (l.mapLatitude === undefined) return;
  for (const sort of SORT_OPTIONS) await geo.remove(ctx, `${sort}:${l._id}`);
}
