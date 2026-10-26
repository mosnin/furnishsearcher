import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import {
  publicListingCard,
  publicListingCardValidator,
} from "./lib/publicListingCard";
import { query } from "./_generated/server";
import { subjectDeleted } from "./lib/auth";
import { publiclyVisible } from "./lib/publication";
export const list = query({
  args: { landlordId: v.id("users"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(publicListingCardValidator),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.landlordId);
    if (
      !owner ||
      owner.role !== "landlord" ||
      owner.clerkDeletedAt !== undefined ||
      (await subjectDeleted(ctx, owner.clerkId))
    )
      return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("listings")
      .withIndex("by_owner_public_created", (q) =>
        q.eq("landlordId", owner._id).eq("status", "active"),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(1, Math.min(10, args.paginationOpts.numItems)),
      });
    const page = [];
    for (const listing of result.page) {
      // Identical visibility for anonymous visitors, the owner and staff.
      if (!(await publiclyVisible(ctx, listing))) continue;
      page.push(await publicListingCard(ctx, listing));
    }
    return { ...result, page };
  },
});
