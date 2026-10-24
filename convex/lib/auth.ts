import type { QueryCtx, MutationCtx } from "../_generated/server";

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Please sign in to continue.");
  const user = await ctx.db.query("users")
    .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject)).unique();
  if (!user) throw new Error("Complete your profile first.");
  return user;
}
