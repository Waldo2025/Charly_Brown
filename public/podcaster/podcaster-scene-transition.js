const TRANSITION_TYPES = [
  "cut",
  "crossfade",
  "dip-black",
  "flash-white",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "blur"
];

const DEFAULT_PRESETS = {
  cut: { type: "cut", durationMs: 0 },
  crossfade: { type: "crossfade", durationMs: 320 },
  "dip-black": { type: "dip-black", durationMs: 420 },
  "flash-white": { type: "flash-white", durationMs: 220 },
  "slide-left": { type: "slide-left", durationMs: 360 },
  "slide-right": { type: "slide-right", durationMs: 360 },
  "slide-up": { type: "slide-up", durationMs: 340 },
  "slide-down": { type: "slide-down", durationMs: 340 },
  "zoom-in": { type: "zoom-in", durationMs: 300 },
  "zoom-out": { type: "zoom-out", durationMs: 300 },
  blur: { type: "blur", durationMs: 320 }
};

function clampDurationMs(value = 0) {
  return Math.max(0, Math.min(1200, Math.round(Number(value) || 0)));
}

export function getTransitionEdgeKey(fromRowId = "", toRowId = "") {
  const from = String(fromRowId || "").trim();
  const to = String(toRowId || "").trim();
  if (!from || !to) return "";
  return `${from}__${to}`;
}

export function normalizeTransitionsByEdge(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([edgeKey, item]) => {
    const key = String(edgeKey || "").trim();
    if (!key || !item || typeof item !== "object") return;
    const requestedType = String(item.type || "").trim().toLowerCase();
    const type = TRANSITION_TYPES.includes(requestedType) ? requestedType : "cut";
    next[key] = {
      type,
      durationMs: clampDurationMs(item.durationMs)
    };
  });
  return next;
}

export function getTransitionForEdge(configOrSession = null, fromRowId = "", toRowId = "") {
  const edgeKey = getTransitionEdgeKey(fromRowId, toRowId);
  if (!edgeKey) return { ...DEFAULT_PRESETS.cut };
  const source = configOrSession?.podcastVideoConfig || configOrSession || {};
  const transitionsByEdge = normalizeTransitionsByEdge(source?.transitionsByEdge || {});
  const stored = transitionsByEdge[edgeKey];
  return stored ? { ...stored } : { ...DEFAULT_PRESETS.cut };
}

export function getTransitionOverlapWindow(fromEntry = null, toEntry = null, transition = null) {
  const durationMs = clampDurationMs(transition?.durationMs);
  if (!fromEntry || !toEntry || durationMs <= 0) {
    return { startMs: 0, endMs: 0, durationMs: 0 };
  }
  const startMs = Math.max(Number(toEntry?.startMs || 0), Number(fromEntry?.endMs || 0) - durationMs);
  const endMs = Math.min(Number(fromEntry?.endMs || 0), Number(toEntry?.endMs || 0));
  return {
    startMs,
    endMs: Math.max(startMs, endMs),
    durationMs: Math.max(0, Math.min(durationMs, endMs - startMs))
  };
}

export function resolveTransitionPlaybackState(currentMs = 0, fromEntry = null, toEntry = null, transition = null) {
  const overlap = getTransitionOverlapWindow(fromEntry, toEntry, transition);
  if (overlap.durationMs <= 0) {
    return {
      isActive: false,
      phase: "cut",
      progress: 1,
      fromProgress: 0,
      toProgress: 1,
      overlapStartMs: overlap.startMs,
      overlapEndMs: overlap.endMs,
      overlapDurationMs: overlap.durationMs
    };
  }
  const clampedMs = Math.max(overlap.startMs, Math.min(overlap.endMs, Number(currentMs || 0)));
  const progress = Math.max(0, Math.min(1, (clampedMs - overlap.startMs) / Math.max(1, overlap.durationMs)));
  return {
    isActive: clampedMs >= overlap.startMs && clampedMs <= overlap.endMs,
    phase: progress <= 0 ? "out" : progress >= 1 ? "in" : "both",
    progress,
    fromProgress: Math.max(0, Math.min(1, 1 - progress)),
    toProgress: Math.max(0, Math.min(1, progress)),
    overlapStartMs: overlap.startMs,
    overlapEndMs: overlap.endMs,
    overlapDurationMs: overlap.durationMs
  };
}

