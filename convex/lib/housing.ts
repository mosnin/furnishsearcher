import { publiclyVisible } from "./publication";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { housingAreaMatches, housingDifferences } from "../../lib/housing";
import { DAY, isAvailable } from "../../lib/stays";
import { matchesCriteria, type HousingCriteria } from "../../lib/housing";
export { prepareCriteria, type HousingCriteria } from "../../lib/housing";

export async function listingFits(
  ctx: QueryCtx | MutationCtx,
  listing: Doc<"listings">,
  request: HousingCriteria,
) {
  if (
    !(await publiclyVisible(ctx, listing)) ||
    !matchesCriteria(listing, request)
  )
    return false;
  const end =
    request.moveOutDate ?? request.moveInDate + request.duration * 30 * DAY;
  const conflict = await ctx.db
    .query("availabilityBlocks")
    .withIndex("by_listing_start", (q) =>
      q.eq("listingId", listing._id).lt("startDate", end),
    )
    .filter((q) => q.gt(q.field("endDate"), request.moveInDate))
    .first();
  return conflict === null;
}

export async function classifyLead(
  ctx: QueryCtx | MutationCtx,
  listing: Doc<"listings">,
  request: HousingCriteria,
) {
  if (
    !housingAreaMatches(listing, request) ||
    !(await publiclyVisible(ctx, listing))
  )
    return null;
  const end =
    request.moveOutDate ?? request.moveInDate + request.duration * 30 * DAY;
  if (!isAvailable(listing, [], request.moveInDate, end)) return null;
  const conflict = await ctx.db
    .query("availabilityBlocks")
    .withIndex("by_listing_start", (q) =>
      q.eq("listingId", listing._id).lt("startDate", end),
    )
    .filter((q) => q.gt(q.field("endDate"), request.moveInDate))
    .first();
  if (conflict) return null;
  const differences = housingDifferences(listing, request);
  if (differences.length && request.allowUnmatched !== true) return null;
  return {
    kind: differences.length ? ("unmatched" as const) : ("matched" as const),
    differences,
    differenceKey: JSON.stringify(differences),
  };
}
