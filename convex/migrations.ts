import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { nextListingId } from "./lib/listingIds";
import { normalizeCity, normalizeState } from "../lib/locations";
export const searchIndexV1 = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    let migration = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", "searchIndexV1"))
      .unique();
    if (migration?.complete) return null;
    if (!migration) {
      const id = await ctx.db.insert("dataMigrations", {
        name: "searchIndexV1",
        cursor: null,
        complete: false,
      });
      migration = (await ctx.db.get(id))!;
    }
    const result = await ctx.db
      .query("listings")
      .paginate({ numItems: 40, cursor: migration.cursor });
    for (const listing of result.page)
      await ctx.db.patch(listing._id, {
        publicId: listing.publicId ?? (await nextListingId(ctx)),
        searchCity: normalizeCity(listing.city),
        searchState: normalizeState(listing.state),
      });
    await ctx.db.patch(migration._id, {
      cursor: result.continueCursor,
      complete: result.isDone,
    });
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.migrations.searchIndexV1, {});
    return null;
  },
});
