import { recordPerformance } from "./performance";
import { syncInbox } from "./inbox";
import { recordDemand } from "./market";
import { demandShape } from "../../lib/market-insights";
import { monthlyRateCents } from "./threadContext";
import { publiclyVisible } from "./publication";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireUser } from "./auth";
import { conversationKey, requireMessagingAllowed } from "./messageAccess";

export async function sendListingMessage(
  ctx: MutationCtx,
  args: {
    senderId: Id<"users">;
    receiverId: Id<"users">;
    listingId: Id<"listings">;
    content: string;
    clientRequestId?: string;
    origin?: "inbox" | "property" | "housing_request";
    rentalInquiryId?: Id<"bookingInquiries">;
  },
) {
  const sender = await requireUser(ctx);
  if (sender._id !== args.senderId) throw new Error("Not authorized");
  if (args.senderId === args.receiverId)
    throw new Error("You cannot message yourself.");
  const content = args.content.trim();
  if (!content || content.length > 2000)
    throw new Error("Enter a message of up to 2,000 characters.");
  const inquiry = args.rentalInquiryId
    ? await ctx.db.get(args.rentalInquiryId)
    : null;
  if (
    args.rentalInquiryId &&
    (!inquiry ||
      inquiry.listingId !== args.listingId ||
      ![inquiry.tenantId, inquiry.landlordId].includes(sender._id) ||
      ![inquiry.tenantId, inquiry.landlordId].includes(args.receiverId) ||
      args.receiverId === sender._id)
  )
    throw new Error(
      "This inquiry does not belong to these conversation participants and property.",
    );
  if (args.clientRequestId) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        args.clientRequestId,
      )
    )
      throw new Error("Invalid send reference.");
    const previous = await ctx.db
      .query("messages")
      .withIndex("by_sender_request", (q) =>
        q
          .eq("senderId", sender._id)
          .eq("clientRequestId", args.clientRequestId),
      )
      .unique();
    if (previous) {
      if (
        previous.receiverId !== args.receiverId ||
        previous.listingId !== args.listingId ||
        previous.content !== content ||
        !previous.conversationDocId ||
        ((previous.requestBindingVersion === 2 ||
          previous.rentalInquiryId !== undefined) &&
          previous.rentalInquiryId !== args.rentalInquiryId)
      )
        throw new Error("Send reference already used for another message.");
      return {
        messageId: previous._id,
        conversationId: previous.conversationDocId,
      };
    }
  }
  await requireMessagingAllowed(ctx, sender._id, args.receiverId);
  const [receiver, listing] = await Promise.all([
    ctx.db.get(args.receiverId),
    ctx.db.get(args.listingId),
  ]);
  if (!receiver || !listing)
    throw new Error("Property or recipient not found.");
  if (listing.landlordId !== sender._id && listing.landlordId !== receiver._id)
    throw new Error("Messages must include the property owner.");
  const senderIsLandlord = sender._id === listing.landlordId;
  const tenantId = senderIsLandlord ? receiver._id : sender._id;
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_listing_tenant", (q) =>
      q.eq("listingId", listing._id).eq("tenantId", tenantId),
    )
    .unique();
  const visibleAtCreation = !existing && (await publiclyVisible(ctx, listing));
  if (!existing && !visibleAtCreation) {
    if (
      !inquiry ||
      inquiry.listingId !== listing._id ||
      inquiry.landlordId !== listing.landlordId ||
      inquiry.tenantId !== tenantId
    )
      throw new Error("This property is not accepting new messages.");
  }
  const key = conversationKey(sender._id, receiver._id, listing._id),
    now = Date.now();
  const patch = {
    key,
    lastMessage: content,
    lastMessageAt: now,
    tenantRead: senderIsLandlord ? false : (existing?.tenantRead ?? true),
    landlordRead: senderIsLandlord ? (existing?.landlordRead ?? true) : false,
    // A fresh message returns both parties' conversations to the main inbox.
    tenantArchived: false,
    landlordArchived: false,
  };
  let conversationId: Id<"conversations">;
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    conversationId = existing._id;
  } else
    conversationId = await ctx.db.insert("conversations", {
      listingId: listing._id,
      tenantId,
      landlordId: listing.landlordId,
      ...patch,
      termsAtStart: visibleAtCreation
        ? {
            title: listing.title,
            city: listing.city,
            state: listing.state,
            monthlyRateCents: monthlyRateCents(listing.price),
            currency: "USD",
            capturedAt: now,
          }
        : undefined,
    });
  if (!existing && !senderIsLandlord)
    await recordPerformance(ctx, listing, "threads");
  if (!existing && !senderIsLandlord)
    await recordDemand(
      ctx,
      "conversation",
      `account:${sender._id}`,
      demandShape({
        city: listing.city,
        state: listing.state,
        bedrooms: listing.bedrooms,
        maxPrice: listing.price,
        propertyType: listing.propertyType,
      }),
    );
  if (inquiry) {
    if (
      inquiry.landlordId !== listing.landlordId ||
      inquiry.tenantId !== tenantId ||
      (inquiry.conversationId && inquiry.conversationId !== conversationId)
    )
      throw new Error("The inquiry conversation association needs review.");
    if (!inquiry.conversationId)
      await ctx.db.patch(inquiry._id, { conversationId });
  }
  await syncInbox(ctx, conversationId);
  const messageId = await ctx.db.insert("messages", {
    ...(args.rentalInquiryId ? { rentalInquiryId: args.rentalInquiryId } : {}),
    conversationId: key,
    conversationDocId: conversationId,
    senderId: sender._id,
    receiverId: receiver._id,
    listingId: listing._id,
    content,
    read: false,
    createdAt: now,
    origin: args.origin ?? "property",
    ...(args.clientRequestId
      ? {
          clientRequestId: args.clientRequestId,
          requestBindingVersion: 2 as const,
        }
      : {}),
    emailStatus: "pending",
  });
  await ctx.scheduler.runAfter(0, internal.messageEmails.notify, { messageId });
  return { messageId, conversationId };
}
