import { normalizeImageWarp } from "./podcaster-image-warp.js?v=2026-10-07.smooth-warp-defaults-1";

const clamp = (value, fallback, min, max) => {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
};

export function normalizeSceneImageLayer(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const motion = ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down"].includes(source.motion) ? source.motion : "fade";
  const exit = ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down"].includes(source.exit) ? source.exit : "fade";
  const startSec = clamp(source.startSec, 0, 0, 3600);
  const endSec = Math.max(startSec + 0.1, clamp(source.endSec, 8, 0.1, 3600));
  return {
    id: String(source.id || "").slice(0, 90),
    name: String(source.name || "Imagen extra").slice(0, 120),
    storagePath: String(source.storagePath || "").slice(0, 900),
    downloadUrl: String(source.downloadUrl || "").slice(0, 2000),
    mimeType: String(source.mimeType || "image/png").slice(0, 80),
    visible: source.visible !== false,
    x: clamp(source.x, 0.5, 0, 1),
    y: clamp(source.y, 0.5, 0, 1),
    width: clamp(source.width, 0.32, 0.05, 1),
    startSec,
    endSec,
    motion,
    exit,
    transitionSec: clamp(source.transitionSec, 0.55, 0.1, 3),
    effect: normalizeImageWarp(source.effect)
  };
}

export function normalizeSceneImageLayers(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 24)
    .map(normalizeSceneImageLayer)
    .filter((layer) => layer.id && (layer.storagePath || layer.downloadUrl));
}

export function sceneImageLayerFrame(raw, timeSec) {
  const layer = normalizeSceneImageLayer(raw);
  const time = Number(timeSec) || 0;
  if (time < layer.startSec || time >= layer.endSec) return { visible: false, opacity: 0, x: layer.x, y: layer.y, scale: 1 };
  const span = Math.min(layer.transitionSec, (layer.endSec - layer.startSec) / 2);
  const enter = Math.min(1, Math.max(0, (time - layer.startSec) / span));
  const leave = Math.min(1, Math.max(0, (layer.endSec - time) / span));
  const easedEnter = 1 - Math.pow(1 - enter, 3);
  const easedLeave = 1 - Math.pow(1 - leave, 3);
  let x = layer.x;
  let y = layer.y;
  let scale = 1;
  let opacity = 1;
  const apply = (kind, progress, isExit = false) => {
    const direction = isExit ? -1 : 1;
    if (kind === "fade") opacity *= progress;
    if (kind === "slide-left") x += direction * 0.18 * (1 - progress);
    if (kind === "slide-right") x -= direction * 0.18 * (1 - progress);
    if (kind === "slide-up") y += direction * 0.18 * (1 - progress);
    if (kind === "slide-down") y -= direction * 0.18 * (1 - progress);
  };
  apply(layer.motion, layer.motion === "fade" ? enter : easedEnter);
  apply(layer.exit, layer.exit === "fade" ? leave : easedLeave, true);
  return { visible: true, opacity, x, y, scale };
}
