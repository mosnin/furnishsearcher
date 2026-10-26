import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { DAY } from "../lib/stays";
import { parseSearchParams } from "../lib/search";
const modules = import.meta.glob("../convex/**/*.ts"),
  day = Date.UTC(2026, 9, 26);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(day + 3600000);
  vi.stubEnv("RESEND_API_KEY", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture(count = 2) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = async (clerkId: string, role: "tenant" | "landlord") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        phone: "PRIVATE PHONE",
        createdAt: day,
      });
    const tenant = await user("traveler-dashboard", "tenant"),
      other = await user("other-traveler", "tenant"),
      owner = await user("stay-owner", "landlord"),
      stays = [];
    for (let n = 0; n < count; n++) {
      const listing = await ctx.db.insert("listings", {
        landlordId: owner,
        title: `Synthetic stay ${n}`,
        description: "PRIVATE DRAFT",
        address: "PRIVATE ADDRESS",
        zip: "PRIVATE ZIP",
        city: "Austin",
        state: "TX",
        price: 1800,
        bedrooms: 1,
        bathrooms: 1,
        propertyType: "House",
        amenities: [],
        photos: [],
        petFriendly: false,
        parkingIncluded: false,
        utilitiesIncluded: false,
        availableFrom: day,
        minStay: 1,
        status: "inactive",
        views: 0,
        createdAt: day,
      });
      const moveIn = n % 2 ? day + 30 * DAY : day - 5 * DAY,
        moveOut = n % 2 ? day + 60 * DAY : day + 5 * DAY;
      const inquiry = await ctx.db.insert("bookingInquiries", {
        listingId: listing,
        tenantId: tenant,
        landlordId: owner,
        moveIn,
        moveOut,
        occupants: 1,
        pets: false,
        message: "PRIVATE MESSAGE",
        status: "accepted",
        createdAt: day,
        updatedAt: day,
      });
      const block = await ctx.db.insert("availabilityBlocks", {
        listingId: listing,
        inquiryId: inquiry,
        startDate: moveIn,
        endDate: moveOut,
        type: "booked",
        createdAt: day,
      });
      await ctx.db.patch(inquiry, { availabilityBlockId: block });
      stays.push({ listing, inquiry, block });
    }
    return { tenant, other, owner, stays };
  });
  return {
    t,
    ids,
    tenant: t.withIdentity({ subject: "traveler-dashboard" }),
    other: t.withIdentity({ subject: "other-traveler" }),
  };
}
const first = { paginationOpts: { cursor: null, numItems: 10 } };
it("binds both dashboard reads to the active account and keeps stay contact/message/location data private", async () => {
  const { t, tenant, other, ids } = await fixture();
  await expect(t.query(api.travelerDashboard.account, {})).rejects.toThrow(
    "sign in",
  );
  await expect(t.query(api.travelerDashboard.stays, first)).rejects.toThrow(
    "sign in",
  );
  await expect(
    tenant.query(api.travelerDashboard.stays, {
      ...first,
      tenantId: ids.other,
    } as never),
  ).rejects.toThrow();
  expect((await other.query(api.travelerDashboard.stays, first)).page).toEqual(
    [],
  );
  const rows = (await tenant.query(api.travelerDashboard.stays, first)).page;
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(
      [
        "id",
        "title",
        "ownerName",
        "moveIn",
        "moveOut",
        "asOfDay",
        "phase",
        "calendarReserved",
        "href",
      ].sort(),
    );
    expect(row.href).toBe(`/dashboard/inquiries/${row.id}`);
  }
  for (const secret of [
    "PRIVATE ADDRESS",
    "PRIVATE PHONE",
    "PRIVATE MESSAGE",
    "PRIVATE ZIP",
    "PRIVATE DRAFT",
  ])
    expect(JSON.stringify(rows)).not.toContain(secret);
  await t.run((ctx) => ctx.db.patch(ids.tenant, { clerkDeletedAt: day }));
  await expect(tenant.query(api.travelerDashboard.account, {})).rejects.toThrow(
    "no longer available",
  );
  await expect(
    tenant.query(api.travelerDashboard.stays, first),
  ).rejects.toThrow("no longer available");
});
it("classifies actual accepted active/upcoming stays with current calendar coverage and excludes other statuses/ended records", async () => {
  const { t, tenant, ids } = await fixture(5);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.stays[2].inquiry, { status: "pending" });
    await ctx.db.patch(ids.stays[3].inquiry, { status: "cancelled" });
    await ctx.db.patch(ids.stays[4].inquiry, { moveOut: day });
  });
  const rows = (await tenant.query(api.travelerDashboard.stays, first)).page;
  expect(rows.map((r) => r.phase).sort()).toEqual(["active", "upcoming"]);
  expect(rows.every((r) => r.calendarReserved)).toBe(true);
  await t.run((ctx) => ctx.db.delete(ids.stays[0].block));
  const active = (
    await tenant.query(api.travelerDashboard.stays, first)
  ).page.find((r) => r.id === ids.stays[0].inquiry);
  expect(active).toMatchObject({ phase: "active", calendarReserved: false });
});
it("pages a 127-stay future/current history completely and caps candidates at ten", async () => {
  const { tenant, ids } = await fixture(127);
  let cursor: string | null = null,
    done = false,
    pages = 0;
  const rows = [];
  while (!done) {
    const result: FunctionReturnType<typeof api.travelerDashboard.stays> =
      await tenant.query(api.travelerDashboard.stays, {
        paginationOpts: { cursor, numItems: 1000 },
      });
    expect(result.page.length).toBeLessThanOrEqual(10);
    rows.push(...result.page);
    cursor = result.continueCursor;
    done = result.isDone;
    expect(++pages).toBeLessThan(20);
  }
  expect(pages).toBe(13);
  expect(new Set(rows.map((r) => r.id))).toEqual(
    new Set(ids.stays.map((r) => r.inquiry)),
  );
  expect(rows.filter((r) => r.phase === "active")).toHaveLength(64);
  expect(rows.filter((r) => r.phase === "upcoming")).toHaveLength(63);
});
it("resumes saved criteria, uses private saved-rental state and resolves the optional introduction after a normal profile save", async () => {
  const { t, tenant, ids } = await fixture(1);
  let account = await tenant.query(api.travelerDashboard.account, {});
  expect(account.tasks.find((r) => r.id === "introduction")?.optional).toBe(
    true,
  );
  expect(account.tasks.find((r) => r.id === "search")?.href).toBe("/search");
  await tenant.mutation(api.savedSearches.save, {
    userId: ids.tenant,
    name: "Austin work stay",
    city: "Austin",
    state: "TX",
    moveIn: day + 30 * DAY,
    moveOut: day + 90 * DAY,
    flexibleDays: 7,
    maxPrice: 2200.55,
    amenities: ["WiFi"],
    emailAlerts: false,
  });
  await t.run((ctx) =>
    ctx.db.insert("savedListings", {
      tenantId: ids.tenant,
      listingId: ids.stays[0].listing,
      savedAt: day,
    }),
  );
  await tenant.mutation(api.users.updateProfile, {
    userId: ids.tenant,
    bio: "Synthetic traveler introduction",
  });
  account = await tenant.query(api.travelerDashboard.account, {});
  expect(account.tasks.some((r) => r.id === "introduction")).toBe(false);
  expect(account.tasks.find((r) => r.id === "saved")?.href).toBe(
    "/dashboard/tenant/saved",
  );
  const href = account.tasks.find((r) => r.id === "resume-search")!.href,
    criteria = parseSearchParams(
      new URL(href, "https://example.test").searchParams,
    );
  expect(criteria).toMatchObject({
    city: "Austin",
    state: "TX",
    moveIn: day + 30 * DAY,
    moveOut: day + 90 * DAY,
    flexibleDays: 7,
    maxPrice: 2200.55,
    amenities: ["WiFi"],
  });
});
it("uses server UTC day boundaries and ignores caller refresh-key clock claims", async () => {
  const { tenant } = await fixture();
  const a = await tenant.query(api.travelerDashboard.account, {
    refreshKey: "2099-01-01",
  });
  expect(a).toMatchObject({
    day,
    nextDay: day + DAY,
    checkedAt: day + 3600000,
  });
  vi.setSystemTime(day + 6 * DAY);
  const b = await tenant.query(api.travelerDashboard.account, {
    refreshKey: "1900-01-01",
  });
  expect(b.day).toBe(day + 6 * DAY);
  expect(
    (
      await tenant.query(api.travelerDashboard.stays, {
        ...first,
        refreshKey: "2099",
      })
    ).page.map((r) => r.phase),
  ).toEqual(["upcoming"]);
});
it("flags malformed dates or a mismatched property-owner reference without exposing the other owner's draft", async () => {
  const { t, tenant, ids } = await fixture(2);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.stays[0].inquiry, { moveIn: day + 10 * DAY });
    await ctx.db.patch(ids.stays[1].listing, {
      landlordId: ids.other,
      title: "FOREIGN PRIVATE TITLE",
    });
  });
  const rows = (await tenant.query(api.travelerDashboard.stays, first)).page;
  expect(
    rows.every((r) => r.phase === "needs_review" && !r.calendarReserved),
  ).toBe(true);
  expect(JSON.stringify(rows)).not.toContain("FOREIGN PRIVATE TITLE");
});
it("sends malformed legacy saved criteria to management instead of failing the whole dashboard", async () => {
  const { t, tenant, ids } = await fixture(0);
  await t.run((ctx) =>
    ctx.db.insert("savedSearches", {
      userId: ids.tenant,
      name: "Legacy invalid budget",
      maxPrice: -1,
      createdAt: day,
    }),
  );
  const task = (
    await tenant.query(api.travelerDashboard.account, {})
  ).tasks.find((row) => row.id === "resume-search");
  expect(task?.href).toBe("/dashboard/tenant/searches");
  expect(task?.title).toContain("Review your saved search");
});
it("freezes the candidate cursor cutoff across midnight while excluding newly ended stays and rejecting future clock selectors", async () => {
  const { t, tenant, ids } = await fixture(3);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.stays[0].inquiry, { moveOut: day + DAY });
    await ctx.db.patch(ids.stays[2].inquiry, { moveOut: day + 2 * DAY });
  });
  const windowDay = (await tenant.query(api.travelerDashboard.account, {})).day;
  const page = await tenant.query(api.travelerDashboard.stays, {
    windowDay,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(page.page[0].id).toBe(ids.stays[0].inquiry);
  vi.setSystemTime(day + DAY + 1000);
  const remaining = await tenant.query(api.travelerDashboard.stays, {
    windowDay,
    paginationOpts: { cursor: page.continueCursor, numItems: 10 },
  });
  expect(remaining.page).toHaveLength(2);
  expect(remaining.page.every((row) => row.asOfDay === day + DAY)).toBe(true);
  expect(
    (
      await tenant.query(api.travelerDashboard.stays, { windowDay, ...first })
    ).page.some((row) => row.id === ids.stays[0].inquiry),
  ).toBe(false);
  await expect(
    tenant.query(api.travelerDashboard.stays, {
      windowDay: day + 2 * DAY,
      ...first,
    }),
  ).rejects.toThrow("current stay window");
});
