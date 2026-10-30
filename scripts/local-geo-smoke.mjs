import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
await prepareLocalPublication([]);
const source = readFileSync(".env.local", "utf8"),
  url = source
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
    .trim()
    .replace(/^"|"$/g, "");
assert(
  url && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
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
};
const owner = make("qa-owner-search"),
  staff = make("qa-publication-staff"),
  tenant = make("qa-tenant-search"),
  publicClient = new ConvexHttpClient(url),
  call = (client, type, name, args) =>
    client[type](makeFunctionReference(name), args);
const user = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(user.email, "qa-owner@example.test");
const originals = await call(owner, "query", "listings:getByLandlord", {
    landlordId: user._id,
  }),
  sample = originals.find((l) => l.title === "[QA] Flexible Austin apartment");
assert(sample?.photoAssets?.length >= 2);
const title = "[QA] Census public-address geometry fixture — not a rental";
let l = originals.find((l) => l.title === title);
const id =
  l?._id ??
  (await call(owner, "mutation", "listings:create", {
    landlordId: user._id,
    title,
    description:
      "[QA] Synthetic local geometry test using the public Census office address; no rental is offered and no stay or ownership is claimed.",
    address: "4600 Silver Hill Rd",
    city: "Suitland",
    state: "MD",
    zip: "20746",
    price: 1234,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: ["WiFi"],
    photos: [],
    photoAssets: sample.photoAssets.slice(0, 2),
    petFriendly: false,
    utilitiesIncluded: true,
    parkingIncluded: true,
    availableFrom: Date.UTC(2027, 0, 1),
    minStay: 1,
  }));
assert.equal(
  (await call(publicClient, "query", "geo:capabilities", {})).provider,
  "census",
  "This smoke only permits the keyless Census service, not a configured paid provider",
);
let state = await call(owner, "query", "geo:mine", { listingId: id });
const liveLookupThisRun = state?.status !== "confirmed";
if (state?.status !== "confirmed") {
  await call(owner, "action", "geo:lookupListing", {
    listingId: id,
    consent: true,
  });
  state = await call(owner, "query", "geo:mine", { listingId: id });
  assert.equal(
    state.status,
    "candidate",
    "The actual provider did not confirm the public example. This does not become a fabricated provider success.",
  );
  assert(state.candidates.length);
  await call(owner, "mutation", "geo:confirm", {
    listingId: id,
    generation: state.generation,
    candidate: 0,
  });
}
const prerequisites = await prepareLocalPublication([id]);
l = await call(owner, "query", "listings:getById", { id });
assert(Number.isFinite(l.mapLatitude) && Number.isFinite(l.mapLongitude));
const filters = {
  nearLatitude: l.mapLatitude,
  nearLongitude: l.mapLongitude,
  radiusMiles: 0.5,
};
const page = await call(publicClient, "query", "search:listings", {
  ...filters,
  paginationOpts: { cursor: null, numItems: 24 },
});
assert(page.page.some((r) => r._id === id));
assert.equal(page.page.find((r) => r._id === id).distanceMiles, 0);
const away = await call(publicClient, "query", "search:listings", {
  nearLatitude: 30.265,
  nearLongitude: -97.745,
  radiusMiles: 1,
  paginationOpts: { cursor: null, numItems: 24 },
});
assert(!away.page.some((r) => r._id === id));
const publicListing = await call(publicClient, "query", "listings:getById", {
  id,
});
assert.equal(publicListing.address, "");
assert(!JSON.stringify(page.page).includes("4600"));
assert(!JSON.stringify(page.page).includes("exactLatitude"));
await assert.rejects(call(tenant, "query", "geo:mine", { listingId: id }));
await assert.rejects(
  call(owner, "mutation", "listings:update", {
    id,
    address: "4700 Silver Hill Rd",
  }),
);
await call(owner, "mutation", "listings:unpublish", { id });
assert(
  !(
    await call(publicClient, "query", "search:listings", {
      ...filters,
      paginationOpts: { cursor: null, numItems: 24 },
    })
  ).page.some((r) => r._id === id),
);
const receipt = {
  verifiedAt: new Date().toISOString(),
  target: url,
  hosted: false,
  listingId: id,
  publicCensusExampleOnly: true,
  externalGeocodingThisRun: liveLookupThisRun,
  priorLiveGeocoderReceipt: "docs/evidence/local-census-geocode.json",
  confirmedProviderRecord: true,
  provider: (await call(owner, "query", "geo:mine", { listingId: id }))
    .provider,
  sourceAddress:
    "US Census public office example, 4600 Silver Hill Rd, Suitland MD 20746",
  prerequisites,
  exactSourceCoordinatesKeptPrivate: true,
  publicMapPoint: { latitude: l.mapLatitude, longitude: l.mapLongitude },
  actualSpatialIndex: true,
  radiusIncludesPublicArea: true,
  distantAreaExcludesFixture: true,
  unrelatedPrivateLocationReadRejected: true,
  publishedAddressMoveRejected: true,
  hiddenListingExcluded: true,
  fixtureLeftHidden: true,
  realCustomerDataChanged: false,
  actualClerkBrowserJwt: false,
};
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/local-geo-smoke.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt, null, 2));
