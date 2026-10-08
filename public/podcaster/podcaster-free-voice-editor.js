import { normalizeFreeVoiceTrack, appendFreeVoiceClip, splitFreeVoiceClip, splitFreeVoiceTrackAtSilences, FREE_VOICE_MIN_CLIP_MS } from "./podcaster-free-voice-track.js?v=2026-10-05.gemini-inspector-1";
import { analyzeFreeVoiceAudio, FREE_VOICE_WAVEFORM_VERSION } from "./podcaster-free-voice-waveform.js?v=2026-10-05.gemini-inspector-1";

export function createPodcasterFreeVoiceEditor(deps = {}) {
  const { els, getActiveSession, getPodcastVideoConfig, upsertPodcastVideoConfig,
    flushSessionLocalPersistNow, renderPodcastVideoTimeline, playbackController,
    measureAudioDurationInfoFromFile, uploadPodcasterAsset, saveSessionToCloud,
    setGenerationStatus, timelinePxToMs, timelineMsToPx, resolveStorageAudioUrl, syncAudioTrackToggleUi } = deps;
  const freeVoiceInput = document.createElement("input");
  freeVoiceInput.type = "file";
  freeVoiceInput.accept = "audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/webm,.mp3,.wav,.m4a,.ogg,.webm";
  freeVoiceInput.multiple = true;
  freeVoiceInput.hidden = true;
  document.body.appendChild(freeVoiceInput);
  const timeline = els.podcastVideoTimeline;
  let bladeMode = false;
  let selectedClipId = "";
  let pointerInsideTimeline = false;
  const waveformAnalysisPending = new Set();
  const waveformAnalysisRetryAt = new Map();
  // Un archivo puede producir varios chips tras cortar el track. La normalización
  // guarda el análisis una sola vez por fuente; conserva esa deduplicación también
  // durante la hidratación para no decodificar el mismo audio una vez por fragmento.
  const waveformAnalysisCache = new Map();
  let waveformCacheSessionId = "";
  let lastPointerX = 0;
  let lastPointerY = 0;
  const razorCursor = document.createElement("span");
  razorCursor.className = "podcast-free-voice-razor-cursor";
  razorCursor.setAttribute("aria-hidden", "true");
  razorCursor.innerHTML = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 10h24v12H4z"/><path d="M11 10V7h10v3M11 22v3h10v-3M8 16h16"/></svg>';
  razorCursor.hidden = true;
  document.body.appendChild(razorCursor);
  const markSelectedClip = () => {
    timeline.querySelectorAll(".podcast-free-voice-chip[data-free-voice-id]").forEach((chip) => {
      chip.classList.toggle("is-cut-selection", chip.dataset.freeVoiceId === selectedClipId);
    });
  };
  const setBladeMode = (enabled) => {
    bladeMode = enabled === true;
    timeline.classList.toggle("is-free-voice-cut-tool", bladeMode);
    razorCursor.hidden = !bladeMode || !pointerInsideTimeline;
    if (!razorCursor.hidden) {
      razorCursor.style.left = `${lastPointerX + 12}px`;
      razorCursor.style.top = `${lastPointerY - 24}px`;
    }
    timeline.setAttribute("aria-label", bladeMode
      ? "Timeline: herramienta de corte activa. Haz clic en Voz libre para dividir. Pulsa C o Escape para salir."
      : "Timeline: pulsa C para activar la herramienta de corte de Voz libre.");
  };
  const saveFreeVoiceTrack = (mutator, reason = "free-voice-edit") => {
    upsertPodcastVideoConfig((cfg) => ({ ...cfg, freeVoiceTrack: mutator(normalizeFreeVoiceTrack(cfg.freeVoiceTrack)) }), { persist: true, autosaveReason: reason });
    const sessionId = String(getActiveSession()?.id || "").trim();
    flushSessionLocalPersistNow(sessionId, reason);
    const refreshedSession = getActiveSession();
    if (reason === "free-voice-toggle-track-enabled") {
      syncAudioTrackToggleUi?.("free-voice-toggle-track-enabled", normalizeFreeVoiceTrack(getPodcastVideoConfig(refreshedSession)?.freeVoiceTrack).enabled);
    } else {
      renderPodcastVideoTimeline(refreshedSession, { force: true, forceStructure: true });
    }
    markSelectedClip();
    if (reason === "free-voice-toggle-track-enabled") {
      playbackController?.sync?.(refreshedSession, getPodcastVideoConfig(refreshedSession), { prepareMedia: false });
      void playbackController?.syncAudio?.(
        Math.max(0, Number(playbackController?.state?.currentMs || 0)),
        playbackController?.deps?.getPlaybackSpeed?.() || 1
      );
    } else if (playbackController?.state?.isPlaying) {
      void playbackController?.syncAudio?.(
        Math.max(0, Number(playbackController?.state?.currentMs || 0)),
        playbackController?.deps?.getPlaybackSpeed?.() || 1
      );
    }
  };
  const toggleFreeVoiceTrackEnabled = () => {
    const track = normalizeFreeVoiceTrack(getPodcastVideoConfig(getActiveSession())?.freeVoiceTrack);
    const enabled = !track.enabled;
    saveFreeVoiceTrack((current) => ({ ...current, enabled }), "free-voice-toggle-track-enabled");
    deps.syncMontageSceneMixModalInputs?.("freeVoiceTrackEnabled");
    setGenerationStatus(enabled ? "Track de voz libre activado." : "Track desactivado; su audio no se cargará hasta reactivarlo.", "is-live");
  };
  const deleteFreeVoiceTrack = () => {
    selectedClipId = "";
    setBladeMode(false);
    saveFreeVoiceTrack((track) => ({ ...track, added: false, enabled: false, clips: [] }), "free-voice-delete-track");
    setGenerationStatus("Track de voz libre eliminado del montaje.", "is-live");
  };
  // The track-label menu is portaled outside the timeline, so its action cannot
  // rely on timeline click delegation. Expose the same state transition to it.
  timeline.podcasterToggleFreeVoiceTrackEnabled = toggleFreeVoiceTrackEnabled;
  timeline.podcasterDeleteFreeVoiceTrack = deleteFreeVoiceTrack;
  const addFreeVoiceFiles = async (files) => {
    const sessionId = String(getActiveSession()?.id || "").trim();
    if (!sessionId || !files.length) return;
    for (const file of files) {
      try {
        const ext = String(file.name || "").split(".").pop()?.toLowerCase();
        const inferredMimeType = ({
          mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
          ogg: "audio/ogg", webm: "audio/webm", aac: "audio/aac", flac: "audio/flac"
        })[ext] || "";
        const normalizedMimeType = ({ "audio/x-wav": "audio/wav", "audio/x-m4a": "audio/mp4" })[file.type]
          || (String(file.type || "").startsWith("audio/") ? file.type : inferredMimeType);
        const isAudio = String(file.type || "").startsWith("audio/") || Boolean(inferredMimeType);
        const isVideoWithAudio = ["mp4", "webm", "mov"].includes(ext) || file.type?.startsWith("video/");
        if (!isAudio && !isVideoWithAudio) {
          throw new Error("Formato de audio no compatible. Usa MP3, WAV, M4A, OGG o WebM.");
        }
        const effectiveMimeType = normalizedMimeType || file.type || "audio/mpeg";
        const id = globalThis.crypto?.randomUUID?.() || `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const localBlobUrl = typeof URL?.createObjectURL === "function" ? URL.createObjectURL(file) : "";
        const fallbackStoragePath = `local://free-voice/${sessionId}/${id}.${ext || "mp3"}`;

        // 1. Renderizado optimista instantáneo con spinner
        const initialDurationMs = 4000;
        const optimisticMedia = {
          name: file.name,
          storagePath: fallbackStoragePath,
          downloadUrl: localBlobUrl,
          mimeType: effectiveMimeType,
          isLoading: true
        };
        saveFreeVoiceTrack((track) => appendFreeVoiceClip(track, optimisticMedia, initialDurationMs, id), "free-voice-optimistic-add");
        setGenerationStatus(`Cargando audio: ${file.name}…`, "is-busy");

        // 2. Medir duración real y actualizar clip asíncronamente
        void (async () => {
          try {
            let audioAnalysis = null;
            try {
              audioAnalysis = await analyzeFreeVoiceAudio(file);
            } catch (analysisError) {
              console.warn("[podcaster-free-voice] No se pudo analizar la forma de onda:", analysisError);
            }
            const durationInfo = audioAnalysis ? null : await measureAudioDurationInfoFromFile(file);
            const durationMs = Math.max(100, Number(audioAnalysis?.durationMs || 0)
              || Math.round(Number(durationInfo?.durationSec || 0) * 1000)
              || initialDurationMs);
            saveFreeVoiceTrack((track) => ({
              ...track,
              clips: track.clips.map((clip) => clip.id === id ? {
                ...clip,
                sourceDurationMs: durationMs,
                trimOutMs: clip.trimInMs + durationMs,
                waveform: audioAnalysis?.waveform || clip.waveform,
                waveformAnalyzed: Boolean(audioAnalysis),
                waveformVersion: audioAnalysis ? FREE_VOICE_WAVEFORM_VERSION : 0,
                phraseRanges: audioAnalysis?.phraseRanges || clip.phraseRanges,
                isLoading: false
              } : clip)
            }), "free-voice-measured");
            setGenerationStatus(`Voz añadida: ${file.name}`, "is-live");

            // 3. Subir a Storage en segundo plano si está disponible
            const uploadFile = effectiveMimeType === file.type ? file : new File([file], file.name, { type: effectiveMimeType });
            const uploadOptions = { kind: "scene-audio", sessionId, rowId: `free-voice-${id}` };
            let upload;
            try {
              upload = await uploadPodcasterAsset(uploadFile, uploadOptions);
            } catch (uploadError) {
              if (Number(uploadError?.status || 0) === 404 || /podcaster_session_not_found/.test(String(uploadError?.message || ""))) {
                await saveSessionToCloud(sessionId, { render: false, silent: true });
                upload = await uploadPodcasterAsset(uploadFile, uploadOptions);
              }
            }
            const media = upload?.media;
            if (media?.storagePath && String(getActiveSession()?.id || "").trim() === sessionId) {
              saveFreeVoiceTrack((track) => ({
                ...track,
                clips: track.clips.map((clip) => clip.id === id ? {
                  ...clip,
                  storagePath: media.storagePath,
                  downloadUrl: media.downloadUrl || clip.downloadUrl
                } : clip)
              }), "free-voice-uploaded");
            }
          } catch (measureOrUploadErr) {
            console.warn("[podcaster-free-voice] Error en medición o subida:", measureOrUploadErr);
            saveFreeVoiceTrack((track) => ({
              ...track,
              clips: track.clips.map((clip) => clip.id === id ? { ...clip, isLoading: false } : clip)
            }), "free-voice-measured-fallback");
          }
        })();
      } catch (error) {
        setGenerationStatus(`No se pudo añadir ${file.name}: ${error.message}`, "");
      }
    }
  };
  freeVoiceInput.addEventListener("change", () => {
    void addFreeVoiceFiles(Array.from(freeVoiceInput.files || []));
    freeVoiceInput.value = "";
  });
  const splitFreeVoiceTrackBySilence = async () => {
    const sessionId = String(getActiveSession()?.id || "").trim();
    setGenerationStatus("Analizando silencios de más de 2 segundos…", "is-busy");
    await hydrateMissingWaveforms();
    if (!sessionId || String(getActiveSession()?.id || "").trim() !== sessionId) return;
    const newId = () => globalThis.crypto?.randomUUID?.() || `voice-silence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const current = normalizeFreeVoiceTrack(getPodcastVideoConfig(getActiveSession())?.freeVoiceTrack);
    const result = splitFreeVoiceTrackAtSilences(current, newId);
    if (!result.splitCount && !result.removedMs) {
      setGenerationStatus("No encontré silencios mayores a 2 segundos para recortar, o algún audio no se pudo analizar.", "");
    } else {
      saveFreeVoiceTrack(() => result.track, "free-voice-auto-split-silences");
      const secondsRemoved = (result.removedMs / 1000).toFixed(1);
      setGenerationStatus(`Track dividido en frases: ${result.splitCount} cortes y ${secondsRemoved} s de silencio eliminados.`, "is-live");
    }
  };
  els.podcastVideoTimeline.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='free-voice-toggle-track-enabled']")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleFreeVoiceTrackEnabled();
      return;
    }
    if (event.target.closest("[data-action='free-voice-delete-track']")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteFreeVoiceTrack();
      return;
    }
    if (event.target.closest("[data-action='free-voice-split-all-silences']")) {
      event.preventDefault();
      event.stopPropagation();
      void splitFreeVoiceTrackBySilence();
      return;
    }
    if (event.target.closest("[data-action='free-voice-add'], .podcast-free-voice-drop-hint")) {
      freeVoiceInput.click();
      event.stopPropagation();
      return;
    }
    const remove = event.target.closest("[data-action='free-voice-remove']");
    if (!remove) return;
    const id = remove.closest("[data-free-voice-id]")?.dataset.freeVoiceId;
    if (id) {
      if (selectedClipId === id) selectedClipId = "";
      saveFreeVoiceTrack((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== id) }), "free-voice-remove");
    }
    event.stopPropagation();
  }, true);
  document.getElementById("podcastInspectorSceneToolbar")?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-action='free-voice-split-all-silences']")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void splitFreeVoiceTrackBySilence();
  }, true);

  const hydrateMissingWaveforms = async () => {
    const session = getActiveSession();
    const sessionId = String(session?.id || "").trim();
    if (sessionId !== waveformCacheSessionId) {
      waveformAnalysisCache.clear();
      waveformCacheSessionId = sessionId;
    }
    const track = normalizeFreeVoiceTrack(getPodcastVideoConfig(session)?.freeVoiceTrack);
    if (!track.enabled) return;
    const referencedSessionId = (clip) => {
      const candidates = [clip?.storagePath, clip?.downloadUrl];
      for (const candidate of candidates) {
        const value = String(candidate || "").trim();
        if (!value) continue;
        let path = value;
        try {
          if (/^https?:\/\//i.test(value) || value.startsWith("/")) {
            const parsed = new URL(value, window.location.origin);
            path = parsed.searchParams.get("storagePath") || parsed.searchParams.get("url") || parsed.pathname;
          }
        } catch (_) { }
        try { path = decodeURIComponent(path); } catch (_) { }
        if (/^gs:\/\//i.test(path)) path = path.replace(/^gs:\/\//i, "").replace(/^[^/]+\//, "");
        const match = String(path).match(/(?:^|\/)podcaster\/sessions\/([^/]+)\//i);
        if (match) return String(match[1] || "").trim();
      }
      return "";
    };
    const visitedSources = new Set();
    const clips = track.clips.filter((clip) => {
      const sourceKey = clip.storagePath || clip.downloadUrl;
      const sourceSessionId = referencedSessionId(clip);
      // Los clips históricos pueden conservar una ruta de otra sesión. No
      // intentes firmarla usando la sesión activa: el backend responderá 404.
      if (sourceSessionId && sourceSessionId !== sessionId) return false;
      if (clip.isLoading || clip.waveformVersion >= FREE_VOICE_WAVEFORM_VERSION || visitedSources.has(sourceKey)
        || waveformAnalysisPending.has(`${sessionId}:${sourceKey}`)
        || waveformAnalysisCache.has(`${sessionId}:${sourceKey}`)
        || Number(waveformAnalysisRetryAt.get(`${sessionId}:${sourceKey}`) || 0) > Date.now()) return false;
      visitedSources.add(sourceKey);
      return true;
    });
    for (const clip of clips) {
      const sourceKey = clip.storagePath || clip.downloadUrl;
      const analysisKey = `${sessionId}:${sourceKey}`;
      waveformAnalysisPending.add(analysisKey);
      try {
        const source = resolveStorageAudioUrl?.(clip.downloadUrl || "", clip.storagePath || "");
        const playable = source ? await playbackController?.getBlobUrl?.(source, { persistent: false }) : "";
        if (!playable) continue;
        const response = await fetch(playable);
        if (!response.ok) continue;
        const analysis = await analyzeFreeVoiceAudio(await response.blob());
        const active = getActiveSession();
        if (String(active?.id || "").trim() !== sessionId) continue;
        waveformAnalysisCache.set(analysisKey, analysis);
        const currentTrack = normalizeFreeVoiceTrack(getPodcastVideoConfig(active)?.freeVoiceTrack);
        const currentClip = currentTrack.clips
          .find((item) => item.id === clip.id);
        if (!currentClip || (currentClip.storagePath !== clip.storagePath && currentClip.downloadUrl !== clip.downloadUrl)) continue;
        saveFreeVoiceTrack((track) => ({
          ...track,
          clips: track.clips.map((item) => {
            if ((item.storagePath || item.downloadUrl) !== sourceKey || item.id !== clip.id) return item;
            return {
              ...item,
              sourceDurationMs: Math.max(item.sourceDurationMs, analysis.durationMs),
              trimOutMs: item.trimOutMs >= item.sourceDurationMs - 1 ? analysis.durationMs : item.trimOutMs,
              waveform: analysis.waveform,
              waveformAnalyzed: true,
              waveformVersion: FREE_VOICE_WAVEFORM_VERSION,
              phraseRanges: analysis.phraseRanges
            };
          })
        }), "free-voice-waveform-hydrated");
      } catch (error) {
        if (Number(error?.status || 0) === 404 || /session_not_found|asset_not_found/i.test(String(error?.message || ""))) {
          waveformAnalysisRetryAt.set(`${sessionId}:${sourceKey}`, Date.now() + 60_000);
          continue;
        }
        console.warn("[podcaster-free-voice] No se pudo reconstruir la forma de onda:", error);
      } finally {
        waveformAnalysisPending.delete(analysisKey);
      }
    }
  };
  void hydrateMissingWaveforms();
  const waveformHydrationObserver = new MutationObserver(() => { void hydrateMissingWaveforms(); });
  waveformHydrationObserver.observe(timeline, { childList: true, subtree: true });
  timeline.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, input, select, textarea, [contenteditable='true']")) return;
    timeline.focus({ preventScroll: true });
  });
  timeline.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    const key = String(event.key || "").toLowerCase();
    if (key === "c") {
      setBladeMode(!bladeMode);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (key === "escape" && bladeMode) {
      setBladeMode(false);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if ((key === "delete" || key === "backspace") && selectedClipId) {
      const id = selectedClipId;
      selectedClipId = "";
      saveFreeVoiceTrack((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== id) }), "free-voice-remove");
      event.preventDefault();
      event.stopPropagation();
    }
  });
  timeline.addEventListener("focusout", (event) => {
    if (!timeline.contains(event.relatedTarget)) setBladeMode(false);
  });
  timeline.addEventListener("pointerenter", () => { pointerInsideTimeline = true; });
  timeline.addEventListener("pointermove", (event) => {
    pointerInsideTimeline = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    if (!bladeMode) return;
    razorCursor.hidden = false;
    razorCursor.style.left = `${event.clientX + 12}px`;
    razorCursor.style.top = `${event.clientY - 24}px`;
    const chip = event.target.closest(".podcast-free-voice-chip[data-free-voice-id]");
    if (chip) chip.style.setProperty("--pod-free-voice-cut-x", `${event.clientX - chip.getBoundingClientRect().left}px`);
  });
  timeline.addEventListener("pointerleave", () => { pointerInsideTimeline = false; razorCursor.hidden = true; });
  timeline.addEventListener("click", (event) => {
    const chip = event.target.closest(".podcast-free-voice-chip[data-free-voice-id]");
    if (!chip || event.target.closest("button")) return;
    const id = chip.dataset.freeVoiceId;
    if (!bladeMode) { selectedClipId = id; markSelectedClip(); return; }
    const track = normalizeFreeVoiceTrack(getPodcastVideoConfig(getActiveSession())?.freeVoiceTrack);
    const clip = track.clips.find((item) => item.id === id);
    if (!clip) return;
    if (track.clips.length >= 200) {
      setGenerationStatus("Esta pista alcanzó el máximo de 200 fragmentos.", "");
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const rect = chip.getBoundingClientRect();
    const durationMs = clip.trimOutMs - clip.trimInMs;
    const offsetPx = Math.max(0, event.clientX - rect.left);
    const naturalWidthPx = timelineMsToPx(durationMs, getActiveSession());
    const cutMs = Math.max(0, Math.min(durationMs, Math.round(rect.width > naturalWidthPx
      ? offsetPx / Math.max(1, rect.width) * durationMs
      : timelinePxToMs(offsetPx, getActiveSession()))));
    if (cutMs < FREE_VOICE_MIN_CLIP_MS || clip.trimOutMs - clip.trimInMs - cutMs < FREE_VOICE_MIN_CLIP_MS) {
      setGenerationStatus("Deja al menos 0.1 s a cada lado del corte.", "");
    } else {
      const newId = globalThis.crypto?.randomUUID?.() || `voice-cut-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      selectedClipId = newId;
      saveFreeVoiceTrack((track) => splitFreeVoiceClip(track, id, cutMs, newId), "free-voice-split");
      setGenerationStatus("Clip de voz dividido. Arrastra cada parte o pulsa Supr para eliminarla.", "is-live");
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  const isFreeVoiceDropTarget = (target) => {
    return Boolean(target?.closest?.('[data-track-id="free-voice"], .podcast-free-voice-lane'));
  };
  els.podcastVideoTimeline.addEventListener("dragover", (event) => {
    if (!isFreeVoiceDropTarget(event.target)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const row = event.target.closest('[data-track-id="free-voice"]');
    row?.classList.add("is-drag-over");
    const lane = event.target.closest(".podcast-free-voice-lane") || row?.querySelector?.(".podcast-free-voice-lane");
    lane?.classList.add("is-drag-over");
  });
  els.podcastVideoTimeline.addEventListener("dragleave", (event) => {
    const row = event.target.closest('[data-track-id="free-voice"]');
    if (row && (!event.relatedTarget || !row.contains(event.relatedTarget))) {
      row.classList.remove("is-drag-over");
      row.querySelector(".podcast-free-voice-lane")?.classList.remove("is-drag-over");
    }
  });
  els.podcastVideoTimeline.addEventListener("drop", (event) => {
    if (!isFreeVoiceDropTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.target.closest('[data-track-id="free-voice"]');
    row?.classList.remove("is-drag-over");
    row?.querySelector(".podcast-free-voice-lane")?.classList.remove("is-drag-over");
    void addFreeVoiceFiles(Array.from(event.dataTransfer?.files || []));
  });
  let freeVoiceDrag = null;
  els.podcastVideoTimeline.addEventListener("mousedown", (event) => {
    const chip = event.target.closest(".podcast-free-voice-chip[data-free-voice-id]");
    if (!chip || event.button !== 0 || event.target.closest("[data-action='free-voice-remove']")) return;
    if (bladeMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const clip = normalizeFreeVoiceTrack(getPodcastVideoConfig(getActiveSession())?.freeVoiceTrack).clips.find((item) => item.id === chip.dataset.freeVoiceId);
    if (!clip) return;
    freeVoiceDrag = { clip, chip, clientX: event.clientX, mode: event.target.closest("[data-free-voice-trim]")?.dataset.freeVoiceTrim || "move" };
    if (freeVoiceDrag.mode === "start" || freeVoiceDrag.mode === "end") chip.classList.add("is-trimming");
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener("mousemove", (event) => {
    if (!freeVoiceDrag) return;
    const deltaMs = Math.round(timelinePxToMs(event.clientX - freeVoiceDrag.clientX, getActiveSession()));
    const clip = freeVoiceDrag.clip;
    const appliedStartDeltaMs = Math.max(-Math.min(clip.startMs, clip.trimInMs), Math.min(clip.trimOutMs - clip.trimInMs - FREE_VOICE_MIN_CLIP_MS, deltaMs));
    const next = freeVoiceDrag.mode === "start"
      ? { startMs: clip.startMs + appliedStartDeltaMs, trimInMs: clip.trimInMs + appliedStartDeltaMs }
      : freeVoiceDrag.mode === "end"
        ? { trimOutMs: Math.max(clip.trimInMs + FREE_VOICE_MIN_CLIP_MS, Math.min(clip.sourceDurationMs, clip.trimOutMs + deltaMs)) }
        : { startMs: Math.max(0, clip.startMs + deltaMs) };
    freeVoiceDrag.next = next;
    const preview = { ...clip, ...next };
    freeVoiceDrag.chip.style.left = `${timelineMsToPx(preview.startMs, getActiveSession())}px`;
    freeVoiceDrag.chip.style.width = `${Math.max(18, timelineMsToPx(preview.trimOutMs - preview.trimInMs, getActiveSession()) - 4)}px`;
    if (freeVoiceDrag.mode === "start" || freeVoiceDrag.mode === "end") {
      const waveform = freeVoiceDrag.chip.querySelector(".podcast-free-voice-waveform");
      if (waveform) waveform.style.left = `${-timelineMsToPx(preview.trimInMs, getActiveSession())}px`;
    }
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener("mouseup", (event) => {
    if (!freeVoiceDrag) return;
    const drag = freeVoiceDrag;
    freeVoiceDrag = null;
    drag.chip.classList.remove("is-trimming");
    if (drag.next && JSON.stringify(drag.next) !== "{}") {
      saveFreeVoiceTrack((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === drag.clip.id ? { ...clip, ...drag.next } : clip) }), "free-voice-drag");
    }
    event.stopImmediatePropagation();
  }, true);
}
