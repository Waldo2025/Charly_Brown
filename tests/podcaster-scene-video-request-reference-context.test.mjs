import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

assert.match(
  source,
  /const promptProfile = String\(options\.promptProfile \|\| ""\)\.trim\(\);/,
  "generateDialogueVideoForRow debe resolver promptProfile desde options."
);

assert.match(
  source,
  /promptProfile,\s*sessionId,/m,
  "El body de generateDialogueVideoForRow debe propagar promptProfile al backend."
);

assert.match(
  source,
  /const visualNotes = String\([\s\S]*resolveVisualNotesForGeneration\(row\)[\s\S]*\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\);/m,
  "generateDialogueVideoForRow debe reconstruir visualNotes desde la escena."
);

assert.match(
  source,
  /visualNotes,\s*videoDirective,/m,
  "El body de generateDialogueVideoForRow debe enviar visualNotes al backend."
);

assert.match(
  source,
  /promptProfile: options\.promptProfile \|\| "",[\s\S]*regenerate:/m,
  "runSceneVideoGenerationFlow debe reenviar promptProfile a generateDialogueVideoForRow."
);
