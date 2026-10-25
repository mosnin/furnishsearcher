import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const env = readFileSync(".env.local", "utf8");
const url = env
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
  .trim()
  .replace(/^"|"$/g, "");
assert(
  url &&
    new URL(url).protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(env) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(env),
);
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), config.ports.cloud);
const phone = "+12025550123",
  subject = "qa-contact-verification";
const make = (proof = {}) => {
  const client = new ConvexHttpClient(url);
  client.setAdminAuth(config.adminKey, {
    subject,
    issuer: "https://qa.clerk.accounts.dev",
    ...proof,
  });
  return client;
};
const call = (client, type, name, args) =>
  client[type](makeFunctionReference(name), args);
const client = make(),
  anonymous = new ConvexHttpClient(url);
const me = await call(client, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic contact — not a person",
  email: "qa-contact@example.test",
});
assert.equal(me.email, "qa-contact@example.test");
await call(client, "mutation", "users:revokePhone", {});
await new Promise((resolve) => setTimeout(resolve, 1100));
const proof = {
  phoneNumber: phone,
  phoneNumberVerified: true,
  iat: Math.floor(Date.now() / 1000),
};
const confirmed = make(proof);
await assert.rejects(
  call(anonymous, "mutation", "users:confirmPhone", { phone }),
);
await assert.rejects(call(client, "mutation", "users:confirmPhone", { phone }));
await assert.rejects(
  call(confirmed, "mutation", "users:confirmPhone", { phone: "+12025550124" }),
);
let revoked = false;
try {
  await call(confirmed, "mutation", "users:confirmPhone", { phone });
  const saved = await call(client, "query", "users:getByClerkId", {
    clerkId: subject,
  });
  assert.equal(saved.phone, phone);
  assert.equal(saved.phoneVerified, true);
  assert.equal(saved.phoneVerificationSource, "clerk");
  assert.equal(saved.phoneVerificationMode, "test");
  const publicProfile = await call(
    anonymous,
    "query",
    "users:getPublicProfile",
    { userId: me._id },
  );
  assert(!Object.hasOwn(publicProfile, "phone"));
  assert(!Object.hasOwn(publicProfile, "phoneVerifiedAt"));
  await call(client, "mutation", "users:revokePhone", {});
  revoked = true;
  await assert.rejects(
    call(confirmed, "mutation", "users:confirmPhone", { phone }),
  );
  assert.equal(
    (await call(client, "query", "users:getByClerkId", { clerkId: subject }))
      .phoneVerified,
    false,
  );
} finally {
  if (!revoked) await call(client, "mutation", "users:revokePhone", {});
  await call(client, "mutation", "users:updateProfile", {
    userId: me._id,
    phone: "",
  });
}
writeFileSync(
  "docs/evidence/local-contact-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      signedClaimPathViaPrivilegedLocalIdentity: true,
      actualClerkJwt: false,
      actualSmsDelivered: false,
      anonymousRejected: true,
      missingClaimRejected: true,
      wrongNumberRejected: true,
      privateProfilePersisted: true,
      publicProfileOmitsPhoneAndProof: true,
      revocationAndReplayDenied: true,
      finalSyntheticPhoneRemoved: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Local contact confirmation smoke passed; privileged synthetic claims, no Clerk JWT or SMS delivery.",
);
