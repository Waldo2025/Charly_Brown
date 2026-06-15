import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);

assert.equal(version.version, "1.0.10.97");
assert.equal(version.cache_version, "2026-1.0.10.97");
assert.ok(
  String(version.releaseNotes?.[0] || "").includes("job_not_found"),
  "La release note más reciente debe reflejar el retry tolerante del export de montage."
);

console.log("public version.json bumped OK.");
