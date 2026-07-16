(function initSceneMediaRenderSpec(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.PodcasterSceneMediaRenderSpec = api;
    Object.keys(api).forEach((key) => {
      if (typeof root[key] === "undefined") {
        root[key] = api[key];
      }
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildSceneMediaRenderSpecApi() {
  const BLUR_BACKDROP_FOREGROUND_PCT = 0.76;
  const MOTION_DISTANCE_PCT = 0.08;
  const KEN_BURNS_PAN_DISTANCE_PCT = 0.10;
  const KEN_BURNS_PAN_SCALE = 1.2;
  const KEN_BURNS_ZOOM_MIN = 1;
  const KEN_BURNS_ZOOM_MAX = 1.3;

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  function even(value, fallback = 2) {
    const numeric = Math.max(2, Math.round(Number(value || fallback) || fallback));
    return numeric % 2 === 0 ? numeric : numeric + 1;
  }

  function normalizeSceneMediaVisualLayoutMode(value = "") {
    return String(value || "").trim().toLowerCase() === "blur-backdrop" ? "blur-backdrop" : "default";
  }

  function normalizeSceneMediaScale(value = 1) {
    const numeric = Math.round(clampNumber(value, 1, 2.5, 1) * 100) / 100;
    return Math.max(1, Math.min(2.5, numeric || 1));
  }

  function normalizeSceneMediaOffset(value = 0) {
    const numeric = Math.round(clampNumber(value, -0.5, 0.5, 0) * 1000) / 1000;
    return Math.max(-0.5, Math.min(0.5, numeric || 0));
  }

  function normalizeSceneMediaMotionPreset(value = "") {
    const preset = String(value || "none").trim().toLowerCase();
    return new Set(["pan-left-right", "pan-right-left", "pan-up-down", "pan-down-up"]).has(preset)
      ? preset
      : "none";
  }

  function normalizeSceneMediaVisualEffects(raw = null) {
    const source = raw && typeof raw === "object" ? raw : {};
    const allowed = ["pan-left", "pan-right", "pan-up", "pan-down", "zoom-in", "zoom-out"];
    const effects = Array.isArray(source.effects)
      ? source.effects.map((item) => String(item || "").trim()).filter((item) => allowed.includes(item))
      : [];
    const speed = Math.max(1, Math.min(10, Math.round(Number(source.speed || 5) || 5)));
    return { effects, speed };
  }

  function resolveSceneMediaFitMode({ reelMode = false, visualLayoutMode = "default", mediaKind = "video" } = {}) {
    if (normalizeSceneMediaVisualLayoutMode(visualLayoutMode) === "blur-backdrop") return "contain";
    if (reelMode === true) return "cover";
    return String(mediaKind || "").trim().toLowerCase() === "image" ? "width" : "contain";
  }

  function resolveSceneMediaFrameRect({
    canvasWidth = 1280,
    canvasHeight = 720,
    visualLayoutMode = "default"
  } = {}) {
    const width = Math.max(2, Number(canvasWidth || 1280) || 1280);
    const height = Math.max(2, Number(canvasHeight || 720) || 720);
    if (normalizeSceneMediaVisualLayoutMode(visualLayoutMode) !== "blur-backdrop") {
      return { x: 0, y: 0, width, height };
    }
    const frameWidth = width * BLUR_BACKDROP_FOREGROUND_PCT;
    const frameHeight = height * BLUR_BACKDROP_FOREGROUND_PCT;
    return {
      x: (width - frameWidth) / 2,
      y: (height - frameHeight) / 2,
      width: frameWidth,
      height: frameHeight
    };
  }

  function resolveSceneMediaKenBurns(rawEffects = null) {
    const normalized = normalizeSceneMediaVisualEffects(rawEffects);
    const order = ["pan-left", "pan-right", "pan-up", "pan-down", "zoom-in", "zoom-out"];
    const effect = order.findLast((item) => normalized.effects.includes(item)) || "";
    const durationSecBySpeed = { 1: 20, 2: 18, 3: 16, 4: 14, 5: 12, 6: 10, 7: 8, 8: 6, 9: 4, 10: 2 };
    return {
      ...normalized,
      effect,
      durationSec: durationSecBySpeed[normalized.speed] || 12,
      panDistancePct: KEN_BURNS_PAN_DISTANCE_PCT,
      panScale: KEN_BURNS_PAN_SCALE,
      zoomFrom: KEN_BURNS_ZOOM_MIN,
      zoomTo: KEN_BURNS_ZOOM_MAX
    };
  }

  function resolveSceneMediaRenderSpec(input = {}) {
    const canvasWidth = Math.max(2, Number(input.canvasWidth || 1280) || 1280);
    const canvasHeight = Math.max(2, Number(input.canvasHeight || 720) || 720);
    const sourceWidth = Math.max(2, Number(input.sourceWidth || canvasWidth) || canvasWidth);
    const sourceHeight = Math.max(2, Number(input.sourceHeight || canvasHeight) || canvasHeight);
    const visualLayoutMode = normalizeSceneMediaVisualLayoutMode(input.visualLayoutMode);
    const fitMode = resolveSceneMediaFitMode({
      reelMode: input.reelMode === true,
      visualLayoutMode,
      mediaKind: input.mediaKind
    });
    const frameRect = resolveSceneMediaFrameRect({
      canvasWidth,
      canvasHeight,
      visualLayoutMode
    });
    const baseFitScale = fitMode === "cover"
      ? Math.max(frameRect.width / sourceWidth, frameRect.height / sourceHeight)
      : (fitMode === "width"
        ? frameRect.width / sourceWidth
        : Math.min(frameRect.width / sourceWidth, frameRect.height / sourceHeight));
    const baseWidth = sourceWidth * baseFitScale;
    const baseHeight = sourceHeight * baseFitScale;
    const mediaScale = normalizeSceneMediaScale(input.mediaScale);
    const scaledWidth = baseWidth * mediaScale;
    const scaledHeight = baseHeight * mediaScale;
    const overflowX = Math.max(0, scaledWidth - frameRect.width);
    const overflowY = Math.max(0, scaledHeight - frameRect.height);
    const maxShiftX = overflowX / 2;
    const topAlignedImage = fitMode === "width";
    const maxShiftY = topAlignedImage ? overflowY : (overflowY / 2);
    const mediaOffsetXPct = normalizeSceneMediaOffset(input.mediaOffsetXPct);
    const mediaOffsetYPct = normalizeSceneMediaOffset(input.mediaOffsetYPct);
    const desiredShiftX = scaledWidth * mediaOffsetXPct;
    const desiredShiftY = scaledHeight * mediaOffsetYPct;
    const offsetShiftX = clampNumber(desiredShiftX, -maxShiftX, maxShiftX, 0);
    const offsetShiftY = topAlignedImage
      ? clampNumber(desiredShiftY, -maxShiftY, 0, 0)
      : clampNumber(desiredShiftY, -maxShiftY, maxShiftY, 0);
    const leftPx = frameRect.x + ((frameRect.width - scaledWidth) / 2) + offsetShiftX;
    const topPx = topAlignedImage
      ? frameRect.y + offsetShiftY
      : frameRect.y + ((frameRect.height - scaledHeight) / 2) + offsetShiftY;
    const motionPreset = normalizeSceneMediaMotionPreset(input.mediaMotionPreset);
    const amplitudeXPx = ["pan-left-right", "pan-right-left"].includes(motionPreset)
      ? Math.min(scaledWidth * MOTION_DISTANCE_PCT, maxShiftX)
      : 0;
    const amplitudeYPx = ["pan-up-down", "pan-down-up"].includes(motionPreset)
      ? Math.min(scaledHeight * MOTION_DISTANCE_PCT, maxShiftY)
      : 0;
    let startOffsetXPx = 0;
    let endOffsetXPx = 0;
    let startOffsetYPx = 0;
    let endOffsetYPx = 0;
    if (motionPreset === "pan-left-right") {
      startOffsetXPx = -amplitudeXPx;
      endOffsetXPx = amplitudeXPx;
    } else if (motionPreset === "pan-right-left") {
      startOffsetXPx = amplitudeXPx;
      endOffsetXPx = -amplitudeXPx;
    } else if (topAlignedImage && motionPreset === "pan-up-down") {
      // Recorre la imagen completa: borde superior del medio -> borde inferior.
      startOffsetYPx = frameRect.y - topPx;
      endOffsetYPx = (frameRect.y - overflowY) - topPx;
    } else if (topAlignedImage && motionPreset === "pan-down-up") {
      // Recorrido inverso: borde inferior del medio -> borde superior.
      startOffsetYPx = (frameRect.y - overflowY) - topPx;
      endOffsetYPx = frameRect.y - topPx;
    } else if (motionPreset === "pan-up-down") {
      startOffsetYPx = -amplitudeYPx;
      endOffsetYPx = amplitudeYPx;
    } else if (motionPreset === "pan-down-up") {
      startOffsetYPx = amplitudeYPx;
      endOffsetYPx = -amplitudeYPx;
    }
    const motion = {
      preset: motionPreset,
      amplitudeXPx,
      amplitudeYPx,
      startOffsetXPx,
      endOffsetXPx,
      startOffsetYPx,
      endOffsetYPx,
      distancePct: MOTION_DISTANCE_PCT,
      durationSec: Math.max(0.2, Number(input.durationSec || 12) || 12)
    };
    const kenBurns = resolveSceneMediaKenBurns(input.visualEffects);
    return {
      canvasRect: { width: canvasWidth, height: canvasHeight },
      frameRect,
      fitMode,
      reelMode: input.reelMode === true,
      visualLayoutMode,
      mediaKind: String(input.mediaKind || "video").trim().toLowerCase() || "video",
      baseRect: {
        width: baseWidth,
        height: baseHeight
      },
      scaledRect: {
        width: scaledWidth,
        height: scaledHeight
      },
      leftPx,
      topPx,
      overflowX,
      overflowY,
      offset: {
        xPct: mediaOffsetXPct,
        yPct: mediaOffsetYPct,
        shiftXPx: offsetShiftX,
        shiftYPx: offsetShiftY,
        maxShiftXPx: maxShiftX,
        maxShiftYPx: maxShiftY
      },
      motion,
      kenBurns,
      evenScaledSize: {
        width: even(scaledWidth, canvasWidth),
        height: even(scaledHeight, canvasHeight)
      }
    };
  }

  return {
    BLUR_BACKDROP_FOREGROUND_PCT,
    MOTION_DISTANCE_PCT,
    KEN_BURNS_PAN_DISTANCE_PCT,
    KEN_BURNS_PAN_SCALE,
    KEN_BURNS_ZOOM_MIN,
    KEN_BURNS_ZOOM_MAX,
    normalizeSceneMediaVisualLayoutMode,
    normalizeSceneMediaScale,
    normalizeSceneMediaOffset,
    normalizeSceneMediaMotionPreset,
    normalizeSceneMediaVisualEffects,
    resolveSceneMediaFitMode,
    resolveSceneMediaFrameRect,
    resolveSceneMediaKenBurns,
    resolveSceneMediaRenderSpec
  };
});
