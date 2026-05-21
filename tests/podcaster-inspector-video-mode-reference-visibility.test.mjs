import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const editorSource = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");

test("inspector row uses podcast reference sections only outside pure video mode", () => {
  assert.match(editorSource, /const isVideo = panelCopy\.videoMode === true;/m);
  assert.match(editorSource, /const podcastReferenceSections = !isVideo\s*\?\s*buildPodcastReferenceSectionsMarkup\(session,\s*speaker\)\s*:\s*"";/m);
  assert.match(editorSource, /\$\{podcastReferenceSections\}\s*\$\{buildScriptRowEditorMarkup\(session,\s*row,\s*safeIndex\)\}/m);
});
