import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /const PODCAST_SESSION_MANUAL_SAVE_ONLY = true;/,
  "El editor debe declarar explícitamente el modo de guardado manual."
);

assert.match(
  source,
  /function scheduleSessionLocalPersist\(reason = ""\) \{\n\s+if \(PODCAST_SESSION_MANUAL_SAVE_ONLY === true\) return;/,
  "El autosave local diferido debe desactivarse en modo guardado manual."
);

assert.match(
  source,
  /function upsertSessionById\(sessionId, mutator, options = \{\}\) \{[\s\S]*const shouldPersist = options\.persist === true[\s\S]*PODCAST_SESSION_MANUAL_SAVE_ONLY !== true;/m,
  "Las mutaciones de sesión no deben persistir localmente por defecto cuando el editor está en modo manual."
);

assert.match(
  source,
  /function upsertActiveSession\(mutator, options = \{\}\) \{[\s\S]*if \(options\.recordHistory !== false\) \{[\s\S]*recordPodcastHistory\(/m,
  "Las mutaciones deben poder saltarse el historial cuando son actualizaciones en tiempo real."
);

const scriptFieldHandlerMatch = source.match(
  /function handleScriptFieldUpdate\(event\) \{([\s\S]*?)\n\}\n\nfunction shouldHandleScriptFieldOnInput/m
);

assert.ok(scriptFieldHandlerMatch, "Debe existir el handler principal de edición de campos de escenas.");

assert.match(
  scriptFieldHandlerMatch[1],
  /const baseSessionUpdateOptions = \{[\s\S]*persist: false,[\s\S]*recordHistory: !isLiveInput,[\s\S]*autosaveReason: sessionUpdateReason[\s\S]*\};/m,
  "Editar campos de escena debe mutar solo memoria y dejar el historial para cambios confirmados."
);

assert.doesNotMatch(
  scriptFieldHandlerMatch[1],
  /scheduleSessionLocalPersist\(/,
  "La edición de campos de escena ya no debe programar autosave local."
);

assert.match(
  source,
  /const handleCreativeField = \(event\) => \{[\s\S]*const isLiveInput = String\(event\?\.type \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "input";[\s\S]*persist: false,[\s\S]*recordHistory: !isLiveInput,[\s\S]*if \(!isLiveInput\) \{\n\s+renderCreativeVideoShell\(getActiveSession\(\)\);\n\s+\}/m,
  "El inspector creativo no debe reconstruir el shell completo por cada tecla."
);

console.log("Podcaster manual-save-only editor performance OK.");
