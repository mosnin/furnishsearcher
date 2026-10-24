import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { sendListingMessage } from "./lib/messaging";

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
  returns: v.id("messages"),
  handler: async (ctx, args) => (await sendListingMessage(ctx, args)).messageId,
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
