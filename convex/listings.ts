import { profileImage } from "./lib/profileImages";
import {
  createPropertyGroup,
  validateUnitName,
  unitDeleteGuard,
} from "./lib/units";
import { setupIssues } from "./lib/unitSetup";
import { syncGeo, removeGeo } from "./lib/geo";
import { addressKey } from "../lib/geo";
import {
  contentIssues,
  publiclyVisible,
  readiness,
  ownerReadiness,
  reconcileListing,
  sameContent,
} from "./lib/publication";
import { readinessValidator } from "./publication";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { isAvailable, validateStay } from "../lib/stays";
import { nextListingId } from "./lib/listingIds";
import { normalizeCity, normalizeState } from "../lib/locations";
import { removeFeed } from "./lib/calendarFeeds";

import { listingDetails } from "./validators/listingDetails";
import {
  emptyListingDetails,
  validateListingDetails,
} from "../lib/listing-details";

import { billingMode } from "../lib/billing";
import { photoAsset } from "./validators/photos";
import { listingPhotos, validatePhotoAssets } from "./lib/photos";

export const create = mutation({
  args: {
    parentListingId: v.optional(v.id("listings")),
    unitName: v.optional(v.string()),
    independentSpace: v.optional(v.boolean()),
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
    details: v.optional(listingDetails),
    propertyType: v.string(),
    amenities: v.array(v.string()),
    photos: v.array(v.string()),
    photoAssets: v.optional(v.array(photoAsset)),
    petFriendly: v.boolean(),
    utilitiesIncluded: v.boolean(),
    parkingIncluded: v.boolean(),
    availableFrom: v.number(),
    minStay: v.optional(v.number()),
  },
  returns: v.id("listings"),
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

    if (
      args.maxOccupancy !== undefined &&
      (!Number.isInteger(args.maxOccupancy) ||
        args.maxOccupancy < 1 ||
        args.maxOccupancy > 30)
    )
      throw new Error("Maximum occupancy must be 1–30.");
    if (args.photos.length)
      throw new Error("Upload new photos using the photo editor.");
    const photoAssets = args.photoAssets
      ? await validatePhotoAssets(ctx, args.landlordId, args.photoAssets, [])
      : undefined;
    let group: import("./_generated/dataModel").Doc<"properties"> | undefined;
    let unitFields = {};
    if (args.parentListingId) {
      const parent = await ctx.db.get(args.parentListingId);
      if (
        !parent ||
        parent.landlordId !== args.landlordId ||
        !args.independentSpace
      )
        throw new Error(
          "Choose your own property and confirm this is a separate rentable space.",
        );
      const current = parent.propertyGroupId
        ? await ctx.db.get(parent.propertyGroupId)
        : null;
      const root = current
        ? await ctx.db.get(current.primaryListingId)
        : parent;
      if (!root) throw new Error("Main rental space is missing.");
      const issues = await setupIssues(ctx, root, current);
      if (issues.length) throw new Error(issues.join(" "));
      if (addressKey(current ?? root) !== addressKey(args))
        throw new Error("A unit must use the same property address.");
      group = await createPropertyGroup(ctx, root, caller._id);
      unitFields = {
        ...(await validateUnitName(ctx, group._id, args.unitName ?? "")),
        propertyGroupId: group._id,
        parentListingId: group.primaryListingId,
        propertyLocationVersion: group.locationVersion,
        mapLatitude: group.mapLatitude,
        mapLongitude: group.mapLongitude,
        locationConfirmedAt: group.locationConfirmedAt,
        independentSpaceConfirmedAt: Date.now(),
      };
    }
    const listingId = await ctx.db.insert("listings", {
      ...unitFields,
      revision: 1,
      approvalStatus: "pending",
      publicationRequested: false,
      publicId: await nextListingId(ctx),
      searchCity: normalizeCity(args.city),
      searchState: normalizeState(args.state),
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
      ...(args.details
        ? { details: validateListingDetails(args.details) }
        : {}),
      propertyType: args.propertyType,
      amenities: args.amenities,
      photos: [],
      ...(photoAssets ? { photoAssets } : {}),
      petFriendly: args.petFriendly,
      utilitiesIncluded: args.utilitiesIncluded,
      parkingIncluded: args.parkingIncluded,
      availableFrom: args.availableFrom,
      minStay: args.minStay ?? 1,
      status: "pending",
      createdAt: Date.now(),
      views: 0,
    });
    if (group) {
      await ctx.db.patch(group._id, { unitCount: group.unitCount + 1 });
      await syncGeo(ctx, (await ctx.db.get(listingId))!);
      await ctx.db.insert("unitAudit", {
        propertyId: group._id,
        listingId,
        actorId: caller._id,
        action: "unit_created",
        note: "Owner confirms a separate independently rentable space; content requires its own review",
        createdAt: Date.now(),
      });
    }
    return listingId;
  },
});

