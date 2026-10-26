import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-stay-lifecycle.private.json";
assert(["setup", "propose", "extended", "cancel", "cleanup"].includes(mode));
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
assert.equal(cli("env", "get", "RESEND_API_KEY").trim(), "");
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const session = JSON.parse(
  readFileSync("../hosted-auth-session.private.json", "utf8"),
);
const account = await clerk.users.getUser(session.userId);
assert(account.externalId?.startsWith("furnishsearcher-qa-"));
assert(
  account.emailAddresses.every((e) =>
    e.emailAddress.endsWith("+clerk_test@example.com"),
  ),
);
const owner = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const refresh = async (client, sessionId) => {
  const jwt = (await clerk.sessions.getToken(sessionId, "convex")).jwt;
  assert(jwt);
  client.setAuth(jwt);
};
await refresh(owner, session.sessionId);
const call = (client, type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: account.id,
});
assert.equal(me?.role, "landlord");
let fixture = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : null;
const save = () =>
  writeFileSync(privatePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const append = (table, row) => {
  const path = `../.lead-history-${table}.private.json`;
  writeFileSync(path, JSON.stringify([row]), { mode: 0o600 });
  try {
    cli("import", path, "--table", table, "--append");
  } finally {
    unlinkSync(path);
  }
};
const receiptPath = "docs/evidence/hosted-stay-lifecycle-native.json";
let receipt = existsSync(receiptPath)
  ? JSON.parse(readFileSync(receiptPath, "utf8"))
  : {};
const checkpoint = () => {
  receipt.checkedAt = new Date().toISOString();
  save();
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
};
if (mode === "setup") {
  assert(!fixture || fixture.cleaned);
  const suffix = randomUUID().slice(0, 8);
  fixture = {
    ownerId: me._id,
    externalId: `furnishsearcher-qa-stay-${suffix}`,
    email: `stay-${suffix}+clerk_test@example.com`,
    title: `[QA] Existing stay lifecycle ${suffix}`,
    start: Date.UTC(2027, 0, 15),
    end: Date.UTC(2027, 1, 15),
    extendedEnd: Date.UTC(2027, 2, 15),
    cleaned: false,
  };
  save();
  const user = await clerk.users.createUser({
    externalId: fixture.externalId,
    emailAddress: [fixture.email],
    skipPasswordRequirement: true,
  });
  fixture.clerkUserId = user.id;
  save();
  fixture.tenantSessionId = (
    await clerk.sessions.createSession({ userId: user.id })
  ).id;
  save();
  const tenant = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
  await refresh(tenant, fixture.tenantSessionId);
  fixture.tenantId = (
    await call(tenant, "mutation", "users:getOrCreate", {
      clerkId: user.id,
      name: "[QA] Synthetic existing-stay traveler",
      email: fixture.email,
    })
  )._id;
  save();
  fixture.listingId = await call(owner, "mutation", "listings:create", {
    landlordId: me._id,
    title: fixture.title,
    description:
      "Private synthetic existing-stay lifecycle fixture; no real rental, lease, payment or booking.",
    address: "Synthetic private address — do not geocode",
    city: "Austin",
    state: "TX",
    zip: "78701",
    price: 1800,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: false,
    parkingIncluded: false,
    availableFrom: fixture.start,
    minStay: 1,
  });
  save();
  // Explicit imported accepted-history precondition, not a native public confirmation or provider entitlement.
  append("bookingInquiries", {
    listingId: fixture.listingId,
    tenantId: fixture.tenantId,
    landlordId: me._id,
    moveIn: fixture.start,
    moveOut: fixture.end,
    occupants: 1,
    pets: false,
    message:
      "[QA] Imported private accepted-history fixture only. No real booking or lease.",
    status: "accepted",
    lifecycleRevision: 0,
    minimumStayDaysAtConfirmation: 30,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const inquiries = await call(tenant, "query", "inquiries:getMine", {
    as: "tenant",
    paginationOpts: { cursor: null, numItems: 20 },
  });
  const inquiry = inquiries.page.find((i) => i.listingId === fixture.listingId);
  assert(inquiry);
  fixture.inquiryId = inquiry._id;
  save();
  const blocks = await call(owner, "query", "availability:getByListing", {
    listingId: fixture.listingId,
  });
  assert.equal(blocks.length, 0);
  receipt = {
    checkedAt: new Date().toISOString(),
    environment: deployment,
    actualClerkParticipantJwts: true,
    privilegedImportedAcceptedHistoryPrecondition: true,
    notNativePublicInquiryOrConfirmationAcceptance: true,
    noCloudPaidIdentityOrPublicationGrant: true,
    initialMissingCalendarEntry: true,
    realRentalLeasePayment: false,
    providerMessagesSent: 0,
    cleaned: false,
  };
  checkpoint();
  console.log(
    JSON.stringify({
      title: fixture.title,
      inquiryId: fixture.inquiryId,
      listingId: fixture.listingId,
      start: "2027-01-15",
      end: "2027-02-15",
      extendedEnd: "2027-03-15",
    }),
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === me._id &&
      fixture.title.startsWith("[QA] Existing stay lifecycle "),
  );
  const listing = await call(owner, "query", "listings:getById", {
    id: fixture.listingId,
  });
  assert.equal(listing.title, fixture.title);
  assert.equal(listing.landlordId, me._id);
  assert.notEqual(listing.publication?.live, true);
  const tenant = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
  await refresh(tenant, fixture.tenantSessionId);
  const booking = await call(owner, "query", "bookings:get", {
    id: fixture.inquiryId,
  });
  const blocks = () =>
    call(owner, "query", "availability:getByListing", {
      listingId: fixture.listingId,
    });
  if (mode === "propose") {
    assert.equal(booking.inquiry.status, "accepted");
    assert(booking.inquiry.availabilityBlockId);
    const before = await blocks();
    assert.equal(before.length, 1);
    assert.equal(before[0].inquiryId, fixture.inquiryId);
    assert.equal(before[0].endDate, fixture.end);
    receipt.actualOwnerBrowserRepairLinkedCalendar = true;
    // A real owner-created QA maintenance conflict must reject the extension, without moving the original reservation.
    fixture.conflictId = await call(
      owner,
      "mutation",
      "availability:addBlock",
      {
        listingId: fixture.listingId,
        startDate: Date.UTC(2027, 1, 20),
        endDate: Date.UTC(2027, 1, 22),
        type: "unavailable",
        title: "[QA] Extension conflict",
        note: "Disposable native calendar conflict",
      },
    );
    save();
    await assert.rejects(
      call(tenant, "mutation", "bookings:propose", {
        inquiryId: fixture.inquiryId,
        kind: "dates",
        moveIn: fixture.start,
        moveOut: fixture.extendedEnd,
        reason: "[QA] Check unavailable extension rejection",
        expectedRevision: booking.revision,
        clientRequestId: randomUUID(),
      }),
      /no longer available/,
    );
    await call(owner, "mutation", "availability:removeBlock", {
      id: fixture.conflictId,
    });
    fixture.conflictRemoved = true;
    save();
    fixture.extensionId = await call(tenant, "mutation", "bookings:propose", {
      inquiryId: fixture.inquiryId,
      kind: "dates",
      moveIn: fixture.start,
      moveOut: fixture.extendedEnd,
      reason:
        "[QA] Request a synthetic extension after checking availability. No lease or payment changes.",
      expectedRevision: booking.revision,
      clientRequestId: randomUUID(),
    });
    save();
    const pending = await call(owner, "query", "bookings:get", {
      id: fixture.inquiryId,
    });
    assert.equal(pending.inquiry.moveOut, fixture.end);
    assert.equal((await blocks())[0].endDate, fixture.end);
    await assert.rejects(
      call(tenant, "mutation", "bookings:decide", {
        id: fixture.extensionId,
        decision: "accepted",
      }),
      /other stay partner/,
    );
    receipt.nativeConflictRejection = true;
    receipt.pendingExtensionKeepsOriginalReservation = true;
    receipt.authorSelfAcceptanceDenied = true;
    checkpoint();
    console.log("Native traveler extension pending; original dates unchanged");
  } else if (mode === "extended") {
    assert.equal(booking.inquiry.moveOut, fixture.extendedEnd);
    assert.equal(booking.inquiry.pendingBookingChangeId, undefined);
    assert.equal(booking.inquiry.status, "accepted");
    const actual = await blocks();
    assert.equal(actual.length, 1);
    assert.equal(actual[0].endDate, fixture.extendedEnd);
    assert.equal(actual[0].inquiryId, fixture.inquiryId);
    const changes = await call(tenant, "query", "bookings:changes", {
      id: fixture.inquiryId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    const extension = changes.page.find((c) => c._id === fixture.extensionId);
    assert.equal(extension?.status, "accepted");
    assert.equal(extension.decidedBy, me._id);
    await assert.rejects(
      call(owner, "mutation", "availability:removeBlock", {
        id: actual[0]._id,
      }),
      /Manage this confirmed stay/,
    );
    receipt.browserOwnerAcceptedExtension = true;
    receipt.nativeBookingAndCalendarDatesAgree = true;
    receipt.managedCalendarDeleteBypassDenied = true;
    checkpoint();
    console.log(
      "Native extended dates, actor and managed-calendar protection verified",
    );
  } else if (mode === "cancel") {
    assert.equal(booking.inquiry.status, "accepted");
    assert(booking.inquiry.pendingBookingChangeId);
    assert.equal((await blocks())[0].endDate, fixture.extendedEnd);
    const changes = await call(tenant, "query", "bookings:changes", {
      id: fixture.inquiryId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    const change = changes.page.find(
      (c) => c._id === booking.inquiry.pendingBookingChangeId,
    );
    assert.equal(change?.kind, "cancel");
    assert.equal(change.proposerId, me._id);
    assert.equal(change.status, "pending");
    await assert.rejects(
      call(owner, "mutation", "bookings:decide", {
        id: change._id,
        decision: "accepted",
      }),
      /other stay partner/,
    );
    await call(tenant, "mutation", "bookings:decide", {
      id: change._id,
      decision: "accepted",
    });
    const cancelled = await call(owner, "query", "bookings:get", {
      id: fixture.inquiryId,
    });
    assert.equal(cancelled.inquiry.status, "cancelled");
    assert.equal(cancelled.inquiry.moveIn, fixture.start);
    assert.equal(cancelled.inquiry.moveOut, fixture.extendedEnd);
    assert.equal(cancelled.inquiry.cancelledEffectiveEnd, fixture.start);
    assert.equal((await blocks()).length, 0);
    const history = await call(owner, "query", "bookings:events", {
      id: fixture.inquiryId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    for (const action of ["calendar_repaired", "dates_changed", "cancelled"])
      assert(history.page.some((e) => e.action === action));
    assert(history.page.every((e) => e.emailStatus !== "sent"));
    const anon = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
      logger: false,
    });
    await assert.rejects(
      call(anon, "query", "bookings:get", { id: fixture.inquiryId }),
      /sign in/,
    );
    await assert.rejects(
      call(anon, "query", "bookings:events", {
        id: fixture.inquiryId,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
      /sign in/,
    );
    assert.deepEqual(
      await call(anon, "query", "availability:getByListing", {
        listingId: fixture.listingId,
      }),
      [],
    );
    receipt.browserOwnerProposedCancellation = true;
    receipt.pendingCancellationKeptReservedDates = true;
    receipt.actualNativeTravelerAcceptedCancellation = true;
    receipt.futureDatesReleased = true;
    receipt.originalAgreedDatesRetained = true;
    receipt.historyActions = history.page.map((e) => e.action);
    receipt.noEmailMarkedSent = true;
    receipt.anonymousPrivateStayAndHistoryDenied = true;
    fixture.cancelled = true;
    checkpoint();
    console.log(
      "Native cancellation, released calendar and retained private history verified",
    );
  } else {
    assert(fixture.cancelled && booking.inquiry.status === "cancelled");
    const disposable = await clerk.users.getUser(fixture.clerkUserId);
    assert.equal(disposable.externalId, fixture.externalId);
    assert(
      disposable.emailAddresses.every((e) => e.emailAddress === fixture.email),
    );
    await clerk.users.deleteUser(disposable.id);
    await call(owner, "mutation", "listings:deleteListing", {
      id: fixture.listingId,
    });
    const retained = await call(owner, "query", "bookings:get", {
      id: fixture.inquiryId,
    });
    assert.equal(retained.inquiry.status, "cancelled");
    assert.equal(retained.calendarReserved, null);
    const retainedEvents = await call(owner, "query", "bookings:events", {
      id: fixture.inquiryId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    for (const action of receipt.historyActions)
      assert(retainedEvents.page.some((e) => e.action === action));
    fixture.cleaned = true;
    receipt.cleaned = true;
    receipt.onlyOwnListingAndDisposableClerkTravelerRemoved = true;
    receipt.cancelledInquiryAndAuditRetainedForOwner = true;
    checkpoint();
    console.log(
      "Only own private rental and disposable Clerk traveler removed; cancelled history retained",
    );
  }
}
