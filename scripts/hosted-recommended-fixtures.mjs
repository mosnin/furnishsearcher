import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const deployment = "cheerful-ferret-182";
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
assert.equal(
  cli("env", "get", "RESEND_API_KEY").trim(),
  "",
  "Synthetic QA refuses active email delivery",
);
const savedSession = JSON.parse(
  readFileSync("../hosted-auth-session.private.json", "utf8"),
);
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const account = await clerk.users.getUser(savedSession.userId);
assert(account.externalId?.startsWith("furnishsearcher-qa-"));
assert(
  account.emailAddresses.every((e) =>
    e.emailAddress.endsWith("+clerk_test@example.com"),
  ),
);
const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const anonymous = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const mode = process.argv[2],
  privatePath = "../hosted-recommended.private.json";
assert(["setup", "check", "cleanup"].includes(mode));
const { existsSync } = await import("node:fs");
const call = (type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const jwt = (await clerk.sessions.getToken(savedSession.sessionId, "convex"))
  .jwt;
assert(jwt);
client.setAuth(jwt);
const me = await call("query", "users:getByClerkId", { clerkId: account.id });
assert.equal(me.role, "landlord");
let fixture = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : null;
const save = () =>
  writeFileSync(privatePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
assert.equal(await call("query", "geo:indexStatus"), true);
assert.equal(await call("query", "recommendations:status"), true);
const empty = await anonymous.query(makeFunctionReference("search:listings"), {
  sort: "recommended",
  city: "Austin",
  state: "TX",
  maxPrice: 2100,
  paginationOpts: { cursor: null, numItems: 24 },
});
assert.equal(
  empty.page.length,
  0,
  "This private development database must not fabricate public rentals",
);
if (mode === "setup") {
  assert(!fixture || fixture.cleaned);
  fixture = {
    ownerId: me._id,
    name: `[QA] Recommended search ${randomUUID().slice(0, 8)}`,
    cleaned: false,
  };
  save();
  console.log(
    JSON.stringify({
      name: fixture.name,
      spatialIndexReady: true,
      recommendationsReady: true,
    }),
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === me._id &&
      fixture.name.startsWith("[QA] Recommended search "),
  );
  let cursor = null,
    matches = [];
  for (let i = 0; i < 20; i++) {
    const page = await call("query", "savedSearches:mine", {
      paginationOpts: { cursor, numItems: 25 },
    });
    matches.push(...page.page.filter((row) => row.name === fixture.name));
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  assert.equal(matches.length, 1);
  const saved = matches[0];
  assert.equal(saved.userId, me._id);
  assert.equal(saved.sort, "recommended");
  assert.equal(saved.city, "Austin");
  assert.equal(saved.state, "TX");
  assert.equal(saved.maxPrice, 2100);
  assert.equal(saved.emailAlerts, false);
  if (fixture.searchId) assert.equal(saved._id, fixture.searchId);
  else {
    fixture.searchId = saved._id;
    save();
  }
  await assert.rejects(
    anonymous.query(makeFunctionReference("savedSearches:mine"), {
      paginationOpts: { cursor: null, numItems: 25 },
    }),
    /sign in/,
  );
  const path = "docs/evidence/hosted-recommended-native.json";
  const receipt = {
    checkedAt: new Date().toISOString(),
    development: deployment,
    actualReservedClerkOwnerJwt: true,
    versionedSpatialIndexReady: true,
    recommendationIndexReady: true,
    noFabricatedPublicRentals: true,
    privateNativeSavedCriteria: {
      sort: saved.sort,
      city: saved.city,
      state: saved.state,
      maxPrice: saved.maxPrice,
      emailAlerts: saved.emailAlerts,
    },
    anonymousSavedSearchReadDenied: true,
    realMailOrSmsSent: false,
    productionChanged: false,
  };
  if (mode === "cleanup") {
    await call("mutation", "savedSearches:remove", { id: saved._id });
    const page = await call("query", "savedSearches:mine", {
      paginationOpts: { cursor: null, numItems: 25 },
    });
    assert(!page.page.some((row) => row._id === saved._id));
    fixture.cleaned = true;
    save();
    receipt.ownSavedSearchDeleted = true;
  }
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  console.log(`Hosted recommended search ${mode} verified.`);
}
