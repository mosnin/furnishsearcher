import { recordPerformance } from "./lib/performance";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { recordDemand } from "./lib/market";
import { demandShape } from "../lib/market-insights";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { housingCriteria, housingRequestDoc } from "./validators/housing";
import { requireUser } from "./lib/auth";
import {
  listingFits,
  classifyLead,
  prepareCriteria,
  type HousingCriteria,
} from "./lib/housing";
import { blockState, requireMessagingAllowed } from "./lib/messageAccess";
import { sendListingMessage } from "./lib/messaging";
import { DAY } from "../lib/stays";
import { emailProofCurrent } from "../lib/email-contact";
import { emailContactMode } from "./lib/emailContact";
import { currentPhoneProof } from "./lib/contacts";

const pageFields = { continueCursor: v.string(), isDone: v.boolean() };
const propertySummary = v.object({
  listingId: v.id("listings"),
  title: v.string(),
  city: v.string(),
  state: v.string(),
  price: v.number(),
  conversationId: v.union(v.id("conversations"), v.null()),
  kind: v.optional(v.union(v.literal("matched"), v.literal("unmatched"))),
  differenceKey: v.optional(v.string()),
  differences: v.optional(
    v.array(
      v.object({
        field: v.string(),
        requested: v.string(),
        offered: v.string(),
      }),
    ),
  ),
});

async function insertRequest(
  ctx: MutationCtx,
  userId: Id<"users">,
  criteria: HousingCriteria,
  agency?: { agencyName: string; travelerName: string },
) {
  const prepared = prepareCriteria(criteria);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Complete your profile first.");
  if (prepared.contactPreference === "phone" && !currentPhoneProof(user)) {
    throw new Error(
      "Verify your phone number before sharing it, or choose platform messages.",
    );
  }
  await recordDemand(
    ctx,
    "housing_request",
    `account:${userId}`,
    demandShape({
      city: prepared.city,
      state: prepared.state,
      bedrooms: prepared.bedrooms,
      maxPrice: prepared.maxBudget,
      petFriendly: prepared.petFriendly,
      moveIn: prepared.moveInDate,
      moveOut:
        prepared.moveOutDate ??
        prepared.moveInDate + prepared.duration * 30 * 86400000,
    }),
  );
  const requestId = await ctx.db.insert("housingRequests", {
    ...prepared,
    userId,
    contactPhoneRevision:
      prepared.contactPreference === "phone"
        ? (user.phoneRevision ?? 0)
        : undefined,
    status: "open",
    createdAt: Date.now(),
    matchingStatus: "matching",
    matchedProperties: 0,
    requesterType: agency ? "agency" : "traveler",
    ...agency,
  });
  await ctx.scheduler.runAfter(0, internal.housingRequests.scanRequest, {
    requestId,
    cursor: null,
  });
  return requestId;
}

export const create = mutation({
  args: { userId: v.id("users"), ...housingCriteria },
  returns: v.id("housingRequests"),
  handler: async (ctx, { userId, ...criteria }) => {
    const user = await requireUser(ctx);
    if (user._id !== userId) throw new Error("Not authorized");
    return insertRequest(ctx, userId, criteria);
  },
});

export const createAgency = mutation({
  args: {
    ...housingCriteria,
    userId: v.id("users"),
    agencyName: v.string(),
    travelers: v.array(
      v.object({
        name: v.string(),
        moveInDate: v.number(),
        moveOutDate: v.number(),
        workplace: v.optional(v.string()),
      }),
    ),
  },
  returns: v.array(v.id("housingRequests")),
  handler: async (ctx, { userId, agencyName, travelers, ...criteria }) => {
    const user = await requireUser(ctx);
    if (user._id !== userId) throw new Error("Not authorized");
    if (
      !agencyName.trim() ||
      agencyName.length > 150 ||
      travelers.length < 1 ||
      travelers.length > 10
    ) {
      throw new Error("Enter an agency name and 1–10 travelers.");
    }
    const ids: Id<"housingRequests">[] = [];
    for (const traveler of travelers) {
      if (!traveler.name.trim() || traveler.name.length > 100)
        throw new Error("Enter each traveler's name.");
      ids.push(
        await insertRequest(
          ctx,
          userId,
          {
            ...criteria,
            moveInDate: traveler.moveInDate,
            moveOutDate: traveler.moveOutDate,
            workplace: traveler.workplace ?? criteria.workplace,
            duration: Math.ceil(
              (traveler.moveOutDate - traveler.moveInDate) / (30 * DAY),
            ),
          },
          { agencyName: agencyName.trim(), travelerName: traveler.name.trim() },
        ),
      );
    }
    return ids;
  },
});

