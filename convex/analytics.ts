import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { currentSupply } from "./lib/market";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const getPricesByCity = query({
  args: {},
  returns: v.array(
    v.object({
      city: v.string(),
      state: v.string(),
      avgPrice: v.number(),
      count: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { run } = await currentSupply(ctx);
    if (!run) return [];
    const rows = await ctx.db
      .query("marketSupply")
      .withIndex("by_price", (q) => q.eq("runId", run._id))
      .order("desc")
      .take(21);
    return rows
      .filter((x) => x.scope !== "all")
      .slice(0, 20)
      .map((x) => ({
        city: x.city!,
        state: x.state!,
        avgPrice: x.avgCents / 100,
        count: x.count,
      }));
  },
});
export const getPlatformStats = query({
  args: {},
  returns: v.object({
    totalListings: v.number(),
    totalLandlords: v.number(),
    avgPrice: v.number(),
    cities: v.number(),
  }),
  handler: async (ctx) => {
    const { row } = await currentSupply(ctx);
    return {
      totalListings: row?.count ?? 0,
      totalLandlords: row?.owners ?? 0,
      avgPrice: (row?.avgCents ?? 0) / 100,
      cities: row?.cities ?? 0,
    };
  },
});
export const getPropertyTypeDistribution = query({
  args: {},
  returns: v.array(v.object({ type: v.string(), count: v.number() })),
  handler: async (ctx) => {
    const { row } = await currentSupply(ctx);
    return (row?.buckets ?? [])
      .filter((x) => x.dimension === "type")
      .map((x) => ({ type: x.key, count: x.count }))
      .sort((a, b) => b.count - a.count);
  },
});
export const getTopAmenities = query({
  args: {},
  returns: v.array(v.object({ amenity: v.string(), count: v.number() })),
  handler: async (ctx) => {
    const { row } = await currentSupply(ctx);
    return (row?.buckets ?? [])
      .filter((x) => x.dimension === "amenity")
      .map((x) => ({ amenity: x.key, count: x.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },
});
async function ownerPerformance(ctx: QueryCtx, landlordId: Id<"users">) {
  const user = await requireUser(ctx);
  if (user._id !== landlordId && user.role !== "admin")
    throw new Error("Not authorized to read these listing statistics.");
  const listings = await ctx.db
    .query("listings")
    .withIndex("by_landlord", (q) => q.eq("landlordId", landlordId))
    .take(51);
  if (listings.length > 50)
    throw new Error(
      "Use the paginated listing-performance report for this account.",
    );
  const out = [];
  for (const listing of listings) {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
      .take(1001);
    const saved = await ctx.db
      .query("savedListings")
      .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
      .take(1001);
    if (conversations.length > 1000 || saved.length > 1000)
      throw new Error(
        "Use the dated listing-performance report for this property.",
      );
    out.push({
      _id: listing._id,
      title: listing.title,
      status: listing.status,
      price: listing.price,
      views: listing.views,
      messages: conversations.filter((c) => c.landlordId === landlordId).length,
      saved: saved.length,
      createdAt: listing.createdAt,
    });
  }
  return out.sort((a, b) => b.views - a.views);
}
const performance = v.object({
  _id: v.id("listings"),
  title: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),
    v.literal("pending"),
    v.literal("rejected"),
  ),
  price: v.number(),
  views: v.number(),
  messages: v.number(),
  saved: v.number(),
  createdAt: v.number(),
});
export const getListingPerformance = query({
  args: { landlordId: v.id("users") },
  returns: v.array(performance),
  handler: async (ctx, args) => ownerPerformance(ctx, args.landlordId),
});
export const getListingStats = query({
  args: { landlordId: v.id("users") },
  returns: v.object({
    totalListings: v.number(),
    activeListings: v.number(),
    totalViews: v.number(),
    totalMessages: v.number(),
    avgPrice: v.number(),
    savedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const rows = await ownerPerformance(ctx, args.landlordId);
    return {
      totalListings: rows.length,
      activeListings: rows.filter((x) => x.status === "active").length,
      totalViews: rows.reduce((n, x) => n + x.views, 0),
      totalMessages: rows.reduce((n, x) => n + x.messages, 0),
      avgPrice: rows.length
        ? rows.reduce((n, x) => n + x.price, 0) / rows.length
        : 0,
      savedCount: rows.reduce((n, x) => n + x.saved, 0),
    };
  },
});
