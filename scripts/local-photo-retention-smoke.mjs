import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { syntheticPanel } from "./synthetic-photo.mjs";

const source = readFileSync(".env.local", "utf8");
const url = source
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
  .trim()
  .replace(/^"|"$/g, "");
assert(
  url &&
    new URL(url).protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(source) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(source),
);
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const env = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete env[key];
const deploymentFile = "../.photo-retention-local.private.env";
const harnessPath = "convex/__photoRetentionLocalQA.ts";
assert(!existsSync(harnessPath), "Do not replace an existing local harness");
writeFileSync(
  deploymentFile,
  `CONVEX_SELF_HOSTED_URL=${url}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${cfg.adminKey}\n`,
  { mode: 0o600 },
);
const cli = (...args) =>
  spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--env-file", deploymentFile],
    { env, encoding: "utf8" },
  );
const resend = cli("env", "get", "RESEND_API_KEY");
assert.equal(resend.status, 0);
assert.equal(
  resend.stdout.trim(),
  "",
  "Synthetic QA refuses active email delivery",
);
const deploy = (label) => {
  const result = cli("deploy");
  writeFileSync(
    `../photo-retention-${label}.log`,
    result.stdout + result.stderr,
    { mode: 0o600 },
  );
  assert.equal(result.status, 0, "Local push failed; private log retained");
};
const subject = `qa-photo-retention-${randomUUID()}`;
const client = new ConvexHttpClient(url, { logger: false });
client.setAdminAuth(cfg.adminKey, {
  subject,
  issuer: "https://qa.furnishsearcher.invalid",
});
const call = (type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const admin = new ConvexHttpClient(url, { logger: false });
admin.setAdminAuth(cfg.adminKey);
const maintenance = () =>
  admin.mutation(makeFunctionReference("photoRetention:maintenance"), {});
const site = `http://127.0.0.1:${cfg.ports.site}`;
const authorization = `Convex ${cfg.adminKey}:${Buffer.from(JSON.stringify({ subject, issuer: "https://qa.furnishsearcher.invalid" })).toString("base64")}`;
let harnessInstalled = false;
try {
  // A temporary local-only test helper ages ONLY this run's unused uploads.
  // It is removed and the real application re-pushed before the script returns.
  writeFileSync(
    harnessPath,
    `import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { syncPhotoReferences } from "./lib/photoRetention";
export const expire = internalMutation({ args: { storageId: v.id("_storage") }, returns: v.null(), handler: async (ctx, args) => {
 const identity = await ctx.auth.getUserIdentity();
 if (identity?.subject !== ${JSON.stringify(subject)}) throw new Error("Not this reserved local fixture");
 const user = await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject)).unique();
 const row = await ctx.db.query("photoUploads").withIndex("by_storage", q => q.eq("storageId", args.storageId)).unique();
 const ref = await ctx.db.query("listingPhotoReferences").withIndex("by_storage", q => q.eq("storageId", args.storageId)).first();
 if (!user || !row || row.ownerId !== user._id || row.cleanupVersion !== 1 || ref || row.expiresAt === undefined) throw new Error("Only unused local fixture uploads can be aged");
 await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 }); return null;
} });
export const legacyGallery = internalMutation({ args: { listingId: v.id("listings"), storageId: v.id("_storage") }, returns: v.null(), handler: async (ctx, args) => {
 const identity = await ctx.auth.getUserIdentity();
 if (identity?.subject !== ${JSON.stringify(subject)}) throw new Error("Not this reserved local fixture");
 const user = await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject)).unique();
 const listing = await ctx.db.get(args.listingId);
 const row = await ctx.db.query("photoUploads").withIndex("by_storage", q => q.eq("storageId", args.storageId)).unique();
 const url = await ctx.storage.getUrl(args.storageId);
 if (!user || !listing || listing.landlordId !== user._id || !row || row.ownerId !== user._id || !url) throw new Error("Not a reserved local photo/gallery");
 await ctx.db.patch(listing._id, { photoAssets: undefined, photos: [url] });
 await syncPhotoReferences(ctx, (await ctx.db.get(listing._id))!); return null;
} });\n`,
    { mode: 0o600 },
  );
  harnessInstalled = true;
  deploy("local-qa-push");
  const user = await call("mutation", "users:getOrCreate", {
    clerkId: subject,
    name: "[QA] Isolated photo retention",
    email: "photo-retention@example.test",
  });
  const bytes = syntheticPanel("#c5d8e7");
  const upload = async () => {
    const response = await fetch(`${site}/photos/upload`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "image/png" },
      body: bytes,
    });
    assert.equal(response.status, 200);
    const photo = await response.json();
    assert.deepEqual(
      Buffer.from(await (await fetch(photo.url)).arrayBuffer()),
      bytes,
    );
    return photo;
  };
  const photo = await upload(),
    abandoned = await upload();
  const data = {
    landlordId: user._id,
    title: "[QA] Private photo retention",
    description: "Synthetic panel; no real rental",
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
  const assets = [
    { storageId: photo.storageId, caption: "[QA] Synthetic panel" },
  ];
  const a = await call("mutation", "listings:create", {
    ...data,
    photoAssets: assets,
  });
  const b = await call("mutation", "listings:create", {
    ...data,
    photoAssets: assets,
  });
  // Native paged migration/continuations must be ready, without altering its ledger.
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await maintenance()).ready) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, "Native reference migration did not finish");
  await call("mutation", "__photoRetentionLocalQA:legacyGallery", {
    listingId: b,
    storageId: photo.storageId,
  });
  assert.equal(
    (await fetch(abandoned.url)).status,
    200,
    "Fresh abandoned uploads keep their recovery window",
  );
  await call("mutation", "__photoRetentionLocalQA:expire", {
    storageId: abandoned.storageId,
  });
  await maintenance();
  assert.equal((await fetch(abandoned.url)).status, 404);
  assert.equal(
    await call("mutation", "files:getUrl", { storageId: abandoned.storageId }),
    null,
  );
  await call("mutation", "listings:update", { id: a, photoAssets: [] });
  await assert.rejects(
    call("mutation", "__photoRetentionLocalQA:expire", {
      storageId: photo.storageId,
    }),
    /unused local fixture/,
  );
  await maintenance();
  assert.equal(
    (await fetch(photo.url)).status,
    200,
    "Second rental still owns a reference",
  );
  await call("mutation", "listings:update", { id: b, photoAssets: [] });
  await maintenance();
  assert.equal(
    (await fetch(photo.url)).status,
    200,
    "Removed photos keep their recovery window",
  );
  await call("mutation", "listings:update", { id: a, photoAssets: assets });
  assert.equal(
    (await call("query", "listings:getById", { id: a })).photos[0],
    photo.url,
  );
  await call("mutation", "listings:update", { id: a, photoAssets: [] });
  await call("mutation", "__photoRetentionLocalQA:expire", {
    storageId: photo.storageId,
  });
  await maintenance();
  assert.equal((await fetch(photo.url)).status, 404);
  await assert.rejects(
    call("mutation", "listings:update", { id: a, photoAssets: assets }),
    /not found/,
  );
  for (const id of [a, b])
    await call("mutation", "listings:deleteListing", { id });
  const receipt = {
    checkedAt: new Date().toISOString(),
    target: url,
    hosted: false,
    authentication:
      "Privileged isolated local development identity, not real Clerk/provider acceptance",
    actualAuthenticatedHttpUploadAndExactBytes: true,
    actualNativeReferenceMigrationCompleted: true,
    sharedRentalReferenceProtectsBytes: true,
    actualNativeLegacyStorageUrlReferenceProtected: true,
    freshAndRemovedRecoveryWindowPreservesBytes: true,
    reattachmentBeforeExpiryWorks: true,
    abandonedAndFinalReferenceExpiryDeletesActualBytes: true,
    expiredGallerySaveRejected: true,
    syntheticListingsDeleted: true,
    deadlineAcceptance:
      "Only this new reserved fixture's unused deadlines were aged through a temporary guarded local helper; seven days were not elapsed in real time",
    productionChanged: false,
    realEmailOrSmsSent: false,
  };
  writeFileSync(
    "docs/evidence/local-photo-retention-smoke.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(
    "Native local photo retention passed: shared reference, recovery, real byte deletion and expired-save rejection.",
  );
} finally {
  try {
    if (harnessInstalled) {
      unlinkSync(harnessPath);
      deploy("local-final-push");
    }
  } finally {
    unlinkSync(deploymentFile);
  }
}
