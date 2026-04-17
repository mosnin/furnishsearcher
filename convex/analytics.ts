import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Returns the average price per city from all active listings.
 * Results are grouped by (city, state) and sorted by avgPrice descending.
 */
export const getPricesByCity = query({
  args: {},
  handler: async (ctx) => {
    const activeListings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Group by "city|state" key
    const cityMap = new Map<
      string,
      { city: string; state: string; total: number; count: number }
    >();

    for (const listing of activeListings) {
      const key = `${listing.city.toLowerCase()}|${listing.state.toLowerCase()}`;
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          city: listing.city,
          state: listing.state,
          total: 0,
          count: 0,
        });
      }
      const entry = cityMap.get(key)!;
      entry.total += listing.price;
      entry.count += 1;
    }

    const result = [...cityMap.values()].map((entry) => ({
      city: entry.city,
      state: entry.state,
      avgPrice: Math.round(entry.total / entry.count),
      count: entry.count,
    }));

    result.sort((a, b) => b.avgPrice - a.avgPrice);

    return result;
  },
});

/**
 * Returns analytics stats for a specific landlord's listings.
 * Counts conversations (messages) by joining against the conversations table.
 */
export const getListingStats = query({
  args: {
    landlordId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();

    const totalListings = listings.length;
    const activeListings = listings.filter((l) => l.status === "active").length;
    const totalViews = listings.reduce((sum, l) => sum + l.views, 0);
    const avgPrice =
      listings.length > 0
        ? Math.round(
            listings.reduce((sum, l) => sum + l.price, 0) / listings.length
          )
        : 0;

    // Count total conversations (inquiries) for this landlord
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();
    const totalMessages = conversations.length;

    // Count saved listings for each listing owned by this landlord
    const listingIds = new Set(listings.map((l) => l._id));
    const allSaved = await ctx.db.query("savedListings").collect();
    const savedCount = allSaved.filter((s) => listingIds.has(s.listingId)).length;

    return {
      totalListings,
      activeListings,
      totalViews,
      totalMessages,
      avgPrice,
      savedCount,
    };
  },
});

/**
 * Returns overall platform statistics for the Market Insights page.
 */
export const getPlatformStats = query({
  args: {},
  handler: async (ctx) => {
    const allListings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const totalListings = allListings.length;

    // Distinct landlords with active listings
    const landlordIds = new Set(allListings.map((l) => l.landlordId));
    const totalLandlords = landlordIds.size;

    const avgPrice =
      totalListings > 0
        ? Math.round(
            allListings.reduce((sum, l) => sum + l.price, 0) / totalListings
          )
        : 0;

    // Distinct cities
    const cityKeys = new Set(
      allListings.map((l) => `${l.city.toLowerCase()}|${l.state.toLowerCase()}`)
    );
    const cities = cityKeys.size;

    return {
      totalListings,
      totalLandlords,
      avgPrice,
      cities,
    };
  },
});

/**
 * Returns property type distribution for active listings.
 */
export const getPropertyTypeDistribution = query({
  args: {},
  handler: async (ctx) => {
    const activeListings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const typeMap = new Map<string, number>();
    for (const listing of activeListings) {
      const type = listing.propertyType || "Other";
      typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
    }

    return [...typeMap.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  },
});

/**
 * Returns the most common amenities across all active listings.
 */
export const getTopAmenities = query({
  args: {},
  handler: async (ctx) => {
    const activeListings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const amenityMap = new Map<string, number>();
    for (const listing of activeListings) {
      for (const amenity of listing.amenities) {
        amenityMap.set(amenity, (amenityMap.get(amenity) ?? 0) + 1);
      }
    }

    return [...amenityMap.entries()]
      .map(([amenity, count]) => ({ amenity, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },
});

/**
 * Returns per-listing stats for a landlord (views, saved count, conversation count).
 */
export const getListingPerformance = query({
  args: {
    landlordId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();

    if (listings.length === 0) return [];

    const listingIds = new Set(listings.map((l) => l._id));

    // Fetch all conversations for this landlord
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();

    // Fetch all saves for this landlord's listings
    const allSaved = await ctx.db.query("savedListings").collect();

    const conversationsByListing = new Map<string, number>();
    for (const conv of conversations) {
      const key = conv.listingId;
      conversationsByListing.set(key, (conversationsByListing.get(key) ?? 0) + 1);
    }

    const savedByListing = new Map<string, number>();
    for (const s of allSaved) {
      if (listingIds.has(s.listingId)) {
        savedByListing.set(
          s.listingId,
          (savedByListing.get(s.listingId) ?? 0) + 1
        );
      }
    }

    return listings
      .map((l) => ({
        _id: l._id,
        title: l.title,
        status: l.status,
        price: l.price,
        views: l.views,
        messages: conversationsByListing.get(l._id) ?? 0,
        saved: savedByListing.get(l._id) ?? 0,
        createdAt: l.createdAt,
      }))
      .sort((a, b) => b.views - a.views);
  },
});
