const TYPES = new Set(["wave", "bend", "ripple", "pulse", "flag", "liquid", "twist", "shear", "jelly", "particles"]);
const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], "up-right": [0.707, -0.707], "down-right": [0.707, 0.707] };
const sourceCache = new WeakMap();

export function normalizeImageWarp(raw = null) {
  const value = raw && typeof raw === "object" ? raw : {};
  const type = String(value.type || "none").trim().toLowerCase();
  const clamp = (number, fallback, min, max) => {
    const parsed = Number(number);
    return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
  };
  const legacySpot = {
    centerX: value.region?.centerX,
    centerY: value.region?.centerY,
    radius: value.region?.radius,
    feather: value.region?.feather
  };
  const rawSpots = Array.isArray(value.region?.spots) ? value.region.spots : [legacySpot];
  const spots = rawSpots.slice(0, 6).map((spot, index) => ({
    id: String(spot?.id || `spot-${index + 1}`).slice(0, 64),
    type: TYPES.has(String(spot?.type || type).toLowerCase()) ? String(spot?.type || type).toLowerCase() : "none",
    centerX: clamp(spot?.centerX, 0.5, 0, 1),
    centerY: clamp(spot?.centerY, 0.5, 0, 1),
    radius: clamp(spot?.radius, 0.3, 0.05, 1),
    feather: clamp(spot?.feather, 0.15, 0.01, 0.5)
  }));
  return {
    type: TYPES.has(type) ? type : "none",
    intensity: clamp(value.intensity, 45, 1, 100),
    speed: clamp(value.speed, 1, 0.25, 3),
    startSec: clamp(value.startSec, 0, 0, 3600),
    endSec: value.endSec == null ? null : clamp(value.endSec, 8, 0, 3600),
    particles: {
      count: Math.round(clamp(value.particles?.count, 10, 3, 16)),
      size: clamp(value.particles?.size, 7, 2, 18),
      color: /^#[0-9a-f]{6}$/i.test(String(value.particles?.color || "")) ? String(value.particles.color).toLowerCase() : "#7dd3fc",
      direction: Object.hasOwn(DIRECTIONS, value.particles?.direction) ? value.particles.direction : "up"
    },
    region: {
      mode: value.region?.mode === "focus" ? "focus" : "all",
      centerX: clamp(value.region?.centerX, 0.5, 0, 1),
      centerY: clamp(value.region?.centerY, 0.5, 0, 1),
      radius: clamp(value.region?.radius, 0.3, 0.05, 1),
      feather: clamp(value.region?.feather, 0.15, 0.01, 0.5),
      spots
    }
  };
}

export function randomImageWarp(raw = null, random = Math.random) {
  const previous = normalizeImageWarp(raw);
  const choices = [...TYPES].filter((type) => type !== "particles" && type !== previous.type);
  const pick = () => Math.max(0, Math.min(0.999999, Number(random()) || 0));
  const nextType = choices[Math.floor(pick() * choices.length)];
  const anchors = [[0.25, 0.35], [0.75, 0.65], [0.72, 0.28], [0.28, 0.72], [0.5, 0.5], [0.15, 0.58]];
  const spots = previous.region.mode === "focus" ? previous.region.spots.map((spot) => ({ ...spot, type: nextType })) : [];
  const targetCount = Math.max(spots.length, 2 + Math.floor(pick() * 3));
  for (const [x, y] of anchors) {
    if (spots.length >= targetCount) break;
    if (spots.some((spot) => Math.hypot(spot.centerX - x, spot.centerY - y) < 0.24)) continue;
    const index = spots.length + 1;
    spots.push({
      id: `spot-random-${index}`,
      type: choices[Math.floor(pick() * choices.length)],
      centerX: Math.max(0.08, Math.min(0.92, x + (pick() - 0.5) * 0.1)),
      centerY: Math.max(0.08, Math.min(0.92, y + (pick() - 0.5) * 0.1)),
      radius: Number((0.16 + pick() * 0.08).toFixed(3)),
      feather: Number((0.07 + pick() * 0.06).toFixed(3))
    });
  }
  return normalizeImageWarp({
    ...previous,
    type: nextType,
    intensity: 35 + Math.round(pick() * 30),
    speed: Number((0.75 + pick() * 0.6).toFixed(2)),
    region: { ...previous.region, mode: "focus", spots }
  });
}

function getSource(canvas, image) {
  const width = canvas.width;
  const height = canvas.height;
  const previous = sourceCache.get(canvas);
  const isCanvasSource = typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement;
  if (!isCanvasSource && previous?.image === image && previous.width === width && previous.height === height && previous.src === image.currentSrc) return previous.canvas;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d");
  const imageWidth = image.naturalWidth || image.videoWidth || image.width;
  const imageHeight = image.naturalHeight || image.videoHeight || image.height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  sourceCache.set(canvas, { image, src: image.currentSrc, width, height, canvas: source });
  return source;
}

