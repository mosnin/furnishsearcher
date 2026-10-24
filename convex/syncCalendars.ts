"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { fetchCalendar } from "../lib/calendar/fetch";
import { parseAvailability } from "../lib/calendar/import";
import { CalendarImportError } from "../lib/calendar/errors";

export const refresh = internalAction({
  args: { feedId: v.id("calendarFeeds"), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const snapshot = await ctx.runQuery(internal.calendarFeeds.snapshot, args);
    if (!snapshot) return null;
    try {
      const contents = await fetchCalendar(snapshot.url, snapshot.provider);
      const { blocks, coveredThrough } = parseAvailability(contents);
      await ctx.runMutation(internal.calendarFeeds.apply, {
        ...args,
        blocks,
        coveredThrough,
      });
    } catch (error) {
      // Native parser/network errors can contain private URLs or event text. Only our own messages leave this action.
      const message =
        error instanceof CalendarImportError
          ? error.message
          : "Unable to refresh this calendar. Check the export link and retry.";
      await ctx.runMutation(internal.calendarFeeds.failed, {
        ...args,
        message,
      });
    }
    return null;
  },
});
