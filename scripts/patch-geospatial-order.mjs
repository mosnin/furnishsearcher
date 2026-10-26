import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const base = dirname(require.resolve("@convex-dev/geospatial/package.json"));
const legacy = dirname(require.resolve("geospatial-legacy/package.json"));
assert.notEqual(base, legacy);
assert.equal(
  JSON.parse(readFileSync(join(base, "package.json"), "utf8")).version,
  "0.2.1",
);
const guards = {
  "src/component/lib/tupleKey.ts": {
    original:
      "18f0047403392b3e2979cd1eabc818f0937c13b29370283e4c42ea73650b095d",
    patched: "5d3399bdae4abf6a3dd653e33fbc9d8a255d83128e8e115978fb4e030ea93032",
  },
  "dist/component/lib/tupleKey.js": {
    original:
      "f2d9296de25d1c47085ca58d317e7e2d7582c8b66c0239e44425c68016dbe38d",
    patched: "e11bf273de1366d2a2eb7af85ffc02e577388d19844054e6a7ef6a82221423f3",
  },
};
const hash = (text) => createHash("sha256").update(text).digest("hex");
for (const [relative, expected] of Object.entries(guards)) {
  assert.equal(
    hash(readFileSync(join(legacy, relative), "utf8")),
    expected.original,
    "Legacy component must remain byte-for-byte unchanged",
  );
  const path = join(base, relative),
    source = readFileSync(path, "utf8");
  if (hash(source) === expected.patched) continue;
  assert.equal(
    hash(source),
    expected.original,
    "Review upstream changes before applying the geospatial ordering fix",
  );
  const patched = source.replaceAll(
    "const littleEndian = true;",
    "const littleEndian = false;",
  );
  assert.equal(hash(patched), expected.patched);
  // Replace the inode, avoiding mutation of a package-manager hardlink/cache.
  const temporary = path + ".furnishsearcher-patch";
  writeFileSync(temporary, patched);
  renameSync(temporary, path);
}
console.log(
  "Pinned geospatial v2 numeric ordering fixed; legacy component unchanged.",
);
