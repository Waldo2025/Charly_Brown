import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  serverSource,
  /function buildMontageExportOffsetsByRowId\(entries = \[\],[\s\S]*useTimelinePositions[\s\S]*timelineStartMs[\s\S]*cursorMs/,
  "El backend debe construir un mapa comun de offsets exportados por rowId."
);

assert.match(
  serverSource,
  /function remapMontageTimelineSegmentsToExportOffsets\(segments = \[\], exportOffsetsByRowId = new Map\(\)\)[\s\S]*relativeStartMs[\s\S]*startMs: Math\.max\(0, Math\.round\(Number\(exportOffset\?\.startMs/,
  "El backend debe remapear el texto en pantalla al mismo reloj final que usa el audio."
);

assert.match(
  serverSource,
  /let shouldBurnSceneOnScreenText = shouldUseMontageSceneAssSubtitles\(input\)[\s\S]*&& input\.useTimelineAudio !== true/,
  "Con audio Gemini/timeline, el texto no debe quemarse dentro de cada escena antes del ensamblado final."
);

assert.match(
  serverSource,
  /const exportOffsetsByRowId = buildMontageExportOffsetsByRowId\(overlapAwareEntries,[\s\S]*useTimelinePositions: overlapPlan\.hasOverlap \|\| overlapPlan\.hasGaps/,
  "Los offsets exportados deben respetar si el MP4 final usa timeline absoluto o concat secuencial."
);

assert.match(
  serverSource,
  /const effectiveRenderedSegments = remapMontageTimelineSegmentsToExportOffsets\([\s\S]*input\.onScreenTextSegments[\s\S]*exportOffsetsByRowId/,
  "La pasada visual final debe usar segmentos de texto remapeados antes de generar ASS/karaoke."
);

assert.match(
  serverSource,
  /const exportOffset = shouldOffsetByScene \? \(exportOffsetsByRowId\.get\(String\(segment\?\.rowId/,
  "La mezcla de audio debe seguir usando el mismo mapa de offsets por rowId."
);

console.log("Podcaster export text/audio offset parity OK.");
