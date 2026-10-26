import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createClerkClient } from "@clerk/backend";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-owner-directory.private.json";
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
assert(
  !config.stdout.trim(),
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
const search = async (filters = {}) => {
  let cursor = null,
    done = false,
    pages = 0;
  const rows = [],
    pageSizes = [];
  while (!done) {
    assert(pages++ < 25, "Bounded QA portfolio traversal exceeded");
    const result = await call("query", "ownerDirectory:list", {
      ...filters,
      paginationOpts: { cursor, numItems: 10 },
    });
    assert(result.page.length <= 10);
    rows.push(...result.page);
    pageSizes.push(result.page.length);
    cursor = result.continueCursor;
    done = result.isDone;
  }
  return { rows, pageSizes, pages };
};
if (mode === "setup") {
  assert(
    !fixture || fixture.cleaned,
    "Resume the existing fixture rather than duplicating it",
  );
  fixture = {
    ownerId: me._id,
    run: randomUUID().slice(0, 8),
    listings: [],
    cleaned: false,
  };
  save();
  for (let n = 0; n < 12; n++) {
    const title = `[QA] Portfolio ${fixture.run} ${String(n).padStart(2, "0")}`;
    const id = await call("mutation", "listings:create", {
      landlordId: me._id,
      title,
      description:
        "Private synthetic portfolio check. This is not an actual rental.",
      address:
        n === 0
          ? `123 Synthetic Juniper ${fixture.run}`
          : `456 Synthetic Portfolio ${fixture.run}`,
      city: n === 0 ? "Boston" : "Austin",
      state: n === 0 ? "MA" : "TX",
      zip: n === 0 ? "02108" : "78701",
      bedrooms: 1,
      bathrooms: 1,
      price: 1800,
      propertyType: "House",
      amenities: [],
      photos: [],
      petFriendly: false,
      parkingIncluded: false,
      utilitiesIncluded: false,
      availableFrom: Date.UTC(2027, 3, 15),
      minStay: 1,
    });
    fixture.listings.push({ id, title });
    save();
  }
  const target = await call("query", "listings:getById", {
    id: fixture.listings[0].id,
  });
  fixture.target = {
    id: target._id,
    publicId: target.publicId,
    title: target.title,
    address: target.address,
  };
  save();
  console.log(
    JSON.stringify({
      run: fixture.run,
      target: fixture.target,
      privateRootsCreated: fixture.listings.length,
    }),
  );
} else {
  assert(fixture && !fixture.cleaned && fixture.ownerId === me._id);
  for (const row of fixture.listings) {
    const rental = await call("query", "listings:getById", { id: row.id });
    assert.equal(rental.landlordId, me._id);
    assert.equal(rental.title, row.title);
    assert(rental.title.startsWith(`[QA] Portfolio ${fixture.run} `));
    assert.notEqual(rental.publication?.live, true);
  }
  if (mode === "check") {
    assert.equal(fixture.listings.length, 12);
    const targeted = await search({
      keyword: `juniper ${fixture.run}`,
      city: "BOSTON",
      state: "ma",
      status: "incomplete",
    });
    assert.equal(targeted.pageSizes[0], 0);
    assert(targeted.pages >= 2);
    assert.deepEqual(
      targeted.rows.map((row) => row._id),
      [fixture.target.id],
    );
    for (const keyword of [
      fixture.target.publicId,
      fixture.target.publicId.replace(/[^a-z0-9]/gi, ""),
      fixture.target.title,
      fixture.target.id,
    ]) {
      assert.deepEqual(
        (await search({ keyword })).rows.map((row) => row._id),
        [fixture.target.id],
      );
    }
    assert.equal(
      (await search({ keyword: fixture.run, status: "active" })).rows.length,
      0,
    );
    const all = await search({ keyword: fixture.run });
    assert.equal(all.rows.length, 12);
    assert.equal(new Set(all.rows.map((row) => row._id)).size, 12);
    assert.deepEqual(
      all.rows.map((row) => row._id),
      fixture.listings.map((row) => row.id).reverse(),
    );
    await assert.rejects(
      anonymous.query(makeFunctionReference("ownerDirectory:list"), {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      /sign in/,
    );
    fixture.checked = true;
    save();
    writeFileSync(
      "docs/evidence/hosted-owner-directory-native.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          environment: deployment,
          actualReservedOwnerClerkJwt: true,
          privateRootListingsCreatedThroughNativeMutation: 12,
          filteredPageSizes: targeted.pageSizes,
          oldestAddressFoundAfterEmptyPage: true,
          caseInsensitiveCityState: true,
          incompleteStatus: true,
          propertyNumberCompactAndNormal: true,
          headlineAndNativeIdSearch: true,
          completeUniqueNewestFirstTraversal: true,
          privateRowsNotClaimedLive: true,
          anonymousDenied: true,
          hostedUnitCreationNotAttemptedWithoutRealPaidAndIdentityPrerequisites: true,
          hiddenChildUnitSemanticsCoveredByIsolatedNativeTests: true,
          syntheticCloudPaidOrIdGrants: false,
          realProviderRequests: 0,
          cleaned: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Actual owner native directory checks passed; fixtures remain private",
    );
  } else {
    for (const row of [...fixture.listings].reverse())
      await call("mutation", "listings:deleteListing", { id: row.id });
    assert.equal((await search({ keyword: fixture.run })).rows.length, 0);
    fixture.cleaned = true;
    save();
    if (existsSync("docs/evidence/hosted-owner-directory-native.json")) {
      const receipt = JSON.parse(
        readFileSync(
          "docs/evidence/hosted-owner-directory-native.json",
          "utf8",
        ),
      );
      receipt.cleaned = true;
      receipt.cleanedAt = new Date().toISOString();
      writeFileSync(
        "docs/evidence/hosted-owner-directory-native.json",
        JSON.stringify(receipt, null, 2) + "\n",
      );
    }
    console.log(
      "Exact reserved private portfolio fixtures deleted; standing rentals preserved",
    );
  }
}
