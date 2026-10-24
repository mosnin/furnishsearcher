import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { MAX_IMPORTED_BLOCKS } from "../../lib/calendar/limits";

export async function refreshCoverage(
  ctx: MutationCtx,
  listingId: Id<"listings">,
) {
  const feeds = await ctx.db
    .query("calendarFeeds")
    .withIndex("by_listingId_and_provider", (q) => q.eq("listingId", listingId))
    .take(3);
  if (feeds.length > 2)
    throw new Error("This property's calendar links require review.");
  if (await ctx.db.get(listingId))
    await ctx.db.patch(listingId, {
      calendarSyncThrough: feeds.length
        ? Math.min(...feeds.map((f) => f.coveredThrough ?? 0))
        : undefined,
    });
}

export async function removeFeed(ctx: MutationCtx, feed: Doc<"calendarFeeds">) {
  const blocks = await ctx.db
    .query("availabilityBlocks")
    .withIndex("by_calendarFeedId", (q) => q.eq("calendarFeedId", feed._id))
    .take(MAX_IMPORTED_BLOCKS + 1);
  if (blocks.length > MAX_IMPORTED_BLOCKS)
    throw new Error("This calendar's imported dates require review.");
  for (const block of blocks) await ctx.db.delete(block._id);
  await ctx.db.delete(feed._id);
}
