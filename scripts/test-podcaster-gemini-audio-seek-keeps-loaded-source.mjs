import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

assert.match(
  source,
  /collectDialogueRowIds\(session = null, entries = \[\], segments = \[\]\)/,
  "Playback controller should compute valid Gemini rows from session rows, runtime entries, and dialogue track segments."
);

assert.match(
  source,
  /const currentTimelineRowIds = this\.collectDialogueRowIds\(session, entries, segments\);/,
  "syncAudio cleanup must use the full session/track row set, not only the currently rebuilt runtime entries."
);

const syncAudioBody = source.slice(
  source.indexOf("async syncAudio(currentMs, speed)"),
  source.indexOf("async syncBackgroundMusic(currentMs, speed")
);

assert.match(
  syncAudioBody,
  /if \(currentTimelineRowIds\.has\(rowId\)\) return;/,
  "Existing Gemini audio elements should be preserved while their row still exists."
);

assert.doesNotMatch(
  syncAudioBody,
  /new Set\(entries\.map\(\(entry\) => String\(entry\?\.rowId/,
  "syncAudio must not consider a row removed just because a transient runtime rebuild omitted it during manual seek."
);

console.log("Gemini audio seek preservation regression checks passed.");
