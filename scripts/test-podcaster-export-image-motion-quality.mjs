import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

assert.match(
  backend,
  /const MONTAGE_IMAGE_SCALE_FLAGS = "lanczos\+accurate_rnd\+full_chroma_int";/,
  "El export de imágenes debe usar remuestreo Lanczos con redondeo preciso."
);
assert.match(
  backend,
  /function buildMontageFixedSurfaceImageZoomFilter[\s\S]*zoompan=z='\$\{zoomExpr\}'[\s\S]*:d=1:s=\$\{workWidth\}x\$\{workHeight\}:fps=24/,
  "El zoom Ken Burns debe ejecutarse sobre una superficie de dimensiones fijas."
);
assert.doesNotMatch(
  backend,
  /scale=w=\$\{widthExpr\}:h=\$\{heightExpr\}:eval=frame/,
  "El zoom no debe cambiar el ancho y alto físico de la imagen en cada frame."
);
assert.match(
  backend,
  /color=c=black@0\.0[\s\S]*format=rgba\[zoom_surface\][\s\S]*\[zoom_surface\]\[zoom_source\]overlay=[\s\S]*:format=auto,format=rgba\[zoom_base\]/,
  "El zoom debe conservar una superficie RGBA estable incluso en stop motion."
);
assert.match(
  backend,
  /scale=\$\{motionWidth\}:\$\{motionHeight\}:eval=frame:flags=\$\{MONTAGE_IMAGE_SCALE_FLAGS\}/,
  "Los paneos Ken Burns deben preparar la imagen con el escalador de alta calidad."
);
assert.match(
  backend,
  /function buildMontageChromaAlignedOverlayExpr[\s\S]*round\(\(\$\{String\(expression \|\| "0"\)\}\)\/2\)\*2/,
  "La posición animada debe alinearse a la cuadrícula de croma y evitar vibración."
);
assert.match(
  backend,
  /const overlayXExpr = mediaKind === "image"[\s\S]*buildMontageChromaAlignedOverlayExpr\(xExpr\)/,
  "El overlay de imágenes debe usar la posición estabilizada."
);
assert.match(
  backend,
  /\$\{inputChain\.join\(","\)\},setsar=1\[\$\{transformedLabel\}\]/,
  "La imagen transformada debe normalizar SAR antes de componerla."
);

console.log("Podcaster export image motion quality OK.");
