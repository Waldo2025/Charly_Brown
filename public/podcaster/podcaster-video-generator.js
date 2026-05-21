
import { authFetchJson, buildApiUrl } from "../js/api-client.js";
import { requirePodcasterGenerationRuntime } from "./podcaster-runtime-registry.js";
import { podcasterGenerationShared, registerPodcasterGenerationShared } from "./podcaster-generation-shared.js";
import { isReelModeEnabled } from "./podcaster-reels.js";

const runtime = requirePodcasterGenerationRuntime();

// --- Constants ---
const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 2;
const DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES = 7 * 1024 * 1024;

// --- State ---
const dialogueVideoGenerationTasks = new Map();
const dialogueVideoGenerationPending = podcasterGenerationShared.dialogueVideoGenerationPending;
const timelineSceneVideoGenerationPending = podcasterGenerationShared.timelineSceneVideoGenerationPending;
const timelineSceneVideoGenerationStatus = podcasterGenerationShared.timelineSceneVideoGenerationStatus;
const brokenDialogueVideoRows = podcasterGenerationShared.brokenDialogueVideoRows;
let nextDialogueVideoRequestAt = 0;

// --- Helpers ---

function hasVisualReferenceTrace(details = {}) {
  return Boolean(
    details?.referenceImageCount
    || details?.hasReferenceVideo
    || details?.hasContinuityReference
    || details?.hasReferenceImage
    || details?.traceVisualReference
  );
}

function formatInlineAssetDebug(value = "") {
  const clean = normalizeInlineDataUrl(value);
  if (!clean) return null;
  const mimeType = String(clean.match(/^data:([^;,]+)/i)?.[1] || "").trim().toLowerCase() || "unknown";
  return {
    mimeType,
    bytes: estimateInlineDataUrlBytes(clean)
  };
}

function buildVisualReferenceTraceMeta(options = {}) {
  const referenceImages = Array.isArray(options.referenceImages) ? options.referenceImages : [];
  const referenceVideo = options.referenceVideo || null;
  const continuityReferenceImageDataUrl = String(options.continuityReferenceImageDataUrl || "").trim();
  const inlineReferenceBudget = options.inlineReferenceBudget || null;
  const imageAssets = referenceImages
    .map((item, index) => ({
      index: index + 1,
      name: String(item?.name || "").trim() || `Referencia ${index + 1}`,
      ...formatInlineAssetDebug(item?.dataUrl || "")
    }))
    .filter((item) => item.mimeType);
  const videoAsset = referenceVideo
    ? {
      name: String(referenceVideo?.name || "").trim() || "Referencia de video",
      ...formatInlineAssetDebug(referenceVideo?.dataUrl || "")
    }
    : null;
  const continuityAsset = continuityReferenceImageDataUrl
    ? formatInlineAssetDebug(continuityReferenceImageDataUrl)
    : null;
  return {
    traceVisualReference: imageAssets.length > 0 || Boolean(videoAsset) || Boolean(continuityAsset),
    referenceImageCount: imageAssets.length,
    hasReferenceImage: imageAssets.length > 0,
    hasReferenceVideo: Boolean(videoAsset),
    hasContinuityReference: Boolean(continuityAsset),
    inlineBudgetBytes: Number(inlineReferenceBudget?.totalInlineBytes || 0) || 0,
    imageAssets,
    videoAsset,
    continuityAsset
  };
}

function traceVisualReferenceScene(step = "", details = {}) {
  if (!hasVisualReferenceTrace(details)) return;
  try {
    console.info(`[Podcaster][SceneVideoRef][${String(step || "").trim() || "event"}]`, details);
  } catch (_) { }
}

function ensureTimelineScenePendingVisible(session = null, rowId = "", statusPatch = null) {
  const activeSession = session || getActiveSession();
  const generationKey = buildTimelineSceneGenerationKey(activeSession, rowId);
  if (!generationKey) return "";
  timelineSceneVideoGenerationPending.add(generationKey);
  const nextStatus = statusPatch && typeof statusPatch === "object"
    ? {
      hint: String(statusPatch.hint || "Generando video...").trim() || "Generando video...",
      stage: String(statusPatch.stage || "busy").trim() || "busy"
    }
    : {
      hint: "Generando video...",
      stage: "busy"
    };
  timelineSceneVideoGenerationStatus.set(generationKey, nextStatus);
  try {
    runtime.renderPodcastVideoTimeline?.(getActiveSession(), { reason: "ephemeral" });
  } catch (_) { }
  return generationKey;
}

function buildTimelineSceneGenerationKey(session, rowId) {
  const sessionId = String(session?.id || "").trim();
  const cleanRowId = String(rowId || "").trim();
  if (!sessionId || !cleanRowId) return "";
  return `${sessionId}:${cleanRowId}`;
}

function buildDialogueVideoInlineReferenceBudget(rowReferenceImages = [], rowReferenceVideo = null, continuityReferenceImageDataUrl = "") {
  const referenceImageDataUrls = rowReferenceImages
    .map((item) => normalizeInlineDataUrl(item?.dataUrl || ""))
    .filter(Boolean)
    .slice(0, DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT);
  const referenceVideoDataUrl = normalizeInlineDataUrl(rowReferenceVideo?.dataUrl || "");
  const continuityDataUrl = normalizeInlineDataUrl(continuityReferenceImageDataUrl || "");
  const totalInlineBytes = [
    ...referenceImageDataUrls,
    referenceVideoDataUrl,
    continuityDataUrl
  ].reduce((sum, item) => sum + estimateInlineDataUrlBytes(item), 0);
  return {
    referenceImageDataUrls,
    referenceVideoDataUrl,
    continuityReferenceImageDataUrl: continuityDataUrl,
    totalInlineBytes
  };
}

