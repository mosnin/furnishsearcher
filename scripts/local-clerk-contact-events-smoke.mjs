import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const source = readFileSync(".env.local", "utf8");
const url = source
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
  .trim()
  .replace(/^"|"$/g, "");
assert(
  url &&
    new URL(url).protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(source) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(source),
);
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const childEnv = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete childEnv[key];
const readEnv = (name) => {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/convex/bin/main.js",
      "env",
      "get",
      name,
      "--env-file",
      ".env.local",
    ],
    { encoding: "utf8", env: childEnv },
  );
  if (result.status !== 0 && !result.stderr.includes("not found"))
    throw new Error("Could not verify local email configuration");
  return result.status === 0 ? result.stdout.trim() : "";
};
// Never print environment values, including when a guard fails.
assert(
  readEnv("RESEND_API_KEY") === "",
  "Synthetic QA refuses active email delivery",
);
assert(
  ["", "test"].includes(readEnv("CLERK_EMAIL_MODE")),
  "Synthetic QA requires test email mode",
);
assert(
  ["", "test"].includes(readEnv("CLERK_CONTACT_MODE")),
  "Refusing production phone proof mode",
);
const keys = [
  "CLERK_CONTACT_WEBHOOK_SECRET",
  "CLERK_CONTACT_WEBHOOK_INSTANCE_ID",
  "CLERK_CONTACT_WEBHOOK_MODE",
];
for (const name of keys)
  assert(readEnv(name) === "", "Do not replace a configured Clerk endpoint");
function changeEnv(command, name, value) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/convex/bin/main.js",
      "env",
      command,
      name,
      ...(value === undefined ? [] : [value]),
      "--env-file",
      ".env.local",
    ],
    { encoding: "utf8", env: childEnv },
  );
  assert.equal(
    result.status,
    0,
    "Could not change guarded local receiver configuration",
  );
}
const secret = "whsec_" + randomBytes(32).toString("base64"),
  instance = "ins_local_contact_qa",
  subject = "user_qa_contact_" + randomUUID().slice(0, 8),
  email = "qa-confirmed@example.test",
  phone = "+12025550123",
  nextEmail = "qa-updated@example.test",
  nextPhone = "+12025550124";
const make = (claims = {}) => {
  const client = new ConvexHttpClient(url, { logger: false });
  client.setAdminAuth(cfg.adminKey, {
    subject,
    issuer: "https://synthetic.clerk.accounts.dev",
    ...claims,
  });
  return client;
};
const call = (client, type, name, args) =>
    client[type](makeFunctionReference(name), args),
  owner = make();
const me = await call(owner, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic Clerk contact changes",
  email: "qa-profile@example.test",
});
await call(owner, "mutation", "users:updateRole", {
  userId: me._id,
  role: "landlord",
});
const proof = (e = email, p = phone) =>
  make({
    email: e,
    emailVerified: true,
    phoneNumber: p,
    phoneNumberVerified: true,
    iat: Math.floor(Date.now() / 1000),
  });
