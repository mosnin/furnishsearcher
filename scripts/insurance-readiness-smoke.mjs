import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createClerkClient } from "@clerk/backend";
const mode = process.argv[2];
assert(["local", "hosted"].includes(mode));
let url, owner, subject, authClass;
if (mode === "local") {
  const env = readFileSync(".env.local", "utf8");
  assert(/^CONVEX_DEPLOYMENT=anonymous:/m.test(env));
  url = env
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)[1]
    .trim()
    .replace(/^"|"$/g, "");
  assert(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  const config = JSON.parse(
    readFileSync(".convex/local/default/config.json", "utf8"),
  );
  assert.equal(Number(new URL(url).port), config.ports.cloud);
  owner = new ConvexHttpClient(url, { logger: false });
  subject = "qa-owner-search";
  owner.setAdminAuth(config.adminKey, {
    subject,
    issuer: "https://qa.clerk.accounts.dev",
  });
  authClass =
    "privileged synthetic local owner identity; not real Clerk authentication";
} else {
  url = "https://cheerful-ferret-182.convex.cloud";
  const keys = JSON.parse(readFileSync(".clerk/.tmp/keyless.json", "utf8"));
  assert(keys.publishableKey.startsWith("pk_test_"));
  const instance = await fetch("https://api.clerk.com/v1/instance", {
    headers: { Authorization: `Bearer ${keys.secretKey}` },
  });
  assert.equal(instance.status, 200);
  const metadata = await instance.json();
  assert.equal(metadata.id, "ins_3L9oPR1TeW643w6zPX1vgsOFAxU");
  assert.equal(metadata.environment_type, "development");
  const clerk = createClerkClient({ secretKey: keys.secretKey });
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
  subject = account.id;
  owner = new ConvexHttpClient(url, { logger: false });
  owner.setAuth(
    (await clerk.sessions.getToken(session.sessionId, "convex")).jwt,
  );
  authClass = "actual provider-issued Clerk JWT for reserved development owner";
}
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const anonymous = new ConvexHttpClient(url, { logger: false });
assert.equal(
  await call(anonymous, "query", "insurance:availability"),
  false,
  "Readiness check refuses an enabled provider; it never sends an insurance request",
);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: subject,
});
assert.equal(me.role, "landlord");
const page = await call(owner, "query", "insurance:properties", {
  paginationOpts: { cursor: null, numItems: 100 },
});
assert(page.page.length <= 20);
await assert.rejects(
  call(anonymous, "query", "insurance:properties", {
    paginationOpts: { cursor: null, numItems: 20 },
  }),
  /sign in/,
);
const property = page.page.find((p) => p.addressKey);
let unavailableActionDenied = false;
if (property) {
  const args = {
    listingId: property.id,
    addressKey: property.addressKey,
    requestId: randomUUID(),
    consent: true,
  };
  await assert.rejects(
    call(owner, "action", "insurance:estimate", { ...args, consent: false }),
    /Agree/,
  );
  await assert.rejects(
    call(owner, "action", "insurance:estimate", args),
    /approved Steadily connection/,
  );
  unavailableActionDenied = true;
}
const receipt = {
  checkedAt: new Date().toISOString(),
  environment: url,
  authClass,
  providerAvailable: false,
  nativeOwnerPagedProperties: page.page.length,
  pageBound: 20,
  anonymousPrivateAddressesDenied: true,
  unavailableActionDenied,
  providerRequestsSent: 0,
  fixtureWrites: 0,
  limitations: [
    "No approved Steadily credentials or live provider acceptance",
    "No RentalGuardian purchase, plan-change or claim integration",
    "No policy or coverage created",
  ],
};
writeFileSync(
  `docs/evidence/${mode}-insurance-readiness.json`,
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(
  `${mode} insurance readiness: passed; zero provider requests or fixture writes`,
);
