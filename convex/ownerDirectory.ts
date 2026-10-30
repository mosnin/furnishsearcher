import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v, type Infer } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { contentIssues, ownerReadiness } from "./lib/publication";
import { listingPhotos } from "./lib/photos";
import { readinessValidator } from "./publication";
import { US_STATES } from "../lib/locations";

const status = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("incomplete"),
  v.literal("pending"),
  v.literal("rejected"),
);
const row = v.object({
  _id: v.id("listings"),
  title: v.string(),
  address: v.string(),
  publicId: v.optional(v.string()),
  unitName: v.optional(v.string()),
  parentListingId: v.optional(v.id("listings")),
  hiddenUnit: v.boolean(),
  status,
  price: v.number(),
  bedrooms: v.number(),
  bathrooms: v.number(),
  views: v.number(),
  photos: v.array(v.string()),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  createdAt: v.number(),
  locationConfirmedAt: v.optional(v.number()),
  moderationHold: v.optional(v.boolean()),
  featured: v.boolean(),
  featuredUntil: v.optional(v.number()),
  publication: readinessValidator,
});
function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    keyword: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    status: v.optional(v.union(v.literal("all"), status)),
    includeHiddenUnits: v.optional(v.boolean()),
  },
  returns: paginationResultValidator(row),
  handler: async (ctx, args) => {
    const owner = await requireUser(ctx);
    if (owner.role !== "landlord")
      throw new Error("Only property owners can view this directory.");
    if ((args.keyword?.length ?? 0) > 200 || (args.city?.length ?? 0) > 80)
      throw new Error("Shorten the property search.");
    const state = args.state?.trim().toUpperCase() ?? "";
    if (state && !Object.hasOwn(US_STATES, state))
      throw new Error("Choose a valid state.");
    const tokens = normalize(args.keyword ?? "")
        .split(" ")
        .filter(Boolean),
      city = normalize(args.city ?? "");
    // Page OWNER candidates first. Filters never turn this into an unbounded scan,
    // and an empty filtered page must keep its continuation cursor.
    const result = await ctx.db
      .query("listings")
      .withIndex("by_owner_created", (q) => q.eq("landlordId", owner._id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(1, Math.min(10, args.paginationOpts.numItems)),
      });
    const page: Infer<typeof row>[] = [];
    for (const listing of result.page) {
      const hiddenUnit =
        !!listing.parentListingId && listing.publicationRequested === false;
      if (args.includeHiddenUnits === false && hiddenUnit) continue;
      if (state && listing.state.trim().toUpperCase() !== state) continue;
      if (city && normalize(listing.city) !== city) continue;
      const text = normalize(
        [
          listing.title,
          listing.address,
          listing.city,
          listing.state,
          listing.zip,
          listing.publicId,
          listing.publicId?.replace(/[^a-z0-9]/gi, ""),
          listing.unitName,
          listing._id,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const words = new Set(text.split(" "));
      if (
        !tokens.every((token) =>
          /^\d+$/.test(token) ? words.has(token) : text.includes(token),
        )
      )
        continue;
      const publication = await ownerReadiness(ctx, listing);
      const currentApproval = listing.approvedRevision === publication.revision;
      const directoryStatus = publication.live
        ? "active"
        : (await contentIssues(ctx, listing)).length
          ? "incomplete"
          : publication.approval === "rejected"
            ? "rejected"
            : publication.approval !== "approved" || !currentApproval
              ? "pending"
              : "inactive";
      if (
        args.status &&
        args.status !== "all" &&
        args.status !== directoryStatus
      )
        continue;
      const photos = await listingPhotos(ctx, listing);
      page.push({
        _id: listing._id,
        title: listing.title,
        address: listing.address,
        publicId: listing.publicId,
        unitName: listing.unitName,
        parentListingId: listing.parentListingId,
        hiddenUnit,
        status: directoryStatus,
        price: listing.price,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        views: listing.views,
        photos: photos.photos,
        city: listing.city,
        state: listing.state,
        zip: listing.zip,
        createdAt: listing.createdAt,
        locationConfirmedAt: listing.locationConfirmedAt,
        moderationHold: listing.moderationHold,
        featured: photos.featured,
        featuredUntil: listing.featuredUntil,
        publication,
      });
    }
    return { ...result, page };
  },
});
