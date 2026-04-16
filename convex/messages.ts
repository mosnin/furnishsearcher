import { v } from "convex/values";
import { mutation, query } from "convex/server";

/**
 * Derives a stable, order-independent conversation ID from two user IDs and
 * a listing ID. Sorting the user IDs ensures the same key is produced
 * regardless of which party initiates the conversation.
 */
function buildConversationId(
  userIdA: string,
  userIdB: string,
  listingId: string
): string {
  const [first, second] = [userIdA, userIdB].sort();
  return `${first}_${second}_${listingId}`;
}

/**
 * Sends a message between a tenant and a landlord about a specific listing.
 * On first contact this creates the conversation record; subsequent messages
 * update the conversation's lastMessage snapshot and unread flags.
 *
 * The tenant/landlord roles are inferred from the listing's landlordId so the
 * caller does not need to pass them explicitly.
 *
 * Returns the ID of the newly created message document.
 */
export const sendMessage = mutation({
  args: {
    senderId: v.id("users"),
    receiverId: v.id("users"),
    listingId: v.id("listings"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate all referenced documents exist
    const sender = await ctx.db.get(args.senderId);
    if (!sender) throw new Error(`Sender ${args.senderId} not found`);

    const receiver = await ctx.db.get(args.receiverId);
    if (!receiver) throw new Error(`Receiver ${args.receiverId} not found`);

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error(`Listing ${args.listingId} not found`);

    const conversationId = buildConversationId(
      args.senderId,
      args.receiverId,
      args.listingId
    );

    const now = Date.now();

    // Insert message
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      senderId: args.senderId,
      receiverId: args.receiverId,
      listingId: args.listingId,
      content: args.content,
      read: false,
      createdAt: now,
    });

    // Determine canonical tenant / landlord for this conversation.
    // The listing owner is the landlord; the other party is the tenant.
    const senderIsLandlord = args.senderId === listing.landlordId;
    const tenantId = senderIsLandlord ? args.receiverId : args.senderId;
    const landlordId = senderIsLandlord ? args.senderId : args.receiverId;

    // Upsert the conversation snapshot
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_listing_tenant", (q) =>
        q.eq("listingId", args.listingId).eq("tenantId", tenantId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastMessage: args.content,
        lastMessageAt: now,
        // The sender has read their own message; the receiver has not.
        tenantRead: senderIsLandlord ? false : true,
        landlordRead: senderIsLandlord ? true : false,
      });
    } else {
      await ctx.db.insert("conversations", {
        listingId: args.listingId,
        tenantId,
        landlordId,
        lastMessage: args.content,
        lastMessageAt: now,
        tenantRead: senderIsLandlord ? false : true,
        landlordRead: senderIsLandlord ? true : false,
      });
    }

    return messageId;
  },
});

/**
 * Returns all conversations the given user participates in (as either tenant
 * or landlord), enriched with the listing summary and the other party's user
 * document. Results are sorted by most-recent message first.
 */
export const getConversations = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return [];

    const [asTenant, asLandlord] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.userId))
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_landlord", (q) => q.eq("landlordId", args.userId))
        .collect(),
    ]);

    // Merge and deduplicate (a user should not appear on both sides, but be safe)
    const seenIds = new Set<string>();
    const unique = [...asTenant, ...asLandlord].filter((c) => {
      if (seenIds.has(c._id)) return false;
      seenIds.add(c._id);
      return true;
    });

    // Enrich each conversation with listing and other-party data
    const enriched = await Promise.all(
      unique.map(async (conv) => {
        const [listing, otherUser] = await Promise.all([
          ctx.db.get(conv.listingId),
          ctx.db.get(
            conv.tenantId === args.userId ? conv.landlordId : conv.tenantId
          ),
        ]);

        return {
          ...conv,
          listing: listing ?? null,
          otherUser: otherUser ?? null,
        };
      })
    );

    // Sort most-recent first
    enriched.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    return enriched;
  },
});

/**
 * Returns all messages belonging to a conversation in ascending chronological
 * order (oldest first), ready for display in a chat UI.
 */
export const getMessages = query({
  args: {
    conversationId: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    messages.sort((a, b) => a.createdAt - b.createdAt);

    return messages;
  },
});

/**
 * Marks all unread messages addressed to `userId` in the given conversation
 * as read, and updates the corresponding conversation's read flag for that
 * user's side (tenantRead or landlordRead).
 */
export const markRead = mutation({
  args: {
    conversationId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Mark every unread message where this user is the receiver
    const unread = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("receiverId"), args.userId),
          q.eq(q.field("read"), false)
        )
      )
      .collect();

    await Promise.all(unread.map((msg) => ctx.db.patch(msg._id, { read: true })));

    // Update the conversation-level read flag for this user.
    // We look up the conversation through both tenant and landlord indexes
    // because the conversationId is a derived string, not the document ID.
    const [asTenant, asLandlord] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.userId))
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_landlord", (q) => q.eq("landlordId", args.userId))
        .collect(),
    ]);

    const candidates = [...asTenant, ...asLandlord];

    for (const conv of candidates) {
      const derivedId = buildConversationId(
        conv.tenantId,
        conv.landlordId,
        conv.listingId
      );
      if (derivedId === args.conversationId) {
        const isTenant = conv.tenantId === args.userId;
        await ctx.db.patch(conv._id, {
          tenantRead: isTenant ? true : conv.tenantRead,
          landlordRead: !isTenant ? true : conv.landlordRead,
        });
        break;
      }
    }
  },
});
