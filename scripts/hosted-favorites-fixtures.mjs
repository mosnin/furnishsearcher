import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2];
assert(["setup", "check", "remove-one", "cleanup"].includes(mode));
const deployment = "cheerful-ferret-182",
  privatePath = "../hosted-favorites-fixture.private.json";
const credentials = JSON.parse(
  readFileSync(".clerk/.tmp/keyless.json", "utf8"),
);
assert(credentials.publishableKey.startsWith("pk_test_"));
const response = await fetch("https://api.clerk.com/v1/instance", {
  headers: { Authorization: `Bearer ${credentials.secretKey}` },
});
assert.equal(response.status, 200);
const instance = await response.json();
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
  const result = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--deployment", deployment],
    { env, encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    "Development CLI operation failed; output withheld",
  );
  return result.stdout;
};
assert.equal(cli("env", "get", "RESEND_API_KEY").trim(), "");
const session = JSON.parse(
  readFileSync("../hosted-auth-session.private.json", "utf8"),
);
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const account = await clerk.users.getUser(session.userId);
assert(account.externalId?.startsWith("furnishsearcher-qa-"));
assert(
  account.emailAddresses.every((e) =>
    e.emailAddress.endsWith("+clerk_test@example.com"),
  ),
);
const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const refresh = async () => {
  const jwt = (await clerk.sessions.getToken(session.sessionId, "convex")).jwt;
  assert(jwt);
  client.setAuth(jwt);
};
await refresh();
const call = (type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const user = await call("query", "users:getByClerkId", { clerkId: account.id });
assert.equal(user?.role, "landlord");
let fixture = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : null;
const save = () =>
  writeFileSync(privatePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
if (mode === "setup") {
  assert(
    !fixture || fixture.cleaned,
    "An existing fixture must be checked/cleaned before a new setup",
  );
  fixture = {
    ownerId: user._id,
    title: `[QA] Private historical favorites ${randomUUID().slice(0, 8)}`,
    listingIds: [],
    cleaned: false,
    baseline: await call("query", "saved:summary"),
  };
  save();
  try {
    for (let i = 0; i < 20; i++) {
      const id = await call("mutation", "listings:create", {
        landlordId: user._id,
        title: fixture.title,
        description: "Private synthetic historical favorite; never published",
        address: "Synthetic private fixture",
        city: "Austin",
        state: "TX",
        zip: "78701",
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
      });
      fixture.listingIds.push(id);
      save();
    }
    await assert.rejects(
      call("mutation", "saved:save", {
        tenantId: user._id,
        listingId: fixture.listingIds[0],
      }),
      /unavailable/,
    );
    // Explicit privileged historical favorites, NOT public/paid/identity fixtures.
    // A private current rental cannot be newly saved through the normal API.
    const file = "../.historical-favorites.private.json";
    writeFileSync(
      file,
      JSON.stringify(
        fixture.listingIds.map((listingId, i) => ({
          tenantId: user._id,
          listingId,
          savedAt: Date.now() + i,
        })),
      ),
      { mode: 0o600 },
    );
    try {
      cli("import", file, "--table", "savedListings", "--append");
    } finally {
      unlinkSync(file);
    }
    fixture.seeded = true;
    save();
    console.log(
      "Twenty private synthetic historical favorites prepared; no public entitlement fabricated.",
    );
  } catch (error) {
    save();
    throw error;
  }
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === user._id &&
      fixture.title.startsWith("[QA] Private historical favorites "),
  );
  if (mode === "remove-one") {
    await call("mutation", "saved:unsave", {
      tenantId: user._id,
      listingId: fixture.listingIds.at(-1),
    });
    fixture.oneRemoved = true;
    save();
  }
  if (mode === "cleanup") {
    for (const id of fixture.listingIds) {
      const listing = await call("query", "listings:getById", { id });
      await call("mutation", "saved:unsave", {
        tenantId: user._id,
        listingId: id,
      });
      if (listing) {
        assert(
          listing.title === fixture.title &&
            listing.landlordId === user._id &&
            listing.publicationRequested === false,
        );
        await call("mutation", "listings:deleteListing", { id });
      }
    }
    fixture.cleaned = true;
    save();
    console.log(
      "Only this fixture's historical favorites and unpublished rentals were removed.",
    );
  } else {
    let cursor = null;
    const entries = [];
    for (let i = 0; i < 20; i++) {
      const result = await call("query", "saved:mine", {
        paginationOpts: { cursor, numItems: 18 },
      });
      entries.push(...result.page);
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    const own = entries.filter((row) =>
      fixture.listingIds.includes(row.listingId),
    );
    assert.equal(own.length, fixture.oneRemoved ? 19 : 20);
    assert(own.every((row) => row.listing === null));
    const anonymous = new ConvexHttpClient(
      `https://${deployment}.convex.cloud`,
      { logger: false },
    );
    await assert.rejects(
      anonymous.query(makeFunctionReference("saved:mine"), {
        paginationOpts: { cursor: null, numItems: 18 },
      }),
      /sign in/,
    );
    writeFileSync(
      "docs/evidence/hosted-favorites-native.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          deployment,
          actualClerkDevelopmentJwt: true,
          privilegedSyntheticHistoricalFavoritesOnly: true,
          currentPrivateListingsCannotBeNewlySaved: true,
          pagedPrivateRead: true,
          unavailableCardsContainNoListingDetails: true,
          fixtureFavoritesRemaining: own.length,
          nativeUnavailableRemovalAccepted: !!fixture.oneRemoved,
          anonymousReadDenied: true,
          publicSaveAcceptance: false,
          productionChanged: false,
          realEmailOrSmsSent: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `Native hosted historical-favorite checks passed; ${own.length} synthetic entries remain.`,
    );
  }
}
