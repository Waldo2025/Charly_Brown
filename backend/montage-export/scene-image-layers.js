"use strict";

const { normalizeImageWarp, hasImageWarpMotion, buildMontageImageWarpFilter } = require("./image-warp-filter.js");

const MOTIONS = new Set(["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down"]);
const clamp = (value, fallback, min, max) => {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
};

function normalizeSceneImageLayers(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 24).map((source) => {
    if (!source || typeof source !== "object") return null;
    const startSec = clamp(source.startSec, 0, 0, 3600);
    const storagePath = String(source.storagePath || "").slice(0, 900);
    const downloadUrl = String(source.downloadUrl || source.url || "").slice(0, 2000);
    const url = String(source.url || source.downloadUrl || "").slice(0, 2000);
    const dataUrl = String(source.dataUrl || source.localDataUrl || "").slice(0, 16000000);
    return {
      id: String(source.id || "").slice(0, 90),
      storagePath,
      downloadUrl,
      url,
      dataUrl,
      mimeType: String(source.mimeType || "image/png").slice(0, 80),
      x: clamp(source.x, 0.5, 0, 1), y: clamp(source.y, 0.5, 0, 1), width: clamp(source.width, 0.32, 0.05, 1),
      startSec, endSec: Math.max(startSec + 0.1, clamp(source.endSec, 8, 0.1, 3600)),
      transitionSec: clamp(source.transitionSec, 0.55, 0.1, 3),
      motion: MOTIONS.has(source.motion) ? source.motion : "fade",
      exit: MOTIONS.has(source.exit) ? source.exit : "fade",
      effect: normalizeImageWarp(source.effect)
    };
  }).filter((layer) => layer?.id && (layer.storagePath || layer.downloadUrl || layer.url || layer.dataUrl));
}

function motionOffset(kind, progress, axis, distance, isExit = false) {
  const remaining = `(1-(${progress}))`;
  const sign = isExit ? -1 : 1;
  if (axis === "x" && kind === "slide-left") return `${sign * distance}*${remaining}`;
  if (axis === "x" && kind === "slide-right") return `${-sign * distance}*${remaining}`;
  if (axis === "y" && kind === "slide-up") return `${sign * distance}*${remaining}`;
  if (axis === "y" && kind === "slide-down") return `${-sign * distance}*${remaining}`;
  return "0";
}

function buildSceneImageLayerFilters(layer, { index, inputIndex, baseLabel, canvas, durationSec, sourceWidth, sourceHeight }) {
  const prefix = `scene_layer_${index}`;
  const start = Math.min(durationSec, layer.startSec);
  const end = Math.min(durationSec, layer.endSec);
  if (end <= start) return { filters: "", outputLabel: baseLabel };
  const span = Math.min(layer.transitionSec, (end - start) / 2);
  const layerWidth = Math.max(2, Math.round(canvas.width * layer.width));
  const layerHeight = Math.max(2, Math.round(layerWidth * sourceHeight / sourceWidth));
  const filters = [`[${inputIndex}:v]scale=${layerWidth}:${layerHeight}:flags=lanczos,format=rgba[${prefix}_scaled]`];
  let imageLabel = `[${prefix}_scaled]`;
  if (hasImageWarpMotion(layer.effect)) {
    filters.push(buildMontageImageWarpFilter(layer.effect, {
      inputLabel: imageLabel, outputLabel: `${prefix}_warped`, labelPrefix: `${prefix}_`,
      durationSec, sourceWidth: layerWidth, sourceHeight: layerHeight
    }));
    imageLabel = `[${prefix}_warped]`;
  }
  const fades = [];
  if (layer.motion === "fade") fades.push(`fade=t=in:st=${start.toFixed(3)}:d=${span.toFixed(3)}:alpha=1`);
  if (layer.exit === "fade") fades.push(`fade=t=out:st=${Math.max(start, end - span).toFixed(3)}:d=${span.toFixed(3)}:alpha=1`);
  if (fades.length) { filters.push(`${imageLabel}${fades.join(",")}[${prefix}_faded]`); imageLabel = `[${prefix}_faded]`; }
  const entered = `min(1\\,max(0\\,(t-${start.toFixed(3)})/${span.toFixed(3)}))`;
  const leaving = `min(1\\,max(0\\,(${end.toFixed(3)}-t)/${span.toFixed(3)}))`;
  const easeIn = `1-pow(1-(${entered})\\,3)`;
  const easeOut = `1-pow(1-(${leaving})\\,3)`;
  const x = `${(canvas.width * layer.x).toFixed(2)}-overlay_w/2+(${motionOffset(layer.motion, easeIn, "x", (canvas.width * 0.18).toFixed(2))})+(${motionOffset(layer.exit, easeOut, "x", (canvas.width * 0.18).toFixed(2), true)})`;
  const y = `${(canvas.height * layer.y).toFixed(2)}-overlay_h/2+(${motionOffset(layer.motion, easeIn, "y", (canvas.height * 0.18).toFixed(2))})+(${motionOffset(layer.exit, easeOut, "y", (canvas.height * 0.18).toFixed(2), true)})`;
  const outputLabel = `[${prefix}_out]`;
  filters.push(`${baseLabel}${imageLabel}overlay=x='${x}':y='${y}':eval=frame:format=auto:shortest=0:eof_action=repeat:enable='between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})'${outputLabel}`);
  return { filters: filters.join(";"), outputLabel };
}

module.exports = { normalizeSceneImageLayers, buildSceneImageLayerFilters };
