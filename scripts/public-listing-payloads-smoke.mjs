import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createClerkClient } from "@clerk/backend";
const mode = process.argv[2];
assert(["local", "hosted"].includes(mode));
const query = (client, name, args = {}) =>
  client.query(makeFunctionReference(name), args);
let owner, anonymous, me, url, authClass;
if (mode === "local") {
  const selector = readFileSync(".env.local", "utf8");
  assert(/^CONVEX_DEPLOYMENT=anonymous:/m.test(selector));
  url = selector
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)[1]
    .trim()
    .replace(/^"|"$/g, "");
  assert(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  const config = JSON.parse(
    readFileSync(".convex/local/default/config.json", "utf8"),
  );
  assert.equal(Number(new URL(url).port), config.ports.cloud);
  owner = new ConvexHttpClient(url, { logger: false });
  anonymous = new ConvexHttpClient(url, { logger: false });
  owner.setAdminAuth(config.adminKey, {
    subject: "qa-owner-search",
    issuer: "https://qa.clerk.accounts.dev",
  });
  me = await query(owner, "users:getByClerkId", { clerkId: "qa-owner-search" });
  assert.equal(me.email, "qa-owner@example.test");
  authClass =
    "privileged synthetic local owner; not actual Clerk authentication";
} else {
  const keys = JSON.parse(readFileSync(".clerk/.tmp/keyless.json", "utf8"));
  assert(keys.publishableKey.startsWith("pk_test_"));
  const response = await fetch("https://api.clerk.com/v1/instance", {
    headers: { Authorization: `Bearer ${keys.secretKey}` },
  });
  assert.equal(response.status, 200);
  const instance = await response.json();
  assert.equal(instance.environment_type, "development");
  assert.equal(instance.id, "ins_3L9oPR1TeW643w6zPX1vgsOFAxU");
  const clerk = createClerkClient({ secretKey: keys.secretKey }),
    session = JSON.parse(
      readFileSync("../hosted-auth-session.private.json", "utf8"),
    ),
    account = await clerk.users.getUser(session.userId);
  assert(account.externalId?.startsWith("furnishsearcher-qa-"));
  assert(
    account.emailAddresses.every((e) =>
      e.emailAddress.endsWith("+clerk_test@example.com"),
    ),
  );
  url = "https://cheerful-ferret-182.convex.cloud";
  owner = new ConvexHttpClient(url, { logger: false });
  anonymous = new ConvexHttpClient(url, { logger: false });
  owner.setAuth(
    (await clerk.sessions.getToken(session.sessionId, "convex")).jwt,
  );
  me = await query(owner, "users:getByClerkId", { clerkId: account.id });
  authClass = "actual reserved owner Clerk JWT";
}
assert.equal(me.role, "landlord");
const privateFields = [
  "photoAssets",
  "photoDrafts",
  "revision",
  "approvedRevision",
  "approvalStatus",
  "publicationRequested",
  "moderationHold",
  "featuredPaymentId",
  "featuredUntil",
  "featuredMode",
  "searchCity",
  "searchState",
  "propertyLocationVersion",
  "locationConfirmedAt",
  "locationGeneration",
  "firstPublishedAt",
  "calendarSyncThrough",
  "unitNameKey",
  "independentSpaceConfirmedAt",
  "_creationTime",
];
let cursor = null,
  done = false,
  pages = 0,
  publicDetails = 0,
  privateDetails = 0,
  publicPhotos = 0;
const ownPublicIds = new Set();
while (!done) {
  assert(pages++ < 100);
  const p = await query(owner, "ownerDirectory:list", {
    paginationOpts: { cursor, numItems: 10 },
  });
  for (const row of p.page) {
    const manager = await query(owner, "listings:getById", { id: row._id });
    assert(manager?.canManage);
    assert(Array.isArray(manager.photoDrafts));
    assert.equal(manager.photoDrafts.length, manager.photos.length);
    const guest = await query(anonymous, "listings:getById", { id: row._id });
    if (!row.publication.live) {
      assert.equal(guest, null);
      privateDetails++;
      continue;
    }
    assert(guest?.isPublic && !guest.canManage);
    assert.equal(guest.address, "");
    assert.equal(guest.zip, "");
    for (const key of privateFields)
      assert(!Object.hasOwn(guest, key), `Public detail exposed ${key}`);
    assert.deepEqual(guest.photos, manager.photos);
    assert.deepEqual(guest.photoCaptions, manager.photoCaptions);
    assert.deepEqual(guest.details, manager.details);
    assert.deepEqual(guest.amenities, manager.amenities);
    assert.equal(guest.landlord?._id, me._id);
    assert(!Object.hasOwn(guest.landlord, "email"));
    assert(!Object.hasOwn(guest.landlord, "phone"));
    publicDetails++;
    publicPhotos += guest.photos.length;
    ownPublicIds.add(row._id);
  }
  cursor = p.continueCursor;
  done = p.isDone;
}
assert(privateDetails > 0);
if (mode === "local")
  assert(
    publicDetails > 0,
    "Local positive publication prerequisites unavailable; do not mint hosted grants",
  );
else assert.equal(publicDetails, 0);
const legacy = await query(anonymous, "listings:search", {}),
  highlights = await query(anonymous, "listings:getFeatured", {});
assert(highlights.length <= 6);
for (const row of [...legacy, ...highlights]) {
  assert.equal(row.address, "");
  for (const key of privateFields)
    assert(!Object.hasOwn(row, key), `Public array exposed ${key}`);
}
assert.deepEqual(highlights, await query(owner, "listings:getFeatured", {}));
const highlightKeys = [
  "_id",
  "title",
  "city",
  "state",
  "price",
  "bedrooms",
  "bathrooms",
  "propertyType",
  "photos",
  "petFriendly",
  "parkingIncluded",
  "utilitiesIncluded",
  "availableFrom",
  "minStay",
  "featured",
  "address",
  "landlordId",
].sort();
for (const card of highlights) {
  assert.deepEqual(Object.keys(card).sort(), highlightKeys);
  assert(card.photos.length <= 1);
  assert(card.landlordId);
  const detail = await query(anonymous, "listings:getById", { id: card._id });
  assert(detail?.isPublic);
  assert.equal(card.landlordId, detail.landlordId);
  assert.equal(card.photos[0], detail.photos[0]);
  assert.equal(card.featured, detail.featured);
}
const receipt = {
  checkedAt: new Date().toISOString(),
  environment: url,
  authClass,
  readOnly: true,
  managedPages: pages,
  privateDetails,
  publicDetails,
  publicPhotosCompared: publicPhotos,
  publicDetailPrivateFieldsAbsent: publicDetails ? true : null,
  publicFullPhotoOrderCaptionsAndDetailsMatchOwner: publicDetails ? true : null,
  ownerPhotoDraftsRemainAvailable: true,
  privateDetailsDeniedToAnonymous: true,
  legacySearchRows: legacy.length,
  highlightCards: highlights.length,
  publicArraysPrivateFieldsAbsent:
    legacy.length || highlights.length ? true : null,
  highlightAllowlistAndSingleCover: highlights.length ? true : null,
  highlightOwnerIdPreservesMessageHandoff: highlights.length ? true : null,
  highlightOwnerAndGuestMatch: true,
  syntheticLocalPublicationPrerequisites: mode === "local",
  syntheticCloudGrants: false,
  fixtureWrites: 0,
  providerRequests: 0,
};
writeFileSync(
  `docs/evidence/${mode}-public-listing-payloads-native.json`,
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
