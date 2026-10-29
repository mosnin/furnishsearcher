/** Readiness only: never writes configuration or prints environment values. */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const readEnv = (path) => existsSync(path)
  ? Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).filter(line => line && !line.trimStart().startsWith("#") && line.includes("=")).map(line => { const i = line.indexOf("="); return [line.slice(0,i).trim(), line.slice(i+1).trim()]; }))
  : {};
const env = {...readEnv(".env"), ...readEnv(".env.local"), ...process.env};
const backend = spawnSync(process.execPath,["node_modules/convex/bin/main.js","env","list"], {encoding:"utf8", env});
const configured = new Set((backend.stdout ?? "").split(/\r?\n/).map(line => line.split("=",1)[0].trim()).filter(key => /^[A-Z][A-Z0-9_]+$/.test(key)));
const required = ["JWT_PRIVATE_KEY","JWKS","SITE_URL","AUTH_GOOGLE_ID","AUTH_GOOGLE_SECRET"];
const report = {
  mode: "readiness only",
  deploymentKind: env.CONVEX_DEPLOYMENT?.startsWith("anonymous:") ? "anonymous local" : env.CONVEX_DEPLOYMENT ? "configured deployment" : "not configured",
  packages: {convexAuth:existsSync("node_modules/@convex-dev/auth/package.json"),authCore:existsSync("node_modules/@auth/core/package.json")},
  backendInspectionSucceeded:backend.status === 0,
  configuredRequiredNames:required.filter(key=>configured.has(key)),
  missingRequiredNames:required.filter(key=>!configured.has(key)),
};
console.log(JSON.stringify(report,null,2));
process.exitCode = backend.status === 0 && report.packages.convexAuth && report.packages.authCore && report.missingRequiredNames.length === 0 ? 0 : 1;
