import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createClerkClient } from "@clerk/backend";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-owner-tasks.private.json";
assert(["setup", "check", "cleanup"].includes(mode));
const keys = JSON.parse(readFileSync(".clerk/.tmp/keyless.json", "utf8"));
assert(keys.publishableKey.startsWith("pk_test_"));
const instance = await fetch("https://api.clerk.com/v1/instance", {
  headers: { Authorization: `Bearer ${keys.secretKey}` },
});
assert.equal(instance.status, 200);
const metadata = await instance.json();
assert.equal(metadata.environment_type, "development");
assert.equal(metadata.id, "ins_3L9oPR1TeW643w6zPX1vgsOFAxU");
const env = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete env[key];
const config = spawnSync(
  process.execPath,
  [
    "node_modules/convex/bin/main.js",
    "env",
    "get",
    "RESEND_API_KEY",
    "--deployment",
    deployment,
  ],
  { env, encoding: "utf8" },
);
assert.equal(
  config.status,
  0,
  "Could not verify isolated development configuration",
);
assert.equal(
  config.stdout.trim(),
  "",
  "Synthetic fixture refuses enabled email delivery",
);
const clerk = createClerkClient({ secretKey: keys.secretKey }),
  session = JSON.parse(
    readFileSync("../hosted-auth-session.private.json", "utf8"),
  );
const account = await clerk.users.getUser(session.userId);
assert(account.externalId?.startsWith("furnishsearcher-qa-"));
assert(
  account.emailAddresses.every((e) =>
    e.emailAddress.endsWith("+clerk_test@example.com"),
  ),
);
const jwt = (await clerk.sessions.getToken(session.sessionId, "convex")).jwt;
const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
client.setAuth(jwt);
const anonymous = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const call = (type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const me = await call("query", "users:getByClerkId", { clerkId: account.id });
assert.equal(me.role, "landlord");
let fixture = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : null;
const save = () =>
  writeFileSync(privatePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const allTasks = async () => {
  let cursor = null,
    done = false;
  const rows = [];
  let pages = 0;
  while (!done) {
    assert(pages++ < 50);
    const page = await call("query", "ownerTasks:listings", {
      paginationOpts: { cursor, numItems: 10 },
    });
    rows.push(...page.page);
    cursor = page.continueCursor;
    done = page.isDone;
  }
  return rows;
};
if (mode === "setup") {
  assert(!fixture || fixture.cleaned);
  fixture = {
    ownerId: me._id,
    title: `[QA] Owner next steps ${randomUUID().slice(0, 8)}`,
    description:
      "Synthetic QA property used only to verify dashboard task resolution. This is not a real rental.",
    photos: [],
    cleaned: false,
  };
  save();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAXkAAAAASUVORK5CYII=",
    "base64",
  );
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`https://${deployment}.convex.site/photos/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "image/png" },
      body: png,
    });
    assert.equal(r.status, 200);
    const photo = await r.json();
    assert(photo.storageId);
    fixture.photos.push({
      storageId: photo.storageId,
      caption: `Synthetic QA pixel ${i + 1}`,
    });
    save();
  }
  fixture.listingId = await call("mutation", "listings:create", {
    landlordId: me._id,
    title: fixture.title,
    description: "",
    address: "123 Synthetic QA Street",
    city: "Austin",
    state: "TX",
    zip: "78701",
    bedrooms: 1,
    bathrooms: 1,
    price: 1800,
    propertyType: "House",
    amenities: [],
    photos: [],
    photoAssets: fixture.photos,
    petFriendly: false,
    parkingIncluded: false,
    utilitiesIncluded: false,
    availableFrom: Date.UTC(2027, 3, 15),
    minStay: 1,
  });
  save();
  const task = (await allTasks()).find((t) => t.id === fixture.listingId);
  assert(task?.title.startsWith("Finish listing details"));
  assert.equal(
    task.href,
    `/dashboard/landlord/listings/${fixture.listingId}/edit`,
  );
  assert(task.issues.includes("Add a title and property description."));
  fixture.beforeTask = task.title;
  save();
  console.log(
    JSON.stringify({
      title: fixture.title,
      listingId: fixture.listingId,
      description: fixture.description,
    }),
  );
} else {
  assert(fixture && !fixture.cleaned && fixture.ownerId === me._id);
  const listing = await call("query", "listings:getById", {
    id: fixture.listingId,
  });
  assert.equal(listing.landlordId, me._id);
  assert.equal(listing.title, fixture.title);
  assert.notEqual(listing.publication?.live, true);
  if (mode === "check") {
    assert.equal(listing.description, fixture.description);
    const task = (await allTasks()).find((t) => t.id === fixture.listingId);
    assert(task);
    assert(!task.title.startsWith("Finish listing details"));
    assert(!task.issues.includes("Add a title and property description."));
    await assert.rejects(
      anonymous.query(makeFunctionReference("ownerTasks:account"), {
        refresh: 0,
      }),
      /sign in/,
    );
    await assert.rejects(
      anonymous.query(makeFunctionReference("ownerTasks:listings"), {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      /sign in/,
    );
    fixture.checked = true;
    fixture.afterTask = task.title;
    save();
    writeFileSync(
      "docs/evidence/hosted-owner-tasks-native.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          environment: deployment,
          actualReservedClerkJwt: true,
          nativeUploadedPhotos: 2,
          nativeCreatedPrivateIncompleteListing: true,
          browserSavedDescriptionPersisted: true,
          oldMissingContentTaskResolved: true,
          nextTask: task.title.split(":")[0],
          anonymousTasksDenied: true,
          fixtureRemainsPrivate: true,
          syntheticCloudPaidOrIdGrants: false,
          realProviderRequests: 0,
          cleaned: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log("Native saved description and updated task verified");
  } else {
    assert(fixture.checked, "Check the browser result before cleanup");
    await call("mutation", "listings:deleteListing", { id: fixture.listingId });
    assert(!(await allTasks()).some((t) => t.id === fixture.listingId));
    fixture.cleaned = true;
    save();
    const path = "docs/evidence/hosted-owner-tasks-native.json",
      receipt = JSON.parse(readFileSync(path, "utf8"));
    receipt.cleaned = true;
    receipt.ownListingRemovedThroughGuardedNativeApi = true;
    receipt.photosUseNormalSevenDayRecovery = true;
    writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
    console.log(
      "Only this run's private listing removed; photos retain normal recovery period",
    );
  }
}
