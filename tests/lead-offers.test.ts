import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2027, 0, 1),
  DAY = 86400000;
const paginationOpts = { cursor: null, numItems: 20 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("CLERK_CONTACT_MODE", "test");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture(count = 3) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const create = (clerkId: string, role: "tenant" | "landlord") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        createdAt: now,
        ...(role === "tenant"
          ? {
              phone: "+12025550123",
              phoneVerified: true,
              phoneVerificationSource: "clerk" as const,
              phoneVerificationMode: "test" as const,
              phoneVerifiedAt: now,
              phoneVerificationExpiresAt: now + 30 * DAY,
              phoneRevision: 1,
            }
          : { receiveUnmatchedLeads: true }),
      });
    const owner = await create("offers-owner", "landlord"),
      tenant = await create("offers-tenant", "tenant"),
      stranger = await create("offers-stranger", "landlord");
    const listings = [];
    for (let i = 0; i < count; i++)
      listings.push(
        await ctx.db.insert("listings", {
          landlordId: owner,
          title: `Synthetic rental ${i}`,
          address: "Synthetic shared street",
          description: "Test only",
          city: "Austin",
          state: "TX",
          zip: "78701",
          price: 1400 + i,
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
        }),
      );
    const property = await ctx.db.insert("properties", {
      ownerId: owner,
      primaryListingId: listings[0],
      address: "Synthetic shared street",
      city: "Austin",
      state: "TX",
      zip: "78701",
      locationVersion: 1,
      approvedLocationVersion: 1,
      locationConfirmedAt: now,
      unitCount: Math.min(count, 3),
      setupCompletedAt: now,
      createdAt: now,
    });
    for (const [i, id] of listings.slice(0, 3).entries())
      await ctx.db.patch(id, {
        propertyGroupId: property,
        propertyLocationVersion: 1,
        unitName: `Unit ${i}`,
        unitNameKey: `unit ${i}`,
        independentSpaceConfirmedAt: now,
      });
    return { owner, tenant, stranger, listings, property };
  });
  await seedPublishedFixtures(t);
  const owner = t.withIdentity({ subject: "offers-owner" }),
    tenant = t.withIdentity({ subject: "offers-tenant" }),
    stranger = t.withIdentity({ subject: "offers-stranger" });
  const criteria = {
    userId: ids.tenant,
    city: "Austin",
    state: "TX",
    moveInDate: now + 45 * DAY,
    moveOutDate: now + 75 * DAY,
    duration: 1,
    maxBudget: 2000,
    bedrooms: 1,
    petFriendly: false,
    description: "Synthetic housing request",
    contactPreference: "phone" as const,
    allowUnmatched: true,
  };
  const create = async (overrides = {}) => {
    const requestId = await tenant.mutation(api.housingRequests.create, {
      ...criteria,
      ...overrides,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return requestId;
  };
  const options = (
    requestId: import("../convex/_generated/dataModel").Id<"housingRequests">,
  ) =>
    owner.query(api.housingRequests.matchingProperties, {
      requestId,
      orderVersion: 1,
      paginationOpts,
    });
  return { t, ids, owner, tenant, stranger, criteria, create, options };
}
it("delivers one owner lead with distinct grouped unit context and the offered-space message budget", async () => {
  const f = await fixture(),
    requestId = await f.create();
  const inbox = await f.owner.query(api.housingRequests.inbox, {
    paginationOpts,
  });
  expect(inbox.page).toHaveLength(1);
  expect(inbox.page[0].phone).toBeNull();
  const options = await f.options(requestId);
  expect(options.page).toHaveLength(3);
  expect(
    options.page.every(
      (p) =>
        p.propertyId === f.ids.property &&
        p.propertyTitle === "Synthetic rental 0",
    ),
  ).toBe(true);
  expect(options.page.map((p) => p.unitName)).toEqual([
    "Unit 0",
    "Unit 1",
    "Unit 2",
  ]);
  expect(
    options.page.every(
      (p) => p.maxReplyLength! < 2000 && p.maxReplyLength! > 1500,
    ),
  ).toBe(true);
});
it("allows only one first reply across racing units and binds the winning unit without booking it", async () => {
  const f = await fixture(),
    requestId = await f.create();
  const results = await Promise.allSettled(
    f.ids.listings.slice(0, 2).map((listingId) =>
      f.owner.mutation(api.housingRequests.reply, {
        requestId,
        listingId,
        message: "Synthetic unit offer",
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const failed = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  expect(String(failed.reason)).toContain("already replied");
  const inbox = await f.owner.query(api.housingRequests.inbox, {
      paginationOpts,
    }),
    response = inbox.page[0].response!;
  expect(response.propertyId).toBe(f.ids.property);
  const messages = await f.t.run((ctx) => ctx.db.query("messages").collect());
  expect(messages).toHaveLength(1);
  expect(messages[0].listingId).toBe(response.listingId);
  expect(
    await f.tenant.query(api.housingRequests.offerLink, {
      messageId: messages[0]._id,
    }),
  ).toEqual({
    listingId: response.listingId,
    moveIn: f.criteria.moveInDate,
    moveOut: f.criteria.moveOutDate,
  });
  expect(
    await f.stranger.query(api.housingRequests.offerLink, {
      messageId: messages[0]._id,
    }),
  ).toBeNull();
  expect(messages[0].content).toContain(response.unitName!);
  expect(messages[0].content).toContain(`/listings/${response.listingId}`);
  expect(
    await f.owner.mutation(api.housingRequests.reply, {
      requestId,
      listingId: response.listingId,
      message: "Uncertain retry",
    }),
  ).toBe(response.conversationId);
  expect(
    await f.t.run((ctx) => ctx.db.query("bookingInquiries").collect()),
  ).toHaveLength(0);
  expect(
    await f.t.run((ctx) => ctx.db.query("availabilityBlocks").collect()),
  ).toHaveLength(0);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("reserves enough native message space for long unit names and the complete alternative notice", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.listings[0], {
      unitName: "Unit " + "x".repeat(75),
      maxOccupancy: 1,
    }),
  );
  const requestId = await f.create({
    maxBudget: 1000,
    bedrooms: 2,
    petFriendly: true,
    propertyType: "House",
    amenities: ["Pool"],
    occupants: 2,
  });
  const chosen = (await f.options(requestId)).page.find(
    (p) => p.listingId === f.ids.listings[0],
  )!;
  expect(chosen.kind).toBe("unmatched");
  expect(chosen.maxReplyLength).toBeLessThan(1700);
  const args = {
    requestId,
    listingId: chosen.listingId,
    acknowledgeDifferences: true,
    expectedDifferences: chosen.differenceKey,
  };
  await expect(
    f.owner.mutation(api.housingRequests.reply, {
      ...args,
      message: "x".repeat(chosen.maxReplyLength! + 1),
    }),
  ).rejects.toThrow(String(chosen.maxReplyLength));
  await f.owner.mutation(api.housingRequests.reply, {
    ...args,
    message: "x".repeat(chosen.maxReplyLength!),
  });
  const message = (await f.t.run((ctx) => ctx.db.query("messages").first()))!;
  expect(message.content.length).toBe(2000);
  expect(message.content).toContain(
    "No booking or change of terms is confirmed.",
  );
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("revalidates current dates and alternatives before any first response", async () => {
  const f = await fixture(),
    requestId = await f.create(),
    listingId = f.ids.listings[0];
  await f.t.run((ctx) =>
    ctx.db.insert("availabilityBlocks", {
      listingId,
      startDate: now + 50 * DAY,
      endDate: now + 60 * DAY,
      type: "unavailable",
      createdAt: now,
    }),
  );
  await expect(
    f.owner.mutation(api.housingRequests.reply, {
      requestId,
      listingId,
      message: "Stale availability",
    }),
  ).rejects.toThrow("no longer matches");
  expect(
    (await f.options(requestId)).page.some((p) => p.listingId === listingId),
  ).toBe(false);
  expect(
    (
      await f.owner.query(api.housingRequests.leadContact, {
        requestId,
        listingId,
      })
    ).phone,
  ).toBeNull();
  const other = f.ids.listings[1];
  await f.t.run((ctx) => ctx.db.patch(other, { price: 3000 }));
  await expect(
    f.owner.mutation(api.housingRequests.reply, {
      requestId,
      listingId: other,
      message: "Unacknowledged alternative",
    }),
  ).rejects.toThrow("acknowledge");
});
it("adopts pre-existing response threads without deleting history or inventing missing timestamps", async () => {
  const f = await fixture(),
    requestId = await f.create(),
    listingId = f.ids.listings[0];
  const conversationId = await f.owner.mutation(api.housingRequests.reply, {
    requestId,
    listingId,
    message: "Existing historical reply",
  });
  await f.t.run(async (ctx) => {
    const delivery = (await ctx.db.query("housingRequestDeliveries").first())!;
    await ctx.db.patch(delivery._id, { response: undefined });
    const match = (await ctx.db
      .query("housingRequestMatches")
      .withIndex("by_requestId_and_listingId", (q) =>
        q.eq("requestId", requestId).eq("listingId", listingId),
      )
      .unique())!;
    await ctx.db.patch(match._id, { respondedAt: undefined });
  });
  const response = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page[0].response!;
  expect(response.conversationId).toBe(conversationId);
  expect(response.respondedAt).toBeUndefined();
  await expect(
    f.owner.mutation(api.housingRequests.reply, {
      requestId,
      listingId: f.ids.listings[1],
      message: "Different unit",
    }),
  ).rejects.toThrow("already replied");
  expect(
    await f.owner.mutation(api.housingRequests.reply, {
      requestId,
      listingId,
      message: "Retry",
    }),
  ).toBe(conversationId);
  expect(
    await f.t.run((ctx) => ctx.db.query("messages").collect()),
  ).toHaveLength(1);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("reveals a shared phone only for the selected currently exact rental, never a stale matched delivery", async () => {
  const f = await fixture(),
    requestId = await f.create(),
    listingId = f.ids.listings[0];
  expect(
    (
      await f.owner.query(api.housingRequests.leadContact, {
        requestId,
        listingId,
      })
    ).phone,
  ).toBe("+12025550123");
  expect(
    (
      await f.owner.query(api.housingRequests.leadContact, {
        requestId,
        listingId,
      })
    ).expiresAt,
  ).toBe(now + 30 * DAY);
  await f.t.run((ctx) => ctx.db.patch(listingId, { price: 3000 }));
  expect(
    (await f.owner.query(api.housingRequests.inbox, { paginationOpts })).page[0]
      .kind,
  ).toBe("matched");
  expect(
    (await f.owner.query(api.housingRequests.inbox, { paginationOpts })).page[0]
      .phone,
  ).toBeNull();
  expect(
    (
      await f.owner.query(api.housingRequests.leadContact, {
        requestId,
        listingId,
      })
    ).phone,
  ).toBeNull();
  await expect(
    f.stranger.query(api.housingRequests.leadContact, { requestId, listingId }),
  ).rejects.toThrow("Not authorized");
  await f.t.run((ctx) => ctx.db.patch(f.ids.tenant, { phoneVerified: false }));
  expect(
    (
      await f.owner.query(api.housingRequests.leadContact, {
        requestId,
        listingId: f.ids.listings[1],
      })
    ).phone,
  ).toBeNull();
});
it("orders relevant exact options before nearby/partial candidates beyond the first scan page", async () => {
  const f = await fixture(33);
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.ids.listings[32], { price: 800 });
    await ctx.db.patch(f.ids.listings[31], { price: 500, city: "Round Rock" });
    await ctx.db.patch(f.ids.listings[30], { price: 3000 });
  });
  const requestId = await f.create({ nearbyCities: ["Round Rock"] });
  let cursor: string | null = null;
  const options = [];
  for (let i = 0; i < 3; i++) {
    const page: FunctionReturnType<
      typeof api.housingRequests.matchingProperties
    > = await f.owner.query(api.housingRequests.matchingProperties, {
      requestId,
      orderVersion: 1,
      paginationOpts: { cursor, numItems: 20 },
    });
    options.push(...page.page);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(options).toHaveLength(33);
  expect(options[0].listingId).toBe(f.ids.listings[32]);
  expect(options.at(-1)?.listingId).toBe(f.ids.listings[30]);
  expect(options.at(-2)?.listingId).toBe(f.ids.listings[31]);
});
it("backfills more than twenty-five legacy match ranks without new leads, activity or messages", async () => {
  const f = await fixture(30),
    requestId = await f.create();
  const before = await f.t.run(async (ctx) => {
    for (const row of await ctx.db.query("housingRequestMatches").collect())
      await ctx.db.patch(row._id, { rankVersion: undefined });
    return {
      deliveries: await ctx.db.query("housingRequestDeliveries").collect(),
      activity: await ctx.db.query("listingPerformanceDays").collect(),
    };
  });
  expect(await f.t.mutation(internal.leadOffers.backfill, {})).toBe(25);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (
      await f.t.run((ctx) => ctx.db.query("housingRequestMatches").collect())
    ).every((row) => row.rankVersion === 1),
  ).toBe(true);
  expect(
    await f.t.run((ctx) => ctx.db.query("housingRequestDeliveries").collect()),
  ).toEqual(before.deliveries);
  expect(
    await f.t.run((ctx) => ctx.db.query("listingPerformanceDays").collect()),
  ).toEqual(before.activity);
  expect(
    await f.t.run((ctx) => ctx.db.query("messages").collect()),
  ).toHaveLength(0);
  expect((await f.options(requestId)).page[0].listingId).toBe(
    f.ids.listings[0],
  );
});
it("stops a response with inconsistent conversation participants instead of sending a replacement", async () => {
  const f = await fixture(),
    requestId = await f.create(),
    listingId = f.ids.listings[0];
  const id = await f.owner.mutation(api.housingRequests.reply, {
    requestId,
    listingId,
    message: "Existing offer",
  });
  await f.t.run((ctx) => ctx.db.patch(id, { tenantId: f.ids.stranger }));
  const inbox = await f.owner.query(api.housingRequests.inbox, {
    paginationOpts,
  });
  expect(inbox.page[0].historyNeedsReview).toBe(true);
  expect(inbox.page[0].response).toBeNull();
  await expect(
    f.owner.mutation(api.housingRequests.reply, {
      requestId,
      listingId,
      message: "Replacement",
    }),
  ).rejects.toThrow("support review");
  expect(
    await f.t.run((ctx) => ctx.db.query("messages").collect()),
  ).toHaveLength(1);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("suppresses queued lead-email selection after a native response without changing notification preferences", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.owner, {
      housingLeadEmailsEnabled: true,
      notificationEmail: "offers-owner@example.test",
      notificationEmailMode: "test",
      notificationEmailVerifiedAt: now,
      notificationEmailExpiresAt: now + DAY,
    }),
  );
  const requestId = await f.create();
  const delivery = (await f.t.run((ctx) =>
    ctx.db.query("housingRequestDeliveries").first(),
  ))!;
  await f.t.run((ctx) =>
    ctx.db.patch(delivery._id, {
      emailStatus: "queued",
      emailGeneration: 2,
      notificationListingId: undefined,
    }),
  );
  await f.t.mutation(internal.leadNotifications.selectProperty, {
    deliveryId: delivery._id,
    generation: 2,
    cursor: null,
  });
  expect(
    (await f.t.run((ctx) => ctx.db.get(delivery._id)))?.notificationListingId,
  ).toBe(f.ids.listings[0]);
  await f.owner.mutation(api.housingRequests.reply, {
    requestId,
    listingId: f.ids.listings[0],
    message: "Native reply",
  });
  await f.t.run((ctx) =>
    ctx.db.patch(delivery._id, { emailStatus: "queued", emailGeneration: 3 }),
  );
  await f.t.mutation(internal.leadNotifications.selectProperty, {
    deliveryId: delivery._id,
    generation: 3,
    cursor: null,
  });
  expect((await f.t.run((ctx) => ctx.db.get(delivery._id)))?.emailStatus).toBe(
    "suppressed",
  );
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.ids.owner)))?.housingLeadEmailsEnabled,
  ).toBe(true);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("keeps distinct agency travelers and request dates identifiable when they share one rental conversation", async () => {
  const f = await fixture();
  const { userId, moveInDate, moveOutDate, ...criteria } = f.criteria;
  const requestIds = await f.tenant.mutation(api.housingRequests.createAgency, {
    ...criteria,
    userId,
    moveInDate,
    moveOutDate,
    agencyName: "[QA] Synthetic agency",
    travelers: [
      { name: "Synthetic traveler A", moveInDate, moveOutDate },
      {
        name: "Synthetic traveler B",
        moveInDate: moveInDate + 5 * DAY,
        moveOutDate: moveOutDate + 5 * DAY,
      },
    ],
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const conversations = [];
  for (const requestId of requestIds)
    conversations.push(
      await f.owner.mutation(api.housingRequests.reply, {
        requestId,
        listingId: f.ids.listings[0],
        message: "An offer for this traveler",
      }),
    );
  expect(conversations[0]).toBe(conversations[1]);
  const messages = await f.t.run((ctx) => ctx.db.query("messages").collect());
  expect(messages).toHaveLength(2);
  expect(messages.map((message) => message.housingRequestId)).toEqual(
    requestIds,
  );
  expect(messages[0].content).toContain("Synthetic traveler A");
  expect(messages[1].content).toContain("Synthetic traveler B");
  expect(
    (
      await f.tenant.query(api.housingRequests.offerLink, {
        messageId: messages[0]._id,
      })
    )?.moveIn,
  ).toBe(moveInDate);
  expect(
    (
      await f.tenant.query(api.housingRequests.offerLink, {
        messageId: messages[1]._id,
      })
    )?.moveIn,
  ).toBe(moveInDate + 5 * DAY);
  expect(messages[0].content).toContain(
    new Date(moveInDate).toISOString().slice(0, 10),
  );
  expect(messages[1].content).toContain(
    new Date(moveInDate + 5 * DAY).toISOString().slice(0, 10),
  );
  expect(
    messages.every(
      (message) =>
        message.content.includes("1400.00 USD/month") &&
        message.content.includes("no booking is confirmed"),
    ),
  ).toBe(true);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("resumes pre-upgrade email selection with its original index cursor", async () => {
  const f = await fixture(30),
    requestId = await f.create();
  const old = await f.t.run(async (ctx) => {
    const matches = await ctx.db
      .query("housingRequestMatches")
      .withIndex("by_requestId_and_landlordId", (q) =>
        q.eq("requestId", requestId).eq("landlordId", f.ids.owner),
      )
      .take(40);
    const page = await ctx.db
      .query("housingRequestMatches")
      .withIndex("by_requestId_and_landlordId", (q) =>
        q.eq("requestId", requestId).eq("landlordId", f.ids.owner),
      )
      .paginate({ cursor: null, numItems: 25 });
    await ctx.db.patch(f.ids.owner, {
      housingLeadEmailsEnabled: true,
      notificationEmail: "offers-owner@example.test",
      notificationEmailMode: "test",
      notificationEmailVerifiedAt: now,
      notificationEmailExpiresAt: now + DAY,
    });
    return { cursor: page.continueCursor, target: matches.at(-1)!.listingId };
  });
  for (const listingId of f.ids.listings)
    await f.owner.mutation(api.leadNotifications.setPreference, {
      listingId,
      emailEnabled: listingId === old.target,
    });
  const delivery = (await f.t.run((ctx) =>
    ctx.db.query("housingRequestDeliveries").first(),
  ))!;
  await f.t.run((ctx) =>
    ctx.db.patch(delivery._id, {
      emailStatus: "queued",
      emailGeneration: 9,
      notificationListingId: undefined,
    }),
  );
  await f.t.mutation(internal.leadNotifications.selectProperty, {
    deliveryId: delivery._id,
    generation: 9,
    cursor: old.cursor,
  });
  expect(
    (await f.t.run((ctx) => ctx.db.get(delivery._id)))?.notificationListingId,
  ).toBe(old.target);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});

it("permanently removes only the owner's lead while preserving native inquiries, messages and traveler request", async () => {
  const f = await fixture(),
    requestId = await f.create(),
    listingId = f.ids.listings[0];
  const inquiryId = await f.tenant.mutation(api.inquiries.create, {
    listingId,
    moveIn: f.criteria.moveInDate,
    moveOut: f.criteria.moveOutDate,
    occupants: 1,
    pets: false,
    message: "Native dated inquiry",
  });
  const conversationId = await f.owner.mutation(api.housingRequests.reply, {
    requestId,
    listingId,
    message: "Native response",
  });
  const before = await f.t.run(async (ctx) => ({
    inquiry: await ctx.db.get(inquiryId),
    conversation: await ctx.db.get(conversationId),
    messages: await ctx.db.query("messages").collect(),
    request: await ctx.db.get(requestId),
  }));
  const deliveryId = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page[0].deliveryId;
  expect(
    (
      await f.owner.query(api.housingRequests.leadContact, {
        requestId,
        listingId,
      })
    ).phone,
  ).toBe("+12025550123");
  await f.owner.mutation(api.housingRequests.deleteLead, { deliveryId });
  expect(
    (await f.owner.query(api.housingRequests.inbox, { paginationOpts })).page,
  ).toEqual([]);
  expect((await f.options(requestId)).page).toEqual([]);
  expect(
    (
      await f.owner.query(api.housingRequests.leadContact, {
        requestId,
        listingId,
      })
    ).phone,
  ).toBeNull();
  await expect(
    f.owner.mutation(api.housingRequests.markRead, { deliveryId }),
  ).rejects.toThrow("deleted");
  await expect(
    f.owner.mutation(api.housingRequests.reply, {
      requestId,
      listingId,
      message: "Stale page",
    }),
  ).rejects.toThrow("deleted");
  const after = await f.t.run(async (ctx) => ({
    inquiry: await ctx.db.get(inquiryId),
    conversation: await ctx.db.get(conversationId),
    messages: await ctx.db.query("messages").collect(),
    request: await ctx.db.get(requestId),
  }));
  expect(after).toEqual(before);
  expect(
    (await f.tenant.query(api.housingRequests.getMine, { paginationOpts }))
      .page[0]._id,
  ).toBe(requestId);
  expect(
    (
      await f.tenant.query(api.messages.listMessages, {
        conversationId,
        paginationOpts,
      })
    ).page.length,
  ).toBeGreaterThan(0);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("authorizes deletion by delivery ownership and retries without changing the first deletion time", async () => {
  const f = await fixture(),
    requestId = await f.create();
  const deliveryId = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page[0].deliveryId;
  for (const caller of [
    f.tenant,
    f.stranger,
    f.t.withIdentity({ subject: "unknown" }),
  ])
    await expect(
      caller.mutation(api.housingRequests.deleteLead, { deliveryId }),
    ).rejects.toThrow();
  expect((await f.options(requestId)).page).toHaveLength(3);
  await f.owner.mutation(api.housingRequests.deleteLead, { deliveryId });
  const first = await f.t.run((ctx) => ctx.db.get(deliveryId));
  vi.setSystemTime(now + 1000);
  await f.owner.mutation(api.housingRequests.deleteLead, { deliveryId });
  expect(await f.t.run((ctx) => ctx.db.get(deliveryId))).toEqual(first);
});
it("never redelivers a deleted lead after owner, request or newly added rental scans", async () => {
  const f = await fixture(),
    requestId = await f.create();
  const deliveryId = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page[0].deliveryId;
  await f.owner.mutation(api.housingRequests.deleteLead, { deliveryId });
  const before = await f.t.run(async (ctx) => ({
    matches: await ctx.db.query("housingRequestMatches").collect(),
    request: await ctx.db.get(requestId),
  }));
  const newListing = await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...data } = (await ctx.db.get(
      f.ids.listings[0],
    ))!;
    return ctx.db.insert("listings", { ...data, title: "New eligible rental" });
  });
  await f.t.mutation(internal.housingRequests.scanRequest, {
    requestId,
    cursor: null,
  });
  await f.t.mutation(internal.housingRequests.scanListing, {
    listingId: newListing,
    cursor: null,
  });
  await f.t.mutation(internal.housingRequests.scanOwner, {
    ownerId: f.ids.owner,
    cursor: null,
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await f.owner.query(api.housingRequests.inbox, { paginationOpts })).page,
  ).toHaveLength(0);
  const after = await f.t.run(async (ctx) => ({
    matches: await ctx.db.query("housingRequestMatches").collect(),
    request: await ctx.db.get(requestId),
  }));
  expect(after).toEqual(before);
  expect(
    await f.t.run((ctx) => ctx.db.query("housingRequestDeliveries").collect()),
  ).toHaveLength(1);
});
it("keeps other owners and new requests available after one owner deletes a lead", async () => {
  const f = await fixture();
  const foreignListing = await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...data } = (await ctx.db.get(
      f.ids.listings[0],
    ))!;
    return ctx.db.insert("listings", {
      ...data,
      landlordId: f.ids.stranger,
      propertyGroupId: undefined,
      unitName: undefined,
      unitNameKey: undefined,
    });
  });
  await seedPublishedFixtures(f.t);
  const requestId = await f.create();
  const deliveryId = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page[0].deliveryId;
  await f.owner.mutation(api.housingRequests.deleteLead, { deliveryId });
  expect(
    (await f.stranger.query(api.housingRequests.inbox, { paginationOpts }))
      .page[0].request._id,
  ).toBe(requestId);
  expect(
    (
      await f.stranger.query(api.housingRequests.leadContact, {
        requestId,
        listingId: foreignListing,
      })
    ).phone,
  ).toBe("+12025550123");
  const nextId = await f.create({ description: "Separate new request" });
  const page = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page;
  expect(page.map((row) => row.request._id)).toEqual([nextId]);
});
it("fences unclaimed queued notifications and legacy lookups while retaining account preferences", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.owner, {
      housingLeadEmailsEnabled: true,
      notificationEmail: "offers-owner@example.test",
      notificationEmailMode: "test",
      notificationEmailVerifiedAt: now,
      notificationEmailExpiresAt: now + DAY,
    }),
  );
  const requestId = await f.create();
  const deliveryId = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page[0].deliveryId;
  await f.t.run((ctx) =>
    ctx.db.patch(deliveryId, {
      emailStatus: "queued",
      emailGeneration: 4,
      emailSelectionStartedAt: now,
      notificationListingId: f.ids.listings[0],
    }),
  );
  expect(
    await f.t.query(internal.housingRequests.notificationDetails, {
      deliveryId,
    }),
  ).not.toBeNull();
  await f.owner.mutation(api.housingRequests.deleteLead, { deliveryId });
  await f.t.mutation(internal.leadNotifications.selectProperty, {
    deliveryId,
    generation: 4,
    cursor: null,
  });
  expect(
    await f.t.mutation(internal.leadNotifications.prepareSend, {
      deliveryId,
      generation: 4,
      configured: true,
    }),
  ).toBeNull();
  expect(
    await f.t.query(internal.housingRequests.notificationDetails, {
      deliveryId,
    }),
  ).toBeNull();
  await f.t.mutation(internal.leadNotifications.recover, {});
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const delivery = await f.t.run((ctx) => ctx.db.get(deliveryId));
  expect(delivery?.emailStatus).toBe("suppressed");
  expect(delivery?.emailGeneration).toBe(5);
  expect(delivery?.notificationListingId).toBeUndefined();
  expect(delivery?.emailAttemptedAt).toBeUndefined();
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.ids.owner)))?.housingLeadEmailsEnabled,
  ).toBe(true);
  expect((await f.options(requestId)).page).toHaveLength(0);
});
it("preserves the provider audit of an already claimed attempt while denying another claim after deletion", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.owner, {
      housingLeadEmailsEnabled: true,
      notificationEmail: "offers-owner@example.test",
      notificationEmailMode: "test",
      notificationEmailVerifiedAt: now,
      notificationEmailExpiresAt: now + DAY,
    }),
  );
  await f.create();
  const deliveryId = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page[0].deliveryId;
  await f.t.run((ctx) =>
    ctx.db.patch(deliveryId, {
      emailStatus: "queued",
      emailGeneration: 7,
      emailSelectionStartedAt: now,
      notificationListingId: f.ids.listings[0],
    }),
  );
  expect(
    await f.t.mutation(internal.leadNotifications.prepareSend, {
      deliveryId,
      generation: 7,
      configured: true,
    }),
  ).not.toBeNull();
  await f.owner.mutation(api.housingRequests.deleteLead, { deliveryId });
  expect(
    await f.t.mutation(internal.leadNotifications.prepareSend, {
      deliveryId,
      generation: 7,
      configured: true,
    }),
  ).toBeNull();
  await f.t.mutation(internal.leadNotifications.finish, {
    deliveryId,
    generation: 7,
    status: "sent",
    providerId: "synthetic-provider-result",
  });
  const delivery = await f.t.run((ctx) => ctx.db.get(deliveryId));
  expect(delivery?.deletedAt).toBeGreaterThanOrEqual(now);
  expect(delivery?.emailGeneration).toBe(7);
  expect(delivery?.emailStatus).toBe("sent");
  expect(delivery?.emailProviderId).toBe("synthetic-provider-result");
});
it("continues paging past deleted leads without restoring them or losing older active requests", async () => {
  const f = await fixture(1);
  const ids = [];
  for (let i = 0; i < 30; i++)
    ids.push(await f.create({ description: `Request ${i}` }));
  const deliveries = await f.t.run((ctx) =>
    ctx.db
      .query("housingRequestDeliveries")
      .withIndex("by_landlordId", (q) => q.eq("landlordId", f.ids.owner))
      .order("desc")
      .collect(),
  );
  for (const delivery of deliveries.slice(0, 25))
    await f.owner.mutation(api.housingRequests.deleteLead, {
      deliveryId: delivery._id,
    });
  const first = await f.owner.query(api.housingRequests.inbox, {
    paginationOpts: { cursor: null, numItems: 25 },
  });
  expect(first.page).toEqual([]);
  expect(first.isDone).toBe(false);
  const second = await f.owner.query(api.housingRequests.inbox, {
    paginationOpts: { cursor: first.continueCursor, numItems: 25 },
  });
  expect(second.page).toHaveLength(5);
  expect(second.isDone).toBe(true);
  expect(new Set(second.page.map((row) => row.request._id))).toEqual(
    new Set(ids.slice(0, 5)),
  );
});

it("deletes an unmatched lead permanently through intake preference changes", async () => {
  const f = await fixture(),
    requestId = await f.create({ maxBudget: 1000 });
  const delivery = (
    await f.owner.query(api.housingRequests.inbox, { paginationOpts })
  ).page[0];
  expect(delivery.kind).toBe("unmatched");
  await f.owner.mutation(api.housingRequests.deleteLead, {
    deliveryId: delivery.deliveryId,
  });
  await f.owner.mutation(api.housingRequests.setLeadPreferences, {
    receiveUnmatched: false,
  });
  await f.owner.mutation(api.housingRequests.setLeadPreferences, {
    receiveUnmatched: true,
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await f.owner.query(api.housingRequests.inbox, { paginationOpts })).page,
  ).toEqual([]);
  expect((await f.options(requestId)).page).toEqual([]);
  await expect(
    f.owner.mutation(api.housingRequests.reply, {
      requestId,
      listingId: f.ids.listings[0],
      message: "Alternative",
      acknowledgeDifferences: true,
    }),
  ).rejects.toThrow("deleted");
});
