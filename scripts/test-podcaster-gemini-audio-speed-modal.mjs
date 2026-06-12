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
const timelineInteractionSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-interaction.js",
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
  /playbackRate:\s*Math\.max\(0\.5,\s*Math\.min\(10,\s*Number\(clip\.playbackRate \|\| 1\) \|\| 1\)\)/,
  "El mapa de audio Gemini debe normalizar y persistir playbackRate por escena."
);

assert.match(
  publicSource,
  /function resolveDialogueAudioPlaybackRate\(session = null, rowId = ""\)/,
  "Debe existir un helper para resolver la velocidad de reproducción de audio Gemini por escena."
);

assert.match(
  publicSource,
  /async function applyGeminiAudioSpeedModal\(options = \{\}\)/,
  "El modal de velocidad Gemini debe aplicar y persistir cambios de forma asíncrona."
);

assert.match(
  timelineInteractionSource,
  /\[data-action='open-gemini-audio-speed-modal'\]\[data-row-id\]/,
  "El timeline debe reconocer clicks del botón para abrir el modal de velocidad."
);

assert.match(
  timelineInteractionSource,
  /const openGeminiAudioSpeedBtn = event\.target\?\.closest\?\.\("\[data-action='open-gemini-audio-speed-modal'\]\[data-row-id\]"\);[\s\S]*setGeminiAudioSpeedModalOpen\(rowId\);[\s\S]*const geminiChip = event\.target\?\.closest\?\.\("\[data-action='timeline-select-gemini-audio'\]\[data-row-id\]"\);/m,
  "El click del botón de velocidad debe procesarse antes que la selección del chip Gemini para no bloquear la apertura del modal."
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

assert.match(
  publicSource,
  /flushSessionLocalPersistNow\(String\(getActiveSession\(\)\?\.id \|\| ""\)\.trim\(\),\s*"gemini-audio-speed"\);/,
  "Guardar la velocidad Gemini debe forzar persistencia local inmediata usando el sessionId correcto para sobrevivir a un reload."
);

assert.match(
  publicSource,
  /await saveSessionToCloud\(String\(getActiveSession\(\)\?\.id \|\| ""\)\.trim\(\), \{ render: false, silent: true \}\);/,
  "Guardar la velocidad Gemini debe sincronizar explícitamente la sesión en Firebase además de la caché local."
);

console.log("Podcaster Gemini audio speed modal OK.");
