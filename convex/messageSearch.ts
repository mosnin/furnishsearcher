import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import {
  conversationKey,
  enrichConversation,
  findConversationByKey,
  isParticipant,
  requireConversation,
} from "./lib/messageAccess";
import { conversationSummary, messageDoc } from "./validators/messaging";
import { syncInbox, INBOX_MIGRATION } from "./lib/inbox";
import {
  prepareMessageSearch,
  messageExcerpt,
  currentNameMatches,
  participantSearchName,
} from "../lib/message-search";
const NAMES_MIGRATION = "conversation-visible-name-search-v2";
const scope = v.union(
  v.literal("everywhere"),
  v.literal("all"),
  v.literal("unread"),
  v.literal("archived"),
  v.literal("blocked"),
);
const args = {
  query: v.string(),
  scope,
  paginationOpts: paginationOptsValidator,
};
function options(value: { numItems: number; cursor: string | null }) {
  if (!Number.isSafeInteger(value.numItems) || value.numItems < 1)
    throw new Error("Choose a valid search page size.");
  return {
    ...value,
    numItems: Math.min(20, value.numItems),
    maximumRowsRead: 60,
    maximumBytesRead: 512 * 1024,
  };
}
function validMessage(message: Doc<"messages">, conv: Doc<"conversations">) {
  return (
    message.listingId === conv.listingId &&
    message.conversationId ===
      conversationKey(conv.tenantId, conv.landlordId, conv.listingId) &&
    isParticipant(conv, message.senderId) &&
    isParticipant(conv, message.receiverId) &&
    message.senderId !== message.receiverId
  );
}
async function resolve(
  ctx: QueryCtx,
  message: Doc<"messages">,
  userId: Id<"users">,
) {
  const conv = message.conversationDocId
    ? await ctx.db.get(message.conversationDocId)
    : await findConversationByKey(ctx, message.conversationId);
  return conv && isParticipant(conv, userId) && validMessage(message, conv)
    ? conv
    : null;
}
function inScope(
  item: {
    blockedByMe: boolean;
    archived: boolean;
    tenantId: Id<"users">;
    tenantRead: boolean;
    landlordRead: boolean;
  },
  userId: Id<"users">,
  selected: string,
) {
  if (selected === "everywhere") return true;
  if (selected === "blocked") return item.blockedByMe;
  if (item.blockedByMe) return false;
  if (selected === "archived") return item.archived;
  return (
    !item.archived &&
    (selected !== "unread" ||
      !(item.tenantId === userId ? item.tenantRead : item.landlordRead))
  );
}
export const messages = query({
  args: {
    ...args,
    direction: v.union(v.literal("sent"), v.literal("received")),
  },
  returns: paginationResultValidator(
    v.object({
      messageId: v.id("messages"),
      excerpt: v.string(),
      createdAt: v.number(),
      conversation: conversationSummary,
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      { query: text } = prepareMessageSearch(args.query);
    const result = await ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) =>
        args.direction === "sent"
          ? q.search("content", text).eq("senderId", user._id)
          : q.search("content", text).eq("receiverId", user._id),
      )
      .paginate(options(args.paginationOpts));
    const page = [];
    for (const message of result.page) {
      const conv = await resolve(ctx, message, user._id);
      if (!conv) continue;
      const item = await enrichConversation(ctx, conv, user._id);
      if (inScope(item, user._id, args.scope))
        page.push({
          messageId: message._id,
          excerpt: messageExcerpt(message.content, text),
          createdAt: message.createdAt,
          conversation: item,
        });
    }
    return { ...result, page };
  },
});
export const people = query({
  args,
  returns: paginationResultValidator(conversationSummary),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      { query: text } = prepareMessageSearch(args.query);
    const result = await ctx.db
      .query("conversationInbox")
      .withSearchIndex("search_person", (q) => {
        const base = q.search("personText", text).eq("userId", user._id);
        if (args.scope === "everywhere") return base;
        const filtered = base.eq(
          "folder",
          args.scope === "all" || args.scope === "unread"
            ? "inbox"
            : args.scope,
        );
        return args.scope === "unread" ? filtered.eq("unread", true) : filtered;
      })
      .paginate(options(args.paginationOpts));
    const page = [];
    for (const row of result.page) {
      const conv = await ctx.db.get(row.conversationId);
      if (!conv || !isParticipant(conv, user._id)) continue;
      const otherId =
          user._id === conv.tenantId ? conv.landlordId : conv.tenantId,
        other = await ctx.db.get(otherId);
      // A delayed profile-name job cannot return a match for a removed name.
      if (!currentNameMatches(participantSearchName(other), text)) continue;
      const item = await enrichConversation(ctx, conv, user._id);
      if (inScope(item, user._id, args.scope)) page.push(item);
    }
    return { ...result, page };
  },
});
export const window = query({
  args: { conversationId: v.id("conversations"), messageId: v.id("messages") },
  returns: v.union(
    v.null(),
    v.object({ targetId: v.id("messages"), messages: v.array(messageDoc) }),
  ),
  handler: async (ctx, args) => {
    const { conv } = await requireConversation(ctx, args.conversationId),
      message = await ctx.db.get(args.messageId);
    if (
      !message ||
      !validMessage(message, conv) ||
      (message.conversationDocId && message.conversationDocId !== conv._id)
    )
      return null;
    const before = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q
          .eq("conversationId", message.conversationId)
          .lt("_creationTime", message._creationTime),
      )
      .order("desc")
      .take(25);
    const after = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q
          .eq("conversationId", message.conversationId)
          .gte("_creationTime", message._creationTime),
      )
      .order("asc")
      .take(26);
    return {
      targetId: message._id,
      messages: [
        ...after
          .filter((row) => row._id !== message._id)
          .slice(0, 25)
          .reverse(),
        message,
        ...before,
      ].filter(
        (row) =>
          validMessage(row, conv) &&
          (!row.conversationDocId || row.conversationDocId === conv._id),
      ),
    };
  },
});
export const status = query({
  args: {},
  returns: v.object({ namesReady: v.boolean(), historyReady: v.boolean() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const names = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", NAMES_MIGRATION))
      .unique();
    const inbox = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", INBOX_MIGRATION))
      .unique();
    const pendingNames = await ctx.db
      .query("participantNameJobs")
      .withIndex("by_pending", (q) => q.eq("pending", true))
      .first();
    const pendingFolder = await ctx.db
      .query("inboxFolderJobs")
      .withIndex("by_user_pending", (q) =>
        q.eq("userId", user._id).eq("pending", true),
      )
      .first();
    return {
      namesReady: !!names?.complete && !pendingNames,
      historyReady: !!inbox?.complete && !pendingFolder,
    };
  },
});
export const backfillNames = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    let state = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", NAMES_MIGRATION))
      .unique();
    if (state?.complete) return null;
    if (!state) {
      const id = await ctx.db.insert("dataMigrations", {
        name: NAMES_MIGRATION,
        cursor: null,
        complete: false,
      });
      state = (await ctx.db.get(id))!;
    }
    const page = await ctx.db
      .query("conversationInbox")
      .paginate({ cursor: state.cursor, numItems: 30 });
    for (const row of page.page) await syncInbox(ctx, row.conversationId);
    await ctx.db.patch(state._id, {
      complete: page.isDone,
      cursor: page.isDone ? null : page.continueCursor,
    });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.messageSearch.backfillNames, {});
    return null;
  },
});
export const refreshNames = internalMutation({
  args: {
    jobId: v.id("participantNameJobs"),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !job.pending || job.generation !== args.generation) return null;
    const page = await ctx.db
      .query("conversationInbox")
      .withIndex("by_other", (q) => q.eq("otherId", job.userId))
      .paginate({ cursor: args.cursor, numItems: 30 });
    for (const row of page.page) await syncInbox(ctx, row.conversationId);
    if (page.isDone) await ctx.db.patch(job._id, { pending: false });
    else
      await ctx.scheduler.runAfter(0, internal.messageSearch.refreshNames, {
        ...args,
        cursor: page.continueCursor,
      });
    return null;
  },
});
export const retryNames = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("participantNameJobs")
      .withIndex("by_pending", (q) => q.eq("pending", true))
      .take(20);
    for (const job of jobs)
      await ctx.scheduler.runAfter(0, internal.messageSearch.refreshNames, {
        jobId: job._id,
        generation: job.generation,
        cursor: null,
      });
    return jobs.length;
  },
});
