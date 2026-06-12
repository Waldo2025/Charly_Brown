import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);

assert.equal(version.version, "1.0.10.86");
assert.equal(version.cache_version, "2026-1.0.10.86");
assert.ok(
  String(version.releaseNotes?.at?.(-1) || "").includes("404 en Render"),
  "La release note debe reflejar el fix del polling de montage export."
);

console.log("public version.json bumped OK.");
