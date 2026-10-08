import { appendFreeVideoClip, normalizeFreeVideoTrack } from "./podcaster-free-video-track.js";

const ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const EFFECTS = ["none", "pan-left-right", "pan-right-left", "pan-up-down", "pan-down-up"];

function measureVideoDurationMs(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (duration, error) => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(duration);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(Math.round(video.duration * 1000));
    video.onerror = () => finish(0, new Error("No se pudo leer la duración del video."));
    video.src = url;
  });
}

export function createPodcasterFreeVideoEditor(deps = {}) {
  const { els, getActiveSession, getPodcastVideoConfig, upsertPodcastVideoConfig,
    flushSessionLocalPersistNow, renderPodcastVideoTimeline, playbackController,
    uploadPodcasterAsset, saveSessionToCloud, setGenerationStatus, timelinePxToMs, timelineMsToPx,
    resolveStorageVideoUrl } = deps;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ACCEPT;
  fileInput.multiple = true;
  fileInput.hidden = true;
  document.body.appendChild(fileInput);
  const saveTrack = (mutator, reason = "free-video-edit") => {
    upsertPodcastVideoConfig((cfg) => ({ ...cfg, freeVideoTrack: mutator(normalizeFreeVideoTrack(cfg.freeVideoTrack)) }),
      { persist: true, autosaveReason: reason });
    flushSessionLocalPersistNow(String(getActiveSession()?.id || ""), reason);
    renderPodcastVideoTimeline(getActiveSession(), { force: true, forceStructure: true });
    syncPreview(Number(playbackController?.state?.currentMs || 0));
  };
  const addFiles = async (files, replaceId = "") => {
    const sessionId = String(getActiveSession()?.id || "").trim();
    if (!sessionId || !files.length) return;
    for (const file of files) {
      try {
        const extension = String(file.name || "").split(".").pop()?.toLowerCase();
        const mimeType = file.type || ({ mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" })[extension];
        if (!["video/mp4", "video/webm", "video/quicktime"].includes(mimeType)) throw new Error("Usa MP4, WebM o MOV.");
        if (file.size > 80 * 1024 * 1024) throw new Error("El archivo supera el límite de 80 MB de Storage.");
        const id = globalThis.crypto?.randomUUID?.() || `video-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const localBlobUrl = typeof URL?.createObjectURL === "function" ? URL.createObjectURL(file) : "";
        const fallbackStoragePath = `local://free-video/${sessionId}/${id}.${extension || "mp4"}`;

        const initialDurationMs = 5000;
        const optimisticMedia = {
          name: file.name,
          storagePath: fallbackStoragePath,
          downloadUrl: localBlobUrl,
          mimeType,
          isLoading: true
        };

        // 1. Renderizado optimista instantáneo con spinner
        saveTrack((track) => {
          if (!replaceId) return appendFreeVideoClip(track, optimisticMedia, initialDurationMs, id);
          return {
            ...track,
            clips: track.clips.map((clip) => clip.id === replaceId
              ? {
                ...clip,
                name: file.name,
                storagePath: optimisticMedia.storagePath,
                downloadUrl: optimisticMedia.downloadUrl,
                mimeType,
                sourceDurationMs: initialDurationMs,
                trimInMs: 0,
                trimOutMs: initialDurationMs,
                isLoading: true
              }
              : clip)
          };
        }, replaceId ? "free-video-replace-optimistic" : "free-video-optimistic-add");
        setGenerationStatus(`Cargando video: ${file.name}…`, "is-busy");

        const targetReplaceId = replaceId;
        replaceId = "";

        // 2. Medir duración real del video y actualizar clip asíncronamente
        void (async () => {
          try {
            const measuredDurationMs = await measureVideoDurationMs(file);
            const durationMs = Number.isFinite(measuredDurationMs) && measuredDurationMs >= 500 && measuredDurationMs <= 3_600_000
              ? Math.round(measuredDurationMs)
              : initialDurationMs;
            const targetId = targetReplaceId || id;
            saveTrack((track) => ({
              ...track,
              clips: track.clips.map((clip) => clip.id === targetId ? {
                ...clip,
                sourceDurationMs: durationMs,
                trimOutMs: clip.trimInMs + durationMs,
                isLoading: false
              } : clip)
            }), "free-video-measured");
            setGenerationStatus(`Video añadido: ${file.name}`, "is-live");

            // 3. Subir en segundo plano si Storage está disponible
            const uploadFile = mimeType === file.type ? file : new File([file], file.name, { type: mimeType });
            const options = { kind: "scene-video", sessionId, rowId: `free-video-${id}` };
            let upload;
            try { upload = await uploadPodcasterAsset(uploadFile, options); }
            catch (error) {
              if (Number(error?.status || 0) === 404 || /podcaster_session_not_found/.test(String(error?.message || ""))) {
                await saveSessionToCloud(sessionId, { render: false, silent: true });
                upload = await uploadPodcasterAsset(uploadFile, options);
              }
            }
            const media = upload?.media;
            if (media?.storagePath && String(getActiveSession()?.id || "") === sessionId) {
              saveTrack((track) => ({
                ...track,
                clips: track.clips.map((clip) => clip.id === targetId ? {
                  ...clip,
                  storagePath: media.storagePath,
                  downloadUrl: media.downloadUrl || clip.downloadUrl
                } : clip)
              }), targetReplaceId ? "free-video-replace-uploaded" : "free-video-uploaded");
            }
          } catch (measureOrUploadErr) {
            console.warn("[podcaster-free-video] Error en medición o subida:", measureOrUploadErr);
            const targetId = targetReplaceId || id;
            saveTrack((track) => ({
              ...track,
              clips: track.clips.map((clip) => clip.id === targetId ? { ...clip, isLoading: false } : clip)
            }), "free-video-measured-fallback");
          }
        })();
      } catch (error) { setGenerationStatus(`No se pudo añadir ${file.name}: ${error.message}`, ""); }
    }
  };
  let pendingReplaceId = "";
  fileInput.addEventListener("change", () => {
    void addFiles(Array.from(fileInput.files || []), pendingReplaceId);
    pendingReplaceId = "";
    fileInput.value = "";
  });
  const getClip = (id) => normalizeFreeVideoTrack(getPodcastVideoConfig(getActiveSession())?.freeVideoTrack)
    .clips.find((clip) => clip.id === id);
  const lane = els.podcastVideoTimeline;
  let openMenu = null;
  let effectPicker = null;
  const closeMenu = () => {
    effectPicker?.remove();
    effectPicker = null;
    openMenu?.remove();
    openMenu = null;
  };
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action?.startsWith("free-video-")) { if (openMenu && !event.target.closest(".podcast-free-video-menu")) closeMenu(); return; }
    const chip = event.target.closest("[data-free-video-id]");
    const id = chip?.dataset.freeVideoId || "";
    event.stopImmediatePropagation();
    if (action === "free-video-add") { fileInput.click(); return; }
    if (!id) return;
    if (action === "free-video-menu") {
      if (openMenu?.dataset.freeVideoId === id) { closeMenu(); return; }
      closeMenu();
      const menu = chip.querySelector(".podcast-free-video-menu")?.cloneNode(true);
      if (!menu) return;
      const rect = event.target.closest("button").getBoundingClientRect();
      menu.dataset.freeVideoId = id;
      menu.hidden = false;
      menu.classList.add("is-visible");
      menu.style.position = "fixed";
      menu.style.left = `${Math.min(rect.left, window.innerWidth - 290)}px`;
      menu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 84)}px`;
      document.body.appendChild(menu);
      openMenu = menu;
      return;
    }
    if (action === "free-video-effect") {
      effectPicker?.remove();
      effectPicker = document.createElement("div");
      effectPicker.className = "podcast-free-video-effect-picker";
      effectPicker.dataset.freeVideoId = id;
      const labels = { none: "Sin efecto", "pan-left-right": "Panorámica →", "pan-right-left": "Panorámica ←", "pan-up-down": "Panorámica ↓", "pan-down-up": "Panorámica ↑" };
      EFFECTS.forEach((effect) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = "free-video-apply-effect";
        button.dataset.effect = effect;
        button.textContent = labels[effect];
        button.setAttribute("aria-pressed", String(getClip(id)?.mediaMotionPreset === effect));
        effectPicker.appendChild(button);
      });
      const rect = event.target.closest("button").getBoundingClientRect();
      effectPicker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 190))}px`;
      effectPicker.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 200)}px`;
      document.body.appendChild(effectPicker);
      return;
    }
    closeMenu();
    if (action === "free-video-replace") { pendingReplaceId = id; fileInput.click(); return; }
    if (action === "free-video-play") {
      void playbackController.play(getClip(id)?.startMs || 0);
      return;
    }
    if (action === "free-video-share") {
      const clip = getClip(id);
      const url = clip?.downloadUrl || resolveStorageVideoUrl?.("", clip?.storagePath || "", { mimeType: clip?.mimeType });
      if (url) void navigator.clipboard.writeText(url).then(() => setGenerationStatus("Enlace de video copiado", "is-live"))
        .catch(() => setGenerationStatus("No se pudo copiar el enlace", ""));
      return;
    }
    if (action === "free-video-remove") saveTrack((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== id) }), "free-video-remove");
    if (action === "free-video-duplicate") saveTrack((track) => {
      const clip = track.clips.find((item) => item.id === id);
      if (!clip) return track;
      const endMs = track.clips.reduce((max, item) => Math.max(max, item.startMs + item.trimOutMs - item.trimInMs), 0);
      return { ...track, clips: [...track.clips, { ...clip,
        id: globalThis.crypto?.randomUUID?.() || `video-${Date.now()}`,
        startMs: endMs }] };
    }, "free-video-duplicate");
    if (action === "free-video-layout") saveTrack((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === id
      ? { ...clip, visualLayoutMode: clip.visualLayoutMode === "blur-backdrop" ? "default" : "blur-backdrop" } : clip) }), "free-video-layout");
    if (action === "free-video-apply-effect" && EFFECTS.includes(event.target.closest("button")?.dataset.effect)) {
      const effect = event.target.closest("button").dataset.effect;
      saveTrack((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === id
        ? { ...clip, mediaMotionPreset: effect } : clip) }), "free-video-effect");
    }
  }, true);
  const isFreeVideoDropTarget = (target) => {
    return Boolean(target?.closest?.('[data-track-id="free-video"], .podcast-free-video-lane'));
  };
  lane.addEventListener("dragover", (event) => {
    if (!isFreeVideoDropTarget(event.target)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const row = event.target.closest('[data-track-id="free-video"]');
    row?.classList.add("is-drag-over");
    const videoLane = event.target.closest(".podcast-free-video-lane") || row?.querySelector?.(".podcast-free-video-lane");
    videoLane?.classList.add("is-drag-over");
  });
  lane.addEventListener("dragleave", (event) => {
    const row = event.target.closest('[data-track-id="free-video"]');
    if (row && (!event.relatedTarget || !row.contains(event.relatedTarget))) {
      row.classList.remove("is-drag-over");
      row.querySelector(".podcast-free-video-lane")?.classList.remove("is-drag-over");
    }
  });
  lane.addEventListener("drop", (event) => {
    if (!isFreeVideoDropTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.target.closest('[data-track-id="free-video"]');
    row?.classList.remove("is-drag-over");
    row?.querySelector(".podcast-free-video-lane")?.classList.remove("is-drag-over");
    void addFiles(Array.from(event.dataTransfer?.files || []));
  });
  let drag = null;
  lane.addEventListener("mousedown", (event) => {
    const chip = event.target.closest(".podcast-free-video-chip[data-free-video-id]");
    if (!chip || event.button !== 0 || event.target.closest("[data-action]")) return;
    const clip = getClip(chip.dataset.freeVideoId);
    if (!clip) return;
    drag = { clip, chip, clientX: event.clientX, mode: event.target.closest("[data-free-video-trim]")?.dataset.freeVideoTrim || "move" };
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  document.addEventListener("mousemove", (event) => {
    if (!drag) return;
    const deltaMs = Math.round(timelinePxToMs(event.clientX - drag.clientX, getActiveSession()));
    const clip = drag.clip;
    const startDeltaMs = Math.max(-Math.min(clip.startMs, clip.trimInMs), Math.min(clip.trimOutMs - clip.trimInMs - 500, deltaMs));
    drag.next = drag.mode === "start"
      ? { startMs: clip.startMs + startDeltaMs, trimInMs: clip.trimInMs + startDeltaMs }
      : drag.mode === "end" ? { trimOutMs: Math.max(clip.trimInMs + 500, Math.min(clip.sourceDurationMs, clip.trimOutMs + deltaMs)) }
        : { startMs: Math.max(0, clip.startMs + deltaMs) };
    const preview = { ...clip, ...drag.next };
    drag.chip.style.left = `${timelineMsToPx(preview.startMs, getActiveSession())}px`;
    drag.chip.style.width = `${Math.max(12, timelineMsToPx(preview.trimOutMs - preview.trimInMs, getActiveSession()) - 4)}px`;
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener("mouseup", (event) => {
    if (!drag) return;
    const finished = drag; drag = null;
    if (finished.next) saveTrack((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === finished.clip.id ? { ...clip, ...finished.next } : clip) }), "free-video-drag");
    event.stopImmediatePropagation();
  }, true);

  // The video lane is visual-only. The audio remains on its dedicated timeline tracks.
  const overlay = document.createElement("video");
  overlay.className = "podcast-free-video-stage-overlay";
  overlay.muted = true;
  overlay.playsInline = true;
  overlay.preload = "auto";
  overlay.hidden = true;
  const syncPreview = (currentMs) => {
    const stage = els.podcastVideoStage?.querySelector(".podcast-video-preview");
    if (stage && overlay.parentElement !== stage) stage.appendChild(overlay);
    const track = normalizeFreeVideoTrack(getPodcastVideoConfig(getActiveSession())?.freeVideoTrack);
    const clip = track.enabled ? track.clips.filter((item) => currentMs >= item.startMs && currentMs < item.startMs + item.trimOutMs - item.trimInMs).at(-1) : null;
    if (!clip || !stage) { overlay.hidden = true; overlay.pause(); return; }
    const src = resolveStorageVideoUrl?.(clip.downloadUrl || "", clip.storagePath || "", { mimeType: clip.mimeType }) || clip.downloadUrl || clip.storagePath;
    if (overlay.dataset.clipId !== clip.id || overlay.dataset.logicalSrc !== src) {
      overlay.dataset.clipId = clip.id;
      overlay.dataset.logicalSrc = src;
      overlay.removeAttribute("src");
      overlay.load();
      Promise.resolve(playbackController.getBlobUrl?.(src, { persistent: true }) || src).then((mediaUrl) => {
        if (overlay.dataset.clipId !== clip.id || overlay.dataset.logicalSrc !== src) return;
        overlay.src = mediaUrl || src;
        overlay.load();
        syncPreview(Number(playbackController.state.currentMs || 0));
      }).catch(() => {
        if (overlay.dataset.clipId === clip.id) overlay.hidden = true;
      });
    }
    overlay.hidden = false;
    overlay.style.objectFit = clip.visualLayoutMode === "blur-backdrop" ? "contain" : "cover";
    overlay.dataset.motion = clip.mediaMotionPreset;
    overlay.style.animationDuration = `${Math.max(0.5, (clip.trimOutMs - clip.trimInMs) / 1000)}s`;
    const sourceSec = (clip.trimInMs + currentMs - clip.startMs) / 1000;
    overlay.style.animationDelay = `${-Math.max(0, (currentMs - clip.startMs) / 1000)}s`;
    overlay.style.animationPlayState = playbackController.state.isPlaying ? "running" : "paused";
    overlay.playbackRate = Math.max(0.5, Math.min(4, Number(playbackController.deps?.getPlaybackSpeed?.() || 1) || 1));
    if (Number.isFinite(overlay.duration) && Math.abs(overlay.currentTime - sourceSec) > 0.25) overlay.currentTime = sourceSec;
    if (playbackController.state.isPlaying) void overlay.play().catch(() => {});
    else overlay.pause();
  };
  overlay.addEventListener("loadedmetadata", () => syncPreview(Number(playbackController.state.currentMs || 0)));
  playbackController.on("timeupdate", ({ currentMs }) => syncPreview(currentMs));
  playbackController.on("pause", () => overlay.pause());
  playbackController.on("stop", () => { overlay.pause(); overlay.hidden = true; });
  playbackController.on("play", ({ currentMs }) => syncPreview(currentMs));
  playbackController.on("seek", ({ currentMs }) => syncPreview(currentMs));
}
