import assert from "node:assert/strict";
import fs from "node:fs";

const modelSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-model.js",
  "utf8"
);
const interactionSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-interaction.js",
  "utf8"
);
const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  interactionSource,
  /if \(drag\.mode === "gemini-segment-move"\)[\s\S]*manualStartMs:\s*true/,
  "Al mover manualmente un clip Gemini debe persistirse manualStartMs:true."
);

assert.match(
  modelSource,
  /manualStartMs:\s*raw\.manualStartMs === true \|\| raw\.manualPosition === true/,
  "La normalizacion modular debe conservar manualStartMs/manualPosition."
);

assert.match(
  podcasterSource,
  /manualStartMs:\s*raw\.manualStartMs === true \|\| raw\.manualPosition === true/,
  "La normalizacion legacy debe conservar manualStartMs/manualPosition."
);

assert.match(
  modelSource,
  /const offsetMs = Math\.round\(Number\(segment\.startMs \|\| 0\) - Number\(clip\.startMs \|\| 0\)\);[\s\S]*manualStartMs:\s*segment\.manualStartMs === true \|\| segment\.manualPosition === true/,
  "El reordenado debe guardar el offset relativo manual entre Gemini y su escena."
);

assert.match(
  modelSource,
  /const targetStartMs = Math\.max\(0, Math\.round\(Number\(clip\.startMs \|\| 0\) \+ Number\(offset\.offsetMs \|\| 0\)\)\);/,
  "El reordenado debe aplicar el offset relativo sobre el nuevo inicio de la escena."
);

assert.match(
  modelSource,
  /manualStartMs:\s*offset\.manualStartMs === true \|\| segment\.manualStartMs === true/,
  "El segmento reordenado debe conservar manualStartMs cuando corresponde."
);

assert.doesNotMatch(
  podcasterSource,
  /syncGeminiDialogueTrackWithRuntime\(\{\s*render:\s*false,\s*preserveStartMs:\s*false,\s*syncTextToScene:\s*true,\s*autosave:\s*false\s*\}\);/,
  "Despues de reordenar no se debe reconciliar Gemini con preserveStartMs:false porque pisa posiciones manuales."
);

assert.match(
  podcasterSource,
  /const hasManualStartMs = segment\?\.manualStartMs === true \|\| segment\?\.manualPosition === true;[\s\S]*const desiredStartMs = sceneStartMs \+ previousRelativeOffsetMs;[\s\S]*manualStartMs:\s*hasManualStartMs/,
  "buildReorderedGeminiDialogueTrack debe conservar el offset manual relativo a la escena."
);

assert.match(
  podcasterSource,
  /const hasExplicitManualStartMs = existingSegment\?\.manualStartMs === true \|\| existingSegment\?\.manualPosition === true;[\s\S]*const relativeOffsetMs = \(preserveStartMs && existingSegment && \(hasManualStartMs \|\| options\?\.isTrimStart\)\)[\s\S]*const desiredStartMs = sceneStartMs \+ relativeOffsetMs;/,
  "La reconciliacion posterior debe conservar el offset relativo para segmentos manualStartMs."
);

console.log("Podcaster Gemini manual position survives reorder OK.");
