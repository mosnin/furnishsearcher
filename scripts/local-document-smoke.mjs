import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { prepareLocalPublication } from "./local-publication-fixtures.mjs";
import { syntheticDocument } from "./synthetic-document.mjs";
await prepareLocalPublication([]);
const env = readFileSync(".env.local", "utf8"),
  url = env
    .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
    .trim()
    .replace(/^"|"$/g, "");
assert(
  url &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) &&
    /^CONVEX_DEPLOYMENT=anonymous:/m.test(env) &&
    !/^CONVEX_DEPLOY_KEY=/m.test(env),
);
const cfg = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const site = `http://127.0.0.1:${cfg.ports.site}`;
const childEnv = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete childEnv[key];
const cli = (args) =>
  spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--env-file", ".env.local"],
    { encoding: "utf8", env: childEnv },
  );
const getEnv = (name) => {
  const r = cli(["env", "get", name]);
  return r.status === 0 ? r.stdout.trim() : "";
};
let keyring = getEnv("RENTAL_DOCUMENT_KEYRING"),
  active = getEnv("RENTAL_DOCUMENT_ACTIVE_KEY");
const keyFile = ".convex/local-document-keys.json";
if (!keyring && !active) {
  const saved = existsSync(keyFile)
    ? JSON.parse(readFileSync(keyFile, "utf8"))
    : null;
  keyring =
    saved?.keyring ??
    JSON.stringify({ "local-v1": randomBytes(32).toString("hex") });
  active = saved?.active ?? "local-v1";
  for (const [name, value] of [
    ["RENTAL_DOCUMENT_KEYRING", keyring],
    ["RENTAL_DOCUMENT_ACTIVE_KEY", active],
  ])
    assert.equal(
      cli(["env", "set", name, value]).status,
      0,
      "Could not configure local private-document storage",
    );
}
const keys = JSON.parse(keyring);
assert(
  keys[active] &&
    Object.values(keys).every((key) => /^[a-f0-9]{64}$/i.test(key)),
);
if (existsSync(keyFile)) {
  const prior = JSON.parse(readFileSync(keyFile, "utf8"));
  assert.equal(
    prior.active,
    active,
    "Reconcile private key backup before smoke tests",
  );
  assert.equal(
    prior.keyring,
    keyring,
    "Reconcile private key backup before smoke tests",
  );
} else
  writeFileSync(keyFile, JSON.stringify({ active, keyring }), { mode: 0o600 });
chmodSync(keyFile, 0o600);
const identity = (subject) => ({
    subject,
    issuer: "https://qa.furnishsearcher.invalid",
  }),
  make = (subject) => {
    const c = new ConvexHttpClient(url);
    c.setAdminAuth(cfg.adminKey, identity(subject));
    return c;
  },
  owner = make("qa-owner-search"),
  tenant = make("qa-tenant-search"),
  stranger = make("qa-document-unrelated"),
  call = (c, type, name, args) => c[type](makeFunctionReference(name), args),
  auth = (subject) =>
    `Convex ${cfg.adminKey}:${Buffer.from(JSON.stringify(identity(subject))).toString("base64")}`;
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me.email, "qa-owner@example.test");
await call(stranger, "mutation", "users:getOrCreate", {
  clerkId: "qa-document-unrelated",
  name: "[QA] Unrelated document reader",
  email: "qa-document-unrelated@example.test",
});
const listing = (
  await call(owner, "query", "listings:getByLandlord", { landlordId: me._id })
).find((l) => l.title === "[QA] Synthetic additional unit — not a rental");
assert(listing?.parentListingId, "Run the unit smoke first");
const bytes = syntheticDocument(),
  paginationOpts = { cursor: null, numItems: 20 };
