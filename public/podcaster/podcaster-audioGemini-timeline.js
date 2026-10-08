import { authFetchJson } from "../js/api-client-podcaster.js";
import { waitForPodcasterJob } from "./podcaster-job-polling.js?v=2026-08-06.1";

// --- State ---
import { podcasterGenerationShared, registerPodcasterGenerationShared } from "./podcaster-generation-shared.js";

const dialogueAudioGenerationPending = podcasterGenerationShared.dialogueAudioGenerationPending;

const computeDurationSpeedMultiplier = (text, target, limits) => {
  return (typeof window.computeDurationSpeedMultiplier === "function")
    ? window.computeDurationSpeedMultiplier(text, target, limits)
    : 1;
};

function normalizeDialogueAudioRecord(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const rawUrl = String(raw.downloadUrl || raw.audioUrl || raw.url || "").trim();
  const rawStoragePath = String(raw.storagePath || raw.audioStoragePath || raw.path || "").trim();
  return {
    ...raw,
    downloadUrl: rawUrl || raw.url || "",
    storagePath: rawStoragePath || raw.storagePath || "",
    audioStoragePath: rawStoragePath || raw.audioStoragePath || "",
    rowId: String(raw.rowId || "").trim()
  };
}

/**
 * Preloads dialogue audio through the persistent playback controllers. The metadata probes below remain
 * only for duration reconciliation; they are no longer the preview playback cache.
 */
async function preloadAllDialogueAudios(session = null, options = {}) {
  const activeSession = session || window.getActiveSession();
  if (!activeSession) return false;
  const audioMap = window.getDialogueAudioMap(activeSession);
  if (!audioMap) return false;
  const keys = Object.keys(audioMap);
  if (!keys.length) return false;

  const targetRowIds = Array.isArray(options.rowIds)
    ? options.rowIds.map((rowId) => String(rowId || "").trim()).filter(Boolean)
    : [];
  const controllerTasks = [window.playbackController, window.exportPreviewController]
    .filter((controller) => controller && typeof controller.prewarmDialogueAudios === "function")
    .map((controller) => {
      if (targetRowIds.length && typeof controller.prewarmDialogueAudioRows === "function") {
        return controller.prewarmDialogueAudioRows(activeSession, targetRowIds);
      }
      return controller.prewarmDialogueAudios(activeSession);
    });

  keys.forEach((rowId) => {
    if (targetRowIds.length && !targetRowIds.includes(String(rowId || "").trim())) return;
    const audioClip = audioMap[rowId];
    if (!audioClip) return;
    const audioSrc = window.resolveStorageAudioUrl(audioClip.downloadUrl || "", audioClip.storagePath || "");
    if (!audioSrc) return;

    const resolvePlayableAudioSrc = async (src = "") => {
      const cleanSrc = String(src || "").trim();
      if (!cleanSrc) return "";
      const needsAuthorizedBlob = cleanSrc.startsWith("podcaster-local-media:")
        || /\/api\/assets\/proxy-media\?/i.test(cleanSrc);
      if (!needsAuthorizedBlob) return cleanSrc;
      if (window?.playbackController?.getBlobUrl) {
        return (await window.playbackController.getBlobUrl(cleanSrc, { persistent: true })) || "";
      }
      return "";
    };

    // Si ya tenemos una duración medida, no volvemos a cargar
    if (window.podcastVideoState?.montageAudioActualDurationsMs?.[rowId]) {
      return;
    }

    (async () => {
      const playableAudioSrc = await resolvePlayableAudioSrc(audioSrc);
      if (!playableAudioSrc) return;

      // Crear un elemento Audio temporal en segundo plano para obtener metadatos
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.src = playableAudioSrc;
      audio.preload = "metadata";

      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", onLoaded);
        audio.removeEventListener("error", onError);
        audio.src = "";
        try { audio.load(); } catch (_) {}
      };

      const onLoaded = () => {
        const current = window.getActiveSession();
        const currentClip = window.getDialogueAudioMap(current)?.[rowId];
        if (current?.id !== activeSession.id || current?.activeThreadId !== activeSession.activeThreadId || String(currentClip?.storagePath || currentClip?.downloadUrl || "") !== String(audioMap[rowId]?.storagePath || audioMap[rowId]?.downloadUrl || "")) { cleanup(); return; }
        const duration = Number(audio.duration);
        if (Number.isFinite(duration) && duration > 0) {
          const nextMs = Math.round(duration * 1000);
          if (!window.podcastVideoState.montageAudioActualDurationsMs) {
            window.podcastVideoState.montageAudioActualDurationsMs = {};
          }
          if (Math.abs(nextMs - (window.podcastVideoState.montageAudioActualDurationsMs[rowId] || 0)) > 100) {
            window.podcastVideoState.montageAudioActualDurationsMs[rowId] = nextMs;

            window.invalidateStudioRuntimeCache?.();

            // Reconciliar en segundo plano para que el geminiDialogueTrack tenga la duración real
            try {
              window.syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
            } catch (_) {}


            // Forzar renderizado de la línea de tiempo para actualizar el ancho de los chips
            if (options.suppressTimelineRender !== true) {
              window.renderPodcastVideoTimeline(window.getActiveSession(), { force: true, reason: "audio-metadata-loaded" });
            }
          }
        }
        cleanup();
      };

      const onError = () => {
        cleanup();
      };

      audio.addEventListener("loadedmetadata", onLoaded);
      audio.addEventListener("error", onError);
    })();


  });
  await Promise.allSettled(controllerTasks);
  return true;
}

