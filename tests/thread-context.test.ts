import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
import { monthlyRateCents } from "../convex/lib/threadContext";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 24),
  start = Date.UTC(2027, 2, 1),
  DAY = 86400000;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("RESEND_API_KEY", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "landlord" | "tenant" | "admin") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `PRIVATE_${clerkId}@example.test`,
        phone: "PRIVATE_PHONE",
        createdAt: now,
      });
    const owner = await make("owner", "landlord"),
      tenant = await make("tenant", "tenant"),
      other = await make("other", "tenant"),
      staff = await make("staff", "admin");
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Original property title",
      description: "Synthetic listing",
      address: "PRIVATE_STREET",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 1800.55,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "House",
      amenities: [],
      photos: [],
      petFriendly: true,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: start,
      minStay: 1,
      status: "active",
      createdAt: now,
      views: 0,
    });
    return { owner, tenant, other, staff, listing };
  });
  await seedPublishedFixtures(t);
  const owner = t.withIdentity({ subject: "owner" }),
    tenant = t.withIdentity({ subject: "tenant" }),
    other = t.withIdentity({ subject: "other" }),
    staff = t.withIdentity({ subject: "staff" });
  const request = {
    listingId: ids.listing,
    moveIn: start,
    moveOut: start + 30 * DAY,
    occupants: 1,
    pets: true,
    message: "Initial synthetic traveler note",
  };
  const inquiry = await tenant.mutation(api.inquiries.create, request);
  const record = await t.run((ctx) => ctx.db.get(inquiry));
  const conv = record!.conversationId!;
  return { t, ids, owner, tenant, other, staff, request, inquiry, conv };
}
it("captures the actual starting rate and keeps it after listing edits, follow-ups and deletion", async () => {
  const { t, ids, owner, tenant, conv } = await fixture();
  const first = await tenant.query(api.threadContext.get, {
    conversationId: conv,
  });
  expect(first.termsAtStart).toMatchObject({
    monthlyRateCents: 180055,
    currency: "USD",
    title: "Original property title",
  });
  await owner.mutation(api.listings.update, {
    id: ids.listing,
    price: 2250.99,
    title: "New property title",
  });
  await tenant.mutation(api.messages.sendMessage, {
    senderId: ids.tenant,
    receiverId: ids.owner,
    listingId: ids.listing,
    content: "Follow-up in existing discussion",
  });
  const later = await owner.query(api.threadContext.get, {
    conversationId: conv,
  });
  expect(later.termsAtStart).toEqual(first.termsAtStart);
  expect(later.property.currentMonthlyRateCents).toBe(225099);
  const traveler = await tenant.query(api.threadContext.get, {
    conversationId: conv,
  });
  expect(traveler.property.canOpen).toBe(false);
  expect(traveler.property.currentMonthlyRateCents).toBeNull();
  expect(traveler.property.title).toBe("Original property title");
  await t.run((ctx) => ctx.db.delete(ids.listing));
  expect(
    await tenant.query(api.threadContext.get, { conversationId: conv }),
  ).toMatchObject({
    property: {
      title: "Original property title",
      canOpen: false,
      exists: false,
    },
    termsAtStart: first.termsAtStart,
  });
});
it("binds new inquiries and source messages to their actual thread and retains original requested details after agreed changes", async () => {
  const { t, owner, tenant, inquiry, conv, request } = await fixture();
  const original = (await t.run((ctx) => ctx.db.get(inquiry)))!;
  expect(original.originalRequest).toEqual({
    moveIn: request.moveIn,
    moveOut: request.moveOut,
    occupants: request.occupants,
    pets: request.pets,
    message: request.message,
    createdAt: original.createdAt,
  });
  const messages = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq(
          "conversationId",
          [original.tenantId, original.landlordId].sort().join("_") +
            "_" +
            original.listingId,
        ),
      )
      .take(10),
  );
  expect(messages[0].rentalInquiryId).toBe(inquiry);
  await owner.mutation(api.inquiries.respond, {
    id: inquiry,
    decision: "accepted",
  });
  const booking = await owner.query(api.bookings.get, { id: inquiry });
  await owner.mutation(api.bookings.recordAgreed, {
    inquiryId: inquiry,
    kind: "dates",
    expectedRevision: booking.revision,
    clientRequestId: crypto.randomUUID(),
    moveIn: start,
    moveOut: start + 60 * DAY,
    reason: "Synthetic agreed extension",
    agreementConfirmed: true,
  });
  const page = await tenant.query(api.threadContext.inquiries, {
    conversationId: conv,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(page.page[0]).toMatchObject({
    id: inquiry,
    explicitlyLinked: true,
    status: "accepted",
    moveOut: start + 60 * DAY,
    originalRequest: { moveOut: request.moveOut, message: request.message },
  });
});
it("returns only profile-safe participant context and denies unrelated, anonymous and nonparticipant staff reads", async () => {
  const { t, ids, owner, tenant, other, staff, conv } = await fixture();
  await tenant.mutation(api.users.updateProfile, {
    userId: ids.tenant,
    occupation: "Nurse",
    company: "Self-reported employer",
    bio: "Synthetic biography",
    city: "Austin",
    state: "TX",
  });
  const data = await owner.query(api.threadContext.get, {
    conversationId: conv,
  });
  expect(data.recipient).toMatchObject({
    occupation: "Nurse",
    company: "Self-reported employer",
    profilePath: `/travelers/${ids.tenant}`,
  });
  expect(JSON.stringify(data)).not.toContain("PRIVATE_");
  expect(data.recipient).not.toHaveProperty("email");
  expect(data.property).not.toHaveProperty("address");
  for (const client of [t, other, staff]) {
    await expect(
      client.query(api.threadContext.get, { conversationId: conv }),
    ).rejects.toThrow();
    await expect(
      client.query(api.threadContext.inquiries, {
        conversationId: conv,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow();
  }
  await owner.mutation(api.messages.setBlocked, {
    conversationId: conv,
    blocked: true,
  });
  expect(
    (await tenant.query(api.threadContext.get, { conversationId: conv }))
      .termsAtStart?.monthlyRateCents,
  ).toBe(180055);
});
it("pages legacy inquiries by exact property/participants without inventing original snapshots or leaking another owner's records", async () => {
  const { t, ids, tenant, conv, request } = await fixture();
  await t.run(async (ctx) => {
    await ctx.db.patch(conv, { termsAtStart: undefined });
    for (let i = 0; i < 35; i++)
      await ctx.db.insert("bookingInquiries", {
        ...request,
        tenantId: ids.tenant,
        landlordId: ids.owner,
        status: "withdrawn",
        createdAt: now + i,
        updatedAt: now + i,
      });
    await ctx.db.insert("bookingInquiries", {
      ...request,
      tenantId: ids.tenant,
      landlordId: ids.other,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  });
  expect(
    (await tenant.query(api.threadContext.get, { conversationId: conv }))
      .termsAtStart,
  ).toBeUndefined();
  await tenant.mutation(api.messages.sendMessage, {
    senderId: ids.tenant,
    receiverId: ids.owner,
    listingId: ids.listing,
    content: "Legacy follow-up",
  });
  expect(
    (await tenant.query(api.threadContext.get, { conversationId: conv }))
      .termsAtStart,
  ).toBeUndefined();
  const rows = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const page: FunctionReturnType<typeof api.threadContext.inquiries> =
      await tenant.query(api.threadContext.inquiries, {
        conversationId: conv,
        paginationOpts: { cursor, numItems: 9 },
      });
    rows.push(...page.page);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(rows).toHaveLength(36);
  expect(new Set(rows.map((row) => row.id)).size).toBe(36);
  expect(rows.filter((row) => !row.explicitlyLinked)).toHaveLength(35);
  expect(rows.filter((row) => !row.originalRequest)).toHaveLength(35);
  const bounded = await tenant.query(api.threadContext.inquiries, {
    conversationId: conv,
    paginationOpts: { cursor: null, numItems: 1000 },
  });
  expect(bounded.page.length).toBeLessThanOrEqual(20);
});
it("rejects a conflicting thread association and reuse of a new send reference for a different inquiry", async () => {
  const { t, tenant, request, inquiry, conv } = await fixture();
  const second = await tenant.mutation(api.inquiries.create, {
    ...request,
    moveIn: start + DAY,
    moveOut: start + 31 * DAY,
  });
  const ordinaryRef = crypto.randomUUID();
  const first = (await t.run((ctx) => ctx.db.get(inquiry)))!;
  await tenant.mutation(api.messages.sendMessage, {
    senderId: first.tenantId,
    receiverId: first.landlordId,
    listingId: first.listingId,
    content: "Ordinary text",
    clientRequestId: ordinaryRef,
  });
  await expect(
    tenant.mutation(api.bookings.message, {
      id: inquiry,
      content: "Ordinary text",
      clientRequestId: ordinaryRef,
    }),
  ).rejects.toThrow("reference");
  const reference = crypto.randomUUID();
  await tenant.mutation(api.bookings.message, {
    id: inquiry,
    content: "Same text",
    clientRequestId: reference,
  });
  await expect(
    tenant.mutation(api.bookings.message, {
      id: second,
      content: "Same text",
      clientRequestId: reference,
    }),
  ).rejects.toThrow("reference");
  const original = (await t.run((ctx) => ctx.db.get(conv)))!;
  const conflicting = await t.run((ctx) =>
    ctx.db.insert("conversations", {
      listingId: original.listingId,
      landlordId: original.landlordId,
      tenantId: original.landlordId,
      lastMessage: "Synthetic foreign association",
      lastMessageAt: now,
      tenantRead: true,
      landlordRead: true,
    }),
  );
  await t.run((ctx) => ctx.db.patch(inquiry, { conversationId: conflicting }));
  await expect(
    tenant.mutation(api.bookings.message, {
      id: inquiry,
      content: "Should fail",
      clientRequestId: crypto.randomUUID(),
    }),
  ).rejects.toThrow("association");
  const page = await tenant.query(api.threadContext.inquiries, {
    conversationId: conv,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(page.page.map((row) => row.id)).toEqual([second]);
});
it("does not round invalid or fractional-cent rates into a claimed historical amount", () => {
  expect(monthlyRateCents(1234.56)).toBe(123456);
  for (const price of [0, -1, NaN, Infinity, 0.001, 100.005, Number.MAX_VALUE])
    expect(monthlyRateCents(price)).toBeNull();
});
it("does not capture a hidden draft rate when an older unthreaded inquiry starts its first conversation", async () => {
  const { t, ids, owner, other, request } = await fixture();
  const legacy = await t.run((ctx) =>
    ctx.db.insert("bookingInquiries", {
      ...request,
      tenantId: ids.other,
      landlordId: ids.owner,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }),
  );
  await owner.mutation(api.listings.update, {
    id: ids.listing,
    price: 9999.99,
  });
  const conversationId = await other.mutation(api.bookings.message, {
    id: legacy,
    content: "First discussion of an older inquiry",
    clientRequestId: crypto.randomUUID(),
  });
  const data = await other.query(api.threadContext.get, { conversationId });
  expect(data.termsAtStart).toBeUndefined();
  expect(data.property.currentMonthlyRateCents).toBeNull();
  expect(data.property.canOpen).toBe(false);
  expect(
    (await owner.query(api.threadContext.get, { conversationId })).property
      .currentMonthlyRateCents,
  ).toBe(999999);
});
