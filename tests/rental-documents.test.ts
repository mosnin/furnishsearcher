import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  decryptDocument,
  encryptDocument,
  documentHash,
  MAX_DOCUMENT_BYTES,
} from "../convex/lib/documentCrypto";
const modules = import.meta.glob("../convex/**/*.ts"),
  clock = Date.UTC(2026, 9, 24),
  page = { cursor: null, numItems: 20 };
const pdf = (text = "SYNTHETIC TEST DOCUMENT; NOT A LEASE") =>
  new TextEncoder().encode(
    `%PDF-1.4\n% ${text}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  );
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  vi.stubEnv("RENTAL_DOCUMENT_ACTIVE_KEY", "v1");
  vi.stubEnv(
    "RENTAL_DOCUMENT_KEYRING",
    JSON.stringify({ v1: "11".repeat(32) }),
  );
  vi.stubEnv("ROCKET_CLIENT_ID", "");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture() {
  const t = convexTest(schema, modules),
    ids = await t.run(async (ctx) => {
      const make = (clerkId: string, role: "landlord" | "tenant" | "admin") =>
        ctx.db.insert("users", {
          clerkId,
          name: clerkId,
          email: clerkId + "@example.test",
          role,
          createdAt: clock,
        });
      const owner = await make("owner", "landlord"),
        tenant = await make("tenant", "tenant"),
        other = await make("other", "tenant"),
        staff = await make("staff", "admin");
      const listing = await ctx.db.insert("listings", {
        landlordId: owner,
        title: "Synthetic unpublished property",
        description: "Synthetic only",
        address: "PRIVATE ADDRESS",
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
        availableFrom: clock,
        minStay: 1,
        status: "inactive",
        createdAt: clock,
        views: 0,
      });
      const inquiry = await ctx.db.insert("bookingInquiries", {
        listingId: listing,
        landlordId: owner,
        tenantId: tenant,
        moveIn: clock + 86400000,
        moveOut: clock + 32 * 86400000,
        occupants: 1,
        pets: false,
        message: "Synthetic rental discussion",
        status: "pending",
        createdAt: clock,
        updatedAt: clock,
      });
      return { owner, tenant, other, staff, listing, inquiry };
    });
  const owner = t.withIdentity({
      subject: "owner",
      email: "owner@example.test",
      emailVerified: true,
    }),
    tenant = t.withIdentity({
      subject: "tenant",
      email: "tenant@example.test",
      emailVerified: true,
    }),
    other = t.withIdentity({ subject: "other" }),
    staff = t.withIdentity({ subject: "staff" });
  const reserve = (overrides = {}) =>
    owner.mutation(api.rentalDocs.reserveUpload, {
      inquiryId: ids.inquiry,
      title: "Synthetic agreement",
      kind: "lease",
      filename: "synthetic.pdf",
      requestId: crypto.randomUUID(),
      ...overrides,
    });
  async function upload(body = pdf(), overrides = {}) {
    const id = await reserve(overrides),
      response = await owner.fetch(`/documents/upload?upload=${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body,
      });
    expect(response.status).toBe(200);
    const { versionId } = await response.json(),
      version = await t.run((ctx) => ctx.db.get(versionId as any));
    const rows = await owner.query(api.rentalDocs.list, {
      inquiryId: ids.inquiry,
      paginationOpts: page,
    });
    const doc = rows.page.find((d) => d.latest?._id === versionId)!;
    return {
      id,
      versionId: doc.latest!._id,
      documentId: doc._id,
      response,
      version,
    };
  }
  return { t, ids, owner, tenant, other, staff, reserve, upload };
}
describe("private rental document lifecycle", () => {
  it("stores encrypted bytes, returns no bearer URLs or storage IDs, and authenticates every download", async () => {
    const f = await fixture(),
      d = await f.upload(),
      metadata = await f.owner.query(api.rentalDocs.list, {
        inquiryId: f.ids.inquiry,
        paginationOpts: page,
      });
    expect(JSON.stringify(metadata)).not.toContain("storageId");
    expect(JSON.stringify(metadata)).not.toContain("keyId");
    const version = await f.t.run((ctx) => ctx.db.get(d.versionId)),
      stored = await f.t.run(
        async (ctx) =>
          await (await ctx.storage.get(version!.storageId))!.arrayBuffer(),
      );
    expect(new TextDecoder().decode(stored)).not.toContain("%PDF-");
    const downloaded = await f.owner.fetch(
      `/documents/download?version=${d.versionId}`,
    );
    expect(downloaded.status).toBe(200);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(pdf());
    expect(downloaded.headers.get("cache-control")).toBe("no-store");
    expect(
      (await f.t.fetch(`/documents/download?version=${d.versionId}`)).status,
    ).toBe(401);
    for (const client of [f.tenant, f.other, f.staff])
      expect(
        (await client.fetch(`/documents/download?version=${d.versionId}`))
          .status,
      ).toBe(403);
    expect(
      await f.owner.mutation(api.files.getUrl, {
        storageId: version!.storageId,
      }),
    ).toBeNull();
  });
  it("shares exact versions, keeps newer drafts private, acknowledges receipt without claiming a signature and revokes access", async () => {
    const f = await fixture(),
      first = await f.upload();
    expect(
      (
        await f.owner.query(api.rentalDocs.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page[0].canRemoveDraft,
    ).toBe(true);
    expect(
      (
        await f.tenant.query(api.rentalDocs.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(0);
    await f.owner.mutation(api.rentalDocs.share, {
      documentId: first.documentId,
      versionId: first.versionId,
    });
    expect(
      (
        await f.owner.query(api.rentalDocs.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page[0].canRemoveDraft,
    ).toBe(false);
    expect(
      (
        await f.tenant.query(api.rentalDocs.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page[0].canRemoveDraft,
    ).toBe(false);
    expect(
      (await f.tenant.fetch(`/documents/download?version=${first.versionId}`))
        .status,
    ).toBe(200);
    await f.tenant.mutation(api.rentalDocs.acknowledge, {
      versionId: first.versionId,
    });
    const next = await f.upload(pdf("SECOND PRIVATE DRAFT"), {
      documentId: first.documentId,
      expectedVersionId: first.versionId,
    });
    const list = await f.tenant.query(api.rentalDocs.list, {
      inquiryId: f.ids.inquiry,
      paginationOpts: page,
    });
    expect(list.page[0].latest).toBeNull();
    expect(list.page[0].shared?._id).toBe(first.versionId);
    expect(list.page[0].shared?.source).toBe("member_upload");
    expect(
      (await f.tenant.fetch(`/documents/download?version=${next.versionId}`))
        .status,
    ).toBe(403);
    await f.owner.mutation(api.rentalDocs.unshare, {
      documentId: first.documentId,
    });
    expect(
      (
        await f.owner.query(api.rentalDocs.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page[0].canRemoveDraft,
    ).toBe(false);
    expect(
      (await f.tenant.fetch(`/documents/download?version=${first.versionId}`))
        .status,
    ).toBe(403);
    await expect(
      f.owner.mutation(api.rentalDocs.removeDraft, {
        documentId: first.documentId,
      }),
    ).rejects.toThrow("controlled deletion");
  });
  it("rejects unrelated access, invalid formats/oversize files, stale versions and conflicting retry references", async () => {
    const f = await fixture();
    await expect(
      f.other.mutation(api.rentalDocs.reserveUpload, {
        inquiryId: f.ids.inquiry,
        title: "Unrelated draft",
        kind: "lease",
        filename: "lease.pdf",
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("private");
    const requestId = crypto.randomUUID(),
      id = await f.reserve({ requestId });
    expect(await f.reserve({ requestId })).toBe(id);
    await expect(
      f.reserve({ requestId, title: "Another title" }),
    ).rejects.toThrow("reference already used");
    const wrong = await f.owner.fetch(`/documents/upload?upload=${id}`, {
      method: "POST",
      headers: { "Content-Type": "text/html" },
      body: "<html>fake</html>",
    });
    expect(wrong.status).toBe(415);
    expect(
      (
        await f.owner.fetch(`/documents/upload?upload=${id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(MAX_DOCUMENT_BYTES + 1),
          },
          body: pdf(),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await f.owner.fetch(`/documents/upload?upload=${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: new TextEncoder().encode("not a pdf"),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await f.owner.fetch(`/documents/upload?upload=${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: new Uint8Array(MAX_DOCUMENT_BYTES + 1),
        })
      ).status,
    ).toBe(413);
    const d = await f.upload();
    await expect(f.reserve({ documentId: d.documentId })).rejects.toThrow(
      "current document",
    );
  });
  it("deduplicates upload retries and removes only private unreceived drafts", async () => {
    const f = await fixture(),
      id = await f.reserve();
    // convex-test cannot interleave storage.store with independent transactions.
    // The guarded local runtime smoke exercises concurrent HTTP uploads instead.
    const responses = [];
    for (let n = 0; n < 2; n++)
      responses.push(
        await f.owner.fetch(`/documents/upload?upload=${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: pdf(),
        }),
      );
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const values = await Promise.all(responses.map((r) => r.json()));
    expect(values[0].versionId).toBe(values[1].versionId);
    const rows = await f.owner.query(api.rentalDocs.list, {
      inquiryId: f.ids.inquiry,
      paginationOpts: page,
    });
    expect(rows.page).toHaveLength(1);
    expect(
      await f.t.run((ctx) => ctx.db.system.query("_storage").take(10)),
    ).toHaveLength(1);
    await f.owner.mutation(api.rentalDocs.removeDraft, {
      documentId: rows.page[0]._id,
    });
    expect(
      (
        await f.owner.query(api.rentalDocs.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(0);
    expect(
      await f.t.run((ctx) => ctx.db.system.query("_storage").take(10)),
    ).toHaveLength(0);
  });
  it("supports encryption-key rotation and rejects tampering or missing keys", async () => {
    const original = await encryptDocument(pdf());
    vi.stubEnv("RENTAL_DOCUMENT_ACTIVE_KEY", "v2");
    vi.stubEnv(
      "RENTAL_DOCUMENT_KEYRING",
      JSON.stringify({ v1: "11".repeat(32), v2: "22".repeat(32) }),
    );
    expect(await decryptDocument(new Blob([original.payload]), "v1")).toEqual(
      pdf(),
    );
    const altered = original.payload.slice();
    altered[20] ^= 1;
    await expect(decryptDocument(new Blob([altered]), "v1")).rejects.toThrow();
    vi.stubEnv(
      "RENTAL_DOCUMENT_KEYRING",
      JSON.stringify({ v2: "22".repeat(32) }),
    );
    await expect(
      decryptDocument(new Blob([original.payload]), "v1"),
    ).rejects.toThrow("unavailable");
  });
  it("expires upload reservations, enforces quota, and respects participant blocks when sharing", async () => {
    const f = await fixture(),
      id = await f.reserve();
    vi.setSystemTime(clock + 16 * 60000);
    expect(
      (
        await f.owner.fetch(`/documents/upload?upload=${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: pdf(),
        })
      ).status,
    ).toBe(403);
    const d = await f.upload();
    await f.t.run((ctx) =>
      ctx.db.insert("userBlocks", {
        blockerId: f.ids.tenant,
        blockedId: f.ids.owner,
        createdAt: clock,
      }),
    );
    await expect(
      f.owner.mutation(api.rentalDocs.share, {
        documentId: d.documentId,
        versionId: d.versionId,
      }),
    ).rejects.toThrow("Messaging is unavailable");
    for (let n = 0; n < 18; n++) await f.reserve();
    await expect(f.reserve()).rejects.toThrow("allowance");
  });
});
function providerMock() {
  vi.stubEnv("ROCKET_API_MODE", "sandbox");
  vi.stubEnv("ROCKET_CLIENT_ID", "synthetic-client");
  vi.stubEnv("ROCKET_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv("ROCKET_SIGN_UI_URL", "https://www.rocketlawyer.com/us/en/sign");
  let payload: any,
    status = "IN_PREPARATION",
    source = pdf(),
    failAuth = false,
    failCreate = false,
    corruptSource = false;
  const calls: { url: string; method: string; body: any }[] = [];
  const fetch = vi.fn(async (url: string, init: any = {}) => {
    const method = init.method ?? "GET",
      body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ url, method, body });
    if (url.endsWith("/auth/accesstoken"))
      return failAuth
        ? new Response(null, { status: 401 })
        : Response.json({ access_token: "synthetic-backend-token" });
    if (url.endsWith("/auth/servicetoken"))
      return Response.json({
        purpose: body.purpose,
        expirationTime: body.expirationTime,
        token: "synthetic-party-token",
      });
    if (url.endsWith("/binders") && method === "POST") {
      payload = body;
      if (failCreate)
        throw new Error("Synthetic connection lost after creation");
      return Response.json({ id: "binder-synthetic-12345" });
    }
    if (url.endsWith("/requests/finalisations")) {
      status = "REVIEW_AND_SHARE";
      return Response.json({});
    }
    if (url.endsWith("/requests/invitations")) {
      status = "SIGN_IN_PROGRESS";
      return Response.json({});
    }
    if (url.includes("/documents/")) {
      if (method === "PUT") {
        source = new Uint8Array(body);
        return new Response(null, { status: 204 });
      }
      return new Response(
        url.endsWith("?unsigned")
          ? corruptSource
            ? pdf("WRONG SOURCE")
            : source
          : pdf("SYNTHETIC SIGNED OUTPUT; NO REAL SIGNATURE"),
        { headers: { "Content-Type": "application/pdf" } },
      );
    }
    if (url.includes("/binders/"))
      return Response.json({
        id: "binder-synthetic-12345",
        name: payload.name,
        status,
        parties: payload.parties.map((p: any, n: number) => ({
          ...p,
          id: `party-synthetic-${n}`,
        })),
        documents: payload.documents.map((d: any) => ({
          ...d,
          id: "document-synthetic-12345",
        })),
      });
    throw new Error("Unexpected provider endpoint");
  });
  vi.stubGlobal("fetch", fetch);
  return {
    calls,
    fetch,
    setStatus: (value: string) => (status = value),
    failAuth: () => {
      failAuth = true;
    },
    loseCreate: () => (failCreate = true),
    corrupt: () => (corruptSource = true),
    removeSignature: () => {
      payload.documents[0].inputs.pop();
    },
    mutateParties: () => (payload.parties[1].email = "wrong@example.test"),
  };
}
async function signFixture() {
  const f = await fixture(),
    d = await f.upload();
  await f.owner.mutation(api.rentalDocs.share, {
    documentId: d.documentId,
    versionId: d.versionId,
  });
  vi.stubEnv("CREEM_API_KEY", "creem_test_document_fixture");
  await f.t.run((ctx) =>
    ctx.db.insert("subscriptions", {
      userId: f.ids.owner,
      creemSubscriptionId: "synthetic-document-access",
      creemProductId: "prod_fixture",
      plan: "landlord_pro",
      status: "active",
      mode: "test",
      verifiedAt: clock,
      currentPeriodStart: clock - 1,
      currentPeriodEnd: clock + 30 * 86400000,
      paidThrough: clock + 30 * 86400000,
      createdAt: clock,
      updatedAt: clock,
    }),
  );
  const p = providerMock();
  async function consent() {
    await f.owner.mutation(api.rocketSignData.consent, {
      documentId: d.documentId,
      versionId: d.versionId,
      legalName: "Synthetic Owner",
      agreed: true,
    });
    await f.tenant.mutation(api.rocketSignData.consent, {
      documentId: d.documentId,
      versionId: d.versionId,
      legalName: "Synthetic Tenant",
      agreed: true,
    });
  }
  return { ...f, d, p, consent };
}
describe("Rocket Lawyer document authority", () => {
  it("requires a current paid landlord period for new provider creation", async () => {
    const f = await signFixture();
    await f.consent();
    await f.t.run(async (ctx) => {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", f.ids.owner))
        .first();
      await ctx.db.patch(sub!._id, { paidThrough: clock - 1 });
    });
    await expect(
      f.owner.action(api.rocketSign.start, {
        documentId: f.d.documentId,
        versionId: f.d.versionId,
        confirmed: true,
      }),
    ).rejects.toThrow("paid landlord subscription");
    expect(f.p.calls).toHaveLength(0);
  });
  it("requires both exact-version consents and verified identity-provider emails before provider creation", async () => {
    const f = await signFixture();
    await expect(
      f.owner.action(api.rocketSign.start, {
        documentId: f.d.documentId,
        versionId: f.d.versionId,
        confirmed: true,
      }),
    ).rejects.toThrow("Both stay participants");
    await expect(
      f.t
        .withIdentity({ subject: "tenant" })
        .mutation(api.rocketSignData.consent, {
          documentId: f.d.documentId,
          versionId: f.d.versionId,
          legalName: "Tenant",
          agreed: true,
        }),
    ).rejects.toThrow("verified email");
    await f.consent();
    const args = {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
      confirmed: true,
    };
    const results = await Promise.all([
      f.owner.action(api.rocketSign.start, args),
      f.owner.action(api.rocketSign.start, args),
    ]);
    expect(results[0]).toBe(results[1]);
    expect(
      f.p.calls.filter(
        (c) => c.url.endsWith("/binders") && c.method === "POST",
      ),
    ).toHaveLength(1);
    expect(
      (
        await f.owner.query(api.rocketSignData.status, {
          documentId: f.d.documentId,
        })
      ).state,
    ).toBe("invited");
    expect(
      f.p.calls
        .filter((c) => c.url.includes("/requests/"))
        .every((c) =>
          c.body.recipients.every((r: any) => r.notification === false),
        ),
    ).toBe(true);
  });
  it("mints only the caller's signer token and imports an authoritative sandbox result without granting a live signature claim", async () => {
    const f = await signFixture();
    await f.consent();
    await f.owner.action(api.rocketSign.start, {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
      confirmed: true,
    });
    const url = await f.tenant.action(api.rocketSign.signingUrl, {
      documentId: f.d.documentId,
    });
    expect(new URL(url).hostname).toBe("www.rocketlawyer.com");
    expect(new URL(url).search).toBe("");
    expect(
      f.p.calls.find((c) => c.url.endsWith("servicetoken"))?.body.upid,
    ).toBe("party-synthetic-1");
    await expect(
      f.other.action(api.rocketSign.signingUrl, { documentId: f.d.documentId }),
    ).rejects.toThrow();
    f.p.setStatus("SIGN_COMPLETED");
    await f.owner.action(api.rocketSign.check, { documentId: f.d.documentId });
    const rows = await f.tenant.query(api.rentalDocs.list, {
      inquiryId: f.ids.inquiry,
      paginationOpts: page,
    });
    expect(rows.page[0].shared?.source).toBe("rocketlawyer_signed");
    expect(rows.page[0].shared?.providerMode).toBe("sandbox");
    expect(
      (
        await f.tenant.fetch(
          `/documents/download?version=${rows.page[0].shared?._id}`,
        )
      ).status,
    ).toBe(200);
    await expect(
      f.owner.mutation(api.rentalDocs.unshare, { documentId: f.d.documentId }),
    ).rejects.toThrow("signing");
  });
  it("does not mark mismatched source files or wrong-party provider responses as signed", async () => {
    const f = await signFixture();
    await f.consent();
    await f.owner.action(api.rocketSign.start, {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
      confirmed: true,
    });
    f.p.setStatus("SIGN_COMPLETED");
    f.p.corrupt();
    await expect(
      f.owner.action(api.rocketSign.check, { documentId: f.d.documentId }),
    ).rejects.toThrow("original PDF differs");
    expect(
      (
        await f.owner.query(api.rentalDocs.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page[0].latest?._id,
    ).toBe(f.d.versionId);
    vi.setSystemTime(clock + 11000);
    f.p.mutateParties();
    await expect(
      f.owner.action(api.rocketSign.check, { documentId: f.d.documentId }),
    ).rejects.toThrow("signer binding");
  });
  it("rejects changed signature requirements and preserves a terminal signed result against stale provider states", async () => {
    const f = await signFixture();
    await f.consent();
    await f.owner.action(api.rocketSign.start, {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
      confirmed: true,
    });
    f.p.setStatus("SIGN_COMPLETED");
    await f.owner.action(api.rocketSign.check, { documentId: f.d.documentId });
    const before = await f.t.run((ctx) => ctx.db.get(f.d.documentId));
    vi.setSystemTime(clock + 11000);
    f.p.setStatus("IN_PREPARATION");
    await f.owner.action(api.rocketSign.check, { documentId: f.d.documentId });
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.d.documentId)))?.sharedVersionId,
    ).toBe(before?.sharedVersionId);
    const g = await signFixture();
    await g.consent();
    await g.owner.action(api.rocketSign.start, {
      documentId: g.d.documentId,
      versionId: g.d.versionId,
      confirmed: true,
    });
    g.p.removeSignature();
    g.p.setStatus("SIGN_COMPLETED");
    await expect(
      g.owner.action(api.rocketSign.check, { documentId: g.d.documentId }),
    ).rejects.toThrow("signature requirements");
  });
  it("refreshes pending provider results through the bounded scheduler", async () => {
    const f = await signFixture();
    await f.consent();
    await f.owner.action(api.rocketSign.start, {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
      confirmed: true,
    });
    f.p.setStatus("SIGN_COMPLETED");
    await f.t.action(internal.rocketSign.pollDue, {});
    expect(
      (
        await f.owner.query(api.rocketSignData.status, {
          documentId: f.d.documentId,
        })
      ).state,
    ).toBe("completed");
  });
  it("lets either participant stop untransferred preparation after an authentication failure", async () => {
    const f = await signFixture();
    await f.consent();
    f.p.failAuth();
    await expect(
      f.owner.action(api.rocketSign.start, {
        documentId: f.d.documentId,
        versionId: f.d.versionId,
        confirmed: true,
      }),
    ).rejects.toThrow("401");
    expect(
      (
        await f.tenant.query(api.rocketSignData.status, {
          documentId: f.d.documentId,
        })
      ).canStopPreparation,
    ).toBe(true);
    await f.tenant.mutation(api.rocketSignData.stopPreparation, {
      documentId: f.d.documentId,
    });
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.d.documentId)))?.signingSessionId,
    ).toBeUndefined();
    expect(
      (
        await f.tenant.query(api.rocketSignData.status, {
          documentId: f.d.documentId,
        })
      ).myConsent,
    ).toBe(false);
  });
  it("ignores stale provider polls and does not poll across active preparation", async () => {
    const f = await signFixture();
    await f.consent();
    const id = await f.owner.action(api.rocketSign.start, {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
      confirmed: true,
    });
    const first = await f.owner.mutation(internal.rocketSignData.claimPoll, {
      id,
      requireParticipant: true,
    });
    vi.setSystemTime(clock + 11000);
    const second = await f.owner.mutation(internal.rocketSignData.claimPoll, {
      id,
      requireParticipant: true,
    });
    expect(second).not.toBe(first);
    await f.t.mutation(internal.rocketSignData.checkpoint, {
      id,
      generation: 1,
      expectedPollAt: first!,
      state: "created",
      providerStatus: "IN_PREPARATION",
    });
    await f.t.mutation(internal.rocketSignData.recordCancellation, {
      id,
      generation: 1,
      expectedPollAt: first!,
    });
    expect(
      (
        await f.owner.query(api.rocketSignData.status, {
          documentId: f.d.documentId,
        })
      ).state,
    ).toBe("invited");
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.d.documentId)))?.signingSessionId,
    ).toBe(id);
    await f.t.mutation(internal.rocketSignData.claimSetup, { id });
    vi.setSystemTime(clock + 22000);
    expect(
      await f.owner.mutation(internal.rocketSignData.claimPoll, {
        id,
        requireParticipant: true,
      }),
    ).toBeNull();
    await f.t.mutation(internal.rocketSignData.claimSetup, {
      id,
      release: true,
    });
  });
  it("retains ambiguous creation outcomes without duplicating binders and supports verified recovery", async () => {
    const f = await signFixture();
    await f.consent();
    f.p.loseCreate();
    const args = {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
      confirmed: true,
    };
    await expect(f.owner.action(api.rocketSign.start, args)).rejects.toThrow(
      "connection lost",
    );
    expect(
      (
        await f.owner.query(api.rocketSignData.status, {
          documentId: f.d.documentId,
        })
      ).state,
    ).toBe("unknown");
    await expect(f.owner.action(api.rocketSign.start, args)).rejects.toThrow(
      "uncertain",
    );
    expect(
      f.p.calls.filter(
        (c) => c.url.endsWith("/binders") && c.method === "POST",
      ),
    ).toHaveLength(1);
    await f.owner.action(api.rocketSign.recover, {
      documentId: f.d.documentId,
      binderId: "binder-synthetic-12345",
    });
    expect(
      (
        await f.owner.query(api.rocketSignData.status, {
          documentId: f.d.documentId,
        })
      ).state,
    ).toBe("invited");
  });
  it("separates environments and unlocks editable source versions only after observed provider cancellation", async () => {
    const f = await signFixture();
    await f.consent();
    await f.owner.action(api.rocketSign.start, {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
      confirmed: true,
    });
    vi.stubEnv("ROCKET_API_MODE", "prod");
    await expect(
      f.owner.action(api.rocketSign.check, { documentId: f.d.documentId }),
    ).rejects.toThrow("environment changed");
    vi.stubEnv("ROCKET_API_MODE", "sandbox");
    vi.setSystemTime(clock + 11000);
    f.p.setStatus("IN_PREPARATION");
    await f.owner.action(api.rocketSign.check, { documentId: f.d.documentId });
    const doc = await f.t.run((ctx) => ctx.db.get(f.d.documentId));
    expect(doc?.signingSessionId).toBeUndefined();
    await f.owner.mutation(api.rentalDocs.unshare, {
      documentId: f.d.documentId,
    });
  });
});

describe("rental-provider setup instructions", () => {
  it("keeps provider orders, consent and financial outcomes distinct from in-app coordination", async () => {
    const f = await fixture(),
      requestId = crypto.randomUUID(),
      args = {
        inquiryId: f.ids.inquiry,
        kind: "screening" as const,
        note: "I will send the official screening invitation separately",
        requestId,
      };
    const id = await f.owner.mutation(api.rentalTools.request, args);
    expect(await f.owner.mutation(api.rentalTools.request, args)).toBe(id);
    await expect(
      f.tenant.mutation(api.rentalTools.update, {
        id,
        status: "owner_reported_complete",
      }),
    ).rejects.toThrow("owner");
    await f.tenant.mutation(api.rentalTools.update, { id, status: "received" });
    expect(
      (
        await f.owner.query(api.rentalTools.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page[0].status,
    ).toBe("received");
    await f.owner.mutation(api.rentalTools.update, {
      id,
      status: "owner_reported_complete",
    });
    expect(
      (
        await f.tenant.query(api.rentalTools.list, {
          inquiryId: f.ids.inquiry,
          paginationOpts: page,
        })
      ).page[0].status,
    ).toBe("owner_reported_complete");
    const events = await f.tenant.query(api.bookings.events, {
      id: f.ids.inquiry,
      paginationOpts: page,
    });
    expect(
      events.page.some((e) =>
        e.reason.includes(
          "No provider screening result or rent payment was verified",
        ),
      ),
    ).toBe(true);
  });
  it("isolates stay participants and bounds duplicate pending steps", async () => {
    const f = await fixture();
    await expect(
      f.other.query(api.rentalTools.list, {
        inquiryId: f.ids.inquiry,
        paginationOpts: page,
      }),
    ).rejects.toThrow("private");
    await expect(
      f.tenant.mutation(api.rentalTools.request, {
        inquiryId: f.ids.inquiry,
        kind: "rent_collection",
        note: "Synthetic owner request should be rejected",
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("owner");
    const args = {
      inquiryId: f.ids.inquiry,
      kind: "rent_collection" as const,
      note: "Set up rent and send the official Baselane invitation",
      requestId: crypto.randomUUID(),
    };
    const id = await f.owner.mutation(api.rentalTools.request, args);
    await expect(
      f.owner.mutation(api.rentalTools.request, {
        ...args,
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("current request");
    await f.owner.mutation(api.rentalTools.update, { id, status: "cancelled" });
    await f.owner.mutation(api.rentalTools.request, {
      ...args,
      requestId: crypto.randomUUID(),
    });
  });
  it("supports consent withdrawal and cannot prepare a superseded PDF or expired signing permission", async () => {
    const f = await signFixture();
    await f.consent();
    await f.tenant.mutation(api.rocketSignData.withdrawConsent, {
      documentId: f.d.documentId,
      versionId: f.d.versionId,
    });
    await expect(
      f.owner.action(api.rocketSign.start, {
        documentId: f.d.documentId,
        versionId: f.d.versionId,
        confirmed: true,
      }),
    ).rejects.toThrow("Both stay participants");
    await f.consent();
    vi.setSystemTime(clock + 25 * 3600000);
    await expect(
      f.owner.action(api.rocketSign.start, {
        documentId: f.d.documentId,
        versionId: f.d.versionId,
        confirmed: true,
      }),
    ).rejects.toThrow("last 24 hours");
  });
});
