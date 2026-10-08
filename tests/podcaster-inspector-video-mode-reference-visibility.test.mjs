import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const editorSource = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");

function readFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.ok(start > -1, `${functionName} debe existir en el editor del inspector.`);
  const end = source.indexOf("\n}", start);
  assert.ok(end > start, `${functionName} debe cerrar su cuerpo.`);
  return source.slice(start, end);
}

test("inspector row uses podcast reference sections only outside pure video mode", () => {
  const referenceBody = readFunctionBody(editorSource, "buildInspectorReferenceRowMarkup");
  assert.match(referenceBody, /const isVideo = panelCopy\.videoMode === true;/m);
  assert.match(
    referenceBody,
    /const podcastReferenceSections = !isVideo\s*\?\s*buildPodcastReferenceSectionsMarkup\(session,\s*speaker\)\s*:\s*"";/m
  );
  assert.match(referenceBody, /\$\{podcastReferenceSections\}/m);
});

test("inspector panel split keeps references out of the guion card", () => {
  const scriptBody = readFunctionBody(editorSource, "buildInspectorScriptRowMarkup");
  assert.doesNotMatch(scriptBody, /inspector-row-reference/);
  assert.doesNotMatch(scriptBody, /podcastReferenceSections/);
  assert.doesNotMatch(scriptBody, /row-actions-inspector/);
  assert.match(scriptBody, /\$\{buildScriptRowEditorMarkup\(session,\s*row,\s*safeIndex\)\}/m);
});
