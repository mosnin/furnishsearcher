import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

// Creates and deletes ONLY its own new reserved Clerk development fixture.
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
const childEnv = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete childEnv[key];
const cli = (...args) => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--deployment", deployment],
    {
      encoding: "utf8",
      env: childEnv,
    },
  );
  assert.equal(
    result.status,
    0,
    "Development CLI read failed; output withheld",
  );
  return result.stdout;
};
assert.equal(
  cli("env", "get", "RESEND_API_KEY").trim(),
  "",
  "Synthetic QA refuses active delivery",
);
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const suffix = randomUUID().slice(0, 8);
const externalId = `furnishsearcher-qa-offboard-${suffix}`;
const email = `furnishsearcher-offboard-${suffix}+clerk_test@example.com`;
let fixture,
  deleted = false;
const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const call = (type, name, args) =>
  client[type](makeFunctionReference(name), args);
const privatePath = `../hosted-offboarding-${suffix}.private.json`;
const privateReceipt = {};
const savePrivate = () =>
  writeFileSync(privatePath, JSON.stringify(privateReceipt, null, 2), {
    mode: 0o600,
  });
const deleteOwnFixture = async () => {
  const current = await clerk.users.getUser(fixture.id);
  assert.equal(current.externalId, externalId);
  assert.equal(current.emailAddresses.length, 1);
  assert.equal(current.emailAddresses[0].emailAddress, email);
  await clerk.users.deleteUser(fixture.id);
  deleted = true;
};
try {
  fixture = await clerk.users.createUser({
    emailAddress: [email],
    externalId,
    skipPasswordRequirement: true,
  });
  Object.assign(privateReceipt, { clerkId: fixture.id, externalId, email });
  savePrivate();
  const session = await clerk.sessions.createSession({ userId: fixture.id });
  const jwt = (await clerk.sessions.getToken(session.id, "convex")).jwt;
  assert(jwt);
  client.setAuth(jwt);
  const profileArgs = {
    clerkId: fixture.id,
    name: "[QA] Disposable offboarding fixture",
    email,
  };
  const user = await call("mutation", "users:getOrCreate", profileArgs);
  await call("mutation", "users:updateRole", {
    userId: user._id,
    role: "landlord",
  });
  const listingId = await call("mutation", "listings:create", {
    landlordId: user._id,
    title: "[QA] Private disposable offboarding rental",
    description: "Synthetic private fixture; never published.",
    city: "Washington",
    state: "DC",
    zip: "20500",
    address: "1600 Pennsylvania Avenue NW",
    price: 2000,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "apartment",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: true,
    parkingIncluded: false,
    availableFrom: Date.now() + 30 * 86400000,
  });
  Object.assign(privateReceipt, { userId: user._id, listingId });
  savePrivate();
  const requestId = await call("mutation", "housingRequests:create", {
    userId: user._id,
    city: "Washington",
    state: "DC",
    moveInDate: Math.floor(Date.now() / 86400000) * 86400000 + 45 * 86400000,
    moveOutDate: Math.floor(Date.now() / 86400000) * 86400000 + 135 * 86400000,
    duration: 3,
    maxBudget: 2000,
    bedrooms: 1,
    petFriendly: false,
    description: "[QA] Disposable lifecycle fixture",
    contactPreference: "platform",
  });
  Object.assign(privateReceipt, { userId: user._id, listingId, requestId });
  savePrivate();
  // Refresh immediately before deletion so expiration cannot explain the denial.
  const oldJwt = (await clerk.sessions.getToken(session.id, "convex")).jwt;
  assert(oldJwt);
  const expiresAt =
    JSON.parse(Buffer.from(oldJwt.split(".")[1], "base64url").toString()).exp *
    1000;
  client.setAuth(oldJwt);
  assert(
    (await call("query", "users:getByClerkId", { clerkId: fixture.id }))
      ?._id === user._id,
  );
  await deleteOwnFixture();
  let observed = false;
  const started = Date.now();
  while (Date.now() - started < 40000) {
    if (
      (await call("query", "users:getByClerkId", { clerkId: fixture.id })) ===
      null
    ) {
      observed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert(
    observed,
    "Deletion event did not revoke native access within the check window",
  );
  assert(
    Date.now() < expiresAt,
    "Must prove native denial before token expiration",
  );
  await assert.rejects(
    call("mutation", "users:getOrCreate", profileArgs),
    /no longer available/,
  );
  await assert.rejects(
    call("query", "housingRequests:getMine", {
      paginationOpts: { numItems: 10, cursor: null },
    }),
    /no longer available/,
  );
  assert.equal(
    await call("query", "payments:resolveUserId", { clerkId: fixture.id }),
    null,
  );
  const rows = (table) =>
    JSON.parse(cli("data", table, "--format", "json", "--limit", "100"));
  let nativeUser, rental, request;
  for (let attempt = 0; attempt < 6; attempt++) {
    nativeUser = rows("users").find((row) => row._id === user._id);
    rental = rows("listings").find((row) => row._id === listingId);
    request = rows("housingRequests").find((row) => row._id === requestId);
    if (rental?.status === "inactive" && request?.status === "closed") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert(nativeUser?.clerkDeletedAt);
  assert.equal(rental?.status, "inactive");
  assert.equal(request?.status, "closed");
  assert.equal(rental.publicationRequested, false);
  const receipt = {
    checkedAt: new Date().toISOString(),
    deployment,
    actualClerkDevelopmentUserDeletion: true,
    newlyCreatedReservedFixtureOnly: true,
    preDeletionJwtStillUnexpiredAtDenial: true,
    nativeProfileHidden: true,
    nativeRecreationDenied: true,
    nativePrivateRequestReadDenied: true,
    publicPaymentUserResolutionDenied: true,
    nativeUserRetainedWithDeletionMarker: true,
    unpublishedRentalRetainedAndDeactivated: true,
    openHousingRequestRetainedAndClosed: true,
    publicRentalHideAcceptance: false,
    acceptedStayHistoryAcceptance:
      "covered by native lifecycle tests, not this hosted fixture",
    realEmailOrSmsSent: false,
    productionChanged: false,
  };
  writeFileSync(
    "docs/evidence/hosted-account-offboarding.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(
    "Hosted real Clerk deletion passed: unexpired token denied, native records retained, private rental inactive and request closed.",
  );
} finally {
  if (fixture && !deleted) await deleteOwnFixture();
  privateReceipt.clerkFixtureDeleted = deleted;
  savePrivate();
}
