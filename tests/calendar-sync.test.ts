import { seedPublishedFixtures } from "./helpers/publication";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { fetchCalendar } from "../lib/calendar/fetch";
import { MAX_CALENDAR_BYTES } from "../lib/calendar/limits";
import { DAY } from "../lib/stays";

const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2026, 9, 24),
  start = Date.UTC(2027, 2, 1);
const airbnb =
  "https://www.airbnb.com/calendar/ical/fixture.ics?s=private-airbnb-token";
const vrbo =
  "https://www.vrbo.com/icalendar/fixture.ics?token=private-vrbo-token";
const calendar = (events: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Fixtures//EN\r\n${events}\r\nEND:VCALENDAR`;
const reservation = (date = "20270301", checkout = "20270310") =>
  calendar(
    `BEGIN:VEVENT\r\nUID:private-guest-id\r\nDTSTART;VALUE=DATE:${date}\r\nDTEND;VALUE=DATE:${checkout}\r\nSUMMARY:Secret Guest Name\r\nEND:VEVENT`,
  );
const respond = (text: string) =>
  new Response(text, {
    status: 200,
    headers: { "content-type": "text/calendar" },
  });

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkId: "owner",
      role: "landlord",
      name: "Owner",
      email: "owner@example.test",
      createdAt: 0,
    });
    const other = await ctx.db.insert("users", {
      clerkId: "other",
      role: "landlord",
      name: "Other",
      email: "other@example.test",
      createdAt: 0,
    });
    const data = {
      landlordId: owner,
      title: "Test home",
      description: "Synthetic fixture",
      city: "Austin",
      state: "TX",
      zip: "78701",
      address: "Private address",
      price: 1800,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: "House",
      amenities: [],
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
    const listingId = await ctx.db.insert("listings", data);
    const manualId = await ctx.db.insert("availabilityBlocks", {
      listingId,
      startDate: start + 50 * DAY,
      endDate: start + 55 * DAY,
      type: "booked",
      note: "Private manual note",
      createdAt: 0,
    });
    return { owner, other, listingId, manualId, data };
  });
  await seedPublishedFixtures(t);
  const provider = vi
    .fn()
    .mockImplementation(async () => respond(reservation()));
  vi.stubGlobal("fetch", provider);
  return {
    t,
    ids,
    owner: t.withIdentity({ subject: "owner" }),
    other: t.withIdentity({ subject: "other" }),
    provider,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("RESEND_API_KEY", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("linked calendar lifecycle", () => {
  it("protects feed credentials and imports occupied dates into search availability", async () => {
    const { t, ids, owner, other, provider } = await fixture();
    const feedId = await owner.mutation(api.calendarFeeds.link, {
      listingId: ids.listingId,
      provider: "airbnb",
      url: airbnb,
    });
    expect(
      (await t.run((ctx) => ctx.db.get(ids.listingId)))?.calendarSyncThrough,
    ).toBe(0);
    expect(
      await t.query(api.listings.search, {
        moveIn: start,
        moveOut: start + 30 * DAY,
      }),
    ).toEqual([]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(provider).toHaveBeenCalledTimes(1);
    const feeds = await owner.query(api.calendarFeeds.getByListing, {
      listingId: ids.listingId,
    });
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      _id: feedId,
      status: "synced",
      importedBlocks: 1,
    });
    expect(feeds[0].lastSyncedAt).toBeGreaterThanOrEqual(now);
    expect(feeds[0].lastSyncedAt).toBeLessThanOrEqual(Date.now());
    expect(JSON.stringify(feeds)).not.toContain("private-airbnb-token");
    await expect(
      other.query(api.calendarFeeds.getByListing, { listingId: ids.listingId }),
    ).rejects.toThrow();
    await expect(
      t.query(api.calendarFeeds.getByListing, { listingId: ids.listingId }),
    ).rejects.toThrow();
    const blocks = await t.query(api.availability.getByListing, {
      listingId: ids.listingId,
    });
    expect(
      blocks.every(
        (b) => b.note === undefined && b.calendarFeedId === undefined,
      ),
    ).toBe(true);
    expect(JSON.stringify(blocks)).not.toMatch(
      /Secret Guest|private-guest-id|private-airbnb-token|Private manual note/,
    );
    const owned = await owner.query(api.availability.getByListing, {
      listingId: ids.listingId,
    });
    expect(owned.find((b) => b.calendarFeedId === feedId)).toBeTruthy();
    expect(
      await t.query(api.listings.search, {
        moveIn: start,
        moveOut: start + 30 * DAY,
      }),
    ).toEqual([]);
    expect(
      await t.query(api.listings.search, {
        moveIn: start + 9 * DAY,
        moveOut: start + 39 * DAY,
      }),
    ).toHaveLength(1);
    expect(
      await t.query(api.listings.search, {
        moveIn: now + 800 * DAY,
        moveOut: now + 830 * DAY,
      }),
    ).toEqual([]);
  });

  it("retains last successful intervals and coverage after failed or malformed refreshes", async () => {
    const { t, ids, owner, provider } = await fixture();
    const feedId = await owner.mutation(api.calendarFeeds.link, {
      listingId: ids.listingId,
      provider: "airbnb",
      url: airbnb,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const original = await t.run((ctx) =>
      ctx.db
        .query("availabilityBlocks")
        .withIndex("by_calendarFeedId", (q) => q.eq("calendarFeedId", feedId))
        .collect(),
    );
    const coverage = (await t.run((ctx) => ctx.db.get(ids.listingId)))
      ?.calendarSyncThrough;
    for (const result of [
      () => Promise.reject(new Error(`network failure ${airbnb}`)),
      async () => respond("<html>Login</html>"),
    ]) {
      vi.setSystemTime(Date.now() + 61000);
      provider.mockImplementation(result);
      await owner.mutation(api.calendarFeeds.refresh, { feedId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const feed = (
        await owner.query(api.calendarFeeds.getByListing, {
          listingId: ids.listingId,
        })
      )[0];
      expect(feed.status).toBe("error");
      expect(feed.error).not.toContain("private-airbnb-token");
      expect(
        await t.run((ctx) =>
          ctx.db
            .query("availabilityBlocks")
            .withIndex("by_calendarFeedId", (q) =>
              q.eq("calendarFeedId", feedId),
            )
            .collect(),
        ),
      ).toEqual(original);
      expect(
        (await t.run((ctx) => ctx.db.get(ids.listingId)))?.calendarSyncThrough,
      ).toBe(coverage);
    }
  });

  it("replaces one provider atomically, ignores stale jobs, and permits an authoritative empty export", async () => {
    const { t, ids, owner, provider } = await fixture();
    const feedId = await owner.mutation(api.calendarFeeds.link, {
      listingId: ids.listingId,
      provider: "airbnb",
      url: airbnb,
    });
    await owner.mutation(api.calendarFeeds.link, {
      listingId: ids.listingId,
      provider: "airbnb",
      url: airbnb.replace("private-airbnb-token", "replacement-token"),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toContain("replacement-token");
    expect(
      await t.mutation(internal.calendarFeeds.apply, {
        feedId,
        generation: 1,
        blocks: [],
        coveredThrough: now + 730 * DAY,
      }),
    ).toBe(false);
    await t.mutation(internal.calendarFeeds.failed, {
      feedId,
      generation: 1,
      message: "Stale failure",
    });
    expect(
      (
        await owner.query(api.calendarFeeds.getByListing, {
          listingId: ids.listingId,
        })
      )[0].status,
    ).toBe("synced");
    vi.setSystemTime(Date.now() + 61000);
    provider.mockImplementation(async () => respond(calendar("")));
    await owner.mutation(api.calendarFeeds.refresh, { feedId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (
        await owner.query(api.calendarFeeds.getByListing, {
          listingId: ids.listingId,
        })
      )[0].importedBlocks,
    ).toBe(0);
    expect(await t.run((ctx) => ctx.db.get(ids.manualId))).not.toBeNull();
    expect(
      await t.query(api.listings.search, {
        moveIn: start,
        moveOut: start + 30 * DAY,
      }),
    ).toHaveLength(1);
  });

  it("unlinks only the selected provider and protects imported periods from manual edits", async () => {
    const { t, ids, owner, other } = await fixture();
    const first = await owner.mutation(api.calendarFeeds.link, {
      listingId: ids.listingId,
      provider: "airbnb",
      url: airbnb,
    });
    const second = await owner.mutation(api.calendarFeeds.link, {
      listingId: ids.listingId,
      provider: "vrbo",
      url: vrbo,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const imported = (
      await owner.query(api.availability.getByListing, {
        listingId: ids.listingId,
      })
    ).find((b) => b.calendarFeedId === first)!;
    await expect(
      owner.mutation(api.availability.removeBlock, { id: imported._id }),
    ).rejects.toThrow("linked calendar");
    await expect(
      owner.mutation(api.availability.updateBlock, {
        id: imported._id,
        endDate: start + 100 * DAY,
      }),
    ).rejects.toThrow("linked calendar");
    await expect(
      other.mutation(api.calendarFeeds.unlink, { feedId: first }),
    ).rejects.toThrow();
    await owner.mutation(api.calendarFeeds.unlink, { feedId: first });
    const remaining = await owner.query(api.availability.getByListing, {
      listingId: ids.listingId,
    });
    expect(remaining.find((b) => b.calendarFeedId === first)).toBeUndefined();
    expect(remaining.find((b) => b.calendarFeedId === second)).toBeTruthy();
    expect(remaining.find((b) => b._id === ids.manualId)).toBeTruthy();
    expect(
      await t.mutation(internal.calendarFeeds.apply, {
        feedId: first,
        generation: 1,
        blocks: [],
        coveredThrough: now + 730 * DAY,
      }),
    ).toBe(false);
    await owner.mutation(api.calendarFeeds.unlink, { feedId: second });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await t.run((ctx) => ctx.db.get(ids.listingId)))?.calendarSyncThrough,
    ).toBeUndefined();
  });

  it("enforces ownership, refresh throttling, and current generation validation", async () => {
    const { t, ids, owner, other, provider } = await fixture();
    await expect(
      other.mutation(api.calendarFeeds.link, {
        listingId: ids.listingId,
        provider: "airbnb",
        url: airbnb,
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.calendarFeeds.link, {
        listingId: ids.listingId,
        provider: "airbnb",
        url: "https://169.254.169.254/feed.ics",
      }),
    ).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
    const feedId = await owner.mutation(api.calendarFeeds.link, {
      listingId: ids.listingId,
      provider: "airbnb",
      url: airbnb,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      owner.mutation(api.calendarFeeds.refresh, { feedId }),
    ).rejects.toThrow("minute");
    await expect(
      owner.mutation(api.calendarFeeds.link, {
        listingId: ids.listingId,
        provider: "airbnb",
        url: airbnb,
      }),
    ).rejects.toThrow("minute");
    await expect(
      other.mutation(api.calendarFeeds.refresh, { feedId }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.calendarFeeds.apply, {
        feedId,
        generation: 1,
        blocks: [{ startDate: start, endDate: start - DAY }],
        coveredThrough: now + 730 * DAY,
      }),
    ).rejects.toThrow("invalid dates");
    expect(
      (
        await owner.query(api.calendarFeeds.getByListing, {
          listingId: ids.listingId,
        })
      )[0].importedBlocks,
    ).toBe(1);
  });

  it("refreshes due feeds across more than one scheduler page and does not repeatedly fetch them", async () => {
    const { t, ids, provider } = await fixture();
    await t.run(async (ctx) => {
      for (let i = 0; i < 45; i++) {
        const listingId = await ctx.db.insert("listings", {
          ...ids.data,
          title: `Calendar fixture ${i}`,
        });
        await ctx.db.insert("calendarFeeds", {
          listingId,
          landlordId: ids.owner,
          provider: "airbnb",
          url: airbnb,
          generation: 0,
          status: "error",
          createdAt: now,
          lastAttemptAt: 0,
          nextSyncAt: 0,
        });
      }
    });
    await t.mutation(internal.calendarFeeds.refreshDue, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const feeds = await t.run((ctx) => ctx.db.query("calendarFeeds").collect());
    expect(feeds).toHaveLength(45);
    expect(
      feeds.every((f) => f.status === "synced" && f.nextSyncAt > now),
    ).toBe(true);
    expect(provider).toHaveBeenCalledTimes(45);
    await t.mutation(internal.calendarFeeds.refreshDue, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(provider).toHaveBeenCalledTimes(45);
  });

  it("removes private feeds when their listing is deleted, so queued imports cannot recreate them", async () => {
    const { t, ids, owner, provider } = await fixture();
    const feedId = await owner.mutation(api.calendarFeeds.link, {
      listingId: ids.listingId,
      provider: "airbnb",
      url: airbnb,
    });
    await owner.mutation(api.listings.deleteListing, { id: ids.listingId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(feedId))).toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("calendar fetching", () => {
  it("rejects redirects outside the chosen provider before issuing another request", async () => {
    const provider = vi
      .fn()
      .mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/feed.ics" },
        }),
      );
    vi.stubGlobal("fetch", provider);
    await expect(fetchCalendar(airbnb, "airbnb")).rejects.toThrow();
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("bounds the stream even when Content-Length is missing", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_CALENDAR_BYTES + 1));
      },
      cancel() {
        canceled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(stream, { status: 200 })),
    );
    await expect(fetchCalendar(airbnb, "airbnb")).rejects.toThrow("large");
    expect(canceled).toBe(true);
  });
});
