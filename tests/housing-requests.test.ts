import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { DAY } from "../lib/stays";

const modules = import.meta.glob("../convex/**/*.ts");
const start = Date.UTC(2027, 2, 1),
  end = start + 60 * DAY;
const paginationOpts = { cursor: null, numItems: 20 };

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const makeUser = (clerkId: string, role: "tenant" | "landlord") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        createdAt: 0,
        phone: "+15555550123",
        phoneVerified: true,
      });
    const tenant = await makeUser("tenant", "tenant"),
      owner = await makeUser("owner", "landlord"),
      stranger = await makeUser("stranger", "landlord");
    const data = {
      landlordId: owner,
      title: "Quiet Austin home",
      description: "Synthetic fixture",
      city: "austin",
      state: "Texas",
      zip: "78701",
      address: "Private address",
      price: 1800,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: "House",
      amenities: ["WiFi", "Washer/Dryer"],
      photos: [],
      petFriendly: true,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: start,
      minStay: 1,
      status: "active" as const,
      createdAt: 0,
      views: 0,
    };
    const listing = await ctx.db.insert("listings", data);
    const second = await ctx.db.insert("listings", {
      ...data,
      title: "Second home",
      city: "Round Rock",
    });
    const expensive = await ctx.db.insert("listings", { ...data, price: 5000 });
    return { tenant, owner, stranger, listing, second, expensive, data };
  });
  return {
    t,
    ids,
    tenant: t.withIdentity({ subject: "tenant" }),
    owner: t.withIdentity({ subject: "owner" }),
    stranger: t.withIdentity({ subject: "stranger" }),
    criteria: {
      city: "Austin",
      state: "TX",
      moveInDate: start,
      moveOutDate: end,
      duration: 2,
      maxBudget: 2000,
      bedrooms: 2,
      petFriendly: true,
      description: "Traveling for work",
      nearbyCities: ["Round Rock"],
      amenities: ["wifi"],
      utilitiesIncluded: true,
      parkingIncluded: true,
      propertyType: "House",
      occupants: 2,
      contactPreference: "platform" as const,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T20:00:00Z"));
  vi.stubEnv("RESEND_API_KEY", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("housing request delivery", () => {
  it("previews and matches exact requirements, normalizes state/city, and deduplicates the owner inbox", async () => {
    const { t, ids, tenant, owner, stranger, criteria } = await fixture();
    const preview = await t.query(api.housingRequests.preview, {
      ...criteria,
      paginationOpts,
    });
    expect(preview.page.map((p) => p.listingId).sort()).toEqual(
      [ids.listing, ids.second].sort(),
    );
    const requestId = await tenant.mutation(api.housingRequests.create, {
      ...criteria,
      userId: ids.tenant,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const inbox = await owner.query(api.housingRequests.inbox, {
      paginationOpts,
    });
    expect(inbox.page).toHaveLength(1);
    expect(inbox.page[0].phone).toBeNull();
    expect(inbox.page[0].read).toBe(false);
    expect(
      (await stranger.query(api.housingRequests.inbox, { paginationOpts }))
        .page,
    ).toEqual([]);
    const mine = await tenant.query(api.housingRequests.getMine, {
      paginationOpts,
    });
    expect(mine.page[0]).toMatchObject({
      matchingStatus: "complete",
      matchedProperties: 2,
    });
    expect(
      (
        await owner.query(api.housingRequests.matchingProperties, {
          requestId,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(2);
    await owner.mutation(api.housingRequests.markRead, {
      deliveryId: inbox.page[0].deliveryId,
    });
    expect(
      (await owner.query(api.housingRequests.inbox, { paginationOpts })).page[0]
        .read,
    ).toBe(true);
    await t.mutation(internal.housingRequests.scanRequest, {
      requestId,
      cursor: null,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await owner.query(api.housingRequests.inbox, { paginationOpts })).page,
    ).toHaveLength(1);
    expect(
      (await tenant.query(api.housingRequests.getMine, { paginationOpts }))
        .page[0].matchedProperties,
    ).toBe(2);
    const delivery = await t.run((ctx) => ctx.db.get(inbox.page[0].deliveryId));
    expect(delivery?.emailStatus).toBe("unconfigured");
  });

  it("does not publish tenant requests or give unrelated owners access to their properties or replies", async () => {
    const { t, ids, tenant, stranger, criteria } = await fixture();
    const requestId = await tenant.mutation(api.housingRequests.create, {
      ...criteria,
      userId: ids.tenant,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.query(api.housingRequests.getOpen, {})).rejects.toThrow();
    expect(await stranger.query(api.housingRequests.getOpen, {})).toEqual([]);
    expect(
      (
        await stranger.query(api.housingRequests.matchingProperties, {
          requestId,
          paginationOpts,
        })
      ).page,
    ).toEqual([]);
    await expect(
      stranger.mutation(api.housingRequests.reply, {
        requestId,
        listingId: ids.listing,
        message: "Unauthorized",
      }),
    ).rejects.toThrow();
    await expect(
      stranger.mutation(api.housingRequests.close, { id: requestId }),
    ).rejects.toThrow();
    expect(
      (await stranger.query(api.housingRequests.getMine, { paginationOpts }))
        .page,
    ).toEqual([]);
  });

  it("opens the correct private conversation once and prevents unrelated messages", async () => {
    const { t, ids, tenant, owner, stranger, criteria } = await fixture();
    const requestId = await tenant.mutation(api.housingRequests.create, {
      ...criteria,
      userId: ids.tenant,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const args = {
      requestId,
      listingId: ids.listing,
      message: "Our home is available for your stay.",
    };
    const first = await owner.mutation(api.housingRequests.reply, args);
    expect(await owner.mutation(api.housingRequests.reply, args)).toBe(first);
    const messages = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      senderId: ids.owner,
      receiverId: ids.tenant,
      listingId: ids.listing,
    });
    const conversations = await tenant.query(api.messages.getConversations, {
      userId: ids.tenant,
    });
    expect(conversations[0]._id).toBe(first);
    expect(conversations[0].tenantRead).toBe(false);
    expect(
      await stranger.query(api.messages.getMessages, {
        conversationId: messages[0].conversationId,
      }),
    ).toEqual([]);
    await expect(
      tenant.mutation(api.messages.sendMessage, {
        senderId: ids.tenant,
        receiverId: ids.stranger,
        listingId: ids.listing,
        content: "Wrong owner",
      }),
    ).rejects.toThrow("property owner");
  });

  it("rechecks dates, budget, listing state and request state before an owner can respond", async () => {
    const { t, ids, tenant, owner, criteria } = await fixture();
    const requestId = await tenant.mutation(api.housingRequests.create, {
      ...criteria,
      userId: ids.tenant,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const args = { requestId, listingId: ids.listing, message: "Available" };
    const blockId = await t.run((ctx) =>
      ctx.db.insert("availabilityBlocks", {
        listingId: ids.listing,
        startDate: start + DAY,
        endDate: start + 2 * DAY,
        type: "booked",
        createdAt: 0,
      }),
    );
    await expect(
      owner.mutation(api.housingRequests.reply, args),
    ).rejects.toThrow("no longer matches");
    expect(
      (
        await owner.query(api.housingRequests.matchingProperties, {
          requestId,
          paginationOpts,
        })
      ).page.map((p) => p.listingId),
    ).not.toContain(ids.listing);
    await owner.mutation(api.availability.removeBlock, { id: blockId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run((ctx) => ctx.db.patch(ids.listing, { price: 9999 }));
    await expect(
      owner.mutation(api.housingRequests.reply, args),
    ).rejects.toThrow("no longer matches");
    await t.run((ctx) =>
      ctx.db.patch(ids.listing, { price: 1800, status: "inactive" }),
    );
    await expect(
      owner.mutation(api.housingRequests.reply, args),
    ).rejects.toThrow("no longer matches");
    await t.run((ctx) => ctx.db.patch(ids.listing, { status: "active" }));
    await tenant.mutation(api.housingRequests.close, { id: requestId });
    await expect(
      owner.mutation(api.housingRequests.reply, args),
    ).rejects.toThrow("no longer matches");
  });

  it("only shares a phone when consent and verified ownership are both present", async () => {
    const { t, ids, tenant, owner, criteria } = await fixture();
    await tenant.mutation(api.housingRequests.create, {
      ...criteria,
      contactPreference: "phone",
      userId: ids.tenant,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await owner.query(api.housingRequests.inbox, { paginationOpts })).page[0]
        .phone,
    ).toBe("+15555550123");
    await t.run((ctx) => ctx.db.patch(ids.tenant, { phoneVerified: false }));
    expect(
      (await owner.query(api.housingRequests.inbox, { paginationOpts })).page[0]
        .phone,
    ).toBeNull();
    await expect(
      tenant.mutation(api.housingRequests.create, {
        ...criteria,
        contactPreference: "phone",
        userId: ids.tenant,
      }),
    ).rejects.toThrow("Verify your phone");
  });

  it("scans past the first page and delivers newly matching properties after a listing update", async () => {
    const { t, ids, tenant, owner, criteria } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.listing, { price: 5000 });
      await ctx.db.patch(ids.second, { price: 5000 });
      for (let i = 0; i < 85; i++)
        await ctx.db.insert("listings", {
          ...ids.data,
          city: i === 84 ? "Austin" : "Dallas",
          title: `Fixture ${i}`,
        });
    });
    const requestId = await tenant.mutation(api.housingRequests.create, {
      ...criteria,
      userId: ids.tenant,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const mine = await tenant.query(api.housingRequests.getMine, {
      paginationOpts,
    });
    expect(mine.page[0]).toMatchObject({
      matchedProperties: 1,
      matchingStatus: "complete",
    });
    await owner.mutation(api.listings.update, { id: ids.listing, price: 1800 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (
        await owner.query(api.housingRequests.matchingProperties, {
          requestId,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(2);
    expect(
      (await owner.query(api.housingRequests.inbox, { paginationOpts })).page,
    ).toHaveLength(1);
  });

  it("allows agencies to create separate traveler requests atomically with independent dates", async () => {
    const { t, ids, tenant, criteria } = await fixture();
    const args = {
      ...criteria,
      userId: ids.tenant,
      agencyName: "Test staffing",
      travelers: [
        {
          name: "Traveler A",
          moveInDate: start,
          moveOutDate: end,
          workplace: "Hospital A",
        },
        {
          name: "Traveler B",
          moveInDate: start + 90 * DAY,
          moveOutDate: start + 120 * DAY,
          workplace: "Hospital B",
        },
      ],
    };
    const created = await tenant.mutation(
      api.housingRequests.createAgency,
      args,
    );
    expect(created).toHaveLength(2);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const requests = (
      await tenant.query(api.housingRequests.getMine, { paginationOpts })
    ).page;
    expect(requests.map((r) => r.travelerName).sort()).toEqual([
      "Traveler A",
      "Traveler B",
    ]);
    expect(
      requests.find((r) => r.travelerName === "Traveler B")?.moveInDate,
    ).toBe(start + 90 * DAY);
    await expect(
      tenant.mutation(api.housingRequests.createAgency, {
        ...args,
        travelers: [
          args.travelers[0],
          { ...args.travelers[1], moveOutDate: start },
        ],
      }),
    ).rejects.toThrow();
    expect(
      (await tenant.query(api.housingRequests.getMine, { paginationOpts }))
        .page,
    ).toHaveLength(2);
  });

  it("rejects spoofing, invalid dates and malformed criteria and supports fulfilled requests", async () => {
    const { t, ids, tenant, criteria } = await fixture();
    await expect(
      tenant.mutation(api.housingRequests.create, {
        ...criteria,
        userId: ids.owner,
      }),
    ).rejects.toThrow();
    for (const bad of [
      { maxBudget: -1 },
      { duration: 0 },
      { moveOutDate: start + DAY },
      { nearbyCities: Array.from({ length: 6 }, (_, i) => `City ${i}`) },
      { state: "Invalid" },
    ]) {
      await expect(
        tenant.mutation(api.housingRequests.create, {
          ...criteria,
          ...bad,
          userId: ids.tenant,
        }),
      ).rejects.toThrow();
    }
    const id = await tenant.mutation(api.housingRequests.create, {
      ...criteria,
      userId: ids.tenant,
    });
    await tenant.mutation(api.housingRequests.markFulfilled, { id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await tenant.query(api.housingRequests.getMine, { paginationOpts }))
        .page[0].status,
    ).toBe("fulfilled");
    expect(
      await t.run((ctx) => ctx.db.query("housingRequestDeliveries").collect()),
    ).toEqual([]);
  });
  it("honors owner occupancy rules and allows owners to clear that optional rule", async () => {
    const { t, ids, tenant, owner, criteria } = await fixture();
    await owner.mutation(api.listings.update, {
      id: ids.listing,
      maxOccupancy: 1,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (
        await t.query(api.housingRequests.preview, {
          ...criteria,
          paginationOpts,
        })
      ).page.map((p) => p.listingId),
    ).not.toContain(ids.listing);
    await expect(
      tenant.mutation(api.inquiries.create, {
        listingId: ids.listing,
        moveIn: start,
        moveOut: end,
        occupants: 2,
        pets: false,
        message: "Two people",
      }),
    ).rejects.toThrow("occupancy");
    await owner.mutation(api.listings.update, {
      id: ids.listing,
      maxOccupancy: null,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (
        await t.query(api.housingRequests.preview, {
          ...criteria,
          paginationOpts,
        })
      ).page.map((p) => p.listingId),
    ).toContain(ids.listing);
    await expect(
      owner.mutation(api.listings.update, { id: ids.listing, maxOccupancy: 0 }),
    ).rejects.toThrow();
  });

  it("records email delivery only after provider acceptance and uses an idempotency key", async () => {
    const { t, ids, tenant, owner, criteria } = await fixture();
    vi.stubEnv("RESEND_API_KEY", "re_fixture");
    vi.stubEnv("EMAIL_FROM", "requests@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    const send = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "fixture-email" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", send);
    try {
      await tenant.mutation(api.housingRequests.create, {
        ...criteria,
        userId: ids.tenant,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const deliveryId = (
        await owner.query(api.housingRequests.inbox, { paginationOpts })
      ).page[0].deliveryId;
      expect((await t.run((ctx) => ctx.db.get(deliveryId)))?.emailStatus).toBe(
        "sent",
      );
      expect(send).toHaveBeenCalledTimes(1);
      const body = JSON.parse(send.mock.calls[0][1].body);
      expect(body.to).toBe("owner@example.test");
      expect(body.text).toContain(
        "https://app.example.test/dashboard/landlord/requests",
      );
      expect(send.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(
        `housing-request-${deliveryId}`,
      );
      await t.action(internal.housingRequestEmails.notifyOwner, { deliveryId });
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("records provider failures without presenting them as delivered", async () => {
    const { t, ids, tenant, owner, criteria } = await fixture();
    vi.stubEnv("RESEND_API_KEY", "re_fixture");
    vi.stubEnv("EMAIL_FROM", "requests@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Provider unavailable")),
    );
    try {
      await tenant.mutation(api.housingRequests.create, {
        ...criteria,
        userId: ids.tenant,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const deliveryId = (
        await owner.query(api.housingRequests.inbox, { paginationOpts })
      ).page[0].deliveryId;
      expect((await t.run((ctx) => ctx.db.get(deliveryId)))?.emailStatus).toBe(
        "failed",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
