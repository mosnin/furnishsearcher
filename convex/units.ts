import { normalizeSearch } from "../lib/search";
import { setupIssues } from "./lib/unitSetup";
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { ownerReadiness, reconcileListing } from "./lib/publication";
import { createPropertyGroup, validateUnitName } from "./lib/units";
import { listingPhotos } from "./lib/photos";
import { syncGeo, removeGeo } from "./lib/geo";
import { addressKey } from "../lib/geo";
import { ownerUnit } from "./validators/units";
import { searchResult } from "./validators/search";
import { matchSearch } from "./lib/search";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
async function owned(ctx: QueryCtx | MutationCtx, id: Id<"listings">) {
  const user = await requireUser(ctx),
    l = await ctx.db.get(id);
  if (!l || (l.landlordId !== user._id && user.role !== "admin"))
    throw new Error("Not authorized.");
  return { user, l };
}
async function ownerProjection(
  ctx: QueryCtx | MutationCtx,
  l: Doc<"listings">,
) {
  return {
    _id: l._id,
    publicId: l.publicId,
    title: l.title,
    unitName: l.unitName,
    propertyGroupId: l.propertyGroupId,
    parentListingId: l.parentListingId,
    price: l.price,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    photos: (await listingPhotos(ctx, l)).photos,
    city: l.city,
    state: l.state,
    zip: l.zip,
    propertyType: l.propertyType,
    createdAt: l.createdAt,
    views: l.views,
    status: l.status,
    moderationHold: l.moderationHold,
    locationConfirmedAt: l.locationConfirmedAt,
    featured: l.featured,
    featuredUntil: l.featuredUntil,
    publication: await ownerReadiness(ctx, l),
  };
}
export const context = query({
  args: { listingId: v.id("listings") },
  returns: v.object({
    primaryListingId: v.id("listings"),
    propertyGroupId: v.optional(v.id("properties")),
    title: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    locationVersion: v.number(),
    unitCount: v.number(),
    canAdd: v.boolean(),
    issues: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { l } = await owned(ctx, args.listingId),
      p = l.propertyGroupId ? await ctx.db.get(l.propertyGroupId) : null,
      root = p ? await ctx.db.get(p.primaryListingId) : l;
    if (!root) throw new Error("Main property space is missing.");
    const issues = await setupIssues(ctx, root, p);
    return {
      primaryListingId: root._id,
      propertyGroupId: p?._id,
      title: root.title,
      address: p?.address ?? root.address,
      city: p?.city ?? root.city,
      state: p?.state ?? root.state,
      zip: p?.zip ?? root.zip,
      locationVersion: p?.locationVersion ?? 1,
      unitCount: p?.unitCount ?? 1,
      canAdd: issues.length === 0,
      issues,
    };
  },
});
export const mine = query({
  args: {
    listingId: v.id("listings"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(ownerUnit),
  handler: async (ctx, args) => {
    const { l } = await owned(ctx, args.listingId);
    if (!l.propertyGroupId)
      return {
        page: [await ownerProjection(ctx, l)],
        isDone: true,
        continueCursor: "",
      };
    const page = await ctx.db
      .query("listings")
      .withIndex("by_property", (q) =>
        q.eq("propertyGroupId", l.propertyGroupId),
      )
      .order("asc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, args.paginationOpts.numItems),
      });
    return {
      ...page,
      page: await Promise.all(
        page.page.map((row) => ownerProjection(ctx, row)),
      ),
    };
  },
});
export const publicUnits = query({
  args: {
    propertyGroupId: v.id("properties"),
    moveIn: v.optional(v.number()),
    moveOut: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(searchResult),
  handler: async (ctx, args) => {
    const filters = normalizeSearch({
      propertyGroupId: args.propertyGroupId,
      moveIn: args.moveIn,
      moveOut: args.moveOut,
    });
    const page = await ctx.db
      .query("listings")
      .withIndex("by_property_newest", (q) =>
        q.eq("propertyGroupId", args.propertyGroupId).eq("status", "active"),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(10, args.paginationOpts.numItems),
      });
    const rows = [];
    for (const l of page.page) {
      const match = await matchSearch(ctx, l, filters);
      if (match) rows.push(match);
    }
    return { ...page, page: rows };
  },
});
export const attachExisting = mutation({
  args: {
    parentListingId: v.id("listings"),
    listingId: v.id("listings"),
    unitName: v.string(),
    independentSpace: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, l: parent } = await owned(ctx, args.parentListingId),
      { l } = await owned(ctx, args.listingId);
    if (
      !args.independentSpace ||
      l._id === parent._id ||
      l.landlordId !== parent.landlordId ||
      l.propertyGroupId
    )
      throw new Error(
        "Select a separately rentable, ungrouped space belonging to the same owner.",
      );
    const current = parent.propertyGroupId
        ? await ctx.db.get(parent.propertyGroupId)
        : null,
      root = current ? await ctx.db.get(current.primaryListingId) : parent;
    if (!root) throw new Error("Main rental space is missing.");
    const issues = await setupIssues(ctx, root, current);
    if (issues.length) throw new Error(issues.join(" "));
    if (addressKey(current ?? root) !== addressKey(l))
      throw new Error(
        "Units must have the same property address. A different address requires a separate property.",
      );
    const p = await createPropertyGroup(ctx, root, user._id),
      names = await validateUnitName(ctx, p._id, args.unitName);
    const patch = {
      propertyGroupId: p._id,
      parentListingId: p.primaryListingId,
      propertyLocationVersion: p.locationVersion,
      ...names,
      mapLatitude: p.mapLatitude,
      mapLongitude: p.mapLongitude,
      locationConfirmedAt: p.locationConfirmedAt,
      independentSpaceConfirmedAt: Date.now(),
      revision: (l.revision ?? 0) + 1,
      approvalStatus: "pending" as const,
      approvedRevision: undefined,
      status: "pending" as const,
    };
    await ctx.db.patch(l._id, patch);
    await ctx.db.patch(p._id, { unitCount: p.unitCount + 1 });
    await syncGeo(ctx, { ...l, ...patch });
    await ctx.db.insert("unitAudit", {
      propertyId: p._id,
      listingId: l._id,
      actorId: user._id,
      action: "existing_unit_attached",
      note: "Owner attests this is a distinct independently rentable space at the same address; its own content requires review",
      createdAt: Date.now(),
    });
    return null;
  },
});
export const syncLocation = internalMutation({
  args: {
    propertyId: v.id("properties"),
    version: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.propertyId);
    if (!p || p.locationVersion !== args.version) return null;
    const page = await ctx.db
      .query("listings")
      .withIndex("by_property", (q) => q.eq("propertyGroupId", p._id))
      .paginate({ cursor: args.cursor, numItems: 8 });
    for (const l of page.page) {
      if (l._id === p.primaryListingId) continue;
      const patch = {
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        mapLatitude: p.mapLatitude,
        mapLongitude: p.mapLongitude,
        locationConfirmedAt: p.locationConfirmedAt,
        propertyLocationVersion: p.locationVersion,
      };
      if (p.mapLatitude === undefined) await removeGeo(ctx, l);
      await ctx.db.patch(l._id, patch);
      const updated = { ...l, ...patch };
      await syncGeo(ctx, updated);
      await reconcileListing(ctx, updated);
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.units.syncLocation, {
        ...args,
        cursor: page.continueCursor,
      });
    return null;
  },
});
export const history = query({
  args: {
    listingId: v.id("listings"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      action: v.string(),
      note: v.string(),
      createdAt: v.number(),
      listingId: v.id("listings"),
    }),
  ),
  handler: async (ctx, args) => {
    const { l } = await owned(ctx, args.listingId);
    if (!l.propertyGroupId)
      return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("unitAudit")
      .withIndex("by_property", (q) => q.eq("propertyId", l.propertyGroupId!))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, args.paginationOpts.numItems),
      });
    return {
      ...page,
      page: page.page.map(({ action, note, createdAt, listingId }) => ({
        action,
        note,
        createdAt,
        listingId,
      })),
    };
  },
});
