import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("the scene editor exposes and persists the per-scene no-script checkbox", async () => {
  const [editor, podcaster, server] = await Promise.all([
    source("public/podcaster/podcaster-script-editor.js"),
    source("public/podcaster/podcaster.js"),
    source("backend/server.js")
  ]);

  assert.match(editor, /row-field-inline-actions[\s\S]*data-field="excludeScriptFromVideoPrompt"/);
  assert.match(editor, /field === "excludeScriptFromVideoPrompt"/);
  assert.match(podcaster, /excludeScriptFromVideoPrompt: row\?\.excludeScriptFromVideoPrompt === true/);
  assert.match(server, /nextRow\.excludeScriptFromVideoPrompt = row\?\.excludeScriptFromVideoPrompt === true/);
});

test("all shared video generation paths omit the script and declare ambient-only dialogue", async () => {
  const [generator, server, prompt] = await Promise.all([
    source("public/podcaster/podcaster-video-generator.js"),
    source("backend/server.js"),
    source("backend/dialogue-video-prompt.js")
  ]);

  assert.match(generator, /const excludeScriptFromVideoPrompt = row\?\.excludeScriptFromVideoPrompt === true/);
  assert.match(generator, /text: omitGeneratedDialogue \? "" : String\(row\?\.voiceOverText \|\| row\?\.text \|\| ""\)\.trim\(\)/);
  assert.match(generator, /excludeScriptFromVideoPrompt\s*\? "ambient_only"/);
  assert.match(server, /const originalText = excludeScriptFromVideoPrompt \? ""/);
  assert.match(server, /const targetSpeechLine = excludeScriptFromVideoPrompt[\s\S]*\? ""/);
  assert.match(prompt, /The subject remains silent with a closed, relaxed mouth and does not perform speech/);
});