function estimateInlineDataUrlBytes(value = "") {
  if (!value || typeof value !== "string") return 0;
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return 0;
  const header = value.slice(0, commaIndex).toLowerCase();
  const payload = value.slice(commaIndex + 1).replace(/\s+/g, "");
  if (!payload) return 0;
  if (!header.includes(";base64")) return payload.length;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function normalizeInlineDataUrl(value = "") {
  const clean = String(value || "").trim();
  return clean.startsWith("data:") ? clean : "";
}


const captureContinuityFrameDataUrl = async (videoSrc = "") => {
  const src = String(videoSrc || "").trim();
  if (!src) return "";
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let done = false;
    const finish = (value = "") => {
      if (done) return;
      done = true;
      try { video.pause(); } catch (_) { }
      try { video.removeAttribute("src"); } catch (_) { }
      try { video.load(); } catch (_) { }
      resolve(String(value || "").trim());
    };
    const timeout = window.setTimeout(() => finish(""), 6500);
    const clear = () => window.clearTimeout(timeout);
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("error", () => {
      clear();
      finish("");
    }, { once: true });
    video.addEventListener("loadedmetadata", async () => {
      try {
        const dur = Number(video.duration || 0);
        if (!Number.isFinite(dur) || dur <= 0) {
          clear();
          finish("");
          return;
        }
        const seekTo = Math.max(0, dur - 0.08);
        video.currentTime = seekTo;
      } catch (_) {
        clear();
        finish("");
      }
    }, { once: true });
    video.addEventListener("seeked", () => {
      try {
        const w = Math.max(2, Math.floor(Number(video.videoWidth || 0) || 0));
        const h = Math.max(2, Math.floor(Number(video.videoHeight || 0) || 0));
        if (!w || !h) {
          clear();
          finish("");
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          clear();
          finish("");
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        clear();
        finish(dataUrl);
      } catch (_) {
        clear();
        finish("");
      }
    }, { once: true });
    try {
      video.src = src;
      video.load();
    } catch (_) {
      clear();
      finish("");
    }
  });
};

const shouldForceImmediateSceneChange = (source = "") => {
  const text = String(source || "").toLowerCase();
  if (!text) return false;
  if (/\b(hard cut|jump cut|match cut)\b/.test(text)) return true;
  if (/\bmontaje\b/.test(text) && (/\br[aá]pid/.test(text) || /\bdin[aá]mic/.test(text))) return true;
  if (/\btransici[oó]n\b/.test(text) && (/\br[aá]pid/.test(text) || /\binmedi/.test(text))) return true;
  if (/\bcorte\b/.test(text) && (/\br[aá]pid/.test(text) || /\binmedi/.test(text) || /\bal inicio\b/.test(text))) return true;
  if (/\bcorte a\b/.test(text) || /\bluego[, ]+un corte\b/.test(text) || /\btransici[oó]n r[aá]pida\b/.test(text)) return true;
  if (/\b(cambio a|ahora|luego|entonces|nueva escena|diferente|se transforma|se convierte|mientras|despue[sś])\b/.test(text)) return true;
  return false;
};

// --- Generation Core ---

async function pollDialogueVideoGenerationJob(jobId = "", options = {}) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) throw new Error("dialogue_video_job_missing");
  const silent = options.silent === true;
  const sceneNumber = String(options.sceneNumber || "").trim();
  const pollIntervalMs = 2500;
  const maxAttempts = 360;
  let lastStateKey = "";
  let lastData = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const data = await authFetchJson(`/api/podcaster/dialogue-videos/generate-status?jobId=${encodeURIComponent(cleanJobId)}`);
    lastData = data;
    const status = String(data?.status || "").trim().toLowerCase();
    const hint = String(data?.hint || "").trim();
    const stateKey = [
      String(data?.stage || "").trim(),
      String(data?.model || "").trim(),
      String(data?.variant || "").trim(),
      String(data?.attempt || "").trim(),
      String(data?.segmentIndex || "").trim(),
      String(data?.updatedAt || "").trim()
    ].join("|");
    if (stateKey && stateKey !== lastStateKey) {
      lastStateKey = stateKey;
      traceVisualReferenceScene("job-update", {
        jobId: cleanJobId,
        rowId: String(options.rowId || "").trim(),
        sceneNumber: String(options.sceneNumber || "").trim(),
        status,
        stage: String(data?.stage || "").trim(),
        variant: String(data?.variant || "").trim(),
        model: String(data?.model || "").trim(),
        attempt: Number(data?.attempt || 0) || null,
        hint,
        ...((options.traceMeta && typeof options.traceMeta === "object") ? options.traceMeta : {})
      });
      if (typeof options.onUpdate === "function") {
        try { options.onUpdate(data); } catch (_) { }
      }
    }
    if (status === "ready" && data?.dialogueVideo && typeof data.dialogueVideo === "object") {
      return data;
    }
    if (status === "error") {
      const message = String(data?.error?.error || hint || "No se pudo generar el video.").trim() || "No se pudo generar el video.";
      const error = new Error(message);
      error.status = Number(data?.error?.status || 500) || 500;
      error.detail = data?.error?.detail || data?.error || null;
      throw error;
    }
    if (!silent) {
      const waitedSec = Math.max(0, Math.round((attempt * pollIntervalMs) / 1000));
      const fallbackHint = `Generando video${sceneNumber ? ` de escena ${sceneNumber}` : ""}... (${waitedSec}s)`;
      setGenerationStatus(hint || fallbackHint, "is-busy");
    }
    await sleep(pollIntervalMs);
  }
  const error = new Error("Tiempo de espera agotado al generar video de la escena.");
  error.status = 504;
  error.detail = lastData;
  throw error;
}