const site = new URL(url);
site.port = String(cfg.ports.site);
const makeEvent = (e, p) => ({
  object: "event",
  instance_id: instance,
  type: "user.updated",
  timestamp: Date.now(),
  data: {
    object: "user",
    id: subject,
    updated_at: Date.now(),
    primary_email_address_id: "idn_qa_email",
    email_addresses: [
      {
        id: "idn_qa_email",
        email_address: e,
        verification: { status: "verified" },
      },
    ],
    primary_phone_number_id: "idn_qa_phone",
    phone_numbers: [
      {
        id: "idn_qa_phone",
        phone_number: p,
        verification: { status: "verified" },
      },
    ],
  },
});
async function post(event, { bad = false, old = false } = {}) {
  const body = JSON.stringify(event),
    id = "msg_" + randomUUID(),
    timestamp = String(Math.floor(Date.now() / 1000) - (old ? 301 : 0));
  const mac = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return fetch(new URL("/webhooks/clerk-contacts", site), {
    method: "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": "v1," + (bad ? "invalid" : mac),
    },
    body,
  });
}
try {
  for (const [key, value] of [
    [keys[0], secret],
    [keys[1], instance],
    [keys[2], "test"],
  ])
    changeEnv("set", key, value);
  await call(proof(), "mutation", "emailContacts:setMessageEmails", {
    clerkId: subject,
    enabled: true,
  });
  await call(proof(), "mutation", "users:confirmPhone", { phone });
  await call(owner, "mutation", "phoneContacts:setEnabled", { enabled: true });
  const before = await call(owner, "query", "users:getByClerkId", {
      clerkId: subject,
    }),
    unchanged = makeEvent(email, phone);
  assert.equal((await post(unchanged, { bad: true })).status, 401);
  assert.equal((await post(unchanged, { old: true })).status, 401);
  assert.equal(
    (await post({ ...unchanged, instance_id: "ins_wrong" })).status,
    400,
  );
  assert.equal((await post(unchanged)).status, 200);
  assert.equal(
    (await call(owner, "query", "phoneContacts:settings", {})).enabled,
    true,
  );
  assert.equal(
    (await call(owner, "query", "emailContacts:settings", {})).confirmed,
    true,
  );
  const changed = makeEvent(nextEmail, nextPhone);
  // Avoid equal object/event times when the local runtime is fast.
  changed.timestamp = Math.max(changed.timestamp, unchanged.timestamp + 1);
  changed.data.updated_at = Math.max(
    changed.data.updated_at,
    unchanged.data.updated_at + 1,
  );
  assert.equal((await post(changed)).status, 200);
  assert.equal(
    (await call(owner, "query", "phoneContacts:settings", {})).enabled,
    false,
  );
  assert.equal(
    (await call(owner, "query", "emailContacts:settings", {})).confirmed,
    false,
  );
  assert.equal((await post(changed)).status, 200);
  assert.equal((await post(unchanged)).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 2100));
  await assert.rejects(
    call(proof(), "mutation", "users:confirmPhone", { phone }),
    /contact changed/,
  );
  await assert.rejects(
    call(proof(), "mutation", "emailContacts:setMessageEmails", {
      clerkId: subject,
      enabled: true,
    }),
    /contact changed/,
  );
  await call(
    proof(nextEmail, nextPhone),
    "mutation",
    "emailContacts:setMessageEmails",
    { clerkId: subject, enabled: true },
  );
  await call(proof(nextEmail, nextPhone), "mutation", "users:confirmPhone", {
    phone: nextPhone,
  });
  assert.equal(
    (await call(owner, "query", "phoneContacts:settings", {})).enabled,
    false,
  );
  assert.equal(
    (await call(owner, "query", "emailContacts:settings", {})).email,
    nextEmail,
  );
  const after = await call(owner, "query", "users:getByClerkId", {
    clerkId: subject,
  });
  assert.equal(after.name, before.name);
  assert.equal(after.role, before.role);
  writeFileSync(
    "docs/evidence/local-clerk-contact-events-smoke.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        target: url,
        nativeSignedHttp: true,
        privilegedSyntheticIdentities: true,
        providerPayloadSynthetic: true,
        badSignatureAndStaleDeliveryDenied: true,
        wrongInstanceDenied: true,
        unchangedProofPreserved: true,
        changedContactConfirmationAndConsentRevoked: true,
        duplicateAndOutOfOrderSafe: true,
        freshStaleContactClaimsDenied: true,
        explicitNewContactConfirmationAccepted: true,
        phoneSharingRequiresNewConsent: true,
        profileNameAndRoleRetained: true,
        actualClerkWebhookDelivery: false,
        realEmailOrSmsSent: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Native local signed Clerk contact events passed; no real email or SMS.",
  );
} finally {
  await call(owner, "mutation", "phoneContacts:setEnabled", { enabled: false });
  await call(owner, "mutation", "users:revokePhone", {});
  await call(owner, "mutation", "emailContacts:setMessageEmails", {
    clerkId: subject,
    enabled: false,
  });
  for (const key of keys) changeEnv("remove", key);
}
