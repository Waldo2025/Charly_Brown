import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const server = read("../backend/server.js");
const promptBuilder = read("../backend/dialogue-video-prompt.js");
const generator = read("../public/podcaster/podcaster-video-generator.js");
const playerManager = read("../public/js/video-player-review-manager.js");
const home = read("../public/js/home.js");
const playerHtml = read("../public/video-player.html");
const rules = read("../firestore.rules");
const functionsAiJobs = read("../functions/src/ai-jobs.js");
const functionsVideoPrompt = read("../functions/src/video-prompt.js");

assert.match(
  promptBuilder,
  /const sceneActionPrompt = buildUniquePromptSpec\(\[\s*sanitized\.visualNotes,\s*sanitized\.videoDirective,\s*sanitized\.performanceDirective/s,
  "visualNotes debe ocupar el contrato de acción requerido."
);
assert.match(
  promptBuilder,
  /Required action:[\s\S]*Perform this action clearly while preserving the referenced subject and scene/,
  "La acción debe ser obligatoria incluso con referencia visual."
);
assert.match(
  promptBuilder,
  /const editorialCopies = \[options\?\.inSceneText\]/,
  "Los subtítulos editoriales no deben modificar el prompt de video."
);
assert.match(
  generator,
  /text: omitGeneratedDialogue \? "" : String\(row\?\.voiceOverText \|\| row\?\.text \|\| ""\)\.trim\(\)/,
  "voiceOverText debe quedar fuera del request cuando se excluye el guion o ya hay audio externo."
);
assert.match(
  server,
  /const useSceneReferenceAsInitImage = sceneReferenceImages\.length === 1[\s\S]*!strictIdentity[\s\S]*!hasPortraitAsset/,
  "Una referencia única debe resolverse como image-to-video cuando no compite con un retrato."
);
assert.match(
  functionsVideoPrompt,
  /Required action:[\s\S]*exact visual source and opening frame/,
  "La Function de producción debe conservar el contrato de acción y referencia."
);
assert.match(
  functionsAiJobs,
  /resolveVertexVideoReferences[\s\S]*references\.firstFrame[\s\S]*image: \{ gcsUri: references\.firstFrame\.gcsUri/,
  "veoApi debe enviar la imagen persistida a Vertex como primer fotograma."
);
assert.match(
  server,
  /useSceneReferenceAsInitImage \? \(providerImages\[sceneProviderImageStartIndex\] \|\| null\) : null/,
  "La referencia única debe enviarse realmente como firstFrame a Veo."
);
assert.match(
  server,
  /if \(!excludeScriptFromVideoPrompt && !text && !dialogueAudioStoragePath && !dialogueAudioUrl\)/,
  "Excluir el guion debe permitir generar una escena ambiental sin voz."
);

assert.match(
  playerManager,
  /await controller\.purgeAllMediaCaches\(\);[\s\S]*await refreshCurrentSession\(\);[\s\S]*mediaRefresh[\s\S]*window\.location\.replace/,
  "Actualizar sitio debe purgar medios, rehidratar la sesión y navegar con cache-buster."
);
assert.match(
  home,
  /prewarmDialogueAudioRows\(session, initialDialogueRowIds\)/,
  "video-player debe crear y precargar las voces iniciales antes del primer Play."
);
assert.match(
  home,
  /podcaster-playback-controller\.js\?v=2026-1\.0\.10\.570/,
  "video-player no debe continuar fijado al controlador v536."
);
assert.match(
  playerHtml,
  /cache-version-loader\.js\?v=2026-1\.0\.10\.549/,
  "video-player debe forzar la build vigente."
);
assert.match(
  rules,
  /match \/podcaster_sessions\/\{sessionId\}[\s\S]*match \/audit_events\/\{eventId\}[\s\S]*allow read: if isSignedIn\(\);/,
  "El reporte necesita permiso explícito para la subcolección audit_events."
);

console.log("Veo reference/action and video-player recovery contracts OK.");