export function drawImageWarpFrame(canvas, image, raw, timeSec = 0, durationSec = 8) {
  const imageWidth = Number(image?.naturalWidth || image?.videoWidth || image?.width || 0);
  const imageHeight = Number(image?.naturalHeight || image?.videoHeight || image?.height || 0);
  if (!canvas || !image || image?.complete === false || !imageWidth || !imageHeight) return false;
  const effect = normalizeImageWarp(raw);
  const context = canvas.getContext("2d");
  const source = getSource(canvas, image);
  const mixedSpotTypes = effect.region.mode === "focus"
    && effect.region.spots.some((spot) => spot.type !== effect.type);
  // Distortions can use a different preset per marked region. Applying each
  // region as a complete canvas pass multiplied the 1080p tile draw calls by
  // the number of marks (up to six), starving MediaRecorder of frames.
  // Select the last active region for each tile and paint the source once.
  if (mixedSpotTypes && !effect.region.spots.some((spot) => spot.type === "particles")) {
    return paintImageWarpPass(canvas, source, effect, timeSec, durationSec, { mixedSpotTypes: true });
  }
  if (mixedSpotTypes) {
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const snapshotContext = snapshot.getContext("2d");
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    canvas.getContext("2d").drawImage(source, 0, 0);
    for (const spot of effect.region.spots) {
      if (spot.type === "none") continue;
      snapshotContext.clearRect(0, 0, snapshot.width, snapshot.height);
      snapshotContext.drawImage(canvas, 0, 0);
      paintImageWarpPass(canvas, snapshot, { ...effect, type: spot.type, region: { ...effect.region, spots: [spot] } }, timeSec, durationSec);
    }
    return true;
  }
  return paintImageWarpPass(canvas, source, effect, timeSec, durationSec);
}

export function hasImageWarpMotion(raw = null) {
  const effect = normalizeImageWarp(raw);
  return effect.region.mode === "focus"
    ? effect.region.spots.some((spot) => spot.type !== "none")
    : effect.type !== "none";
}

