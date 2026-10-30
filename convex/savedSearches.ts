import { findActiveUser } from "./lib/auth";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { searchFields, searchDeliveryStatus } from "./validators/search";
import { normalizeSearch, criteriaOnly, SEARCH_KEYS } from "../lib/search";
const savedDoc = v.object({
  ...searchFields,
  _id: v.id("savedSearches"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  emailAlerts: v.optional(v.boolean()),
  createdAt: v.number(),
});
function name(value: string) {
  const result = value.trim();
  if (!result || result.length > 100)
    throw new Error("Use a search name of 1–100 characters.");
  return result;
}
async function owned(ctx: QueryCtx | MutationCtx, id: Id<"savedSearches">) {
  const user = await requireUser(ctx),
    search = await ctx.db.get(id);
  if (!search || (search.userId !== user._id && user.role !== "admin"))
    throw new Error("Saved search not found.");
  return search;
}
export const save = mutation({
  args: {
    ...searchFields,
    userId: v.id("users"),
    name: v.string(),
    emailAlerts: v.optional(v.boolean()),
  },
  returns: v.id("savedSearches"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.userId !== user._id) throw new Error("Not authorized");
    return ctx.db.insert("savedSearches", {
      ...normalizeSearch(criteriaOnly(args)),
      userId: user._id,
      name: name(args.name),
      emailAlerts: args.emailAlerts ?? false,
      createdAt: Date.now(),
    });
  },
});
export const remove = mutation({
  args: { id: v.id("savedSearches") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await owned(ctx, args.id);
    await ctx.db.delete(args.id);
    return null;
  },
});
export const updateSavedSearch = mutation({
  args: {
    ...searchFields,
    id: v.id("savedSearches"),
    name: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await owned(ctx, args.id),
      merged = { ...criteriaOnly(existing), ...criteriaOnly(args) };
    if (args.propertyType !== undefined && args.propertyTypes === undefined)
      delete merged.propertyTypes;
    const filters = normalizeSearch(merged);
    const patch = Object.fromEntries(
      SEARCH_KEYS.map((key) => [key, filters[key]]),
    );
    await ctx.db.patch(args.id, {
      ...patch,
      ...(args.name !== undefined ? { name: name(args.name) } : {}),
    });
    return null;
  },
});
export const replaceFilters = mutation({
  args: { id: v.id("savedSearches"), filters: v.object(searchFields) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await owned(ctx, args.id);
    const filters = normalizeSearch(args.filters);
    await ctx.db.patch(
      args.id,
      Object.fromEntries(SEARCH_KEYS.map((key) => [key, filters[key]])),
    );
    return null;
  },
});
export const toggleEmailAlerts = mutation({
  args: { id: v.id("savedSearches"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await owned(ctx, args.id);
    await ctx.db.patch(args.id, { emailAlerts: args.enabled });
    return null;
  },
});
// Overview compatibility: the management screen pages through the full collection.
export const getByUser = query({
  args: { userId: v.id("users") },
  returns: v.array(savedDoc),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await findActiveUser(ctx, identity.subject);
    if (!user || (user._id !== args.userId && user.role !== "admin")) return [];
    return ctx.db
      .query("savedSearches")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10);
  },
});
export const mine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      ...searchFields,
      _id: v.id("savedSearches"),
      _creationTime: v.number(),
      userId: v.id("users"),
      name: v.string(),
      emailAlerts: v.optional(v.boolean()),
      createdAt: v.number(),
      latestDelivery: v.optional(
        v.object({
          id: v.id("savedSearchDeliveries"),
          status: searchDeliveryStatus,
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("savedSearches")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (search) => {
          const delivery = await ctx.db
            .query("savedSearchDeliveries")
            .withIndex("by_search", (q) => q.eq("searchId", search._id))
            .order("desc")
            .first();
          return {
            ...search,
            ...(delivery
              ? {
                  latestDelivery: { id: delivery._id, status: delivery.status },
                }
              : {}),
          };
        }),
      ),
    };
  },
});
