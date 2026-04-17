import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

function buildConversationId(
  userIdA: string,
  userIdB: string,
  listingId: string
): string {
  const [first, second] = [userIdA, userIdB].sort();
  return `${first}_${second}_${listingId}`;
}

export const sendMessage = mutation({
  args: {
    senderId: v.id("users"),
    receiverId: v.id("users"),
    listingId: v.id("listings"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new Error("User not found");
    if (caller._id !== args.senderId) throw new Error("Not authorized");

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

    const messageId = await ctx.db.insert("messages", {
      conversationId,
      senderId: args.senderId,
      receiverId: args.receiverId,
      listingId: args.listingId,
      content: args.content,
      read: false,
      createdAt: now,
    });

    const senderIsLandlord = args.senderId === listing.landlordId;
    const tenantId = senderIsLandlord ? args.receiverId : args.senderId;
    const landlordId = senderIsLandlord ? args.senderId : args.receiverId;

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

    if (receiver.email) {
      await ctx.scheduler.runAfter(
        0,
        internal.emails.sendNewMessageNotification,
        {
          toEmail: receiver.email,
          toName: receiver.name,
          fromName: sender.name,
          listingTitle: listing.title,
          messagePreview: args.content.slice(0, 200),
          conversationId,
        }
      );
    }

    return messageId;
  },
});

export const getConversations = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    // Allow querying your own conversations only
    if (!caller || caller._id !== args.userId) return [];

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

    const seenIds = new Set<string>();
    const unique = [...asTenant, ...asLandlord].filter((c) => {
      if (seenIds.has(c._id)) return false;
      seenIds.add(c._id);
      return true;
    });

    const enriched = await Promise.all(
      unique.map(async (conv) => {
        const [listing, otherUser] = await Promise.all([
          ctx.db.get(conv.listingId),
          ctx.db.get(
            conv.tenantId === args.userId ? conv.landlordId : conv.tenantId
          ),
        ]);
        return { ...conv, listing: listing ?? null, otherUser: otherUser ?? null };
      })
    );

    enriched.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    return enriched;
  },
});

export const getMessages = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) return [];

    // Verify the caller is an actual participant by looking up their conversations
    // and checking if any derives to the requested conversationId.
    // This avoids substring-matching bugs (e.g. ID "abc" matching "abcdef").
    const [asTenant, asLandlord] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_tenant", (q) => q.eq("tenantId", caller._id))
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_landlord", (q) => q.eq("landlordId", caller._id))
        .collect(),
    ]);

    const isParticipant = [...asTenant, ...asLandlord].some((conv) => {
      const derived = buildConversationId(
        conv.tenantId,
        conv.landlordId,
        conv.listingId
      );
      return derived === args.conversationId;
    });

    if (!isParticipant) return [];

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

export const markRead = mutation({
  args: {
    conversationId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller._id !== args.userId) throw new Error("Not authorized");

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
