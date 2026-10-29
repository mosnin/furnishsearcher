import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { applyAccountRole } from "./lib/accountRoles";
import { queueNameSync } from "./lib/inbox";
const role = v.union(
  v.literal("tenant"),
  v.literal("landlord"),
  v.literal("admin"),
);
const account = v.object({
  id: v.id("users"),
  name: v.string(),
  email: v.string(),
  role,
  createdAt: v.number(),
  offboarded: v.boolean(),
});
export const list = query({
  args: {
    role: v.optional(v.union(v.literal("all"), role)),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(account),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx);
    if (caller.role !== "admin")
      throw new Error("Platform admin access required.");
    if ((args.search?.length ?? 0) > 120)
      throw new Error("Shorten the account search.");
    const selected = args.role;
    const result = await (
      selected && selected !== "all"
        ? ctx.db
            .query("users")
            .withIndex("by_role_created", (q) => q.eq("role", selected))
        : ctx.db.query("users")
    )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(1, Math.min(20, args.paginationOpts.numItems)),
      });
    const term = args.search?.trim().toLowerCase() ?? "";
    return {
      ...result,
      page: result.page
        .filter(
          (row) =>
            !term ||
            `${row.displayName ?? row.name} ${row.email}`
              .toLowerCase()
              .includes(term),
        )
        .map((row) => ({
          id: row._id,
          name: row.displayName ?? row.name,
          email: row.email,
          role: row.role,
          createdAt: row.createdAt,
          offboarded: row.clerkDeletedAt !== undefined,
        })),
    };
  },
});
export const update = mutation({
  args: { userId: v.id("users"), name: v.string(), role },
  returns: v.null(),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx);
    if (caller.role !== "admin")
      throw new Error("Platform admin access required.");
    const name = args.name.trim();
    if (!name || name.length > 120)
      throw new Error("Enter a name of 1 to 120 characters.");
    const previous = await applyAccountRole(
      ctx,
      caller,
      args.userId,
      args.role,
    );
    if (name !== (previous.displayName ?? previous.name)) {
      await ctx.db.patch(args.userId, { displayName: name });
      await queueNameSync(ctx, args.userId);
    }
    return null;
  },
});
