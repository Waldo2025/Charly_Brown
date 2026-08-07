import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

assert.match(
  source,
  /const PODCASTER_VIDEO_PROMPT_PROFILE = "podcaster_video_v2";/,
  "El módulo debe declarar un único prompt canónico."
);

assert.match(
  source,
  /const promptProfile = PODCASTER_VIDEO_PROMPT_PROFILE;[\s\S]*const body = \{\s*promptProfile,\s*generator:/m,
  "generateDialogueVideoForRow debe enviar siempre podcaster_video_v2 y el routing explícito."
);

assert.match(
  source,
  /const rawVisualNotes = String\([\s\S]*resolveVisualNotesForGeneration\(row\)[\s\S]*\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\);[\s\S]*const visualNotes = String\(promptFieldSanitization\.sanitized\.visualNotes \|\| ""\)\.trim\(\);/m,
  "generateDialogueVideoForRow debe reconstruir visualNotes desde la escena."
);

assert.match(
  source,
  /visualNotes,\s*videoDirective,/m,
  "El body de generateDialogueVideoForRow debe enviar visualNotes al backend."
);

assert.match(
  source,
  /promptProfile:\s*PODCASTER_VIDEO_PROMPT_PROFILE,[\s\S]*regenerate:/m,
  "runSceneVideoGenerationFlow debe reenviar el perfil canónico a generateDialogueVideoForRow."
);

assert.match(
  source,
  /const body = \{[\s\S]*quality:\s*routing\.quality,[\s\S]*textPolicy,[\s\S]*aspectRatio,[\s\S]*inSceneText,[\s\S]*dialogueAudioUrl,[\s\S]*dialogueAudioStoragePath,[\s\S]*previousInteractionId,/m,
  "El request v2 debe incluir calidad, política de texto, aspecto, audio canónico y edición Omni."
);

assert.match(
  source,
  /text:\s*omitGeneratedDialogue \? "" : String\(row\?\.voiceOverText \|\| row\?\.text \|\| ""\)\.trim\(\)/,
  "Si existe audio externo o se excluye el guion, la voz en off no debe enviarse al generador visual."
);

assert.match(
  source,
  /const finalClip = \{[\s\S]*generator:[\s\S]*textPolicy:[\s\S]*aspectRatio:[\s\S]*durationSeconds:[\s\S]*resolution:[\s\S]*interactionId:[\s\S]*promptHash:[\s\S]*removedTextDirectives:[\s\S]*promptVersion:/m,
  "El resultado debe conservar metadatos efectivos del proveedor y del prompt."
);
