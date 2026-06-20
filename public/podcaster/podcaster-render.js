import {
  normalizeMontageRenderMode,
  resolveMontageActiveOverlayCards
} from "./podcaster-montage-render-surface.js";

const renderState = {
  started: false,
  completed: false,
  lastCardsSignature: "",
  lastTextSignature: ""
};

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #020617;
    }
    body {
      display: grid;
      place-items: center;
      font-family: Inter, system-ui, sans-serif;
    }
    .montage-render-stage {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #020617;
    }
    .montage-render-stage video,
    .montage-render-stage canvas,
    .montage-render-stage img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .montage-render-stage video {
      object-fit: fill;
      background: #020617;
    }
    .montage-render-stage canvas {
      pointer-events: none;
    }
    .montage-render-cards {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .montage-render-text-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .montage-render-text-layer .podcast-onscreen-text-overlay {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      pointer-events: none;
      opacity: 1;
      transform: none;
    }
    .montage-render-text-layer .podcast-on-screen-text-content {
      pointer-events: none;
      cursor: default;
      z-index: 1;
    }
    .montage-render-card {
      position: absolute;
      left: calc(var(--x) * 100%);
      top: calc(var(--y) * 100%);
      width: calc(var(--w) * 100%);
      min-height: calc(var(--h) * 100%);
      padding: 18px 20px;
      box-sizing: border-box;
      border-radius: 22px;
      background: color-mix(in srgb, var(--bg) 88%, transparent);
      color: var(--text);
      border-left: 10px solid var(--accent);
      box-shadow: 0 16px 42px rgba(2, 6, 23, 0.38);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
      transform: translate3d(0, 0, 0);
      opacity: 1;
    }
    .montage-render-card[data-phase="exit"] {
      opacity: 0.92;
    }
    .montage-render-card-line {
      display: block;
      font-size: calc(22px * var(--font-scale));
      line-height: 1.1;
      font-weight: 600;
      letter-spacing: -0.02em;
      text-shadow: 0 2px 10px rgba(2, 6, 23, 0.25);
    }
    .montage-render-card-line.is-primary {
      font-size: calc(34px * var(--font-scale));
      font-weight: 800;
    }
    .montage-render-brand {
      position: absolute;
      object-fit: contain;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

function buildCardHtml(item = {}) {
  const card = item.card || {};
  const pos = card.position || {};
  const style = card.style || {};
  const widthPct = Math.max(0.22, Math.min(0.9, Number(pos.widthPct || 0.56) || 0.56));
  const heightPct = Math.max(0.12, Math.min(0.55, Number(pos.heightPct || 0.2) || 0.2));
  const xPct = Math.max(0, Math.min(1 - widthPct, Number(pos.xPct || 0) || 0));
  const yPct = Math.max(0, Math.min(1 - heightPct, Number(pos.yPct || 0) || 0));
  const textLines = Array.isArray(card.textLines) ? card.textLines : [];
  return `
    <div
      class="montage-render-card"
      data-phase="${escapeHtml(item.phase || "enter")}"
      style="--x:${xPct};--y:${yPct};--w:${widthPct};--h:${heightPct};--accent:${escapeHtml(style.accentColor || "#7c5cff")};--bg:${escapeHtml(style.backgroundColor || "#0f172a")};--text:${escapeHtml(style.textColor || "#f8fafc")};--font-scale:${Math.max(0.65, Number(style.fontScale || 1) || 1)};z-index:${Math.max(1, Number(card.zIndex || 1) || 1)}"
    >
      ${textLines.map((line, index) => `<span class="montage-render-card-line${index === 0 ? " is-primary" : ""}">${escapeHtml(line)}</span>`).join("")}
    </div>
  `;
}

function updateCards(layer, cards = [], currentMs = 0) {
  const activeCards = resolveMontageActiveOverlayCards(cards, currentMs);
  const signature = activeCards.map((item) => [
    item.card?.id,
    item.phase,
    JSON.stringify(item.card?.position || {}),
    JSON.stringify(item.card?.style || {}),
    (item.card?.textLines || []).join("~")
  ].join(":")).join("|");
  if (signature === renderState.lastCardsSignature) return;
  renderState.lastCardsSignature = signature;
  layer.innerHTML = activeCards.map((item) => buildCardHtml(item)).join("");
}

function placeBrandOverlay(img, overlay = {}, width = 1280) {
  if (!overlay || typeof overlay !== "object" || overlay.enabled !== true || !overlay.assetPath) {
    img.hidden = true;
    return;
  }
  const widthPct = Math.max(0.04, Math.min(0.4, Number(overlay.widthPct || 0.05) || 0.05));
  const marginPct = Math.max(0, Math.min(0.2, Number(overlay.marginPct || 0.025) || 0.025));
  const side = String(overlay.position || "top-right").trim();
  const marginPx = Math.round(width * marginPct);
  const overlayWidthPx = Math.max(48, Math.round(width * widthPct));
  img.hidden = false;
  img.src = overlay.assetUrl || overlay.assetPath;
  img.style.width = `${overlayWidthPx}px`;
  img.style.height = "auto";
  img.style.left = side.includes("left") ? `${marginPx}px` : "auto";
  img.style.right = side.includes("left") ? "auto" : `${marginPx}px`;
  img.style.top = side.includes("bottom") ? "auto" : `${marginPx}px`;
  img.style.bottom = side.includes("bottom") ? `${marginPx}px` : "auto";
  img.style.opacity = `${Math.max(0, Math.min(1, Number(overlay.opacity ?? 1)) || 1)}`;
}

function prepareBrandOverlay(img, overlay = {}, width = 1280) {
  placeBrandOverlay(img, overlay, width);
  if (!overlay || typeof overlay !== "object" || overlay.enabled !== true || !overlay.assetPath) {
    return Promise.resolve();
  }
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      img.removeEventListener("error", handleError);
      resolve();
    };
    const handleError = () => {
      img.removeEventListener("load", handleLoad);
      reject(new Error("brand_overlay_load_failed"));
    };
    img.addEventListener("load", handleLoad, { once: true });
    img.addEventListener("error", handleError, { once: true });
  });
}

