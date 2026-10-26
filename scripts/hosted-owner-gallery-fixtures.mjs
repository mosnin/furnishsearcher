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
  privatePath = "../hosted-owner-gallery.private.json";
assert(["setup", "inspect", "check", "cleanup"].includes(mode));
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
    title: `[QA] Browser gallery ${randomUUID().slice(0, 8)}`,
    cleaned: false,
  };
  save();
  writeFileSync("../owner-gallery-blue.png", syntheticPanel("#2457a8"));
  writeFileSync("../owner-gallery-amber.png", syntheticPanel("#cb8934"));
  console.log(
    JSON.stringify({
      title: fixture.title,
      blue: "../owner-gallery-blue.png",
      amber: "../owner-gallery-amber.png",
    }),
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === me._id &&
      fixture.title.startsWith("[QA] Browser gallery "),
  );
  const candidates = (
    await call("query", "listings:getByLandlord", { landlordId: me._id })
  ).filter((l) => l.title === fixture.title);
  assert.equal(
    candidates.length,
    1,
    "Exactly the current run's own private gallery fixture is required",
  );
  const listing = candidates[0];
  assert.equal(listing.landlordId, me._id);
  assert.equal(listing.publicationRequested, false);
  assert.equal(listing.status, "pending");
  if (fixture.listingId) assert.equal(listing._id, fixture.listingId);
  else {
    fixture.listingId = listing._id;
    save();
  }
  if (mode === "cleanup") {
    await call("mutation", "listings:deleteListing", { id: listing._id });
    assert.equal(
      await call("query", "listings:getById", { id: listing._id }),
      null,
    );
    fixture.cleaned = true;
    save();
    console.log(
      "Only this run's private gallery listing deleted; unused images retain their native recovery period.",
    );
  } else {
    const assets = listing.photoAssets ?? [];
    if (mode === "check") {
      assert.equal(assets.length, 2);
      assert(assets.every((p) => p.storageId && !p.legacyUrl));
      assert.equal(
        assets[0].caption,
        "[QA] Amber cover — synthetic test panel",
      );
      assert.equal(
        assets[1].caption,
        "[QA] Blue rotated — synthetic test panel",
      );
      assert.equal(listing.maxOccupancy, 3);
      assert.equal(listing.price, 1875);
      assert.equal(listing.publicationRequested, false);
      assert.equal(
        await anonymous.query(makeFunctionReference("listings:getById"), {
          id: listing._id,
        }),
        null,
      );
      writeFileSync(
        "docs/evidence/hosted-owner-gallery-native.json",
        JSON.stringify(
          {
            checkedAt: new Date().toISOString(),
            deployment,
            actualReservedOwnerClerkJwt: true,
            browserCreatedPrivateListing: true,
            canonicalGalleryOrderAndCaptionsPersisted: true,
            priceAndOccupancyPersisted: true,
            anonymousPrivateListingDenied: true,
            publicPaidIdentityAcceptance: false,
            productionChanged: false,
            realEmailOrSmsSent: false,
          },
          null,
          2,
        ) + "\n",
      );
    }
    console.log(
      JSON.stringify({
        id: listing._id,
        title: listing.title,
        price: listing.price,
        occupants: listing.maxOccupancy,
        photoCount: assets.length,
        canonical: assets.every((p) => !!p.storageId),
        captions: assets.map((p) => p.caption),
        private: listing.publicationRequested === false,
      }),
    );
  }
}
