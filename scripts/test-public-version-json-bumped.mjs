import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);

assert.equal(version.version, "1.0.10.94");
assert.equal(version.cache_version, "2026-1.0.10.94");
assert.ok(
  String(version.releaseNotes?.[0] || "").includes("playbackRate"),
  "La release note más reciente debe reflejar el fix de audios Gemini."
);

console.log("public version.json bumped OK.");