export function getTransitionPreset(type = "cut") {
  const key = String(type || "").trim().toLowerCase();
  return { ...(DEFAULT_PRESETS[key] || DEFAULT_PRESETS.cut) };
}

export function getAllTransitionTypes() {
  return [...TRANSITION_TYPES];
}

export function createPodcasterSceneTransitionApi(deps = {}) {
  const {
    els,
    podcastVideoState,
    getActiveSession,
    getSessionRows,
    getTransitionTimelineRowOrder,
    resolveSceneNumberByRowId,
    upsertPodcastVideoConfig,
    scheduleSessionLocalPersist,
    persistReorderedTimelinePatchToCloud,
    renderPodcastVideoTimeline,
    renderPodcastTransitionTimeline,
    syncPodcastStudioInspector,
    selectTimelineSceneRow
  } = deps;

  function getActiveTransitionEdge(session = null) {
    const activeSession = session || getActiveSession();
    const timelineRowIds = getTransitionTimelineRowOrder(activeSession);
    const scriptRowIds = getSessionRows(activeSession).map((row) => String(row?.id || "").trim()).filter(Boolean);
    const rowIds = timelineRowIds.length >= 2 ? timelineRowIds : scriptRowIds;
    if (rowIds.length < 2) return { fromRowId: "", toRowId: "" };
    const indexOf = (value = "") => rowIds.findIndex((id) => id === String(value || "").trim());
    const explicitFrom = String(podcastVideoState.transitionFromRowId || "").trim();
    const explicitTo = String(podcastVideoState.transitionToRowId || "").trim();
    const explicitFromIdx = indexOf(explicitFrom);
    const explicitToIdx = indexOf(explicitTo);
    if (explicitFromIdx >= 0 && explicitToIdx === explicitFromIdx + 1) {
      return { fromRowId: explicitFrom, toRowId: explicitTo };
    }
    if (explicitFromIdx >= 0) {
      const toIdx = Math.min(rowIds.length - 1, explicitFromIdx + 1);
      if (toIdx > explicitFromIdx) {
        return { fromRowId: rowIds[explicitFromIdx], toRowId: rowIds[toIdx] };
      }
    }
    const activeRowId = String(podcastVideoState.activeRowId || "").trim();
    let idx = indexOf(activeRowId);
    if (idx < 0) idx = 0;
    if (idx >= rowIds.length - 1) idx = rowIds.length - 2;
    return {
      fromRowId: String(rowIds[idx] || "").trim(),
      toRowId: String(rowIds[idx + 1] || "").trim()
    };
  }

  function getActiveTransitionSelection(session = null) {
    const activeSession = session || getActiveSession();
    const timelineRowIds = getTransitionTimelineRowOrder(activeSession);
    const scriptRowIds = getSessionRows(activeSession).map((row) => String(row?.id || "").trim()).filter(Boolean);
    const rowIds = timelineRowIds.length >= 2 ? timelineRowIds : scriptRowIds;
    if (rowIds.length < 2) {
      return { fromRowId: "", toRowId: "", rowIds: [], edges: [] };
    }
    const indexOf = (value = "") => rowIds.findIndex((id) => id === String(value || "").trim());
    let fromIdx = indexOf(String(podcastVideoState.transitionFromRowId || "").trim());
    let toIdx = indexOf(String(podcastVideoState.transitionToRowId || "").trim());
    if (fromIdx < 0) {
      const fallback = getActiveTransitionEdge(activeSession);
      fromIdx = indexOf(fallback.fromRowId);
      toIdx = indexOf(fallback.toRowId);
    }
    if (fromIdx < 0) fromIdx = 0;
    if (toIdx < 0) toIdx = Math.min(rowIds.length - 1, fromIdx + 1);
    if (toIdx < fromIdx) {
      const tmp = fromIdx;
      fromIdx = toIdx;
      toIdx = tmp;
    }
    if (toIdx === fromIdx) {
      toIdx = Math.min(rowIds.length - 1, fromIdx + 1);
    }
    const selectedRowIds = rowIds.slice(fromIdx, toIdx + 1).filter(Boolean);
    const edges = [];
    for (let i = 0; i < selectedRowIds.length - 1; i += 1) {
      edges.push({
        fromRowId: selectedRowIds[i],
        toRowId: selectedRowIds[i + 1]
      });
    }
    return {
      fromRowId: selectedRowIds[0] || "",
      toRowId: selectedRowIds[selectedRowIds.length - 1] || "",
      rowIds: selectedRowIds,
      edges
    };
  }

  function renderPodcastTransitionPicker(session = null) {
    if (!els.podcastTransitionPickerGrid || !els.podcastTransitionPickerEdgeLabel) return;
    const activeSession = session || getActiveSession();
    const selection = getActiveTransitionSelection(activeSession);
    const firstEdge = selection.edges[0] || null;
    if (!firstEdge) {
      els.podcastTransitionPickerEdgeLabel.textContent = "Selecciona dos escenas consecutivas para aplicar transición.";
      els.podcastTransitionPickerGrid.querySelectorAll("[data-transition-type]").forEach((btn) => btn.classList.remove("is-selected"));
      if (els.podcastTransitionDurationRange) els.podcastTransitionDurationRange.value = "0";
      if (els.podcastTransitionDurationNumber) els.podcastTransitionDurationNumber.value = "0";
      if (els.podcastTransitionDurationLabel) els.podcastTransitionDurationLabel.textContent = "0 ms";
      return;
    }
    const sceneA = resolveSceneNumberByRowId(selection.fromRowId, activeSession);
    const sceneB = resolveSceneNumberByRowId(selection.toRowId, activeSession);
    els.podcastTransitionPickerEdgeLabel.textContent = selection.edges.length > 1
      ? `Aplicar transición entre Escena ${sceneA} y Escena ${sceneB} (${selection.edges.length} uniones)`
      : `Transición entre Escena ${sceneA} y Escena ${sceneB}`;
    const transition = getTransitionForEdge(activeSession, firstEdge.fromRowId, firstEdge.toRowId);
    const activeType = String(transition?.type || "cut").trim().toLowerCase();
    els.podcastTransitionPickerGrid.querySelectorAll("[data-transition-type]").forEach((btn) => {
      const type = String(btn.dataset.transitionType || "").trim().toLowerCase();
      btn.classList.toggle("is-selected", type === activeType);
    });
    if (els.podcastTransitionDurationRange) {
      els.podcastTransitionDurationRange.value = String(Math.round(Number(transition?.durationMs || 0) || 0));
    }
    if (els.podcastTransitionDurationNumber) {
      els.podcastTransitionDurationNumber.value = String(Math.round(Number(transition?.durationMs || 0) || 0));
    }
    if (els.podcastTransitionDurationLabel) {
      els.podcastTransitionDurationLabel.textContent = `${Math.round(Number(transition?.durationMs || 0) || 0)} ms`;
    }
  }

  function setPodcastTransitionPickerOpen(isOpen, fromRowId = "", toRowId = "") {
    const open = Boolean(isOpen);
    podcastVideoState.transitionPickerOpen = open;
    if (open) {
      podcastVideoState.transitionFromRowId = String(fromRowId || "").trim();
      podcastVideoState.transitionToRowId = String(toRowId || "").trim();
    } else {
      podcastVideoState.transitionFromRowId = "";
      podcastVideoState.transitionToRowId = "";
    }
    if (els.podcastTransitionPickerModal) {
      els.podcastTransitionPickerModal.hidden = !open;
    }
    renderPodcastTransitionPicker(getActiveSession());
  }

  function setTransitionForEdge(fromRowId = "", toRowId = "", type = "cut", durationMs = 0) {
    const from = String(fromRowId || "").trim();
    const to = String(toRowId || "").trim();
    const edgeKey = getTransitionEdgeKey(from, to);
    if (!edgeKey) return;
    const nextType = TRANSITION_TYPES.includes(String(type || "").toLowerCase()) ? String(type).toLowerCase() : "cut";
    const nextDuration = nextType === "cut" ? 0 : clampDurationMs(durationMs);
    upsertPodcastVideoConfig((cfg) => {
      const nextTransitions = { ...(cfg.transitionsByEdge || {}) };
      nextTransitions[edgeKey] = {
        type: nextType,
        durationMs: nextDuration
      };
      return {
        ...cfg,
        transitionsByEdge: nextTransitions
      };
    });
    scheduleSessionLocalPersist("inspector");
    const refreshedSession = getActiveSession();
    const refreshedConfig = refreshedSession?.podcastVideoConfig || {};
    renderPodcastVideoTimeline(refreshedSession);
    renderPodcastTransitionTimeline(refreshedSession);
    syncPodcastStudioInspector(refreshedSession);
    persistReorderedTimelinePatchToCloud?.(refreshedSession, {
      transitionsByEdge: refreshedConfig.transitionsByEdge || {}
    });
  }

  function setTransitionForActiveEdge(type = "cut", durationMs = 0) {
    const selection = getActiveTransitionSelection(getActiveSession());
    if (!selection.edges.length) return;
    selection.edges.forEach((edge) => {
      setTransitionForEdge(edge.fromRowId, edge.toRowId, type, durationMs);
    });
  }

  function selectTimelineTransitionRange(rowId = "", options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return false;
    const session = getActiveSession();
    const rowIds = getTransitionTimelineRowOrder(session);
    if (rowIds.length < 2) return false;
    const anchorId = String(
      options.anchorRowId
      || podcastVideoState.timelineLastInteractedRowId
      || podcastVideoState.activeRowId
      || rowIds[0]
      || ""
    ).trim();
    let anchorIdx = rowIds.findIndex((id) => id === anchorId);
    let targetIdx = rowIds.findIndex((id) => id === key);
    if (targetIdx < 0) return false;
    if (anchorIdx < 0) anchorIdx = Math.max(0, targetIdx - 1);
    if (anchorIdx === targetIdx) {
      targetIdx = Math.min(rowIds.length - 1, targetIdx + 1);
      if (targetIdx === anchorIdx) return false;
    }
    const fromIdx = Math.min(anchorIdx, targetIdx);
    const toIdx = Math.max(anchorIdx, targetIdx);
    const fromRowId = String(rowIds[fromIdx] || "").trim();
    const toRowId = String(rowIds[toIdx] || "").trim();
    if (!fromRowId || !toRowId || fromRowId === toRowId) return false;
    selectTimelineSceneRow(key, {
      syncStage: options.syncStage === true
    });
    podcastVideoState.transitionFromRowId = fromRowId;
    podcastVideoState.transitionToRowId = toRowId;
    setPodcastTransitionPickerOpen(true, fromRowId, toRowId);
    return true;
  }

  return {
    getActiveTransitionEdge,
    getActiveTransitionSelection,
    renderPodcastTransitionPicker,
    setPodcastTransitionPickerOpen,
    setTransitionForEdge,
    setTransitionForActiveEdge,
    selectTimelineTransitionRange
  };
}

if (typeof window !== "undefined") {
  const api = {
    TRANSITION_TYPES,
    DEFAULT_PRESETS,
    getTransitionEdgeKey,
    normalizeTransitionsByEdge,
    getTransitionForEdge,
    getTransitionOverlapWindow,
    resolveTransitionPlaybackState,
    getTransitionPreset,
    getAllTransitionTypes
  };
  window.PodcasterSceneTransition = api;
  Object.assign(window, api);
}