function renderOnScreenText(layer, payload = {}, currentMs = 0, width = 1280, height = 720) {
  const segments = Array.isArray(payload?.onScreenTextTimeline?.segments) ? payload.onScreenTextTimeline.segments : [];
  const settings = payload?.onScreenTextTimeline?.settings || {};
  const activeSegment = segments.find((segment) => {
    const startMs = Math.max(0, Number(segment?.startMs || 0) || 0);
    const durationMs = Math.max(1, Number(segment?.durationMs || 0) || 1);
    return currentMs >= startMs && currentMs < (startMs + durationMs);
  }) || null;
  if (!activeSegment || typeof globalThis.resolveOnScreenTextPreviewLayoutSpec !== "function") {
    if (renderState.lastTextSignature) {
      renderState.lastTextSignature = "";
      layer.innerHTML = "";
    }
    return;
  }
  const text = String(activeSegment.text || "").trim();
  if (!text) {
    if (renderState.lastTextSignature) {
      renderState.lastTextSignature = "";
      layer.innerHTML = "";
    }
    return;
  }
  const previewSpec = globalThis.resolveOnScreenTextPreviewLayoutSpec({
    rowId: String(activeSegment.rowId || "").trim(),
    settings,
    layout: activeSegment.layout || {},
    resolution: payload?.resolution || "source",
    sourceWidth: width,
    sourceHeight: height,
    previewWidthPx: width,
    previewHeightPx: height,
    text,
    wrappedText: activeSegment.wrappedText || "",
    fallback: ""
  });
  const metrics = previewSpec?.metrics || {};
  const audioClip = payload?.dialogueAudioMap?.[String(activeSegment.rowId || "").trim()] || null;
  const activeWordIndex = typeof globalThis.resolveActiveKaraokeWordIndex === "function"
    ? globalThis.resolveActiveKaraokeWordIndex(audioClip?.wordTimings || [], currentMs, Number(activeSegment.startMs || 0) || 0, Number(audioClip?.playbackRate || 1) || 1)
    : -1;
  const markup = typeof globalThis.buildKaraokeSubtitleMarkup === "function"
    ? globalThis.buildKaraokeSubtitleMarkup(text, audioClip?.wordTimings || [], activeWordIndex)
    : escapeHtml(text);
  const signature = JSON.stringify({
    id: activeSegment.id || activeSegment.rowId || "",
    activeWordIndex,
    text,
    xPct: previewSpec?.xPct,
    yPct: previewSpec?.yPct,
    w: previewSpec?.bubbleWidthPx,
    h: previewSpec?.bubbleHeightPx,
    fontSizePx: metrics.previewFontSizePx,
    wrappedText: previewSpec?.wrappedText || text,
    presetClass: previewSpec?.presetClass,
    bgClass: previewSpec?.bgClass
  });
  if (signature === renderState.lastTextSignature) return;
  renderState.lastTextSignature = signature;
  const inlineStyle = typeof globalThis.buildOnScreenTextBubbleInlineStyle === "function"
    ? globalThis.buildOnScreenTextBubbleInlineStyle(settings, {
      metrics,
      xPct: previewSpec?.xPct ?? activeSegment?.layout?.xPct ?? 0,
      yPct: previewSpec?.yPct ?? activeSegment?.layout?.yPct ?? 0
    })
    : "";
  const rawCssText = String(inlineStyle || "");
  const presetClass = String(
    previewSpec?.presetClass
    || (typeof globalThis.getOnScreenTextStylePresetClass === "function"
      ? globalThis.getOnScreenTextStylePresetClass(settings.stylePreset)
      : "is-style-3d")
  ).trim() || "is-style-3d";
  const bgClass = String(
    previewSpec?.bgClass
    || (typeof globalThis.getOnScreenTextBgPresetClass === "function"
      ? globalThis.getOnScreenTextBgPresetClass(settings.bgPreset)
      : "is-bg-none")
  ).trim() || "is-bg-none";
  layer.innerHTML = `<div class="podcast-onscreen-text-overlay is-visible" aria-hidden="true"><div class="podcast-on-screen-text-content ${presetClass} ${bgClass}" data-row-id="${escapeHtml(String(activeSegment.rowId || "").trim())}">${markup}</div></div>`;
  const contentNode = layer.querySelector(".podcast-on-screen-text-content");
  if (contentNode) {
    rawCssText.split(";").filter(Boolean).forEach((prop) => {
      const [key, ...valParts] = prop.split(":");
      if (!key || !valParts.length) return;
      const value = valParts.join(":").trim();
      contentNode.style.setProperty(key.trim(), value);
    });
    const bubbleWidthPx = Number(previewSpec?.bubbleWidthPx || 0) || 0;
    const bubbleHeightPx = Number(previewSpec?.bubbleHeightPx || 0) || 0;
    if (bubbleWidthPx > 0 && bubbleHeightPx > 0) {
      contentNode.style.setProperty("--pod-onscreen-text-bubble-width", `${bubbleWidthPx}px`);
      contentNode.style.setProperty("min-height", `${bubbleHeightPx}px`);
      contentNode.style.setProperty("height", "auto");
    }
  }
}

