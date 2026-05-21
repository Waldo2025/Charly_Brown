export function createPodcasterSceneSelectionApi(deps = {}) {
  const {
    els,
    podcastVideoState,
    getActiveSession,
    getTransitionTimelineRowOrder,
    renderPodcastVideoTimeline,
    syncPodcastStudioInspector,
    syncPodcastTimelineSelectionUi,
    syncPodcastTimelinePlayhead,
    syncPodcastSceneZoomControls,
    ensureTimelineClipsByRowId,
    syncPodcastVideoStageMedia,
    syncPodcastOnScreenTextOverlay,
    resolveTargetVideoRowId,
    setPodcastVideoSpeaker,
    upsertPodcastStudioUiState,
    scheduleMontageExportPreviewRefresh
  } = deps;

  function setPodcastVideoRow(rowId = "", options = {}) {
    const session = getActiveSession();
    const key = String(rowId || "").trim() || resolveTargetVideoRowId(getActiveSession());
    const preserveMontageCursor = options.preserveMontageCursor === true;
    const updateScrubber = options.updateScrubber !== false;
    const forceOverlay = options.forceOverlay === true;
    podcastVideoState.activeRowId = key;
    podcastVideoState.timelineLastInteractedRowId = key;
    upsertPodcastStudioUiState({ lastActiveRowId: key }, { autosaveReason: "ui-state" });
    if (!podcastVideoState.transitionPickerOpen) {
      const rowIds = getTransitionTimelineRowOrder(session);
      const idx = rowIds.findIndex((id) => id === key);
      const nextRowId = idx >= 0 ? String(rowIds[idx + 1] || "").trim() : "";
      podcastVideoState.transitionFromRowId = key;
      podcastVideoState.transitionToRowId = nextRowId;
    }
    if (podcastVideoState.montageActive || options.lightweightUi === true) {
      syncPodcastTimelineSelectionUi(session);
      syncPodcastTimelinePlayhead(session);
    } else {
      renderPodcastVideoTimeline(session, { reason: String(options.reason || "structure").trim() || "structure" });
    }
    if (options.skipInspectorSync !== true) {
      syncPodcastStudioInspector(session);
    }
    syncPodcastSceneZoomControls(session);
    const clipMap = ensureTimelineClipsByRowId(session);
    const clip = clipMap[key];
    if (clip && updateScrubber && els.podcastStudioScrubber && podcastVideoState.timelineDurationSec > 0) {
      const ratio = Math.max(0, Math.min(1, Number(clip.startMs || 0) / Math.max(100, podcastVideoState.timelineDurationSec * 1000)));
      els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
      if (!preserveMontageCursor) {
        podcastVideoState.montageCursorMs = Math.max(0, Number(clip.startMs || 0));
      }
      syncPodcastTimelinePlayhead(session);
    }
    if (options.syncStage !== false) {
      syncPodcastVideoStageMedia(session, key);
    }
    syncPodcastOnScreenTextOverlay(session, {
      rowId: key,
      currentMs: Number(podcastVideoState.montageCursorMs || 0),
      forceRow: forceOverlay || options.syncStage !== false
    });
    if (els.montageExportModal && !els.montageExportModal.hidden) {
      scheduleMontageExportPreviewRefresh?.(120);
    }
  }

  function selectTimelineSceneRow(rowId = "", options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return;
    const session = getActiveSession();
    const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
    setPodcastVideoRow(key, {
      syncStage: options.syncStage === true,
      preserveMontageCursor: true,
      lightweightUi: options.syncStage !== true,
      reason: options.syncStage === true ? "playback" : "selection"
    });
    if (row?.speaker) {
      setPodcastVideoSpeaker(session, row.speaker, {
        speaking: false,
        rowId: key,
        syncStageMedia: options.syncStage === true
      });
    }
  }

  return {
    setPodcastVideoRow,
    selectTimelineSceneRow
  };
}
