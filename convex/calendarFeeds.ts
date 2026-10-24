import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { calendarProvider, importedInterval } from "./validators/calendars";
import { calendarLink } from "../lib/calendar/links";
import { MAX_IMPORTED_BLOCKS } from "../lib/calendar/limits";
import { requireUser } from "./lib/auth";
import { refreshCoverage, removeFeed } from "./lib/calendarFeeds";
import { DAY } from "../lib/stays";

const HOUR = 3600000;
async function ownedListing(
  ctx: MutationCtx | QueryCtx,
  listingId: Id<"listings">,
) {
  const user = await requireUser(ctx),
    listing = await ctx.db.get(listingId);
  if (!listing || (listing.landlordId !== user._id && user.role !== "admin"))
    throw new Error("Not authorized to manage these calendars.");
  return listing;
}

export const getByListing = query({
  args: { listingId: v.id("listings") },
  returns: v.array(
    v.object({
      _id: v.id("calendarFeeds"),
      provider: calendarProvider,
      status: v.union(
        v.literal("syncing"),
        v.literal("synced"),
        v.literal("error"),
      ),
      lastAttemptAt: v.number(),
      lastSyncedAt: v.union(v.number(), v.null()),
      coveredThrough: v.union(v.number(), v.null()),
      importedBlocks: v.number(),
      error: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await ownedListing(ctx, args.listingId);
    const feeds = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_listingId_and_provider", (q) =>
        q.eq("listingId", args.listingId),
      )
      .take(3);
    return feeds.map((f) => ({
      _id: f._id,
      provider: f.provider,
      status: f.status,
      lastAttemptAt: f.lastAttemptAt,
      lastSyncedAt: f.lastSyncedAt ?? null,
      coveredThrough: f.coveredThrough ?? null,
      importedBlocks: f.importedBlocks ?? 0,
      error: f.error ?? null,
    }));
  },
});

export const link = mutation({
  args: {
    listingId: v.id("listings"),
    provider: calendarProvider,
    url: v.string(),
  },
  returns: v.id("calendarFeeds"),
  handler: async (ctx, args) => {
    const listing = await ownedListing(ctx, args.listingId);
    const url = calendarLink(args.url, args.provider);
    const existing = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_listingId_and_provider", (q) =>
        q.eq("listingId", listing._id).eq("provider", args.provider),
      )
      .unique();
    if (existing?.url === url && Date.now() - existing.lastAttemptAt < 60000)
      throw new Error("Please wait a minute between refreshes.");
    const generation = (existing?.generation ?? 0) + 1,
      now = Date.now();
    const update = {
      url,
      generation,
      status: "syncing" as const,
      lastAttemptAt: now,
      nextSyncAt: now + HOUR,
      error: undefined,
    };
    let feedId: Id<"calendarFeeds">;
    if (existing) {
      await ctx.db.patch(existing._id, update);
      feedId = existing._id;
    } else
      feedId = await ctx.db.insert("calendarFeeds", {
        ...update,
        listingId: listing._id,
        landlordId: listing.landlordId,
        provider: args.provider,
        createdAt: now,
      });
    await refreshCoverage(ctx, listing._id);
    await ctx.scheduler.runAfter(0, internal.syncCalendars.refresh, {
      feedId,
      generation,
    });
    return feedId;
  },
});

export const refresh = mutation({
  args: { feedId: v.id("calendarFeeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const feed = await ctx.db.get(args.feedId);
    if (!feed) throw new Error("Calendar link not found.");
    await ownedListing(ctx, feed.listingId);
    if (Date.now() - feed.lastAttemptAt < 60000)
      throw new Error("Please wait a minute between refreshes.");
    const generation = feed.generation + 1;
    await ctx.db.patch(feed._id, {
      generation,
      status: "syncing",
      error: undefined,
      lastAttemptAt: Date.now(),
      nextSyncAt: Date.now() + HOUR,
    });
    await ctx.scheduler.runAfter(0, internal.syncCalendars.refresh, {
      feedId: feed._id,
      generation,
    });
    return null;
  },
});

export const unlink = mutation({
  args: { feedId: v.id("calendarFeeds") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const feed = await ctx.db.get(args.feedId);
    if (!feed) throw new Error("Calendar link not found.");
    await ownedListing(ctx, feed.listingId);
    await removeFeed(ctx, feed);
    await refreshCoverage(ctx, feed.listingId);
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
      listingId: feed.listingId,
      cursor: null,
    });
    return null;
  },
});

