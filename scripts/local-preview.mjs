import assert from "node:assert/strict";
import { readFileSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

process.env.PATH = `${dirname(process.execPath)}:${process.env.PATH ?? ""}`;

// Explicitly opt in per process; never persist a login bypass in shared env files.
const selector = readFileSync(".env.local", "utf8");
assert(
  /^CONVEX_DEPLOYMENT=anonymous:/m.test(selector),
  "Preview requires the existing anonymous local deployment",
);
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
const url = selector
  .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
  .trim()
  .replace(/^"|"$/g, "");
assert.equal(url, `http://127.0.0.1:${config.ports.cloud}`);
const credentials = JSON.parse(
  readFileSync(".clerk/.tmp/keyless.json", "utf8"),
);
assert(credentials.publishableKey.startsWith("pk_test_"));
const instance = await fetch("https://api.clerk.com/v1/instance", {
  headers: { Authorization: `Bearer ${credentials.secretKey}` },
}).then(async (r) => {
  assert(r.ok, "Development auth unavailable");
  return r.json();
});
assert.equal(instance.environment_type, "development");
assert.equal(instance.id, "ins_3L9oPR1TeW643w6zPX1vgsOFAxU");
const clerk = createClerkClient({ secretKey: credentials.secretKey });
const account = JSON.parse(
  readFileSync("../hosted-auth-session.private.json", "utf8"),
);
const user = await clerk.users.getUser(account.userId);
assert(user.externalId?.startsWith("furnishsearcher-qa-"));
const email = user.emailAddresses.find((row) =>
  row.emailAddress.endsWith("+clerk_test@example.com"),
)?.emailAddress;
assert(email, "Reserved QA account required");

const backendReady = async () => {
  try {
    return (await fetch(`${url}/version`)).ok;
  } catch {
    return false;
  }
};
let backend;
if (!(await backendReady())) {
  const binary = resolve(
    homedir(),
    ".cache/convex/binaries",
    config.backendVersion,
    "convex-local-backend",
  );
  const log = openSync("../local-preview-backend.log", "a", 0o600);
  backend = spawn(
    binary,
    [
      "--interface",
      "127.0.0.1",
      "--port",
      String(config.ports.cloud),
      "--site-proxy-port",
      String(config.ports.site),
      "--instance-name",
      config.deploymentName,
      "--instance-secret",
      config.instanceSecret,
      "--local-storage",
      resolve(".convex/local/default/convex_local_storage"),
      resolve(".convex/local/default/convex_local_backend.sqlite3"),
    ],
    { stdio: ["ignore", log, log] },
  );
  backend.on("error", () =>
    console.error(
      "Local Convex failed to start; inspect local-preview-backend.log.",
    ),
  );
  for (let n = 0; n < 100 && !(await backendReady()); n++)
    await new Promise((r) => setTimeout(r, 200));
  assert(await backendReady(), "Local Convex did not start");
}

const localAdmin = new ConvexHttpClient(url, { logger: false });
localAdmin.setAdminAuth(config.adminKey);
// CLI equivalent, reads local env only. Refuse a local replica with real email delivery.
const envRows = await localAdmin.query(
  makeFunctionReference("_system/cli/queryEnvironmentVariables"),
  {},
);
assert(
  !envRows.some((row) => row.name === "RESEND_API_KEY" && row.value),
  "Preview requires disabled email delivery",
);
const client = new ConvexHttpClient(url, { logger: false });
client.setAuth(
  (await clerk.sessions.getToken(account.sessionId, "convex")).jwt,
);
const call = (type, name, args) =>
  client[type](makeFunctionReference(name), args);
let localUser = await call("query", "users:getByClerkId", { clerkId: user.id });
if (!localUser) {
  localUser = await call("mutation", "users:getOrCreate", {
    clerkId: user.id,
    email,
    name: "Local preview owner",
  });
  localUser = await call("mutation", "users:updateRole", {
    userId: localUser._id,
    role: "landlord",
  });
}
assert.equal(localUser.role, "landlord");
const existing = await call("query", "listings:getByLandlord", {
  landlordId: localUser._id,
});
for (const [title, city, state, price] of [
  ["[Local preview] Austin monthly apartment", "Austin", "TX", 1800],
  ["[Local preview] Denver furnished studio", "Denver", "CO", 2100],
]) {
  if (existing.some((row) => row.title === title)) continue;
  await call("mutation", "listings:create", {
    landlordId: localUser._id,
    title,
    city,
    state,
    price,
    description:
      "Synthetic local preview rental. Not a real property or public listing.",
    address: "LOCAL PREVIEW ONLY",
    zip: city === "Austin" ? "78701" : "80201",
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: ["WiFi"],
    photos: [],
    petFriendly: false,
    parkingIncluded: false,
    utilitiesIncluded: true,
    availableFrom: Math.floor(Date.now() / 86400000) * 86400000,
    minStay: 1,
  });
}
console.log(
  "Local Convex ready; two private preview rentals available. No publication or paid/identity grants added.",
);
const port = "3006";
const origin = `http://localhost:${port}`;
const next = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "localhost",
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      LOCAL_PREVIEW_ENABLED: "1",
      LOCAL_PREVIEW_ORIGIN: origin,
      LOCAL_PREVIEW_USER_ID: user.id,
      NEXT_PUBLIC_CONVEX_URL: url,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: credentials.publishableKey,
      CLERK_SECRET_KEY: credentials.secretKey,
    },
  },
);
console.log(`Open ${origin}/local-preview`);
const stop = () => {
  next.kill("SIGTERM");
  backend?.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", (code) => {
  backend?.kill("SIGTERM");
  process.exitCode = code ?? 0;
});
