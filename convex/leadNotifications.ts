import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { emailProofCurrent } from "../lib/email-contact";
import { emailContactMode } from "./lib/emailContact";
import {
  leadEmailPreference,
  leadEmailContext,
  leadEmailDetails,
  queueLeadEmail,
} from "./lib/leadEmail";
import { orderedOffers } from "./lib/leadOffers";
import { classifyLead } from "./lib/housing";
export const preferences = query({
  args: { listingId: v.id("listings") },
  returns: v.object({
    listingId: v.id("listings"),
    title: v.string(),
    override: v.union(v.boolean(), v.null()),
    enabled: v.boolean(),
    defaultEnabled: v.boolean(),
    canEmail: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const owner = await requireUser(ctx),
      listing = await ctx.db.get(args.listingId);
    if (!listing || listing.landlordId !== owner._id)
      throw new Error(
        "Not authorized to view these rental notification settings.",
      );
    const preference = await leadEmailPreference(ctx, owner, listing);
    return {
      listingId: listing._id,
      title: listing.title,
      ...preference,
      defaultEnabled: owner.housingLeadEmailsEnabled === true,
      canEmail: emailProofCurrent(owner, emailContactMode()),
    };
  },
});
export const setPreference = mutation({
  args: {
    listingId: v.id("listings"),
    emailEnabled: v.union(v.boolean(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireUser(ctx),
      listing = await ctx.db.get(args.listingId);
    if (
      owner.role !== "landlord" ||
      !listing ||
      listing.landlordId !== owner._id
    )
      throw new Error(
        "Not authorized to change these rental notification settings.",
      );
    if (
      args.emailEnabled === true &&
      !emailProofCurrent(owner, emailContactMode())
    )
      throw new Error(
        "Confirm your account email in your profile before enabling lead email.",
      );
    const existing = await ctx.db
      .query("listingLeadEmailPreferences")
      .withIndex("by_listing_owner", (q) =>
        q.eq("listingId", listing._id).eq("ownerId", owner._id),
      )
      .unique();
    const fields = {
      enabled: args.emailEnabled ?? undefined,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else
      await ctx.db.insert("listingLeadEmailPreferences", {
        listingId: listing._id,
        ownerId: owner._id,
        ...fields,
      });
    return null;
  },
});
export const selectProperty = internalMutation({
  args: {
    orderVersion: v.optional(v.literal(1)),
    deliveryId: v.id("housingRequestDeliveries"),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (
      !delivery ||
      delivery.emailGeneration !== args.generation ||
      delivery.emailStatus !== "queued" ||
      delivery.emailAttemptedAt !== undefined
    )
      return null;
    const context = await leadEmailContext(ctx, delivery);
    if (!context) {
      await ctx.db.patch(delivery._id, {
        emailStatus: "suppressed",
        notificationListingId: undefined,
      });
      return null;
    }
    const options =
      args.orderVersion === 1
        ? orderedOffers(ctx, delivery.requestId, delivery.landlordId)
        : ctx.db
            .query("housingRequestMatches")
            .withIndex("by_requestId_and_landlordId", (q) =>
              q
                .eq("requestId", delivery.requestId)
                .eq("landlordId", delivery.landlordId),
            )
            .order("asc");
    const matches = await options.paginate({
      cursor: args.cursor,
      numItems: 25,
    });
    for (const match of matches.page) {
      const listing = await ctx.db.get(match.listingId);
      if (
        !listing ||
        listing.landlordId !== context.owner._id ||
        !(await leadEmailPreference(ctx, context.owner, listing)).enabled
      )
        continue;
      const classification = await classifyLead(ctx, listing, context.request);
      if (
        !classification ||
        (classification.kind === "unmatched" &&
          !context.owner.receiveUnmatchedLeads)
      )
        continue;
      await ctx.db.patch(delivery._id, { notificationListingId: listing._id });
      await ctx.scheduler.runAfter(
        0,
        internal.housingRequestEmails.notifyOwner,
        { deliveryId: delivery._id, generation: args.generation },
      );
      return null;
    }
    if (!matches.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.leadNotifications.selectProperty,
        { ...args, cursor: matches.continueCursor },
      );
    else
      await ctx.db.patch(delivery._id, {
        emailStatus: "suppressed",
        notificationListingId: undefined,
      });
    return null;
  },
});
export const prepareSend = internalMutation({
  args: {
    deliveryId: v.id("housingRequestDeliveries"),
    generation: v.optional(v.number()),
    configured: v.boolean(),
  },
  returns: v.union(
    v.null(),
    v.object({
      generation: v.number(),
      email: v.string(),
      city: v.string(),
      state: v.string(),
      kind: v.union(v.literal("matched"), v.literal("unmatched")),
    }),
  ),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (
      !delivery ||
      delivery.emailGeneration === undefined ||
      (args.generation !== undefined &&
        args.generation !== delivery.emailGeneration) ||
      delivery.emailStatus === "sent" ||
      delivery.emailAttemptedAt !== undefined
    )
      return null;
    const details = await leadEmailDetails(ctx, delivery);
    if (!details) {
      if (await leadEmailContext(ctx, delivery))
        await queueLeadEmail(ctx, delivery, true);
      else await ctx.db.patch(delivery._id, { emailStatus: "suppressed" });
      return null;
    }
    if (!args.configured) {
      await ctx.db.patch(delivery._id, { emailStatus: "unconfigured" });
      return null;
    }
    await ctx.db.patch(delivery._id, { emailAttemptedAt: Date.now() });
    return { ...details, generation: delivery.emailGeneration };
  },
});
export const finish = internalMutation({
  args: {
    deliveryId: v.id("housingRequestDeliveries"),
    generation: v.number(),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("unknown"),
    ),
    providerId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (
      delivery?.emailGeneration === args.generation &&
      delivery.emailAttemptedAt !== undefined &&
      delivery.emailStatus !== "sent"
    )
      await ctx.db.patch(delivery._id, {
        emailStatus: args.status,
        emailProviderId: args.providerId,
      });
    return null;
  },
});
export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Pre-upgrade queued jobs have no generation or selection timestamp.
    const legacy = await ctx.db
      .query("housingRequestDeliveries")
      .withIndex("by_email_status_time", (q) =>
        q.eq("emailStatus", "queued").eq("emailSelectionStartedAt", undefined),
      )
      .take(50);
    for (const delivery of legacy) await queueLeadEmail(ctx, delivery, true);
    const stale = await ctx.db
      .query("housingRequestDeliveries")
      .withIndex("by_email_status_time", (q) =>
        q
          .eq("emailStatus", "queued")
          .gte("emailSelectionStartedAt", 0)
          .lt("emailSelectionStartedAt", Date.now() - 15 * 60 * 1000),
      )
      .take(50);
    for (const delivery of stale) {
      if (delivery.emailAttemptedAt !== undefined)
        await ctx.db.patch(delivery._id, { emailStatus: "unknown" });
      else await queueLeadEmail(ctx, delivery, true);
    }
    if (stale.length === 50 || legacy.length === 50)
      await ctx.scheduler.runAfter(0, internal.leadNotifications.recover, {});
    return null;
  },
});
