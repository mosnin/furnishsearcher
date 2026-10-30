import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const deployment = "cheerful-ferret-182";
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
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const session = JSON.parse(
  readFileSync("../hosted-auth-session.private.json", "utf8"),
);
const fixture = JSON.parse(
  readFileSync("../hosted-document-workspace.private.json", "utf8"),
);
assert.equal(fixture.cleaned, true);
const account = await clerk.users.getUser(session.userId);
assert(account.externalId?.startsWith("furnishsearcher-qa-"));
assert(
  account.emailAddresses.every((e) =>
    e.emailAddress.endsWith("+clerk_test@example.com"),
  ),
);
const jwt = (await clerk.sessions.getToken(session.sessionId, "convex")).jwt;
assert(jwt);
const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
client.setAuth(jwt);
const call = (type, name, args) =>
  client[type](makeFunctionReference(name), args);
const booking = await call("query", "bookings:get", {
  id: fixture.inquiryId,
});
assert.equal(booking.inquiry.status, "withdrawn");
const docs = await call("query", "rentalDocs:list", {
  inquiryId: fixture.inquiryId,
  paginationOpts: { cursor: null, numItems: 10 },
});
assert.equal(docs.page.length, 1);
const doc = docs.page[0];
assert.equal(doc._id, fixture.documentId);
assert.equal(doc.canRemoveDraft, false);
const versions = await call("query", "rentalDocs:versions", {
  documentId: doc._id,
  paginationOpts: { cursor: null, numItems: 10 },
});
assert.equal(versions.page.length, 2);
assert(
  versions.page.some((v) => v._id === fixture.firstId && v.acknowledgedAt),
);
const denied = async (name, args) => {
  let error;
  try {
    await call("mutation", name, args);
  } catch (e) {
    error = e;
  }
  assert(
    error && String(error).includes("discussion is closed"),
    "Expected closed-discussion denial",
  );
};
await denied("rentalDocs:reserveUpload", {
  inquiryId: fixture.inquiryId,
  title: "[QA] Must not reserve",
  kind: "inventory",
  filename: "synthetic.pdf",
  requestId: randomUUID(),
});
await denied("rentalDocs:share", {
  documentId: doc._id,
  versionId: doc.latest._id,
});
for (const [id, path] of [
  [fixture.firstId, "../qa-private-condition-v1.pdf"],
  [fixture.secondId, "../qa-private-condition-v2.pdf"],
]) {
  const response = await fetch(
    `https://${deployment}.convex.site/documents/download?version=${id}`,
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert(
    Buffer.from(await response.arrayBuffer()).equals(readFileSync(path)),
    "Retained document bytes differ",
  );
}
writeFileSync(
  "docs/evidence/hosted-closed-documents-native.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      deployment,
      context:
        "Existing retained synthetic withdrawn discussion; property and disposable traveler already removed. No new fixture or provider request.",
      closedReserveDenied: true,
      closedShareDenied: true,
      retainedVersions: 2,
      retainedReceipt: true,
      authenticatedDownloadsMatch: 2,
      normalDraftRemovalUnavailable: true,
      providerRequests: 0,
      limits:
        "Closed signing permissions/setup races tested with local synthetic provider mocks; no live signing acceptance.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Closed-discussion reserve/share denied; two retained downloads and receipt verified.",
);
