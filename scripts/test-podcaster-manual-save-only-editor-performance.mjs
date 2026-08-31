import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

const editorSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-script-editor.js",
  "utf8"
);

assert.match(
  source,
  /const PODCAST_SESSION_MANUAL_SAVE_ONLY = true;/,
  "El editor debe declarar explícitamente el modo de guardado manual."
);

assert.match(
  source,
  /function scheduleSessionLocalPersist\(reason = ""\) \{[\s\S]*persistSessions\(\);[\s\S]*sessionStore\.markDirty\(/m,
  "El autosave local diferido debe persistir localStorage y marcar dirty sin guardar automáticamente en Firebase."
);

assert.match(
  source,
  /function upsertSessionById\(sessionId, mutator, options = \{\}\) \{[\s\S]*const shouldPersist = options\.persist === true[\s\S]*PODCAST_SESSION_MANUAL_SAVE_ONLY !== true;/m,
  "Las mutaciones de sesión no deben persistir localmente por defecto cuando el editor está en modo manual."
);

assert.match(
  source,
  /function upsertActiveSession\(mutator, options = \{\}\) \{[\s\S]*if \(options\.recordHistory !== false\) \{[\s\S]*(?:podcasterHistoryApi\.recordHistory|recordPodcastHistory)\(/m,
  "Las mutaciones deben poder saltarse el historial cuando son actualizaciones en tiempo real."
);

const scriptFieldHandlerMatch = editorSource.match(
  /function handleScriptFieldUpdate\(event\) \{([\s\S]*?)\n\}\n\n\/\/ --- Module Exports/m
);

assert.ok(scriptFieldHandlerMatch, "Debe existir el handler principal de edición de campos de escenas.");

assert.match(
  scriptFieldHandlerMatch[1],
  /const baseSessionUpdateOptions = \{[\s\S]*persist: false,[\s\S]*recordHistory: !isLiveInput,[\s\S]*autosaveReason: sessionUpdateReason,[\s\S]*lightweight: true,[\s\S]*syncThread: false,[\s\S]*invalidateRuntimeCache: !isLiveInput,[\s\S]*touchUpdatedAt: !isLiveInput[\s\S]*\};/m,
  "Editar campos de escena debe mutar solo memoria y dejar el historial para cambios confirmados."
);

assert.match(
  source,
  /function upsertSessionById\(sessionId, mutator, options = \{\}\) \{[\s\S]*const lightweight = options\.lightweight === true;[\s\S]*const mutableSession = lightweight[\s\S]*rows: Array\.isArray\(current\.script\?\.rows\) \? current\.script\.rows : normalizeRows\(current\.script\?\.rows\)[\s\S]*if \(options\.invalidateRuntimeCache !== false\)/m,
  "La ruta ligera del inspector no debe normalizar todo el documento ni invalidar caches por cada tecla."
);

assert.match(
  scriptFieldHandlerMatch[1],
  /if \(window\.isCreativeVideoMode\(session\)[\s\S]*window\.upsertActiveSession\([\s\S]*\{ \.\.\.baseSessionUpdateOptions, render: false \}\);/m,
  "Confirmar un campo del inspector no debe reconstruir toda la aplicación."
);

assert.doesNotMatch(
  scriptFieldHandlerMatch[1],
  /const shouldRender = !isLiveInput && !isToggleField;/,
  "Los campos creativos no deben activar un render global al perder el foco."
);

assert.match(
  source,
  /if \(window\.PodcasterThreads && options\.syncThread !== false/,
  "La edición en vivo debe poder omitir el clonado completo del thread hasta confirmar el campo."
);

assert.doesNotMatch(
  scriptFieldHandlerMatch[1],
  /if \(isLiveInput\) \{\s*[^}]*scheduleSessionLocalPersist\(/,
  "La edición por tecla no debe programar persistencia local en cada input."
);

assert.match(
  scriptFieldHandlerMatch[1],
  /const scheduleConfirmedLocalPersist = \(\) => \{[\s\S]*if \(isLiveInput\) return;[\s\S]*window\.scheduleSessionLocalPersist\(sessionUpdateReason\);[\s\S]*\};/m,
  "La edición confirmada de campos de escena debe persistir localmente para sobrevivir reloads."
);

assert.match(
  source,
  /const handleCreativeField = \(event\) => \{[\s\S]*const isLiveInput = String\(event\?\.type \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "input";[\s\S]*persist: false,[\s\S]*recordHistory: !isLiveInput,[\s\S]*if \(!isLiveInput\) \{\n\s+renderCreativeVideoShell\(getActiveSession\(\)\);\n\s+scheduleSessionLocalPersist\(field === "durationSec" \? "structure" : "script-edit"\);[\s\S]*\}/m,
  "El inspector creativo debe evitar reconstruir por tecla y persistir localmente al confirmar cambios."
);

console.log("Podcaster manual-save-only editor performance OK.");
