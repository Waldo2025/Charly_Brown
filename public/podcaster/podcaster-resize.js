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
export const SESSIONS_RAIL_WIDTH_KEY = "cb_snoopy_sessions_rail_width_v1";
export const SESSIONS_RAIL_WIDTH_MIN = 220;
export const SESSIONS_RAIL_WIDTH_MAX = 480;
export const SESSIONS_RAIL_WIDTH_DEFAULT = 280;
export const PODCASTER_SIDEPANEL_WIDTH_KEY = "cb_snoopy_sidepanel_width_v1";
export const PODCASTER_SIDEPANEL_WIDTH_MIN = 180;
export const PODCASTER_SIDEPANEL_WIDTH_MAX = 640;
export const PODCASTER_SIDEPANEL_WIDTH_DEFAULT = 380;
export const COMPOSER_SHELL_HEIGHT_KEY = "cb_podcaster_composer_height_v1";
export const COMPOSER_SHELL_HEIGHT_MIN = 150;
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
export let sessionsRailResizeCleanup = null;
export let sessionsRailWidth = (() => {
  try {
    const storedWidth = Number(window.localStorage.getItem(SESSIONS_RAIL_WIDTH_KEY));
    return Number.isFinite(storedWidth) && storedWidth > 0
      ? Math.max(SESSIONS_RAIL_WIDTH_MIN, Math.min(SESSIONS_RAIL_WIDTH_MAX, storedWidth))
      : SESSIONS_RAIL_WIDTH_DEFAULT;
  } catch (_) {
    return SESSIONS_RAIL_WIDTH_DEFAULT;
  }
})();
export let podcasterSidepanelResizeCleanup = null;
export let podcasterSidepanelWidth = (() => {
  try {
    const storedWidth = Number(window.localStorage.getItem(PODCASTER_SIDEPANEL_WIDTH_KEY));
    return Number.isFinite(storedWidth) && storedWidth > 0
      ? Math.max(PODCASTER_SIDEPANEL_WIDTH_MIN, Math.min(PODCASTER_SIDEPANEL_WIDTH_MAX, storedWidth))
      : PODCASTER_SIDEPANEL_WIDTH_DEFAULT;
  } catch (_) {
    return PODCASTER_SIDEPANEL_WIDTH_DEFAULT;
  }
})();
export let composerShellResizeCleanup = null;
export let composerShellHeight = (() => {
  try {
    const storedHeight = Number(window.localStorage.getItem(COMPOSER_SHELL_HEIGHT_KEY));
    return Number.isFinite(storedHeight) && storedHeight >= COMPOSER_SHELL_HEIGHT_MIN
      ? Math.round(storedHeight)
      : null;
  } catch (_) {
    return null;
  }
})();

export let podcastVideoLibraryCollapsed = (() => {
  try {
    return window.localStorage.getItem(POD_VIDEO_LIBRARY_COLLAPSED_KEY) === "1";
  } catch (_) {
    return false;
  }
})();

function updatePodcastVideoLibraryToggleUi(els = {}) {
  const expanded = !podcastVideoLibraryCollapsed;
  const toggleBtn = els.togglePodcastVideoLibraryBtn || null;
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggleBtn.setAttribute("aria-label", expanded ? "Cerrar librería" : "Mostrar librería");
    toggleBtn.setAttribute("title", expanded ? "Cerrar librería" : "Mostrar librería");
    toggleBtn.dataset.tooltip = expanded ? "Cerrar librería" : "Mostrar librería";
    const icon = toggleBtn.querySelector("i");
    if (icon) {
      icon.classList.remove("fa-chevron-left", "fa-chevron-right");
      icon.classList.add(expanded ? "fa-chevron-left" : "fa-chevron-right");
    }
  }
  if (els.podcastVideoLibraryCollapsedHandle) {
    els.podcastVideoLibraryCollapsedHandle.setAttribute("aria-expanded", expanded ? "true" : "false");
  }
}

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

  podcastStageMaxHeightPx = Math.max(120, Math.min(POD_STAGE_MAX_HEIGHT_PX_MAX, Math.round(numericHeight)));
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
export function setupPodcastVideoStageResize(els = {}, options = {}) {
  const normalizedOptions = typeof options === "function"
    ? { upsertUiState: options }
    : (options && typeof options === "object" ? options : {});
  const upsertUiState = typeof normalizedOptions.upsertUiState === "function"
    ? normalizedOptions.upsertUiState
    : () => {};
  const onStageResize = typeof normalizedOptions.onStageResize === "function"
    ? normalizedOptions.onStageResize
    : () => {};
  let stageResizeRefreshFrame = 0;
  const scheduleStageResizeRefresh = () => {
    if (stageResizeRefreshFrame) window.cancelAnimationFrame(stageResizeRefreshFrame);
    stageResizeRefreshFrame = window.requestAnimationFrame(() => {
      stageResizeRefreshFrame = 0;
      onStageResize();
    });
  };

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

  const onDoubleClick = () => {
    setPodcastVideoStageMaxHeight(null, { els, upsertUiState });
    scheduleStageResizeRefresh();
  };
  
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-podcast-stage");

    const previewEl = stage.querySelector(".podcast-video-preview") || stage.querySelector(".podcast-video-preview-shell");
    const previewRect = previewEl?.getBoundingClientRect?.();
    const startY = event.clientY;
    const startHeight = previewRect?.height || 320;
    const safeStartHeight = Math.max(1, startHeight);

    const onPointerMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setPodcastVideoStageMaxHeight(safeStartHeight + deltaY, { persist: false, els, upsertUiState });
      scheduleStageResizeRefresh();
    };

    const stopResize = () => {
      document.body.classList.remove("is-resizing-podcast-stage");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      setPodcastVideoStageMaxHeight(podcastStageMaxHeightPx, { persist: true, els, upsertUiState });
      scheduleStageResizeRefresh();
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
    if (stageResizeRefreshFrame) {
      window.cancelAnimationFrame(stageResizeRefreshFrame);
      stageResizeRefreshFrame = 0;
    }
  };

  if (typeof ResizeObserver === "function") {
    const observedPreview = stage.querySelector(".podcast-video-preview") || stage;
    podcastStageResizeObserver = new ResizeObserver(() => {
      scheduleStageResizeRefresh();
    });
    podcastStageResizeObserver.observe(observedPreview);
  }
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
    
    const inspectorRect = els.podcastStudioInspector.getBoundingClientRect();
    const layoutRect = els.podcastStudioInspector.parentElement?.getBoundingClientRect();
    const rightEdge = inspectorRect?.right || layoutRect?.right || window.innerWidth;
    
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
      if (document.body.classList.contains("is-resizing-podcast-inspector")) return;
      const entry = entries[0];
      const nextWidth = entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect?.width || 0;
      if (!nextWidth) return;
      if (Math.abs(nextWidth - podcastStudioInspectorWidth) < 2) return;
      setPodcastStudioInspectorWidth(nextWidth, { persist: false, els, upsertUiState });
    });
    podcastStudioInspectorResizeObserver.observe(els.podcastStudioInspector);
  }
}

