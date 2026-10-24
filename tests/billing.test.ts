import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { paidAccess } from "../lib/billing";
const modules = import.meta.glob("../convex/**/*.ts");
const clock = Date.UTC(2026, 9, 24),
  end = clock + 30 * 86400000,
  secret = "synthetic-unit-test-signing-secret";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  vi.stubEnv("CREEM_API_KEY", "creem_test_synthetic");
  vi.stubEnv("CREEM_PRODUCT_LANDLORD_PRO", "prod_proQA");
  vi.stubEnv("CREEM_PRODUCT_FEATURE_LISTING", "prod_boostQA");
  vi.stubEnv("CREEM_WEBHOOK_SECRET", secret);
  vi.stubEnv("APP_URL", "http://localhost:3015");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "billing-owner",
      role: "landlord",
      name: "Owner",
      email: "owner@example.test",
      createdAt: 0,
    }),
  );
  const otherId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "billing-other",
      role: "landlord",
      name: "Other",
      email: "other@example.test",
      createdAt: 0,
    }),
  );
  const owner = t.withIdentity({ subject: "billing-owner" }),
    other = t.withIdentity({ subject: "billing-other" });
  const requestId = "11111111-1111-4111-8111-111111111111";
  const prepare = () =>
    owner.mutation(internal.payments.prepareCheckout, {
      userId,
      productId: "prod_proQA",
      purpose: "subscription",
      plan: "landlord_pro",
      mode: "test",
      returnUrl: "http://localhost:3015/billing/success",
      clientRequestId: requestId,
    });
  async function wire(event: object, signature?: string) {
    const body = JSON.stringify(event);
    return t.fetch("/webhooks/creem", {
      method: "POST",
      headers: {
        "creem-signature":
          signature ?? createHmac("sha256", secret).update(body).digest("hex"),
      },
      body,
    });
  }
  return { t, userId, otherId, owner, other, prepare, wire, requestId };
}
function paid(
  requestId: string,
  type = "subscription.paid",
  at = clock - 100,
  status = "active",
) {
  return {
    id: `evt_${type}_${at}`,
    eventType: type,
    created_at: at,
    object: {
      id: "sub_synthetic",
      product: { id: "prod_proQA" },
      customer: { id: "cust_synthetic" },
      mode: "test",
      status,
      metadata: { requestId },
      last_transaction_id: "tran_synthetic",
      current_period_start_date: new Date(clock - 1000).toISOString(),
      current_period_end_date: new Date(end).toISOString(),
    },
  };
}
function checkout(requestId: string) {
  return {
    id: "evt_checkout",
    eventType: "checkout.completed",
    created_at: clock - 500,
    object: {
      id: "ch_synthetic",
      request_id: requestId,
      mode: "test",
      status: "completed",
      product: { id: "prod_proQA" },
      customer: { id: "cust_synthetic" },
      order: {
        id: "ord_synthetic",
        status: "paid",
        product: "prod_proQA",
        customer: "cust_synthetic",
        amount: 4900,
        currency: "USD",
      },
      subscription: { id: "sub_synthetic" },
    },
  };
}
describe("trusted billing", () => {
  it("authorizes account reads, checkout actions, server-only pending records and return URLs", async () => {
    const f = await fixture(),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      f.other.query(api.payments.getPaymentsByUser, { userId: f.userId }),
    ).rejects.toThrow("Not authorized");
    await expect(
      f.t.query(api.payments.getActiveSubscription, { userId: f.userId }),
    ).rejects.toThrow("sign in");
    await expect(
      f.other.action(api.creem.createSubscriptionCheckout, {
        userId: f.userId,
        plan: "landlord_pro",
        successUrl: "http://localhost:3015/billing/success",
      }),
    ).rejects.toThrow("another account");
    await expect(
      f.owner.action(api.creem.createSubscriptionCheckout, {
        userId: f.userId,
        plan: "landlord_pro",
        successUrl: "https://attacker.example/billing/success",
      }),
    ).rejects.toThrow("return address");
    await expect(
      f.owner.mutation(api.payments.recordPendingCheckout, {
        userId: f.userId,
        creemCheckoutId: "fake",
        productId: "prod_proQA",
        purpose: "subscription",
        amountCents: 0,
        currency: "USD",
      }),
    ).rejects.toThrow("authenticated billing action");
    expect(
      await f.other.query(api.payments.resolveUserId, {
        clerkId: "billing-owner",
      }),
    ).toBeNull();
    expect(
      await f.owner.query(api.payments.resolveUserId, {
        clerkId: "billing-owner",
      }),
    ).toBe(f.userId);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reuses checkout request IDs, persists before the provider call and uses the account email", async () => {
    const f = await fixture();
    const fetch = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      expect(body.customer.email).toBe("owner@example.test");
      expect(body.customer_email).toBeUndefined();
      expect(
        await f.owner.query(api.payments.getPaymentsByUser, {
          userId: f.userId,
        }),
      ).toHaveLength(1);
      return new Response(
        JSON.stringify({
          id: "ch_synthetic",
          checkout_url: "https://creem.io/test/payment/synthetic",
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const args = {
      userId: f.userId,
      plan: "landlord_pro" as const,
      customerEmail: "spoofed@example.test",
      successUrl: "http://localhost:3015/billing/success",
      clientRequestId: f.requestId,
    };
    const first = await f.owner.action(
      api.creem.createSubscriptionCheckout,
      args,
    );
    expect(
      await f.owner.action(api.creem.createSubscriptionCheckout, args),
    ).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      f.owner.action(api.creem.createSubscriptionCheckout, {
        ...args,
        successUrl: "http://localhost:3015/pricing",
      }),
    ).rejects.toThrow("already used");
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
  });
  it("checks signature, payload limit, association and environment without applying partial state", async () => {
    const f = await fixture(),
      request = await f.prepare();
    expect((await f.wire(paid(request.requestId!), "bad")).status).toBe(401);
    expect(
      (
        await f.t.fetch("/webhooks/creem", {
          method: "POST",
          headers: { "content-length": "300000" },
          body: "x",
        })
      ).status,
    ).toBe(413);
    const mismatch = paid(request.requestId!);
    mismatch.object.mode = "prod";
    expect((await f.wire(mismatch)).status).toBe(503);
    expect((await f.wire(paid("unmatched"))).status).toBe(503);
    expect(
      await f.t.run((ctx) => ctx.db.query("webhookEvents").collect()),
    ).toEqual([]);
    expect(
      await f.t.run((ctx) => ctx.db.query("subscriptions").collect()),
    ).toEqual([]);
  });
  it("handles checkout/paid reordering and concurrent duplicate deliveries atomically", async () => {
    const f = await fixture(),
      request = await f.prepare();
    const results = await Promise.all([
      f.wire(paid(request.requestId!)),
      f.wire(paid(request.requestId!)),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await f.t.run((ctx) => ctx.db.query("subscriptions").collect()),
    ).toHaveLength(1);
    expect(
      await f.t.run((ctx) => ctx.db.query("webhookEvents").collect()),
    ).toHaveLength(1);
    const sub = await f.owner.query(api.payments.getActiveSubscription, {
      userId: f.userId,
    });
    expect(sub?.paidThrough).toBe(end);
    expect((await f.wire(checkout(request.requestId!))).status).toBe(200);
    expect(
      (
        await f.owner.query(api.payments.getActiveSubscription, {
          userId: f.userId,
        })
      )?.paidThrough,
    ).toBe(end);
    expect(
      (
        await f.owner.query(api.payments.getCheckout, {
          checkoutId: "ch_synthetic",
        })
      )?.status,
    ).toBe("completed");
    expect(
      await f.other.query(api.payments.getCheckout, {
        checkoutId: "ch_synthetic",
      }),
    ).toBeNull();
  });
  it("does not grant paid access from a checkout redirect, trial, active sync or legacy active record", async () => {
    const f = await fixture(),
      request = await f.prepare();
    expect((await f.wire(checkout(request.requestId!))).status).toBe(200);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    expect(
      (
        await f.wire(
          paid(request.requestId!, "subscription.active", clock - 300),
        )
      ).status,
    ).toBe(200);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    expect(
      (
        await f.wire(
          paid(
            request.requestId!,
            "subscription.trialing",
            clock - 200,
            "trialing",
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    expect(
      paidAccess({
        status: "active",
        plan: "landlord_pro",
        currentPeriodEnd: end,
        mode: "test",
      }),
    ).toBe(false);
  });
  it("keeps paid access through scheduled cancellation, revokes on failure/cancel and rejects stale grants", async () => {
    const f = await fixture(),
      request = await f.prepare();
    await f.wire(paid(request.requestId!));
    await f.wire(
      paid(
        request.requestId!,
        "subscription.scheduled_cancel",
        clock - 90,
        "scheduled_cancel",
      ),
    );
    expect(
      (
        await f.owner.query(api.payments.getActiveSubscription, {
          userId: f.userId,
        })
      )?.cancelAtPeriodEnd,
    ).toBe(true);
    await f.wire(
      paid(request.requestId!, "subscription.past_due", clock - 80, "past_due"),
    );
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    const old = paid(request.requestId!, "subscription.paid", clock - 100);
    old.id = "evt_delayed_paid";
    expect((await (await f.wire(old)).json()).outcome).toBe("stale_event");
    await f.wire(paid(request.requestId!, "subscription.paid", clock - 70));
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).not.toBeNull();
    await f.wire(
      paid(request.requestId!, "subscription.canceled", clock - 60, "canceled"),
    );
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
  });
  it("uses real paid periods and the current billing environment", async () => {
    const f = await fixture(),
      request = await f.prepare();
    await f.wire(paid(request.requestId!));
    vi.stubEnv("CREEM_API_KEY", "creem_live_synthetic");
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    vi.stubEnv("CREEM_API_KEY", "creem_test_synthetic");
    vi.setSystemTime(end + 1);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
  });
  it("resolves the portal customer server-side and rejects another environment", async () => {
    const f = await fixture(),
      request = await f.prepare();
    await f.wire(checkout(request.requestId!));
    const fetch = vi.fn(async (_url, opts) => {
      expect(JSON.parse(opts.body)).toEqual({ customer_id: "cust_synthetic" });
      return new Response(
        JSON.stringify({
          customer_portal_link: "https://creem.io/my-orders/login/synthetic",
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    expect(await f.owner.action(api.creem.createCustomerPortal, {})).toContain(
      "creem.io",
    );
    await expect(
      f.other.action(api.creem.createCustomerPortal, {}),
    ).rejects.toThrow("No verified billing");
    vi.stubEnv("CREEM_API_KEY", "creem_live_synthetic");
    await expect(
      f.owner.action(api.creem.createCustomerPortal, {}),
    ).rejects.toThrow("different environment");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("handles partial/full refunds and prevents old paid events from restoring access", async () => {
    const f = await fixture(),
      request = await f.prepare();
    await f.wire(checkout(request.requestId!));
    await f.wire(paid(request.requestId!));
    const event = {
      id: "evt_partial",
      eventType: "refund.created",
      created_at: clock - 50,
      object: {
        id: "ref_synthetic",
        status: "succeeded",
        mode: "test",
        customer: "cust_synthetic",
        checkout: { id: "ch_synthetic", request_id: request.requestId },
        order: { product: "prod_proQA" },
        transaction: {
          id: "tran_synthetic",
          subscription: "sub_synthetic",
          amount_paid: 4900,
          refunded_amount: 100,
        },
      },
    };
    expect((await f.wire(event)).status).toBe(200);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).not.toBeNull();
    event.id = "evt_full";
    event.created_at = clock - 40;
    event.object.transaction.refunded_amount = 4900;
    expect((await f.wire(event)).status).toBe(200);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    expect(
      (
        await f.owner.query(api.payments.getCheckout, {
          checkoutId: "ch_synthetic",
        })
      )?.status,
    ).toBe("refunded");
    const old = paid(request.requestId!);
    old.id = "evt_paid_after_refund";
    await f.wire(old);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
  });
  it("exposes the complete private payment history through cursor pages", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 65; i++)
        await ctx.db.insert("payments", {
          userId: f.userId,
          creemCheckoutId: `ch_${i}`,
          productId: "prod_proQA",
          purpose: "subscription",
          amountCents: 4900,
          currency: "USD",
          status: "completed",
          createdAt: i,
        });
    });
    let cursor: string | null = null,
      count = 0;
    while (true) {
      const page: FunctionReturnType<typeof api.payments.listPayments> =
        await f.owner.query(api.payments.listPayments, {
          userId: f.userId,
          paginationOpts: { cursor, numItems: 20 },
        });
      count += page.page.length;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(count).toBe(65);
    await expect(
      f.other.query(api.payments.listPayments, {
        userId: f.userId,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
    ).rejects.toThrow("Not authorized");
  });
  it("does not let a re-issued paid event restore a fully refunded transaction", async () => {
    const f = await fixture(),
      request = await f.prepare();
    await f.wire(checkout(request.requestId!));
    await f.wire(paid(request.requestId!));
    const refund = {
      id: "evt_reverse",
      eventType: "refund.created",
      created_at: clock - 50,
      object: {
        id: "ref_reverse",
        status: "succeeded",
        mode: "test",
        customer: "cust_synthetic",
        checkout: { id: "ch_synthetic" },
        order: { product: "prod_proQA" },
        transaction: {
          id: "tran_synthetic",
          subscription: "sub_synthetic",
          amount_paid: 4900,
          refunded_amount: 4900,
        },
      },
    };
    await f.wire(refund);
    const newer = paid(request.requestId!, "subscription.paid", clock - 10);
    expect((await (await f.wire(newer)).json()).outcome).toBe(
      "paid_transaction_reversed",
    );
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    const partial = structuredClone(refund);
    partial.id = "evt_late_partial";
    partial.object.transaction.refunded_amount = 100;
    await f.wire(partial);
    expect(
      (
        await f.owner.query(api.payments.getCheckout, {
          checkoutId: "ch_synthetic",
        })
      )?.status,
    ).toBe("refunded");
  });
  it("places a disputed current payment on hold, including after later payment events", async () => {
    const f = await fixture(),
      request = await f.prepare();
    await f.wire(checkout(request.requestId!));
    await f.wire(paid(request.requestId!));
    const dispute = {
      id: "evt_dispute",
      eventType: "dispute.created",
      created_at: clock - 40,
      object: {
        id: "disp_synthetic",
        mode: "test",
        customer: "cust_synthetic",
        checkout: { id: "ch_synthetic" },
        order: { product: "prod_proQA" },
        transaction: {
          id: "tran_synthetic",
          subscription: "sub_synthetic",
          amount_paid: 4900,
        },
      },
    };
    expect((await f.wire(dispute)).status).toBe(200);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    const newer = paid(request.requestId!, "subscription.paid", clock - 10);
    newer.object.last_transaction_id = "tran_new_synthetic";
    await f.wire(newer);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    expect(
      (await f.owner.query(api.payments.getSubscription, { userId: f.userId }))
        ?.billingHold,
    ).toBe(true);
  });
  it("syncs a configured plan change without granting the new plan until payment", async () => {
    const f = await fixture(),
      request = await f.prepare();
    await f.wire(paid(request.requestId!));
    vi.stubEnv("CREEM_PRODUCT_LANDLORD_PREMIUM", "prod_premiumQA");
    const update = paid(request.requestId!, "subscription.update", clock - 50);
    update.object.product.id = "prod_premiumQA";
    await f.wire(update);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    const settled = paid(request.requestId!, "subscription.paid", clock - 40);
    settled.object.product.id = "prod_premiumQA";
    settled.object.last_transaction_id = "tran_premiumQA";
    await f.wire(settled);
    expect(
      (
        await f.owner.query(api.payments.getActiveSubscription, {
          userId: f.userId,
        })
      )?.plan,
    ).toBe("landlord_premium");
    const expired = paid(
      request.requestId!,
      "subscription.expired",
      clock - 30,
    );
    expired.object.product.id = "prod_premiumQA";
    await f.wire(expired);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
  });

  it("refreshes reactive entitlement state when the confirmed paid period expires", async () => {
    const f = await fixture(),
      request = await f.prepare();
    const expiring = paid(request.requestId!);
    const expires = clock + 60000;
    expiring.object.current_period_end_date = new Date(expires).toISOString();
    await f.wire(expiring);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await f.owner.query(api.payments.getActiveSubscription, {
        userId: f.userId,
      }),
    ).toBeNull();
    expect(
      (await f.owner.query(api.payments.getSubscription, { userId: f.userId }))
        ?.entitlementCheckedAt,
    ).toBeGreaterThanOrEqual(expires);
  });
  it("binds boosts to the owned listing and reverses only the refunded boost", async () => {
    const f = await fixture();
    const listingId = await f.t.run((ctx) =>
      ctx.db.insert("listings", {
        landlordId: f.userId,
        title: "Synthetic boost",
        description: "Synthetic",
        address: "Synthetic",
        city: "Austin",
        state: "TX",
        zip: "78701",
        price: 1000,
        bedrooms: 1,
        bathrooms: 1,
        propertyType: "Apartment",
        amenities: [],
        photos: [],
        petFriendly: false,
        utilitiesIncluded: true,
        parkingIncluded: false,
        availableFrom: clock,
        minStay: 1,
        status: "pending",
        createdAt: clock,
        views: 0,
      }),
    );
    await expect(
      f.other.action(api.creem.createFeatureListingCheckout, {
        userId: f.otherId,
        listingId,
        successUrl: "http://localhost:3015/billing/success",
      }),
    ).rejects.toThrow("Not authorized");
    async function boost(uuid: string, checkoutId: string, eventId: string) {
      const p = await f.owner.mutation(internal.payments.prepareCheckout, {
        userId: f.userId,
        listingId,
        productId: "prod_boostQA",
        purpose: "feature_listing",
        mode: "test",
        returnUrl: "http://localhost:3015/billing/success",
        clientRequestId: uuid,
      });
      const event = checkout(p.requestId!);
      event.id = eventId;
      event.object.id = checkoutId;
      event.object.product.id = "prod_boostQA";
      event.object.order.product = "prod_boostQA";
      await f.wire(event);
      return p;
    }
    const old = await boost(f.requestId, "ch_boostOld", "evt_boostOld");
    const newer = await boost(
      "22222222-2222-4222-8222-222222222222",
      "ch_boostNew",
      "evt_boostNew",
    );
    expect(
      (await f.owner.query(api.listings.getById, { id: listingId }))?.featured,
    ).toBe(true);
    vi.stubEnv("CREEM_API_KEY", "creem_live_synthetic");
    expect(
      (await f.owner.query(api.listings.getById, { id: listingId }))?.featured,
    ).toBe(false);
    vi.stubEnv("CREEM_API_KEY", "creem_test_synthetic");
    const refund = (checkoutId: string, id: string) => ({
      id,
      eventType: "refund.created",
      created_at: clock - 10,
      object: {
        id: `ref_${id}`,
        status: "succeeded",
        mode: "test",
        customer: "cust_synthetic",
        checkout: { id: checkoutId },
        order: { product: "prod_boostQA" },
        transaction: {
          id: `tran_${id}`,
          amount_paid: 4900,
          refunded_amount: 4900,
        },
      },
    });
    await f.wire(refund("ch_boostOld", "evt_refundOld"));
    expect(
      (await f.t.run((ctx) => ctx.db.get(listingId)))?.featuredPaymentId,
    ).toBe(newer._id);
    expect((await f.t.run((ctx) => ctx.db.get(listingId)))?.featured).toBe(
      true,
    );
    await f.wire(refund("ch_boostNew", "evt_refundNew"));
    expect((await f.t.run((ctx) => ctx.db.get(listingId)))?.featured).toBe(
      false,
    );
  });
});
