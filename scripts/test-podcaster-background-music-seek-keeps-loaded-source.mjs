import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

const noActiveSegmentStart = source.indexOf("if (!activeSegmentLookup || !activeSegmentLookup.segment) {");
const activeSegmentStart = source.indexOf("const activeSegment = activeSegmentLookup.segment;", noActiveSegmentStart);
assert.ok(noActiveSegmentStart >= 0 && activeSegmentStart > noActiveSegmentStart, "Debe existir la rama sin segmento activo de música de fondo.");
const noActiveSegmentBlock = source.slice(noActiveSegmentStart, activeSegmentStart);

assert.match(
  noActiveSegmentBlock,
  /Keep the loaded background audio\/source alive/,
  "La rama sin segmento activo debe documentar que conserva el audio cargado al mover el playhead."
);

assert.doesNotMatch(
  noActiveSegmentBlock,
  /this\.backgroundSourceKey\s*=\s*""|this\.backgroundSrc\s*=\s*""|this\.backgroundAudio\s*=\s*null|new Audio\(/,
  "Mover el playhead fuera de un segmento no debe limpiar ni recrear el audio de fondo cargado."
);

assert.match(
  noActiveSegmentBlock,
  /this\.backgroundSegmentSkewMs = null;[\s\S]*this\.backgroundSegmentIndex = -1;[\s\S]*this\.backgroundSyncAnchorMs = null;/,
  "Al salir de un segmento sólo debe reiniciar la sincronía, no la fuente cacheada."
);

const sourceChangeStart = source.indexOf("if (!sourceHasNotChanged) {", activeSegmentStart);
const sourceReuseStart = source.indexOf("} else if (this.backgroundAudio) {", sourceChangeStart);
assert.ok(sourceChangeStart > activeSegmentStart && sourceReuseStart > sourceChangeStart, "Debe existir la rama de cambio real de fuente.");
const sourceChangeBlock = source.slice(sourceChangeStart, sourceReuseStart);

assert.match(
  sourceChangeBlock,
  /this\.backgroundAudio = new Audio\(\);/,
  "El audio de fondo sólo debe recrearse cuando cambia la fuente real."
);

console.log("Podcaster background music seek keeps loaded source OK.");
