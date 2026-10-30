import { seedPublishedFixtures } from "./helpers/publication";
import { convexTest } from "convex-test";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  send.mockReset();
});
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const create = (clerkId: string, role: "tenant" | "landlord" | "admin") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: `${clerkId}@example.test`,
        createdAt: 0,
      });
    const owner = await create("owner", "landlord"),
      tenant = await create("tenant", "tenant"),
      stranger = await create("stranger", "tenant"),
      admin = await create("admin", "admin");
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Original property title",
      description: "Synthetic property",
      address: "Private address",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 2000,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: 0,
      minStay: 1,
      status: "active",
      createdAt: 0,
      views: 0,
    });
    const message = await ctx.db.insert("messages", {
      conversationId: "synthetic-conversation",
      senderId: owner,
      receiverId: tenant,
      listingId: listing,
      content: "Suspicious message to preserve",
      read: false,
      createdAt: 0,
    });
    return { owner, tenant, stranger, admin, listing, message };
  });
  await seedPublishedFixtures(t);
  return {
    t,
    ids,
    tenant: t.withIdentity({ subject: "tenant" }),
    owner: t.withIdentity({ subject: "owner" }),
    stranger: t.withIdentity({ subject: "stranger" }),
    staff: t.withIdentity({ subject: "admin" }),
  };
}
const paginationOpts = { cursor: null, numItems: 20 };
const contact = {
  name: "Traveler",
  email: "traveler@example.test",
  subject: "Technical Issue",
  message: "Please help with my account.",
};
const reportDetails = {
  category: "Safety or privacy concern",
  details: "Please review the property information.",
};