export const update = mutation({
  args: {
    id: v.id("listings"),
    unitName: v.optional(v.string()),
    details: v.optional(listingDetails),
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
    photoAssets: v.optional(v.array(photoAsset)),
    petFriendly: v.optional(v.boolean()),
    utilitiesIncluded: v.optional(v.boolean()),
    parkingIncluded: v.optional(v.boolean()),
    availableFrom: v.optional(v.number()),
    minStay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const {
      id,
      unitName,
      maxOccupancy,
      details,
      photoAssets,
      photos,
      ...fields
    } = args;
    if (
      maxOccupancy !== undefined &&
      maxOccupancy !== null &&
      (!Number.isInteger(maxOccupancy) || maxOccupancy < 1 || maxOccupancy > 30)
    )
      throw new Error("Maximum occupancy must be 1–30.");

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

    const assets = photoAssets
      ? await validatePhotoAssets(ctx, listing.landlordId, photoAssets, [
          ...listing.photos,
          ...(listing.photoAssets ?? []).flatMap((a) =>
            a.legacyUrl ? [a.legacyUrl] : [],
          ),
        ])
      : undefined;
    if (
      photos &&
      !assets &&
      (photos.length > 30 ||
        photos.some((url) => !listing.photos.includes(url)))
    )
      throw new Error("Upload new photos using the photo editor.");
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined),
    );

    if (unitName !== undefined && !listing.propertyGroupId)
      throw new Error("Only grouped property spaces have unit names.");
    const names =
      unitName !== undefined
        ? await validateUnitName(
            ctx,
            listing.propertyGroupId!,
            unitName,
            listing._id,
          )
        : {};
    const patch = {
      ...names,
      ...updates,
      ...(assets
        ? { photoAssets: assets, photos: [] }
        : photos
          ? { photos, photoAssets: undefined }
          : {}),
      ...(details ? { details: validateListingDetails(details) } : {}),
      ...(maxOccupancy !== undefined
        ? { maxOccupancy: maxOccupancy ?? undefined }
        : {}),
    };
    const locationChanged =
      addressKey({ ...listing, ...patch }) !== addressKey(listing);
    if (
      locationChanged &&
      (listing.firstPublishedAt || listing.propertyGroupId)
    )
      throw new Error(
        "A published property's address is locked. Contact support for a minor correction; use a new listing for a different property.",
      );
    if (locationChanged) {
      await removeGeo(ctx, listing);
      const location = await ctx.db
        .query("listingLocations")
        .withIndex("by_listing", (q) => q.eq("listingId", id))
        .unique();
      if (location) await ctx.db.delete(location._id);
    }
    const changed = Object.entries(patch).some(([key, value]) => {
      if (key === "photos" && assets) return false;
      const previous =
        key === "photoAssets" && assets
          ? (listing.photoAssets ??
            listing.photos.map((legacyUrl) => ({ legacyUrl, caption: "" })))
          : key === "details"
            ? (listing.details ?? emptyListingDetails())
            : listing[key as keyof typeof listing];
      return !sameContent(value, previous);
    });
    await ctx.db.patch(id, {
      ...patch,
      ...(locationChanged
        ? {
            mapLatitude: undefined,
            mapLongitude: undefined,
            locationConfirmedAt: undefined,
          }
        : {}),
      ...(changed
        ? {
            revision: (listing.revision ?? 0) + 1,
            approvalStatus: "pending" as const,
            approvedRevision: undefined,
            status: "pending" as const,
          }
        : {}),
      ...(args.city !== undefined
        ? { searchCity: normalizeCity(args.city) }
        : {}),
      ...(args.state !== undefined
        ? { searchState: normalizeState(args.state) }
        : {}),
    });
    if (!locationChanged && listing.mapLatitude !== undefined)
      await syncGeo(ctx, (await ctx.db.get(id))!);
    if (changed)
      await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
        listingId: id,
        cursor: null,
      });
    return await ctx.db.get(id);
  },
});

