import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const interactionSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-interaction.js",
  "utf8"
);

assert.match(
  interactionSource,
  /const dragKind = String\(podcastVideoState\.timelineDrag\.kind \|\| ""\)\.trim\(\)\.toLowerCase\(\);/,
  "El pointerup del timeline debe distinguir el kind del drag."
);

assert.match(
  interactionSource,
  /const isOnScreenTextDrag = dragKind === "on-screen-text";/,
  "El pointerup del timeline debe detectar drags de texto en pantalla."
);

assert.match(
  interactionSource,
  /function finalizeLinkedGeminiDrag\(options = \{\}\) \{[\s\S]*if \(PODCAST_SESSION_MANUAL_SAVE_ONLY !== true\) \{[\s\S]*persistSessions\(\);[\s\S]*sessionStore\.markDirty\(/,
  "El cierre de drag Gemini/texto no debe persistir localmente cuando el editor está en modo guardado manual."
);

assert.doesNotMatch(
  interactionSource,
  /void flushCloudAutosaveNow\(\s*String\(getActiveSession\(\)\?\.id \|\| ""\)\.trim\(\),\s*isOnScreenTextDrag\s*\?\s*"timeline-onscreen-text"\s*:\s*"timeline-gemini-audio"\s*\);/,
  "El cierre del drag Gemini/texto ya no debe forzar flush inmediato a Firebase."
);

assert.match(
  interactionSource,
  /upsertPodcastVideoConfig\(\(nextCfg\) => \(\{[\s\S]*geminiDialogueTrack:[\s\S]*\}\), \{ autosave: false, persist: false, recordHistory: false \}\);/,
  "El drag en tiempo real del chip Gemini no debe disparar autosave ni snapshots de historial durante pointermove."
);

assert.match(
  interactionSource,
  /upsertPodcastVideoConfig\(\(cfg\) => \{[\s\S]*\[isText \? "timelineOnScreenTextClipsByRowId" : "timelineClipsByRowId"\]: nextClips[\s\S]*\}, \{ autosave: false, persist: false, recordHistory: false \}\);/m,
  "El drag en tiempo real de escenas y texto no debe persistir ni registrar historial en cada frame."
);

assert.match(
  interactionSource,
  /syncOnScreenTextClipsWithGeminiTrack\(\{ render: false, autosave: false \}\);/,
  "La sincronización texto→Gemini durante el drag debe evitar autosave genérico."
);

console.log("Timeline drag persists locally and avoids immediate cloud flush OK.");
