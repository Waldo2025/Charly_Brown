export function createPodcasterTimelineUiApi(deps = {}) {
  const {
    els,
    podcastVideoState,
    playbackController,
    podcastRenderState,
    panelMusicState,
    podcastAudioTrackUiState,
    updateTimelineClipSourceDurationIfGreater,
    getActiveSession,
    getSessionRows,
    formatTrackHeadPlayheadTime,
    getTimelineViewMode,
    getStudioAudioTrackMinLoopPx,
    getPodcastVideoConfig,
    getTransitionForEdge,
    normalizeGeminiDialogueTrack,
    timelineMsToPx,
    ensureTimelineClipsByRowId,
    ensureOnScreenTextClipsByRowId,
    getStudioTimelineMinClipPx,
    getTimelineClipEffectiveDurationMs,
    getOnScreenTextClipEffectiveDurationMs,
    syncTimelineModeButtons,
    getDialogueVideoMap,
    getStudioTimelinePixelsPerSec,
    getTimelineTotalDurationMs,
    getStudioTimelineZoom,
    ensureTimelineTracks,
    isEducationalVideoMode,
    isEducationalVisibleSceneTrack,
    buildPodcastTimelineStructureKey,
    logPodcastRenderDebug,
    syncTimelineEphemeralState,
    escapeHtml,
    secondsToClock,
    getOnScreenTextTrackSettings,
    getOnScreenTextStylePresetClass,
    getOnScreenTextFontFamilyCss,
    resolvePrimaryDialogueVideoSegment,
    resolveStorageVideoUrl,
    resolvePortraitForSpeaker,
    resolvePodcastPortraitUrl,
    isLikelyImageMediaRecord,
    isTimelineSceneVideoGenerating,
    getTimelineSceneVideoGenerationStatus,
    hasStoredMediaSource,
    resolveDialogueAudioForRow,
    resolveDialogueAudioPlaybackRate,
    resolveRowAudioDurationMs,
    resolveSpeakerDisplayName,
    trimWords,
    isPodcastMode,
    isVideoPodcastMode,
    getPanelMusicTrackAvailability,
    normalizePanelMusicTrack,
    groupUploadedPanelMusicSegmentsByTrack,
    getPanelMusicUploadedTracks,
    getPanelMusicTrackDurationSec,
    getPanelMusicLoopCount,
    getPanelMusicLoopSegments,
    normalizePanelMusicMutedLoopIndexes,
    buildTimelinePanelAudioSelectionKey,
    isPublicLibrarySceneRow,
    resolveStorageAudioUrl,
    hasExplicitDialogueAudioForRow,
    syncCustomTooltips,
    buildTimelineRuntimeEntries,
    syncStudioTimelinePreview,
    toFiniteNumber,
    getTimelineClipEndMs,
    STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX,
    STUDIO_TIMELINE_MIN_CLIP_MS,
    PODCAST_TIMELINE_RULER_OFFSET_PX,
    PODCAST_RENDER_DEBUG
  } = deps;

  let podcastTimelineScrollSyncCleanup = null;
  let podcastTimelineScrollRafId = 0;
  let podcastTimelineManualScrollUntil = 0;
  let podcastTimelinePreviewObserver = null;
  let podcastTimelinePreviewsSuspended = false;
  let podcastTimelinePreviewSyncRafId = 0;
  let podcastTimelinePreviewSyncPayload = null;

  function attachPodcastTimelineScrollSync() {
    podcastTimelineScrollSyncCleanup?.();
    podcastTimelineScrollSyncCleanup = null;
    if (podcastTimelineScrollRafId) {
      cancelAnimationFrame(podcastTimelineScrollRafId);
      podcastTimelineScrollRafId = 0;
    }
    if (!els.podcastVideoTimeline || !els.podcastTimelineRuler) return;
    const markManualScrollIntent = () => {
      podcastTimelineManualScrollUntil = Date.now() + 1400;
    };
    const syncScroll = () => {
      if (podcastTimelineScrollRafId) return;
      podcastTimelineScrollRafId = requestAnimationFrame(() => {
        podcastTimelineScrollRafId = 0;
        if (!els.podcastVideoTimeline || !els.podcastTimelineRuler) return;
        els.podcastTimelineRuler.scrollLeft = els.podcastVideoTimeline.scrollLeft;
      });
    };
    els.podcastVideoTimeline.addEventListener("scroll", syncScroll, { passive: true });
    els.podcastVideoTimeline.addEventListener("wheel", markManualScrollIntent, { passive: true });
    els.podcastVideoTimeline.addEventListener("pointerdown", markManualScrollIntent, { passive: true });
    els.podcastVideoTimeline.addEventListener("touchstart", markManualScrollIntent, { passive: true });
    syncScroll();
    podcastTimelineScrollSyncCleanup = () => {
      els.podcastVideoTimeline?.removeEventListener("scroll", syncScroll);
      els.podcastVideoTimeline?.removeEventListener("wheel", markManualScrollIntent);
      els.podcastVideoTimeline?.removeEventListener("pointerdown", markManualScrollIntent);
      els.podcastVideoTimeline?.removeEventListener("touchstart", markManualScrollIntent);
      if (podcastTimelineScrollRafId) {
        cancelAnimationFrame(podcastTimelineScrollRafId);
        podcastTimelineScrollRafId = 0;
      }
    };
  }

  function disconnectPodcastTimelinePreviewObserver() {
    podcastTimelinePreviewObserver?.disconnect?.();
    podcastTimelinePreviewObserver = null;
  }

  function setTimelinePreviewsSuspended(isSuspended = false) {
    const next = Boolean(isSuspended);
    if (podcastTimelinePreviewsSuspended === next) return;
    podcastTimelinePreviewsSuspended = next;
    if (!els.podcastVideoTimeline) return;
    if (next) {
      disconnectPodcastTimelinePreviewObserver();
      const previewVideos = Array.from(
        els.podcastVideoTimeline.querySelectorAll("video[data-preview-src]")
      );
      previewVideos.forEach((videoEl) => {
        try { videoEl.pause(); } catch (_) { }
        try { videoEl.preload = "none"; } catch (_) { }
        try {
          const currentSrc = String(videoEl.getAttribute("src") || "").trim();
          if (currentSrc) {
            videoEl.dataset.previewOriginalSrc = currentSrc;
            videoEl.removeAttribute("src");
          }
        } catch (_) { }
        try { videoEl.load(); } catch (_) { }
      });
      return;
    }
    try {
      const previewVideos = Array.from(
        els.podcastVideoTimeline.querySelectorAll("video[data-preview-src]")
      );
      previewVideos.forEach((videoEl) => {
        try { delete videoEl.dataset.previewOriginalSrc; } catch (_) { }
        try { delete videoEl.dataset.previewSuspended; } catch (_) { }
      });
    } catch (_) { }
    attachPodcastTimelinePreviewLoading();
  }

  function loadTimelinePreviewVideo(videoEl, options = {}) {
    if (!videoEl) return;
    if (podcastTimelinePreviewsSuspended) return;
    const nextSrc = String(videoEl.dataset.previewSrc || "").trim();
    if (!nextSrc) return;
    const preferAuto = options.preferAuto === true;
    const currentSrc = String(videoEl.getAttribute("src") || "").trim();
    const currentPreload = String(videoEl.preload || "").trim().toLowerCase();

    if (currentSrc === nextSrc || (videoEl.dataset.blobSrc && videoEl.dataset.blobSrc === currentSrc)) {
      if (preferAuto && currentPreload === "auto") return;
      if (!preferAuto && (currentPreload === "metadata" || currentPreload === "auto")) return;
    }

    if (!String(videoEl.getAttribute("poster") || "").trim()) {
      videoEl.setAttribute("poster", "SnoopyPodcastCreator.png");
    }
    videoEl.preload = preferAuto ? "auto" : "metadata";

    if (typeof playbackController?.getBlobUrl === "function") {
      playbackController.getBlobUrl(nextSrc).then((blobUrl) => {
        if (blobUrl && videoEl.dataset.previewSrc === nextSrc) {
          if (videoEl.src !== blobUrl) {
            videoEl.src = blobUrl;
            videoEl.dataset.blobSrc = blobUrl;
            const rowId = videoEl.closest("[data-row-id]")?.dataset.rowId;
            if (rowId) {
              videoEl.addEventListener("loadedmetadata", () => {
                const durMs = Math.round(videoEl.duration * 1000);
                if (Number.isFinite(durMs) && durMs > 100) {
                  updateTimelineClipSourceDurationIfGreater(rowId, durMs);
                }
              }, { once: true });
            }
            try { videoEl.load(); } catch (_) { }
          }
        }
      }).catch(() => {
        if (videoEl.src !== nextSrc) {
          videoEl.src = nextSrc;
          try { videoEl.load(); } catch (_) { }
        }
      });
    } else if (currentSrc !== nextSrc) {
      videoEl.src = nextSrc;
      try { videoEl.load(); } catch (_) { }
    }
  }

  function attachPodcastTimelinePreviewLoading() {
    disconnectPodcastTimelinePreviewObserver();
    if (!els.podcastVideoTimeline) return;
    if (podcastTimelinePreviewsSuspended) return;
    const previewVideos = Array.from(
      els.podcastVideoTimeline.querySelectorAll(".podcast-video-scene-preview video[data-preview-src], .podcast-video-clip-preview video[data-preview-src]")
    );
    if (!previewVideos.length) return;
    const promotePreview = (event) => {
      const videoEl = event?.currentTarget?.tagName === "VIDEO"
        ? event.currentTarget
        : event?.target?.closest?.("video[data-preview-src]");
      loadTimelinePreviewVideo(videoEl, { preferAuto: true });
    };
    previewVideos.forEach((videoEl) => {
      videoEl.addEventListener("mouseenter", promotePreview, { passive: true });
      videoEl.addEventListener("focus", promotePreview, { passive: true });
    });
    const eagerCount = 4;
    previewVideos.slice(0, eagerCount).forEach((videoEl) => {
      loadTimelinePreviewVideo(videoEl, { preferAuto: false });
    });
    if (typeof IntersectionObserver !== "function") {
      previewVideos.forEach((videoEl, index) => {
        if (index < Math.max(eagerCount, 12)) {
          loadTimelinePreviewVideo(videoEl, { preferAuto: index < eagerCount });
        }
      });
      return;
    }
    podcastTimelinePreviewObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const videoEl = entry.target;
        loadTimelinePreviewVideo(videoEl, { preferAuto: false });
        observer.unobserve(videoEl);
      });
    }, {
      root: els.podcastVideoTimeline,
      rootMargin: "800px",
      threshold: 0.01
    });
    previewVideos.forEach((videoEl) => {
      podcastTimelinePreviewObserver.observe(videoEl);
    });
  }

  function syncPodcastTimelineLaneOffsetFromDom(session = null) {
    if (!els.podcastVideoTimeline) return 0;
    const activeSession = session || getActiveSession();
    const mode = getTimelineViewMode(activeSession);
    const canvas = els.podcastVideoTimeline.querySelector(".podcast-video-timeline-canvas");
    if (!canvas) return 0;
    if (mode !== "tracks") {
      canvas.dataset.playheadOffset = "0";
      try { canvas.style.setProperty("--pod-timeline-lane-offset", "0px"); } catch (_) { }
      return 0;
    }
    const allLanes = Array.from(els.podcastVideoTimeline.querySelectorAll(".podcast-video-track-lane[data-track-id][data-track-index]"));
    const lane = allLanes.find((node) => {
      const idx = Number(node?.dataset?.trackIndex);
      return Number.isFinite(idx) && idx >= 0;
    }) || allLanes[0] || null;
    if (!lane) return Math.max(0, Number(canvas?.dataset?.playheadOffset || 0));
    const canvasRect = canvas.getBoundingClientRect();
    const laneRect = lane.getBoundingClientRect();
    const offsetPx = Math.max(0, Math.round(laneRect.left - canvasRect.left));
    if (offsetPx > 0) {
      canvas.dataset.playheadOffset = String(offsetPx);
      try { canvas.style.setProperty("--pod-timeline-lane-offset", `${offsetPx}px`); } catch (_) { }
    }
    return offsetPx;
  }

  function resolveTimelineRulerStepSec(pixelsPerSec = 0) {
    const pxPerSec = Math.max(0, Number(pixelsPerSec || 0) || 0);
    if (pxPerSec <= 4) return 60;
    if (pxPerSec <= 7) return 30;
    if (pxPerSec <= 11) return 15;
    if (pxPerSec <= 18) return 10;
    if (pxPerSec <= 32) return 5;
    if (pxPerSec <= 60) return 2;
    return 1;
  }

  function getPodcastTimelineClipMenuPortal() {
    if (els.podcastVideoTimeline) {
      const layer = els.podcastVideoTimeline.querySelector("#podcastTimelineMenuLayer");
      if (layer) return layer;
    }
    let portal = document.getElementById("podcastTimelineClipMenuPortal");
    if (portal) return portal;
    portal = document.createElement("div");
    portal.id = "podcastTimelineClipMenuPortal";
    portal.className = "podcast-video-clip-actions-portal";
    portal.setAttribute("aria-hidden", "false");
    document.body.appendChild(portal);
    return portal;
  }

  function closePodcastTimelineClipMenu() {
    const portal = document.getElementById("podcastTimelineClipMenuPortal");
    const layer = els.podcastVideoTimeline?.querySelector?.("#podcastTimelineMenuLayer") || null;
    [layer, portal].filter(Boolean).forEach((target) => {
      target.innerHTML = "";
      delete target.dataset.openRowId;
      target.classList.remove("is-open");
    });
    if (els.podcastVideoTimeline) {
      els.podcastVideoTimeline
        .querySelectorAll("[data-action='timeline-toggle-clip-menu'][aria-expanded='true']")
        .forEach((btn) => btn.setAttribute("aria-expanded", "false"));
    }
  }

  function syncTimelineGapSelectionUi() {
    if (!els.podcastVideoTimeline) return;
    Array.from(els.podcastVideoTimeline.querySelectorAll(".podcast-timeline-gap-selection")).forEach((el) => el.remove());
    const selection = podcastVideoState.timelineGapSelection;
    if (!selection) return;
    if (getTimelineViewMode(getActiveSession()) !== "tracks") return;
    const lane = els.podcastVideoTimeline.querySelector(`.podcast-video-track-lane[data-track-id="${CSS.escape(String(selection.trackId || ""))}"]`);
    if (!lane) return;
    const leftPx = Math.max(0, Math.min(Number(selection.startPx || 0), Number(selection.endPx || 0)));
    const rightPx = Math.max(Number(selection.startPx || 0), Number(selection.endPx || 0));
    const widthPx = Math.max(0, rightPx - leftPx);
    if (widthPx < 1) return;
    const overlay = document.createElement("div");
    overlay.className = "podcast-timeline-gap-selection";
    overlay.style.left = `${leftPx.toFixed(3)}px`;
    overlay.style.width = `${widthPx.toFixed(3)}px`;
    overlay.innerHTML = `
      <div class="podcast-timeline-gap-selection-fill" aria-hidden="true"></div>
      <button class="podcast-timeline-gap-selection-btn" type="button" data-action="timeline-delete-selected-gap">
        Eliminar hueco
      </button>
    `;
    lane.appendChild(overlay);
  }

  function renderPodcastVideoTimeline(session = null, options = {}) {
    const activeSession = session || getActiveSession();
    const rows = getSessionRows(activeSession);
    const runtimeEntries = buildTimelineRuntimeEntries(activeSession);
    const runtimeEntryByRowId = new Map(runtimeEntries.map((entry) => [String(entry?.rowId || "").trim(), entry]));
    const rowById = new Map(rows.map((row) => [String(row?.id || "").trim(), row]));
    const mode = getTimelineViewMode(activeSession);
    const minAudioLoopPx = getStudioAudioTrackMinLoopPx(activeSession);
    const prevScrollLeft = els.podcastVideoTimeline ? els.podcastVideoTimeline.scrollLeft : 0;
    const prevScrollTop = els.podcastVideoTimeline ? els.podcastVideoTimeline.scrollTop : 0;
    const resolveGeminiSegmentVisibleDurationMs = (segment = null) => {
      const trimInMs = Math.max(0, Number(segment?.trimInMs || 0) || 0);
      const trimOutMs = Math.max(0, Number(segment?.trimOutMs || 0) || 0);
      const trimmedVisibleMs = trimOutMs > trimInMs ? (trimOutMs - trimInMs) : 0;
      const rawVisibleMs = Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        trimmedVisibleMs || Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - Number(segment?.startMs || 0)) || STUDIO_TIMELINE_MIN_CLIP_MS
      );
      const rowId = String(segment?.rowId || "").trim();
      const playbackRate = rowId
        ? Math.max(0.5, Number(resolveDialogueAudioPlaybackRate?.(activeSession, rowId) || 1) || 1)
        : 1;
      return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(rawVisibleMs / playbackRate));
    };

    const syncMontageAudioSubtrackAlignment = () => {
      if (!els.podcastVideoTimeline) return;
      if (mode !== "tracks") return;
      if (podcastVideoState.showMontageAudioSubtracks !== true) return;
      const currentVideoCfg = getPodcastVideoConfig(activeSession);
      const currentGeminiTrack = normalizeGeminiDialogueTrack(currentVideoCfg?.geminiDialogueTrack || {});
      const currentGeminiSegmentByRowId = new Map(
        (currentGeminiTrack?.enabled === true ? currentGeminiTrack.segments : [])
          .map((segment) => [String(segment?.rowId || "").trim(), segment])
          .filter(([rowId]) => rowId)
      );
      const chips = Array.from(els.podcastVideoTimeline.querySelectorAll(".podcast-montage-audio-chip[data-row-id]"));
      if (!chips.length) return;
      const clipNodeByRowId = new Map(
        Array.from(els.podcastVideoTimeline.querySelectorAll(".podcast-video-timeline-clip[data-row-id]"))
          .map((clipEl) => [String(clipEl?.dataset?.rowId || "").trim(), clipEl])
          .filter(([rowId]) => rowId)
      );
      let sampled = 0;
      chips.forEach((chip) => {
        const alignMode = String(chip?.dataset?.audioAlign || "clip").trim().toLowerCase();
        const rowId = String(chip?.dataset?.rowId || "").trim();
        if (!rowId) return;
        if (alignMode === "segment") {
          const segment = currentGeminiSegmentByRowId.get(rowId) || null;
          if (!segment) return;
          const leftPx = Math.max(0, timelineMsToPx(Number(segment?.startMs || 0) || 0, activeSession) - STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX);
          const durationMs = resolveGeminiSegmentVisibleDurationMs(segment);
          const widthPx = Math.max(minAudioLoopPx, timelineMsToPx(durationMs, activeSession) - 4);
          chip.style.left = `${leftPx}px`;
          chip.style.width = `${widthPx}px`;
        } else {
          const clipEl = clipNodeByRowId.get(rowId) || null;
          const lane = chip.closest(".podcast-video-track-lane");
          if (!clipEl || !lane) return;
          const clipLeft = Number(clipEl.offsetLeft || 0);
          const clipWidth = Math.max(0, Number(clipEl.offsetWidth || 0));
          chip.style.left = `${clipLeft}px`;
          if (clipWidth > 0) {
            const existingWidth = Math.max(0, Number.parseFloat(String(chip.style.width || "")) || Number(chip.offsetWidth || 0));
            const nextWidth = existingWidth > 0 ? Math.min(existingWidth, clipWidth) : clipWidth;
            chip.style.width = `${Math.max(minAudioLoopPx, Math.floor(nextWidth))}px`;
          }
        }
        if (PODCAST_RENDER_DEBUG && sampled < 5) {
          sampled += 1;
          logPodcastRenderDebug("montage-audio-align", {
            rowId,
            alignMode,
            chipLeft: Number(chip.offsetLeft || 0),
            clipLeft: Number(chip.offsetLeft || 0),
            clipWidth: Number(chip.offsetWidth || 0),
            chipWidth: Number(chip.offsetWidth || 0)
          });
        }
      });
    };

    if (options.lightweight && els.podcastVideoTimeline) {
      const clipMap = ensureTimelineClipsByRowId(activeSession, { persist: false });
      const onScreenTextClipMap = ensureOnScreenTextClipsByRowId(activeSession, { persist: false });
      const minClipPx = getStudioTimelineMinClipPx(activeSession);
      const currentVideoCfg = getPodcastVideoConfig(activeSession);
      const currentGeminiTrack = normalizeGeminiDialogueTrack(currentVideoCfg?.geminiDialogueTrack || {});
      const currentGeminiSegmentByRowId = new Map(
        (currentGeminiTrack?.enabled === true ? currentGeminiTrack.segments : [])
          .map((segment) => [String(segment?.rowId || "").trim(), segment])
          .filter(([rowId]) => rowId)
      );
      els.podcastVideoTimeline.querySelectorAll(".podcast-video-timeline-clip[data-row-id]").forEach((clipEl) => {
        const rowId = String(clipEl.dataset.rowId || "").trim();
        const clip = clipMap[rowId];
        if (!clip) return;
        const leftPx = timelineMsToPx(Number(clip.startMs || 0), activeSession);
        const widthPx = Math.max(minClipPx, timelineMsToPx(getTimelineClipEffectiveDurationMs(clip), activeSession));
        clipEl.style.left = `${leftPx.toFixed(3)}px`;
        clipEl.style.width = `${widthPx.toFixed(3)}px`;
        const sourceDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(clip.sourceDurationMs || getTimelineClipEffectiveDurationMs(clip)));
        const trimMaskLeftPct = (Math.max(0, Number(clip.trimInMs || 0)) / sourceDurationMs) * 100;
        const trimMaskRightPct = (Math.max(0, sourceDurationMs - Number(clip.trimOutMs || sourceDurationMs)) / sourceDurationMs) * 100;
        clipEl.style.setProperty("--trim-mask-left", `${trimMaskLeftPct.toFixed(3)}%`);
        clipEl.style.setProperty("--trim-mask-right", `${trimMaskRightPct.toFixed(3)}%`);
        clipEl.classList.toggle("is-trimmed", trimMaskLeftPct > 0.05 || trimMaskRightPct > 0.05);
      });
      els.podcastVideoTimeline.querySelectorAll(".podcast-onscreen-text-timeline-clip[data-row-id]").forEach((clipEl) => {
        const rowId = String(clipEl.dataset.rowId || "").trim();
        const clip = onScreenTextClipMap[rowId];
        if (!clip) return;
        const hasGemini = currentGeminiSegmentByRowId.has(rowId);
        const minWidthPx = hasGemini ? minAudioLoopPx : minClipPx;
        const leftPx = Math.max(0, timelineMsToPx(Number(clip.startMs || 0), activeSession) - STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX);
        const widthPx = Math.max(minWidthPx, timelineMsToPx(getOnScreenTextClipEffectiveDurationMs(clip), activeSession) - 4);
        clipEl.style.left = `${leftPx.toFixed(3)}px`;
        clipEl.style.width = `${widthPx.toFixed(3)}px`;
        clipEl.classList.toggle("is-hidden", clip.hidden === true);
        const row = rowById.get(rowId) || null;
        const nextText = String(row?.onScreenText || "").trim() || "Sin texto";
        const contentEl = clipEl.querySelector(".podcast-onscreen-text-clip-content");
        if (contentEl) contentEl.textContent = nextText;
      });
      if (podcastVideoState.showMontageAudioSubtracks) {
        syncMontageAudioSubtrackAlignment();
      }
      syncPodcastTimelineSelectionUi(activeSession);
      syncPodcastTimelinePlayhead(activeSession);
      return;
    }

    if (!els.podcastVideoTimeline) return;
    closePodcastTimelineClipMenu();
    const renderReason = String(options.reason || "structure").trim() || "structure";
    syncTimelineModeButtons(activeSession);
    if (!rows.length) {
      els.podcastVideoTimeline.innerHTML = "";
      if (els.podcastTimelineRuler) els.podcastTimelineRuler.innerHTML = "";
      podcastTimelineScrollSyncCleanup?.();
      podcastTimelineScrollSyncCleanup = null;
      disconnectPodcastTimelinePreviewObserver();
      return;
    }

    const clipMap = ensureTimelineClipsByRowId(activeSession);
    const dialogueMap = getDialogueVideoMap(activeSession);
    const videoCfg = getPodcastVideoConfig(activeSession);
    const pxPerSec = getStudioTimelinePixelsPerSec(activeSession);
    const minClipPx = getStudioTimelineMinClipPx(activeSession);
    const timelineLaneHeightsById = videoCfg?.timelineTrackHeightsById && typeof videoCfg.timelineTrackHeightsById === "object"
      ? videoCfg.timelineTrackHeightsById
      : {};
    const isBulkRegenAll = podcastVideoState.bulkVideoGenerationActive && podcastVideoState.bulkVideoGenerationMode === "all";
    const timelineDurationMs = getTimelineTotalDurationMs(activeSession);
    const minCanvasWidthPx = Math.max(360, Math.round(860 * Math.max(0.35, getStudioTimelineZoom(activeSession))));
    const canvasWidthPx = Math.max(minCanvasWidthPx, Math.round((timelineDurationMs / 1000) * pxPerSec) + 172);
    const trackRows = ensureTimelineTracks(activeSession, { persist: false });
    if (isEducationalVideoMode(activeSession) && mode === "tracks") {
      logPodcastRenderDebug("timeline-educational-visible-tracks", {
        trackRows: trackRows.map((track) => ({
          id: String(track?.id || "").trim(),
          label: String(track?.label || "").trim(),
          visible: isEducationalVisibleSceneTrack(String(track?.id || "").trim())
        }))
      });
    }
    const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
    const structureKey = buildPodcastTimelineStructureKey(activeSession, mode);
    const canReuseStructure = (
      podcastRenderState.timelineStructureKey === structureKey
      && podcastRenderState.timelineMode === mode
      && els.podcastVideoTimeline.childElementCount > 0
    );

    if (
      canReuseStructure
      && options.force !== true
      && (renderReason === "selection" || renderReason === "playback" || renderReason === "ephemeral")
    ) {
      logPodcastRenderDebug("timeline-structure-skip", { reason: renderReason });
      syncTimelineModeButtons(activeSession);
      syncPodcastTimelineSelectionUi(activeSession);
      syncTimelineGapSelectionUi();
      syncPodcastTimelineLaneOffsetFromDom(activeSession);
      syncPodcastTimelinePlayhead(activeSession);
      syncTimelineEphemeralState(activeSession);
      if (els.podcastTimelineRuler) {
        const totalSec = Math.ceil(timelineDurationMs / 1000);
        const rulerStepSec = resolveTimelineRulerStepSec(pxPerSec);
        const expectedMarks = Math.floor(totalSec / rulerStepSec) + 1;
        const currentMarks = els.podcastTimelineRuler.querySelectorAll(".podcast-timeline-ruler-mark").length;
        if (currentMarks !== expectedMarks) {
          logPodcastRenderDebug("timeline-ruler-guard", { reason: renderReason, currentMarks, expectedMarks });
        }
      }
      return;
    } else if (renderReason === "selection" || renderReason === "playback" || renderReason === "ephemeral") {
      logPodcastRenderDebug("timeline-guard-structural-from-ephemeral", { reason: renderReason });
    }

    const timelineSceneIndexByRowId = (() => {
      const ordered = rows
        .map((row, index) => {
          const rowId = String(row?.id || "").trim();
          if (!rowId) return null;
          const clip = clipMap[rowId];
          if (!clip) return null;
          return {
            rowId,
            startMs: Math.max(0, Number(clip?.startMs || 0) || 0),
            zIndex: Math.max(1, Number(clip?.zIndex || 1) || 1),
            scriptIndex: index
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.startMs - b.startMs || a.zIndex - b.zIndex || a.scriptIndex - b.scriptIndex);
      const map = new Map();
      ordered.forEach((item, index) => {
        map.set(String(item.rowId || "").trim(), index + 1);
      });
      return map;
    })();

    if (els.podcastTimelineRuler) {
      const marks = [];
      const totalSec = Math.ceil(timelineDurationMs / 1000);
      const rulerStepSec = resolveTimelineRulerStepSec(pxPerSec);
      const offsetPx = mode === "tracks" ? PODCAST_TIMELINE_RULER_OFFSET_PX : 0;
      for (let sec = 0; sec <= totalSec; sec += rulerStepSec) {
        const leftPx = timelineMsToPx(sec * 1000, activeSession);
        marks.push(`<div class="podcast-timeline-ruler-mark" style="left:${leftPx + offsetPx}px"><span>${escapeHtml(secondsToClock(sec))}</span></div>`);
      }
      els.podcastTimelineRuler.innerHTML = `
        <div class="podcast-timeline-ruler-inner" style="width:${canvasWidthPx}px">${marks.join("")}<div id="podcastTimelineRulerPlayhead" class="podcast-timeline-ruler-playhead" aria-hidden="true"></div></div>
      `.trim();
    }

    if (mode === "normal") {
      const onScreenTextTrackSettings = getOnScreenTextTrackSettings(activeSession);
      const onScreenTextClipMap = ensureOnScreenTextClipsByRowId(activeSession, { persist: false });
      const buildNormalOnScreenTextTrackRowHtml = () => {
        if (onScreenTextTrackSettings.showTrack === false) return "";
        const stylePreset = getOnScreenTextStylePresetClass(onScreenTextTrackSettings.stylePreset);
        const items = rows
          .map((row, index) => {
            const rowId = String(row?.id || "").trim();
            if (!rowId) return null;
            const clip = onScreenTextClipMap[rowId] || null;
            if (!clip) return null;
            const clipLeftPx = timelineMsToPx(Number(clip?.startMs || 0), activeSession);
            const clipWidthPx = Math.max(minClipPx, timelineMsToPx(getOnScreenTextClipEffectiveDurationMs(clip), activeSession));
            return { row, rowId, index, clip, clipLeftPx, clipWidthPx };
          })
          .filter(Boolean)
          .sort((a, b) => Number(a.clip.startMs || 0) - Number(b.clip.startMs || 0) || a.index - b.index);
        const allHidden = items.length > 0 && items.every(({ clip }) => clip?.hidden === true);
        const laneHeightRaw = toFiniteNumber(timelineLaneHeightsById?.["on-screen-text"], Number.NaN);
        const laneHeightPx = Number.isFinite(laneHeightRaw)
          ? Math.round(Math.max(64, Math.min(320, laneHeightRaw)))
          : 120;
        const laneHeightAttr = ` style="height:${laneHeightPx}px;min-height:${laneHeightPx}px"`;
        return `
          <section class="podcast-video-track-row podcast-onscreen-text-track-row podcast-normal-onscreen-text-track-row" data-track-id="on-screen-text" data-track-index="-2">
            <div class="podcast-video-track-label is-onscreen-text-track">
            <div class="podcast-track-label-main">
              <span class="podcast-track-label-text">Texto</span>
            </div>
            <div class="podcast-track-label-actions is-text-track-controls">
              <button class="row-icon-btn" type="button" data-action="open-onscreen-text-track-modal" title="Opciones de texto en pantalla" aria-label="Opciones de texto en pantalla">
                <i class="fas fa-sliders-h" aria-hidden="true"></i>
              </button>
              <button class="row-icon-btn" type="button" data-action="timeline-toggle-onscreen-text-hidden" title="${allHidden ? "Mostrar texto en pantalla de todas las escenas" : "Ocultar texto en pantalla de todas las escenas"}" aria-label="${allHidden ? "Mostrar texto en pantalla de todas las escenas" : "Ocultar texto en pantalla de todas las escenas"}" aria-pressed="${allHidden ? "false" : "true"}">
                <i class="fas ${allHidden ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>
              </button>
              </div>
            </div>
            <div class="podcast-video-track-lane podcast-onscreen-text-lane" data-track-id="on-screen-text" data-track-index="-2"${laneHeightAttr}>
              ${items.length ? items.map(({ row, rowId, index, clip, clipLeftPx, clipWidthPx }) => {
                const isActive = rowId === String(podcastVideoState.activeRowId || "").trim();
                const isVisible = clip.hidden !== true;
                const text = String(row?.onScreenText || "").trim() || "Sin texto";
                const clippedText = trimWords(text, 18) || "Sin texto";
                const leftPx = Math.max(0, Number(clipLeftPx || 0) - STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX);
                const widthPx = Math.max(minClipPx, Number(clipWidthPx || 0));
                return `
                  <article class="podcast-onscreen-text-timeline-clip${isActive ? " is-active" : ""}${isVisible ? "" : " is-hidden"}" data-row-id="${escapeHtml(rowId)}" tabindex="-1" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px;z-index:${Math.max(1, Number(clip?.zIndex || index + 1))};" data-style-preset="${escapeHtml(stylePreset)}">
                    <button class="podcast-video-clip-handle start" type="button" data-action="timeline-text-trim-start" data-row-id="${escapeHtml(rowId)}" aria-label="Recortar inicio del texto"></button>
                    <button class="podcast-video-clip-handle end" type="button" data-action="timeline-text-trim-end" data-row-id="${escapeHtml(rowId)}" aria-label="Recortar final del texto"></button>
                    <div class="podcast-onscreen-text-clip-body" data-action="timeline-drag-onscreen-text-clip" data-row-id="${escapeHtml(rowId)}">
                      <div class="podcast-onscreen-text-clip-meta">
                        <strong>${escapeHtml(`Escena ${index + 1}`)}</strong>
                        <span>${isVisible ? "Visible" : "Oculto"}</span>
                      </div>
                      <div class="podcast-onscreen-text-clip-content">${escapeHtml(clippedText)}</div>
                      <div class="podcast-onscreen-text-clip-actions">
                        <button class="row-icon-btn" type="button" data-action="timeline-toggle-onscreen-text-hidden" data-row-id="${escapeHtml(rowId)}" aria-label="${isVisible ? "Ocultar texto" : "Mostrar texto"}" title="${isVisible ? "Ocultar texto" : "Mostrar texto"}">
                          <i class="fas ${isVisible ? "fa-eye" : "fa-eye-slash"}" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>
                  </article>
                `;
              }).join("") : `
                <div class="podcast-onscreen-text-lane-empty">
                  <strong>Sin texto en pantalla</strong>
                  <span>Agrega o activa <code>onScreenText</code> en alguna escena.</span>
                </div>
              `}
              <button class="podcast-track-lane-resize-handle" type="button" data-action="timeline-resize-track-lane" data-track-id="on-screen-text" aria-label="Redimensionar altura del track" title="Arrastra para cambiar altura"></button>
            </div>
          </section>
        `;
      };
      const timelineItemsHtml = rows.map((row, index) => {
        const rowId = String(row?.id || "").trim();
        if (!rowId) return "";
        const nextRowId = String(rows[index + 1]?.id || "").trim();
        const generatedClip = dialogueMap[rowId] || null;
        const primarySegment = resolvePrimaryDialogueVideoSegment(generatedClip);
        const videoSrc = resolveStorageVideoUrl(
          primarySegment?.downloadUrl || generatedClip?.downloadUrl || "",
          primarySegment?.storagePath || generatedClip?.storagePath || "",
          {
            updatedAt: generatedClip?.updatedAt || "",
            type: primarySegment?.type || generatedClip?.type || "",
            mimeType: primarySegment?.mimeType || generatedClip?.mimeType || ""
          }
        );
        const portrait = resolvePortraitForSpeaker(activeSession, row?.speaker);
        const portraitSrc = resolvePodcastPortraitUrl(portrait?.downloadUrl || "");
        const previewPosterSrc = portraitSrc || "SnoopyPodcastCreator.png";
        const timelineClip = clipMap[rowId] || null;
        const runtimeEntry = runtimeEntryByRowId.get(rowId) || null;
        const isActive = rowId === String(podcastVideoState.activeRowId || "").trim();
        const isGenerating = isTimelineSceneVideoGenerating(activeSession, rowId);
        const generationStatus = isGenerating ? getTimelineSceneVideoGenerationStatus(activeSession, rowId) : null;
        const generationLabel = String(generationStatus?.hint || generationStatus?.stage || "Generando video...").trim() || "Generando video...";
        const audioReady = hasStoredMediaSource(resolveDialogueAudioForRow(activeSession, rowId));
        const hasStylizedText = Boolean(String(activeSession?.stylizedTextMap?.[rowId] || "").trim());
        const speakerName = resolveSpeakerDisplayName(String(row?.speaker || "").trim(), activeSession);
        const transition = nextRowId
          ? getTransitionForEdge(activeSession, rowId, nextRowId)
          : { type: "cut", durationMs: 0 };
        const transitionType = String(transition?.type || "cut").trim().toLowerCase();
        const transitionDurationMs = Math.max(0, Math.round(Number(transition?.durationMs || 0) || 0));
        const isTransitionActive = rowId === String(podcastVideoState.transitionFromRowId || "").trim()
          && nextRowId === String(podcastVideoState.transitionToRowId || "").trim();
        const hasCustomTransition = transitionType !== "cut" || transitionDurationMs > 0;
        const transitionTitle = nextRowId
          ? `${hasCustomTransition ? `Editar transición: ${transitionType} · ${transitionDurationMs} ms` : "Agregar transición"} entre escena ${index + 1} y ${index + 2}`
          : "";
        return `
          <div class="podcast-video-timeline-item" data-row-id="${escapeHtml(rowId)}">
            <article class="podcast-video-scene-card${videoSrc ? " has-video" : ""}${isActive ? " is-active" : ""}" tabindex="-1">
              <button class="podcast-video-scene-preview${isGenerating ? " is-generating" : ""}" type="button" data-action="timeline-select-scene" data-row-id="${escapeHtml(rowId)}" title="Seleccionar escena ${index + 1}">
                ${videoSrc
                  ? (isLikelyImageMediaRecord(primarySegment || generatedClip)
                    ? `<img src="${escapeHtml(videoSrc)}" alt="Preview" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">`
                    : `<video data-preview-src="${escapeHtml(videoSrc)}" preload="none" muted playsinline crossorigin="anonymous" poster="${escapeHtml(previewPosterSrc)}"></video>`)
                  : portraitSrc
                    ? `<img src="${escapeHtml(portraitSrc)}" alt="${escapeHtml(`Retrato de ${speakerName}`)}" loading="lazy">`
                    : `<div class="podcast-video-scene-empty">Sin video</div>`}
                ${isGenerating
                  ? `<div class="podcast-video-scene-loading" aria-hidden="true">
                      <span class="podcast-video-scene-loading-ring"></span>
                      <img src="SnoopyPodcastCreator.png" alt="" class="podcast-video-scene-loading-logo">
                    </div>`
                  : ""}
                ${hasStylizedText ? `<span class="podcast-scene-stylized-text-badge" aria-label="Contiene texto estilizado" title="Contiene texto estilizado">T</span>` : ""}
              </button>
              <div class="podcast-video-scene-meta">
                <strong>Escena ${index + 1} · ${escapeHtml(speakerName)}</strong>
                <span>${escapeHtml(isGenerating ? generationLabel : (videoSrc ? "Video generado" : "Pendiente por generar"))} · ${audioReady ? "Voz lista" : "Sin voz"} · ${secondsToClock(Math.max(0.5, Number(runtimeEntry?.effectiveDurationMs || getTimelineClipEffectiveDurationMs(timelineClip)) / 1000))}</span>
              </div>
              <div class="podcast-video-scene-actions">
                <button class="row-icon-btn" type="button" data-action="timeline-play-scene-video" data-row-id="${escapeHtml(rowId)}" title="Reproducir escena"><i class="fas fa-play"></i></button>
                <button class="row-icon-btn${isGenerating || isBulkRegenAll ? " is-loading" : ""}" type="button" data-action="timeline-generate-scene-video" data-row-id="${escapeHtml(rowId)}" title="${videoSrc ? "Regenerar" : "Generar"} video"${isGenerating || isBulkRegenAll ? " disabled" : ""}><i class="fas ${isGenerating || isBulkRegenAll ? "fa-spinner spinner-icon" : (videoSrc ? "fa-sync-alt" : "fa-film")}"></i></button>
                <button class="row-icon-btn" type="button" data-action="timeline-delete-scene-video" data-row-id="${escapeHtml(rowId)}" title="Eliminar video"${videoSrc ? "" : " disabled"}><i class="fas fa-trash"></i></button>
              </div>
            </article>
            ${nextRowId
              ? `<button class="podcast-transition-card${isTransitionActive || hasCustomTransition ? " is-active" : ""}" type="button" data-action="open-transition-picker" data-from-row-id="${escapeHtml(rowId)}" data-to-row-id="${escapeHtml(nextRowId)}" title="${escapeHtml(transitionTitle)}" aria-label="${escapeHtml(transitionTitle)}"><i class="fas fa-wave-square" aria-hidden="true"></i></button>`
              : ""}
          </div>
        `;
      }).join("");
      const normalOnScreenTextTrackHtml = buildNormalOnScreenTextTrackRowHtml();
      podcastRenderState.timelinePreviewCreateCount += (timelineItemsHtml.match(/data-preview-src=/g) || []).length;
      els.podcastVideoTimeline.innerHTML = `<div class="podcast-video-timeline-canvas is-normal" data-playhead-offset="0" style="width:${canvasWidthPx}px;--pod-timeline-px-per-sec:${Math.max(8, Math.round(pxPerSec))}px"><div id="podcastTimelinePlayhead" class="podcast-timeline-playhead" aria-hidden="true"><button class="podcast-timeline-playhead-grip" type="button" data-action="timeline-drag-playhead" aria-label="Mover marcador de tiempo"></button></div><div id="podcastTimelineMenuLayer" class="podcast-video-timeline-menu-layer" aria-hidden="false"></div>${normalOnScreenTextTrackHtml || ""}<div class="podcast-video-timeline-list">${timelineItemsHtml}</div></div>`;
      podcastRenderState.timelineStructureKey = structureKey;
      podcastRenderState.timelineMode = mode;
      podcastRenderState.timelineStructureRenderCount += 1;
      logPodcastRenderDebug("timeline-structure-render", {
        reason: renderReason,
        mode,
        renderCount: podcastRenderState.timelineStructureRenderCount,
        previewNodes: podcastRenderState.timelinePreviewCreateCount
      });
      attachPodcastTimelineScrollSync();
      attachPodcastTimelinePreviewLoading();
      syncPodcastTimelinePlayhead(activeSession);
      syncCustomTooltips(els.podcastVideoTimeline);
      if (els.podcastVideoTimeline) {
        els.podcastVideoTimeline.scrollLeft = prevScrollLeft;
        els.podcastVideoTimeline.scrollTop = prevScrollTop;
      }
      return;
    }

    const originalRows = rows;
    const timelineTrackBlocks = [];
    const audioOnlyPodcastMode = isPodcastMode(activeSession) && !isEducationalVideoMode(activeSession) && !isVideoPodcastMode(activeSession);
    const showMontageAudioSubtracks = audioOnlyPodcastMode || podcastVideoState.showMontageAudioSubtracks === true;
    const onScreenTextTrackSettings = getOnScreenTextTrackSettings(activeSession);
    const onScreenTextClipMap = ensureOnScreenTextClipsByRowId(activeSession, { persist: false });
    const montageAudioMode = String(videoCfg?.audioMode || "gemini-live-per-scene").trim().toLowerCase();
    const montageGeminiTrack = normalizeGeminiDialogueTrack(videoCfg?.geminiDialogueTrack || {});
    const montageGeminiSegmentByRowId = new Map(
      (montageGeminiTrack.segments || [])
        .map((segment) => [String(segment?.rowId || "").trim(), segment])
        .filter(([rowId]) => rowId)
    );
    const resolveMontageAudioChipDurationMs = (timelineClip = null, audioDurationSec = 0) => {
      if (!timelineClip) return STUDIO_TIMELINE_MIN_CLIP_MS;
      const isPodcast = isPodcastMode(activeSession);
      const trimInMs = Math.max(0, Number(timelineClip?.trimInMs || 0) || 0);
      const clipPlayableMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(timelineClip));
      const audioDurationMs = Math.max(0, Number(audioDurationSec || 0) || 0) * 1000;
      if (isPodcast && audioDurationMs > 0) {
        return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, audioDurationMs - trimInMs);
      }
      if (montageAudioMode === "gemini-live-per-scene") {
        if (audioDurationMs > 0) {
          return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, audioDurationMs - trimInMs);
        }
        return clipPlayableMs;
      }
      if (montageAudioMode === "veo-native-audio") return clipPlayableMs;
      return audioDurationMs > 0 ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, audioDurationMs) : clipPlayableMs;
    };
    const buildMontageAudioSubtrackRowHtml = (track = null, trackIndex = 0, trackItems = []) => {
      if (!showMontageAudioSubtracks) return "";
      const trackId = String(track?.id || "").trim();
      if (!trackId) return "";
      const laneLabel = audioOnlyPodcastMode
        ? String(track?.label || `Track ${trackIndex + 1}`).trim() || `Track ${trackIndex + 1}`
        : "Audio";
      const excludedGeminiRowIds = new Set(
        (Array.isArray(montageGeminiTrack?.excludedRowIds) ? montageGeminiTrack.excludedRowIds : [])
          .map((rowId) => String(rowId || "").trim())
          .filter(Boolean)
      );
      const chipsHtml = trackItems.map(({ row, rowId, timelineClip }) => {
        if (excludedGeminiRowIds.has(String(rowId || "").trim())) return "";
        const segment = montageGeminiSegmentByRowId.get(String(rowId || "").trim()) || null;
        const audioClip = resolveDialogueAudioForRow(activeSession, rowId);
        const explicitStoredAudio = hasExplicitDialogueAudioForRow(activeSession, rowId);
        const sceneClip = dialogueMap[rowId] || null;
        if (isPublicLibrarySceneRow(row, sceneClip) && !explicitStoredAudio) return "";
        const storedAudioSrc = resolveStorageAudioUrl(audioClip?.downloadUrl || "", audioClip?.storagePath || "");
        const segmentAudioSrc = resolveStorageAudioUrl(
          String(segment?.downloadUrl || segment?.audioSrc || segment?.url || "").trim(),
          String(segment?.storagePath || "").trim()
        );
        const hasStoredAudio = Boolean(storedAudioSrc || segmentAudioSrc);
        if (!hasStoredAudio) return "";
        const alignMode = segment ? "segment" : "clip";
        const startMs = alignMode === "segment"
          ? Math.max(0, Number(segment?.startMs || 0) || 0)
          : Math.max(0, Number(timelineClip?.startMs || 0) || 0);
        const leftPx = Math.max(0, timelineMsToPx(startMs, activeSession) - STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX);
        const remainingWidthPx = Math.max(0, canvasWidthPx - 4 - leftPx);
        const speakerLabel = resolveSpeakerDisplayName(String(row?.speaker || "").trim(), activeSession);
        const sceneIndex = Math.max(
          1,
          Math.round(Number(timelineSceneIndexByRowId.get(rowId) || 0) || 0) || (Number(rowIndexById.get(rowId) || 0) + 1)
        );
        const adjustedAudioDurationSec = Math.max(0, Number(resolveRowAudioDurationMs?.(rowId, activeSession) || 0) || 0) / 1000;
        const durationMs = alignMode === "segment"
          ? resolveGeminiSegmentVisibleDurationMs(segment)
          : resolveMontageAudioChipDurationMs(timelineClip, adjustedAudioDurationSec);
        const baseWidthPx = Math.max(minAudioLoopPx, timelineMsToPx(durationMs, activeSession) - 4);
        const widthPx = Math.max(minAudioLoopPx, Math.min(baseWidthPx, remainingWidthPx));
        if (widthPx <= 0) return "";
        const isSelected = podcastVideoState.timelineAudioSelection?.geminiRowIds?.has?.(String(rowId || "").trim()) === true;
        return `
          <div class="podcast-montage-audio-chip is-stored${isSelected ? " is-selected" : ""}" data-row-id="${escapeHtml(rowId)}" data-audio-align="${escapeHtml(alignMode)}" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px" title="${escapeHtml(`Escena ${sceneIndex} · ${speakerLabel} · Voz guardada`)}">
            <i class="fas fa-volume-up" aria-hidden="true"></i>
            <span>${escapeHtml(`Escena ${sceneIndex} · ${speakerLabel}`)}</span>
            <button class="podcast-montage-audio-chip-speed-btn" type="button" data-action="open-gemini-audio-speed-modal" data-row-id="${escapeHtml(rowId)}" title="Velocidad de voz Gemini" aria-label="Velocidad de voz Gemini">
              <i class="fas fa-gauge-high" aria-hidden="true"></i>
            </button>
          </div>
        `;
      }).join("");
      if (!chipsHtml) return "";
      const laneId = `montage-audio:${trackId}`;
      return `
        <section class="podcast-video-track-row podcast-montage-audio-subtrack-row" data-track-id="${escapeHtml(laneId)}" data-track-index="-1">
          <div class="podcast-video-track-label is-subtrack"><span>${escapeHtml(laneLabel)}</span></div>
          <div class="podcast-video-track-lane podcast-montage-audio-lane" data-track-id="${escapeHtml(laneId)}" data-track-index="-1">
            ${chipsHtml}
          </div>
        </section>
      `;
    };
    const buildOnScreenTextTrackRowHtml = () => {
      if (onScreenTextTrackSettings.showTrack === false) return "";
      const laneHeightRaw = toFiniteNumber(timelineLaneHeightsById?.["on-screen-text"], Number.NaN);
      const laneHeightPx = Number.isFinite(laneHeightRaw) ? Math.round(Math.max(72, Math.min(520, laneHeightRaw))) : Number.NaN;
      const laneStyleParts = [];
      if (Number.isFinite(laneHeightPx)) {
        laneStyleParts.push(`height:${laneHeightPx}px`);
        laneStyleParts.push(`min-height:${laneHeightPx}px`);
      }
      const laneHeightAttr = ` style="${laneStyleParts.join(";")}"`;
      const items = originalRows
        .map((row, index) => {
          const rowId = String(row?.id || "").trim();
          if (!rowId) return null;
          const clip = onScreenTextClipMap[rowId] || null;
          if (!clip) return null;
          const timelineClip = ensureTimelineClipsByRowId(activeSession, { persist: false })[rowId] || null;
          const segment = montageGeminiSegmentByRowId.get(rowId) || null;
          const audioClip = resolveDialogueAudioForRow(activeSession, rowId);
          const alignMode = segment ? "segment" : "clip";
          const startMs = alignMode === "segment"
            ? Math.max(0, Number(segment?.startMs || 0) || 0)
            : Math.max(0, Number(timelineClip?.startMs || 0) || 0);
          const adjustedAudioDurationSec = Math.max(0, Number(resolveRowAudioDurationMs?.(rowId, activeSession) || 0) || 0) / 1000;
          const durationMs = alignMode === "segment"
            ? resolveGeminiSegmentVisibleDurationMs(segment)
            : resolveMontageAudioChipDurationMs(timelineClip, adjustedAudioDurationSec);
          const minWidthPx = alignMode === "segment" ? minAudioLoopPx : minClipPx;
          const clipLeftPx = timelineMsToPx(startMs, activeSession);
          const clipWidthPx = Math.max(minWidthPx, timelineMsToPx(durationMs, activeSession) - 4);
          return { row, rowId, index, clip, clipLeftPx, clipWidthPx, minWidthPx };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.clip.startMs || 0) - Number(b.clip.startMs || 0) || a.index - b.index);
      const allHidden = items.length > 0 && items.every(({ clip }) => clip?.hidden === true);
      const stylePreset = getOnScreenTextStylePresetClass(onScreenTextTrackSettings.stylePreset);
      return `
        <section class="podcast-video-track-row podcast-onscreen-text-track-row" data-track-id="on-screen-text" data-track-index="-2">
          <div class="podcast-video-track-label is-onscreen-text-track">
            <div class="podcast-track-label-main">
              <span class="podcast-track-label-text">Texto en</span>
            </div>
            <div class="podcast-track-label-actions is-text-track-controls">
              <button class="row-icon-btn" type="button" data-action="open-onscreen-text-track-modal" title="Opciones de texto en pantalla" aria-label="Opciones de texto en pantalla">
                <i class="fas fa-sliders-h" aria-hidden="true"></i>
              </button>
              <button class="row-icon-btn" type="button" data-action="timeline-toggle-onscreen-text-hidden" title="${allHidden ? "Mostrar texto en pantalla de todas las escenas" : "Ocultar texto en pantalla de todas las escenas"}" aria-label="${allHidden ? "Mostrar texto en pantalla de todas las escenas" : "Ocultar texto en pantalla de todas las escenas"}" aria-pressed="${allHidden ? "false" : "true"}">
                <i class="fas ${allHidden ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="podcast-video-track-lane podcast-onscreen-text-lane" data-track-id="on-screen-text" data-track-index="-2"${laneHeightAttr}>
            ${items.length ? items.map(({ row, rowId, index, clip, clipLeftPx, clipWidthPx, minWidthPx }) => {
              const isActive = rowId === String(podcastVideoState.activeRowId || "").trim();
              const isVisible = clip.hidden !== true;
              const text = String(row?.onScreenText || "").trim() || "Sin texto";
              const clippedText = trimWords(text, 22) || "Sin texto";
              const leftPx = Math.max(0, Number(clipLeftPx || 0) - STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX);
              const widthPx = Math.max(minWidthPx, Number(clipWidthPx || 0));
              return `
                <article class="podcast-onscreen-text-timeline-clip${isActive ? " is-active" : ""}${isVisible ? "" : " is-hidden"}" data-row-id="${escapeHtml(rowId)}" tabindex="-1" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px;z-index:${Math.max(1, Number(clip?.zIndex || index + 1))};" data-style-preset="${escapeHtml(stylePreset)}">
                  <button class="podcast-video-clip-handle start" type="button" data-action="timeline-text-trim-start" data-row-id="${escapeHtml(rowId)}" aria-label="Recortar inicio del texto"></button>
                  <button class="podcast-video-clip-handle end" type="button" data-action="timeline-text-trim-end" data-row-id="${escapeHtml(rowId)}" aria-label="Recortar final del texto"></button>
                  <div class="podcast-onscreen-text-clip-body" data-action="timeline-drag-onscreen-text-clip" data-row-id="${escapeHtml(rowId)}">
                    <div class="podcast-onscreen-text-clip-meta">
                      <strong>Escena ${index + 1}</strong>
                      <span>${isVisible ? "Visible" : "Oculto"}</span>
                    </div>
                    <div class="podcast-onscreen-text-clip-content">${escapeHtml(clippedText)}</div>
                    <div class="podcast-onscreen-text-clip-actions">
                      <button class="row-icon-btn" type="button" data-action="timeline-toggle-onscreen-text-hidden" data-row-id="${escapeHtml(rowId)}" aria-label="${isVisible ? "Ocultar texto" : "Mostrar texto"}" title="${isVisible ? "Ocultar texto" : "Mostrar texto"}">
                        <i class="fas ${isVisible ? "fa-eye" : "fa-eye-slash"}" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                </article>
              `;
            }).join("") : `
              <div class="podcast-onscreen-text-lane-empty">
                <strong>Sin texto en pantalla</strong>
                <span>Agrega o activa <code>onScreenText</code> en alguna escena para mostrar clips aquí.</span>
              </div>
            `}
            <button class="podcast-track-lane-resize-handle" type="button" data-action="timeline-resize-track-lane" data-track-id="on-screen-text" aria-label="Redimensionar altura del track" title="Arrastra para cambiar altura (doble click para restablecer)"></button>
          </div>
        </section>
      `;
    };

    const onScreenTextTrackHtml = audioOnlyPodcastMode ? "" : buildOnScreenTextTrackRowHtml();
    if (onScreenTextTrackHtml) timelineTrackBlocks.push(onScreenTextTrackHtml);
    trackRows.forEach((track, trackIndex) => {
      const trackId = String(track?.id || "").trim();
      const trackLabel = String(track?.label || `Track ${trackIndex + 1}`).trim() || `Track ${trackIndex + 1}`;
      const laneHeightRaw = toFiniteNumber(timelineLaneHeightsById?.[trackId], Number.NaN);
      const laneHeightPx = Number.isFinite(laneHeightRaw) ? Math.round(Math.max(56, Math.min(520, laneHeightRaw))) : Number.NaN;
      const laneHeightAttr = Number.isFinite(laneHeightPx) ? ` style="height:${laneHeightPx}px;min-height:${laneHeightPx}px"` : "";
      const trackItems = originalRows.map((row) => {
        const rowId = String(row?.id || "").trim();
        if (!rowId) return null;
        const timelineClip = clipMap[rowId];
        const runtimeEntry = runtimeEntryByRowId.get(rowId) || null;
        if (!timelineClip || String(timelineClip.trackId || "").trim() !== trackId) return null;
        const clipLeftPx = timelineMsToPx(Number(runtimeEntry?.startMs ?? timelineClip?.startMs ?? 0), activeSession);
        const clipWidthPx = Math.max(minClipPx, timelineMsToPx(Number(runtimeEntry?.effectiveDurationMs || getTimelineClipEffectiveDurationMs(timelineClip)), activeSession));
        return { row, rowId, index: Number(rowIndexById.get(rowId) || 0), timelineClip, clipLeftPx, clipWidthPx, clipEndPx: clipLeftPx + clipWidthPx };
      }).filter(Boolean).sort((a, b) => Number(a.clipLeftPx || 0) - Number(b.clipLeftPx || 0) || a.index - b.index);
      const overlapFadeByRowId = new Map();
      for (let i = 1; i < trackItems.length; i += 1) {
        const prev = trackItems[i - 1];
        const next = trackItems[i];
        const overlapPxRaw = Number(prev?.clipEndPx || 0) - Number(next?.clipLeftPx || 0);
        const overlapPx = Math.max(0, Math.round(overlapPxRaw));
        if (!overlapPx) continue;
        const prevWidth = Math.max(0, Math.round(Number(prev?.clipWidthPx || 0)));
        const nextWidth = Math.max(0, Math.round(Number(next?.clipWidthPx || 0)));
        const fadeOutPx = Math.max(0, Math.min(overlapPx, Math.max(0, prevWidth - 1)));
        const fadeInPx = Math.max(0, Math.min(overlapPx, Math.max(0, nextWidth - 1)));
        if (fadeOutPx) {
          const current = overlapFadeByRowId.get(prev.rowId) || { inPx: 0, outPx: 0 };
          overlapFadeByRowId.set(prev.rowId, { inPx: current.inPx, outPx: Math.max(current.outPx, fadeOutPx) });
        }
        if (fadeInPx) {
          const current = overlapFadeByRowId.get(next.rowId) || { inPx: 0, outPx: 0 };
          overlapFadeByRowId.set(next.rowId, { inPx: Math.max(current.inPx, fadeInPx), outPx: current.outPx });
        }
      }
      const audioRowHtml = buildMontageAudioSubtrackRowHtml(track, trackIndex, trackItems);
      if (audioOnlyPodcastMode) {
        if (audioRowHtml) timelineTrackBlocks.push(audioRowHtml);
        return;
      }
      timelineTrackBlocks.push(`<div class="podcast-video-track-drop-zone" data-drop-track-index="${trackIndex}" aria-hidden="true"></div>`);
      timelineTrackBlocks.push(`
        <section class="podcast-video-track-row${isEducationalVisibleSceneTrack(trackId) ? " is-educational-scene-track" : ""}" data-track-id="${escapeHtml(trackId)}" data-track-index="${trackIndex}">
          <div class="podcast-video-track-label">
            <div class="podcast-track-label-main">
              <span class="podcast-track-label-text">${escapeHtml(trackLabel)}</span>
            </div>
            ${isEducationalVisibleSceneTrack(trackId)
              ? `<div class="podcast-track-label-actions">
                    <button class="row-icon-btn" type="button" data-action="open-montage-scene-mix" title="Volúmenes globales (Veo + Gemini)" aria-label="Volúmenes globales">
                      <i class="fas fa-sliders-h" aria-hidden="true"></i>
                    </button>
                  </div>`
              : ""}
          </div>
          <div class="podcast-video-track-lane" data-track-id="${escapeHtml(trackId)}" data-track-index="${trackIndex}"${laneHeightAttr}>
            ${trackItems.map(({ row, rowId, index, timelineClip, clipLeftPx, clipWidthPx }) => {
              const generatedClip = dialogueMap[rowId] || null;
              const primarySegment = resolvePrimaryDialogueVideoSegment(generatedClip);
              const videoSrc = resolveStorageVideoUrl(
                primarySegment?.downloadUrl || generatedClip?.downloadUrl || "",
                primarySegment?.storagePath || generatedClip?.storagePath || "",
                {
                  updatedAt: generatedClip?.updatedAt || "",
                  type: primarySegment?.type || generatedClip?.type || "",
                  mimeType: primarySegment?.mimeType || generatedClip?.mimeType || ""
                }
              );
              const portrait = resolvePortraitForSpeaker(activeSession, row?.speaker);
              const portraitSrc = resolvePodcastPortraitUrl(portrait?.downloadUrl || "");
              const previewPosterSrc = portraitSrc || "SnoopyPodcastCreator.png";
              const leftPx = Number(clipLeftPx || 0);
              const widthPx = Math.max(minClipPx, Number(clipWidthPx || 0));
              const fade = overlapFadeByRowId.get(rowId) || null;
              const fadeInPx = fade ? Math.max(0, Number(fade.inPx || 0)) : 0;
              const fadeOutPx = fade ? Math.max(0, Number(fade.outPx || 0)) : 0;
              const hasOverlapFade = fadeInPx > 0 || fadeOutPx > 0;
              const effectiveClipZIndex = Math.max(1, Number(timelineClip?.zIndex || index + 1)) + (fadeInPx > 0 ? 1 : 0);
              const sourceDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(timelineClip?.sourceDurationMs || getTimelineClipEffectiveDurationMs(timelineClip)));
              const trimMaskLeftPct = Math.max(0, Math.min(100, (Math.max(0, Number(timelineClip?.trimInMs || 0)) / sourceDurationMs) * 100));
              const trimMaskRightPct = Math.max(0, Math.min(100, (Math.max(0, sourceDurationMs - Number(timelineClip?.trimOutMs || sourceDurationMs)) / sourceDurationMs) * 100));
              const hasTrimMask = trimMaskLeftPct > 0.05 || trimMaskRightPct > 0.05;
              const isActive = rowId === String(podcastVideoState.activeRowId || "").trim();
              const isGenerating = isTimelineSceneVideoGenerating(activeSession, rowId);
              const generationStatus = isGenerating ? getTimelineSceneVideoGenerationStatus(activeSession, rowId) : null;
              const generationLabel = String(generationStatus?.hint || generationStatus?.stage || "Generando video...").trim() || "Generando video...";
              const speakerName = resolveSpeakerDisplayName(String(row?.speaker || "").trim(), activeSession);
              const proposals = Array.isArray(row?.visualNotesProposals) ? row.visualNotesProposals.map((p) => String(p || "").trim()).filter(Boolean) : [];
              const resolved = Array.isArray(row?.visualNotesResolvedProposals) ? row.visualNotesResolvedProposals.map((p) => String(p || "").trim()).filter(Boolean) : [];
              const activeProposal = String(row?.visualNotesProposal || "").trim();
              const hasStylizedText = Boolean(String(activeSession?.stylizedTextMap?.[rowId] || "").trim());
              const allUniqueProposals = Array.from(new Set([...proposals, activeProposal])).filter(Boolean);
              const hasProposals = allUniqueProposals.length > 0;
              const allRealized = hasProposals && allUniqueProposals.every((p) => resolved.includes(p));
              const hasPending = hasProposals && !allRealized;
              const statusLabel = isGenerating ? generationLabel : (videoSrc ? "Listo" : "no hay video");
              return `
                <article class="podcast-video-timeline-clip${videoSrc ? " has-video" : ""}${isActive ? " is-active" : ""}${hasTrimMask ? " is-trimmed" : ""}${hasOverlapFade ? " is-overlap-fade" : ""}" data-row-id="${escapeHtml(rowId)}" tabindex="-1" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px;z-index:${effectiveClipZIndex};--trim-mask-left:${trimMaskLeftPct.toFixed(3)}%;--trim-mask-right:${trimMaskRightPct.toFixed(3)}%;--clip-fade-in:${fadeInPx}px;--clip-fade-out:${fadeOutPx}px">
                  <button class="podcast-video-clip-handle start" type="button" data-action="timeline-trim-start" data-row-id="${escapeHtml(rowId)}" aria-label="Recortar inicio"></button>
                  <button class="podcast-video-clip-handle end" type="button" data-action="timeline-trim-end" data-row-id="${escapeHtml(rowId)}" aria-label="Recortar final"></button>
                  <div class="podcast-video-clip-body${isGenerating ? " is-generating" : ""}${hasPending ? " has-pending-proposals" : ""}${allRealized ? " has-all-proposals-realized" : ""}" data-action="timeline-drag-clip" data-row-id="${escapeHtml(rowId)}">
                    <div class="podcast-video-clip-actions">
                      <button class="row-icon-btn podcast-video-clip-menu-btn" type="button" data-action="timeline-toggle-clip-menu" data-row-id="${escapeHtml(rowId)}" aria-haspopup="menu" aria-expanded="false" title="Acciones">
                        <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
                      </button>
                      <div class="podcast-video-clip-menu" role="menu" aria-label="Acciones de escena" data-row-id="${escapeHtml(rowId)}">
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="timeline-configure-scene-duration" data-row-id="${escapeHtml(rowId)}" title="Configurar duración (solo recortar)" aria-label="Configurar duración">
                          <i class="fas fa-sliders-h" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="timeline-open-frame-hold-modal" data-row-id="${escapeHtml(rowId)}" title="Congelar frame" aria-label="Congelar frame">
                          <i class="fas fa-camera" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="timeline-open-speed-range-modal" data-row-id="${escapeHtml(rowId)}" title="Velocidad por rango" aria-label="Velocidad por rango">
                          <i class="fas fa-tachometer-alt" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="duplicate-row" data-row-id="${escapeHtml(rowId)}" title="Duplicar escena" aria-label="Duplicar escena">
                          <i class="fas fa-copy" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="replace-scene-video-from-storage" data-row-id="${escapeHtml(rowId)}" title="Reemplazar video de la escena" aria-label="Reemplazar video de la escena">
                          <i class="fas fa-exchange-alt" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="timeline-play-scene-video" data-row-id="${escapeHtml(rowId)}" title="Reproducir escena" aria-label="Reproducir escena">
                          <i class="fas fa-play" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="publish-scene-to-library" data-row-id="${escapeHtml(rowId)}" title="${String(row?.publicSceneLibraryId || "").trim() ? "Actualizar escena pública" : "Publicar escena"}" aria-label="${String(row?.publicSceneLibraryId || "").trim() ? "Actualizar escena pública" : "Publicar escena"}">
                          <i class="fas fa-globe" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn${isGenerating || isBulkRegenAll ? " is-loading" : ""}" type="button" role="menuitem" data-action="timeline-generate-scene-video" data-row-id="${escapeHtml(rowId)}" title="${videoSrc ? "Regenerar" : "Generar"} video" aria-label="${videoSrc ? "Regenerar video" : "Generar video"}"${isGenerating || isBulkRegenAll ? " disabled" : ""}>
                          <i class="fas ${isGenerating || isBulkRegenAll ? "fa-spinner spinner-icon" : (videoSrc ? "fa-sync-alt" : "fa-film")}" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn${isGenerating || isBulkRegenAll ? " is-loading" : ""}" type="button" role="menuitem" data-action="timeline-regenerate-scene-video-hq" data-row-id="${escapeHtml(rowId)}" title="Regenerar mejorando calidad desde el clip actual" aria-label="Regenerar mejorando calidad"${isGenerating || isBulkRegenAll ? " disabled" : ""}>
                          <i class="fas ${isGenerating || isBulkRegenAll ? "fa-spinner spinner-icon" : "fa-wand-magic-sparkles"}" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="timeline-edit-stylized-text" data-row-id="${escapeHtml(rowId)}" title="Editar Texto Estilizado" aria-label="Editar Texto Estilizado">
                          <i class="fas fa-font" aria-hidden="true"></i>
                        </button>
                        <button class="row-icon-btn" type="button" role="menuitem" data-action="timeline-delete-scene-video" data-row-id="${escapeHtml(rowId)}" title="Eliminar video" aria-label="Eliminar video"${videoSrc ? "" : " disabled"}>
                          <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>
                    <div class="podcast-video-clip-meta">
                      <strong>Escena ${index + 1} · ${escapeHtml(speakerName)}</strong>
                      <span>${escapeHtml(statusLabel)}</span>
                    </div>
                    <button class="podcast-video-clip-preview${isGenerating ? " is-generating" : ""}" type="button" data-action="timeline-select-scene" data-row-id="${escapeHtml(rowId)}" title="Seleccionar escena ${index + 1}">
                      ${videoSrc
                        ? (isLikelyImageMediaRecord(primarySegment || generatedClip)
                          ? `<img src="${escapeHtml(videoSrc)}" alt="Preview" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">`
                          : `<video data-preview-src="${escapeHtml(videoSrc)}" preload="none" muted playsinline crossorigin="anonymous" poster="${escapeHtml(previewPosterSrc)}"></video>`)
                        : portraitSrc
                          ? `<img src="${escapeHtml(portraitSrc)}" alt="${escapeHtml(`Retrato de ${speakerName}`)}" loading="lazy">`
                          : `<div class="podcast-video-scene-empty">Sin video</div>`}
                      ${isGenerating
                        ? `<div class="podcast-video-scene-loading" aria-hidden="true">
                            <span class="podcast-video-scene-loading-ring"></span>
                            <img src="SnoopyPodcastCreator.png" alt="" class="podcast-video-scene-loading-logo">
                          </div>`
                        : ""}
                      ${hasStylizedText ? `<span class="podcast-scene-stylized-text-badge" aria-label="Contiene texto estilizado" title="Contiene texto estilizado">T</span>` : ""}
                    </button>
                    ${isGenerating
                      ? `<div class="podcast-video-clip-loading" aria-hidden="true">
                          <span class="podcast-video-scene-loading-ring"></span>
                          <img src="SnoopyPodcastCreator.png" alt="" class="podcast-video-scene-loading-logo">
                        </div>`
                      : ""}
                  </div>
                </article>
              `;
            }).join("")}
            <button class="podcast-track-lane-resize-handle" type="button" data-action="timeline-resize-track-lane" data-track-id="${escapeHtml(trackId)}" aria-label="Redimensionar altura del track" title="Arrastra para cambiar altura (doble click para restablecer)"></button>
          </div>
        </section>
      `);
      if (audioRowHtml) timelineTrackBlocks.push(audioRowHtml);
    });
    if (!audioOnlyPodcastMode) {
      timelineTrackBlocks.push(`<div class="podcast-video-track-drop-zone" data-drop-track-index="${trackRows.length}" aria-hidden="true"></div>`);
    }

    const panelTrack = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
    const uploadedTrackGroups = panelMusicState.selectedTrackKind === "uploaded" ? groupUploadedPanelMusicSegmentsByTrack(activeSession) : [];
    const uploadedTracks = panelMusicState.selectedTrackKind === "uploaded" ? getPanelMusicUploadedTracks() : [];
    const panelTrackReady = panelMusicState.sourceType === "track" && Boolean(
      String(panelTrack?.downloadUrl || "").trim()
      || String(panelTrack?.localDataUrl || "").trim()
      || String(panelTrack?.storagePath || "").trim()
    );
    const panelTrackDurationSec = getPanelMusicTrackDurationSec(panelTrack);
    const panelTrackTrimInMs = Math.max(0, Number(panelTrack?.trimInMs || 0) || 0);
    const panelTrackTrimOutMs = Math.max(panelTrackTrimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(panelTrack?.trimOutMs || Math.round(panelTrackDurationSec * 1000) || 0) || 0);
    const panelTrackEffectiveLoopMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, panelTrackTrimOutMs - panelTrackTrimInMs);
    const panelTrackLoopCount = panelTrackReady ? getPanelMusicLoopCount(activeSession, panelTrack) : 1;
    const panelTrackLoopSegments = panelTrackReady ? getPanelMusicLoopSegments(activeSession, panelTrack) : [];
    const panelTrackLoopWidthPx = panelTrackReady && panelTrackDurationSec > 0.05
      ? Math.max(minAudioLoopPx, timelineMsToPx(panelTrackEffectiveLoopMs, activeSession))
      : Math.max(minAudioLoopPx, Math.min(160, canvasWidthPx - 4));
    const panelMutedLoopIndexes = new Set(normalizePanelMusicMutedLoopIndexes(panelTrack?.mutedLoopIndexes || []));
    const panelLoopGapPx = 6;
    const montageMusicVolume = Math.max(0, Math.min(100, Number(panelMusicState.montageVolume ?? 0)));
    const montageStabilize = panelMusicState.stabilize === true;
    const panelTrackLabel = panelTrackReady
      ? (String(panelTrack?.name || "Música de fondo").trim() || "Música de fondo")
      : "Sin audio";
    const panelTrackTitle = panelTrackReady
      ? `Música de fondo lista: ${panelTrackLabel}`
      : "Sin audio de fondo cargado";
    logPodcastRenderDebug("audio-track-lane-render", {
      sourceType: panelMusicState.sourceType,
      selectedTrackKind: panelMusicState.selectedTrackKind,
      panelTrackReady,
      panelTrackName: String(panelTrack?.name || ""),
      panelTrackDurationSec,
      panelTrackTrimInMs,
      panelTrackTrimOutMs,
      panelTrackEffectiveLoopMs,
      panelTrackLoopCount,
      panelTrackLoopSegments,
      panelTrackLoopWidthPx,
      canvasWidthPx,
      mutedLoopIndexes: Array.from(panelMutedLoopIndexes)
    });
    const uploadedGroupMap = new Map(uploadedTrackGroups.map((group) => [Math.max(0, Math.floor(Number(group?.trackIndex || 0) || 0)), group]));
    const renderUploadedGroupRow = (groupTrack = null, rowIndex = 0) => {
      const safeTrack = normalizePanelMusicTrack(groupTrack);
      const allUploadedTracks = getPanelMusicUploadedTracks();
      const trackIndex = (() => {
        const slotLabel = String(safeTrack?.slotLabel || "").trim();
        if (slotLabel) {
          const idx = allUploadedTracks.findIndex((item) => String(item?.slotLabel || "").trim() === slotLabel);
          if (idx >= 0) return idx;
        }
        return Math.max(0, Math.floor(Number(rowIndex) || 0));
      })();
      const isTrackEnabled = safeTrack?.enabledInSession !== false;
      const group = uploadedGroupMap.get(trackIndex) || null;
      const groupSegments = Array.isArray(group?.segments) ? group.segments : [];
      const groupMutedLoopIndexes = new Set(normalizePanelMusicMutedLoopIndexes(safeTrack?.mutedLoopIndexes || []));
      const rowTitle = String(safeTrack?.slotLabel || `Audio ${trackIndex + 1}`).trim() || `Audio ${trackIndex + 1}`;
      const chipsHtml = groupSegments.map((segment) => {
        const loopIndex = Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0));
        const isLastGroupSegment = groupSegments[groupSegments.length - 1] === segment;
        const rightGapPx = isLastGroupSegment ? 0 : panelLoopGapPx;
        const selectionKey = `u:${trackIndex}:${loopIndex}`;
        const leftPx = Math.max(0, timelineMsToPx(Number(segment?.startMs || 0) || 0, activeSession));
        const remainingWidthPx = Math.max(0, canvasWidthPx - 4 - leftPx);
        const widthPx = Math.max(
          minAudioLoopPx,
          Math.min(
            Math.max(minAudioLoopPx, timelineMsToPx(Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(segment?.endMs || 0) - Number(segment?.startMs || 0)), activeSession) - rightGapPx),
            remainingWidthPx
          )
        );
        const visibleLoopMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(segment?.endMs || 0) - Number(segment?.startMs || 0));
        const fadeInMs = Math.max(0, Math.min(visibleLoopMs, Number(segment?.fadeInMs || 0) || 0));
        const fadeOutMs = Math.max(0, Math.min(visibleLoopMs, Number(segment?.fadeOutMs || 0) || 0));
        const fadeInWidthPx = widthPx > 0 ? Math.max(0, Math.min(widthPx, timelineMsToPx(fadeInMs, activeSession))) : 0;
        const fadeInNodeLeftPx = Math.max(10, Math.min(widthPx - 10, fadeInWidthPx));
        const fadeOutWidthPx = widthPx > 0 ? Math.max(0, Math.min(widthPx, timelineMsToPx(fadeOutMs, activeSession))) : 0;
        const fadeOutNodeLeftPx = Math.max(10, Math.min(widthPx - 10, widthPx - fadeOutWidthPx));
        const isMutedLoop = groupMutedLoopIndexes.has(loopIndex);
        const isActiveLoop = panelMusicState.selectedTrackKind === "uploaded"
          && String(panelMusicState.track?.slotLabel || "").trim() === String(safeTrack?.slotLabel || group?.slotLabel || "").trim()
          && Number(podcastAudioTrackUiState.activeLoopIndex) === loopIndex;
        const title = String(group?.segments?.length || 0) > 1
          ? `${safeTrack?.slotLabel || `Audio ${trackIndex + 1}`} · Loop ${loopIndex + 1}`
          : `${safeTrack?.slotLabel || `Audio ${trackIndex + 1}`} · ${safeTrack?.name || "Audio"}`;
        const isSelected = podcastVideoState.timelineAudioSelection.uploadedKeys.has(selectionKey);
        const displayName = String(safeTrack?.name || safeTrack?.slotLabel || `Audio ${trackIndex + 1}`).trim() || `Audio ${trackIndex + 1}`;
        return `
          <div class="podcast-audio-timeline-chip has-audio${fadeInMs > 0 ? " has-fadein" : ""}${fadeOutMs > 0 ? " has-fadeout" : ""}${isMutedLoop ? " is-muted-loop" : ""}${isActiveLoop ? " is-active" : ""}${isSelected ? " is-selected" : ""}" data-action="timeline-select-audio-loop" data-track-kind="uploaded" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" tabindex="0" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px;--audio-fadein-width:${fadeInWidthPx.toFixed(3)}px;--audio-fadein-node-left:${fadeInNodeLeftPx.toFixed(3)}px;--audio-fadeout-width:${fadeOutWidthPx.toFixed(3)}px;--audio-fadeout-node-left:${fadeOutNodeLeftPx.toFixed(3)}px" title="${escapeHtml(title)}">
            <button class="podcast-video-clip-handle start" type="button" data-action="timeline-audio-trim-start" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" aria-label="Recortar inicio de audio"></button>
            <button class="podcast-video-clip-handle end" type="button" data-action="timeline-audio-trim-end" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" aria-label="Recortar final de audio"></button>
            <button class="podcast-audio-fadein-handle" type="button" data-action="timeline-audio-fadein-handle" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" aria-label="Ajustar fade in del audio"></button>
            <button class="podcast-audio-fadeout-handle" type="button" data-action="timeline-audio-fadeout-handle" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" aria-label="Ajustar fade out del audio"></button>
            <span>${escapeHtml(displayName)}</span>
          </div>
        `;
      }).join("");
      return `
        <section class="podcast-video-track-row podcast-audio-track-row is-locked" data-track-id="audio-track-uploaded-${trackIndex}" data-track-index="-1">
          <div class="podcast-video-track-label is-locked is-audio-track">
            <div class="podcast-track-label-main">
              <i class="fas fa-music" aria-hidden="true"></i>
              <span class="podcast-track-label-text">${escapeHtml(rowTitle)}</span>
            </div>
            <div class="podcast-track-label-actions">
              <button class="row-icon-btn" type="button" data-action="timeline-toggle-uploaded-track-enabled" data-track-index="${trackIndex}" title="${isTrackEnabled ? "Deshabilitar track en esta sesión" : "Habilitar track en esta sesión"}" aria-label="${isTrackEnabled ? "Deshabilitar track" : "Habilitar track"}">
                <i class="fas ${isTrackEnabled ? "fa-volume-up" : "fa-volume-mute"}" aria-hidden="true"></i>
              </button>
              ${rowIndex === 0 ? `<button class="row-icon-btn podcast-audio-track-config-btn" type="button" data-action="open-audio-track-mix" title="Configurar mezcla de audio" aria-label="Configurar mezcla de audio">
                <i class="fas fa-sliders-h" aria-hidden="true"></i>
              </button>` : ""}
              <button class="row-icon-btn" type="button" data-action="timeline-delete-uploaded-track" data-track-index="${trackIndex}" title="Eliminar track" aria-label="Eliminar track">
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="podcast-video-track-lane podcast-audio-track-lane is-locked" data-track-id="audio-track-uploaded-${trackIndex}" data-track-index="-1">
            ${chipsHtml}
          </div>
        </section>
      `;
    };
    if (panelMusicState.selectedTrackKind === "uploaded" && uploadedTracks.length) {
      timelineTrackBlocks.push(uploadedTracks.map((track, rowIndex) => renderUploadedGroupRow(track, rowIndex)).join(""));
    } else {
      timelineTrackBlocks.push(`
        <section class="podcast-video-track-row podcast-audio-track-row is-locked" data-track-id="audio-track" data-track-index="-1">
          <div class="podcast-video-track-label is-locked is-audio-track">
            <div class="podcast-track-label-main">
              <i class="fas fa-music" aria-hidden="true"></i>
              <span class="podcast-track-label-text">Audio de fondo</span>
            </div>
            <div class="podcast-track-label-actions">
              <button class="row-icon-btn podcast-audio-track-config-btn" type="button" data-action="open-audio-track-mix" title="Configurar mezcla de audio" aria-label="Configurar mezcla de audio">
                <i class="fas fa-sliders-h" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="podcast-video-track-lane podcast-audio-track-lane is-locked" data-track-id="audio-track" data-track-index="-1">
            ${panelTrackReady
              ? panelTrackLoopSegments.map((segment) => {
                const loopIndex = Math.max(0, Number(segment?.loopIndex || 0) || 0);
                const segmentLoopMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(segment?.effectiveLoopMs || panelTrackEffectiveLoopMs) || panelTrackEffectiveLoopMs);
                const isLastPanelLoop = panelTrackLoopSegments[panelTrackLoopSegments.length - 1] === segment;
                const rightGapPx = isLastPanelLoop ? 0 : panelLoopGapPx;
                const leftPx = panelTrackDurationSec > 0.05
                  ? Math.max(0, timelineMsToPx(Number(segment?.startMs || 0) || 0, activeSession) + (loopIndex * panelLoopGapPx))
                  : 0;
                const remainingWidthPx = Math.max(0, canvasWidthPx - 4 - leftPx);
                const widthPx = panelTrackDurationSec > 0.05
                  ? Math.max(minAudioLoopPx, Math.min(Math.max(minAudioLoopPx, timelineMsToPx(segmentLoopMs, activeSession) - rightGapPx), remainingWidthPx))
                  : Math.max(minAudioLoopPx, Math.min(160, canvasWidthPx - 4));
                if (widthPx <= 0) return "";
                const fadeInMs = Math.max(0, Math.min(segmentLoopMs, Number(segment?.fadeInMs || 0) || 0));
                const fadeOutMs = Math.max(0, Math.min(segmentLoopMs, Number(segment?.fadeOutMs || 0) || 0));
                const fadeInWidthPx = widthPx > 0 ? Math.max(0, Math.min(widthPx, timelineMsToPx(fadeInMs, activeSession))) : 0;
                const fadeInNodeLeftPx = Math.max(10, Math.min(widthPx - 10, fadeInWidthPx));
                const fadeOutWidthPx = widthPx > 0 ? Math.max(0, Math.min(widthPx, timelineMsToPx(fadeOutMs, activeSession))) : 0;
                const fadeOutNodeLeftPx = Math.max(10, Math.min(widthPx - 10, widthPx - fadeOutWidthPx));
                const isMutedLoop = panelMutedLoopIndexes.has(loopIndex);
                const isActiveLoop = Number(podcastAudioTrackUiState.activeLoopIndex) === loopIndex;
                const selectionKey = buildTimelinePanelAudioSelectionKey(panelMusicState.selectedTrackKind, loopIndex);
                const isSelected = String(podcastVideoState.timelineAudioSelection.panelLoopKey || "").trim() === selectionKey;
                return `
                  <div class="podcast-audio-timeline-chip has-audio${fadeInMs > 0 ? " has-fadein" : ""}${fadeOutMs > 0 ? " has-fadeout" : ""}${isMutedLoop ? " is-muted-loop" : ""}${isActiveLoop ? " is-active" : ""}${isSelected ? " is-selected" : ""}" data-action="timeline-select-audio-loop" data-track-kind="${escapeHtml(panelMusicState.selectedTrackKind)}" data-loop-index="${loopIndex}" tabindex="0" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px;--audio-fadein-width:${fadeInWidthPx.toFixed(3)}px;--audio-fadein-node-left:${fadeInNodeLeftPx.toFixed(3)}px;--audio-fadeout-width:${fadeOutWidthPx.toFixed(3)}px;--audio-fadeout-node-left:${fadeOutNodeLeftPx.toFixed(3)}px" title="${escapeHtml(`${panelTrackTitle} · Loop ${loopIndex + 1}`)}">
                    <button class="podcast-video-clip-handle start" type="button" data-action="timeline-audio-trim-start" data-loop-index="${loopIndex}" aria-label="Recortar inicio de audio"></button>
                    <button class="podcast-video-clip-handle end" type="button" data-action="timeline-audio-trim-end" data-loop-index="${loopIndex}" aria-label="Recortar final de audio"></button>
                    <button class="podcast-audio-fadein-handle" type="button" data-action="timeline-audio-fadein-handle" data-loop-index="${loopIndex}" aria-label="Ajustar fade in del audio"></button>
                    <button class="podcast-audio-fadeout-handle" type="button" data-action="timeline-audio-fadeout-handle" data-loop-index="${loopIndex}" aria-label="Ajustar fade out del audio"></button>
                    <span data-action="timeline-drag-audio-track" data-loop-index="${loopIndex}">${escapeHtml(panelTrackLabel)}</span>
                  </div>
                `;
              }).join("")
              : `<div class="podcast-audio-timeline-chip is-missing" style="left:0;width:${Math.max(minAudioLoopPx, Math.min(160, canvasWidthPx - 4))}px" title="${escapeHtml(panelTrackTitle)}">
                  <i class="fas fa-lock" aria-hidden="true"></i>
                  <span>${escapeHtml(panelTrackLabel)} · ${escapeHtml(`${montageMusicVolume}%`)} · ${montageStabilize ? "Estabilizado" : "Sin estabilizar"}</span>
                </div>`}
          </div>
        </section>
      `);
    }

    const timelineHtml = timelineTrackBlocks.join("");
    podcastRenderState.timelinePreviewCreateCount += (timelineHtml.match(/data-preview-src=/g) || []).length;
    els.podcastVideoTimeline.innerHTML = `<div class="podcast-video-timeline-canvas" data-playhead-offset="${PODCAST_TIMELINE_RULER_OFFSET_PX}" style="width:${canvasWidthPx}px;--pod-timeline-px-per-sec:${Math.max(8, Math.round(pxPerSec))}px"><div id="podcastTimelinePlayhead" class="podcast-timeline-playhead" aria-hidden="true"><button class="podcast-timeline-playhead-grip" type="button" data-action="timeline-drag-playhead" aria-label="Mover marcador de tiempo"></button></div><div id="podcastTimelineMenuLayer" class="podcast-video-timeline-menu-layer" aria-hidden="false"></div>${timelineHtml}</div>`;
    syncPodcastTimelineLaneOffsetFromDom(activeSession);
    syncMontageAudioSubtrackAlignment();
    podcastRenderState.timelineStructureKey = structureKey;
    podcastRenderState.timelineMode = mode;
    podcastRenderState.timelineStructureRenderCount += 1;
    logPodcastRenderDebug("timeline-structure-render", {
      reason: renderReason,
      mode,
      renderCount: podcastRenderState.timelineStructureRenderCount,
      previewNodes: podcastRenderState.timelinePreviewCreateCount
    });
    attachPodcastTimelineScrollSync();
    attachPodcastTimelinePreviewLoading();
    syncTimelineGapSelectionUi();
    syncPodcastTimelinePlayhead(activeSession);
    syncCustomTooltips(els.podcastVideoTimeline);
    if (els.podcastVideoTimeline) {
      els.podcastVideoTimeline.scrollLeft = prevScrollLeft;
      els.podcastVideoTimeline.scrollTop = prevScrollTop;
    }
  }

  function syncPodcastTimelineSelectionUi(session = null) {
    if (!els.podcastVideoTimeline) return;
    const activeRowId = String(podcastVideoState.activeRowId || "").trim();
    els.podcastVideoTimeline.querySelectorAll(".podcast-video-scene-card.is-active, .podcast-video-timeline-clip.is-active, .podcast-onscreen-text-timeline-clip.is-active, .podcast-montage-audio-chip.is-active").forEach((node) => {
      node.classList.remove("is-active");
    });
    if (!activeRowId) return;
    els.podcastVideoTimeline.querySelectorAll(`[data-row-id="${CSS.escape(activeRowId)}"]`).forEach((node) => {
      if (
        node.classList.contains("podcast-video-scene-card")
        || node.classList.contains("podcast-video-timeline-clip")
        || node.classList.contains("podcast-onscreen-text-timeline-clip")
        || node.classList.contains("podcast-montage-audio-chip")
      ) {
        node.classList.add("is-active");
      }
    });
  }

  function ensureTimelinePlayheadVisible(leftPx = 0, focusNode = null, options = {}) {
    if (!els.podcastVideoTimeline) return;
    const lightweight = options.lightweight === true;
    if (!podcastVideoState.montageActive && lightweight) return;
    if (Date.now() < Number(podcastTimelineManualScrollUntil || 0)) return;
    const viewport = els.podcastVideoTimeline;
    const currentScrollLeft = Number(viewport.scrollLeft || 0);
    const viewportWidth = Math.max(0, Number(viewport.clientWidth || 0));
    if (viewportWidth <= 0) return;
    const leadingPad = Math.max(160, Math.round(viewportWidth * 0.3));
    const trailingPad = Math.max(220, Math.round(viewportWidth * 0.38));
    const visibleLeft = currentScrollLeft + leadingPad;
    const visibleRight = currentScrollLeft + viewportWidth - trailingPad;
    let targetScrollLeft = currentScrollLeft;
    if (leftPx < visibleLeft) {
      targetScrollLeft = Math.max(0, leftPx - leadingPad);
    } else if (leftPx > visibleRight) {
      targetScrollLeft = Math.max(0, leftPx - viewportWidth + trailingPad);
    } else if (focusNode) {
      const nodeLeft = Number(focusNode.offsetLeft || 0);
      const nodeWidth = Number(focusNode.offsetWidth || 0);
      const nodeRight = nodeLeft + nodeWidth;
      if (nodeLeft < currentScrollLeft + 24) {
        targetScrollLeft = Math.max(0, nodeLeft - 24);
      } else if (nodeRight > currentScrollLeft + viewportWidth - 24) {
        targetScrollLeft = Math.max(0, nodeRight - viewportWidth + 24);
      }
    }
    if (Math.abs(targetScrollLeft - currentScrollLeft) < 2) return;
    viewport.scrollLeft = targetScrollLeft;
  }

  function syncPodcastTimelinePlayhead(session = null, options = {}) {
    if (typeof session === "number") {
      const ms = session;
      const duration = typeof options === "number" ? options : 0;
      const actualSession = arguments[2] || getActiveSession();
      return syncPodcastTimelinePlayhead(actualSession, { currentMs: ms, totalMs: duration, lightweight: true });
    }
    if (!els.podcastVideoTimeline) return;
    const lightweight = options?.lightweight === true;
    const canvas = els.podcastVideoTimeline.querySelector(".podcast-video-timeline-canvas");
    const playhead = els.podcastVideoTimeline.querySelector("#podcastTimelinePlayhead");
    if (!playhead) return;
    const activeSession = session || getActiveSession();
    const mode = getTimelineViewMode(activeSession);
    const totalMs = options?.totalMs || Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(activeSession));
    const cursorMs = Math.max(0, Math.min(totalMs, Number(options?.currentMs ?? podcastVideoState.montageCursorMs ?? 0)));
    const entries = buildTimelineRuntimeEntries(activeSession);
    const directEntry = entries.find((entry) => cursorMs >= entry.startMs && cursorMs < entry.endMs) || null;
    const lastEntry = entries.length ? entries[entries.length - 1] : null;
    const focusEntry = directEntry || (cursorMs >= (Number(lastEntry?.endMs || 0) - 1) ? lastEntry : null);
    const playheadRowId = String(focusEntry?.rowId || "").trim();
    let offsetPx = Math.max(0, Number(canvas?.dataset?.playheadOffset || 0));
    if (mode === "tracks" && (!lightweight || !Number.isFinite(offsetPx) || offsetPx < 1)) {
      offsetPx = Math.max(0, syncPodcastTimelineLaneOffsetFromDom(activeSession));
    }
    if (mode === "tracks" && offsetPx < 1) offsetPx = PODCAST_TIMELINE_RULER_OFFSET_PX;
    const leftPx = offsetPx + Math.round(timelineMsToPx(cursorMs, activeSession));
    if (Number.isFinite(leftPx)) playhead.style.left = `${leftPx}px`;
    const rulerPlayhead = els.podcastTimelineRuler?.querySelector?.("#podcastTimelineRulerPlayhead") || null;
    if (rulerPlayhead) rulerPlayhead.style.left = `${leftPx}px`;
    if (els.podcastStudioScrubber) {
      const ratio = Math.max(0, Math.min(1, cursorMs / Math.max(1, totalMs)));
      els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
    }
    if (els.podcastStudioTime) {
      els.podcastStudioTime.textContent = `${secondsToClock(cursorMs / 1000)} / ${secondsToClock(totalMs / 1000)}`;
    }
    if (els.podcastStudioTrackHeadTime) {
      const formatter = typeof formatTrackHeadPlayheadTime === "function"
        ? formatTrackHeadPlayheadTime
        : ((ms) => `${secondsToClock((Number(ms || 0) || 0) / 1000)}.0`);
      els.podcastStudioTrackHeadTime.textContent = formatter(cursorMs);
    }
    if (lightweight) return;
    let focusNode = null;
    els.podcastVideoTimeline
      .querySelectorAll(".podcast-video-scene-card.is-playhead-focus, .podcast-video-timeline-clip.is-playhead-focus, .podcast-montage-audio-chip.is-playhead-focus")
      .forEach((node) => {
        node.classList.remove("is-playhead-focus");
        node.removeAttribute("aria-current");
      });
    if (playheadRowId) {
      const escapedRowId = CSS.escape(playheadRowId);
      els.podcastVideoTimeline
        .querySelectorAll(`.podcast-video-timeline-item[data-row-id="${escapedRowId}"] .podcast-video-scene-card, .podcast-video-timeline-clip[data-row-id="${escapedRowId}"], .podcast-montage-audio-chip[data-row-id="${escapedRowId}"]`)
        .forEach((node) => {
          node.classList.add("is-playhead-focus");
          node.setAttribute("aria-current", "true");
          if (!focusNode) focusNode = node;
        });
    }
    if (focusNode && podcastVideoState.montageActive && document.activeElement !== focusNode && !focusNode.contains(document.activeElement)) {
      focusNode.focus({ preventScroll: true });
    }
    ensureTimelinePlayheadVisible(leftPx, focusNode, { lightweight });
  }

  function scheduleStudioTimelinePreviewSync(nextMs = 0, entries = null) {
    if (podcastVideoState.montageActive === true) return;
    podcastTimelinePreviewSyncPayload = {
      nextMs: Math.max(0, Number(nextMs) || 0),
      entries: Array.isArray(entries) ? entries : null
    };
    if (podcastTimelinePreviewSyncRafId) return;
    podcastTimelinePreviewSyncRafId = requestAnimationFrame(() => {
      podcastTimelinePreviewSyncRafId = 0;
      const payload = podcastTimelinePreviewSyncPayload;
      podcastTimelinePreviewSyncPayload = null;
      if (!payload) return;
      const session = getActiveSession();
      void (payload.entries || buildTimelineRuntimeEntries(session));
      if (podcastVideoState.montageActive === true) return;
      syncStudioTimelinePreview(session, { currentMs: payload.nextMs, autoplay: false });
    });
  }

  function seekStudioTimelineByClientX(clientX = 0, options = {}) {
    const session = getActiveSession();
    if (!session || !els.podcastVideoTimeline) return;
    const canvas = els.podcastVideoTimeline.querySelector(".podcast-video-timeline-canvas");
    if (!canvas) return;
    syncPodcastTimelineLaneOffsetFromDom(session);
    const rect = canvas.getBoundingClientRect();
    const offsetPx = Math.max(0, Number(canvas?.dataset?.playheadOffset || 0));
    const contentX = Math.max(0, Number(clientX || 0) - rect.left - offsetPx);
    const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
    const nextMs = Math.max(0, Math.min(totalMs, timelinePxToMs(contentX)));
    playbackController.seek(nextMs);
    if (options.stopMontage === true && podcastVideoState.montageActive) {
      playbackController.stop({ keepStatus: true, keepCursor: true });
    }
  }

  function seekStudioTimelineByRulerClientX(clientX = 0, options = {}) {
    const session = getActiveSession();
    if (!session || !els.podcastTimelineRuler) return;
    syncPodcastTimelineLaneOffsetFromDom(session);
    const rulerInner = els.podcastTimelineRuler.querySelector(".podcast-timeline-ruler-inner");
    const canvas = els.podcastVideoTimeline?.querySelector?.(".podcast-video-timeline-canvas");
    const rect = els.podcastTimelineRuler.getBoundingClientRect();
    const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
    const totalWidthPx = Math.max(1, Number(rulerInner?.offsetWidth || timelineMsToPx(totalMs, session)));
    const offsetPx = Math.max(0, Number(canvas?.dataset?.playheadOffset || 0));
    const localX = options.localX !== undefined
      ? options.localX
      : Math.max(0, Math.min(rect.width, Number(clientX || 0) - rect.left));
    const contentX = Math.max(0, Math.min(totalWidthPx, localX + Number(els.podcastTimelineRuler.scrollLeft || 0) - offsetPx));
    const nextMs = Math.max(0, Math.min(totalMs, timelinePxToMs(contentX, session)));
    playbackController.seek(nextMs);
    if (options.stopMontage === true && podcastVideoState.montageActive) {
      playbackController.stop({ keepStatus: true, keepCursor: true });
    }
  }

  return {
    attachPodcastTimelineScrollSync,
    disconnectPodcastTimelinePreviewObserver,
    setTimelinePreviewsSuspended,
    loadTimelinePreviewVideo,
    attachPodcastTimelinePreviewLoading,
    syncPodcastTimelineLaneOffsetFromDom,
    getPodcastTimelineClipMenuPortal,
    closePodcastTimelineClipMenu,
    renderPodcastVideoTimeline,
    syncPodcastTimelineSelectionUi,
    syncPodcastTimelinePlayhead,
    scheduleStudioTimelinePreviewSync,
    seekStudioTimelineByClientX,
    seekStudioTimelineByRulerClientX
  };
}
