import { recordPerformance } from "./lib/performance";
import { publiclyVisible } from "./lib/publication";
import { listingPhotos } from "./lib/photos";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const save = mutation({
  args: {
    tenantId: v.id("users"),
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
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
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
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
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
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
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller._id !== args.tenantId) return [];

    const saved = await ctx.db
      .query("savedListings")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    saved.sort((a, b) => b.savedAt - a.savedAt);

    const enriched = await Promise.all(
      saved.map(async (entry) => {
        const listing = await ctx.db.get(entry.listingId);
        return {
          ...entry,
          listing:
            listing && (await publiclyVisible(ctx, listing))
              ? { ...(await listingPhotos(ctx, listing)), address: "" }
              : null,
        };
      }),
    );

    return enriched.filter((e) => e.listing !== null);
  },
});
