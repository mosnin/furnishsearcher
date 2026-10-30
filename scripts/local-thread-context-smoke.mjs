import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
  url &&
    new URL(url).protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
);
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(source) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(source),
);
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const make = (subject) => {
  const client = new ConvexHttpClient(url);
  client.setAdminAuth(cfg.adminKey, {
    subject,
    issuer: "https://qa.furnishsearcher.invalid",
  });
  return client;
};
const call = (client, method, name, args) =>
    client[method](makeFunctionReference(name), args),
  owner = make("qa-owner-search");
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me.email, "qa-owner@example.test");
const listing = (
  await call(owner, "query", "listings:getByLandlord", { landlordId: me._id })
).find((row) => row.title === "[QA] Synthetic additional unit — not a rental");
assert(listing);
const subject = `qa-thread-${randomUUID().slice(0, 12)}`,
  tenant = make(subject),
  unrelated = make("qa-unrelated-thread-context");
const traveler = await call(tenant, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: "[QA] Synthetic thread context participant",
  email: `${subject}@example.test`,
});
await call(unrelated, "mutation", "users:getOrCreate", {
  clerkId: "qa-unrelated-thread-context",
  name: "[QA] Unrelated context reader",
  email: "qa-unrelated-context@example.test",
});
let inquiryId, conversationId;
try {
  await prepareLocalPublication([listing._id]);
  await call(tenant, "mutation", "messages:sendMessage", {
    senderId: traveler._id,
    receiverId: me._id,
    listingId: listing._id,
    content: "[QA] Synthetic ordinary message before dated inquiry",
    clientRequestId: randomUUID(),
  });
  conversationId = (
    await call(tenant, "query", "inbox:list", {
      folder: "all",
      paginationOpts: { cursor: null, numItems: 20 },
    })
  ).page.find((row) => row.listingId === listing._id)._id;
  const args = { conversationId },
    initial = await call(tenant, "query", "threadContext:get", args);
  assert.equal(
    initial.termsAtStart.monthlyRateCents,
    Math.round(listing.price * 100),
  );
  assert.equal(
    (
      await call(tenant, "query", "threadContext:inquiries", {
        ...args,
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page.length,
    0,
  );
  await assert.rejects(call(unrelated, "query", "threadContext:get", args));
  await call(owner, "mutation", "listings:update", {
    id: listing._id,
    price: Math.round((listing.price + 11.11) * 100) / 100,
  });
  let context = await call(owner, "query", "threadContext:get", args);
  assert.deepEqual(context.termsAtStart, initial.termsAtStart);
  assert.equal(
    context.property.currentMonthlyRateCents,
    Math.round(listing.price * 100) + 1111,
  );
  context = await call(tenant, "query", "threadContext:get", args);
  assert.equal(context.property.canOpen, false);
  assert.equal(context.property.currentMonthlyRateCents, null);
  await prepareLocalPublication([listing._id]);
  const DAY = 86400000,
    blocks = await call(owner, "query", "availability:getByListing", {
      listingId: listing._id,
    });
  let moveIn =
    Math.ceil(Math.max(listing.availableFrom, Date.now() + 90 * DAY) / DAY) *
    DAY;
  for (
    let i = 0;
    i < 60 &&
    blocks.some(
      (block) => moveIn < block.endDate && block.startDate < moveIn + 45 * DAY,
    );
    i++
  )
    moveIn += 45 * DAY;
  const moveOut = moveIn + 31 * DAY,
    note = "[QA] Initial inquiry note; synthetic stay, not a rental";
  inquiryId = await call(tenant, "mutation", "inquiries:create", {
    listingId: listing._id,
    moveIn,
    moveOut,
    occupants: 1,
    pets: false,
    message: note,
  });
  await call(owner, "mutation", "inquiries:respond", {
    id: inquiryId,
    decision: "accepted",
  });
  let booking = await call(owner, "query", "bookings:get", { id: inquiryId });
  await call(owner, "mutation", "bookings:recordAgreed", {
    inquiryId,
    expectedRevision: booking.revision,
    clientRequestId: randomUUID(),
    kind: "dates",
    moveIn,
    moveOut: moveIn + 40 * DAY,
    reason: "[QA] Synthetic agreed extension",
    agreementConfirmed: true,
  });
  const inquiries = await call(tenant, "query", "threadContext:inquiries", {
    ...args,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  const recorded = inquiries.page.find((row) => row.id === inquiryId);
  assert.equal(recorded.explicitlyLinked, true);
  assert.equal(recorded.moveOut, moveIn + 40 * DAY);
  assert.equal(recorded.originalRequest.moveOut, moveOut);
  assert.equal(recorded.originalRequest.message, note);
  assert.deepEqual(
    (await call(tenant, "query", "threadContext:get", args)).termsAtStart,
    initial.termsAtStart,
  );
  assert(!Object.hasOwn(context.recipient, "email"));
  assert(!Object.hasOwn(context.recipient, "phone"));
  assert(!Object.hasOwn(context.property, "address"));
} finally {
  if (inquiryId) {
    const booking = await call(owner, "query", "bookings:get", {
      id: inquiryId,
    });
    if (booking.inquiry.status === "accepted")
      await call(owner, "mutation", "bookings:recordAgreed", {
        inquiryId,
        expectedRevision: booking.revision,
        clientRequestId: randomUUID(),
        kind: "cancel",
        reason: "[QA] Synthetic context fixture cleanup",
        agreementConfirmed: true,
      });
    else if (booking.inquiry.status === "pending")
      await call(tenant, "mutation", "inquiries:respond", {
        id: inquiryId,
        decision: "withdrawn",
      });
  }
  await call(owner, "mutation", "listings:update", {
    id: listing._id,
    price: listing.price,
  });
  await call(owner, "mutation", "listings:unpublish", { id: listing._id });
  if (conversationId)
    for (const [client, userId] of [
      [owner, me._id],
      [tenant, traveler._id],
    ]) {
      await call(client, "mutation", "messages:markRead", {
        userId,
        conversationId:
          [me._id, traveler._id].sort().join("_") + "_" + listing._id,
      });
      await call(client, "mutation", "messages:setArchived", {
        conversationId,
        archived: true,
      });
    }
}
writeFileSync(
  "docs/evidence/local-thread-context-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      actualLocalDatabase: true,
      startingRateCapturedAndPreserved: true,
      ordinaryMessageDoesNotInventInquiry: true,
      draftRateHiddenFromCounterparty: true,
      newInquiryExplicitlyLinked: true,
      agreedDateChangePreservesOriginalRequest: true,
      unrelatedContextReadDenied: true,
      projectionOmitsPrivateContactAndStreet: true,
      fixtureStayCancelled: true,
      originalFixturePriceRestored: true,
      fixtureListingHidden: true,
      fixtureConversationReadAndArchived: true,
      privilegedSyntheticIdentities: true,
      actualClerkBrowserJwt: false,
      actualLeaseOrPayment: false,
      actualEmailDelivery: false,
      renderedBrowserAcceptance: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Local thread-context smoke passed: immutable rate/request snapshots and private context; synthetic identities, no Clerk/browser/provider acceptance.",
);
