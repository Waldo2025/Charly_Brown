import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /const useTimelineAudio = timelineAudioSegments\.length > 0 && audioTimelineRaw\?\.enabled !== false;/,
  "El backend debe activar la mezcla de audio cuando existen segmentos, aunque el flag enabled falte."
);

console.log("Podcaster montage export audio timeline fallback OK.");
