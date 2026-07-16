function getMontageTextRenderApi() {
  if (globalThis?.PodcasterTextRenderSpec && typeof globalThis.PodcasterTextRenderSpec === "object") {
    return globalThis.PodcasterTextRenderSpec;
  }
  if (typeof globalThis?.buildMontageOnScreenTextAss === "function") {
    return globalThis;
  }
  return {};
}

export function normalizeMontageRenderMode(value = "", fallback = "browser") {
  const cleanValue = String(value || "").trim().toLowerCase();
  if (cleanValue === "browser") return "browser";
  return "browser";
}

export function resolveMontageRenderEntryAtTime(payload = {}, currentMs = 0, options = {}) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (!entries.length) return null;
  const cleanPreviewRowId = String(options?.previewRowId || payload?.previewRowId || "").trim();
  const cleanPreviewSceneIndex = Math.max(0, Math.round(Number(options?.previewSceneIndex || payload?.previewSceneIndex || 0) || 0));
  const timeMs = Math.max(0, Number(currentMs || 0) || 0);

  if (cleanPreviewSceneIndex > 0) {
    return entries[cleanPreviewSceneIndex - 1] || entries[entries.length - 1] || null;
  }
  if (cleanPreviewRowId) {
    return entries.find((entry) => String(entry?.rowId || "").trim() === cleanPreviewRowId) || entries[0] || null;
  }

  const active = entries.find((entry) => {
    const startMs = Math.max(0, Number(entry?.timelineStartMs ?? entry?.startMs ?? 0) || 0);
    const durationMs = Math.max(1, Number(entry?.durationMs || 0) || 1);
    const endMs = Math.max(startMs + durationMs, Number(entry?.timelineEndMs || (startMs + durationMs)) || (startMs + durationMs));
    return timeMs >= startMs && timeMs < endMs;
  });
  return active || entries[entries.length - 1] || null;
}

export function resolveMontageActiveOverlayCards(cards = [], currentMs = 0) {
  const timeMs = Math.max(0, Number(currentMs || 0) || 0);
  return (Array.isArray(cards) ? cards : [])
    .filter(Boolean)
    .map((card) => {
      const startMs = Math.max(0, Number(card?.startMs || 0) || 0);
      const durationMs = Math.max(0, Number(card?.durationMs || 0) || 0);
      const endMs = startMs + durationMs;
      const active = timeMs >= startMs && timeMs <= endMs;
      const exitDelayMs = Math.max(0, Math.min(durationMs, Number(card?.exitDelayMs ?? (durationMs - 520)) || 0));
      return {
        card,
        active,
        phase: active && timeMs >= (startMs + exitDelayMs) ? "exit" : "enter"
      };
    })
    .filter((item) => item.active)
    .sort((a, b) => Number(a?.card?.zIndex || 0) - Number(b?.card?.zIndex || 0));
}

export function buildMontageRenderAssContent({
  payload = {},
  width = 1280,
  height = 720,
  resolveSpec = null,
  defaultFontFamily = ""
} = {}) {
  const timeline = payload?.onScreenTextTimeline;
  const settings = timeline?.settings && typeof timeline.settings === "object" ? timeline.settings : {};
  const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
  const textRenderApi = getMontageTextRenderApi();
  const buildAss = typeof textRenderApi?.buildMontageOnScreenTextAss === "function"
    ? textRenderApi.buildMontageOnScreenTextAss
    : null;
  const normalizeWordTimings = typeof textRenderApi?.normalizeKaraokeWordTimings === "function"
    ? textRenderApi.normalizeKaraokeWordTimings
    : null;
  if (!segments.length || typeof buildAss !== "function") return "";
  const resolveSegmentSpec = typeof resolveSpec === "function" ? resolveSpec : null;
  if (!resolveSegmentSpec) return "";
  const preparedSegments = segments
    .map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      const text = String(segment.text || "").trim();
      if (!text) return null;
      const spec = segment.renderSpec && typeof segment.renderSpec === "object"
        ? segment.renderSpec
        : resolveSegmentSpec({
          settings,
          layout: segment.layout || {},
          resolution: payload?.resolution || "source",
          sourceWidth: width,
          sourceHeight: height,
          previewWidthPx: width,
          previewHeightPx: height,
          text,
          fallback: ""
        });
      if (!spec || typeof spec !== "object") return null;
      const rowId = String(segment.rowId || "").trim();
      const audioClip = payload?.dialogueAudioMap?.[rowId] || null;
      const wordTimings = payload?.partyKaraoke !== false && typeof normalizeWordTimings === "function"
        ? normalizeWordTimings(audioClip, text, {
          tokenOffset: Math.max(0, Number(segment?.karaokeTokenOffset || 0) || 0)
        })
        : [];
      const playbackRate = Math.max(0.5, Math.min(10, Number(audioClip?.playbackRate || 1) || 1));
      const startSec = Math.max(0, Number(segment.startMs || 0) / 1000);
      const durationSec = Math.max(0.1, Number(segment.durationMs || 0) / 1000);
      return {
        ...segment,
        text,
        spec,
        settings,
        wordTimings,
        playbackRate,
        startSec,
        endSec: startSec + durationSec
      };
    })
    .filter(Boolean);
  if (!preparedSegments.length) return "";
  return buildAss({
    width: Math.max(2, Math.round(Number(width || 1280) || 1280)),
    height: Math.max(2, Math.round(Number(height || 720) || 720)),
    defaultFontFamily: defaultFontFamily || settings.fontFamily || "Inter",
    settings,
    segments: preparedSegments
  });
}
