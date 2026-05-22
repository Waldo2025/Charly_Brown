/**
 * Final limiter helper for Podcaster background music.
 *
 * Technical reference reviewed:
 * Tuna.js (MIT) provides browser audio effects over the Web Audio API.
 * We keep runtime weight low here by configuring the native
 * DynamicsCompressorNode with limiter-style settings for final mix protection.
 * Source: https://github.com/Theodeus/tuna
 */

export const PODCASTER_FINAL_LIMITER_DEFAULTS = Object.freeze({
  threshold: -3,
  knee: 0,
  ratio: 20,
  attack: 0.001,
  release: 0.06
});

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizePodcasterFinalLimiterSettings(settings = {}) {
  return {
    threshold: Math.max(-24, Math.min(0, toFiniteNumber(settings?.threshold, PODCASTER_FINAL_LIMITER_DEFAULTS.threshold))),
    knee: Math.max(0, Math.min(20, toFiniteNumber(settings?.knee, PODCASTER_FINAL_LIMITER_DEFAULTS.knee))),
    ratio: Math.max(4, Math.min(20, toFiniteNumber(settings?.ratio, PODCASTER_FINAL_LIMITER_DEFAULTS.ratio))),
    attack: Math.max(0.0005, Math.min(0.02, toFiniteNumber(settings?.attack, PODCASTER_FINAL_LIMITER_DEFAULTS.attack))),
    release: Math.max(0.02, Math.min(0.4, toFiniteNumber(settings?.release, PODCASTER_FINAL_LIMITER_DEFAULTS.release)))
  };
}

export function configurePodcasterFinalLimiterNode(node = null, settings = {}) {
  if (!node) return null;
  const normalized = normalizePodcasterFinalLimiterSettings(settings);
  node.threshold.value = normalized.threshold;
  node.knee.value = normalized.knee;
  node.ratio.value = normalized.ratio;
  node.attack.value = normalized.attack;
  node.release.value = normalized.release;
  return node;
}

export function createPodcasterFinalLimiterNode(audioCtx = null, settings = {}) {
  if (!audioCtx || typeof audioCtx.createDynamicsCompressor !== "function") return null;
  const limiterNode = audioCtx.createDynamicsCompressor();
  return configurePodcasterFinalLimiterNode(limiterNode, settings);
}
