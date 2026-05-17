import { authFetchJson } from "../js/api-client.js";

// --- State ---
const dialogueAudioGenerationPending = new Set();

/**
 * Preloads all dialogue audio metadata in the background to ensure timeline chips render at full width.
 */
function preloadAllDialogueAudios(session = null) {
  const activeSession = session || window.getActiveSession();
  if (!activeSession) return;
  const audioMap = window.getDialogueAudioMap(activeSession);
  if (!audioMap) return;
  const keys = Object.keys(audioMap);
  if (!keys.length) return;

  keys.forEach((rowId) => {
    const audioClip = audioMap[rowId];
    if (!audioClip) return;
    const audioSrc = window.resolveStorageAudioUrl(audioClip.downloadUrl || "", audioClip.storagePath || "");
    if (!audioSrc) return;

    // Si ya tenemos una duración medida, no volvemos a cargar
    if (window.podcastVideoState?.montageAudioActualDurationsMs?.[rowId]) {
      return;
    }

    // Crear un elemento Audio temporal en segundo plano para obtener metadatos
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = audioSrc;
    audio.preload = "metadata";

    audio.addEventListener("loadedmetadata", () => {
      const duration = Number(audio.duration);
      if (Number.isFinite(duration) && duration > 0) {
        const nextMs = Math.round(duration * 1000);
        if (!window.podcastVideoState.montageAudioActualDurationsMs) {
          window.podcastVideoState.montageAudioActualDurationsMs = {};
        }
        if (Math.abs(nextMs - (window.podcastVideoState.montageAudioActualDurationsMs[rowId] || 0)) > 100) {
          window.podcastVideoState.montageAudioActualDurationsMs[rowId] = nextMs;
          
          // Reconciliar en segundo plano para que el geminiDialogueTrack tenga la duración real
          try {
            window.syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
          } catch (_) {}

          // Forzar renderizado de la línea de tiempo para actualizar el ancho de los chips
          window.renderPodcastVideoTimeline(window.getActiveSession(), { force: true, reason: "audio-metadata-loaded" });
        }
      }
    }, { once: true });
  });
}

/**
 * Generates a single dialogue audio clip for a given row.
 */
async function generateDialogueAudioForRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  const session = window.getActiveSession();
  const sessionId = String(session?.id || "").trim();
  if (!sessionId || !key) return null;
  const rows = session?.script?.rows || [];
  const row = rows.find((item) => String(item?.id || "").trim() === key);
  if (!row) return null;

  const pendingKey = `${sessionId}:${key}`;
  if (dialogueAudioGenerationPending.has(pendingKey)) return null;

  const voiceName = window.resolveConfiguredSpeakerVoiceForGeneration(session, row.speaker);
  const text = window.buildTargetSpeechLine(row);
  const regenerate = options.regenerate === true;
  const silent = options.silent === true;

  dialogueAudioGenerationPending.add(pendingKey);
  if (!silent) window.setGenerationStatus(`Generando audio Gemini para escena ${window.resolveSceneNumberByRowId(key, session)}...`, "is-busy");

  try {
    const body = {
      sessionId,
      rowId: key,
      speaker: String(row?.speaker || "").trim(),
      voiceName,
      text,
      regenerate,
      disfluencyConfig: row?.disfluencyConfig || null,
      ttsDirectionConfig: row?.ttsDirectionConfig || null
    };

    const resp = await authFetchJson("/api/podcaster/dialogue-audios/generate", {
      method: "POST",
      body: JSON.stringify(body)
    });

    if (!resp?.ok) throw new Error(resp?.error || "Error al generar audio.");

    const finalAudio = resp.dialogueAudio;
    window.upsertActiveSession((current) => ({
      ...current,
      dialogueAudioMap: {
        ...(current.dialogueAudioMap || {}),
        [key]: finalAudio
      }
    }), { render: !options.deferTimelineRender });

    // Evacuar referencias del reproductor viejas
    if (typeof window.playbackController?.invalidateRowAudioCache === "function") {
      window.playbackController.invalidateRowAudioCache(key);
    }

    // Medir la nueva duración e incorporar al timeline inmediatamente
    preloadAllDialogueAudios(window.getActiveSession());

    // Sincronizar track
    window.syncGeminiDialogueTrackWithRuntime({
      render: !options.deferTimelineRender,
      preserveStartMs: true
    });

    return finalAudio;
  } catch (error) {
    console.error("[podcaster] audio generation error", error);
    if (!silent) window.addChatMessage("system", `Error audio escena ${window.resolveSceneNumberByRowId(key, session)}: ${error.message}`);
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
  await window.refreshRuntimeFeatureCapabilities();
  const activeSession = session || window.getActiveSession();
  if (!activeSession) return { total: 0, generated: 0, failed: 0 };
  const sessionId = String(activeSession?.id || "").trim();
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
    window.setGenerationStatus(`Regenerando audios Gemini (${step}/${total})...`, "is-busy", { sessionId });
    try {
      const clip = await window.PodcasterGeneration.generateDialogueAudioForRow(rowId, { regenerate: true, silent: true });
      if (clip && window.hasStoredMediaSource(clip)) {
        generated += 1;
      } else {
        failed += 1;
      }
    } catch (_) {
      failed += 1;
    }
  }
  if (generated === total) {
    window.setGenerationStatus(`Audios Gemini regenerados (${generated}/${total}).`, "is-live", { sessionId });
  } else {
    window.setGenerationStatus(`Regeneración Gemini completada (${generated}/${total}, fallidas: ${failed}).`, failed > 0 ? "" : "is-live", { sessionId });
  }
  return { total, generated, failed };
}

async function generateDialogueAudioForConnectedScript(session = null, options = {}) {
  const currentSession = session || window.getActiveSession();
  const rows = Array.isArray(currentSession?.script?.rows) ? currentSession.script.rows : [];
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
      const clip = await window.PodcasterGeneration.generateDialogueAudioForRow(rowId, {
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

function removeDialogueAudioForRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  if (!key) return;
  const silent = options.silent === true;
  window.upsertActiveSession((current) => {
    const nextMap = { ...window.getDialogueAudioMap(current) };
    delete nextMap[key];
    return {
      ...current,
      dialogueAudioMap: nextMap
    };
  }, { render: false });
  if (!silent) {
    window.setGenerationStatus(`Voz eliminada de escena ${window.resolveSceneNumberByRowId(key, window.getActiveSession())}`, "is-live");
  }
  window.syncGeminiDialogueTrackWithRuntime({ render: false });
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

if (!window.PodcasterGeneration) {
  window.PodcasterGeneration = {};
}
window.__podcasterAudioGeminiGenerateDialogueAudioForRow = generateDialogueAudioForRow;
window.PodcasterGeneration.generateDialogueAudioForRow = generateDialogueAudioForRow;
