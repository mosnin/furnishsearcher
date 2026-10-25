import type { Id, Doc } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { requireUser } from "./auth";
import { listingPhotos } from "./photos";
import { profileImage } from "./profileImages";
type Ctx = QueryCtx | MutationCtx;
export function conversationKey(a: string, b: string, listing: string) {
  return [a, b].sort().join("_") + "_" + listing;
}
export async function blockState(ctx: Ctx, a: Id<"users">, b: Id<"users">) {
  const [mine, theirs] = await Promise.all([
    ctx.db
      .query("userBlocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", a).eq("blockedId", b))
      .unique(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", b).eq("blockedId", a))
      .unique(),
  ]);
  return { blockedByMe: !!mine, cannotMessage: !!mine || !!theirs };
}
export async function requireMessagingAllowed(
  ctx: Ctx,
  a: Id<"users">,
  b: Id<"users">,
) {
  if ((await blockState(ctx, a, b)).cannotMessage)
    throw new Error("Messaging is unavailable between these accounts.");
}
export function isParticipant(conv: Doc<"conversations">, userId: Id<"users">) {
  return conv.tenantId === userId || conv.landlordId === userId;
}
export async function requireConversation(ctx: Ctx, id: Id<"conversations">) {
  const user = await requireUser(ctx),
    conv = await ctx.db.get(id);
  if (!conv || !isParticipant(conv, user._id))
    throw new Error("Conversation not found.");
  return { user, conv };
}
export async function findConversationByKey(ctx: Ctx, key: string) {
  const indexed = await ctx.db
    .query("conversations")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (indexed) return indexed;
  // Legacy records lack a key; reconstruct through two exact indexed lookups,
  // never a scan of every conversation owned by a participant.
  const parts = key.split("_");
  if (parts.length !== 3) return null;
  const a = ctx.db.normalizeId("users", parts[0]),
    b = ctx.db.normalizeId("users", parts[1]),
    listingId = ctx.db.normalizeId("listings", parts[2]);
  if (!a || !b || !listingId) return null;
  for (const tenantId of [a, b]) {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_listing_tenant", (q) =>
        q.eq("listingId", listingId).eq("tenantId", tenantId),
      )
      .unique();
    if (
      conv &&
      conversationKey(conv.tenantId, conv.landlordId, conv.listingId) === key
    )
      return conv;
  }
  return null;
}
export async function enrichConversation(
  ctx: Ctx,
  conv: Doc<"conversations">,
  userId: Id<"users">,
) {
  const tenant = conv.tenantId === userId;
  const otherId = tenant ? conv.landlordId : conv.tenantId;
  const [listing, other, blocks] = await Promise.all([
    ctx.db.get(conv.listingId),
    ctx.db.get(otherId),
    blockState(ctx, userId, otherId),
  ]);
  return {
    ...conv,
    ...blocks,
    archived: !!(tenant ? conv.tenantArchived : conv.landlordArchived),
    listing: listing
      ? {
          _id: listing._id,
          title: listing.title,
          photos: (await listingPhotos(ctx, listing)).photos.slice(0, 1),
        }
      : null,
    otherUser: other
      ? {
          _id: other._id,
          name: other.name,
          avatar: (await profileImage(ctx, other, "profile")) ?? undefined,
        }
      : null,
  };
}
