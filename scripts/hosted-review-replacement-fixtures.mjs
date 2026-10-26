import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-review-replacement.private.json";
assert(["setup", "replace", "cleanup"].includes(mode));
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
  const path = `../.review-replacement-${table}.private.json`;
  writeFileSync(path, JSON.stringify([row]), { mode: 0o600 });
  try {
    cli("import", path, "--table", table, "--append");
  } finally {
    unlinkSync(path);
  }
};
const page = { cursor: null, numItems: 20 },
  receiptPath = "docs/evidence/hosted-review-replacement-native.json";
const writeReceipt = (fields) => {
  const receipt = existsSync(receiptPath)
    ? JSON.parse(readFileSync(receiptPath, "utf8"))
    : {};
  writeFileSync(
    receiptPath,
    JSON.stringify(
      { ...receipt, ...fields, checkedAt: new Date().toISOString() },
      null,
      2,
    ) + "\n",
  );
};
const client = () =>
  new ConvexHttpClient(`https://${deployment}.convex.cloud`, { logger: false });
async function createActor(kind) {
  const externalId = `furnishsearcher-qa-review-${kind}-${fixture.tag}`,
    email = `review-${kind}-${fixture.tag}+clerk_test@example.com`;
  const account = await clerk.users.createUser({
    externalId,
    emailAddress: [email],
    skipPasswordRequirement: true,
  });
  fixture[kind] = { externalId, email, clerkId: account.id };
  save();
  const session = await clerk.sessions.createSession({ userId: account.id });
  fixture[kind].sessionId = session.id;
  save();
  const c = client();
  await refresh(c, session.id);
  if (kind === "staff")
    append("users", {
      clerkId: account.id,
      email,
      role: "admin",
      name: "[QA] Disposable review staff",
      createdAt: Date.now(),
    });
  else
    await call(c, "mutation", "users:getOrCreate", {
      clerkId: account.id,
      email,
      name: "[QA] Synthetic review traveler",
    });
  fixture[kind].id = (
    await call(c, "query", "users:getByClerkId", { clerkId: account.id })
  )._id;
  save();
  return c;
}
if (mode === "setup") {
  assert(!fixture || fixture.cleaned);
  fixture = { tag: randomUUID().slice(0, 8), ownerId: me._id, cleaned: false };
  save();
  await createActor("tenant");
  await createActor("staff");
  fixture.title = `[QA] Private removed-review context ${fixture.tag}`;
  fixture.reviewTitle = `[QA] Removed synthetic review ${fixture.tag}`;
  save();
  fixture.listingId = await call(owner, "mutation", "listings:create", {
    landlordId: me._id,
    title: fixture.title,
    description: "Private QA context only; no actual rental or stay.",
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
    availableFrom: Date.UTC(2027, 0, 15),
    minStay: 1,
  });
  save();
  append("bookingInquiries", {
    listingId: fixture.listingId,
    landlordId: me._id,
    tenantId: fixture.tenant.id,
    moveIn: Date.UTC(2026, 7, 1),
    moveOut: Date.UTC(2026, 8, 1),
    occupants: 1,
    pets: false,
    message:
      "[QA] Imported private pending contact context only; no confirmed booking or real stay.",
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const tenant = client();
  await refresh(tenant, fixture.tenant.sessionId);
  fixture.inquiryId = (
    await call(tenant, "query", "inquiries:getMine", {
      as: "tenant",
      paginationOpts: page,
    })
  ).page.find((i) => i.listingId === fixture.listingId)._id;
  save();
  append("reviews", {
    listingId: fixture.listingId,
    landlordId: me._id,
    reviewerId: me._id,
    kind: "traveler",
    subjectId: fixture.tenant.id,
    title: fixture.reviewTitle,
    rating: 4,
    comment:
      "[QA] Imported removed review fixture. No actual stay or customer experience.",
    phone: "+1 512 555 0100",
    stayStart: Date.UTC(2026, 7, 1),
    stayEnd: Date.UTC(2026, 8, 1),
    stayEvidence:
      "[QA] Imported synthetic history only; no actual stay occurred. Never approve this fixture.",
    experienceConfirmed: true,
    status: "removed",
    revision: 1,
    counted: false,
    moderationNote:
      "[QA] Imported removed-history precondition; no authenticity or staff approval claimed.",
    response: "[QA] Previous synthetic reply retained in history only.",
    responseStatus: "approved",
    responseRevision: 1,
    responseAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  fixture.reviewId = (
    await call(owner, "query", "reviews:mine", { paginationOpts: page })
  ).page.find((r) => r.title === fixture.reviewTitle)._id;
  save();
  const context = await call(owner, "query", "reviews:context", {
    listingId: fixture.listingId,
    kind: "traveler",
    subjectId: fixture.tenant.id,
  });
  assert.equal(context.canSubmit, true);
  writeReceipt({
    deployment,
    actualReservedClerkJwts: true,
    privilegedPreconditions:
      "Imported private pending contact and removed review with historical reply. No real stay, public publication, paid/identity grant or actual review approval.",
    realPersonMessages: 0,
    realEmailDelivery: false,
    cleaned: false,
  });
  console.log(
    "Private removed-review context prepared for reserved owner; no publication or provider request.",
  );
} else {
  assert(fixture && !fixture.cleaned && fixture.ownerId === me._id);
  const staff = client(),
    tenant = client();
  for (const kind of ["staff", "tenant"]) {
    const a = await clerk.users.getUser(fixture[kind].clerkId);
    assert(
      a.externalId === fixture[kind].externalId &&
        a.externalId.startsWith("furnishsearcher-qa-review-") &&
        a.emailAddresses.length === 1 &&
        a.emailAddresses[0].emailAddress === fixture[kind].email,
    );
  }
  await refresh(staff, fixture.staff.sessionId);
  await refresh(tenant, fixture.tenant.sessionId);
  assert.equal(
    (
      await call(staff, "query", "users:getByClerkId", {
        clerkId: fixture.staff.clerkId,
      })
    ).role,
    "admin",
  );
  let review = (
    await call(owner, "query", "reviews:mine", { paginationOpts: page })
  ).page.find((r) => r._id === fixture.reviewId);
  assert(review);
  if (mode === "replace") {
    assert.equal(review.status, "removed");
    assert.equal(review.revision, 1);
    const input = {
      listingId: fixture.listingId,
      landlordId: me._id,
      reviewerId: me._id,
      kind: "traveler",
      subjectId: fixture.tenant.id,
      title: `[QA] Replacement synthetic review ${fixture.tag}`,
      rating: 2,
      comment:
        "[QA] Native synthetic replacement test. No actual stay or customer experience occurred.",
      phone: "+1 512 555 0100",
      stayStart: review.stayStart,
      stayEnd: review.stayEnd,
      stayEvidence: review.stayEvidence,
      experienceConfirmed: true,
      expectedRevision: 1,
    };
    await assert.rejects(
      call(owner, "mutation", "reviews:create", {
        ...input,
        expectedRevision: 0,
      }),
      /review changed/,
    );
    assert.equal(
      await call(owner, "mutation", "reviews:create", input),
      fixture.reviewId,
    );
    review = (
      await call(owner, "query", "reviews:mine", { paginationOpts: page })
    ).page.find((r) => r._id === fixture.reviewId);
    assert.equal(review.status, "pending");
    assert.equal(review.revision, 2);
    assert.equal(review.responseDraft, "");
    assert.equal(review.responseStatus, undefined);
    assert.equal(review.canResubmit, false);
    const history = await call(staff, "query", "reviews:history", {
      id: fixture.reviewId,
      paginationOpts: page,
    });
    assert(
      history.page.some(
        (e) =>
          e.action === "replacement_submitted" &&
          JSON.parse(e.snapshot).response.includes("Previous synthetic reply"),
      ),
    );
    await assert.rejects(
      call(owner, "query", "reviews:history", {
        id: fixture.reviewId,
        paginationOpts: page,
      }),
      /Staff/,
    );
    const anon = client();
    await assert.rejects(
      call(anon, "query", "reviews:listPublic", {
        travelerId: fixture.tenant.id,
        paginationOpts: page,
      }),
    );
    assert.equal(
      (
        await call(tenant, "query", "reviews:received", {
          paginationOpts: page,
        })
      ).page.length,
      0,
    );
    writeReceipt({
      nativeReplacementSameIdRevisionTwo: true,
      freshPendingNotPublic: true,
      staleRevisionDenied: true,
      oldReplyRemovedFromActiveSubmissionAndRetainedInStaffAudit: true,
      authorAuditAndAnonymousTravelerAccessDenied: true,
      recipientReceivesNoPendingReview: true,
    });
    console.log(
      "Actual owner native replacement persisted pending; old reply stays only in staff audit.",
    );
  } else {
    assert(review.title.includes(fixture.tag) && review.reviewerId === me._id);
    if (review.status !== "removed")
      await call(staff, "mutation", "reviews:moderate", {
        id: review._id,
        part: "review",
        decision: "removed",
        expectedRevision: review.revision,
        note: "[QA] Retire synthetic replacement. No real stay occurred; no authenticity or approval claimed.",
      });
    await call(tenant, "mutation", "inquiries:respond", {
      id: fixture.inquiryId,
      decision: "withdrawn",
    });
    const listing = await call(owner, "query", "listings:getById", {
      id: fixture.listingId,
    });
    assert(listing.title === fixture.title && listing.landlordId === me._id);
    await call(owner, "mutation", "listings:remove", { id: fixture.listingId });
    const jwt = (
      await clerk.sessions.getToken(fixture.staff.sessionId, "convex")
    ).jwt;
    const expires = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString(),
    ).exp;
    assert(expires > Date.now() / 1000 + 15);
    staff.setAuth(jwt);
    await clerk.users.deleteUser(fixture.tenant.clerkId);
    await clerk.users.deleteUser(fixture.staff.clerkId);
    let revoked = false;
    for (let i = 0; i < 40; i++) {
      if (
        (await call(staff, "query", "users:getByClerkId", {
          clerkId: fixture.staff.clerkId,
        })) === null
      ) {
        revoked = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(revoked && expires > Date.now() / 1000);
    await assert.rejects(
      call(staff, "query", "reviews:queue", {
        view: "pending",
        paginationOpts: page,
      }),
    );
    review = (
      await call(owner, "query", "reviews:mine", { paginationOpts: page })
    ).page.find((r) => r._id === fixture.reviewId);
    assert.equal(review.status, "removed");
    assert.equal(review.canResubmit, false);
    fixture.cleaned = true;
    save();
    writeReceipt({
      cleaned: true,
      privateRentalRemoved: true,
      privateDiscussionWithdrawn: true,
      onlyOwnDisposableClerkActorsDeleted: true,
      staffNativeAuthorityRevokedBeforeTokenExpiry: true,
      removedReviewAndAuditRetained: true,
      unavailablePropertyResubmissionWithheld: true,
    });
    console.log(
      "Own private rental and disposable actors removed; review/audit retained removed and unavailable action withheld.",
    );
  }
}
