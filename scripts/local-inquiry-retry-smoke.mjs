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
const title = `[QA] Inquiry retry ${randomUUID().slice(0, 8)}`,
  day = 86400000,
  start = Date.UTC(2027, 6, 1);
let listingId,
  inquiryId,
  checked = false;
try {
  listingId = await call(owner, "mutation", "listings:create", {
    landlordId: me._id,
    title,
    description: "Synthetic local retry acceptance; not an actual rental.",
    address: "123 Synthetic Retry Street",
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
    availableFrom: start,
    minStay: 1,
  });
  await prepareLocalPublication([listingId]);
  const guest = await call(anonymous, "query", "listings:getById", {
    id: listingId,
  });
  assert(guest.isPublic && !guest.canManage);
  assert.equal(guest.address, "");
  const args = {
    listingId,
    moveIn: start,
    moveOut: start + 30 * day,
    occupants: 1,
    pets: false,
    message: `[QA] ${title} synthetic inquiry`,
    clientRequestId: randomUUID(),
  };
  const results = await Promise.all([
    call(tenant, "mutation", "inquiries:create", args),
    call(tenant, "mutation", "inquiries:create", args),
  ]);
  assert.equal(results[0], results[1]);
  inquiryId = results[0];
  const initial = await call(owner, "query", "bookings:get", { id: inquiryId });
  assert.equal(initial.inquiry.clientRequestId, args.clientRequestId);
  assert.equal(initial.inquiry.status, "pending");
  const ownRequests = await call(tenant, "query", "inquiries:getMine", {
    as: "tenant",
    paginationOpts: { cursor: null, numItems: 30 },
  });
  assert.equal(
    ownRequests.page.filter((r) => r.listingId === listingId).length,
    1,
  );
  const contact = {
    senderId: traveler._id,
    receiverId: me._id,
    listingId,
    content: "[QA] Synthetic contact retry; no real message recipient",
    clientRequestId: randomUUID(),
  };
  const contacts = await Promise.all([
    call(tenant, "mutation", "messages:sendMessage", contact),
    call(tenant, "mutation", "messages:sendMessage", contact),
  ]);
  assert.equal(contacts[0], contacts[1]);
  await call(owner, "mutation", "inquiries:respond", {
    id: inquiryId,
    decision: "accepted",
  });
  await call(owner, "mutation", "bookings:recordAgreed", {
    inquiryId,
    kind: "dates",
    moveIn: start,
    moveOut: start + 31 * day,
    expectedRevision: 1,
    reason: "[QA] Synthetic agreed extension",
    agreementConfirmed: true,
    clientRequestId: randomUUID(),
  });
  await call(owner, "mutation", "listings:unpublish", { id: listingId });
  const events = await call(owner, "query", "bookings:events", {
    id: inquiryId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  assert(events.isDone);
  assert.equal(
    await call(tenant, "mutation", "inquiries:create", args),
    inquiryId,
  );
  const after = await call(owner, "query", "bookings:get", { id: inquiryId });
  assert.equal(after.inquiry.moveOut, start + 31 * day);
  assert(after.calendarReserved);
  const repeatEvents = await call(owner, "query", "bookings:events", {
    id: inquiryId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  assert.deepEqual(
    repeatEvents.page.map((e) => e._id),
    events.page.map((e) => e._id),
  );
  await assert.rejects(
    call(tenant, "mutation", "inquiries:create", {
      ...args,
      message: "Changed body",
    }),
    /already used/,
  );
  await assert.rejects(
    call(anonymous, "mutation", "inquiries:create", args),
    /sign in/,
  );
  const preview = await call(owner, "query", "listings:getById", {
    id: listingId,
  });
  assert(preview.canManage && !preview.isPublic);
  assert.equal(
    await call(anonymous, "query", "listings:getById", { id: listingId }),
    null,
  );
  await call(owner, "mutation", "bookings:recordAgreed", {
    inquiryId,
    kind: "cancel",
    expectedRevision: after.revision,
    reason: "[QA] End the synthetic retry acceptance",
    agreementConfirmed: true,
    clientRequestId: randomUUID(),
  });
  assert.equal(
    await call(tenant, "mutation", "inquiries:create", args),
    inquiryId,
  );
  assert.equal(
    (await call(owner, "query", "bookings:get", { id: inquiryId })).inquiry
      .status,
    "cancelled",
  );
  checked = true;
} finally {
  if (inquiryId) {
    const b = await call(owner, "query", "bookings:get", { id: inquiryId });
    if (b.inquiry.status === "pending")
      await call(tenant, "mutation", "inquiries:respond", {
        id: inquiryId,
        decision: "withdrawn",
      });
    else if (b.inquiry.status === "accepted")
      await call(owner, "mutation", "bookings:recordAgreed", {
        inquiryId,
        kind: "cancel",
        expectedRevision: b.revision,
        reason: "[QA] Guarded retry fixture cleanup",
        agreementConfirmed: true,
        clientRequestId: randomUUID(),
      });
  }
  if (listingId) {
    const row = await call(owner, "query", "listings:getById", {
      id: listingId,
    });
    assert(row.landlordId === me._id && row.title === title);
    await call(owner, "mutation", "listings:unpublish", { id: listingId });
    await call(owner, "mutation", "listings:deleteListing", { id: listingId });
    assert.equal(
      await call(owner, "query", "listings:getById", { id: listingId }),
      null,
    );
  }
}
assert(checked);
const receipt = {
  checkedAt: new Date().toISOString(),
  environment: url,
  privilegedSyntheticLocalIdentities: true,
  actualClerkJwt: false,
  syntheticLocalPaidIdentityAndPublicationPrerequisites: true,
  cloudGrants: false,
  concurrentInquiryReferencesReturnSameId: true,
  onePendingInquiry: true,
  concurrentContactReferencesReturnSameMessageId: true,
  participantBookingReadAcceptsRetryReference: true,
  confirmedChangedHiddenRetryRecoversOriginalId: true,
  agreedDatesAndCalendarUnchangedByRetry: true,
  bookingEventIdsUnchangedByRetry: true,
  payloadMismatchAndAnonymousDenied: true,
  privatePreviewFlagsAndPublicDenial: true,
  cancelledInquiryReplayDoesNotReopen: true,
  fixtureListingRemoved: true,
  retainedSyntheticCancelledInquiryId: inquiryId,
  realRentalLeasePaymentOrExternalEmail: false,
};
writeFileSync(
  "docs/evidence/local-inquiry-retry-native.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
