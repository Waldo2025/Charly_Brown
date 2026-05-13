import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /function mergeCloudSessionOverLocalCache\(cloudSession = null, localSession = null\)/,
  "Debe existir un merge explícito donde la nube gane sobre la caché local."
);

assert.match(
  source,
  /finalSessions = await loadCloudSessions\(\);[\s\S]*finalSessions = mergeCloudSessionsOverLocalCache\(finalSessions, localSessions\);/m,
  "init debe cargar primero desde Firebase y solo después mezclar fallback local sin permitir que el caché pise el timeline persistido."
);

assert.match(
  source,
  /const mergedSession = mergeCloudSessionOverLocalCache\(cloudSession, nextSession\);/,
  "setActiveSession debe rehidratar la sesión activa usando a Firebase como fuente de verdad para geminiDialogueTrack."
);

assert.doesNotMatch(
  source,
  /cloudUpdatedAt >= localUpdatedAt \|\| nextSession\.isStub/,
  "setActiveSession no debe decidir el timeline Gemini por comparación de timestamps locales vs remotos."
);

console.log("Podcaster Gemini cloud source-of-truth OK.");
