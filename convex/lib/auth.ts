import type { QueryCtx, MutationCtx } from "../_generated/server";
type Ctx = QueryCtx | MutationCtx;
export async function subjectDeleted(ctx: Ctx, clerkId: string) {
  const snapshots = await ctx.db
    .query("clerkContactSnapshots")
    .withIndex("by_clerk_mode", (q) => q.eq("clerkId", clerkId))
    .take(2);
  return snapshots.some((snapshot) => snapshot.deleted);
}
async function nativeUser(ctx: Ctx, clerkId: string) {
  return ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
}
export async function findActiveUser(ctx: Ctx, clerkId: string) {
  const user = await nativeUser(ctx, clerkId);
  if (
    !user ||
    user.clerkDeletedAt !== undefined ||
    (await subjectDeleted(ctx, clerkId))
  )
    return null;
  return user;
}
export async function assertSubjectActive(ctx: Ctx, clerkId: string) {
  const user = await nativeUser(ctx, clerkId);
  if (
    user?.clerkDeletedAt !== undefined ||
    (await subjectDeleted(ctx, clerkId))
  )
    throw new Error("This sign-in account is no longer available.");
}
export async function requireUser(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Please sign in to continue.");
  const user = await findActiveUser(ctx, identity.subject);
  if (!user) {
    await assertSubjectActive(ctx, identity.subject);
    throw new Error("Complete your profile first.");
  }
  return user;
}