describe("support cases and reports", () => {
  it("persists anonymous contact without granting ownership by email or case id", async () => {
    const { t, tenant, staff } = await setup();
    const id = await t.mutation(api.support.submitContact, {
      ...contact,
      email: "tenant@example.test",
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("open");
    expect(
      (await tenant.query(api.support.mine, { paginationOpts })).page,
    ).toHaveLength(0);
    await expect(t.query(api.support.get, { id })).rejects.toThrow("sign in");
    await expect(tenant.query(api.support.get, { id })).rejects.toThrow(
      "not found",
    );
    expect((await staff.query(api.support.get, { id })).email).toBe(
      "tenant@example.test",
    );
    await expect(
      tenant.query(api.support.queue, { paginationOpts }),
    ).rejects.toThrow("Staff");
    await expect(
      t.mutation(api.support.submitContact, { ...contact, email: "invalid" }),
    ).rejects.toThrow("email");
    await expect(
      t.mutation(api.support.submitContact, { ...contact, message: "tiny" }),
    ).rejects.toThrow("Message");
    await expect(
      t.mutation(api.support.submitContact, {
        ...contact,
        message: "x".repeat(5001),
      }),
    ).rejects.toThrow("Message");
    for (let i = 0; i < 5; i++)
      await t.mutation(api.support.submitContact, contact);
    await expect(
      t.mutation(api.support.submitContact, contact),
    ).rejects.toThrow("Too many");
  });
  it("routes the legacy contact action through saved cases and requires complete signed-in profiles", async () => {
    const { t, tenant } = await setup();
    const id = await tenant.action(api.emails.sendContactEmail, contact);
    expect((await tenant.query(api.support.get, { id })).userId).toBeDefined();
    await expect(
      t
        .withIdentity({ subject: "missing-profile" })
        .mutation(api.support.submitContact, contact),
    ).rejects.toThrow("profile");
    await expect(
      t.action(api.emails.sendContactEmail, {
        ...contact,
        subject: "Injected subject",
      }),
    ).rejects.toThrow("supported subject");
  });
  it("tracks signed-in contacts and keeps case replies private including staff notes", async () => {
    const { tenant, stranger, staff, t } = await setup();
    const id = await tenant.mutation(api.support.submitContact, contact);
    const privateReply = await staff.mutation(api.support.reply, {
      id,
      body: "Private investigation note",
      internal: true,
    });
    const publicReply = await staff.mutation(api.support.reply, {
      id,
      body: "Please tell us more.",
      internal: false,
    });
    expect(
      (
        await tenant.query(api.support.replies, { id, paginationOpts })
      ).page.map((r) => r._id),
    ).toEqual([publicReply]);
    expect(
      (await staff.query(api.support.replies, { id, paginationOpts })).page.map(
        (r) => r._id,
      ),
    ).toContain(privateReply);
    await expect(stranger.query(api.support.get, { id })).rejects.toThrow(
      "not found",
    );
    await expect(
      stranger.mutation(api.support.reply, {
        id,
        body: "Intrusion",
        internal: false,
      }),
    ).rejects.toThrow("not found");
    await expect(
      tenant.mutation(api.support.reply, {
        id,
        body: "Hidden",
        internal: true,
      }),
    ).rejects.toThrow("Staff");
    await expect(
      tenant.query(api.support.audit, { id, paginationOpts }),
    ).rejects.toThrow("Staff");
    await staff.mutation(api.support.review, {
      id,
      status: "resolved",
      note: "Resolved after checking",
    });
    await tenant.mutation(api.support.reply, {
      id,
      body: "This still needs help",
      internal: false,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("open");
    expect(
      (await tenant.query(api.support.mine, { paginationOpts })).page.map(
        (c) => c._id,
      ),
    ).toEqual([id]);
    expect(
      (await staff.query(api.support.audit, { id, paginationOpts })).page.map(
        (a) => a.action,
      ),
    ).toEqual(["reopened", "resolved"]);
  });
  it("validates report targets, deduplicates open reports and preserves private evidence after deletion", async () => {
    const { tenant, staff, owner, stranger, ids, t } = await setup();
    const args = { ...reportDetails, listingId: ids.listing };
    await expect(owner.mutation(api.support.report, args)).rejects.toThrow(
      "own property",
    );
    await expect(t.mutation(api.support.report, args)).rejects.toThrow(
      "sign in",
    );
    await expect(
      tenant.mutation(api.support.report, { ...args, messageId: ids.message }),
    ).rejects.toThrow("one report target");
    const msgId = await tenant.mutation(api.support.report, {
      ...reportDetails,
      messageId: ids.message,
    });
    await expect(
      stranger.mutation(api.support.report, {
        ...reportDetails,
        messageId: ids.message,
      }),
    ).rejects.toThrow("received messages");
    await expect(
      owner.mutation(api.support.report, {
        ...reportDetails,
        messageId: ids.message,
      }),
    ).rejects.toThrow("received messages");
    const id = await tenant.mutation(api.support.report, args);
    expect(id).not.toBe(msgId);
    expect(await tenant.mutation(api.support.report, args)).toBe(id);
    expect(
      await tenant.mutation(api.support.report, {
        ...reportDetails,
        messageId: ids.message,
      }),
    ).toBe(msgId);
    expect(
      (await tenant.query(api.support.get, { id })).evidence,
    ).toBeUndefined();
    await expect(owner.query(api.support.get, { id })).rejects.toThrow(
      "not found",
    );
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.message);
      await ctx.db.delete(ids.listing);
    });
    expect((await staff.query(api.support.get, { id })).evidence).toContain(
      "Original property title",
    );
    expect(
      (await staff.query(api.support.get, { id: msgId })).evidence,
    ).toContain("Suspicious message to preserve");
  });
  it("audits staff moderation holds and prevents owner or admin publish until released", async () => {
    const { tenant, staff, owner, ids, t } = await setup();
    const id = await tenant.mutation(api.support.report, {
      ...reportDetails,
      listingId: ids.listing,
    });
    await expect(
      owner.mutation(api.support.review, {
        id,
        status: "dismissed",
        note: "Hide my report",
      }),
    ).rejects.toThrow("Staff");
    await expect(
      staff.mutation(api.support.review, { id, status: "reviewing", note: "" }),
    ).rejects.toThrow("note");
    await staff.mutation(api.support.review, {
      id,
      status: "reviewing",
      note: "Investigating property",
      listingAction: "hold",
    });
    expect((await t.run((ctx) => ctx.db.get(ids.listing)))?.status).toBe(
      "inactive",
    );
    expect(await t.query(api.listings.getById, { id: ids.listing })).toBeNull();
    expect(
      await t.query(api.listings.getByLandlord, { landlordId: ids.owner }),
    ).toEqual([]);
    expect(
      await owner.query(api.listings.getByLandlord, { landlordId: ids.owner }),
    ).toHaveLength(1);
    expect(
      await tenant.query(api.listings.getById, { id: ids.listing }),
    ).toBeNull();
    expect(
      (await owner.query(api.listings.getById, { id: ids.listing }))
        ?.moderationHold,
    ).toBe(true);
    await expect(
      owner.mutation(api.listings.publish, { id: ids.listing }),
    ).rejects.toThrow("staff review");
    await expect(
      staff.mutation(api.listings.publish, { id: ids.listing }),
    ).rejects.toThrow("staff review");
    await expect(
      staff.mutation(api.listings.approveListing, { id: ids.listing }),
    ).rejects.toThrow("staff review");
    await staff.mutation(api.support.review, {
      id,
      status: "resolved",
      note: "Review completed",
      listingAction: "release",
    });
    expect((await t.run((ctx) => ctx.db.get(ids.listing)))?.status).toBe(
      "inactive",
    );
    await owner.mutation(api.listings.publish, { id: ids.listing });
    expect((await t.run((ctx) => ctx.db.get(ids.listing)))?.status).toBe(
      "active",
    );
    expect(
      (await t.query(api.listings.getById, { id: ids.listing }))?.landlord,
    ).not.toHaveProperty("email");
    const audit = await staff.query(api.support.audit, { id, paginationOpts });
    expect(audit.page.map((a) => a.action)).toEqual([
      "resolved:listing_release",
      "reviewing:listing_hold",
    ]);
  });
  it("paginates case and reply history without leaking other users or internal notes", async () => {
    const { tenant, staff, stranger, t, ids } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 45; i++)
        await ctx.db.insert("supportCases", {
          name: contact.name,
          email: contact.email,
          subject: contact.subject,
          body: contact.message,
          kind: "support",
          userId: i < 25 ? ids.tenant : ids.stranger,
          status: "open",
          createdAt: i,
          updatedAt: i,
          notificationStatus: "unconfigured",
        });
    });
    const first = await tenant.query(api.support.mine, { paginationOpts });
    const next = await tenant.query(api.support.mine, {
      paginationOpts: { ...paginationOpts, cursor: first.continueCursor },
    });
    expect(first.page).toHaveLength(20);
    expect(next.page).toHaveLength(5);
    expect(next.isDone).toBe(true);
    expect(
      (await stranger.query(api.support.mine, { paginationOpts })).page,
    ).toHaveLength(20);
    const q = await staff.query(api.support.queue, {
      status: "open",
      paginationOpts,
    });
    expect(q.isDone).toBe(false);
    const id = first.page[0]._id;
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++)
        await ctx.db.insert("supportReplies", {
          caseId: id,
          authorId: ids.admin,
          staff: true,
          internal: i % 2 === 0,
          body: "Test note",
          createdAt: i,
        });
    });
    const r = await tenant.query(api.support.replies, { id, paginationOpts });
    const r2 = await tenant.query(api.support.replies, {
      id,
      paginationOpts: { ...paginationOpts, cursor: r.continueCursor },
    });
    expect(r.page).toHaveLength(20);
    expect(r2.page).toHaveLength(5);
    expect(r2.page.every((r) => !r.internal)).toBe(true);
  });
});

