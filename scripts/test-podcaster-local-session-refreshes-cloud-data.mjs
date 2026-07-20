import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");

assert.match(
  source,
  /function hasCloudSessionMarker\(session = null\)[\s\S]*cloudMeta\.ownerId[\s\S]*cloudMeta\.savedAt[\s\S]*session\.sessionUpdatedAt/,
  "Debe existir una marca explícita para detectar sesiones con origen Firebase."
);

assert.match(
  source,
  /function isSessionDirtyInLocalCache\(sessionId = ""\)[\s\S]*sessionStore\.loadSessionSyncMeta\(resolveCurrentUid\(\), key\)[\s\S]*meta\.dirty === true/,
  "La hidratación cloud debe respetar sesiones con cambios locales dirty."
);

assert.match(
  source,
  /if \(hasContent\) \{\s*return hasCloudMarker && !isSessionDirtyInLocalCache\(sessionId\);\s*\}/,
  "Una sesión local con contenido y marca cloud debe refrescarse desde Firebase si no está dirty."
);

assert.match(
  source,
  /console\.info\("\[podcaster\]\[sessions\] Descargando sesión desde Firebase"[\s\S]*localVideos[\s\S]*\);/,
  "La hidratación desde Firebase debe dejar trazas visibles en consola local."
);

assert.match(
  source,
  /console\.warn\("\[podcaster\]\[sessions\] Firebase no devolvió la sesión solicitada"/,
  "Cuando Firebase no devuelve documento debe existir warning visible."
);

assert.match(
  storeSource,
  /console\.warn\("\[podcaster\]\[session-store\] API session get failed; falling back to Firestore"/,
  "El fallback API -> Firestore no debe fallar en silencio."
);

assert.match(
  storeSource,
  /console\.warn\("\[podcaster\]\[session-store\] Firestore session get failed"/,
  "El fallo directo de Firestore no debe quedar silencioso."
);

console.log("Podcaster local sessions refresh cloud data OK.");