/**
 * Generates a single dialogue audio clip for a given row.
 */
async function generateDialogueAudioForRow(rowId = "", options = {}) {
  try {
    window.flushScriptEditorVoiceDraftsToSession?.();
  } catch (_) {
    // best-effort
  }
  const key = String(rowId || "").trim();
  const session = window.getActiveSession();
  const sessionId = String(session?.id || "").trim();
  if (!sessionId || !key) return null;
  const startingThreadId = String(session?.activeThreadId || "");
  let selectionContext = null;
  const rows = window.getSessionRows(session);
  const row = rows.find((item) => String(item?.id || "").trim() === key);
  if (!row) return null;

  const pendingKey = `${sessionId}:${key}`;
  if (dialogueAudioGenerationPending.has(pendingKey)) return null;

  const speechConfig = window.resolveSpeechGenerationConfig(row, session);
  const directionSource = row?.ttsDirectionConfig || session?.ttsDirectionDefaults || {};
  const ttsDirection = window.normalizeTtsDirectionConfig?.(directionSource) || directionSource;
  const voiceName = speechConfig.voiceName;
  const dialogueText = window.buildTargetSpeechLine(row);
  const text = dialogueText;
  const targetDurationSec = Math.max(0, Number(row?.durationSec || 0) || 0);
  const speechRateHint = computeDurationSpeedMultiplier(dialogueText, targetDurationSec);
  const regenerate = options.regenerate === true;
  const silent = options.silent === true;
  let previousAudioClip = window.resolveDialogueAudioForRow?.(session, key) || null;

  dialogueAudioGenerationPending.add(pendingKey);
  if (!silent) window.setGenerationStatus(`Generando audio Gemini para escena ${window.resolveSceneNumberByRowId(key, session)}...`, "is-busy");

  if (sessionId && typeof window.saveSessionToCloud === "function") {
    try {
      await window.saveSessionToCloud(sessionId, { render: false, silent: true });
    } catch (_) {
      // best-effort pre-save
    }
  }

  // Capturar la revisión después del pre-save. Este puede hidratar la sesión
  // desde Firestore; usar la revisión anterior hace que el commit del job parezca
  // una selección concurrente aunque nadie haya cambiado el audio.
  const generationSession = window.getActiveSession();
  if (generationSession?.id !== sessionId
    || String(generationSession?.activeThreadId || "") !== startingThreadId) {
    dialogueAudioGenerationPending.delete(pendingKey);
    if (!silent) {
      window.setGenerationStatus("La sesión o versión activa cambió. Vuelve a iniciar la generación.", "is-error");
      window.addChatMessage("system", "No se generó el audio porque cambió la sesión o versión activa.");
    }
    return null;
  }
  selectionContext = window.PodcasterSceneMedia.capture(generationSession, key, "audio");
  previousAudioClip = window.resolveDialogueAudioForRow?.(generationSession, key) || previousAudioClip;

  try {
    const body = {
      selectionContext,
      sessionId,
      rowId: key,
      speaker: String(row?.speaker || "").trim(),
      speakerLabel: String(row?.speaker || "").trim(),
      speakerName: window.resolveSpeakerDisplayName(row?.speaker, session),
      voiceName,
      speechLocale: speechConfig.speechLocale,
      localeInstruction: speechConfig.localeInstruction,
      text,
      targetSpeechLine: text,
      targetDurationSec,
      speechRateHint,
      regenerate,
      disfluencyConfig: row?.disfluencyConfig || null,
      ttsDirectionConfig: ttsDirection,
      ttsDirection
    };

    let accepted = null;
    try {
      accepted = await authFetchJson("/api/podcaster/dialogue-audio/generate", {
        method: "POST",
        body: JSON.stringify(body),
        preferRemote: true
      });
    } catch (postError) {
      const isSessionNotFound = String(postError?.message || postError?.code || "").includes("podcaster_session_not_found") || Number(postError?.status) === 404;
      if (isSessionNotFound && sessionId && typeof window.saveSessionToCloud === "function") {
        try {
          await window.saveSessionToCloud(sessionId, { render: false, silent: true });
          accepted = await authFetchJson("/api/podcaster/dialogue-audio/generate", {
            method: "POST",
            body: JSON.stringify(body),
            preferRemote: true
          });
        } catch (retryError) {
          throw retryError;
        }
      } else {
        throw postError;
      }
    }

    const resp = await waitForPodcasterJob(accepted, {
      onUpdate: (job) => {
        if (!silent) window.setGenerationStatus(String(job?.hint || "Generando audio con Vertex AI…"), "is-busy");
      }
    });

    if (!resp?.ok) throw new Error(resp?.error || "Error al generar audio.");

    const finalAudio = normalizeDialogueAudioRecord(resp.dialogueAudio);
    finalAudio.playbackRate = previousAudioClip?.playbackRate || row?.playbackRate || 1;
    const serverApplication = String(resp?.result?.application?.status || "").toLowerCase();
    let application = await window.PodcasterSceneMedia.apply(selectionContext, finalAudio);
    if (application.status !== "applied") {
      // The backend may have committed the generated clip successfully. A local
      // session snapshot can lag behind that transaction; refresh once and accept
      // only the exact operation produced by this request.
      if (serverApplication === "applied" && window.PodcasterUI?.refreshSession) {
        await window.PodcasterUI.refreshSession();
        const currentSession = window.getActiveSession();
        const currentClip = window.resolveDialogueAudioForRow?.(currentSession, key);
        if (currentSession?.id === sessionId
          && String(currentSession?.activeThreadId || "") === selectionContext.threadId
          && String(currentClip?.selectionOperationId || "") === selectionContext.requestId) {
          application = { status: "applied", clip: currentClip };
        }
      }
      if (application.status !== "applied") {
        const error = new Error("El audio se generó, pero una selección más reciente de esta escena impidió aplicarlo.");
        error.code = "AUDIO_SELECTION_SUPERSEDED";
        throw error;
      }
    }
    const activeNow = window.getActiveSession();
    if (activeNow?.id !== sessionId || String(activeNow?.activeThreadId || "") !== selectionContext.threadId) return application.clip;
    // La duración medida pertenece al blob anterior. Obliga al probe del chip
    // a medir el archivo regenerado incluso cuando conserva el mismo rowId/path.
    if (window.podcastVideoState?.montageAudioActualDurationsMs) {
      delete window.podcastVideoState.montageAudioActualDurationsMs[key];
    }

    // Reconstruir primero el track y, sobre todo, reemplazar el snapshot de sesión
    // que conservan los controladores. Las escenas de biblioteca pública nacen sin
    // audio explícito: si el controller mantiene ese snapshot, ignora el clip recién
    // generado y puede intentar usar un blob anterior que ya fue revocado.
    window.syncGeminiDialogueTrackWithRuntime({
      render: false,
      preserveStartMs: true,
      forceDurationFromAudio: false
    });
    const refreshedSession = window.getActiveSession();
    const refreshedConfig = window.getPodcastVideoConfig?.(refreshedSession);
    [window.playbackController, window.exportPreviewController]
      .filter((controller) => controller && typeof controller.sync === "function")
      .forEach((controller) => controller.sync(refreshedSession, refreshedConfig));

    // Medir la nueva duración e incorporar al timeline inmediatamente.
    await preloadAllDialogueAudios(refreshedSession, {
      rowIds: [key],
      suppressTimelineRender: true
    });

    window.renderPodcastVideoTimeline?.(refreshedSession, { force: true, reason: "dialogue-audio-regenerated" });
    window.syncPodcastStudioInspector?.(refreshedSession);
    window.scheduleSessionLocalPersist?.("dialogue-audio-regenerated");

    return finalAudio;
  } catch (error) {
    if (error?.code !== "AUDIO_SELECTION_SUPERSEDED") {
      console.error("[podcaster] audio generation error", error);
    }
    if (!silent) {
      const isAuthError = error.message === "AUTH_REQUIRED" || error.code === "AUTH_REQUIRED";
      const userMessage = isAuthError
        ? "Tu sesión expiró. Recarga la página e inicia sesión nuevamente para generar audio."
        : `Error audio escena ${window.resolveSceneNumberByRowId(key, session)}: ${error.message}`;
      window.addChatMessage("system", userMessage);
    }
    throw error;
  } finally {
    dialogueAudioGenerationPending.delete(pendingKey);
  }
}

