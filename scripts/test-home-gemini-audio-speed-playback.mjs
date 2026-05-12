import assert from "node:assert/strict";
import fs from "node:fs";

const homeSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  homeSource,
  /function resolveDialogueAudioPlaybackRate\(session = null, rowId = ""\)/,
  "home.js debe resolver la velocidad de reproducción Gemini por escena."
);

assert.match(
  homeSource,
  /const clipPlaybackRate = resolveDialogueAudioPlaybackRate\(s, rowId\);[\s\S]*audioDurationMs:\s*Math\.round\(\(Number\(audioClip\?\.durationSec \|\| 0\) \* 1000\) \/ clipPlaybackRate\)/,
  "El timeline del dashboard debe usar la duración efectiva del audio Gemini ajustada por playbackRate."
);

assert.match(
  homeSource,
  /resolveDialogueAudioPlaybackRate:\s*\(s,\s*rowId\)\s*=>\s*resolveDialogueAudioPlaybackRate\(s,\s*rowId\)/,
  "El dashboard debe pasar resolveDialogueAudioPlaybackRate al PodcasterPlaybackController."
);

console.log("Home Gemini audio speed playback OK.");
