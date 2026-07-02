import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);

assert.match(version.version, /^1\.0\.10\.\d+$/);
assert.equal(version.cache_version, version.build);
const changelog = Array.isArray(version.changelog) ? version.changelog : [];
const releaseNotes = Array.isArray(version.releaseNotes) ? version.releaseNotes : [];
const notes = [...changelog, ...releaseNotes];
assert.ok(
  String(changelog[0] || "").includes("editor Snoopy")
    && String(changelog[0] || "").includes("metadata/data")
    && String(changelog[0] || "").includes("Stop"),
  "La nota más reciente debe reflejar la restauración de datos de sesión en Podcaster."
);
assert.ok(
  notes.some((note) => String(note || "").includes("raster")
    && String(note || "").includes("frontend")
    && String(note || "").includes("karaoke")),
  "Las release notes deben conservar el fix de raster/frontend/karaoke."
);
assert.ok(
  notes.some((note) => String(note || "").includes("same-origin")),
  "Las release notes deben conservar el fix de same-origin."
);
assert.ok(
  notes.some((note) => String(note || "").includes("job_not_found")),
  "Las release notes deben conservar el fix de retry tolerante para job_not_found."
);

console.log("public version.json bumped OK.");
