import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const clock = Date.UTC(2026, 9, 24);
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAXkAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  vi.stubEnv("CREEM_API_KEY", "creem_test_publication");
  vi.stubEnv("JUMIO_CLIENT_ID", "synthetic-client");
  vi.stubEnv("JUMIO_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv("JUMIO_REGION", "amer-1");
  vi.stubEnv("JUMIO_MODE", "test");
  vi.stubEnv("JUMIO_WORKFLOW_KEY", "synthetic-id-selfie");
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
    const make = (clerkId: string, role: "admin" | "landlord" | "tenant") =>
      ctx.db.insert("users", {
        clerkId,
        name: clerkId,
        email: `${clerkId}@example.test`,
        role,
        createdAt: clock,
      });
    return {
      owner: await make("owner", "landlord"),
      staff: await make("staff", "admin"),
      tenant: await make("tenant", "tenant"),
      other: await make("other", "landlord"),
    };
  });
  const owner = t.withIdentity({ subject: "owner" }),
    staff = t.withIdentity({ subject: "staff" }),
    tenant = t.withIdentity({ subject: "tenant" }),
    other = t.withIdentity({ subject: "other" });
  const assets = [];
  for (let i = 0; i < 2; i++) {
    const response = await owner.fetch("/photos/upload", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
    expect(response.status).toBe(200);
    assets.push({
      storageId: (await response.json()).storageId,
      caption: `Synthetic photo ${i + 1}`,
    });
  }
  const listingId = await owner.mutation(api.listings.create, {
    landlordId: ids.owner,
    title: "Synthetic home",
    description: "Synthetic property",
    address: "PRIVATE STREET",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "House",
    amenities: [],
    photos: [],
    photoAssets: assets,
    petFriendly: true,
    utilitiesIncluded: true,
    parkingIncluded: true,
    availableFrom: clock,
    minStay: 1,
  });
  async function pay(plan: "landlord_pro" | "tenant_plus" = "landlord_pro") {
    await t.run((ctx) =>
      ctx.db.insert("subscriptions", {
        userId: ids.owner,
        creemSubscriptionId: "synthetic-paid",
        creemProductId: "prod_QA",
        plan,
        mode: "test",
        verifiedAt: clock,
        status: "active",
        paidThrough: clock + 3600000,
        currentPeriodStart: clock - 1,
        currentPeriodEnd: clock + 3600000,
        createdAt: clock,
        updatedAt: clock,
      }),
    );
    await t.mutation(internal.publication.reconcileOwner, {
      userId: ids.owner,
      cursor: null,
    });
  }
  async function verify(decision = "PASSED", corrupt = false) {
    let reference = "";
    const fetch = vi.fn(async (url: string, options?: any) => {
      if (url.includes("oauth2/token"))
        return new Response(
          JSON.stringify({ access_token: "synthetic-token", expires_in: 3600 }),
        );
      if (url.includes("account.amer-1")) {
        const body = JSON.parse(options.body);
        reference = body.customerInternalReference;
        expect(Object.keys(body).sort()).toEqual([
          "customerInternalReference",
          "workflowDefinition",
        ]);
        return new Response(
          JSON.stringify({
            account: { id: "synthetic-account" },
            workflowExecution: { id: "synthetic-workflow" },
            web: { href: "https://hosted.jumio.com/synthetic-session" },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          account: { id: corrupt ? "wrong-account" : "synthetic-account" },
          workflow: {
            id: "synthetic-workflow",
            status: "PROCESSED",
            definitionKey: "synthetic-id-selfie",
            customerInternalReference: reference,
          },
          credentials: [{ category: "ID" }, { category: "SELFIE" }],
          decision: { type: decision },
          extraction: { documentNumber: "PRIVATE_DOC_NUMBER" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    await owner.action(api.identity.start, {});
    await owner.action(api.identity.refresh, {});
    await t.mutation(internal.publication.reconcileOwner, {
      userId: ids.owner,
      cursor: null,
    });
    return fetch;
  }
  async function approve() {
    const l = await owner.query(api.listings.getById, { id: listingId });
    return staff.mutation(api.listings.approveListing, {
      id: listingId,
      expectedRevision: l!.revision,
      note: "Synthetic content reviewed",
    });
  }
  return {
    t,
    ids,
    owner,
    staff,
    tenant,
    other,
    listingId,
    pay,
    verify,
    approve,
  };
}
describe("publication and trusted owner verification", () => {
  it("keeps an owner's publication request offline until identity, content approval and landlord payment all exist", async () => {
    const f = await fixture();
    const requested = await f.owner.mutation(api.listings.publish, {
      id: f.listingId,
    });
    expect(requested.live).toBe(false);
    expect(requested.requested).toBe(true);
    expect(requested.issues).toHaveLength(3);
    expect(
      await f.t.query(api.listings.getById, { id: f.listingId }),
    ).toBeNull();
    await f.approve();
    await f.pay();
    expect(
      await f.t.query(api.listings.getById, { id: f.listingId }),
    ).toBeNull();
    await f.verify();
    expect(
      (await f.t.query(api.listings.getById, { id: f.listingId }))?.address,
    ).toBe("");
    expect(
      (await f.owner.query(api.listings.getById, { id: f.listingId }))?.address,
    ).toBe("PRIVATE STREET");
    expect(
      (await f.owner.query(api.publication.getReadiness, { id: f.listingId }))
        .live,
    ).toBe(true);
  });
  it("cannot self-approve, self-assign a verification badge, or expose another account's private status", async () => {
    const f = await fixture();
    await expect(
      f.owner.mutation(api.listings.approveListing, {
        id: f.listingId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      f.owner.mutation(api.users.updateProfile, {
        userId: f.ids.owner,
        linkedinVerified: true,
      }),
    ).rejects.toThrow("provider");
    await expect(
      f.other.query(api.publication.getReadiness, { id: f.listingId }),
    ).rejects.toThrow("Not authorized");
    expect(
      await f.other.query(api.users.getById, { id: f.ids.owner }),
    ).toBeNull();
    expect(
      await f.t.query(api.users.getPublicProfile, { userId: f.ids.owner }),
    ).not.toHaveProperty("email");
    await expect(f.t.action(api.identity.start, {})).rejects.toThrow("sign in");
  });
  it("does not let an admin approval unhide an owner-hidden listing", async () => {
    const f = await fixture();
    await f.verify();
    await f.pay();
    await f.approve();
    expect(
      await f.t.query(api.listings.getById, { id: f.listingId }),
    ).toBeNull();
    expect(
      (await f.owner.mutation(api.listings.publish, { id: f.listingId })).live,
    ).toBe(true);
    await f.owner.mutation(api.listings.unpublish, { id: f.listingId });
    await f.approve();
    expect(
      (await f.owner.query(api.publication.getReadiness, { id: f.listingId }))
        .requested,
    ).toBe(false);
    expect(
      await f.t.query(api.listings.getById, { id: f.listingId }),
    ).toBeNull();
  });
  it("invalidates approval on owner edits and binds staff decisions to the reviewed revision", async () => {
    const f = await fixture();
    await f.verify();
    await f.pay();
    await f.owner.mutation(api.listings.publish, { id: f.listingId });
    await f.approve();
    await f.owner.mutation(api.listings.update, {
      id: f.listingId,
      price: 1700,
    });
    expect(
      await f.t.query(api.listings.getById, { id: f.listingId }),
    ).toBeNull();
    await expect(
      f.staff.mutation(api.listings.approveListing, {
        id: f.listingId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("revision changed");
    await f.approve();
    expect(
      (await f.t.query(api.listings.getById, { id: f.listingId }))?.price,
    ).toBe(1700);
  });
  it("prevents incomplete content from being approved and preserves a useful offline checklist", async () => {
    const f = await fixture();
    await f.owner.mutation(api.listings.update, {
      id: f.listingId,
      photoAssets: [],
    });
    await expect(f.approve()).rejects.toThrow("two property photos");
    const state = await f.owner.mutation(api.listings.publish, {
      id: f.listingId,
    });
    expect(state.issues.join(" ")).toContain("two property photos");
    expect(state.live).toBe(false);
  });
  it("rejects legacy active status and a tenant-only subscription as publication authority", async () => {
    const f = await fixture();
    await f.t.run((ctx) => ctx.db.patch(f.listingId, { status: "active" }));
    expect(
      await f.t.query(api.listings.getById, { id: f.listingId }),
    ).toBeNull();
    await f.owner.mutation(api.listings.publish, { id: f.listingId });
    await f.verify();
    await f.pay("tenant_plus");
    await f.approve();
    expect(
      (await f.owner.query(api.publication.getReadiness, { id: f.listingId }))
        .issues,
    ).toContain("Confirm an active paid landlord subscription.");
  });
  it("removes eligibility across read and contact paths when paid access ends", async () => {
    const f = await fixture();
    await f.verify();
    await f.pay();
    await f.owner.mutation(api.listings.publish, { id: f.listingId });
    await f.approve();
    await f.tenant.mutation(api.saved.save, {
      tenantId: f.ids.tenant,
      listingId: f.listingId,
    });
    vi.setSystemTime(clock + 3600001);
    expect(
      await f.t.query(api.listings.getById, { id: f.listingId }),
    ).toBeNull();
    expect(
      (
        await f.t.query(api.search.listings, {
          propertyId: f.listingId,
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page,
    ).toEqual([]);
    expect(
      await f.t.query(api.listings.getByLandlord, { landlordId: f.ids.owner }),
    ).toEqual([]);
    expect(
      await f.t.query(api.availability.getByListing, {
        listingId: f.listingId,
      }),
    ).toEqual([]);
    expect(
      await f.tenant.query(api.saved.getSaved, { tenantId: f.ids.tenant }),
    ).toEqual([]);
    await expect(
      f.tenant.mutation(api.inquiries.create, {
        listingId: f.listingId,
        moveIn: clock + 86400000,
        moveOut: clock + 31 * 86400000,
        occupants: 1,
        pets: false,
        message: "Synthetic inquiry",
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      f.tenant.mutation(api.messages.sendMessage, {
        senderId: f.ids.tenant,
        receiverId: f.ids.owner,
        listingId: f.listingId,
        content: "Synthetic contact",
      }),
    ).rejects.toThrow("not accepting");
  });
  it("reuses a hosted session and token, stores only status metadata, and publishes only a bound provider pass", async () => {
    const f = await fixture(),
      fetch = await f.verify();
    const mine = await f.owner.query(api.identity.mine, {});
    expect(mine.status).toBe("passed");
    expect(await f.owner.action(api.identity.start, {})).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    const checks = await f.t.run((ctx) =>
      ctx.db.query("identityChecks").collect(),
    );
    expect(JSON.stringify(checks)).not.toContain("PRIVATE_DOC_NUMBER");
    expect(checks[0].hostedUrl).toBeUndefined();
    expect(
      await f.t.query(api.users.getPublicProfile, { userId: f.ids.owner }),
    ).toMatchObject({ identityVerified: true, linkedinVerified: false });
  });
  it("does not treat a provider warning or a mismatched response as verified", async () => {
    const f = await fixture();
    await f.verify("WARNING");
    expect((await f.owner.query(api.identity.mine, {})).status).toBe("review");
    expect(
      (await f.t.query(api.users.getPublicProfile, { userId: f.ids.owner }))
        ?.identityVerified,
    ).toBe(false);
    const g = await fixture();
    await expect(g.verify("PASSED", true)).rejects.toThrow("does not match");
    expect((await g.owner.query(api.identity.mine, {})).status).toBe("pending");
  });
  it("fails closed when identity setup is missing or the provider returns an unsafe link", async () => {
    const f = await fixture();
    vi.stubEnv("JUMIO_CLIENT_SECRET", "");
    await expect(f.owner.action(api.identity.start, {})).rejects.toThrow(
      "not configured",
    );
    expect((await f.owner.query(api.identity.mine, {})).configured).toBe(false);
    vi.stubEnv("JUMIO_CLIENT_SECRET", "synthetic-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("oauth2")
          ? new Response(
              JSON.stringify({ access_token: "synthetic", expires_in: 3600 }),
            )
          : new Response(
              JSON.stringify({
                account: { id: "account" },
                workflowExecution: { id: "workflow" },
                web: { href: "https://attacker.example/collect-id" },
              }),
            ),
      ),
    );
    await expect(f.owner.action(api.identity.start, {})).rejects.toThrow(
      "Contact support",
    );
    expect((await f.owner.query(api.identity.mine, {})).status).toBe("review");
  });
  it("keeps an approved revision live when an owner saves unchanged content", async () => {
    const f = await fixture();
    await f.verify();
    await f.pay();
    await f.owner.mutation(api.listings.publish, { id: f.listingId });
    await f.approve();
    const before = (await f.owner.query(api.listings.getById, {
      id: f.listingId,
    }))!;
    await f.owner.mutation(api.listings.update, {
      id: f.listingId,
      price: before.price,
      photos: [],
      photoAssets: before.photoAssets,
    });
    expect(
      await f.owner.query(api.publication.getReadiness, { id: f.listingId }),
    ).toMatchObject({ live: true, revision: before.revision });
  });

  it("lets staff hold identity immediately and requires a fresh provider pass before restoring it", async () => {
    const f = await fixture();
    await f.verify();
    await f.pay();
    await f.owner.mutation(api.listings.publish, { id: f.listingId });
    await f.approve();
    const check = (await f.owner.query(api.identity.mine, {})).reference!;
    await expect(
      f.owner.mutation(api.identity.review, {
        id: check,
        action: "hold",
        note: "Self review",
      }),
    ).rejects.toThrow("Staff access");
    await f.staff.mutation(api.identity.review, {
      id: check,
      action: "hold",
      note: "Synthetic review hold",
    });
    expect(
      await f.t.query(api.listings.getById, { id: f.listingId }),
    ).toBeNull();
    await f.owner.action(api.identity.refresh, {});
    expect((await f.owner.query(api.identity.mine, {})).status).toBe("review");
    await f.staff.mutation(api.identity.review, {
      id: check,
      action: "recheck",
      note: "Synthetic case reviewed; request authoritative result",
    });
    expect((await f.owner.query(api.identity.mine, {})).status).toBe("pending");
    await f.owner.action(api.identity.refresh, {});
    await f.t.mutation(internal.publication.reconcileOwner, {
      userId: f.ids.owner,
      cursor: null,
    });
    expect(
      (await f.owner.query(api.publication.getReadiness, { id: f.listingId }))
        .live,
    ).toBe(true);
    expect(
      await f.t.run((ctx) => ctx.db.query("identityReviewAudit").collect()),
    ).toHaveLength(2);
  });
  it("can restart a resumable session explicitly without reusing its old workflow result", async () => {
    const f = await fixture();
    let created = 0;
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: any) => {
        if (url.includes("oauth2"))
          return new Response(
            JSON.stringify({
              access_token: "synthetic-token",
              expires_in: 3600,
            }),
          );
        methods.push(options.method);
        created++;
        return new Response(
          JSON.stringify({
            account: { id: "synthetic-account" },
            workflowExecution: { id: `synthetic-workflow-${created}` },
            web: {
              href: `https://hosted.jumio.com/synthetic-session-${created}`,
            },
          }),
        );
      }),
    );
    await f.owner.action(api.identity.start, {});
    const first = (await f.owner.query(api.identity.mine, {})).reference!;
    vi.setSystemTime(clock + 3600001);
    await f.owner.action(api.identity.start, { retryExpired: true });
    const second = (await f.owner.query(api.identity.mine, {})).reference!;
    expect(methods).toEqual(["POST", "PUT"]);
    expect(second).not.toBe(first);
    await f.t.mutation(internal.identity.apply, {
      id: first,
      status: "passed",
    });
    expect((await f.owner.query(api.identity.mine, {})).status).toBe("pending");
  });
  it("rejects an in-flight identity result superseded by staff review", async () => {
    const f = await fixture();
    await f.verify();
    const id = (await f.owner.query(api.identity.mine, {})).reference!;
    await f.staff.mutation(api.identity.review, {
      id,
      action: "hold",
      note: "Synthetic hold",
    });
    await f.staff.mutation(api.identity.review, {
      id,
      action: "recheck",
      note: "Synthetic fresh result required",
    });
    const claimed = await f.t.mutation(internal.identity.claim, { id });
    expect(claimed).not.toBeNull();
    await f.staff.mutation(api.identity.review, {
      id,
      action: "hold",
      note: "Synthetic hold supersedes result",
    });
    await f.staff.mutation(api.identity.review, {
      id,
      action: "recheck",
      note: "Synthetic second recheck",
    });
    await f.t.mutation(internal.identity.apply, {
      id,
      status: "passed",
      generation: claimed!.refreshGeneration,
    });
    expect((await f.owner.query(api.identity.mine, {})).status).toBe("pending");
  });
});
