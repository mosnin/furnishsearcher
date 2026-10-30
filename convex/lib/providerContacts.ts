import type { QueryCtx, MutationCtx } from "../_generated/server";
import { contactHash } from "../../lib/clerk-contact-event";
export async function assertProviderContact(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
  mode: "test" | "prod",
  channel: "email" | "phone",
  value: string,
  issuedAt: number,
) {
  const snapshot = await ctx.db
    .query("clerkContactSnapshots")
    .withIndex("by_clerk_mode", (q) =>
      q.eq("clerkId", clerkId).eq("mode", mode),
    )
    .unique();
  if (!snapshot) return;
  const hash = channel === "email" ? snapshot.emailHash : snapshot.phoneHash;
  const changedAt =
    channel === "email" ? snapshot.emailChangedAt : snapshot.phoneChangedAt;
  if (
    snapshot.deleted ||
    snapshot.uncertain ||
    hash !== (await contactHash(value)) ||
    (changedAt !== undefined && issuedAt * 1000 <= changedAt)
  )
    throw new Error(
      "Your sign-in contact changed. Refresh your account confirmation after the latest account update.",
    );
}
