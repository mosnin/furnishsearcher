import sharp from "sharp";
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
const mode = process.argv[2],
  privatePath = "../hosted-photo-editor.private.json";
assert(["setup", "crop", "replacement", "cleanup"].includes(mode));
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
if (mode === "setup") {
  assert(!fixture || fixture.cleaned);
  fixture = {
    ownerId: me._id,
    title: `[QA] Photo editor ${randomUUID().slice(0, 8)}`,
    cleaned: false,
  };
  save();
  writeFileSync("../photo-editor-blue.png", syntheticPanel("#2457a8"));
  writeFileSync("../photo-editor-amber.png", syntheticPanel("#cb8934"));
  fixture.listingId = await call("mutation", "listings:create", {
    landlordId: me._id,
    title: fixture.title,
    description:
      "Synthetic private photo editor acceptance fixture. Not an actual rental or property photograph.",
    address: "Synthetic QA address — do not geocode",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1800,
    bedrooms: 1,
    bathrooms: 1,
    maxOccupancy: 2,
    propertyType: "Apartment",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: false,
    parkingIncluded: false,
    availableFrom: Date.UTC(2026, 11, 2),
    minStay: 30,
  });
  save();
  console.log(
    JSON.stringify({ title: fixture.title, listingId: fixture.listingId }),
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === me._id &&
      fixture.title.startsWith("[QA] Photo editor "),
  );
  const listing = await call("query", "listings:getById", {
    id: fixture.listingId,
  });
  assert(
    listing && listing.title === fixture.title && listing.landlordId === me._id,
  );
  assert.equal(listing.publicationRequested, false);
  assert.equal(listing.status, "pending");
  assert.equal(
    await anonymous.query(makeFunctionReference("listings:getById"), {
      id: listing._id,
    }),
    null,
  );
  const receiptPath = "docs/evidence/hosted-photo-editor-native.json";
  const receipt = existsSync(receiptPath)
    ? JSON.parse(readFileSync(receiptPath, "utf8"))
    : {
        development: deployment,
        actualClerkJwt: true,
        privateFixtureOnly: true,
        noPaidOrIdentityExceptions: true,
      };
  if (mode === "cleanup") {
    await call("mutation", "listings:deleteListing", { id: listing._id });
    assert.equal(
      await call("query", "listings:getById", { id: listing._id }),
      null,
    );
    fixture.cleaned = true;
    save();
    receipt.ownPrivateFixtureDeleted = true;
    receipt.unusedImagesRetainNormalRecoveryPeriod = true;
  } else {
    assert.equal(listing.photoAssets.length, mode === "crop" ? 2 : 1);
    assert(listing.photoAssets.every((p) => p.storageId && !p.legacyUrl));
    assert.equal(
      listing.photoAssets[0].caption,
      "[QA] Cropped blue synthetic panel",
    );
    const response = await fetch(listing.photos[0]);
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    const pixel = await sharp(bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const expected = mode === "crop" ? [36, 87, 168] : [203, 137, 52];
    for (let c = 0; c < 3; c++)
      assert(Math.abs(pixel.data[c] - expected[c]) <= 3);
    assert.equal(metadata.width, mode === "crop" ? 600 : 1200);
    assert.equal(metadata.height, mode === "crop" ? 400 : 800);
    assert.equal(metadata.format, mode === "crop" ? "jpeg" : "png");
    if (mode === "crop")
      fixture.croppedStorageId = listing.photoAssets[0].storageId;
    else
      assert.notEqual(
        listing.photoAssets[0].storageId,
        fixture.croppedStorageId,
      );
    save();
    receipt[mode] = {
      checkedAt: new Date().toISOString(),
      count: listing.photoAssets.length,
      actualByteDimensions: [metadata.width, metadata.height],
      format: metadata.format,
      expectedSyntheticColor: true,
      captionPreserved: true,
      anonymousDenied: true,
    };
  }
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(`Private native photo editor ${mode} verified.`);
}
