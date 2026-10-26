import { recommendationsReady } from "./lib/recommendations";
import { geo, legacyGeo } from "./lib/geo";
import { radiusBounds } from "../lib/geo";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query } from "./_generated/server";
import { searchFields, searchResult } from "./validators/search";
import { normalizeSearch } from "../lib/search";
import { DAY } from "../lib/stays";
import { normalizeCity } from "../lib/locations";
import { matchSearch } from "./lib/search";
export const listings = query({
  args: { ...searchFields, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(searchResult),
  handler: async (ctx, { paginationOpts, ...input }) => {
    const filters = normalizeSearch(input);
    if (
      filters.moveIn !== undefined &&
      filters.moveIn + (filters.flexibleDays ?? 0) * DAY <
        Math.floor(Date.now() / DAY) * DAY
    )
      return { page: [], isDone: true, continueCursor: "" };
    if (
      !filters.propertyId &&
      filters.location &&
      !filters.location.includes(" ")
    ) {
      const direct = ctx.db.normalizeId("listings", filters.location);
      if (direct) {
        filters.propertyId = direct;
        delete filters.location;
      }
    }
    if (filters.propertyId) {
      const id = ctx.db.normalizeId("listings", filters.propertyId);
      const listing = id
        ? await ctx.db.get(id)
        : await ctx.db
            .query("listings")
            .withIndex("by_publicId", (q) =>
              q.eq("publicId", filters.propertyId),
            )
            .unique();
      const match = listing ? await matchSearch(ctx, listing, filters) : null;
      return { page: match ? [match] : [], isDone: true, continueCursor: "" };
    }
    if (filters.sort === "recommended") {
      if (!(await recommendationsReady(ctx)))
        throw new Error(
          "Recommended order is being prepared. Choose another sort while it finishes.",
        );
    }
    if (
      filters.sort === "recommended" &&
      (filters.propertyGroupId ||
        (!filters.mapBounds && filters.nearLatitude === undefined))
    ) {
      const group = filters.propertyGroupId
        ? ctx.db.normalizeId("properties", filters.propertyGroupId)
        : null;
      if (filters.propertyGroupId && !group)
        return { page: [], isDone: true, continueCursor: "" };
      const source = group
        ? ctx.db
            .query("listingRecommendations")
            .withIndex("by_property_score", (q) =>
              q.eq("propertyGroupId", group).eq("status", "active"),
            )
        : filters.city
          ? ctx.db
              .query("listingRecommendations")
              .withIndex("by_city_score", (q) =>
                q
                  .eq("status", "active")
                  .eq("city", normalizeCity(filters.city!)),
              )
          : ctx.db
              .query("listingRecommendations")
              .withIndex("by_status_score", (q) => q.eq("status", "active"));
      const result = await source.order("desc").paginate({
        ...paginationOpts,
        numItems: Math.min(24, paginationOpts.numItems),
      });
      const page = [];
      for (const row of result.page) {
        const listing = await ctx.db.get(row.listingId);
        if (!listing || listing.landlordId !== row.ownerId) continue;
        const match = await matchSearch(ctx, listing, filters);
        if (match) page.push(match);
      }
      return { ...result, page };
    }
    if (filters.propertyGroupId) {
      const groupId = ctx.db.normalizeId("properties", filters.propertyGroupId);
      if (!groupId) return { page: [], isDone: true, continueCursor: "" };
      const source =
        filters.sort === "price_asc" || filters.sort === "price_desc"
          ? ctx.db
              .query("listings")
              .withIndex("by_property_price", (q) =>
                q.eq("propertyGroupId", groupId).eq("status", "active"),
              )
          : filters.sort === "most_viewed"
            ? ctx.db
                .query("listings")
                .withIndex("by_property_views", (q) =>
                  q.eq("propertyGroupId", groupId).eq("status", "active"),
                )
            : ctx.db
                .query("listings")
                .withIndex("by_property_newest", (q) =>
                  q.eq("propertyGroupId", groupId).eq("status", "active"),
                );
      const result = await source
        .order(filters.sort === "price_asc" ? "asc" : "desc")
        .paginate({
          ...paginationOpts,
          numItems: Math.min(24, paginationOpts.numItems),
        });
      const page = [];
      for (const l of result.page) {
        const m = await matchSearch(ctx, l, filters);
        if (m) page.push(m);
      }
      return { ...result, page };
    }
    if (filters.mapBounds || filters.nearLatitude !== undefined) {
      const legacyCursor =
        paginationOpts.cursor !== null &&
        !paginationOpts.cursor.startsWith("geo2:");
      if (!legacyCursor) {
        const state = await ctx.db
          .query("dataMigrations")
          .withIndex("by_name", (q) => q.eq("name", "geospatialV2"))
          .unique();
        if (!state?.complete)
          throw new Error(
            "Map search is being prepared. Use a list search while it finishes.",
          );
      }
      const rectangle =
        filters.mapBounds ??
        radiusBounds(
          {
            latitude: filters.nearLatitude!,
            longitude: filters.nearLongitude!,
          },
          filters.radiusMiles!,
        );
      const result = await (legacyCursor ? legacyGeo : geo).query(
        ctx,
        {
          shape: { type: "rectangle", rectangle },
          filter: (q) =>
            q.eq("sort", filters.sort ?? "newest").eq("status", "active"),
          limit: Math.max(1, Math.min(24, paginationOpts.numItems)),
        },
        paginationOpts.cursor?.startsWith("geo2:")
          ? paginationOpts.cursor.slice(5)
          : (paginationOpts.cursor ?? undefined),
      );
      const page = [];
      for (const row of result.results) {
        const id = ctx.db.normalizeId(
          "listings",
          row.key.slice(row.key.indexOf(":") + 1),
        );
        const listing = id ? await ctx.db.get(id) : null;
        if (listing) {
          if (filters.sort === "recommended") {
            const rank = await ctx.db
              .query("listingRecommendations")
              .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
              .unique();
            if (!rank || rank.ownerId !== listing.landlordId) continue;
          }
          const match = await matchSearch(ctx, listing, filters);
          if (match) page.push(match);
        }
      }
      return {
        page,
        isDone: !result.nextCursor,
        continueCursor: result.nextCursor
          ? `${legacyCursor ? "" : "geo2:"}${result.nextCursor}`
          : "",
      };
    }
    const ready = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", "searchIndexV1"))
      .unique();
    const city =
      ready?.complete && filters.city ? normalizeCity(filters.city) : null;
    const source = city
      ? filters.sort === "price_asc" || filters.sort === "price_desc"
        ? ctx.db
            .query("listings")
            .withIndex("by_city_price", (q) =>
              q.eq("status", "active").eq("searchCity", city),
            )
        : filters.sort === "most_viewed"
          ? ctx.db
              .query("listings")
              .withIndex("by_city_views", (q) =>
                q.eq("status", "active").eq("searchCity", city),
              )
          : ctx.db
              .query("listings")
              .withIndex("by_city_newest", (q) =>
                q.eq("status", "active").eq("searchCity", city),
              )
      : filters.sort === "price_asc" || filters.sort === "price_desc"
        ? ctx.db
            .query("listings")
            .withIndex("by_search_price", (q) => q.eq("status", "active"))
        : filters.sort === "most_viewed"
          ? ctx.db
              .query("listings")
              .withIndex("by_search_views", (q) => q.eq("status", "active"))
          : ctx.db
              .query("listings")
              .withIndex("by_search_newest", (q) => q.eq("status", "active"));
    let ordered = source
      .order(filters.sort === "price_asc" ? "asc" : "desc")
      .filter((q) => q.neq(q.field("moderationHold"), true));
    if (filters.minPrice !== undefined)
      ordered = ordered.filter((q) =>
        q.gte(q.field("price"), filters.minPrice!),
      );
    if (filters.maxPrice !== undefined)
      ordered = ordered.filter((q) =>
        q.lte(q.field("price"), filters.maxPrice!),
      );
    if (filters.bedrooms !== undefined)
      ordered = ordered.filter((q) =>
        q.gte(q.field("bedrooms"), filters.bedrooms!),
      );
    if (filters.bathrooms !== undefined)
      ordered = ordered.filter((q) =>
        q.gte(q.field("bathrooms"), filters.bathrooms!),
      );
    if (filters.occupants !== undefined)
      ordered = ordered.filter((q) =>
        q.gte(q.field("maxOccupancy"), filters.occupants!),
      );
    for (const key of [
      "petFriendly",
      "utilitiesIncluded",
      "parkingIncluded",
    ] as const)
      if (filters[key] !== undefined)
        ordered = ordered.filter((q) => q.eq(q.field(key), filters[key]!));
    const result = await ordered.paginate({
      ...paginationOpts,
      numItems: Math.min(paginationOpts.numItems, 24),
      maximumRowsRead: 100,
    });
    const page = [];
    for (const listing of result.page) {
      const match = await matchSearch(ctx, listing, filters);
      if (match) page.push(match);
    }
    return { ...result, page };
  },
});
