import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { subjectDeleted } from "./auth";
export async function applyAccountRole(
  ctx: MutationCtx,
  caller: Doc<"users">,
  userId: Id<"users">,
  role: Doc<"users">["role"],
) {
  const target = await ctx.db.get(userId);
  if (
    !target ||
    target.clerkDeletedAt !== undefined ||
    (await subjectDeleted(ctx, target.clerkId))
  )
    throw new Error("This account is no longer available.");
  if (
    caller.role !== "admin" &&
    (caller._id !== userId ||
      target.accountTypePending !== true ||
      role === "admin")
  )
    throw new Error(
      "Only a platform admin can change an established account type.",
    );
  if (caller.role === "admin" && caller._id === userId && role !== "admin")
    throw new Error(
      "Another platform admin must change your admin account type.",
    );
  await ctx.db.patch(userId, {
    role,
    accountTypePending: false,
    accountTypeSelectedAt: Date.now(),
    accountTypeChangedBy: caller._id,
  });
  return target;
}