async function generateDialogueVideoForRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  const session = getActiveSession();
  const sessionId = String(session?.id || "").trim();
  if (!sessionId || !key) return null;
  const rows = session?.script?.rows || [];
  const rowIndex = rows.findIndex((item) => String(item?.id || "").trim() === key);
  const row = rowIndex >= 0 ? rows[rowIndex] : null;
  if (!row) return null;

  const speakerLabel = String(row?.speaker || "").trim();
  const educationalMode = isEducationalVideoMode(session);
  const rowReferenceImages = getRowReferenceImageList(session, key);
  const rowReferenceImage = rowReferenceImages[0] || getRowReferenceImageMap(session)[key] || null;
  const rowReferenceVideo = getRowReferenceVideoMap(session)[key] || null;
  const referenceMode = rowReferenceVideo ? "video" : "image";
  const pendingKey = `${sessionId}:${key}`;

  if (dialogueVideoGenerationTasks.has(pendingKey)) {
    return dialogueVideoGenerationTasks.get(pendingKey);
  }
  if (dialogueVideoGenerationPending.has(pendingKey)) return null;

  const currentMap = getDialogueVideoMap(session);
  const regenerate = options.regenerate === true;
  const enhanceFromExistingVideo = options.enhanceFromExistingVideo === true;
  const silent = options.silent === true;
  const videoCfg = typeof runtime.getPodcastVideoConfig === "function" ? runtime.getPodcastVideoConfig(session) : {};
  const cheapVideoMode = options.cheapVideoMode === true || videoCfg.cheapVideoMode === true;
  const promptProfile = String(options.promptProfile || "").trim();
  const videoDirective = String(options.videoDirective || row?.videoDirective || resolveVisualNotesForGeneration(row) || "").replace(/\s+/g, " ").trim();
  const visualNotes = String(
    row?.visualNotes
    || row?.visual
    || row?.elementoVisual
    || row?.elemento_visual
    || row?.visualElement
    || row?.["Elemento visual"]
    || row?.["Elemento Visual"]
    || resolveVisualNotesForGeneration(row)
    || ""
  ).replace(/\s+/g, " ").trim();
  const scenePrompt = normalizeVideoScenePrompt(row?.scenePrompt || "", row, session);
  const relateWithPreviousScene = options.relateWithPreviousScene === true || row?.relateWithPreviousScene === true;

  const resolveTimelinePreviousRowId = () => {
    try {
      const runtimeEntries = buildTimelineRuntimeEntries(session)
        .map((entry, scriptIndex) => ({
          rowId: String(entry?.rowId || "").trim(),
          startMs: Number(entry?.startMs || 0) || 0,
          zIndex: Number(entry?.zIndex || 0) || 0,
          scriptIndex
        }))
        .filter((item) => item.rowId);
      runtimeEntries.sort((a, b) => a.startMs - b.startMs || a.zIndex - b.zIndex || a.scriptIndex - b.scriptIndex);
      const idx = runtimeEntries.findIndex((item) => item.rowId === key);
      if (idx <= 0) return "";
      return runtimeEntries[idx - 1].rowId;
    } catch (_) { return ""; }
  };

  const scriptPreviousRow = rowIndex > 0 ? rows[rowIndex - 1] : null;
  const scriptPreviousRowId = String(scriptPreviousRow?.id || "").trim();
  const previousRowId = relateWithPreviousScene ? (resolveTimelinePreviousRowId() || scriptPreviousRowId) : scriptPreviousRowId;
  const previousClip = previousRowId ? resolveDialogueVideoForRow(session, previousRowId) : null;
  const previousSegments = resolveDialogueVideoSegments(previousClip);
  const previousClipPrimary = previousSegments.length ? (previousSegments[previousSegments.length - 1] || null) : (previousClip || null);

  const audioClip = resolveDialogueAudioForRow(session, key);
  const audioDurationSec = Math.max(0, Number(audioClip?.durationSec) || 0);

  const task = (async () => {
    dialogueVideoGenerationPending.add(pendingKey);
    if (!silent) setGenerationStatus(`Generando video Veo para escena ${resolveSceneNumberByRowId(key, session)}...`, "is-busy");
    setPodcastVideoStatus(`Generando Video de la Escena ${resolveSceneNumberByRowId(key, session)}`);

    try {
      let continuityReferenceImageDataUrl = "";
      if (relateWithPreviousScene && previousClipPrimary && (previousClipPrimary.downloadUrl || previousClipPrimary.storagePath)) {
        try {
          const videoSrc = resolveStorageVideoUrl(previousClipPrimary.downloadUrl || "", previousClipPrimary.storagePath || "");
          if (videoSrc) continuityReferenceImageDataUrl = await captureContinuityFrameDataUrl(videoSrc);
        } catch (_) { }
      }

      const hosts = typeof runtime.getSpeakerOptions === "function" ? runtime.getSpeakerOptions(session) : [];
      const counterpartSpeakerLabel = hosts.find(h => h !== speakerLabel) || "";
      const speakerName = (typeof runtime.getSpeakerNameMap === "function" ? runtime.getSpeakerNameMap(session)[speakerLabel] : "") || speakerLabel || "Locutor";
      const counterpartSpeakerName = counterpartSpeakerLabel ? ((typeof runtime.getSpeakerNameMap === "function" ? runtime.getSpeakerNameMap(session)[counterpartSpeakerLabel] : "") || counterpartSpeakerLabel) : "";

      const isVideoStyle = typeof runtime.isCurrentModeVideo === "function" ? runtime.isCurrentModeVideo(session) : false;

      const isReel = typeof isReelModeEnabled === "function" ? isReelModeEnabled(session) : (!!session?.podcastVideoConfig?.reelModeEnabled);

      const portrait = !isVideoStyle && typeof runtime.resolvePortraitForSpeaker === "function" ? runtime.resolvePortraitForSpeaker(session, speakerLabel) : null;
      const portraitUrl = portrait?.downloadUrl || "";
      const portraitStoragePath = portrait?.storagePath || "";
      const genderGroup = portrait?.genderGroup || "";

      const scenarioPrompt = typeof runtime.resolveSpeakerStudioScenarioPrompt === "function" ? runtime.resolveSpeakerStudioScenarioPrompt(session, speakerLabel) : "";
      const sceneDescription = String(row?.sceneDescription || "").trim();
      const strictIdentity = !isVideoStyle && Boolean(portraitUrl || portraitStoragePath);

      const inlineReferenceBudget = buildDialogueVideoInlineReferenceBudget(rowReferenceImages, rowReferenceVideo, continuityReferenceImageDataUrl);
      const traceMeta = buildVisualReferenceTraceMeta({
        referenceImages: rowReferenceImages,
        referenceVideo: rowReferenceVideo,
        continuityReferenceImageDataUrl,
        inlineReferenceBudget
      });
      const clip = typeof runtime.ensureTimelineClipsByRowId === "function"
        ? runtime.ensureTimelineClipsByRowId(session, { persist: false })[key]
        : null;
      const durationMs = clip
        ? (typeof runtime.getTimelineClipEffectiveDurationMs === "function"
          ? runtime.getTimelineClipEffectiveDurationMs(clip)
          : (clip.trimOutMs - clip.trimInMs))
        : (typeof runtime.getRowSourceDurationMs === "function"
          ? runtime.getRowSourceDurationMs(row, session)
          : 8000);
      const requestedDurationSec = Math.max(4, Math.min(8, Math.round(durationMs / 1000) || 8));

      const body = {
        promptProfile,
        sessionId,
        rowId: key,
        speaker: speakerLabel,
        speakerLabel,
        speakerName,
        counterpartSpeakerLabel,
        counterpartSpeakerName,
        voiceName: resolveConfiguredSpeakerVoiceForGeneration(row, session),
        text: String(row?.text || "").trim(),
        genderGroup,
        portraitUrl,
        portraitStoragePath,
        scenarioPrompt,
        sceneDescription,
        strictIdentity,
        videoMode: isVideoStyle,
        educationalVideo: isVideoStyle,
        contentMode: isReel ? "reel" : (isVideoStyle ? "educational" : "videopodcast"),
        visualNotes,
        videoDirective,
        scenePrompt,
        imagePrompts: normalizeVideoImagePrompts(row?.imagePrompts || []),
        onScreenText: String(row?.onScreenText || "").trim(),
        transition: String(row?.transition || "").trim(),
        relateWithPreviousScene: relateWithPreviousScene && !!continuityReferenceImageDataUrl,
        audioDurationSec,
        requestedDurationSec,
        audioUrl: audioClip?.downloadUrl || "",
        audioStoragePath: audioClip?.storagePath || "",
        referenceMode,
        referenceImageDataUrls: inlineReferenceBudget.referenceImageDataUrls,
        referenceImageDataUrl: String(rowReferenceImage?.dataUrl || "").trim(),
        referenceImageNames: rowReferenceImages.map((item) => String(item?.name || "").trim()).filter(Boolean).slice(0, DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT),
        referenceImageName: String(rowReferenceImage?.name || "").trim(),
        referenceVideoDataUrl: inlineReferenceBudget.referenceVideoDataUrl,
        referenceVideoName: String(rowReferenceVideo?.name || "").trim(),
        referenceVideoMimeType: String(rowReferenceVideo?.mimeType || "video/mp4").trim() || "video/mp4",
        continuityReferenceImageDataUrl: inlineReferenceBudget.continuityReferenceImageDataUrl,
        regenerate,
        enhanceFromExistingVideo,
        cheapVideoMode,
        inlineReferenceBudget,
        forceImmediateSceneChange: shouldForceImmediateSceneChange(videoDirective),
        maxModelAttempts: options.maxModelAttempts || 3,
        maxVariantAttempts: options.maxVariantAttempts || 6
      };

      traceVisualReferenceScene("request-start", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        speakerLabel,
        speakerName,
        counterpartSpeakerLabel,
        counterpartSpeakerName,
        portraitUrl: !!portraitUrl,
        portraitStoragePath: !!portraitStoragePath,
        strictIdentity,
        genderGroup,
        scenarioPromptLength: scenarioPrompt.length,
        sceneDescriptionLength: sceneDescription.length,
        visualNotesLength: visualNotes.length,
        regenerate,
        enhanceFromExistingVideo,
        cheapVideoMode,
        referenceMode,
        audioDurationSec,
        requestedDurationSec,
        strictIdentity,
        ...traceMeta
      });
      traceVisualReferenceScene("request-payload", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        modelAttempts: body.maxModelAttempts,
        variantAttempts: body.maxVariantAttempts,
        referenceMode,
        strictIdentity,
        portraitStoragePath: String(portraitStoragePath || "").trim() || null,
        portraitUrl: String(portraitUrl || "").trim() || null,
        promptProfile,
        scenarioPromptLength: scenarioPrompt.length,
        sceneDescriptionLength: sceneDescription.length,
        visualNotesLength: visualNotes.length,
        videoDirectiveLength: videoDirective.length,
        scenePromptLength: scenePrompt.length,
        textLength: body.text.length,
        ...traceMeta
      });

      const resp = await authFetchJson("/api/podcaster/dialogue-videos/generate", {
        method: "POST",
        body: JSON.stringify(body)
      });

      if (!resp?.ok) throw new Error(resp?.error || "Error al iniciar generación.");

      traceVisualReferenceScene("request-accepted", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        jobId: String(resp?.jobId || "").trim(),
        ...traceMeta
      });

      const result = await pollDialogueVideoGenerationJob(resp.jobId, {
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        silent,
        onUpdate: options.onJobUpdate,
        traceMeta
      });

      const previousClip = resolveDialogueVideoForRow(session, key);
      const finalClip = result?.dialogueVideo;
      if (!finalClip) throw new Error("No se devolvió un clip válido.");

      upsertActiveSession((current) => ({
        ...current,
        dialogueVideoMap: {
          ...(current.dialogueVideoMap || {}),
          [key]: finalClip
        }
      }), { render: !options.deferTimelineRender });

      if (typeof playbackController?.invalidateRowMediaCache === "function") {
        playbackController.invalidateRowMediaCache(key, getActiveSession(), {
          previousClip,
          nextClip: finalClip
        });
      } else if (typeof playbackController?.invalidateRowAudioCache === "function") {
        playbackController.invalidateRowAudioCache(key);
      }

      const finalDurationMs = Math.round(Math.max(0, Number(finalClip?.durationSec || 0)) * 1000);
      if (finalDurationMs > 0 && typeof runtime.updateTimelineClipForRow === "function") {
        runtime.updateTimelineClipForRow(key, (prev) => {
          const currentDurationMs = Number(prev?.sourceDurationMs || 0);
          const computedDurationMs = typeof runtime.getRowSourceDurationMs === "function"
            ? runtime.getRowSourceDurationMs(row, session)
            : finalDurationMs;
          const targetDurationMs = Math.max(currentDurationMs, computedDurationMs, finalDurationMs);
          return {
            ...prev,
            sourceDurationMs: targetDurationMs,
            trimInMs: 0,
            trimOutMs: targetDurationMs
          };
        }, { persist: true });
      }

      if (options.syncStageAfterGenerate !== false) {
        setPodcastVideoRow(key, { syncStage: true });
      }

      traceVisualReferenceScene("request-success", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        model: String(finalClip?.model || "").trim() || null,
        variant: String(finalClip?.variant || "").trim() || null,
        storagePath: String(finalClip?.storagePath || "").trim(),
        downloadUrl: String(finalClip?.downloadUrl || "").trim(),
        ...traceMeta
      });

      return finalClip;
    } catch (error) {
      traceVisualReferenceScene("request-error", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        message: String(error?.message || "Error al generar video.").trim(),
        detail: error?.detail || null
      });
      console.error("[Podcaster][SceneVideoRef][request-error]", error);
      if (!silent) addChatMessage("system", `Error en escena ${resolveSceneNumberByRowId(key, session)}: ${error.message}`);
      throw error;
    } finally {
      dialogueVideoGenerationPending.delete(pendingKey);
      dialogueVideoGenerationTasks.delete(pendingKey);
      traceVisualReferenceScene("request-cleanup", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        hasReferenceImage: rowReferenceImages.length > 0,
        hasReferenceVideo: Boolean(rowReferenceVideo)
      });
      updatePodcastPlayerUi();
    }
  })();

  dialogueVideoGenerationTasks.set(pendingKey, task);
  return task;
}



