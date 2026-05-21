import assert from "node:assert/strict";
import fs from "node:fs";

const htmlSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.html",
  "utf8"
);

const publicSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const timelineUiSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-ui.js",
  "utf8"
);

const playbackControllerSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  htmlSource,
  /id="geminiAudioSpeedModal"/,
  "Debe existir un modal dedicado para ajustar la velocidad de la voz Gemini."
);

assert.match(
  timelineUiSource,
  /data-action="open-gemini-audio-speed-modal"/,
  "Cada chip de audio Gemini guardado debe renderizar un botón para abrir el modal de velocidad."
);

assert.match(
  publicSource,
  /playbackRate:\s*Math\.max\(0\.5,\s*Math\.min\(2\.25,\s*Number\(clip\.playbackRate \|\| 1\) \|\| 1\)\)/,
  "El mapa de audio Gemini debe normalizar y persistir playbackRate por escena."
);

assert.match(
  publicSource,
  /function resolveDialogueAudioPlaybackRate\(session = null, rowId = ""\)/,
  "Debe existir un helper para resolver la velocidad de reproducción de audio Gemini por escena."
);

assert.match(
  publicSource,
  /\[data-action='open-gemini-audio-speed-modal'\]\[data-row-id\]/,
  "El timeline debe reconocer clicks del botón para abrir el modal de velocidad."
);

assert.match(
  playbackControllerSource,
  /const clipPlaybackRate = this\.deps\?\.resolveDialogueAudioPlaybackRate\?\.\(session, rowId\) \|\| 1;/,
  "El playback controller debe consultar la velocidad específica del clip Gemini."
);

assert.match(
  playbackControllerSource,
  /const effectiveRate = this\.clampPlaybackRate\(speed \* clipPlaybackRate\);[\s\S]*audio\.playbackRate = effectiveRate;/,
  "La reproducción Gemini debe aplicar la velocidad específica del clip además de la velocidad global del player."
);

console.log("Podcaster Gemini audio speed modal OK.");
