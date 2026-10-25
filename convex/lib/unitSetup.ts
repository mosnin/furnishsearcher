import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { contentIssues, identityPassed } from "./publication";
import { propertyIssues } from "./units";
import { activePaidSubscription } from "./billing";
export async function setupIssues(
  ctx: QueryCtx | MutationCtx,
  root: Doc<"listings">,
  p: Doc<"properties"> | null,
) {
  const issues: string[] = [];
  if (p) {
    issues.push(...(await propertyIssues(ctx, root)));
  } else {
    issues.push(...(await contentIssues(ctx, root)));
    if (
      root.approvalStatus !== "approved" ||
      root.approvedRevision !== (root.revision ?? 0) ||
      !root.firstPublishedAt
    )
      issues.push(
        "Finish and publish the main rental space before adding units.",
      );
    if (
      root.locationConfirmedAt === undefined ||
      root.mapLatitude === undefined ||
      root.mapLongitude === undefined
    )
      issues.push("Confirm the property's shared map location first.");
  }
  const owner = await ctx.db.get(root.landlordId);
  if (!owner || !(await identityPassed(ctx, owner)))
    issues.push("Complete owner identity verification.");
  if (!(await activePaidSubscription(ctx, root.landlordId, true)))
    issues.push("Confirm an active paid landlord subscription.");
  return issues;
}
