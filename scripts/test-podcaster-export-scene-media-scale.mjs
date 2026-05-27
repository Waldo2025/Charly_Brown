import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const back = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/mediaScale:\s*window\.normalizeTimelineClipMediaScale\?\.\(entry\?\.clip\?\.mediaScale\) \|\| 1/.test(front)) {
  throw new Error("El payload de export debe enviar mediaScale desde timelineClipsByRowId.");
}

if (!/mediaScale:\s*window\.normalizeTimelineClipMediaScale\?\.\(selected\?\.mediaScale\) \|\| 1/.test(front)
  || !/window\.applySceneMediaScaleToStage\?\.\(\{[\s\S]*mediaScale: frontendPreview\.mediaScale[\s\S]*container: previewContainer/.test(front)
  || !/ken-burns-\$\{effect\}/.test(front)) {
  throw new Error("El preview frontend de export debe aplicar zoom de escena y clases Ken Burns.");
}

if (!/function normalizeMontageMediaScale\(value = 1\)/.test(back)
  || !/mediaScale:\s*normalizeMontageMediaScale\(item\?\.mediaScale \|\| item\?\.clip\?\.mediaScale \|\| 1\)/.test(back)) {
  throw new Error("El backend debe normalizar mediaScale del payload de export.");
}

if (!/function buildMontageVideoSceneFilter\(\{/.test(back)
  || !/const sceneScale = normalizeMontageMediaScale\(mediaScale\);/.test(back)
  || !/scale=\$\{scaledWidth\}:\$\{scaledHeight\}:force_original_aspect_ratio=increase,crop=\$\{width\}:\$\{height\},setsar=1/.test(back)
  || !/buildMontageVideoSceneFilter\(\{[\s\S]*mediaScale[\s\S]*\}\);/.test(back)) {
  throw new Error("La exportación de video debe aplicar mediaScale con crop centrado sin deformar el aspect ratio.");
}

if (!/buildMontageImageMotionVideoFilter\(\{[\s\S]*mediaScale[\s\S]*\}\)/.test(back)
  || !/const coverWidth = Math\.max\(2, Math\.round\(\(width \* sceneScale\) \/ 2\) \* 2\);/.test(back)) {
  throw new Error("La exportación de imágenes debe aplicar mediaScale al cover/crop.");
}

console.log("Podcaster export scene media scale OK.");
