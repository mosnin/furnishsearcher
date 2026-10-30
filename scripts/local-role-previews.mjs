import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const selector = readFileSync(".env.local", "utf8");
assert(/^CONVEX_DEPLOYMENT=anonymous:/m.test(selector));
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
const url = selector
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)[1]
  .trim()
  .replace(/^"|"$/g, "");
assert.equal(url, `http://127.0.0.1:${config.ports.cloud}`);
const credentials = JSON.parse(
  readFileSync(".clerk/.tmp/keyless.json", "utf8"),
);
assert(credentials.publishableKey.startsWith("pk_test_"));
const instance = await fetch("https://api.clerk.com/v1/instance", {
  headers: { Authorization: `Bearer ${credentials.secretKey}` },
}).then((r) => r.json());
assert.equal(instance.id, "ins_3L9oPR1TeW643w6zPX1vgsOFAxU");
assert.equal(instance.environment_type, "development");
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const privileged = new ConvexHttpClient(url, { logger: false });
privileged.setAdminAuth(config.adminKey);
const env = await privileged.query(
  makeFunctionReference("_system/cli/queryEnvironmentVariables"),
  {},
);
assert(
  !env.some((r) => r.name === "RESEND_API_KEY" && r.value),
  "Local email must be disabled",
);
const staff = new ConvexHttpClient(url, { logger: false });
staff.setAdminAuth(config.adminKey, {
  subject: "qa-publication-staff",
  issuer: "https://qa.furnishsearcher.invalid",
});
assert.equal(
  (
    await staff.query(makeFunctionReference("users:getByClerkId"), {
      clerkId: "qa-publication-staff",
    })
  ).role,
  "admin",
);
const file = ".clerk/.tmp/local-role-previews.json";
const state = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : { tag: randomUUID().slice(0, 8), accounts: {} };
const persist = () =>
  writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
for (const [role, name] of [
  ["tenant", "Local preview traveler"],
  ["admin", "Local preview platform admin"],
]) {
  let record = state.accounts[role];
  if (!record) {
    const email = `furnishsearcher-local-${role}-${state.tag}+clerk_test@example.com`;
    const externalId = `furnishsearcher-qa-local-${role}-${state.tag}`;
    const user = await clerk.users.createUser({
      emailAddress: [email],
      externalId,
      skipPasswordRequirement: true,
    });
    record = state.accounts[role] = { clerkId: user.id, email, externalId };
    persist();
  }
  const user = await clerk.users.getUser(record.clerkId);
  assert.equal(user.externalId, record.externalId);
  assert(user.emailAddresses.some((r) => r.emailAddress === record.email));
  try {
    if (!record.sessionId) throw Error();
    await clerk.sessions.getToken(record.sessionId, "convex");
  } catch {
    record.sessionId = (
      await clerk.sessions.createSession({ userId: record.clerkId })
    ).id;
    persist();
  }
  const client = new ConvexHttpClient(url, { logger: false });
  client.setAuth(
    (await clerk.sessions.getToken(record.sessionId, "convex")).jwt,
  );
  let native = await client.query(makeFunctionReference("users:getByClerkId"), {
    clerkId: record.clerkId,
  });
  if (!native) {
    native = await client.mutation(makeFunctionReference("users:getOrCreate"), {
      clerkId: record.clerkId,
      email: record.email,
      name,
    });
    record.nativeId = native._id;
    persist();
  }
  if (native.accountTypePending) {
    if (role === "admin")
      await staff.mutation(makeFunctionReference("adminAccounts:update"), {
        userId: native._id,
        name,
        role: "admin",
      });
    else
      await client.mutation(makeFunctionReference("users:updateRole"), {
        userId: native._id,
        role: "tenant",
      });
  }
  native = await client.query(makeFunctionReference("users:getByClerkId"), {
    clerkId: record.clerkId,
  });
  assert.equal(native.role, role);
  if (role === "tenant" && !record.searchId) {
    record.searchId = await client.mutation(
      makeFunctionReference("savedSearches:save"),
      {
        userId: native._id,
        name: "[Local preview] Austin work stay",
        city: "Austin",
        state: "TX",
        maxPrice: 2200,
        amenities: ["WiFi"],
        emailAlerts: false,
      },
    );
    persist();
  }
  if (role === "admin") {
    const result = await client.query(
      makeFunctionReference("adminAccounts:list"),
      { paginationOpts: { cursor: null, numItems: 20 } },
    );
    assert(result.page.length <= 20);
  }
  console.log(JSON.stringify({ role, email: record.email, localOnly: true }));
}
console.log(
  "Reserved development identities are available. Platform roles exist only in the loopback database; no cloud roles, billing or identity approvals were granted.",
);
