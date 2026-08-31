import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const {
  normalizeSceneMediaMotionPreset,
  resolveSceneMediaRenderSpec
} = require("../public/podcaster/podcaster-scene-media-render-spec.js");

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
  /function buildMontageFixedSurfaceImageZoomFilter[\s\S]*zoompan=z='\$\{zoomExpr\}'[\s\S]*:d=1:s=\$\{workWidth\}x\$\{workHeight\}:fps=\$\{safeFrameRate\}/,
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
assert.equal(
  [...backend.matchAll(/const overlayXExpr = mediaKind === "image" \? buildMontageChromaAlignedOverlayExpr\(xExpr\) : xExpr;/g)].length,
  2,
  "La posición estabilizada debe aplicarse en layout normal y blur-backdrop."
);
assert.match(
  backend,
  /transformedFilter = `\$\{inputChain\.join\(","\)\},setsar=1\[\$\{transformedLabel\}\]`/,
  "La imagen transformada debe normalizar SAR antes de componerla."
);
assert.match(
  backend,
  /process\.env\.MONTAGE_IMAGE_MOTION_FRAME_RATE \|\| 90/,
  "Las imágenes animadas deben conservar 90 FPS por defecto."
);
assert.match(
  backend,
  /const requiresSafeTimelineComposition = uniqueCompositionFrameRates\.length > 1;[\s\S]*Math\.max\(\.\.\.uniqueCompositionFrameRates\)/,
  "Un timeline mixto debe componerse al mayor FPS de sus escenas."
);
assert.match(
  backend,
  /function hasMontageImageMotion\(mediaMotionPreset = "none", visualEffects = null\)[\s\S]*preset !== "none" \|\| Boolean\(kenBurns\?\.effect\)/,
  "La selección de FPS debe reconocer movimiento del timeline y Ken Burns del modal."
);

const motionCases = [
  ["pan-left-right", "x", 1],
  ["pan-right-left", "x", -1],
  ["pan-up-down", "y", -1],
  ["pan-down-up", "y", 1]
];

const filterBlockStart = backend.indexOf("function resolveMontageKenBurnsEffect");
const filterBlockEnd = backend.indexOf("function buildMontageFullCanvasImageVideoFilter", filterBlockStart);
assert.ok(filterBlockStart >= 0 && filterBlockEnd > filterBlockStart, "Debe poder aislarse el constructor FFmpeg para probarlo.");
const filterSandbox = {
  resolveSceneMediaRenderSpec,
  normalizeMontageMediaMotionPreset: normalizeSceneMediaMotionPreset,
  MONTAGE_IMAGE_SCALE_FLAGS: "lanczos+accurate_rnd+full_chroma_int",
  MONTAGE_IMAGE_MOTION_FRAME_RATE: 90
};
vm.runInNewContext(backend.slice(filterBlockStart, filterBlockEnd), filterSandbox);
const buildFilter = filterSandbox.buildSceneMediaPositionCropFilter;
assert.equal(typeof buildFilter, "function", "El constructor FFmpeg debe ser ejecutable en la prueba.");

const commonFilterInput = {
  canvas: { width: 1280, height: 720 },
  sourceWidth: 1920,
  sourceHeight: 1080,
  durationSec: 6,
  mediaScale: 1.25,
  mediaKind: "image",
  frameRate: 90
};

for (const visualLayoutMode of ["default", "blur-backdrop"]) {
  for (const [preset] of motionCases) {
    const filter = buildFilter({ ...commonFilterInput, visualLayoutMode, mediaMotionPreset: preset });
    assert.match(filter, /overlay=x='round\(\(.+\)\/2\)\*2':y='round\(\(.+\)\/2\)\*2':eval=frame/, `${visualLayoutMode}/${preset} debe estabilizar ambos ejes.`);
    assert.match(filter, /fps=90/, `${visualLayoutMode}/${preset} debe conservar 90 FPS.`);
  }
}

const videoFilter = buildFilter({
  ...commonFilterInput,
  mediaKind: "video",
  frameRate: 24,
  mediaMotionPreset: "pan-left-right"
});
assert.doesNotMatch(videoFilter, /overlay=x='round\(/, "El ajuste de croma no debe alterar escenas de video.");

const zoomFilter = buildFilter({
  ...commonFilterInput,
  mediaMotionPreset: "pan-left-right",
  visualEffects: { effects: ["zoom-in"], speed: 7 }
});
assert.match(zoomFilter, /zoompan=z='[^']*on\/\d+/, "El zoom debe progresar por fotograma de salida.");
assert.match(zoomFilter, /fps=90/, "El zoom combinado con movimiento debe conservar 90 FPS.");
assert.doesNotMatch(zoomFilter, /scale=w=.*:eval=frame/, "El zoom no debe variar las dimensiones físicas por fotograma.");

const buildImageMotionFilter = filterSandbox.buildMontageImageMotionVideoFilter;
for (const modalEffect of ["pan-left", "pan-right", "pan-up", "pan-down", "zoom-in", "zoom-out"]) {
  const modalKenBurnsFilter = buildImageMotionFilter({
    ...commonFilterInput,
    mediaMotionPreset: "none",
    visualEffects: { effects: [modalEffect], speed: 5 }
  });
  assert.match(modalKenBurnsFilter, /fps=90/, `${modalEffect} elegido en el modal debe exportarse a 90 FPS aunque mediaMotionPreset sea none.`);
}
assert.equal(
  filterSandbox.resolveMontageImageMotionFrameRate("none", { effects: [], speed: 5 }),
  24,
  "Una imagen realmente estática debe conservar 24 FPS."
);

for (const [preset, axis, expectedDirection] of motionCases) {
  const spec = resolveSceneMediaRenderSpec({
    canvasWidth: 1280,
    canvasHeight: 720,
    sourceWidth: 1920,
    sourceHeight: 1080,
    mediaScale: 1.25,
    mediaMotionPreset: preset,
    mediaKind: "image",
    durationSec: 6
  });
  const start = axis === "x" ? spec.motion.startOffsetXPx : spec.motion.startOffsetYPx;
  const end = axis === "x" ? spec.motion.endOffsetXPx : spec.motion.endOffsetYPx;
  assert.equal(Math.sign(end - start), expectedDirection, `${preset} debe avanzar en el sentido esperado.`);
  assert.ok(Math.abs(end - start) > 0, `${preset} debe conservar una trayectoria no nula.`);
}

console.log("Podcaster export image motion quality OK.");
