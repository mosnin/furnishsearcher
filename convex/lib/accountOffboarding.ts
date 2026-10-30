import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
export async function offboardNativeUser(
  ctx: MutationCtx,
  user: Doc<"users">,
  deletedAt: number,
  repair = false,
) {
  if (user.clerkDeletedAt !== undefined && !repair) return;
  if (user.clerkDeletedAt === undefined)
    await ctx.db.patch(user._id, { clerkDeletedAt: deletedAt });
  await ctx.scheduler.runAfter(0, internal.publication.reconcileOwner, {
    userId: user._id,
    cursor: null,
  });
  await ctx.scheduler.runAfter(0, internal.accountOffboarding.closeRequests, {
    userId: user._id,
    cursor: null,
  });
}