export function setSessionsRailWidth(nextWidth, { persist = true, els = {} } = {}) {
  const normalizedWidth = Math.round(Math.max(
    SESSIONS_RAIL_WIDTH_MIN,
    Math.min(SESSIONS_RAIL_WIDTH_MAX, Number(nextWidth) || SESSIONS_RAIL_WIDTH_DEFAULT)
  ));
  sessionsRailWidth = normalizedWidth;
  els.podcasterLayout?.style.setProperty("--sessions-rail-width", `${normalizedWidth}px`);

  if (persist) {
    try {
      window.localStorage.setItem(SESSIONS_RAIL_WIDTH_KEY, String(normalizedWidth));
    } catch (_) { }
  }
}

export function setupSessionsRailResize(els = {}) {
  setSessionsRailWidth(sessionsRailWidth, { persist: false, els });

  if (sessionsRailResizeCleanup) {
    sessionsRailResizeCleanup();
    sessionsRailResizeCleanup = null;
  }

  const handle = els.sessionsRailResizeHandle;
  if (!handle || !els.podcasterLayout) return;

  const onPointerDown = (event) => {
    if (event.button !== 0 || window.innerWidth <= 920) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-sessions-rail");
    const layoutLeft = els.podcasterLayout.getBoundingClientRect().left;

    const onPointerMove = (moveEvent) => {
      setSessionsRailWidth(moveEvent.clientX - layoutLeft, { persist: false, els });
    };

    const stopResize = () => {
      document.body.classList.remove("is-resizing-sessions-rail");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      setSessionsRailWidth(sessionsRailWidth, { persist: true, els });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  };

  const onDoubleClick = () => {
    setSessionsRailWidth(SESSIONS_RAIL_WIDTH_DEFAULT, { persist: true, els });
  };

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("dblclick", onDoubleClick);
  sessionsRailResizeCleanup = () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("dblclick", onDoubleClick);
  };
}

export function setPodcasterSidepanelWidth(nextWidth, { persist = true, els = {} } = {}) {
  const normalizedWidth = Math.round(Math.max(
    PODCASTER_SIDEPANEL_WIDTH_MIN,
    Math.min(PODCASTER_SIDEPANEL_WIDTH_MAX, Number(nextWidth) || PODCASTER_SIDEPANEL_WIDTH_DEFAULT)
  ));
  podcasterSidepanelWidth = normalizedWidth;
  els.podcasterLayout?.style.setProperty("--pod-sidepanel-max", `${normalizedWidth}px`);

  if (persist) {
    try {
      window.localStorage.setItem(PODCASTER_SIDEPANEL_WIDTH_KEY, String(normalizedWidth));
    } catch (_) { }
  }
}