describe("support notification delivery", () => {
  function configure() {
    vi.stubEnv("RESEND_API_KEY", "synthetic");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.stubEnv("SUPPORT_EMAIL", "support@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  }
  it("keeps cases saved when email is unconfigured and retries with provider acceptance", async () => {
    const { t, staff } = await setup();
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await t.mutation(api.support.submitContact, contact);
    await t.action(internal.supportEmails.notifyStaff, { id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.notificationStatus).toBe(
      "unconfigured",
    );
    configure();
    await staff.mutation(api.support.retryEmail, { id });
    send.mockResolvedValue({ data: { id: "synthetic-email" }, error: null });
    await t.action(internal.supportEmails.notifyStaff, { id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.notificationStatus).toBe(
      "sent",
    );
    expect(send.mock.calls[0][0].to).toBe("support@example.test");
    expect(send.mock.calls[0][0].text).not.toContain(contact.message);
    expect(send.mock.calls[0][1].idempotencyKey).toBe(`support-${id}`);
    await t.action(internal.supportEmails.notifyStaff, { id });
    expect(send).toHaveBeenCalledTimes(1);
    await expect(
      staff.mutation(api.support.retryEmail, { id }),
    ).rejects.toThrow("already sent");
  });
  it("tracks actual reply failure, preserves private notes and separates staff follow-up notifications", async () => {
    const { tenant, staff, t } = await setup();
    configure();
    const id = await tenant.mutation(api.support.submitContact, contact);
    const note = await staff.mutation(api.support.reply, {
      id,
      body: "Never email this private note",
      internal: true,
    });
    await t.action(internal.supportEmails.sendReply, { replyId: note });
    expect(send).not.toHaveBeenCalled();
    const replyId = await staff.mutation(api.support.reply, {
      id,
      body: "Here is the support response.",
      internal: false,
    });
    send.mockResolvedValue({
      data: null,
      error: { message: "Provider refused" },
    });
    await t.action(internal.supportEmails.sendReply, { replyId });
    expect((await t.run((ctx) => ctx.db.get(replyId)))?.emailStatus).toBe(
      "failed",
    );
    await expect(
      tenant.mutation(api.support.retryEmail, { id, replyId }),
    ).rejects.toThrow("Staff");
    await staff.mutation(api.support.retryEmail, { id, replyId });
    send.mockResolvedValue({ data: { id: "accepted" }, error: null });
    await t.action(internal.supportEmails.sendReply, { replyId });
    expect((await t.run((ctx) => ctx.db.get(replyId)))?.emailStatus).toBe(
      "sent",
    );
    expect(send.mock.calls[1][0].to).toBe(contact.email);
    expect(send.mock.calls[1][0].text).toContain(
      "Here is the support response.",
    );
    const followup = await tenant.mutation(api.support.reply, {
      id,
      body: "Confidential followup",
      internal: false,
    });
    await t.action(internal.supportEmails.sendReply, { replyId: followup });
    expect(send.mock.calls[2][0].to).toBe("support@example.test");
    expect(send.mock.calls[2][0].text).not.toContain("Confidential followup");
  });
});

async function contactFixture() {
  const f = await setup();
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("CLERK_CONTACT_MODE", "test");
  const now = Date.now(),
    DAY = 86400000,
    moveInDate = (Math.floor(now / DAY) + 60) * DAY;
  await f.t.run(async (ctx) => {
    for (const id of [f.ids.owner, f.ids.tenant])
      await ctx.db.patch(id, {
        phone: "+12025550123",
        phoneVerified: true,
        phoneVerificationSource: "clerk",
        phoneVerificationMode: "test",
        phoneVerifiedAt: now,
        phoneVerificationExpiresAt: now + 30 * DAY,
        phoneRevision: 1,
        notificationEmail: `${id}@example.test`,
        notificationEmailMode: "test",
        notificationEmailVerifiedAt: now,
        notificationEmailExpiresAt: now + 30 * DAY,
        housingLeadEmailsEnabled: id === f.ids.owner,
        messageEmailsEnabled: true,
      });
  });
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  const requestId = await f.tenant.mutation(api.housingRequests.create, {
    userId: f.ids.tenant,
    city: "Austin",
    state: "TX",
    moveInDate,
    duration: 1,
    bedrooms: 1,
    maxBudget: 2500,
    petFriendly: false,
    description: "Synthetic contact review request",
    contactPreference: "phone",
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const messageId = await f.tenant.mutation(api.messages.sendMessage, {
    senderId: f.ids.tenant,
    receiverId: f.ids.owner,
    listingId: f.ids.listing,
    content: "Synthetic reportable message",
    origin: "inbox",
  });
  const report = () =>
    f.owner.mutation(api.support.report, { messageId, ...reportDetails });
  const caseId = await report();
  const review = async (action: "hold" | "release", id = caseId) => {
    const info = await f.staff.query(api.support.get, { id });
    return f.staff.mutation(api.support.review, {
      id,
      status: "reviewing",
      note: `Synthetic contact ${action}`,
      contactAction: action,
      expectedContactRevision: info.contactReview!.revision,
    });
  };
  return { ...f, requestId, messageId, caseId, review };
}
describe("case-bound account contact reviews", () => {
  it("requires staff action and pauses native contact in both directions while keeping readable history and support", async () => {
    const f = await contactFixture();
    const conv = (
      await f.owner.query(api.messages.getConversations, {
        userId: f.ids.owner,
      })
    )[0];
    expect(conv.cannotMessage).toBe(false);
    expect(
      (
        await f.owner.query(api.housingRequests.leadContact, {
          requestId: f.requestId,
          listingId: f.ids.listing,
        })
      ).phone,
    ).toBe("+12025550123");
    expect(
      (
        await f.tenant.query(api.phoneContacts.availability, {
          listingId: f.ids.listing,
        })
      ).status,
    ).toBe("available");
    const requestBefore = await f.t.run((ctx) => ctx.db.get(f.requestId));
    await f.review("hold");
    for (const [caller, senderId, receiverId] of [
      [f.owner, f.ids.owner, f.ids.tenant],
      [f.tenant, f.ids.tenant, f.ids.owner],
    ] as const)
      await expect(
        caller.mutation(api.messages.sendMessage, {
          senderId,
          receiverId,
          listingId: f.ids.listing,
          content: "Must not send",
        }),
      ).rejects.toThrow("unavailable");
    await expect(
      f.owner.mutation(api.housingRequests.reply, {
        requestId: f.requestId,
        listingId: f.ids.listing,
        message: "Must not send",
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      f.owner.query(api.housingRequests.matchingProperties, {
        requestId: f.requestId,
        paginationOpts,
      }),
    ).rejects.toThrow("unavailable");
    const inbox = await f.owner.query(api.housingRequests.inbox, {
      paginationOpts,
    });
    expect(inbox.page[0].contactRestricted).toBe(true);
    expect(inbox.page[0].phone).toBeNull();
    expect(
      (
        await f.owner.query(api.housingRequests.leadContact, {
          requestId: f.requestId,
          listingId: f.ids.listing,
        })
      ).phone,
    ).toBeNull();
    expect(
      (
        await f.tenant.query(api.phoneContacts.availability, {
          listingId: f.ids.listing,
        })
      ).status,
    ).toBe("unavailable");
    await expect(
      f.tenant.mutation(api.phoneContacts.reveal, { listingId: f.ids.listing }),
    ).rejects.toThrow("unavailable");
    const held = (
      await f.owner.query(api.messages.getConversations, {
        userId: f.ids.owner,
      })
    )[0];
    expect(held.contactRestricted).toBe(true);
    expect(held.cannotMessage).toBe(true);
    expect(
      (
        await f.tenant.query(api.messages.listMessages, {
          conversationId: conv._id,
          paginationOpts,
        })
      ).page.some((m) => m._id === f.messageId),
    ).toBe(true);
    const appeal = await f.tenant.mutation(api.support.submitContact, {
      ...contact,
      subject: "Technical Issue",
      message: "Please review the contact restriction.",
    });
    expect((await f.tenant.query(api.support.get, { id: appeal })).userId).toBe(
      f.ids.tenant,
    );
    expect(await f.t.run((ctx) => ctx.db.get(f.requestId))).toEqual(
      requestBefore,
    );
    await f.review("release");
    expect(
      (
        await f.owner.query(api.housingRequests.leadContact, {
          requestId: f.requestId,
          listingId: f.ids.listing,
        })
      ).phone,
    ).toBe("+12025550123");
    expect(
      (
        await f.tenant.query(api.phoneContacts.availability, {
          listingId: f.ids.listing,
        })
      ).status,
    ).toBe("available");
    await f.owner.mutation(api.messages.sendMessage, {
      senderId: f.ids.owner,
      receiverId: f.ids.tenant,
      listingId: f.ids.listing,
      content: "Contact restored",
    });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("enforces staff authority, private targets and notes, and guards stale review revisions", async () => {
    const f = await contactFixture();
    const action = {
      id: f.caseId,
      status: "reviewing" as const,
      note: "Private investigation",
      contactAction: "hold" as const,
      expectedContactRevision: 0,
    };
    for (const caller of [f.owner, f.tenant, f.stranger])
      await expect(caller.mutation(api.support.review, action)).rejects.toThrow(
        "Staff",
      );
    const requester = await f.owner.query(api.support.get, { id: f.caseId });
    expect(requester.contactReview).toBeUndefined();
    expect(requester.reportedUserId).toBeUndefined();
    expect(requester.evidence).toBeUndefined();
    await expect(
      f.tenant.query(api.support.get, { id: f.caseId }),
    ).rejects.toThrow("not found");
    await f.staff.mutation(api.support.review, action);
    await expect(
      f.staff.mutation(api.support.review, {
        ...action,
        contactAction: "release",
      }),
    ).rejects.toThrow("changed");
    const state = await f.staff.query(api.support.get, { id: f.caseId });
    expect(state.contactReview).toMatchObject({
      userId: f.ids.tenant,
      restricted: true,
      caseRestricted: true,
      revision: 1,
    });
    expect(
      (await f.staff.query(api.support.audit, { id: f.caseId, paginationOpts }))
        .page[0].action,
    ).toContain("contact_hold");
    await expect(
      f.owner.query(api.support.audit, { id: f.caseId, paginationOpts }),
    ).rejects.toThrow("Staff");
    await f.review("release");
    expect(
      (await f.staff.query(api.support.get, { id: f.caseId })).contactReview
        ?.revision,
    ).toBe(2);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("requires every active case restriction to be released and preserves independent user blocks", async () => {
    const f = await contactFixture();
    const next = await f.tenant.mutation(api.messages.sendMessage, {
      senderId: f.ids.tenant,
      receiverId: f.ids.owner,
      listingId: f.ids.listing,
      content: "Second reported event",
    });
    const otherCase = await f.owner.mutation(api.support.report, {
      messageId: next,
      ...reportDetails,
    });
    await f.review("hold");
    await f.review("hold", otherCase);
    await f.review("release");
    expect(
      (await f.staff.query(api.support.get, { id: f.caseId })).contactReview,
    ).toMatchObject({ restricted: true, caseRestricted: false });
    const conv = (
      await f.owner.query(api.messages.getConversations, {
        userId: f.ids.owner,
      })
    )[0];
    await f.owner.mutation(api.messages.setBlocked, {
      conversationId: conv._id,
      blocked: true,
    });
    await f.review("release", otherCase);
    const released = (
      await f.owner.query(api.messages.getConversations, {
        userId: f.ids.owner,
      })
    )[0];
    expect(released.contactRestricted).toBe(false);
    expect(released.blockedByMe).toBe(true);
    expect(released.cannotMessage).toBe(true);
    expect(
      (await f.owner.query(api.housingRequests.inbox, { paginationOpts })).page,
    ).toEqual([]);
    await f.owner.mutation(api.messages.setBlocked, {
      conversationId: conv._id,
      blocked: false,
    });
    expect(
      (await f.owner.query(api.housingRequests.inbox, { paginationOpts }))
        .page[0].contactRestricted,
    ).toBe(false);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("keeps the original reported-account binding after source changes or deletion and never trusts evidence JSON", async () => {
    const f = await contactFixture();
    await f.t.run((ctx) =>
      ctx.db.patch(f.messageId, { senderId: f.ids.stranger }),
    );
    expect(
      (await f.staff.query(api.support.get, { id: f.caseId })).contactReview
        ?.userId,
    ).toBe(f.ids.tenant);
    await f.t.run((ctx) => ctx.db.delete(f.messageId));
    await f.review("hold");
    expect(
      (await f.staff.query(api.support.get, { id: f.caseId })).contactReview
        ?.restricted,
    ).toBe(true);
    await f.review("release");
    await f.t.run((ctx) =>
      ctx.db.patch(f.caseId, {
        reportedUserId: undefined,
        evidence: JSON.stringify({ senderId: f.ids.stranger }),
      }),
    );
    expect(
      (await f.staff.query(api.support.get, { id: f.caseId })).contactReview,
    ).toBeUndefined();
    await expect(
      f.staff.mutation(api.support.review, {
        id: f.caseId,
        status: "reviewing",
        note: "Invalid evidence binding",
        contactAction: "hold",
        expectedContactRevision: 2,
      }),
    ).rejects.toThrow("no reviewable");
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("supports surviving legacy report sources but rejects ordinary support, staff and deleted-account targets", async () => {
    const f = await contactFixture();
    await f.t.run((ctx) =>
      ctx.db.patch(f.caseId, { reportedUserId: undefined }),
    );
    await f.review("hold");
    await f.review("release");
    const general = await f.owner.mutation(api.support.submitContact, contact);
    await expect(
      f.staff.mutation(api.support.review, {
        id: general,
        status: "reviewing",
        note: "No report target",
        contactAction: "hold",
        expectedContactRevision: 0,
      }),
    ).rejects.toThrow("no reviewable");
    for (const target of [f.ids.admin, f.ids.tenant]) {
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.caseId, { reportedUserId: target });
        if (target === f.ids.tenant)
          await ctx.db.patch(target, { clerkDeletedAt: Date.now() });
      });
      await expect(
        f.staff.mutation(api.support.review, {
          id: f.caseId,
          status: "reviewing",
          note: "Invalid account target",
          contactAction: "hold",
          expectedContactRevision: 2,
        }),
      ).rejects.toThrow("no reviewable");
    }
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("suppresses pending direct and lead notifications before provider claim without changing preferences", async () => {
    const f = await contactFixture();
    const delivery = (
      await f.owner.query(api.housingRequests.inbox, { paginationOpts })
    ).page[0];
    await f.t.run((ctx) =>
      ctx.db.patch(delivery.deliveryId, {
        emailStatus: "queued",
        emailGeneration: 10,
        emailSelectionStartedAt: Date.now(),
        notificationListingId: f.ids.listing,
      }),
    );
    expect(
      await f.t.query(internal.housingRequests.notificationDetails, {
        deliveryId: delivery.deliveryId,
      }),
    ).not.toBeNull();
    expect(
      (
        await f.t.query(internal.messages.notificationDetails, {
          messageId: f.messageId,
        })
      )?.suppressed,
    ).toBe(false);
    await f.review("hold");
    expect(
      (
        await f.t.query(internal.messages.notificationDetails, {
          messageId: f.messageId,
        })
      )?.suppressed,
    ).toBe(true);
    expect(
      await f.t.query(internal.housingRequests.notificationDetails, {
        deliveryId: delivery.deliveryId,
      }),
    ).toBeNull();
    expect(
      await f.t.mutation(internal.leadNotifications.prepareSend, {
        deliveryId: delivery.deliveryId,
        generation: 10,
        configured: true,
      }),
    ).toBeNull();
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.ids.owner)))
        ?.housingLeadEmailsEnabled,
    ).toBe(true);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("does not resurrect an owner-deleted lead when review is released or leak a held owner's phone to anonymous viewers", async () => {
    const f = await contactFixture();
    const ownerCase = await f.tenant.mutation(api.support.report, {
      listingId: f.ids.listing,
      ...reportDetails,
    });
    expect(
      (
        await f.t.query(api.phoneContacts.availability, {
          listingId: f.ids.listing,
        })
      ).status,
    ).toBe("sign-in");
    await f.review("hold", ownerCase);
    expect(
      (
        await f.t.query(api.phoneContacts.availability, {
          listingId: f.ids.listing,
        })
      ).status,
    ).toBe("unavailable");
    const item = (
      await f.owner.query(api.housingRequests.inbox, { paginationOpts })
    ).page[0];
    expect(item.contactRestricted).toBe(true);
    await f.owner.mutation(api.housingRequests.deleteLead, {
      deliveryId: item.deliveryId,
    });
    await f.review("release", ownerCase);
    await f.t.mutation(internal.housingRequests.scanRequest, {
      requestId: f.requestId,
      cursor: null,
    });
    expect(
      (await f.owner.query(api.housingRequests.inbox, { paginationOpts })).page,
    ).toEqual([]);
    expect(
      (
        await f.t.query(api.phoneContacts.availability, {
          listingId: f.ids.listing,
        })
      ).status,
    ).toBe("sign-in");
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
