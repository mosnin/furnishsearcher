import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-review-email.private.json";
assert(["setup", "check", "cleanup"].includes(mode));
const credentials = JSON.parse(
  readFileSync(".clerk/.tmp/keyless.json", "utf8"),
);
assert(credentials.publishableKey.startsWith("pk_test_"));
const instanceResponse = await fetch("https://api.clerk.com/v1/instance", {
  headers: { Authorization: `Bearer ${credentials.secretKey}` },
});
assert.equal(instanceResponse.status, 200);
const instance = await instanceResponse.json();
assert.equal(instance.environment_type, "development");
assert.equal(instance.id, "ins_3L9oPR1TeW643w6zPX1vgsOFAxU");
const env = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete env[key];
const cli = (...args) => {
  const r = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--deployment", deployment],
    { env, encoding: "utf8" },
  );
  assert.equal(
    r.status,
    0,
    "Development CLI operation failed; output withheld",
  );
  return r.stdout;
};
assert.equal(cli("env", "get", "RESEND_API_KEY").trim(), "");
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const session = JSON.parse(
  readFileSync("../hosted-auth-session.private.json", "utf8"),
);
const account = await clerk.users.getUser(session.userId);
assert(account.externalId?.startsWith("furnishsearcher-qa-"));
assert(
  account.emailAddresses.every((e) =>
    e.emailAddress.endsWith("+clerk_test@example.com"),
  ),
);
const owner = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const refresh = async (client, sessionId) => {
  const jwt = (await clerk.sessions.getToken(sessionId, "convex")).jwt;
  assert(jwt);
  client.setAuth(jwt);
};
await refresh(owner, session.sessionId);
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: account.id,
});
assert.equal(me?.role, "landlord");
const fixture = JSON.parse(readFileSync(privatePath, "utf8"));
assert(
  fixture.cleaned === true &&
    fixture.ownerId === me._id &&
    fixture.externalId.startsWith("furnishsearcher-qa-review-email-"),
);
for (const [direction, id, state] of [
  ["sent", fixture.toTenant, "revoked"],
  ["received", fixture.toOwner, "declined"],
]) {
  assert(id);
  let row = (
    await call(owner, "query", "reviewInvitations:list", {
      direction,
      paginationOpts: { cursor: null, numItems: 20 },
    })
  ).page.find((r) => r.id === id);
  assert(row && row.state === state && row.available === false);
  // Native internal delivery is invoked only for these exact closed QA records.
  // Resend was asserted absent above. It must suppress before any transfer.
  cli("run", "reviewInvitationEmails:deliver", JSON.stringify({ id }));
  row = (
    await call(owner, "query", "reviewInvitations:list", {
      direction,
      paginationOpts: { cursor: null, numItems: 20 },
    })
  ).page.find((r) => r.id === id);
  assert.equal(row.emailStatus, "suppressed");
  assert.equal(row.state, state);
}
const receiptPath = "docs/evidence/hosted-review-email-native.json",
  receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
Object.assign(receipt, {
  closedQueuedJobsNativeSuppressed: 2,
  noRealEmailTransfer: true,
  suppressionCheckedAt: new Date().toISOString(),
});
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
console.log(
  "Both exact closed QA jobs suppress before email transfer; native request history remains closed.",
);
