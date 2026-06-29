import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url),
  "utf8"
);
const backendSource = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

if (!/maxModelAttempts:\s*options\.maxModelAttempts \|\| 3,/.test(source)) {
  throw new Error("La generación de escena debe permitir fallback por defecto hacia un tercer modelo cuando los dos primeros no resuelven media.");
}

if (!/maxVariantAttempts:\s*options\.maxVariantAttempts \|\| 6/.test(source)) {
  throw new Error("La generación de escena debe permitir suficientes variantes por defecto para alcanzar los fallbacks después de reference-scene.");
}

if (!/err\.code\s*=\s*"veo_operation_poll_timeout"/.test(backendSource)) {
  throw new Error("El timeout de polling de Veo debe marcarse con un código estable para diferenciarlo de fallbacks recuperables.");
}

if (!/variant-poll-timeout-stop/.test(backendSource)) {
  throw new Error("El backend debe registrar cuando detiene los fallbacks por timeout de polling de Veo.");
}

if (!/error:\s*"veo_operation_poll_timeout"[\s\S]*?No se lanzaron variantes adicionales para evitar reiniciar la generación/.test(backendSource)) {
  throw new Error("El backend debe responder 504 en timeout de polling sin lanzar variantes adicionales que reinicien la espera.");
}

console.log("Podcaster scene video reference variant fallback budget OK.");
