import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const mailSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mailSend };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 24),
  start = Date.UTC(2026, 7, 1),
  end = Date.UTC(2026, 8, 1),
  paginationOpts = { cursor: null, numItems: 10 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  mailSend.mockReset();
});
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "tenant" | "landlord" | "admin") =>
      ctx.db.insert("users", {
        clerkId,
        name: `${clerkId} PRIVATE_SURNAME`,
        email: `${clerkId}@example.test`,
        role,
        createdAt: now,
      });
    const owner = await make("owner", "landlord"),
      tenant = await make("tenant", "tenant"),
      other = await make("other", "landlord"),
      staff = await make("staff", "admin");
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Synthetic home",
      description: "Synthetic",
      address: "PRIVATE_ADDRESS",
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
      availableFrom: start,
      minStay: 1,
      status: "inactive",
      createdAt: now,
      views: 0,
    });
    const booking = await ctx.db.insert("bookingInquiries", {
      listingId: listing,
      landlordId: owner,
      tenantId: tenant,
      moveIn: start,
      moveOut: end,
      occupants: 1,
      pets: false,
      message: "PRIVATE_INQUIRY",
      status: "accepted",
      createdAt: start,
      updatedAt: start,
    });
    return { owner, tenant, other, staff, listing, booking };
  });
  const owner = t.withIdentity({ subject: "owner" }),
    tenant = t.withIdentity({ subject: "tenant" }),
    other = t.withIdentity({ subject: "other" }),
    staff = t.withIdentity({ subject: "staff" });
  const input = {
    listingId: ids.listing,
    landlordId: ids.owner,
    reviewerId: ids.tenant,
    title: "Synthetic review",
    rating: 4,
    comment: "A first-hand account of a synthetic stay.",
    phone: "+1 512 555 0100",
    stayStart: start,
    stayEnd: end,
    experienceConfirmed: true,
    bookingId: ids.booking,
  };
  const approve = async (
    id: any,
    decision: "approved" | "rejected" | "removed" = "approved",
    revision = 1,
  ) =>
    staff.mutation(api.reviews.moderate, {
      id,
      part: "review",
      decision,
      expectedRevision: revision,
      note: "Synthetic staff content and stay review",
      experienceChecked: true,
    });
  return { t, ids, owner, tenant, other, staff, input, approve };
}
describe("moderated two-way reviews", () => {
  it.each(["property", "traveler"] as const)(
    "allows a removed %s review replacement with fresh moderation and independent response history",
    async (kind) => {
      const f = await setup(),
        author = kind === "property" ? f.tenant : f.owner,
        subject = kind === "property" ? f.owner : f.tenant,
        input =
          kind === "property"
            ? f.input
            : {
                ...f.input,
                reviewerId: f.ids.owner,
                kind,
                subjectId: f.ids.tenant,
              };
      const id = await author.mutation(api.reviews.create, input);
      await f.approve(id);
      await subject.mutation(api.reviews.respond, {
        id,
        body: "Reply to the original synthetic review.",
      });
      await f.staff.mutation(api.reviews.moderate, {
        id,
        part: "response",
        decision: "approved",
        expectedRevision: 1,
        note: "Synthetic response checked",
      });
      await f.approve(id, "removed");
      const queryArgs = {
        listingId: f.ids.listing,
        kind,
        subjectId: kind === "traveler" ? f.ids.tenant : undefined,
      };
      const context = await author.query(api.reviews.context, queryArgs);
      expect(context.canSubmit).toBe(true);
      const next = {
        ...input,
        expectedRevision: 1,
        title: "Replacement synthetic review",
        rating: 2,
        comment: "New text replacing the removed synthetic review.",
      };
      await expect(
        author.mutation(api.reviews.create, {
          ...next,
          expectedRevision: undefined,
        }),
      ).rejects.toThrow("review changed");
      await expect(
        author.mutation(api.reviews.create, {
          ...next,
          experienceConfirmed: false,
        }),
      ).rejects.toThrow("first-hand");
      await expect(f.other.mutation(api.reviews.create, next)).rejects.toThrow(
        "authorized",
      );
      vi.setSystemTime(now + 86400000);
      expect(await author.mutation(api.reviews.create, next)).toBe(id);
      const row = await f.t.run((ctx) => ctx.db.get(id));
      expect(row).toMatchObject({
        status: "pending",
        revision: 2,
        counted: false,
        rating: 2,
        responseRevision: 2,
        createdAt: now,
        updatedAt: now + 86400000,
      });
      expect(row!.response).toBeUndefined();
      expect(row!.responseStatus).toBeUndefined();
      expect(
        (await author.query(api.reviews.context, queryArgs)).canSubmit,
      ).toBe(false);
      expect(
        (await author.query(api.reviews.mine, { paginationOpts })).page[0]
          .response,
      ).toBeUndefined();
      await expect(f.approve(id, "approved", 1)).rejects.toThrow(
        "revision changed",
      );
      await expect(
        f.staff.mutation(api.reviews.moderate, {
          id,
          part: "response",
          decision: "approved",
          expectedRevision: 1,
          note: "Stale original response",
        }),
      ).rejects.toThrow("revision changed");
      const history = await f.staff.query(api.reviews.history, {
        id,
        paginationOpts: { cursor: null, numItems: 50 },
      });
      const replacement = history.page.find(
        (e) => e.action === "replacement_submitted",
      );
      expect(JSON.parse(replacement!.snapshot!)).toMatchObject({
        title: input.title,
        comment: input.comment,
        response: "Reply to the original synthetic review.",
        status: "removed",
        responseStatus: "approved",
        reviewRevision: 1,
        responseRevision: 1,
      });
      await expect(
        author.query(api.reviews.history, { id, paginationOpts }),
      ).rejects.toThrow("Staff");
      if (kind === "property") {
        expect(
          await f.t.query(api.reviews.getAverageRating, {
            landlordId: f.ids.owner,
            listingId: f.ids.listing,
          }),
        ).toMatchObject({ count: 0, average: 0 });
        expect(
          await f.t.query(api.reviews.getByListing, {
            listingId: f.ids.listing,
          }),
        ).toHaveLength(0);
      }
      await f.approve(id, "approved", 2);
      if (kind === "property") {
        expect(
          await f.t.query(api.reviews.getAverageRating, {
            landlordId: f.ids.owner,
            listingId: f.ids.listing,
          }),
        ).toMatchObject({ count: 1, average: 2 });
        const published = await f.t.query(api.reviews.getByListing, {
          listingId: f.ids.listing,
        });
        expect(published[0]).toMatchObject({
          title: next.title,
          comment: next.comment,
          createdAt: now + 86400000,
        });
        expect(published[0].response).toBeUndefined();
      }
      await subject.mutation(api.reviews.respond, {
        id,
        body: "A fresh reply to the replacement review.",
      });
      const replied = await f.t.run((ctx) => ctx.db.get(id));
      expect(replied!.responseRevision).toBe(3);
      await f.approve(id, "removed", 2);
      const notice = (
        await author.query(api.reviewNotices.mine, {
          paginationOpts: { cursor: null, numItems: 50 },
        })
      ).page.find((n) => n.body.includes("replacement"));
      expect(notice!.body).toContain("fresh moderation");
      await expect(author.mutation(api.reviews.create, next)).rejects.toThrow(
        "review changed",
      );
      const outcomes = await Promise.allSettled([
        author.mutation(api.reviews.create, { ...next, expectedRevision: 2 }),
        author.mutation(api.reviews.create, { ...next, expectedRevision: 2 }),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      const mine = await author.query(api.reviews.mine, { paginationOpts });
      expect(mine.page).toHaveLength(1);
      expect(mine.page[0].revision).toBe(3);
    },
  );
  it("withholds resubmission when its property or reviewed account becomes unavailable", async () => {
    const f = await setup(),
      id = await f.tenant.mutation(api.reviews.create, f.input);
    await f.approve(id, "removed");
    expect(
      (await f.tenant.query(api.reviews.mine, { paginationOpts })).page[0]
        .canResubmit,
    ).toBe(true);
    await f.t.run((ctx) => ctx.db.patch(f.ids.owner, { clerkDeletedAt: now }));
    expect(
      (await f.tenant.query(api.reviews.context, { listingId: f.ids.listing }))
        .canSubmit,
    ).toBe(false);
    await expect(
      f.tenant.mutation(api.reviews.create, {
        ...f.input,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("subject is unavailable");
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.ids.owner, { clerkDeletedAt: undefined });
      await ctx.db.delete(f.ids.listing);
    });
    expect(
      (await f.tenant.query(api.reviews.mine, { paginationOpts })).page[0]
        .canResubmit,
    ).toBe(false);
  });
  it("keeps submissions and contact details private until staff approves and uses first names publicly", async () => {
    const f = await setup(),
      id = await f.tenant.mutation(api.reviews.create, f.input);
    expect(
      await f.t.query(api.reviews.getByListing, { listingId: f.ids.listing }),
    ).toEqual([]);
    expect(
      await f.t.query(api.reviews.getAverageRating, {
        landlordId: f.ids.owner,
      }),
    ).toEqual({ count: 0, average: 0 });
    const own = await f.tenant.query(api.reviews.mine, { paginationOpts });
    expect(own.page[0].phone).toBe(f.input.phone);
    await expect(
      f.other.query(api.reviews.getByReviewer, { reviewerId: f.ids.tenant }),
    ).rejects.toThrow("Not authorized");
    await expect(
      f.tenant.query(api.reviews.queue, { view: "pending", paginationOpts }),
    ).rejects.toThrow("Staff");
    await f.approve(id);
    const publicRows = await f.t.query(api.reviews.getByListing, {
      listingId: f.ids.listing,
    });
    expect(publicRows).toHaveLength(1);
    const json = JSON.stringify(publicRows);
    for (const value of [
      "PRIVATE_SURNAME",
      "PRIVATE_ADDRESS",
      f.input.phone,
      "bookingId",
      "stayStart",
      "reviewerId",
      "stayEvidence",
    ])
      expect(json).not.toContain(value);
    expect(publicRows[0].reviewerName).toBe("tenant");
    expect(
      await f.t.query(api.reviews.getAverageRating, {
        landlordId: f.ids.owner,
        listingId: f.ids.listing,
      }),
    ).toEqual({ count: 1, average: 4 });
  });
  it("rejects forged owners, callers, self reviews, invalid fields and mismatched or unfinished bookings", async () => {
    const f = await setup();
    await expect(f.t.mutation(api.reviews.create, f.input)).rejects.toThrow(
      "sign in",
    );
    await expect(f.other.mutation(api.reviews.create, f.input)).rejects.toThrow(
      "authorized",
    );
    await expect(
      f.tenant.mutation(api.reviews.create, {
        ...f.input,
        landlordId: f.ids.other,
      }),
    ).rejects.toThrow("owner");
    await expect(
      f.owner.mutation(api.reviews.create, {
        ...f.input,
        reviewerId: f.ids.owner,
      }),
    ).rejects.toThrow("yourself");
    for (const invalid of [
      { rating: 1.5 },
      { rating: 0 },
      { comment: "short" },
      { comment: "x".repeat(1001) },
      { title: "" },
      { phone: "no" },
      { stayStart: now + 86400000, stayEnd: now + 2 * 86400000 },
      { stayStart: start + 1 },
      { experienceConfirmed: false },
      { stayStart: start - 86400000 },
    ])
      await expect(
        f.tenant.mutation(api.reviews.create, { ...f.input, ...invalid }),
      ).rejects.toThrow();
    await f.t.run((ctx) => ctx.db.patch(f.ids.booking, { status: "declined" }));
    await expect(
      f.tenant.mutation(api.reviews.create, f.input),
    ).rejects.toThrow("accepted inquiry");
  });
  it("stores off-platform stay context for manual confirmation without inventing a verified booking", async () => {
    const f = await setup();
    await expect(
      f.tenant.mutation(api.reviews.create, {
        ...f.input,
        bookingId: undefined,
      }),
    ).rejects.toThrow("off-platform");
    const id = await f.tenant.mutation(api.reviews.create, {
      ...f.input,
      bookingId: undefined,
      stayEvidence:
        "Synthetic external stay arranged with this owner; staff must review.",
    });
    await expect(
      f.staff.mutation(api.reviews.moderate, {
        id,
        part: "review",
        decision: "approved",
        expectedRevision: 1,
        note: "Incomplete check",
      }),
    ).rejects.toThrow("Confirm");
    await f.approve(id);
    expect(
      (
        await f.t.query(api.reviews.getByListing, { listingId: f.ids.listing })
      )[0],
    ).not.toHaveProperty("verifiedStay");
  });
  it("deduplicates simultaneous submissions and allows declined revisions to be resubmitted with the current revision", async () => {
    const f = await setup();
    const outcomes = await Promise.allSettled([
      f.tenant.mutation(api.reviews.create, f.input),
      f.tenant.mutation(api.reviews.create, f.input),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const id = (await f.tenant.query(api.reviews.mine, { paginationOpts }))
      .page[0]._id;
    await f.approve(id, "rejected");
    expect(
      await f.tenant.query(api.reviews.canReview, {
        reviewerId: f.ids.tenant,
        listingId: f.ids.listing,
      }),
    ).toBe(true);
    expect(
      await f.tenant.mutation(api.reviews.create, {
        ...f.input,
        comment: "A revised first-hand synthetic review.",
        expectedRevision: 1,
      }),
    ).toBe(id);
    await expect(f.approve(id)).rejects.toThrow("revision changed");
    await f.approve(id, "approved", 2);
    await expect(
      f.tenant.mutation(api.reviews.create, f.input),
    ).rejects.toThrow("already submitted");
    expect(
      (
        await f.staff.query(api.reviews.history, { id, paginationOpts })
      ).page.some((e) => e.action === "resubmitted"),
    ).toBe(true);
  });
  it("counts only currently approved property reviews and handles repeated decisions and reinstatement", async () => {
    const f = await setup(),
      id = await f.tenant.mutation(api.reviews.create, f.input);
    await f.approve(id);
    await f.approve(id);
    expect(
      await f.t.query(api.reviews.getAverageRating, {
        landlordId: f.ids.owner,
      }),
    ).toEqual({ count: 1, average: 4 });
    await f.approve(id, "removed");
    await f.approve(id, "removed");
    expect(
      await f.t.query(api.reviews.getAverageRating, {
        landlordId: f.ids.owner,
      }),
    ).toEqual({ count: 0, average: 0 });
    expect(
      await f.t.query(api.reviews.getByListing, { listingId: f.ids.listing }),
    ).toHaveLength(0);
    await f.approve(id);
    expect(
      await f.t.query(api.reviews.getAverageRating, {
        landlordId: f.ids.owner,
      }),
    ).toEqual({ count: 1, average: 4 });
  });
  it("lets only the reviewed party respond and moderates responses independently", async () => {
    const f = await setup(),
      id = await f.tenant.mutation(api.reviews.create, f.input);
    await expect(
      f.owner.mutation(api.reviews.respond, {
        id,
        body: "Thanks for your review.",
      }),
    ).rejects.toThrow("approved review");
    await f.approve(id);
    await expect(
      f.other.mutation(api.reviews.respond, { id, body: "Forged response" }),
    ).rejects.toThrow("reviewed party");
    await f.owner.mutation(api.reviews.respond, {
      id,
      body: "Thanks for your first-hand feedback.",
    });
    expect(
      (
        await f.t.query(api.reviews.getByListing, { listingId: f.ids.listing })
      )[0].response,
    ).toBeUndefined();
    await f.staff.mutation(api.reviews.moderate, {
      id,
      part: "response",
      decision: "rejected",
      expectedRevision: 1,
      note: "Revise the response",
    });
    expect(
      (await f.owner.query(api.reviews.actions, { id }))?.responseNote,
    ).toBe("Revise the response");
    await f.owner.mutation(api.reviews.respond, {
      id,
      body: "A revised public response to the feedback.",
    });
    await expect(
      f.staff.mutation(api.reviews.moderate, {
        id,
        part: "response",
        decision: "approved",
        expectedRevision: 1,
        note: "Stale response",
      }),
    ).rejects.toThrow("revision changed");
    await f.staff.mutation(api.reviews.moderate, {
      id,
      part: "response",
      decision: "approved",
      expectedRevision: 2,
      note: "Response content checked",
    });
    expect(
      (
        await f.t.query(api.reviews.getByListing, { listingId: f.ids.listing })
      )[0].response?.body,
    ).toContain("revised public");
    await f.approve(id, "removed");
    await expect(
      f.staff.mutation(api.reviews.moderate, {
        id,
        part: "response",
        decision: "approved",
        expectedRevision: 2,
        note: "Cannot expose hidden review",
      }),
    ).rejects.toThrow("parent review");
  });
  it("allows a real counterparty's traveler review without leaking it to strangers or property ratings", async () => {
    const f = await setup(),
      id = await f.owner.mutation(api.reviews.create, {
        ...f.input,
        kind: "traveler",
        subjectId: f.ids.tenant,
        reviewerId: f.ids.owner,
      });
    await f.approve(id);
    expect(
      await f.t.query(api.reviews.getByListing, { listingId: f.ids.listing }),
    ).toHaveLength(0);
    expect(
      await f.t.query(api.reviews.getAverageRating, {
        landlordId: f.ids.owner,
      }),
    ).toEqual({ count: 0, average: 0 });
    await expect(
      f.t.query(api.reviews.listPublic, {
        travelerId: f.ids.tenant,
        paginationOpts,
      }),
    ).rejects.toThrow("private");
    await expect(
      f.other.query(api.reviews.listPublic, {
        travelerId: f.ids.tenant,
        paginationOpts,
      }),
    ).rejects.toThrow("private");
    expect(
      (
        await f.owner.query(api.reviews.listPublic, {
          travelerId: f.ids.tenant,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1);
    expect(
      (await f.tenant.query(api.reviews.received, { paginationOpts })).page,
    ).toHaveLength(1);
    await f.tenant.mutation(api.reviews.respond, {
      id,
      body: "Thank you for hosting this synthetic stay.",
    });
    await expect(
      f.other.mutation(api.reviews.create, {
        ...f.input,
        kind: "traveler",
        subjectId: f.ids.tenant,
        reviewerId: f.ids.other,
      }),
    ).rejects.toThrow("owner");
  });
  it("routes reports/removal requests to staff with audit and does not let owners erase unfavorable reviews", async () => {
    const f = await setup(),
      id = await f.tenant.mutation(api.reviews.create, {
        ...f.input,
        rating: 1,
      });
    await f.approve(id);
    await f.owner.mutation(api.reviews.flag, {
      id,
      reason: "Synthetic policy concern requiring investigation",
    });
    expect(
      JSON.stringify(
        await f.tenant.query(api.reviews.mine, { paginationOpts }),
      ),
    ).not.toContain("Synthetic policy concern requiring investigation");
    expect(
      (
        await f.staff.query(api.reviews.queue, {
          view: "reports",
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1);
    await expect(
      f.owner.mutation(api.reviews.moderate, {
        id,
        part: "review",
        decision: "removed",
        expectedRevision: 1,
        note: "Dislike the rating",
      }),
    ).rejects.toThrow("Staff");
    expect(
      await f.t.query(api.reviews.getByListing, { listingId: f.ids.listing }),
    ).toHaveLength(1);
    await f.staff.mutation(api.reviews.resolveFlag, {
      id,
      note: "No content standard violation found",
    });
    expect(
      (
        await f.staff.query(api.reviews.queue, {
          view: "reports",
          paginationOpts,
        })
      ).page,
    ).toHaveLength(0);
    expect(
      (
        await f.t.query(api.reviews.getAverageRating, {
          landlordId: f.ids.owner,
        })
      ).average,
    ).toBe(1);
    await f.tenant.mutation(api.reviews.flag, {
      id,
      reason: "Please remove my authored review",
    });
    await f.approve(id, "removed");
    expect(
      (
        await f.staff.query(api.reviews.queue, {
          view: "reports",
          paginationOpts,
        })
      ).page,
    ).toHaveLength(0);
  });
  it("keeps legacy unmoderated rows out of public results and totals until an author resubmits", async () => {
    const f = await setup(),
      id = await f.t.run((ctx) =>
        ctx.db.insert("reviews", {
          listingId: f.ids.listing,
          landlordId: f.ids.owner,
          reviewerId: f.ids.tenant,
          rating: 5,
          comment: "Legacy unknown experience",
          createdAt: now,
        }),
      );
    expect(
      await f.t.query(api.reviews.getByLandlord, { landlordId: f.ids.owner }),
    ).toHaveLength(0);
    expect(
      (
        await f.staff.query(api.reviews.queue, {
          view: "legacy",
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1);
    await expect(f.approve(id, "approved", 0)).rejects.toThrow();
    expect(
      await f.tenant.mutation(api.reviews.create, {
        ...f.input,
        expectedRevision: 0,
      }),
    ).toBe(id);
    await f.approve(id);
    expect(
      (
        await f.t.query(api.reviews.getAverageRating, {
          landlordId: f.ids.owner,
        })
      ).count,
    ).toBe(1);
  });
  it("paginates all approved reviews and private histories without capping totals to a displayed page", async () => {
    const f = await setup();
    await f.t.run(async (ctx) => {
      for (let n = 0; n < 25; n++) {
        const author = await ctx.db.insert("users", {
          clerkId: `synthetic-${n}`,
          name: "Synthetic",
          email: `synthetic-${n}@example.test`,
          role: "tenant",
          createdAt: now,
        });
        await ctx.db.insert("reviews", {
          listingId: f.ids.listing,
          landlordId: f.ids.owner,
          reviewerId: author,
          subjectId: f.ids.owner,
          kind: "property",
          status: "approved",
          title: "Synthetic",
          comment: "First-hand synthetic review",
          rating: 4,
          counted: true,
          createdAt: now + n,
        });
      }
      await ctx.db.insert("reviewStats", {
        key: `landlord:${f.ids.owner}`,
        count: 25,
        sum: 100,
      });
    });
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let n = 0; n < 3; n++) {
      const p: {
        page: { _id: string }[];
        continueCursor: string;
        isDone: boolean;
      } = await f.t.query(api.reviews.listPublic, {
        landlordId: f.ids.owner,
        paginationOpts: { cursor, numItems: 10 },
      });
      p.page.forEach((r) => seen.add(r._id));
      cursor = p.continueCursor;
      if (n === 2) expect(p.isDone).toBe(true);
    }
    expect(seen.size).toBe(25);
    expect(
      (
        await f.t.query(api.reviews.getAverageRating, {
          landlordId: f.ids.owner,
        })
      ).count,
    ).toBe(25);
  });
  it("provides a private completed-inquiry entry point to each review direction", async () => {
    const f = await setup();
    await expect(
      f.other.query(api.reviews.invitationContext, {
        inquiryId: f.ids.booking,
      }),
    ).rejects.toThrow("private");
    expect(
      await f.owner.query(api.reviews.invitationContext, {
        inquiryId: f.ids.booking,
      }),
    ).toMatchObject({
      kind: "traveler",
      subjectId: f.ids.tenant,
      eligible: true,
    });
    expect(
      await f.tenant.query(api.reviews.invitationContext, {
        inquiryId: f.ids.booking,
      }),
    ).toMatchObject({
      kind: "property",
      subjectId: f.ids.owner,
      eligible: true,
    });
  });
  it("saves decision notices once, keeps them private, and records provider failures and retries honestly", async () => {
    const f = await setup(),
      id = await f.tenant.mutation(api.reviews.create, f.input);
    await f.approve(id, "rejected");
    await f.approve(id, "rejected");
    let notices = await f.tenant.query(api.reviewNotices.mine, {
      paginationOpts,
    });
    expect(notices.page).toHaveLength(1);
    expect(notices.page[0].body).toContain("revise and resubmit");
    expect(
      (await f.owner.query(api.reviewNotices.mine, { paginationOpts })).page,
    ).toHaveLength(0);
    const noticeId = notices.page[0]._id;
    vi.stubEnv("RESEND_API_KEY", "");
    await f.t.action(internal.reviewEmails.deliver, { id: noticeId });
    expect(
      (await f.tenant.query(api.reviewNotices.mine, { paginationOpts })).page[0]
        .emailStatus,
    ).toBe("unconfigured");
    await expect(
      f.other.mutation(api.reviewNotices.retry, { id: noticeId }),
    ).rejects.toThrow("authorized");
    vi.stubEnv("RESEND_API_KEY", "synthetic");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    mailSend.mockResolvedValue({
      error: { message: "Synthetic failure" },
      data: null,
    });
    await f.t.action(internal.reviewEmails.deliver, { id: noticeId });
    expect(
      (await f.tenant.query(api.reviewNotices.mine, { paginationOpts })).page[0]
        .emailStatus,
    ).toBe("failed");
    vi.setSystemTime(now + 60001);
    await f.tenant.mutation(api.reviewNotices.retry, { id: noticeId });
    mailSend.mockResolvedValue({
      data: { id: "synthetic-message" },
      error: null,
    });
    await f.t.action(internal.reviewEmails.deliver, { id: noticeId });
    expect(
      (await f.tenant.query(api.reviewNotices.mine, { paginationOpts })).page[0]
        .emailStatus,
    ).toBe("sent");
    expect(mailSend.mock.calls[0][1]).toEqual(mailSend.mock.calls[1][1]);
    expect(JSON.stringify(mailSend.mock.calls)).not.toContain(f.input.phone);
    await f.t.action(internal.reviewEmails.deliver, { id: noticeId });
    expect(mailSend).toHaveBeenCalledTimes(2);
  });
  it("allows only stay participants to request reviews, deduplicates requests and respects blocks at request and delivery", async () => {
    const f = await setup();
    await expect(
      f.other.mutation(api.reviewNotices.requestReview, {
        inquiryId: f.ids.booking,
      }),
    ).rejects.toThrow("private");
    const id = await f.owner.mutation(api.reviewNotices.requestReview, {
      inquiryId: f.ids.booking,
    });
    expect(
      await f.owner.mutation(api.reviewNotices.requestReview, {
        inquiryId: f.ids.booking,
      }),
    ).toBe(id);
    expect(
      (await f.tenant.query(api.reviewNotices.mine, { paginationOpts })).page[0]
        .inquiryId,
    ).toBe(f.ids.booking);
    await f.t.run((ctx) =>
      ctx.db.insert("userBlocks", {
        blockerId: f.ids.tenant,
        blockedId: f.ids.owner,
        createdAt: now,
      }),
    );
    await expect(
      f.owner.mutation(api.reviewNotices.requestReview, {
        inquiryId: f.ids.booking,
      }),
    ).rejects.toThrow("unavailable");
    vi.stubEnv("RESEND_API_KEY", "synthetic");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    await f.t.action(internal.reviewEmails.deliver, { id });
    expect(mailSend).not.toHaveBeenCalled();
    expect(
      (await f.tenant.query(api.reviewNotices.mine, { paginationOpts })).page[0]
        .emailStatus,
    ).toBe("failed");
    await f.t.run((ctx) =>
      ctx.db.patch(f.ids.booking, { moveIn: now + 86400000 }),
    );
    await expect(
      f.tenant.mutation(api.reviewNotices.requestReview, {
        inquiryId: f.ids.booking,
      }),
    ).rejects.toThrow("started");
  });
  it("permits first-hand reviews during an accepted stay after check-in, without requiring checkout to have passed", async () => {
    const f = await setup();
    await f.t.run((ctx) =>
      ctx.db.patch(f.ids.booking, { moveOut: now + 86400000 }),
    );
    const id = await f.tenant.mutation(api.reviews.create, {
      ...f.input,
      stayEnd: now + 86400000,
    });
    await f.approve(id);
    expect(
      await f.t.query(api.reviews.getByListing, { listingId: f.ids.listing }),
    ).toHaveLength(1);
    expect(
      await f.owner.mutation(api.reviewNotices.requestReview, {
        inquiryId: f.ids.booking,
      }),
    ).toBeTruthy();
  });
});
