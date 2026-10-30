import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
await prepareLocalPublication([]); // refuses hosted deployments, real billing configuration or enabled email delivery
const env = readFileSync(".env.local", "utf8"),
  url = env
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
    .trim()
    .replace(/^"|"$/g, "");
assert(
  url &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) &&
    /^CONVEX_DEPLOYMENT=anonymous:/m.test(env),
);
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const make = (subject) => {
    const c = new ConvexHttpClient(url);
    c.setAdminAuth(cfg.adminKey, {
      subject,
      issuer: "https://qa.furnishsearcher.invalid",
    });
    return c;
  },
  owner = make("qa-owner-search"),
  other = make("qa-tenant-search"),
  publicClient = new ConvexHttpClient(url),
  call = (c, type, name, args) => c[type](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me.email, "qa-owner@example.test");
const all = await call(owner, "query", "listings:getByLandlord", {
    landlordId: me._id,
  }),
  root = all.find(
    (l) =>
      l.title === "[QA] Census public-address geometry fixture — not a rental",
  );
assert(root?.locationConfirmedAt, "Run the Census smoke first");
const title = "[QA] Synthetic additional unit — not a rental";
let child = all.find((l) => l.title === title),
  created = false,
  blockId;
try {
  await prepareLocalPublication([root._id]);
  if (!child) {
    const childId = await call(owner, "mutation", "listings:create", {
      parentListingId: root._id,
      unitName: "[QA] Synthetic garden suite",
      independentSpace: true,
      landlordId: me._id,
      title,
      description:
        "Synthetic local unit; no rental exists. Shared public Census office address is a geometry example only.",
      address: root.address,
      city: root.city,
      state: root.state,
      zip: root.zip,
      price: 1700,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: false,
      availableFrom: 0,
      minStay: 1,
    });
    child = await call(owner, "query", "listings:getById", { id: childId });
    created = true;
  }
  assert.equal(child.parentListingId, root._id);
  await prepareLocalPublication([child._id]);
  const context = await call(owner, "query", "units:context", {
    listingId: child._id,
  });
  assert.equal(context.primaryListingId, root._id);
  assert(context.unitCount >= 2);
  const args = {
    propertyGroupId: context.propertyGroupId,
    paginationOpts: { cursor: null, numItems: 10 },
  };
  let page = await call(publicClient, "query", "units:publicUnits", args);
  assert(
    page.page.some((l) => l._id === root._id) &&
      page.page.some((l) => l._id === child._id),
  );
  assert(!JSON.stringify(page).includes("4600"));
  assert(!JSON.stringify(page).includes("exactLatitude"));
  await assert.rejects(
    call(other, "query", "units:mine", {
      listingId: child._id,
      paginationOpts: args.paginationOpts,
    }),
  );
  await assert.rejects(
    call(owner, "mutation", "listings:deleteListing", { id: root._id }),
  );
  const moveIn =
      Math.ceil(
        Math.max(root.availableFrom, Date.now() + 86400000) / 86400000,
      ) * 86400000,
    moveOut = moveIn + 35 * 86400000;
  blockId = await call(owner, "mutation", "availability:addBlock", {
    listingId: child._id,
    startDate: moveIn,
    endDate: moveOut,
    type: "unavailable",
    note: "[QA] Independent unit calendar smoke",
  });
  page = await call(publicClient, "query", "units:publicUnits", {
    ...args,
    moveIn,
    moveOut,
  });
  assert(
    page.page.some((l) => l._id === root._id) &&
      !page.page.some((l) => l._id === child._id),
  );
  await call(owner, "mutation", "availability:removeBlock", { id: blockId });
  blockId = undefined;
  await call(owner, "mutation", "listings:unpublish", { id: root._id });
  assert(
    (await call(publicClient, "query", "listings:getById", { id: child._id }))
      ?._id === child._id,
  );
  const grouped = await call(publicClient, "query", "search:listings", {
    propertyGroupId: context.propertyGroupId,
    paginationOpts: { cursor: null, numItems: 24 },
  });
  assert(grouped.page.some((l) => l._id === child._id));
  assert(!grouped.page.some((l) => l._id === root._id));
  const receipt = {
    verifiedAt: new Date().toISOString(),
    target: url,
    hosted: false,
    propertyGroupId: context.propertyGroupId,
    mainListingId: root._id,
    unitListingId: child._id,
    createdThisRun: created,
    sharedConfirmedPublicExampleArea: true,
    independentDateAvailability: true,
    publicGroupSearch: true,
    hideMainPreservesUnit: true,
    privateStreetOmitted: true,
    unrelatedOwnerReadRejected: true,
    mainDeletionRejected: true,
    syntheticIdentityAndPaidPrerequisites: true,
    privilegedLocalSdkAuth: true,
    realClerkBrowserJwt: false,
    realProviderTransaction: false,
    fixturesLeftHidden: true,
  };
  writeFileSync(
    "docs/evidence/local-units-smoke.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (blockId)
    await call(owner, "mutation", "availability:removeBlock", { id: blockId });
  if (child)
    await call(owner, "mutation", "listings:unpublish", { id: child._id });
  await call(owner, "mutation", "listings:unpublish", { id: root._id });
}
