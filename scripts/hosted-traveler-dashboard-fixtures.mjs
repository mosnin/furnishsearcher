import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-traveler-dashboard.private.json";
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
assert(
  !cli("env", "get", "RESEND_API_KEY").trim(),
  "Fixture refuses real email delivery",
);
const clerk = createClerkClient({ secretKey: credentials.secretKey });
let fixture = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : null;
const save = () =>
  writeFileSync(privatePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  }),
  anonymous = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
const call = (type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const refresh = async () =>
  client.setAuth(
    (await clerk.sessions.getToken(fixture.sessionId, "convex")).jwt,
  );
if (mode === "setup") {
  assert(
    !fixture || fixture.cleaned,
    "Resume the existing fixture; do not duplicate it",
  );
  const tag = randomUUID().slice(0, 8);
  fixture = {
    tag,
    email: `traveler-home-${tag}+clerk_test@example.com`,
    externalId: `furnishsearcher-qa-traveler-dashboard-${tag}`,
    name: `[QA] Traveler next steps ${tag}`,
    bio: `Synthetic traveler profile introduction ${tag}. No actual housing or stay.`,
    cleaned: false,
  };
  save();
  const user = await clerk.users.createUser({
    externalId: fixture.externalId,
    emailAddress: [fixture.email],
    skipPasswordRequirement: true,
  });
  fixture.clerkId = user.id;
  save();
  fixture.sessionId = (
    await clerk.sessions.createSession({ userId: user.id })
  ).id;
  save();
  await refresh();
  fixture.userId = (
    await call("mutation", "users:getOrCreate", {
      clerkId: fixture.clerkId,
      email: fixture.email,
      name: fixture.name,
    })
  )._id;
  save();
  fixture.searchId = await call("mutation", "savedSearches:save", {
    userId: fixture.userId,
    name: `[QA] Traveler search ${tag}`,
    city: "Austin",
    state: "TX",
    maxPrice: 2200.55,
    moveIn: Date.UTC(2027, 3, 15),
    moveOut: Date.UTC(2027, 6, 15),
    flexibleDays: 7,
    amenities: ["WiFi"],
    emailAlerts: false,
  });
  save();
  const tasks = await call("query", "travelerDashboard:account", {});
  assert(tasks.tasks.some((row) => row.id === "introduction"));
  fixture.searchHref = tasks.tasks.find(
    (row) => row.id === "resume-search",
  ).href;
  save();
  assert(
    (
      await call("query", "travelerDashboard:stays", {
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).isDone,
  );
  console.log(
    JSON.stringify({
      email: fixture.email,
      bio: fixture.bio,
      searchHref: fixture.searchHref,
    }),
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.externalId.startsWith("furnishsearcher-qa-traveler-dashboard-"),
  );
  const user = await clerk.users.getUser(fixture.clerkId);
  assert.equal(user.externalId, fixture.externalId);
  assert(
    user.emailAddresses.every((row) => row.emailAddress === fixture.email),
  );
  await refresh();
  const me = await call("query", "users:getByClerkId", {
    clerkId: fixture.clerkId,
  });
  assert.equal(me._id, fixture.userId);
  assert.equal(me.role, "tenant");
  if (mode === "check") {
    assert.equal(me.bio, fixture.bio);
    const account = await call("query", "travelerDashboard:account", {
      refreshKey: "2099-01-01",
    });
    assert(!account.tasks.some((row) => row.id === "introduction"));
    assert.equal(
      account.tasks.find((row) => row.id === "resume-search").href,
      fixture.searchHref,
    );
    const stays = await call("query", "travelerDashboard:stays", {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    assert.equal(stays.page.length, 0);
    assert(stays.isDone);
    await assert.rejects(
      anonymous.query(makeFunctionReference("travelerDashboard:account"), {}),
      /sign in/,
    );
    await assert.rejects(
      anonymous.query(makeFunctionReference("travelerDashboard:stays"), {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      /sign in/,
    );
    fixture.checked = true;
    save();
    writeFileSync(
      "docs/evidence/hosted-traveler-dashboard-native.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          environment: deployment,
          actualReservedTravelerClerkJwt: true,
          normalNativeProfileAndSavedSearchCreation: true,
          browserProfileSavePersisted: true,
          optionalIntroductionTaskResolved: true,
          savedCriteriaHrefPreserved: true,
          actualAcceptedStayRecords: 0,
          exhaustedEmptyStays: true,
          anonymousAccountAndStaysDenied: true,
          syntheticCloudBookingOrPaidIdentityGrants: false,
          realProviderMessages: 0,
          cleaned: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Actual traveler profile save/task update and saved criteria verified; zero stays is real",
    );
  } else {
    if (fixture.searchId)
      await call("mutation", "savedSearches:remove", { id: fixture.searchId });
    await clerk.users.deleteUser(fixture.clerkId);
    fixture.cleaned = true;
    save();
    if (existsSync("docs/evidence/hosted-traveler-dashboard-native.json")) {
      const p = "docs/evidence/hosted-traveler-dashboard-native.json",
        r = JSON.parse(readFileSync(p, "utf8"));
      r.cleaned = true;
      r.savedSearchRemoved = true;
      r.onlyOwnDisposableClerkTravelerDeleted = true;
      writeFileSync(p, JSON.stringify(r, null, 2) + "\n");
    }
    console.log(
      "Exact private saved search and disposable Clerk traveler cleaned; standing owner preserved",
    );
  }
}
