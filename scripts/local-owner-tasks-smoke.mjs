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
const account = await call("query", "ownerTasks:account", { refresh: 0 });
assert(account.checkedAt > 0);
let cursor = null,
  done = false,
  pages = 0,
  taskCount = 0;
while (!done) {
  assert(pages++ < 100);
  const page = await call("query", "ownerTasks:listings", {
    paginationOpts: { cursor, numItems: 100 },
  });
  assert(page.page.length <= 10);
  taskCount += page.page.length;
  cursor = page.continueCursor;
  done = page.isDone;
}
await assert.rejects(
  anonymous.query(makeFunctionReference("ownerTasks:account"), { refresh: 0 }),
  /sign in/,
);
await assert.rejects(
  anonymous.query(makeFunctionReference("ownerTasks:listings"), {
    paginationOpts: { cursor: null, numItems: 10 },
  }),
  /sign in/,
);
writeFileSync(
  "docs/evidence/local-owner-tasks-smoke.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      environment: url,
      authClass:
        "privileged synthetic local identity, not actual Clerk authentication",
      accountTasks: account.tasks.length,
      listingTasks: taskCount,
      pages,
      allNativePagesTraversed: true,
      pageBound: 10,
      anonymousAccessDenied: true,
      fixtureWrites: 0,
      externalProviderRequests: 0,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Native local account/task paging and access guards passed; no fixture writes",
);