async function promptDialogueVideoDirective(rowId = "", session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  const rows = getSessionRows(activeSession);
  const row = rows.find((item) => String(item?.id || "").trim() === key) || null;
  const initialValue = normalizeVideoDirectiveText(options.initialValue != null ? options.initialValue : (row?.videoDirective || resolveVisualNotesForGeneration(row) || ""));
  const label = normalizeVideoDirectiveText(options.label || "");
  if (!els.dialogueVideoDirectiveModal || !els.dialogueVideoDirectiveInput) {
    return Promise.resolve({ confirmed: true, videoDirective: "" });
  }
  if (dialogueVideoDirectiveRequest?.resolve) {
    dialogueVideoDirectiveRequest.resolve({ confirmed: false, videoDirective: "" });
  }
  els.dialogueVideoDirectiveInput.value = initialValue;
  if (els.dialogueVideoDirectiveLabel) {
    const sceneLabel = label || (row ? `Escena ${resolveSceneNumberByRowId(key, activeSession)}` : "esta escena");
    els.dialogueVideoDirectiveLabel.textContent = `¿Deseas añadir una especificación más al video de ${sceneLabel}?`;
  }
  els.dialogueVideoDirectiveModal.hidden = false;
  queueMicrotask(() => {
    els.dialogueVideoDirectiveInput?.focus();
  });
  return new Promise((resolve) => {
    dialogueVideoDirectiveRequest = { resolve };
  });
}


