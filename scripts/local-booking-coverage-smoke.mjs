import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const env = readFileSync(".env.local", "utf8");
assert(/^CONVEX_DEPLOYMENT=anonymous:/m.test(env));
const url = env
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)[1]
  .trim()
  .replace(/^"|"$/g, "");
assert(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), config.ports.cloud);
const client = new ConvexHttpClient(url, { logger: false }),
  anonymous = new ConvexHttpClient(url, { logger: false });
client.setAdminAuth(config.adminKey, {
  subject: "qa-owner-search",
  issuer: "https://qa.clerk.accounts.dev",
});
const call = (type, name, args = {}) =>
  client[type](makeFunctionReference(name), args);
const me = await call("query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me.email, "qa-owner@example.test");
assert.equal(me.role, "landlord");
let cursor = null,
  done = false,
  pages = 0,
  checked = 0,
  reserved = 0,
  repairRequired = 0,
  firstId;
while (!done) {
  assert(pages++ < 100);
  const page = await call("query", "inquiries:getMine", {
    as: "landlord",
    paginationOpts: { cursor, numItems: 20 },
  });
  for (const row of page.page) {
    firstId ??= row._id;
    const view = await call("query", "bookings:get", { id: row._id });
    checked++;
    if (view.inquiry.status === "accepted") {
      assert.equal(typeof view.calendarReserved, "boolean");
      if (view.calendarReserved) {
        reserved++;
        const blocks = await call("query", "availability:getByListing", {
          listingId: view.inquiry.listingId,
        });
        const b = blocks.find(
          (b) => b._id === view.inquiry.availabilityBlockId,
        );
        assert(b);
        assert.equal(b.startDate, view.inquiry.moveIn);
        assert.equal(b.endDate, view.inquiry.moveOut);
        assert.equal(b.type, "booked");
        assert(!b.calendarFeedId);
      } else repairRequired++;
    } else assert.equal(view.calendarReserved, null);
  }
  cursor = page.continueCursor;
  done = page.isDone;
}
assert(checked > 0);
await assert.rejects(
  anonymous.query(makeFunctionReference("bookings:get"), { id: firstId }),
  /sign in/,
);
writeFileSync(
  "docs/evidence/local-booking-coverage-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      environment: url,
      authClass:
        "privileged synthetic local owner identity; not actual Clerk authentication",
      allNativeInquiryPagesTraversed: true,
      pages,
      checked,
      reserved,
      repairRequired,
      matchingCalendarRowsChecked: reserved,
      nonConfirmedStatesDoNotClaimReservation: true,
      anonymousStayDenied: true,
      fixtureWrites: 0,
      providerRequests: 0,
    },
    null,
    2,
  ) + "\n",
);
console.log("Native local booking/calendar coverage reads passed; no writes");
