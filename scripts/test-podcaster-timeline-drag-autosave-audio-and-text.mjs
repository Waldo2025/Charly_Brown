import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /const dragKind = String\(podcastVideoState\.timelineDrag\.kind \|\| ""\)\.trim\(\)\.toLowerCase\(\);/,
  "El pointerup del timeline debe distinguir el kind del drag."
);

assert.match(
  source,
  /const isOnScreenTextDrag = dragKind === "on-screen-text";/,
  "El pointerup del timeline debe detectar drags de texto en pantalla."
);

assert.match(
  source,
  /function finalizeLinkedGeminiTimelineDrag\(options = \{\}\) \{[\s\S]*scheduleCloudAutosave\(\s*isOnScreenTextDrag\s*\?\s*"timeline-onscreen-text"\s*:\s*"timeline-gemini-audio"\s*\);[\s\S]*\}/,
  "El cierre de drag Gemini/texto debe persistir una sola vez desde un helper común."
);

assert.match(
  source,
  /void flushCloudAutosaveNow\(\s*String\(getActiveSession\(\)\?\.id \|\| ""\)\.trim\(\),\s*isOnScreenTextDrag\s*\?\s*"timeline-onscreen-text"\s*:\s*"timeline-gemini-audio"\s*\);/,
  "El cierre del drag Gemini/texto debe forzar flush inmediato a Firebase para no perder offsets al recargar."
);

assert.match(
  source,
  /upsertPodcastVideoConfig\(\(nextCfg\) => \(\{[\s\S]*geminiDialogueTrack:[\s\S]*\}\), \{ autosave: false \}\);/,
  "El drag en tiempo real del chip Gemini no debe disparar autosave genérico durante pointermove."
);

assert.match(
  source,
  /syncOnScreenTextClipsWithGeminiTrack\(\{ render: false, autosave: false \}\);/,
  "La sincronización texto→Gemini durante el drag debe evitar autosave genérico."
);

console.log("Timeline drag autosave audio and text OK.");
