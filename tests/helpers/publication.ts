import { afterEach, vi } from "vitest";
import type { TestConvex } from "convex-test";
import schema from "../../convex/schema";
afterEach(() => vi.unstubAllEnvs());
/** Explicit synthetic prerequisites for tests whose subject is a rental workflow, not verification. */
export async function seedPublishedFixtures(t: TestConvex<typeof schema>) {
  vi.stubEnv("CREEM_API_KEY", "creem_test_publication_fixture");
  await t.run(async (ctx) => {
    const listings = (await ctx.db.query("listings").collect()).filter(
      (l) => l.status === "active",
    );
    for (const userId of new Set(listings.map((l) => l.landlordId))) {
      const user = (await ctx.db.get(userId))!;
      if (!user.identityCheckId) {
        const checkId = await ctx.db.insert("identityChecks", {
          userId,
          status: "passed",
          mode: "test",
          region: "amer-1",
          workflowKey: "synthetic-fixture",
          createdAt: Date.now(),
          verifiedAt: Date.now(),
        });
        await ctx.db.patch(userId, { identityCheckId: checkId });
      }
      const existing = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (!existing)
        await ctx.db.insert("subscriptions", {
          userId,
          creemSubscriptionId: `synthetic-${userId}`,
          creemProductId: "prod_fixture",
          plan: "landlord_premium",
          status: "active",
          mode: "test",
          verifiedAt: Date.now(),
          paidThrough: Date.now() + 365 * 86400000,
          currentPeriodStart: Date.now() - 1,
          currentPeriodEnd: Date.now() + 365 * 86400000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
    }
    for (const listing of listings)
      await ctx.db.patch(listing._id, {
        publicationRequested: true,
        approvalStatus: "approved",
        revision: listing.revision ?? 1,
        approvedRevision: listing.revision ?? 1,
        ...(!listing.photoAssets && listing.photos.length < 2
          ? {
              photos: [
                "https://images.example.test/synthetic-a.jpg",
                "https://images.example.test/synthetic-b.jpg",
              ],
            }
          : {}),
      });
  });
}
export async function approveFixtureEdit(
  t: TestConvex<typeof schema>,
  id: import("../../convex/_generated/dataModel").Id<"listings">,
) {
  const { api } = await import("../../convex/_generated/api");
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", "fixture-reviewer"))
      .unique();
    if (!existing)
      await ctx.db.insert("users", {
        clerkId: "fixture-reviewer",
        role: "admin",
        name: "Synthetic reviewer",
        email: "fixture-reviewer@example.test",
        createdAt: Date.now(),
      });
  });
  const listing = await t.run((ctx) => ctx.db.get(id));
  await t
    .withIdentity({ subject: "fixture-reviewer" })
    .mutation(api.listings.approveListing, {
      id,
      expectedRevision: listing?.revision ?? 0,
    });
}
