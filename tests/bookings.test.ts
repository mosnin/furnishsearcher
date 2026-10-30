import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedPublishedFixtures } from "./helpers/publication";
import { DAY } from "../lib/stays";
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts"),
  clock = Date.UTC(2026, 9, 24),
  start = Date.UTC(2026, 10, 1),
  end = start + 30 * DAY,
  paginationOpts = { cursor: null, numItems: 20 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  vi.stubEnv("RESEND_API_KEY", "");
  sendEmail.mockReset();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (clerkId: string, role: "tenant" | "landlord" | "admin") =>
      ctx.db.insert("users", {
        clerkId,
        name: clerkId,
        email: clerkId + "@example.test",
        role,
        createdAt: clock,
      });
    const owner = await user("owner", "landlord"),
      tenant = await user("tenant", "tenant"),
      other = await user("other", "tenant"),
      staff = await user("staff", "admin");
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Synthetic stay fixture",
      description: "Synthetic only",
      city: "Austin",
      state: "TX",
      zip: "78701",
      address: "PRIVATE TEST STREET",
      price: 1800,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: start,
      minStay: 1,
      status: "active",
      createdAt: clock,
      views: 0,
    });
    return { owner, tenant, other, staff, listing };
  });
  await seedPublishedFixtures(t);
  const owner = t.withIdentity({ subject: "owner" }),
    tenant = t.withIdentity({ subject: "tenant" }),
    other = t.withIdentity({ subject: "other" }),
    staff = t.withIdentity({ subject: "staff" });
  const request = {
      listingId: ids.listing,
      moveIn: start,
      moveOut: end,
      occupants: 1,
      pets: false,
      message: "Synthetic stay request",
    },
    id = await tenant.mutation(api.inquiries.create, request);
  await owner.mutation(api.inquiries.respond, { id, decision: "accepted" });
  const current = () => owner.query(api.bookings.get, { id });
  const propose = (kind: "dates" | "cancel" = "dates", extra = {}) =>
    tenant.mutation(api.bookings.propose, {
      inquiryId: id,
      kind,
      ...(kind === "dates" ? { moveIn: start, moveOut: end + 15 * DAY } : {}),
      expectedRevision: 1,
      reason: "Please extend the agreed stay",
      clientRequestId: crypto.randomUUID(),
      ...extra,
    });
  return { t, ids, owner, tenant, other, staff, id, request, current, propose };
}
describe("confirmed stay changes and cancellation", () => {
  it("shows missing confirmed-calendar coverage to both participants and resolves after native repair", async () => {
    const f = await fixture();
    expect((await f.current()).calendarReserved).toBe(true);
    const blockId = (await f.current()).inquiry.availabilityBlockId!;
    await f.t.run((ctx) => ctx.db.delete(blockId));
    expect((await f.current()).calendarReserved).toBe(false);
    expect(
      (await f.tenant.query(api.bookings.get, { id: f.id })).calendarReserved,
    ).toBe(false);
    await expect(f.propose()).rejects.toThrow("needs repair");
    await f.owner.mutation(api.bookings.repairCalendar, {
      id: f.id,
      expectedRevision: 1,
      note: "Restore missing synthetic calendar coverage",
    });
    expect((await f.current()).calendarReserved).toBe(true);
    expect(
      (await f.tenant.query(api.bookings.get, { id: f.id })).calendarReserved,
    ).toBe(true);
    expect((await f.current()).inquiry.moveOut).toBe(end);
  });
  it("does not claim coverage from a mismatched-date or non-booked calendar entry", async () => {
    const f = await fixture(),
      id = (await f.current()).inquiry.availabilityBlockId!;
    await f.t.run((ctx) => ctx.db.patch(id, { endDate: end + DAY }));
    expect((await f.current()).calendarReserved).toBe(false);
    await f.t.run((ctx) =>
      ctx.db.patch(id, { endDate: end, type: "unavailable" }),
    );
    expect((await f.current()).calendarReserved).toBe(false);
  });
  it("keeps non-confirmed and cancelled status separate from calendar reservation claims", async () => {
    const f = await fixture();
    const change = await f.propose("cancel");
    await f.owner.mutation(api.bookings.decide, {
      id: change,
      decision: "accepted",
    });
    expect((await f.current()).calendarReserved).toBeNull();
    const pending = await f.t.run((ctx) =>
      ctx.db.insert("bookingInquiries", {
        ...f.request,
        landlordId: f.ids.owner,
        tenantId: f.ids.tenant,
        status: "pending",
        createdAt: clock,
        updatedAt: clock,
      }),
    );
    expect(
      (await f.owner.query(api.bookings.get, { id: pending })).calendarReserved,
    ).toBeNull();
  });
  it("keeps requested dates reserved until the other participant accepts and updates block and inquiry atomically", async () => {
    const f = await fixture();
    const change = await f.propose();
    let view = await f.current();
    expect(view.inquiry.moveOut).toBe(end);
    expect(
      (await f.t.run((ctx) => ctx.db.get(view.inquiry.availabilityBlockId!)))
        ?.endDate,
    ).toBe(end);
    await expect(
      f.tenant.mutation(api.bookings.decide, {
        id: change,
        decision: "accepted",
      }),
    ).rejects.toThrow("other stay partner");
    await f.owner.mutation(api.bookings.decide, {
      id: change,
      decision: "accepted",
    });
    view = await f.current();
    expect(view.inquiry.moveOut).toBe(end + 15 * DAY);
    expect(view.revision).toBe(2);
    expect(view.inquiry.pendingBookingChangeId).toBeUndefined();
    expect(
      (await f.t.run((ctx) => ctx.db.get(view.inquiry.availabilityBlockId!)))
        ?.endDate,
    ).toBe(end + 15 * DAY);
    await f.owner.mutation(api.bookings.decide, {
      id: change,
      decision: "accepted",
    });
    expect((await f.current()).revision).toBe(2);
  });
  it("rechecks conflicts when accepting and preserves the original reservation when a new block wins", async () => {
    const f = await fixture();
    const change = await f.propose();
    await f.owner.mutation(api.availability.addBlock, {
      listingId: f.ids.listing,
      startDate: end,
      endDate: end + DAY,
      type: "unavailable",
    });
    await expect(
      f.owner.mutation(api.bookings.decide, {
        id: change,
        decision: "accepted",
      }),
    ).rejects.toThrow("no longer available");
    expect((await f.current()).inquiry.moveOut).toBe(end);
    expect((await f.t.run((ctx) => ctx.db.get(change)))?.status).toBe(
      "pending",
    );
    await f.owner.mutation(api.bookings.decide, {
      id: change,
      decision: "declined",
    });
    expect((await f.current()).inquiry.pendingBookingChangeId).toBeUndefined();
  });
  it("deduplicates retry references, rejects changed payloads, and allows one pending request with author withdrawal", async () => {
    const f = await fixture();
    const clientRequestId = crypto.randomUUID(),
      id = await f.propose("dates", { clientRequestId });
    expect(await f.propose("dates", { clientRequestId })).toBe(id);
    await expect(
      f.propose("dates", {
        clientRequestId,
        reason: "A different reason for this request",
      }),
    ).rejects.toThrow("reference already used");
    await expect(f.propose("cancel")).rejects.toThrow("current change");
    await expect(
      f.owner.mutation(api.bookings.decide, { id, decision: "withdrawn" }),
    ).rejects.toThrow("author can withdraw");
    await f.tenant.mutation(api.bookings.decide, { id, decision: "withdrawn" });
    await f.propose("cancel");
    expect((await f.current()).inquiry.moveOut).toBe(end);
  });
  it("cancels a future stay, releases only its own block, preserves records and permits a new inquiry", async () => {
    const f = await fixture();
    const original = (await f.current()).inquiry.availabilityBlockId!;
    const unrelated = await f.owner.mutation(api.availability.addBlock, {
      listingId: f.ids.listing,
      startDate: end + 10 * DAY,
      endDate: end + 11 * DAY,
      type: "unavailable",
    });
    const change = await f.propose("cancel");
    expect(await f.t.run((ctx) => ctx.db.get(original))).not.toBeNull();
    await f.owner.mutation(api.bookings.decide, {
      id: change,
      decision: "accepted",
    });
    const current = await f.current();
    expect(current.inquiry.status).toBe("cancelled");
    expect(current.canReview).toBe(false);
    expect(await f.t.run((ctx) => ctx.db.get(original))).toBeNull();
    expect(await f.t.run((ctx) => ctx.db.get(unrelated))).not.toBeNull();
    expect(
      (
        await f.tenant.query(api.inquiries.getMine, {
          as: "tenant",
          paginationOpts,
        })
      ).page[0].status,
    ).toBe("cancelled");
    await f.tenant.mutation(api.inquiries.create, f.request);
  });
  it("retains elapsed calendar history when an ongoing stay is cancelled and keeps former occupants eligible for reviews", async () => {
    const f = await fixture();
    vi.setSystemTime(start + 15 * DAY);
    await f.owner.mutation(api.bookings.recordAgreed, {
      inquiryId: f.id,
      kind: "cancel",
      expectedRevision: 1,
      reason: "Traveler and owner agreed early departure",
      clientRequestId: crypto.randomUUID(),
      agreementConfirmed: true,
    });
    const current = await f.current(),
      block = await f.t.run((ctx) =>
        ctx.db.get(current.inquiry.availabilityBlockId!),
      );
    expect(block?.endDate).toBe(start + 15 * DAY);
    expect(current.inquiry.moveOut).toBe(end);
    expect(current.canReview).toBe(true);
    const review = await f.tenant.query(api.reviews.invitationContext, {
      inquiryId: f.id,
    });
    expect(review.eligible).toBe(true);
    expect(review.moveOut).toBe(start + 15 * DAY);
    await expect(
      f.owner.mutation(api.availability.removeBlock, { id: block!._id }),
    ).rejects.toThrow("Booking inquiries");
  });
  it("allows owner-recorded agreements while hidden, supersedes old requests and rejects stale revisions and unauthorised recording", async () => {
    const f = await fixture();
    const request = await f.propose();
    await f.owner.mutation(api.listings.unpublish, { id: f.ids.listing });
    const args = {
      inquiryId: f.id,
      kind: "dates" as const,
      moveIn: start,
      moveOut: end + 5 * DAY,
      expectedRevision: 1,
      reason: "We agreed to extend the current stay",
      clientRequestId: crypto.randomUUID(),
      agreementConfirmed: true,
    };
    await expect(
      f.tenant.mutation(api.bookings.recordAgreed, args),
    ).rejects.toThrow("Only the owner");
    await expect(
      f.owner.mutation(api.bookings.recordAgreed, {
        ...args,
        agreementConfirmed: false,
      }),
    ).rejects.toThrow("agreed");
    const id = await f.owner.mutation(api.bookings.recordAgreed, args);
    expect(await f.owner.mutation(api.bookings.recordAgreed, args)).toBe(id);
    expect((await f.t.run((ctx) => ctx.db.get(request)))?.status).toBe(
      "superseded",
    );
    expect((await f.t.run((ctx) => ctx.db.get(id)))?.agreementRecorded).toBe(
      true,
    );
    await expect(
      f.tenant.mutation(api.bookings.propose, {
        inquiryId: f.id,
        kind: "cancel",
        expectedRevision: 1,
        reason: "Cancel the stay with agreed terms",
        clientRequestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("booking changed");
  });
  it("rejects unrelated and anonymous reads/writes, prevents managed calendar edits and guards deletion of single-space properties", async () => {
    const f = await fixture(),
      b = (await f.current()).inquiry.availabilityBlockId!;
    for (const client of [f.other, f.staff, f.t]) {
      await expect(
        client.query(api.bookings.get, { id: f.id }),
      ).rejects.toThrow();
      await expect(
        client.query(api.bookings.events, { id: f.id, paginationOpts }),
      ).rejects.toThrow();
    }
    await expect(
      f.owner.mutation(api.availability.updateBlock, {
        id: b,
        endDate: end + DAY,
      }),
    ).rejects.toThrow("Booking inquiries");
    await expect(
      f.owner.mutation(api.availability.removeBlock, { id: b }),
    ).rejects.toThrow("Booking inquiries");
    await expect(
      f.owner.mutation(api.listings.deleteListing, { id: f.ids.listing }),
    ).rejects.toThrow("accepted stay");
    const publicBlocks = await f.t.query(api.availability.getByListing, {
      listingId: f.ids.listing,
    });
    expect(publicBlocks[0].inquiryId).toBeUndefined();
    expect(publicBlocks[0].note).toBeUndefined();
  });
  it("protects legacy block pointers, backfills safe links, and repairs missing reservations only after a conflict check", async () => {
    const f = await fixture(),
      b = (await f.current()).inquiry.availabilityBlockId!;
    await f.t.run((ctx) => ctx.db.patch(b, { inquiryId: undefined }));
    await expect(
      f.owner.mutation(api.availability.removeBlock, { id: b }),
    ).rejects.toThrow("Booking inquiries");
    expect(
      await f.t.mutation(internal.bookings.linkLegacyBlocks, { cursor: null }),
    ).toMatchObject({ linked: 1, isDone: true });
    await f.t.run((ctx) => ctx.db.delete(b));
    await f.t.run((ctx) => ctx.db.patch(f.ids.listing, { minStay: 6 }));
    const collision = await f.owner.mutation(api.availability.addBlock, {
      listingId: f.ids.listing,
      startDate: start,
      endDate: end,
      type: "booked",
    });
    await expect(
      f.owner.mutation(api.bookings.repairCalendar, {
        id: f.id,
        expectedRevision: 1,
        note: "Recover accidentally removed calendar block",
      }),
    ).rejects.toThrow("no longer available");
    await f.owner.mutation(api.availability.removeBlock, { id: collision });
    await f.owner.mutation(api.bookings.repairCalendar, {
      id: f.id,
      expectedRevision: 1,
      note: "Recover accidentally removed calendar block",
    });
    expect((await f.current()).inquiry.availabilityBlockId).not.toBe(b);
    expect((await f.current()).revision).toBe(2);
  });
  it("keeps arrival fixed once a stay has begun, rejects past changes and validates minimum stay/calendar coverage", async () => {
    const f = await fixture();
    vi.setSystemTime(start + DAY);
    await expect(
      f.propose("dates", { moveIn: start + DAY, moveOut: end + DAY }),
    ).rejects.toThrow("already occurred");
    await expect(
      f.propose("dates", { moveOut: start + 5 * DAY }),
    ).rejects.toThrow("30 days");
    await f.t.run((ctx) =>
      ctx.db.patch(f.ids.listing, { calendarSyncThrough: end }),
    );
    await expect(f.propose()).rejects.toThrow("no longer available");
    await f.t.run((ctx) =>
      ctx.db.patch(f.ids.listing, { calendarSyncThrough: undefined }),
    );
    const change = await f.propose();
    vi.setSystemTime(end + DAY);
    await expect(
      f.owner.mutation(api.bookings.decide, {
        id: change,
        decision: "accepted",
      }),
    ).rejects.toThrow("stay has ended");
    await f.tenant.mutation(api.bookings.decide, {
      id: change,
      decision: "withdrawn",
    });
  });
  it("keeps status updates separate from user messaging, respects blocks and lets existing participants discuss hidden stays", async () => {
    const f = await fixture();
    await f.owner.mutation(api.listings.unpublish, { id: f.ids.listing });
    const conv = await f.tenant.mutation(api.bookings.message, {
      id: f.id,
      content: "Can we discuss extending the lease?",
      clientRequestId: crypto.randomUUID(),
    });
    expect(conv).toBeTruthy();
    await f.t.run((ctx) =>
      ctx.db.insert("userBlocks", {
        blockerId: f.ids.owner,
        blockedId: f.ids.tenant,
        createdAt: clock,
      }),
    );
    await expect(f.propose()).rejects.toThrow("Messaging is unavailable");
    await expect(
      f.tenant.mutation(api.bookings.message, {
        id: f.id,
        content: "Blocked message should fail",
        clientRequestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("Messaging is unavailable");
    await f.owner.mutation(api.bookings.recordAgreed, {
      inquiryId: f.id,
      kind: "cancel",
      expectedRevision: 1,
      reason: "Owner records the previously agreed cancellation",
      clientRequestId: crypto.randomUUID(),
      agreementConfirmed: true,
    });
    expect((await f.current()).inquiry.status).toBe("cancelled");
  });
  it("records notification configuration/provider failures, uses stable idempotency and protects retries and stale attempt results", async () => {
    const f = await fixture();
    const events = await f.owner.query(api.bookings.events, {
        id: f.id,
        paginationOpts,
      }),
      e = events.page.find((e) => e.action === "confirmed")!;
    await f.t.action(internal.bookingEmails.deliver, { id: e._id });
    expect((await f.t.run((ctx) => ctx.db.get(e._id)))?.emailStatus).toBe(
      "unconfigured",
    );
    await expect(
      f.owner.mutation(api.bookings.retryNotice, { id: e._id }),
    ).rejects.toThrow("recipient");
    vi.setSystemTime(Date.now() + 61000);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "qa@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    sendEmail.mockResolvedValueOnce({ error: { message: "synthetic" } });
    await f.tenant.mutation(api.bookings.retryNotice, { id: e._id });
    await f.t.action(internal.bookingEmails.deliver, { id: e._id });
    expect((await f.t.run((ctx) => ctx.db.get(e._id)))?.emailStatus).toBe(
      "failed",
    );
    vi.setSystemTime(Date.now() + 61000);
    sendEmail.mockResolvedValue({ data: { id: "synthetic-email" } });
    await f.tenant.mutation(api.bookings.retryNotice, { id: e._id });
    await f.t.action(internal.bookingEmails.deliver, { id: e._id });
    expect((await f.t.run((ctx) => ctx.db.get(e._id)))?.emailStatus).toBe(
      "sent",
    );
    expect(sendEmail.mock.calls.at(-1)?.[1]).toEqual({
      idempotencyKey: `booking-event-${e._id}`,
    });
    await f.t.mutation(internal.bookings.recordNotice, {
      id: e._id,
      attempt: 1,
      status: "failed",
    });
    expect((await f.t.run((ctx) => ctx.db.get(e._id)))?.emailStatus).toBe(
      "sent",
    );
  });
  it("serializes competing owner changes and rejects acceptance of old-date inquiries", async () => {
    const f = await fixture();
    const args = {
      inquiryId: f.id,
      kind: "dates" as const,
      moveIn: start,
      moveOut: end + 10 * DAY,
      expectedRevision: 1,
      reason: "Agreed extension for the active rental",
      agreementConfirmed: true,
    };
    const outcomes = await Promise.allSettled([
      f.owner.mutation(api.bookings.recordAgreed, {
        ...args,
        clientRequestId: crypto.randomUUID(),
      }),
      f.owner.mutation(api.bookings.recordAgreed, {
        ...args,
        moveOut: end + 20 * DAY,
        clientRequestId: crypto.randomUUID(),
      }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect((await f.current()).revision).toBe(2);
    const second = await f.other.mutation(api.inquiries.create, {
      ...f.request,
      moveIn: end + 40 * DAY,
      moveOut: end + 70 * DAY,
    });
    vi.setSystemTime(end + 41 * DAY);
    await expect(
      f.owner.mutation(api.inquiries.respond, {
        id: second,
        decision: "accepted",
      }),
    ).rejects.toThrow("move-in date has passed");
  });
  it("allows moderation against previously confirmed dates after an extension and reviews of shortened stays", async () => {
    const f = await fixture();
    vi.setSystemTime(start + 10 * DAY);
    const input = {
      listingId: f.ids.listing,
      landlordId: f.ids.owner,
      reviewerId: f.ids.tenant,
      rating: 4,
      title: "Synthetic first-hand stay",
      comment:
        "Synthetic account describes a first-hand rental experience for moderation.",
      phone: "+1 202 555 0109",
      stayStart: start,
      stayEnd: end,
      experienceConfirmed: true,
      bookingId: f.id,
    };
    const id = await f.tenant.mutation(api.reviews.create, input);
    await f.owner.mutation(api.bookings.recordAgreed, {
      inquiryId: f.id,
      kind: "dates",
      moveIn: start,
      moveOut: end + 15 * DAY,
      expectedRevision: 1,
      reason: "Owner and traveler agree a longer stay",
      clientRequestId: crypto.randomUUID(),
      agreementConfirmed: true,
    });
    await f.staff.mutation(api.reviews.moderate, {
      id,
      part: "review",
      decision: "approved",
      expectedRevision: 1,
      note: "Synthetic experience checked against recorded agreement",
      experienceChecked: true,
    });
    await f.owner.mutation(api.bookings.recordAgreed, {
      inquiryId: f.id,
      kind: "cancel",
      expectedRevision: 2,
      reason: "Owner and traveler agree early departure",
      clientRequestId: crypto.randomUUID(),
      agreementConfirmed: true,
    });
    expect(
      (await f.tenant.query(api.reviews.invitationContext, { inquiryId: f.id }))
        .eligible,
    ).toBe(true);
    await f.owner.mutation(api.reviews.create, {
      ...input,
      kind: "traveler",
      subjectId: f.ids.tenant,
      reviewerId: f.ids.owner,
      stayEnd: start + 10 * DAY,
    });
  });
  it("lets owners record agreed historical calendar corrections while tenant requests cannot rewrite ended stays", async () => {
    const f = await fixture();
    vi.setSystemTime(end + 5 * DAY);
    await expect(f.propose()).rejects.toThrow("stay has ended");
    await f.owner.mutation(api.bookings.recordAgreed, {
      inquiryId: f.id,
      kind: "dates",
      moveIn: start - DAY,
      moveOut: end + 2 * DAY,
      expectedRevision: 1,
      reason:
        "Owner and traveler confirm corrected actual arrival and departure",
      clientRequestId: crypto.randomUUID(),
      agreementConfirmed: true,
    });
    const current = await f.current();
    expect(current.inquiry.moveIn).toBe(start - DAY);
    expect(current.inquiry.moveOut).toBe(end + 2 * DAY);
    expect(current.canReview).toBe(true);
    expect(
      (await f.t.run((ctx) => ctx.db.get(current.inquiry.availabilityBlockId!)))
        ?.endDate,
    ).toBe(end + 2 * DAY);
  });
  it("accepts new current inquiries beyond 500 historical blocks and unrelated pending requests", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      for (let n = 0; n < 501; n++) {
        await ctx.db.insert("availabilityBlocks", {
          listingId: f.ids.listing,
          startDate: start - (n + 2) * DAY,
          endDate: start - (n + 1) * DAY,
          type: "unavailable",
          createdAt: clock,
        });
        await ctx.db.insert("bookingInquiries", {
          listingId: f.ids.listing,
          landlordId: f.ids.owner,
          tenantId: f.ids.other,
          moveIn: end + (n + 100) * DAY,
          moveOut: end + (n + 130) * DAY,
          occupants: 1,
          pets: false,
          message: "Synthetic other pending request",
          status: "pending",
          createdAt: clock,
          updatedAt: clock,
        });
      }
    });
    const id = await f.tenant.mutation(api.inquiries.create, {
      ...f.request,
      moveIn: end + 10 * DAY,
      moveOut: end + 40 * DAY,
    });
    await f.owner.mutation(api.inquiries.respond, { id, decision: "accepted" });
    expect((await f.owner.query(api.bookings.get, { id })).inquiry.status).toBe(
      "accepted",
    );
  });
  it("supports private paginated history and manual event edits without exposing private titles or notes", async () => {
    const f = await fixture();
    for (let i = 0; i < 4; i++) {
      const id = await f.propose();
      await f.tenant.mutation(api.bookings.decide, {
        id,
        decision: "withdrawn",
      });
    }
    const page = await f.owner.query(api.bookings.changes, {
      id: f.id,
      paginationOpts: { cursor: null, numItems: 2 },
    });
    expect(page.page).toHaveLength(2);
    expect(page.isDone).toBe(false);
    expect(
      (
        await f.owner.query(api.bookings.changes, {
          id: f.id,
          paginationOpts: { cursor: page.continueCursor, numItems: 2 },
        })
      ).page,
    ).toHaveLength(2);
    const block = await f.owner.mutation(api.availability.addBlock, {
      listingId: f.ids.listing,
      startDate: end + DAY,
      endDate: end + 2 * DAY,
      type: "unavailable",
      title: "Private maintenance",
      note: "Private staff details",
    });
    await f.owner.mutation(api.availability.updateBlock, {
      id: block,
      endDate: end + 3 * DAY,
      title: "Updated private event",
    });
    const publicBlock = (
      await f.t.query(api.availability.getByListing, {
        listingId: f.ids.listing,
      })
    ).find((b) => b._id === block)!;
    expect(publicBlock.title).toBeUndefined();
    expect(publicBlock.note).toBeUndefined();
    await f.owner.mutation(api.availability.removeBlock, { id: block });
  });
});
