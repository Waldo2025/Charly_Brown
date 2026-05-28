function clampOffset(value = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-0.5, Math.min(0.5, Math.round(n * 1000) / 1000));
}

function normalizeMotionPreset(value = "") {
  const preset = String(value || "none").trim().toLowerCase();
  return ["pan-left-right", "pan-right-left", "pan-up-down", "pan-down-up"].includes(preset) ? preset : "none";
}

function getActiveClip() {
  const session = window.getActiveSession?.();
  const rowId = String(window.podcastVideoState?.activeRowId || "").trim();
  if (!session || !rowId) return { session, rowId, clip: null };
  const clips = window.ensureTimelineClipsByRowId?.(session, { persist: false }) || {};
  return { session, rowId, clip: clips[rowId] || null };
}

function persistSceneMediaPosition(rowId, patch) {
  const key = String(rowId || "").trim();
  if (!key) return false;
  const changed = window.updateTimelineClipForRow?.(key, (clip) => ({
    ...clip,
    ...patch
  }));
  if (!changed) return false;
  const refreshed = window.getActiveSession?.();
  const clip = window.ensureTimelineClipsByRowId?.(refreshed, { persist: false })?.[key] || null;
  window.applySceneMediaScaleToStage?.({
    rowId: key,
    mediaScale: clip?.mediaScale,
    mediaOffsetXPct: clip?.mediaOffsetXPct,
    mediaOffsetYPct: clip?.mediaOffsetYPct,
    mediaMotionPreset: clip?.mediaMotionPreset,
    visualLayoutMode: clip?.visualLayoutMode
  });
  // Force re-compute left/top/width/height CSS vars on the media element itself
  // (applySceneMediaScaleToStage only updates container-level vars; the layout
  // geometry on the <img>/<video> is owned by the playback controller)
  window.PodcasterUI?.syncStageMedia?.(key, { force: true });
  window.persistReorderedTimelinePatchToCloud?.(refreshed, {
    timelineClipsByRowId: window.ensureTimelineClipsByRowId?.(refreshed, { persist: false }) || {}
  });
  window.scheduleMontageExportPreviewRefresh?.(90);
  return true;
}

export function syncPodcasterSceneMediaPositionControls() {
  const preview = document.querySelector("#podcastVideoStage .podcast-video-preview");
  const controls = preview?.querySelector?.(".podcast-scene-position-controls");
  if (!controls) return;
  const { rowId, clip } = getActiveClip();
  controls.classList.toggle("is-disabled", !rowId || !clip);
  const x = controls.querySelector('[data-action="scene-media-position-x"]');
  const y = controls.querySelector('[data-action="scene-media-position-y"]');
  const motion = controls.querySelector('[data-action="scene-media-motion-preset"]');
  if (x) x.value = String(Math.round(clampOffset(clip?.mediaOffsetXPct) * 100));
  if (y) y.value = String(Math.round(clampOffset(clip?.mediaOffsetYPct) * 100));
  if (motion) motion.value = normalizeMotionPreset(clip?.mediaMotionPreset);
}

function buildControlsMarkup() {
  return `
    <div class="podcast-scene-position-controls is-disabled" aria-label="Posición de medio de escena">
      <input class="podcast-scene-position-slider is-x" type="range" min="-50" max="50" step="1" value="0" data-action="scene-media-position-x" aria-label="Mover imagen o video horizontalmente">
      <input class="podcast-scene-position-slider is-y" type="range" min="-50" max="50" step="1" value="0" data-action="scene-media-position-y" aria-label="Mover imagen o video verticalmente">
      <select class="podcast-scene-motion-select" data-action="scene-media-motion-preset" aria-label="Animar movimiento de medio">
        <option value="none">Sin movimiento</option>
        <option value="pan-left-right">Izquierda a derecha</option>
        <option value="pan-right-left">Derecha a izquierda</option>
        <option value="pan-up-down">Arriba a abajo</option>
        <option value="pan-down-up">Abajo a arriba</option>
      </select>
    </div>
  `;
}

export function initPodcasterSceneMediaPositionControls() {
  const preview = document.querySelector("#podcastVideoStage .podcast-video-preview");
  if (!preview || preview.querySelector(".podcast-scene-position-controls")) return;
  preview.insertAdjacentHTML("beforeend", buildControlsMarkup());
  preview.addEventListener("input", (event) => {
    const target = event.target?.closest?.("[data-action]");
    if (!target) return;
    const { rowId } = getActiveClip();
    if (!rowId) return;
    if (target.dataset.action === "scene-media-position-x") {
      persistSceneMediaPosition(rowId, { mediaOffsetXPct: clampOffset(Number(target.value) / 100) });
    } else if (target.dataset.action === "scene-media-position-y") {
      persistSceneMediaPosition(rowId, { mediaOffsetYPct: clampOffset(Number(target.value) / 100) });
    }
  });
  preview.addEventListener("change", (event) => {
    const target = event.target?.closest?.('[data-action="scene-media-motion-preset"]');
    if (!target) return;
    const { rowId } = getActiveClip();
    if (!rowId) return;
    persistSceneMediaPosition(rowId, { mediaMotionPreset: normalizeMotionPreset(target.value) });
  });
  syncPodcasterSceneMediaPositionControls();
}

window.initPodcasterSceneMediaPositionControls = initPodcasterSceneMediaPositionControls;
window.syncPodcasterSceneMediaPositionControls = syncPodcasterSceneMediaPositionControls;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPodcasterSceneMediaPositionControls, { once: true });
} else {
  initPodcasterSceneMediaPositionControls();
}
