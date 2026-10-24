import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireUser } from "./auth";

export async function sendListingMessage(
  ctx: MutationCtx,
  args: {
    senderId: Id<"users">;
    receiverId: Id<"users">;
    listingId: Id<"listings">;
    content: string;
  },
) {
  const sender = await requireUser(ctx);
  if (sender._id !== args.senderId) throw new Error("Not authorized");
  if (args.senderId === args.receiverId)
    throw new Error("You cannot message yourself.");
  const content = args.content.trim();
  if (!content || content.length > 2000)
    throw new Error("Enter a message of up to 2,000 characters.");
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
  if (!existing && listing.status !== "active")
    throw new Error("This property is not accepting new messages.");
  const conversationKey =
    [sender._id, receiver._id].sort().join("_") + "_" + listing._id;
  const now = Date.now();
  const messageId = await ctx.db.insert("messages", {
    conversationId: conversationKey,
    senderId: sender._id,
    receiverId: receiver._id,
    listingId: listing._id,
    content,
    read: false,
    createdAt: now,
  });
  const patch = {
    lastMessage: content,
    lastMessageAt: now,
    tenantRead: !senderIsLandlord,
    landlordRead: senderIsLandlord,
  };
  let conversationId: Id<"conversations">;
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    conversationId = existing._id;
  } else {
    conversationId = await ctx.db.insert("conversations", {
      listingId: listing._id,
      tenantId,
      landlordId: listing.landlordId,
      ...patch,
    });
  }
  if (receiver.email)
    await ctx.scheduler.runAfter(
      0,
      internal.emails.sendNewMessageNotification,
      {
        toEmail: receiver.email,
        toName: receiver.name,
        fromName: sender.name,
        listingTitle: listing.title,
        messagePreview: content.slice(0, 200),
        conversationId,
      },
    );
  return { messageId, conversationId };
}
