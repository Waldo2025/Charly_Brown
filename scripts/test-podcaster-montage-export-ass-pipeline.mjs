import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  source,
  /function shouldUseMontageSceneAssSubtitles\(input = \{\}\)/,
  "El backend debe decidir explícitamente cuándo usar subtítulos ASS por escena."
);

assert.match(
  source,
  /function resolveMontageSceneOnScreenTextSegments\([\s\S]*map\(\(segment\) => \(\{ \.\.\.segment \}\)\)/,
  "La resolución de segmentos del export normal debe depender solo del timeline textual."
);

assert.doesNotMatch(
  source,
  /validateMontageNormalExportOnScreenTextRasters/,
  "El export normal ya no debe validar bundles rasterizados."
);

assert.doesNotMatch(
  source,
  /createMontageOnScreenTextExportError\(/,
  "La ruta principal ya no debe fallar por errores de rasters heredados."
);

assert.doesNotMatch(
  source,
  /buildBackendOnScreenTextRenderedSegments\(/,
  "El backend ya no debe regenerar base64 de texto para el export principal."
);

console.log("Podcaster montage export ASS pipeline contract OK.");
