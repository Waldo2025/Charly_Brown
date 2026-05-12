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
  /if \(isOnScreenTextDrag\) \{[\s\S]*scheduleCloudAutosave\("timeline-onscreen-text"\);[\s\S]*return;/,
  "El drag del texto en pantalla debe persistirse al soltar sin pasar por la sincronización de Gemini."
);

assert.match(
  source,
  /if \(dragMode === "gemini-segment-move"\) \{[\s\S]*scheduleCloudAutosave\("timeline-gemini-audio"\);[\s\S]*\}/,
  "El drag del chip de audio Gemini debe agendar autosave al soltar."
);

console.log("Timeline drag autosave audio and text OK.");
