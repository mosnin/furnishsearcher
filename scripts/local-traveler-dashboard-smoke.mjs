import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
const selector = readFileSync(".env.local", "utf8");
assert(/^CONVEX_DEPLOYMENT=anonymous:/m.test(selector));
const url = selector
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)[1]
  .trim()
  .replace(/^"|"$/g, "");
assert(["127.0.0.1", "localhost"].includes(new URL(url).hostname));
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), config.ports.cloud);
const env = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete env[key];
for (const [name, expected] of [
  ["RESEND_API_KEY", ""],
  ["CREEM_API_KEY", "creem_test_local_synthetic"],
  ["CREEM_PRODUCT_LANDLORD_PRO", "prod_localQA"],
]) {
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/convex/bin/main.js",
      "env",
      "get",
      name,
      "--env-file",
      ".env.local",
    ],
    { env, encoding: "utf8" },
  );
  assert(
    r.status === 0 && r.stdout.trim() === expected,
    "Isolated fixture configuration does not match; no fixture mutation allowed",
  );
}
await prepareLocalPublication([]);
const make = (subject) => {
    const c = new ConvexHttpClient(url, { logger: false });
    c.setAdminAuth(config.adminKey, {
      subject,
      issuer: "https://qa.furnishsearcher.invalid",
    });
    return c;
  },
  owner = make("qa-owner-search"),
  tenant = make("qa-tenant-search"),
  anonymous = new ConvexHttpClient(url, { logger: false });
const call = (c, type, name, args = {}) =>
  c[type](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
    clerkId: "qa-owner-search",
  }),
  traveler = await call(tenant, "query", "users:getByClerkId", {
    clerkId: "qa-tenant-search",
  });
assert.equal(me.email, "qa-owner@example.test");
assert.equal(me.role, "landlord");
assert(traveler?.email.endsWith("@example.test"));
const title = `[QA] Traveler dashboard ${randomUUID().slice(0, 8)}`,
  DAY = 86400000,
  day = Math.floor(Date.now() / DAY) * DAY;
let listingId;
const inquiryIds = [];
const stays = async () => {
  let cursor = null,
    done = false;
  const rows = [];
  for (let n = 0; !done; n++) {
    assert(n < 100);
    const p = await call(tenant, "query", "travelerDashboard:stays", {
      paginationOpts: { cursor, numItems: 10 },
    });
    rows.push(...p.page);
    cursor = p.continueCursor;
    done = p.isDone;
  }
  return rows;
};
try {
  listingId = await call(owner, "mutation", "listings:create", {
    landlordId: me._id,
    title,
    description:
      "Synthetic traveler dashboard acceptance. Not an actual rental.",
    address: "Synthetic local fixture",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1800,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "House",
    amenities: [],
    photos: [],
    petFriendly: false,
    parkingIncluded: false,
    utilitiesIncluded: false,
    availableFrom: day,
    minStay: 1,
  });
  await prepareLocalPublication([listingId]);
  for (const offset of [0, 31]) {
    const id = await call(tenant, "mutation", "inquiries:create", {
      listingId,
      moveIn: day + offset * DAY,
      moveOut: day + (offset + 30) * DAY,
      occupants: 1,
      pets: false,
      message: `[QA] ${title}; synthetic ${offset === 0 ? "current" : "upcoming"} stay`,
      clientRequestId: randomUUID(),
    });
    inquiryIds.push(id);
    await call(owner, "mutation", "inquiries:respond", {
      id,
      decision: "accepted",
    });
  }
  const own = (await stays()).filter((row) => inquiryIds.includes(row.id));
  assert.equal(own.length, 2);
  assert.equal(own.filter((row) => row.phase === "active").length, 1);
  assert.equal(own.filter((row) => row.phase === "upcoming").length, 1);
  assert(
    own.every(
      (row) =>
        row.calendarReserved &&
        row.asOfDay === day &&
        row.href === `/dashboard/inquiries/${row.id}`,
    ),
  );
  for (const row of own) {
    assert(!Object.hasOwn(row, "message"));
    assert(!Object.hasOwn(row, "address"));
    assert(!Object.hasOwn(row, "email"));
  }
  const account = await call(tenant, "query", "travelerDashboard:account", {
    refreshKey: "2099-01-01",
  });
  assert.equal(account.day, day);
  assert(account.tasks.length >= 2);
  await assert.rejects(
    call(anonymous, "query", "travelerDashboard:stays", {
      paginationOpts: { cursor: null, numItems: 10 },
    }),
    /sign in/,
  );
} finally {
  for (const id of inquiryIds) {
    const b = await call(owner, "query", "bookings:get", { id });
    if (b.inquiry.status === "accepted")
      await call(owner, "mutation", "bookings:recordAgreed", {
        inquiryId: id,
        kind: "cancel",
        expectedRevision: b.revision,
        reason: "[QA] End synthetic traveler dashboard acceptance",
        agreementConfirmed: true,
        clientRequestId: randomUUID(),
      });
    else if (b.inquiry.status === "pending")
      await call(tenant, "mutation", "inquiries:respond", {
        id,
        decision: "withdrawn",
      });
  }
  if (listingId) {
    const listing = await call(owner, "query", "listings:getById", {
      id: listingId,
    });
    assert(listing.landlordId === me._id && listing.title === title);
    await call(owner, "mutation", "listings:unpublish", { id: listingId });
    await call(owner, "mutation", "listings:deleteListing", { id: listingId });
  }
}
assert.equal(
  (await stays()).filter((row) => inquiryIds.includes(row.id)).length,
  0,
);
writeFileSync(
  "docs/evidence/local-traveler-dashboard-native.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      environment: url,
      privilegedSyntheticLocalIdentities: true,
      actualClerkJwt: false,
      syntheticLocalPublicationPrerequisites: true,
      normalNativeInquiryAndConfirmation: true,
      oneActiveAndOneUpcoming: true,
      validCalendarCoverage: true,
      completePagedReads: true,
      privateProjection: true,
      serverUtcDayAndIgnoredRefreshClock: true,
      anonymousDenied: true,
      fixtureRentalRemoved: true,
      syntheticInquiriesCancelledAndRetained: inquiryIds,
      fixtureStaysAbsentAfterCancellation: true,
      cloudGrants: false,
      providerRequests: 0,
      actualRentalLeaseOrPayment: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Native current/upcoming traveler stays verified and exact local fixture cleaned",
);