function paintImageWarpPass(canvas, source, effect, timeSec, durationSec, options = {}) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const duration = Math.max(0.2, Number(durationSec) || 8);
  const time = Math.max(0, Number(timeSec) || 0);
  const phase = 2 * Math.PI * effect.speed * time / duration;
  // La amplitud contenida reduce el tearing y conserva detalle al remuestrear.
  const amplitude = effect.intensity / 100 * width * 0.028;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0);
  const end = Math.min(duration, effect.endSec == null ? duration : effect.endSec);
  const envelope = Math.max(0, Math.min(1, (time - effect.startSec) / 0.16, (end - time) / 0.16));
  if (effect.type === "none" || envelope <= 0) return true;
  if (effect.type === "particles") {
    const [vx, vy] = DIRECTIONS[effect.particles.direction];
    context.fillStyle = effect.particles.color;
    for (let index = 0; index < effect.particles.count; index++) {
      const spot = effect.region.spots[index % effect.region.spots.length] || effect.region;
      const radius = spot.radius * Math.sqrt(width * height);
      const depth = [0.55, 0.75, 1, 1.25, 1.45][index % 5];
      const travel = (effect.region.mode === "focus" ? radius * 0.32 : Math.min(width, height) * 0.4) * Math.min(effect.speed, 1.5) * (0.55 + depth * 0.45) * time / duration;
      const size = effect.particles.size * depth * width / 960;
      const seedX = ((index * 73 + 19) % 97) / 97;
      const seedY = ((index * 37 + 11) % 89) / 89;
      const x = effect.region.mode === "focus" ? spot.centerX * width + (seedX - 0.5) * radius * 0.7 + vx * travel : seedX * width + vx * travel;
      const y = effect.region.mode === "focus" ? spot.centerY * height + (seedY - 0.5) * radius * 0.7 + vy * travel : seedY * height + vy * travel;
      context.globalAlpha = envelope * (0.35 + 0.65 * effect.intensity / 100) * (0.45 + depth * 0.35);
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    return true;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  // A 12px mesh at 1080p meant ~15k drawImage calls per frame; with several
  // marked regions that exceeded the browser's frame budget. A slightly wider
  // mesh keeps the source resolution intact while making the displacement
  // smooth enough to avoid the visible block artifacts of the old tiny grid.
  const tile = Math.max(16, Math.round(Math.min(width, height) / 48));
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const px = x + tile / 2;
      const py = y + tile / 2;
      const dx = px - width / 2;
      const dy = py - height / 2;
      const radius = Math.hypot(dx, dy);
      let activeType = effect.type;
      let regionWeight = effect.region.mode === "focus" ? 0 : 1;
      if (effect.region.mode === "focus") {
        for (const spot of effect.region.spots) {
          if (spot.type === "none") continue;
          const distance = Math.hypot(px - spot.centerX * width, py - spot.centerY * height) / Math.sqrt(width * height);
          const weight = Math.max(0, Math.min(1, (spot.radius - distance) / spot.feather));
          if (options.mixedSpotTypes === true) {
            if (weight > 0) {
              activeType = spot.type;
              regionWeight = weight;
            }
          } else {
            regionWeight = Math.max(regionWeight, weight);
          }
        }
      }
      const weight = envelope * regionWeight;
      if (!weight) continue;
      let offsetX = 0;
      let offsetY = 0;
      if (activeType === "wave") offsetX = amplitude * Math.sin(6 * Math.PI * py / height - phase);
      if (activeType === "bend") offsetX = amplitude * 2 * (2 * py / height - 1) ** 2 * Math.sin(phase);
      if (activeType === "ripple") {
        const wave = Math.sin(6 * Math.PI * radius / Math.sqrt(width * height) - phase);
        offsetX = amplitude * dx / (radius + 1) * wave;
        offsetY = amplitude * dy / (radius + 1) * wave;
      }
      if (activeType === "pulse") {
        const pulse = effect.intensity / 100 * 0.045 * Math.sin(phase);
        offsetX = dx * pulse;
        offsetY = dy * pulse;
      }
      if (activeType === "flag") { offsetX = amplitude * 0.4 * py / height * Math.sin(phase); offsetY = amplitude * 0.35 * Math.sin(4 * Math.PI * px / width - phase); }
      if (activeType === "liquid") { offsetX = amplitude * 0.6 * Math.sin(6 * Math.PI * py / height - phase); offsetY = amplitude * 0.45 * Math.sin(4 * Math.PI * px / width + phase); }
      if (activeType === "twist") { const turn = amplitude * 1.5 * Math.sin(phase) * Math.max(0, 1 - radius / Math.sqrt(width * height)); offsetX = -dy / (radius + 1) * turn; offsetY = dx / (radius + 1) * turn; }
      if (activeType === "shear") offsetX = amplitude * (2 * py / height - 1) * Math.sin(phase);
      if (activeType === "jelly") { offsetX = amplitude * 0.65 * Math.sin(4 * Math.PI * py / height - phase); offsetY = amplitude * 0.35 * Math.sin(4 * Math.PI * px / width - phase); }
      const cellWidth = Math.min(tile, width - x);
      const cellHeight = Math.min(tile, height - y);
      context.drawImage(source, Math.max(0, Math.min(width - cellWidth, x + offsetX * weight)), Math.max(0, Math.min(height - cellHeight, y + offsetY * weight)), cellWidth, cellHeight, x, y, cellWidth + 0.4, cellHeight + 0.4);
    }
  }
  return true;
}

let stageFrame = 0;
let stageImage = null;
let stageRowId = "";
let lastStagePaint = 0;
let stageSession = null;
let stagePlaybackState = null;

function visualEffectsForRow(session, rowId) {
  const key = String(rowId || '').trim();
  const maps = [
    session?.visualEffectsMap,
    session?.session?.visualEffectsMap,
    session?.payload?.visualEffectsMap,
    session?.script?.visualEffectsMap,
    session?.config?.visualEffectsMap,
    session?.podcastStudioUiState?.visualEffectsMap,
    session?.podcastVideoConfig?.visualEffectsMap,
    session?.session?.podcastVideoConfig?.visualEffectsMap
  ];
  return maps.find((map) => map && map[key])?.[key] || null;
}

function resolveTimelineClip(session, rowId, clock = null) {
  const key = String(rowId || "").trim();
  if (!key) return {};
  const clipsMap = (typeof window.ensureTimelineClipsByRowId === "function" ? window.ensureTimelineClipsByRowId(session, { persist: false }) : null)
    || session?.timelineClipMap
    || session?.podcastVideoConfig?.timelineClipsByRowId
    || session?.podcastStudioUiState?.timelineClipsByRowId
    || null;
  if (clipsMap && clipsMap[key]) {
    return clipsMap[key];
  }
  const runtimeEntries = window.PodcasterVideoPlayerState?.runtimeEntries
    || clock?.runtimeEntries
    || session?.runtimeEntries
    || null;
  if (Array.isArray(runtimeEntries)) {
    const entry = runtimeEntries.find((e) => String(e?.rowId || "") === key);
    if (entry) return entry;
  }
  return {};
}

