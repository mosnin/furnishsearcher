import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { messageEmailRecipient, emailContactMode } from "./lib/emailContact";
import { replyDomain, repliesConfigured } from "./lib/emailReplies";
import { requireUser } from "./lib/auth";
import {
  blockState,
  conversationKey,
  isParticipant,
} from "./lib/messageAccess";
import { syncInbox } from "./lib/inbox";

export const prepareBinding = internalMutation({
  args: {
    messageId: v.id("messages"),
    digest: v.string(),
    revision: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!repliesConfigured() || !/^[a-f0-9]{64}$/.test(args.digest))
      return false;
    const message = await ctx.db.get(args.messageId);
    if (
      !message ||
      message.emailStatus !== "pending" ||
      !message.conversationDocId
    )
      return false;
    const user = await ctx.db.get(message.receiverId),
      conv = await ctx.db.get(message.conversationDocId);
    if (
      !user ||
      !conv ||
      !isParticipant(conv, user._id) ||
      !isParticipant(conv, message.senderId) ||
      message.senderId === user._id ||
      conv.listingId !== message.listingId ||
      !messageEmailRecipient(user) ||
      (user.notificationEmailRevision ?? 0) !== args.revision ||
      (await blockState(ctx, message.senderId, user._id)).cannotMessage
    )
      return false;
    const previous = await ctx.db
      .query("emailReplyBindings")
      .withIndex("by_digest", (q) => q.eq("digest", args.digest))
      .unique();
    if (previous)
      return (
        previous.messageId === message._id &&
        previous.userId === user._id &&
        previous.revision === args.revision &&
        previous.domain === replyDomain() &&
        previous.expiresAt > Date.now()
      );
    if (
      (
        await ctx.db
          .query("emailReplyBindings")
          .withIndex("by_source", (q) => q.eq("messageId", message._id))
          .take(4)
      ).length >= 4
    )
      return false;
    await ctx.db.insert("emailReplyBindings", {
      digest: args.digest,
      messageId: message._id,
      userId: user._id,
      conversationId: conv._id,
      email: user.notificationEmail!,
      revision: args.revision,
      domain: replyDomain()!,
      mode: emailContactMode(),
      expiresAt: user.notificationEmailExpiresAt!,
    });
    return true;
  },
});

export const enqueue = internalMutation({
  args: { emailId: v.string(), digest: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(args.emailId))
      throw new Error("Invalid provider email reference");
    if (
      await ctx.db
        .query("inboundEmailReceipts")
        .withIndex("by_email", (q) => q.eq("emailId", args.emailId))
        .unique()
    )
      return null;
    const binding = await ctx.db
      .query("emailReplyBindings")
      .withIndex("by_digest", (q) => q.eq("digest", args.digest))
      .unique();
    if (!binding || binding.domain !== replyDomain()) return null;
    const id = await ctx.db.insert("inboundEmailReceipts", {
      bindingId: binding._id,
      userId: binding.userId,
      conversationId: binding.conversationId,
      emailId: args.emailId,
      state: "queued",
      attempt: 0,
      dueAt: Date.now(),
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.inboundEmailActions.receive, {
      id,
    });
    return null;
  },
});

export const claim = internalMutation({
  args: { id: v.id("inboundEmailReceipts") },
  returns: v.union(
    v.null(),
    v.object({ emailId: v.string(), attempt: v.number() }),
  ),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (
      !row ||
      ["accepted", "rejected"].includes(row.state) ||
      row.dueAt > Date.now()
    )
      return null;
    if (row.attempt >= 6) {
      await ctx.db.patch(id, {
        state: "rejected",
        reason: "provider_unavailable",
        completedAt: Date.now(),
      });
      return null;
    }
    const attempt = row.attempt + 1;
    await ctx.db.patch(id, {
      state: "processing",
      attempt,
      dueAt: Date.now() + 120000,
    });
    return { emailId: row.emailId, attempt };
  },
});

export const retry = internalMutation({
  args: { id: v.id("inboundEmailReceipts"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.state !== "processing" || row.attempt !== args.attempt)
      return null;
    if (row.attempt >= 6)
      await ctx.db.patch(row._id, {
        state: "rejected",
        reason: "provider_unavailable",
        completedAt: Date.now(),
      });
    else {
      const delay = Math.min(3600000, 30000 * 2 ** row.attempt);
      await ctx.db.patch(row._id, {
        state: "retrying",
        dueAt: Date.now() + delay,
      });
      await ctx.scheduler.runAfter(
        delay,
        internal.inboundEmailActions.receive,
        { id: row._id },
      );
    }
    return null;
  },
});

