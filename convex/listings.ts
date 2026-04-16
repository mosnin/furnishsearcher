import { v } from "convex/values";
import { mutation, query } from "convex/server";

/**
 * Creates a new listing in "pending" status. Landlord must exist.
 * Returns the new listing's ID.
 */
export const create = mutation({
  args: {
    landlordId: v.id("users"),
    title: v.string(),
    description: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    address: v.string(),
    price: v.number(),
    bedrooms: v.number(),
    bathrooms: v.number(),
    propertyType: v.string(),
    amenities: v.array(v.string()),
    photos: v.array(v.string()),
    petFriendly: v.boolean(),
    utilitiesIncluded: v.boolean(),
    parkingIncluded: v.boolean(),
    availableFrom: v.number(),
    minStay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const landlord = await ctx.db.get(args.landlordId);
    if (!landlord) {
      throw new Error(`Landlord ${args.landlordId} not found`);
    }

    const listingId = await ctx.db.insert("listings", {
      landlordId: args.landlordId,
      title: args.title,
      description: args.description,
      city: args.city,
      state: args.state,
      zip: args.zip,
      address: args.address,
      price: args.price,
      bedrooms: args.bedrooms,
      bathrooms: args.bathrooms,
      propertyType: args.propertyType,
      amenities: args.amenities,
      photos: args.photos,
      petFriendly: args.petFriendly,
      utilitiesIncluded: args.utilitiesIncluded,
      parkingIncluded: args.parkingIncluded,
      availableFrom: args.availableFrom,
      minStay: args.minStay ?? 1,
      status: "pending",
      createdAt: Date.now(),
      views: 0,
    });

    return listingId;
  },
});

/**
 * Updates any subset of mutable fields on a listing. The listing must exist.
 * Returns the updated document.
 */
export const update = mutation({
  args: {
    id: v.id("listings"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    address: v.optional(v.string()),
    price: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    propertyType: v.optional(v.string()),
    amenities: v.optional(v.array(v.string())),
    photos: v.optional(v.array(v.string())),
    petFriendly: v.optional(v.boolean()),
    utilitiesIncluded: v.optional(v.boolean()),
    parkingIncluded: v.optional(v.boolean()),
    availableFrom: v.optional(v.number()),
    minStay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;

    const listing = await ctx.db.get(id);
    if (!listing) {
      throw new Error(`Listing ${id} not found`);
    }

    // Only patch fields that were explicitly provided
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined)
    );

    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

/**
 * Sets listing status to "active", making it publicly visible in search.
 */
export const publish = mutation({
  args: {
    id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) {
      throw new Error(`Listing ${args.id} not found`);
    }
    await ctx.db.patch(args.id, { status: "active" });
  },
});

/**
 * Sets listing status to "inactive", hiding it from public search results.
 */
export const unpublish = mutation({
  args: {
    id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) {
      throw new Error(`Listing ${args.id} not found`);
    }
    await ctx.db.patch(args.id, { status: "inactive" });
  },
});

/**
 * Permanently deletes a listing and all associated savedListings entries.
 * Messages and conversations are retained for record-keeping.
 */
export const deleteListing = mutation({
  args: {
    id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) {
      throw new Error(`Listing ${args.id} not found`);
    }

    // Remove all saves referencing this listing
    const savedEntries = await ctx.db
      .query("savedListings")
      .filter((q) => q.eq(q.field("listingId"), args.id))
      .collect();

    await Promise.all(savedEntries.map((s) => ctx.db.delete(s._id)));

    await ctx.db.delete(args.id);
  },
});

/**
 * Returns a single listing joined with the landlord's user record.
 * Returns null if the listing does not exist.
 */
export const getById = query({
  args: {
    id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) {
      return null;
    }

    const landlord = await ctx.db.get(listing.landlordId);

    return {
      ...listing,
      landlord: landlord ?? null,
    };
  },
});

/**
 * Searches active listings with optional filters for city, state, maxPrice,
 * minimum bedrooms, propertyType, and petFriendly. Results are sorted newest-first.
 */
export const search = query({
  args: {
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    maxPrice: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    propertyType: v.optional(v.string()),
    petFriendly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Start from the status index so the DB only scans active rows
    let listings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    if (args.city) {
      const cityLower = args.city.toLowerCase();
      listings = listings.filter((l) => l.city.toLowerCase().includes(cityLower));
    }

    if (args.state) {
      const stateLower = args.state.toLowerCase();
      listings = listings.filter((l) => l.state.toLowerCase() === stateLower);
    }

    if (args.maxPrice !== undefined) {
      listings = listings.filter((l) => l.price <= args.maxPrice!);
    }

    if (args.bedrooms !== undefined) {
      listings = listings.filter((l) => l.bedrooms >= args.bedrooms!);
    }

    if (args.propertyType) {
      const typeLower = args.propertyType.toLowerCase();
      listings = listings.filter((l) => l.propertyType.toLowerCase() === typeLower);
    }

    if (args.petFriendly !== undefined) {
      listings = listings.filter((l) => l.petFriendly === args.petFriendly);
    }

    // Newest first
    listings.sort((a, b) => b.createdAt - a.createdAt);

    return listings;
  },
});

/**
 * Returns all listings (any status) that belong to a specific landlord.
 */
export const getByLandlord = query({
  args: {
    landlordId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", args.landlordId))
      .collect();

    // Sort newest first
    listings.sort((a, b) => b.createdAt - a.createdAt);

    return listings;
  },
});

/**
 * Returns up to 6 active listings chosen at random via a Fisher-Yates shuffle.
 * Used to populate a "Featured" section on the home page.
 */
export const getFeatured = query({
  args: {},
  handler: async (ctx) => {
    const activeListings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    if (activeListings.length <= 6) {
      return activeListings;
    }

    // Fisher-Yates shuffle
    const shuffled = [...activeListings];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, 6);
  },
});

/**
 * Atomically increments the view counter for a listing.
 * Call this whenever a tenant views a listing's detail page.
 */
export const incrementViews = mutation({
  args: {
    id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) {
      throw new Error(`Listing ${args.id} not found`);
    }
    await ctx.db.patch(args.id, { views: listing.views + 1 });
  },
});

/**
 * Returns every listing in the database regardless of status.
 * Intended for admin dashboards only — gate this behind auth in production.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const listings = await ctx.db.query("listings").collect();
    listings.sort((a, b) => b.createdAt - a.createdAt);
    return listings;
  },
});
