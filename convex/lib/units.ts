import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { addressKey } from "../../lib/geo";
import { syncGeo } from "./geo";
type Ctx = QueryCtx | MutationCtx;
export function unitName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80)
    throw new Error("Enter a unit name of 2–80 characters.");
  return { unitName: name, unitNameKey: name.toLocaleLowerCase("en-US") };
}
export async function validateUnitName(
  ctx: Ctx,
  propertyId: Id<"properties">,
  value: string,
  except?: Id<"listings">,
) {
  const fields = unitName(value);
  const duplicate = await ctx.db
    .query("listings")
    .withIndex("by_property_name", (q) =>
      q.eq("propertyGroupId", propertyId).eq("unitNameKey", fields.unitNameKey),
    )
    .first();
  if (duplicate && duplicate._id !== except)
    throw new Error(
      "Another space at this property already uses that unit name.",
    );
  return fields;
}
export async function propertyIssues(ctx: Ctx, l: Doc<"listings">) {
  if (!l.propertyGroupId) return [];
  const p = await ctx.db.get(l.propertyGroupId);
  if (
    !p ||
    p.ownerId !== l.landlordId ||
    p.locationVersion !== l.propertyLocationVersion ||
    addressKey(p) !== addressKey(l) ||
    p.locationConfirmedAt === undefined ||
    p.approvedLocationVersion !== p.locationVersion
  )
    return [
      "The shared property address must be confirmed, synchronized and approved.",
    ];
  return [];
}
export async function unitDeleteGuard(
  ctx: MutationCtx,
  l: Doc<"listings">,
  actor: Id<"users">,
) {
  const booking = await ctx.db
    .query("bookingInquiries")
    .withIndex("by_listing_status_end", (q) =>
      q
        .eq("listingId", l._id)
        .eq("status", "accepted")
        .gt("moveOut", Date.now()),
    )
    .first();
  if (booking)
    throw new Error(
      "This unit has an accepted stay. Hide it and resolve the stay before deleting it.",
    );
  if (!l.propertyGroupId) return;
  const p = await ctx.db.get(l.propertyGroupId);
  if (!p) return;
  if (p.primaryListingId === l._id && p.unitCount > 1)
    throw new Error(
      "This property's main space anchors other units. Hide it instead, or remove its additional units first.",
    );
  await ctx.db.insert("unitAudit", {
    propertyId: p._id,
    listingId: l._id,
    actorId: actor,
    action: "unit_deleted",
    note: `Removed rental space: ${l.unitName ?? l.title}`,
    createdAt: Date.now(),
  });
  if (p.unitCount <= 1) await ctx.db.delete(p._id);
  else await ctx.db.patch(p._id, { unitCount: p.unitCount - 1 });
}
export async function createPropertyGroup(
  ctx: MutationCtx,
  root: Doc<"listings">,
  actor: Id<"users">,
) {
  if (root.propertyGroupId) {
    const p = await ctx.db.get(root.propertyGroupId);
    if (!p || p.ownerId !== root.landlordId)
      throw new Error("Property membership needs staff review.");
    return p;
  }
  const propertyId = await ctx.db.insert("properties", {
    ownerId: root.landlordId,
    primaryListingId: root._id,
    address: root.address,
    city: root.city,
    state: root.state,
    zip: root.zip,
    locationVersion: 1,
    approvedLocationVersion: 1,
    mapLatitude: root.mapLatitude,
    mapLongitude: root.mapLongitude,
    locationConfirmedAt: root.locationConfirmedAt,
    unitCount: 1,
    setupCompletedAt: Date.now(),
    createdAt: Date.now(),
  });
  const patch = {
    propertyGroupId: propertyId,
    propertyLocationVersion: 1,
    unitName: "Main rental space",
    unitNameKey: "main rental space",
  };
  await ctx.db.patch(root._id, patch);
  await syncGeo(ctx, { ...root, ...patch });
  await ctx.db.insert("unitAudit", {
    propertyId,
    listingId: root._id,
    actorId: actor,
    action: "property_created",
    note: "Existing completed rental space becomes the property's main space",
    createdAt: Date.now(),
  });
  return (await ctx.db.get(propertyId))!;
}
