import { v } from "convex/values";
import { mutation, query } from "convex/server";

/**
 * Saves a listing to a tenant's saved list. Idempotent — calling this when
 * the listing is already saved returns the existing document's ID without
 * creating a duplicate.
 */
export const save = mutation({
  args: {
    tenantId: v.id("users"),
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    // Return early if already saved (idempotent)
    const existing = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_listing", (q) =>
        q.eq("tenantId", args.tenantId).eq("listingId", args.listingId)
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    // Validate referenced documents exist
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new Error(`Tenant ${args.tenantId} not found`);

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error(`Listing ${args.listingId} not found`);

    return await ctx.db.insert("savedListings", {
      tenantId: args.tenantId,
      listingId: args.listingId,
      savedAt: Date.now(),
    });
  },
});

/**
 * Removes a listing from a tenant's saved list. Returns the deleted document's
 * ID, or null if it was not saved in the first place.
 */
export const unsave = mutation({
  args: {
    tenantId: v.id("users"),
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_listing", (q) =>
        q.eq("tenantId", args.tenantId).eq("listingId", args.listingId)
      )
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.delete(existing._id);
    return existing._id;
  },
});

/**
 * Returns true if the tenant has saved the given listing, false otherwise.
 */
export const isSaved = query({
  args: {
    tenantId: v.id("users"),
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_listing", (q) =>
        q.eq("tenantId", args.tenantId).eq("listingId", args.listingId)
      )
      .unique();

    return existing !== null;
  },
});

/**
 * Returns all saved listings for a tenant, enriched with the full listing
 * document. Entries whose listing has since been deleted are omitted.
 * Results are sorted by most-recently saved first.
 */
export const getSaved = query({
  args: {
    tenantId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const saved = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    // Most-recently saved first
    saved.sort((a, b) => b.savedAt - a.savedAt);

    const enriched = await Promise.all(
      saved.map(async (entry) => {
        const listing = await ctx.db.get(entry.listingId);
        return {
          ...entry,
          listing: listing ?? null,
        };
      })
    );

    // Drop any saves whose listing was deleted
    return enriched.filter((e) => e.listing !== null);
  },
});