export function setupPodcasterSidepanelResize(els = {}) {
  setPodcasterSidepanelWidth(podcasterSidepanelWidth, { persist: false, els });

  if (podcasterSidepanelResizeCleanup) {
    podcasterSidepanelResizeCleanup();
    podcasterSidepanelResizeCleanup = null;
  }

  const handle = els.podcasterSidepanelResizeHandle;
  if (!handle || !els.sidepanel || !els.podcasterLayout) return;

  const onPointerDown = (event) => {
    if (event.button !== 0 || window.innerWidth <= 920) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-podcaster-sidepanel");
    const rightEdge = els.sidepanel.getBoundingClientRect().right;

    const onPointerMove = (moveEvent) => {
      setPodcasterSidepanelWidth(rightEdge - moveEvent.clientX, { persist: false, els });
    };

    const stopResize = () => {
      document.body.classList.remove("is-resizing-podcaster-sidepanel");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      setPodcasterSidepanelWidth(podcasterSidepanelWidth, { persist: true, els });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  };

  const onDoubleClick = () => {
    setPodcasterSidepanelWidth(PODCASTER_SIDEPANEL_WIDTH_DEFAULT, { persist: true, els });
  };

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("dblclick", onDoubleClick);
  podcasterSidepanelResizeCleanup = () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("dblclick", onDoubleClick);
  };
}

function getComposerShellHeightMax(els = {}) {
  const stageHeight = Number(els.chatStage?.getBoundingClientRect?.().height || window.innerHeight || 0);
  return Math.max(COMPOSER_SHELL_HEIGHT_MIN, Math.floor(stageHeight - 72));
}

export function setComposerShellHeight(nextHeight, { persist = true, els = {}, onResize = () => {} } = {}) {
  const shell = els.composerShell;
  if (!shell) return;

  const numericHeight = Number(nextHeight);
  if (!Number.isFinite(numericHeight) || numericHeight <= 0) {
    composerShellHeight = null;
    shell.classList.remove("is-user-resized");
    shell.style.removeProperty("--pod-composer-height");
    els.composerResizeHandle?.removeAttribute("aria-valuenow");
    if (persist) {
      try {
        window.localStorage.removeItem(COMPOSER_SHELL_HEIGHT_KEY);
      } catch (_) { }
    }
    onResize();
    return;
  }

  composerShellHeight = Math.round(Math.max(
    COMPOSER_SHELL_HEIGHT_MIN,
    Math.min(getComposerShellHeightMax(els), numericHeight)
  ));
  shell.style.setProperty("--pod-composer-height", `${composerShellHeight}px`);
  shell.classList.add("is-user-resized");
  els.composerResizeHandle?.setAttribute("aria-valuenow", String(composerShellHeight));
  if (persist) {
    try {
      window.localStorage.setItem(COMPOSER_SHELL_HEIGHT_KEY, String(composerShellHeight));
    } catch (_) { }
  }
  onResize();
}

export function setupComposerShellResize(els = {}, options = {}) {
  const onResize = typeof options.onResize === "function" ? options.onResize : () => {};
  if (composerShellResizeCleanup) {
    composerShellResizeCleanup();
    composerShellResizeCleanup = null;
  }

  const shell = els.composerShell;
  const handle = els.composerResizeHandle;
  if (!shell || !handle) return;

  handle.setAttribute("aria-valuemin", String(COMPOSER_SHELL_HEIGHT_MIN));
  handle.setAttribute("aria-valuemax", String(getComposerShellHeightMax(els)));
  setComposerShellHeight(composerShellHeight, { persist: false, els, onResize });

  const resetHeight = () => {
    setComposerShellHeight(null, { persist: true, els, onResize });
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-composer-shell");
    const startY = event.clientY;
    const startHeight = shell.getBoundingClientRect().height;

    const onPointerMove = (moveEvent) => {
      setComposerShellHeight(startHeight + startY - moveEvent.clientY, {
        persist: false,
        els,
        onResize
      });
    };

    const stopResize = () => {
      document.body.classList.remove("is-resizing-composer-shell");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      setComposerShellHeight(composerShellHeight, { persist: true, els, onResize });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  };

  const onKeyDown = (event) => {
    if (event.key === "Home") {
      event.preventDefault();
      resetHeight();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 12;
    const currentHeight = shell.getBoundingClientRect().height;
    const direction = event.key === "ArrowUp" ? 1 : -1;
    setComposerShellHeight(currentHeight + (step * direction), { persist: true, els, onResize });
  };

  const onWindowResize = () => {
    handle.setAttribute("aria-valuemax", String(getComposerShellHeightMax(els)));
    if (composerShellHeight !== null) {
      setComposerShellHeight(composerShellHeight, { persist: false, els, onResize });
    }
  };

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("dblclick", resetHeight);
  handle.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onWindowResize);

  composerShellResizeCleanup = () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("dblclick", resetHeight);
    handle.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onWindowResize);
    document.body.classList.remove("is-resizing-composer-shell");
  };
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
  updatePodcastVideoLibraryToggleUi(els);
  
  if (persist) {
    try {
      window.localStorage.setItem(POD_VIDEO_LIBRARY_COLLAPSED_KEY, podcastVideoLibraryCollapsed ? "1" : "0");
    } catch (_) { }
    upsertUiState({ libraryCollapsed: podcastVideoLibraryCollapsed }, { autosaveReason: "ui-state" });
  }
}
