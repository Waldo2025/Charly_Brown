/**
 * Podcaster Studio Resize Logic
 * Handles resizing of the video stage and inspector panel.
 */

// Constants (migrated from podcaster.js)
export const POD_STAGE_MAX_HEIGHT_PX_KEY = "cb_podcast_stage_max_height_px_v2";
export const POD_STAGE_MAX_HEIGHT_PX_MAX = 3600;
export const POD_STAGE_WIDTH_RATIO_KEY = "cb_podcast_stage_width_ratio_v1";

export const POD_INSPECTOR_WIDTH_KEY = "cb_pod_inspector_width_v1";
export const POD_INSPECTOR_WIDTH_MIN = 260;
export const POD_INSPECTOR_WIDTH_MAX = 800;
export const POD_INSPECTOR_WIDTH_DEFAULT = 340;
export const POD_VIDEO_LIBRARY_COLLAPSED_KEY = "cb_podcast_video_library_collapsed_v1";

// State (migrated from podcaster.js)
export let podcastStageMaxHeightPx = (() => {
  try {
    const val = window.localStorage.getItem(POD_STAGE_MAX_HEIGHT_PX_KEY);
    return val ? Math.max(240, Math.min(POD_STAGE_MAX_HEIGHT_PX_MAX, Number(val))) : null;
  } catch (_) {
    return null;
  }
})();

export let podcastStageResizeCleanup = null;
export let podcastStageResizeObserver = null;

export let podcastStudioInspectorWidth = (() => {
  try {
    const val = window.localStorage.getItem(POD_INSPECTOR_WIDTH_KEY);
    return val ? Math.max(POD_INSPECTOR_WIDTH_MIN, Math.min(POD_INSPECTOR_WIDTH_MAX, Number(val))) : POD_INSPECTOR_WIDTH_DEFAULT;
  } catch (_) {
    return POD_INSPECTOR_WIDTH_DEFAULT;
  }
})();

export let podcastStudioInspectorResizeCleanup = null;
export let podcastStudioInspectorResizeObserver = null;

export let podcastVideoLibraryCollapsed = (() => {
  try {
    return window.localStorage.getItem(POD_VIDEO_LIBRARY_COLLAPSED_KEY) === "1";
  } catch (_) {
    return false;
  }
})();

/**
 * Updates the stage max height and persists state.
 */
export function setPodcastVideoStageMaxHeight(nextHeightPx = null, { persist = true, els = {}, upsertUiState = () => {} } = {}) {
  const stage = els.podcastVideoStage;
  const shell = els.podcastVideoShell;
  if (!stage || !shell) return;

  stage.style.removeProperty("--pod-stage-width");
  shell.style.removeProperty("--pod-stage-width");

  try {
    window.localStorage.removeItem("cb_podcast_stage_height_ratio_v1");
    window.localStorage.removeItem(POD_STAGE_WIDTH_RATIO_KEY);
  } catch (_) { }

  const numericHeight = Number(nextHeightPx);
  if (!Number.isFinite(numericHeight) || numericHeight <= 0) {
    shell.style.removeProperty("--pod-stage-max-height");
    podcastStageMaxHeightPx = null;
    stage.classList.remove("is-user-resized");
    if (persist) {
      try {
        window.localStorage.removeItem(POD_STAGE_MAX_HEIGHT_PX_KEY);
      } catch (_) { }
      upsertUiState({ stageWidthRatio: null, stageMaxHeightPx: null }, { autosaveReason: "ui-state" });
    }
    return;
  }

  podcastStageMaxHeightPx = Math.max(280, Math.min(POD_STAGE_MAX_HEIGHT_PX_MAX, Math.round(numericHeight)));
  shell.style.setProperty("--pod-stage-max-height", `${podcastStageMaxHeightPx}px`);
  stage.classList.add("is-user-resized");
  
  if (persist) {
    try {
      window.localStorage.setItem(POD_STAGE_MAX_HEIGHT_PX_KEY, String(Math.round(podcastStageMaxHeightPx)));
    } catch (_) { }
    upsertUiState({ stageWidthRatio: null, stageMaxHeightPx: podcastStageMaxHeightPx }, { autosaveReason: "ui-state" });
  }
}

/**
 * Initializes the stage resize listeners.
 */
export function setupPodcastVideoStageResize(els = {}, upsertUiState = () => {}) {
  if (podcastStageResizeCleanup) {
    podcastStageResizeCleanup();
    podcastStageResizeCleanup = null;
  }
  if (podcastStageResizeObserver) {
    podcastStageResizeObserver.disconnect();
    podcastStageResizeObserver = null;
  }

  if (!els.podcastVideoStage || !els.podcastStageResizeHandle) return;

  // Apply initial height
  setPodcastVideoStageMaxHeight(podcastStageMaxHeightPx, { persist: false, els, upsertUiState });

  const handle = els.podcastStageResizeHandle;
  const stage = els.podcastVideoStage;

  const onDoubleClick = () => setPodcastVideoStageMaxHeight(null, { els, upsertUiState });
  
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-podcast-stage");

    const previewEl = stage.querySelector(".podcast-video-preview-shell") || stage.querySelector(".podcast-video-preview");
    const previewRect = previewEl?.getBoundingClientRect?.();
    const startY = event.clientY;
    const startHeight = previewRect?.height || 320;
    const safeStartHeight = Math.max(1, startHeight);

    const onPointerMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setPodcastVideoStageMaxHeight(safeStartHeight + deltaY, { persist: false, els, upsertUiState });
    };

    const stopResize = () => {
      document.body.classList.remove("is-resizing-podcast-stage");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      setPodcastVideoStageMaxHeight(podcastStageMaxHeightPx, { persist: true, els, upsertUiState });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  };

  handle.addEventListener("dblclick", onDoubleClick);
  handle.addEventListener("pointerdown", onPointerDown);

  podcastStageResizeCleanup = () => {
    handle.removeEventListener("dblclick", onDoubleClick);
    handle.removeEventListener("pointerdown", onPointerDown);
  };
}

