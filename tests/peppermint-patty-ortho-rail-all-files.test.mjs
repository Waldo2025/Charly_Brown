import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-results.js", import.meta.url), "utf8");

test("renderable session keeps all file results available for the grouped ortho rail", () => {
  assert.match(appSource, /const fallbackFileResults = \(Array\.isArray\(session\?\.revisions\) \? session\.revisions : \[\]\)\.flatMap/);
  assert.match(appSource, /const fileResults = fallbackFileResults\.length \? fallbackFileResults : activeFileResult;/);
  assert.match(resultsSource, /const fileEntries = Array\.isArray\(session\.fileResults\) && session\.fileResults\.length \? session\.fileResults : \[session\];/);
  assert.match(resultsSource, /reportEntries\.length \? renderGroupedRightRail\(reportEntries\) : renderRightRail\(\[\]\)/);
});