function resolveActiveStageImage(stage) {
  if (!stage) return null;
  const isVisible = (el) => {
    if (!el || el.hidden) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : el.style;
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) > 0.01;
  };
  const images = Array.from(stage.querySelectorAll(".podcast-active-speaker-image:not(.podcast-active-speaker-video-backdrop)"));
  return images.find(isVisible) || images.find((el) => !el.hidden) || null;
}

function paintStage(now) {
  stageFrame = 0;
  const stage = document.querySelector("#podcastVideoStage .podcast-video-preview, #playerStage");
  const canvas = stage?.querySelector(".podcast-image-warp-stage-canvas");
  const session = stageSession || window.getActiveSession?.() || window.PodcasterVideoPlayerSession?.() || window.PodcasterUI?.getActiveSession?.();
  const clock = window.PodcasterUI?.getPlaybackState?.() || stagePlaybackState || window.PodcasterVideoPlayerControllerState || {};
  const activeRowId = String(stagePlaybackState?.activeRowId || window.podcastVideoState?.activeRowId || window.PodcasterVideoPlayerControllerState?.activeRowId || window.PodcasterVideoPlayerState?.activeRowId || stageRowId || "").trim();
  if (activeRowId && activeRowId !== stageRowId) {
    stageRowId = activeRowId;
  }
  const effect = normalizeImageWarp(visualEffectsForRow(session, stageRowId)?.imageWarp);
  const activeImage = resolveActiveStageImage(stage);
  if (activeImage && activeImage !== stageImage) {
    stageImage = activeImage;
  }
  if (!canvas || !stageImage || stageImage.hidden || !stageImage.isConnected || !hasImageWarpMotion(effect)) {
    canvas?.remove();
    stageImage = null;
    return;
  }
  if (now - lastStagePaint >= (clock.isPlaying ? 30 : 250) && stageImage.complete && stageImage.naturalWidth) {
    lastStagePaint = now;
    const stageRect = stage.getBoundingClientRect();
    const imageRect = stageImage.getBoundingClientRect();
    const left = imageRect.left - stageRect.left;
    const top = imageRect.top - stageRect.top;
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.width = `${imageRect.width}px`;
    canvas.style.height = `${imageRect.height}px`;
    const width = Math.max(2, Math.round(Math.min(1440, imageRect.width * (window.devicePixelRatio || 1))));
    const height = Math.max(2, Math.round(width * imageRect.height / Math.max(1, imageRect.width)));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const clip = resolveTimelineClip(session, stageRowId, clock);
    const durationMs = Math.max(500, Number(clip?.trimOutMs || 0) - Number(clip?.trimInMs || 0) || Number(clip?.durationMs || 8000));
    const timeSec = Math.max(0, (Number(clock.currentMs || 0) - Number(clip?.startMs || 0)) / 1000);
    drawImageWarpFrame(canvas, stageImage, effect, timeSec, durationMs / 1000);
  }
  stageFrame = requestAnimationFrame(paintStage);
}

export function syncCurrentSceneImageWarp(targetRowId = "", session = null, playbackState = null) {
  const stage = document.querySelector("#podcastVideoStage .podcast-video-preview, #playerStage");
  const image = resolveActiveStageImage(stage);
  const rowId = String(targetRowId || window.podcastVideoState?.activeRowId || playbackState?.activeRowId || window.PodcasterVideoPlayerControllerState?.activeRowId || "").trim();
  stageSession = session || stageSession || window.getActiveSession?.() || window.PodcasterVideoPlayerSession?.() || window.PodcasterUI?.getActiveSession?.();
  stagePlaybackState = playbackState || stagePlaybackState;
  const effects = visualEffectsForRow(stageSession, rowId);
  const effect = normalizeImageWarp(effects?.imageWarp);
  if (!stage || !image || !hasImageWarpMotion(effect)) {
    stage?.querySelector(".podcast-image-warp-stage-canvas")?.remove();
    stageImage = null;
    if (stageFrame) cancelAnimationFrame(stageFrame);
    stageFrame = 0;
    return;
  }
  stageImage = image;
  stageRowId = rowId;
  lastStagePaint = 0;
  if (!stage.querySelector(".podcast-image-warp-stage-canvas")) {
    const canvas = document.createElement("canvas");
    canvas.className = "podcast-image-warp-stage-canvas";
    canvas.setAttribute("aria-hidden", "true");
    stage.appendChild(canvas);
  }
  if (!stageFrame) stageFrame = requestAnimationFrame(paintStage);
}

window.PodcasterImageWarp = { normalizeImageWarp, drawImageWarpFrame, hasImageWarpMotion, syncCurrentSceneImageWarp };
