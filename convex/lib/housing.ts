import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DAY } from "../../lib/stays";
import { matchesCriteria, type HousingCriteria } from "../../lib/housing";
export { prepareCriteria, type HousingCriteria } from "../../lib/housing";

export async function listingFits(
  ctx: QueryCtx | MutationCtx,
  listing: Doc<"listings">,
  request: HousingCriteria,
) {
  if (!matchesCriteria(listing, request)) return false;
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
