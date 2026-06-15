import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);

assert.equal(version.version, "1.0.10.108");
assert.equal(version.cache_version, "2026-1.0.10.108");
assert.ok(
  String(version.releaseNotes?.[0] || "").includes("same-origin"),
  "La release note más reciente debe reflejar el cambio a API same-origin."
);
assert.ok(
  version.releaseNotes?.some((note) => String(note || "").includes("job_not_found")),
  "Las release notes deben conservar el fix de retry tolerante para job_not_found."
);

console.log("public version.json bumped OK.");
