import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { isAvailable, validateStay } from "../lib/stays";
import { removeFeed } from "./lib/calendarFeeds";

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
    maxOccupancy: v.optional(v.number()),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller.role !== "admin" && caller._id !== args.landlordId) {
      throw new Error("Not authorized");
    }

    const landlord = await ctx.db.get(args.landlordId);
    if (!landlord) throw new Error(`Landlord ${args.landlordId} not found`);

    if (args.maxOccupancy !== undefined && (!Number.isInteger(args.maxOccupancy) || args.maxOccupancy < 1 || args.maxOccupancy > 30)) throw new Error("Maximum occupancy must be 1–30.");
    return await ctx.db.insert("listings", {
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
      maxOccupancy: args.maxOccupancy,
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
  },
});

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
    maxOccupancy: v.optional(v.union(v.number(), v.null())),
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
    const { id, maxOccupancy, ...fields } = args;
    if (maxOccupancy !== undefined && maxOccupancy !== null && (!Number.isInteger(maxOccupancy) || maxOccupancy < 1 || maxOccupancy > 30)) throw new Error("Maximum occupancy must be 1–30.");

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const listing = await ctx.db.get(id);
    if (!listing) throw new Error(`Listing ${id} not found`);

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller.role !== "admin" && caller._id !== listing.landlordId) {
      throw new Error("Not authorized to edit this listing");
    }

    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined)
    );

    await ctx.db.patch(id, { ...updates, ...(maxOccupancy !== undefined ? { maxOccupancy: maxOccupancy ?? undefined } : {}) });
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, { listingId: id, cursor: null });
    return await ctx.db.get(id);
  },
});

export const publish = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const listing = await ctx.db.get(args.id);
    if (!listing) throw new Error(`Listing ${args.id} not found`);

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller.role !== "admin" && caller._id !== listing.landlordId) {
      throw new Error("Not authorized");
    }

    if (listing.moderationHold) throw new Error("This listing is under staff review. Contact support before publishing.");
    await ctx.db.patch(args.id, { status: "active" });
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, { listingId: args.id, cursor: null });

    // Notify users whose saved searches match this listing
    await ctx.scheduler.runAfter(0, internal.emails.sendSavedSearchAlerts, {
      listingId: args.id,
      listingTitle: listing.title,
      city: listing.city,
      state: listing.state,
      price: listing.price,
      bedrooms: listing.bedrooms,
      petFriendly: listing.petFriendly,
      propertyType: listing.propertyType,
    });
  },
});

export const unpublish = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const listing = await ctx.db.get(args.id);
    if (!listing) throw new Error(`Listing ${args.id} not found`);

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller.role !== "admin" && caller._id !== listing.landlordId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.id, { status: "inactive" });
  },
});

export const deleteListing = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const listing = await ctx.db.get(args.id);
    if (!listing) throw new Error(`Listing ${args.id} not found`);

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller.role !== "admin" && caller._id !== listing.landlordId) {
      throw new Error("Not authorized");
    }

    const savedEntries = await ctx.db
      .query("savedListings")
      .filter((q) => q.eq(q.field("listingId"), args.id))
      .collect();

    const feeds = await ctx.db.query("calendarFeeds").withIndex("by_listingId_and_provider", q => q.eq("listingId", args.id)).take(3);
    if (feeds.length > 2) throw new Error("This property's calendar links require review.");
    for (const feed of feeds) await removeFeed(ctx, feed);
    await Promise.all(savedEntries.map((s) => ctx.db.delete(s._id)));
    await ctx.db.delete(args.id);
  },
});

export const getById = query({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) return null;
    if (listing.status !== "active" || listing.moderationHold) {
      const identity = await ctx.auth.getUserIdentity();
      const caller = identity ? await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject)).unique() : null;
      if (!caller || (caller._id !== listing.landlordId && caller.role !== "admin")) return null;
    }
    const landlord = await ctx.db.get(listing.landlordId);
    return { ...listing, landlord: landlord ? { _id: landlord._id, name: landlord.name, avatar: landlord.avatar, createdAt: landlord.createdAt } : null };
  },
});

