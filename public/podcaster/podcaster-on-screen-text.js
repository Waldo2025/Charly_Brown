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

  const PODCAST_ON_SCREEN_TEXT_LOOK_PRESETS = [
    {
      value: "studio-clean",
      label: "Studio Clean",
      hint: "Editorial limpio y legible",
      settings: {
        fontFamily: "Sora",
        fontSizePx: 40,
        stylePreset: "glow",
        bgPreset: "none",
        fontWeight: "bold",
        fontStyle: "normal",
        textAlign: "center",
        textColor: "#f8fafc",
        strokeColor: "#0f172a",
        strokeWidthPx: 2,
        textOpacity: 1,
        bgOpacity: 0,
        bgScale: 1,
        shadowEnabled: true,
        shadowBlurPx: 12,
        shadowOffsetXPx: 0,
        shadowOffsetYPx: 4,
        shadowOpacity: 0.55,
        boxWidthPct: 0.58
      }
    },
    {
      value: "headline-glow",
      label: "Headline Glow",
      hint: "Más impacto visual",
      settings: {
        fontFamily: "Unbounded",
        fontSizePx: 46,
        stylePreset: "glow",
        bgPreset: "none",
        fontWeight: "bold",
        fontStyle: "normal",
        textAlign: "center",
        textColor: "#f8fafc",
        strokeColor: "#0f172a",
        strokeWidthPx: 2.4,
        textOpacity: 1,
        bgOpacity: 0,
        bgScale: 1,
        shadowEnabled: true,
        shadowBlurPx: 18,
        shadowOffsetXPx: 0,
        shadowOffsetYPx: 5,
        shadowOpacity: 0.62,
        boxWidthPct: 0.56
      }
    },
    {
      value: "broadcast-solid",
      label: "Broadcast",
      hint: "Subtítulo clásico de alto contraste",
      settings: {
        fontFamily: "Nunito",
        fontSizePx: 38,
        stylePreset: "flat",
        bgPreset: "solid",
        fontWeight: "bold",
        fontStyle: "normal",
        textAlign: "center",
        textColor: "#f8fafc",
        strokeColor: "#0f172a",
        strokeWidthPx: 2.2,
        textOpacity: 1,
        bgOpacity: 0.9,
        bgScale: 1.12,
        shadowEnabled: false,
        shadowBlurPx: 0,
        shadowOffsetXPx: 0,
        shadowOffsetYPx: 0,
        shadowOpacity: 0,
        boxWidthPct: 0.62
      }
    },
    {
      value: "chrome-lux",
      label: "Chrome Lux",
      hint: "Acabado más ornamental",
      settings: {
        fontFamily: "Space Grotesk",
        fontSizePx: 42,
        stylePreset: "chrome",
        bgPreset: "glass",
        fontWeight: "bold",
        fontStyle: "normal",
        textAlign: "center",
        textColor: "#f8fafc",
        strokeColor: "#111827",
        strokeWidthPx: 2,
        textOpacity: 1,
        bgOpacity: 0.48,
        bgScale: 1.08,
        shadowEnabled: true,
        shadowBlurPx: 10,
        shadowOffsetXPx: 0,
        shadowOffsetYPx: 4,
        shadowOpacity: 0.4,
        boxWidthPct: 0.6
      }
    }
  ];

  const STUDIO_TIMELINE_MIN_CLIP_MS = 100;
  const STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT = 0.58;
  const STUDIO_ONSCREEN_TEXT_DEFAULT_HEIGHT_PCT = 0.14;
  const STUDIO_ONSCREEN_TEXT_DEFAULT_CENTER_X_PCT = 0.5;
  const STUDIO_ONSCREEN_TEXT_DEFAULT_BOTTOM_EDGE_PCT = 0.86;
  const STUDIO_ONSCREEN_TEXT_LEGACY_DEFAULT_X_PCT = 0.21;
  const STUDIO_ONSCREEN_TEXT_LEGACY_DEFAULT_Y_PCT = 0.7;

  function toFiniteNumber(v, f) {
    const n = Number(v);
    return Number.isFinite(n) ? n : f;
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function buildCanonicalOnScreenTextLayoutBounds(widthPct = STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT, heightPct = STUDIO_ONSCREEN_TEXT_DEFAULT_HEIGHT_PCT, settings = null) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const safeWidthPct = clampNumber(widthPct, 0.08, 0.9, STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT);
    const safeHeightPct = clampNumber(heightPct, 0.05, 0.6, STUDIO_ONSCREEN_TEXT_DEFAULT_HEIGHT_PCT);
    const centerXPct = clampNumber(current.overlayXPct, 0, 1, STUDIO_ONSCREEN_TEXT_DEFAULT_CENTER_X_PCT);
    const bottomEdgePct = clampNumber(current.overlayYPct, 0, 1, STUDIO_ONSCREEN_TEXT_DEFAULT_BOTTOM_EDGE_PCT);
    return {
      widthPct: safeWidthPct,
      heightPct: safeHeightPct,
      xPct: Math.max(0, Math.min(1 - safeWidthPct, centerXPct - (safeWidthPct / 2))),
      yPct: Math.max(0, Math.min(1 - safeHeightPct, bottomEdgePct - safeHeightPct))
    };
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
    const isTrue = (v) => v === true || v === "true" || v === 1 || v === "1";
    const strokeWidthPx = Math.max(0, Math.min(12, toFiniteNumber(source.strokeWidthPx, Number.NaN)));
    const strokeEnabled = source?.strokeEnabled === undefined ? true : isTrue(source.strokeEnabled);
    const shadowEnabled = source?.shadowEnabled === undefined ? true : isTrue(source.shadowEnabled);
    const shadowBlurPx = Math.max(0, Math.min(32, Math.round(toFiniteNumber(source.shadowBlurPx, 12))));
    const shadowOffsetXPx = Math.max(-24, Math.min(24, Math.round(toFiniteNumber(source.shadowOffsetXPx, 0))));
    const shadowOffsetYPx = Math.max(-24, Math.min(24, Math.round(toFiniteNumber(source.shadowOffsetYPx, 4))));
    const shadowOpacity = clamp01(source.shadowOpacity, 0.55);
    const shadowSizePx = Math.max(0, Math.min(20, toFiniteNumber(source.shadowSizePx, 0)));
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
      strokeEnabled,
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
      shadowSizePx,
      boxWidthPct: clampNumber(source.boxWidthPct, 0.22, 0.92, STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT),
      overlayXPct: clampNumber(source.overlayXPct, 0, 1, 0.5),
      overlayYPct: clampNumber(source.overlayYPct, 0, 1, 0.86)
    };
  }

  function applyOnScreenTextTrackSettingValue(settings = null, setting = "fontFamily", value = "") {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const key = String(setting || "").trim();
    const nextValue = String(value || "").trim();
    if (!key) return current;
    if (key === "fontSizePx") {
      current.fontSizePx = Math.max(16, Math.min(96, Math.round(toFiniteNumber(nextValue, current.fontSizePx))));
    } else if (key === "stylePreset") {
      const allowed = new Set(PODCAST_ON_SCREEN_TEXT_STYLE_PRESETS.map((item) => item.value));
      current.stylePreset = allowed.has(nextValue) ? nextValue : current.stylePreset;
    } else if (key === "fontFamily") {
      const allowed = new Set(PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES.map((item) => item.value));
      current.fontFamily = allowed.has(nextValue) ? nextValue : current.fontFamily;
    } else if (key === "textColor") {
      current.textColor = nextValue || current.textColor;
    } else if (key === "textOpacity") {
      const numeric = toFiniteNumber(nextValue, Number.NaN);
      if (Number.isFinite(numeric)) current.textOpacity = Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
    } else if (key === "bgPreset") {
      const allowed = new Set(["glass", "solid", "none"]);
      current.bgPreset = allowed.has(nextValue.toLowerCase()) ? nextValue.toLowerCase() : current.bgPreset;
    } else if (key === "bgOpacity") {
      const numeric = toFiniteNumber(nextValue, Number.NaN);
      if (Number.isFinite(numeric)) current.bgOpacity = Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
    } else if (key === "bgScale") {
      const numeric = toFiniteNumber(nextValue, Number.NaN);
      if (Number.isFinite(numeric)) {
        const scale = numeric > 3 ? numeric / 100 : numeric;
        current.bgScale = Math.max(0.6, Math.min(1.8, scale));
      }
    } else if (key === "fontVariant") {
      const selected = PODCAST_ON_SCREEN_TEXT_FONT_VARIANTS.find((item) => item.value === nextValue.toLowerCase()) || PODCAST_ON_SCREEN_TEXT_FONT_VARIANTS[0];
      current.fontVariant = selected.value;
      current.fontWeight = selected.fontWeight;
      current.fontStyle = selected.fontStyle;
    } else if (key === "textAlign") {
      const allowed = new Set(["left", "center", "right", "justify"]);
      current.textAlign = allowed.has(nextValue.toLowerCase()) ? nextValue.toLowerCase() : current.textAlign;
    } else if (key === "strokeColor") {
      current.strokeColor = nextValue || current.strokeColor;
    } else if (key === "strokeEnabled") {
      current.strokeEnabled = nextValue !== "false" && nextValue !== "0" && nextValue !== "";
    } else if (key === "strokeWidthPx") {
      current.strokeWidthPx = Math.max(0, Math.min(12, toFiniteNumber(nextValue, current.strokeWidthPx)));
    } else if (key === "shadowEnabled") {
      current.shadowEnabled = nextValue !== "false" && nextValue !== "0" && nextValue !== "";
    } else if (key === "shadowBlurPx") {
      current.shadowBlurPx = Math.max(0, Math.min(32, Math.round(toFiniteNumber(nextValue, current.shadowBlurPx))));
    } else if (key === "shadowOffsetXPx") {
      current.shadowOffsetXPx = Math.max(-24, Math.min(24, Math.round(toFiniteNumber(nextValue, current.shadowOffsetXPx))));
    } else if (key === "shadowOffsetYPx") {
      current.shadowOffsetYPx = Math.max(-24, Math.min(24, Math.round(toFiniteNumber(nextValue, current.shadowOffsetYPx))));
    } else if (key === "shadowOpacity") {
      const numeric = toFiniteNumber(nextValue, Number.NaN);
      if (Number.isFinite(numeric)) current.shadowOpacity = Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
    } else if (key === "shadowSizePx") {
      current.shadowSizePx = Math.max(0, Math.min(20, toFiniteNumber(nextValue, current.shadowSizePx)));
    } else if (key === "boxWidthPct") {
      const numeric = toFiniteNumber(nextValue, Number.NaN);
      if (Number.isFinite(numeric)) {
        const pct = numeric > 1 ? numeric / 100 : numeric;
        current.boxWidthPct = Math.max(0.22, Math.min(0.92, pct));
      }
    }
    return normalizeOnScreenTextTrackSettings(current);
  }

  function getOnScreenTextStylePresetClass(stylePreset = "") {
    const key = String(stylePreset || "").trim().toLowerCase();
    const valid = PODCAST_ON_SCREEN_TEXT_STYLE_PRESETS.some((item) => item.value === key) ? key : "3d";
    return `is-style-${valid}`;
  }

  function getOnScreenTextBgPresetClass(bgPreset = "") {
    const key = String(bgPreset || "").trim().toLowerCase();
    const valid = (key === "solid" || key === "glass" || key === "none") ? key : "glass";
    return `is-bg-${valid}`;
  }

  function getOnScreenTextFontFamilyCss(fontFamily = "") {
    const key = String(fontFamily || "").trim();
    const found = PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES.find((item) => item.value === key) || PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES[0];
    return String(found?.family || '"Unbounded", system-ui, sans-serif');
  }

  function getOnScreenTextClipText(row = null) {
    return String(
      row?.onScreenText
      || row?.textoPantalla
      || row?.textoEnPantalla
      || row?.text
      || ""
    ).replace(/\s+/g, " ").trim();
  }

  function normalizeOnScreenTextClipItem(raw = {}, rowId = "") {
    const key = String(rowId || raw?.rowId || "").trim();
    if (!key) return null;
    const sourceDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(toFiniteNumber(raw?.sourceDurationMs, raw?.durationMs ?? 8000)));
    const trimInMs = Math.max(0, Math.min(sourceDurationMs - STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(toFiniteNumber(raw?.trimInMs, 0))));
    const fallbackTrimOut = sourceDurationMs;
    const trimOutMs = Math.max(
      trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.min(sourceDurationMs, Math.round(toFiniteNumber(raw?.trimOutMs, raw?.durationMs ?? fallbackTrimOut)))
    );
    return {
      rowId: key,
      startMs: Math.max(0, Math.round(toFiniteNumber(raw?.startMs, 0))),
      sourceDurationMs,
      trimInMs,
      trimOutMs,
      hidden: raw?.hidden === true,
      autoHidden: raw?.autoHidden === true,
      zIndex: Math.max(1, Math.round(toFiniteNumber(raw?.zIndex, 1)))
    };
  }

  function normalizeOnScreenTextClipsByRowId(raw = {}) {
    const next = {};
    if (!raw || typeof raw !== "object") return next;
    Object.entries(raw).forEach(([rowId, clip]) => {
      const normalized = normalizeOnScreenTextClipItem(clip, rowId);
      if (!normalized) return;
      next[normalized.rowId] = normalized;
    });
    return next;
  }

  function normalizeOnScreenTextLayoutItem(raw = {}, rowId = "") {
    const key = String(rowId || raw?.rowId || "").trim();
    if (!key) return null;
    const widthPct = Math.max(0.08, Math.min(0.9, toFiniteNumber(raw?.widthPct, Number.NaN)));
    const heightPct = Math.max(0.05, Math.min(0.6, toFiniteNumber(raw?.heightPct, Number.NaN)));
    const safeWidthPct = Number.isFinite(widthPct) ? widthPct : 0.58;
    const safeHeightPct = Number.isFinite(heightPct) ? heightPct : 0.14;
    const defaults = buildCanonicalOnScreenTextLayoutBounds(safeWidthPct, safeHeightPct);
    const xPct = Math.max(0, Math.min(Math.max(0, 1 - safeWidthPct), toFiniteNumber(raw?.xPct, Number.NaN)));
    const yPct = Math.max(0, Math.min(Math.max(0, 1 - safeHeightPct), toFiniteNumber(raw?.yPct, Number.NaN)));
    return {
      rowId: key,
      xPct: Number.isFinite(xPct) ? xPct : defaults.xPct,
      yPct: Number.isFinite(yPct) ? yPct : defaults.yPct,
      widthPct: safeWidthPct,
      heightPct: safeHeightPct,
      zIndex: Math.max(1, Math.min(999, Math.round(toFiniteNumber(raw?.zIndex, 1))))
    };
  }

  function normalizeOnScreenTextLayoutByRowId(raw = {}) {
    const next = {};
    if (!raw || typeof raw !== "object") return next;
    Object.entries(raw).forEach(([rowId, layout]) => {
      const normalized = normalizeOnScreenTextLayoutItem(layout, rowId);
      if (!normalized) return;
      next[normalized.rowId] = normalized;
    });
    return next;
  }

  function resolveOnScreenTextDimensionOptions(options = {}) {
    const config = options && typeof options === "object" ? options : {};
    return {
      sourceWidth: Math.max(160, Math.round(Number(config.sourceWidth || 0) || 1280)),
      sourceHeight: Math.max(90, Math.round(Number(config.sourceHeight || 0) || 720)),
      resolution: config.resolution || "source"
    };
  }

  function estimateOnScreenTextLayoutHeightPct(text = "", settings = null, widthPct = 0.58, options = {}) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const cleanText = String(text || "").replace(/\s+/g, " ").trim();
    const fontSizePx = Math.max(16, Math.min(96, Number(current.fontSizePx || 44)));
    const approxCharWidthPx = Math.max(8, fontSizePx * 0.54);
    const dims = resolveOnScreenTextDimensionOptions(options);
    const exportCanvas = resolveOnScreenTextExportCanvasSize(dims.resolution, dims.sourceWidth, dims.sourceHeight);
    const boxWidthPx = Math.max(120, Math.round(exportCanvas.width * Math.max(0.08, Math.min(0.9, Number(widthPct || 0.58)))));
    const charsPerLine = Math.max(8, Math.floor(boxWidthPx / approxCharWidthPx));
    const lineCount = Math.max(1, Math.ceil(Math.max(1, cleanText.length) / Math.max(1, charsPerLine)));
    const lineHeightPx = Math.max(20, Math.round(fontSizePx * 1.18));
    const verticalPaddingPx = Math.max(16, Math.round(fontSizePx * 0.68));
    const estimatedHeightPx = Math.max(48, (lineCount * lineHeightPx) + verticalPaddingPx);
    return Math.max(0.07, Math.min(0.34, estimatedHeightPx / Math.max(360, exportCanvas.height)));
  }

  function estimateOnScreenTextLayoutWidthPct(text = "", settings = null, options = {}) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const cleanText = String(text || "").replace(/\s+/g, " ").trim();
    const fontSizePx = Math.max(16, Math.min(96, Number(current.fontSizePx || 44)));
    const approxCharWidthPx = Math.max(8, fontSizePx * 0.54);
    const dims = resolveOnScreenTextDimensionOptions(options);
    const exportCanvas = resolveOnScreenTextExportCanvasSize(dims.resolution, dims.sourceWidth, dims.sourceHeight);
    const minPct = Math.max(0.22, Math.min(0.88, Number(options?.minPct || 0.58)));
    const maxPct = Math.max(minPct, Math.min(0.92, Number(options?.maxPct || 0.92)));
    const targetLines = Math.max(1, Math.min(4, Math.round(Number(options?.targetLines || 2) || 2)));
    const textWidthPx = Math.max(120, (Math.max(1, cleanText.length) * approxCharWidthPx) / targetLines);
    const paddingPx = Math.max(28, Math.round(fontSizePx * 1.2));
    const desiredPct = (textWidthPx + paddingPx) / Math.max(360, exportCanvas.width);
    return Math.max(minPct, Math.min(maxPct, desiredPct));
  }

  function buildDefaultOnScreenTextLayoutForRow(row = null, settings = null, options = {}) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const getText = typeof options?.getText === "function" ? options.getText : getOnScreenTextClipText;
    const rowId = String(options?.rowId || row?.id || "").trim();
    const text = getText(row);
    const widthPct = clampNumber(options?.widthPct, 0.22, 0.92, current.boxWidthPct || STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT);
    const heightPct = estimateOnScreenTextLayoutHeightPct(text, current, widthPct, options);
    const defaults = buildCanonicalOnScreenTextLayoutBounds(widthPct, heightPct, current);
    return normalizeOnScreenTextLayoutItem({
      rowId,
      xPct: defaults.xPct,
      yPct: defaults.yPct,
      widthPct,
      heightPct,
      zIndex: Math.max(1, Number(options?.rowIndex || row?.index || 1) || 1)
    }, rowId);
  }

  function shouldRepairLegacyOnScreenTextLayout(layout = null, settings = null, options = {}) {
    if (!layout || typeof layout !== "object") return false;
    const normalized = normalizeOnScreenTextLayoutItem(layout, String(layout?.rowId || options?.rowId || "").trim());
    if (!normalized) return false;
    const expected = buildCanonicalOnScreenTextLayoutBounds(normalized.widthPct, normalized.heightPct, settings || {});
    const closeTo = (a, b, tolerance = 0.02) => Math.abs(Number(a) - Number(b)) <= tolerance;
    const matchesLegacyLeft = closeTo(normalized.xPct, STUDIO_ONSCREEN_TEXT_LEGACY_DEFAULT_X_PCT, 0.02);
    const matchesLegacyTop = closeTo(normalized.yPct, STUDIO_ONSCREEN_TEXT_LEGACY_DEFAULT_Y_PCT, 0.025);
    const matchesLegacySize = closeTo(normalized.widthPct, STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT, 0.08)
      && closeTo(normalized.heightPct, STUDIO_ONSCREEN_TEXT_DEFAULT_HEIGHT_PCT, 0.08);
    const isAlreadyCanonical = closeTo(normalized.xPct, expected.xPct, 0.02)
      && closeTo(normalized.yPct, expected.yPct, 0.02);
    return matchesLegacyLeft && matchesLegacyTop && matchesLegacySize && !isAlreadyCanonical;
  }

  function expandOnScreenTextLayoutToFitText(layout = null, row = null, settings = null, options = {}) {
    const baseLayout = normalizeOnScreenTextLayoutItem(layout || {}, String(options?.rowId || row?.id || layout?.rowId || "").trim());
    if (!baseLayout) return null;
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const getText = typeof options?.getText === "function" ? options.getText : getOnScreenTextClipText;
    const text = getText(row);
    if (!text) return baseLayout;
    const dims = resolveOnScreenTextDimensionOptions(options);
    const exportCanvas = resolveOnScreenTextExportCanvasSize(dims.resolution, dims.sourceWidth, dims.sourceHeight);
    const currentWidthPct = Math.max(0.08, Math.min(0.9, Number(baseLayout.widthPct || 0.58)));
    const currentBoxWidthPx = Math.max(120, Math.round(exportCanvas.width * currentWidthPct));
    const fontSizePx = Math.max(16, Math.min(96, Number(current.fontSizePx || 44)));
    const approxCharWidthPx = Math.max(8, fontSizePx * 0.54);
    const charsPerLine = Math.max(8, Math.floor(currentBoxWidthPx / approxCharWidthPx));
    const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    let estimatedLines = 1;
    let currentLine = "";
    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (nextLine.length <= charsPerLine) {
        currentLine = nextLine;
      } else {
        estimatedLines += 1;
        currentLine = word;
      }
    }
    if (estimatedLines <= 2) return baseLayout;
    const preferredWidthPct = clampNumber(options?.widthPct, 0.22, 0.92, current.boxWidthPct || STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT);
    const nextWidthPct = Math.max(currentWidthPct, preferredWidthPct);
    const nextHeightPct = Math.max(
      Math.max(0.07, Number(baseLayout.heightPct || 0.14)),
      estimateOnScreenTextLayoutHeightPct(text, current, nextWidthPct, options)
    );
    const centerXPct = Math.max(0, Math.min(1, Number(baseLayout.xPct || 0) + (currentWidthPct / 2)));
    const nextXPct = Math.max(0, Math.min(1 - nextWidthPct, centerXPct - (nextWidthPct / 2)));
    const nextYPct = Math.max(0, Math.min(1 - nextHeightPct, Number(baseLayout.yPct || 0)));
    return normalizeOnScreenTextLayoutItem({
      ...baseLayout,
      xPct: nextXPct,
      yPct: nextYPct,
      widthPct: nextWidthPct,
      heightPct: nextHeightPct
    }, baseLayout.rowId);
  }

  function buildOnScreenTextPreviewStrokeShadowCss(settings = null, options = {}) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    if (!current.strokeEnabled) return "0 0 0 transparent";
    const strokeWidthPx = Math.max(0, Math.min(12, Number(options?.strokeWidthPx ?? current.strokeWidthPx ?? 0) || 0));
    if (strokeWidthPx <= 0.01) return "0 0 0 transparent";
    const color = String(current.strokeColor || "#0f172a").trim() || "#0f172a";
    const radii = [Math.max(0.5, strokeWidthPx)];
    if (strokeWidthPx > 1.35) {
      radii.unshift(Math.max(0.4, strokeWidthPx * 0.58));
    }
    const shadows = [];
    radii.forEach((radius, ringIndex) => {
      const steps = Math.max(12, Math.ceil(radius * (ringIndex === radii.length - 1 ? 18 : 12)));
      for (let index = 0; index < steps; index += 1) {
        const angle = (Math.PI * 2 * index) / steps;
        const x = (Math.cos(angle) * radius).toFixed(3);
        const y = (Math.sin(angle) * radius).toFixed(3);
        shadows.push(`${x}px ${y}px 0 ${color}`);
      }
    });
    return shadows.join(", ");
  }

  function buildOnScreenTextPreviewShadowCss(settings = null, options = {}) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    if (!current.shadowEnabled || Number(current.shadowOpacity || 0) <= 0.001) return "0 0 0 transparent";
    const alpha = Math.max(0, Math.min(1, Number(current.shadowOpacity || 0)));
    const shadowSizePx = Math.max(0, Math.round(Number(current.shadowSizePx || 0) || 0));
    const blurPx = Math.max(0, Math.round(Number(current.shadowBlurPx || 0) || 0));
    const offsetXPx = Math.round(Number(current.shadowOffsetXPx || 0) || 0);
    const offsetYPx = Math.round(Number(current.shadowOffsetYPx || 0) || 0);
    if (shadowSizePx > 0) {
      const separationPx = shadowSizePx;
      const expandedX = offsetXPx === 0 ? 0 : (Math.sign(offsetXPx) * (Math.abs(offsetXPx) + separationPx));
      const expandedY = offsetYPx === 0 ? separationPx : (Math.sign(offsetYPx) * (Math.abs(offsetYPx) + separationPx));
      const expandedBlur = Math.max(separationPx + 2, Math.round((blurPx || 4) + separationPx * 0.7));
      const softBlur = Math.max(expandedBlur + 4, Math.round(expandedBlur * 1.35));
      const softX = offsetXPx === 0 ? 0 : Math.sign(offsetXPx) * Math.max(1, Math.round(Math.abs(expandedX) * 0.6));
      const softY = offsetYPx === 0 ? Math.max(1, Math.round(separationPx * 0.7)) : Math.sign(offsetYPx) * Math.max(1, Math.round(Math.abs(expandedY) * 0.62));
      return `${expandedX}px ${expandedY}px ${expandedBlur}px rgba(15, 23, 42, ${(alpha * 0.58).toFixed(3)}), ${softX}px ${softY}px ${softBlur}px rgba(2, 6, 23, ${(alpha * 0.36).toFixed(3)})`;
    }
    const tightBlur = Math.max(1, Math.round(blurPx * 0.38));
    const tightX = Math.round(offsetXPx * 0.35);
    const tightY = Math.round(offsetYPx * 0.35);
    const softBlur = Math.max(2, Math.round(blurPx * 0.9));
    const softX = Math.round(offsetXPx * 0.18);
    const softY = Math.round(offsetYPx * 0.18);
    return `${tightX}px ${tightY}px ${tightBlur}px rgba(15, 23, 42, ${(alpha * 0.92).toFixed(3)}), ${softX}px ${softY}px ${softBlur}px rgba(2, 6, 23, ${(alpha * 0.62).toFixed(3)})`;
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
    const widthPct = clampNumber(layout.widthPct, 0.08, 0.96, 0.58);
    const heightPct = clampNumber(layout.heightPct, 0.05, 0.6, 0.14);
    const boxWidthPx = Math.max(120, Math.round(exportCanvasWidth * widthPct));
    const minBoxHeightPx = Math.max(fontSizePx + 4, Math.round(lineHeightPx + (fontSizePx * 0.2)));
    const boxHeightPx = Math.max(minBoxHeightPx, Math.round(exportCanvasHeight * heightPct));
    const approxCharWidthPx = Math.max(9, fontSizePx * 0.56);
    const maxChars = Math.max(10, Math.floor(boxWidthPx / approxCharWidthPx));
    const maxLines = Math.max(2, Math.floor(boxHeightPx / lineHeightPx));
    const isTrue = (v) => v === true || v === "true" || v === 1 || v === "1";
    const strokeWidthPx = clampNumber(settings.strokeWidthPx, 0, 12, 2);
    const shadowOpacity = clampNumber(settings.shadowOpacity, 0, 1, 0.48);
    const shadowEnabled = (settings.shadowEnabled === undefined ? true : isTrue(settings.shadowEnabled)) && shadowOpacity > 0.001;
    const shadowBlurPx = shadowEnabled ? clampNumber(settings.shadowBlurPx, 0, 80, 18) : 0;
    const shadowX = shadowEnabled ? clampNumber(settings.shadowOffsetXPx, -80, 80, 0) : 0;
    const shadowY = shadowEnabled ? clampNumber(settings.shadowOffsetYPx, -80, 80, 8) : 0;
    const strokeEnabled = (settings.strokeEnabled === undefined ? true : isTrue(settings.strokeEnabled)) && strokeWidthPx > 0.001;
    const boxEnabled = settings.boxEnabled === true && clampNumber(settings.bgOpacity, 0, 1, 0) > 0.001;
    const bottomSafetyPx = Math.max(
      Math.round(lineHeightPx * 2.4),
      Math.round(fontSizePx * 1.9),
      Math.round(exportCanvasHeight * 0.035)
    );
    const xPct = clampNumber(layout.xPct, 0, Math.max(0, 1 - widthPct), 0);
    const rawYPct = clampNumber(layout.yPct, 0, 0.99, 0.7);
    const rawXPx = Math.max(0, Math.round(exportCanvasWidth * xPct));
    const rawYPx = Math.max(0, Math.round(exportCanvasHeight * rawYPct));
    const maxYPx = Math.max(0, exportCanvasHeight - boxHeightPx - bottomSafetyPx);
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
    const widthPct = Math.max(0.08, Math.min(0.96, Number(options?.widthPct || 0.58)));
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
      bgPresetClass: getOnScreenTextBgPresetClass(current.bgPreset),
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

  function resolveOnScreenTextPreviewLayoutSpec(input = {}) {
    const config = input && typeof input === "object" ? input : {};
    const settings = normalizeOnScreenTextTrackSettings(config.settings || {});
    const fallbackLayout = buildCanonicalOnScreenTextLayoutBounds(
      Number(config?.layout?.widthPct),
      Number(config?.layout?.heightPct),
      settings
    );
    const layout = normalizeOnScreenTextLayoutItem({
      ...(config.layout || {}),
      rowId: String(config?.rowId || config?.layout?.rowId || "").trim(),
      widthPct: Number.isFinite(Number(config?.layout?.widthPct)) ? Number(config.layout.widthPct) : fallbackLayout.widthPct,
      heightPct: Number.isFinite(Number(config?.layout?.heightPct)) ? Number(config.layout.heightPct) : fallbackLayout.heightPct,
      xPct: Number.isFinite(Number(config?.layout?.xPct)) ? Number(config.layout.xPct) : fallbackLayout.xPct,
      yPct: Number.isFinite(Number(config?.layout?.yPct)) ? Number(config.layout.yPct) : fallbackLayout.yPct
    }, String(config?.rowId || config?.layout?.rowId || "").trim());
    const previewWidthPx = Math.max(1, Math.round(Number(config.previewWidthPx || 0) || 1280));
    const previewHeightPx = Math.max(1, Math.round(Number(config.previewHeightPx || 0) || 720));
    const sourceWidth = Math.max(160, Math.round(Number(config.sourceWidth || 0) || 1280));
    const sourceHeight = Math.max(90, Math.round(Number(config.sourceHeight || 0) || 720));
    const text = String(config.text || "").trim();
    const metrics = resolveOnScreenTextRenderMetrics(settings, {
      text,
      fallback: String(config.fallback || "").trim(),
      previewWidthPx,
      previewHeightPx,
      sourceWidth,
      sourceHeight,
      resolution: config.resolution || "source",
      widthPct: layout?.widthPct,
      heightPct: layout?.heightPct,
      xPct: layout?.xPct,
      yPct: layout?.yPct
    });
    const xPct = clampNumber(layout?.xPct, 0, Math.max(0, 1 - Number(layout?.widthPct || fallbackLayout.widthPct)), fallbackLayout.xPct);
    const yPct = clampNumber(layout?.yPct, 0, Math.max(0, 1 - Number(layout?.heightPct || fallbackLayout.heightPct)), fallbackLayout.yPct);
    const bubbleWidthPx = Math.max(1, Math.round(Number(metrics.previewBoxWidthPx || metrics.bubbleWidthPx || 0) || 1));
    const bubbleHeightPx = Math.max(1, Math.round(Number(metrics.previewBoxHeightPx || metrics.bubbleHeightPx || 0) || 1));
    return {
      rowId: String(layout?.rowId || config?.rowId || "").trim(),
      text,
      wrappedText: String(metrics.wrappedText || text),
      xPct,
      yPct,
      widthPct: Number(layout?.widthPct || fallbackLayout.widthPct),
      heightPct: Number(layout?.heightPct || fallbackLayout.heightPct),
      bubbleWidthPx,
      bubbleHeightPx,
      metrics,
      inlineStyle: buildOnScreenTextBubbleInlineStyle(settings, { metrics }),
      presetClass: getOnScreenTextStylePresetClass(settings.stylePreset),
      bgClass: getOnScreenTextBgPresetClass(settings.bgPreset)
    };
  }

  function wrapOnScreenTextPreviewText(text = "", options = {}) {
    return wrapOnScreenTextRenderText(text, options).replace(/…/g, "...");
  }

  function resolveOnScreenTextPreviewWrapFromMeasuredWidth(text = "", renderMetrics = null, contentWidthPx = 0) {
    const safeMetrics = renderMetrics && typeof renderMetrics === "object" ? renderMetrics : {};
    const usableWidthPx = Math.max(48, Math.round(Number(contentWidthPx || safeMetrics.previewInnerBoxWidthPx || 0) || 0));
    const approxCharWidthPx = Math.max(6, Number(safeMetrics.previewApproxCharWidthPx || safeMetrics.approxCharWidthPx || 0) || 6);
    const safetyInsetPx = Math.max(6, Math.round(approxCharWidthPx * 0.85));
    const maxChars = Math.max(6, Math.floor(Math.max(24, usableWidthPx - safetyInsetPx) / approxCharWidthPx));
    const maxLines = Math.max(1, Math.round(Number(safeMetrics.maxLines || 2) || 2));
    return String(
      wrapOnScreenTextPreviewText(text, {
        fallback: "",
        maxChars,
        maxLines
      }) || ""
    );
  }

  function inferOnScreenTextLookPreset(settings = null) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    return PODCAST_ON_SCREEN_TEXT_LOOK_PRESETS.find((preset) => {
      const target = preset.settings || {};
      return Object.keys(target).every((key) => String(current[key]) === String(target[key]));
    })?.value || "";
  }

  function applyOnScreenTextLookPresetValue(settings = null, presetKey = "") {
    const preset = PODCAST_ON_SCREEN_TEXT_LOOK_PRESETS.find((item) => item.value === String(presetKey || "").trim());
    if (!preset) return normalizeOnScreenTextTrackSettings(settings || {});
    return normalizeOnScreenTextTrackSettings({
      ...normalizeOnScreenTextTrackSettings(settings || {}),
      ...(preset.settings || {})
    });
  }

  function buildOnScreenTextTrackModalMarkup(settings = null) {
    const current = normalizeOnScreenTextTrackSettings(settings || {});
    const activeLookPreset = inferOnScreenTextLookPreset(current);
    const textOpacityPct = Math.round(Math.max(0, Math.min(1, Number(current.textOpacity ?? 1))) * 100);
    const strokeWidthPx = Math.max(0, Math.min(12, Number(current.strokeWidthPx ?? 0)));
    const shadowOpacityPct = Math.round(Math.max(0, Math.min(1, Number(current.shadowOpacity ?? 0.55))) * 100);
    const shadowBlurPx = Math.max(0, Math.min(32, Math.round(Number(current.shadowBlurPx ?? 12))));
    const shadowOffsetXPx = Math.max(-24, Math.min(24, Math.round(Number(current.shadowOffsetXPx ?? 0))));
    const shadowOffsetYPx = Math.max(-24, Math.min(24, Math.round(Number(current.shadowOffsetYPx ?? 4))));
    const shadowSizePx = Math.max(0, Math.min(20, Math.round(Number(current.shadowSizePx ?? 0))));
    const bgOpacityPct = Math.round(Math.max(0, Math.min(1, Number(current.bgOpacity ?? 1))) * 100);
    const bgScalePct = Math.round(Math.max(0.6, Math.min(1.8, Number(current.bgScale ?? 1))) * 100);
    const boxWidthPct = Math.round(Math.max(0.22, Math.min(0.92, Number(current.boxWidthPct ?? STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT))) * 100);
    const alignmentOptions = [
      { value: "left", label: "Izq." },
      { value: "center", label: "Centro" },
      { value: "right", label: "Der." },
      { value: "justify", label: "Just." }
    ];
    const bgOptions = [
      { value: "none", label: "Sin fondo" },
      { value: "glass", label: "Cristal" },
      { value: "solid", label: "Sólido" }
    ];
    return `
      <section class="onscreen-text-inspector-shell">
        <section class="onscreen-text-inspector-rail">
          <div class="onscreen-text-inspector-titlebar">
            <span class="onscreen-text-inspector-kicker">Carácter</span>
            <div class="onscreen-text-inspector-title-copy">
              <strong>Inspector de texto</strong>
              <span>Tipografía, ancho del subtítulo, contorno y sombra.</span>
            </div>
          </div>
          <div class="onscreen-text-mini-presets">
            ${PODCAST_ON_SCREEN_TEXT_LOOK_PRESETS.map((preset) => `
              <button
                type="button"
                class="onscreen-text-mini-preset${preset.value === activeLookPreset ? " is-active" : ""}"
                data-action="onscreen-text-look-preset"
                data-preset="${escapeHtml(preset.value)}"
                aria-pressed="${preset.value === activeLookPreset ? "true" : "false"}"
                title="${escapeHtml(preset.hint)}"
              >
                ${escapeHtml(preset.label)}
              </button>
            `).join("")}
          </div>
        </section>
        <section class="onscreen-text-inspector-panel is-character">
          <div class="onscreen-text-inspector-panel-head"><strong>Carácter</strong></div>
          <div class="onscreen-text-inline-fields is-quad">
            <label class="row-field">
              <span>Familia</span>
              <select class="podcast-text-track-select" data-action="onscreen-text-track-setting" data-setting="fontFamily" aria-label="Tipografía del texto en pantalla">
                ${PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES.map((item) => `<option value="${escapeHtml(item.value)}"${item.value === current.fontFamily ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
              </select>
            </label>
            <label class="row-field">
              <span>Estilo</span>
              <select class="podcast-text-track-select" data-action="onscreen-text-track-setting" data-setting="fontVariant" aria-label="Peso y estilo del texto">
                ${PODCAST_ON_SCREEN_TEXT_FONT_VARIANTS.map((item) => `<option value="${escapeHtml(item.value)}"${item.value === current.fontVariant ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
              </select>
            </label>
            <label class="row-field">
              <span>Variante</span>
              <select class="podcast-text-track-select" data-action="onscreen-text-track-setting" data-setting="stylePreset" aria-label="Efecto visual del texto">
                ${PODCAST_ON_SCREEN_TEXT_STYLE_PRESETS.map((item) => `<option value="${escapeHtml(item.value)}"${item.value === current.stylePreset ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
              </select>
            </label>
            <label class="row-field">
              <span>Alineación</span>
              <select class="podcast-text-track-select" data-action="onscreen-text-track-setting" data-setting="textAlign" aria-label="Alineación del texto">
                ${alignmentOptions.map((item) => `<option value="${escapeHtml(item.value)}"${item.value === current.textAlign ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="row-field wide">
            <span>Tamaño</span>
            <div class="studio-volume-control">
              <input type="range" min="16" max="96" step="1" value="${escapeHtml(String(current.fontSizePx || 44))}" data-action="onscreen-text-track-setting" data-setting="fontSizePx" aria-label="Tamaño del texto en pantalla">
              <input type="number" min="16" max="96" step="1" value="${escapeHtml(String(current.fontSizePx || 44))}" data-action="onscreen-text-track-setting" data-setting="fontSizePx" inputmode="numeric" aria-label="Tamaño del texto numérico">
            </div>
          </label>
          <label class="row-field wide">
            <span>Ancho del subtítulo</span>
            <div class="studio-volume-control">
              <input type="range" min="22" max="92" step="1" value="${escapeHtml(String(boxWidthPct))}" data-action="onscreen-text-track-setting" data-setting="boxWidthPct" aria-label="Ancho del subtítulo">
              <input type="number" min="22" max="92" step="1" value="${escapeHtml(String(boxWidthPct))}" data-action="onscreen-text-track-setting" data-setting="boxWidthPct" inputmode="numeric" aria-label="Ancho del subtítulo numérico">
            </div>
          </label>
        </section>
        <section class="onscreen-text-inspector-panel is-appearance">
          <div class="onscreen-text-inspector-panel-head"><strong>Apariencia</strong></div>
          <div class="onscreen-text-inline-row">
            <label class="row-field onscreen-text-swatch-field">
              <span>Relleno</span>
              <input type="color" value="${escapeHtml(String(current.textColor || "#f8fafc"))}" data-action="onscreen-text-track-setting" data-setting="textColor" aria-label="Color del texto en pantalla">
            </label>
            <label class="row-field onscreen-text-metric-field">
              <span>Opacidad</span>
              <div class="studio-volume-control">
                <input type="range" min="0" max="100" step="1" value="${escapeHtml(String(textOpacityPct))}" data-action="onscreen-text-track-setting" data-setting="textOpacity" aria-label="Opacidad del texto en pantalla">
                <input type="number" min="0" max="100" step="1" value="${escapeHtml(String(textOpacityPct))}" data-action="onscreen-text-track-setting" data-setting="textOpacity" inputmode="numeric" aria-label="Opacidad del texto numérica">
              </div>
            </label>
          </div>
        </section>
        <section class="onscreen-text-inspector-panel is-stroke">
          <div class="onscreen-text-inspector-panel-head"><strong>Contorno</strong></div>
          <label class="row-field">
            <span>Activar</span>
            <select class="podcast-text-track-select" data-action="onscreen-text-track-setting" data-setting="strokeEnabled" aria-label="Activar contorno del texto">
              <option value="true"${current.strokeEnabled !== false ? " selected" : ""}>Sí</option>
              <option value="false"${current.strokeEnabled === false ? " selected" : ""}>No</option>
            </select>
          </label>
          <div class="onscreen-text-inline-row">
            <label class="row-field onscreen-text-swatch-field">
              <span>Color</span>
              <input type="color" value="${escapeHtml(String(current.strokeColor || "#0f172a"))}" data-action="onscreen-text-track-setting" data-setting="strokeColor" aria-label="Color del contorno del texto">
            </label>
            <label class="row-field onscreen-text-metric-field">
              <span>Grosor</span>
              <div class="studio-volume-control">
                <input type="range" min="0" max="12" step="0.1" value="${escapeHtml(String(strokeWidthPx))}" data-action="onscreen-text-track-setting" data-setting="strokeWidthPx" aria-label="Grosor del contorno del texto">
                <input type="number" min="0" max="12" step="0.1" value="${escapeHtml(String(strokeWidthPx))}" data-action="onscreen-text-track-setting" data-setting="strokeWidthPx" inputmode="decimal" aria-label="Grosor del contorno numérico">
              </div>
            </label>
          </div>
        </section>
        <section class="onscreen-text-inspector-panel is-shadow">
          <div class="onscreen-text-inspector-panel-head"><strong>Sombra</strong></div>
          <label class="row-field">
            <span>Activar</span>
            <select class="podcast-text-track-select" data-action="onscreen-text-track-setting" data-setting="shadowEnabled" aria-label="Activar sombra del texto">
              <option value="true"${current.shadowEnabled !== false ? " selected" : ""}>Sí</option>
              <option value="false"${current.shadowEnabled === false ? " selected" : ""}>No</option>
            </select>
          </label>
          <label class="row-field wide">
            <span>Opacidad</span>
            <div class="studio-volume-control">
              <input type="range" min="0" max="100" step="1" value="${escapeHtml(String(shadowOpacityPct))}" data-action="onscreen-text-track-setting" data-setting="shadowOpacity" aria-label="Opacidad de sombra">
              <input type="number" min="0" max="100" step="1" value="${escapeHtml(String(shadowOpacityPct))}" data-action="onscreen-text-track-setting" data-setting="shadowOpacity" inputmode="numeric" aria-label="Opacidad de sombra numérica">
            </div>
          </label>
          <label class="row-field wide">
            <span>Tamaño</span>
            <div class="studio-volume-control">
              <input type="range" min="0" max="20" step="1" value="${escapeHtml(String(shadowSizePx))}" data-action="onscreen-text-track-setting" data-setting="shadowSizePx" aria-label="Tamaño de la sombra">
              <input type="number" min="0" max="20" step="1" value="${escapeHtml(String(shadowSizePx))}" data-action="onscreen-text-track-setting" data-setting="shadowSizePx" inputmode="numeric" aria-label="Tamaño de la sombra numérico">
            </div>
          </label>
          <label class="row-field wide">
            <span>Desenfoque</span>
            <div class="studio-volume-control">
              <input type="range" min="0" max="32" step="1" value="${escapeHtml(String(shadowBlurPx))}" data-action="onscreen-text-track-setting" data-setting="shadowBlurPx" aria-label="Blur de la sombra">
              <input type="number" min="0" max="32" step="1" value="${escapeHtml(String(shadowBlurPx))}" data-action="onscreen-text-track-setting" data-setting="shadowBlurPx" inputmode="numeric" aria-label="Blur de sombra numérico">
            </div>
          </label>
          <label class="row-field wide">
            <span>Offset X</span>
            <div class="studio-volume-control">
              <input type="range" min="-24" max="24" step="1" value="${escapeHtml(String(shadowOffsetXPx))}" data-action="onscreen-text-track-setting" data-setting="shadowOffsetXPx" aria-label="Desplazamiento horizontal de sombra">
              <input type="number" min="-24" max="24" step="1" value="${escapeHtml(String(shadowOffsetXPx))}" data-action="onscreen-text-track-setting" data-setting="shadowOffsetXPx" inputmode="numeric" aria-label="Desplazamiento horizontal de sombra numérico">
            </div>
          </label>
          <label class="row-field wide">
            <span>Offset Y</span>
            <div class="studio-volume-control">
              <input type="range" min="-24" max="24" step="1" value="${escapeHtml(String(shadowOffsetYPx))}" data-action="onscreen-text-track-setting" data-setting="shadowOffsetYPx" aria-label="Desplazamiento vertical de sombra">
              <input type="number" min="-24" max="24" step="1" value="${escapeHtml(String(shadowOffsetYPx))}" data-action="onscreen-text-track-setting" data-setting="shadowOffsetYPx" inputmode="numeric" aria-label="Desplazamiento vertical de sombra numérico">
            </div>
          </label>
        </section>
        <section class="onscreen-text-inspector-panel is-background">
          <div class="onscreen-text-inspector-panel-head"><strong>Fondo</strong></div>
          <label class="row-field">
            <span>Tipo</span>
            <select class="podcast-text-track-select" data-action="onscreen-text-track-setting" data-setting="bgPreset" aria-label="Tipo de fondo del texto">
              ${bgOptions.map((item) => `<option value="${escapeHtml(item.value)}"${item.value === current.bgPreset ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
            </select>
          </label>
          <label class="row-field wide">
            <span>Opacidad</span>
            <div class="studio-volume-control">
              <input type="range" min="0" max="100" step="1" value="${escapeHtml(String(bgOpacityPct))}" data-action="onscreen-text-track-setting" data-setting="bgOpacity" aria-label="Opacidad de fondo">
              <input type="number" min="0" max="100" step="1" value="${escapeHtml(String(bgOpacityPct))}" data-action="onscreen-text-track-setting" data-setting="bgOpacity" inputmode="numeric" aria-label="Opacidad de fondo numérica">
            </div>
          </label>
          <label class="row-field wide">
            <span>Escala</span>
            <div class="studio-volume-control">
              <input type="range" min="60" max="180" step="1" value="${escapeHtml(String(bgScalePct))}" data-action="onscreen-text-track-setting" data-setting="bgScale" aria-label="Escala de fondo">
              <input type="number" min="60" max="180" step="1" value="${escapeHtml(String(bgScalePct))}" data-action="onscreen-text-track-setting" data-setting="bgScale" inputmode="numeric" aria-label="Escala de fondo numérica">
            </div>
          </label>
        </section>
      </section>
    `.trim();
  }

  function getOnScreenTextResizeHandles() {
    return ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
  }

  function buildOnScreenTextSelectionFrameHtml() {
    const handles = getOnScreenTextResizeHandles();
    return `
      <span class="podcast-onscreen-selection-frame" aria-hidden="true">
        ${handles.map((handle) => `<span class="podcast-onscreen-resize-handle is-${handle}" data-handle="${handle}"></span>`).join("")}
      </span>
    `;
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
    normalizeOnScreenTextClipItem,
    normalizeOnScreenTextClipsByRowId,
    normalizeOnScreenTextLayoutItem,
    normalizeOnScreenTextLayoutByRowId,
    resolveOnScreenTextRenderMetrics,
    estimateOnScreenTextLayoutHeightPct,
    estimateOnScreenTextLayoutWidthPct,
    buildDefaultOnScreenTextLayoutForRow,
    expandOnScreenTextLayoutToFitText,
    getOnScreenTextStylePresetClass,
    getOnScreenTextBgPresetClass,
    getOnScreenTextFontFamilyCss,
    getOnScreenTextClipText,
    buildOnScreenTextPreviewStrokeShadowCss,
    buildOnScreenTextPreviewShadowCss,
    wrapOnScreenTextPreviewText,
    resolveOnScreenTextPreviewWrapFromMeasuredWidth,
    applyOnScreenTextTrackSettingValue,
    applyOnScreenTextLookPresetValue,
    buildOnScreenTextTrackModalMarkup,
    buildOnScreenTextBubbleInlineStyle,
    inferOnScreenTextLookPreset,
    resolveOnScreenTextPreviewLayoutSpec,
    shouldRepairLegacyOnScreenTextLayout,
    getOnScreenTextResizeHandles,
    buildOnScreenTextSelectionFrameHtml,
    getOnScreenTextClipEffectiveDurationMs,
    toFiniteNumber
  };
});