export const snapshot = internalQuery({
  args: { feedId: v.id("calendarFeeds"), generation: v.number() },
  returns: v.union(
    v.null(),
    v.object({ url: v.string(), provider: calendarProvider }),
  ),
  handler: async (ctx, args) => {
    const feed = await ctx.db.get(args.feedId);
    if (
      !feed ||
      feed.generation !== args.generation ||
      !(await ctx.db.get(feed.listingId))
    )
      return null;
    return { url: feed.url, provider: feed.provider };
  },
});

export const apply = internalMutation({
  args: {
    feedId: v.id("calendarFeeds"),
    generation: v.number(),
    blocks: v.array(importedInterval),
    coveredThrough: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const feed = await ctx.db.get(args.feedId);
    if (
      !feed ||
      feed.generation !== args.generation ||
      !(await ctx.db.get(feed.listingId))
    )
      return false;
    if (
      args.blocks.length > MAX_IMPORTED_BLOCKS ||
      !Number.isFinite(args.coveredThrough) ||
      args.coveredThrough <= Date.now() ||
      args.blocks.some(
        (b) =>
          !Number.isFinite(b.startDate) ||
          !Number.isFinite(b.endDate) ||
          b.endDate <= b.startDate,
      )
    ) {
      throw new Error("The calendar import contains invalid dates.");
    }
    const old = await ctx.db
      .query("availabilityBlocks")
      .withIndex("by_calendarFeedId", (q) => q.eq("calendarFeedId", feed._id))
      .take(MAX_IMPORTED_BLOCKS + 1);
    if (old.length > MAX_IMPORTED_BLOCKS)
      throw new Error("This calendar's imported dates require review.");
    // Replace a single provider's intervals atomically. Manual dates and the other provider stay independent.
    for (const block of old) await ctx.db.delete(block._id);
    for (const block of args.blocks)
      await ctx.db.insert("availabilityBlocks", {
        listingId: feed.listingId,
        ...block,
        type: "unavailable",
        calendarFeedId: feed._id,
        note: feed.provider === "airbnb" ? "Airbnb calendar" : "Vrbo calendar",
        createdAt: Date.now(),
      });
    await ctx.db.patch(feed._id, {
      status: "synced",
      importedBlocks: args.blocks.length,
      coveredThrough: args.coveredThrough,
      lastSyncedAt: Date.now(),
      error: undefined,
    });
    await refreshCoverage(ctx, feed.listingId);
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
      listingId: feed.listingId,
      cursor: null,
    });
    return true;
  },
});

export const failed = internalMutation({
  args: {
    feedId: v.id("calendarFeeds"),
    generation: v.number(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const feed = await ctx.db.get(args.feedId);
    if (feed?.generation === args.generation)
      await ctx.db.patch(feed._id, {
        status: "error",
        error: args.message.slice(0, 250),
      });
    return null;
  },
});

export const refreshDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const feeds = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_nextSyncAt", (q) => q.lte("nextSyncAt", Date.now()))
      .take(20);
    for (const feed of feeds) {
      if (!(await ctx.db.get(feed.listingId))) {
        await ctx.db.patch(feed._id, {
          status: "error",
          error: "This property's listing was removed.",
          nextSyncAt: Date.now() + DAY,
        });
        continue;
      }
      const generation = feed.generation + 1;
      await ctx.db.patch(feed._id, {
        generation,
        status: "syncing",
        error: undefined,
        lastAttemptAt: Date.now(),
        nextSyncAt: Date.now() + HOUR,
      });
      await ctx.scheduler.runAfter(0, internal.syncCalendars.refresh, {
        feedId: feed._id,
        generation,
      });
    }
    if (feeds.length === 20)
      await ctx.scheduler.runAfter(0, internal.calendarFeeds.refreshDue, {});
    return null;
  },
});
