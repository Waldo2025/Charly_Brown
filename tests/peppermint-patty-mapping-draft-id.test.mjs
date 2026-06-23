import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");

test("empty mapping drafts preserve blank ids instead of receiving fallback persisted ids", () => {
  assert.match(
    source,
    /const hasExplicitId = Object\.prototype\.hasOwnProperty\.call\(source,\s*"id"\);/m
  );
  assert.match(
    source,
    /const resolvedId = hasExplicitId \? explicitId : fallbackId;/m
  );
  assert.match(
    source,
    /id:\s*resolvedId,/m
  );
  assert.doesNotMatch(
    source,
    /id:\s*String\(source\.id \|\| `mapping_\$\{index \+ 1\}`\)\.trim\(\)\s*\|\|\s*`mapping_\$\{index \+ 1\}`/m
  );
});

test("new mapping drafts start with an empty id so save creates a new template", () => {
  assert.match(
    source,
    /function createEmptyMappingDraft\(\) \{[\s\S]*?id:\s*"",[\s\S]*?mappingSlug:\s*"",/m
  );
});
