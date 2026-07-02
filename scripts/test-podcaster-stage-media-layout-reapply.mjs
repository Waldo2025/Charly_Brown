import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

if (!/reapplyEntryVisualLayout\(entry = null, surfaceEl = null\)/.test(source)) {
  throw new Error("Playback controller debe exponer un helper para reaplicar layout visual.");
}

if (!/loadedmetadata", "loadeddata", "canplay"/.test(source)) {
  throw new Error("El layout de video debe recalcularse con metadata, data y canplay.");
}

if (!/requestAnimationFrame\(\(\) => \{\s*refresh\(\);\s*requestAnimationFrame\(refresh\);/s.test(source)) {
  throw new Error("El layout debe reintentarse en frames siguientes para cubrir contenedores recién redimensionados.");
}

if (!/const stageEntry = \{[\s\S]*rowId: key,[\s\S]*videoSrc: src,[\s\S]*clip: clipCfg \|\| \{\}/.test(source)) {
  throw new Error("syncStageMedia debe construir una entrada visual para el video activo.");
}

if (!/stageVideo\.hidden = false;\s*this\.applyEntryVisualStateToSurface\(stageEntry, stageVideo\);/.test(source)) {
  throw new Error("syncStageMedia debe reaplicar el layout al video visible al iniciar/cambiar escena.");
}

console.log("Podcaster stage media layout reapply OK.");