function getRegenerableGeminiAudioRows(session = null) {
  const activeSession = session || window.getActiveSession();
  const rows = window.getSessionRows(activeSession);
  return rows.filter((row) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return false;
    const speakerLabel = String(row?.speaker || "").trim();
    if (!speakerLabel) return false;
    const targetSpeechLine = String(window.buildTargetSpeechLine(row, activeSession) || row?.text || "").trim();
    return Boolean(targetSpeechLine);
  });
}

async function regenerateAllGeminiDialogueAudios(session = null) {
  try {
    window.flushScriptEditorVoiceDraftsToSession?.();
  } catch (_) {
    // best-effort
  }
  await window.refreshRuntimeFeatureCapabilities();
  const activeSession = window.getActiveSession() || session;
  if (!activeSession) return { total: 0, generated: 0, failed: 0 };
  const sessionId = String(activeSession?.id || "").trim();
  if (sessionId && typeof window.saveSessionToCloud === "function") {
    try {
      await window.saveSessionToCloud(sessionId, { render: false, silent: true });
    } catch (_) {
      // best-effort
    }
  }
  const rows = getRegenerableGeminiAudioRows(activeSession);
  const total = rows.length;
  if (!total) {
    window.setGenerationStatus("No hay escenas válidas para regenerar audios Gemini.", "");
    return { total: 0, generated: 0, failed: 0 };
  }
  if (window.runtimeFeatureState.dialogueAudioUnavailable) {
    window.setGenerationStatus("El backend actual no permite generar audios por escena.", "");
    return { total, generated: 0, failed: total };
  }
  let generated = 0;
  let failed = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowId = String(row?.id || "").trim();
    if (!rowId) continue;
    const step = index + 1;
    window.updateGeminiAudioGenerationAnimation?.({
      current: index,
      total,
      generated,
      failed,
      sceneNumber: step
    });
    window.setGenerationStatus(`Generando Voz en off · Escena ${step} de ${total}`, "is-busy", { sessionId });
    try {
      const clip = await podcasterGenerationShared.generateDialogueAudioForRow(rowId, { regenerate: true, silent: true });
      if (clip && window.hasStoredMediaSource(clip)) {
        generated += 1;
      } else {
        failed += 1;
      }
    } catch (_) {
      failed += 1;
    }
    window.updateGeminiAudioGenerationAnimation?.({
      current: step,
      total,
      generated,
      failed,
      sceneNumber: step
    });
  }
  if (generated === total) {
    window.setGenerationStatus(`Audios Gemini regenerados (${generated}/${total}).`, "is-live", { sessionId });
  } else {
    window.setGenerationStatus(`Regeneración Gemini completada (${generated}/${total}, fallidas: ${failed}).`, failed > 0 ? "" : "is-live", { sessionId });
  }
  return { total, generated, failed };
}

