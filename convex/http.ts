import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

type CreemWebhookEvent = {
  id: string;
  type: string;
  timestamp?: string;
  data: {
    id: string;
    status?: string;
    amount_cents?: number;
    currency?: string;
    customer_id?: string;
    product_id?: string;
    checkout_id?: string;
    subscription_id?: string;
    transaction_id?: string;
    metadata?: {
      userId?: string;
      listingId?: string;
      purpose?: string;
      plan?: string;
    };
    current_period_start?: number;
    current_period_end?: number;
    cancel_at_period_end?: boolean;
  };
};

async function verifyCreemSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const sig = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (sig.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function pickSubStatus(
  eventType: string
): "active" | "trialing" | "paused" | "canceled" | "expired" {
  switch (eventType) {
    case "subscription.active":
    case "subscription.updated":
    case "subscription.resumed":
      return "active";
    case "subscription.paused":
      return "paused";
    case "subscription.canceled":
      return "canceled";
    default:
      return "active";
  }
}

function pickPlan(
  plan: string | undefined
): "landlord_pro" | "landlord_premium" | "tenant_plus" | null {
  if (
    plan === "landlord_pro" ||
    plan === "landlord_premium" ||
    plan === "tenant_plus"
  ) {
    return plan;
  }
  return null;
}

const handleCreemWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("creem-signature") ??
    request.headers.get("x-creem-signature") ??
    "";

  const valid = await verifyCreemSignature(
    rawBody,
    signatureHeader,
    webhookSecret
  );
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: CreemWebhookEvent;
  try {
    event = JSON.parse(rawBody) as CreemWebhookEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Idempotency check
  const existing = await ctx.runQuery(internal.payments.findWebhookEvent, {
    source: "creem",
    eventId: event.id,
  });
  if (existing) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "checkout.completed":
      case "transaction.completed": {
        const checkoutId = event.data.checkout_id ?? event.data.id ?? "";
        if (checkoutId) {
          await ctx.runMutation(internal.payments.applyCheckoutCompleted, {
            creemCheckoutId: checkoutId,
            creemTransactionId: event.data.transaction_id,
            creemCustomerId: event.data.customer_id,
            amountCents: event.data.amount_cents,
            currency: event.data.currency,
          });
        }
        break;
      }

      case "subscription.active":
      case "subscription.updated":
      case "subscription.resumed": {
        const subId = event.data.subscription_id ?? event.data.id;
        const metaUserId = event.data.metadata?.userId;
        const plan = pickPlan(event.data.metadata?.plan);
        if (subId && metaUserId && plan) {
          await ctx.runMutation(internal.payments.upsertSubscription, {
            userId: metaUserId as Id<"users">,
            creemSubscriptionId: subId,
            creemCustomerId: event.data.customer_id,
            creemProductId: event.data.product_id ?? "",
            plan,
            status: pickSubStatus(event.type),
            currentPeriodStart:
              event.data.current_period_start ?? Date.now(),
            currentPeriodEnd:
              event.data.current_period_end ??
              Date.now() + 30 * 24 * 3600 * 1000,
            cancelAtPeriodEnd: event.data.cancel_at_period_end,
          });
        } else if (subId) {
          await ctx.runMutation(internal.payments.patchSubscriptionStatus, {
            creemSubscriptionId: subId,
            status: pickSubStatus(event.type),
            cancelAtPeriodEnd: event.data.cancel_at_period_end,
          });
        }
        break;
      }

      case "subscription.paused":
      case "subscription.canceled": {
        const subId = event.data.subscription_id ?? event.data.id;
        if (subId) {
          await ctx.runMutation(internal.payments.patchSubscriptionStatus, {
            creemSubscriptionId: subId,
            status: pickSubStatus(event.type),
            cancelAtPeriodEnd: event.data.cancel_at_period_end,
          });
        }
        break;
      }

      default:
        // Acknowledge other events (checkout.created, customer.created, etc)
        break;
    }

    await ctx.runMutation(internal.payments.recordWebhookEvent, {
      source: "creem",
      eventId: event.id,
      eventType: event.type,
      payload: rawBody.slice(0, 20000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return new Response(
      JSON.stringify({ error: "webhook processing failed", detail: message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

const http = httpRouter();

http.route({
  path: "/webhooks/creem",
  method: "POST",
  handler: handleCreemWebhook,
});

export default http;
