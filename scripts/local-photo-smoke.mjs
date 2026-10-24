import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { deflateSync } from "node:zlib";
// Small, visibly synthetic PNG fixtures; no property photography or image library needed.
function syntheticPanel(hex) {
  const width = 1200,
    height = 800;
  const rgb = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++)
        rows[y * (width * 3 + 1) + 1 + x * 3 + c] = rgb[c];
  const chunk = (name, data) => {
    const body = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
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