export const finalize = internalMutation({
  args: {
    id: v.id("inboundEmailReceipts"),
    attempt: v.number(),
    digest: v.optional(v.string()),
    sender: v.optional(v.string()),
    content: v.optional(v.string()),
    reason: v.optional(v.string()),
    attachmentsOmitted: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.state !== "processing" || row.attempt !== args.attempt)
      return null;
    const binding = row.bindingId ? await ctx.db.get(row.bindingId) : null;
    const user = binding ? await ctx.db.get(binding.userId) : null;
    const conv = binding ? await ctx.db.get(binding.conversationId) : null;
    let reason = args.reason;
    if (!binding || args.digest !== binding.digest)
      reason ??= "unrecognized_reply";
    else if (!user || !conv || !isParticipant(conv, user._id))
      reason ??= "conversation_unavailable";
    else if (
      binding.expiresAt <= Date.now() ||
      binding.mode !== emailContactMode() ||
      binding.domain !== replyDomain() ||
      !repliesConfigured() ||
      binding.revision !== user.notificationEmailRevision ||
      binding.email !== messageEmailRecipient(user)
    )
      reason ??= "expired_binding";
    else if (args.sender !== binding.email) reason ??= "sender_mismatch";
    if (!reason && user && conv) {
      const other =
        user._id === conv.tenantId ? conv.landlordId : conv.tenantId;
      const listing = await ctx.db.get(conv.listingId);
      if (
        !(await ctx.db.get(other)) ||
        !listing ||
        listing.landlordId !== conv.landlordId ||
        other === user._id
      )
        reason = "conversation_unavailable";
      else if ((await blockState(ctx, user._id, other)).cannotMessage)
        reason = "blocked";
      else if (!args.content?.trim() || args.content.length > 2000)
        reason = "invalid_content";
      else {
        const content = args.content.trim(),
          now = Date.now();
        const messageId = await ctx.db.insert("messages", {
          conversationId: conversationKey(
            conv.tenantId,
            conv.landlordId,
            conv.listingId,
          ),
          conversationDocId: conv._id,
          listingId: conv.listingId,
          senderId: user._id,
          receiverId: other,
          content,
          origin: "email",
          emailAttachmentsOmitted: args.attachmentsOmitted,
          read: false,
          createdAt: now,
          emailStatus: "pending",
        });
        await ctx.db.patch(conv._id, {
          lastMessage: content,
          lastMessageAt: now,
          tenantRead: user._id === conv.tenantId ? conv.tenantRead : false,
          landlordRead:
            user._id === conv.landlordId ? conv.landlordRead : false,
          tenantArchived: false,
          landlordArchived: false,
        });
        await syncInbox(ctx, conv._id);
        await ctx.db.patch(row._id, {
          state: "accepted",
          userId: user._id,
          conversationId: conv._id,
          messageId,
          attachmentsOmitted: args.attachmentsOmitted,
          completedAt: now,
        });
        await ctx.scheduler.runAfter(0, internal.messageEmails.notify, {
          messageId,
        });
        return null;
      }
    }
    await ctx.db.patch(row._id, {
      state: "rejected",
      reason: reason ?? "invalid_content",
      userId: binding?.userId ?? row.userId,
      conversationId: binding?.conversationId ?? row.conversationId,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const state of ["queued", "processing", "retrying"] as const) {
      const rows = await ctx.db
        .query("inboundEmailReceipts")
        .withIndex("by_due", (q) =>
          q.eq("state", state).lte("dueAt", Date.now()),
        )
        .take(10);
      for (const row of rows)
        await ctx.scheduler.runAfter(0, internal.inboundEmailActions.receive, {
          id: row._id,
        });
    }
    return null;
  },
});
export const cleanupBindings = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("emailReplyBindings")
      .withIndex("by_expiry", (q) =>
        q.lt("expiresAt", Date.now() - 7 * 86400000),
      )
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(
        0,
        internal.inboundEmails.cleanupBindings,
        {},
      );
    return null;
  },
});
export const mine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id("inboundEmailReceipts"),
      state: v.union(
        v.literal("queued"),
        v.literal("processing"),
        v.literal("retrying"),
        v.literal("accepted"),
        v.literal("rejected"),
      ),
      reason: v.union(v.string(), v.null()),
      conversationId: v.union(v.id("conversations"), v.null()),
      attachmentsOmitted: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const page = await ctx.db
      .query("inboundEmailReceipts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, args.paginationOpts.numItems),
      });
    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        state: row.state,
        reason: row.reason ?? null,
        conversationId: row.conversationId ?? null,
        attachmentsOmitted: row.attachmentsOmitted === true,
        createdAt: row.createdAt,
      })),
    };
  },
});
