import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
import { conversationKey } from "../convex/lib/messageAccess";
import {
  responseBand,
  typicalResponse,
  RESPONSE_DAY as DAY,
  responseWindow,
} from "../lib/responsiveness";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2026, 9, 25, 12);
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
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (clerkId: string, role: "landlord" | "tenant") =>
      ctx.db.insert("users", {
        clerkId,
        name: clerkId,
        email: `${clerkId}@example.test`,
        role,
        createdAt: now,
      });
    const owner = await user("response-owner", "landlord"),
      tenant = await user("response-tenant", "tenant"),
      other = await user("response-other", "tenant");
    const fields = {
      landlordId: owner,
      title: "Synthetic response rental",
      description: "Synthetic only",
      city: "Austin",
      state: "TX",
      zip: "78701",
      address: "Private synthetic address",
      price: 1800,
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
      status: "active" as const,
      createdAt: now,
      views: 0,
    };
    return {
      owner,
      tenant,
      other,
      listing: await ctx.db.insert("listings", fields),
      second: await ctx.db.insert("listings", fields),
    };
  });
  await seedPublishedFixtures(t);
  await t.mutation(internal.responsiveness.backfill, {});
  const owner = t.withIdentity({ subject: "response-owner" }),
    tenant = t.withIdentity({ subject: "response-tenant" }),
    other = t.withIdentity({ subject: "response-other" });
  const send = (
    fromOwner = false,
    listingId = ids.listing,
    content = "Synthetic private response",
  ) =>
    (fromOwner ? owner : tenant).mutation(api.messages.sendMessage, {
      senderId: fromOwner ? ids.owner : ids.tenant,
      receiverId: fromOwner ? ids.tenant : ids.owner,
      listingId,
      content,
      origin: "inbox",
    });
  const report = (listingId = ids.listing) =>
    owner.query(api.responsiveness.report, { listingId });
  return { t, ids, owner, tenant, other, send, report };
}
async function historical(
  f: Awaited<ReturnType<typeof setup>>,
  startedAt: number,
  replyAt?: number,
  origin: "inbox" | "email" | null = "inbox",
  fromOwner = false,
) {
  return f.t.run(async (ctx) => {
    const tenantId = await ctx.db.insert("users", {
      clerkId: `history-${startedAt}-${Math.random()}`,
      role: "tenant",
      name: "Synthetic traveler",
      email: "history@example.test",
      createdAt: startedAt,
    });
    const key = conversationKey(tenantId, f.ids.owner, f.ids.listing);
    const conv = await ctx.db.insert("conversations", {
      listingId: f.ids.listing,
      landlordId: f.ids.owner,
      tenantId,
      key,
      lastMessage: "Native history",
      lastMessageAt: replyAt ?? startedAt,
      tenantRead: true,
      landlordRead: false,
    });
    const insert = (
      senderId: Id<"users">,
      receiverId: Id<"users">,
      createdAt: number,
      origin?: "inbox" | "email" | null,
    ) =>
      ctx.db.insert("messages", {
        listingId: f.ids.listing,
        conversationId: key,
        conversationDocId: conv,
        senderId,
        receiverId,
        content: "Synthetic native history",
        read: false,
        createdAt,
        ...(origin ? { origin } : {}),
      });
    await insert(
      fromOwner ? f.ids.owner : tenantId,
      fromOwner ? tenantId : f.ids.owner,
      startedAt,
      origin,
    );
    if (replyAt !== undefined)
      await insert(f.ids.owner, tenantId, replyAt, "inbox");
    return conv;
  });
}
async function rebuild(f: Awaited<ReturnType<typeof setup>>) {
  await f.t.run(async (ctx) => {
    const state = await ctx.db.query("responseTrackingState").first();
    await ctx.db.patch(state!._id, { complete: false, cursor: null });
  });
  return f.t.mutation(internal.responsiveness.backfill, {});
}
describe("measured first-conversation response rate", () => {
  it("counts one traveler start and one first app reply, including the exact 24-hour boundary and retries", async () => {
    const f = await setup();
    const request = {
      senderId: f.ids.tenant,
      receiverId: f.ids.owner,
      listingId: f.ids.listing,
      content: "First traveler message",
      origin: "inbox" as const,
      clientRequestId: "11111111-1111-4111-8111-111111111111",
    };
    const first = await f.tenant.mutation(api.messages.sendMessage, request);
    expect(await f.tenant.mutation(api.messages.sendMessage, request)).toBe(
      first,
    );
    await f.send(false, f.ids.listing, "Traveler follow-up");
    expect(await f.report()).toMatchObject({
      received: 1,
      onTime: 0,
      percent: 0,
      grade: "Poor",
      canReset: true,
      typical: null,
    });
    vi.setSystemTime(now + DAY);
    await f.send(true);
    vi.setSystemTime(now + 2 * DAY);
    await f.send(true, f.ids.listing, "Owner follow-up");
    expect(await f.report()).toMatchObject({
      received: 1,
      onTime: 1,
      replied: 1,
      percent: 100,
      typical: "Typically within a day",
      canReset: false,
    });
  });
  it("keeps percentages private and emits only a measured per-listing public band", async () => {
    const f = await setup();
    await f.send();
    vi.setSystemTime(now + 25 * 3600000);
    await f.send(true);
    expect(await f.report()).toMatchObject({
      onTime: 0,
      replied: 1,
      percent: 0,
      typical: "Typically within a few days",
    });
    expect(
      await f.t.query(api.responsiveness.publicTime, {
        listingId: f.ids.listing,
      }),
    ).toEqual({ label: "Typically within a few days" });
    await expect(
      f.other.query(api.responsiveness.report, { listingId: f.ids.listing }),
    ).rejects.toThrow("Not authorized");
    await expect(
      f.t.query(api.responsiveness.report, { listingId: f.ids.listing }),
    ).rejects.toThrow("sign in");
    await f.owner.mutation(api.listings.unpublish, { id: f.ids.listing });
    expect(
      await f.t.query(api.responsiveness.publicTime, {
        listingId: f.ids.listing,
      }),
    ).toBeNull();
    expect((await f.report()).received).toBe(1);
  });
  it("counts an inquiry's first text once and does not count acceptance as a human reply", async () => {
    const f = await setup();
    const id = await f.tenant.mutation(api.inquiries.create, {
      listingId: f.ids.listing,
      moveIn: Math.floor(now / DAY) * DAY + 5 * DAY,
      moveOut: Math.floor(now / DAY) * DAY + 36 * DAY,
      occupants: 1,
      pets: false,
      message: "Synthetic inquiry text",
    });
    await f.owner.mutation(api.inquiries.respond, { id, decision: "accepted" });
    expect(await f.report()).toMatchObject({
      received: 1,
      onTime: 0,
      replied: 0,
    });
    await f.send(true);
    expect(await f.report()).toMatchObject({
      received: 1,
      onTime: 1,
      replied: 1,
    });
  });
  it("excludes owner-started conversations and housing leads; clients cannot spoof a housing origin", async () => {
    const f = await setup();
    await f.send(true);
    await f.send();
    expect((await f.report()).received).toBe(0);
    await expect(
      f.other.mutation(api.messages.sendMessage, {
        senderId: f.ids.other,
        receiverId: f.ids.owner,
        listingId: f.ids.listing,
        content: "Spoof lead",
        origin: "housing_request",
      }),
    ).rejects.toThrow("native request binding");
    const conv = await historical(f, now - DAY, now - DAY + 1, "inbox", true);
    await rebuild(f);
    const row = await f.t.run((ctx) =>
      ctx.db
        .query("responseThreads")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv))
        .unique(),
    );
    expect(row?.qualification).toBe("excluded");
    expect((await f.report()).received).toBe(0);
  });
  it("uses all current 90 UTC days and falls back to exactly the last three older conversations", async () => {
    const f = await setup();
    const start = responseWindow(now);
    for (let i = 1; i <= 5; i++)
      await historical(
        f,
        start - i * DAY,
        i === 1 ? start - DAY + 3600000 : undefined,
      );
    await rebuild(f);
    expect(await f.report()).toMatchObject({
      received: 3,
      onTime: 1,
      basis: "last_three",
      typical: null,
    });
    await historical(f, start, start + 2 * 3600000);
    await rebuild(f);
    expect(await f.report()).toMatchObject({
      received: 1,
      onTime: 1,
      basis: "90_days",
      typical: "Typically within 8 hours",
    });
  });
  it("resets all account rental-space rates exactly once without erasing messages or public response-time history", async () => {
    const f = await setup();
    await f.send();
    await f.send(false, f.ids.second);
    vi.setSystemTime(now + 2 * DAY);
    await f.send(true);
    const before = await f.t.run((ctx) => ctx.db.query("messages").collect());
    await expect(
      f.other.mutation(api.responsiveness.reset, {
        listingId: f.ids.listing,
        confirmAllRentalSpaces: true,
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      f.owner.mutation(api.responsiveness.reset, {
        listingId: f.ids.listing,
        confirmAllRentalSpaces: false,
      }),
    ).rejects.toThrow("Confirm");
    await f.owner.mutation(api.responsiveness.reset, {
      listingId: f.ids.listing,
      confirmAllRentalSpaces: true,
    });
    expect(await f.report()).toMatchObject({
      received: 0,
      percent: null,
      grade: "Fresh Start",
      typical: "Typically within a few days",
      resetUsed: true,
    });
    expect((await f.report(f.ids.second)).received).toBe(0);
    await f.send(true, f.ids.second); // Replying to an old conversation cannot restart the rate.
    expect((await f.report(f.ids.second)).received).toBe(0);
    expect(
      (await f.t.run((ctx) => ctx.db.query("messages").collect())).length,
    ).toBe(before.length + 1);
    await f.other.mutation(api.messages.sendMessage, {
      senderId: f.ids.other,
      receiverId: f.ids.owner,
      listingId: f.ids.listing,
      content: "New post-reset conversation",
      origin: "property",
    });
    expect((await f.report()).received).toBe(1);
    await expect(
      f.owner.mutation(api.responsiveness.reset, {
        listingId: f.ids.listing,
        confirmAllRentalSpaces: true,
      }),
    ).rejects.toThrow("already been used");
  });
  it("denies resets with no measured traffic or a rate at least 75%", async () => {
    const f = await setup();
    await expect(
      f.owner.mutation(api.responsiveness.reset, {
        listingId: f.ids.listing,
        confirmAllRentalSpaces: true,
      }),
    ).rejects.toThrow("below 75");
    await f.send();
    await f.send(true);
    await expect(
      f.owner.mutation(api.responsiveness.reset, {
        listingId: f.ids.listing,
        confirmAllRentalSpaces: true,
      }),
    ).rejects.toThrow("below 75");
  });
  it("adopts native history in recoverable bounded pages and withholds metrics until complete", async () => {
    const f = await setup();
    for (let i = 0; i < 56; i++)
      await historical(f, now - DAY - i, now - DAY - i + 1);
    const page = await rebuild(f);
    expect(page).toEqual({ complete: false, examined: 25 });
    expect(await f.report()).toMatchObject({
      ready: false,
      percent: null,
      typical: null,
    });
    await f.t.mutation(internal.responsiveness.backfill, {});
    await f.t.mutation(internal.responsiveness.backfill, {});
    expect(await f.report()).toMatchObject({
      ready: true,
      received: 56,
      onTime: 56,
    });
    await f.t.mutation(internal.responsiveness.backfill, {});
    expect((await f.report()).received).toBe(56);
  });
  it("does not infer legacy first-message sources, timestamps or owner email replies", async () => {
    const f = await setup();
    await historical(f, now - DAY, now - DAY + 1, null);
    await historical(f, now - DAY - 1, now - DAY, "email");
    await rebuild(f);
    expect(await f.report()).toMatchObject({
      received: 0,
      percent: null,
      hasUnmeasuredHistory: true,
      typical: null,
    });
    const first = await f.send();
    await f.t.run(async (ctx) => {
      const msg = (await ctx.db.get(first))!;
      await ctx.db.insert("messages", {
        listingId: f.ids.listing,
        conversationId: msg.conversationId,
        conversationDocId: msg.conversationDocId,
        senderId: f.ids.owner,
        receiverId: f.ids.tenant,
        createdAt: now,
        origin: "email",
        read: false,
        content: "Synthetic native authenticated email",
      });
    });
    expect((await f.report()).onTime).toBe(0);
    await f.send(true);
    expect((await f.report()).onTime).toBe(1);
  });
  it("keeps each unit independent and failed blocked sends cannot establish a reply", async () => {
    const f = await setup();
    await f.send();
    await f.send(false, f.ids.second);
    await f.send(true, f.ids.second);
    expect((await f.report()).percent).toBe(0);
    expect((await f.report(f.ids.second)).percent).toBe(100);
    await f.owner.mutation(api.messages.setBlocked, {
      conversationId: (await f.t.run((ctx) =>
        ctx.db
          .query("conversations")
          .withIndex("by_listing_tenant", (q) =>
            q.eq("listingId", f.ids.listing).eq("tenantId", f.ids.tenant),
          )
          .unique(),
      ))!._id,
      blocked: true,
    });
    await expect(f.send(true)).rejects.toThrow("unavailable");
    expect((await f.report()).replied).toBe(0);
  });
  it("uses declared conservative median bands and exact inclusive boundaries", () => {
    expect(
      [3600000, 8 * 3600000, DAY, 3 * DAY, 7 * DAY, 7 * DAY + 1].map(
        responseBand,
      ),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(typicalResponse([0, 0, 0, 0, 0, 0])).toBeNull();
    expect(typicalResponse([1, 0, 0, 0, 0, 1])).toBe("More than a week");
  });
});