let inquiryId, documentId;
async function post(upload, body = bytes) {
  return fetch(`${site}/documents/upload?upload=${upload}`, {
    method: "POST",
    headers: {
      Authorization: auth("qa-owner-search"),
      "Content-Type": "application/pdf",
    },
    body,
  });
}
async function download(version, subject) {
  return fetch(`${site}/documents/download?version=${version}`, {
    headers: subject ? { Authorization: auth(subject) } : {},
  });
}
try {
  await prepareLocalPublication([listing._id]);
  const DAY = 86400000,
    start =
      Math.ceil(Math.max(Date.now() + 90 * DAY, listing.availableFrom) / DAY) *
      DAY;
  const marker = `[QA] Private document smoke ${randomUUID()}`;
  inquiryId = await call(tenant, "mutation", "inquiries:create", {
    listingId: listing._id,
    moveIn: start,
    moveOut: start + 31 * DAY,
    occupants: 1,
    pets: false,
    message: marker,
  });
  const args = {
      inquiryId,
      title: "[QA] Private rental document - no legal terms",
      kind: "lease",
      filename: "qa-only-not-a-lease.pdf",
      requestId: randomUUID(),
    },
    upload = await call(owner, "mutation", "rentalDocs:reserveUpload", args);
  assert.equal(
    await call(owner, "mutation", "rentalDocs:reserveUpload", args),
    upload,
  );
  const responses = await Promise.all([post(upload), post(upload)]);
  assert(
    responses.every((r) => r.status === 200),
    "Concurrent local HTTP uploads must both succeed",
  );
  const values = await Promise.all(responses.map((r) => r.json()));
  assert.equal(values[0].versionId, values[1].versionId);
  const first = values[0].versionId;
  let rows = await call(owner, "query", "rentalDocs:list", {
    inquiryId,
    paginationOpts,
  });
  assert.equal(rows.page.length, 1);
  documentId = rows.page[0]._id;
  assert(
    !JSON.stringify(rows).includes("storageId") &&
      !JSON.stringify(rows).includes("keyId"),
  );
  assert.equal((await download(first)).status, 401);
  assert.equal((await download(first, "qa-document-unrelated")).status, 403);
  assert.equal((await download(first, "qa-tenant-search")).status, 403);
  let file = await download(first, "qa-owner-search");
  assert.equal(file.status, 200);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  assert.equal(file.headers.get("cache-control"), "no-store");
  const privateInfo = await call(owner, "query", "rentalDocs:downloadInfo", {
    versionId: first,
  });
  assert.equal(
    await call(owner, "mutation", "files:getUrl", {
      storageId: privateInfo.storageId,
    }),
    null,
  );
  await call(owner, "mutation", "rentalDocs:share", {
    documentId,
    versionId: first,
  });
  assert.equal((await download(first, "qa-tenant-search")).status, 200);
  await call(tenant, "mutation", "rentalDocs:acknowledge", {
    versionId: first,
  });
  const nextUpload = await call(owner, "mutation", "rentalDocs:reserveUpload", {
      ...args,
      documentId,
      expectedVersionId: first,
      filename: "qa-private-revision.pdf",
      requestId: randomUUID(),
    }),
    nextResponse = await post(
      nextUpload,
      syntheticDocument("SYNTHETIC PRIVATE REVISION - NOT A LEASE"),
    );
  assert.equal(nextResponse.status, 200);
  const second = (await nextResponse.json()).versionId;
  rows = await call(tenant, "query", "rentalDocs:list", {
    inquiryId,
    paginationOpts,
  });
  assert.equal(rows.page[0].latest, null);
  assert.equal(rows.page[0].shared._id, first);
  assert.equal(rows.page[0].shared.source, "member_upload");
  assert.equal((await download(second, "qa-tenant-search")).status, 403);
  await call(owner, "mutation", "rentalDocs:unshare", { documentId });
  assert.equal((await download(first, "qa-tenant-search")).status, 403);
  const screening = await call(owner, "mutation", "rentalTools:request", {
    inquiryId,
    kind: "screening",
    note: "[QA] Synthetic instructions only. No real screening order is placed.",
    requestId: randomUUID(),
  });
  await call(tenant, "mutation", "rentalTools:update", {
    id: screening,
    status: "received",
  });
  await call(owner, "mutation", "rentalTools:update", {
    id: screening,
    status: "cancelled",
  });
  const rent = await call(owner, "mutation", "rentalTools:request", {
    inquiryId,
    kind: "rent_collection",
    note: "[QA] Synthetic rent-setup tracking. No invoice, bank account or payment exists.",
    requestId: randomUUID(),
  });
  await call(tenant, "mutation", "rentalTools:update", {
    id: rent,
    status: "received",
  });
  await call(owner, "mutation", "rentalTools:update", {
    id: rent,
    status: "owner_reported_complete",
  });
  assert.equal(
    (
      await call(tenant, "query", "rentalTools:list", {
        inquiryId,
        paginationOpts,
      })
    ).page.find((r) => r._id === rent).status,
    "owner_reported_complete",
  );
  await call(tenant, "mutation", "inquiries:respond", {
    id: inquiryId,
    decision: "withdrawn",
  });
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
    inquiryId,
    documentId,
    actualLocalHttpActions: true,
    concurrentUploadsDeduplicated: true,
    authenticatedByteIdenticalRoundTrip: true,
    privateDraftsAndVersions: true,
    revocationBlocksFutureDownloads: true,
    metadataOmitsStorageIdsAndKeys: true,
    photoUrlGatewayRejectsPrivateStorage: true,
    privateKeyBackupOutsideGit: true,
    receiptAcknowledgementIsNotSignature: true,
    screeningInstructionsOnly: true,
    rentProgressOwnerReportedOnly: true,
    providerApiCalled: false,
    actualScreeningReport: false,
    actualRentPayment: false,
    actualElectronicSignature: false,
    fixtureInquiryWithdrawn: true,
    fixtureListingHidden: true,
    privilegedLocalSdkAndHttpAuth: true,
    actualClerkBrowserJwt: false,
  };
  writeFileSync(
    "docs/evidence/local-document-smoke.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (inquiryId) {
    const current = await call(owner, "query", "bookings:get", {
      id: inquiryId,
    });
    if (current.inquiry.status === "pending")
      await call(tenant, "mutation", "inquiries:respond", {
        id: inquiryId,
        decision: "withdrawn",
      });
  }
  if (documentId) {
    const rows = await call(owner, "query", "rentalDocs:list", {
      inquiryId,
      paginationOpts,
    });
    const d = rows.page.find((row) => row._id === documentId);
    if (d?.shared)
      await call(owner, "mutation", "rentalDocs:unshare", { documentId });
  }
  await call(owner, "mutation", "listings:unpublish", { id: listing._id });
}
