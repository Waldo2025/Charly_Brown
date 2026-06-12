import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);

assert.equal(version.version, "1.0.10.89");
assert.equal(version.cache_version, "2026-1.0.10.89");
assert.ok(
  String(version.releaseNotes?.at?.(-1) || "").includes("party karaoke"),
  "La release note debe reflejar el fix de party karaoke."
);

console.log("public version.json bumped OK.");
