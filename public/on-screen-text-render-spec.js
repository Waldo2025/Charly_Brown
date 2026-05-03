(function initOnScreenTextRenderSpec(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.PodcasterOnScreenTextRenderSpec = api;

    // Also attach functions to root for legacy/dashboard compatibility
    Object.keys(api).forEach((key) => {
      if (typeof root[key] === "undefined") {
        root[key] = api[key];
      }
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildOnScreenTextRenderSpecApi() {
  // Shared Constants
  const PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES = [
    { value: "Inter", label: "Inter", family: '"Inter", system-ui, sans-serif' },
    { value: "Outfit", label: "Outfit", family: '"Outfit", system-ui, sans-serif' },
    { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans", family: '"Plus Jakarta Sans", system-ui, sans-serif' },
    { value: "Lexend", label: "Lexend", family: '"Lexend", system-ui, sans-serif' },
    { value: "Montserrat", label: "Montserrat", family: '"Montserrat", system-ui, sans-serif' },
    { value: "Sora", label: "Sora", family: '"Sora", system-ui, sans-serif' },
    { value: "Urbanist", label: "Urbanist", family: '"Urbanist", system-ui, sans-serif' },
    { value: "Space Grotesk", label: "Space Grotesk", family: '"Space Grotesk", system-ui, sans-serif' },
    { value: "Poppins", label: "Poppins", family: '"Poppins", system-ui, sans-serif' },
    { value: "Syne", label: "Syne", family: '"Syne", system-ui, sans-serif' },
    { value: "Unbounded", label: "Unbounded", family: '"Unbounded", system-ui, sans-serif' },
    { value: "Bebas Neue", label: "Bebas Neue", family: '"Bebas Neue", system-ui, sans-serif' },
    { value: "Oxanium", label: "Oxanium", family: '"Oxanium", system-ui, sans-serif' },
    { value: "Roboto", label: "Roboto", family: '"Roboto", system-ui, sans-serif' },
    { value: "Nunito", label: "Nunito", family: '"Nunito", system-ui, sans-serif' },
    { value: "AvantGardeLocal", label: "Avant Garde", family: '"AvantGardeLocal", system-ui, sans-serif' },
    { value: "Bungee", label: "Bungee", family: '"Bungee", system-ui, sans-serif' },
    { value: "System", label: "Sistema", family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }
  ];

  const PODCAST_ON_SCREEN_TEXT_STYLE_PRESETS = [
    { value: "3d", label: "3D" },
    { value: "chrome", label: "Chrome" },
    { value: "glow", label: "Glow" },
    { value: "flat", label: "Plano" }
  ];

  const PODCAST_ON_SCREEN_TEXT_FONT_VARIANTS = [
    { value: "regular", label: "Regular", fontWeight: "normal", fontStyle: "normal" },
    { value: "bold", label: "Bold", fontWeight: "bold", fontStyle: "normal" },
    { value: "italic", label: "Italic", fontWeight: "normal", fontStyle: "italic" },
    { value: "bold-italic", label: "Bold Italic", fontWeight: "bold", fontStyle: "italic" }
  ];

  const STUDIO_TIMELINE_MIN_CLIP_MS = 100;

  function toFiniteNumber(v, f) {
    const n = Number(v);
    return Number.isFinite(n) ? n : f;
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  function normalizeResolutionKey(value) {
    const key = String(value || "source").trim().toLowerCase();
    return key || "source";
  }

  function resolveOnScreenTextExportCanvasSize(resolution, sourceWidth, sourceHeight) {
    const width = Math.max(2, Math.round(Number(sourceWidth || 0) || 0));
    const height = Math.max(2, Math.round(Number(sourceHeight || 0) || 0));
    switch (normalizeResolutionKey(resolution)) {
      case "480p":
        return { width: 854, height: 480 };
      case "720p":
        return { width: 1280, height: 720 };
      case "1080p":
        return { width: 1920, height: 1080 };
      case "source":
      default:
        return {
          width: width || 1280,
          height: height || 720
        };
    }
  }

  function normalizeTextAlign(value) {
    const key = String(value || "center").trim().toLowerCase();
    if (key === "left" || key === "right" || key === "justify") return key;
    return "center";
  }

  function normalizeFontWeight(value) {
    return String(value || "").trim().toLowerCase() === "bold" ? "bold" : "medium";
  }

  function normalizeFontStyle(value) {
    return String(value || "").trim().toLowerCase() === "italic" ? "italic" : "normal";
  }

  function normalizeOnScreenTextTrackSettings(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const familyMap = new Map(PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES.map((item) => [item.value, item.family]));
    const styleSet = new Set(PODCAST_ON_SCREEN_TEXT_STYLE_PRESETS.map((item) => item.value));
    const variantMap = new Map(PODCAST_ON_SCREEN_TEXT_FONT_VARIANTS.map((item) => [item.value, item]));

    const clamp01 = (value, fallback) => {
      const numeric = toFiniteNumber(value, Number.NaN);
      if (!Number.isFinite(numeric)) return fallback;
      const bounded = numeric > 1 ? numeric / 100 : numeric;
      return Math.max(0, Math.min(1, bounded));
    };

    const fontFamily = familyMap.has(String(source.fontFamily || "").trim())
      ? String(source.fontFamily || "").trim()
      : "Unbounded";
    const stylePreset = styleSet.has(String(source.stylePreset || "").trim())
      ? String(source.stylePreset || "").trim()
      : "3d";
    const textColor = String(source.textColor || "").trim() || "#f8fafc";
    const strokeColor = String(source.strokeColor || "").trim() || "#0f172a";
    const textOpacity = clamp01(source.textOpacity, 1);
    const bgPresetRaw = String(source.bgPreset || "").trim().toLowerCase();
    const bgPreset = (bgPresetRaw === "solid" || bgPresetRaw === "none" || bgPresetRaw === "glass") ? bgPresetRaw : "glass";
    const bgOpacity = clamp01(source.bgOpacity, 1);
    const bgScale = Math.max(0.6, Math.min(1.8, toFiniteNumber(source.bgScale, 1)));
    const variantRaw = String(source.fontVariant || "").trim().toLowerCase();
    const legacyFontWeight = String(source.fontWeight || "").trim().toLowerCase() === "bold" ? "bold" : "normal";
    const legacyFontStyle = String(source.fontStyle || "").trim().toLowerCase() === "italic" ? "italic" : "normal";
    const resolvedVariant = variantMap.get(variantRaw)
      || PODCAST_ON_SCREEN_TEXT_FONT_VARIANTS.find((item) => item.fontWeight === legacyFontWeight && item.fontStyle === legacyFontStyle)
      || PODCAST_ON_SCREEN_TEXT_FONT_VARIANTS[1];
    const fontWeight = resolvedVariant.fontWeight;
    const fontStyle = resolvedVariant.fontStyle;
    const textAlignRaw = String(source.textAlign || "").trim().toLowerCase();
    const textAlign = ["left", "center", "right", "justify"].includes(textAlignRaw) ? textAlignRaw : "center";
    const strokeWidthPx = Math.max(0, Math.min(12, toFiniteNumber(source.strokeWidthPx, Number.NaN)));
    const shadowEnabled = source?.shadowEnabled !== false;
    const shadowBlurPx = Math.max(0, Math.min(32, Math.round(toFiniteNumber(source.shadowBlurPx, 12))));
    const shadowOffsetXPx = Math.max(-24, Math.min(24, Math.round(toFiniteNumber(source.shadowOffsetXPx, 0))));
    const shadowOffsetYPx = Math.max(-24, Math.min(24, Math.round(toFiniteNumber(source.shadowOffsetYPx, 4))));
    const shadowOpacity = clamp01(source.shadowOpacity, 0.55);
    const safeStrokeWidthPx = Number.isFinite(strokeWidthPx)
      ? strokeWidthPx
      : Math.max(1.2, Math.min(4.2, (stylePreset === "3d" ? 2.6 : 1.9) + (fontWeight === "bold" ? 0.25 : 0)));

    return {
      enabled: source?.enabled !== false,
      showTrack: source?.showTrack !== false,
      fontFamily,
      fontSizePx: Math.max(16, Math.min(96, Math.round(toFiniteNumber(source.fontSizePx, 44)))),
      stylePreset,
      fontWeight,
      fontStyle,
      fontVariant: resolvedVariant.value,
      textAlign,
      textColor,
      strokeColor,
      strokeWidthPx: Math.round(safeStrokeWidthPx * 100) / 100,
      textOpacity,
      bgPreset,
      bgOpacity,
      bgScale,
      shadowEnabled,
      shadowBlurPx,
      shadowOffsetXPx,
      shadowOffsetYPx,
      shadowOpacity,
      overlayXPct: clampNumber(source.overlayXPct, 0, 1, 0.5),
      overlayYPct: clampNumber(source.overlayYPct, 0, 1, 0.92)
    };
  }

  function getOnScreenTextStylePresetClass(stylePreset = "") {
    const key = String(stylePreset || "").trim().toLowerCase();
    const valid = PODCAST_ON_SCREEN_TEXT_STYLE_PRESETS.some((item) => item.value === key) ? key : "3d";
    return `is-style-${valid}`;
  }

  function getOnScreenTextFontFamilyCss(fontFamily = "") {
    const key = String(fontFamily || "").trim();
    const found = PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES.find((item) => item.value === key) || PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES[0];
    return String(found?.family || '"Unbounded", system-ui, sans-serif');
  }

  function buildOnScreenTextPreviewStrokeShadowCss(settings = null, options = {}) {
    if (!settings) return "none";
    const strokeWidthPx = Math.max(0, Number(options?.strokeWidthPx || settings.strokeWidthPx || 0) || 0);
    if (strokeWidthPx <= 0) return "none";
    const color = String(settings.strokeColor || "#0f172a").trim();
    const steps = 8;
    const shadows = [];
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x = (Math.cos(angle) * strokeWidthPx).toFixed(2);
      const y = (Math.sin(angle) * strokeWidthPx).toFixed(2);
      shadows.push(`${x}px ${y}px 0 ${color}`);
    }
    return shadows.join(",");
  }

  function buildOnScreenTextPreviewShadowCss(settings = null, options = {}) {
    if (!settings || settings.shadowEnabled === false) return "none";
    const opacity = Math.max(0, Math.min(1, Number(settings.shadowOpacity ?? 0.55)));
    if (opacity <= 0.001) return "none";
    const blurPx = Math.max(0, Math.min(32, Math.round(toFiniteNumber(settings.shadowBlurPx, 12))));
    const offsetXPx = Math.max(-24, Math.min(24, Math.round(toFiniteNumber(settings.shadowOffsetXPx, 0))));
    const offsetYPx = Math.max(-24, Math.min(24, Math.round(toFiniteNumber(settings.shadowOffsetYPx, 4))));
    const color = String(settings.strokeColor || "#0f172a").trim();
    return `${offsetXPx}px ${offsetYPx}px ${blurPx}px rgba(0,0,0,${opacity})`;
  }

  function wrapOnScreenTextRenderText(text, options) {
    const config = options && typeof options === "object" ? options : {};
    const fallback = String(config.fallback || "").trim();
    const maxChars = Math.max(10, Math.round(Number(config.maxChars || 36) || 36));
    const maxLines = Math.max(1, Math.round(Number(config.maxLines || 2) || 2));
    const rawLines = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim());
    const sourceLines = rawLines.some(Boolean) ? rawLines : [fallback];
    const lines = [];
    let truncated = false;

    const pushLine = (line) => {
      if (!line) return;
      if (lines.length < maxLines) lines.push(line);
      else truncated = true;
    };

    const wrapSingleLine = (input) => {
      const words = String(input || "").split(" ").filter(Boolean);
      let current = "";
      for (const word of words) {
        const chunks = [];
        if (word.length <= maxChars) chunks.push(word);
        else {
          for (let cursor = 0; cursor < word.length; cursor += maxChars) {
            chunks.push(word.slice(cursor, cursor + maxChars));
          }
        }
        for (const chunk of chunks) {
          const next = current ? `${current} ${chunk}` : chunk;
          if (next.length <= maxChars) current = next;
          else {
            pushLine(current);
            current = chunk;
          }
          if (lines.length >= maxLines) {
            truncated = true;
            return;
          }
        }
      }
      if (!truncated && current) pushLine(current);
    };

    for (const sourceLine of sourceLines) {
      wrapSingleLine(sourceLine || fallback);
      if (truncated || lines.length >= maxLines) break;
    }

    const safeLines = lines.length ? lines.slice(0, maxLines) : (fallback ? [fallback] : []);
    if (truncated && safeLines.length) {
      const last = safeLines[safeLines.length - 1] || "";
      safeLines[safeLines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
    }
    return safeLines.join("\n");
  }

  function resolveOnScreenTextRenderSpec(input) {
    const config = input && typeof input === "object" ? input : {};
    const settings = config.settings && typeof config.settings === "object" ? config.settings : {};
    const layout = config.layout && typeof config.layout === "object" ? config.layout : {};
    const text = String(config.text || "").trim();
    const resolution = normalizeResolutionKey(config.resolution);
    const sourceWidth = Math.max(2, Math.round(Number(config.sourceWidth || 0) || 0)) || 1280;
    const sourceHeight = Math.max(2, Math.round(Number(config.sourceHeight || 0) || 0)) || 720;
    const exportCanvas = resolveOnScreenTextExportCanvasSize(resolution, sourceWidth, sourceHeight);
    const exportCanvasWidth = Math.max(2, exportCanvas.width);
    const exportCanvasHeight = Math.max(2, exportCanvas.height);
    const previewWidthPx = Math.max(1, Number(config.previewWidthPx || 0) || exportCanvasWidth);
    const previewHeightPx = Math.max(1, Number(config.previewHeightPx || 0) || exportCanvasHeight);
    const previewScaleX = Math.max(0.0001, previewWidthPx / exportCanvasWidth);
    const previewScaleY = Math.max(0.0001, previewHeightPx / exportCanvasHeight);
    const fontSizePx = clampNumber(settings.fontSizePx, 16, 96, 44);
    const lineSpacingPx = 6;
    const lineHeightPx = Math.max(fontSizePx + lineSpacingPx, Math.round(fontSizePx * 1.22));
    const widthPct = clampNumber(layout.widthPct, 0.08, 0.96, 0.38);
    const heightPct = clampNumber(layout.heightPct, 0.05, 0.6, 0.14);
    const boxWidthPx = Math.max(120, Math.round(exportCanvasWidth * widthPct));
    const minBoxHeightPx = Math.max(fontSizePx + 4, Math.round(lineHeightPx + (fontSizePx * 0.2)));
    const boxHeightPx = Math.max(minBoxHeightPx, Math.round(exportCanvasHeight * heightPct));
    const approxCharWidthPx = Math.max(9, fontSizePx * 0.56);
    const maxChars = Math.max(10, Math.floor(boxWidthPx / approxCharWidthPx));
    const maxLines = Math.max(2, Math.floor(boxHeightPx / lineHeightPx));
    const strokeWidthPx = clampNumber(settings.strokeWidthPx, 0, 12, 2);
    const shadowOpacity = clampNumber(settings.shadowOpacity, 0, 1, 0.48);
    const shadowEnabled = settings.shadowEnabled !== false && shadowOpacity > 0.001;
    const shadowBlurPx = shadowEnabled ? clampNumber(settings.shadowBlurPx, 0, 80, 18) : 0;
    const shadowX = shadowEnabled ? clampNumber(settings.shadowOffsetXPx, -80, 80, 0) : 0;
    const shadowY = shadowEnabled ? clampNumber(settings.shadowOffsetYPx, -80, 80, 8) : 0;
    const strokeEnabled = strokeWidthPx > 0.001;
    const boxEnabled = settings.boxEnabled === true && clampNumber(settings.bgOpacity, 0, 1, 0) > 0.001;
    const bottomSafetyPx = Math.round(exportCanvasHeight * 0.01);
    const xPct = clampNumber(layout.xPct, 0, Math.max(0, 1 - widthPct), 0);
    const rawYPct = clampNumber(layout.yPct, 0, 0.99, 0.92);
    const rawXPx = Math.max(0, Math.round(exportCanvasWidth * xPct));
    const rawYPx = Math.max(0, Math.round(exportCanvasHeight * rawYPct));
    const maxYPx = Math.max(0, exportCanvasHeight - (boxHeightPx * 0.5));
    const yPx = Math.max(0, Math.min(maxYPx, rawYPx));
    const textAlign = normalizeTextAlign(settings.textAlign);
    const wrappedText = wrapOnScreenTextRenderText(text, {
      fallback: String(config.fallback || "").trim(),
      maxChars,
      maxLines
    });
    let xExpr = `${rawXPx}+(${boxWidthPx}-text_w)/2`;
    if (textAlign === "left") xExpr = String(rawXPx);
    else if (textAlign === "right") xExpr = `${rawXPx + boxWidthPx}-text_w`;

    return {
      exportCanvasWidth,
      exportCanvasHeight,
      previewWidthPx,
      previewHeightPx,
      previewScaleX,
      previewScaleY,
      boxWidthPx,
      boxHeightPx,
      previewBoxWidthPx: Math.max(1, Math.round(boxWidthPx * previewScaleX * 1000) / 1000),
      previewBoxHeightPx: Math.max(1, Math.round(boxHeightPx * previewScaleY * 1000) / 1000),
      fontSizePx,
      previewFontSizePx: Math.max(1, Math.round(fontSizePx * previewScaleY * 1000) / 1000),
      lineSpacingPx,
      lineHeightPx,
      previewLineHeightPx: Math.max(1, Math.round(lineHeightPx * previewScaleY * 1000) / 1000),
      approxCharWidthPx,
      maxChars,
      maxLines,
      strokeEnabled,
      strokeWidthPx,
      previewStrokeWidthPx: Math.max(0, Math.round(strokeWidthPx * previewScaleY * 1000) / 1000),
      shadowEnabled,
      shadowBlurPx,
      previewShadowBlurPx: Math.max(0, Math.round(shadowBlurPx * previewScaleY * 1000) / 1000),
      shadowX,
      shadowY,
      previewShadowX: Math.round(shadowX * previewScaleX * 1000) / 1000,
      previewShadowY: Math.round(shadowY * previewScaleY * 1000) / 1000,
      shadowOpacity,
      boxEnabled,
      textAlign,
      fontWeight: normalizeFontWeight(settings.fontWeight),
      fontStyle: normalizeFontStyle(settings.fontStyle),
      wrappedText,
      rawXPx,
      rawYPx,
      xPct,
      yPct: rawYPct,
      clampedYPct: Math.max(0, Math.min(1, yPx / exportCanvasHeight)),
      bottomSafetyPx,
      bottomSafetyPct: Math.max(0, Math.min(1, bottomSafetyPx / exportCanvasHeight)),
      yPx,
      xExpr
    };
  }

  function resolveOnScreenTextRenderMetrics(settings = null, options = {}) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const previewWidthPx = Math.max(1, Math.round(Number(options?.previewWidthPx || options?.overlayWidthPx || options?.bubbleWidthPx || 0) || 0));
    const previewHeightPx = Math.max(1, Math.round(Number(options?.previewHeightPx || options?.overlayHeightPx || options?.bubbleHeightPx || 0) || 0));
    const widthPct = Math.max(0.08, Math.min(0.96, Number(options?.widthPct || 0.38)));
    const heightPct = Math.max(0.05, Math.min(0.6, Number(options?.heightPct || 0.14)));
    const sourceWidth = Math.max(160, Math.round(Number(options?.sourceWidth || 1280)));
    const sourceHeight = Math.max(90, Math.round(Number(options?.sourceHeight || 720)));

    const spec = resolveOnScreenTextRenderSpec({
      settings: current,
      layout: {
        widthPct,
        heightPct,
        xPct: Number(options?.xPct || 0),
        yPct: Number(options?.yPct || 0)
      },
      resolution: options?.resolution || "source",
      sourceWidth,
      sourceHeight,
      previewWidthPx,
      previewHeightPx,
      text: String(options?.text || "").trim(),
      fallback: String(options?.fallback || "").trim()
    });

    return {
      ...spec,
      stylePreset: getOnScreenTextStylePresetClass(current.stylePreset),
      bubbleWidthPx: spec.boxWidthPx,
      bubbleHeightPx: spec.boxHeightPx,
      borderWidthPx: spec.strokeWidthPx,
      previewBorderWidthPx: spec.previewStrokeWidthPx,
      horizontalPaddingPx: 0,
      previewHorizontalPaddingPx: 0,
      innerBoxWidthPx: spec.boxWidthPx,
      previewInnerBoxWidthPx: spec.previewBoxWidthPx,
      previewApproxCharWidthPx: Math.max(6, Math.round(spec.approxCharWidthPx * spec.previewScaleX * 1000) / 1000)
    };
  }

  function buildOnScreenTextBubbleInlineStyle(settings = null, options = {}) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const fontFamily = getOnScreenTextFontFamilyCss(current.fontFamily);
    const metrics = options?.metrics || resolveOnScreenTextRenderMetrics(current, options);
    const fontSizePx = metrics.previewFontSizePx;
    const align = String(current.textAlign || "center").trim().toLowerCase();
    const textAlign = align === "justify" ? "justify" : align;
    const parts = [
      `--pod-onscreen-text-font-family:${fontFamily}`,
      `--pod-onscreen-text-font-size:${fontSizePx}px`,
      `--pod-onscreen-text-font-weight:${current.fontWeight === "bold" ? "700" : "500"}`,
      `--pod-onscreen-text-font-style:${current.fontStyle === "italic" ? "italic" : "normal"}`,
      `--pod-onscreen-text-font-variant:${String(current.fontVariant || "regular")}`,
      `--pod-onscreen-text-align:${textAlign}`,
      `--pod-onscreen-text-stroke-color:${current.strokeColor || "#0f172a"}`,
      `--pod-onscreen-text-line-height:${metrics.previewLineHeightPx}px`,
      `--pod-onscreen-text-border-width:${metrics.previewBorderWidthPx}px`,
      `--pod-onscreen-text-bg-opacity:${current.bgOpacity ?? 0.82}`,
      `--pod-onscreen-text-bg-scale:${current.bgScale ?? 1.0}`,
      `--pod-onscreen-text-stroke-shadow:${buildOnScreenTextPreviewStrokeShadowCss(current, { strokeWidthPx: metrics.previewBorderWidthPx })}`,
      `--pod-onscreen-text-user-shadow:${buildOnScreenTextPreviewShadowCss(current, { strokeWidthPx: metrics.previewBorderWidthPx })}`,
      `font-size:${fontSizePx}px !important`,
      `line-height:${metrics.previewLineHeightPx}px !important`
    ];
    return parts.join(";");
  }

  function getOnScreenTextClipEffectiveDurationMs(clip = null) {
    if (!clip) return STUDIO_TIMELINE_MIN_CLIP_MS;
    const trimInMs = Math.max(0, Number(clip?.trimInMs || 0) || 0);
    const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(clip?.trimOutMs || 0) || 0);
    return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, trimOutMs - trimInMs);
  }

  return {
    resolveOnScreenTextExportCanvasSize,
    wrapOnScreenTextRenderText,
    resolveOnScreenTextRenderSpec,
    normalizeOnScreenTextTrackSettings,
    resolveOnScreenTextRenderMetrics,
    getOnScreenTextStylePresetClass,
    buildOnScreenTextBubbleInlineStyle,
    getOnScreenTextClipEffectiveDurationMs,
    toFiniteNumber
  };
});
