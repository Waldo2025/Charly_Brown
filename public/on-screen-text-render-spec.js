(function initOnScreenTextRenderSpec(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.PodcasterOnScreenTextRenderSpec = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildOnScreenTextRenderSpecApi() {
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
    const minBoxHeightPx = Math.max(
      fontSizePx + 8,
      Math.round((lineHeightPx * 2) + Math.max(fontSizePx * 0.74, lineHeightPx * 0.62))
    );
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
    const bottomSafetyPx = Math.max(
      Math.round(lineHeightPx * 2.4),
      Math.round(fontSizePx * 1.9),
      Math.round(exportCanvasHeight * 0.035)
    );
    const xPct = clampNumber(layout.xPct, 0, Math.max(0, 1 - widthPct), 0);
    const rawYPct = clampNumber(layout.yPct, 0, 0.98, 0.86);
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
      previewFontSizePx: Math.max(12, Math.round(fontSizePx * previewScaleY * 1000) / 1000),
      lineSpacingPx,
      lineHeightPx,
      previewLineHeightPx: Math.max(12, Math.round(lineHeightPx * previewScaleY * 1000) / 1000),
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

  return {
    resolveOnScreenTextExportCanvasSize,
    wrapOnScreenTextRenderText,
    resolveOnScreenTextRenderSpec
  };
});
