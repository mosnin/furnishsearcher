import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { syntheticPanel } from "./synthetic-photo.mjs";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
const env = readFileSync(".env.local", "utf8");
const url = env
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
  .trim()
  .replace(/^"|"$/g, "");
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Photo smoke refuses hosted targets",
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(env),
  "Photo smoke requires an isolated anonymous deployment",
);
assert(
  !/^CONVEX_DEPLOY_KEY=/m.test(env),
  "Photo smoke refuses a deployment key",
);
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), config.ports.cloud);
const site = `http://127.0.0.1:${config.ports.site}`;
const subject = "qa-owner-search";
const identity = {
  subject,
  issuer: "https://qa.furnishsearcher.invalid",
  tokenIdentifier: subject,
};
const client = new ConvexHttpClient(url);
client.setAdminAuth(config.adminKey, identity);
const query = (name, args) => client.query(makeFunctionReference(name), args);
const mutate = (name, args) =>
  client.mutation(makeFunctionReference(name), args);
const owner = await query("users:getByClerkId", { clerkId: subject });
assert(owner, "Run test:local-search first to create synthetic accounts");
const listing = (
  await query("listings:getByLandlord", { landlordId: owner._id })
).find((l) => l.title === "[QA] Flexible Austin apartment");
assert(listing, "Run test:local-search first to create synthetic listings");
const authorization = `Convex ${config.adminKey}:${Buffer.from(JSON.stringify(identity)).toString("base64")}`;
const assets = [];
for (const [index, color] of ["#d7e7ed", "#d9e8d7"].entries()) {
  const caption = `[QA] Synthetic color panel ${index + 1}; no property is shown`;
  const existing = listing.photoAssets?.find(
    (a) => a.caption === caption && a.storageId,
  );
  const bytes = syntheticPanel(color);
  if (existing) {
    const previousUrl = await mutate("files:getUrl", {
      storageId: existing.storageId,
    });
    const previous = previousUrl ? await fetch(previousUrl) : null;
    if (
      previous?.ok &&
      Buffer.from(await previous.arrayBuffer()).equals(bytes)
    ) {
      assets.push(existing);
      continue;
    }
  }
  const response = await fetch(`${site}/photos/upload`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "image/png" },
    body: bytes,
  });
  assert.equal(response.status, 200, "Privileged local HTTP upload failed");
  const photo = await response.json();
  const stored = await fetch(photo.url);
  assert.equal(stored.status, 200);
  assert.deepEqual(Buffer.from(await stored.arrayBuffer()), bytes);
  assets.push({ storageId: photo.storageId, caption });
}
await mutate("listings:update", {
  id: listing._id,
  photos: [],
  photoAssets: assets,
});
await prepareLocalPublication([listing._id]);
let publicListing = await new ConvexHttpClient(url).query(
  makeFunctionReference("listings:getById"),
  { id: listing._id },
);
assert.deepEqual(
  publicListing.photoCaptions,
  assets.map((a) => a.caption),
);
assert.equal(publicListing.photos.length, 2);
// Change cover and caption, then restore the fixture's intentional order.
await mutate("listings:update", {
  id: listing._id,
  photoAssets: [{ ...assets[1], caption: "[QA] Temporary cover" }, assets[0]],
});
await prepareLocalPublication([listing._id]);
publicListing = await query("listings:getById", { id: listing._id });
assert.equal(publicListing.photoCaptions[0], "[QA] Temporary cover");
await mutate("listings:update", { id: listing._id, photoAssets: assets });
const otherClient = new ConvexHttpClient(url);
otherClient.setAdminAuth(config.adminKey, {
  subject: "qa-tenant-search",
  issuer: identity.issuer,
});
assert.equal(
  await otherClient.mutation(makeFunctionReference("files:getUrl"), {
    storageId: assets[0].storageId,
  }),
  null,
);
const anonymous = await fetch(`${site}/photos/upload`, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: new Uint8Array([1, 2, 3]),
});
assert.equal(anonymous.status, 401);
const invalid = await fetch(`${site}/photos/upload`, {
  method: "POST",
  headers: { Authorization: authorization, "Content-Type": "image/png" },
  body: "not an image",
});
assert.equal(invalid.status, 400);
await prepareLocalPublication([listing._id]);
publicListing = await query("listings:getById", { id: listing._id });
const receipt = {
  checkedAt: new Date().toISOString(),
  target: url,
  hosted: false,
  authentication:
    "Privileged local development identities via the SDK's admin auth format, not a real Clerk browser/JWT session",
  listingId: listing._id,
  storageIds: assets.map((a) => a.storageId),
  photos: publicListing.photos,
  exactStoredBytesVerified: true,
  orderAndCaptionPersisted: true,
  unrelatedPrivateLookupRejected: true,
  anonymousUploadRejected: true,
  invalidImageRejected: true,
  realCustomerDataChanged: false,
};
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/local-photo-smoke.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt, null, 2));