export const preview = query({
  args: { ...housingCriteria, paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageFields, page: v.array(propertySummary) }),
  handler: async (ctx, { paginationOpts, ...input }) => {
    const criteria = prepareCriteria(input);
    const result = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 50),
      });
    const page = [];
    for (const listing of result.page)
      if (await listingFits(ctx, listing, criteria))
        page.push({
          listingId: listing._id,
          title: listing.title,
          city: listing.city,
          state: listing.state,
          price: listing.price,
          conversationId: null,
        });
    return {
      page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

async function saveMatch(
  ctx: MutationCtx,
  request: Doc<"housingRequests">,
  listing: Doc<"listings">,
) {
  if (
    request.status !== "open" ||
    request.moveInDate < Math.floor(Date.now() / DAY) * DAY ||
    request.userId === listing.landlordId
  )
    return;
  const classification = await classifyLead(ctx, listing, request);
  if (!classification) return;
  const owner = await ctx.db.get(listing.landlordId);
  if (
    !owner ||
    (classification.kind === "unmatched" && !owner.receiveUnmatchedLeads)
  )
    return;
  const blocked = (await blockState(ctx, request.userId, owner._id))
    .cannotMessage;
  if (blocked && classification.kind === "unmatched") return;
  const existing = await ctx.db
    .query("housingRequestMatches")
    .withIndex("by_requestId_and_listingId", (q) =>
      q.eq("requestId", request._id).eq("listingId", listing._id),
    )
    .unique();
  const firstExact =
    classification.kind === "matched" &&
    (!existing ||
      (existing.kind === "unmatched" && existing.matchedAt === undefined));
  const now = Date.now();
  if (!existing)
    await ctx.db.insert("housingRequestMatches", {
      requestId: request._id,
      listingId: listing._id,
      landlordId: owner._id,
      createdAt: now,
      kind: classification.kind,
      ...(classification.kind === "matched"
        ? { matchedAt: now }
        : { unmatchedAt: now }),
    });
  else
    await ctx.db.patch(existing._id, {
      kind: classification.kind,
      ...(existing.kind === undefined && existing.matchedAt === undefined
        ? { matchedAt: existing.createdAt }
        : {}),
      ...(firstExact ? { matchedAt: now } : {}),
      ...(classification.kind === "unmatched" &&
      existing.unmatchedAt === undefined
        ? { unmatchedAt: now }
        : {}),
    });
  if (firstExact) {
    await recordPerformance(ctx, listing, "matchedLeads");
    const current = await ctx.db.get(request._id);
    await ctx.db.patch(request._id, {
      matchedProperties: (current?.matchedProperties ?? 0) + 1,
    });
  }
  const delivery = await ctx.db
    .query("housingRequestDeliveries")
    .withIndex("by_requestId_and_landlordId", (q) =>
      q.eq("requestId", request._id).eq("landlordId", owner._id),
    )
    .unique();
  if (!delivery) {
    const deliveryId = await ctx.db.insert("housingRequestDeliveries", {
      requestId: request._id,
      landlordId: owner._id,
      createdAt: now,
      kind: classification.kind,
      emailStatus:
        !blocked && owner.housingLeadEmailsEnabled ? "queued" : "suppressed",
    });
    if (!blocked && owner.housingLeadEmailsEnabled)
      await ctx.scheduler.runAfter(
        0,
        internal.housingRequestEmails.notifyOwner,
        { deliveryId },
      );
  } else if (classification.kind === "matched" && delivery.kind === "unmatched")
    await ctx.db.patch(delivery._id, { kind: "matched" });
}
export const leadPreferences = query({
  args: {},
  returns: v.object({
    receiveUnmatched: v.boolean(),
    emailEnabled: v.boolean(),
    canEmail: v.boolean(),
  }),
  handler: async (ctx) => {
    const owner = await requireUser(ctx);
    return {
      receiveUnmatched: owner.receiveUnmatchedLeads === true,
      emailEnabled: owner.housingLeadEmailsEnabled === true,
      canEmail: emailProofCurrent(owner, emailContactMode()),
    };
  },
});
export const setLeadPreferences = mutation({
  args: {
    receiveUnmatched: v.optional(v.boolean()),
    emailEnabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireUser(ctx);
    if (owner.role !== "landlord") throw new Error("Landlord access required.");
    if (args.emailEnabled && !emailProofCurrent(owner, emailContactMode()))
      throw new Error(
        "Confirm your account email in your profile before enabling lead notifications.",
      );
    await ctx.db.patch(owner._id, {
      ...(args.receiveUnmatched !== undefined
        ? { receiveUnmatchedLeads: args.receiveUnmatched }
        : {}),
      ...(args.emailEnabled !== undefined
        ? { housingLeadEmailsEnabled: args.emailEnabled }
        : {}),
    });
    if (args.receiveUnmatched === true && !owner.receiveUnmatchedLeads)
      await ctx.scheduler.runAfter(0, internal.housingRequests.scanOwner, {
        ownerId: owner._id,
        cursor: null,
      });
    return null;
  },
});
export const scanOwner = internalMutation({
  args: { ownerId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId);
    if (!owner?.receiveUnmatchedLeads) return null;
    const result = await ctx.db
      .query("listings")
      .withIndex("by_landlord_status", (q) =>
        q.eq("landlordId", owner._id).eq("status", "active"),
      )
      .paginate({ cursor: args.cursor, numItems: 30 });
    for (const listing of result.page)
      await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
        listingId: listing._id,
        cursor: null,
      });
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.housingRequests.scanOwner, {
        ownerId: owner._id,
        cursor: result.continueCursor,
      });
    return null;
  },
});

