import assert from "node:assert/strict";
import fs from "node:fs";

const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

const controllerSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  podcasterSource,
  /return playbackController\.syncOverlay\(currentMs,\s*options\);/,
  "El sync del overlay debe reenviar rowId y forceRow al playback controller."
);

assert.match(
  controllerSource,
  /const preferredRowId = String\(options\?\.(?:rowId|preferredRowId)[\s\S]*?trim\(\);/,
  "El playback controller debe resolver la fila preferida para el preview del editor."
);

assert.match(
  controllerSource,
  /const shouldShowPreferredRow = forceRow \|\| \(editorPreviewMode && Boolean\(preferredRowId\)\);/,
  "El preview del editor debe poder priorizar la fila activa aunque el cursor no caiga dentro del clip."
);

assert.match(
  controllerSource,
  /selected = candidates\.find\(\(item\) => item\.isPreferred && \(item\.isTimeActive \|\| shouldShowPreferredRow\)\)\?\.clip/,
  "El overlay debe intentar renderizar primero el clip de la fila activa en modo editor."
);

assert.match(
  controllerSource,
  /if \(!selected \|\| selected\.hidden === true\) \{/,
  "Si el clip preferido está oculto, el preview también debe ocultarse."
);

console.log("Podcaster onscreen hidden preview sync OK.");
