import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-document-workspace.private.json";
assert(
  ["setup", "draft", "shared", "private", "ack", "revoked", "cleanup"].includes(
    mode,
  ),
);
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
const site = `https://${deployment}.convex.site`,
  receiptPath = "docs/evidence/hosted-document-workspace-native.json",
  paginationOpts = { cursor: null, numItems: 20 };
let receipt = existsSync(receiptPath)
  ? JSON.parse(readFileSync(receiptPath, "utf8"))
  : {};
const checkpoint = () => {
  save();
  receipt.checkedAt = new Date().toISOString();
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
};
const list = (client) =>
  call(client, "query", "rentalDocs:list", {
    inquiryId: fixture.inquiryId,
    paginationOpts,
  });
const token = (id) => clerk.sessions.getToken(id, "convex").then((t) => t.jwt);
const download = async (versionId, sessionId) =>
  fetch(`${site}/documents/download?version=${versionId}`, {
    headers: sessionId
      ? { Authorization: `Bearer ${await token(sessionId)}` }
      : {},
  });
const bytesMatch = async (versionId, sessionId, path) => {
  const r = await download(versionId, sessionId);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), readFileSync(path));
};
const capability = await call(owner, "query", "rentalDocs:capabilities");
assert.equal(capability.privateFiles, true);
if (mode === "setup") {
  assert(!fixture || fixture.cleaned);
  const suffix = randomUUID().slice(0, 8);
  fixture = {
    ownerId: me._id,
    externalId: `furnishsearcher-qa-documents-${suffix}`,
    email: `documents-${suffix}+clerk_test@example.com`,
    title: `[QA] Private document workspace ${suffix}`,
    documentTitle: `[QA] Synthetic condition note ${suffix}`,
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
      name: "[QA] Synthetic document traveler",
      email: fixture.email,
    })
  )._id;
  save();
  fixture.listingId = await call(owner, "mutation", "listings:create", {
    landlordId: me._id,
    title: fixture.title,
    description:
      "Private synthetic QA document workspace. No actual rental, agreement or payment.",
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
    tenantId: fixture.tenantId,
    landlordId: me._id,
    moveIn: Date.UTC(2027, 0, 15),
    moveOut: Date.UTC(2027, 1, 15),
    occupants: 1,
    pets: false,
    message:
      "[QA] Imported private pending discussion only; not a public booking or legal agreement.",
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const inquiries = await call(tenant, "query", "inquiries:getMine", {
    as: "tenant",
    paginationOpts,
  });
  const inquiry = inquiries.page.find((i) => i.listingId === fixture.listingId);
  assert(inquiry);
  fixture.inquiryId = inquiry._id;
  save();
  assert.equal((await list(owner)).page.length, 0);
  assert.equal((await list(tenant)).page.length, 0);
  receipt = {
    environment: deployment,
    actualClerkParticipantJwts: true,
    privilegedPrivatePendingInquiryPrecondition: true,
    nativePublicBookingOrPaidIdentityGrant: false,
    syntheticPdfContainsNoPersonalOrLegalData: true,
    realLeaseSignatureOrPayment: false,
    realPersonMessagesOrEmailSent: 0,
    cleaned: false,
  };
  checkpoint();
  console.log(
    JSON.stringify({
      inquiryId: fixture.inquiryId,
      documentTitle: fixture.documentTitle,
      travelerEmail: fixture.email,
    }),
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === me._id &&
      fixture.title.startsWith("[QA] Private document workspace "),
  );
  const tenant = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
  await refresh(tenant, fixture.tenantSessionId);
  const rows = await list(owner);
  assert.equal(rows.page.length, 1);
  const doc = rows.page[0];
  assert.equal(doc.title, fixture.documentTitle);
  assert.equal(doc.creatorId, me._id);
  assert.equal(doc.kind, "inventory");
  fixture.documentId = doc._id;
  save();
  assert(!JSON.stringify(rows).includes("storageId"));
  assert(!JSON.stringify(rows).includes("keyId"));
  assert(!doc.signingSessionId);
  if (mode === "draft") {
    assert.equal(doc.state, "draft");
    assert.equal(doc.latest.version, 1);
    fixture.firstId = doc.latest._id;
    save();
    assert.equal((await list(tenant)).page.length, 0);
    assert.equal(
      (await download(fixture.firstId, fixture.tenantSessionId)).status,
      403,
    );
    assert.equal((await download(fixture.firstId)).status, 401);
    await bytesMatch(
      fixture.firstId,
      session.sessionId,
      "../qa-private-condition-v1.pdf",
    );
    receipt.ownerBrowserUploadPersisted = true;
    receipt.privateDraftHiddenAndUnauthorizedDownloadsDenied = true;
    receipt.ownerDownloadExactPdfBytesAndNoStore = true;
  } else if (mode === "shared") {
    assert.equal(doc.shared?._id, fixture.firstId);
    const visible = await list(tenant);
    assert.equal(visible.page.length, 1);
    assert.equal(visible.page[0].latest, null);
    assert.equal(visible.page[0].shared._id, fixture.firstId);
    await bytesMatch(
      fixture.firstId,
      fixture.tenantSessionId,
      "../qa-private-condition-v1.pdf",
    );
    receipt.ownerBrowserSharedExactVersion = true;
    receipt.travelerNativeDownloadMatchesSharedV1 = true;
  } else if (mode === "private") {
    assert.equal(doc.latest.version, 2);
    assert.equal(doc.shared._id, fixture.firstId);
    fixture.secondId = doc.latest._id;
    save();
    const visible = await list(tenant);
    assert.equal(visible.page[0].latest, null);
    assert.equal(visible.page[0].shared.version, 1);
    await bytesMatch(
      fixture.secondId,
      session.sessionId,
      "../qa-private-condition-v2.pdf",
    );
    await bytesMatch(
      fixture.firstId,
      fixture.tenantSessionId,
      "../qa-private-condition-v1.pdf",
    );
    assert.equal(
      (await download(fixture.secondId, fixture.tenantSessionId)).status,
      403,
    );
    receipt.ownerBrowserUploadedPrivateV2 = true;
    receipt.newerPrivateDraftDoesNotReplaceSharedV1 = true;
    receipt.ownerV2AndTravelerV1BytesVerified = true;
    receipt.travelerDirectV2AccessDenied = true;
  } else if (mode === "ack") {
    assert.equal(doc.shared.acknowledgedBy, fixture.tenantId);
    assert(doc.shared.acknowledgedAt);
    assert.equal(doc.latest.acknowledgedBy, undefined);
    assert.equal(doc.shared.source, "member_upload");
    assert(!doc.shared.providerMode);
    receipt.travelerBrowserAcknowledgedOnlyV1 = true;
    receipt.acknowledgementDidNotSignOrAcknowledgePrivateV2 = true;
  } else if (mode === "revoked") {
    assert.equal(doc.state, "draft");
    assert.equal(doc.shared, null);
    assert.equal((await list(tenant)).page.length, 0);
    assert.equal(
      (await download(fixture.firstId, fixture.tenantSessionId)).status,
      403,
    );
    assert.equal(
      (await download(fixture.secondId, fixture.tenantSessionId)).status,
      403,
    );
    const versions = await call(owner, "query", "rentalDocs:versions", {
      documentId: doc._id,
      paginationOpts,
    });
    assert.equal(versions.page.length, 2);
    assert.equal(
      versions.page.find((v) => v._id === fixture.firstId).acknowledgedBy,
      fixture.tenantId,
    );
    await assert.rejects(
      call(owner, "mutation", "rentalDocs:removeDraft", {
        documentId: doc._id,
      }),
      /receipt or signing history/,
    );
    receipt.ownerBrowserRevokedFutureAccess = true;
    receipt.oldVersionUrlNowDenied = true;
    receipt.receiptHistoryBlocksOrdinaryDeletion = true;
    fixture.revoked = true;
  } else {
    assert(fixture.revoked);
    await call(tenant, "mutation", "inquiries:respond", {
      id: fixture.inquiryId,
      decision: "withdrawn",
    });
    const disposable = await clerk.users.getUser(fixture.clerkUserId);
    assert.equal(disposable.externalId, fixture.externalId);
    assert(
      disposable.emailAddresses.every((e) => e.emailAddress === fixture.email),
    );
    await clerk.users.deleteUser(disposable.id);
    await call(owner, "mutation", "listings:deleteListing", {
      id: fixture.listingId,
    });
    const retained = await call(owner, "query", "rentalDocs:versions", {
      documentId: doc._id,
      paginationOpts,
    });
    assert.equal(retained.page.length, 2);
    assert.equal(
      retained.page.find((v) => v._id === fixture.firstId).acknowledgedBy,
      fixture.tenantId,
    );
    await bytesMatch(
      fixture.firstId,
      session.sessionId,
      "../qa-private-condition-v1.pdf",
    );
    fixture.cleaned = true;
    receipt.cleaned = true;
    receipt.onlyOwnListingAndDisposableClerkTravelerRemoved = true;
    receipt.inquiryWithdrawn = true;
    receipt.twoEncryptedVersionsAndReceiptRetainedByNormalGuard = true;
    receipt.privateKeyBackupStillRequired = true;
  }
  checkpoint();
  console.log(
    `Hosted document ${mode} native checks passed; no signature or real-person message`,
  );
}
