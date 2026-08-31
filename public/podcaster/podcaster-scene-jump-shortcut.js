(() => {
  if (window.PodcasterSceneJumpShortcutInstalled) return;
  window.PodcasterSceneJumpShortcutInstalled = true;

  const STATE = {
    overlay: null,
    input: null,
    error: null,
    form: null
  };

  const SELECTOR_CACHE = [
    ".podcast-video-timeline-clip[data-row-id]",
    ".podcast-onscreen-text-timeline-clip[data-row-id]",
    ".podcast-video-scene-card[data-row-id]",
    ".podcast-montage-audio-chip[data-row-id]",
    ".podcast-video-timeline-item[data-row-id]"
  ];

  function injectStyles() {
    if (document.getElementById("podcasterSceneJumpShortcutStyles")) return;
    const style = document.createElement("style");
    style.id = "podcasterSceneJumpShortcutStyles";
    style.textContent = `
      #podcasterSceneJumpShortcutOverlay {
        position: fixed;
        inset: 0;
        z-index: 12000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgb(15 23 42 / 24%);
      }

      #podcasterSceneJumpShortcutOverlay[hidden] {
        display: none;
      }

      #podcasterSceneJumpShortcutOverlay .podcaster-scene-jump-shortcut {
        width: min(92vw, 85px);
        padding: 10px;
        text-align: left;
        border-radius: 10px;
        background: var(--pod-surface, #ffffff);
        border: 1px solid var(--pod-border, #dbe0ea);
        box-shadow: 0 8px 18px rgb(0 0 0 / 14%);
        color: var(--pod-text, #111827);
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        height: 70px;
      }

      #podcasterSceneJumpShortcutOverlay .podcaster-scene-jump-shortcut label {
        display: block;
        margin-bottom: 4px;
        font-weight: 400;
        font-size: 12px;
      }

      #podcasterSceneJumpShortcutOverlay .podcaster-scene-jump-shortcut input {
        width: 100%;
        max-width: none;
        background: var(--pod-surface-2, #ffffff);
        border: 1px solid color-mix(in srgb, var(--pod-border, #bfc4d4) 88%, transparent 12%);
        border-radius: 8px;
        padding: 5px 8px;
        font-size: 10px;
        line-height: 1.1;
        outline: none;
        text-align: center;
        color: var(--pod-text, #111827);
      }

      #podcasterSceneJumpShortcutOverlay .podcaster-scene-jump-shortcut input::placeholder {
        color: color-mix(in srgb, var(--pod-text, #111827) 62%, transparent 38%);
      }

      #podcasterSceneJumpShortcutOverlay .podcaster-scene-jump-shortcut input:focus {
        border-color: color-mix(in srgb, var(--pod-accent, #3f4d98) 42%, var(--pod-border, #bfc4d4) 58%);
        box-shadow: 0 0 0 2px rgb(99 102 241 / 14%);
      }

      #podcasterSceneJumpShortcutOverlay .podcaster-scene-jump-error {
        margin: 4px 0 0;
        color: color-mix(in srgb, #ef4444 46%, var(--pod-text, #111827) 54%);
        font-size: 11px;
        min-height: 13px;
      }
    `;
    document.head.appendChild(style);
  }

  function resolveActiveSession() {
    return window.PodcasterState?.activeSession || null;
  }

  function resolveRows(session = null) {
    const activeSession = session || resolveActiveSession();
    if (!activeSession || !Array.isArray(activeSession?.script?.rows)) return [];
    return activeSession.script.rows;
  }

  function isSceneJumpInputTarget(target = null) {
    const el = target instanceof Element ? target : null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest("input, textarea, select, [contenteditable='true']")) return true;
    const tag = String(el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "podcasterSceneJumpShortcutOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="podcaster-scene-jump-shortcut" role="dialog" aria-modal="true" aria-labelledby="podcasterSceneJumpShortcutTitle">
        <label id="podcasterSceneJumpShortcutTitle">Ir a escena</label>
        <input
          id="podcasterSceneJumpShortcutInput"
          type="text"
          inputmode="numeric"
          maxlength="2"
          autocomplete="off"
          placeholder="1"
          aria-describedby="podcasterSceneJumpShortcutError"
        />
        <div id="podcasterSceneJumpShortcutError" class="podcaster-scene-jump-error" aria-live="polite"></div>
      </div>
    `;

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSceneJumpPopup();
    });

    return overlay;
  }

  function getTimeline() {
    return window.els?.podcastVideoTimeline || null;
  }

  function getRuler() {
    return window.els?.podcastTimelineRuler || null;
  }

  function getSceneTargetNode(rowId = "") {
    const timeline = getTimeline();
    if (!timeline || !rowId) return null;
    const escapedRowId = typeof CSS.escape === "function" ? CSS.escape(String(rowId)) : String(rowId).replace(/"/g, "\\\"");
    const node = timeline.querySelector([
      `.podcast-video-timeline-clip[data-row-id="${escapedRowId}"]`,
      `.podcast-onscreen-text-timeline-clip[data-row-id="${escapedRowId}"]`,
      `.podcast-video-scene-card[data-row-id="${escapedRowId}"]`,
      `.podcast-montage-audio-chip[data-row-id="${escapedRowId}"]`,
      `.podcast-video-timeline-item[data-row-id="${escapedRowId}"]`
    ].join(","));
    if (node) return node;

    for (const selector of SELECTOR_CACHE) {
      const safeSelector = `${selector}[data-row-id="${escapedRowId}"]`;
      const fallbackNode = timeline.querySelector(safeSelector);
      if (fallbackNode) return fallbackNode;
    }

    return null;
  }

  function clampNumber(value, min = 0, max = 0) {
    const next = Math.round(Number(value || 0));
    if (!Number.isFinite(next)) return NaN;
    if (next < min || next > max) return NaN;
    return next;
  }

  function resolveSceneByNumber(sceneNumber = 0) {
    const session = resolveActiveSession();
    const rows = resolveRows(session);
    const totalScenes = rows.length;
    const index = clampNumber(sceneNumber, 1, totalScenes) - 1;
    if (!Number.isFinite(index)) return null;
    const row = rows[index] || null;
    const rowId = String(row?.id || "").trim();
    if (!rowId) return null;
    return {
      session,
      row,
      rowId,
      index
    };
  }

  function resolveSceneTargetPx(rowId = "", session = null) {
    const timeline = getTimeline();
    const activeSession = session || resolveActiveSession();
    if (!timeline || !activeSession) return NaN;

    const node = getSceneTargetNode(rowId);
    if (node) {
      return Number(node.offsetLeft || 0) + (Number(node.offsetWidth || 0) / 2);
    }

    if (typeof window.ensureTimelineClipsByRowId !== "function") return NaN;
    const clipMap = window.ensureTimelineClipsByRowId(activeSession) || {};
    const clip = clipMap?.[String(rowId || "")] || null;
    const startMs = Number(clip?.startMs || 0);
    if (!Number.isFinite(startMs) || startMs < 0) return NaN;
    if (typeof window.timelineMsToPx !== "function") return NaN;
    const canvas = timeline.querySelector(".podcast-video-timeline-canvas");
    const rulerOffsetPx = Math.max(0, Number(canvas?.dataset?.playheadOffset || 0));
    return rulerOffsetPx + Number(window.timelineMsToPx(startMs, activeSession));
  }

  function resolveSceneStartMs(rowId = "", session = null) {
    const activeSession = session || resolveActiveSession();
    if (!activeSession) return NaN;

    const safeRowId = String(rowId || "").trim();
    if (typeof window.buildTimelineRuntimeEntries === "function") {
      const entries = window.buildTimelineRuntimeEntries(activeSession) || [];
      const entry = entries.find((item) => String(item?.rowId || "").trim() === safeRowId) || null;
      if (entry) {
        const runtimeStartMs = Math.max(0, Number(entry.startMs || 0));
        if (Number.isFinite(runtimeStartMs)) return runtimeStartMs;
      }
    }

    if (typeof window.ensureTimelineClipsByRowId === "function") {
      const clipMap = window.ensureTimelineClipsByRowId(activeSession, { persist: false }) || {};
      const clip = clipMap?.[safeRowId] || null;
      const clipStartMs = Number(clip?.startMs || 0);
      if (Number.isFinite(clipStartMs)) return Math.max(0, clipStartMs);
    }

    const rows = resolveRows(activeSession);
    const row = rows.find((item) => String(item?.id || "").trim() === safeRowId) || null;
    if (row) {
      const candidates = [
        row.startMs,
        row.timelineStartMs,
        row.timelineOffsetMs,
        row.start,
        row.offsetMs
      ];
      for (const candidate of candidates) {
        const value = Number(candidate);
        if (Number.isFinite(value)) return Math.max(0, value);
      }
    }

    return NaN;
  }

  function syncRulerViewport(scrollLeft = 0) {
    const ruler = getRuler();
    if (!ruler) return;
    ruler.scrollLeft = Math.max(0, Math.round(scrollLeft));
    const rulerInner = ruler.querySelector(".podcast-timeline-ruler-inner");
    if (rulerInner) {
      rulerInner.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`;
    }
  }

  function centerTimelineAtPx(targetCenterPx = 0) {
    const timeline = getTimeline();
    if (!timeline || !Number.isFinite(targetCenterPx)) return false;
    const viewportWidth = Math.max(0, Number(timeline.clientWidth || 0));
    if (viewportWidth <= 0) return false;

    const maxScrollLeft = Math.max(0, Number(timeline.scrollWidth || 0) - viewportWidth);
    const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, Math.round(targetCenterPx - (viewportWidth / 2))));

    if (!Number.isFinite(targetScrollLeft)) return false;
    timeline.scrollLeft = targetScrollLeft;
    syncRulerViewport(targetScrollLeft);

    return true;
  }

  async function syncPlaybackCursorStartMs(startMs = NaN, session = null) {
    const activeSession = session || resolveActiveSession();
    const normalizedMs = Number(startMs);
    if (!Number.isFinite(normalizedMs)) return;
    const targetMs = Math.max(0, normalizedMs);

    if (typeof window.playbackController?.seek === "function") {
      try {
        await window.playbackController.seek(targetMs, {
          lightweight: true,
          deferPreview: true,
          navigationOnly: true,
          suppressAutoScroll: true
        });
        return;
      } catch (_) { }
    }

    if (window.podcastVideoState && Number.isFinite(targetMs)) {
      window.podcastVideoState.montageCursorMs = targetMs;
    }
    if (typeof window.syncPodcastTimelinePlayhead === "function") {
      window.syncPodcastTimelinePlayhead(activeSession, {
        currentMs: targetMs,
        suppressAutoScroll: true
      });
    }
  }

  function showError(message = "") {
    if (!STATE.error) return;
    STATE.error.textContent = message || "";
  }

  function clearError() {
    showError("");
  }

  function setPopupOpen(open = false) {
    if (!STATE.overlay) return;
    STATE.overlay.hidden = !open;
    if (open) {
      if (STATE.input) STATE.input.focus();
    } else if (STATE.input) {
      STATE.input.value = "";
      clearError();
    }
  }

  function closeSceneJumpPopup() {
    setPopupOpen(false);
    if (STATE.input) {
      STATE.input.value = "";
      clearError();
    }
  }

  async function activateSceneFromNumber(sceneNumber = 0) {
    const resolved = resolveSceneByNumber(sceneNumber);
    if (!resolved || !resolved.session) {
      showError("Numero de escena invalida. Revisar el rango.");
      return;
    }

    const rowId = resolved.rowId;
    const selectScene = () => {
      if (window.PodcasterUI?.selectTimelineSceneRow) {
        window.PodcasterUI.selectTimelineSceneRow(rowId, {
          syncStage: false,
          preserveMontageCursor: false,
          force: true
        });
        return;
      }
      if (window.PodcasterState) {
        window.PodcasterState.activeRowId = rowId;
      }
    };

    selectScene();

    const centerPx = resolveSceneTargetPx(rowId, resolved.session);
    if (!Number.isFinite(centerPx)) {
      showError("No se pudo calcular la posicion exacta de la escena para centrarla.");
      return;
    }

    const centered = centerTimelineAtPx(centerPx);
    if (!centered) {
      showError("No se pudo centrar la vista del timeline.");
      return;
    }

    const startMs = resolveSceneStartMs(rowId, resolved.session);
    if (!Number.isFinite(startMs)) {
      showError("No se pudo ubicar el tiempo de inicio de la escena.");
      return;
    }

    await syncPlaybackCursorStartMs(startMs, resolved.session);

    if (typeof window.syncPodcastTimelinePlayhead === "function") {
      window.syncPodcastTimelinePlayhead(resolved.session, {
        currentMs: startMs,
        suppressAutoScroll: true
      });
    }

    closeSceneJumpPopup();
  }

  function handlePopupSubmit(event = null) {
    event?.preventDefault();
    if (!STATE.input) return;
    const rawValue = String(STATE.input.value || "").trim();
    const sceneNumber = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(sceneNumber) || String(sceneNumber) !== rawValue || sceneNumber <= 0) {
      showError("Escribe un numero valido.");
      return;
    }
    void activateSceneFromNumber(sceneNumber).catch(() => {
      showError("No se pudo activar la escena.");
    });
  }

  function openSceneJumpPopup() {
    if (!window.PodcasterState?.activeSession) return;
    if (isSceneJumpInputTarget(document.activeElement)) return;

    if (!STATE.overlay) {
      STATE.overlay = buildOverlay();
      const overlay = STATE.overlay;
      STATE.form = overlay.querySelector(".podcaster-scene-jump-shortcut");
      STATE.input = overlay.querySelector("#podcasterSceneJumpShortcutInput");
      STATE.error = overlay.querySelector("#podcasterSceneJumpShortcutError");
      STATE.input?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeSceneJumpPopup();
          return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        handlePopupSubmit(event);
      });
      STATE.input?.addEventListener("input", () => {
        clearError();
      });
      overlay.addEventListener("submit", (event) => {
        handlePopupSubmit(event);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeSceneJumpPopup();
        }
      });
      overlay.addEventListener("mousedown", (event) => {
        if (event.target === overlay) closeSceneJumpPopup();
      });
      document.body.appendChild(overlay);
    }

    setPopupOpen(true);
    clearError();

    if (STATE.input) {
      STATE.input.focus({ preventScroll: true });
      STATE.input.select();
    }
  }

  function handleShortcut(event = null) {
    if (!event) return;
    if (event.defaultPrevented) return;
    if (!event.metaKey && !event.ctrlKey) return;
    if (event.key !== "j" && event.key !== "J" && event.code !== "KeyJ") return;

    if (isSceneJumpInputTarget(event.target)) return;
    event.preventDefault();
    openSceneJumpPopup();
  }

  function init() {
    injectStyles();
    document.addEventListener("keydown", handleShortcut, false);
  }

  init();
})();
