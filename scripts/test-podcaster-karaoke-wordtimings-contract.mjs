import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const textRenderSource = readFileSync(new URL("../public/podcaster/podcaster-text-render.js", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../public/home.html", import.meta.url), "utf8");

test("backend persists wordTimings inside dialogueAudioMap normalization", () => {
  assert.match(serverSource, /wordTimings:\s*normalizeDialogueAudioWordTimings\(clip\?\.wordTimings \|\| clip\?\.alignment \|\| \[\]\)/);
});

test("backend export request preserves dialogueAudioMap for karaoke ASS rendering", () => {
  assert.match(
    serverSource,
    /function normalizeMontageExportRequestBody\(body = \{\}\)[\s\S]*?const dialogueAudioMapRaw = raw\?\.dialogueAudioMap && typeof raw\.dialogueAudioMap === "object"/,
    "El normalizador del request de export debe leer raw.dialogueAudioMap."
  );
  assert.match(
    serverSource,
    /const normalizeExportDialogueAudioMap = \(sourceMap = \{\}\) => \{[\s\S]*?wordTimings = normalizeDialogueAudioWordTimings\(/,
    "El request de export debe normalizar wordTimings para karaoke."
  );
  assert.match(
    serverSource,
    /const dialogueAudioMap = normalizeExportDialogueAudioMap\(dialogueAudioMapRaw\);[\s\S]*?return \{[\s\S]*?dialogueAudioMap,/,
    "El input normalizado del export debe devolver dialogueAudioMap al render por escena."
  );
  assert.match(
    serverSource,
    /function resolveMontageKaraokeAudioClip\(input = \{\}, rowId = ""\)[\s\S]*?input\.dialogueAudioMap\?\.\[key\]/,
    "El render ASS por escena debe consumir el dialogueAudioMap normalizado."
  );
});

test("frontend dialogue audio normalization preserves wordTimings", () => {
  assert.match(podcasterSource, /wordTimings:\s*normalizeKaraokeWordTimings\(clip,\s*String\(clip\.targetSpeechLine \|\| ""\)\.trim\(\)\)/);
});

test("montage export resolves dialogue audio clips through the same row resolver used by preview", () => {
  assert.match(
    podcasterSource + textRenderSource,
    /resolveDialogueAudioForRow/
  );
  assert.match(
    readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8"),
    /function buildMontageExportDialogueAudioMap\(activeSession = null, rowIds = \[\]\)/,
    "El export debe reconstruir dialogueAudioMap por rowId usando el resolver compartido."
  );
  assert.match(
    readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8"),
    /const clip = \(resolveDialogueAudio \? resolveDialogueAudio\(activeSession, rowId\) : null\) \|\| baseMap\?\.\[rowId\] \|\| null;/,
    "El export no debe depender solo del dialogueAudioMap crudo cuando existe fallback Gemini por fila."
  );
});

test("podcaster css defines karaoke word and active word states", () => {
  assert.match(cssSource, /\.podcast-karaoke-word\s*\{/);
  assert.match(cssSource, /\.podcast-karaoke-word\.is-active\s*\{/);
  assert.match(cssSource, /\.podcast-karaoke-word\.is-active\s*\{[\s\S]*?color:\s*#facc15;/i);
  assert.match(textRenderSource, /\.podcast-karaoke-word\.is-active\s*\{[\s\S]*?color:\s*#facc15;/i);
  assert.match(textRenderSource, /<tspan fill="#FACC15" filter="url\(#pod-karaoke-active\)">/);
  assert.match(homeSource, /\.podcast-karaoke-word\.is-active\s*\{[\s\S]*?color:\s*#facc15;/i);
});
