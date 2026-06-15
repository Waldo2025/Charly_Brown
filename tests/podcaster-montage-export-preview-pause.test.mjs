import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

test("montage export preview pause preserves the last visible frame", () => {
  assert.match(source, /const currentDataUrl = String\(window\.montageExportPreviewState\.dataUrl \|\| ""\)\.trim\(\);/);
  assert.match(source, /const currentMediaType = String\(window\.montageExportPreviewState\.mediaType \|\| ""\)\.trim\(\);/);
  assert.match(source, /Se conserva el último frame visible\./);
});
