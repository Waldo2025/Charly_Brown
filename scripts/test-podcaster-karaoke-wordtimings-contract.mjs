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

test("frontend dialogue audio normalization preserves wordTimings", () => {
  assert.match(podcasterSource, /wordTimings:\s*normalizeKaraokeWordTimings\(clip,\s*String\(clip\.targetSpeechLine \|\| ""\)\.trim\(\)\)/);
});

test("podcaster css defines karaoke word and active word states", () => {
  assert.match(cssSource, /\.podcast-karaoke-word\s*\{/);
  assert.match(cssSource, /\.podcast-karaoke-word\.is-active\s*\{/);
  assert.match(cssSource, /\.podcast-karaoke-word\.is-active\s*\{[\s\S]*?color:\s*#facc15;/i);
  assert.match(textRenderSource, /\.podcast-karaoke-word\.is-active\s*\{[\s\S]*?color:\s*#facc15;/i);
  assert.match(textRenderSource, /<tspan fill="#FACC15" filter="url\(#pod-karaoke-active\)">/);
  assert.match(homeSource, /\.podcast-karaoke-word\.is-active\s*\{[\s\S]*?color:\s*#facc15;/i);
});
