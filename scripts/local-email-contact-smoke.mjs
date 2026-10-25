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
const subject = "qa-email-contact";
const make = (proof = {}, sub = subject) => {
  const client = new ConvexHttpClient(url);
  client.setAdminAuth(cfg.adminKey, {
    subject: sub,
    issuer: "https://synthetic.clerk.accounts.dev",
    ...proof,
  });
  return client;
};
const call = (client, method, name, args) =>
  client[method](makeFunctionReference(name), args);
const client = make(),
  anonymous = new ConvexHttpClient(url);
const me = await call(client, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic email confirmation — not a person",
  email: "untrusted-profile@example.test",
});
await call(client, "mutation", "emailContacts:setMessageEmails", {
  clerkId: subject,
  enabled: false,
});
await new Promise((resolve) => setTimeout(resolve, 1100));
const issued = Math.floor(Date.now() / 1000),
  proof = make({
    email: "CONFIRMED@example.test",
    emailVerified: true,
    iat: issued,
  });
try {
  await assert.rejects(call(anonymous, "query", "emailContacts:settings", {}));
  await assert.rejects(
    call(client, "mutation", "emailContacts:setMessageEmails", {
      clerkId: subject,
      enabled: true,
    }),
  );
  await assert.rejects(
    call(proof, "mutation", "emailContacts:setMessageEmails", {
      clerkId: "different-account",
      enabled: true,
    }),
  );
  await call(proof, "mutation", "emailContacts:setMessageEmails", {
    clerkId: subject,
    enabled: true,
  });
  assert.deepEqual(await call(client, "query", "emailContacts:settings", {}), {
    enabled: true,
    confirmed: true,
    email: "confirmed@example.test",
    expiresAt: (
      await call(client, "query", "users:getByClerkId", { clerkId: subject })
    ).notificationEmailExpiresAt,
    mode: "test",
  });
  await call(client, "mutation", "users:getOrCreate", {
    clerkId: subject,
    name: "[QA] Synthetic email confirmation — not a person",
    email: "changed-profile@example.test",
  });
  assert.equal(
    (await call(client, "query", "emailContacts:settings", {})).email,
    "confirmed@example.test",
  );
  // The synthetic traveler is private to its own account.
  assert.equal(
    await call(anonymous, "query", "users:getPublicProfile", {
      userId: me._id,
    }),
    null,
  );
  await call(client, "mutation", "emailContacts:setMessageEmails", {
    clerkId: subject,
    enabled: false,
  });
  assert.deepEqual(await call(client, "query", "emailContacts:settings", {}), {
    enabled: false,
    confirmed: false,
    email: null,
    expiresAt: null,
    mode: "test",
  });
  await assert.rejects(
    call(proof, "mutation", "emailContacts:setMessageEmails", {
      clerkId: subject,
      enabled: true,
    }),
  );
} finally {
  await call(client, "mutation", "emailContacts:setMessageEmails", {
    clerkId: subject,
    enabled: false,
  });
}
await assert.rejects(
  call(anonymous, "query", "inboundEmails:mine", {
    paginationOpts: { cursor: null, numItems: 10 },
  }),
);
assert.deepEqual(
  (
    await call(client, "query", "inboundEmails:mine", {
      paginationOpts: { cursor: null, numItems: 10 },
    })
  ).page,
  [],
);
const site = new URL(url);
site.port = String(cfg.ports.site);
site.pathname = "/webhooks/resend-replies";
assert.equal((await fetch(site, { method: "POST", body: "{}" })).status, 503);
writeFileSync(
  "docs/evidence/local-email-contact-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      privilegedSyntheticClaims: true,
      actualClerkJwt: false,
      actualEmailSent: false,
      anonymousRejected: true,
      unverifiedClaimRejected: true,
      accountSwitchRejected: true,
      normalizedTrustedEmailSaved: true,
      profileEmailCannotChangeBinding: true,
      privateTravelerProfile: true,
      optOutPersisted: true,
      oldTokenReplayRejected: true,
      finalSyntheticBindingRemoved: true,
      anonymousReplyActivityDenied: true,
      ownEmptyReplyActivity: true,
      unconfiguredReceivingHttpRejected: true,
      actualInboundEmailReceived: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Local email confirmation smoke passed; synthetic claims only, no email delivery.",
);
