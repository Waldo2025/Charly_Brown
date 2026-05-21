import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url),
  "utf8"
);

if (!/maxModelAttempts:\s*options\.maxModelAttempts \|\| 3,/.test(source)) {
  throw new Error("La generación de escena debe permitir fallback por defecto hacia un tercer modelo cuando los dos primeros no resuelven media.");
}

if (!/maxVariantAttempts:\s*options\.maxVariantAttempts \|\| 6/.test(source)) {
  throw new Error("La generación de escena debe permitir suficientes variantes por defecto para alcanzar los fallbacks después de reference-scene.");
}

console.log("Podcaster scene video reference variant fallback budget OK.");
