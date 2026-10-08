const MIN_CARD_DURATION_MS = 500;

export function normalizeCardSceneWindow({ sceneDurationMs, enterSec = 0, exitSec } = {}) {
  const sceneMs = Math.max(MIN_CARD_DURATION_MS, Math.round(Number(sceneDurationMs) || 4000));
  const enterMs = Math.min(sceneMs - MIN_CARD_DURATION_MS, Math.max(0, Math.round((Number(enterSec) || 0) * 1000)));
  const requestedExitMs = Number.isFinite(Number(exitSec)) && exitSec !== '' && exitSec != null
    ? Math.round(Number(exitSec) * 1000)
    : sceneMs;
  const exitMs = Math.min(sceneMs, Math.max(enterMs + MIN_CARD_DURATION_MS, requestedExitMs));
  return { enterMs, exitMs, durationMs: exitMs - enterMs, sceneDurationMs: sceneMs };
}

export function cardSceneWindowFromTimeline(card = {}, sceneStartMs = 0, sceneDurationMs = 4000) {
  const relativeStartMs = (Number(card.startMs) || 0) - (Number(sceneStartMs) || 0);
  const relativeEndMs = relativeStartMs + (Number(card.durationMs) || 4000);
  return normalizeCardSceneWindow({ sceneDurationMs, enterSec: relativeStartMs / 1000, exitSec: relativeEndMs / 1000 });
}
