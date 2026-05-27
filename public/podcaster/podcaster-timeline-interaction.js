export function createPodcasterTimelineInteractionApi(deps = {}) {
  const {
    els,
    podcastVideoState,
    getActiveSession,
    getTimelineViewMode,
    upsertPodcastVideoConfig,
    scheduleSessionLocalPersist,
    seekStudioTimelineByClientX,
    updateTimelineGapSelection,
    getTrackLaneContentPx,
    clearPodcastTimelineDragUi,
    syncPodcastTimelineSelectionUi,
    syncPodcastTimelinePlayhead,
    syncPodcastStudioInspector,
    syncTimelineGapSelectionUi,
    syncGeminiDialogueTrackWithRuntime,
    persistCompactedTimelineTrackFromRow,
    flushSessionLocalPersistNow,
    renderPodcastVideoTimeline,
    syncTimelineModeButtons,
    syncPodcastVideoSpeakerCardVisibility,
    setGeminiAudioSpeedModalOpen,
    beginTimelineGapSelection,
    selectTimelineSceneRow,
    timelinePxToMs,
    resolveTimelineDragStepMs,
    getTimelineClipStoreByKind,
    getSessionRows,
    STUDIO_TIMELINE_MIN_CLIP_MS,
    getTimelineTotalDurationMs,
    getOnScreenTextClipEffectiveDurationMs,
    normalizeOnScreenTextClipItem,
    getPodcastVideoConfig,
    buildManualOnScreenTextTrackConfig,
    syncOnScreenTextTrackToggleBtn,
    syncPodcastOnScreenTextOverlay,
    syncTimelineClipDurationModalInputs,
    snapTimelineMsWithStep,
    resolvePanelMusicTrackKind,
    panelMusicState,
    selectUploadedPanelMusicTrackByIndex,
    getPanelMusicLoopSetting,
    updatePanelMusicTrack,
    upsertPanelMusicLoopSetting,
    getPanelMusicTrackAvailability,
    getPanelMusicTrackByKind,
    normalizePanelMusicTrack,
    getPanelMusicTrackDurationSec,
    stopPanelMusic,
    syncActivePanelMusicTrack,
    syncMusicControls,
    normalizeGeminiDialogueTrack,
    buildGeminiDialogueTimelineTrack,
    syncOnScreenTextClipsWithGeminiTrack,
    syncTimelineGeminiSegmentDragPreview,
    buildUploadedPanelMusicSegments,
    getPanelMusicUploadedTracks,
    setPanelMusicUploadedTracks,
    removeUploadedTrackAt,
    persistPanelMusicSettings,
    persistPanelMusicToActiveSession,
    removeDialogueAudioForRow,
    resolveSceneNumberByRowId,
    ensureOnScreenTextClipsByRowId,
    ensureTimelineClipsByRowId,
    isSceneTimelineTrackId,
    normalizeTimelineClipItem,
    STUDIO_TIMELINE_VERSION,
    STUDIO_TIMELINE_CHAIN_TOLERANCE_MS,
    getTimelineClipEndMs,
    constrainOnScreenTextClipToScene,
    normalizeTimelineClipsByRowId,
    normalizeOnScreenTextClipsByRowId,
    normalizeOnScreenTextTrackSettings,
    STUDIO_TIMELINE_TRACK_VERSION,
    STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION,
    duplicateSceneRowsIntoNewTrack,
    ensureTimelineTracks,
    normalizeTimelineTracks,
    PODCAST_SESSION_MANUAL_SAVE_ONLY,
    persistSessions,
    sessionStore
  } = deps;

  let timelinePointerMoveRafId = 0;
  let lastTimelinePointerEvent = null;

  function beginClipDrag(mode = "move", rowId = "", event = null, options = {}) {
    const key = String(rowId || "").trim();
    if (!key || !event) return;
    const session = getActiveSession();
    const clipKind = String(options.kind || "scene").trim().toLowerCase() === "on-screen-text" ? "on-screen-text" : "scene";
    const clips = getTimelineClipStoreByKind(session, clipKind, { persist: false });
    const clip = clips[key];
    if (!clip) return;
    const linkedIds = [];
    if (mode === "move" && clipKind === "scene") {
      const toleranceMs = STUDIO_TIMELINE_CHAIN_TOLERANCE_MS;
      const sameTrack = Object.values(clips)
        .filter((item) => String(item?.trackId || "") === String(clip.trackId || ""))
        .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0));
      const currentIdx = sameTrack.findIndex((item) => String(item?.rowId || "").trim() === key);
      if (currentIdx >= 0) {
        linkedIds.push(key);
        let rightCursor = currentIdx;
        while (rightCursor < sameTrack.length - 1) {
          const current = sameTrack[rightCursor];
          const next = sameTrack[rightCursor + 1];
          const gap = Math.abs(getTimelineClipEndMs(current) - Number(next.startMs || 0));
          if (gap > toleranceMs) break;
          linkedIds.push(String(next.rowId || "").trim());
          rightCursor += 1;
        }
      }
    }
    const dragGroup = Object.values(clips)
      .filter((item) => (
        mode === "move"
          ? linkedIds.includes(String(item.rowId || "").trim())
          : String(item?.trackId || "") === String(clip.trackId || "")
      ))
      .map((item) => ({
        rowId: String(item.rowId || "").trim(),
        initialStartMs: Number(item.startMs || 0)
      }))
      .filter((item) => item.rowId);
    podcastVideoState.timelineDrag = {
      mode,
      kind: clipKind,
      rowId: key,
      startClientX: Number(event.clientX || 0),
      startClientY: Number(event.clientY || 0),
      initialStartMs: Number(clip.startMs || 0),
      initialTrimInMs: Number(clip.trimInMs || 0),
      initialTrimOutMs: Number(clip.trimOutMs || 0),
      sourceDurationMs: Number(clip.sourceDurationMs || 0),
      sourceTrackId: String(clip.trackId || "").trim(),
      sourceTrackIndex: Number((event.target?.closest?.(".podcast-video-track-row")?.dataset?.trackIndex) || 0),
      dragGroup
    };
    if (mode === "trim-start" || mode === "trim-end") {
      selectTimelineSceneRow(rowId, { syncStage: false });
    }
    document.body.classList.add("podcast-timeline-dragging");
  }

  function beginAudioTrimDrag(mode = "audio-trim-start", event = null) {
    if (!event) return;
    const requestedTrackIndex = Math.max(0, Math.floor(Number(event?.target?.closest?.("[data-track-index]")?.dataset?.trackIndex || 0) || 0));
    if (event?.target?.closest?.("[data-track-index]")) {
      selectUploadedPanelMusicTrackByIndex(requestedTrackIndex);
    }
    const track = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
    if (!track) return;
    const loopIndex = Math.max(0, Math.floor(Number(event?.target?.closest?.("[data-loop-index]")?.dataset?.loopIndex || 0) || 0));
    const loopSetting = getPanelMusicLoopSetting(track, loopIndex);
    podcastVideoState.timelineDrag = {
      mode,
      startClientX: Number(event.clientX || 0),
      loopIndex,
      initialTrimInMs: Math.max(0, Number(loopSetting?.trimInMs || 0) || 0),
      initialTrimOutMs: Math.max(0, Number(loopSetting?.trimOutMs || Math.round(getPanelMusicTrackDurationSec(track) * 1000) || STUDIO_TIMELINE_MIN_CLIP_MS) || STUDIO_TIMELINE_MIN_CLIP_MS),
      initialFadeInMs: Math.max(0, Number(loopSetting?.fadeInMs || 0) || 0),
      initialFadeOutMs: Math.max(0, Number(loopSetting?.fadeOutMs || 0) || 0),
      sourceDurationMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(getPanelMusicTrackDurationSec(track) * 1000) || STUDIO_TIMELINE_MIN_CLIP_MS),
      initialStartOffsetMs: Math.max(0, Number(track.startOffsetMs || 0) || 0),
      selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
      selectedTrackIndex: requestedTrackIndex
    };
    document.body.classList.add("podcast-timeline-dragging");
  }

  function beginAudioMoveDrag(event = null) {
    if (!event) return;
    const requestedTrackIndex = Math.max(0, Math.floor(Number(event?.target?.closest?.("[data-track-index]")?.dataset?.trackIndex || 0) || 0));
    if (event?.target?.closest?.("[data-track-index]")) {
      selectUploadedPanelMusicTrackByIndex(requestedTrackIndex);
    }
    const track = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
    if (!track) return;
    podcastVideoState.timelineDrag = {
      mode: "audio-move",
      startClientX: Number(event.clientX || 0),
      initialStartOffsetMs: Math.max(0, Number(track.startOffsetMs || 0) || 0),
      selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
      selectedTrackIndex: requestedTrackIndex
    };
    document.body.classList.add("podcast-timeline-dragging");
  }

  function buildPanelAudioSelectionKey(kind = "", loopIndex = 0) {
    const trackKind = resolvePanelMusicTrackKind(kind || panelMusicState.selectedTrackKind);
    const safeLoopIndex = Math.max(0, Math.floor(Number(loopIndex || 0) || 0));
    return `${trackKind}:${safeLoopIndex}`;
  }

  function clearAudioSelection() {
    podcastVideoState.timelineAudioSelection.geminiRowIds.clear();
    podcastVideoState.timelineAudioSelection.uploadedKeys.clear();
    podcastVideoState.timelineAudioSelection.panelLoopKey = "";
  }

  function clearPanelMusicTrackByKind(kind = "") {
    const kindToClear = resolvePanelMusicTrackKind(kind || panelMusicState.selectedTrackKind);
    if (panelMusicState.playing && panelMusicState.sourceType === "track") {
      stopPanelMusic();
    }
    if (kindToClear === "uploaded") {
      setPanelMusicUploadedTracks([], { selectIndex: 0 });
      panelMusicState.track = null;
      panelMusicState.sourceType = "preset";
    } else {
      panelMusicState.trackLibrary[kindToClear] = null;
      syncActivePanelMusicTrack();
    }
    clearAudioSelection();
    persistPanelMusicSettings();
    persistPanelMusicToActiveSession();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
  }

  function deleteSelectedAudioChips() {
    const selectedGeminiRowIds = Array.from(podcastVideoState.timelineAudioSelection.geminiRowIds)
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean);
    if (selectedGeminiRowIds.length) {
      const sceneLabels = selectedGeminiRowIds.map((rowId) => resolveSceneNumberByRowId(rowId, getActiveSession()));
      const label = sceneLabels.length === 1
        ? `la voz de la escena ${sceneLabels[0]}`
        : `las voces de las escenas ${sceneLabels.join(", ")}`;
      if (!window.confirm(`Se eliminará ${label}. ¿Deseas continuar?`)) return false;
      clearAudioSelection();
      selectedGeminiRowIds.forEach((rowId, index) => {
        removeDialogueAudioForRow(rowId, { silent: index !== selectedGeminiRowIds.length - 1 });
      });
      renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
      syncPodcastStudioInspector(getActiveSession());
      return true;
    }

    const selectedUploadedTrackIndexes = Array.from(new Set(
      Array.from(podcastVideoState.timelineAudioSelection.uploadedKeys)
        .map((key) => {
          const match = /^u:(\d+):\d+$/.exec(String(key || "").trim());
          return match ? Math.max(0, Math.floor(Number(match[1] || 0) || 0)) : Number.NaN;
        })
        .filter(Number.isFinite)
    )).sort((a, b) => b - a);
    if (selectedUploadedTrackIndexes.length) {
      const tracks = getPanelMusicUploadedTracks();
      const labels = selectedUploadedTrackIndexes
        .map((trackIndex) => String(tracks[trackIndex]?.slotLabel || `Audio ${trackIndex + 1}`).trim() || `Audio ${trackIndex + 1}`);
      const label = labels.length === 1 ? labels[0] : labels.join(", ");
      if (!window.confirm(`Se eliminará ${label} de esta sesión. ¿Deseas continuar?`)) return false;
      clearAudioSelection();
      selectedUploadedTrackIndexes.forEach((trackIndex) => {
        removeUploadedTrackAt(trackIndex);
      });
      return true;
    }

    const panelLoopKey = String(podcastVideoState.timelineAudioSelection.panelLoopKey || "").trim();
    if (panelLoopKey) {
      const [rawKind = "uploaded"] = panelLoopKey.split(":");
      const trackKind = resolvePanelMusicTrackKind(rawKind);
      const track = getPanelMusicTrackAvailability(trackKind) || getPanelMusicTrackByKind(trackKind) || null;
      if (!track) {
        clearAudioSelection();
        renderPodcastVideoTimeline(getActiveSession());
        return false;
      }
      const trackLabel = String(track?.name || (trackKind === "ai" ? "música IA" : "audio de fondo")).trim()
        || (trackKind === "ai" ? "música IA" : "audio de fondo");
      if (!window.confirm(`Se eliminará ${trackLabel} de esta sesión. ¿Deseas continuar?`)) return false;
      clearPanelMusicTrackByKind(trackKind);
      return true;
    }

    return false;
  }

  function beginGeminiSegmentMoveDrag(event = null) {
    if (!event) return;
    const rowId = String(event?.target?.closest?.("[data-row-id]")?.dataset?.rowId || "").trim();
    if (!rowId) return;
    const session = getActiveSession();
    const cfg = getPodcastVideoConfig(session);
    let track = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
    if (!track.enabled || !track.segments.length) {
      const rebuilt = buildGeminiDialogueTimelineTrack(session);
      if (!rebuilt.enabled || !rebuilt.segments.length) return;
      upsertPodcastVideoConfig((base) => ({
        ...base,
        geminiDialogueTrack: rebuilt
      }));
      track = rebuilt;
    }
    const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
    podcastVideoState.timelineAudioSelection.uploadedKeys.clear();
    podcastVideoState.timelineAudioSelection.panelLoopKey = "";
    podcastVideoState.timelineAudioSelection.geminiRowIds.clear();
    podcastVideoState.timelineAudioSelection.geminiRowIds.add(rowId);
    const segmentsSnapshot = track.segments
      .filter((segment) => String(segment?.rowId || "").trim() === rowId)
      .map((segment) => {
        const segRowId = String(segment?.rowId || "").trim();
        const durationMs = Math.max(
          STUDIO_TIMELINE_MIN_CLIP_MS,
          Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - Number(segment?.startMs || 0)) || STUDIO_TIMELINE_MIN_CLIP_MS
        );
        const maxStartMs = Math.max(0, totalMs - durationMs);
        return {
          rowId: segRowId,
          audioSrc: String(segment?.audioSrc || "").trim(),
          startMs: Number(segment?.startMs || 0),
          durationMs,
          endMs: Number(segment?.endMs || 0),
          trimInMs: Number(segment?.trimInMs || 0),
          trimOutMs: Number(segment?.trimOutMs || 0),
          sceneIndex: Number(segment?.sceneIndex || 1),
          speakerName: String(segment?.speakerName || "").trim(),
          anchorStartMs: segment?.anchorStartMs,
          minStartMs: 0,
          maxStartMs
        };
      });
    if (!segmentsSnapshot.length) return;
    podcastVideoState.timelineDrag = {
      mode: "gemini-segment-move",
      startClientX: Number(event.clientX || 0),
      segmentsSnapshot
    };
    document.body.classList.add("podcast-timeline-dragging");
  }

  function beginUploadedAudioSegmentMoveDrag(event = null) {
    if (!event) return;
    const chip = event?.target?.closest?.(".podcast-audio-timeline-chip.has-audio[data-track-index][data-loop-index]");
    if (!chip) return;
    const trackIndex = Math.max(0, Math.floor(Number(chip.dataset.trackIndex || 0) || 0));
    const loopIndex = Math.max(0, Math.floor(Number(chip.dataset.loopIndex || 0) || 0));
    const selectionKey = `u:${trackIndex}:${loopIndex}`;
    const multi = event.metaKey || event.ctrlKey;
    podcastVideoState.timelineAudioSelection.geminiRowIds.clear();
    podcastVideoState.timelineAudioSelection.panelLoopKey = "";
    if (!multi) {
      podcastVideoState.timelineAudioSelection.uploadedKeys.clear();
      podcastVideoState.timelineAudioSelection.uploadedKeys.add(selectionKey);
    } else if (!podcastVideoState.timelineAudioSelection.uploadedKeys.has(selectionKey)) {
      podcastVideoState.timelineAudioSelection.uploadedKeys.clear();
      podcastVideoState.timelineAudioSelection.uploadedKeys.add(selectionKey);
    }
    const session = getActiveSession();
    const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
    const segments = buildUploadedPanelMusicSegments(session);
    const segmentByKey = new Map(segments.map((segment) => [
      `u:${Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0))}:${Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0))}`,
      segment
    ]));
    const selectedKeys = Array.from(podcastVideoState.timelineAudioSelection.uploadedKeys);
    const segmentsSnapshot = selectedKeys
      .map((key) => {
        const segment = segmentByKey.get(key) || null;
        if (!segment) return null;
        const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(segment?.endMs || 0) - Number(segment?.startMs || 0) || 0));
        return {
          selectionKey: key,
          trackIndex: Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0)),
          loopIndex: Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0)),
          startMs: Math.max(0, Math.round(Number(segment?.startMs || 0) || 0)),
          durationMs,
          maxStartMs: Math.max(0, totalMs - durationMs)
        };
      })
      .filter(Boolean);
    if (!segmentsSnapshot.length) return;
    podcastVideoState.timelineDrag = {
      mode: "uploaded-segment-move",
      startClientX: Number(event.clientX || 0),
      segmentsSnapshot
    };
    document.body.classList.add("podcast-timeline-dragging");
  }

  function beginGeminiTrackReorderDrag(event = null) {
    if (!event) return;
    const session = getActiveSession();
    const cfg = getPodcastVideoConfig(session);
    const trackRows = ensureTimelineTracks(session, { persist: false });
    const initialIndex = Math.max(0, Math.min(trackRows.length, Math.floor(Number(cfg?.geminiDialogueTrackIndex ?? 0) || 0)));
    podcastVideoState.timelineDrag = {
      mode: "gemini-track-reorder",
      startClientY: Number(event.clientY || 0),
      initialIndex
    };
    document.body.classList.add("podcast-timeline-dragging");
  }

  function resolveDragDropTarget(clientX = 0, clientY = 0) {
    if (!els.podcastVideoTimeline) return { trackId: "", dropIndex: null };
    const session = getActiveSession();
    const hit = document.elementFromPoint(clientX, clientY);
    const dropZone = hit?.closest?.(".podcast-video-track-drop-zone[data-drop-track-index]");
    if (dropZone) {
      const idx = Number(dropZone.dataset.dropTrackIndex);
      return {
        trackId: "",
        dropIndex: Number.isFinite(idx) ? Math.max(0, Math.round(idx)) : null
      };
    }
    const lane = hit?.closest?.(".podcast-video-track-lane[data-track-id]");
    if (lane) {
      const trackId = String(lane.dataset.trackId || "").trim();
      if (!isSceneTimelineTrackId(trackId, session)) {
        return { trackId: "", dropIndex: null };
      }
      return {
        trackId,
        dropIndex: null
      };
    }
    return { trackId: "", dropIndex: null };
  }

  function applyDragTargetUi(trackId = "", dropIndex = null) {
    if (!els.podcastVideoTimeline) return;
    const session = getActiveSession();
    const trackKey = String(trackId || "").trim();
    els.podcastVideoTimeline.querySelectorAll(".is-track-target").forEach((node) => node.classList.remove("is-track-target"));
    els.podcastVideoTimeline.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
    if (trackKey && isSceneTimelineTrackId(trackKey, session)) {
      const lane = Array.from(els.podcastVideoTimeline.querySelectorAll(".podcast-video-track-lane[data-track-id]"))
        .find((node) => String(node.dataset.trackId || "").trim() === trackKey);
      if (lane) lane.classList.add("is-track-target");
    }
    if (Number.isFinite(dropIndex)) {
      const zone = els.podcastVideoTimeline.querySelector(`.podcast-video-track-drop-zone[data-drop-track-index="${Math.max(0, Math.round(dropIndex))}"]`);
      if (zone) zone.classList.add("is-drop-target");
    }
  }

  function handlePointerMove(event) {
    if (!podcastVideoState.timelineDrag) return;
    lastTimelinePointerEvent = event;
    if (timelinePointerMoveRafId) return;

    timelinePointerMoveRafId = requestAnimationFrame(() => {
      timelinePointerMoveRafId = 0;
      const ev = lastTimelinePointerEvent;
      if (!ev || !podcastVideoState.timelineDrag) return;

      if (podcastVideoState.timelineDrag.mode === "playhead") {
        podcastVideoState.timelineDrag.lastClientX = Number(ev.clientX || 0);
        seekStudioTimelineByClientX(ev.clientX, {
          stopMontage: false,
          autoplay: false,
          lightweightPlayhead: true,
          deferPreview: true
        });
        return;
      }
      if (podcastVideoState.timelineDrag.mode === "resize-track-lane") {
        const drag = podcastVideoState.timelineDrag;
        const trackId = String(drag.trackId || "").trim();
        if (!trackId) return;
        const lane = els.podcastVideoTimeline?.querySelector(`.podcast-video-track-lane[data-track-id="${CSS.escape(trackId)}"]`);
        if (!lane) return;
        const delta = Number(ev.clientY || 0) - Number(drag.startClientY || 0);
        const nextHeight = Math.round(Math.max(56, Math.min(520, Number(drag.startHeightPx || 0) + delta)));
        drag.currentHeightPx = nextHeight;
        lane.style.height = `${nextHeight}px`;
        lane.style.minHeight = `${nextHeight}px`;
        drag.moved = true;
        return;
      }
      if (podcastVideoState.timelineDrag.mode === "gap-selection") {
        const lane = els.podcastVideoTimeline?.querySelector(`.podcast-video-track-lane[data-track-id="${CSS.escape(String(podcastVideoState.timelineDrag.trackId || ""))}"]`);
        if (!lane) return;
        podcastVideoState.timelineDrag.moved = true;
        updateTimelineGapSelection(getTrackLaneContentPx(lane, ev.clientX));
        return;
      }
      applyClipDrag(ev);
    });
  }

  function handlePointerUp() {
    if (!podcastVideoState.timelineDrag) return;
    const dragMode = String(podcastVideoState.timelineDrag.mode || "").trim();
    const dragKind = String(podcastVideoState.timelineDrag.kind || "").trim().toLowerCase();
    const isOnScreenTextDrag = dragKind === "on-screen-text";
    if (dragMode === "resize-track-lane") {
      const drag = podcastVideoState.timelineDrag;
      const trackId = String(drag.trackId || "").trim();
      const nextHeight = Math.round(Math.max(56, Math.min(520, Number(drag.currentHeightPx || drag.startHeightPx || 0))));
      if (trackId && nextHeight > 0) {
        upsertPodcastVideoConfig((cfg) => ({
          ...cfg,
          timelineTrackHeightsById: {
            ...(cfg.timelineTrackHeightsById || {}),
            [trackId]: nextHeight
          }
        }));
        scheduleSessionLocalPersist("timeline-track-height");
      }
      document.body.classList.remove("podcast-timeline-resizing-lane");
      clearPodcastTimelineDragUi();
      return;
    }
    if (podcastVideoState.timelineDrag.mode === "playhead") {
      podcastVideoState.timelineJustDraggedUntil = Date.now() + 240;
      podcastVideoState.playheadDragging = false;
      const finalClientX = Number(podcastVideoState.timelineDrag.lastClientX ?? podcastVideoState.timelineDrag.startClientX ?? 0);
      seekStudioTimelineByClientX(finalClientX, {
        stopMontage: true,
        autoplay: false,
        lightweightPlayhead: false,
        deferPreview: false
      });
      clearPodcastTimelineDragUi();
      syncPodcastTimelineSelectionUi(getActiveSession());
      syncPodcastTimelinePlayhead(getActiveSession());
      syncPodcastStudioInspector(getActiveSession());
      return;
    }
    if (podcastVideoState.timelineDrag.mode === "gap-selection") {
      podcastVideoState.timelineDrag = null;
      syncTimelineGapSelectionUi();
      return;
    }
    const moved = podcastVideoState.timelineDrag.moved === true;
    if (!moved) {
      clearPodcastTimelineDragUi();
      return;
    }
    if (isOnScreenTextDrag) {
      podcastVideoState.timelineJustDraggedUntil = Date.now() + 240;
      finalizeLinkedGeminiDrag({ dragMode, dragKind });
      clearPodcastTimelineDragUi();
      const session = getActiveSession();
      renderPodcastVideoTimeline(session, { reason: "text-drag-end" });
      syncPodcastStudioInspector(session);
      syncTimelineModeButtons(session);
      return;
    }
    if (dragMode === "trim-start" || dragMode === "trim-end") {
      syncGeminiDialogueTrackWithRuntime({
        render: false,
        preserveStartMs: true,
        isTrimStart: dragMode === "trim-start"
      });
      persistCompactedTimelineTrackFromRow(String(podcastVideoState.timelineDrag.rowId || "").trim(), {
        render: false,
        syncGemini: false,
        autosave: false
      });
    }
    podcastVideoState.timelineJustDraggedUntil = Date.now() + 240;
    finalizeClipDrag();
    if (dragMode === "move" || dragMode === "gemini-segment-move") {
      if (!finalizeLinkedGeminiDrag({ dragMode, dragKind })) {
        syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
      }
    }
    if (
      dragMode === "audio-trim-start"
      || dragMode === "audio-trim-end"
      || dragMode === "audio-fadein"
      || dragMode === "audio-fadeout"
      || dragMode === "audio-move"
    ) {
      flushSessionLocalPersistNow("", "background-music").catch(() => { });
    }
    clearPodcastTimelineDragUi();
    const session = getActiveSession();
    renderPodcastVideoTimeline(session, { reason: "drag-end" });
    syncPodcastStudioInspector(session);
    syncTimelineModeButtons(session);
    syncPodcastVideoSpeakerCardVisibility();
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    if (event.target.closest("[data-action='open-gemini-audio-speed-modal']")) {
      event.preventDefault();
      return;
    }
    const montageAudioChip = event.target.closest(".podcast-montage-audio-chip.is-stored[data-row-id]");
    if (montageAudioChip) {
      beginGeminiSegmentMoveDrag(event);
      event.preventDefault();
      return;
    }
    const geminiChip = event.target.closest(".podcast-gemini-audio-chip.has-audio[data-row-id]");
    if (geminiChip) {
      beginGeminiSegmentMoveDrag(event);
      event.preventDefault();
      return;
    }
    const dragAudioTrack = event.target.closest("[data-action='timeline-drag-audio-track']");
    if (dragAudioTrack && !event.target.closest(".podcast-audio-loop-mute-btn")) {
      beginAudioMoveDrag(event);
      event.preventDefault();
      return;
    }
    if (getTimelineViewMode(getActiveSession()) !== "tracks") return;
    const resizeHandle = event.target.closest("[data-action='timeline-resize-track-lane'][data-track-id]");
    if (resizeHandle) {
      const trackId = String(resizeHandle.dataset.trackId || "").trim();
      if (!trackId) return;
      if (event.detail >= 2) {
        const lane = els.podcastVideoTimeline?.querySelector(`.podcast-video-track-lane[data-track-id="${CSS.escape(trackId)}"]`);
        if (lane) {
          lane.style.height = "";
          lane.style.minHeight = "";
        }
        upsertPodcastVideoConfig((cfg) => {
          const heights = { ...(cfg.timelineTrackHeightsById || {}) };
          delete heights[trackId];
          return { ...cfg, timelineTrackHeightsById: heights };
        });
        scheduleSessionLocalPersist("timeline-track-height");
        event.preventDefault();
        return;
      }
      const lane = els.podcastVideoTimeline?.querySelector(`.podcast-video-track-lane[data-track-id="${CSS.escape(trackId)}"]`);
      if (!lane) return;
      const rect = lane.getBoundingClientRect();
      const startHeightPx = Math.round(Math.max(56, Math.min(520, Number(rect.height || 0) || 0)));
      podcastVideoState.timelineDrag = {
        mode: "resize-track-lane",
        trackId,
        startClientY: Number(event.clientY || 0),
        startHeightPx,
        currentHeightPx: startHeightPx,
        moved: false
      };
      document.body.classList.add("podcast-timeline-resizing-lane");
      event.preventDefault();
      return;
    }
    const playhead = event.target.closest("[data-action='timeline-drag-playhead']");
    if (playhead) {
      podcastVideoState.timelineDrag = {
        mode: "playhead",
        startClientX: Number(event.clientX || 0),
        lastClientX: Number(event.clientX || 0)
      };
      podcastVideoState.playheadDragging = true;
      seekStudioTimelineByClientX(event.clientX, { stopMontage: true, autoplay: false, lightweightPlayhead: true });
      event.preventDefault();
      return;
    }
    const dragGeminiTrackRow = event.target.closest("[data-action='timeline-drag-gemini-track-row']");
    if (dragGeminiTrackRow) {
      beginGeminiTrackReorderDrag(event);
      event.preventDefault();
      return;
    }
    const clipCard = event.target.closest(".podcast-video-timeline-clip[data-row-id]");
    if (clipCard && event.target.closest(".row-icon-btn")) {
      return;
    }
    const trimStartBtn = event.target.closest("[data-action='timeline-trim-start']");
    if (trimStartBtn) {
      const rowId = String(trimStartBtn.dataset.rowId || "").trim();
      if (!rowId) return;
      beginClipDrag("trim-start", rowId, event);
      event.preventDefault();
      return;
    }
    const textTrimStartBtn = event.target.closest("[data-action='timeline-text-trim-start'][data-row-id]");
    if (textTrimStartBtn) {
      const rowId = String(textTrimStartBtn.dataset.rowId || "").trim();
      if (!rowId) return;
      beginClipDrag("trim-start", rowId, event, { kind: "on-screen-text" });
      event.preventDefault();
      return;
    }
    const audioTrimStartBtn = event.target.closest("[data-action='timeline-audio-trim-start']");
    if (audioTrimStartBtn) {
      beginAudioTrimDrag("audio-trim-start", event);
      event.preventDefault();
      return;
    }
    const trimEndBtn = event.target.closest("[data-action='timeline-trim-end']");
    if (trimEndBtn) {
      const rowId = String(trimEndBtn.dataset.rowId || "").trim();
      if (!rowId) return;
      beginClipDrag("trim-end", rowId, event);
      event.preventDefault();
      return;
    }
    const textTrimEndBtn = event.target.closest("[data-action='timeline-text-trim-end'][data-row-id]");
    if (textTrimEndBtn) {
      const rowId = String(textTrimEndBtn.dataset.rowId || "").trim();
      if (!rowId) return;
      beginClipDrag("trim-end", rowId, event, { kind: "on-screen-text" });
      event.preventDefault();
      return;
    }
    const audioTrimEndBtn = event.target.closest("[data-action='timeline-audio-trim-end']");
    if (audioTrimEndBtn) {
      beginAudioTrimDrag("audio-trim-end", event);
      event.preventDefault();
      return;
    }
    const audioFadeoutHandle = event.target.closest("[data-action='timeline-audio-fadeout-handle']");
    if (audioFadeoutHandle) {
      beginAudioTrimDrag("audio-fadeout", event);
      event.preventDefault();
      return;
    }
    const audioFadeinHandle = event.target.closest("[data-action='timeline-audio-fadein-handle']");
    if (audioFadeinHandle) {
      beginAudioTrimDrag("audio-fadein", event);
      event.preventDefault();
      return;
    }
    const audioChip = event.target.closest(".podcast-audio-timeline-chip.has-audio:not(.podcast-gemini-audio-chip)");
    if (audioChip && !event.target.closest(".podcast-audio-loop-mute-btn")) {
      const trackKind = String(audioChip.dataset.trackKind || "").trim();
      if (trackKind === "uploaded" && audioChip.dataset.trackIndex != null) {
        beginUploadedAudioSegmentMoveDrag(event);
      } else {
        beginAudioMoveDrag(event);
      }
      event.preventDefault();
      return;
    }
    const dragClip = event.target.closest("[data-action='timeline-drag-clip'][data-row-id]");
    if (
      dragClip
      && !event.target.closest(".row-icon-btn")
      && !event.target.closest(".podcast-gemini-audio-chip")
      && !event.target.closest(".podcast-montage-audio-chip")
      && !event.target.closest(".podcast-audio-timeline-chip")
    ) {
      const rowId = String(dragClip.dataset.rowId || "").trim();
      if (!rowId) return;
      selectTimelineSceneRow(rowId, { syncStage: false });
      podcastVideoState.timelineLastInteractedRowId = rowId;
      beginClipDrag("move", rowId, event);
      event.preventDefault();
      return;
    }
    const dragTextClip = event.target.closest("[data-action='timeline-drag-onscreen-text-clip'][data-row-id]");
    if (dragTextClip && !event.target.closest(".row-icon-btn")) {
      const rowId = String(dragTextClip.dataset.rowId || "").trim();
      if (!rowId) return;
      selectTimelineSceneRow(rowId, { syncStage: false });
      podcastVideoState.timelineLastInteractedRowId = rowId;
      beginClipDrag("move", rowId, event, { kind: "on-screen-text" });
      event.preventDefault();
      return;
    }
    if (event.target.closest("[data-action='timeline-delete-selected-gap']")) {
      return;
    }
    const lane = event.target.closest(".podcast-video-track-lane[data-track-id]");
    if (
      lane
      && !event.target.closest(".podcast-audio-timeline-chip")
      && !event.target.closest(".podcast-montage-audio-chip")
      && !event.target.closest(".podcast-onscreen-text-clip-body")
    ) {
      const started = beginTimelineGapSelection(lane, event);
      if (started) {
        event.preventDefault();
      }
    }
  }

  function handleClick(event = null) {
    if (!event) return false;
    if (Date.now() < Number(podcastVideoState.timelineJustDraggedUntil || 0)) {
      return true;
    }
    const selectAllGeminiBtn = event.target?.closest?.("[data-action='timeline-select-all-gemini-audio']");
    if (selectAllGeminiBtn && (event.metaKey || event.ctrlKey)) {
      const session = getActiveSession();
      const cfg = getPodcastVideoConfig(session);
      const track = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
      const next = new Set(track.segments.map((segment) => String(segment?.rowId || "").trim()).filter(Boolean));
      const current = podcastVideoState.timelineAudioSelection.geminiRowIds;
      const allSelected = next.size > 0 && Array.from(next).every((rowId) => current.has(rowId));
      current.clear();
      if (!allSelected) {
        next.forEach((rowId) => current.add(rowId));
      }
      renderPodcastVideoTimeline(session);
      return true;
    }

    const geminiChip = event.target?.closest?.("[data-action='timeline-select-gemini-audio'][data-row-id]");
    if (geminiChip) {
      const rowId = String(geminiChip.dataset.rowId || "").trim();
      if (!rowId) return true;
      podcastVideoState.timelineAudioSelection.uploadedKeys.clear();
      podcastVideoState.timelineAudioSelection.panelLoopKey = "";
      const multi = event.metaKey || event.ctrlKey;
      if (multi) {
        if (podcastVideoState.timelineAudioSelection.geminiRowIds.has(rowId)) {
          podcastVideoState.timelineAudioSelection.geminiRowIds.delete(rowId);
        } else {
          podcastVideoState.timelineAudioSelection.geminiRowIds.add(rowId);
        }
      } else {
        podcastVideoState.timelineAudioSelection.geminiRowIds.clear();
        podcastVideoState.timelineAudioSelection.geminiRowIds.add(rowId);
      }
      renderPodcastVideoTimeline(getActiveSession());
      return true;
    }

    const openGeminiAudioSpeedBtn = event.target?.closest?.("[data-action='open-gemini-audio-speed-modal'][data-row-id]");
    if (openGeminiAudioSpeedBtn) {
      event.preventDefault();
      event.stopPropagation();
      const rowId = String(openGeminiAudioSpeedBtn.dataset.rowId || "").trim();
      if (!rowId) return true;
      setGeminiAudioSpeedModalOpen(rowId);
      return true;
    }

    const montageAudioChip = event.target?.closest?.(".podcast-montage-audio-chip[data-row-id]");
    if (montageAudioChip) {
      event.preventDefault();
      const rowId = String(montageAudioChip.dataset.rowId || "").trim();
      if (!rowId) return true;
      podcastVideoState.timelineAudioSelection.uploadedKeys.clear();
      podcastVideoState.timelineAudioSelection.panelLoopKey = "";
      const multi = event.metaKey || event.ctrlKey;
      if (multi) {
        if (podcastVideoState.timelineAudioSelection.geminiRowIds.has(rowId)) {
          podcastVideoState.timelineAudioSelection.geminiRowIds.delete(rowId);
        } else {
          podcastVideoState.timelineAudioSelection.geminiRowIds.add(rowId);
        }
      } else {
        podcastVideoState.timelineAudioSelection.geminiRowIds.clear();
        podcastVideoState.timelineAudioSelection.geminiRowIds.add(rowId);
      }
      selectTimelineSceneRow(rowId, { syncStage: true });
      renderPodcastVideoTimeline(getActiveSession());
      return true;
    }

    return false;
  }

  function applyClipDrag(event = null) {
    const drag = podcastVideoState.timelineDrag;
    if (!drag || !event) return;
    if (String(drag.kind || "").trim().toLowerCase() === "on-screen-text") {
      const deltaPx = Number(event.clientX || 0) - Number(drag.startClientX || 0);
      if (Math.abs(deltaPx) > 2) {
        drag.moved = true;
      }
      const deltaMsRaw = timelinePxToMs(deltaPx);
      const dragStepMs = resolveTimelineDragStepMs(event);
      const session = getActiveSession();
      const clipStore = getTimelineClipStoreByKind(session, "on-screen-text", { persist: false });
      const current = clipStore[drag.rowId];
      if (!current) return;
      const rows = getSessionRows(session);
      const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
      const minTrimLen = STUDIO_TIMELINE_MIN_CLIP_MS;
      const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
      if (drag.mode === "move") {
        const sameLane = Object.values(clipStore)
          .filter((item) => String(item?.rowId || "").trim())
          .sort((a, b) => (
            Number(a.startMs || 0) - Number(b.startMs || 0)
            || Number(rowIndexById.get(String(a.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b.rowId || "").trim()) || 0)
          ));
        const idx = sameLane.findIndex((item) => String(item?.rowId || "").trim() === String(drag.rowId || "").trim());
        const prev = idx > 0 ? sameLane[idx - 1] : null;
        const minStartMs = prev ? Math.max(0, Number(prev.startMs || 0) + getOnScreenTextClipEffectiveDurationMs(prev)) : 0;
        const currentDurationMs = getOnScreenTextClipEffectiveDurationMs(current);
        const nextStart = Math.max(
          minStartMs,
          Math.min(
            Math.max(minStartMs, totalMs - currentDurationMs),
            snapTimelineMsWithStep(Number(drag.initialStartMs || 0) + deltaMsRaw, dragStepMs)
          )
        );
        const updatedCurrent = normalizeOnScreenTextClipItem({
          ...current,
          startMs: nextStart
        }, drag.rowId);
        if (!updatedCurrent) return;
        const updatedCurrentEndMs = Math.max(0, Number(updatedCurrent.startMs || 0) + getOnScreenTextClipEffectiveDurationMs(updatedCurrent));
        const nextClips = {
          ...(getPodcastVideoConfig(session)?.timelineOnScreenTextClipsByRowId || {}),
          [drag.rowId]: updatedCurrent
        };
        let pushCursorMs = updatedCurrentEndMs;
        sameLane
          .slice(idx + 1)
          .forEach((item) => {
            const itemRowId = String(item?.rowId || "").trim();
            if (!itemRowId) return;
            const shiftedStartMs = Math.max(Number(item.startMs || 0), snapTimelineMsWithStep(pushCursorMs, dragStepMs));
            const shifted = normalizeOnScreenTextClipItem({
              ...item,
              startMs: shiftedStartMs
            }, itemRowId);
            if (!shifted) return;
            nextClips[itemRowId] = shifted;
            pushCursorMs = Math.max(pushCursorMs, Number(shifted.startMs || 0) + getOnScreenTextClipEffectiveDurationMs(shifted));
          });
        upsertPodcastVideoConfig((cfg) => ({
          ...cfg,
          ...buildManualOnScreenTextTrackConfig(cfg, {
            ...(nextClips[drag.rowId] || updatedCurrent),
            hidden: false,
            autoHidden: false
          }, drag.rowId),
          timelineOnScreenTextClipsByRowId: nextClips
        }), { autosave: false, persist: false, recordHistory: false });
        renderPodcastVideoTimeline(getActiveSession(), { lightweight: true });
        syncOnScreenTextTrackToggleBtn(getActiveSession());
        //       syncPodcastStudioInspector(getActiveSession());
        syncPodcastOnScreenTextOverlay(session, {
          rowId: drag.rowId,
          currentMs: Number(podcastVideoState.montageCursorMs || 0),
          forceRow: true
        });
        return;
      }
      if (drag.mode === "trim-start") {
        const sameLane = Object.values(clipStore)
          .filter((item) => String(item?.rowId || "").trim())
          .sort((a, b) => (
            Number(a.startMs || 0) - Number(b.startMs || 0)
            || Number(rowIndexById.get(String(a.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b.rowId || "").trim()) || 0)
          ));
        const idx = sameLane.findIndex((item) => String(item?.rowId || "").trim() === String(drag.rowId || "").trim());
        const prev = idx > 0 ? sameLane[idx - 1] : null;
        const minStartMs = prev ? Math.max(0, Number(prev.startMs || 0) + getOnScreenTextClipEffectiveDurationMs(prev)) : 0;
  
        const initialStartMs = Math.max(0, Number(drag.initialStartMs || 0));
        const initialTrimInMs = Math.max(0, Number(drag.initialTrimInMs || 0));
        const maxTrimIn = Math.max(0, Number(current.trimOutMs || 0) - minTrimLen);
  
        // Calculate projected trim and start based on TOTAL delta
        const nextTrimInRaw = Math.max(0, Math.min(maxTrimIn, snapTimelineMsWithStep(initialTrimInMs + deltaMsRaw, dragStepMs)));
        const trimDeltaMs = nextTrimInRaw - initialTrimInMs;
  
        const nextStartMs = Math.max(minStartMs, snapTimelineMsWithStep(initialStartMs + trimDeltaMs, dragStepMs));
        const actualTrimIn = Math.max(0, Math.min(maxTrimIn, initialTrimInMs + (nextStartMs - initialStartMs)));
  
        // Ripple: calculate how much the END of this clip moved.
        // oldEnd = initialStart + (trimOut - initialTrimIn)
        // newEnd = nextStart + (trimOut - actualTrimIn)
        // rippleDelta = newEnd - oldEnd
        const oldEndMs = initialStartMs + (Math.max(0, Number(current.trimOutMs || 0)) - initialTrimInMs);
        const newEndMs = nextStartMs + (Math.max(0, Number(current.trimOutMs || 0)) - actualTrimIn);
        const rippleDeltaMs = newEndMs - oldEndMs;
  
        const nextClips = {
          ...(getPodcastVideoConfig(session)?.timelineOnScreenTextClipsByRowId || {}),
          [drag.rowId]: normalizeOnScreenTextClipItem({
            ...current,
            startMs: nextStartMs,
            trimInMs: actualTrimIn
          }, drag.rowId)
        };
  
        if (rippleDeltaMs !== 0) {
          sameLane.slice(idx + 1).forEach((item) => {
            const itemRowId = String(item?.rowId || "").trim();
            if (!itemRowId) return;
            nextClips[itemRowId] = normalizeOnScreenTextClipItem({
              ...item,
              startMs: Math.max(0, snapTimelineMsWithStep(Number(item.startMs || 0) + rippleDeltaMs, dragStepMs))
            }, itemRowId);
          });
        }
  
        upsertPodcastVideoConfig((cfg) => ({
          ...cfg,
          ...buildManualOnScreenTextTrackConfig(cfg, {
            ...(nextClips[drag.rowId] || current),
            hidden: false,
            autoHidden: false
          }, drag.rowId),
          timelineOnScreenTextClipsByRowId: nextClips
        }), { autosave: false, persist: false, recordHistory: false });
        renderPodcastVideoTimeline(getActiveSession(), { lightweight: true });
        syncOnScreenTextTrackToggleBtn(getActiveSession());
        syncTimelineClipDurationModalInputs();
        //       syncPodcastStudioInspector(getActiveSession());
        syncPodcastOnScreenTextOverlay(session, {
          rowId: drag.rowId,
          currentMs: Number(podcastVideoState.montageCursorMs || 0),
          forceRow: true
        });
        return;
      }
      if (drag.mode === "trim-end") {
        const sameLane = Object.values(clipStore)
          .filter((item) => String(item?.rowId || "").trim())
          .sort((a, b) => (
            Number(a.startMs || 0) - Number(b.startMs || 0)
            || Number(rowIndexById.get(String(a.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b.rowId || "").trim()) || 0)
          ));
        const idx = sameLane.findIndex((item) => String(item?.rowId || "").trim() === String(drag.rowId || "").trim());
        const currentEndMs = Math.max(0, Number(current.startMs || 0) + getOnScreenTextClipEffectiveDurationMs(current));
        const sourceDurationMs = Math.max(minTrimLen, Number(drag.sourceDurationMs || current.sourceDurationMs || 0));
        const minTrimOut = Math.max(minTrimLen, Number(current.trimInMs || 0) + minTrimLen);
        const nextTrimOut = Math.max(minTrimOut, Math.min(sourceDurationMs, snapTimelineMsWithStep(Number(drag.initialTrimOutMs || 0) + deltaMsRaw, dragStepMs)));
        const rippleDeltaMs = nextTrimOut - Number(drag.initialTrimOutMs || 0);
        const nextClips = { ...clipStore };
        const updatedCurrent = normalizeOnScreenTextClipItem({
          ...current,
          sourceDurationMs: sourceDurationMs,
          trimOutMs: nextTrimOut
        }, drag.rowId);
        if (!updatedCurrent) return;
        nextClips[drag.rowId] = updatedCurrent;
        if (rippleDeltaMs !== 0) {
          sameLane
            .filter((item) => String(item?.rowId || "").trim() !== String(drag.rowId || "").trim() && Number(item.startMs || 0) >= currentEndMs - 1)
            .forEach((item) => {
              const itemRowId = String(item?.rowId || "").trim();
              if (!itemRowId) return;
              nextClips[itemRowId] = normalizeOnScreenTextClipItem({
                ...item,
                startMs: Math.max(0, snapTimelineMsWithStep(Number(item.startMs || 0) + rippleDeltaMs, dragStepMs))
              }, itemRowId);
            });
        }
        upsertPodcastVideoConfig((cfg) => ({
          ...cfg,
          ...buildManualOnScreenTextTrackConfig(cfg, {
            ...(nextClips[drag.rowId] || updatedCurrent),
            hidden: false,
            autoHidden: false
          }, drag.rowId),
          timelineOnScreenTextClipsByRowId: nextClips
        }), { autosave: false, persist: false, recordHistory: false });
        renderPodcastVideoTimeline(getActiveSession(), { lightweight: true });
        syncOnScreenTextTrackToggleBtn(getActiveSession());
        syncTimelineClipDurationModalInputs();
        //       syncPodcastStudioInspector(getActiveSession());
        syncPodcastOnScreenTextOverlay(session, {
          rowId: drag.rowId,
          currentMs: Number(podcastVideoState.montageCursorMs || 0),
          forceRow: true
        });
        return;
      }
    }
    if (drag.mode === "gemini-track-reorder") {
      const clientX = Number(event.clientX || 0);
      const clientY = Number(event.clientY || 0);
      const deltaY = clientY - Number(drag.startClientY || 0);
      if (Math.abs(deltaY) > 2) {
        drag.moved = true;
      }
      const hit = document.elementFromPoint(clientX, clientY);
      const hitRow = hit?.closest?.(".podcast-video-track-row[data-track-index]");
      const session = getActiveSession();
      const tracks = ensureTimelineTracks(session, { persist: false });
      let dropIndex = null;
      if (hitRow && !hitRow.classList.contains("podcast-gemini-dialogue-track-row")) {
        const idx = Number(hitRow.dataset.trackIndex);
        const rect = hitRow.getBoundingClientRect();
        if (Number.isFinite(idx) && idx >= 0 && rect && rect.height > 0) {
          dropIndex = clientY < rect.top + rect.height / 2 ? idx : idx + 1;
        }
      }
      drag.targetIndex = Number.isFinite(dropIndex) ? Math.max(0, Math.min(tracks.length, Math.round(dropIndex))) : null;
      applyDragTargetUi("", Number.isFinite(drag.targetIndex) ? drag.targetIndex : null);
      return;
    }
    if (drag.mode === "move") {
      const target = resolveDragDropTarget(Number(event.clientX || 0), Number(event.clientY || 0));
      drag.targetTrackId = String(target.trackId || "").trim();
      drag.targetDropIndex = Number.isFinite(target.dropIndex) ? target.dropIndex : null;
      applyDragTargetUi(drag.targetTrackId, drag.targetDropIndex);
    }
    const deltaPx = Number(event.clientX || 0) - Number(drag.startClientX || 0);
    if (Math.abs(deltaPx) > 2) {
      drag.moved = true;
    }
    const deltaMsRaw = timelinePxToMs(deltaPx);
    const dragStepMs = resolveTimelineDragStepMs(event);
    const deltaMs = snapTimelineMsWithStep(deltaMsRaw, dragStepMs);
    const minTrimLen = STUDIO_TIMELINE_MIN_CLIP_MS;
    if (drag.mode === "audio-trim-start" || drag.mode === "audio-trim-end" || drag.mode === "audio-fadein" || drag.mode === "audio-fadeout") {
      const trackKind = resolvePanelMusicTrackKind(drag.selectedTrackKind || panelMusicState.selectedTrackKind);
      const sourceDurationMs = Math.max(minTrimLen, Number(drag.sourceDurationMs || minTrimLen));
      const maxTrimIn = Math.max(0, sourceDurationMs - minTrimLen);
      const loopIndex = Math.max(0, Math.floor(Number(drag.loopIndex || 0) || 0));
      if (drag.mode === "audio-trim-start") {
        const initialStartOffsetMs = Math.max(0, Number(drag.initialStartOffsetMs || 0) || 0);
        const nextTrimIn = Math.max(0, Math.min(maxTrimIn, snapTimelineMsWithStep(Number(drag.initialTrimInMs || 0) + deltaMsRaw, dragStepMs)));
        const trimDeltaMs = nextTrimIn - Number(drag.initialTrimInMs || 0);
        const nextStartOffsetMs = Math.max(0, snapTimelineMsWithStep(initialStartOffsetMs + trimDeltaMs, dragStepMs));
        const actualTrimIn = Math.max(0, Math.min(maxTrimIn, Number(drag.initialTrimInMs || 0) + (nextStartOffsetMs - initialStartOffsetMs)));
  
        updatePanelMusicTrack(trackKind, (track) => ({
          ...track,
          startOffsetMs: nextStartOffsetMs,
          loopSettings: upsertPanelMusicLoopSetting(track.loopSettings || [], loopIndex, {
            trimInMs: actualTrimIn,
            trimOutMs: Math.max(actualTrimIn + minTrimLen, Number(drag.initialTrimOutMs || sourceDurationMs) || sourceDurationMs),
            fadeInMs: Math.max(0, Math.min(
              Math.max(actualTrimIn + minTrimLen, Number(drag.initialTrimOutMs || sourceDurationMs) || sourceDurationMs) - actualTrimIn,
              Number(drag.initialFadeInMs || 0) || 0
            )),
            fadeOutMs: Math.max(0, Math.min(
              Math.max(actualTrimIn + minTrimLen, Number(drag.initialTrimOutMs || sourceDurationMs) || sourceDurationMs) - actualTrimIn,
              Number(drag.initialFadeOutMs || 0) || 0
            ))
          })
        }));
        return;
      }
      if (drag.mode === "audio-fadein") {
        const visibleDurationMs = Math.max(minTrimLen, Number(drag.initialTrimOutMs || sourceDurationMs) - Math.max(0, Number(drag.initialTrimInMs || 0) || 0));
        const nextFadeInMs = Math.max(
          0,
          Math.min(
            visibleDurationMs,
            snapTimelineMsWithStep(Number(drag.initialFadeInMs || 0) + deltaMsRaw, dragStepMs)
          )
        );
        updatePanelMusicTrack(trackKind, (track) => ({
          ...track,
          loopSettings: upsertPanelMusicLoopSetting(track.loopSettings || [], loopIndex, {
            trimInMs: Math.max(0, Number(drag.initialTrimInMs || 0) || 0),
            trimOutMs: Math.max(0, Number(drag.initialTrimOutMs || sourceDurationMs) || sourceDurationMs),
            fadeInMs: nextFadeInMs,
            fadeOutMs: Math.max(0, Math.min(
              visibleDurationMs,
              Number(drag.initialFadeOutMs || 0) || 0
            ))
          })
        }));
        return;
      }
      if (drag.mode === "audio-fadeout") {
        const visibleDurationMs = Math.max(minTrimLen, Number(drag.initialTrimOutMs || sourceDurationMs) - Math.max(0, Number(drag.initialTrimInMs || 0) || 0));
        const nextFadeOutMs = Math.max(
          0,
          Math.min(
            visibleDurationMs,
            snapTimelineMsWithStep(Number(drag.initialFadeOutMs || 0) - deltaMsRaw, dragStepMs)
          )
        );
        updatePanelMusicTrack(trackKind, (track) => ({
          ...track,
          loopSettings: upsertPanelMusicLoopSetting(track.loopSettings || [], loopIndex, {
            trimInMs: Math.max(0, Number(drag.initialTrimInMs || 0) || 0),
            trimOutMs: Math.max(0, Number(drag.initialTrimOutMs || sourceDurationMs) || sourceDurationMs),
            fadeInMs: Math.max(0, Math.min(
              visibleDurationMs,
              Number(drag.initialFadeInMs || 0) || 0
            )),
            fadeOutMs: nextFadeOutMs
          })
        }));
        return;
      }
      const minTrimOut = Math.max(minTrimLen, Number(drag.initialTrimInMs || 0) + minTrimLen);
      const nextTrimOut = Math.max(minTrimOut, Math.min(sourceDurationMs, snapTimelineMsWithStep(Number(drag.initialTrimOutMs || sourceDurationMs) + deltaMsRaw, dragStepMs)));
      updatePanelMusicTrack(trackKind, (track) => ({
        ...track,
        loopSettings: upsertPanelMusicLoopSetting(track.loopSettings || [], loopIndex, {
          trimInMs: Math.max(0, Number(drag.initialTrimInMs || 0) || 0),
          trimOutMs: nextTrimOut,
          fadeInMs: Math.max(0, Math.min(
            nextTrimOut - Math.max(0, Number(drag.initialTrimInMs || 0) || 0),
            Number(drag.initialFadeInMs || 0) || 0
          )),
          fadeOutMs: Math.max(0, Math.min(
            nextTrimOut - Math.max(0, Number(drag.initialTrimInMs || 0) || 0),
            Number(drag.initialFadeOutMs || 0) || 0
          ))
        })
      }));
      return;
    }
    if (drag.mode === "audio-move") {
      const trackKind = resolvePanelMusicTrackKind(drag.selectedTrackKind || panelMusicState.selectedTrackKind);
      const session = getActiveSession();
      const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
      const track = getPanelMusicTrackAvailability(trackKind) || normalizePanelMusicTrack(panelMusicState.track);
      const durationSec = getPanelMusicTrackDurationSec(track);
      const trimInMs = Math.max(0, Number(track?.trimInMs || 0) || 0);
      const trimOutMs = Math.max(trimInMs + minTrimLen, Number(track?.trimOutMs || Math.round(durationSec * 1000) || minTrimLen) || minTrimLen);
      const effectiveLoopMs = Math.max(minTrimLen, trimOutMs - trimInMs);
      const maxStartOffsetMs = Math.max(0, totalMs - effectiveLoopMs);
      const nextStartOffsetMs = Math.max(
        0,
        Math.min(maxStartOffsetMs, snapTimelineMsWithStep(Number(drag.initialStartOffsetMs || 0) + deltaMsRaw, dragStepMs))
      );
      updatePanelMusicTrack(trackKind, (currentTrack) => ({
        ...currentTrack,
        startOffsetMs: nextStartOffsetMs
      }));
      return;
    }
    if (drag.mode === "gemini-segment-move") {
      const session = getActiveSession();
      const cfg = getPodcastVideoConfig(session);
      const baseTrack = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
      const snapshot = Array.isArray(drag.segmentsSnapshot) ? drag.segmentsSnapshot : [];
      if (!baseTrack.enabled || !snapshot.length) return;
      let targetDelta = deltaMs;
      const minProjected = snapshot.reduce((acc, segment) => Math.min(acc, Number(segment.startMs || 0) + targetDelta), Number.POSITIVE_INFINITY);
      if (minProjected < 0) {
        targetDelta = targetDelta - minProjected;
      }
      const patchByRowId = new Map(snapshot.map((segment) => {
        const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(segment.durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS);
        const minStartMs = Math.max(0, Math.round(Number(segment.minStartMs ?? 0) || 0));
        const maxStartMsRaw = Number(segment.maxStartMs ?? Number.POSITIVE_INFINITY);
        const maxStartMs = Number.isFinite(maxStartMsRaw) ? Math.max(minStartMs, Math.round(maxStartMsRaw)) : Number.POSITIVE_INFINITY;
        const unclampedStartMs = snapTimelineMsWithStep(Number(segment.startMs || 0) + targetDelta, dragStepMs);
        const startMs = Math.max(minStartMs, Math.min(maxStartMs, Math.max(0, unclampedStartMs)));
        const trimInMs = Math.max(0, Number(segment.trimInMs || 0) || 0);
        const anchorStartMs = Number.isFinite(Number(segment.anchorStartMs))
          ? Math.max(0, Math.round(Number(segment.anchorStartMs)))
          : Math.max(0, Math.round(Number(segment.minStartMs || 0) || 0));
        return [String(segment.rowId || "").trim(), {
          startMs,
          endMs: startMs + durationMs,
          durationMs,
          trimOutMs: trimInMs + durationMs,
          anchorStartMs
        }];
      }));
      const nextSegments = baseTrack.segments.map((segment) => {
        const key = String(segment?.rowId || "").trim();
        const patch = patchByRowId.get(key);
        if (!patch) return segment;
        return {
          ...segment,
          startMs: patch.startMs,
          endMs: patch.endMs,
          durationMs: patch.durationMs,
          trimOutMs: Number.isFinite(Number(patch.trimOutMs)) ? patch.trimOutMs : segment.trimOutMs,
          anchorStartMs: patch.anchorStartMs
        };
      });
      upsertPodcastVideoConfig((nextCfg) => ({
        ...nextCfg,
        geminiDialogueTrack: normalizeGeminiDialogueTrack({
          ...(nextCfg.geminiDialogueTrack || {}),
          enabled: true,
          segments: nextSegments
        })
      }), { autosave: false, persist: false, recordHistory: false });
      syncOnScreenTextClipsWithGeminiTrack({ render: false, autosave: false });
      syncTimelineGeminiSegmentDragPreview(getActiveSession());
      return;
    }
    if (drag.mode === "uploaded-segment-move") {
      const session = getActiveSession();
      const snapshot = Array.isArray(drag.segmentsSnapshot) ? drag.segmentsSnapshot : [];
      if (!snapshot.length) return;
      const selectedByTrack = new Map();
      snapshot.forEach((seg) => {
        const trackIndex = Math.max(0, Math.floor(Number(seg.trackIndex || 0) || 0));
        if (!selectedByTrack.has(trackIndex)) selectedByTrack.set(trackIndex, []);
        selectedByTrack.get(trackIndex).push(seg);
      });
      const tracks = getPanelMusicUploadedTracks();
      const selectedSlotLabel = String(panelMusicState.track?.slotLabel || "").trim();
      const selectedIndex = tracks.findIndex((track) => String(track?.slotLabel || "").trim() === selectedSlotLabel);
      const nextTracks = [...tracks];
      snapshot.forEach((seg) => {
        const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(seg.durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS);
        const startMs = Math.max(0, Math.min(Number(seg.maxStartMs || 0), snapTimelineMsWithStep(Number(seg.startMs || 0) + deltaMs, dragStepMs)));
        const trackIndex = Math.max(0, Math.floor(Number(seg.trackIndex || 0) || 0));
        const loopIndex = Math.max(0, Math.floor(Number(seg.loopIndex || 0) || 0));
        const track = nextTracks[trackIndex] || null;
        if (!track) return;
        const overrides = Array.isArray(track.segmentStartOverrides) ? track.segmentStartOverrides : [];
        const filtered = overrides.filter((item) => Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)) !== loopIndex);
        filtered.push({ loopIndex, startMs: Math.max(0, Math.round(startMs)) });
        nextTracks[trackIndex] = {
          ...track,
          segmentStartOverrides: filtered.sort((a, b) => Number(a.loopIndex || 0) - Number(b.loopIndex || 0))
        };
      });
      setPanelMusicUploadedTracks(nextTracks, selectedIndex >= 0 ? { selectIndex: selectedIndex } : {});
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      renderPodcastVideoTimeline(session, { lightweight: true });
      syncPodcastStudioInspector(session);
      return;
    }
    if (drag.mode === "move") {
      const session = getActiveSession();
      const isText = drag.kind === "on-screen-text";
      const clips = isText ? ensureOnScreenTextClipsByRowId(session, { persist: false }) : ensureTimelineClipsByRowId(session, { persist: false });
      const rows = session?.script?.rows || [];
      const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
      const group = Array.isArray(drag.dragGroup) && drag.dragGroup.length
        ? drag.dragGroup
        : [{ rowId: drag.rowId, initialStartMs: Number(drag.initialStartMs || 0) }];
      let targetDelta = deltaMs;
      const minProjected = group.reduce((acc, item) => {
        const projected = Number(item.initialStartMs || 0) + targetDelta;
        return Math.min(acc, projected);
      }, Number.POSITIVE_INFINITY);
      if (minProjected < 0) {
        targetDelta = targetDelta - minProjected;
      }
      const nextClips = { ...clips };
      const destinationTrackId = String(drag.targetTrackId || "").trim();
      const shouldMoveTrack = Boolean(
        destinationTrackId
        && isSceneTimelineTrackId(destinationTrackId, session)
        && destinationTrackId !== String(drag.sourceTrackId || "").trim()
        && !Number.isFinite(drag.targetDropIndex)
      );
      group.forEach((item, idx) => {
        const key = String(item.rowId || "").trim();
        const current = clips[key];
        if (!current) return;
        const nextStart = Math.max(0, snapTimelineMsWithStep(Number(item.initialStartMs || 0) + targetDelta, dragStepMs));
        const normalized = normalizeTimelineClipItem({
          ...current,
          startMs: nextStart,
          trackId: shouldMoveTrack ? destinationTrackId : String(current.trackId || "").trim(),
          zIndex: idx === 0 ? Math.max(Number(current.zIndex || 1), Date.now() % 100000) : Number(current.zIndex || 1)
        }, key);
        if (!normalized) return;
        nextClips[key] = normalized;
      });
  
      upsertPodcastVideoConfig((cfg) => {
        const baseTrack = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
        let nextGeminiTrack = baseTrack;
        if (baseTrack.enabled) {
          const audioNextSegments = baseTrack.segments.map((segment) => {
            const key = String(segment?.rowId || "").trim();
            const target = group.find((item) => String(item.rowId || "").trim() === key);
            if (!target) return segment;
            const nextStart = Math.max(0, snapTimelineMsWithStep(Number(target.initialStartMs || 0) + targetDelta, dragStepMs));
            const delta = nextStart - Number(target.initialStartMs || 0);
            return {
              ...segment,
              startMs: Math.max(0, Number(segment.startMs || 0) + delta),
              endMs: Math.max(0, Number(segment.endMs || 0) + delta)
            };
          });
          nextGeminiTrack = { ...baseTrack, segments: audioNextSegments };
        }
  
        return {
          ...cfg,
          timelineVersion: STUDIO_TIMELINE_VERSION,
          [isText ? "timelineOnScreenTextClipsByRowId" : "timelineClipsByRowId"]: nextClips,
          geminiDialogueTrack: nextGeminiTrack
        };
      }, { autosave: false, persist: false, recordHistory: false });
      podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
      renderPodcastVideoTimeline(getActiveSession(), { lightweight: true });
      return;
    }
    if (drag.mode === "trim-start") {
      const session = getActiveSession();
      const rows = session?.script?.rows || [];
      const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
      upsertPodcastVideoConfig((cfg) => {
        const clips = normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {});
        const current = clips[drag.rowId];
        if (!current) return cfg;
        const trackId = String(current.trackId || "").trim();
        const sameTrack = Object.values(clips)
          .filter((item) => String(item?.trackId || "").trim() === trackId)
          .sort((a, b) => (
            Number(a.startMs || 0) - Number(b.startMs || 0)
            || Number(rowIndexById.get(String(a.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b.rowId || "").trim()) || 0)
          ));
        const idx = sameTrack.findIndex((item) => String(item?.rowId || "").trim() === String(drag.rowId || "").trim());
        const prev = idx > 0 ? sameTrack[idx - 1] : null;
        const minStartMs = prev ? getTimelineClipEndMs(prev) : 0;
  
        const initialStartMs = Math.max(0, Number(drag.initialStartMs || 0));
        const initialTrimInMs = Math.max(0, Number(drag.initialTrimInMs || 0));
        const maxTrimIn = Math.max(0, Number(current.trimOutMs || 0) - minTrimLen);
  
        const nextTrimInRaw = Math.max(0, Math.min(maxTrimIn, snapTimelineMsWithStep(initialTrimInMs + deltaMsRaw, dragStepMs)));
        const trimDeltaMs = nextTrimInRaw - initialTrimInMs;
  
        const nextStartMs = Math.max(minStartMs, snapTimelineMsWithStep(initialStartMs + trimDeltaMs, dragStepMs));
        const actualTrimIn = Math.max(0, Math.min(maxTrimIn, initialTrimInMs + (nextStartMs - initialStartMs)));
  
        const updated = normalizeTimelineClipItem({
          ...current,
          startMs: nextStartMs,
          trimInMs: actualTrimIn
        }, drag.rowId);
  
        if (!updated) return cfg;
        const existingTextClipMap = normalizeOnScreenTextClipsByRowId(cfg?.timelineOnScreenTextClipsByRowId || {});
        const currentTextClip = existingTextClipMap[drag.rowId] || null;
        const constrainedTextClip = constrainOnScreenTextClipToScene(currentTextClip, updated, drag.rowId);
        return {
          ...cfg,
          timelineVersion: STUDIO_TIMELINE_VERSION,
          timelineClipsByRowId: {
            ...clips,
            [drag.rowId]: updated
          },
          ...(constrainedTextClip
            ? buildManualOnScreenTextTrackConfig(cfg, {
              ...constrainedTextClip,
              hidden: false,
              autoHidden: false
            }, drag.rowId)
            : {
              timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
              timelineOnScreenTextDefaultsVersion: STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION,
              onScreenTextTrack: {
                ...normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {}),
                enabled: true,
                showTrack: true
              },
              timelineOnScreenTextClipsByRowId: (cfg.timelineOnScreenTextClipsByRowId || {})
            })
        };
      }, { autosave: false, persist: false, recordHistory: false });
      podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
      renderPodcastVideoTimeline(getActiveSession(), { lightweight: true });
      syncOnScreenTextTrackToggleBtn(getActiveSession());
      syncTimelineClipDurationModalInputs();
      //     syncPodcastStudioInspector(getActiveSession());
      return;
    }
    if (drag.mode === "trim-end") {
      const session = getActiveSession();
      const rows = session?.script?.rows || [];
      const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
      upsertPodcastVideoConfig((cfg) => {
        const clips = normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {});
        const current = clips[drag.rowId];
        if (!current) return cfg;
        const trackId = String(current.trackId || "").trim();
        const sameTrack = Object.values(clips)
          .filter((item) => String(item?.trackId || "").trim() === trackId)
          .sort((a, b) => (
            Number(a.startMs || 0) - Number(b.startMs || 0)
            || Number(rowIndexById.get(String(a.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b.rowId || "").trim()) || 0)
          ));
        const idx = sameTrack.findIndex((item) => String(item?.rowId || "").trim() === String(drag.rowId || "").trim());
        const sourceDurationMs = Math.max(minTrimLen, Number(drag.sourceDurationMs || current.sourceDurationMs || 0));
        const minTrimOut = Math.max(minTrimLen, Number(current.trimInMs || 0) + minTrimLen);
        const nextTrimOut = Math.max(minTrimOut, Math.min(sourceDurationMs, snapTimelineMsWithStep(Number(drag.initialTrimOutMs || 0) + deltaMsRaw, dragStepMs)));
        const updatedCurrent = normalizeTimelineClipItem({
          ...current,
          trimOutMs: nextTrimOut
        }, drag.rowId);
        if (!updatedCurrent) return cfg;
        const existingTextClipMap = normalizeOnScreenTextClipsByRowId(cfg?.timelineOnScreenTextClipsByRowId || {});
        const currentTextClip = existingTextClipMap[drag.rowId] || null;
        const constrainedTextClip = constrainOnScreenTextClipToScene(currentTextClip, updatedCurrent, drag.rowId);
        return {
          ...cfg,
          timelineVersion: STUDIO_TIMELINE_VERSION,
          timelineClipsByRowId: {
            ...clips,
            [drag.rowId]: updatedCurrent
          },
          ...(constrainedTextClip
            ? buildManualOnScreenTextTrackConfig(cfg, {
              ...constrainedTextClip,
              hidden: false,
              autoHidden: false
            }, drag.rowId)
            : {
              timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
              timelineOnScreenTextDefaultsVersion: STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION,
              onScreenTextTrack: {
                ...normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {}),
                enabled: true,
                showTrack: true
              },
              timelineOnScreenTextClipsByRowId: (cfg.timelineOnScreenTextClipsByRowId || {})
            })
        };
      }, { autosave: false, persist: false, recordHistory: false });
      podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
      renderPodcastVideoTimeline(getActiveSession(), { lightweight: true });
      syncOnScreenTextTrackToggleBtn(getActiveSession());
      syncTimelineClipDurationModalInputs();
      //     syncPodcastStudioInspector(getActiveSession());
    }
  }

  function finalizeClipDrag() {
    const drag = podcastVideoState.timelineDrag;
    if (!drag) return;
    if (drag.mode === "gemini-track-reorder") {
      const session = getActiveSession();
      const tracks = ensureTimelineTracks(session, { persist: false });
      const targetIndex = Number.isFinite(drag.targetIndex) ? Math.max(0, Math.min(tracks.length, Math.round(drag.targetIndex))) : null;
      if (targetIndex === null) return;
      upsertPodcastVideoConfig((cfg) => ({
        ...cfg,
        geminiDialogueTrackIndex: targetIndex
      }));
      renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
      //     syncPodcastStudioInspector(getActiveSession());
      return;
    }
    if (drag.mode !== "move") return;
    const groupIds = (Array.isArray(drag.dragGroup) ? drag.dragGroup : [])
      .map((item) => String(item?.rowId || "").trim())
      .filter(Boolean);
    if (!groupIds.length) return;
    const targetDropIndex = Number.isFinite(drag.targetDropIndex) ? Math.max(0, Math.round(drag.targetDropIndex)) : null;
    const targetTrackId = String(drag.targetTrackId || "").trim();
    if (!targetTrackId && targetDropIndex === null) return;
    if (targetDropIndex !== null) {
      duplicateSceneRowsIntoNewTrack(groupIds, targetDropIndex);
      return;
    }
    upsertPodcastVideoConfig((cfg, session) => {
      const tracks = ensureTimelineTracks(session, { persist: false });
      const clips = ensureTimelineClipsByRowId(session, { persist: false });
      const nextClips = { ...clips };
      let nextTracks = [...tracks];
      let destinationTrackId = targetTrackId;
      if (!destinationTrackId) return cfg;
      groupIds.forEach((rowId) => {
        const current = clips[rowId];
        if (!current) return;
        const updated = normalizeTimelineClipItem({
          ...current,
          trackId: destinationTrackId,
          zIndex: Math.max(1, Number(current.zIndex || 1))
        }, rowId);
        if (updated) {
          nextClips[rowId] = updated;
        }
      });
      return {
        ...cfg,
        timelineVersion: STUDIO_TIMELINE_VERSION,
        timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
        timelineTracks: normalizeTimelineTracks(nextTracks),
        timelineClipsByRowId: nextClips
      };
    });
    // Nota: en modo educativo antes se compactaba el timeline para evitar solapamientos.
    // Ahora permitimos encimar escenas (para transiciones por overlap), así que no auto-compactamos aquí.
  }

  function finalizeLinkedGeminiDrag(options = {}) {
    const drag = podcastVideoState.timelineDrag;
    if (!drag) return false;
    const dragMode = String(options.dragMode || drag.mode || "").trim();
    const dragKind = String(options.dragKind || drag.kind || "").trim().toLowerCase();
    const isOnScreenTextDrag = dragKind === "on-screen-text";
    if (dragMode === "gemini-segment-move") {
      syncOnScreenTextClipsWithGeminiTrack({ render: false, autosave: false });
      scheduleSessionLocalPersist("timeline-gemini-audio");
      if (PODCAST_SESSION_MANUAL_SAVE_ONLY !== true) {
        try {
          persistSessions();
        } catch (_) {
          // noop
        }
        sessionStore.markDirty(
          String(getActiveSession()?.id || "").trim(),
          "timeline-gemini-audio"
        );
      }
      return true;
    }
    const shouldSyncGemini = isOnScreenTextDrag || dragMode === "gemini-segment-move";
    if (!shouldSyncGemini) return false;
    syncGeminiDialogueTrackWithRuntime({
      render: false,
      preserveStartMs: true,
      isTrimStart: dragMode === "trim-start",
      autosave: false
    });
    if (PODCAST_SESSION_MANUAL_SAVE_ONLY !== true) {
      try {
        persistSessions();
      } catch (_) {
        // noop
      }
      sessionStore.markDirty(
        String(getActiveSession()?.id || "").trim(),
        isOnScreenTextDrag
          ? "timeline-onscreen-text"
          : "timeline-gemini-audio"
      );
    }
    return true;
  }

  function cancelActiveDrag(options = {}) {
    lastTimelinePointerEvent = null;
    if (timelinePointerMoveRafId) {
      cancelAnimationFrame(timelinePointerMoveRafId);
      timelinePointerMoveRafId = 0;
    }
    if (options.keepUi !== true) {
      clearPodcastTimelineDragUi();
    } else {
      podcastVideoState.timelineDrag = null;
    }
  }

  return {
    handlePointerDown,
    handleClick,
    handlePointerMove,
    handlePointerUp,
    cancelActiveDrag,
    applyClipDrag,
    finalizeClipDrag,
    finalizeLinkedGeminiDrag,
    beginClipDrag,
    beginAudioTrimDrag,
    beginAudioMoveDrag,
    beginGeminiSegmentMoveDrag,
    beginUploadedAudioSegmentMoveDrag,
    beginGeminiTrackReorderDrag,
    deleteSelectedAudioChips,
    buildPanelAudioSelectionKey,
    clearPanelMusicTrackByKind
  };
}
