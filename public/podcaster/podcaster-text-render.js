(function initPodcasterTextRenderSpec(root, factory) {
  const api = factory(root || (typeof globalThis !== "undefined" ? globalThis : this));
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.PodcasterTextRenderSpec = api;
    root.PodcasterKaraokeRenderSpec = api;
    Object.keys(api).forEach((key) => {
      if (typeof root[key] === "undefined") {
        root[key] = api[key];
      }
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildPodcasterTextRenderSpec(root) {
  const onScreenTextApi = root?.PodcasterOnScreenTextRenderSpec
    || (typeof require === "function" ? require("./podcaster-on-screen-text.js") : null)
    || {};

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function tokenizeSubtitleText(text = "") {
    return String(text || "").match(/(\s+|[^\s]+)/g) || [];
  }

  function normalizeTimingValue(value, fallback = Number.NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    const source = String(value || "").trim();
    if (!source) return fallback;
    const secondsMatch = source.match(/^(\d+(?:\.\d+)?)s$/i);
    if (secondsMatch) {
      return Math.round((Number(secondsMatch[1]) || 0) * 1000);
    }
    const numeric = Number(source);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function estimateProportionalWordTimings(words = [], durationMs = 0) {
    if (!Array.isArray(words) || !words.length || !durationMs || durationMs <= 0) return [];
    const totalChars = words.reduce((sum, w) => sum + w.length, 0);
    if (totalChars <= 0) {
      const wordDur = Math.round(durationMs / words.length);
      return words.map((w, index) => ({
        text: w,
        startMs: index * wordDur,
        endMs: Math.min(durationMs, (index + 1) * wordDur),
        tokenIndex: index
      }));
    }
    let currentStartMs = 0;
    return words.map((word, index) => {
      const weight = word.length / totalChars;
      const wordDur = Math.round(weight * durationMs);
      const startMs = currentStartMs;
      const endMs = index === words.length - 1 ? durationMs : Math.min(durationMs, currentStartMs + wordDur);
      currentStartMs = endMs;
      return {
        text: word,
        startMs,
        endMs,
        tokenIndex: index
      };
    });
  }

  function normalizeKaraokeWordTimings(audioClip = null, subtitleText = "") {
    const source = Array.isArray(audioClip?.wordTimings)
      ? audioClip.wordTimings
      : Array.isArray(audioClip?.alignment?.words)
        ? audioClip.alignment.words
        : Array.isArray(audioClip?.words)
          ? audioClip.words
          : [];
    const subtitleWords = String(subtitleText || "").trim().split(/\s+/).filter(Boolean);
    const next = [];
    source.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const text = String(item.text || item.word || item.token || subtitleWords[index] || "").replace(/\s+/g, " ").trim();
      const startMs = Math.max(0, Math.round(normalizeTimingValue(
        item.startMs ?? item.startTimeMs ?? item.start ?? item.offsetMs ?? item.offset
      )));
      const endMs = Math.max(0, Math.round(normalizeTimingValue(
        item.endMs ?? item.endTimeMs ?? item.end ?? item.offsetEndMs
      )));
      if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;
      next.push({
        text,
        startMs,
        endMs,
        tokenIndex: next.length
      });
    });
    if (!next.length) {
      const durationMs = audioClip?.durationMs ?? (audioClip?.durationSec != null ? audioClip.durationSec * 1000 : (audioClip?.duration != null ? audioClip.duration * 1000 : 0));
      if (durationMs > 0 && subtitleWords.length > 0) {
        return estimateProportionalWordTimings(subtitleWords, durationMs);
      }
    }
    next.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.tokenIndex - b.tokenIndex);
    return next.map((item, index) => ({
      text: item.text,
      startMs: item.startMs,
      endMs: item.endMs,
      tokenIndex: index
    }));
  }

  function resolveActiveKaraokeWordIndex(wordTimings = [], currentMs = 0, clipStartMs = 0, clipPlaybackRate = 1) {
    const safeWordTimings = Array.isArray(wordTimings) ? wordTimings : [];
    const rate = Number(clipPlaybackRate || 1);
    const localMs = Math.max(0, Math.round((Number(currentMs || 0) - Number(clipStartMs || 0)) * rate));
    const active = safeWordTimings.find((item) => localMs >= Number(item?.startMs || 0) && localMs < Number(item?.endMs || 0));
    return active ? Number(active.tokenIndex || 0) : -1;
  }

  function buildKaraokeSubtitleMarkup(text = "", wordTimings = [], activeIndex = -1) {
    const tokens = tokenizeSubtitleText(text);
    if (!tokens.length || !Array.isArray(wordTimings) || !wordTimings.length) {
      return escapeHtml(text);
    }
    let wordIndex = 0;
    return tokens.map((token) => {
      if (/^\s+$/.test(token)) return token;
      const isActive = wordIndex === activeIndex;
      const className = `podcast-karaoke-word${isActive ? " is-active" : ""}`;
      const html = `<span class="${className}" data-karaoke-index="${wordIndex}" style="font-size: inherit !important;">${escapeHtml(token)}</span>`;
      wordIndex += 1;
      return html;
    }).join("");
  }

  function buildOnScreenTextRasterStyleBlock() {
    return `
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      body {
        display: block;
      }
      .podcaster-onscreen-text-raster-shell {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: visible;
        background: transparent;
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content {
        position: relative !important;
        left: auto !important;
        top: auto !important;
        transform: none !important;
        max-width: min(96%, 1400px);
        display: block;
        box-sizing: border-box;
        padding: calc(0.26em * var(--pod-onscreen-text-bg-scale, 1)) calc(0.72em * var(--pod-onscreen-text-bg-scale, 1));
        border-radius: calc(0.82em * var(--pod-onscreen-text-bg-scale, 1));
        color: var(--pod-onscreen-text-color, #f8fafc);
        font-family: var(--pod-onscreen-text-font-family, inherit);
        font-size: var(--pod-onscreen-text-font-size, 16px);
        font-weight: var(--pod-onscreen-text-font-weight, 500);
        font-style: var(--pod-onscreen-text-font-style, normal);
        text-align: var(--pod-onscreen-text-align, center);
        letter-spacing: 0;
        line-height: var(--pod-onscreen-text-line-height, 1.22em);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        text-wrap: pretty;
        text-shadow: var(--pod-onscreen-text-stroke-shadow), var(--pod-onscreen-text-preset-shadow), var(--pod-onscreen-text-user-shadow);
        -webkit-text-stroke: 0 transparent;
        background: transparent;
        box-shadow: none;
        backdrop-filter: none;
        user-select: none;
        width: var(--pod-onscreen-text-bubble-width, auto);
        height: auto;
        min-width: 0;
        min-height: var(--pod-onscreen-text-bubble-height, 0px);
        opacity: var(--pod-onscreen-text-opacity, 1);
        display: block;
        overflow: visible;
        pointer-events: none;
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-bg-solid {
        background: rgba(2, 6, 23, calc(0.82 * var(--pod-onscreen-text-bg-opacity, 1))) !important;
        box-shadow:
          0 14px 30px rgba(2, 6, 23, 0.36),
          inset 0 1px 0 rgba(255, 255, 255, 0.07);
        backdrop-filter: blur(7px) saturate(1.02) !important;
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-bg-glass {
        background: rgba(15, 23, 42, calc(0.65 * var(--pod-onscreen-text-bg-opacity, 1))) !important;
        backdrop-filter: blur(12px) saturate(1.1) !important;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-bg-none {
        background: transparent !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        padding-inline: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        max-width: min(96%, var(--pod-onscreen-text-bubble-width, 1400px)) !important;
        min-width: 0 !important;
        min-height: 0 !important;
        text-align: var(--pod-onscreen-text-align, center);
        overflow-wrap: break-word;
        word-break: normal;
        text-wrap: pretty;
        --pod-onscreen-text-stroke-color: rgba(2, 6, 23, 0.9);
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-style-3d.is-bg-none {
        max-width: min(96%, var(--pod-onscreen-text-bubble-width, 1200px)) !important;
        min-width: 0 !important;
        transform: translateY(0.16em);
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-style-3d.is-bg-solid {
        box-sizing: border-box;
        text-wrap: normal;
        width: auto;
        max-width: calc(100% - 8px);
        padding-inline: calc(0.32em * var(--pod-onscreen-text-bg-scale, 1));
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-style-flat {
        --pod-onscreen-text-preset-shadow:
          0 2px 6px rgba(2, 6, 23, 0.28),
          0 8px 18px rgba(2, 6, 23, 0.18);
        --pod-onscreen-text-stroke-color: rgba(15, 23, 42, 0.48);
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-style-3d {
        --pod-onscreen-text-preset-shadow:
          0 1px 0 rgba(255, 255, 255, 0.06),
          0 2px 6px rgba(2, 6, 23, 0.24),
          0 10px 20px rgba(2, 6, 23, 0.18);
        --pod-onscreen-text-stroke-color: rgba(15, 23, 42, 0.52);
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-style-glow {
        max-width: min(96%, 1400px) !important;
        --pod-onscreen-text-preset-shadow:
          0 0 8px rgba(255, 255, 255, 0.18),
          0 0 18px rgba(56, 189, 248, 0.24),
          0 6px 16px rgba(2, 6, 23, 0.24);
        --pod-onscreen-text-stroke-color: rgba(15, 23, 42, 0.42);
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content.is-style-chrome {
        --pod-onscreen-text-preset-shadow:
          0 2px 8px rgba(2, 6, 23, 0.30),
          0 10px 22px rgba(2, 6, 23, 0.22);
        --pod-onscreen-text-stroke-color: rgba(15, 23, 42, 0.48);
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content,
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content span,
      .podcaster-onscreen-text-raster-shell .podcast-karaoke-word {
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
      .podcaster-onscreen-text-raster-shell .podcast-on-screen-text-content span,
      .podcaster-onscreen-text-raster-shell .podcast-karaoke-word {
        display: inline;
        color: inherit;
        font-size: inherit !important;
        font-family: inherit;
        font-weight: inherit;
        font-style: inherit;
      }
      .podcaster-onscreen-text-raster-shell .podcast-karaoke-word.is-active {
        color: #fff7bf;
        filter: brightness(1.08);
        text-shadow:
          0 0 0.18em rgba(255, 247, 191, 0.92),
          0 0 0.6em rgba(255, 214, 10, 0.5),
          var(--pod-onscreen-text-stroke-shadow),
          var(--pod-onscreen-text-preset-shadow),
          var(--pod-onscreen-text-user-shadow);
      }
    `;
  }

  function buildOnScreenTextRasterSnapshotPlan(input = {}) {
    const config = input && typeof input === "object" ? input : {};
    const onScreenTextApi = root?.PodcasterOnScreenTextRenderSpec || root?.PodcasterKaraokeRenderSpec || {};
    const resolvePreviewLayoutSpec = typeof onScreenTextApi.resolveOnScreenTextPreviewLayoutSpec === "function"
      ? onScreenTextApi.resolveOnScreenTextPreviewLayoutSpec
      : null;
    const buildBubbleInlineStyle = typeof onScreenTextApi.buildOnScreenTextBubbleInlineStyle === "function"
      ? onScreenTextApi.buildOnScreenTextBubbleInlineStyle
      : null;
    const getStylePresetClass = typeof onScreenTextApi.getOnScreenTextStylePresetClass === "function"
      ? onScreenTextApi.getOnScreenTextStylePresetClass
      : (stylePreset) => `is-style-${String(stylePreset || "").trim().toLowerCase() || "3d"}`;
    const getBgPresetClass = typeof onScreenTextApi.getOnScreenTextBgPresetClass === "function"
      ? onScreenTextApi.getOnScreenTextBgPresetClass
      : (bgPreset) => `is-bg-${String(bgPreset || "").trim().toLowerCase() || "none"}`;
    const previewSpec = resolvePreviewLayoutSpec
      ? resolvePreviewLayoutSpec({
        rowId: String(config?.rowId || config?.layout?.rowId || "").trim(),
        settings: config.settings || {},
        layout: config.layout || {},
        previewWidthPx: config.previewWidthPx,
        previewHeightPx: config.previewHeightPx,
        sourceWidth: config.sourceWidth,
        sourceHeight: config.sourceHeight,
        resolution: config.resolution || "source",
        text: String(config.text || "").trim(),
        fallback: String(config.fallback || "").trim()
      })
      : null;
    const metrics = previewSpec?.metrics || {};
    const bubbleWidthPx = Math.max(1, Math.round(Number(metrics.bubbleWidthPx || previewSpec?.bubbleWidthPx || metrics.previewBoxWidthPx || 1) || 1));
    const bubbleHeightPx = Math.max(1, Math.round(Number(metrics.bubbleHeightPx || previewSpec?.bubbleHeightPx || metrics.previewBoxHeightPx || 1) || 1));
    const padPx = Math.max(
      18,
      Math.round(
        Math.max(
          Number(metrics.previewBorderWidthPx || 0) * 2.2,
          Number(metrics.previewShadowBlurPx || 0) * 1.6,
          Math.abs(Number(metrics.previewShadowX || 0)) + Math.abs(Number(metrics.previewShadowY || 0)),
          12
        )
      )
    );
    const widthPx = bubbleWidthPx + (padPx * 2);
    const heightPx = bubbleHeightPx + (padPx * 2);
    const settings = config.settings && typeof config.settings === "object" ? config.settings : {};
    const layout = config.layout && typeof config.layout === "object" ? config.layout : {};
    const wordTimings = Array.isArray(config.wordTimings) ? config.wordTimings : [];
    const activeWordIndex = Number.isFinite(Number(config.activeWordIndex)) ? Number(config.activeWordIndex) : -1;
    const text = String(config.text || "").trim();
    const contentHtml = wordTimings.length
      ? buildKaraokeSubtitleMarkup(text, wordTimings, activeWordIndex)
      : escapeHtml(text);
    const inlineStyle = buildBubbleInlineStyle
      ? buildBubbleInlineStyle(settings, {
        metrics,
        xPct: 0,
        yPct: 0
      })
      : "";
    const presetClass = previewSpec?.presetClass || getStylePresetClass(settings.stylePreset);
    const bgClass = previewSpec?.bgClass || getBgPresetClass(settings.bgPreset);
    const html = `
      <style>${buildOnScreenTextRasterStyleBlock()}</style>
      <div xmlns="http://www.w3.org/1999/xhtml" class="podcaster-onscreen-text-raster-shell" style="width:${widthPx}px;height:${heightPx}px;padding:${padPx}px;">
        <div class="podcast-on-screen-text-content ${presetClass} ${bgClass}" data-row-id="${escapeHtml(String(config.rowId || layout.rowId || "").trim())}" style="${inlineStyle};position:relative !important;left:auto !important;top:auto !important;transform:none !important;">
          ${contentHtml}
        </div>
      </div>
    `;
    return {
      settings,
      layout,
      previewSpec,
      metrics,
      text,
      contentHtml,
      presetClass,
      bgClass,
      inlineStyle,
      padPx,
      bubbleWidthPx,
      bubbleHeightPx,
      widthPx,
      heightPx,
      html
    };
  }

  function escapeFfmpegExpr(expression = "") {
    return String(expression || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/:/g, "\\:")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function escapeFfmpegFilterPath(value = "") {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  function escapeFfmpegDrawtextText(value = "") {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/:/g, "\\:")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/%/g, "\\%")
      .replace(/\n/g, "\\n");
  }

  function toFfmpegColor(hex = "#FFFFFF", opacity = 1, fallbackHex = "FFFFFF") {
    const clean = String(hex || "").trim().replace(/^#/, "") || String(fallbackHex || "FFFFFF").replace(/^#/, "");
    const clampedOpacity = Math.max(0, Math.min(1, Number(opacity)));
    return `0x${clean}@${Number.isFinite(clampedOpacity) ? clampedOpacity.toFixed(3) : "1.000"}`;
  }

  function generateKaraokeOverlayText(wrappedText = "", activeWordIndex = -1) {
    const lines = String(wrappedText || "").split("\n");
    let wordCounter = 0;
    const nextLines = lines.map((line) => {
      const tokens = line.split(/(\s+)/);
      const nextTokens = tokens.map((token) => {
        if (!token || /^\s+$/.test(token)) {
          return token;
        }
        const currentWordIndex = wordCounter;
        wordCounter += 1;
        return currentWordIndex === activeWordIndex ? token : " ".repeat(token.length);
      });
      return nextTokens.join("");
    });
    return nextLines.join("\n");
  }

  function buildMontageOnScreenTextKaraokeBoxFilters(segments = [], settings = {}, options = {}) {
    const list = Array.isArray(segments) ? segments.filter(Boolean) : [];
    if (!list.length) return [];
    const boxOpacity = (() => {
      const bgPreset = String(settings?.bgPreset || "").trim().toLowerCase();
      const bgOpacity = Math.max(0, Math.min(1, Number(settings?.bgOpacity ?? 0) || 0));
      if (bgPreset === "none" || bgOpacity <= 0.001) return 0;
      if (bgPreset === "solid") return 0.82 * bgOpacity;
      return 0.58 * bgOpacity;
    })();
    if (boxOpacity <= 0.001) return [];
    const sourceWidth = Math.max(2, Math.round(Number(options?.sourceWidth || 1280) || 1280));
    const sourceHeight = Math.max(2, Math.round(Number(options?.sourceHeight || 720) || 720));
    const boxColor = toFfmpegColor("#020617", boxOpacity, "020617");
    return list.flatMap((segment) => {
      const startSec = Math.max(0, Number(segment?.startSec || 0) || 0);
      const endSec = Math.max(startSec + 0.1, Number(segment?.endSec || 0) || 0);
      const spec = segment?.spec && typeof segment.spec === "object" ? segment.spec : {};
      const bgScale = Math.max(0.6, Math.min(1.8, Number(spec.bgScale || settings?.bgScale || 1) || 1));
      const boxWidth = Math.max(1, Math.round(Number(spec.boxWidthPx || 0) || 1));
      const boxHeight = Math.max(1, Math.round(Number(spec.boxHeightPx || 0) || 1));
      const scaledBoxWidth = Math.max(1, Math.round(Number(spec.scaledBoxWidthPx || (boxWidth * bgScale)) || 1));
      const scaledBoxHeight = Math.max(1, Math.round(Number(spec.scaledBoxHeightPx || (boxHeight * bgScale)) || 1));
      const scaledBoxX = Math.max(0, Math.round(Number(spec.scaledBoxXPx ?? (Number(spec.rawXPx || 0) - ((scaledBoxWidth - boxWidth) / 2))) || 0));
      const scaledBoxY = Math.max(0, Math.round(Number(spec.scaledBoxYPx ?? (Number(spec.yPx || 0) - ((scaledBoxHeight - boxHeight) / 2))) || 0));
      const enableExpr = escapeFfmpegExpr(`between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})`);
      const safeX = Math.min(Math.max(0, scaledBoxX), Math.max(0, sourceWidth - 1));
      const safeY = Math.min(Math.max(0, scaledBoxY), Math.max(0, sourceHeight - 1));
      const safeWidth = Math.max(1, Math.min(scaledBoxWidth, Math.max(1, sourceWidth - safeX)));
      const safeHeight = Math.max(1, Math.min(scaledBoxHeight, Math.max(1, sourceHeight - safeY)));
      return [
        `drawbox=x=${safeX}:y=${safeY}:w=${safeWidth}:h=${safeHeight}:color=${boxColor}:t=fill:enable='${enableExpr}'`
      ];
    });
  }

  function buildMontageOnScreenTextDrawFilters(options = {}) {
    const spec = options?.spec && typeof options.spec === "object" ? options.spec : {};
    const settings = options?.settings && typeof options.settings === "object" ? options.settings : {};
    const textPath = String(options?.textPath || "");
    const fontSource = String(options?.fontSource || "");
    const textColor = String(options?.textColor || "0xF8FAFC@1.000");
    const strokeColor = String(options?.strokeColor || "0x0F172A@1.000");
    const startSec = Math.max(0, Number(options?.startSec || 0) || 0);
    const endSec = Math.max(startSec + 0.1, Number(options?.endSec || 0) || 0);
    const stylePreset = String(settings?.stylePreset || "").trim().toLowerCase();
    const bgPreset = String(settings?.bgPreset || "").trim().toLowerCase();
    const baseStrokeWidth = Math.max(0, Number(spec.strokeEnabled ? spec.strokeWidthPx : 0) || 0);
    const baseShadowColor = spec.shadowEnabled
      ? `#020617@${Math.max(0, Math.min(1, Number(spec.shadowOpacity || 0))).toFixed(3)}`
      : "#020617@0.000";
    const enableExpr = escapeFfmpegExpr(`between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})`);

    const buildLayer = (overrides = {}) => {
      const layerStrokeWidth = Number.isFinite(Number(overrides.borderw))
        ? Math.max(0, Number(overrides.borderw))
        : baseStrokeWidth;
      const layerShadowX = Number.isFinite(Number(overrides.shadowx))
        ? Number(overrides.shadowx)
        : (spec.shadowEnabled ? spec.shadowX : 0);
      const layerShadowY = Number.isFinite(Number(overrides.shadowy))
        ? Number(overrides.shadowy)
        : (spec.shadowEnabled ? spec.shadowY : 0);
      const layerTextPath = String(overrides.textPath || textPath);
      const layerEnableExpr = String(overrides.enableExpr || enableExpr);
      const isBoxOn = (spec.boxEnabled && overrides.boxEnabled !== false);
      return `drawtext=textfile='${escapeFfmpegFilterPath(layerTextPath)}'${fontSource}:reload=0:fontsize=${overrides.fontsize || spec.fontSizePx}:fontcolor=${overrides.fontcolor || textColor}:x='${overrides.xExpr || spec.xExpr}':y=${Number.isFinite(Number(overrides.yPx)) ? Number(overrides.yPx) : spec.yPx}:fix_bounds=1:line_spacing=${spec.lineSpacingPx}:borderw=${layerStrokeWidth}:bordercolor=${overrides.bordercolor || strokeColor}:shadowx=${layerShadowX}:shadowy=${layerShadowY}:shadowcolor=${overrides.shadowcolor || baseShadowColor}:${isBoxOn ? "box=1" : "box=0"}:boxcolor=${overrides.boxcolor || spec.boxColor || "0x000000@0.000"}:boxborderw=${overrides.boxborderw || spec.boxBorderWPx || 0}:enable='${layerEnableExpr}'`;
    };

    const wordTimings = Array.isArray(options.wordTimings) ? options.wordTimings : [];
    const textFileResolver = typeof options.textFileResolver === "function" ? options.textFileResolver : null;
    const isKaraoke = settings?.partyKaraoke !== false && wordTimings.length > 0 && textFileResolver && String(spec.wrappedText || spec.text || "").trim();
    const baseTextColor = isKaraoke ? toFfmpegColor("#94A3B8", settings?.textOpacity ?? 1, "94A3B8") : textColor;
    const filters = [];

    if ((stylePreset === "3d" && bgPreset === "none") || (stylePreset === "3d" && bgPreset !== "none")) {
      const depth = Math.max(2, Math.round(Number(spec.fontSizePx || 44) * 0.06));
      const visibleStrokeWidth = Math.max(baseStrokeWidth, Math.round(Number(spec.fontSizePx || 44) * 0.055), 2);
      filters.push(
        buildLayer({
          fontcolor: "#020617@0.520",
          xExpr: `(${spec.xExpr})+${depth}`,
          yPx: Math.round(Number(spec.yPx || 0) + depth),
          borderw: visibleStrokeWidth + 1,
          bordercolor: "#020617@0.760",
          shadowx: 0,
          shadowy: 0,
          shadowcolor: "#020617@0.000"
        })
      );
      filters.push(
        buildLayer({
          fontcolor: baseTextColor,
          borderw: visibleStrokeWidth,
          bordercolor: strokeColor,
          shadowx: Math.max(depth, Number(spec.shadowEnabled ? spec.shadowX : 0) || 0),
          shadowy: Math.max(depth + 1, Number(spec.shadowEnabled ? spec.shadowY : 0) || 0),
          shadowcolor: "#020617@0.620",
          boxEnabled: false
        })
      );
    } else {
      filters.push(buildLayer({ fontcolor: baseTextColor }));
    }

    if (isKaraoke) {
      const activeTextColor = toFfmpegColor("#FACC15", 1, "FACC15");
      wordTimings.forEach((word, index) => {
        const wordStartSec = startSec + (Number(word.startMs || 0) / 1000);
        const wordEndSec = startSec + (Number(word.endMs || 0) / 1000);
        if (wordStartSec >= endSec || wordEndSec <= startSec) return;
        const clampedStartSec = Math.max(startSec, wordStartSec);
        const clampedEndSec = Math.min(endSec, Math.max(clampedStartSec + 0.05, wordEndSec));
        const overlayText = generateKaraokeOverlayText(spec.wrappedText || spec.text || "", index);
        const wordTextPath = textFileResolver(overlayText);
        const wordEnableExpr = escapeFfmpegExpr(`between(t,${clampedStartSec.toFixed(3)},${clampedEndSec.toFixed(3)})`);

        if ((stylePreset === "3d" && bgPreset === "none") || (stylePreset === "3d" && bgPreset !== "none")) {
          const depth = Math.max(2, Math.round(Number(spec.fontSizePx || 44) * 0.06));
          const visibleStrokeWidth = Math.max(baseStrokeWidth, Math.round(Number(spec.fontSizePx || 44) * 0.055), 2);
          filters.push(
            buildLayer({
              fontcolor: activeTextColor,
              textPath: wordTextPath,
              enableExpr: wordEnableExpr,
              borderw: visibleStrokeWidth,
              bordercolor: strokeColor,
              shadowx: Math.max(depth, Number(spec.shadowEnabled ? spec.shadowX : 0) || 0),
              shadowy: Math.max(depth + 1, Number(spec.shadowEnabled ? spec.shadowY : 0) || 0),
              shadowcolor: "#020617@0.620",
              boxEnabled: false
            })
          );
        } else {
          filters.push(
            buildLayer({
              fontcolor: activeTextColor,
              textPath: wordTextPath,
              enableExpr: wordEnableExpr,
              boxEnabled: false
            })
          );
        }
      });
    }

    return filters;
  }

  const api = {
    ...onScreenTextApi,
    escapeHtml,
    tokenizeSubtitleText,
    normalizeTimingValue,
    estimateProportionalWordTimings,
    normalizeKaraokeWordTimings,
    resolveActiveKaraokeWordIndex,
    buildKaraokeSubtitleMarkup,
    escapeFfmpegExpr,
    escapeFfmpegFilterPath,
    escapeFfmpegDrawtextText,
    toFfmpegColor,
    generateKaraokeOverlayText,
    buildOnScreenTextRasterStyleBlock,
    buildOnScreenTextRasterSnapshotPlan,
    buildMontageOnScreenTextKaraokeBoxFilters,
    buildMontageOnScreenTextDrawFilters
  };

  return api;
});
