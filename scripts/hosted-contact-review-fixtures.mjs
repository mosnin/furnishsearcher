import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const mode = process.argv[2],
  deployment = "cheerful-ferret-182",
  privatePath = "../hosted-contact-review.private.json";
assert(["setup", "hold", "check", "release", "cleanup"].includes(mode));
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
const history = JSON.parse(
  readFileSync("../hosted-lead-history.private.json", "utf8"),
);
assert(
  !history.cleaned &&
    history.ownerId === me._id &&
    history.title.startsWith("[QA] Historical garden suite "),
);
let fixture = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : null;
const save = () =>
  writeFileSync(privatePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const traveler = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
await refresh(traveler, history.tenantSessionId);
if (mode === "setup") {
  assert(!fixture || fixture.cleaned);
  const suffix = randomUUID().slice(0, 8);
  fixture = {
    ownerId: me._id,
    historyRequestId: history.requestId,
    externalId: `furnishsearcher-qa-contact-staff-${suffix}`,
    email: `contact-staff-${suffix}+clerk_test@example.com`,
    cleaned: false,
  };
  save();
  // Deliberate native QA staff assignment in the dedicated development database.
  // JWTs are actual Clerk sessions; no role claims or paid/identity fixtures are forged.
  const user = await clerk.users.createUser({
    externalId: fixture.externalId,
    emailAddress: [fixture.email],
    skipPasswordRequirement: true,
  });
  fixture.clerkUserId = user.id;
  save();
  const path = "../.contact-review-staff.private.json";
  writeFileSync(
    path,
    JSON.stringify([
      {
        clerkId: user.id,
        role: "admin",
        name: "[QA] Disposable contact review staff",
        email: fixture.email,
        createdAt: Date.now(),
      },
    ]),
    { mode: 0o600 },
  );
  try {
    cli("import", path, "--table", "users", "--append");
  } finally {
    unlinkSync(path);
  }
  const session = await clerk.sessions.createSession({ userId: user.id });
  fixture.sessionId = session.id;
  save();
  fixture.messageId = await call(traveler, "mutation", "messages:sendMessage", {
    senderId: history.tenantId,
    receiverId: me._id,
    listingId: history.listingId,
    content:
      "[QA] Synthetic reportable contact-review message; no actual allegation or rental",
    origin: "inbox",
  });
  save();
  fixture.caseId = await call(owner, "mutation", "support:report", {
    messageId: fixture.messageId,
    category: "Spam or suspicious message",
    details: "[QA] Synthetic contact review acceptance; no actual allegation",
  });
  save();
  console.log(
    "Own disposable development staff account and native report prepared; private QA history only.",
  );
} else {
  assert(
    fixture &&
      !fixture.cleaned &&
      fixture.ownerId === me._id &&
      fixture.historyRequestId === history.requestId,
  );
  const staffAccount = await clerk.users.getUser(fixture.clerkUserId);
  assert(
    staffAccount.externalId === fixture.externalId &&
      staffAccount.externalId.startsWith("furnishsearcher-qa-contact-staff-") &&
      staffAccount.emailAddresses.length === 1 &&
      staffAccount.emailAddresses[0].emailAddress === fixture.email,
  );
  const staff = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
  await refresh(staff, fixture.sessionId);
  const staffUser = await call(staff, "query", "users:getByClerkId", {
    clerkId: fixture.clerkUserId,
  });
  assert.equal(staffUser.role, "admin");
  const get = () => call(staff, "query", "support:get", { id: fixture.caseId });
  const review = async (action) => {
    const info = await get();
    assert.equal(info.contactReview.userId, history.tenantId);
    await call(staff, "mutation", "support:review", {
      id: fixture.caseId,
      status: action === "hold" ? "reviewing" : "resolved",
      note: `[QA] Synthetic native contact ${action}; disposable development fixture`,
      contactAction: action,
      expectedContactRevision: info.contactReview.revision,
    });
  };
  if (mode === "hold") {
    await assert.rejects(
      call(owner, "mutation", "support:review", {
        id: fixture.caseId,
        status: "reviewing",
        note: "Must not self-grant staff",
        contactAction: "hold",
        expectedContactRevision: 0,
      }),
      /Staff/,
    );
    await review("hold");
    console.log("Native staff-held precautionary QA contact review active.");
  } else if (mode === "check") {
    assert((await get()).contactReview.restricted);
    const inbox = await call(owner, "query", "housingRequests:inbox", {
      paginationOpts: { cursor: null, numItems: 25 },
    });
    assert(
      inbox.page.find((row) => row.request._id === history.requestId)
        ?.contactRestricted,
    );
    assert.equal(
      (
        await call(owner, "query", "housingRequests:leadContact", {
          requestId: history.requestId,
          listingId: history.listingId,
        })
      ).phone,
      null,
    );
    for (const [client, senderId, receiverId] of [
      [owner, me._id, history.tenantId],
      [traveler, history.tenantId, me._id],
    ])
      await assert.rejects(
        call(client, "mutation", "messages:sendMessage", {
          senderId,
          receiverId,
          listingId: history.listingId,
          content: "Must not send during review",
        }),
        /unavailable/,
      );
    await assert.rejects(
      call(owner, "query", "housingRequests:matchingProperties", {
        requestId: history.requestId,
        orderVersion: 1,
        paginationOpts: { cursor: null, numItems: 25 },
      }),
      /unavailable/,
    );
    const messages = await call(traveler, "query", "messages:listMessages", {
      conversationId: history.conversationId,
      paginationOpts: { cursor: null, numItems: 25 },
    });
    assert(messages.page.some((m) => m._id === fixture.messageId));
    const privateView = await call(owner, "query", "support:get", {
      id: fixture.caseId,
    });
    assert.equal(privateView.contactReview, undefined);
    assert.equal(privateView.reportedUserId, undefined);
    assert.equal(privateView.evidence, undefined);
    writeFileSync(
      "docs/evidence/hosted-contact-review-native.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          deployment,
          actualClerkOwnerTravelerAndStaffDevelopmentJwts: true,
          explicitNativeStaffAssignmentForNewDisposableDevelopmentAccount: true,
          privilegedPrivateHistoricalLeadOnly: true,
          nonstaffReviewDenied: true,
          nativeReportedAccountBinding: true,
          heldLeadRemainsVisibleWithContactDisabled: true,
          bothDirectionsNewMessagingDenied: true,
          currentPhoneAndMatchingDenied: true,
          historyReadableAndStaffNotesPrivate: true,
          realPublicPaidIdentityOrSmsAcceptance: false,
          realPersonMessageEmailOrSmsSent: false,
          productionChanged: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Actual Clerk native review authority, contact denial and retained private history passed.",
    );
  } else {
    const info = await get();
    if (info.contactReview.caseRestricted) await review("release");
    assert.equal((await get()).contactReview.restricted, false);
    const item = (
      await call(owner, "query", "housingRequests:inbox", {
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).page.find((row) => row.request._id === history.requestId);
    assert(item && !item.contactRestricted);
    if (mode === "cleanup") {
      const { jwt } = await clerk.sessions.getToken(
        fixture.sessionId,
        "convex",
      );
      const claims = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      assert(claims.exp > Date.now() / 1000 + 15);
      staff.setAuth(jwt);
      await clerk.users.deleteUser(fixture.clerkUserId);
      let revoked = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        if (
          (await call(staff, "query", "users:getByClerkId", {
            clerkId: fixture.clerkUserId,
          })) === null
        ) {
          revoked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert(
        revoked && claims.exp > Date.now() / 1000,
        "Native staff authority must be revoked before token expiry",
      );
      await assert.rejects(
        call(staff, "query", "support:get", { id: fixture.caseId }),
      );
      const receiptPath = "docs/evidence/hosted-contact-review-native.json";
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      Object.assign(receipt, {
        reviewReleased: true,
        disposableStaffDeletedAndNativeAuthorityRevokedBeforeJwtExpiry: true,
      });
      writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
      fixture.cleaned = true;
      save();
      console.log(
        "Own review released and disposable Clerk staff deleted; native private audit retained.",
      );
    } else
      console.log(
        "Native review released; original private-history contact state restored.",
      );
  }
}
