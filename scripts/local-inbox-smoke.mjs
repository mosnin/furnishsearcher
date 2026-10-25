import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
const owner = make("qa-owner-search"),
  call = (client, method, name, args) =>
    client[method](makeFunctionReference(name), args);
const me = await call(owner, "query", "users:getByClerkId", {
  clerkId: "qa-owner-search",
});
assert.equal(me.email, "qa-owner@example.test");
const listings = await call(owner, "query", "listings:getByLandlord", {
  landlordId: me._id,
});
const listing = listings.find(
  (l) => l.title === "[QA] Synthetic additional unit — not a rental",
);
assert(listing);
const cliEnv = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete cliEnv[key];
const backfill = spawnSync(
  process.execPath,
  [
    "node_modules/convex/bin/main.js",
    "run",
    "inbox:backfill",
    "{}",
    "--env-file",
    ".env.local",
  ],
  { env: cliEnv, encoding: "utf8" },
);
assert.equal(backfill.status, 0, "Local inbox backfill failed");
const created = [];
const pageAll = async (folder, client = owner) => {
  const rows = [];
  let cursor = null;
  for (let i = 0; i < 100; i++) {
    const result = await call(client, "query", "inbox:list", {
      folder,
      paginationOpts: { cursor, numItems: 17 },
    });
    rows.push(...result.page);
    if (result.isDone) return rows;
    cursor = result.continueCursor;
  }
  throw new Error("Inbox pagination did not finish");
};
try {
  await prepareLocalPublication([listing._id]);
  for (let i = 0; i < 45; i++) {
    const subject = `qa-inbox-tenant-${i}`,
      tenant = make(subject);
    const user = await call(tenant, "mutation", "users:getOrCreate", {
      clerkId: subject,
      name: `[QA] Synthetic inbox participant ${i}`,
      email: `${subject}@example.test`,
    });
    await call(tenant, "mutation", "messages:sendMessage", {
      senderId: user._id,
      receiverId: me._id,
      listingId: listing._id,
      content: "Synthetic inbox pagination fixture; no rental inquiry.",
      clientRequestId: randomUUID(),
      origin: "inbox",
    });
    const rows = await pageAll("all", tenant),
      conv = rows.find(
        (c) => c.listingId === listing._id && c.landlordId === me._id,
      );
    assert(conv);
    created.push({ tenant, user, conv });
  }
  const all = await pageAll("all"),
    ids = new Set(all.map((c) => c._id));
  assert.equal(ids.size, all.length);
  for (const c of created) assert(ids.has(c.conv._id));
  for (let i = 1; i < all.length; i++)
    assert(all[i - 1].lastMessageAt >= all[i].lastMessageAt);
  const firstPage = await call(owner, "query", "inbox:list", {
    folder: "all",
    paginationOpts: { cursor: null, numItems: 17 },
  });
  const older = created.find(
    (c) => !firstPage.page.some((row) => row._id === c.conv._id),
  );
  assert(older);
  assert.equal(
    (await call(owner, "query", "inbox:conversation", { id: older.conv._id }))
      ._id,
    older.conv._id,
  );
  assert.equal(
    await call(make("qa-unrelated-inbox"), "query", "users:getByClerkId", {
      clerkId: "qa-unrelated-inbox",
    }),
    null,
  );
  const subject = created[0];
  assert.equal(
    await call(created[1].tenant, "query", "inbox:conversation", {
      id: subject.conv._id,
    }),
    null,
  );
  await call(owner, "mutation", "messages:setArchived", {
    conversationId: subject.conv._id,
    archived: true,
  });
  assert((await pageAll("archived")).some((c) => c._id === subject.conv._id));
  await call(owner, "mutation", "messages:setBlocked", {
    conversationId: subject.conv._id,
    blocked: true,
  });
  for (let i = 0; i < 50; i++) {
    const summary = await call(owner, "query", "inbox:summary", {});
    if (summary.ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert((await pageAll("blocked")).some((c) => c._id === subject.conv._id));
  await assert.rejects(
    call(subject.tenant, "mutation", "messages:sendMessage", {
      senderId: subject.user._id,
      receiverId: me._id,
      listingId: listing._id,
      content: "Synthetic blocked attempt",
    }),
  );
  await call(owner, "mutation", "messages:unblockUser", {
    userId: subject.user._id,
  });
  for (let i = 0; i < 50; i++) {
    const summary = await call(owner, "query", "inbox:summary", {});
    if (summary.ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const summary = await call(owner, "query", "inbox:summary", {}),
    unread = await pageAll("unread");
  assert.equal(summary.ready, true);
  assert.equal(summary.unread, unread.length);
  assert(summary.recent.length <= 6);
} finally {
  for (const { conv, user } of created) {
    await call(owner, "mutation", "messages:unblockUser", { userId: user._id });
    await call(owner, "mutation", "messages:markRead", {
      userId: me._id,
      conversationId:
        [conv.tenantId, conv.landlordId].sort().join("_") +
        "_" +
        conv.listingId,
    });
    await call(owner, "mutation", "messages:setArchived", {
      conversationId: conv._id,
      archived: true,
    });
  }
  await call(owner, "mutation", "listings:unpublish", { id: listing._id });
}
writeFileSync(
  "docs/evidence/local-inbox-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      target: url,
      hosted: false,
      syntheticConversationsExercised: created.length,
      completeMultiPageListing: true,
      orderedWithoutDuplicates: true,
      directOlderConversationLink: true,
      unrelatedReadDenied: true,
      archiveAndBlockFolders: true,
      blockingPreventsSend: true,
      unreadTotalMatchesAllUnreadPages: true,
      recentSummaryBounded: true,
      fixtureConversationsReadAndArchived: true,
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
  "Local inbox smoke passed: 45 synthetic conversations, real local pagination/counts/folder changes; no Clerk/browser/email acceptance.",
);
