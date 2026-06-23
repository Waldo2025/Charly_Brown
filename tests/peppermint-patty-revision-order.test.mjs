import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");

test("new editorial cards append to the end of the session revision list", () => {
  assert.match(
    source,
    /function handleCreateRevision\(\) \{[\s\S]*?draft\.revisions\.push\(draftRevision\);[\s\S]*?state\.activeRevisionId = String\(nextSession\.revisions\?\.\[nextSession\.revisions\.length - 1\]\?\.id \|\| ""\)\.trim\(\);/m
  );
  assert.doesNotMatch(
    source,
    /function handleCreateRevision\(\) \{[\s\S]*?draft\.revisions\.unshift\(draftRevision\);/m
  );
});

test("persisted revision upsert appends newly created revisions instead of prepending them", () => {
  assert.match(
    source,
    /if \(!revision\) \{[\s\S]*?revision = \{[\s\S]*?\};[\s\S]*?draft\.revisions\.push\(revision\);[\s\S]*?\} else \{/m
  );
  assert.doesNotMatch(
    source,
    /if \(!revision\) \{[\s\S]*?draft\.revisions\.unshift\(revision\);[\s\S]*?\} else \{/m
  );
});
