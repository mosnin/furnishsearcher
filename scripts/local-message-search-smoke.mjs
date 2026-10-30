import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
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
const suffix = randomUUID().slice(0, 8),
  subject = `qa-message-search-${suffix}`,
  tenant = make(subject),
  other = make("qa-message-search-unrelated");
const user = await call(tenant, "mutation", "users:getOrCreate", {
  clerkId: subject,
  name: `[QA] Synthetic search participant ${suffix}`,
  email: `${subject}@example.test`,
});
await call(other, "mutation", "users:getOrCreate", {
  clerkId: "qa-message-search-unrelated",
  name: "[QA] Unrelated search participant",
  email: "qa-search-unrelated@example.test",
});
const childEnv = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete childEnv[key];
const migrate = spawnSync(
  process.execPath,
  [
    "node_modules/convex/bin/main.js",
    "run",
    "messageSearch:backfillNames",
    "{}",
    "--env-file",
    ".env.local",
  ],
  { encoding: "utf8", env: childEnv },
);
assert.equal(migrate.status, 0, "Local participant-name backfill failed");
for (let i = 0; i < 100; i++) {
  const status = await call(owner, "query", "messageSearch:status", {});
  if (status.namesReady && status.historyReady) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(
  (await call(owner, "query", "messageSearch:status", {})).namesReady,
  true,
);
const alias = `Initialsearch${suffix}`,
  finalAlias = `Finalsearch${suffix}`,
  term = `antiquefixture${suffix}`,
  batch = `batchsearch${suffix}`;
await call(tenant, "mutation", "users:updateProfile", {
  userId: user._id,
  displayName: alias,
});
const paginationOpts = { cursor: null, numItems: 10 };
const people = (query) =>
  call(owner, "query", "messageSearch:people", {
    query,
    scope: "everywhere",
    paginationOpts,
  });
const search = (
  client,
  query,
  direction = "received",
  scope = "everywhere",
  opts = paginationOpts,
) =>
  call(client, "query", "messageSearch:messages", {
    query,
    direction,
    scope,
    paginationOpts: opts,
  });
const waitFolders = async () => {
  for (let i = 0; i < 100; i++) {
    const status = await call(owner, "query", "messageSearch:status", {});
    if (status.historyReady) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Inbox folder work did not finish");
};
let conversationId;
try {
  await prepareLocalPublication([listing._id]);
  const original = await call(tenant, "mutation", "messages:sendMessage", {
    senderId: user._id,
    receiverId: me._id,
    listingId: listing._id,
    content:
      "padding ".repeat(80) + `${term} private synthetic old-message detail`,
    clientRequestId: randomUUID(),
  });
  conversationId = (
    await call(tenant, "query", "inbox:list", { folder: "all", paginationOpts })
  ).page.find((row) => row.listingId === listing._id)._id;
  const created = [];
  for (let i = 0; i < 55; i++) {
    const sender = i % 2 ? owner : tenant;
    created.push(
      await call(sender, "mutation", "messages:sendMessage", {
        senderId: i % 2 ? me._id : user._id,
        receiverId: i % 2 ? user._id : me._id,
        listingId: listing._id,
        content: `${batch} synthetic follow-up ${i}`,
        clientRequestId: randomUUID(),
      }),
    );
  }
  const latest = await call(owner, "query", "messages:listMessages", {
    conversationId,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  assert(!latest.page.some((row) => row._id === original));
  let hits = await search(owner, term.toUpperCase());
  assert.deepEqual(
    hits.page.map((row) => row.messageId),
    [original],
  );
  assert(hits.page[0].excerpt.includes(term));
  assert(hits.page[0].excerpt.length <= 322);
  assert(
    (await search(owner, term.slice(0, -3))).page.some(
      (row) => row.messageId === original,
    ),
  );
  assert.equal((await search(other, term)).page.length, 0);
  const window = await call(owner, "query", "messageSearch:window", {
    conversationId,
    messageId: original,
  });
  assert.equal(window.targetId, original);
  assert(window.messages.some((row) => row._id === original));
  assert(window.messages.length <= 51);
  await assert.rejects(
    call(other, "query", "messageSearch:window", {
      conversationId,
      messageId: original,
    }),
  );
  const all = [];
  for (const direction of ["sent", "received"]) {
    let cursor = null;
    for (let i = 0; i < 20; i++) {
      const result = await search(owner, batch, direction, "everywhere", {
        cursor,
        numItems: 7,
      });
      all.push(...result.page);
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
  }
  assert.equal(all.length, created.length);
  assert.equal(new Set(all.map((row) => row.messageId)).size, created.length);
  assert((await people(alias)).page.some((row) => row._id === conversationId));
  const unreadBefore = (await call(owner, "query", "inbox:summary", {})).unread;
  await call(tenant, "mutation", "users:updateProfile", {
    userId: user._id,
    displayName: finalAlias,
  });
  assert(!(await people(alias)).page.some((row) => row._id === conversationId));
  assert(
    (await people(finalAlias)).page.some((row) => row._id === conversationId),
  );
  assert.equal(
    (await call(owner, "query", "inbox:summary", {})).unread,
    unreadBefore,
  );
  await call(owner, "mutation", "messages:setArchived", {
    conversationId,
    archived: true,
  });
  assert.equal((await search(owner, term, "received", "all")).page.length, 0);
  assert.equal(
    (await search(owner, term, "received", "archived")).page.length,
    1,
  );
  await call(owner, "mutation", "messages:setBlocked", {
    conversationId,
    blocked: true,
  });
  hits = await search(owner, term, "received", "blocked");
  assert.equal(hits.page.length, 1);
  assert.equal(hits.page[0].conversation.cannotMessage, true);
  await assert.rejects(
    call(tenant, "mutation", "messages:sendMessage", {
      senderId: user._id,
      receiverId: me._id,
      listingId: listing._id,
      content: "Synthetic blocked send",
    }),
  );
  await waitFolders();
} finally {
  if (conversationId) {
    await call(owner, "mutation", "messages:unblockUser", { userId: user._id });
    for (const [client, id] of [
      [owner, me._id],
      [tenant, user._id],
    ]) {
      await call(client, "mutation", "messages:markRead", {
        userId: id,
        conversationId: [me._id, user._id].sort().join("_") + "_" + listing._id,
      });
      await call(client, "mutation", "messages:setArchived", {
        conversationId,
        archived: true,
      });
    }
  }
  await call(owner, "mutation", "listings:unpublish", { id: listing._id });
}
writeFileSync(
  "docs/evidence/local-message-search-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      actualConvexTextSearch: true,
      originalMessageOutsideNewestPage: true,
      caseInsensitivePrefixMatch: true,
      boundedMatchWindowContainsTarget: true,
      sentAndReceivedMatchesPaged: 55,
      unrelatedSearchAndWindowDenied: true,
      participantAliasIndexed: true,
      visibleNameBackfillCompleted: true,
      removedAliasNoLongerMatches: true,
      nameUpdatePreservesUnreadTotal: true,
      archivedAndBlockedHistorySearchable: true,
      blockedSendStillRejected: true,
      fixtureConversationReadAndArchived: true,
      fixtureListingHidden: true,
      privilegedSyntheticIdentities: true,
      actualClerkBrowserJwt: false,
      actualEmailDelivery: false,
      renderedBrowserAcceptance: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Local message-search smoke passed: actual Convex full-text search, 55 paged matches and an older match window; synthetic identity, no browser/Clerk acceptance.",
);
