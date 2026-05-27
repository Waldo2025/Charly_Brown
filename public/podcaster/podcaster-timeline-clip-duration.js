export function createPodcasterTimelineClipDurationApi(deps = {}) {
  const {
    els,
    getActiveSession,
    ensureTimelineClipsByRowId,
    STUDIO_TIMELINE_MIN_CLIP_MS,
    VIDEO_SCENE_MAX_SEC,
    toFiniteNumber,
    normalizeTimelineClipVisualLayoutMode,
    getTimelineClipEffectiveDurationMs,
    resolveDialogueVideoForRow,
    resolveDialogueVideoSegments,
    hasStoredMediaSource,
    resolveSpeakerDisplayName,
    getSceneBackgroundMusicVolumeOverridePct,
    updateTimelineClipForRow,
    upsertPodcastVideoConfig,
    normalizeGeminiDialogueTrack,
    getPodcastVideoConfig,
    snapTimelineMs,
    getSessionRows,
    upsertActiveSession,
    scheduleSessionLocalPersist,
    setGenerationStatus,
    persistCompactedTimelineTrackFromRow,
    syncGeminiDialogueTrackWithRuntime,
    playbackController,
    podcastVideoState,
    getTimelineTotalDurationMs,
    renderPodcastVideoTimeline,
    syncPodcastStudioInspector,
    applyActiveTimelineClipMixToPlayback,
    syncPodcastVideoStageMedia,
    panelMusicState,
    ensureMontageDefaultVolumesPersisted,
    renderPodcastVideoShell,
    getTimelineClipRestoreTarget
  } = deps;

  let timelineClipDurationModalState = {
    rowId: "",
    minSec: STUDIO_TIMELINE_MIN_CLIP_MS / 1000,
    maxSec: STUDIO_TIMELINE_MIN_CLIP_MS / 1000,
    valueSec: STUDIO_TIMELINE_MIN_CLIP_MS / 1000,
    visualLayoutMode: "default",
    relateWithPreviousScene: false,
    baseVeoVolumePct: 100,
    baseGeminiVolumePct: 100,
    baseBackgroundMusicVolumePct: 100,
    veoVolumePct: 100,
    geminiVolumePct: 100,
    backgroundMusicVolumePct: 100
  };
  let timelineClipVolumePersistRaf = 0;
  let timelineClipVolumePersistTimeout = 0;

  function getState() {
    return timelineClipDurationModalState;
  }

  function formatTimelineClipDurationSeconds(value = 0) {
    const numeric = Math.max(0, toFiniteNumber(value, 0));
    const rounded = Math.round(numeric * 100) / 100;
    return rounded.toFixed(2).replace(/\.?0+$/, "");
  }
  
  function resolveTimelineClipRestoreTarget(clip = null) {
    return getTimelineClipRestoreTarget(clip);
  }
  
  function setOpen(isOpen = false) {
    const open = Boolean(isOpen) && Boolean(String(timelineClipDurationModalState.rowId || "").trim());
    if (els.timelineClipDurationModal) {
      els.timelineClipDurationModal.hidden = !open;
    }
    if (!open) {
      // Persist volume overrides even if the RAF already flushed the "preview" update.
      // Otherwise slider changes can be lost when the user closes without pressing Apply.
      try {
        persistVolumeOverrides({ persist: true });
      } catch (_) { }
      // Flush pending per-scene volume updates so slider moves are not lost when
      // the user closes/cancels quickly (RAF throttle).
      if (timelineClipVolumePersistRaf) {
        cancelAnimationFrame(timelineClipVolumePersistRaf);
        timelineClipVolumePersistRaf = 0;
        try {
          persistVolumeOverrides({ persist: true });
        } catch (_) { }
      }
      timelineClipDurationModalState = {
        rowId: "",
        minSec: STUDIO_TIMELINE_MIN_CLIP_MS / 1000,
        maxSec: STUDIO_TIMELINE_MIN_CLIP_MS / 1000,
        valueSec: STUDIO_TIMELINE_MIN_CLIP_MS / 1000,
        visualLayoutMode: "default",
        relateWithPreviousScene: false,
        baseVeoVolumePct: 100,
        baseGeminiVolumePct: 100,
        baseBackgroundMusicVolumePct: 100,
        veoVolumePct: 100,
        geminiVolumePct: 100,
        backgroundMusicVolumePct: 100
      };
      if (els.timelineClipVeoVolumeRange) {
        els.timelineClipVeoVolumeRange.value = "100";
      }
      if (els.timelineClipVeoVolumeNumber) {
        els.timelineClipVeoVolumeNumber.value = "100";
      }
      if (els.timelineClipGeminiVolumeRange) {
        els.timelineClipGeminiVolumeRange.value = "100";
      }
      if (els.timelineClipGeminiVolumeNumber) {
        els.timelineClipGeminiVolumeNumber.value = "100";
      }
      if (els.timelineClipBackgroundVolumeRange) {
        els.timelineClipBackgroundVolumeRange.value = "100";
      }
      if (els.timelineClipBackgroundVolumeNumber) {
        els.timelineClipBackgroundVolumeNumber.value = "100";
      }
      if (els.timelineClipVisualLayoutMode) {
        els.timelineClipVisualLayoutMode.value = "default";
      }
      if (els.timelineClipRelatePrevCheckbox) {
        els.timelineClipRelatePrevCheckbox.checked = false;
        els.timelineClipRelatePrevCheckbox.disabled = true;
        delete els.timelineClipRelatePrevCheckbox.dataset.rowId;
        delete els.timelineClipRelatePrevCheckbox.dataset.field;
      }
      if (els.timelineClipRelatePrevHint) {
        els.timelineClipRelatePrevHint.textContent = "";
      }
      if (els.timelineClipApplyRelateAheadCheckbox) {
        els.timelineClipApplyRelateAheadCheckbox.checked = false;
        els.timelineClipApplyRelateAheadCheckbox.disabled = true;
      }
      if (els.timelineClipApplyRelateAheadHint) {
        els.timelineClipApplyRelateAheadHint.textContent = "";
      }
      return;
    }
    syncInputs();
  }
  
  function syncInputs(source = "") {
    const rowId = String(timelineClipDurationModalState.rowId || "").trim();
    if (!rowId) return;
    const session = getActiveSession();
    const rowIndex = (session?.script?.rows || []).findIndex((row) => String(row?.id || "").trim() === rowId);
    const row = rowIndex >= 0 ? session.script.rows[rowIndex] : null;
    const clip = ensureTimelineClipsByRowId(session, { persist: false })[rowId];
    if (!row || !clip) {
      setOpen(false);
      return;
    }
    const previousRow = rowIndex > 0 ? session.script.rows[rowIndex - 1] : null;
    const previousRowId = String(previousRow?.id || "").trim();
    const previousVideoClip = previousRowId ? resolveDialogueVideoForRow(session, previousRowId) : null;
    const previousVideoPrimary = resolveDialogueVideoSegments(previousVideoClip)[0] || previousVideoClip || null;
    const canRelateWithPrevious = Boolean(previousRowId);
    const hasForwardScenes = rowIndex >= 0 && rowIndex < Math.max(0, (session?.script?.rows || []).length - 1);
    const hardMaxSec = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS / 1000, VIDEO_SCENE_MAX_SEC);
    const currentDurationSec = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS / 1000, Math.min(hardMaxSec, getTimelineClipEffectiveDurationMs(clip) / 1000));
    const minSec = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS / 1000, toFiniteNumber(timelineClipDurationModalState.minSec, STUDIO_TIMELINE_MIN_CLIP_MS / 1000));
    const maxSec = Math.max(minSec, hardMaxSec);
    const nextVisualLayoutMode = normalizeTimelineClipVisualLayoutMode(
      source === "visualLayout" && els.timelineClipVisualLayoutMode
        ? els.timelineClipVisualLayoutMode.value
        : (clip.visualLayoutMode || timelineClipDurationModalState.visualLayoutMode || "default")
    );
    let nextSec = toFiniteNumber(timelineClipDurationModalState.valueSec, maxSec);
    if (source === "range" && els.timelineClipDurationRange) {
      nextSec = toFiniteNumber(els.timelineClipDurationRange.value, nextSec);
    } else if (source === "number" && els.timelineClipDurationNumber) {
      nextSec = toFiniteNumber(String(els.timelineClipDurationNumber.value || "").replace(",", ".").trim(), nextSec);
    }
    nextSec = Math.max(minSec, Math.min(maxSec, Math.round(nextSec * 100) / 100));
    const baseVeoVolumePct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.baseVeoVolumePct, 100))));
    const baseGeminiVolumePct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.baseGeminiVolumePct, 100))));
    const baseBackgroundMusicVolumePct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(timelineClipDurationModalState.baseBackgroundMusicVolumePct, 100))));
    const clipVeoOverride = toFiniteNumber(clip.veoVolumeOverridePct, Number.NaN);
    const clipGeminiOverride = toFiniteNumber(clip.geminiVolumeOverridePct, Number.NaN);
    const sceneBackgroundOverride = getSceneBackgroundMusicVolumeOverridePct(session, rowId);
    const lastBaseVeo = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.baseVeoVolumePct, baseVeoVolumePct))));
    const lastBaseGemini = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.baseGeminiVolumePct, baseGeminiVolumePct))));
    const lastBaseBackground = Math.max(0, Math.min(200, Math.round(toFiniteNumber(timelineClipDurationModalState.baseBackgroundMusicVolumePct, baseBackgroundMusicVolumePct))));
    const currentVeoState = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.veoVolumePct, baseVeoVolumePct))));
    const currentGeminiState = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.geminiVolumePct, baseGeminiVolumePct))));
    const currentBackgroundState = Math.max(0, Math.min(200, Math.round(toFiniteNumber(timelineClipDurationModalState.backgroundMusicVolumePct, baseBackgroundMusicVolumePct))));
    let nextVeoVolume = Number.isFinite(clipVeoOverride)
      ? Math.max(0, Math.min(100, Math.round(clipVeoOverride)))
      : (currentVeoState === lastBaseVeo ? baseVeoVolumePct : currentVeoState);
    if (source === "veoRange" && els.timelineClipVeoVolumeRange) {
      nextVeoVolume = Math.round(Math.max(0, Math.min(100, toFiniteNumber(els.timelineClipVeoVolumeRange.value, nextVeoVolume))));
    } else if (source === "veoNumber" && els.timelineClipVeoVolumeNumber) {
      nextVeoVolume = Math.round(Math.max(0, Math.min(100, toFiniteNumber(String(els.timelineClipVeoVolumeNumber.value || "").trim(), nextVeoVolume))));
    }
    let nextGeminiVolume = Number.isFinite(clipGeminiOverride)
      ? Math.max(0, Math.min(100, Math.round(clipGeminiOverride)))
      : (currentGeminiState === lastBaseGemini ? baseGeminiVolumePct : currentGeminiState);
    if (source === "geminiRange" && els.timelineClipGeminiVolumeRange) {
      nextGeminiVolume = Math.round(Math.max(0, Math.min(100, toFiniteNumber(els.timelineClipGeminiVolumeRange.value, nextGeminiVolume))));
    } else if (source === "geminiNumber" && els.timelineClipGeminiVolumeNumber) {
      nextGeminiVolume = Math.round(Math.max(0, Math.min(100, toFiniteNumber(String(els.timelineClipGeminiVolumeNumber.value || "").trim(), nextGeminiVolume))));
    }
    let nextBackgroundVolume = Number.isFinite(sceneBackgroundOverride)
      ? Math.max(0, Math.min(200, Math.round(sceneBackgroundOverride)))
      : (currentBackgroundState === lastBaseBackground ? baseBackgroundMusicVolumePct : currentBackgroundState);
    if (source === "backgroundRange" && els.timelineClipBackgroundVolumeRange) {
      nextBackgroundVolume = Math.round(Math.max(0, Math.min(200, toFiniteNumber(els.timelineClipBackgroundVolumeRange.value, nextBackgroundVolume))));
    } else if (source === "backgroundNumber" && els.timelineClipBackgroundVolumeNumber) {
      nextBackgroundVolume = Math.round(Math.max(0, Math.min(200, toFiniteNumber(String(els.timelineClipBackgroundVolumeNumber.value || "").trim(), nextBackgroundVolume))));
    }
    timelineClipDurationModalState = {
      rowId,
      minSec,
      maxSec,
      valueSec: nextSec,
      visualLayoutMode: nextVisualLayoutMode,
      relateWithPreviousScene: row?.relateWithPreviousScene === true,
      baseVeoVolumePct,
      baseGeminiVolumePct,
      baseBackgroundMusicVolumePct,
      veoVolumePct: nextVeoVolume,
      geminiVolumePct: nextGeminiVolume,
      backgroundMusicVolumePct: nextBackgroundVolume
    };
    if (els.timelineClipDurationRange) {
      els.timelineClipDurationRange.min = String(minSec);
      els.timelineClipDurationRange.max = String(maxSec);
      els.timelineClipDurationRange.value = String(nextSec);
    }
    if (els.timelineClipDurationNumber) {
      els.timelineClipDurationNumber.min = String(minSec);
      els.timelineClipDurationNumber.max = String(maxSec);
      els.timelineClipDurationNumber.value = String(nextSec);
    }
    if (els.timelineClipVeoVolumeRange) {
      els.timelineClipVeoVolumeRange.value = String(nextVeoVolume);
    }
    if (els.timelineClipVeoVolumeNumber) {
      els.timelineClipVeoVolumeNumber.value = String(nextVeoVolume);
    }
    if (els.timelineClipGeminiVolumeRange) {
      els.timelineClipGeminiVolumeRange.value = String(nextGeminiVolume);
    }
    if (els.timelineClipGeminiVolumeNumber) {
      els.timelineClipGeminiVolumeNumber.value = String(nextGeminiVolume);
    }
    if (els.timelineClipBackgroundVolumeRange) {
      els.timelineClipBackgroundVolumeRange.value = String(nextBackgroundVolume);
    }
    if (els.timelineClipBackgroundVolumeNumber) {
      els.timelineClipBackgroundVolumeNumber.value = String(nextBackgroundVolume);
    }
    if (els.timelineClipVisualLayoutMode) {
      els.timelineClipVisualLayoutMode.value = nextVisualLayoutMode;
    }
    if (els.timelineClipDurationLabel) {
      const speakerName = resolveSpeakerDisplayName(row?.speaker, session);
      els.timelineClipDurationLabel.textContent = `Escena ${rowIndex + 1} · ${speakerName}`;
    }
    if (els.timelineClipDurationHint) {
      els.timelineClipDurationHint.textContent = `Máximo actual: ${formatTimelineClipDurationSeconds(maxSec)}s · mínimo: ${formatTimelineClipDurationSeconds(minSec)}s. Solo recorte.`;
    }
    if (els.timelineClipRelatePrevCheckbox) {
      els.timelineClipRelatePrevCheckbox.dataset.rowId = rowId;
      els.timelineClipRelatePrevCheckbox.dataset.field = "relateWithPreviousScene";
      els.timelineClipRelatePrevCheckbox.checked = row?.relateWithPreviousScene === true;
      els.timelineClipRelatePrevCheckbox.disabled = !canRelateWithPrevious;
    }
    if (els.timelineClipRelatePrevHint) {
      if (!previousRowId) {
        els.timelineClipRelatePrevHint.textContent = "No hay escena anterior para relacionar.";
      } else if (!hasStoredMediaSource(previousVideoPrimary)) {
        els.timelineClipRelatePrevHint.textContent = "Puedes activarlo ahora, pero recuerda generar el video de la escena anterior antes de generar este para que la continuidad funcione.";
      } else {
        els.timelineClipRelatePrevHint.textContent = "Usa el último frame del video anterior como referencia para intentar continuidad sin cortes visibles.";
      }
    }
    if (els.timelineClipApplyRelateAheadCheckbox) {
      els.timelineClipApplyRelateAheadCheckbox.disabled = !hasForwardScenes;
      if (!hasForwardScenes) els.timelineClipApplyRelateAheadCheckbox.checked = false;
    }
    if (els.timelineClipApplyRelateAheadHint) {
      els.timelineClipApplyRelateAheadHint.textContent = hasForwardScenes
        ? "Replica esta selección de continuidad hacia adelante (escenas posteriores)."
        : "No hay escenas posteriores para aplicar.";
    }
    if (els.resetTimelineClipDurationBtn) {
      const restoreTarget = resolveTimelineClipRestoreTarget(clip);
      els.resetTimelineClipDurationBtn.disabled = !restoreTarget.hasCuts;
    }
  }
  
  function applyFromModal() {
    const rowId = String(timelineClipDurationModalState.rowId || "").trim();
    if (!rowId) return;
    syncInputs("number");
    syncInputs("veoNumber");
    syncInputs("geminiNumber");
    syncInputs("backgroundNumber");
    syncInputs("visualLayout");
    const session = getActiveSession();
    const applyRelateAhead = els.timelineClipApplyRelateAheadCheckbox?.checked === true;
    const relateValue = els.timelineClipRelatePrevCheckbox?.checked === true;
    const desiredVeoVolumePct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.veoVolumePct, 100))));
    const desiredGeminiVolumePct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.geminiVolumePct, 100))));
    const desiredBackgroundMusicVolumePct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(timelineClipDurationModalState.backgroundMusicVolumePct, 100))));
    const desiredVisualLayoutMode = normalizeTimelineClipVisualLayoutMode(timelineClipDurationModalState.visualLayoutMode);
    const desiredVeoOverridePct = desiredVeoVolumePct;
    const desiredGeminiOverridePct = desiredGeminiVolumePct;
  
    const applyRelateWithPreviousForward = (pivotRowId = "", nextValue = false) => {
      const pivotKey = String(pivotRowId || "").trim();
      if (!pivotKey) return false;
      const session = getActiveSession();
      const rows = getSessionRows(session);
      const pivotIndex = rows.findIndex((row) => String(row?.id || "").trim() === pivotKey);
      if (pivotIndex < 0 || pivotIndex >= rows.length - 1) return false;
      let changed = false;
      const nextRows = rows.map((row, index) => {
        if (index <= pivotIndex) return row;
        const prevRow = rows[index - 1] || null;
        const prevRowId = String(prevRow?.id || "").trim();
        if (!prevRowId) return row;
        const desired = nextValue === true;
        const current = row?.relateWithPreviousScene === true;
        if (current === desired) return row;
        changed = true;
        return {
          ...row,
          relateWithPreviousScene: desired
        };
      });
      if (!changed) return false;
      upsertActiveSession((current) => ({
        ...current,
        script: {
          ...current.script,
          rows: nextRows
        }
      }), { render: false });
      scheduleSessionLocalPersist("timeline-clip-relate-ahead");
      return true;
    };
  
    const desiredSec = Math.max(
      timelineClipDurationModalState.minSec,
      Math.min(timelineClipDurationModalState.maxSec, toFiniteNumber(timelineClipDurationModalState.valueSec, timelineClipDurationModalState.maxSec))
    );
    const desiredMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      snapTimelineMs(Math.round(desiredSec * 1000))
    );
  
    // No permitir recortar una escena por debajo del fin de su chip de voz Gemini,
    // porque eso termina truncando el audio en montaje/export.
    const cfg = session ? getPodcastVideoConfig(session) : null;
    const track = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
    const clipsSnapshot = session ? ensureTimelineClipsByRowId(session, { persist: false }) : {};
    const clipSnapshot = clipsSnapshot?.[rowId] || null;
    const clipStartMsSnapshot = Math.max(0, Number(clipSnapshot?.startMs || 0) || 0);
    const segmentForRow = track.enabled === true
      ? (track.segments || []).find((segment) => String(segment?.rowId || "").trim() === rowId) || null
      : null;
    const segmentStartMs = segmentForRow ? Math.max(0, Number(segmentForRow?.startMs || 0) || 0) : 0;
    const segmentDurationMs = segmentForRow
      ? Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        Number(segmentForRow?.durationMs || 0) || (Number(segmentForRow?.endMs || 0) - segmentStartMs) || STUDIO_TIMELINE_MIN_CLIP_MS
      )
      : 0;
    const segmentEndMs = segmentForRow ? Math.max(segmentStartMs, segmentStartMs + segmentDurationMs) : 0;
    const requiredEffectiveMs = segmentForRow
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Math.max(0, segmentEndMs - clipStartMsSnapshot)))
      : 0;
  
    let durationChanged = false;
    let volumeChanged = false;
    let preventedGeminiCut = false;
    let backgroundVolumeChanged = false;
    let visualLayoutChanged = false;
    const changed = updateTimelineClipForRow(rowId, (current) => {
      const trimInMs = Math.max(0, Number(current?.trimInMs || 0));
      const maxTrimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Math.max(Number(current?.sourceDurationMs || 0), VIDEO_SCENE_MAX_SEC * 1000));
      const nextTrimOutMs = Math.max(
        trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
        Math.min(maxTrimOutMs, trimInMs + desiredMs)
      );
      const minTrimOutToFitGemini = requiredEffectiveMs > 0 ? Math.min(maxTrimOutMs, trimInMs + requiredEffectiveMs) : 0;
      const guardedTrimOutMs = minTrimOutToFitGemini > 0
        ? Math.max(nextTrimOutMs, minTrimOutToFitGemini)
        : nextTrimOutMs;
      if (guardedTrimOutMs !== nextTrimOutMs) preventedGeminiCut = true;
      durationChanged = Number(current?.trimOutMs || 0) !== guardedTrimOutMs;
      const currentVeoOverride = toFiniteNumber(current?.veoVolumeOverridePct, Number.NaN);
      const currentGeminiOverride = toFiniteNumber(current?.geminiVolumeOverridePct, Number.NaN);
      const normalizedCurrentVeoOverride = Number.isFinite(currentVeoOverride) ? Math.max(0, Math.min(100, Math.round(currentVeoOverride))) : null;
      const normalizedCurrentGeminiOverride = Number.isFinite(currentGeminiOverride) ? Math.max(0, Math.min(100, Math.round(currentGeminiOverride))) : null;
      volumeChanged = normalizedCurrentVeoOverride !== desiredVeoOverridePct
        || normalizedCurrentGeminiOverride !== desiredGeminiOverridePct;
      const currentBackgroundOverride = getSceneBackgroundMusicVolumeOverridePct(session, rowId);
      const normalizedCurrentBackgroundOverride = Number.isFinite(currentBackgroundOverride)
        ? Math.max(0, Math.min(200, Math.round(currentBackgroundOverride)))
        : null;
      backgroundVolumeChanged = normalizedCurrentBackgroundOverride !== desiredBackgroundMusicVolumePct;
      visualLayoutChanged = normalizeTimelineClipVisualLayoutMode(current?.visualLayoutMode) !== desiredVisualLayoutMode;
      return {
        ...current,
        sourceDurationMs: Math.max(Number(current?.sourceDurationMs || 0), guardedTrimOutMs),
        trimOutMs: guardedTrimOutMs,
        veoVolumeOverridePct: desiredVeoOverridePct,
        geminiVolumeOverridePct: desiredGeminiOverridePct,
        visualLayoutMode: desiredVisualLayoutMode
      };
    });
    upsertPodcastVideoConfig((cfg) => ({
      ...cfg,
      timelineSceneAudioMixByRowId: {
        ...(cfg?.timelineSceneAudioMixByRowId || {}),
        [rowId]: {
          backgroundMusicVolumePct: desiredBackgroundMusicVolumePct
        }
      }
    }));
    const relateAheadChanged = applyRelateAhead ? applyRelateWithPreviousForward(rowId, relateValue) : false;
    if (!changed && !relateAheadChanged) {
      setGenerationStatus("No hubo cambios en la duración de la escena.", "is-live");
      setOpen(false);
      return;
    }
    const refreshedClip = ensureTimelineClipsByRowId(getActiveSession(), { persist: false })[rowId];
    const nextDurationSec = Number((getTimelineClipEffectiveDurationMs(refreshedClip) / 1000).toFixed(2));
    const anyVolumeChanged = volumeChanged || backgroundVolumeChanged;
    const baseLabel = durationChanged && anyVolumeChanged
      ? `Escena recortada a ${nextDurationSec}s · volumen actualizado`
      : (durationChanged ? `Escena recortada a ${nextDurationSec}s` : (visualLayoutChanged ? "Estilo visual actualizado" : "Volumen actualizado"));
    setGenerationStatus(
      applyRelateAhead && relateAheadChanged
        ? `${baseLabel} · continuidad ${relateValue ? "activada" : "desactivada"} en escenas siguientes`
        : (changed ? (preventedGeminiCut ? `${baseLabel} · se mantuvo la voz Gemini` : baseLabel) : `Continuidad ${relateValue ? "activada" : "desactivada"} en escenas siguientes`),
      "is-live"
    );
    if (durationChanged) {
      persistCompactedTimelineTrackFromRow(rowId, { render: false });
      syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
    }
    try {
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
      playbackController.syncBackgroundMusic(Math.max(0, Number(podcastVideoState.montageCursorMs || 0)), speed);
    } catch (_) { }
    setOpen(false);
    if (durationChanged) {
      podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
      renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
      syncPodcastStudioInspector(getActiveSession());
    }
  }
  
  function persistVolumeOverrides(options = {}) {
    const rowId = String(timelineClipDurationModalState.rowId || "").trim();
    if (!rowId) return false;
    const session = getActiveSession();
    if (!session) return false;
    const desiredVeoOverridePct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.veoVolumePct, 100))));
    const desiredGeminiOverridePct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(timelineClipDurationModalState.geminiVolumePct, 100))));
    const desiredBackgroundMusicVolumePct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(timelineClipDurationModalState.backgroundMusicVolumePct, 100))));
    const desiredVisualLayoutMode = normalizeTimelineClipVisualLayoutMode(timelineClipDurationModalState.visualLayoutMode);
    const changed = updateTimelineClipForRow(rowId, (current) => ({
      ...current,
      veoVolumeOverridePct: desiredVeoOverridePct,
      geminiVolumeOverridePct: desiredGeminiOverridePct,
      visualLayoutMode: desiredVisualLayoutMode
    }), { persist: options.persist === true });
    upsertPodcastVideoConfig((cfg) => ({
      ...cfg,
      timelineSceneAudioMixByRowId: {
        ...(cfg?.timelineSceneAudioMixByRowId || {}),
        [rowId]: {
          backgroundMusicVolumePct: desiredBackgroundMusicVolumePct
        }
      }
    }));
    if (changed && String(podcastVideoState.activeRowId || "").trim() === rowId) {
      applyActiveTimelineClipMixToPlayback(session, rowId);
      syncPodcastVideoStageMedia(session, rowId);
    }
    try {
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
      playbackController.syncBackgroundMusic(Math.max(0, Number(podcastVideoState.montageCursorMs || 0)), speed);
    } catch (_) { }
    return changed;
  }

  function schedulePersistVolumeOverrides() {
    if (timelineClipVolumePersistRaf) cancelAnimationFrame(timelineClipVolumePersistRaf);
    timelineClipVolumePersistRaf = requestAnimationFrame(() => {
      timelineClipVolumePersistRaf = 0;
      try { persistVolumeOverrides({ persist: false }); } catch (_) { }
    });
    if (timelineClipVolumePersistTimeout) clearTimeout(timelineClipVolumePersistTimeout);
    timelineClipVolumePersistTimeout = setTimeout(() => {
      timelineClipVolumePersistTimeout = 0;
      try { persistVolumeOverrides({ persist: true }); } catch (_) { }
    }, 900);
  }
  
  function resetFromModal() {
    const rowId = String(timelineClipDurationModalState.rowId || "").trim();
    if (!rowId) return;
    const clip = ensureTimelineClipsByRowId(getActiveSession(), { persist: false })[rowId];
    if (!clip) return;
    const restoreTarget = resolveTimelineClipRestoreTarget(clip);
    if (!restoreTarget.hasCuts) {
      setGenerationStatus("La escena ya está restablecida sin cortes.", "is-live");
      return;
    }
    const changed = updateTimelineClipForRow(rowId, (current) => ({
      ...current,
      sourceDurationMs: Math.max(Number(current?.sourceDurationMs || 0), restoreTarget.restoreTrimOutMs),
      trimInMs: restoreTarget.restoreTrimInMs,
      trimOutMs: restoreTarget.restoreTrimOutMs
    }));
    if (!changed) {
      setGenerationStatus("No se pudo restablecer la escena.", "");
      return;
    }
    const restoredSec = Number((restoreTarget.restoreTrimOutMs / 1000).toFixed(2));
    timelineClipDurationModalState.valueSec = restoredSec;
    syncInputs();
    setGenerationStatus(`Escena restablecida a ${restoredSec}s`, "is-live");
    persistCompactedTimelineTrackFromRow(rowId, { render: false });
    syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
    renderPodcastVideoShell(getActiveSession());
  }
  
  function open(rowId = "") {
    const key = String(rowId || "").trim();
    if (!key) return;
    const session = getActiveSession();
    ensureMontageDefaultVolumesPersisted(session);
    const clips = ensureTimelineClipsByRowId(session, { persist: false });
    const clip = clips[key];
    if (!clip) return;
    const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
    const hardMaxSec = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS / 1000, VIDEO_SCENE_MAX_SEC);
    const currentDurationSec = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS / 1000, Math.min(hardMaxSec, getTimelineClipEffectiveDurationMs(clip) / 1000));
    const roundedDurationSec = Math.round(currentDurationSec * 100) / 100;
    const cfg = getPodcastVideoConfig(session);
    const baseVeoVolumePct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(cfg.montageDefaultVeoVolumePct, 0))));
    const baseGeminiVolumePct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100))));
    const baseBackgroundMusicVolumePct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(panelMusicState?.montageVolume, 100))));
    const clipVeoOverride = toFiniteNumber(clip?.veoVolumeOverridePct, Number.NaN);
    const clipGeminiOverride = toFiniteNumber(clip?.geminiVolumeOverridePct, Number.NaN);
    const sceneBackgroundOverride = getSceneBackgroundMusicVolumeOverridePct(session, key);
    timelineClipDurationModalState = {
      rowId: key,
      minSec: STUDIO_TIMELINE_MIN_CLIP_MS / 1000,
      maxSec: hardMaxSec,
      valueSec: roundedDurationSec,
      visualLayoutMode: normalizeTimelineClipVisualLayoutMode(clip?.visualLayoutMode),
      relateWithPreviousScene: row?.relateWithPreviousScene === true,
      baseVeoVolumePct,
      baseGeminiVolumePct,
      baseBackgroundMusicVolumePct,
      veoVolumePct: Math.max(0, Math.min(100, Math.round(Number.isFinite(clipVeoOverride) ? clipVeoOverride : baseVeoVolumePct))),
      geminiVolumePct: Math.max(0, Math.min(100, Math.round(Number.isFinite(clipGeminiOverride) ? clipGeminiOverride : baseGeminiVolumePct))),
      backgroundMusicVolumePct: Math.max(0, Math.min(200, Math.round(Number.isFinite(sceneBackgroundOverride) ? sceneBackgroundOverride : baseBackgroundMusicVolumePct)))
    };
    setOpen(true);
    if (els.timelineClipApplyRelateAheadCheckbox) {
      els.timelineClipApplyRelateAheadCheckbox.checked = false;
    }
  }

  return {
    setOpen,
    syncInputs,
    applyFromModal,
    persistVolumeOverrides,
    schedulePersistVolumeOverrides,
    open,
    resetFromModal,
    getState
  };
}