async function runSceneVideoGenerationFlow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  const session = getActiveSession();
  if (!session || !key) {
    traceVisualReferenceScene("flow-skip-missing-context", {
      sessionId: String(session?.id || "").trim(),
      rowId: key,
      traceVisualReference: true
    });
    return null;
  }
  const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
  if (!row) {
    traceVisualReferenceScene("flow-skip-missing-row", {
      sessionId: String(session?.id || "").trim(),
      rowId: key,
      traceVisualReference: true
    });
    return null;
  }

  const shouldPromptDirective = options.promptDirective === true;
  let nextVideoDirective = normalizeVideoDirectiveText(options.videoDirective != null ? options.videoDirective : (row?.videoDirective || resolveVisualNotesForGeneration(row) || ""));

  if (shouldPromptDirective) {
    const directiveResult = await promptDialogueVideoDirective(key, session, { initialValue: nextVideoDirective });
    if (!directiveResult?.confirmed) return null;
    nextVideoDirective = normalizeVideoDirectiveText(directiveResult.videoDirective || "");
  }

  const selectRow = options.selectRow !== false;
  if (selectRow) selectTimelineSceneRow(key, { syncStage: options.syncStage === true });

  const loadingButton = options.loadingButton || null;
  const generationKey = buildTimelineSceneGenerationKey(session, key);

  if (options.setBusyState !== false) podcastVideoState.busy = true;

  traceVisualReferenceScene("flow-start", {
    sessionId: String(session?.id || "").trim(),
    rowId: key,
    sceneNumber: resolveSceneNumberByRowId(key, session),
    selectRow,
    shouldPromptDirective,
    hasExistingVideo: hasStoredMediaSource(resolveDialogueVideoForRow(session, key)),
    hasReferenceImage: getRowReferenceImageList(session, key).length > 0,
    hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[key] || null)
  });

  if (generationKey) {
    timelineSceneVideoGenerationPending.add(generationKey);
    timelineSceneVideoGenerationStatus.set(generationKey, { hint: "Encolando generación de video...", stage: "queued" });
    renderPodcastVideoTimeline(getActiveSession(), { reason: "structure" });
    traceVisualReferenceScene("flow-spinner-on", {
      generationKey,
      rowId: key,
      sceneNumber: resolveSceneNumberByRowId(key, session),
      hasReferenceImage: getRowReferenceImageList(session, key).length > 0,
      hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[key] || null)
    });
  }

  if (loadingButton) {
    setButtonLoadingState(loadingButton, true, {
      loadingTitle: String(options.loadingTitle || "Generando video de escena...").trim() || "Generando video de escena..."
    });
  }
  updatePodcastPlayerUi();

  try {
    const existingClip = resolveDialogueVideoForRow(getActiveSession(), key);
    upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((item) => (
          String(item?.id || "").trim() === key ? { ...item, videoDirective: nextVideoDirective } : item
        ))
      }
    }), { render: false });

    const generated = await generateDialogueVideoForRow(key, {
      promptProfile: options.promptProfile || "",
      regenerate: options.regenerate != null ? options.regenerate === true : hasStoredMediaSource(existingClip),
      enhanceFromExistingVideo: options.enhanceFromExistingVideo === true,
      silent: options.silent === true,
      videoDirective: nextVideoDirective,
      deferTimelineRender: options.deferTimelineRender === true,
      syncStageAfterGenerate: options.syncStageAfterGenerate !== false,
      onJobUpdate: (jobData) => {
        if (!generationKey) return;
        const hint = String(jobData?.hint || "").trim() || [jobData?.stage || "Generando video", jobData?.variant ? `· ${jobData.variant}` : ""].filter(Boolean).join(" ");
        timelineSceneVideoGenerationStatus.set(generationKey, { hint, stage: jobData?.stage || "busy" });
        renderPodcastVideoTimeline(getActiveSession(), { reason: "ephemeral" });
      }
    });
    return generated;
  } finally {
    if (generationKey) {
      timelineSceneVideoGenerationPending.delete(generationKey);
      timelineSceneVideoGenerationStatus.delete(generationKey);
      renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
      traceVisualReferenceScene("flow-spinner-off", {
        generationKey,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        hasReferenceImage: getRowReferenceImageList(session, key).length > 0,
        hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[key] || null)
      });
    }
    if (loadingButton) setButtonLoadingState(loadingButton, false);
    podcastVideoState.busy = false;
    traceVisualReferenceScene("flow-complete", {
      sessionId: String(session?.id || "").trim(),
      rowId: key,
      sceneNumber: resolveSceneNumberByRowId(key, session),
      hasReferenceImage: getRowReferenceImageList(session, key).length > 0,
      hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[key] || null)
    });
    updatePodcastPlayerUi();
  }
}

