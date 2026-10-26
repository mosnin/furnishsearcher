import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { findActiveUser } from "./auth";
import { blockState } from "./messageAccess";
import { emailContactMode } from "./emailContact";
import { contactHash } from "../../lib/clerk-contact-event";
type Ctx = QueryCtx | MutationCtx;
export const INVITATION_UNAVAILABLE =
  "This review request is unavailable. Check the property and verified account email, or contact support.";
export async function verifiedEmailAccount(ctx: Ctx, email: string) {
  const instance = process.env.CLERK_CONTACT_WEBHOOK_INSTANCE_ID;
  if (
    !instance ||
    process.env.CLERK_CONTACT_WEBHOOK_MODE !== emailContactMode()
  )
    return null;
  const hash = await contactHash(email);
  const snapshots = await ctx.db
    .query("clerkContactSnapshots")
    .withIndex("by_email_mode", (q) =>
      q.eq("mode", emailContactMode()).eq("emailHash", hash),
    )
    .take(2);
  // An ambiguous account binding never sends or discloses a matching identity.
  if (snapshots.length !== 1) return null;
  const s = snapshots[0];
  if (s.deleted || s.uncertain || s.instanceId !== instance) return null;
  return findActiveUser(ctx, s.clerkId);
}
export async function invitationUsable(
  ctx: Ctx,
  invitation: Doc<"reviewInvitations">,
) {
  if (
    invitation.state !== "active" ||
    invitation.expiresAt <= Date.now() ||
    invitation.mode !== emailContactMode()
  )
    return false;
  const [sender, recipient, listing] = await Promise.all([
    ctx.db.get(invitation.senderId),
    ctx.db.get(invitation.recipientId),
    ctx.db.get(invitation.listingId),
  ]);
  if (
    !sender ||
    !recipient ||
    !listing ||
    listing.landlordId !== invitation.landlordId ||
    !(await findActiveUser(ctx, sender.clerkId)) ||
    !(await findActiveUser(ctx, recipient.clerkId)) ||
    (await blockState(ctx, sender._id, recipient._id)).cannotMessage
  )
    return false;
  const matching = await verifiedEmailAccount(ctx, invitation.recipientEmail);
  return (
    matching?._id === recipient._id &&
    (await contactHash(invitation.recipientEmail)) ===
      invitation.recipientEmailHash
  );
}
export async function requireReviewInvitation(
  ctx: Ctx,
  id: Id<"reviewInvitations">,
  reviewerId: Id<"users">,
  listingId: Id<"listings">,
  kind: "property" | "traveler",
  subjectId?: Id<"users">,
) {
  const invitation = await ctx.db.get(id);
  if (
    !invitation ||
    invitation.recipientId !== reviewerId ||
    invitation.listingId !== listingId ||
    invitation.kind !== kind ||
    invitation.subjectId !== subjectId ||
    invitation.reviewId ||
    !(await invitationUsable(ctx, invitation))
  )
    throw new Error(INVITATION_UNAVAILABLE);
  return invitation;
}
