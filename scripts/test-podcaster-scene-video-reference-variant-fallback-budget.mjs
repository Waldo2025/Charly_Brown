import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frontendSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const providerSource = readFileSync(new URL("../backend/podcaster-video-provider.js", import.meta.url), "utf8");

assert.match(
  frontendSource,
  /maxModelAttempts:\s*1/,
  "La escena debe declarar un único intento de modelo."
);
assert.doesNotMatch(
  frontendSource,
  /maxModelAttempts:\s*options\.maxModelAttempts \|\| [2-9]/,
  "El cliente no debe pedir fallback silencioso hacia otros modelos."
);
assert.match(
  backendSource,
  /const videoModels = \[requestedModel\];/,
  "El backend debe ejecutar exactamente el modelo resuelto."
);
assert.match(
  backendSource,
  /No fallback silencioso: una solicitud aceptada usa exactamente un proveedor\/modelo/,
  "La regla de no fallback debe quedar documentada junto al routing."
);

assert.match(
  frontendSource,
  /await runtime\.hydrateSessionReferenceMedia\(session\)/,
  "La generación debe rehidratar las referencias antes de construir el payload."
);

assert.match(
  providerSource,
  /error\.code = "veo_operation_poll_timeout";/,
  "El timeout de polling debe conservar un código estable."
);
assert.match(
  providerSource,
  /No se inició otro modelo/,
  "El timeout debe explicar que no se inició otro modelo."
);
assert.doesNotMatch(
  providerSource,
  /fallbackModels|nextModel|modelIndex \+= 1/,
  "El adaptador no debe continuar con otro modelo tras timeout o aceptación."
);

console.log("Podcaster single-model video operation budget v2 OK.");