async function runGenerateMissingDialogueVideos(options = {}) {
  const session = getActiveSession();
  const rows = session?.script?.rows || [];
  if (!rows.length || podcastVideoState.bulkVideoGenerationActive) return;

  const triggerButton = options.triggerButton || null;
  const regenerateAll = options.regenerateAll === true;
  const preservedActiveRowId = String(podcastVideoState.activeRowId || "").trim();

  const eligibleRows = regenerateAll
    ? rows.filter((row) => String(row?.id || "").trim())
    : rows.filter((row) => {
      const rowId = String(row?.id || "").trim();
      return rowId && !hasGeneratedDialogueVideoForRow(session, rowId);
    });

  if (!eligibleRows.length) {
    setGenerationStatus(regenerateAll ? "No hay escenas para generar" : "Todas las escenas ya tienen video", "is-live");
    return;
  }

  const readyRows = eligibleRows.slice();
  podcastVideoState.bulkVideoGenerationActive = true;
  podcastVideoState.bulkVideoGenerationMode = regenerateAll ? "all" : "missing";

  setButtonLoadingState(triggerButton, true, {
    loadingTitle: regenerateAll ? "Generando todas las escenas..." : "Generando escenas faltantes..."
  });

  addChatMessage("system", `Cola iniciada: ${readyRows.length} escena(s) ${regenerateAll ? "para generar/regenerar" : "sin video"}.`);
  updatePodcastPlayerUi();

  const failures = [];
  let successCount = 0;
  const generationKeys = [];

  try {
    readyRows.forEach((row) => {
      const genKey = buildTimelineSceneGenerationKey(session, row.id);
      if (genKey) {
        generationKeys.push(genKey);
        timelineSceneVideoGenerationPending.add(genKey);
      }
    });
    if (generationKeys.length) renderPodcastVideoTimeline(getActiveSession(), { reason: "ephemeral" });

    for (let i = 0; i < readyRows.length; i++) {
      const row = readyRows[i];
      const rowId = String(row?.id || "").trim();
      setPodcastVideoStatus(`Generando escena ${i + 1}/${readyRows.length}...`);

      try {
        await generateDialogueVideoForRow(rowId, {
          videoDirective: normalizeVideoDirectiveText(row?.videoDirective || resolveVisualNotesForGeneration(row) || ""),
          regenerate: regenerateAll,
          silent: true,
          deferTimelineRender: false,
          syncStageAfterGenerate: false
        });
        successCount++;
      } catch (error) {
        failures.push(`Escena ${resolveSceneNumberByRowId(rowId, session)}: ${error.message}`);
      }

      const genKey = buildTimelineSceneGenerationKey(session, rowId);
      if (genKey) {
        timelineSceneVideoGenerationPending.delete(genKey);
        renderPodcastVideoTimeline(getActiveSession(), { reason: "ephemeral" });
      }
    }

    if (preservedActiveRowId && successCount > 0) {
      setPodcastVideoRow(preservedActiveRowId, { syncStage: false, preserveMontageCursor: true, lightweightUi: true });
    }

    if (failures.length) {
      addChatMessage("system", `Se generaron videos con incidencias: ${failures.slice(0, 5).join(" | ")}`);
      setGenerationStatus("Completado con incidencias", "");
    } else {
      setGenerationStatus(regenerateAll ? "Escenas generadas" : "Escenas faltantes generadas", "is-live");
    }
  } catch (error) {
    addChatMessage("system", error.message || "Error al generar videos");
    setGenerationStatus("Error al generar videos", "");
  } finally {
    generationKeys.forEach(k => timelineSceneVideoGenerationPending.delete(k));
    if (generationKeys.length) renderPodcastVideoTimeline(getActiveSession(), { reason: "ephemeral" });
    setButtonLoadingState(triggerButton, false);
    podcastVideoState.bulkVideoGenerationActive = false;
    podcastVideoState.bulkVideoGenerationMode = "";
    if (successCount > 0) {
      renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
      renderPodcastTransitionTimeline(getActiveSession());
      syncPodcastStudioInspector(getActiveSession());
    }
    updatePodcastPlayerUi();
  }
}