async function boot() {
  try {
    const config = globalThis.__PODCASTER_MONTAGE_RENDER_CONFIG__ || {};
    const payload = config.payload && typeof config.payload === "object" ? config.payload : {};
    const renderMode = normalizeMontageRenderMode(payload.renderMode || config.renderMode || "browser");
    if (renderMode !== "browser") {
      globalThis.__podcasterMontageRenderError = "render_mode_not_browser";
      return;
    }

    injectStyles();
    const stage = document.createElement("div");
    stage.className = "montage-render-stage";
    const video = document.createElement("video");
    video.src = String(config.baseVideoUrl || "").trim();
    video.preload = "auto";
    video.autoplay = false;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    const subtitleCanvas = document.createElement("canvas");
    const cardsLayer = document.createElement("div");
    cardsLayer.className = "montage-render-cards";
    const textLayer = document.createElement("div");
    textLayer.className = "montage-render-text-layer";
    const brandImg = document.createElement("img");
    brandImg.className = "montage-render-brand";
    brandImg.hidden = true;
    stage.append(video, subtitleCanvas, textLayer, cardsLayer, brandImg);
    document.body.append(stage);

    const width = Math.max(2, Math.round(Number(config.viewport?.width || config.width || 1280) || 1280));
    const height = Math.max(2, Math.round(Number(config.viewport?.height || config.height || 720) || 720));
    subtitleCanvas.width = width;
    subtitleCanvas.height = height;
    subtitleCanvas.hidden = true;
    await prepareBrandOverlay(brandImg, payload.brandOverlay || null, width);
    try {
      await document.fonts.ready;
    } catch (_) {}
    globalThis.__podcasterMontageRenderReady = true;

    const tick = () => {
      if (renderState.completed) return;
      const currentMs = Math.max(0, Math.round((Number(video.currentTime || 0) || 0) * 1000));
      updateCards(cardsLayer, payload.overlayCards?.segments || payload.overlayCards || [], currentMs);
      renderOnScreenText(textLayer, payload, currentMs, width, height);
      if (!video.paused && !video.ended) requestAnimationFrame(tick);
    };

    const finish = () => {
      renderState.completed = true;
      globalThis.__podcasterMontageRenderDone = true;
    };

    video.addEventListener("loadedmetadata", () => {
      renderOnScreenText(textLayer, payload, 0, width, height);
    });
    video.addEventListener("play", () => {
      if (!renderState.started) renderState.started = true;
      requestAnimationFrame(tick);
    });
    video.addEventListener("timeupdate", () => {
      const currentMs = Math.max(0, Math.round((Number(video.currentTime || 0) || 0) * 1000));
      renderOnScreenText(textLayer, payload, currentMs, width, height);
    });
    video.addEventListener("ended", finish);
    video.addEventListener("error", () => {
      globalThis.__podcasterMontageRenderError = "video_playback_error";
      finish();
    });

    try {
      await video.play();
    } catch (error) {
      globalThis.__podcasterMontageRenderError = String(error?.message || error || "video_play_failed");
      finish();
    }
  } catch (error) {
    globalThis.__podcasterMontageRenderError = String(error?.message || error || "montage_render_boot_failed");
  }
}

void boot();
