import { syncInbox, queueFolderSync } from "./lib/inbox";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { sendListingMessage } from "./lib/messaging";
import { requireUser } from "./lib/auth";
import {
  conversationKey,
  findConversationByKey,
  isParticipant,
  requireConversation,
  enrichConversation,
  blockState,
} from "./lib/messageAccess";
import {
  messageDoc,
  conversationSummary,
  messageOrigin,
  messageEmailStatus,
} from "./validators/messaging";

export const sendMessage = mutation({
  args: {
    senderId: v.id("users"),
    receiverId: v.id("users"),
    listingId: v.id("listings"),
    content: v.string(),
    clientRequestId: v.optional(v.string()),
    origin: v.optional(messageOrigin),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => (await sendListingMessage(ctx, args)).messageId,
});
// Compatibility for older callers: newest 100 conversations only.
// Current clients use inbox.list and inbox.summary for complete paging/counts.
export const getConversations = query({
  args: { userId: v.id("users") },
  returns: v.array(conversationSummary),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller._id !== args.userId) return [];
    const [tenant, owner] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_tenant_latest", (q) => q.eq("tenantId", caller._id))
        .order("desc")
        .take(100),
      ctx.db
        .query("conversations")
        .withIndex("by_landlord_latest", (q) => q.eq("landlordId", caller._id))
        .order("desc")
        .take(100),
    ]);
    const unique = Array.from(
      new Map([...tenant, ...owner].map((c) => [c._id, c])).values(),
    );
    const summaries = await Promise.all(
      unique.map((c) => enrichConversation(ctx, c, caller._id)),
    );
    return summaries
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 100);
  },
});
export const listMessages = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageDoc),
  handler: async (ctx, args) => {
    const { conv } = await requireConversation(ctx, args.conversationId);
    return ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq(
          "conversationId",
          conversationKey(conv.tenantId, conv.landlordId, conv.listingId),
        ),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
// Compatibility endpoint for older clients. The current inbox uses listMessages
// and can page through the entire history.
export const getMessages = query({
  args: { conversationId: v.string() },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    const conv = await findConversationByKey(ctx, args.conversationId);
    if (!user || !conv || !isParticipant(conv, user._id)) return [];
    return (
      await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId),
        )
        .order("desc")
        .take(100)
    ).reverse();
  },
});
async function readBatch(
  ctx: MutationCtx,
  conv: Doc<"conversations">,
  userId: Id<"users">,
  cutoff: number,
  generation: number,
): Promise<void> {
  const tenant = conv.tenantId === userId;
  const generationField = tenant
    ? "tenantReadGeneration"
    : "landlordReadGeneration";
  if (conv[generationField] !== generation) return;
  const key = conversationKey(conv.tenantId, conv.landlordId, conv.listingId);
  const unread = await ctx.db
    .query("messages")
    .withIndex("by_conversation_receiver_read", (q) =>
      q
        .eq("conversationId", key)
        .eq("receiverId", userId)
        .eq("read", false)
        .lte("_creationTime", cutoff),
    )
    .take(100);
  for (const message of unread)
    await ctx.db.patch(message._id, { read: true, readAt: Date.now() });
  const remaining = await ctx.db
    .query("messages")
    .withIndex("by_conversation_receiver_read", (q) =>
      q.eq("conversationId", key).eq("receiverId", userId).eq("read", false),
    )
    .first();
  await ctx.db.patch(
    conv._id,
    tenant ? { tenantRead: !remaining } : { landlordRead: !remaining },
  );
  await syncInbox(ctx, conv._id);
  if (unread.length === 100)
    await ctx.scheduler.runAfter(0, internal.messages.continueRead, {
      conversationId: conv._id,
      userId,
      cutoff,
      generation,
    });
}
export const markRead = mutation({
  args: {
    conversationId: v.string(),
    userId: v.id("users"),
    throughMessageId: v.optional(v.id("messages")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const conv = await findConversationByKey(ctx, args.conversationId);
    if (user._id !== args.userId || !conv || !isParticipant(conv, user._id))
      throw new Error("Conversation not found.");
    const latest = args.throughMessageId
      ? await ctx.db.get(args.throughMessageId)
      : await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", args.conversationId),
          )
          .order("desc")
          .first();
    if (args.throughMessageId && !latest)
      throw new Error("Message is unavailable.");
    if (latest && latest.conversationId !== args.conversationId)
      throw new Error("Message does not belong to this conversation.");
    const field =
      conv.tenantId === user._id
        ? "tenantReadGeneration"
        : "landlordReadGeneration";
    const generation = (conv[field] ?? 0) + 1;
    await ctx.db.patch(conv._id, { [field]: generation });
    await readBatch(
      ctx,
      { ...conv, [field]: generation },
      user._id,
      latest?._creationTime ?? Date.now(),
      generation,
    );
    return null;
  },
});
export const continueRead = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    cutoff: v.number(),
    generation: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (conv && isParticipant(conv, args.userId))
      await readBatch(ctx, conv, args.userId, args.cutoff, args.generation);
    return null;
  },
});
export const setUnread = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, conv } = await requireConversation(ctx, args.conversationId);
    await ctx.db.patch(
      conv._id,
      conv.tenantId === user._id
        ? {
            tenantRead: false,
            tenantReadGeneration: (conv.tenantReadGeneration ?? 0) + 1,
          }
        : {
            landlordRead: false,
            landlordReadGeneration: (conv.landlordReadGeneration ?? 0) + 1,
          },
    );
    await syncInbox(ctx, conv._id);
    return null;
  },
});
export const setArchived = mutation({
  args: { conversationId: v.id("conversations"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, conv } = await requireConversation(ctx, args.conversationId);
    await ctx.db.patch(
      conv._id,
      conv.tenantId === user._id
        ? { tenantArchived: args.archived }
        : { landlordArchived: args.archived },
    );
    await syncInbox(ctx, conv._id);
    return null;
  },
});
export const setBlocked = mutation({
  args: { conversationId: v.id("conversations"), blocked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, conv } = await requireConversation(ctx, args.conversationId);
    const other = conv.tenantId === user._id ? conv.landlordId : conv.tenantId;
    const existing = await ctx.db
      .query("userBlocks")
      .withIndex("by_pair", (q) =>
        q.eq("blockerId", user._id).eq("blockedId", other),
      )
      .unique();
    if (args.blocked && !existing)
      await ctx.db.insert("userBlocks", {
        blockerId: user._id,
        blockedId: other,
        createdAt: Date.now(),
      });
    else if (!args.blocked && existing) await ctx.db.delete(existing._id);
    if (args.blocked !== !!existing)
      await queueFolderSync(ctx, user._id, other);
    return null;
  },
});
export const blockedUsers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      blockedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("userBlocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (b) => ({
          userId: b.blockedId,
          name: (await ctx.db.get(b.blockedId))?.name ?? "Deleted account",
          blockedAt: b.createdAt,
        })),
      ),
    };
  },
});
export const unblockUser = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const block = await ctx.db
      .query("userBlocks")
      .withIndex("by_pair", (q) =>
        q.eq("blockerId", user._id).eq("blockedId", args.userId),
      )
      .unique();
    if (block) {
      await ctx.db.delete(block._id);
      await queueFolderSync(ctx, user._id, args.userId);
    }
    return null;
  },
});
export const notificationDetails = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(
    v.null(),
    v.object({
      suppressed: v.boolean(),
      email: v.string(),
      name: v.string(),
      sender: v.string(),
      title: v.string(),
      preview: v.string(),
      conversationId: v.id("conversations"),
    }),
  ),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message || message.emailStatus !== "pending") return null;
    const receiver = await ctx.db.get(message.receiverId),
      sender = await ctx.db.get(message.senderId),
      listing = await ctx.db.get(message.listingId);
    const conv = message.conversationDocId
      ? await ctx.db.get(message.conversationDocId)
      : await findConversationByKey(ctx, message.conversationId);
    if (!receiver || !sender || !conv) return null;
    const blocked = await blockState(ctx, sender._id, receiver._id);
    return {
      suppressed: blocked.cannotMessage,
      email: receiver.email,
      name: receiver.name,
      sender: sender.name,
      title: listing?.title ?? "A property conversation",
      preview: message.content.slice(0, 200),
      conversationId: conv._id,
    };
  },
});
export const recordNotification = internalMutation({
  args: { messageId: v.id("messages"), status: messageEmailStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (message?.emailStatus === "pending")
      await ctx.db.patch(message._id, { emailStatus: args.status });
    return null;
  },
});

// Compatibility guard for already queued email jobs from older deployments.
export const legacyNotificationConversation = internalQuery({
  args: { conversationId: v.string(), email: v.string() },
  returns: v.union(v.null(), v.id("conversations")),
  handler: async (ctx, args) => {
    const docId = ctx.db.normalizeId("conversations", args.conversationId);
    const conv = docId
      ? await ctx.db.get(docId)
      : await findConversationByKey(ctx, args.conversationId);
    if (!conv) return null;
    const [tenant, owner] = await Promise.all([
      ctx.db.get(conv.tenantId),
      ctx.db.get(conv.landlordId),
    ]);
    if (
      !tenant ||
      !owner ||
      ![tenant.email.toLowerCase(), owner.email.toLowerCase()].includes(
        args.email.toLowerCase(),
      )
    )
      return null;
    if ((await blockState(ctx, tenant._id, owner._id)).cannotMessage)
      return null;
    return conv._id;
  },
});
