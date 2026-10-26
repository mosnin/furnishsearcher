import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { contentIssues, identityPassed, readiness } from "./lib/publication";
import { activePaidSubscription } from "./lib/billing";
import { propertyIssues } from "./lib/units";

const task = v.object({
  id: v.string(),
  title: v.string(),
  detail: v.string(),
  href: v.string(),
  priority: v.union(
    v.literal("attention"),
    v.literal("setup"),
    v.literal("optional"),
  ),
  issues: v.array(v.string()),
});
async function owner(ctx: QueryCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "landlord")
    throw new Error("Only property owners can view these tasks.");
  return user;
}
type Task = {
  id: string;
  title: string;
  detail: string;
  href: string;
  priority: "attention" | "setup" | "optional";
  issues: string[];
};
export const account = query({
  // Refresh invalidates the time-dependent read; it never supplies the authoritative clock.
  args: { refresh: v.number() },
  returns: v.object({ checkedAt: v.number(), tasks: v.array(task) }),
  handler: async (ctx) => {
    const user = await owner(ctx),
      now = Date.now(),
      tasks: Task[] = [];
    const [paid, verified, property] = await Promise.all([
      activePaidSubscription(ctx, user._id, true),
      identityPassed(ctx, user),
      ctx.db
        .query("listings")
        .withIndex("by_landlord", (q) => q.eq("landlordId", user._id))
        .first(),
    ]);
    if (!verified)
      tasks.push({
        id: "identity",
        title: user.identityHold
          ? "Review owner verification"
          : "Verify your identity",
        detail:
          "Owner identity verification is required before a listing can become public. Check its provider status and availability in your profile.",
        href: "/dashboard/profile",
        priority: "attention",
        issues: [],
      });
    if (!paid)
      tasks.push({
        id: "billing",
        title: "Review paid listing access",
        detail:
          "There is no currently verified paid owner subscription for this environment. Review billing for payment status, expired access or a billing hold.",
        href: "/dashboard/landlord/billing",
        priority: "attention",
        issues: [],
      });
    else {
      const end = Math.min(paid.paidThrough!, paid.currentPeriodEnd);
      if (end <= now + 35 * 86400000)
        tasks.push({
          id: "renewal",
          title: paid.cancelAtPeriodEnd
            ? "Paid access is ending soon"
            : "Review your upcoming renewal",
          detail: `The current verified paid period ends ${new Date(end).toISOString().slice(0, 10)} (UTC). ${paid.cancelAtPeriodEnd ? "Cancellation is scheduled for the period end." : "An upcoming renewal is not a confirmed payment."}`,
          href: "/dashboard/landlord/billing",
          priority: "attention",
          issues: [],
        });
    }
    if (!property)
      tasks.push({
        id: "first-listing",
        title: "Create your first listing",
        detail:
          "Add your property details, photos and availability, then review its publication requirements.",
        href: "/dashboard/landlord/listings/new",
        priority: "setup",
        issues: [],
      });
    if (!user.bio?.trim())
      tasks.push({
        id: "introduction",
        title: "Introduce yourself to travelers",
        detail:
          "Add an optional short introduction to your owner profile. This does not affect publication eligibility.",
        href: "/dashboard/profile",
        priority: "optional",
        issues: [],
      });
    return { checkedAt: now, tasks };
  },
});
export const listings = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(task),
  handler: async (ctx, { paginationOpts }) => {
    const user = await owner(ctx);
    const page = await ctx.db
      .query("listings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", user._id))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.max(1, Math.min(10, paginationOpts.numItems)),
      });
    const tasks: Task[] = [];
    for (const listing of page.page) {
      const state = await readiness(ctx, listing);
      if (state.live) continue;
      const edit = `/dashboard/landlord/listings/${listing._id}/edit`;
      let title = "Review publication requirements",
        href = "/dashboard/landlord/listings",
        priority: Task["priority"] = "setup";
      const content = await contentIssues(ctx, listing),
        grouped = await propertyIssues(ctx, listing);
      if (listing.moderationHold) {
        title = "Contact support about this listing";
        href = "/dashboard/support";
        priority = "attention";
      } else if (content.length) {
        title = "Finish listing details";
        href = edit;
      } else if (grouped.length) {
        title = "Review the shared property address";
        href = `/dashboard/landlord/listings/${listing._id}/units`;
      } else if (state.approval === "rejected") {
        title = "Revise the listing for staff review";
        href = edit;
        priority = "attention";
      } else if (
        state.approval !== "approved" ||
        listing.approvedRevision !== state.revision
      ) {
        title = "Await staff review";
      } else if (!state.requested) {
        title = state.eligible
          ? "Publish when you are ready"
          : "Review your hidden listing";
      }
      const issues = [...state.issues];
      if (!state.requested)
        issues.push("You have not requested publication of this listing.");
      tasks.push({
        id: listing._id,
        title: `${title}: ${listing.title || "Untitled property"}`,
        detail: state.eligible
          ? "Publication requirements currently pass. You choose whether to make this rental public."
          : "This rental is not public. Resolve the current requirements below; changes update this task automatically.",
        href,
        priority,
        issues,
      });
    }
    return { ...page, page: tasks };
  },
});
