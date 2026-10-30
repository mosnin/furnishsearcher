import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { syntheticPanel } from "./synthetic-photo.mjs";

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
let jwt;
const refresh = async () => {
  jwt = (await clerk.sessions.getToken(savedSession.sessionId, "convex")).jwt;
  assert(jwt);
  client.setAuth(jwt);
};
const call = (type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
await refresh();
const user = await call("query", "users:getByClerkId", { clerkId: account.id });
assert.equal(user?.role, "landlord");
const suffix = randomUUID().slice(0, 8),
  listingIds = [],
  uploads = [];
const privatePath = `../hosted-photo-retention-${suffix}.private.json`;
const savePrivate = () =>
  writeFileSync(
    privatePath,
    JSON.stringify({ ownerId: user._id, listingIds, uploads }, null, 2),
    { mode: 0o600 },
  );
try {
  for (const color of ["#a8c6dd", "#d5b8aa"]) {
    const bytes = syntheticPanel(color);
    const response = await fetch(
      `https://${deployment}.convex.site/photos/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "image/png",
        },
        body: bytes,
      },
    );
    assert.equal(response.status, 200);
    const photo = await response.json();
    uploads.push(photo);
    savePrivate();
    assert.deepEqual(
      Buffer.from(await (await fetch(photo.url)).arrayBuffer()),
      bytes,
    );
  }
  const assets = uploads.map((p) => ({
    storageId: p.storageId,
    caption: "[QA] Synthetic panel; no property shown",
  }));
  const data = {
    landlordId: user._id,
    title: `[QA] Hosted photo retention ${suffix}`,
    description: "Disposable private synthetic fixture; never published",
    city: "Austin",
    state: "TX",
    zip: "78701",
    address: "Synthetic private fixture",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: true,
    parkingIncluded: false,
    availableFrom: Date.now() + 30 * 86400000,
  };
  for (const photoAssets of [assets, [assets[0]]]) {
    listingIds.push(
      await call("mutation", "listings:create", { ...data, photoAssets }),
    );
    savePrivate();
  }
  assert.deepEqual(
    (await call("query", "listings:getById", { id: listingIds[0] })).photos,
    uploads.map((p) => p.url),
  );
  assert.equal(
    await anonymous.query(makeFunctionReference("listings:getById"), {
      id: listingIds[0],
    }),
    null,
  );
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = JSON.parse(cli("run", "photoRetention:maintenance", "{}"));
    if (result.ready) {
      ready = true;
      break;
    }
  }
  assert(ready, "Reference migration did not finish");
  await refresh();
  await call("mutation", "listings:update", {
    id: listingIds[0],
    photoAssets: [],
  });
  const rows = () =>
    JSON.parse(
      cli("data", "photoUploads", "--format", "json", "--limit", "100"),
    );
  let registry = rows();
  const shared = registry.find((row) => row.storageId === uploads[0].storageId);
  const removed = registry.find(
    (row) => row.storageId === uploads[1].storageId,
  );
  assert(shared && shared.expiresAt === undefined);
  assert(removed?.expiresAt > Date.now() + 6.9 * 86400000);
  await call("mutation", "listings:update", {
    id: listingIds[0],
    photoAssets: assets,
  });
  registry = rows();
  assert(
    uploads.every(
      (photo) =>
        registry.find((row) => row.storageId === photo.storageId)?.expiresAt ===
        undefined,
    ),
  );
  await refresh();
  for (const id of listingIds) {
    const listing = await call("query", "listings:getById", { id });
    assert.equal(listing.title, data.title);
    assert.equal(listing.landlordId, user._id);
    assert.equal(listing.publicationRequested, false);
    await call("mutation", "listings:deleteListing", { id });
  }
  registry = rows();
  assert(
    uploads.every(
      (photo) =>
        registry.find((row) => row.storageId === photo.storageId)?.expiresAt >
        Date.now() + 6.9 * 86400000,
    ),
  );
  for (const photo of uploads)
    assert.equal((await fetch(photo.url)).status, 200);
  const receipt = {
    checkedAt: new Date().toISOString(),
    deployment,
    actualClerkDevelopmentJwt: true,
    reservedSyntheticAccountOnly: true,
    actualHttpUploadsAndExactBytes: true,
    privateListingSaveAndHydration: true,
    anonymousPrivateListingReadDenied: true,
    nativeReferenceMigrationReady: true,
    sharedReferenceHasNoExpiry: true,
    finalReferenceRemovalStartsSevenDayRecovery: true,
    reattachmentClearsExpiry: true,
    ownDisposableUnpublishedListingsDeleted: true,
    uploadedBytesRetainedDuringRecovery: true,
    forcedCloudExpiryOrByteDeletion: false,
    realSevenDayElapsedAcceptance: false,
    productionChanged: false,
    realEmailOrSmsSent: false,
  };
  writeFileSync(
    "docs/evidence/hosted-photo-retention.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(
    "Actual Clerk development upload/save/reference/recovery checks passed; private QA rentals deleted and bytes left in their seven-day window.",
  );
} finally {
  await refresh();
  for (const id of listingIds) {
    const listing = await call("query", "listings:getById", { id });
    if (listing) {
      assert(
        listing.title === `[QA] Hosted photo retention ${suffix}` &&
          listing.landlordId === user._id &&
          listing.publicationRequested === false,
      );
      await call("mutation", "listings:deleteListing", { id });
    }
  }
}
