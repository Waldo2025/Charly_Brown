import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/const videoSrc = resolveStorageVideoUrl\(\s*primarySegment\?\.downloadUrl \|\| sceneClip\?\.downloadUrl \|\| "",\s*primarySegment\?\.storagePath \|\| sceneClip\?\.storagePath \|\| ""\s*\)/m.test(source)) {
  throw new Error("buildTimelineRuntimeEntries debe usar solo el clip generado de la escena, no la referencia visual.");
}

if (!/const videoSrc = resolveStorageVideoUrl\(\s*primarySegment\?\.downloadUrl \|\| generatedClip\?\.downloadUrl \|\| "",\s*primarySegment\?\.storagePath \|\| generatedClip\?\.storagePath \|\| "",/m.test(source)) {
  throw new Error("El preview del clip/chip en timeline no debe tomar la imagen de referencia como media real de la escena.");
}

if (/firstSegment\?\.downloadUrl \|\| \(\(isReferenceVideo \|\| isReferenceImage\) \? referenceAsset\?\.downloadUrl : ""\)/.test(source)) {
  throw new Error("syncPodcastVideoStageMedia no debe usar la referencia visual como src de montaje.");
}

if (/firstSegment\?\.storagePath \|\| \(\(isReferenceVideo \|\| isReferenceImage\) \? referenceAsset\?\.storagePath : ""\)/.test(source)) {
  throw new Error("syncPodcastVideoStageMedia no debe usar la referencia visual como storagePath de montaje.");
}

if (/const isImageStageClip = isLikelyImageMediaRecord\(firstSegment \|\| referenceAsset \|\| clip \|\| null\);/.test(source)) {
  throw new Error("El stage no debe tratar una referencia visual como si fuera un clip de imagen real.");
}

console.log("Podcaster reference does not replace scene media OK.");
