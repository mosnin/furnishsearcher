import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
import { conversationKey } from "../convex/lib/messageAccess";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 25),
  DAY = 86400000,
  options = { cursor: null, numItems: 20 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  for (const [k, v] of Object.entries({
    CLERK_CONTACT_WEBHOOK_SECRET:
      "whsec_" +
      Buffer.from("synthetic-account-deletion-secret!").toString("base64"),
    CLERK_CONTACT_WEBHOOK_INSTANCE_ID: "ins_fixture",
    CLERK_CONTACT_WEBHOOK_MODE: "test",
    CLERK_CONTACT_MODE: "test",
    CLERK_EMAIL_MODE: "test",
    RESEND_API_KEY: "",
  }))
    vi.stubEnv(k, v);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture(count = 1) {
  const t = convexTest(schema, modules);
  geospatial.register(t);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "landlord" | "tenant" | "admin") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: "Synthetic " + clerkId,
        email: clerkId + "@example.test",
        createdAt: now,
        phone: "+12025550123",
        phoneVerified: true,
        phoneVerificationSource: "clerk",
        phoneVerificationMode: "test",
        phoneVerifiedAt: now,
        phoneVerificationExpiresAt: now + 30 * DAY,
        phoneRevision: 1,
        listingPhoneConsent: { revision: 1, expiresAt: now + 30 * DAY },
        notificationEmail: clerkId + "@example.test",
        notificationEmailMode: "test",
        notificationEmailVerifiedAt: now,
        notificationEmailExpiresAt: now + 30 * DAY,
        messageEmailsEnabled: true,
      });
    const owner = await make("user_owner", "landlord"),
      tenant = await make("user_tenant", "tenant"),
      staff = await make("user_staff", "admin");
    const listings = [];
    for (let i = 0; i < count; i++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: "Synthetic retained rental " + i,
          description: "Test only",
          address: "Private fixture street",
          city: "Austin",
          state: "TX",
          zip: "78701",
          price: 1800,
          bedrooms: 1,
          bathrooms: 1,
          propertyType: "Apartment",
          amenities: [],
          photos: [],
          petFriendly: false,
          utilitiesIncluded: true,
          parkingIncluded: true,
          availableFrom: now,
          minStay: 1,
          status: "active",
          createdAt: now,
          views: 0,
          mapLatitude: 30.26,
          mapLongitude: -97.74,
        }),
      );
    return { owner, tenant, staff, listings };
  });
  await seedPublishedFixtures(t);
  const owner = t.withIdentity({ subject: "user_owner" }),
    tenant = t.withIdentity({ subject: "user_tenant" }),
    staff = t.withIdentity({ subject: "user_staff" }),
    listingId = ids.listings[0];
  const inquiryId = await tenant.mutation(api.inquiries.create, {
    listingId,
    moveIn: now + 10 * DAY,
    moveOut: now + 40 * DAY,
    occupants: 1,
    pets: false,
    message: "Synthetic stay history",
  });
  await owner.mutation(api.inquiries.respond, {
    id: inquiryId,
    decision: "accepted",
  });
  const conversation = (await t.run((ctx) =>
    ctx.db
      .query("conversations")
      .withIndex("by_listing_tenant", (q) =>
        q.eq("listingId", listingId).eq("tenantId", ids.tenant),
      )
      .unique(),
  ))!;
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const remove = (clerkId = "user_owner") =>
    t.mutation(internal.clerkContactWebhook.apply, {
      eventId: "msg_deletion",
      payload: JSON.stringify({
        object: "event",
        instance_id: "ins_fixture",
        type: "user.deleted",
        timestamp: Date.now(),
        data: { id: clerkId, deleted: true },
      }),
    });
  return {
    t,
    ids,
    owner,
    tenant,
    staff,
    listingId,
    inquiryId,
    conversation,
    remove,
  };
}
it("immediately hides published rentals and phone contact before paged maintenance, while retaining native records", async () => {
  const f = await fixture();
  expect(
    await f.t.query(api.listings.getById, { id: f.listingId }),
  ).not.toBeNull();
  await f.remove();
  expect(await f.t.query(api.listings.getById, { id: f.listingId })).toBeNull();
  expect(
    await f.t.query(api.users.getPublicProfile, { userId: f.ids.owner }),
  ).toBeNull();
  expect(
    (
      await f.tenant.query(api.phoneContacts.availability, {
        listingId: f.listingId,
      })
    ).status,
  ).toBe("unavailable");
  expect(await f.t.run((ctx) => ctx.db.get(f.ids.owner))).toMatchObject({
    clerkDeletedAt: expect.any(Number),
    role: "landlord",
    name: "Synthetic user_owner",
    messageEmailsEnabled: false,
    phoneVerified: false,
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.listingId))).not.toBeNull();
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await f.t.run((ctx) => ctx.db.get(f.listingId)))?.status).toBe(
    "inactive",
  );
});
it("blocks retained-token private access and legacy compatibility lookups, edits and role escalation", async () => {
  const f = await fixture();
  await f.remove();
  for (const query of [
    () =>
      f.owner.query(api.listingPerformance.report, {
        listingId: f.listingId,
        days: 7,
      }),
    () => f.owner.query(api.housingRequests.inbox, { paginationOpts: options }),
    () => f.owner.query(api.phoneContacts.settings, {}),
    () => f.owner.query(api.bookings.get, { id: f.inquiryId }),
  ])
    await expect(query()).rejects.toThrow("no longer available");
  expect(
    await f.owner.query(api.users.getByClerkId, { clerkId: "user_owner" }),
  ).toBeNull();
  expect(
    await f.owner.query(api.payments.resolveUserId, { clerkId: "user_owner" }),
  ).toBeNull();
  expect(
    await f.owner.query(api.messages.getConversations, { userId: f.ids.owner }),
  ).toEqual([]);
  await expect(
    f.owner.mutation(api.users.updateRole, {
      userId: f.ids.owner,
      role: "admin",
    }),
  ).rejects.toThrow();
  await expect(
    f.owner.mutation(api.listings.publish, { id: f.listingId }),
  ).rejects.toThrow();
  await expect(
    f.owner.mutation(api.users.getOrCreate, {
      clerkId: "user_owner",
      name: "Recreate",
      email: "recreated@example.test",
    }),
  ).rejects.toThrow("no longer available");
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("preserves the surviving participant's stay and message history but denies new contact and calendar changes", async () => {
  const f = await fixture(),
    before = await f.tenant.query(api.bookings.get, { id: f.inquiryId });
  await f.remove();
  const after = await f.tenant.query(api.bookings.get, { id: f.inquiryId });
  expect(after.inquiry.status).toBe("accepted");
  expect(after.inquiry.moveIn).toBe(before.inquiry.moveIn);
  expect(after.inquiry.availabilityBlockId).toBe(
    before.inquiry.availabilityBlockId,
  );
  expect(
    (
      await f.tenant.query(api.messages.listMessages, {
        conversationId: f.conversation._id,
        paginationOpts: options,
      })
    ).page.length,
  ).toBeGreaterThan(0);
  const summaries = await f.tenant.query(api.messages.getConversations, {
    userId: f.ids.tenant,
  });
  expect(summaries[0].cannotMessage).toBe(true);
  expect(summaries[0].otherUser?.name).toBe("Account removed");
  await expect(
    f.tenant.mutation(api.messages.sendMessage, {
      senderId: f.ids.tenant,
      receiverId: f.ids.owner,
      listingId: f.listingId,
      content: "New message",
    }),
  ).rejects.toThrow();
  await expect(
    f.tenant.mutation(api.bookings.propose, {
      inquiryId: f.inquiryId,
      kind: "dates",
      moveIn: now + 10 * DAY,
      moveOut: now + 41 * DAY,
      expectedRevision: 1,
      reason: "New request",
      clientRequestId: crypto.randomUUID(),
    }),
  ).rejects.toThrow();
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("closes more than twenty-five open housing requests without rewriting fulfilled history", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 31; i++)
      await ctx.db.insert("housingRequests", {
        userId: f.ids.owner,
        city: "Austin",
        state: "TX",
        moveInDate: now + 60 * DAY,
        duration: 1,
        maxBudget: 2000,
        bedrooms: 1,
        petFriendly: false,
        description: "Synthetic retained request",
        status: i === 30 ? "fulfilled" : "open",
        createdAt: now + i,
      });
  });
  await f.remove();
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const requests = await f.t.run((ctx) =>
    ctx.db
      .query("housingRequests")
      .withIndex("by_user", (q) => q.eq("userId", f.ids.owner))
      .collect(),
  );
  expect(requests.filter((r) => r.status === "closed")).toHaveLength(30);
  expect(requests.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("deactivates more than twenty-five rental spaces and keeps billing/booking history unchanged", async () => {
  const f = await fixture(27),
    subscriptions = await f.t.run((ctx) =>
      ctx.db.query("subscriptions").collect(),
    );
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.ids.listings[0], {
      approvalStatus: "pending",
      status: "pending",
    });
    await ctx.db.patch(f.ids.listings[1], {
      approvalStatus: "rejected",
      status: "rejected",
    });
  });
  await f.remove();
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const listings = await f.t.run((ctx) =>
    ctx.db
      .query("listings")
      .withIndex("by_landlord", (q) => q.eq("landlordId", f.ids.owner))
      .collect(),
  );
  expect(listings).toHaveLength(27);
  expect(listings.every((l) => l.status === "inactive")).toBe(true);
  expect(
    await f.t.run((ctx) => ctx.db.query("subscriptions").collect()),
  ).toEqual(subscriptions);
  expect((await f.t.run((ctx) => ctx.db.get(f.inquiryId)))?.status).toBe(
    "accepted",
  );
});
it("does not resurrect a deleted subject through replayed updates or fresh native onboarding", async () => {
  const f = await fixture();
  await f.remove();
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const before = await f.t.run((ctx) => ctx.db.get(f.ids.owner));
  await f.remove();
  expect(await f.t.run((ctx) => ctx.db.get(f.ids.owner))).toEqual(before);
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.owner, { clerkDeletedAt: undefined }),
  );
  expect(
    await f.owner.query(api.users.getByClerkId, { clerkId: "user_owner" }),
  ).toBeNull();
  expect(await f.t.query(api.listings.getById, { id: f.listingId })).toBeNull();
  await expect(
    f.owner.mutation(api.users.getOrCreate, {
      clerkId: "user_owner",
      name: "Native retry",
      email: "retry@example.test",
    }),
  ).rejects.toThrow("no longer available");
  await f.t.mutation(internal.accountOffboarding.reconcile, { cursor: null });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.ids.owner)))?.clerkDeletedAt,
  ).toBeDefined();
  await f.t.run((ctx) => ctx.db.patch(f.listingId, { status: "active" }));
  await f.t.mutation(internal.accountOffboarding.reconcile, { cursor: null });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await f.t.run((ctx) => ctx.db.get(f.listingId)))?.status).toBe(
    "inactive",
  );
});
it("keeps a deletion delivered before onboarding authoritative and leaves unrelated users available", async () => {
  const f = await fixture();
  await f.remove("user_not_onboarded");
  const missing = f.t.withIdentity({ subject: "user_not_onboarded" });
  await expect(
    missing.mutation(api.users.getOrCreate, {
      clerkId: "user_not_onboarded",
      name: "Late signup",
      email: "late@example.test",
    }),
  ).rejects.toThrow("no longer available");
  expect(
    await f.tenant.query(api.users.getByClerkId, { clerkId: "user_tenant" }),
  ).not.toBeNull();
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("revokes a deleted staff account's authority and keeps internal financial reconciliation lookup available", async () => {
  const f = await fixture();
  await f.remove("user_staff");
  await expect(f.staff.query(api.users.getAll, {})).resolves.toEqual([]);
  await expect(
    f.staff.mutation(api.users.updateRole, {
      userId: f.ids.tenant,
      role: "admin",
    }),
  ).rejects.toThrow();
  await f.remove();
  expect(
    (
      await f.t.query(internal.payments.findUserByClerkId, {
        clerkId: "user_owner",
      })
    )?._id,
  ).toBe(f.ids.owner);
  expect(
    await f.t.query(internal.accountOffboarding.activeOwnerRecipient, {
      userId: f.ids.owner,
    }),
  ).toBeNull();
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
