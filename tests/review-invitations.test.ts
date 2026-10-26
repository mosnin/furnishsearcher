import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { contactHash } from "../lib/clerk-contact-event";
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 26),
  day = 86400000,
  page = { cursor: null, numItems: 10 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("CLERK_CONTACT_WEBHOOK_INSTANCE_ID", "ins_synthetic");
  vi.stubEnv("CLERK_CONTACT_WEBHOOK_MODE", "test");
  vi.stubEnv("CLERK_EMAIL_MODE", "test");
  vi.stubEnv("RESEND_API_KEY", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  send.mockReset();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const make = async (name: string, role: "landlord" | "tenant" = "tenant") =>
    t.run(async (ctx) => {
      const email = `${name}@example.test`,
        id = await ctx.db.insert("users", {
          clerkId: name,
          name: `${name} PRIVATE_SURNAME`,
          email,
          role,
          createdAt: Date.now(),
        });
      const snapshot = await ctx.db.insert("clerkContactSnapshots", {
        clerkId: name,
        mode: "test",
        instanceId: "ins_synthetic",
        updatedAt: Date.now(),
        eventAt: Date.now(),
        deleted: false,
        uncertain: false,
        emailHash: await contactHash(email),
        phoneHash: null,
        eventId: `evt-${name}`,
        appliedAt: Date.now(),
      });
      return { id, email, snapshot };
    });
  const owner = await make("owner", "landlord"),
    tenant = await make("tenant"),
    stranger = await make("stranger", "landlord");
  const listing = await t.run((ctx) =>
    ctx.db.insert("listings", {
      landlordId: owner.id,
      title: "Private synthetic rental",
      publicId: "FS-10001",
      description: "Not publicly listed",
      address: "PRIVATE ADDRESS",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 1500,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: false,
      parkingIncluded: false,
      availableFrom: now,
      minStay: 1,
      status: "inactive",
      createdAt: now,
      views: 0,
    }),
  );
  const identity = (name: string) =>
    t.withIdentity({
      subject: name,
      email: `${name}@example.test`,
      emailVerified: true,
    });
  const o = identity("owner"),
    traveler = identity("tenant"),
    other = identity("stranger");
  const request = (client = o, email = tenant.email, extra = {}) =>
    client.mutation(api.reviewInvitations.request, {
      propertyReference: "FS-10001",
      email,
      agreed: true,
      requestId: crypto.randomUUID(),
      ...extra,
    });
  const input = {
    listingId: listing,
    landlordId: owner.id,
    reviewerId: tenant.id,
    title: "Synthetic review",
    rating: 4,
    comment: "Synthetic workflow; no real stay occurred.",
    phone: "+1 512 555 0100",
    stayStart: now - 32 * day,
    stayEnd: now - day,
    stayEvidence:
      "Synthetic off-platform test context; no real stay or approval claimed.",
    experienceConfirmed: true,
  };
  return {
    t,
    owner,
    tenant,
    stranger,
    listing,
    o,
    traveler,
    other,
    make,
    identity,
    request,
    input,
  };
}
describe("account-email review invitations", () => {
  it("resolves only signed verified primary email, binds a private request and deduplicates retries without a booking", async () => {
    const f = await fixture(),
      requestId = crypto.randomUUID();
    const result = await f.request(f.o, " TENANT@EXAMPLE.TEST ", { requestId });
    expect(result.status).toBe("created");
    expect(await f.request(f.o, f.tenant.email, { requestId })).toEqual({
      status: "existing",
      id: result.id,
    });
    expect((await f.request()).status).toBe("existing");
    const sent = await f.o.query(api.reviewInvitations.list, {
      direction: "sent",
      paginationOpts: page,
    });
    expect(sent.page).toHaveLength(1);
    expect(sent.page[0]).toMatchObject({
      id: result.id,
      email: f.tenant.email,
      kind: "property",
      available: true,
    });
    const received = await f.traveler.query(api.reviewInvitations.list, {
      direction: "received",
      paginationOpts: page,
    });
    expect(received.page).toHaveLength(1);
    expect(received.page[0]).not.toHaveProperty("email");
    expect(received.page[0]).not.toHaveProperty("senderId");
    expect(
      await f.other.query(api.reviewInvitations.context, { id: result.id! }),
    ).toBeNull();
    expect(
      await f.o.query(api.reviewInvitations.context, { id: result.id! }),
    ).toBeNull();
    expect(
      await f.traveler.query(api.reviewInvitations.context, { id: "bad-link" }),
    ).toBeNull();
    const context = await f.traveler.query(api.reviewInvitations.context, {
      id: result.id!,
    });
    expect(context).toMatchObject({
      requesterName: "owner",
      kind: "property",
      title: "Private synthetic rental",
    });
    expect(context).not.toHaveProperty("email");
    await expect(
      f.t.query(api.reviewInvitations.list, {
        direction: "sent",
        paginationOpts: page,
      }),
    ).rejects.toThrow("sign in");
    expect(
      await f.t.run((ctx) => ctx.db.query("bookingInquiries").take(1)),
    ).toHaveLength(0);
  });
  it("ignores self-edited user email, ambiguous snapshots, unverified contacts and wrong provider instances", async () => {
    const f = await fixture();
    await f.t.run((ctx) =>
      ctx.db.patch(f.stranger.id, { email: "victim@example.test" }),
    );
    expect((await f.request(f.o, "victim@example.test")).status).toBe(
      "unavailable",
    );
    await f.t.run((ctx) =>
      ctx.db.patch(f.tenant.snapshot, { uncertain: true }),
    );
    expect((await f.request()).status).toBe("unavailable");
    await f.t.run((ctx) =>
      ctx.db.patch(f.tenant.snapshot, {
        uncertain: false,
        instanceId: "ins_foreign",
      }),
    );
    expect((await f.request()).status).toBe("unavailable");
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.tenant.snapshot, { instanceId: "ins_synthetic" });
      await ctx.db.patch(f.stranger.snapshot, {
        emailHash: await contactHash(f.tenant.email),
      });
    });
    expect((await f.request()).status).toBe("unavailable");
    await expect(
      f.request(
        f.t.withIdentity({
          subject: "owner",
          email: f.owner.email,
          emailVerified: false,
        }),
      ),
    ).rejects.toThrow("Confirm your sign-in email");
    await expect(
      f.request(f.o, f.tenant.email, { agreed: false }),
    ).rejects.toThrow("honest review");
  });
  it("limits failed account lookups and replays without disclosing account details", async () => {
    const f = await fixture();
    for (let n = 0; n < 10; n++)
      expect((await f.request(f.o, `missing${n}@example.test`)).status).toBe(
        "unavailable",
      );
    expect((await f.request()).status).toBe("limited");
    expect(
      await f.t.run((ctx) => ctx.db.query("reviewInvitations").take(1)),
    ).toHaveLength(0);
    vi.setSystemTime(now + day);
    expect((await f.request()).status).toBe("created");
    const id = crypto.randomUUID();
    await f.request(f.o, f.tenant.email, { requestId: id });
    // A changed payload cannot reuse an actual saved request reference.
    const saved = (
      await f.o.query(api.reviewInvitations.list, {
        direction: "sent",
        paginationOpts: page,
      })
    ).page[0];
    const record = await f.t.run((ctx) => ctx.db.get(saved.id));
    await expect(
      f.request(f.o, f.stranger.email, { requestId: record!.requestId }),
    ).rejects.toThrow("already used");
  });
  it("caps recipient-wide review invitations across independent requesting owners", async () => {
    const f = await fixture();
    for (let n = 0; n < 6; n++) {
      const name = `requester${n}`,
        u = await f.make(name, "landlord");
      const listingId = await f.t.run(async (ctx) => {
        const source = (await ctx.db.get(f.listing))!;
        const { _id, _creationTime, ...fields } = source;
        return ctx.db.insert("listings", {
          ...fields,
          landlordId: u.id,
          publicId: `FS-${20000 + n}`,
        });
      });
      const result = await f.request(f.identity(name), f.tenant.email, {
        propertyReference: listingId,
      });
      expect(result.status).toBe(n < 5 ? "created" : "unavailable");
    }
    expect(
      (
        await f.traveler.query(api.reviewInvitations.list, {
          direction: "received",
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(5);
  });
  it.each(["property", "traveler"] as const)(
    "opens only the requested %s form and submits pending with no general profile or booking grant",
    async (kind) => {
      const f = await fixture(),
        sender = kind === "property" ? f.o : f.traveler,
        recipient = kind === "property" ? f.traveler : f.o;
      const result = await f.request(
        sender,
        kind === "property" ? f.tenant.email : f.owner.email,
      );
      const input = {
        ...f.input,
        reviewerId: kind === "property" ? f.tenant.id : f.owner.id,
        kind,
        subjectId: kind === "property" ? f.owner.id : f.tenant.id,
        invitationId: result.id!,
      };
      if (kind === "property")
        await expect(
          recipient.query(api.reviews.context, { listingId: f.listing }),
        ).rejects.toThrow("unavailable");
      else
        expect(
          await f.o.query(api.reviews.travelerProfile, { id: f.tenant.id }),
        ).toBeNull();
      const context = await recipient.query(api.reviews.context, {
        listingId: f.listing,
        kind,
        subjectId: input.subjectId,
        invitationId: result.id!,
      });
      expect(context.canSubmit).toBe(true);
      await expect(
        f.other.mutation(api.reviews.create, {
          ...input,
          reviewerId: f.stranger.id,
        }),
      ).rejects.toThrow("unavailable");
      await expect(
        recipient.mutation(api.reviews.create, {
          ...input,
          experienceConfirmed: false,
        }),
      ).rejects.toThrow("first-hand");
      const reviewId = await recipient.mutation(api.reviews.create, input);
      const review = await f.t.run((ctx) => ctx.db.get(reviewId));
      expect(review).toMatchObject({
        status: "pending",
        counted: false,
        invitationId: result.id,
      });
      expect((await f.t.run((ctx) => ctx.db.get(result.id!)))?.reviewId).toBe(
        reviewId,
      );
      expect(
        await recipient.query(api.reviewInvitations.context, {
          id: result.id!,
        }),
      ).toBeNull();
      expect(
        (await sender.query(api.reviews.received, { paginationOpts: page }))
          .page,
      ).toHaveLength(0);
      expect(
        await f.t.query(api.reviews.getByListing, { listingId: f.listing }),
      ).toHaveLength(0);
      await expect(
        recipient.mutation(api.reviews.create, input),
      ).rejects.toThrow("already submitted");
      await sender.mutation(api.reviewInvitations.close, { id: result.id! });
      await f.t.run((ctx) => ctx.db.patch(reviewId, { status: "rejected" }));
      expect(
        await recipient.mutation(api.reviews.create, {
          ...input,
          expectedRevision: 1,
        }),
      ).toBe(reviewId);
    },
  );
  it.each([
    "block",
    "changed-email",
    "deleted",
    "expiry",
    "revoked",
    "declined",
  ])(
    "rechecks %s before display, review creation and queued delivery",
    async (reason) => {
      const f = await fixture(),
        r = await f.request();
      if (reason === "block")
        await f.t.run((ctx) =>
          ctx.db.insert("userBlocks", {
            blockerId: f.tenant.id,
            blockedId: f.owner.id,
            createdAt: now,
          }),
        );
      if (reason === "changed-email")
        await f.t.run(async (ctx) =>
          ctx.db.patch(f.tenant.snapshot, {
            emailHash: await contactHash("changed@example.test"),
          }),
        );
      if (reason === "deleted")
        await f.t.run((ctx) =>
          ctx.db.patch(f.owner.id, { clerkDeletedAt: now }),
        );
      if (reason === "expiry") {
        vi.setSystemTime(now + 31 * day);
        await f.t.mutation(internal.reviewInvitations.expire, { id: r.id! });
      }
      if (reason === "revoked")
        await f.o.mutation(api.reviewInvitations.close, { id: r.id! });
      if (reason === "declined")
        await f.traveler.mutation(api.reviewInvitations.close, { id: r.id! });
      expect(
        await f.traveler.query(api.reviewInvitations.context, { id: r.id! }),
      ).toBeNull();
      expect(
        await f.t.query(internal.reviewInvitations.emailDetails, { id: r.id! }),
      ).toBeNull();
      await f.t.action(internal.reviewInvitationEmails.deliver, { id: r.id! });
      expect(send).not.toHaveBeenCalled();
      await expect(
        f.traveler.mutation(api.reviews.create, {
          ...f.input,
          invitationId: r.id!,
        }),
      ).rejects.toThrow(/unavailable/);
    },
  );
  it("reports unconfigured/failed/provider-accepted delivery honestly and retries with stable provider identity", async () => {
    const f = await fixture(),
      r = await f.request();
    await f.t.action(internal.reviewInvitationEmails.deliver, { id: r.id! });
    expect((await f.t.run((ctx) => ctx.db.get(r.id!)))?.emailStatus).toBe(
      "unconfigured",
    );
    expect(send).not.toHaveBeenCalled();
    await expect(
      f.o.mutation(api.reviewInvitations.retry, { id: r.id! }),
    ).rejects.toThrow("minute");
    vi.setSystemTime(now + 61000);
    vi.stubEnv("RESEND_API_KEY", "synthetic");
    vi.stubEnv("EMAIL_FROM", "synthetic@example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    await f.o.mutation(api.reviewInvitations.retry, { id: r.id! });
    send.mockResolvedValueOnce({ error: { message: "synthetic rejection" } });
    await f.t.action(internal.reviewInvitationEmails.deliver, { id: r.id! });
    expect((await f.t.run((ctx) => ctx.db.get(r.id!)))?.emailStatus).toBe(
      "failed",
    );
    send.mockResolvedValueOnce({
      data: { id: "synthetic-accepted" },
      error: null,
    });
    await f.t.action(internal.reviewInvitationEmails.deliver, { id: r.id! });
    expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
    expect(send.mock.calls[0][0].to).toBe(f.tenant.email);
    expect(send.mock.calls[0][0].text).toContain(
      `/dashboard/reviews?reviewRequest=${r.id}`,
    );
    expect((await f.t.run((ctx) => ctx.db.get(r.id!)))?.emailStatus).toBe(
      "sent",
    );
    await f.t.action(internal.reviewInvitationEmails.deliver, { id: r.id! });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("pages complete private histories and property choices beyond the initial page", async () => {
    const f = await fixture();
    for (let n = 0; n < 23; n++) {
      vi.setSystemTime(now + n * 4 * day);
      expect((await f.request()).status).toBe("created");
    }
    let cursor: string | null = null;
    const ids: string[] = [];
    do {
      const p: FunctionReturnType<typeof api.reviewInvitations.list> =
        await f.o.query(api.reviewInvitations.list, {
          direction: "sent",
          paginationOpts: { cursor, numItems: 7 },
        });
      ids.push(...p.page.map((r) => r.id));
      cursor = p.isDone ? null : p.continueCursor;
    } while (cursor);
    expect(new Set(ids).size).toBe(23);
    expect(
      (
        await f.other.query(api.reviewInvitations.list, {
          direction: "sent",
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(0);
    const p = await f.o.query(api.reviewInvitations.properties, {
      paginationOpts: page,
    });
    expect(p.page[0]).toMatchObject({ id: f.listing, publicId: "FS-10001" });
    expect(p.page[0]).not.toHaveProperty("address");
    expect(
      (
        await f.traveler.query(api.reviewInvitations.properties, {
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(0);
  });
});
