import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  prepareMessageSearch,
  messageExcerpt,
  currentNameMatches,
} from "../lib/message-search";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 24),
  page = { cursor: null, numItems: 10 };
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
    const make = (
      clerkId: string,
      role: "tenant" | "landlord" | "admin",
      displayName?: string,
    ) =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId === "other" ? "HiddenRawName" : clerkId,
        displayName,
        email: `PRIVATE_${clerkId}@example.test`,
        createdAt: now,
      });
    const user = await make("owner", "landlord"),
      other = await make("other", "tenant", "TravelAlias"),
      stranger = await make("stranger", "landlord"),
      staff = await make("staff", "admin");
    const data = {
      landlordId: user,
      title: "Synthetic property",
      description: "Synthetic only",
      address: "PRIVATE_STREET",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 1500,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "House",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: now,
      minStay: 1,
      status: "inactive" as const,
      createdAt: now,
      views: 0,
    };
    const listing = await ctx.db.insert("listings", data),
      foreignListing = await ctx.db.insert("listings", {
        ...data,
        landlordId: stranger,
      });
    const key = [user, other].sort().join("_") + "_" + listing;
    const conv = await ctx.db.insert("conversations", {
      landlordId: user,
      tenantId: other,
      listingId: listing,
      key,
      lastMessage: "Newest parcel update",
      lastMessageAt: now + 69,
      tenantRead: true,
      landlordRead: false,
    });
    const foreignKey =
      [other, stranger].sort().join("_") + "_" + foreignListing;
    const foreignConv = await ctx.db.insert("conversations", {
      landlordId: stranger,
      tenantId: other,
      listingId: foreignListing,
      key: foreignKey,
      lastMessage: "Glimmer foreign",
      lastMessageAt: now,
      tenantRead: true,
      landlordRead: false,
    });
    const messages = [];
    for (let i = 0; i < 70; i++)
      messages.push(
        await ctx.db.insert("messages", {
          conversationId: key,
          ...(i ? { conversationDocId: conv } : {}),
          senderId: i % 2 ? user : other,
          receiverId: i % 2 ? other : user,
          listingId: listing,
          content: i
            ? `parcel update ${i}`
            : "padding ".repeat(90) + "Glimmer suitcase original detail",
          read: false,
          createdAt: now + i,
        }),
      );
    const foreignMessage = await ctx.db.insert("messages", {
      conversationId: foreignKey,
      conversationDocId: foreignConv,
      senderId: stranger,
      receiverId: other,
      listingId: foreignListing,
      content: "Glimmer foreign PRIVATE_MESSAGE",
      read: false,
      createdAt: now,
    });
    return {
      user,
      other,
      stranger,
      staff,
      listing,
      conv,
      messages,
      foreignConv,
      foreignMessage,
      data,
    };
  });
  const owner = t.withIdentity({ subject: "owner" }),
    other = t.withIdentity({ subject: "other" }),
    stranger = t.withIdentity({ subject: "stranger" }),
    staff = t.withIdentity({ subject: "staff" });
  const finish = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const migrate = async () => {
    await t.mutation(internal.inbox.backfill, {});
    await finish();
    await t.mutation(internal.messageSearch.backfillNames, {});
    await finish();
  };
  const people = async (query: string) => {
    const rows = [];
    let cursor: string | null = null;
    for (let i = 0; i < 30; i++) {
      const result: FunctionReturnType<typeof api.messageSearch.people> =
        await owner.query(api.messageSearch.people, {
          query,
          scope: "everywhere",
          paginationOpts: { cursor, numItems: 9 },
        });
      rows.push(...result.page);
      if (result.isDone) return rows;
      cursor = result.continueCursor;
    }
    throw new Error("People search did not finish");
  };
  return { t, ids, owner, other, stranger, staff, finish, migrate, people };
}
it("finds old saved message text beyond the newest page, resolves legacy keys and opens bounded nearby context", async () => {
  const { t, owner, ids } = await fixture();
  const latest = await owner.query(api.messages.listMessages, {
    conversationId: ids.conv,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(latest.page.some((message) => message._id === ids.messages[0])).toBe(
    false,
  );
  const hits = await owner.query(api.messageSearch.messages, {
    query: "glimmer",
    direction: "received",
    scope: "everywhere",
    paginationOpts: page,
  });
  expect(hits.page.map((hit) => hit.messageId)).toEqual([ids.messages[0]]);
  expect(hits.page[0].excerpt).toContain("Glimmer suitcase");
  expect(hits.page[0].excerpt.length).toBeLessThanOrEqual(322);
  const context = await owner.query(api.messageSearch.window, {
    conversationId: ids.conv,
    messageId: hits.page[0].messageId,
  });
  expect(context?.targetId).toBe(ids.messages[0]);
  expect(context!.messages.length).toBeLessThanOrEqual(51);
  expect(
    context?.messages.some((message) => message._id === ids.messages[0]),
  ).toBe(true);
  expect(
    context?.messages.some((message) => message._id === ids.foreignMessage),
  ).toBe(false);
  await owner.mutation(api.messages.markRead, {
    userId: ids.user,
    conversationId: [ids.user, ids.other].sort().join("_") + "_" + ids.listing,
    throughMessageId: context!.messages[0]._id,
  });
  expect((await t.run((ctx) => ctx.db.get(ids.messages[0])))?.read).toBe(true);
  expect((await t.run((ctx) => ctx.db.get(ids.messages[68])))?.read).toBe(
    false,
  );
});
it("pages every sent and received match without caps tied to the loaded conversation overview", async () => {
  const { owner, ids } = await fixture();
  const matches = [];
  for (const direction of ["sent", "received"] as const) {
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const result: FunctionReturnType<typeof api.messageSearch.messages> =
        await owner.query(api.messageSearch.messages, {
          query: "parcel",
          direction,
          scope: "everywhere",
          paginationOpts: { cursor, numItems: 7 },
        });
      matches.push(...result.page);
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
  }
  expect(matches).toHaveLength(69);
  expect(new Set(matches.map((hit) => hit.messageId)).size).toBe(69);
  expect(matches.every((hit) => hit.conversation._id === ids.conv)).toBe(true);
  const bounded = await owner.query(api.messageSearch.messages, {
    query: "parcel",
    direction: "sent",
    scope: "everywhere",
    paginationOpts: { cursor: null, numItems: 1000 },
  });
  expect(bounded.page.length).toBeLessThanOrEqual(20);
});
it("never discloses unrelated messages, forged associations, private profile fields or guessed match windows", async () => {
  const { t, ids, owner, stranger, staff } = await fixture();
  const search = {
    query: "glimmer",
    direction: "received" as const,
    scope: "everywhere" as const,
    paginationOpts: page,
  };
  expect(
    (await stranger.query(api.messageSearch.messages, search)).page,
  ).toEqual([]);
  expect((await staff.query(api.messageSearch.messages, search)).page).toEqual(
    [],
  );
  await expect(t.query(api.messageSearch.messages, search)).rejects.toThrow(
    "sign in",
  );
  await expect(
    stranger.query(api.messageSearch.window, {
      conversationId: ids.conv,
      messageId: ids.messages[0],
    }),
  ).rejects.toThrow();
  expect(
    await owner.query(api.messageSearch.window, {
      conversationId: ids.conv,
      messageId: ids.foreignMessage,
    }),
  ).toBeNull();
  const forged = await t.run((ctx) =>
    ctx.db.insert("messages", {
      conversationId: "wrong-key",
      conversationDocId: ids.conv,
      listingId: ids.listing,
      senderId: ids.other,
      receiverId: ids.user,
      content: "Glimmer forged source",
      createdAt: now,
      read: false,
    }),
  );
  const rows = (await owner.query(api.messageSearch.messages, search)).page;
  expect(rows.map((row) => row.messageId)).not.toContain(forged);
  expect(JSON.stringify(rows)).not.toContain("PRIVATE_");
});
it("searches archive and blocked history while applying current folder and messaging permissions", async () => {
  const { owner, ids, migrate, finish } = await fixture();
  await migrate();
  const args = {
    query: "glimmer",
    direction: "received" as const,
    paginationOpts: page,
  };
  await owner.mutation(api.messages.setArchived, {
    conversationId: ids.conv,
    archived: true,
  });
  expect(
    (await owner.query(api.messageSearch.messages, { ...args, scope: "all" }))
      .page,
  ).toHaveLength(0);
  expect(
    (
      await owner.query(api.messageSearch.messages, {
        ...args,
        scope: "archived",
      })
    ).page,
  ).toHaveLength(1);
  await owner.mutation(api.messages.setBlocked, {
    conversationId: ids.conv,
    blocked: true,
  });
  const hits = await owner.query(api.messageSearch.messages, {
    ...args,
    scope: "everywhere",
  });
  expect(hits.page).toHaveLength(1);
  expect(hits.page[0].conversation.cannotMessage).toBe(true);
  expect(
    (
      await owner.query(api.messageSearch.messages, {
        ...args,
        scope: "archived",
      })
    ).page,
  ).toHaveLength(0);
  expect(
    (
      await owner.query(api.messageSearch.messages, {
        ...args,
        scope: "blocked",
      })
    ).page,
  ).toHaveLength(1);
  await expect(
    owner.mutation(api.messages.sendMessage, {
      senderId: ids.user,
      receiverId: ids.other,
      listingId: ids.listing,
      content: "Blocked",
    }),
  ).rejects.toThrow("unavailable");
  await finish();
});
it("indexes the visible participant name, updates small profile changes synchronously and preserves totals", async () => {
  const { owner, other, ids, migrate, people } = await fixture();
  await migrate();
  expect((await people("TravelAlias")).map((conv) => conv._id)).toEqual([
    ids.conv,
  ]);
  expect(await people("HiddenRawName")).toEqual([]);
  expect(await people("PRIVATE_other")).toEqual([]);
  const before = await owner.query(api.inbox.summary, {});
  await other.mutation(api.users.updateProfile, {
    userId: ids.other,
    displayName: "NewAlias",
  });
  expect(await people("TravelAlias")).toEqual([]);
  expect(await people("NewAlias")).toHaveLength(1);
  expect((await people("NewAlias"))[0].otherUser?.name).toBe("NewAlias");
  const after = await owner.query(api.inbox.summary, {});
  expect(after.unread).toBe(before.unread);
  expect(after.inbox).toBe(before.inbox);
});
it("fences bulk name refreshes, suppresses removed names immediately and reports incomplete indexing", async () => {
  const { t, owner, other, ids, migrate, finish, people } = await fixture();
  await t.run(async (ctx) => {
    for (let i = 0; i < 64; i++) {
      const listingId = await ctx.db.insert("listings", {
        ...ids.data,
        title: `Synthetic extra ${i}`,
      });
      await ctx.db.insert("conversations", {
        listingId,
        landlordId: ids.user,
        tenantId: ids.other,
        lastMessage: "Synthetic only",
        lastMessageAt: now,
        tenantRead: true,
        landlordRead: false,
      });
    }
  });
  await migrate();
  expect(await people("TravelAlias")).toHaveLength(65);
  await other.mutation(api.users.updateProfile, {
    userId: ids.other,
    displayName: "IntermediateAlias",
  });
  await other.mutation(api.users.updateProfile, {
    userId: ids.other,
    displayName: "FinalAlias",
  });
  expect((await owner.query(api.messageSearch.status, {})).namesReady).toBe(
    false,
  );
  expect(await people("TravelAlias")).toEqual([]);
  expect(await t.mutation(internal.messageSearch.retryNames, {})).toBe(1);
  await finish();
  expect(await people("IntermediateAlias")).toEqual([]);
  expect(await people("FinalAlias")).toHaveLength(65);
  expect((await owner.query(api.messageSearch.status, {})).namesReady).toBe(
    true,
  );
  expect((await owner.query(api.inbox.summary, {})).unread).toBe(65);
});
it("includes new sends and idempotent retries transactionally in the original message index", async () => {
  const { owner, other, ids, migrate } = await fixture();
  await migrate();
  const args = {
    senderId: ids.user,
    receiverId: ids.other,
    listingId: ids.listing,
    content: "Freshsearch distinctive note",
    clientRequestId: crypto.randomUUID(),
  };
  const id = await owner.mutation(api.messages.sendMessage, args);
  expect(await owner.mutation(api.messages.sendMessage, args)).toBe(id);
  const hits = await other.query(api.messageSearch.messages, {
    query: "Freshsearch",
    direction: "received",
    scope: "everywhere",
    paginationOpts: page,
  });
  expect(hits.page.map((hit) => hit.messageId)).toEqual([id]);
});
it("bounds query syntax and excerpts without treating user text as markup or a regular expression", async () => {
  expect(prepareMessageSearch("  kettle  cable ").query).toBe("kettle cable");
  for (const query of [
    "",
    "   ",
    "***",
    "a".repeat(33),
    Array(17).fill("word").join(" "),
    "word ".repeat(41),
  ])
    expect(() => prepareMessageSearch(query)).toThrow();
  const excerpt = messageExcerpt(
    "padding ".repeat(100) + "Kettle <script>literal content</script>",
    "kett",
  );
  expect(excerpt).toContain("Kettle <script>");
  expect(excerpt.startsWith("…")).toBe(true);
  expect(currentNameMatches("Mary Smith", "smith")).toBe(true);
  expect(currentNameMatches("Mary Smith", "Mar")).toBe(true);
  expect(currentNameMatches("Mary Smith", "FormerName")).toBe(false);
  const { owner } = await fixture();
  await expect(
    owner.query(api.messageSearch.people, {
      query: "***",
      scope: "everywhere",
      paginationOpts: page,
    }),
  ).rejects.toThrow("Search with");
});
