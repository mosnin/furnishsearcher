import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import type { FunctionReturnType } from "convex/server";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 24);
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
async function fixture(count = 125) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string) =>
      ctx.db.insert("users", {
        clerkId,
        role: "landlord",
        name: clerkId,
        email: clerkId + "@example.test",
        createdAt: now,
      });
    const user = await make("member"),
      other = await make("other"),
      stranger = await make("stranger");
    const conversations = [];
    for (let i = 0; i < count; i++) {
      const landlordId = i % 2 ? user : other,
        tenantId = i % 2 ? other : user;
      const listingId = await ctx.db.insert("listings", {
        landlordId,
        title: `Synthetic ${i}`,
        description: "Synthetic only",
        address: "Private",
        city: "Austin",
        state: "TX",
        zip: "78701",
        price: 1000,
        bedrooms: 1,
        bathrooms: 1,
        propertyType: "House",
        amenities: [],
        photos: [],
        petFriendly: false,
        utilitiesIncluded: true,
        parkingIncluded: false,
        availableFrom: 0,
        minStay: 1,
        status: "inactive",
        views: 0,
        createdAt: now,
      });
      const key = [tenantId, landlordId].sort().join("_") + "_" + listingId;
      const id = await ctx.db.insert("conversations", {
        listingId,
        tenantId,
        landlordId,
        key,
        lastMessage: `Synthetic message ${i}`,
        lastMessageAt: now + i,
        tenantRead: i % 4 !== 0,
        landlordRead: i % 4 !== 1,
        ...(i % 3 === 0
          ? { tenantArchived: true, landlordArchived: true }
          : {}),
      });
      conversations.push({
        id,
        listingId,
        key,
        archived: i % 3 === 0,
        unread: i % 4 < 2,
        time: now + i,
      });
    }
    return { user, other, stranger, conversations };
  });
  const member = t.withIdentity({ subject: "member" }),
    other = t.withIdentity({ subject: "other" }),
    stranger = t.withIdentity({ subject: "stranger" });
  const finish = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const migrate = async () => {
    await t.mutation(internal.inbox.backfill, {});
    await finish();
  };
  const all = async (
    folder: "all" | "unread" | "archived" | "blocked",
    client = member,
  ) => {
    const rows = [];
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      const result: FunctionReturnType<typeof api.inbox.list> =
        await client.query(api.inbox.list, {
          folder,
          paginationOpts: { cursor, numItems: 17 },
        });
      rows.push(...result.page);
      if (result.isDone) return rows;
      cursor = result.continueCursor;
    }
    throw new Error("Pagination did not finish");
  };
  return { t, ids, member, other, stranger, migrate, finish, all };
}
it("backfills all legacy mixed-role conversations in bounded pages and maintains exact folder totals", async () => {
  const { t, ids, member, migrate, all } = await fixture();
  expect((await member.query(api.inbox.summary, {})).ready).toBe(false);
  await migrate();
  const active = await all("all"),
    archived = await all("archived"),
    unread = await all("unread");
  expect(active.map((c) => c._id)).toEqual(
    ids.conversations
      .filter((c) => !c.archived)
      .reverse()
      .map((c) => c.id),
  );
  expect(archived).toHaveLength(
    ids.conversations.filter((c) => c.archived).length,
  );
  expect(unread).toHaveLength(
    ids.conversations.filter((c) => !c.archived && c.unread).length,
  );
  expect(new Set([...active, ...archived].map((c) => c._id)).size).toBe(125);
  const summary = await member.query(api.inbox.summary, {});
  expect(summary).toMatchObject({
    ready: true,
    inbox: active.length,
    archived: archived.length,
    unread: unread.length,
    blocked: 0,
  });
  expect(summary.recent.map((c) => c._id)).toEqual(
    active.slice(0, 6).map((c) => c._id),
  );
  await migrate();
  expect(await member.query(api.inbox.summary, {})).toEqual(summary);
  expect(
    await t.run(
      async (ctx) => (await ctx.db.query("conversationInbox").take(300)).length,
    ),
  ).toBe(250);
});
it("caps page work, keeps direct links independent of loaded pages and refuses unrelated reads", async () => {
  const { t, ids, member, stranger, migrate } = await fixture();
  await migrate();
  const page = await member.query(api.inbox.list, {
    folder: "all",
    paginationOpts: { cursor: null, numItems: 1000 },
  });
  expect(page.page.length).toBeLessThanOrEqual(30);
  expect(page.isDone).toBe(false);
  const oldest = ids.conversations[0];
  expect(page.page.some((c) => c._id === oldest.id)).toBe(false);
  expect(
    (await member.query(api.inbox.conversation, { id: oldest.id }))?._id,
  ).toBe(oldest.id);
  expect(
    await stranger.query(api.inbox.conversation, { id: oldest.id }),
  ).toBeNull();
  expect(
    await member.query(api.inbox.conversation, { id: "invalid-link" }),
  ).toBeNull();
  expect(
    (
      await stranger.query(api.inbox.list, {
        folder: "all",
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).page,
  ).toEqual([]);
  await expect(
    t.query(api.inbox.list, {
      folder: "all",
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("sign in");
});
it("moves every affected property on block and suppresses stale main-folder results immediately", async () => {
  const { ids, member, other, migrate, finish, all } = await fixture();
  await migrate();
  const otherBefore = await other.query(api.inbox.summary, {});
  await member.mutation(api.messages.setBlocked, {
    conversationId: ids.conversations[0].id,
    blocked: true,
  });
  expect((await member.query(api.inbox.summary, {})).ready).toBe(false);
  expect(await all("all")).toEqual([]);
  await finish();
  expect(await all("blocked")).toHaveLength(125);
  expect(await member.query(api.inbox.summary, {})).toMatchObject({
    ready: true,
    inbox: 0,
    unread: 0,
    archived: 0,
    blocked: 125,
  });
  expect((await other.query(api.inbox.summary, {})).inbox).toBe(
    otherBefore.inbox,
  );
  expect(
    (await other.query(api.inbox.conversation, { id: ids.conversations[0].id }))
      ?.cannotMessage,
  ).toBe(true);
  await member.mutation(api.messages.unblockUser, { userId: ids.other });
  await finish();
  expect(await all("blocked")).toHaveLength(0);
  expect(await all("all")).toHaveLength(83);
});
it("fences rapid block/unblock jobs by generation and preserves a counterparty's own block", async () => {
  const { t, ids, member, other, migrate, finish, all } = await fixture(65);
  await migrate();
  await member.mutation(api.messages.setBlocked, {
    conversationId: ids.conversations[0].id,
    blocked: true,
  });
  await member.mutation(api.messages.setBlocked, {
    conversationId: ids.conversations[0].id,
    blocked: false,
  });
  await other.mutation(api.messages.setBlocked, {
    conversationId: ids.conversations[0].id,
    blocked: true,
  });
  expect(await t.mutation(internal.inbox.retryPending, {})).toBe(2);
  await finish();
  expect(await all("blocked")).toHaveLength(0);
  expect((await member.query(api.inbox.summary, {})).ready).toBe(true);
  expect(
    (
      await member.query(api.inbox.conversation, {
        id: ids.conversations[0].id,
      })
    )?.cannotMessage,
  ).toBe(true);
  expect((await other.query(api.inbox.summary, {})).blocked).toBe(65);
  expect(await t.mutation(internal.inbox.retryPending, {})).toBe(0);
});
it("updates unread/archive counts atomically, reopens on a new message and does not count send retries twice", async () => {
  const { ids, member, other, migrate, finish } = await fixture(2);
  await migrate();
  const c = ids.conversations[1];
  await member.mutation(api.messages.setArchived, {
    conversationId: c.id,
    archived: true,
  });
  expect(await member.query(api.inbox.summary, {})).toMatchObject({
    inbox: 0,
    archived: 2,
    unread: 0,
  });
  vi.advanceTimersByTime(1000);
  const args = {
    senderId: ids.other,
    receiverId: ids.user,
    listingId: c.listingId,
    content: "Synthetic follow-up",
    clientRequestId: crypto.randomUUID(),
    origin: "inbox" as const,
  };
  const message = await other.mutation(api.messages.sendMessage, args);
  await other.mutation(api.messages.sendMessage, args);
  expect(await member.query(api.inbox.summary, {})).toMatchObject({
    inbox: 1,
    archived: 1,
    unread: 1,
  });
  await member.mutation(api.messages.markRead, {
    userId: ids.user,
    conversationId: c.key,
    throughMessageId: message,
  });
  expect((await member.query(api.inbox.summary, {})).unread).toBe(0);
  await member.mutation(api.messages.setUnread, { conversationId: c.id });
  expect((await member.query(api.inbox.summary, {})).unread).toBe(1);
  await finish();
});
it("backfill reads current state and never overwrites a message written mid-migration", async () => {
  const { t, ids, member, other, finish } = await fixture(95);
  await t.mutation(internal.inbox.backfill, {});
  const c = ids.conversations[94];
  vi.advanceTimersByTime(1000);
  await other.mutation(api.messages.sendMessage, {
    senderId: ids.other,
    receiverId: ids.user,
    listingId: c.listingId,
    content: "Current message after migration starts",
  });
  await member.mutation(api.messages.setArchived, {
    conversationId: c.id,
    archived: true,
  });
  await finish();
  expect(await member.query(api.inbox.summary, {})).toMatchObject({
    ready: true,
  });
  const conv = await member.query(api.inbox.conversation, { id: c.id });
  expect(conv?.lastMessage).toBe("Current message after migration starts");
  expect(conv?.archived).toBe(true);
  const rows = await t.run((ctx) =>
    ctx.db
      .query("conversationInbox")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", c.id).eq("userId", ids.user),
      )
      .take(10),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].folder).toBe("archived");
});