export const scanRequest = internalMutation({
  args: {
    requestId: v.id("housingRequests"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "open") return null;
    if (request.moveInDate < Math.floor(Date.now() / DAY) * DAY) {
      await ctx.db.patch(request._id, { matchingStatus: "complete" });
      return null;
    }
    const result = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .paginate({ cursor: args.cursor, numItems: 40 });
    for (const listing of result.page) await saveMatch(ctx, request, listing);
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.housingRequests.scanRequest, {
        requestId: request._id,
        cursor: result.continueCursor,
      });
    else await ctx.db.patch(request._id, { matchingStatus: "complete" });
    return null;
  },
});

export const scanListing = internalMutation({
  args: { listingId: v.id("listings"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing || listing.status !== "active") return null;
    const result = await ctx.db
      .query("housingRequests")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .paginate({ cursor: args.cursor, numItems: 40 });
    for (const request of result.page)
      if (request.moveInDate >= Math.floor(Date.now() / DAY) * DAY)
        await saveMatch(ctx, request, listing);
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.housingRequests.scanListing, {
        listingId: listing._id,
        cursor: result.continueCursor,
      });
    return null;
  },
});

export const getByUser = query({
  args: { userId: v.id("users") },
  returns: v.array(housingRequestDoc),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user._id !== args.userId && user.role !== "admin") return [];
    return ctx.db
      .query("housingRequests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10);
  },
});

export const getMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageFields, page: v.array(housingRequestDoc) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("housingRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      page: result.page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

// Kept for existing admin consumers; tenant requests are no longer public records.
export const getOpen = query({
  args: {},
  returns: v.array(housingRequestDoc),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") return [];
    return ctx.db
      .query("housingRequests")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(100);
  },
});