export const publish = mutation({
  args: { id: v.id("listings") },
  returns: readinessValidator,
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

    if (listing.moderationHold)
      throw new Error(
        "This listing is under staff review. Contact support before publishing.",
      );
    const approvalStatus =
      listing.approvalStatus === "rejected"
        ? "pending"
        : listing.approvalStatus;
    await ctx.db.patch(listing._id, {
      publicationRequested: true,
      ...(approvalStatus ? { approvalStatus } : {}),
    });
    return reconcileListing(ctx, {
      ...listing,
      publicationRequested: true,
      ...(approvalStatus ? { approvalStatus } : {}),
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

    await ctx.db.patch(args.id, {
      status: "inactive",
      publicationRequested: false,
    });
    await syncGeo(ctx, { ...listing, status: "inactive" });
    await ctx.scheduler.runAfter(0, internal.publication.reconcileOwner, {
      userId: listing.landlordId,
      cursor: null,
    });
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

    await unitDeleteGuard(ctx, listing, caller._id);
    const savedEntries = await ctx.db
      .query("savedListings")
      .filter((q) => q.eq(q.field("listingId"), args.id))
      .collect();

    const feeds = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_listingId_and_provider", (q) => q.eq("listingId", args.id))
      .take(3);
    if (feeds.length > 2)
      throw new Error("This property's calendar links require review.");
    for (const feed of feeds) await removeFeed(ctx, feed);
    await Promise.all(savedEntries.map((s) => ctx.db.delete(s._id)));
    await removeGeo(ctx, listing);
    const privateLocation = await ctx.db
      .query("listingLocations")
      .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
      .unique();
    if (privateLocation) await ctx.db.delete(privateLocation._id);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.publication.reconcileOwner, {
      userId: listing.landlordId,
      cursor: null,
    });
  },
});

