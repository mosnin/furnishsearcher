import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { dashboardHome, dashboardRouteAllowed } from "../lib/dashboard-access";
const modules = import.meta.glob("../convex/**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const add = (clerkId: string, role: "tenant" | "landlord" | "admin") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        phone: "PRIVATE CONTACT",
        createdAt: 0,
      });
    return {
      tenant: await add("traveler", "tenant"),
      owner: await add("owner", "landlord"),
      admin: await add("admin", "admin"),
      removed: await add("removed", "tenant"),
    };
  });
  return {
    t,
    ids,
    tenant: t.withIdentity({ subject: "traveler" }),
    owner: t.withIdentity({ subject: "owner" }),
    admin: t.withIdentity({ subject: "admin" }),
  };
}
describe("separate account types", () => {
  it("allows one nonadmin account choice on normal signup and no repeated switching or elevation", async () => {
    const f = await fixture();
    const signup = f.t.withIdentity({ subject: "new-traveler" });
    const user = await signup.mutation(api.users.getOrCreate, {
      clerkId: "new-traveler",
      name: "New traveler",
      email: "new@example.test",
    });
    expect(user?.accountTypePending).toBe(true);
    await expect(
      signup.mutation(api.users.updateRole, {
        userId: user!._id,
        role: "admin",
      }),
    ).rejects.toThrow();
    await signup.mutation(api.users.updateRole, {
      userId: user!._id,
      role: "tenant",
    });
    await expect(
      signup.mutation(api.users.updateRole, {
        userId: user!._id,
        role: "landlord",
      }),
    ).rejects.toThrow("platform admin");
    await expect(
      f.owner.mutation(api.users.updateRole, {
        userId: f.ids.owner,
        role: "tenant",
      }),
    ).rejects.toThrow();
    await expect(
      f.tenant.mutation(api.users.updateRole, {
        userId: f.ids.owner,
        role: "landlord",
      }),
    ).rejects.toThrow();
  });
  it("restricts account reads and updates to platform admins and lets them manage all account levels", async () => {
    const f = await fixture();
    for (const client of [f.t, f.owner, f.tenant]) {
      await expect(
        client.query(api.adminAccounts.list, {
          paginationOpts: { cursor: null, numItems: 20 },
        }),
      ).rejects.toThrow();
      await expect(
        client.mutation(api.adminAccounts.update, {
          userId: f.ids.tenant,
          name: "Changed",
          role: "admin",
        }),
      ).rejects.toThrow();
    }
    for (const role of ["landlord", "admin", "tenant"] as const) {
      await f.admin.mutation(api.adminAccounts.update, {
        userId: f.ids.tenant,
        name: `Managed ${role}`,
        role,
      });
      const row = await f.t.run((ctx) => ctx.db.get(f.ids.tenant));
      expect(row?.role).toBe(role);
      expect(row?.accountTypeChangedBy).toBe(f.ids.admin);
      expect(row?.displayName).toBe(`Managed ${role}`);
    }
    await expect(
      f.admin.mutation(api.adminAccounts.update, {
        userId: f.ids.admin,
        name: "Admin",
        role: "tenant",
      }),
    ).rejects.toThrow("Another platform admin");
    await f.t.run((ctx) => ctx.db.patch(f.ids.removed, { clerkDeletedAt: 1 }));
    await expect(
      f.admin.mutation(api.adminAccounts.update, {
        userId: f.ids.removed,
        name: "Resurrected",
        role: "landlord",
      }),
    ).rejects.toThrow("no longer available");
  });
  it("pages admin account results without returning unrelated profile fields", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      for (let n = 0; n < 26; n++)
        await ctx.db.insert("users", {
          clerkId: `person-${n}`,
          name: `Person ${n}`,
          email: `person-${n}@example.test`,
          role: "tenant",
          createdAt: n,
          phone: "PRIVATE",
          bio: "PRIVATE",
        });
    });
    let cursor: string | null = null;
    const ids = new Set<string>();
    let done = false;
    while (!done) {
      const page: FunctionReturnType<typeof api.adminAccounts.list> =
        await f.admin.query(api.adminAccounts.list, {
          role: "tenant",
          paginationOpts: { cursor, numItems: 100 },
        });
      expect(page.page.length).toBeLessThanOrEqual(20);
      for (const row of page.page) {
        expect(Object.keys(row).sort()).toEqual([
          "createdAt",
          "email",
          "id",
          "name",
          "offboarded",
          "role",
        ]);
        ids.add(row.id);
      }
      cursor = page.continueCursor;
      done = page.isDone;
    }
    expect(ids.size).toBe(28);
  });
  it("keeps owner and traveler dashboard APIs and route families distinct", async () => {
    const f = await fixture();
    await expect(
      f.owner.query(api.travelerDashboard.account, {}),
    ).rejects.toThrow("traveler account");
    await expect(
      f.admin.query(api.travelerDashboard.stays, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow("traveler account");
    expect(dashboardHome("tenant")).toBe("/dashboard/tenant");
    expect(dashboardHome("landlord")).toBe("/dashboard/landlord");
    expect(dashboardHome("admin")).toBe("/dashboard/admin");
    for (const role of ["tenant", "landlord", "admin"] as const) {
      expect(dashboardRouteAllowed(role, dashboardHome(role))).toBe(true);
      for (const other of ["tenant", "landlord", "admin"] as const) {
        if (other !== role)
          expect(
            dashboardRouteAllowed(role, `${dashboardHome(other)}/users`),
          ).toBe(false);
      }
    }
    expect(
      dashboardRouteAllowed("tenant", "/dashboard/rental-tools/insurance"),
    ).toBe(false);
    expect(
      dashboardRouteAllowed("landlord", "/dashboard/rental-tools/insurance"),
    ).toBe(true);
  });
});
