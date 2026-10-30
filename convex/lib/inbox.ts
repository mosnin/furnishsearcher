import { participantSearchName } from "../../lib/message-search";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
export const INBOX_MIGRATION = "conversation-inbox-v1";
type Counts = {
  inbox: number;
  unread: number;
  archived: number;
  blocked: number;
};
const zero = (): Counts => ({ inbox: 0, unread: 0, archived: 0, blocked: 0 });
function counts(row: { folder: string; unread: boolean } | null): Counts {
  if (!row) return zero();
  return {
    inbox: row.folder === "inbox" ? 1 : 0,
    unread: row.folder === "inbox" && row.unread ? 1 : 0,
    archived: row.folder === "archived" ? 1 : 0,
    blocked: row.folder === "blocked" ? 1 : 0,
  };
}
export async function syncInbox(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
) {
  const conv = await ctx.db.get(conversationId);
  if (!conv) return;
  for (const userId of new Set([conv.tenantId, conv.landlordId])) {
    const tenant = userId === conv.tenantId,
      otherId = tenant ? conv.landlordId : conv.tenantId;
    const blocked = await ctx.db
      .query("userBlocks")
      .withIndex("by_pair", (q) =>
        q.eq("blockerId", userId).eq("blockedId", otherId),
      )
      .unique();
    const other = await ctx.db.get(otherId);
    const personText = participantSearchName(other);
    const folder = blocked
      ? ("blocked" as const)
      : (tenant ? conv.tenantArchived : conv.landlordArchived)
        ? ("archived" as const)
        : ("inbox" as const);
    const next = {
      personText,
      userId,
      otherId,
      conversationId,
      folder,
      unread: !(tenant ? conv.tenantRead : conv.landlordRead),
      lastMessageAt: conv.lastMessageAt,
    };
    const old = await ctx.db
      .query("conversationInbox")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", userId),
      )
      .unique();
    if (
      old &&
      old.folder === next.folder &&
      old.unread === next.unread &&
      old.lastMessageAt === next.lastMessageAt &&
      old.otherId === next.otherId &&
      old.personText === next.personText
    )
      continue;
    if (old) await ctx.db.patch(old._id, next);
    else await ctx.db.insert("conversationInbox", next);
    const previous = counts(old),
      updated = counts(next);
    if (
      old &&
      (Object.keys(previous) as (keyof Counts)[]).every(
        (key) => previous[key] === updated[key],
      )
    )
      continue;
    const stats = await ctx.db
      .query("inboxStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const value = zero();
    for (const key of Object.keys(value) as (keyof Counts)[])
      value[key] = (stats?.[key] ?? 0) + updated[key] - previous[key];
    if (Object.values(value).some((n) => n < 0))
      throw new Error("Inbox totals need reconciliation.");
    if (stats) await ctx.db.patch(stats._id, value);
    else await ctx.db.insert("inboxStats", { userId, ...value });
  }
}
export async function queueNameSync(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const old = await ctx.db
    .query("participantNameJobs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const rows = await ctx.db
    .query("conversationInbox")
    .withIndex("by_other", (q) => q.eq("otherId", userId))
    .take(31);
  const generation = (old?.generation ?? 0) + 1;
  if (rows.length <= 30) {
    for (const row of rows) await syncInbox(ctx, row.conversationId);
    if (old) await ctx.db.patch(old._id, { generation, pending: false });
    return;
  }
  const jobId =
    old?._id ??
    (await ctx.db.insert("participantNameJobs", {
      userId,
      generation,
      pending: true,
    }));
  if (old) await ctx.db.patch(jobId, { generation, pending: true });
  await ctx.scheduler.runAfter(0, internal.messageSearch.refreshNames, {
    jobId,
    generation,
    cursor: null,
  });
}
export async function queueFolderSync(
  ctx: MutationCtx,
  userId: Id<"users">,
  otherId: Id<"users">,
) {
  const old = await ctx.db
    .query("inboxFolderJobs")
    .withIndex("by_pair", (q) => q.eq("userId", userId).eq("otherId", otherId))
    .unique();
  const generation = (old?.generation ?? 0) + 1;
  const jobId =
    old?._id ??
    (await ctx.db.insert("inboxFolderJobs", {
      userId,
      otherId,
      generation,
      pending: true,
    }));
  if (old) await ctx.db.patch(jobId, { generation, pending: true });
  await ctx.scheduler.runAfter(0, internal.inbox.syncPair, {
    jobId,
    generation,
    cursor: null,
  });
}
