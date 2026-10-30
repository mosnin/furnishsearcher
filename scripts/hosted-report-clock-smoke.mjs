import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
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
const clerk = createClerkClient({ secretKey: credentials.secretKey }),
  session = JSON.parse(
    readFileSync("../hosted-auth-session.private.json", "utf8"),
  );
const account = await clerk.users.getUser(session.userId);
assert(account.externalId?.startsWith("furnishsearcher-qa-"));
assert(
  account.emailAddresses.every((e) =>
    e.emailAddress.endsWith("+clerk_test@example.com"),
  ),
);
const jwt = (await clerk.sessions.getToken(session.sessionId, "convex")).jwt;
assert(jwt);
const owner = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
owner.setAuth(jwt);
const call = (c, name, args) => c.query(makeFunctionReference(name), args);
const me = await call(owner, "users:getByClerkId", { clerkId: account.id });
assert.equal(me.role, "landlord");
const performance = await import(
  pathToFileURL(resolve("lib/listing-performance.ts")).href
);
const mapJs = ts
  .transpileModule(readFileSync("lib/map-eligibility.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    '"./listing-performance"',
    JSON.stringify(pathToFileURL(resolve("lib/listing-performance.ts")).href),
  );
const eligibility = await import(
  `data:text/javascript;base64,${Buffer.from(mapJs).toString("base64")}`
);
const properties = [];
let cursor = null,
  pages = 0;
do {
  const p = await call(owner, "listingPerformance:properties", {
    paginationOpts: { cursor, numItems: 30 },
  });
  properties.push(...p.page);
  cursor = p.isDone ? null : p.continueCursor;
  pages++;
  assert(pages <= 20, "Unexpected property count for this reserved account");
} while (cursor);
const chosen = properties.find(
  (p) =>
    p.id === "n572ng3271p6f1gpmwtypef71x8gyg37" &&
    p.title.startsWith("[QA] Hosted performance access check"),
);
assert(chosen);
const snapshots = [],
  summaries = [];
for (const [scope, listingId] of [
  ["all", undefined],
  ["space", chosen.id],
])
  for (const days of [7, 30, 90]) {
    const args = {
      ...(listingId ? { listingId } : {}),
      days,
      refreshKey: Date.UTC(2040, 0, 1),
    };
    const report = await call(owner, "listingPerformance:report", args),
      map = await call(owner, "mapEligibility:report", {
        ...args,
        refreshKey: -1,
      });
    assert(report.generatedAt && map.generatedAt);
    for (const r of [report, map]) {
      assert.deepEqual(
        { start: r.start, end: r.end },
        performance.performanceWindow(days, r.generatedAt),
      );
      assert(
        Math.abs(r.generatedAt - Date.now()) < 30000,
        "Native sample time differs from current server probe",
      );
    }
    const rows = performance.performanceReportSeries(report),
      mapRows = eligibility.eligibilityReportSeries(map);
    assert.equal(rows.length, days);
    assert.equal(rows[0].day, report.start);
    assert.equal(rows.at(-1).day, report.end - performance.PERFORMANCE_DAY);
    assert.equal(mapRows[0].day, map.start);
    assert.equal(mapRows.at(-1).day, map.end - performance.PERFORMANCE_DAY);
    const csv = performance.performanceCsv(rows, report.mode),
      mapCsv = eligibility.eligibilityCsv(mapRows, map.mode, !listingId);
    for (const [kind, body] of [
      ["activity", csv],
      ["eligibility", mapCsv],
    ])
      writeFileSync(
        `../report-clock-${scope}-${days}-${kind}.expected.csv`,
        body,
        { mode: 0o600 },
      );
    const totals = Object.fromEntries(
      performance.PERFORMANCE_METRICS.map((k) => [
        k,
        rows
          .filter((r) => performance.metricRecorded(r, k))
          .reduce((n, r) => n + r[k], 0),
      ]),
    );
    summaries.push({
      scope,
      days,
      start: report.start,
      end: report.end,
      mode: report.mode,
      activityRows: rows.length,
      observedMapDays: mapRows.filter((r) => r.observation).length,
      totals,
    });
    snapshots.push({ scope, days, report, map });
  }
const anon = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
await assert.rejects(
  call(anon, "listingPerformance:report", { days: 7, refreshKey: 0 }),
  /sign in/,
);
await assert.rejects(
  call(anon, "mapEligibility:report", { days: 7, refreshKey: 0 }),
  /sign in/,
);
writeFileSync(
  "../report-clock-native.private.json",
  JSON.stringify({ listingId: chosen.id, snapshots }, null, 2),
  { mode: 0o600 },
);
writeFileSync(
  "docs/evidence/hosted-report-clock-native.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      deployment,
      actualReservedClerkOwner: true,
      readOnly: true,
      noFixturesOrAuthorityImported: true,
      propertyPages: pages,
      properties: properties.length,
      clockKeysDoNotChooseUtcWindows: true,
      serverWindowAndSampleValidated: true,
      anonymousReportsDenied: true,
      expectedCsvFiles: 12,
      reports: summaries,
      limits:
        "Positive values are existing accepted development events, not public marketplace traffic or verified visitors. This probe does not simulate the browser clock or actual UTC rollover.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({ reports: summaries, readOnly: true, expectedCsvFiles: 12 }),
);
