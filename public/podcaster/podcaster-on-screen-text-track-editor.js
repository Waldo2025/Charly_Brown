export function createPodcasterOnScreenTextTrackEditorApi(deps = {}) {
  const {
    els,
    podcastVideoState,
    getActiveSession,
    getSessionRows,
    getPodcastVideoConfig,
    getOnScreenTextTrackSettings,
    applySharedOnScreenTextTrackSettingValue,
    normalizeOnScreenTextTrackSettings,
    normalizeOnScreenTextLayoutByRowId,
    normalizeOnScreenTextLayoutItem,
    buildDefaultOnScreenTextLayoutForRow,
    estimateOnScreenTextLayoutHeightPct,
    getOnScreenTextClipText,
    getOnScreenTextLayoutForRow,
    ensureOnScreenTextLayoutByRowId,
    ensureOnScreenTextClipsByRowId,
    normalizeOnScreenTextClipItem,
    buildSharedOnScreenTextTrackModalMarkup,
    upsertPodcastVideoConfig,
    renderPodcastVideoShell,
    renderPodcastVideoTimeline,
    syncPodcastStudioInspector,
    syncPodcastOnScreenTextOverlay,
    scheduleSessionLocalPersist,
    toFiniteNumber,
    STUDIO_TIMELINE_TRACK_VERSION
  } = deps;

  function setTrackSetting(setting = "fontFamily", value = "", options = {}) {
    const key = String(setting || "").trim();
    if (!key) return;
    upsertPodcastVideoConfig((cfg) => ({
      ...cfg,
      onScreenTextTrack: applySharedOnScreenTextTrackSettingValue(cfg?.onScreenTextTrack || {}, key, value)
    }));
    let session = getActiveSession();
    if (key === "boxWidthPct") {
      syncWidthAcrossLayouts(session);
      session = getActiveSession();
    }
    if (options?.renderShell === true) {
      renderPodcastVideoShell(session);
    }
    syncPodcastOnScreenTextOverlay(session, {
      rowId: String(podcastVideoState.activeRowId || "").trim(),
      currentMs: Number(podcastVideoState.montageCursorMs || 0),
      forceRow: true
    });
    if (options?.renderModal === true && els.onScreenTextTrackModal && els.onScreenTextTrackModal.hidden === false) {
      renderModal(session);
    }
    if (options?.autosave !== false) {
      scheduleSessionLocalPersist("inspector");
    }
  }

  function syncAnchorAcrossLayouts(session = null, options = {}) {
    const activeSession = session || getActiveSession();
    if (!activeSession) return false;
    const cfg = getPodcastVideoConfig(activeSession);
    const currentSettings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
    const nextOverlayXPct = Math.max(0, Math.min(1, Number(options?.overlayXPct ?? currentSettings.overlayXPct ?? 0.5) || 0.5));
    const nextOverlayYPct = Math.max(0, Math.min(1, Number(options?.overlayYPct ?? currentSettings.overlayYPct ?? 0.86) || 0.86));
    const nextSettings = normalizeOnScreenTextTrackSettings({
      ...currentSettings,
      overlayXPct: nextOverlayXPct,
      overlayYPct: nextOverlayYPct
    });
    const rows = getSessionRows(activeSession);
    const currentLayouts = ensureOnScreenTextLayoutByRowId(activeSession, { persist: false });
    const nextLayouts = { ...currentLayouts };
    let changed = false;

    rows.forEach((row, index) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId) return;
      const baseLayout = currentLayouts[rowId] || buildDefaultOnScreenTextLayoutForRow({ ...row, index: index + 1 }, nextSettings);
      if (!baseLayout) return;
      const widthPct = Math.max(
        0.08,
        Math.min(
          0.92,
          Number.isFinite(Number(options?.widthPct))
            ? Number(options.widthPct)
            : Number(baseLayout.widthPct || nextSettings.boxWidthPct || 0.58)
        )
      );
      const heightPct = options?.recomputeHeight === true
        ? Math.max(0.05, Math.min(0.6, estimateOnScreenTextLayoutHeightPct(getOnScreenTextClipText(row), nextSettings, widthPct)))
        : Math.max(0.05, Math.min(0.6, Number(baseLayout.heightPct || 0.14)));
      const xPct = Math.max(0, Math.min(1 - widthPct, nextOverlayXPct - (widthPct / 2)));
      const yPct = Math.max(0, Math.min(1 - heightPct, nextOverlayYPct - heightPct));
      const normalized = normalizeOnScreenTextLayoutItem({
        ...baseLayout,
        widthPct,
        heightPct,
        xPct,
        yPct
      }, rowId);
      if (!normalized) return;
      if (JSON.stringify(normalized) !== JSON.stringify(baseLayout)) {
        nextLayouts[rowId] = normalized;
        changed = true;
      }
    });

    const settingsChanged = Math.abs(Number(currentSettings.overlayXPct || 0.5) - nextOverlayXPct) > 0.0005
      || Math.abs(Number(currentSettings.overlayYPct || 0.86) - nextOverlayYPct) > 0.0005;
    if (!changed && !settingsChanged) return false;
    upsertPodcastVideoConfig((baseCfg) => ({
      ...baseCfg,
      onScreenTextTrack: normalizeOnScreenTextTrackSettings({
        ...(baseCfg?.onScreenTextTrack || {}),
        overlayXPct: nextOverlayXPct,
        overlayYPct: nextOverlayYPct
      }),
      timelineOnScreenTextLayoutByRowId: nextLayouts
    }));
    return true;
  }

  function syncWidthAcrossLayouts(session = null) {
    const activeSession = session || getActiveSession();
    if (!activeSession) return false;
    const cfg = getPodcastVideoConfig(activeSession);
    const settings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
    const nextWidthPct = Math.max(0.22, Math.min(0.92, Number(settings.boxWidthPct || 0.58)));
    return syncAnchorAcrossLayouts(activeSession, {
      overlayXPct: Number(settings.overlayXPct || 0.5),
      overlayYPct: Number(settings.overlayYPct || 0.86),
      widthPct: nextWidthPct,
      recomputeHeight: true
    });
  }

  function syncToggleBtn(session = null) {
    const btn = els.toggleOnScreenTextTrackBtn;
    if (!btn) return;
    const settings = getOnScreenTextTrackSettings(session || getActiveSession());
    const pressed = settings.showTrack !== false;
    btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    btn.classList.toggle("is-active", pressed);
    btn.title = pressed ? "Ocultar track de texto" : "Mostrar track de texto";
    btn.setAttribute("aria-label", btn.title);
  }

  function toggleTrackVisibility() {
    const session = getActiveSession();
    if (!session) return;
    const current = getOnScreenTextTrackSettings(session);
    const nextVisible = current.showTrack === false;
    upsertPodcastVideoConfig((cfg) => {
      const normalized = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
      return {
        ...cfg,
        onScreenTextTrack: {
          ...normalized,
          showTrack: nextVisible
        }
      };
    });
    const refreshed = getActiveSession();
    syncToggleBtn(refreshed);
    renderPodcastVideoTimeline(refreshed, { force: true, reason: "onscreen-text-track-toggle" });
    syncPodcastStudioInspector(refreshed);
    syncPodcastOnScreenTextOverlay(refreshed, {
      rowId: String(podcastVideoState.activeRowId || "").trim(),
      currentMs: Number(podcastVideoState.montageCursorMs || 0),
      forceRow: podcastVideoState.montageActive !== true
    });
    if (nextVisible && els.podcastVideoTimeline) {
      try { els.podcastVideoTimeline.scrollTop = 0; } catch (_) { }
    }
    scheduleSessionLocalPersist("timeline-onscreen-text");
  }

  function setAllClipsHidden(hidden = false, options = {}) {
    const session = getActiveSession();
    if (!session) return false;
    const rows = getSessionRows(session);
    if (!rows.length) return false;
    const nextHidden = Boolean(hidden);
    let changed = false;
    upsertPodcastVideoConfig((cfg) => {
      const clips = ensureOnScreenTextClipsByRowId(session, { persist: false });
      const nextClips = { ...(cfg.timelineOnScreenTextClipsByRowId || {}) };
      rows.forEach((row) => {
        const rowId = String(row?.id || "").trim();
        if (!rowId) return;
        const current = clips[rowId];
        if (!current) return;
        const normalized = normalizeOnScreenTextClipItem({
          ...current,
          hidden: nextHidden,
          autoHidden: false
        }, rowId);
        if (!normalized) return;
        if (JSON.stringify(normalized) !== JSON.stringify(current)) {
          nextClips[rowId] = normalized;
          changed = true;
        }
      });
      if (!changed) return cfg;
      return {
        ...cfg,
        timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
        timelineOnScreenTextClipsByRowId: nextClips
      };
    });
    if (!changed) return false;
    const refreshed = getActiveSession();
    renderPodcastVideoTimeline(refreshed, { force: true, reason: "onscreen-text-bulk-visibility" });
    syncPodcastStudioInspector(refreshed);
    syncPodcastOnScreenTextOverlay(refreshed, {
      rowId: String(podcastVideoState.activeRowId || "").trim(),
      currentMs: Number(podcastVideoState.montageCursorMs || 0),
      forceRow: podcastVideoState.montageActive !== true
    });
    if (options.autosave !== false) {
      scheduleSessionLocalPersist("timeline-onscreen-text");
    }
    return true;
  }

  function renderModal(session = null) {
    if (!els.onScreenTextTrackModalBody) return;
    const activeSession = session || getActiveSession();
    const settings = getOnScreenTextTrackSettings(activeSession);
    els.onScreenTextTrackModalBody.innerHTML = buildSharedOnScreenTextTrackModalMarkup(settings);
  }

  function setModalOpen(open = false) {
    if (!els.onScreenTextTrackModal) return;
    els.onScreenTextTrackModal.hidden = !open;
    if (open) {
      if (els.onScreenTextTrackPanel) {
        els.onScreenTextTrackPanel.style.setProperty("--pod-onscreen-modal-dx", `${Math.round(Number(podcastVideoState.onScreenTextTrackModalOffsetX || 0))}px`);
        els.onScreenTextTrackPanel.style.setProperty("--pod-onscreen-modal-dy", `${Math.round(Number(podcastVideoState.onScreenTextTrackModalOffsetY || 0))}px`);
      }
      renderModal(getActiveSession());
    } else {
      podcastVideoState.onScreenTextTrackModalDrag = null;
      document.body.classList.remove("is-dragging-onscreen-text-track-modal");
    }
  }

  function beginModalDrag(event = null) {
    if (!event || !els.onScreenTextTrackPanel || !els.onScreenTextTrackModal || els.onScreenTextTrackModal.hidden) return;
    const handle = event.target?.closest?.("#onScreenTextTrackPanel .music-config-head");
    if (!handle || event.target?.closest?.("button, input, select, textarea, label, a")) return;
    const panelRect = els.onScreenTextTrackPanel.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    if (!panelRect || panelRect.width <= 0 || panelRect.height <= 0) return;
    const minVisibleHeaderWidth = Math.max(72, Math.min(Number(handleRect?.width || 0), 220));
    const minVisibleHeaderHeight = Math.max(44, Math.min(Number(handleRect?.height || 0), 72));
    podcastVideoState.onScreenTextTrackModalDrag = {
      pointerId: Number(event.pointerId || 0),
      startClientX: Number(event.clientX || 0),
      startClientY: Number(event.clientY || 0),
      startOffsetX: Number(podcastVideoState.onScreenTextTrackModalOffsetX || 0),
      startOffsetY: Number(podcastVideoState.onScreenTextTrackModalOffsetY || 0),
      panelLeft: Number(panelRect.left || 0),
      panelTop: Number(panelRect.top || 0),
      panelRight: Number(panelRect.right || 0),
      panelBottom: Number(panelRect.bottom || 0),
      minVisibleHeaderWidth,
      minVisibleHeaderHeight
    };
    document.body.classList.add("is-dragging-onscreen-text-track-modal");
    try { handle.setPointerCapture?.(event.pointerId); } catch (_) { }
    event.preventDefault();
    event.stopPropagation();
  }

  function applyModalDrag(event = null) {
    const drag = podcastVideoState.onScreenTextTrackModalDrag;
    if (!drag || !event || !els.onScreenTextTrackPanel) return;
    if (Number(event.pointerId || 0) !== Number(drag.pointerId || 0)) return;
    const deltaX = Number(event.clientX || 0) - Number(drag.startClientX || 0);
    const deltaY = Number(event.clientY || 0) - Number(drag.startClientY || 0);
    const unclampedX = Number(drag.startOffsetX || 0) + deltaX;
    const unclampedY = Number(drag.startOffsetY || 0) + deltaY;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const minVisibleHeaderWidth = Number(drag.minVisibleHeaderWidth || 120);
    const minVisibleHeaderHeight = Number(drag.minVisibleHeaderHeight || 52);
    const minOffsetX = minVisibleHeaderWidth - Number(drag.panelRight || 0);
    const maxOffsetX = viewportWidth - minVisibleHeaderWidth - Number(drag.panelLeft || 0);
    const minOffsetY = minVisibleHeaderHeight - Number(drag.panelBottom || 0);
    const maxOffsetY = viewportHeight - minVisibleHeaderHeight - Number(drag.panelTop || 0);
    const nextOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, unclampedX));
    const nextOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, unclampedY));
    podcastVideoState.onScreenTextTrackModalOffsetX = Math.round(nextOffsetX);
    podcastVideoState.onScreenTextTrackModalOffsetY = Math.round(nextOffsetY);
    els.onScreenTextTrackPanel.style.setProperty("--pod-onscreen-modal-dx", `${podcastVideoState.onScreenTextTrackModalOffsetX}px`);
    els.onScreenTextTrackPanel.style.setProperty("--pod-onscreen-modal-dy", `${podcastVideoState.onScreenTextTrackModalOffsetY}px`);
    event.preventDefault();
  }

  function endModalDrag(event = null) {
    const drag = podcastVideoState.onScreenTextTrackModalDrag;
    if (!drag) return;
    if (event && Number(event.pointerId || 0) !== Number(drag.pointerId || 0)) return;
    podcastVideoState.onScreenTextTrackModalDrag = null;
    document.body.classList.remove("is-dragging-onscreen-text-track-modal");
  }

  function beginOverlayDrag(event = null) {
    if (!event) return;
    const bubble = event.target?.closest?.(".podcast-on-screen-text-content");
    if (!bubble || !els.podcastOnScreenTextOverlay) return;
    const handle = event.target?.closest?.(".podcast-onscreen-resize-handle");
    const preview = els.podcastVideoStage?.querySelector?.(".podcast-video-preview");
    if (!preview) return;
    const session = getActiveSession();
    if (!session) return;
    const rowId = String(bubble.dataset.rowId || podcastVideoState.activeRowId || "").trim();
    if (!rowId) return;
    podcastVideoState.onScreenTextOverlaySelectedRowId = rowId;
    const rect = preview.getBoundingClientRect();
    if (!rect || rect.width <= 1 || rect.height <= 1) return;
    const pointerId = Number(event.pointerId || 0);
    const layout = getOnScreenTextLayoutForRow(session, rowId);
    if (!layout) return;
    const interaction = {
      pointerId,
      rowId,
      handle: String(handle?.dataset?.handle || "").trim(),
      startClientX: Number(event.clientX || 0),
      startClientY: Number(event.clientY || 0),
      startXPct: Math.max(0, Math.min(1, Number(layout.xPct || 0))),
      startYPct: Math.max(0, Math.min(1, Number(layout.yPct || 0))),
      startWidthPct: Math.max(0.08, Math.min(0.9, Number(layout.widthPct || 0.38))),
      startHeightPct: Math.max(0.05, Math.min(0.6, Number(layout.heightPct || 0.14))),
      fitToContent: false,
      rectWidth: Number(rect.width || 1),
      rectHeight: Number(rect.height || 1)
    };
    if (interaction.handle) {
      podcastVideoState.onScreenTextOverlayResize = interaction;
    } else {
      podcastVideoState.onScreenTextOverlayDrag = interaction;
    }
    try { bubble.setPointerCapture(pointerId); } catch (_) { }
    document.body.classList.add("is-dragging-onscreen-text");
    event.preventDefault();
    event.stopPropagation();
  }

  function applyOverlayDragMove(event = null) {
    const drag = podcastVideoState.onScreenTextOverlayDrag;
    if (!drag || !event) return;
    if (Number(event.pointerId || 0) !== Number(drag.pointerId || 0)) return;
    const dx = Number(event.clientX || 0) - Number(drag.startClientX || 0);
    const dy = Number(event.clientY || 0) - Number(drag.startClientY || 0);
    const nextX = Math.max(0, Math.min(1 - Number(drag.startWidthPct || 0.38), Number(drag.startXPct || 0) + (dx / Math.max(1, Number(drag.rectWidth || 1)))));
    const nextY = Math.max(0, Math.min(1 - Number(drag.startHeightPct || 0.14), Number(drag.startYPct || 0) + (dy / Math.max(1, Number(drag.rectHeight || 1)))));
    const bubble = els.podcastOnScreenTextOverlay?.querySelector?.(`.podcast-on-screen-text-content[data-row-id="${CSS.escape(String(drag.rowId || "").trim())}"]`);
    if (bubble) {
      bubble.style.setProperty("--pod-onscreen-text-x", `${(nextX * 100).toFixed(3)}%`);
      bubble.style.setProperty("--pod-onscreen-text-y", `${(nextY * 100).toFixed(3)}%`);
    }
    event.preventDefault();
  }

  function endOverlayDrag(event = null) {
    const drag = podcastVideoState.onScreenTextOverlayDrag;
    if (!drag) return;
    if (event && Number(event.pointerId || 0) !== Number(drag.pointerId || 0)) return;
    podcastVideoState.onScreenTextOverlayDrag = null;
    document.body.classList.remove("is-dragging-onscreen-text");
    const session = getActiveSession();
    const bubble = els.podcastOnScreenTextOverlay?.querySelector?.(`.podcast-on-screen-text-content[data-row-id="${CSS.escape(String(drag.rowId || "").trim())}"]`);
    if (!bubble) return;
    const prev = getOnScreenTextLayoutForRow(session, drag.rowId);
    if (!prev) return;
    const safeWidthPct = Math.max(0.08, Math.min(0.92, Number(prev.widthPct || 0.58)));
    const safeHeightPct = Math.max(0.05, Math.min(0.6, Number(prev.heightPct || 0.14)));
    const nextX = Math.max(
      0,
      Math.min(1 - safeWidthPct, toFiniteNumber(String(bubble.style.getPropertyValue("--pod-onscreen-text-x") || "").replace("%", ""), 0) / 100)
    );
    const nextY = Math.max(
      0,
      Math.min(1 - safeHeightPct, toFiniteNumber(String(bubble.style.getPropertyValue("--pod-onscreen-text-y") || "").replace("%", ""), 0) / 100)
    );
    syncAnchorAcrossLayouts(session, {
      overlayXPct: nextX + (safeWidthPct / 2),
      overlayYPct: nextY + safeHeightPct
    });
    const refreshedSession = getActiveSession();
    if (els.onScreenTextTrackModal && els.onScreenTextTrackModal.hidden === false) {
      renderModal(refreshedSession);
    }
    syncPodcastOnScreenTextOverlay(refreshedSession, {
      rowId: String(drag.rowId || podcastVideoState.activeRowId || "").trim(),
      currentMs: Number(podcastVideoState.montageCursorMs || 0),
      forceRow: true
    });
    scheduleSessionLocalPersist("timeline-onscreen-text");
  }

  function applyOverlayResizeMove(event = null) {
    const drag = podcastVideoState.onScreenTextOverlayResize;
    if (!drag || !event) return;
    if (Number(event.pointerId || 0) !== Number(drag.pointerId || 0)) return;
    const dxPct = (Number(event.clientX || 0) - Number(drag.startClientX || 0)) / Math.max(1, Number(drag.rectWidth || 1));
    const dyPct = (Number(event.clientY || 0) - Number(drag.startClientY || 0)) / Math.max(1, Number(drag.rectHeight || 1));
    let nextX = Number(drag.startXPct || 0);
    let nextY = Number(drag.startYPct || 0);
    let nextWidth = Number(drag.startWidthPct || 0.38);
    let nextHeight = Number(drag.startHeightPct || 0.14);
    const handle = String(drag.handle || "").trim().toLowerCase();
    if (handle.includes("e")) nextWidth += dxPct;
    if (!drag.fitToContent && handle.includes("s")) nextHeight += dyPct;
    if (handle.includes("w")) {
      nextX += dxPct;
      nextWidth -= dxPct;
    }
    if (!drag.fitToContent && handle.includes("n")) {
      nextY += dyPct;
      nextHeight -= dyPct;
    }
    nextWidth = Math.max(0.08, Math.min(0.9, nextWidth));
    nextHeight = Math.max(0.05, Math.min(0.6, nextHeight));
    nextX = Math.max(0, Math.min(1 - nextWidth, nextX));
    nextY = Math.max(0, Math.min(1 - nextHeight, nextY));
    const bubble = els.podcastOnScreenTextOverlay?.querySelector?.(`.podcast-on-screen-text-content[data-row-id="${CSS.escape(String(drag.rowId || "").trim())}"]`);
    if (bubble) {
      bubble.style.setProperty("--pod-onscreen-text-x", `${(nextX * 100).toFixed(3)}%`);
      bubble.style.setProperty("--pod-onscreen-text-y", `${(nextY * 100).toFixed(3)}%`);
      if (drag.fitToContent) {
        bubble.style.setProperty("--pod-onscreen-text-bubble-width", `${(nextWidth * Number(drag.rectWidth || 1)).toFixed(1)}px`);
        bubble.style.setProperty("--pod-onscreen-text-bubble-height", "auto");
      } else {
        bubble.style.setProperty("--pod-onscreen-text-bubble-width", `${(nextWidth * Number(drag.rectWidth || 1)).toFixed(1)}px`);
        bubble.style.setProperty("--pod-onscreen-text-bubble-height", `${(nextHeight * Number(drag.rectHeight || 1)).toFixed(1)}px`);
      }
    }
    event.preventDefault();
  }

  function endOverlayResize(event = null) {
    const drag = podcastVideoState.onScreenTextOverlayResize;
    if (!drag) return;
    if (event && Number(event.pointerId || 0) !== Number(drag.pointerId || 0)) return;
    podcastVideoState.onScreenTextOverlayResize = null;
    document.body.classList.remove("is-dragging-onscreen-text");
    const bubble = els.podcastOnScreenTextOverlay?.querySelector?.(`.podcast-on-screen-text-content[data-row-id="${CSS.escape(String(drag.rowId || "").trim())}"]`);
    if (!bubble) return;
    const preview = els.podcastVideoStage?.querySelector?.(".podcast-video-preview");
    const rect = preview?.getBoundingClientRect?.();
    const widthPx = Math.max(1, Number(rect?.width || drag.rectWidth || 1));
    const heightPx = Math.max(1, Number(rect?.height || drag.rectHeight || 1));
    const nextX = Math.max(0, Math.min(1, toFiniteNumber(String(bubble.style.getPropertyValue("--pod-onscreen-text-x") || "").replace("%", ""), 0) / 100));
    const nextY = Math.max(0, Math.min(1, toFiniteNumber(String(bubble.style.getPropertyValue("--pod-onscreen-text-y") || "").replace("%", ""), 0) / 100));
    const measuredRect = bubble.getBoundingClientRect();
    const nextWidth = Math.max(
      0.08,
      Math.min(
        0.9,
        toFiniteNumber(String(bubble.style.getPropertyValue("--pod-onscreen-text-bubble-width") || "").replace("px", ""), Number(measuredRect?.width || 0)) / widthPx
      )
    );
    const nextHeight = Math.max(0.05, Math.min(0.6, Math.max(1, Number(measuredRect?.height || 0)) / heightPx));
    upsertPodcastVideoConfig((cfg, session) => {
      const current = normalizeOnScreenTextLayoutByRowId(cfg?.timelineOnScreenTextLayoutByRowId || {});
      const prev = current[drag.rowId] || getOnScreenTextLayoutForRow(session, drag.rowId);
      if (!prev) return cfg;
      return {
        ...cfg,
        timelineOnScreenTextLayoutByRowId: {
          ...(cfg?.timelineOnScreenTextLayoutByRowId || {}),
          [drag.rowId]: normalizeOnScreenTextLayoutItem({
            ...prev,
            xPct: nextX,
            yPct: nextY,
            widthPct: nextWidth,
            heightPct: nextHeight
          }, drag.rowId)
        }
      };
    });
    syncPodcastOnScreenTextOverlay(getActiveSession(), {
      rowId: String(drag.rowId || podcastVideoState.activeRowId || "").trim(),
      currentMs: Number(podcastVideoState.montageCursorMs || 0),
      forceRow: true
    });
    scheduleSessionLocalPersist("timeline-onscreen-text");
  }

  return {
    setTrackSetting,
    syncAnchorAcrossLayouts,
    syncWidthAcrossLayouts,
    syncToggleBtn,
    toggleTrackVisibility,
    setAllClipsHidden,
    renderModal,
    setModalOpen,
    beginModalDrag,
    applyModalDrag,
    endModalDrag,
    beginOverlayDrag,
    applyOverlayDragMove,
    endOverlayDrag,
    applyOverlayResizeMove,
    endOverlayResize
  };
}