export const search = query({
  args: {
    location: v.optional(v.string()),
    moveIn: v.optional(v.number()),
    moveOut: v.optional(v.number()),
    parkingIncluded: v.optional(v.boolean()),
    utilitiesIncluded: v.optional(v.boolean()),
    amenities: v.optional(v.array(v.string())),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    maxPrice: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    propertyType: v.optional(v.string()),
    petFriendly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let listings = await (args.city
      ? ctx.db.query("listings").withIndex("by_status_city", q => q.eq("status", "active").eq("city", args.city!))
      : ctx.db.query("listings").withIndex("by_status", q => q.eq("status", "active")))
      .take(501);

    if (listings.length === 501) throw new Error("Please narrow your search by city.");
    if (args.location && !args.city) {
      const terms = args.location.toLowerCase().split(/[ ,]+/).filter(Boolean);
      listings = listings.filter(l => terms.every(term =>
        `${l.city} ${l.state} ${l.zip} ${l.title}`.toLowerCase().includes(term)));
    }
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

    if (args.parkingIncluded) listings = listings.filter(l => l.parkingIncluded);
    if (args.utilitiesIncluded) listings = listings.filter(l => l.utilitiesIncluded);
    if (args.amenities?.length) listings = listings.filter(l => args.amenities!.every(a => l.amenities.includes(a)));
    if (args.moveIn !== undefined || args.moveOut !== undefined) {
      if (args.moveIn === undefined || args.moveOut === undefined) throw new Error("Select both stay dates.");
      const start = args.moveIn, end = args.moveOut;
      validateStay(start, end);
      const availability = await Promise.all(listings.map(async listing => {
        if (!isAvailable(listing, [], start, end)) return false;
        const conflict = await ctx.db.query("availabilityBlocks")
          .withIndex("by_listing_start", q => q.eq("listingId", listing._id).lt("startDate", end))
          .filter(q => q.gt(q.field("endDate"), start)).first();
        return conflict === null;
      }));
      listings = listings.filter((_, index) => availability[index]);
    }
    const now = Date.now();
    listings.sort((a, b) => {
      const aFeat = a.featured && a.featuredUntil && a.featuredUntil > now ? 1 : 0;
      const bFeat = b.featured && b.featuredUntil && b.featuredUntil > now ? 1 : 0;
      if (aFeat !== bFeat) return bFeat - aFeat;
      return b.createdAt - a.createdAt;
    });

    return listings;
  },
});

export const getByLandlord = query({
  args: { landlordId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const caller = identity ? await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject)).unique() : null;
    const canManage = caller?._id === args.landlordId || caller?.role === "admin";
    const listings = await (canManage
      ? ctx.db.query("listings").withIndex("by_landlord", q => q.eq("landlordId", args.landlordId))
      : ctx.db.query("listings").withIndex("by_landlord_status", q => q.eq("landlordId", args.landlordId).eq("status", "active")).filter(q => q.neq(q.field("moderationHold"), true)))
      .collect();
    listings.sort((a, b) => b.createdAt - a.createdAt);
    return listings;
  },
});

export const getFeatured = query({
  args: {},
  handler: async (ctx) => {
    const activeListings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    if (activeListings.length <= 6) return activeListings;

    const shuffled = [...activeListings];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 6);
  },
});

export const incrementViews = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) throw new Error(`Listing ${args.id} not found`);
    await ctx.db.patch(args.id, { views: listing.views + 1 });
  },
});

export const approveListing = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller.role !== "admin") throw new Error("Not authorized");

    const listing = await ctx.db.get(args.id);
    if (!listing) throw new Error(`Listing ${args.id} not found`);

    const landlord = await ctx.db.get(listing.landlordId);
    if (!landlord) throw new Error("Landlord not found");

    if (listing.moderationHold) throw new Error("This listing is under staff review. Contact support before publishing.");
    await ctx.db.patch(args.id, { status: "active" });
    await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, { listingId: args.id, cursor: null });

    await ctx.scheduler.runAfter(0, internal.emails.sendListingApprovedEmail, {
      toEmail: landlord.email,
      toName: landlord.name ?? "there",
      listingTitle: listing.title,
      listingId: args.id,
    });

    await ctx.scheduler.runAfter(0, internal.emails.sendSavedSearchAlerts, {
      listingId: args.id,
      listingTitle: listing.title,
      city: listing.city,
      state: listing.state,
      price: listing.price,
      bedrooms: listing.bedrooms,
      petFriendly: listing.petFriendly,
      propertyType: listing.propertyType,
    });
  },
});

export const rejectListing = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller.role !== "admin") throw new Error("Not authorized");

    const listing = await ctx.db.get(args.id);
    if (!listing) throw new Error(`Listing ${args.id} not found`);

    const landlord = await ctx.db.get(listing.landlordId);

    await ctx.db.patch(args.id, { status: "rejected" });

    if (landlord) {
      await ctx.scheduler.runAfter(0, internal.emails.sendListingRejectedEmail, {
        toEmail: landlord.email,
        toName: landlord.name ?? "there",
        listingTitle: listing.title,
      });
    }
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller.role !== "admin") return [];

    const listings = await ctx.db.query("listings").collect();
    listings.sort((a, b) => b.createdAt - a.createdAt);
    return listings;
  },
});
