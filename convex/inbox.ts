import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { enrichConversation, isParticipant } from "./lib/messageAccess";
import { syncInbox, INBOX_MIGRATION } from "./lib/inbox";
import { conversationSummary } from "./validators/messaging";
const folderValidator = v.union(
  v.literal("all"),
  v.literal("unread"),
  v.literal("archived"),
  v.literal("blocked"),
);
export const list = query({
  args: { folder: folderValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(conversationSummary),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      folder =
        args.folder === "all" || args.folder === "unread"
          ? "inbox"
          : args.folder;
    const opts = {
      ...args.paginationOpts,
      numItems: Math.max(1, Math.min(30, args.paginationOpts.numItems)),
      maximumRowsRead: 60,
    };
    const result =
      args.folder === "unread"
        ? await ctx.db
            .query("conversationInbox")
            .withIndex("by_user_folder_unread_time", (q) =>
              q.eq("userId", user._id).eq("folder", folder).eq("unread", true),
            )
            .order("desc")
            .paginate(opts)
        : await ctx.db
            .query("conversationInbox")
            .withIndex("by_user_folder_time", (q) =>
              q.eq("userId", user._id).eq("folder", folder),
            )
            .order("desc")
            .paginate(opts);
    const page = [];
    for (const row of result.page) {
      const conv = await ctx.db.get(row.conversationId);
      if (!conv || !isParticipant(conv, user._id)) continue;
      const item = await enrichConversation(ctx, conv, user._id);
      const currentFolder = item.blockedByMe
        ? "blocked"
        : item.archived
          ? "archived"
          : "inbox";
      const unread = !(conv.tenantId === user._id
        ? conv.tenantRead
        : conv.landlordRead);
      if (currentFolder === folder && (args.folder !== "unread" || unread))
        page.push(item);
    }
    return { ...result, page };
  },
});
export const conversation = query({
  args: { id: v.string() },
  returns: v.union(conversationSummary, v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      id = ctx.db.normalizeId("conversations", args.id);
    const conv = id ? await ctx.db.get(id) : null;
    return conv && isParticipant(conv, user._id)
      ? enrichConversation(ctx, conv, user._id)
      : null;
  },
});
export const summary = query({
  args: {},
  returns: v.object({
    ready: v.boolean(),
    unread: v.number(),
    inbox: v.number(),
    archived: v.number(),
    blocked: v.number(),
    recent: v.array(conversationSummary),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const migration = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", INBOX_MIGRATION))
      .unique();
    const pending = await ctx.db
      .query("inboxFolderJobs")
      .withIndex("by_user_pending", (q) =>
        q.eq("userId", user._id).eq("pending", true),
      )
      .first();
    const stats = await ctx.db
      .query("inboxStats")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const rows = await ctx.db
      .query("conversationInbox")
      .withIndex("by_user_folder_time", (q) =>
        q.eq("userId", user._id).eq("folder", "inbox"),
      )
      .order("desc")
      .take(6);
    const recent = [];
    for (const row of rows) {
      const conv = await ctx.db.get(row.conversationId);
      if (conv && isParticipant(conv, user._id)) {
        const item = await enrichConversation(ctx, conv, user._id);
        if (!item.blockedByMe && !item.archived) recent.push(item);
      }
    }
    return {
      ready: !!migration?.complete && !pending,
      unread: stats?.unread ?? 0,
      inbox: stats?.inbox ?? 0,
      archived: stats?.archived ?? 0,
      blocked: stats?.blocked ?? 0,
      recent,
    };
  },
});
export const backfill = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    let state = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", INBOX_MIGRATION))
      .unique();
    if (state?.complete) return null;
    if (!state) {
      const id = await ctx.db.insert("dataMigrations", {
        name: INBOX_MIGRATION,
        cursor: null,
        complete: false,
      });
      state = (await ctx.db.get(id))!;
    }
    const result = await ctx.db
      .query("conversations")
      .paginate({ cursor: state.cursor, numItems: 30 });
    for (const conv of result.page) await syncInbox(ctx, conv._id);
    await ctx.db.patch(state._id, {
      cursor: result.isDone ? null : result.continueCursor,
      complete: result.isDone,
    });
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.inbox.backfill, {});
    return null;
  },
});
export const syncPair = internalMutation({
  args: {
    jobId: v.id("inboxFolderJobs"),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !job.pending || job.generation !== args.generation) return null;
    const result = await ctx.db
      .query("conversationInbox")
      .withIndex("by_user_other", (q) =>
        q.eq("userId", job.userId).eq("otherId", job.otherId),
      )
      .paginate({ cursor: args.cursor, numItems: 30 });
    for (const row of result.page) await syncInbox(ctx, row.conversationId);
    if (result.isDone) await ctx.db.patch(job._id, { pending: false });
    else
      await ctx.scheduler.runAfter(0, internal.inbox.syncPair, {
        ...args,
        cursor: result.continueCursor,
      });
    return null;
  },
});
export const retryPending = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("inboxFolderJobs")
      .withIndex("by_pending", (q) => q.eq("pending", true))
      .take(20);
    for (const job of jobs)
      await ctx.scheduler.runAfter(0, internal.inbox.syncPair, {
        jobId: job._id,
        generation: job.generation,
        cursor: null,
      });
    return jobs.length;
  },
});