export const getById = query({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) return null;
    const identity = await ctx.auth.getUserIdentity();
    const caller = identity
      ? await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
          .unique()
      : null;
    const canManage =
      caller?._id === listing.landlordId || caller?.role === "admin";
    if (!canManage && !(await publiclyVisible(ctx, listing))) return null;
    const landlord = await ctx.db.get(listing.landlordId),
      view = await listingPhotos(ctx, listing);
    return {
      ...view,
      address: canManage ? view.address : "",
      landlord: landlord
        ? {
            _id: landlord._id,
            name: landlord.name,
            avatar: (await profileImage(ctx, landlord, "profile")) ?? undefined,
            createdAt: landlord.createdAt,
          }
        : null,
    };
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
    let listings = await (
      args.city
        ? ctx.db
            .query("listings")
            .withIndex("by_status_city", (q) =>
              q.eq("status", "active").eq("city", args.city!),
            )
        : ctx.db
            .query("listings")
            .withIndex("by_status", (q) => q.eq("status", "active"))
    ).take(501);

    if (listings.length === 501)
      throw new Error("Please narrow your search by city.");
    if (args.location && !args.city) {
      const terms = args.location.toLowerCase().split(/[ ,]+/).filter(Boolean);
      listings = listings.filter((l) =>
        terms.every((term) =>
          `${l.city} ${l.state} ${l.zip} ${l.title}`
            .toLowerCase()
            .includes(term),
        ),
      );
    }
    if (args.city) {
      const cityLower = args.city.toLowerCase();
      listings = listings.filter((l) =>
        l.city.toLowerCase().includes(cityLower),
      );
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
      listings = listings.filter(
        (l) => l.propertyType.toLowerCase() === typeLower,
      );
    }
    if (args.petFriendly !== undefined) {
      listings = listings.filter((l) => l.petFriendly === args.petFriendly);
    }

    if (args.parkingIncluded)
      listings = listings.filter((l) => l.parkingIncluded);
    if (args.utilitiesIncluded)
      listings = listings.filter((l) => l.utilitiesIncluded);
    if (args.amenities?.length)
      listings = listings.filter((l) =>
        args.amenities!.every((a) => l.amenities.includes(a)),
      );
    if (args.moveIn !== undefined || args.moveOut !== undefined) {
      if (args.moveIn === undefined || args.moveOut === undefined)
        throw new Error("Select both stay dates.");
      const start = args.moveIn,
        end = args.moveOut;
      validateStay(start, end);
      const availability = await Promise.all(
        listings.map(async (listing) => {
          if (!isAvailable(listing, [], start, end)) return false;
          const conflict = await ctx.db
            .query("availabilityBlocks")
            .withIndex("by_listing_start", (q) =>
              q.eq("listingId", listing._id).lt("startDate", end),
            )
            .filter((q) => q.gt(q.field("endDate"), start))
            .first();
          return conflict === null;
        }),
      );
      listings = listings.filter((_, index) => availability[index]);
    }
    const visibility = await Promise.all(
      listings.map((listing) => publiclyVisible(ctx, listing)),
    );
    listings = listings.filter((_, index) => visibility[index]);
    const now = Date.now();
    listings.sort((a, b) => {
      const aFeat =
        a.featured && a.featuredUntil && a.featuredUntil > now ? 1 : 0;
      const bFeat =
        b.featured && b.featuredUntil && b.featuredUntil > now ? 1 : 0;
      if (aFeat !== bFeat) return bFeat - aFeat;
      return b.createdAt - a.createdAt;
    });

    return Promise.all(
      listings.map(async (listing) => ({
        ...(await listingPhotos(ctx, listing)),
        address: "",
      })),
    );
  },
});

export const getByLandlord = query({
  args: { landlordId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const caller = identity
      ? await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
          .unique()
      : null;
    const canManage =
      caller?._id === args.landlordId || caller?.role === "admin";
    const listings = await (
      canManage
        ? ctx.db
            .query("listings")
            .withIndex("by_landlord", (q) =>
              q.eq("landlordId", args.landlordId),
            )
        : ctx.db
            .query("listings")
            .withIndex("by_landlord_status", (q) =>
              q.eq("landlordId", args.landlordId).eq("status", "active"),
            )
            .filter((q) => q.neq(q.field("moderationHold"), true))
    ).collect();
    listings.sort((a, b) => b.createdAt - a.createdAt);
    const visible = canManage
      ? listings
      : (
          await Promise.all(
            listings.map(async (listing) =>
              (await publiclyVisible(ctx, listing)) ? listing : null,
            ),
          )
        ).filter(
          (listing): listing is NonNullable<typeof listing> => listing !== null,
        );
    return Promise.all(
      visible.map(async (listing) => ({
        ...(await listingPhotos(ctx, listing)),
        address: canManage ? listing.address : "",
        ...(canManage
          ? { publication: await ownerReadiness(ctx, listing) }
          : {}),
      })),
    );
  },
});

export const getFeatured = query({
  args: {},
  handler: async (ctx) => {
    let mode: "test" | "prod" | null;
    try {
      mode = billingMode();
    } catch {
      mode = null;
    }
    const promoted = mode
      ? await ctx.db
          .query("listings")
          .withIndex("by_featured_mode", (q) =>
            q
              .eq("featuredMode", mode!)
              .eq("featured", true)
              .gt("featuredUntil", Date.now()),
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("status"), "active"),
              q.neq(q.field("moderationHold"), true),
            ),
          )
          .order("desc")
          .take(12)
      : [];
    const recent = await ctx.db
      .query("listings")
      .withIndex("by_search_newest", (q) => q.eq("status", "active"))
      .filter((q) => q.neq(q.field("moderationHold"), true))
      .order("desc")
      .take(12);
    const candidates = [
      ...new Map(
        [...promoted, ...recent].map((listing) => [listing._id, listing]),
      ).values(),
    ];
    const visible = await Promise.all(
      candidates.map(async (listing) =>
        (await publiclyVisible(ctx, listing)) ? listing : null,
      ),
    );
    const hydrated = await Promise.all(
      visible
        .filter(
          (listing): listing is NonNullable<typeof listing> => listing !== null,
        )
        .map(async (listing) => ({
          ...(await listingPhotos(ctx, listing)),
          address: "",
        })),
    );
    const paid = hydrated.filter((listing) => listing.featured),
      others = hydrated.filter((listing) => !listing.featured);
    for (let i = paid.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [paid[i], paid[j]] = [paid[j], paid[i]];
    }
    return [...paid, ...others].slice(0, 6);
  },
});

