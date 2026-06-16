const api = globalThis.PodcasterTextRenderSpec || globalThis.PodcasterKaraokeRenderSpec;

if (!api) {
  throw new Error("PodcasterTextRenderSpec no está disponible. Carga podcaster-text-render.js antes de este módulo.");
}

export const escapeHtml = api.escapeHtml;
export const tokenizeSubtitleText = api.tokenizeSubtitleText;
export const normalizeTimingValue = api.normalizeTimingValue;
export const estimateProportionalWordTimings = api.estimateProportionalWordTimings;
export const normalizeKaraokeWordTimings = api.normalizeKaraokeWordTimings;
export const resolveActiveKaraokeWordIndex = api.resolveActiveKaraokeWordIndex;
export const buildKaraokeSubtitleMarkup = api.buildKaraokeSubtitleMarkup;
export const generateKaraokeOverlayText = api.generateKaraokeOverlayText;
export const buildMontageOnScreenTextDrawFilters = api.buildMontageOnScreenTextDrawFilters;
export const buildMontageOnScreenTextKaraokeBoxFilters = api.buildMontageOnScreenTextKaraokeBoxFilters;

export default api;
