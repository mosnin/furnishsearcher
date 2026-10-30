import { findActiveUser } from "./lib/auth";
import { requireUser } from "./lib/auth";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { recordPerformance } from "./lib/performance";
import { publiclyVisible } from "./lib/publication";
import { listingPhotos } from "./lib/photos";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const card = v.object({
  _id: v.id("listings"),
  landlordId: v.id("users"),
  publicId: v.optional(v.string()),
  title: v.string(),
  city: v.string(),
  state: v.string(),
  price: v.number(),
  bedrooms: v.number(),
  bathrooms: v.number(),
  photos: v.array(v.string()),
  propertyType: v.string(),
  petFriendly: v.boolean(),
  utilitiesIncluded: v.boolean(),
  parkingIncluded: v.boolean(),
  availableFrom: v.number(),
  minStay: v.number(),
});
const entry = v.object({
  _id: v.id("savedListings"),
  _creationTime: v.number(),
  tenantId: v.id("users"),
  listingId: v.id("listings"),
  savedAt: v.number(),
  listing: v.union(card, v.null()),
});
async function enrich(ctx: QueryCtx, saved: Doc<"savedListings">) {
  const listing = await ctx.db.get(saved.listingId);
  if (!listing || !(await publiclyVisible(ctx, listing)))
    return { ...saved, listing: null };
  const hydrated = await listingPhotos(ctx, listing);
  return {
    ...saved,
    listing: {
      _id: listing._id,
      landlordId: listing.landlordId,
      publicId: listing.publicId,
      title: listing.title,
      city: listing.city,
      state: listing.state,
      price: listing.price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      photos: hydrated.photos,
      propertyType: listing.propertyType,
      petFriendly: listing.petFriendly,
      utilitiesIncluded: listing.utilitiesIncluded,
      parkingIncluded: listing.parkingIncluded,
      availableFrom: listing.availableFrom,
      minStay: listing.minStay,
    },
  };
}

export const mine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(entry),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_saved", (q) => q.eq("tenantId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((saved) => enrich(ctx, saved))),
    };
  },
});
export const summary = query({
  args: {},
  returns: v.object({
    recent: v.array(entry),
    count: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_saved", (q) => q.eq("tenantId", user._id))
      .order("desc")
      .take(101);
    return {
      recent: await Promise.all(
        rows.slice(0, 3).map((saved) => enrich(ctx, saved)),
      ),
      count: Math.min(rows.length, 100),
      hasMore: rows.length > 100,
    };
  },
});

export const save = mutation({
  args: {
    tenantId: v.id("users"),
    listingId: v.id("listings"),
  },
  returns: v.id("savedListings"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await findActiveUser(ctx, identity.subject);
    if (!caller) throw new Error("User not found");
    if (caller._id !== args.tenantId) throw new Error("Not authorized");

    const existing = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_listing", (q) =>
        q.eq("tenantId", args.tenantId).eq("listingId", args.listingId),
      )
      .unique();

    if (existing) return existing._id;

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error(`Listing ${args.listingId} not found`);

    if (!(await publiclyVisible(ctx, listing)))
      throw new Error("This listing is unavailable.");
    if (caller._id !== listing.landlordId && caller.role !== "admin")
      await recordPerformance(ctx, listing, "saves");
    return await ctx.db.insert("savedListings", {
      tenantId: args.tenantId,
      listingId: args.listingId,
      savedAt: Date.now(),
    });
  },
});

export const unsave = mutation({
  args: {
    tenantId: v.id("users"),
    listingId: v.id("listings"),
  },
  returns: v.union(v.id("savedListings"), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await findActiveUser(ctx, identity.subject);
    if (!caller) throw new Error("User not found");
    if (caller._id !== args.tenantId) throw new Error("Not authorized");

    const existing = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_listing", (q) =>
        q.eq("tenantId", args.tenantId).eq("listingId", args.listingId),
      )
      .unique();

    if (!existing) return null;

    const listing = await ctx.db.get(args.listingId);
    if (listing && caller._id !== listing.landlordId && caller.role !== "admin")
      await recordPerformance(ctx, listing, "unsaves");
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});

export const isSaved = query({
  args: {
    tenantId: v.id("users"),
    listingId: v.id("listings"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const caller = await findActiveUser(ctx, identity.subject);
    if (!caller || caller._id !== args.tenantId) return false;

    const existing = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_listing", (q) =>
        q.eq("tenantId", args.tenantId).eq("listingId", args.listingId),
      )
      .unique();
    return existing !== null;
  },
});

export const getSaved = query({
  args: { tenantId: v.id("users") },
  returns: v.array(entry),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await findActiveUser(ctx, identity.subject);
    if (!caller || caller._id !== args.tenantId) return [];

    const saved = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant_saved", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(10);
    // Compatibility preview only. Full management uses `mine`, including unavailable entries.
    const enriched = await Promise.all(
      saved.map((saved) => enrich(ctx, saved)),
    );

    return enriched.filter((e) => e.listing !== null);
  },
});
