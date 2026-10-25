import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query } from "./_generated/server";
import { requireConversation } from "./lib/messageAccess";
import { publiclyVisible } from "./lib/publication";
import { profileImage } from "./lib/profileImages";
import { canReadTraveler } from "./lib/reviews";
import { monthlyRateCents } from "./lib/threadContext";
import { conversationFields } from "./validators/messaging";
import { inquiryStatus, originalRequest } from "./validators/bookings";
const nullableText = v.union(v.string(), v.null());
export const get = query({
  args: { conversationId: v.id("conversations") },
  returns: v.object({
    startedAt: v.number(),
    termsAtStart: conversationFields.termsAtStart,
    recipient: v.union(
      v.null(),
      v.object({
        name: v.string(),
        image: nullableText,
        profilePath: nullableText,
        occupation: nullableText,
        company: nullableText,
        bio: nullableText,
        city: nullableText,
        state: nullableText,
      }),
    ),
    property: v.object({
      title: v.string(),
      city: v.string(),
      state: v.string(),
      currentMonthlyRateCents: v.union(v.number(), v.null()),
      canOpen: v.boolean(),
      exists: v.boolean(),
      minStayMonths: v.union(v.number(), v.null()),
      utilitiesIncluded: v.union(v.boolean(), v.null()),
    }),
  }),
  handler: async (ctx, args) => {
    const { conv, user } = await requireConversation(ctx, args.conversationId);
    const otherId =
      user._id === conv.tenantId ? conv.landlordId : conv.tenantId;
    const other = await ctx.db.get(otherId),
      listing = await ctx.db.get(conv.listingId);
    const canOpen =
      !!listing &&
      (listing.landlordId === user._id ||
        (await publiclyVisible(ctx, listing)));
    let profilePath: string | null = null;
    if (other?.role === "landlord") profilePath = `/landlords/${otherId}`;
    else if (other && (await canReadTraveler(ctx, otherId)))
      profilePath = `/travelers/${otherId}`;
    return {
      startedAt: conv.termsAtStart?.capturedAt ?? conv._creationTime,
      termsAtStart: conv.termsAtStart,
      recipient: other
        ? {
            name: other.displayName || other.name,
            image: await profileImage(ctx, other, "profile"),
            profilePath,
            occupation: other.occupation ?? null,
            company: other.company ?? null,
            bio: other.bio ?? null,
            city: other.city ?? null,
            state: other.state ?? null,
          }
        : null,
      property: {
        title: canOpen
          ? listing!.title
          : (conv.termsAtStart?.title ?? "Unavailable property"),
        city: canOpen ? listing!.city : (conv.termsAtStart?.city ?? ""),
        state: canOpen ? listing!.state : (conv.termsAtStart?.state ?? ""),
        currentMonthlyRateCents: canOpen
          ? monthlyRateCents(listing!.price)
          : null,
        canOpen,
        exists: !!listing,
        minStayMonths: canOpen ? listing!.minStay : null,
        utilitiesIncluded: canOpen ? listing!.utilitiesIncluded : null,
      },
    };
  },
});
export const inquiries = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      id: v.id("bookingInquiries"),
      status: inquiryStatus,
      moveIn: v.number(),
      moveOut: v.number(),
      occupants: v.number(),
      pets: v.boolean(),
      initialNote: v.string(),
      createdAt: v.number(),
      originalRequest: v.optional(originalRequest),
      explicitlyLinked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const { conv } = await requireConversation(ctx, args.conversationId);
    const result = await ctx.db
      .query("bookingInquiries")
      .withIndex("by_listing_tenant", (q) =>
        q.eq("listingId", conv.listingId).eq("tenantId", conv.tenantId),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(1, Math.min(20, args.paginationOpts.numItems)),
        maximumRowsRead: 40,
      });
    return {
      ...result,
      page: result.page
        .filter(
          (i) =>
            i.landlordId === conv.landlordId &&
            (!i.conversationId || i.conversationId === conv._id),
        )
        .map((i) => ({
          id: i._id,
          status: i.status,
          moveIn: i.moveIn,
          moveOut: i.moveOut,
          occupants: i.occupants,
          pets: i.pets,
          initialNote: i.message,
          createdAt: i.createdAt,
          originalRequest: i.originalRequest,
          explicitlyLinked: i.conversationId === conv._id,
        })),
    };
  },
});
