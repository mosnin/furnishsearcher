import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const envText = readFileSync(".env.local", "utf8");
const url = envText
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
  .trim()
  .replace(/^"|"$/g, "");
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Billing smoke refuses hosted targets",
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(envText) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(envText),
  "Billing smoke requires the isolated anonymous backend",
);
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), config.ports.cloud);
const site = `http://127.0.0.1:${config.ports.site}`;
const secretFile = ".convex/local-billing-smoke-secret.json";
const secret = existsSync(secretFile)
  ? JSON.parse(readFileSync(secretFile, "utf8")).secret
  : randomBytes(32).toString("hex");
assert(/^[a-f0-9]{64}$/.test(secret));
const env = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete env[key];
function cli(args) {
  return spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--env-file", ".env.local"],
    { env, encoding: "utf8" },
  );
}
function configure(name, value) {
  const current = cli(["env", "get", name]);
  if (current.status === 0 && current.stdout.trim())
    assert.equal(
      current.stdout.trim(),
      value,
      `Refusing to overwrite an existing local ${name}`,
    );
  else {
    if (
      current.status !== 0 &&
      !/not found|not set|does not exist|could not find/i.test(
        current.stderr + current.stdout,
      )
    )
      throw new Error(`Unable to inspect local ${name}`);
    const result = cli(["env", "set", name, value]);
    if (result.status !== 0)
      throw new Error(`Unable to configure local ${name}`);
  }
}
configure("CREEM_API_KEY", "creem_test_local_synthetic");
configure("CREEM_PRODUCT_LANDLORD_PRO", "prod_localQA");
configure("CREEM_WEBHOOK_SECRET", secret);
configure("APP_URL", "http://localhost:3015");
writeFileSync(secretFile, JSON.stringify({ secret }), { mode: 0o600 });
function client(subject) {
  const c = new ConvexHttpClient(url);
  c.setAdminAuth(config.adminKey, {
    subject,
    issuer: "https://qa.furnishsearcher.invalid",
  });
  return c;
}
const owner = client("qa-billing-owner"),
  other = client("qa-billing-other");
const user = await owner.mutation(makeFunctionReference("users:getOrCreate"), {
  clerkId: "qa-billing-owner",
  name: "Synthetic QA Billing Owner",
  email: "qa-billing-owner@example.test",
});
await other.mutation(makeFunctionReference("users:getOrCreate"), {
  clerkId: "qa-billing-other",
  name: "Synthetic QA Billing Other",
  email: "qa-billing-other@example.test",
});
const run = randomUUID(),
  suffix = run.replaceAll("-", "");
const pending = await owner.mutation(
  makeFunctionReference("payments:prepareCheckout"),
  {
    userId: user._id,
    productId: "prod_localQA",
    plan: "landlord_pro",
    purpose: "subscription",
    mode: "test",
    returnUrl: "http://localhost:3015/billing/success",
    clientRequestId: run,
  },
);
const base = Date.now() - 1000,
  start = new Date(base).toISOString(),
  end = new Date(Date.now() + 30 * 86400000).toISOString();
const subscriptionId = `sub_QA${suffix}`,
  customerId = `cust_QA${suffix}`,
  checkoutId = `ch_QA${suffix}`;
async function send(event) {
  const body = JSON.stringify(event),
    signature = createHmac("sha256", secret).update(body).digest("hex");
  const response = await fetch(`${site}/webhooks/creem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "creem-signature": signature,
    },
    body,
  });
  assert.equal(response.status, 200, "Signed local webhook was rejected");
  return response.json();
}
const checkout = {
  id: `evt_checkout${suffix}`,
  eventType: "checkout.completed",
  created_at: base,
  object: {
    id: checkoutId,
    request_id: pending.requestId,
    mode: "test",
    status: "completed",
    product: "prod_localQA",
    customer: customerId,
    order: {
      id: `ord_QA${suffix}`,
      product: "prod_localQA",
      customer: customerId,
      status: "paid",
      amount: 4900,
      currency: "USD",
    },
    subscription: { id: subscriptionId },
  },
};
await send(checkout);
assert.equal(
  await owner.query(makeFunctionReference("payments:getActiveSubscription"), {
    userId: user._id,
  }),
  null,
  "Checkout alone must not grant paid access",
);
const paid = {
  id: `evt_paid${suffix}`,
  eventType: "subscription.paid",
  created_at: base + 100,
  object: {
    id: subscriptionId,
    product: "prod_localQA",
    customer: customerId,
    mode: "test",
    status: "active",
    metadata: { requestId: pending.requestId },
    last_transaction_id: `tran_QA${suffix}`,
    current_period_start_date: start,
    current_period_end_date: end,
  },
};
const duplicate = await Promise.all([send(paid), send(paid)]);
assert(duplicate.some((result) => result.outcome === "duplicate"));
assert.equal(
  (
    await owner.query(makeFunctionReference("payments:getActiveSubscription"), {
      userId: user._id,
    })
  ).creemSubscriptionId,
  subscriptionId,
);
await assert.rejects(
  other.query(makeFunctionReference("payments:getPaymentsByUser"), {
    userId: user._id,
  }),
);
await send({
  ...paid,
  id: `evt_schedule${suffix}`,
  eventType: "subscription.scheduled_cancel",
  created_at: base + 200,
  object: { ...paid.object, status: "scheduled_cancel" },
});
assert.equal(
  (
    await owner.query(makeFunctionReference("payments:getActiveSubscription"), {
      userId: user._id,
    })
  ).cancelAtPeriodEnd,
  true,
);
await send({
  ...paid,
  id: `evt_cancel${suffix}`,
  eventType: "subscription.canceled",
  created_at: base + 300,
  object: { ...paid.object, status: "canceled" },
});
assert.equal(
  await owner.query(makeFunctionReference("payments:getActiveSubscription"), {
    userId: user._id,
  }),
  null,
);
assert.equal(
  (await send({ ...paid, id: `evt_delayed${suffix}` })).outcome,
  "stale_event",
);
const invalid = await fetch(`${site}/webhooks/creem`, {
  method: "POST",
  headers: { "creem-signature": "invalid" },
  body: JSON.stringify(paid),
});
assert.equal(invalid.status, 401);
const receipt = {
  checkedAt: new Date().toISOString(),
  target: url,
  hosted: false,
  realCreemTransaction: false,
  providerEvents:
    "Synthetic documented event shapes signed with an isolated local-only secret",
  authentication:
    "Privileged local development identities; not Clerk browser/JWT acceptance",
  checkoutId,
  subscriptionId,
  checkoutAloneDoesNotGrantAccess: true,
  paidPeriodGrantsAccess: true,
  concurrentDuplicateDeduplicated: true,
  privateBillingReadRejected: true,
  scheduledCancellationKeepsPaidPeriod: true,
  cancellationRevokesAccess: true,
  staleGrantRejected: true,
  invalidSignatureRejected: true,
  externalProviderApiCalls: 0,
};
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/local-billing-smoke.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt, null, 2));