const inboxItem = v.object({
  deliveryId: v.id("housingRequestDeliveries"),
  kind: v.union(v.literal("matched"), v.literal("unmatched")),
  request: housingRequestDoc,
  read: v.boolean(),
  name: v.string(),
  phone: v.union(v.string(), v.null()),
  phoneTestMode: v.boolean(),
});
export const inbox = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageFields, page: v.array(inboxItem) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("housingRequestDeliveries")
      .withIndex("by_landlordId", (q) => q.eq("landlordId", user._id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
    const page = [];
    for (const delivery of result.page) {
      const request = await ctx.db.get(delivery.requestId);
      if (
        !request ||
        request.status !== "open" ||
        request.moveInDate < Math.floor(Date.now() / DAY) * DAY ||
        (delivery.kind === "unmatched" &&
          (!user.receiveUnmatchedLeads || request.allowUnmatched !== true)) ||
        (await blockState(ctx, request.userId, user._id)).cannotMessage
      )
        continue;
      const tenant = await ctx.db.get(request.userId);
      page.push({
        deliveryId: delivery._id,
        kind: delivery.kind ?? "matched",
        request,
        read: delivery.readAt !== undefined,
        name:
          request.agencyName ??
          tenant?.displayName ??
          tenant?.name ??
          "Traveler",
        phone:
          delivery.kind !== "unmatched" &&
          request.status === "open" &&
          request.contactPreference === "phone" &&
          tenant &&
          currentPhoneProof(tenant) &&
          request.contactPhoneRevision !== undefined &&
          request.contactPhoneRevision === (tenant.phoneRevision ?? 0)
            ? (tenant.phone ?? null)
            : null,
        phoneTestMode: tenant?.phoneVerificationMode !== "prod",
      });
    }
    return {
      page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const matchingProperties = query({
  args: {
    requestId: v.id("housingRequests"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ ...pageFields, page: v.array(propertySummary) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found.");
    await requireMessagingAllowed(ctx, user._id, request.userId);
    const result = await ctx.db
      .query("housingRequestMatches")
      .withIndex("by_requestId_and_landlordId", (q) =>
        q.eq("requestId", request._id).eq("landlordId", user._id),
      )
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(25, args.paginationOpts.numItems),
      });
    const page = [];
    if (
      request.status !== "open" ||
      request.moveInDate < Math.floor(Date.now() / DAY) * DAY
    )
      return {
        page: [],
        continueCursor: result.continueCursor,
        isDone: result.isDone,
      };
    for (const match of result.page) {
      const listing = await ctx.db.get(match.listingId);
      if (!listing || listing.landlordId !== user._id) continue;
      const classification = await classifyLead(ctx, listing, request);
      if (
        !classification ||
        (classification.kind === "unmatched" && !user.receiveUnmatchedLeads)
      )
        continue;
      page.push({
        listingId: listing._id,
        title: listing.title,
        city: listing.city,
        state: listing.state,
        price: listing.price,
        conversationId: match.conversationId ?? null,
        ...classification,
      });
    }
    return {
      page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const markRead = mutation({
  args: { deliveryId: v.id("housingRequestDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.landlordId !== user._id)
      throw new Error("Not authorized");
    if (delivery.readAt === undefined)
      await ctx.db.patch(delivery._id, { readAt: Date.now() });
    return null;
  },
});

export const reply = mutation({
  args: {
    requestId: v.id("housingRequests"),
    listingId: v.id("listings"),
    message: v.string(),
    acknowledgeDifferences: v.optional(v.boolean()),
    expectedDifferences: v.optional(v.string()),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const owner = await requireUser(ctx);
    const [request, listing] = await Promise.all([
      ctx.db.get(args.requestId),
      ctx.db.get(args.listingId),
    ]);
    if (
      !request ||
      !listing ||
      listing.landlordId !== owner._id ||
      request.userId === owner._id
    )
      throw new Error("Not authorized");
    const classification = await classifyLead(ctx, listing, request);
    if (
      request.status !== "open" ||
      request.moveInDate < Math.floor(Date.now() / DAY) * DAY ||
      !classification ||
      (classification.kind === "unmatched" && !owner.receiveUnmatchedLeads)
    ) {
      throw new Error(
        "This property no longer matches an open request for these dates.",
      );
    }
    const match = await ctx.db
      .query("housingRequestMatches")
      .withIndex("by_requestId_and_listingId", (q) =>
        q.eq("requestId", request._id).eq("listingId", listing._id),
      )
      .unique();
    if (!match || match.landlordId !== owner._id)
      throw new Error("This request has not been matched to your property.");
    await requireMessagingAllowed(ctx, owner._id, request.userId);
    if (match.conversationId) return match.conversationId;
    if (
      classification!.kind === "unmatched" &&
      args.acknowledgeDifferences !== true
    )
      throw new Error(
        "Review and acknowledge the mismatched criteria before proposing alternative terms.",
      );
    if (
      classification!.kind === "unmatched" &&
      args.expectedDifferences !== classification!.differenceKey
    )
      throw new Error(
        "The criteria changed. Review the current differences before replying.",
      );
    const maxLength = classification!.kind === "unmatched" ? 1700 : 2000;
    if (!args.message.trim() || args.message.trim().length > maxLength)
      throw new Error(`Enter a reply of 1–${maxLength} characters.`);
    const { conversationId } = await sendListingMessage(ctx, {
      senderId: owner._id,
      receiverId: request.userId,
      listingId: listing._id,
      origin: "housing_request",
      content:
        classification!.kind === "unmatched"
          ? `Alternative proposal for a housing request. This rental does not currently meet: ${classification!.differences.map((d) => d.field).join("; ")}. No booking or change of terms is confirmed.\n\n${args.message}`
          : args.message,
    });
    await ctx.db.patch(match._id, { conversationId, respondedAt: Date.now() });
    return conversationId;
  },
});

export const close = mutation({
  args: { id: v.id("housingRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      request = await ctx.db.get(args.id);
    if (!request || (request.userId !== user._id && user.role !== "admin"))
      throw new Error("Not authorized");
    await ctx.db.patch(request._id, { status: "closed" });
    return null;
  },
});

export const markFulfilled = mutation({
  args: { id: v.id("housingRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      request = await ctx.db.get(args.id);
    if (!request || request.userId !== user._id)
      throw new Error("Not authorized");
    await ctx.db.patch(request._id, { status: "fulfilled" });
    return null;
  },
});

export const notificationDetails = internalQuery({
  args: { deliveryId: v.id("housingRequestDeliveries") },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      city: v.string(),
      state: v.string(),
      kind: v.union(v.literal("matched"), v.literal("unmatched")),
    }),
  ),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.emailStatus === "sent") return null;
    const [request, owner] = await Promise.all([
      ctx.db.get(delivery.requestId),
      ctx.db.get(delivery.landlordId),
    ]);
    if (
      !request ||
      request.status !== "open" ||
      !owner?.housingLeadEmailsEnabled ||
      !emailProofCurrent(owner, emailContactMode()) ||
      (delivery.kind === "unmatched" &&
        (!owner.receiveUnmatchedLeads || request.allowUnmatched !== true)) ||
      request.moveInDate < Math.floor(Date.now() / DAY) * DAY ||
      (await blockState(ctx, request.userId, owner._id)).cannotMessage
    )
      return null;
    return {
      email: owner.notificationEmail!,
      city: request.city,
      state: request.state,
      kind: delivery.kind ?? "matched",
    };
  },
});
export const recordEmailStatus = internalMutation({
  args: {
    deliveryId: v.id("housingRequestDeliveries"),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("unconfigured"),
      v.literal("suppressed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (delivery && delivery.emailStatus !== "sent")
      await ctx.db.patch(delivery._id, { emailStatus: args.status });
    return null;
  },
});