async function generateDialogueAudioForConnectedScript(session = null, options = {}) {
  try {
    window.flushScriptEditorVoiceDraftsToSession?.();
  } catch (_) {
    // best-effort
  }
  const currentSession = session || window.getActiveSession();
  const rows = window.getSessionRows(currentSession);
  if (!currentSession || !rows.length) return { generated: 0, failed: 0 };
  let generated = 0;
  let failed = 0;
  const activeToken = Number(options?.token || 0);
  for (const row of rows) {
    if (activeToken && activeToken !== window.connectScriptPanelGenerationState.token) {
      throw new DOMException("Conexión cancelada", "AbortError");
    }
    if (options?.signal?.aborted) {
      throw new DOMException("Conexión cancelada", "AbortError");
    }
    const rowId = String(row?.id || "").trim();
    if (!rowId) continue;
    try {
      const clip = await podcasterGenerationShared.generateDialogueAudioForRow(rowId, {
        regenerate: options.regenerate === true,
        silent: true,
        signal: options?.signal
      });
      if (clip && window.hasStoredMediaSource(clip)) {
        generated += 1;
      } else {
        failed += 1;
      }
      window.setGenerationStatus(`Generando audios de escenas (${generated + failed}/${rows.length})...`, "is-busy");
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      failed += 1;
      window.addChatMessage("system", `No se pudo generar el audio de la escena ${window.resolveSceneNumberByRowId(rowId, window.getActiveSession())} (${error.message}).`);
    }
  }
  try {
    window.reflowTimelineClipsByScriptOrder?.(window.getActiveSession(), { persist: true, render: false });
    window.syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
  } catch (_) {
    // best-effort
  }
  return { generated, failed };
}