// Kept for old clients. Unattributed calls must not inflate private/public counters.
export const incrementViews = mutation({
  args: { id: v.id("listings") },
  returns: v.null(),
  handler: async () => null,
});

export const approveListing = mutation({
  args: {
    id: v.id("listings"),
    expectedRevision: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: readinessValidator,
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

    if (listing.moderationHold)
      throw new Error(
        "This listing is under staff review. Contact support before publishing.",
      );
    if (
      args.expectedRevision === undefined ||
      args.expectedRevision !== (listing.revision ?? 0)
    )
      throw new Error(
        "The listing revision changed. Review the current revision before deciding.",
      );
    const reviewNote = args.note?.trim() || "Listing content reviewed";
    if (reviewNote.length > 2000)
      throw new Error("Review note must be at most 2000 characters.");
    const missing = await contentIssues(ctx, listing);
    if (missing.length) throw new Error(missing.join(" "));
    if (listing.propertyGroupId) {
      const p = await ctx.db.get(listing.propertyGroupId);
      if (
        p?.primaryListingId === listing._id &&
        p.locationVersion === listing.propertyLocationVersion &&
        p.locationConfirmedAt !== undefined
      ) {
        await ctx.db.patch(p._id, {
          approvedLocationVersion: p.locationVersion,
        });
        await ctx.scheduler.runAfter(0, internal.units.syncLocation, {
          propertyId: p._id,
          version: p.locationVersion,
          cursor: null,
        });
      }
    }
    const revision = listing.revision ?? 0;
    await ctx.db.insert("listingReviews", {
      listingId: listing._id,
      reviewerId: caller._id,
      revision,
      decision: "approved",
      note: reviewNote,
      createdAt: Date.now(),
    });
    await ctx.db.patch(listing._id, {
      approvalStatus: "approved",
      approvedRevision: revision,
    });
    return reconcileListing(ctx, {
      ...listing,
      approvalStatus: "approved",
      approvedRevision: revision,
    });
  },
});

export const rejectListing = mutation({
  args: {
    id: v.id("listings"),
    expectedRevision: v.optional(v.number()),
    note: v.optional(v.string()),
  },
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

    if (
      args.expectedRevision === undefined ||
      args.expectedRevision !== (listing.revision ?? 0)
    )
      throw new Error(
        "The listing revision changed. Review the current revision before deciding.",
      );
    const reviewNote = args.note?.trim() || "Listing content reviewed";
    if (reviewNote.length > 2000)
      throw new Error("Review note must be at most 2000 characters.");
    const landlord = await ctx.db.get(listing.landlordId);

    await ctx.db.insert("listingReviews", {
      listingId: listing._id,
      reviewerId: caller._id,
      revision: listing.revision ?? 0,
      decision: "rejected",
      note: reviewNote,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.id, {
      status: "rejected",
      approvalStatus: "rejected",
      approvedRevision: undefined,
    });
    await syncGeo(ctx, { ...listing, status: "rejected" });

    if (landlord) {
      await ctx.scheduler.runAfter(
        0,
        internal.emails.sendListingRejectedEmail,
        {
          toEmail: landlord.email,
          toName: landlord.name ?? "there",
          listingTitle: listing.title,
        },
      );
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
    return Promise.all(listings.map((listing) => listingPhotos(ctx, listing)));
  },
});
