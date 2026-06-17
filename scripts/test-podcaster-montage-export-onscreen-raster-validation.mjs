import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  source,
  /function validateMontageNormalExportOnScreenTextRasters\(input = \{\}\)/,
  "El backend debe validar explícitamente los rasters de texto antes del export normal."
);

assert.match(
  source,
  /const expectedWordIndices = input\.partyKaraoke !== false[\s\S]*selectKaraokeWordTimingIndicesForExport/,
  "La validación debe usar los wordTimings preservados para decidir qué capas de karaoke son obligatorias."
);

assert.match(
  source,
  /throw createMontageOnScreenTextExportError\([\s\S]*montage_karaoke_raster_missing/,
  "Si faltan capas de karaoke, el export normal debe fallar de forma explícita."
);

assert.match(
  source,
  /throw createMontageOnScreenTextExportError\([\s\S]*montage_onscreen_text_raster_missing/,
  "Si falta el raster base del texto en pantalla, el export normal debe fallar de forma explícita."
);

console.log("Podcaster montage export validates rasterized on-screen text assets OK.");
