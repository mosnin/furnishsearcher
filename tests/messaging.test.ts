import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  sendEmail.mockReset();
  vi.unstubAllEnvs();
});
const paginationOpts = { cursor: null, numItems: 20 };
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "tenant" | "landlord") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        phone: "PRIVATE_PHONE",
        createdAt: 0,
      });
    const owner = await make("owner", "landlord"),
      tenant = await make("tenant", "tenant"),
      other = await make("other", "tenant");
    const data = {
      landlordId: owner,
      title: "Synthetic home",
      description: "Fixture property",
      address: "Private address",
      city: "Austin",
      state: "TX",
      zip: "78701",
      bedrooms: 1,
      bathrooms: 1,
      price: 1900,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: 0,
      minStay: 1,
      status: "active" as const,
      createdAt: 0,
      views: 0,
    };
    const listing = await ctx.db.insert("listings", data),
      second = await ctx.db.insert("listings", {
        ...data,
        title: "Second home",
      });
    return { owner, tenant, other, listing, second };
  });
  const owner = t.withIdentity({ subject: "owner" }),
    tenant = t.withIdentity({ subject: "tenant" }),
    other = t.withIdentity({ subject: "other" });
  const args = {
    senderId: ids.tenant,
    receiverId: ids.owner,
    listingId: ids.listing,
    content: "Interested in your home",
    origin: "inbox" as const,
  };
  const messageId = await tenant.mutation(api.messages.sendMessage, args);
  const message = (await t.run((ctx) => ctx.db.get(messageId)))!;
  return {
    t,
    ids,
    owner,
    tenant,
    other,
    args,
    message,
    convId: message.conversationDocId!,
  };
}
describe("private messaging controls", () => {
  it("preserves private history, paginates messages, and projects only public participant details", async () => {
    const { t, tenant, owner, other, ids, convId, message } = await setup();
    await expect(
      other.query(api.messages.listMessages, {
        conversationId: convId,
        paginationOpts,
      }),
    ).rejects.toThrow("not found");
    await expect(
      other.mutation(api.messages.markRead, {
        conversationId: message.conversationId,
        userId: ids.other,
      }),
    ).rejects.toThrow("not found");
    expect(
      await other.query(api.messages.getMessages, {
        conversationId: message.conversationId,
      }),
    ).toEqual([]);
    expect(
      await tenant.query(api.messages.getMessages, {
        conversationId: "malformed",
      }),
    ).toEqual([]);
    const conversations = await tenant.query(api.messages.getConversations, {
      userId: ids.tenant,
    });
    expect(conversations[0].otherUser).not.toHaveProperty("email");
    expect(JSON.stringify(conversations)).not.toContain("PRIVATE_PHONE");
    expect(
      await tenant.query(api.messages.getConversations, { userId: ids.owner }),
    ).toEqual([]);
    await t.run(async (ctx) => {
      for (let i = 0; i < 110; i++)
        await ctx.db.insert("messages", {
          conversationId: message.conversationId,
          senderId: ids.tenant,
          receiverId: ids.owner,
          listingId: ids.listing,
          content: `Older history ${i}`,
          read: false,
          createdAt: i,
        });
    });
    let count = 0,
      cursor: string | null = null;
    for (;;) {
      const result: FunctionReturnType<typeof api.messages.listMessages> =
        await owner.query(api.messages.listMessages, {
          conversationId: convId,
          paginationOpts: { numItems: 20, cursor },
        });
      count += result.page.length;
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(count).toBe(111);
    expect(
      await owner.query(api.messages.getMessages, {
        conversationId: message.conversationId,
      }),
    ).toHaveLength(100);
  });
  it("blocks both directions across properties, preserves history, and only unblocks the caller's own decision", async () => {
    const { tenant, owner, other, ids, args, convId, t } = await setup();
    await expect(
      other.mutation(api.messages.setBlocked, {
        conversationId: convId,
        blocked: true,
      }),
    ).rejects.toThrow("not found");
    await tenant.mutation(api.messages.setBlocked, {
      conversationId: convId,
      blocked: true,
    });
    await tenant.mutation(api.messages.setBlocked, {
      conversationId: convId,
      blocked: true,
    });
    expect(
      await t.run((ctx) => ctx.db.query("userBlocks").collect()),
    ).toHaveLength(1);
    await expect(
      tenant.mutation(api.messages.sendMessage, args),
    ).rejects.toThrow("unavailable between");
    await expect(
      owner.mutation(api.messages.sendMessage, {
        ...args,
        senderId: ids.owner,
        receiverId: ids.tenant,
        listingId: ids.second,
      }),
    ).rejects.toThrow("unavailable between");
    expect(
      (
        await owner.query(api.messages.listMessages, {
          conversationId: convId,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1);
    expect(
      (await tenant.query(api.messages.blockedUsers, { paginationOpts })).page,
    ).toEqual([
      { userId: ids.owner, name: "owner", blockedAt: expect.any(Number) },
    ]);
    expect(
      (await owner.query(api.messages.blockedUsers, { paginationOpts })).page,
    ).toEqual([]);
    await owner.mutation(api.messages.unblockUser, { userId: ids.tenant });
    await expect(
      tenant.mutation(api.messages.sendMessage, args),
    ).rejects.toThrow("unavailable between");
    await owner.mutation(api.messages.setBlocked, {
      conversationId: convId,
      blocked: true,
    });
    await tenant.mutation(api.messages.unblockUser, { userId: ids.owner });
    await expect(
      tenant.mutation(api.messages.sendMessage, args),
    ).rejects.toThrow("unavailable between");
    await owner.mutation(api.messages.unblockUser, { userId: ids.tenant });
    await tenant.mutation(api.messages.sendMessage, args);
    expect(
      (
        await tenant.query(api.messages.getConversations, {
          userId: ids.tenant,
        })
      )[0].cannotMessage,
    ).toBe(false);
  });
  it("keeps archive/read reminders personal and brings new messages back to the inbox", async () => {
    const { tenant, owner, other, ids, convId, args, t, message } =
      await setup();
    await expect(
      other.mutation(api.messages.setArchived, {
        conversationId: convId,
        archived: true,
      }),
    ).rejects.toThrow("not found");
    await owner.mutation(api.messages.markRead, {
      conversationId: message.conversationId,
      userId: ids.owner,
      throughMessageId: message._id,
    });
    expect((await t.run((ctx) => ctx.db.get(message._id)))?.read).toBe(true);
    await owner.mutation(api.messages.setUnread, { conversationId: convId });
    expect((await t.run((ctx) => ctx.db.get(message._id)))?.read).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(convId)))?.landlordRead).toBe(
      false,
    );
    await owner.mutation(api.messages.setArchived, {
      conversationId: convId,
      archived: true,
    });
    expect(
      (
        await owner.query(api.messages.getConversations, { userId: ids.owner })
      )[0].archived,
    ).toBe(true);
    expect(
      (
        await tenant.query(api.messages.getConversations, {
          userId: ids.tenant,
        })
      )[0].archived,
    ).toBe(false);
    await tenant.mutation(api.messages.sendMessage, {
      ...args,
      content: "A new follow-up",
    });
    expect(
      (
        await owner.query(api.messages.getConversations, { userId: ids.owner })
      )[0].archived,
    ).toBe(false);
  });
  it("reads a bounded history through the viewed message and ignores stale continuation jobs", async () => {
    const { t, tenant, owner, args, message, convId, ids } = await setup();
    const inserted = await t.run(async (ctx) => {
      const result = [];
      for (let i = 0; i < 234; i++)
        result.push(
          await ctx.db.insert("messages", {
            conversationId: message.conversationId,
            senderId: ids.tenant,
            receiverId: ids.owner,
            listingId: ids.listing,
            content: "History",
            read: false,
            createdAt: i,
          }),
        );
      return result;
    });
    const through = (await t.run((ctx) => ctx.db.get(inserted[118])))!;
    await owner.mutation(api.messages.markRead, {
      conversationId: message.conversationId,
      userId: ids.owner,
      throughMessageId: through._id,
    });
    let conv = (await t.run((ctx) => ctx.db.get(convId)))!;
    const oldJob = {
      conversationId: convId,
      userId: ids.owner,
      cutoff: through._creationTime,
      generation: conv.landlordReadGeneration!,
    };
    expect(
      (await t.run((ctx) => ctx.db.query("messages").collect())).filter(
        (m) => m.read,
      ),
    ).toHaveLength(100);
    const newMessageId = await tenant.mutation(api.messages.sendMessage, {
      ...args,
      content: "Arrived after the read operation",
    });
    await t.mutation(internal.messages.continueRead, oldJob);
    expect(
      (await t.run((ctx) => ctx.db.query("messages").collect())).filter(
        (m) => m.read,
      ),
    ).toHaveLength(120);
    expect((await t.run((ctx) => ctx.db.get(newMessageId)))?.read).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(convId)))?.landlordRead).toBe(
      false,
    );
    await owner.mutation(api.messages.setUnread, { conversationId: convId });
    await t.mutation(internal.messages.continueRead, oldJob);
    expect((await t.run((ctx) => ctx.db.get(convId)))?.landlordRead).toBe(
      false,
    );
    await owner.mutation(api.messages.markRead, {
      conversationId: message.conversationId,
      userId: ids.owner,
      throughMessageId: newMessageId,
    });
    conv = (await t.run((ctx) => ctx.db.get(convId)))!;
    const latest = (await t.run((ctx) => ctx.db.get(newMessageId)))!;
    await t.mutation(internal.messages.continueRead, {
      ...oldJob,
      cutoff: latest._creationTime,
      generation: conv.landlordReadGeneration!,
    });
    expect(
      (await t.run((ctx) => ctx.db.query("messages").collect())).every(
        (m) => m.read,
      ),
    ).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(convId)))?.landlordRead).toBe(true);
  });
  it("finds legacy conversations without scanning and rejects read markers from another thread", async () => {
    const { t, tenant, owner, ids, args, message, convId } = await setup();
    await t.run((ctx) => ctx.db.patch(convId, { key: undefined }));
    await owner.mutation(api.messages.markRead, {
      conversationId: message.conversationId,
      userId: ids.owner,
    });
    expect((await t.run((ctx) => ctx.db.get(message._id)))?.read).toBe(true);
    const otherId = await tenant.mutation(api.messages.sendMessage, {
      ...args,
      listingId: ids.second,
    });
    await expect(
      owner.mutation(api.messages.markRead, {
        conversationId: message.conversationId,
        userId: ids.owner,
        throughMessageId: otherId,
      }),
    ).rejects.toThrow("does not belong");
  });
  it("deduplicates uncertain send retries transactionally without dropping identical intentional messages", async () => {
    const { tenant, t, args } = await setup();
    const id = "f6d42c7e-4c12-4c35-8c85-87534baad44f";
    const sent = await Promise.all([
      tenant.mutation(api.messages.sendMessage, {
        ...args,
        clientRequestId: id,
      }),
      tenant.mutation(api.messages.sendMessage, {
        ...args,
        clientRequestId: id,
      }),
    ]);
    expect(sent[0]).toBe(sent[1]);
    await expect(
      tenant.mutation(api.messages.sendMessage, {
        ...args,
        clientRequestId: id,
        content: "Changed content",
      }),
    ).rejects.toThrow("already used");
    await tenant.mutation(api.messages.sendMessage, {
      ...args,
      clientRequestId: "6622c5b8-29e8-4702-a719-8e25c9df2bbb",
    });
    expect(
      await t.run((ctx) => ctx.db.query("messages").collect()),
    ).toHaveLength(3);
  });
  it("enforces blocks for booking inquiries and matching owner replies/alerts", async () => {
    const { tenant, owner, ids, convId, t } = await setup();
    const start = Date.UTC(2027, 2, 1),
      end = start + 60 * 86400000;
    const requestId = await tenant.mutation(api.housingRequests.create, {
      userId: ids.tenant,
      city: "Austin",
      state: "TX",
      moveInDate: start,
      moveOutDate: end,
      duration: 2,
      maxBudget: 2000,
      bedrooms: 1,
      petFriendly: false,
      description: "Need a work rental",
    });
    await t.mutation(internal.housingRequests.scanRequest, {
      requestId,
      cursor: null,
    });
    const delivery = (
      await t.run((ctx) => ctx.db.query("housingRequestDeliveries").collect())
    )[0];
    await tenant.mutation(api.messages.setBlocked, {
      conversationId: convId,
      blocked: true,
    });
    await expect(
      tenant.mutation(api.inquiries.create, {
        listingId: ids.listing,
        moveIn: start,
        moveOut: end,
        occupants: 1,
        pets: false,
        message: "Bypass the block",
      }),
    ).rejects.toThrow("unavailable between");
    await expect(
      owner.mutation(api.housingRequests.reply, {
        requestId,
        listingId: ids.listing,
        message: "Bypass another way",
      }),
    ).rejects.toThrow("unavailable between");
    expect(
      (await owner.query(api.housingRequests.inbox, { paginationOpts })).page,
    ).toEqual([]);
    await t.action(internal.housingRequestEmails.notifyOwner, {
      deliveryId: delivery._id,
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await t.run((ctx) => ctx.db.get(delivery._id)))?.emailStatus).toBe(
      "suppressed",
    );
    const secondRequest = await tenant.mutation(api.housingRequests.create, {
      userId: ids.tenant,
      city: "Austin",
      state: "TX",
      moveInDate: start,
      moveOutDate: end,
      duration: 2,
      maxBudget: 2000,
      bedrooms: 1,
      petFriendly: false,
      description: "Another work stay",
    });
    await t.mutation(internal.housingRequests.scanRequest, {
      requestId: secondRequest,
      cursor: null,
    });
    const suppressedDelivery = await t.run((ctx) =>
      ctx.db
        .query("housingRequestDeliveries")
        .withIndex("by_requestId_and_landlordId", (q) =>
          q.eq("requestId", secondRequest).eq("landlordId", ids.owner),
        )
        .unique(),
    );
    expect(suppressedDelivery?.emailStatus).toBe("suppressed");
    await tenant.mutation(api.messages.unblockUser, { userId: ids.owner });
    expect(
      (await owner.query(api.housingRequests.inbox, { paginationOpts })).page,
    ).toHaveLength(2);
  });
});
describe("saved message composition", () => {
  it("persists private templates and signatures, enforces ten templates, and protects edits/deletion", async () => {
    const { tenant, owner, t } = await setup();
    const first = await tenant.mutation(api.messageTemplates.save, {
      name: "Welcome",
      body: "A reusable answer",
    });
    await expect(
      owner.mutation(api.messageTemplates.save, {
        id: first,
        name: "Hijacked",
        body: "No",
      }),
    ).rejects.toThrow("not found");
    await expect(
      owner.mutation(api.messageTemplates.remove, { id: first }),
    ).rejects.toThrow("not found");
    await expect(
      tenant.mutation(api.messageTemplates.save, {
        name: "welcome",
        body: "Duplicate name",
      }),
    ).rejects.toThrow("already uses");
    for (let i = 1; i < 10; i++)
      await tenant.mutation(api.messageTemplates.save, {
        name: `Template ${i}`,
        body: "Answer",
      });
    await expect(
      tenant.mutation(api.messageTemplates.save, {
        name: "Eleventh",
        body: "Answer",
      }),
    ).rejects.toThrow("10 templates");
    await tenant.mutation(api.messageTemplates.save, {
      id: first,
      name: "Updated",
      body: "Updated reusable answer",
    });
    await tenant.mutation(api.messageTemplates.saveSignature, {
      signature: "Thanks, Traveler",
    });
    const settings = await tenant.query(api.messageTemplates.getSettings, {});
    expect(settings.templates).toHaveLength(10);
    expect(settings.signature).toBe("Thanks, Traveler");
    expect(
      (await owner.query(api.messageTemplates.getSettings, {})).templates,
    ).toEqual([]);
    expect(
      (await owner.query(api.messageTemplates.getSettings, {})).signature,
    ).toBe("");
    await tenant.mutation(api.messageTemplates.remove, { id: first });
    await tenant.mutation(api.messageTemplates.saveSignature, {
      signature: "",
    });
    expect(
      (await tenant.query(api.messageTemplates.getSettings, {})).signature,
    ).toBe("");
    await expect(t.query(api.messageTemplates.getSettings, {})).rejects.toThrow(
      "sign in",
    );
  });
});
describe("message email notifications", () => {
  it("applies block guards to notifications already queued by older clients", async () => {
    const { t, owner, convId, message } = await setup();
    vi.stubEnv("RESEND_API_KEY", "synthetic");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    sendEmail.mockResolvedValue({
      data: { id: "legacy-accepted" },
      error: null,
    });
    const legacy = {
      toEmail: "owner@example.test",
      toName: "owner",
      fromName: "tenant",
      listingTitle: "Home",
      messagePreview: "Legacy queued message",
      conversationId: message.conversationId,
    };
    await owner.mutation(api.messages.setBlocked, {
      conversationId: convId,
      blocked: true,
    });
    await t.action(internal.emails.sendNewMessageNotification, legacy);
    expect(sendEmail).not.toHaveBeenCalled();
    await owner.mutation(api.messages.setBlocked, {
      conversationId: convId,
      blocked: false,
    });
    await t.action(internal.emails.sendNewMessageNotification, legacy);
    expect(sendEmail.mock.calls[0][0].html).toContain(
      `https://app.example.test/dashboard/messages?conv=${convId}`,
    );
    await t.action(internal.emails.sendNewMessageNotification, {
      ...legacy,
      toEmail: "unrelated@example.test",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("records configured provider outcomes and suppresses queued notifications after a block", async () => {
    const { t, owner, convId, message, tenant, args } = await setup();
    vi.stubEnv("RESEND_API_KEY", "");
    await t.action(internal.messageEmails.notify, { messageId: message._id });
    expect((await t.run((ctx) => ctx.db.get(message._id)))?.emailStatus).toBe(
      "unconfigured",
    );
    const blockedMessage = await tenant.mutation(
      api.messages.sendMessage,
      args,
    );
    await owner.mutation(api.messages.setBlocked, {
      conversationId: convId,
      blocked: true,
    });
    await t.action(internal.messageEmails.notify, {
      messageId: blockedMessage,
    });
    expect(
      (await t.run((ctx) => ctx.db.get(blockedMessage)))?.emailStatus,
    ).toBe("suppressed");
    expect(sendEmail).not.toHaveBeenCalled();
    await owner.mutation(api.messages.setBlocked, {
      conversationId: convId,
      blocked: false,
    });
    vi.stubEnv("RESEND_API_KEY", "synthetic");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    const accepted = await tenant.mutation(api.messages.sendMessage, args);
    sendEmail.mockResolvedValue({
      data: { id: "provider-accepted" },
      error: null,
    });
    await t.action(internal.messageEmails.notify, { messageId: accepted });
    expect((await t.run((ctx) => ctx.db.get(accepted)))?.emailStatus).toBe(
      "sent",
    );
    expect(sendEmail.mock.calls[0][0].text).toContain(`conv=${convId}`);
    expect(sendEmail.mock.calls[0][1].idempotencyKey).toBe(
      `listing-message-${accepted}`,
    );
    await t.action(internal.messageEmails.notify, { messageId: accepted });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const failed = await tenant.mutation(api.messages.sendMessage, args);
    sendEmail.mockResolvedValue({ data: null, error: { message: "Rejected" } });
    await t.action(internal.messageEmails.notify, { messageId: failed });
    expect((await t.run((ctx) => ctx.db.get(failed)))?.emailStatus).toBe(
      "failed",
    );
    expect((await t.run((ctx) => ctx.db.get(failed)))?.content).toBe(
      args.content,
    );
  });
});