/**
 * Updates the inspector width and persists state.
 */
export function setPodcastStudioInspectorWidth(nextWidth, { persist = true, els = {}, upsertUiState = () => {} } = {}) {
  const normalizedWidth = Math.max(
    POD_INSPECTOR_WIDTH_MIN,
    Math.min(POD_INSPECTOR_WIDTH_MAX, Number(nextWidth) || POD_INSPECTOR_WIDTH_DEFAULT)
  );
  podcastStudioInspectorWidth = normalizedWidth;
  
  if (els.podcastVideoShell) {
    els.podcastVideoShell.style.setProperty("--pod-studio-inspector-width", `${normalizedWidth}px`);
  }
  
  if (persist) {
    try {
      window.localStorage.setItem(POD_INSPECTOR_WIDTH_KEY, String(Math.round(normalizedWidth)));
    } catch (_) { }
    upsertUiState({ inspectorWidthPx: Math.round(normalizedWidth) }, { autosaveReason: "ui-state" });
  }
}

/**
 * Initializes the inspector resize listeners.
 */
export function setupPodcastStudioInspectorResize(els = {}, options = {}) {
  const { upsertUiState = () => {}, isCollapsed = () => false } = options;
  
  setPodcastStudioInspectorWidth(podcastStudioInspectorWidth, { persist: false, els, upsertUiState });
  
  if (podcastStudioInspectorResizeCleanup) {
    podcastStudioInspectorResizeCleanup();
    podcastStudioInspectorResizeCleanup = null;
  }
  
  if (!els.podcastStudioInspector || !els.podcastStudioInspectorResizeHandle) return;
  
  const handles = [els.podcastStudioInspectorResizeHandle].filter(Boolean);
  
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (window.innerWidth <= 920 || isCollapsed()) return;
    event.preventDefault();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-podcast-inspector");
    
    const shellRect = els.podcastVideoShell?.getBoundingClientRect();
    const layoutRect = els.podcastStudioInspector.parentElement?.getBoundingClientRect();
    const rightEdge = shellRect?.right || layoutRect?.right || window.innerWidth;
    
    const onPointerMove = (moveEvent) => {
      const nextWidth = rightEdge - moveEvent.clientX;
      setPodcastStudioInspectorWidth(nextWidth, { persist: false, els, upsertUiState });
    };
    
    const stopResize = () => {
      document.body.classList.remove("is-resizing-podcast-inspector");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      // Persist final width after drag ends
      setPodcastStudioInspectorWidth(podcastStudioInspectorWidth, { persist: true, els, upsertUiState });
    };
    
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  };
  
  handles.forEach((handle) => handle.addEventListener("pointerdown", onPointerDown));
  
  podcastStudioInspectorResizeCleanup = () => {
    handles.forEach((handle) => handle.removeEventListener("pointerdown", onPointerDown));
  };
  
  if (typeof ResizeObserver === "function") {
    if (podcastStudioInspectorResizeObserver) {
      podcastStudioInspectorResizeObserver.disconnect();
    }
    podcastStudioInspectorResizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) return;
      if (window.innerWidth <= 920 || isCollapsed()) return;
      const entry = entries[0];
      const nextWidth = entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect?.width || 0;
      if (!nextWidth) return;
      if (Math.abs(nextWidth - podcastStudioInspectorWidth) < 2) return;
      setPodcastStudioInspectorWidth(nextWidth, { persist: false, els, upsertUiState });
    });
    podcastStudioInspectorResizeObserver.observe(els.podcastStudioInspector);
  }
}

/**
 * Updates the library collapsed state and persists.
 */
export function setPodcastVideoLibraryCollapsed(collapsed, { persist = true, els = {}, upsertUiState = () => {} } = {}) {
  podcastVideoLibraryCollapsed = !!collapsed;
  
  if (els.podcastVideoShell) {
    els.podcastVideoShell.classList.toggle("is-library-collapsed", podcastVideoLibraryCollapsed);
  }
  if (els.podcastVideoStage) {
    els.podcastVideoStage.classList.toggle("is-library-collapsed", podcastVideoLibraryCollapsed);
  }
  
  if (els.podcastVideoLibraryCollapsedHandle) {
    els.podcastVideoLibraryCollapsedHandle.setAttribute("aria-expanded", podcastVideoLibraryCollapsed ? "false" : "true");
  }
  if (els.togglePodcastVideoLibraryBtn) {
    els.togglePodcastVideoLibraryBtn.setAttribute("aria-expanded", podcastVideoLibraryCollapsed ? "false" : "true");
  }
  
  if (persist) {
    try {
      window.localStorage.setItem(POD_VIDEO_LIBRARY_COLLAPSED_KEY, podcastVideoLibraryCollapsed ? "1" : "0");
    } catch (_) { }
    upsertUiState({ libraryCollapsed: podcastVideoLibraryCollapsed }, { autosaveReason: "ui-state" });
  }
}
