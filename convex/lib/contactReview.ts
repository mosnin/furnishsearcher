import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
type Ctx = QueryCtx | MutationCtx;
export async function contactReviewActive(ctx: Ctx, userId: Id<"users">) {
  return !!(await ctx.db
    .query("contactReviewHolds")
    .withIndex("by_user_active", (q) =>
      q.eq("userId", userId).eq("active", true),
    )
    .first());
}
export async function reportedAccount(
  ctx: Ctx,
  ticket: {
    kind: string;
    reportedUserId?: Id<"users">;
    messageId?: Id<"messages">;
    listingId?: Id<"listings">;
  },
) {
  if (ticket.kind === "support") return null;
  if (ticket.reportedUserId) return ctx.db.get(ticket.reportedUserId);
  // Legacy reports may use the surviving native source, never caller-supplied evidence JSON.
  if (ticket.kind === "message_report") {
    const message = ticket.messageId
      ? await ctx.db.get(ticket.messageId)
      : null;
    return message ? ctx.db.get(message.senderId) : null;
  }
  const listing = ticket.listingId ? await ctx.db.get(ticket.listingId) : null;
  return listing ? ctx.db.get(listing.landlordId) : null;
}
