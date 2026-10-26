import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { bookingBlock } from "./lib/bookings";
import { buildSearchUrl, criteriaOnly } from "../lib/search";
import { DAY } from "../lib/stays";
const task = v.object({
  id: v.string(),
  title: v.string(),
  detail: v.string(),
  href: v.string(),
  optional: v.boolean(),
});
export const account = query({
  args: { refreshKey: v.optional(v.string()) },
  returns: v.object({
    checkedAt: v.number(),
    day: v.number(),
    nextDay: v.number(),
    tasks: v.array(task),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx),
      checkedAt = Date.now(),
      day = Math.floor(checkedAt / DAY) * DAY;
    const [search, saved] = await Promise.all([
      ctx.db
        .query("savedSearches")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .first(),
      ctx.db
        .query("savedListings")
        .withIndex("by_tenant_saved", (q) => q.eq("tenantId", user._id))
        .order("desc")
        .first(),
    ]);
    const tasks = [];
    if (!user.bio?.trim())
      tasks.push({
        id: "introduction",
        title: "Introduce yourself to owners",
        detail:
          "Add an optional introduction so owners can learn about your trip.",
        href: "/dashboard/profile#traveler-introduction",
        optional: true,
      });
    if (search) {
      let href = "/dashboard/tenant/searches",
        valid = true;
      try {
        href = buildSearchUrl(criteriaOnly(search));
      } catch {
        valid = false;
      }
      tasks.push({
        id: "resume-search",
        title: valid
          ? `Continue your saved search: ${search.name}`
          : `Review your saved search: ${search.name}`,
        detail: valid
          ? "Reopen your saved criteria and check current public rentals."
          : "These saved criteria need review before reopening. Open saved searches to edit them.",
        href,
        optional: false,
      });
    } else
      tasks.push({
        id: "search",
        title: "Find a rental for your next stay",
        detail:
          "Set your location, dates and preferences. Save a search to return to the same criteria.",
        href: "/search",
        optional: false,
      });
    tasks.push(
      saved
        ? {
            id: "saved",
            title: "Review your saved rentals",
            detail:
              "Compare your saved rentals and check their current availability. Unavailable entries remain removable from your saved list.",
            href: "/dashboard/tenant/saved",
            optional: false,
          }
        : {
            id: "save-rentals",
            title: "Save rentals to compare",
            detail:
              "Save public rentals as you browse so you can return to them later.",
            href: "/search",
            optional: true,
          },
    );
    return { checkedAt, day, nextDay: day + DAY, tasks };
  },
});
const stay = v.object({
  id: v.id("bookingInquiries"),
  title: v.string(),
  ownerName: v.string(),
  moveIn: v.number(),
  moveOut: v.number(),
  asOfDay: v.number(),
  phase: v.union(
    v.literal("active"),
    v.literal("upcoming"),
    v.literal("needs_review"),
  ),
  calendarReserved: v.boolean(),
  href: v.string(),
});
export const stays = query({
  args: {
    refreshKey: v.optional(v.string()),
    windowDay: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(stay),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      day = Math.floor(Date.now() / DAY) * DAY;
    // The account's native day freezes the cursor range. Older windows remain
    // readable, but classification always uses today's native clock.
    const windowDay = args.windowDay ?? day;
    if (
      !Number.isSafeInteger(windowDay) ||
      windowDay < 0 ||
      windowDay % DAY ||
      windowDay > day
    )
      throw new Error("Refresh the dashboard to obtain a current stay window.");
    const result = await ctx.db
      .query("bookingInquiries")
      .withIndex("by_tenant_status_end", (q) =>
        q
          .eq("tenantId", user._id)
          .eq("status", "accepted")
          .gt("moveOut", windowDay),
      )
      .order("asc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(1, Math.min(10, args.paginationOpts.numItems)),
      });
    const page = [];
    for (const inquiry of result.page) {
      if (inquiry.moveOut <= day) continue;
      const [listing, owner] = await Promise.all([
        ctx.db.get(inquiry.listingId),
        ctx.db.get(inquiry.landlordId),
      ]);
      const valid =
        listing?.landlordId === inquiry.landlordId &&
        Number.isSafeInteger(inquiry.moveIn) &&
        Number.isSafeInteger(inquiry.moveOut) &&
        inquiry.moveIn % DAY === 0 &&
        inquiry.moveOut % DAY === 0 &&
        inquiry.moveIn < inquiry.moveOut;
      let calendarReserved = false;
      if (valid) {
        try {
          await bookingBlock(ctx, inquiry);
          calendarReserved = true;
        } catch {
          /* Existing confirmation is retained; only the owner can repair its calendar. */
        }
      }
      page.push({
        id: inquiry._id,
        title:
          listing?.landlordId === inquiry.landlordId
            ? listing.title
            : "Property reference needs review",
        ownerName:
          owner?.clerkDeletedAt !== undefined
            ? "Owner unavailable"
            : (owner?.displayName ?? owner?.name ?? "Owner unavailable"),
        moveIn: inquiry.moveIn,
        moveOut: inquiry.moveOut,
        asOfDay: day,
        phase: valid
          ? inquiry.moveIn <= day
            ? ("active" as const)
            : ("upcoming" as const)
          : ("needs_review" as const),
        calendarReserved,
        href: `/dashboard/inquiries/${inquiry._id}`,
      });
    }
    return { ...result, page };
  },
});
