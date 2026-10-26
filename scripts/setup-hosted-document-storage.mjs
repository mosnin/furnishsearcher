import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const deployment = "cheerful-ferret-182",
  backupPath = "../hosted-document-keyring.private.json";
const selector = readFileSync(".env.local");
const env = { ...process.env };
for (const name of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete env[name];
const cliResult = (...args) => {
  const r = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--deployment", deployment],
    { encoding: "utf8", env },
  );
  assert.equal(
    r.status,
    0,
    "Development document configuration command failed; output withheld",
  );
  return { output: r.stdout.trim(), notice: r.stderr };
};
const cli = (...args) => cliResult(...args).output;
let keyring = cli("env", "get", "RENTAL_DOCUMENT_KEYRING"),
  active = cli("env", "get", "RENTAL_DOCUMENT_ACTIVE_KEY");
const backup = existsSync(backupPath)
  ? JSON.parse(readFileSync(backupPath, "utf8"))
  : null;
let created = false;
if (!keyring && !active) {
  const result = cliResult(
    "data",
    "rentalDocumentVersions",
    "--limit",
    "1",
    "--format",
    "json",
  );
  if (!result.output)
    assert(
      result.notice.includes("There are no documents in this table."),
      "Empty data output did not establish an empty table",
    );
  const rows = result.output ? JSON.parse(result.output) : [];
  assert(
    Array.isArray(rows) && rows.length === 0,
    "Existing encrypted versions require recovery of their original keyring; refusing new keys",
  );
  assert(!backup || backup.deployment === deployment);
  keyring =
    backup?.keyring ??
    JSON.stringify({ "development-v1": randomBytes(32).toString("hex") });
  active = backup?.active ?? "development-v1";
  created = !backup;
  if (!backup)
    writeFileSync(backupPath, JSON.stringify({ deployment, active, keyring }), {
      mode: 0o600,
      flag: "wx",
    });
  cli("env", "set", "RENTAL_DOCUMENT_KEYRING", keyring);
  cli("env", "set", "RENTAL_DOCUMENT_ACTIVE_KEY", active);
} else if (backup && keyring === backup.keyring && !active) {
  assert.equal(backup.deployment, deployment);
  active = backup.active;
  cli("env", "set", "RENTAL_DOCUMENT_ACTIVE_KEY", active);
}
assert(
  active && keyring,
  "Partial or unknown document key configuration requires recovery; refusing replacement",
);
const keys = JSON.parse(keyring);
assert(
  keys &&
    !Array.isArray(keys) &&
    Object.hasOwn(keys, active) &&
    Object.values(keys).every(
      (k) => typeof k === "string" && /^[a-f0-9]{64}$/i.test(k),
    ),
  "Invalid existing key configuration; refusing replacement",
);
if (backup) {
  assert.equal(backup.deployment, deployment);
  assert.equal(backup.active, active);
  assert.deepEqual(
    JSON.parse(backup.keyring),
    keys,
    "Private backup does not match development keys",
  );
} else if (!existsSync(backupPath))
  writeFileSync(backupPath, JSON.stringify({ deployment, active, keyring }), {
    mode: 0o600,
    flag: "wx",
  });
chmodSync(backupPath, 0o600);
assert.equal(cli("env", "get", "RENTAL_DOCUMENT_KEYRING"), keyring);
assert.equal(cli("env", "get", "RENTAL_DOCUMENT_ACTIVE_KEY"), active);
const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
  logger: false,
});
const capability = await client.query(
  makeFunctionReference("rentalDocs:capabilities"),
  {},
);
assert.equal(capability.privateFiles, true);
assert.deepEqual(readFileSync(".env.local"), selector);
writeFileSync(
  "docs/evidence/hosted-document-storage.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      environment: deployment,
      privateFiles: true,
      newIndependentDevelopmentKeyring: created,
      originalKeysNeverReplaced: true,
      privateBackupMode: "0600",
      localSelectorPreserved: true,
      productionChanged: false,
      backupRequiredForRetainedVersions: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Private document storage configured in dedicated development; backup protected and keys withheld",
);
