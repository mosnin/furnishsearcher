import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
await prepareLocalPublication([]); // checks anonymous loopback deployment, synthetic billing config and disabled real email
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
  tenant = make("qa-tenant-search"),
  stranger = make("qa-booking-unrelated"),
  publicClient = new ConvexHttpClient(url),
  call = (c, type, name, args) => c[type](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me.email, "qa-owner@example.test");
await call(stranger, "mutation", "users:getOrCreate", {
  clerkId: "qa-booking-unrelated",
  name: "[QA] Unrelated booking reader",
  email: "qa-booking-unrelated@example.test",
});
const listing = (
  await call(owner, "query", "listings:getByLandlord", { landlordId: me._id })
).find((l) => l.title === "[QA] Synthetic additional unit — not a rental");
assert(listing?.parentListingId, "Run the property-unit smoke first");
const DAY = 86400000,
  marker = "[QA] Booking lifecycle smoke — synthetic stay; not a rental";
let id;
try {
  await prepareLocalPublication([listing._id]);
  const legacyLinks = await call(
    owner,
    "mutation",
    "bookings:linkLegacyBlocks",
    { cursor: null },
  );
  // Withdraw only this exact synthetic actor's leftover pending requests before a repeat run.
  const mine = await call(tenant, "query", "inquiries:getMine", {
    as: "tenant",
    paginationOpts: { cursor: null, numItems: 30 },
  });
  for (const row of mine.page)
    if (
      row.listingId === listing._id &&
      row.message === marker &&
      row.status === "pending"
    )
      await call(tenant, "mutation", "inquiries:respond", {
        id: row._id,
        decision: "withdrawn",
      });
  const blocks = await call(owner, "query", "availability:getByListing", {
    listingId: listing._id,
  });
  let moveIn =
    Math.ceil(Math.max(listing.availableFrom, Date.now() + 90 * DAY) / DAY) *
    DAY;
  for (
    let i = 0;
    i < 60 &&
    blocks.some((b) => moveIn < b.endDate && b.startDate < moveIn + 45 * DAY);
    i++
  )
    moveIn += 45 * DAY;
  const moveOut = moveIn + 31 * DAY;
  id = await call(tenant, "mutation", "inquiries:create", {
    listingId: listing._id,
    moveIn,
    moveOut,
    occupants: 1,
    pets: false,
    message: marker,
  });
  await call(owner, "mutation", "inquiries:respond", {
    id,
    decision: "accepted",
  });
  let booking = await call(tenant, "query", "bookings:get", { id });
  assert.equal(booking.revision, 1);
  const blockId = booking.inquiry.availabilityBlockId;
  await assert.rejects(call(stranger, "query", "bookings:get", { id }));
  await assert.rejects(
    call(publicClient, "query", "bookings:events", {
      id,
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  );
  await assert.rejects(
    call(owner, "mutation", "availability:removeBlock", { id: blockId }),
  );
  await assert.rejects(
    call(owner, "mutation", "availability:updateBlock", {
      id: blockId,
      endDate: moveOut + DAY,
    }),
  );
  const changeArgs = {
    inquiryId: id,
    kind: "dates",
    moveIn,
    moveOut: moveOut + 10 * DAY,
    expectedRevision: 1,
    reason: "[QA] Traveler requests a synthetic ten-day extension",
    clientRequestId: randomUUID(),
  };
  const change = await call(tenant, "mutation", "bookings:propose", changeArgs);
  assert.equal(
    await call(tenant, "mutation", "bookings:propose", changeArgs),
    change,
  );
  booking = await call(owner, "query", "bookings:get", { id });
  assert.equal(booking.inquiry.moveOut, moveOut);
  await assert.rejects(
    call(tenant, "mutation", "bookings:decide", {
      id: change,
      decision: "accepted",
    }),
  );
  await call(owner, "mutation", "bookings:decide", {
    id: change,
    decision: "accepted",
  });
  booking = await call(owner, "query", "bookings:get", { id });
  assert.equal(booking.revision, 2);
  assert.equal(booking.inquiry.moveOut, moveOut + 10 * DAY);
  assert.equal(
    (
      await call(owner, "query", "availability:getByListing", {
        listingId: listing._id,
      })
    ).find((b) => b._id === blockId)?.endDate,
    moveOut + 10 * DAY,
  );
  const publicBlocks = await call(
    publicClient,
    "query",
    "availability:getByListing",
    { listingId: listing._id },
  );
  assert(publicBlocks.every((b) => !b.inquiryId && !b.note && !b.title));
  await call(owner, "mutation", "listings:unpublish", { id: listing._id });
  const message = {
      id,
      content: "[QA] Synthetic stay discussion after hiding the fixture",
      clientRequestId: randomUUID(),
    },
    conversationId = await call(
      tenant,
      "mutation",
      "bookings:message",
      message,
    );
  assert.equal(
    await call(tenant, "mutation", "bookings:message", message),
    conversationId,
  );
  const cancelRequest = await call(tenant, "mutation", "bookings:propose", {
    inquiryId: id,
    kind: "cancel",
    expectedRevision: 2,
    reason: "[QA] Traveler requests cancellation of the synthetic stay",
    clientRequestId: randomUUID(),
  });
  const cancelArgs = {
    inquiryId: id,
    kind: "cancel",
    expectedRevision: 2,
    reason:
      "[QA] Owner records a synthetic cancellation agreed with the traveler",
    agreementConfirmed: true,
    clientRequestId: randomUUID(),
  };
  const cancellation = await call(
    owner,
    "mutation",
    "bookings:recordAgreed",
    cancelArgs,
  );
  assert.equal(
    await call(owner, "mutation", "bookings:recordAgreed", cancelArgs),
    cancellation,
  );
  booking = await call(tenant, "query", "bookings:get", { id });
  assert.equal(booking.inquiry.status, "cancelled");
  assert.equal(booking.revision, 3);
  assert(
    !(
      await call(owner, "query", "availability:getByListing", {
        listingId: listing._id,
      })
    ).some((b) => b._id === blockId),
  );
  const changes = await call(tenant, "query", "bookings:changes", {
    id,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  assert.equal(
    changes.page.find((c) => c._id === cancelRequest)?.status,
    "superseded",
  );
  await prepareLocalPublication([listing._id]);
  const search = await call(publicClient, "query", "search:listings", {
    propertyId: listing._id,
    moveIn,
    moveOut,
    paginationOpts: { cursor: null, numItems: 24 },
  });
  assert(search.page.some((l) => l._id === listing._id));
  let history = await call(tenant, "query", "bookings:events", {
    id,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  assert(
    history.page.some((e) => e.action === "dates_changed") &&
      history.page.some((e) => e.action === "cancelled"),
  );
  for (const event of history.page)
    if (event.emailStatus === "pending")
      await call(owner, "action", "bookingEmails:deliver", { id: event._id });
  history = await call(tenant, "query", "bookings:events", {
    id,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  assert(
    history.page
      .filter((e) => e.action !== "inquiry_created")
      .every((e) => e.emailStatus === "unconfigured"),
  );
  await call(owner, "mutation", "listings:unpublish", { id: listing._id });
  assert.equal(
    (
      await call(owner, "query", "publication:getReadiness", {
        id: listing._id,
      })
    ).requested,
    false,
  );
  const receipt = {
    verifiedAt: new Date().toISOString(),
    target: url,
    hosted: false,
    listingId: listing._id,
    inquiryId: id,
    conversationId,
    realLocalTransactions: true,
    legacyLinks: {
      scanned: legacyLinks.scanned,
      linked: legacyLinks.linked,
      isDone: legacyLinks.isDone,
    },
    requestKeepsOriginalReservation: true,
    counterpartyAcceptanceRequired: true,
    datesAndBlockUpdatedTogether: true,
    ownerAgreedCancellationWhileHidden: true,
    duplicateReferencesIdempotent: true,
    oldRequestSuperseded: true,
    futureDatesReleased: true,
    newDatedSearchAvailable: true,
    managedCalendarBypassRejected: true,
    publicCalendarPrivateFieldsOmitted: true,
    unrelatedAndAnonymousReadsRejected: true,
    notifications: "unconfigured; no email sent",
    fixturesLeftHidden: true,
    privilegedLocalSdkAuth: true,
    syntheticIdentityAndPaidPrerequisites: true,
    realClerkBrowserJwt: false,
    realRentalLeaseOrPayment: false,
  };
  writeFileSync(
    "docs/evidence/local-booking-smoke.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (id) {
    const current = await call(owner, "query", "bookings:get", { id });
    if (current.inquiry.status === "pending")
      await call(tenant, "mutation", "inquiries:respond", {
        id,
        decision: "withdrawn",
      });
    else if (current.inquiry.status === "accepted")
      await call(owner, "mutation", "bookings:recordAgreed", {
        inquiryId: id,
        kind: "cancel",
        expectedRevision: current.revision,
        reason: "[QA] Clean up the synthetic smoke reservation",
        clientRequestId: randomUUID(),
        agreementConfirmed: true,
      });
  }
  await call(owner, "mutation", "listings:unpublish", { id: listing._id });
}
