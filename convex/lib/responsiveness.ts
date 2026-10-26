import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { conversationKey } from "./messageAccess";
import {
  responseBand,
  responseDay,
  responseWindow,
  typicalResponse,
  rateGrade,
  RESPONSE_DAY,
} from "../../lib/responsiveness";

type Ctx = MutationCtx | QueryCtx;
const empty = () => ({
  received: 0,
  onTime: 0,
  replied: 0,
  bands: [0, 0, 0, 0, 0, 0],
});
const inApp = (m: Doc<"messages">) =>
  m.origin === "inbox" || m.origin === "property";
function bound(m: Doc<"messages">, c: Doc<"conversations">) {
  return (
    m.listingId === c.listingId &&
    (!m.conversationDocId || m.conversationDocId === c._id) &&
    ((m.senderId === c.tenantId && m.receiverId === c.landlordId) ||
      (m.senderId === c.landlordId && m.receiverId === c.tenantId)) &&
    Number.isFinite(m.createdAt) &&
    m.createdAt >= 0 &&
    m.createdAt <= Date.now()
  );
}
async function increment(
  ctx: MutationCtx,
  row: Doc<"responseThreads">,
  first: boolean,
  replyAt?: number,
) {
  if (row.startedAt === undefined) return;
  const day = responseDay(row.startedAt);
  const previous = await ctx.db
    .query("responseDays")
    .withIndex("by_listing_day_epoch", (q) =>
      q
        .eq("listingId", row.listingId)
        .eq("ownerId", row.ownerId)
        .eq("day", day)
        .eq("rateEpoch", row.rateEpoch),
    )
    .unique();
  const counts = previous
    ? {
        received: previous.received,
        onTime: previous.onTime,
        replied: previous.replied,
        bands: [...previous.bands],
      }
    : empty();
  if (first) counts.received++;
  if (replyAt !== undefined) {
    const elapsed = replyAt - row.startedAt;
    counts.replied++;
    if (elapsed <= RESPONSE_DAY) counts.onTime++;
    counts.bands[responseBand(elapsed)]++;
  }
  if (previous) await ctx.db.patch(previous._id, counts);
  else
    await ctx.db.insert("responseDays", {
      listingId: row.listingId,
      ownerId: row.ownerId,
      day,
      rateEpoch: row.rateEpoch,
      ...counts,
    });
}
// Reads only the first message and two indexed first-owner-reply candidates.
// Unknown legacy origins are deliberately unmeasured, never invented from lastMessageAt.
export async function trackConversation(
  ctx: MutationCtx,
  c: Doc<"conversations">,
  message?: Doc<"messages">,
) {
  const row = await ctx.db
    .query("responseThreads")
    .withIndex("by_conversation", (q) => q.eq("conversationId", c._id))
    .unique();
  if (row) {
    if (
      row.qualification === "qualified" &&
      row.replyAt === undefined &&
      message &&
      message.senderId === c.landlordId &&
      inApp(message) &&
      !message.housingRequestId &&
      bound(message, c) &&
      message.createdAt >= row.startedAt!
    ) {
      await ctx.db.patch(row._id, {
        replyAt: message.createdAt,
        replyMessageId: message._id,
      });
      await increment(ctx, row, false, message.createdAt);
      return true;
    }
    return false;
  }
  const key = conversationKey(c.tenantId, c.landlordId, c.listingId);
  const first = await ctx.db
    .query("messages")
    .withIndex("by_conversation_time", (q) => q.eq("conversationId", key))
    .first();
  const [owner, listing] = await Promise.all([
    ctx.db.get(c.landlordId),
    ctx.db.get(c.listingId),
  ]);
  let qualification: "qualified" | "excluded" | "unknown" = "unknown";
  if (
    first &&
    bound(first, c) &&
    owner &&
    listing?.landlordId === c.landlordId
  ) {
    if (
      first.senderId === c.landlordId ||
      first.housingRequestId ||
      first.origin === "housing_request" ||
      first.origin === "email"
    )
      qualification = "excluded";
    else if (inApp(first)) qualification = "qualified";
  }
  const epoch = owner?.responseRateResetAt ?? 0;
  const id = await ctx.db.insert("responseThreads", {
    conversationId: c._id,
    listingId: c.listingId,
    ownerId: c.landlordId,
    qualification,
    rateEpoch: first && first.createdAt >= epoch ? epoch : 0,
    ...(qualification === "qualified" && first
      ? { startedAt: first.createdAt, firstMessageId: first._id }
      : {}),
  });
  if (qualification !== "qualified" || !first) return false;
  const candidates = await Promise.all(
    (["inbox", "property"] as const).map((origin) =>
      ctx.db
        .query("messages")
        .withIndex("by_conversation_sender_origin_time", (q) =>
          q
            .eq("conversationId", key)
            .eq("senderId", c.landlordId)
            .eq("origin", origin)
            .gte("createdAt", first.createdAt),
        )
        .first(),
    ),
  );
  const reply = candidates
    .filter(
      (m): m is Doc<"messages"> => !!m && bound(m, c) && !m.housingRequestId,
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  const inserted = (await ctx.db.get(id))!;
  if (reply)
    await ctx.db.patch(id, {
      replyAt: reply.createdAt,
      replyMessageId: reply._id,
    });
  await increment(ctx, inserted, true, reply?.createdAt);
  return true;
}
export async function responseStats(ctx: Ctx, listing: Doc<"listings">) {
  const state = await ctx.db
    .query("responseTrackingState")
    .withIndex("by_key", (q) => q.eq("key", "v1"))
    .unique();
  const owner = await ctx.db.get(listing.landlordId);
  const epoch = owner?.responseRateResetAt ?? 0,
    start = responseWindow(Date.now());
  // One row per UTC day and reset epoch; at most two epochs because reset is one-time.
  const rows = await ctx.db
    .query("responseDays")
    .withIndex("by_listing_day_epoch", (q) =>
      q
        .eq("listingId", listing._id)
        .eq("ownerId", listing.landlordId)
        .gte("day", start)
        .lte("day", responseDay(Date.now())),
    )
    .take(181);
  if (rows.length > 180)
    throw new Error("Response statistics need reconciliation.");
  const rate = empty(),
    publicCounts = empty();
  for (const row of rows) {
    publicCounts.replied += row.replied;
    row.bands.forEach((n, i) => (publicCounts.bands[i] += n));
    if (row.rateEpoch === epoch) {
      rate.received += row.received;
      rate.onTime += row.onTime;
      rate.replied += row.replied;
    }
  }
  let basis: "90_days" | "last_three" = "90_days";
  if (!rate.received) {
    basis = "last_three";
    const last = await ctx.db
      .query("responseThreads")
      .withIndex("by_listing_epoch_started", (q) =>
        q
          .eq("listingId", listing._id)
          .eq("ownerId", listing.landlordId)
          .eq("rateEpoch", epoch)
          .gte("startedAt", epoch),
      )
      .order("desc")
      .take(3);
    for (const row of last) {
      if (row.rateEpoch !== epoch || row.startedAt === undefined) continue;
      rate.received++;
      if (row.replyAt !== undefined) {
        rate.replied++;
        if (row.replyAt - row.startedAt <= RESPONSE_DAY) rate.onTime++;
      }
    }
  }
  const unknown = await ctx.db
    .query("responseThreads")
    .withIndex("by_listing_qualification", (q) =>
      q
        .eq("listingId", listing._id)
        .eq("ownerId", listing.landlordId)
        .eq("qualification", "unknown"),
    )
    .first();
  const ready = state?.complete ?? false;
  const percent =
    ready && rate.received ? (100 * rate.onTime) / rate.received : null;
  return {
    ready,
    hasUnmeasuredHistory: !!unknown,
    received: ready ? rate.received : 0,
    onTime: ready ? rate.onTime : 0,
    replied: ready ? rate.replied : 0,
    percent,
    grade: ready ? rateGrade(percent) : "Rebuilding history",
    typical: ready ? typicalResponse(publicCounts.bands) : null,
    basis,
    windowStart: start,
    resetAt: owner?.responseRateResetAt ?? null,
    resetUsed: owner?.responseRateResetAt !== undefined,
    canReset:
      ready &&
      owner?.responseRateResetAt === undefined &&
      percent !== null &&
      percent < 75,
  };
}
