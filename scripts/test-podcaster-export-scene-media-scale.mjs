import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const back = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/mediaScale:\s*window\.normalizeTimelineClipMediaScale\?\.\(entry\?\.clip\?\.mediaScale\) \|\| 1/.test(front)) {
  throw new Error("El payload de export debe enviar mediaScale desde timelineClipsByRowId.");
}

if (!/mediaScale:\s*window\.normalizeTimelineClipMediaScale\?\.\(selected\?\.mediaScale\) \|\| 1/.test(front)
  || !/function syncMontageFrontendPreviewMediaLayout\(frontendPreview = null\)/.test(front)
  || !/ken-burns-\$\{effect\}/.test(front)) {
  throw new Error("El preview frontend de export debe sincronizar layout de escena y clases Ken Burns.");
}

if (!/function normalizeMontageMediaScale\(value = 1\)/.test(back)
  || !/mediaScale:\s*normalizeMontageMediaScale\(item\?\.mediaScale \|\| item\?\.clip\?\.mediaScale \|\| 1\)/.test(back)) {
  throw new Error("El backend debe normalizar mediaScale del payload de export.");
}

if (!/function buildSceneMediaPositionCropFilter\(\{/.test(back)
  || !/resolveSceneMediaRenderSpec\(\{/.test(back)
  || !/color=c=0x020617:s=\$\{width\}x\$\{height\}:d=/.test(back)
  || !/overlay=x='/.test(back)
  || !/buildMontageVideoSceneFilter\(\{[\s\S]*sourceWidth[\s\S]*sourceHeight[\s\S]*mediaScale[\s\S]*\}\)/.test(back)) {
  throw new Error("La exportación de video debe derivar layout explícito desde la spec compartida de escena.");
}

if (!/buildMontageImageMotionVideoFilter\(\{[\s\S]*mediaScale[\s\S]*\}\)/.test(back)
  || !/mediaKind:\s*"image"/.test(back)
  || !/spec\.kenBurns\.effect/.test(back)) {
  throw new Error("La exportación de imágenes debe aplicar mediaScale y Ken Burns desde la spec compartida.");
}

console.log("Podcaster export scene media scale OK.");
