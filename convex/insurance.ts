import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  action,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import {
  insuranceAddress,
  insuranceAddressKey,
  requestEstimate,
  steadilyAvailable,
} from "./lib/steadily";
const addressValidator = v.object({
  street_address: v.string(),
  city: v.string(),
  state: v.string(),
  zip_code: v.string(),
});

export const availability = query({
  args: {},
  returns: v.boolean(),
  handler: () => steadilyAvailable(),
});
export const properties = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id("listings"),
      title: v.string(),
      address: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      addressKey: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    const owner = await requireUser(ctx);
    if (owner.role !== "landlord")
      throw new Error("Only property owners can request an estimate.");
    const page = await ctx.db
      .query("listings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", owner._id))
      .paginate({
        ...paginationOpts,
        numItems: Math.max(1, Math.min(20, paginationOpts.numItems)),
      });
    return {
      ...page,
      page: page.page.map((l) => {
        let addressKey: string | null = null;
        try {
          addressKey = insuranceAddressKey(insuranceAddress(l));
        } catch {
          /* Owner must finish the address first. */
        }
        return {
          id: l._id,
          title: l.title,
          address: l.address,
          city: l.city,
          state: l.state,
          zip: l.zip,
          addressKey,
        };
      }),
    };
  },
});
export const source = internalQuery({
  args: { listingId: v.id("listings") },
  returns: v.object({ ownerId: v.id("users"), address: addressValidator }),
  handler: async (ctx, { listingId }) => {
    const owner = await requireUser(ctx),
      listing = await ctx.db.get(listingId);
    if (
      owner.role !== "landlord" ||
      !listing ||
      listing.landlordId !== owner._id
    )
      throw new Error("Only this property's owner can request an estimate.");
    return { ownerId: owner._id, address: insuranceAddress(listing) };
  },
});
export const claim = internalMutation({
  args: {
    listingId: v.id("listings"),
    requestId: v.string(),
    addressKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { listingId, requestId, addressKey }) => {
    const owner = await requireUser(ctx),
      listing = await ctx.db.get(listingId);
    if (
      owner.role !== "landlord" ||
      !listing ||
      listing.landlordId !== owner._id
    )
      throw new Error("Only this property's owner can request an estimate.");
    if (insuranceAddressKey(insuranceAddress(listing)) !== addressKey)
      throw new Error(
        "The property address changed. Review it before sharing.",
      );
    const now = Date.now(),
      day = Math.floor(now / 86400000);
    for (const key of [`owner:${owner._id}`, "global"]) {
      const row = await ctx.db
        .query("insuranceEstimateLimits")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (
        key !== "global" &&
        (row?.requestId === requestId || (row?.nextAllowedAt ?? 0) > now)
      )
        throw new Error(
          "An estimate was recently requested. Wait two minutes before a new request; check the provider before retrying an uncertain result.",
        );
      if (row?.day === day && row.count >= (key === "global" ? 100 : 3))
        throw new Error(
          "The daily insurance-estimate limit has been reached. You can continue on Steadily's website.",
        );
      const fields = {
        key,
        day,
        count: row?.day === day ? row.count + 1 : 1,
        nextAllowedAt: now + 120000,
        requestId,
      };
      if (row) await ctx.db.patch(row._id, fields);
      else await ctx.db.insert("insuranceEstimateLimits", fields);
    }
    return null;
  },
});
export const estimate = action({
  args: {
    listingId: v.id("listings"),
    consent: v.boolean(),
    requestId: v.string(),
    addressKey: v.string(),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    if (!args.consent)
      throw new Error(
        "Agree to share this property's address with Steadily first.",
      );
    if (!/^[a-f0-9-]{36}$/i.test(args.requestId))
      throw new Error("Start a new estimate request.");
    const source = await ctx.runQuery(internal.insurance.source, {
      listingId: args.listingId,
    });
    if (insuranceAddressKey(source.address) !== args.addressKey)
      throw new Error(
        "The property address changed. Review it before sharing.",
      );
    if (!steadilyAvailable())
      throw new Error(
        "Insurance estimates require an approved Steadily connection.",
      );
    await ctx.runMutation(internal.insurance.claim, {
      listingId: args.listingId,
      requestId: args.requestId,
      addressKey: args.addressKey,
    });
    let url: string;
    try {
      url = await requestEstimate(args.listingId, source.address);
    } catch {
      throw new Error(
        "The estimate could not be confirmed. Check Steadily before starting another request. No automatic retry was made.",
      );
    }
    const current = await ctx.runQuery(internal.insurance.source, {
      listingId: args.listingId,
    });
    if (
      current.ownerId !== source.ownerId ||
      insuranceAddressKey(current.address) !==
        insuranceAddressKey(source.address)
    )
      throw new Error(
        "The property changed during this request. Check the estimate with Steadily.",
      );
    return { url };
  },
});
