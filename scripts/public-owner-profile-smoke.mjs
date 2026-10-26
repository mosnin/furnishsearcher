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
const all = async (client, name, args = {}) => {
  let cursor = null,
    done = false,
    pages = 0;
  const rows = [];
  while (!done) {
    assert(pages++ < 100);
    const result = await query(client, name, {
      ...args,
      paginationOpts: { cursor, numItems: 10 },
    });
    assert(result.page.length <= 10);
    rows.push(...result.page);
    cursor = result.continueCursor;
    done = result.isDone;
  }
  return { rows, pages };
};
const managed = await all(owner, "ownerDirectory:list"),
  guest = await all(anonymous, "publicOwnerListings:list", {
    landlordId: me._id,
  }),
  signed = await all(owner, "publicOwnerListings:list", { landlordId: me._id });
assert(managed.rows.length > 0);
assert.deepEqual(signed.rows, guest.rows);
const allowed = [
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
].sort();
for (const row of guest.rows) {
  assert.deepEqual(Object.keys(row).sort(), allowed);
  const privateRow = managed.rows.find((r) => r._id === row._id);
  assert(privateRow?.publication.live);
  assert(row.photos.length <= 1);
}
let privatePreviews = 0;
for (const managedRow of managed.rows) {
  const managerView = await query(owner, "listings:getById", {
    id: managedRow._id,
  });
  assert(managerView?.canManage);
  assert.equal(managerView.isPublic, managedRow.publication.live);
  const guestView = await query(anonymous, "listings:getById", {
    id: managedRow._id,
  });
  if (managedRow.publication.live) {
    assert(guestView?.isPublic);
    assert.equal(guestView.canManage, false);
    assert.equal(guestView.address, "");
  } else {
    assert.equal(guestView, null);
    privatePreviews++;
  }
}
writeFileSync(
  `docs/evidence/${mode}-listing-preview-native.json`,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      environment: url,
      authClass,
      readOnly: true,
      managedRentals: managed.rows.length,
      privatePreviews,
      publicRentals: guest.rows.length,
      managerFlagRequiresNativeOwner: true,
      publicFlagMatchesCurrentReadiness: true,
      privatePreviewsDeniedToAnonymous: true,
      publicTravelerViewRedactsAddress: guest.rows.length ? true : null,
      syntheticLocalPrerequisites: mode === "local",
      syntheticCloudGrants: false,
      providerRequests: 0,
    },
    null,
    2,
  ) + "\n",
);
const live = managed.rows.filter((r) => r.publication.live);
assert.deepEqual(
  new Set(guest.rows.map((r) => r._id)),
  new Set(live.map((r) => r._id)),
);
if (mode === "local")
  assert(
    guest.rows.length > 0,
    "Existing isolated local publication prerequisites no longer provide a positive card; do not mint cloud grants",
  );
else {
  assert(
    managed.rows.some((r) => r._id === "n572ng3271p6f1gpmwtypef71x8gyg37"),
  );
  assert.equal(guest.rows.length, 0);
}
const profile = await query(anonymous, "users:getPublicProfile", {
  userId: me._id,
});
assert(profile);
assert(!Object.hasOwn(profile, "email"));
assert(!Object.hasOwn(profile, "phone"));
const receipt = {
  checkedAt: new Date().toISOString(),
  environment: url,
  authClass,
  readOnly: true,
  managedRentalCount: managed.rows.length,
  publicRentalCount: guest.rows.length,
  publicPages: guest.pages,
  ownerAndAnonymousResultsIdentical: true,
  onlyCurrentlyLiveManagedRowsReturned: true,
  explicitCardFieldAllowlist: true,
  coverPhotoOnly: true,
  publicProfileOmitsEmailAndPhone: true,
  syntheticLocalPublicationPrerequisites: mode === "local",
  syntheticCloudPaidOrIdentityGrants: false,
  providerRequests: 0,
};
writeFileSync(
  `docs/evidence/${mode}-public-owner-profile-native.json`,
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
