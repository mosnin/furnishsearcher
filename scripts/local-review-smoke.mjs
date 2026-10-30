import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
// Reuse the guard that refuses hosted targets, non-synthetic billing or configured mail.
await prepareLocalPublication([]);
const source = readFileSync(".env.local", "utf8"),
  url = source
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
    .trim()
    .replace(/^"|"$/g, "");
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
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
const tag = randomUUID(),
  author = make(`qa-review-${tag}`),
  owner = make("qa-owner-search"),
  staff = make("qa-publication-staff"),
  stranger = make("qa-tenant-search"),
  publicClient = new ConvexHttpClient(url);
const call = (client, type, name, args) =>
  client[type](makeFunctionReference(name), args);
const me = await call(author, "mutation", "users:getOrCreate", {
  clerkId: `qa-review-${tag}`,
  name: "QA Reviewer Synthetic",
  email: `qa-review-${tag}@example.test`,
});
const landlord = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(landlord.email, "qa-owner@example.test");
const listing = (
  await call(owner, "query", "listings:getByLandlord", {
    landlordId: landlord._id,
  })
).find((l) => l.title === "[QA] Flexible Austin apartment");
assert(listing, "Run test:local-search first");

// Retire earlier interrupted attempts of this exact synthetic script; never touch customer reviews.
let retiredPriorAttempts = 0;
for (const view of ["pending", "rejected", "approved"]) {
  const page = await call(staff, "query", "reviews:queue", {
    view,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  for (const r of page.page) {
    if (
      r.title !== "[QA] Synthetic local review" ||
      r.listingId !== listing._id
    )
      continue;
    const author = await call(staff, "query", "users:getById", {
      id: r.reviewerId,
    });
    if (
      !author?.clerkId?.startsWith("qa-review-") ||
      !author.email.endsWith("@example.test")
    )
      continue;
    await call(staff, "mutation", "reviews:moderate", {
      id: r._id,
      part: "review",
      decision: "removed",
      expectedRevision: r.revision,
      note: "[QA] Retire an interrupted synthetic review smoke attempt",
    });
    retiredPriorAttempts++;
  }
}
const baseline = await call(publicClient, "query", "reviews:getAverageRating", {
  landlordId: landlord._id,
});
const input = {
  listingId: listing._id,
  landlordId: landlord._id,
  reviewerId: me._id,
  title: "[QA] Synthetic local review",
  rating: 4,
  comment:
    "[QA] This is a synthetic workflow test, not a customer account of a real stay.",
  phone: "+1 512 555 0100",
  stayStart: Date.UTC(2026, 7, 1),
  stayEnd: Date.UTC(2026, 8, 1),
  experienceConfirmed: true,
  stayEvidence:
    "[QA] Privileged synthetic local fixture. No stay occurred; this record must be removed after the test.",
};
const id = await call(author, "mutation", "reviews:create", input);
assert(
  !(
    await call(publicClient, "query", "reviews:getByListing", {
      listingId: listing._id,
    })
  ).some((r) => r._id === id),
);
await assert.rejects(
  call(stranger, "query", "reviews:getByReviewer", { reviewerId: me._id }),
);
await assert.rejects(
  call(owner, "mutation", "reviews:moderate", {
    id,
    part: "review",
    decision: "approved",
    expectedRevision: 1,
    note: "Unauthorized synthetic attempt",
    experienceChecked: true,
  }),
);
await call(staff, "mutation", "reviews:moderate", {
  id,
  part: "review",
  decision: "rejected",
  expectedRevision: 1,
  note: "[QA] Synthetic rejection for resubmission test",
});
assert.equal(
  await call(author, "mutation", "reviews:create", {
    ...input,
    expectedRevision: 1,
    comment:
      "[QA] Revised synthetic workflow test; this is not an actual stay review.",
  }),
  id,
);
await assert.rejects(
  call(staff, "mutation", "reviews:moderate", {
    id,
    part: "review",
    decision: "approved",
    expectedRevision: 1,
    note: "[QA] Stale synthetic decision",
    experienceChecked: true,
  }),
);
await call(staff, "mutation", "reviews:moderate", {
  id,
  part: "review",
  decision: "approved",
  expectedRevision: 2,
  note: "[QA] Synthetic local test only; not verification of a real stay",
  experienceChecked: true,
});
let row = (
  await call(publicClient, "query", "reviews:getByListing", {
    listingId: listing._id,
  })
).find((r) => r._id === id);
assert(row);
for (const field of [
  "phone",
  "stayEvidence",
  "stayStart",
  "bookingId",
  "reviewerId",
])
  assert(!(field in row));
assert.equal(row.reviewerName, "QA");
await call(owner, "mutation", "reviews:respond", {
  id,
  body: "[QA] Synthetic owner response; no real customer interaction occurred.",
});
assert.equal(
  (
    await call(publicClient, "query", "reviews:getByListing", {
      listingId: listing._id,
    })
  ).find((r) => r._id === id).response,
  undefined,
);
await call(staff, "mutation", "reviews:moderate", {
  id,
  part: "response",
  decision: "approved",
  expectedRevision: 1,
  note: "[QA] Synthetic response moderation",
});
assert(
  (
    await call(publicClient, "query", "reviews:getByListing", {
      listingId: listing._id,
    })
  )
    .find((r) => r._id === id)
    .response.body.includes("Synthetic owner"),
);
await call(author, "mutation", "reviews:flag", {
  id,
  reason: "[QA] Remove this synthetic workflow fixture after verification",
});
await call(staff, "mutation", "reviews:moderate", {
  id,
  part: "review",
  decision: "removed",
  expectedRevision: 2,
  note: "[QA] Synthetic fixture complete; remove it from public reviews",
  experienceChecked: false,
});
assert(
  !(
    await call(publicClient, "query", "reviews:getByListing", {
      listingId: listing._id,
    })
  ).some((r) => r._id === id),
);
assert.deepEqual(
  await call(publicClient, "query", "reviews:getAverageRating", {
    landlordId: landlord._id,
  }),
  baseline,
);
const replacementContext = await call(author, "query", "reviews:context", {
  listingId: listing._id,
});
assert.equal(replacementContext.canSubmit, true);
await assert.rejects(
  call(author, "mutation", "reviews:create", { ...input, expectedRevision: 1 }),
  /review changed/,
);
const replacementId = await call(author, "mutation", "reviews:create", {
  ...input,
  expectedRevision: 2,
  rating: 2,
  title: "[QA] Synthetic replacement review",
  comment: "[QA] Replacement synthetic workflow only; no actual stay occurred.",
});
assert.equal(replacementId, id);
const replacement = (
  await call(author, "query", "reviews:mine", {
    paginationOpts: { cursor: null, numItems: 10 },
  })
).page.find((r) => r._id === id);
assert.equal(replacement.status, "pending");
assert.equal(replacement.revision, 3);
assert.equal(replacement.responseDraft, "");
assert.equal(replacement.responseStatus, undefined);
assert.equal(replacement.responseRevision, 2);
assert(
  !(
    await call(publicClient, "query", "reviews:getByListing", {
      listingId: listing._id,
    })
  ).some((r) => r._id === id),
);
const events = await call(staff, "query", "reviews:history", {
  id,
  paginationOpts: { cursor: null, numItems: 50 },
});
assert(
  events.page.some(
    (e) =>
      e.action === "replacement_submitted" &&
      JSON.parse(e.snapshot).response.includes("Synthetic owner"),
  ),
);
await call(staff, "mutation", "reviews:moderate", {
  id,
  part: "review",
  decision: "removed",
  expectedRevision: 3,
  note: "[QA] Retire synthetic replacement; no actual stay occurred",
});
assert.deepEqual(
  await call(publicClient, "query", "reviews:getAverageRating", {
    landlordId: landlord._id,
  }),
  baseline,
);
const notices = await call(author, "query", "reviewNotices:mine", {
  paginationOpts: { cursor: null, numItems: 10 },
});
assert(notices.page.length >= 2);
for (const notice of notices.page)
  await call(staff, "action", "reviewEmails:deliver", { id: notice._id });
assert(
  (
    await call(author, "query", "reviewNotices:mine", {
      paginationOpts: { cursor: null, numItems: 10 },
    })
  ).page.every((n) => n.emailStatus === "unconfigured"),
);
const receipt = {
  verifiedAt: new Date().toISOString(),
  target: url,
  hosted: false,
  identity:
    "Privileged local development identities, not actual Clerk browser/JWT authentication",
  reviewId: id,
  syntheticStayOnly: true,
  retiredPriorAttempts,
  pendingHidden: true,
  privatePhoneAndContext: true,
  unrelatedHistoryRejected: true,
  ownerCannotModerate: true,
  declineAndResubmit: true,
  staleRevisionRejected: true,
  responseModerated: true,
  removalHidesAndRestoresRatingTotals: true,
  decisionsPersistWithoutEmailConfiguration: true,
  fixtureLeftRemoved: true,
  removedReviewReplacementPending: true,
  priorReplyRetainedOnlyInAudit: true,
  staleAuthorRevisionDenied: true,
  realCustomerDataChanged: false,
  actualEmailDelivery: false,
};
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/local-review-smoke.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt, null, 2));
