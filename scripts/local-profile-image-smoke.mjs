import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const env = readFileSync(".env.local", "utf8"),
  url = env
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
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const site = `http://127.0.0.1:${cfg.ports.site}`;
const identity = (subject) => ({
  subject,
  issuer: "https://qa.furnishsearcher.invalid",
});
const make = (subject) => {
  const client = new ConvexHttpClient(url);
  client.setAdminAuth(cfg.adminKey, identity(subject));
  return client;
};
const auth = (subject) =>
  `Convex ${cfg.adminKey}:${Buffer.from(JSON.stringify(identity(subject))).toString("base64")}`;
const call = (client, method, name, args) =>
  client[method](makeFunctionReference(name), args);
const ownerSubject = "qa-profile-image-owner",
  tenantSubject = "qa-profile-image-tenant";
const owner = make(ownerSubject),
  tenant = make(tenantSubject),
  anonymous = new ConvexHttpClient(url);
const user = await call(owner, "mutation", "users:getOrCreate", {
  clerkId: ownerSubject,
  name: "[QA] Synthetic profile image owner",
  email: "qa-profile-image-owner@example.test",
});
await call(owner, "mutation", "users:updateRole", {
  userId: user._id,
  role: "landlord",
});
const traveler = await call(tenant, "mutation", "users:getOrCreate", {
  clerkId: tenantSubject,
  name: "[QA] Synthetic profile image traveler",
  email: "qa-profile-image-tenant@example.test",
});
const state = (client) => call(client, "query", "profileImages:mine", {});
const clear = async (client) => {
  const images = await state(client);
  for (const kind of ["profile", "pet"])
    if (images[kind].url)
      await call(client, "mutation", "profileImages:remove", {
        kind,
        expectedRevision: images[kind].revision,
      });
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAXkAAAAASUVORK5CYII=",
  "base64",
);
const upload = (
  subject,
  kind,
  revision,
  requestId = randomUUID(),
  authenticated = true,
) =>
  fetch(
    `${site}/profile-images/upload?${new URLSearchParams({ kind, revision: String(revision), requestId })}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        ...(authenticated ? { Authorization: auth(subject) } : {}),
      },
      body: png,
    },
  );
const imageResponse = async (response) => {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
};
const verifyBytes = async (imageUrl) => {
  assert.equal(new URL(imageUrl).hostname, new URL(url).hostname);
  const response = await fetch(imageUrl);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
};
await clear(owner);
await clear(tenant);
try {
  let images = await state(owner);
  assert.equal(
    (
      await upload(
        ownerSubject,
        "profile",
        images.profile.revision,
        randomUUID(),
        false,
      )
    ).status,
    401,
  );
  const requestId = randomUUID(),
    revision = images.profile.revision;
  const responses = await Promise.all([
    upload(ownerSubject, "profile", revision, requestId),
    upload(ownerSubject, "profile", revision, requestId),
  ]);
  const pair = await Promise.all(responses.map(imageResponse));
  assert.equal(pair[0].revision, revision + 1);
  assert.equal(pair[0].url, pair[1].url);
  assert(pair.some((result) => result.duplicate));
  const firstUrl = pair[0].url;
  await verifyBytes(firstUrl);
  const reopened = await call(owner, "query", "users:getByClerkId", {
    clerkId: ownerSubject,
  });
  assert.equal(reopened.profilePhoto, firstUrl);
  assert.equal(
    await call(tenant, "mutation", "files:getUrl", {
      storageId: reopened.profilePhotoStorageId,
    }),
    null,
  );
  await assert.rejects(
    call(owner, "mutation", "users:updateProfile", {
      userId: user._id,
      profilePhoto: "https://example.test/not-uploaded.png",
    }),
  );
  const competing = await Promise.all([
    upload(ownerSubject, "profile", revision + 1),
    upload(ownerSubject, "profile", revision + 1),
  ]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
  images = await state(owner);
  assert.equal(images.profile.revision, revision + 2);
  await verifyBytes(images.profile.url);
  assert(!(await fetch(firstUrl)).ok);
  const replay = await imageResponse(
    await upload(ownerSubject, "profile", revision, requestId),
  );
  assert.equal(replay.applied, false);
  assert.equal(replay.url, images.profile.url);
  await imageResponse(await upload(ownerSubject, "pet", images.pet.revision));
  const publicProfile = await call(
    anonymous,
    "query",
    "users:getPublicProfile",
    { userId: user._id },
  );
  assert(publicProfile.profilePhoto && publicProfile.petPhoto);
  assert(!Object.hasOwn(publicProfile, "profilePhotoStorageId"));
  assert(!Object.hasOwn(publicProfile, "petPhotoStorageId"));
  const tenantImages = await state(tenant);
  await imageResponse(
    await upload(tenantSubject, "profile", tenantImages.profile.revision),
  );
  assert.equal(
    await call(anonymous, "query", "users:getPublicProfile", {
      userId: traveler._id,
    }),
    null,
  );
  assert.equal(
    await call(owner, "query", "reviews:travelerProfile", { id: traveler._id }),
    null,
  );
  const petBefore = (await state(owner)).pet.url;
  await call(owner, "mutation", "profileImages:remove", {
    kind: "profile",
    expectedRevision: images.profile.revision,
  });
  assert.equal((await state(owner)).profile.url, null);
  assert.equal((await state(owner)).pet.url, petBefore);
  assert(!(await fetch(images.profile.url)).ok);
} finally {
  await clear(owner);
  await clear(tenant);
}
assert.equal((await state(owner)).profile.url, null);
assert.equal((await state(owner)).pet.url, null);
writeFileSync(
  "docs/evidence/local-profile-image-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      actualLocalHttpUploads: true,
      parallelRetrySingleRevision: true,
      competingEditsOneWinner: true,
      persistedAcrossFreshQuery: true,
      publicImageBytesMatch: true,
      replacedAndRemovedImageUrlsRejectFreshFetch: true,
      oldRetryCannotRestoreReplacedImage: true,
      profileAndPetIndependent: true,
      arbitraryUrlRejected: true,
      profileImagesCannotUseListingUrlGateway: true,
      publicProjectionOmitsStorageFields: true,
      travelerDetailsRequireRelationship: true,
      syntheticImagesRemoved: true,
      privilegedSyntheticIdentities: true,
      actualClerkBrowserJwt: false,
      renderedBrowserCropAcceptance: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Local profile-image smoke passed; real local storage/HTTP, synthetic identities, no rendered browser acceptance.",
);
