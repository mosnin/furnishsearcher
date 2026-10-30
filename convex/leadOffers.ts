import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { offerRank } from "./lib/leadOffers";
import { classifyLead } from "./lib/housing";
export const backfill = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("housingRequestMatches")
      .withIndex("by_rank_version", (q) => q.eq("rankVersion", undefined))
      .take(25);
    for (const row of rows) {
      const [request, listing] = await Promise.all([
        ctx.db.get(row.requestId),
        ctx.db.get(row.listingId),
      ]);
      if (!request || !listing || listing.landlordId !== row.landlordId)
        await ctx.db.patch(row._id, { rankVersion: 1, offerKind: 2 });
      else
        await ctx.db.patch(
          row._id,
          offerRank(
            request,
            listing,
            await classifyLead(ctx, listing, request),
          ),
        );
    }
    if (rows.length === 25)
      await ctx.scheduler.runAfter(0, internal.leadOffers.backfill, {});
    return rows.length;
  },
});
