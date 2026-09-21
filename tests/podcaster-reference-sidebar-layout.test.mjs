import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/podcaster/podcaster-reference-editor.css", import.meta.url), "utf8");

test("reference editor sidebar floats against the right viewport edge", () => {
  assert.match(
    css,
    /\.snoopy-reference-sidebar\s*\{[^}]*position:\s*fixed;[^}]*right:\s*16px;[^}]*bottom:\s*16px;[^}]*width:\s*340px;/m
  );
  assert.match(
    css,
    /\.has-reference-editor:is\([^)]*data-reference-mode="general"[^)]*\)\s*\{\s*padding:\s*16px 380px 16px 16px;/m
  );
});

test("reference editor sidebar returns to the document flow on mobile", () => {
  assert.match(
    css,
    /@media \(max-width:\s*760px\)[\s\S]*?\.snoopy-reference-sidebar\s*\{[^}]*position:\s*relative;[^}]*inset:\s*auto;[^}]*width:\s*100%;/m
  );
});
