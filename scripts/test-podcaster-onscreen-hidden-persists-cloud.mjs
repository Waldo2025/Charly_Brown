import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

const match = source.match(/function setOnScreenTextClipHidden\(rowId = "", hidden = false, options = \{\}\) \{([\s\S]*?)\n\}/m);
assert.ok(match, "No se encontró setOnScreenTextClipHidden.");
const body = match[1];

assert.match(
  body,
  /void persistReorderedTimelinePatchToCloud\(refreshed, \{[\s\S]*timelineClipsByRowId:\s*ensureTimelineClipsByRowId\(refreshed,\s*\{\s*persist:\s*false\s*\}\),[\s\S]*geminiDialogueTrack:\s*getPodcastVideoConfig\(refreshed\)\?\.geminiDialogueTrack \|\| \{\},[\s\S]*timelineOnScreenTextClipsByRowId:\s*ensureOnScreenTextClipsByRowId\(refreshed,\s*\{\s*persist:\s*false\s*\}\),[\s\S]*timelineOnScreenTextLayoutByRowId:\s*normalizeOnScreenTextLayoutByRowId\(/m,
  "Ocultar/mostrar texto en pantalla debe persistir el patch parcial en Firebase."
);

assert.match(
  body,
  /scheduleSessionLocalPersist\("timeline-onscreen-text"\);/,
  "El autosave local debe seguir existiendo además del patch cloud."
);

console.log("Podcaster onscreen hidden persists cloud OK.");
