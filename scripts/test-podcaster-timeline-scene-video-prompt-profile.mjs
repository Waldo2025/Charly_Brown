import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

assert.match(
  generatorSource,
  /const PODCASTER_VIDEO_PROMPT_PROFILE = "podcaster_video_v2";/,
  "La generación individual, masiva y HQ debe compartir podcaster_video_v2."
);
assert.doesNotMatch(
  `${generatorSource}\n${shellSource}`,
  /timeline-scene-video/,
  "No debe quedar un perfil divergente timeline-scene-video."
);

assert.match(
  generatorSource,
  /const promptProfile = PODCASTER_VIDEO_PROMPT_PROFILE;/,
  "generateDialogueVideoForRow debe fijar el prompt canónico."
);
assert.match(
  generatorSource,
  /const body = \{\s*promptProfile,\s*generator:/m,
  "El request al backend debe incluir promptProfile y el generador solicitado."
);
assert.match(
  generatorSource,
  /sceneDescription,\s*strictIdentity,[\s\S]*visualNotes,\s*videoDirective,\s*scenePrompt,\s*imagePrompts,/m,
  "La solicitud debe propagar los campos visuales ya sanitizados."
);

const handlerProfileUses = generatorSource.match(/promptProfile:\s*PODCASTER_VIDEO_PROMPT_PROFILE/g) || [];
assert.ok(
  handlerProfileUses.length >= 4,
  "Las rutas individual, masiva, HQ y corrección deben reutilizar podcaster_video_v2."
);

assert.match(
  generatorSource,
  /\[data-action='timeline-generate-scene-video'\][\s\S]*promptProfile:\s*PODCASTER_VIDEO_PROMPT_PROFILE/,
  "La generación individual del timeline debe usar el perfil canónico."
);
assert.match(
  generatorSource,
  /\[data-action='timeline-regenerate-scene-video-hq'\][\s\S]*promptProfile:\s*PODCASTER_VIDEO_PROMPT_PROFILE/,
  "La regeneración HQ debe usar el mismo perfil canónico."
);

console.log("Podcaster video prompt profile v2 parity OK.");
