import { readFileSync } from "node:fs";
import { resolveEffectiveExportResolution } from "../public/podcaster/podcaster-reels.js";

const montageExportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const onScreenTextSource = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text.js", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

if (resolveEffectiveExportResolution("source", true) !== "720x1280") {
  throw new Error("El export reel debe mapear source a una resolución vertical segura.");
}

if (resolveEffectiveExportResolution("1080p", true) !== "1080x1920") {
  throw new Error("El export reel debe mapear 1080p a 1080x1920.");
}

if (!/const reelModeEnabled = videoCfg\?\.reelModeEnabled === true;/.test(montageExportSource)
  || !/reelModeEnabled,/.test(montageExportSource)
  || !/brandOverlay: buildMontageBrandOverlayForExport\(reelModeEnabled\)/.test(montageExportSource)) {
  throw new Error("El payload de export debe enviar reelModeEnabled y usar overlay de marca específico para reel.");
}

if (!/widthPct: 0\.09/.test(montageExportSource) || !/widthPct: 0\.05/.test(montageExportSource)) {
  throw new Error("El overlay de marca debe conservar 0.05 en normal y usar 0.09 en reel.");
}

if (!/function isMontageExportReelModeActive/.test(montageExportSource)
  || !/dataset\.reel = isReelPreview \? "true" : "false"/.test(montageExportSource)
  || !/"Reel 9:16"/.test(montageExportSource)
  || !/preview frontend\$\{payload\.reelModeEnabled === true \? " · Reel 9:16" : ""\}/.test(montageExportSource)) {
  throw new Error("El preview del modal de export debe indicar y activar visualmente el modo Reel 9:16.");
}

if (!/\.montage-export-preview\[data-reel="true"\] \.montage-export-preview-container[\s\S]*aspect-ratio: 9 \/ 16/.test(cssSource)
  || !/\.montage-export-preview\[data-reel="true"\] \.montage-export-preview-badge/.test(cssSource)
  || !/\.montage-export-preview\[data-reel="true"\] \.podcast-stage-brand-mark[\s\S]*--pod-stage-brand-width-pct: 0\.12/.test(cssSource)
  || !/\.montage-export-preview-container \.podcast-active-speaker-video,[\s\S]*\.montage-export-preview-container \.podcast-active-speaker-image[\s\S]*object-fit: contain;/.test(cssSource)
  || !/\.montage-export-preview\[data-reel="true"\] \.montage-export-preview-container \.podcast-active-speaker-video,[\s\S]*object-fit: cover;/.test(cssSource)
  || !/\.montage-export-preview-container \.podcast-onscreen-text-overlay[\s\S]*position: absolute/.test(cssSource)) {
  throw new Error("El CSS del preview de export debe mostrar un stage vertical y badge especial en modo reel.");
}

if (!/podcastVideoStage: document\.getElementById\("montageExportPreviewContainer"\)/.test(podcasterSource)) {
  throw new Error("El controlador del preview de export debe medir el texto contra montageExportPreviewContainer.");
}

for (const resolution of ["1080x1920", "720x1280", "480x854"]) {
  if (!onScreenTextSource.includes(`case "${resolution}":`)) {
    throw new Error(`El render compartido de subtítulos debe soportar ${resolution}.`);
  }
}

if (!/function isMontageReelResolution/.test(serverSource)
  || !/const reelModeEnabled = raw\?\.reelModeEnabled === true \|\| isMontageReelResolution\(resolution\);/.test(serverSource)) {
  throw new Error("El backend debe conservar reelModeEnabled e inferir reel desde resoluciones verticales.");
}

if (!/let onScreenTextSegments = Array\.isArray\(onScreenTextTimelineRaw\?\.segments\)/.test(serverSource)
  || !/if \(!onScreenTextSegments\.length\) \{[\s\S]*entry\?\.onScreenText/.test(serverSource)
  || !/if \(input\.onScreenTextSettings && input\.onScreenTextSegments\.length\)/.test(serverSource)) {
  throw new Error("El backend debe quemar texto en pantalla aunque falte el flag enabled del timeline y debe reconstruir segmentos desde entries.");
}

if (!/fontSizePx: isReelExport[\s\S]*\* 1\.2/.test(serverSource)) {
  throw new Error("El overlay de subtítulos debe escalar fuente 1.2x en export reel.");
}

if (!/function buildMontageOnScreenTextDrawFilters/.test(serverSource)
  || !/stylePreset === "3d" && bgPreset === "none"/.test(serverSource)
  || !/visibleStrokeWidth/.test(serverSource)
  || !/\.flatMap\(\(segment\) => \{[\s\S]*buildMontageOnScreenTextDrawFilters/.test(serverSource)) {
  throw new Error("El export debe renderizar texto 3D sin fondo con capas drawtext visibles.");
}

if (!/function normalizeMontageOnScreenTextExportLayout/.test(serverSource)
  || !/const layout = normalizeMontageOnScreenTextExportLayout\(\{[\s\S]*segment,[\s\S]*settings: onScreenTextSettings,[\s\S]*sourceDims/.test(serverSource)
  || !/autoHeightPct/.test(serverSource)) {
  throw new Error("El backend debe normalizar el layout del texto en pantalla con alto automatico antes de drawtext.");
}

if (!/defaultBrandWidthPct = isReelExport \? 0\.09 : 0\.05/.test(serverSource)
  || !/defaultBrandWidthPct = reelModeEnabled \? 0\.09 : 0\.05/.test(serverSource)) {
  throw new Error("El backend debe usar logo 0.09 en reel y 0.05 en normal.");
}

console.log("Podcaster reel export parity OK.");
