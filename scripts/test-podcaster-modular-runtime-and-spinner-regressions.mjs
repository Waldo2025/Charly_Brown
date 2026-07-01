import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const mediaReplacementSource = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");

if (!/Object\.assign\(window,\s*\{[\s\S]*getRowReferenceVideoMap,[\s\S]*\}\);/m.test(podcasterSource)) {
  throw new Error("podcaster.js debe exponer getRowReferenceVideoMap para que podcaster-video-generator.js use referencias de video o imagen sin romperse.");
}

if (!/row-icon-btn\$\{isGenerating \|\| isBulkRegenAll \? " is-loading" : ""\}[\s\S]*data-action="timeline-generate-scene-video"[\s\S]*fa-spinner spinner-icon[\s\S]*videoSrc \? "fa-sync-alt" : "fa-film"/m.test(podcasterSource)) {
  throw new Error("El botón/chip de generar escena debe mostrar spinner durante la generación individual, no solo en batch.");
}

if (!/regenBtn\.classList\.toggle\("is-loading", isGenerating \|\| isBulkRegenAll\);[\s\S]*regenBtn\.disabled = isGenerating \|\| isBulkRegenAll;[\s\S]*icon\.className = "fas fa-spinner spinner-icon";/m.test(podcasterSource)) {
  throw new Error("syncTimelineEphemeralState debe reflejar el spinner y disabled state cuando una escena individual se está generando.");
}

if (/function estimateInlineDataUrlBytes\(/.test(podcasterSource)) {
  throw new Error("podcaster.js no debe duplicar estimateInlineDataUrlBytes; esa lógica pertenece al flujo modular de video.");
}

if (/function normalizeInlineDataUrl\(/.test(podcasterSource)) {
  throw new Error("podcaster.js no debe duplicar normalizeInlineDataUrl; esa lógica pertenece al flujo modular de video.");
}

if (/function resolveOnScreenTextExportCanvasSize\(/.test(podcasterSource)) {
  throw new Error("podcaster.js no debe duplicar resolveOnScreenTextExportCanvasSize; debe usar la API compartida del módulo on-screen text.");
}

if (/return normalizeSharedOnScreenTextTrackSettings\s*\?/.test(podcasterSource)) {
  throw new Error("podcaster.js no debe caer a fallback para normalizeOnScreenTextTrackSettings; debe exigir el módulo compartido.");
}

if (!/document\.addEventListener\("click",\s*handlePodcasterGenerationClick,\s*\{\s*capture:\s*true\s*\}\s*\);/m.test(generatorSource)) {
  throw new Error("La generación de escena debe capturar el click desde podcaster-video-generator.js para que el spinner y Veo arranquen aunque el timeline tenga otros handlers.");
}

if (!/function logSceneVideoGeneration\(/.test(generatorSource)) {
  throw new Error("podcaster-video-generator.js debe instrumentar el flujo de generación de escenas con logs dedicados.");
}

if (/console\.log\(\s*"\[SceneReplacement\]/.test(podcasterSource) || /console\.log\(\s*`\[SceneReplacement\]/.test(podcasterSource)) {
  throw new Error("podcaster.js no debe seguir emitiendo console.log ruidosos del flujo de reemplazo de escena.");
}

if (/console\.log\(\s*"\[SceneReplacement\]/.test(mediaReplacementSource) || /console\.log\(\s*`\[SceneReplacement\]/.test(mediaReplacementSource)) {
  throw new Error("podcaster-media-replacement.js no debe seguir emitiendo console.log ruidosos del flujo de reemplazo de escena.");
}

console.log("Podcaster modular runtime and spinner regressions OK.");