function beginConnectScriptPanelGeneration(messageId = "") {
  const cleanMessageId = String(messageId || "").trim();
  if (window.connectScriptPanelGenerationState.abortController) {
    window.connectScriptPanelGenerationState.abortController.abort();
  }
  window.connectScriptPanelGenerationState.active = true;
  window.connectScriptPanelGenerationState.messageId = cleanMessageId;
  window.connectScriptPanelGenerationState.abortController = new AbortController();
  window.connectScriptPanelGenerationState.token = Date.now();
  window.renderChat(window.getActiveSession());
  return {
    token: window.connectScriptPanelGenerationState.token,
    signal: window.connectScriptPanelGenerationState.abortController.signal
  };
}

async function cancelConnectScriptPanelGeneration(options = {}) {
  if (!window.connectScriptPanelGenerationState.active) return false;
  window.connectScriptPanelGenerationState.abortController?.abort();
  window.connectScriptPanelGenerationState.active = false;
  window.connectScriptPanelGenerationState.messageId = "";
  window.connectScriptPanelGenerationState.abortController = null;
  window.connectScriptPanelGenerationState.token = 0;
  window.stopRowAudio();
  await window.stopGeminiLiveSession().catch(() => { });
  window.renderChat(window.getActiveSession());
  if (options.silent !== true) {
    window.setGenerationStatus("Generación detenida", "is-live");
    window.addChatMessage("system", "Se detuvo la conexión del guión al panel y la generación de audios.");
  }
  return true;
}

export function removeDialogueAudioForRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  if (!key) return;
  const silent = options.silent === true;
  const previousClip = window.getDialogueAudioMap(window.getActiveSession())?.[key] || null;
  window.upsertActiveSession((current) => {
    const nextMap = { ...window.getDialogueAudioMap(current) };
    delete nextMap[key];
    return {
      ...current,
      dialogueAudioMap: nextMap,
      dialogueAudioDeletedAtMap: {
        ...(current?.dialogueAudioDeletedAtMap || {}),
        [key]: new Date().toISOString()
      }
    };
  }, { render: false });
  if (typeof window.upsertPodcastVideoConfig === "function") {
    window.upsertPodcastVideoConfig((cfg) => {
      const track = window.normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
      const nextExcludedRowIds = Array.from(new Set([...(track.excludedRowIds || []), key]));
      const nextSegments = Array.isArray(track.segments)
        ? track.segments.filter((segment) => String(segment?.rowId || "").trim() !== key)
        : [];
      const nextTextClips = { ...(cfg?.timelineOnScreenTextClipsByRowId || {}) };
      if (String(previousClip?.model || "") === "uploaded") {
        if (previousClip.previousOnScreenTextClip) nextTextClips[key] = { ...previousClip.previousOnScreenTextClip };
        else delete nextTextClips[key];
      }
      return {
        ...cfg,
        timelineOnScreenTextClipsByRowId: nextTextClips,
        geminiDialogueTrack: window.normalizeGeminiDialogueTrack({
          ...track,
          enabled: nextSegments.length > 0,
          segments: nextSegments,
          excludedRowIds: nextExcludedRowIds
        })
      };
    }, { autosave: true });
  }
  if (!silent) {
    window.setGenerationStatus(`Voz eliminada de escena ${window.resolveSceneNumberByRowId(key, window.getActiveSession())}`, "is-live");
  }
  window.syncGeminiDialogueTrackWithRuntime({ render: false });
  window.renderPodcastVideoTimeline(window.getActiveSession(), { force: true, reason: "structure" });
  window.syncPodcastStudioInspector(window.getActiveSession());
}

// --- Exposure to Window ---
window.preloadAllDialogueAudios = preloadAllDialogueAudios;
window.getRegenerableGeminiAudioRows = getRegenerableGeminiAudioRows;
window.regenerateAllGeminiDialogueAudios = regenerateAllGeminiDialogueAudios;
window.generateDialogueAudioForConnectedScript = generateDialogueAudioForConnectedScript;
window.beginConnectScriptPanelGeneration = beginConnectScriptPanelGeneration;
window.cancelConnectScriptPanelGeneration = cancelConnectScriptPanelGeneration;
window.removeDialogueAudioForRow = removeDialogueAudioForRow;

window.__podcasterAudioGeminiGenerateDialogueAudioForRow = generateDialogueAudioForRow;
registerPodcasterGenerationShared({
  dialogueAudioGenerationPending,
  generateDialogueAudioForRow
});
