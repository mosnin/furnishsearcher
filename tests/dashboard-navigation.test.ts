import { describe, expect, it } from "vitest";
import {
  dashboardGroups,
  dashboardFooter,
  dashboardItemActive,
} from "../components/dashboard/navigation";
describe("dashboard navigation contracts", () => {
  it("matches complete route segments and keeps overview distinct from descendant pages", () => {
    expect(
      dashboardItemActive(
        "/dashboard/landlord/listings/item/edit",
        "/dashboard/landlord/listings",
      ),
    ).toBe(true);
    expect(
      dashboardItemActive(
        "/dashboard/landlord/listings-new",
        "/dashboard/landlord/listings",
      ),
    ).toBe(false);
    expect(
      dashboardItemActive(
        "/dashboard/landlord/listings",
        "/dashboard/landlord",
      ),
    ).toBe(false);
    expect(
      dashboardItemActive("/dashboard/landlord", "/dashboard/landlord"),
    ).toBe(true);
    expect(
      dashboardItemActive(
        "/dashboard/tenant/saved",
        "/dashboard/tenant/searches",
      ),
    ).toBe(false);
  });
  it("preserves role destinations without exposing staff or owner management as traveler navigation", () => {
    const owner = dashboardGroups("landlord")
      .flatMap((g) => g.items)
      .map((i) => i.href);
    const traveler = dashboardGroups("tenant")
      .flatMap((g) => g.items)
      .map((i) => i.href);
    const staff = dashboardGroups("admin")
      .flatMap((g) => g.items)
      .map((i) => i.href);
    expect(owner).toEqual(
      expect.arrayContaining([
        "/dashboard/landlord/listings",
        "/dashboard/landlord/requests",
        "/dashboard/landlord/analytics",
        "/dashboard/landlord/billing",
      ]),
    );
    expect(owner.some((h) => h.startsWith("/dashboard/tenant"))).toBe(false);
    expect(traveler).toEqual(
      expect.arrayContaining([
        "/dashboard/tenant",
        "/dashboard/housing-requests",
        "/dashboard/inquiries",
        "/dashboard/tenant/saved",
        "/dashboard/tenant/searches",
      ]),
    );
    expect(
      traveler.some(
        (h) =>
          h.startsWith("/dashboard/landlord") ||
          h.startsWith("/dashboard/admin"),
      ),
    ).toBe(false);
    expect(staff).toEqual(
      expect.arrayContaining([
        "/dashboard/admin/listings",
        "/dashboard/admin/reviews",
        "/dashboard/admin/users",
        "/dashboard/admin/reports",
        "/dashboard/admin/support",
      ]),
    );
    for (const role of ["landlord", "tenant", "admin"] as const) {
      const paths = [
        ...dashboardGroups(role).flatMap((g) => g.items),
        ...dashboardFooter,
      ].map((i) => i.href);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
});