// --- Event Listeners ---

async function handlePodcasterGenerationClick(event) {
    const genAllBtn = event.target.closest("[data-action='timeline-generate-scene-video-batch']");
    if (genAllBtn) {
      runGenerateMissingDialogueVideos({ triggerButton: genAllBtn });
      return;
    }

    const regenAllBtn = event.target.closest("[data-action='timeline-regenerate-scene-video-batch-hq']");
    if (regenAllBtn) {
      runGenerateMissingDialogueVideos({ regenerateAll: true, triggerButton: regenAllBtn });
      return;
    }

    const generateAudioBtn = event.target.closest("[data-action='timeline-generate-scene-audio']");
    if (generateAudioBtn) {
      const session = getActiveSession();
      let rowId = String(generateAudioBtn.dataset.rowId || "").trim();
      if (!rowId) {
        rowId = resolveTargetVideoRowId(session);
      }
      if (!session || !rowId || podcastVideoState.busy) return;
      const shouldRegenerate = hasStoredMediaSource(resolveDialogueAudioForRow(session, rowId));
      podcastVideoState.busy = true;
      setButtonLoadingState(generateAudioBtn, true, {
        loadingTitle: shouldRegenerate ? "Regenerando voz de escena..." : "Generando voz de escena..."
      });
      updatePodcastPlayerUi();
      try {
        await runtime.generateDialogueAudioForRow(rowId, { regenerate: shouldRegenerate, silent: false });
      } catch (error) {
        console.error("[podcaster] audio generation error", error);
      } finally {
        setButtonLoadingState(generateAudioBtn, false);
        podcastVideoState.busy = false;
        updatePodcastPlayerUi();
      }
      return;
    }

    const generateBtn = event.target.closest("[data-action='timeline-generate-scene-video']");
    if (generateBtn) {
      let rowId = String(generateBtn.dataset.rowId || "").trim();
      if (!rowId) {
        const session = getActiveSession();
        rowId = resolveTargetVideoRowId(session);
      }
      if (!rowId) {
        return;
      }
      const session = getActiveSession();
      const pendingKey = `${String(session?.id || "").trim()}:${rowId}`;
      traceVisualReferenceScene("ui-generate-clicked", {
        sessionId: String(session?.id || "").trim(),
        rowId,
        sceneNumber: resolveSceneNumberByRowId(rowId, session),
        pendingKey,
        hasReferenceImage: getRowReferenceImageList(session, rowId).length > 0,
        hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[rowId] || null)
      });
      if (dialogueVideoGenerationPending.has(pendingKey)) {
        ensureTimelineScenePendingVisible(session, rowId, {
          hint: "Generacion en curso...",
          stage: "busy"
        });
        traceVisualReferenceScene("ui-generate-already-pending", {
          sessionId: String(session?.id || "").trim(),
          rowId,
          pendingKey,
          hasReferenceImage: getRowReferenceImageList(session, rowId).length > 0,
          hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[rowId] || null)
        });
        setPodcastVideoStatus("Esta escena ya se está generando. Puedes seguir reproduciendo el montaje.");
        return;
      }
      const loadingBtn = findTimelineActionButton("timeline-generate-scene-video", rowId) || generateBtn;
      try {
        await runSceneVideoGenerationFlow(rowId, {
          promptProfile: "timeline-scene-video",
          promptDirective: false,
          loadingButton: loadingBtn,
          loadingTitle: "Generando video de escena...",
          selectRow: true,
          syncStage: false,
          silent: false,
          syncStageAfterGenerate: true
        });
      } catch (error) {
        traceVisualReferenceScene("ui-generate-failed", {
          sessionId: String(session?.id || "").trim(),
          rowId,
          message: String(error?.message || "").trim(),
          hasReferenceImage: getRowReferenceImageList(session, rowId).length > 0,
          hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[rowId] || null)
        });
        setGenerationStatus("Error", "");
        addChatMessage("system", `No se pudo generar video de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
      }
      return;
    }

    const regenerateHqBtn = event.target.closest("[data-action='timeline-regenerate-scene-video-hq']");
    if (regenerateHqBtn) {
      let rowId = String(regenerateHqBtn.dataset.rowId || "").trim();
      if (!rowId) {
        const session = getActiveSession();
        rowId = resolveTargetVideoRowId(session);
      }
      if (!rowId) {
        return;
      }
      const session = getActiveSession();
      const pendingKey = `${String(session?.id || "").trim()}:${rowId}`;
      traceVisualReferenceScene("ui-regenerate-clicked", {
        sessionId: String(session?.id || "").trim(),
        rowId,
        sceneNumber: resolveSceneNumberByRowId(rowId, session),
        pendingKey,
        hasReferenceImage: getRowReferenceImageList(session, rowId).length > 0,
        hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[rowId] || null)
      });
      if (dialogueVideoGenerationPending.has(pendingKey)) {
        ensureTimelineScenePendingVisible(session, rowId, {
          hint: "Generacion en curso...",
          stage: "busy"
        });
        traceVisualReferenceScene("ui-regenerate-already-pending", {
          sessionId: String(session?.id || "").trim(),
          rowId,
          pendingKey,
          hasReferenceImage: getRowReferenceImageList(session, rowId).length > 0,
          hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[rowId] || null)
        });
        setPodcastVideoStatus("Esta escena ya se está generando. Puedes seguir reproduciendo el montaje.");
        return;
      }
      const existingClip = resolveDialogueVideoForRow(session, rowId);
      const loadingBtn = findTimelineActionButton("timeline-regenerate-scene-video-hq", rowId) || regenerateHqBtn;
      try {
        await runSceneVideoGenerationFlow(rowId, {
          promptDirective: false,
          loadingButton: loadingBtn,
          loadingTitle: hasStoredMediaSource(existingClip) ? "Analizando clip y regenerando escena..." : "Generando video de escena...",
          selectRow: true,
          syncStage: false,
          silent: false,
          syncStageAfterGenerate: true,
          enhanceFromExistingVideo: hasStoredMediaSource(existingClip)
        });
      } catch (error) {
        traceVisualReferenceScene("ui-regenerate-failed", {
          sessionId: String(session?.id || "").trim(),
          rowId,
          message: String(error?.message || "").trim(),
          hasReferenceImage: getRowReferenceImageList(session, rowId).length > 0,
          hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[rowId] || null)
        });
        setGenerationStatus("Error", "");
        addChatMessage("system", `No se pudo regenerar con mejora la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
      }
      return;
    }
}

function logSceneVideoGeneration(stage = "", meta = {}) {
  console.log(`[SceneVideoGeneration][${stage}]`, meta);
}

document.addEventListener("click", handlePodcasterGenerationClick, { capture: true });


registerPodcasterGenerationShared({
  dialogueVideoGenerationPending,
  timelineSceneVideoGenerationPending,
  timelineSceneVideoGenerationStatus,
  brokenDialogueVideoRows,
  buildTimelineSceneGenerationKey,
  runSceneVideoGenerationFlow,
  generateDialogueVideoForRow,
  generateDialogueAudioForRow: (rowId, options) => runtime.generateDialogueAudioForRow(rowId, options)
});
