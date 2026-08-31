
import { authFetchJson, buildVeoApiUrl } from "../js/api-client-podcaster.js";
import { requirePodcasterGenerationRuntime } from "./podcaster-runtime-registry.js";
import { podcasterGenerationShared, registerPodcasterGenerationShared } from "./podcaster-generation-shared.js";
import { isReelModeEnabled } from "./podcaster-reels.js";
import {
  preserveTimelineTrimAfterVideoGeneration,
  resolveGeneratedVideoDurationSec,
  resolveVideoPhysicalDurationMs
} from "./podcaster-video-generation-timing.js";
import {
  AVAILABLE_PODCASTER_VIDEO_MODELS,
  isVertexVeoModelId,
  normalizeVertexVeoModelId
} from "./podcaster-video-model-catalog.js";

const runtime = requirePodcasterGenerationRuntime();

// --- Constants ---
const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 3;
const DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES = 7 * 1024 * 1024;
const DIALOGUE_VIDEO_POLL_TIMEOUT_MS = 11 * 60 * 1000;
const PODCASTER_VIDEO_PROMPT_PROFILE = "podcaster_video_v2";
const PODCASTER_VIDEO_MODEL_AUTO = "auto";
const PODCASTER_VIDEO_MODEL_OMNI = "gemini-omni-flash-preview";
const PODCASTER_VIDEO_MODEL_VEO_STANDARD = "veo-3.1-generate-001";
const PODCASTER_VIDEO_MODEL_VEO_FAST = "veo-3.1-fast-generate-001";
const PODCASTER_VIDEO_MODEL_VEO_LITE = "veo-3.1-lite-generate-001";
const PODCASTER_VIDEO_MODEL_PREFERENCES = Object.freeze([
  PODCASTER_VIDEO_MODEL_AUTO,
  ...AVAILABLE_PODCASTER_VIDEO_MODELS
]);
const LEGACY_PODCASTER_VIDEO_MODEL_MAP = Object.freeze({
  "veo-3.1-generate-preview": PODCASTER_VIDEO_MODEL_VEO_STANDARD,
  "veo-3.1-fast-generate-preview": PODCASTER_VIDEO_MODEL_VEO_FAST,
  "veo-3.1-lite-generate-preview": PODCASTER_VIDEO_MODEL_VEO_LITE
});
const VISIBLE_TEXT_DIRECTIVE_PATTERN = /\b(texto|textos|palabra|palabras|letra|letras|letrero|letreros|r[oó]tulo|r[oó]tulos|subt[ií]tulo|subt[ií]tulos|t[ií]tulo|t[ií]tulos|logo|logos|marca|marcas|caption|captions|headline|headlines|title|titles|sign|signs|label|labels|letter|letters|word|words|typography)\b/i;

// --- State ---
const dialogueVideoGenerationTasks = new Map();
const dialogueVideoGenerationJobs = new Map();
const dialogueVideoGenerationCanceled = new Set();
const dialogueVideoGenerationPending = podcasterGenerationShared.dialogueVideoGenerationPending;
const timelineSceneVideoGenerationPending = podcasterGenerationShared.timelineSceneVideoGenerationPending;
const timelineSceneVideoGenerationStatus = podcasterGenerationShared.timelineSceneVideoGenerationStatus;
const brokenDialogueVideoRows = podcasterGenerationShared.brokenDialogueVideoRows;
let nextDialogueVideoRequestAt = 0;

// --- Helpers ---

function createSceneAudioGenerationFlight(trigger = null, rowId = "") {
  const key = String(rowId || "").trim();
  const sourceRect = trigger?.getBoundingClientRect?.();
  if (!key || !sourceRect?.width || !sourceRect?.height) {
    return { finish: async () => {} };
  }
  const activeSession = getActiveSession();
  const sourceRow = (activeSession?.script?.rows || [])
    .find((row) => String(row?.id || "").trim() === key) || null;
  const voiceOverText = String(
    window.buildTargetSpeechLine?.(sourceRow, activeSession)
    || sourceRow?.voiceOverText
    || sourceRow?.text
    || ""
  ).trim();
  const scriptWords = (voiceOverText.match(/[\p{L}\p{N}]+/gu) || [])
    .filter((word) => word.length > 1)
    .slice(0, 4);
  while (scriptWords.length < 4) scriptWords.push("voz");

  const sourceX = sourceRect.left + (sourceRect.width / 2);
  const sourceY = sourceRect.top + (sourceRect.height / 2);
  const root = document.createElement("div");
  root.className = "podcast-scene-audio-vector-flight";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <svg class="podcast-scene-audio-flight-path" width="100%" height="100%">
      <path fill="none" stroke="var(--studio-accent, #3b82f6)" stroke-width="2.5"
        stroke-linecap="round" stroke-dasharray="7 10" opacity="0"></path>
    </svg>
    <div class="podcast-scene-audio-flight-symbol">
      <svg viewBox="-64 -64 128 128" width="128" height="128">
        <defs>
          <radialGradient id="sceneAudioOrbGradient" cx="35%" cy="30%" r="75%">
            <stop offset="0" stop-color="#bae6fd"></stop>
            <stop offset=".38" stop-color="#38bdf8"></stop>
            <stop offset="1" stop-color="#2563eb"></stop>
          </radialGradient>
          <filter id="sceneAudioOrbGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur"></feGaussianBlur>
            <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
          </filter>
        </defs>
        <circle class="scene-audio-orbit is-outer" cx="0" cy="0" r="48" fill="none"
          stroke="#7dd3fc" stroke-width="2.5" stroke-dasharray="10 8"></circle>
        <circle class="scene-audio-orbit is-inner" cx="0" cy="0" r="37" fill="none"
          stroke="#a78bfa" stroke-width="2" stroke-dasharray="5 7"></circle>
        <circle class="scene-audio-orb" cx="0" cy="0" r="23" fill="url(#sceneAudioOrbGradient)"
          filter="url(#sceneAudioOrbGlow)"></circle>
        <text class="scene-audio-word word-1" x="-36" y="-40" text-anchor="middle" fill="#f8fafc"
          font-weight="700" font-family="Sora, sans-serif"></text>
        <text class="scene-audio-word word-2" x="34" y="-36" text-anchor="middle" fill="#f8fafc"
          font-weight="650" font-family="Sora, sans-serif"></text>
        <text class="scene-audio-word word-3" x="38" y="38" text-anchor="middle" fill="#f8fafc"
          font-weight="650" font-family="Sora, sans-serif"></text>
        <text class="scene-audio-word word-4" x="-38" y="40" text-anchor="middle" fill="#f8fafc"
          font-weight="650" font-family="Sora, sans-serif"></text>
        <path class="scene-audio-wave" d="M-10-6c7 4 7 8 0 12M-3-13c15 9 15 17 0 26"
          fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"></path>
      </svg>
    </div>
  `;
  Array.from(root.querySelectorAll(".scene-audio-word")).forEach((wordNode, index) => {
    const word = scriptWords[index] || "voz";
    wordNode.textContent = word;
    wordNode.setAttribute("font-size", String(word.length > 11 ? 7 : word.length > 8 ? 8 : 10));
  });
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "2147483646"
  });
  const pathSvg = root.querySelector(".podcast-scene-audio-flight-path");
  Object.assign(pathSvg.style, { position: "absolute", inset: "0", overflow: "visible" });
  const symbol = root.querySelector(".podcast-scene-audio-flight-symbol");
  Object.assign(symbol.style, {
    position: "absolute",
    left: "-64px",
    top: "-64px",
    width: "128px",
    height: "128px",
    willChange: "transform, opacity"
  });
  document.body.appendChild(root);

  const animePromise = typeof runtime.loadAnimeJs === "function"
    ? runtime.loadAnimeJs()
    : Promise.resolve(window.anime);
  let idleAnimations = [];
  animePromise.then((anime) => {
    if (typeof anime !== "function" || !root.isConnected) return;
    anime.set(symbol, { translateX: sourceX, translateY: sourceY, scale: 0 });
    idleAnimations = [
      anime({
        targets: symbol,
        scale: [0, 1.08, 1],
        rotate: [0, 8, 0],
        duration: 620,
        easing: "easeOutElastic(1, .55)"
      }),
      anime({
        targets: root.querySelector(".scene-audio-orbit.is-outer"),
        rotate: [0, 360],
        duration: 1500,
        loop: true,
        easing: "linear"
      }),
      anime({
        targets: root.querySelector(".scene-audio-orbit.is-inner"),
        rotate: [0, -360],
        duration: 1150,
        loop: true,
        easing: "linear"
      }),
      anime({
        targets: root.querySelectorAll(".scene-audio-word"),
        translateY: [-3, 4],
        scale: [0.88, 1.08],
        opacity: [0.65, 1],
        delay: anime.stagger(120),
        duration: 620,
        direction: "alternate",
        loop: true,
        easing: "easeInOutSine"
      }),
      anime({
        targets: root.querySelector(".scene-audio-wave"),
        opacity: [0.35, 1],
        scale: [0.9, 1.12],
        duration: 480,
        direction: "alternate",
        loop: true,
        easing: "easeInOutSine"
      })
    ];
  });

  return {
    finish: async (success = true) => {
      const anime = await animePromise;
      idleAnimations.forEach((animation) => animation?.pause?.());
      if (typeof anime !== "function" || !root.isConnected) {
        root.remove();
        return;
      }
      if (!success) {
        anime({
          targets: root,
          opacity: [1, 0],
          scale: [1, 0.72],
          duration: 260,
          easing: "easeInQuad",
          complete: () => root.remove()
        });
        return;
      }

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const escapedRowId = CSS.escape(key);
      const isVisible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0
          && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden";
      };
      const targetSelectors = [
        `.podcast-montage-audio-chip[data-row-id="${escapedRowId}"]`,
        `[data-action="timeline-select-gemini-audio"][data-row-id="${escapedRowId}"]`,
        `.podcast-montage-audio-lane [data-row-id="${escapedRowId}"]`,
        `.podcast-audio-track-lane [data-row-id="${escapedRowId}"]`
      ];
      const target = targetSelectors
        .map((selector) => document.querySelector(selector))
        .find(isVisible) || null;
      const sceneClip = document.querySelector(
        `.podcast-video-timeline-clip[data-row-id="${escapedRowId}"], `
        + `.podcast-video-timeline-item[data-row-id="${escapedRowId}"]`
      );
      const audioLane = Array.from(document.querySelectorAll(
        ".podcast-montage-audio-lane, .podcast-audio-track-lane"
      )).find(isVisible) || null;
      const scrollAnchor = target || sceneClip || audioLane;
      scrollAnchor?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const targetRect = target?.getBoundingClientRect?.() || null;
      const sceneRect = sceneClip?.getBoundingClientRect?.() || null;
      const laneRect = audioLane?.getBoundingClientRect?.() || null;
      const targetX = targetRect
        ? targetRect.left + (targetRect.width / 2)
        : sceneRect
          ? sceneRect.left + (sceneRect.width / 2)
          : laneRect
            ? laneRect.left + Math.min(laneRect.width * 0.25, 240)
            : window.innerWidth / 2;
      const targetY = targetRect
        ? targetRect.top + (targetRect.height / 2)
        : laneRect
          ? laneRect.top + (laneRect.height / 2)
          : sceneRect
            ? sceneRect.bottom + 34
            : window.innerHeight * 0.72;
      const curve = Math.max(90, Math.min(220, Math.abs(targetY - sourceY) * 0.45));
      const path = root.querySelector(".podcast-scene-audio-flight-path path");
      path.setAttribute(
        "d",
        `M ${sourceX} ${sourceY} C ${sourceX + 35} ${sourceY - curve}, ${targetX - 45} ${targetY - curve}, ${targetX} ${targetY}`
      );
      const motionPath = anime.path(path);
      anime.remove([symbol, path, ...(target ? [target] : [])]);
      anime({
        targets: path,
        strokeDashoffset: [anime.setDashoffset, 0],
        opacity: [0, 0.9, 0],
        duration: 1120,
        easing: "easeInOutSine"
      });
      anime.timeline({
        complete: () => {
          root.remove();
          if (!target) return;
          anime({
            targets: target,
            scale: [0.86, 1.1, 0.96, 1],
            filter: ["brightness(1)", "brightness(1.45)", "brightness(1)"],
            duration: 620,
            easing: "easeOutElastic(1, .55)"
          });
        }
      }).add({
        targets: symbol,
        translateX: motionPath("x"),
        translateY: motionPath("y"),
        rotate: motionPath("angle"),
        scale: [
          { value: 1.08, duration: 180 },
          { value: 0.72, duration: 620 },
          { value: 0.08, duration: 250 }
        ],
        opacity: [1, 1, 0],
        duration: 1080,
        easing: "easeInOutCubic"
      });
    }
  };
}

function createDialogueVideoCanceledError() {
  const error = new Error("Generación cancelada.");
  error.name = "AbortError";
  error.code = "dialogue_video_canceled";
  error.status = 499;
  error.isCanceled = true;
  return error;
}

function isDialogueVideoCanceledError(error = null) {
  return Boolean(
    error?.isCanceled === true
    || error?.name === "AbortError"
    || error?.code === "dialogue_video_canceled"
    || Number(error?.status || 0) === 499
  );
}

async function requestDialogueVideoJobCancellation(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return null;
  return authFetchJson(buildVeoApiUrl("/api/podcaster/dialogue-videos/cancel"), {
    method: "POST",
    body: JSON.stringify({ jobId: cleanJobId })
  });
}

async function cancelDialogueVideoForRow(rowId = "") {
  const session = getActiveSession();
  const key = String(rowId || "").trim();
  const sessionId = String(session?.id || "").trim();
  const pendingKey = `${sessionId}:${key}`;
  if (!sessionId || !key || !dialogueVideoGenerationTasks.has(pendingKey)) return false;

  dialogueVideoGenerationCanceled.add(pendingKey);
  const jobId = String(dialogueVideoGenerationJobs.get(pendingKey) || "").trim();
  const generationKey = buildTimelineSceneGenerationKey(session, key);
  if (generationKey) {
    timelineSceneVideoGenerationStatus.set(generationKey, {
      hint: "Cancelando generación...",
      stage: "canceling"
    });
    renderPodcastVideoTimeline(getActiveSession(), { reason: "ephemeral" });
  }

  try {
    if (jobId) await requestDialogueVideoJobCancellation(jobId);
    setGenerationStatus("Generación cancelada", "");
    setPodcastVideoStatus(`Generación de escena ${resolveSceneNumberByRowId(key, session)} cancelada.`);
  } catch (error) {
    if (!isDialogueVideoCanceledError(error)) {
      console.warn("[Podcaster][SceneVideo] No se confirmó la cancelación remota", error);
    }
  }
  return true;
}

function normalizePodcasterVideoModelPreference(value = "") {
  const requested = normalizeVertexVeoModelId(value);
  if (PODCASTER_VIDEO_MODEL_PREFERENCES.includes(requested) || isVertexVeoModelId(requested)) return requested;
  return LEGACY_PODCASTER_VIDEO_MODEL_MAP[requested] || PODCASTER_VIDEO_MODEL_AUTO;
}

function resolvePodcasterVideoGeneratorPreference(modelPreference = PODCASTER_VIDEO_MODEL_AUTO, requestedGenerator = "") {
  const explicitGenerator = String(requestedGenerator || "").trim().toLowerCase();
  if (["auto", "omni", "veo"].includes(explicitGenerator)) return explicitGenerator;
  if (modelPreference === PODCASTER_VIDEO_MODEL_OMNI) return "omni";
  if (String(modelPreference || "").startsWith("veo-")) return "veo";
  return "auto";
}

function resolvePodcasterVideoRouting(options = {}) {
  const configuredModel = normalizePodcasterVideoModelPreference(options.modelPreference);
  const generator = resolvePodcasterVideoGeneratorPreference(configuredModel, options.generator);
  const highQuality = options.highQuality === true;
  let model = configuredModel;
  if (generator === "auto") model = PODCASTER_VIDEO_MODEL_AUTO;
  if (generator === "omni") model = PODCASTER_VIDEO_MODEL_OMNI;
  if (generator === "veo") {
    if (!String(model || "").startsWith("veo-")) model = PODCASTER_VIDEO_MODEL_VEO_STANDARD;
    if (highQuality) model = PODCASTER_VIDEO_MODEL_VEO_STANDARD;
  }
  const quality = highQuality
    ? "final"
    : (["draft", "final"].includes(String(options.quality || "").trim().toLowerCase())
      ? String(options.quality).trim().toLowerCase()
      : (model === PODCASTER_VIDEO_MODEL_VEO_LITE ? "draft" : "final"));
  const resolvedGeneratorHint = generator === "auto"
    ? ((options.hasReferenceVideo === true || options.requiresLastFrame === true || options.requiresExtension === true) ? "veo" : "omni")
    : generator;
  return { generator, model, quality, resolvedGeneratorHint };
}

function normalizeInSceneText(value = "") {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n")
    .trim();
}

function resolveRowInSceneText(row = null) {
  const canonicalNormalizer = window.PodcasterOnScreenTextRenderSpec?.normalizePodcasterSceneTextFields;
  if (typeof canonicalNormalizer === "function") {
    return normalizeInSceneText(canonicalNormalizer(row || {})?.inSceneText || "");
  }
  return normalizeInSceneText(
    row?.inSceneText
    || row?.inVideoText
    || row?.embeddedText
    || row?.sceneText
    || ""
  );
}

function validateInSceneText(value = "") {
  const text = normalizeInSceneText(value);
  if (!text) return { valid: true, text: "", wordCount: 0 };
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (text.length > 280 || wordCount > 40 || text.split("\n").length > 4) {
    return {
      valid: false,
      text,
      wordCount,
      message: "El texto dentro del video admite hasta 4 líneas, 40 palabras y 280 caracteres."
    };
  }
  return { valid: true, text, wordCount };
}

function sanitizeVisualPromptText(value = "", field = "") {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  if (!source) return { value: "", removed: 0, field };
  const chunks = source.match(/[^.!?;]+[.!?;]?/g) || [source];
  let removed = 0;
  const kept = chunks.filter((chunk) => {
    if (!VISIBLE_TEXT_DIRECTIVE_PATTERN.test(chunk)) return true;
    removed += 1;
    return false;
  });
  return {
    value: kept.join(" ").replace(/\s+/g, " ").trim(),
    removed,
    field
  };
}

function sanitizeVisualPromptFields(fields = {}) {
  const sanitized = {};
  const removedTextDirectives = [];
  Object.entries(fields || {}).forEach(([field, value]) => {
    if (Array.isArray(value)) {
      const cleanItems = [];
      let removed = 0;
      value.forEach((item) => {
        const result = sanitizeVisualPromptText(item, field);
        removed += result.removed;
        if (result.value) cleanItems.push(result.value);
      });
      sanitized[field] = cleanItems;
      if (removed > 0) removedTextDirectives.push({ field, count: removed });
      return;
    }
    const result = sanitizeVisualPromptText(value, field);
    sanitized[field] = result.value;
    if (result.removed > 0) removedTextDirectives.push({ field, count: result.removed });
  });
  return { sanitized, removedTextDirectives };
}

function resolveDialogueVideoInteractionId(sceneClip = null) {
  const segments = Array.isArray(sceneClip?.segments) ? sceneClip.segments : [];
  const generatedVideos = Array.isArray(sceneClip?.generatedVideos) ? sceneClip.generatedVideos : [];
  return String(
    sceneClip?.interactionId
    || sceneClip?.primarySegment?.interactionId
    || segments.map((segment) => segment?.interactionId).find(Boolean)
    || generatedVideos.map((item) => item?.interactionId || item?.video?.interactionId).find(Boolean)
    || ""
  ).trim();
}

function extractGenerationErrorText(value = null, fallback = "", seen = new Set()) {
  if (value == null) return String(fallback || "").trim();
  if (typeof value === "string") {
    const text = value.trim();
    return text && text !== "[object Object]" ? text : String(fallback || "").trim();
  }
  if (typeof value !== "object") {
    const text = String(value || "").trim();
    return text && text !== "[object Object]" ? text : String(fallback || "").trim();
  }
  if (seen.has(value)) return String(fallback || "").trim();
  seen.add(value);

  const candidates = [
    value?.error,
    value?.message,
    value?.detail,
    value?.reason,
    value?.code
  ];
  for (const candidate of candidates) {
    const text = extractGenerationErrorText(candidate, "", seen);
    if (text) return text;
  }
  try {
    const text = JSON.stringify(value);
    return text && text !== "{}" ? text : String(fallback || "").trim();
  } catch (_) {
    return String(fallback || "").trim();
  }
}

function buildGenerationErrorMessage(error = null, fallback = "") {
  if (typeof runtime.buildPodcasterApiErrorMessage === "function") {
    return runtime.buildPodcasterApiErrorMessage(error, fallback);
  }
  if (error && typeof error === "object") {
    const nested = extractGenerationErrorText(error?.detail, "", new Set()) || extractGenerationErrorText(error, fallback, new Set());
    return nested || "No se pudo completar la acción.";
  }
  return String(fallback || error || "No se pudo completar la acción.").trim() || "No se pudo completar la acción.";
}

function extractDialogueVideoBusyDetail(source = null) {
  const detail = source?.detail && typeof source.detail === "object"
    ? source.detail
    : (source && typeof source === "object" ? source : null);
  if (!detail) return null;
  return {
    kind: String(detail.kind || detail.requestedKind || "").trim(),
    activeJobId: String(detail.activeJobId || "").trim(),
    activeCount: Math.max(0, Number(detail.activeCount || 0) || 0),
    fallbackMode: String(detail.fallbackMode || "").trim(),
    reason: String(detail.reason || "").trim()
  };
}

function buildDialogueVideoBusyHint(source = null, attempt = 0, maxAttempts = 0) {
  const detail = extractDialogueVideoBusyDetail(source);
  const attemptLabel = maxAttempts > 0 ? ` (intento ${attempt}/${maxAttempts})` : "";
  if (detail?.fallbackMode === "direct_in_memory" || detail?.reason === "bullmq_queue_unavailable") {
    return `Backend ocupado con otra generación pesada. Reintentando${attemptLabel}...`;
  }
  if (detail?.kind === "dialogue_video" || detail?.activeCount > 0) {
    return `Backend ocupado con otra generación de escena. Reintentando${attemptLabel}...`;
  }
  return `Servidor ocupado. Reintentando${attemptLabel}...`;
}

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
      hasDataUrl: Boolean(String(item?.dataUrl || "").trim()),
      hasDownloadUrl: Boolean(String(item?.downloadUrl || item?.url || "").trim()),
      hasStoragePath: Boolean(String(item?.storagePath || item?.path || "").trim()),
      ...formatInlineAssetDebug(item?.dataUrl || "")
    }))
    .filter((item) => item.mimeType || item.hasDownloadUrl || item.hasStoragePath);
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

function isTimelineSceneRowGenerating(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const generationKey = buildTimelineSceneGenerationKey(activeSession, rowId);
  if (!generationKey) return false;
  return timelineSceneVideoGenerationPending.has(generationKey)
    || dialogueVideoGenerationPending.has(generationKey);
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

function normalizeReferenceImagePayloadItem(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const dataUrl = normalizeInlineDataUrl(raw?.dataUrl || "");
  const downloadUrl = String(raw?.downloadUrl || raw?.url || "").trim();
  const storagePath = String(raw?.storagePath || raw?.path || "").trim();
  if (!dataUrl && !downloadUrl && !storagePath) return null;
  return {
    name: String(raw?.name || "").trim(),
    dataUrl,
    downloadUrl,
    storagePath,
    mimeType: String(raw?.mimeType || "image/png").trim().toLowerCase() || "image/png",
    type: "image"
  };
}

function dedupeReferenceImagePayload(records = [], maxItems = DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT) {
  const seen = new Set();
  const next = [];
  const normalized = Array.isArray(records)
    ? records.map((record) => normalizeReferenceImagePayloadItem(record)).filter(Boolean)
    : [];
  const effectiveLimit = Math.max(1, Math.min(DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT, Number(maxItems || DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT) || DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT));
  for (const item of normalized) {
    const fingerprint = String(
      item.storagePath
      || item.downloadUrl
      || item.dataUrl
      || item.name
      || ""
    ).trim();
    if (!fingerprint) continue;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    next.push(item);
    if (next.length >= effectiveLimit) break;
  }
  return next;
}

function resolveSceneReferenceText({ row = null, options = {} }) {
  const manualOverrideProvided = Object.prototype.hasOwnProperty.call(options || {}, "inSceneText");
  const manualText = manualOverrideProvided ? normalizeInSceneText(options?.inSceneText) : "";
  if (manualText) {
    return {
      text: manualText,
      source: "manual"
    };
  }

  const rowText = resolveRowInSceneText(row);
  if (rowText) {
    return {
      text: rowText,
      source: "scene"
    };
  }

  const referenceText = normalizeInSceneText(options?.referenceText);
  if (referenceText) {
    return {
      text: referenceText,
      source: "reference"
    };
  }

  const overlayText = normalizeInSceneText(
    String(options?.headlineText || options?.captionText || options?.overlayText || "")
  );
  return {
    text: overlayText,
    source: overlayText ? "overlay" : "none"
  };
}

function resolveSceneReferenceImages(session = null, rowId = "", rowReferenceMode = "image", rowReferenceImages = [], rowReferenceVideo = null, rowReferenceFallback = {}) {
  const explicitMode = String(rowReferenceMode || "").trim().toLowerCase();
  if (explicitMode === "none") {
    return {
      referenceMode: "none",
      referenceImages: [],
      primaryImage: null
    };
  }
  const explicitModeNormalized = explicitMode === "video" ? "video" : "image";
  if (explicitModeNormalized === "video" && rowReferenceVideo) {
    return {
      referenceMode: "video",
      referenceImages: [],
      primaryImage: null
    };
  }
  const fallbackReferences = [];
  const seeded = Array.isArray(rowReferenceImages)
    ? rowReferenceImages
    : (typeof rowReferenceImages === "undefined" || rowReferenceImages === null ? [] : [rowReferenceImages]);
  if (seeded.length) {
    fallbackReferences.push(...seeded);
  } else {
    const speakerReferenceImage = rowReferenceFallback.speakerReferenceImage || null;
    const scenarioReferenceImage = rowReferenceFallback.scenarioReferenceImage || null;
    if (speakerReferenceImage) fallbackReferences.push(speakerReferenceImage);
    if (scenarioReferenceImage) fallbackReferences.push(scenarioReferenceImage);
  }
  const referenceImages = dedupeReferenceImagePayload(fallbackReferences, DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT);
  return {
    referenceMode: "image",
    referenceImages,
    primaryImage: referenceImages[0] || null
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

function isMostlyDarkCanvas(canvas = null) {
  if (!canvas || typeof canvas.getContext !== "function") return true;
  const width = Math.max(8, Math.min(32, Math.floor(Number(canvas.width || 0) || 0)));
  const height = Math.max(8, Math.min(18, Math.floor(Number(canvas.height || 0) || 0)));
  if (!width || !height) return true;
  try {
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = width;
    sampleCanvas.height = height;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    if (!sampleCtx) return true;
    sampleCtx.drawImage(canvas, 0, 0, width, height);
    const { data } = sampleCtx.getImageData(0, 0, width, height);
    let sum = 0;
    let active = 0;
    let bright = 0;
    for (let i = 0; i < data.length; i += 16) {
      const alpha = data[i + 3] || 0;
      if (alpha < 16) continue;
      const brightness = ((data[i] || 0) + (data[i + 1] || 0) + (data[i + 2] || 0)) / 3;
      sum += brightness;
      active += 1;
      if (brightness >= 42) bright += 1;
    }
    if (!active) return true;
    const avgBrightness = sum / active;
    const brightRatio = bright / active;
    return avgBrightness < 26 && brightRatio < 0.08;
  } catch (_) {
    return true;
  }
}


const captureContinuityFrameDataUrl = async (videoSrc = "") => {
  const src = String(videoSrc || "").trim();
  if (!src) return "";
  const seekFractions = [0.95, 0.86, 0.74, 0.62, 0.5, 0.38, 0.24];
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let done = false;
    let seekIndex = 0;
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
        seekIndex = 0;
        const seekTo = Math.max(0, dur * seekFractions[seekIndex]);
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
        if (isMostlyDarkCanvas(canvas)) {
          seekIndex += 1;
          if (seekIndex < seekFractions.length) {
            try {
              video.currentTime = Math.max(0, Number(video.duration || 0) * seekFractions[seekIndex]);
              return;
            } catch (_) { }
          }
          clear();
          finish("");
          return;
        }
        const dataUrl = canvas.toDataURL("image/png");
        clear();
        finish(dataUrl);
      } catch (_) {
        clear();
        finish("");
      }
    });
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
  const maxAttempts = Math.ceil(DIALOGUE_VIDEO_POLL_TIMEOUT_MS / pollIntervalMs);
  const pollStartedAt = Date.now();
  let lastStateKey = "";
  let lastData = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.pendingKey && dialogueVideoGenerationCanceled.has(options.pendingKey)) {
      throw createDialogueVideoCanceledError();
    }
    const data = await authFetchJson(buildVeoApiUrl(`/api/podcaster/dialogue-videos/generate-status?jobId=${encodeURIComponent(cleanJobId)}`));
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
    if (status === "canceled") {
      throw createDialogueVideoCanceledError();
    }
    if (status === "error") {
      const rawError = data?.error && typeof data.error === "object" ? data.error : { error: data?.error };
      const message = buildGenerationErrorMessage({
        status: Number(rawError?.status || 500) || 500,
        code: rawError?.code,
        detail: rawError?.detail || rawError,
        message: extractGenerationErrorText(rawError, hint || "No se pudo generar el video.")
      }, hint || "No se pudo generar el video.");
      const error = new Error(message);
      error.status = Number(rawError?.status || 500) || 500;
      error.detail = rawError?.detail || rawError || null;
      throw error;
    }
    if (!silent) {
      const waitedSec = Math.max(0, Math.round((attempt * pollIntervalMs) / 1000));
      const fallbackHint = `Generando video${sceneNumber ? ` de escena ${sceneNumber}` : ""}... (${waitedSec}s)`;
      setGenerationStatus(hint || fallbackHint, "is-busy");
    }
    const elapsedMs = Date.now() - pollStartedAt;
    if (elapsedMs >= DIALOGUE_VIDEO_POLL_TIMEOUT_MS) break;
    await sleep(Math.min(pollIntervalMs, DIALOGUE_VIDEO_POLL_TIMEOUT_MS - elapsedMs));
  }
  const error = new Error("Tiempo de espera agotado al generar video de la escena.");
  error.status = 504;
  error.detail = lastData;
  throw error;
}

async function generateDialogueVideoForRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  let session = getActiveSession();
  let sessionId = String(session?.id || "").trim();
  if (!sessionId || !key) return null;
  let rows = session?.script?.rows || [];
  let rowIndex = rows.findIndex((item) => String(item?.id || "").trim() === key);
  let row = rowIndex >= 0 ? rows[rowIndex] : null;
  if (!row) return null;
  if (typeof runtime.hydrateSessionReferenceMedia === "function") {
    try {
      await runtime.hydrateSessionReferenceMedia(session);
    } catch (_) { }
  }
  if (typeof window.PodcasterMediaReferenceApi?.waitForRowReferenceUploads === "function") {
    await window.PodcasterMediaReferenceApi.waitForRowReferenceUploads(key);
  }
  session = getActiveSession() || session;
  sessionId = String(session?.id || "").trim();
  rows = session?.script?.rows || [];
  rowIndex = rows.findIndex((item) => String(item?.id || "").trim() === key);
  row = rowIndex >= 0 ? rows[rowIndex] : null;
  if (!sessionId || !row) return null;

  /*
  const rowReferenceVideo = getRowReferenceVideoMap(session)[key] || null;
  const effectiveReferenceMode = explicitReferenceMode === "video" && rowReferenceVideo ? "video" : "image";
  const referenceMode = effectiveReferenceMode;
  const inlineReferenceBudget = buildDialogueVideoInlineReferenceBudget(effectiveReferenceImages, extendVideo ? null : rowReferenceVideo, continuityReferenceImageDataUrl);
  const speakerReferenceImage = typeof runtime.getSpeakerReferenceImageMap === "function" ? (runtime.getSpeakerReferenceImageMap(session)[speakerLabel] || null) : null;
  const activeScenarioAsset = typeof runtime.resolveActiveGlobalScenarioAsset === "function" ? (runtime.resolveActiveGlobalScenarioAsset(session) || null) : null;
  const scenarioReferenceImage = activeScenarioAsset && typeof runtime.getScenarioReferenceImageMap === "function" ? (runtime.getScenarioReferenceImageMap(session)[String(activeScenarioAsset?.id || "").trim()] || null) : null;
  const fallbackReferenceImages = [speakerReferenceImage, scenarioReferenceImage].filter(Boolean);
  const effectiveReferenceImages = rowReferenceImages.length || rowReferenceVideo ? rowReferenceImages : fallbackReferenceImages;
  const rowReferenceImage = effectiveReferenceImages[0] || getRowReferenceImageMap(session)[key] || speakerReferenceImage || scenarioReferenceImage || null;
  const inlineReferenceBudget = buildDialogueVideoInlineReferenceBudget(effectiveReferenceImages, rowReferenceVideo, continuityReferenceImageDataUrl);
  referenceImages: effectiveReferenceImages,
  referenceImageNames: effectiveReferenceImages.map((item) => String(item?.name || "").trim()).filter(Boolean).slice(0, DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT),
  */

  const speakerLabel = String(row?.speaker || "").trim();
  const educationalMode = isEducationalVideoMode(session);
  const rowReferenceImages = getRowReferenceImageList(session, key);
  const canonicalRowReferencePayload = window.PodcasterMediaReferenceApi?.buildCanonicalRowReferencePayload?.(session, key) || null;
  const rowReferenceImagesBySession = canonicalRowReferencePayload
    ? canonicalRowReferencePayload.referenceImages
    : rowReferenceImages;
  const unavailableRowReference = rowReferenceImagesBySession.find((reference) => (
    !String(reference?.storagePath || reference?.path || "").trim()
  ));
  if (unavailableRowReference) {
    const error = new Error(
      "La imagen de referencia de esta escena no terminó de subirse. Vuelve a adjuntarla, espera a que se guarde y genera otra vez."
    );
    error.code = "reference_image_upload_required";
    error.retryable = false;
    throw error;
  }
  const rowReferenceVideo = canonicalRowReferencePayload
    ? canonicalRowReferencePayload.referenceVideo
    : (getRowReferenceVideoMap(session)[key] || null);
  const rowReferenceModeMap = typeof runtime.getRowReferenceModeByRowId === "function"
    ? (runtime.getRowReferenceModeByRowId(session) || {})
    : {};
  const explicitReferenceMode = String(
    canonicalRowReferencePayload?.referenceMode
    || rowReferenceModeMap?.[key]
    || ""
  ).trim().toLowerCase();
  const speakerReferenceImage = typeof runtime.getSpeakerReferenceImageMap === "function"
    ? (runtime.getSpeakerReferenceImageMap(session)[speakerLabel] || null)
    : null;
  const activeScenarioAsset = typeof runtime.resolveActiveGlobalScenarioAsset === "function"
    ? (runtime.resolveActiveGlobalScenarioAsset(session) || null)
    : null;
  const scenarioReferenceImage = activeScenarioAsset && typeof runtime.getScenarioReferenceImageMap === "function"
    ? (runtime.getScenarioReferenceImageMap(session)[String(activeScenarioAsset?.id || "").trim()] || null)
    : null;
  const resolvedSceneReferences = resolveSceneReferenceImages(
    session,
    key,
    explicitReferenceMode,
    rowReferenceImagesBySession,
    rowReferenceVideo,
    {
      speakerReferenceImage,
      scenarioReferenceImage
    }
  );
  const referenceMode = resolvedSceneReferences.referenceMode;
  const effectiveReferenceImages = resolvedSceneReferences.referenceImages;
  const pendingKey = `${sessionId}:${key}`;

  if (dialogueVideoGenerationTasks.has(pendingKey)) {
    return dialogueVideoGenerationTasks.get(pendingKey);
  }
  if (dialogueVideoGenerationPending.has(pendingKey)) return null;
  dialogueVideoGenerationCanceled.delete(pendingKey);

  const currentMap = getDialogueVideoMap(session);
  const regenerate = options.regenerate === true;
  const enhanceFromExistingVideo = options.enhanceFromExistingVideo === true;
  const silent = options.silent === true;
  const videoCfg = typeof runtime.getPodcastVideoConfig === "function" ? runtime.getPodcastVideoConfig(session) : {};
  const normalizeSceneTextFields = window.PodcasterOnScreenTextRenderSpec?.normalizePodcasterSceneTextFields;
  const sceneTextFields = typeof normalizeSceneTextFields === "function"
    ? normalizeSceneTextFields(row || {})
    : {
      headlineText: String(row?.headlineText || "").replace(/\s+/g, " ").trim(),
      captionText: String(row?.captionText || "").trim(),
      inSceneText: normalizeInSceneText(row?.inSceneText || ""),
      overlayMode: String(row?.overlayMode || "none").trim() || "none",
      textSource: String(row?.textSource || "manual").trim() || "manual"
    };
  const resolvedSceneReferenceText = resolveSceneReferenceText({
    row,
    options: {
      inSceneText: options.inSceneText,
      referenceText: options.referenceText,
      headlineText: sceneTextFields.headlineText,
      captionText: sceneTextFields.captionText
    }
  });
  const inSceneTextSource = String(resolvedSceneReferenceText.source || "").trim();
  const shouldValidateInSceneText = ["manual", "scene", "reference"].includes(inSceneTextSource);
  const inSceneTextValidation = shouldValidateInSceneText
    ? validateInSceneText(resolvedSceneReferenceText.text)
    : { valid: true, text: "", wordCount: 0 };
  if (!inSceneTextValidation.valid) {
    const error = new Error(inSceneTextValidation.message);
    error.status = 400;
    error.code = "in_scene_text_invalid";
    throw error;
  }
  const inSceneText = shouldValidateInSceneText ? inSceneTextValidation.text : "";
  const rawVideoDirective = String(options.videoDirective || row?.videoDirective || resolveVisualNotesForGeneration(row) || "").replace(/\s+/g, " ").trim();
  const rawVisualNotes = String(
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
  const rawScenePrompt = normalizeVideoScenePrompt(row?.scenePrompt || "", row, session);
  const rawImagePrompts = normalizeVideoImagePrompts(row?.imagePrompts || []);
  const relateWithPreviousScene = options.relateWithPreviousScene === true || row?.relateWithPreviousScene === true;
  const lastFrameDataUrl = String(options.lastFrameDataUrl || "").trim();
  const hasLastFrame = options.hasLastFrame === true || /^data:image\//i.test(lastFrameDataUrl);
  const extendVideo = options.extendVideo === true || options.videoExtension === true;
  const extensionSource = extendVideo
    ? (options.extensionSource || currentMap[key] || rowReferenceVideo || null)
    : null;
  const requestedVideoModel = options.videoModel || videoCfg.videoModel || PODCASTER_VIDEO_MODEL_AUTO;
  const requestedGenerator = options.generator || (options.videoModel ? "" : (videoCfg.videoGenerator || ""));
  const routing = resolvePodcasterVideoRouting({
    modelPreference: requestedVideoModel,
    generator: requestedGenerator,
    quality: options.quality,
    highQuality: options.highQuality === true,
    hasReferenceVideo: referenceMode === "video" && Boolean(rowReferenceVideo),
    requiresLastFrame: hasLastFrame,
    requiresExtension: extendVideo
  });
  const promptFieldSanitization = sanitizeVisualPromptFields({
    sceneDescription: row?.sceneDescription || "",
    visualNotes: rawVisualNotes,
    videoDirective: rawVideoDirective,
    scenePrompt: rawScenePrompt,
    imagePrompts: rawImagePrompts
  });
  const sceneDescription = String(promptFieldSanitization.sanitized.sceneDescription || "").trim();
  const visualNotes = String(promptFieldSanitization.sanitized.visualNotes || "").trim();
  const videoDirective = String(promptFieldSanitization.sanitized.videoDirective || "").trim();
  const scenePrompt = String(promptFieldSanitization.sanitized.scenePrompt || "").trim();
  const imagePrompts = Array.isArray(promptFieldSanitization.sanitized.imagePrompts)
    ? promptFieldSanitization.sanitized.imagePrompts
    : [];
  const selectedVideoModel = routing.model;
  const modelCandidates = selectedVideoModel === PODCASTER_VIDEO_MODEL_AUTO ? [] : [selectedVideoModel];
  const cheapVideoMode = selectedVideoModel === PODCASTER_VIDEO_MODEL_VEO_LITE;
  const promptProfile = PODCASTER_VIDEO_PROMPT_PROFILE;

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
  const dialogueAudioUrl = String(audioClip?.downloadUrl || audioClip?.url || "").trim();
  const dialogueAudioStoragePath = String(audioClip?.storagePath || audioClip?.path || "").trim();
  const hasExternalDialogueAudio = Boolean(dialogueAudioUrl || dialogueAudioStoragePath);
  const excludeScriptFromVideoPrompt = row?.excludeScriptFromVideoPrompt === true;
  const omitGeneratedDialogue = hasExternalDialogueAudio || excludeScriptFromVideoPrompt;
  const previousInteractionId = options.correctInSceneText === true
    ? String(
      options.previousInteractionId
      || resolveDialogueVideoInteractionId(session?.dialogueVideoMap?.[key])
      || resolveDialogueVideoInteractionId(currentMap[key])
      || ""
    ).trim()
    : "";

  const task = (async () => {
    dialogueVideoGenerationPending.add(pendingKey);
    if (!silent) setGenerationStatus(`Generando video Gemini para escena ${resolveSceneNumberByRowId(key, session)}...`, "is-busy");
    setPodcastVideoStatus(`Generando Video de la Escena ${resolveSceneNumberByRowId(key, session)}`);

    let referenceImageBudget = [];

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
      const strictIdentity = !isVideoStyle && Boolean(portraitUrl || portraitStoragePath);

  const rowReferenceImage = effectiveReferenceImages[0] || getRowReferenceImageMap(session)[key] || speakerReferenceImage || scenarioReferenceImage || null;
  referenceImageBudget = dedupeReferenceImagePayload(
    effectiveReferenceImages,
    DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT
  );
  const primaryReferenceImage = referenceImageBudget[0] || null;
  const inlineReferenceBudget = buildDialogueVideoInlineReferenceBudget(
    referenceImageBudget,
    extendVideo ? null : rowReferenceVideo,
    continuityReferenceImageDataUrl
  );
  const traceMeta = buildVisualReferenceTraceMeta({
    referenceImages: referenceImageBudget,
    referenceVideo: rowReferenceVideo,
    continuityReferenceImageDataUrl,
    inlineReferenceBudget
  });
      // Generation duration belongs to the new source media. The edited clip can
      // remain shorter through trimInMs/trimOutMs without asking Veo for a video
      // shorter than the provider's supported eight-second source.
      const requestedDurationSec = resolveGeneratedVideoDurationSec();
      const configuredAspectRatio = String(session?.podcastVideoConfig?.aspectRatio || "").trim();
      const aspectRatio = ["16:9", "9:16"].includes(configuredAspectRatio)
        ? configuredAspectRatio
        : (isReel ? "9:16" : "16:9");
  const textPolicy = inSceneText && shouldValidateInSceneText ? "in_scene" : "overlay_only";

      const body = {
        promptProfile,
        generator: routing.generator,
        resolvedGeneratorHint: routing.resolvedGeneratorHint,
        quality: routing.quality,
        highQuality: options.highQuality === true,
        textPolicy,
        aspectRatio,
        sessionId,
        rowId: key,
        speaker: speakerLabel,
        speakerLabel,
        speakerName,
        counterpartSpeakerLabel,
        counterpartSpeakerName,
        voiceName: resolveConfiguredSpeakerVoiceForGeneration(row, session),
        text: omitGeneratedDialogue ? "" : String(row?.voiceOverText || row?.text || "").trim(),
        excludeScriptFromVideoPrompt,
        dialoguePolicy: excludeScriptFromVideoPrompt
          ? "ambient_only"
          : (hasExternalDialogueAudio ? "external_dialogue" : "scripted"),
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
        imagePrompts,
        headlineText: String(sceneTextFields.headlineText || "").trim(),
        captionText: String(sceneTextFields.captionText || "").trim(),
        inSceneText,
        overlayMode: String(sceneTextFields.overlayMode || "none").trim() || "none",
        textSource: inSceneTextSource || String(sceneTextFields.textSource || "manual").trim() || "manual",
        visibleTextRequired: textPolicy === "in_scene" && Boolean(inSceneText),
        referenceTextGuidance: textPolicy === "in_scene"
          && Boolean(inSceneText)
          && referenceMode === "image"
          && referenceImageBudget.length > 0,
        preserveReferenceText: referenceMode === "image" && referenceImageBudget.length > 0,
        transition: String(row?.transition || "").trim(),
        relateWithPreviousScene: relateWithPreviousScene && !!continuityReferenceImageDataUrl,
        audioDurationSec,
        requestedDurationSec,
        dialogueAudioUrl,
        dialogueAudioStoragePath,
        // Compatibility aliases for one release while the backend/client pair rolls out.
        audioUrl: dialogueAudioUrl,
        audioStoragePath: dialogueAudioStoragePath,
        referenceMode,
        referenceImages: referenceImageBudget,
        referenceImageDataUrls: inlineReferenceBudget.referenceImageDataUrls,
        referenceImageDataUrl: String(rowReferenceImage?.dataUrl || "").trim(),
        referenceImageNames: effectiveReferenceImages.map((item) => String(item?.name || "").trim()).filter(Boolean).slice(0, DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT),
        referenceImageName: String(primaryReferenceImage?.name || "").trim(),
        referenceVideoDataUrl: inlineReferenceBudget.referenceVideoDataUrl,
        referenceVideoName: String(rowReferenceVideo?.name || "").trim(),
        referenceVideoMimeType: String(rowReferenceVideo?.mimeType || "video/mp4").trim() || "video/mp4",
        referenceVideoProviderUri: String(extensionSource?.providerVideoUri || "").trim(),
        referenceVideoProviderGeneratedAt: String(extensionSource?.providerVideoGeneratedAt || "").trim(),
        referenceVideoProviderGenerator: String(extensionSource?.providerVideoGenerator || extensionSource?.generator || "").trim(),
        referenceVideoProviderModel: String(extensionSource?.providerVideoModel || extensionSource?.model || "").trim(),
        referenceVideoProviderResolution: String(extensionSource?.providerVideoResolution || extensionSource?.resolution || "").trim(),
        referenceVideoProviderAspectRatio: String(extensionSource?.providerVideoAspectRatio || extensionSource?.aspectRatio || "").trim(),
        referenceVideoProviderDurationSec: Number(
          extensionSource?.providerVideoDurationSec ?? extensionSource?.durationSec ?? extensionSource?.durationSeconds ?? 0
        ) || 0,
        continuityReferenceImageDataUrl: inlineReferenceBudget.continuityReferenceImageDataUrl,
        hasLastFrame,
        lastFrameDataUrl,
        extendVideo,
        regenerate,
        enhanceFromExistingVideo,
        correctInSceneText: options.correctInSceneText === true,
        previousInteractionId,
        model: selectedVideoModel,
        modelCandidates,
        cheapVideoMode,
        removedTextDirectives: promptFieldSanitization.removedTextDirectives,
        inlineReferenceBudget,
        forceImmediateSceneChange: shouldForceImmediateSceneChange(videoDirective),
        maxModelAttempts: 1,
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
        generator: routing.generator,
        resolvedGeneratorHint: routing.resolvedGeneratorHint,
        quality: routing.quality,
        textPolicy,
        dialoguePolicy: body.dialoguePolicy,
        excludeScriptFromVideoPrompt,
        aspectRatio,
        cheapVideoMode,
        referenceMode,
        audioDurationSec,
        requestedDurationSec,
        removedTextDirectiveCount: promptFieldSanitization.removedTextDirectives.reduce((sum, item) => sum + Math.max(0, Number(item?.count || 0) || 0), 0),
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
        generator: routing.generator,
        resolvedGeneratorHint: routing.resolvedGeneratorHint,
        quality: routing.quality,
        textPolicy,
        aspectRatio,
        scenarioPromptLength: scenarioPrompt.length,
        sceneDescriptionLength: sceneDescription.length,
        visualNotesLength: visualNotes.length,
        videoDirectiveLength: videoDirective.length,
        scenePromptLength: scenePrompt.length,
        textLength: body.text.length,
        dialoguePolicy: body.dialoguePolicy,
        excludeScriptFromVideoPrompt,
        hasInSceneText: textPolicy === "in_scene" && Boolean(inSceneText),
        hasExternalDialogueAudio,
        hasPreviousInteraction: Boolean(previousInteractionId),
        removedTextDirectiveCount: promptFieldSanitization.removedTextDirectives.reduce((sum, item) => sum + Math.max(0, Number(item?.count || 0) || 0), 0),
        ...traceMeta
      });

      let resp = null;
      const maxBusyRetries = 6;
      const busyRetryDelayMs = 10000;

      for (let attempt = 0; attempt <= maxBusyRetries; attempt++) {
        try {
          resp = await authFetchJson(buildVeoApiUrl("/api/podcaster/dialogue-videos/generate"), {
            method: "POST",
            body: JSON.stringify(body)
          });

          if (resp?.ok) {
            break;
          }

          const status = Number(resp?.status || 500) || 500;
          const detail = resp?.detail || resp?.error || {};
          const code = detail?.code || detail?.error || resp?.code || resp?.error || "";
          const isBusy = status === 503 && (code === "backend_busy" || String(resp?.message || "").includes("pausó temporalmente VEO"));

          if (isBusy && attempt < maxBusyRetries) {
            const message = `${buildDialogueVideoBusyHint(resp, attempt + 1, maxBusyRetries)} en 10s.`;
            if (typeof options.onJobUpdate === "function") {
              try { options.onJobUpdate({ stage: "busy", hint: message }); } catch (_) {}
            }
            if (!silent) {
              setGenerationStatus(message, "is-busy");
              setPodcastVideoStatus(message);
            }
            await sleep(busyRetryDelayMs);
            continue;
          }

          const startError = new Error(buildGenerationErrorMessage(resp, "Error al iniciar generación."));
          startError.status = status;
          startError.detail = resp?.detail || resp?.error || null;
          throw startError;
        } catch (err) {
          const status = Number(err.status || 0) || 0;
          const detail = err.detail || {};
          const code = detail?.code || detail?.error || err.message || "";
          const isBusy = status === 503 && (code === "backend_busy" || String(err.message || "").includes("pausó temporalmente VEO"));

          if (isBusy && attempt < maxBusyRetries) {
            const message = `${buildDialogueVideoBusyHint(err, attempt + 1, maxBusyRetries)} en 10s.`;
            if (typeof options.onJobUpdate === "function") {
              try { options.onJobUpdate({ stage: "busy", hint: message }); } catch (_) {}
            }
            if (!silent) {
              setGenerationStatus(message, "is-busy");
              setPodcastVideoStatus(message);
            }
            await sleep(busyRetryDelayMs);
            continue;
          }
          throw err;
        }
      }

      traceVisualReferenceScene("request-accepted", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        jobId: String(resp?.jobId || "").trim(),
        ...traceMeta
      });

      const acceptedJobId = String(resp?.jobId || "").trim();
      if (acceptedJobId) dialogueVideoGenerationJobs.set(pendingKey, acceptedJobId);
      if (dialogueVideoGenerationCanceled.has(pendingKey)) {
        if (acceptedJobId) await requestDialogueVideoJobCancellation(acceptedJobId);
        throw createDialogueVideoCanceledError();
      }

      const result = await pollDialogueVideoGenerationJob(resp.jobId, {
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        silent,
        onUpdate: options.onJobUpdate,
        traceMeta,
        pendingKey
      });

      const previousClip = resolveDialogueVideoForRow(session, key);
      const rawFinalClip = result?.dialogueVideo;
      if (!rawFinalClip) throw new Error("No se devolvió un clip válido.");
      let finalClip = {
        ...rawFinalClip,
        generator: rawFinalClip?.generator || result?.generator || routing.resolvedGeneratorHint || null,
        textPolicy: rawFinalClip?.textPolicy || result?.textPolicy || textPolicy,
        aspectRatio: rawFinalClip?.aspectRatio || result?.aspectRatio || aspectRatio,
        requestedDurationSeconds: rawFinalClip?.requestedDurationSeconds ?? result?.requestedDurationSeconds ?? requestedDurationSec,
        durationSeconds: rawFinalClip?.durationSeconds ?? result?.durationSeconds ?? rawFinalClip?.durationSec ?? null,
        mediaDurationMs: resolveVideoPhysicalDurationMs(rawFinalClip, result)
          || Math.round(requestedDurationSec * 1000),
        resolution: rawFinalClip?.resolution || result?.resolution || null,
        interactionId: rawFinalClip?.interactionId || result?.interactionId || null,
        promptHash: rawFinalClip?.promptHash || result?.promptHash || null,
        removedTextDirectives: rawFinalClip?.removedTextDirectives || result?.removedTextDirectives || promptFieldSanitization.removedTextDirectives,
        promptVersion: rawFinalClip?.promptVersion || result?.promptVersion || PODCASTER_VIDEO_PROMPT_PROFILE,
        updatedAt: String(rawFinalClip?.updatedAt || result?.updatedAt || new Date().toISOString()).trim()
      };

      upsertActiveSession((current) => ({
        ...current,
        dialogueVideoMap: {
          ...(current.dialogueVideoMap || {}),
          [key]: finalClip
        }
      }), { render: !options.deferTimelineRender });

      if (typeof runtime.persistLatestDialogueVideoForRow === "function") {
        const committedClip = await runtime.persistLatestDialogueVideoForRow(key, finalClip, sessionId);
        if (committedClip && typeof committedClip === "object") {
          finalClip = committedClip;
          upsertActiveSession((current) => ({
            ...current,
            dialogueVideoMap: {
              ...(current.dialogueVideoMap || {}),
              [key]: committedClip
            }
          }), { render: false });
        }
      }

      if (typeof playbackController?.invalidateRowMediaCache === "function") {
        playbackController.invalidateRowMediaCache(key, getActiveSession(), {
          previousClip,
          nextClip: finalClip
        });
      } else if (typeof playbackController?.invalidateRowAudioCache === "function") {
        playbackController.invalidateRowAudioCache(key);
      }

      const finalDurationMs = resolveVideoPhysicalDurationMs(finalClip, result)
        || Math.round(requestedDurationSec * 1000);
      if (finalDurationMs > 0 && typeof runtime.updateTimelineClipForRow === "function") {
        runtime.updateTimelineClipForRow(key, (prev) => {
          // Update source metadata without retiming the edited scene. In
          // particular, never reset trimInMs/trimOutMs after regeneration.
          return preserveTimelineTrimAfterVideoGeneration(
            prev,
            finalDurationMs,
            runtime.STUDIO_TIMELINE_MIN_CLIP_MS
          );
        }, { persist: true, render: false });
      }

      if (options.syncStageAfterGenerate !== false) {
        setPodcastVideoRow(key, {
          syncStage: true,
          force: true,
          preserveMontageCursor: true,
          lightweightUi: true,
          reason: "generation-complete"
        });
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
      if (isDialogueVideoCanceledError(error)) {
        traceVisualReferenceScene("request-canceled", {
          sessionId,
          rowId: key,
          sceneNumber: resolveSceneNumberByRowId(key, session),
          traceVisualReference: true
        });
        throw error;
      }
      traceVisualReferenceScene("request-error", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        message: buildGenerationErrorMessage(error, "Error al generar video."),
        detail: error?.detail || null,
        traceVisualReference: true
      });
      console.error("[Podcaster][SceneVideoRef][request-error]", error);
      if (!silent) addChatMessage("system", `Error en escena ${resolveSceneNumberByRowId(key, session)}: ${buildGenerationErrorMessage(error, "Error al generar video.")}`);
      throw error;
    } finally {
      dialogueVideoGenerationPending.delete(pendingKey);
      dialogueVideoGenerationTasks.delete(pendingKey);
      dialogueVideoGenerationJobs.delete(pendingKey);
      dialogueVideoGenerationCanceled.delete(pendingKey);
      traceVisualReferenceScene("request-cleanup", {
        sessionId,
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        hasReferenceImage: referenceImageBudget.length > 0,
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
  const preserveInteractivePlayback = podcastVideoState.montageActive === true || playbackController?.state?.isPlaying === true;
  const preservedActiveRowId = String(podcastVideoState.activeRowId || "").trim();
  const preservedCursorMs = Math.max(0, Number(podcastVideoState.montageCursorMs || 0) || 0);

  if (shouldPromptDirective) {
    const directiveResult = await promptDialogueVideoDirective(key, session, { initialValue: nextVideoDirective });
    if (!directiveResult?.confirmed) return null;
    nextVideoDirective = normalizeVideoDirectiveText(directiveResult.videoDirective || "");
  }

  const selectRow = options.selectRow !== false && !preserveInteractivePlayback;
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
    hasReferenceImage: (getRowReferenceImageList(session, key).length > 0)
      || Boolean((typeof runtime.getSpeakerReferenceImageMap === "function" ? runtime.getSpeakerReferenceImageMap(session)[String(row?.speaker || "").trim()] : null))
      || (() => {
        const activeScenarioAsset = typeof runtime.resolveActiveGlobalScenarioAsset === "function"
          ? (runtime.resolveActiveGlobalScenarioAsset(session) || null)
          : null;
        return Boolean(
          activeScenarioAsset
          && typeof runtime.getScenarioReferenceImageMap === "function"
          && runtime.getScenarioReferenceImageMap(session)[String(activeScenarioAsset?.id || "").trim()]
        );
      })(),
    hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[key] || null)
  });

  if (generationKey) {
    timelineSceneVideoGenerationPending.add(generationKey);
    timelineSceneVideoGenerationStatus.set(generationKey, { hint: "Encolando generación de video...", stage: "queued" });
    renderPodcastVideoTimeline(getActiveSession(), { reason: "ephemeral" });
    traceVisualReferenceScene("flow-spinner-on", {
      generationKey,
      rowId: key,
      sceneNumber: resolveSceneNumberByRowId(key, session),
      hasReferenceImage: (getRowReferenceImageList(session, key).length > 0)
        || Boolean((typeof runtime.getSpeakerReferenceImageMap === "function" ? runtime.getSpeakerReferenceImageMap(session)[String(row?.speaker || "").trim()] : null))
        || (() => {
          const activeScenarioAsset = typeof runtime.resolveActiveGlobalScenarioAsset === "function"
            ? (runtime.resolveActiveGlobalScenarioAsset(session) || null)
            : null;
          return Boolean(
            activeScenarioAsset
            && typeof runtime.getScenarioReferenceImageMap === "function"
            && runtime.getScenarioReferenceImageMap(session)[String(activeScenarioAsset?.id || "").trim()]
          );
        })(),
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
      promptProfile: PODCASTER_VIDEO_PROMPT_PROFILE,
      generator: options.generator,
      videoModel: options.videoModel,
      quality: options.quality,
      highQuality: options.highQuality === true,
      inSceneText: options.inSceneText,
      correctInSceneText: options.correctInSceneText === true,
      previousInteractionId: options.previousInteractionId,
      regenerate: options.regenerate != null ? options.regenerate === true : hasStoredMediaSource(existingClip),
      enhanceFromExistingVideo: options.enhanceFromExistingVideo === true,
      silent: options.silent === true,
      videoDirective: nextVideoDirective,
      deferTimelineRender: options.deferTimelineRender !== false,
      syncStageAfterGenerate: options.syncStageAfterGenerate !== false && !preserveInteractivePlayback,
      onJobUpdate: (jobData) => {
        if (!generationKey) return;
        const hint = String(jobData?.hint || "").trim() || [jobData?.stage || "Generando video", jobData?.variant ? `· ${jobData.variant}` : ""].filter(Boolean).join(" ");
        timelineSceneVideoGenerationStatus.set(generationKey, { hint, stage: jobData?.stage || "busy" });
        renderPodcastVideoTimeline(getActiveSession(), { reason: "ephemeral" });
      }
    });
    return generated;
  } finally {
    if (preserveInteractivePlayback) {
      podcastVideoState.montageCursorMs = preservedCursorMs;
      if (preservedActiveRowId) {
        podcastVideoState.activeRowId = preservedActiveRowId;
        podcastVideoState.timelineLastInteractedRowId = preservedActiveRowId;
      }
      runtime.syncPodcastTimelinePlayhead?.(getActiveSession(), {
        currentMs: preservedCursorMs,
        totalMs: getTimelineTotalDurationMs(getActiveSession()),
        lightweight: true,
        suppressAutoScroll: true
      });
    }
    if (generationKey) {
      timelineSceneVideoGenerationPending.delete(generationKey);
      timelineSceneVideoGenerationStatus.delete(generationKey);
      renderPodcastVideoTimeline(getActiveSession(), { lightweight: true, reason: "generation-complete" });
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
          promptProfile: PODCASTER_VIDEO_PROMPT_PROFILE,
          quality: options.highQuality === true ? "final" : undefined,
          highQuality: options.highQuality === true,
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

function updateRowInSceneText(rowId = "", value = "") {
  const key = String(rowId || "").trim();
  const validation = validateInSceneText(value);
  if (!key || !validation.valid) return validation;
  upsertActiveSession((current) => ({
    ...current,
    script: {
      ...current.script,
      rows: (current.script?.rows || []).map((item) => {
        if (String(item?.id || "").trim() !== key) return item;
        const next = { ...item, inSceneText: validation.text };
        delete next.inVideoText;
        delete next.embeddedText;
        delete next.sceneText;
        return next;
      })
    }
  }));
  runtime.renderPodcastVideoTimeline?.(getActiveSession(), { force: true, reason: "in-scene-text" });
  runtime.syncPodcastStudioInspector?.(getActiveSession());
  return validation;
}

function promptForRowInSceneText(rowId = "") {
  const key = String(rowId || "").trim();
  const session = getActiveSession();
  const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
  if (!row) return null;
  const currentText = resolveRowInSceneText(row);
  const nextText = window.prompt(
    "Texto natural dentro del escenario (hasta 4 líneas, 40 palabras y 280 caracteres). Déjalo vacío para usar sólo overlays:",
    currentText
  );
  if (nextText == null) return null;
  const result = updateRowInSceneText(key, nextText);
  if (!result?.valid) {
    addChatMessage("system", result?.message || "El texto dentro del video no es válido.");
    setGenerationStatus("Texto dentro del video no válido", "");
    return null;
  }
  setGenerationStatus(result.text ? "Texto dentro del video actualizado" : "Texto dentro del video eliminado", "is-live");
  return result.text;
}

async function handlePodcasterGenerationClick(event) {
    const cancelBtn = event.target.closest("[data-action='timeline-cancel-scene-video']");
    if (cancelBtn) {
      event.preventDefault();
      event.stopPropagation();
      const rowId = String(cancelBtn.dataset.rowId || "").trim();
      if (rowId) await cancelDialogueVideoForRow(rowId);
      return;
    }

    const genAllBtn = event.target.closest("[data-action='timeline-generate-scene-video-batch']");
    if (genAllBtn) {
      runGenerateMissingDialogueVideos({ triggerButton: genAllBtn });
      return;
    }

    const regenAllBtn = event.target.closest("[data-action='timeline-regenerate-scene-video-batch-hq']");
    if (regenAllBtn) {
      runGenerateMissingDialogueVideos({ regenerateAll: true, highQuality: true, triggerButton: regenAllBtn });
      return;
    }

    const editInSceneTextBtn = event.target.closest("[data-action='timeline-edit-in-scene-text']");
    if (editInSceneTextBtn) {
      const rowId = String(editInSceneTextBtn.dataset.rowId || "").trim() || resolveTargetVideoRowId(getActiveSession());
      if (rowId) promptForRowInSceneText(rowId);
      return;
    }

    const correctInSceneTextBtn = event.target.closest("[data-action='timeline-correct-in-scene-text']");
    if (correctInSceneTextBtn) {
      const session = getActiveSession();
      const rowId = String(correctInSceneTextBtn.dataset.rowId || "").trim() || resolveTargetVideoRowId(session);
      const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === rowId) || null;
      const inSceneText = resolveRowInSceneText(row);
      const existingClip = session?.dialogueVideoMap?.[rowId] || resolveDialogueVideoForRow(session, rowId);
      const previousInteractionId = resolveDialogueVideoInteractionId(existingClip);
      if (!rowId || !inSceneText || !previousInteractionId) {
        addChatMessage("system", "Para corregir texto se necesita un clip Omni editable y texto dentro de la escena.");
        return;
      }
      try {
        await runSceneVideoGenerationFlow(rowId, {
          promptProfile: PODCASTER_VIDEO_PROMPT_PROFILE,
          generator: "omni",
          videoModel: PODCASTER_VIDEO_MODEL_OMNI,
          quality: "final",
          inSceneText,
          correctInSceneText: true,
          previousInteractionId,
          promptDirective: false,
          loadingButton: correctInSceneTextBtn,
          loadingTitle: "Corrigiendo texto dentro del video...",
          selectRow: false,
          syncStage: false,
          silent: false,
          syncStageAfterGenerate: false,
          regenerate: true,
          enhanceFromExistingVideo: false
        });
      } catch (error) {
        addChatMessage("system", `No se pudo corregir el texto dentro del video (${buildGenerationErrorMessage(error, "Error al corregir texto.")}).`);
      }
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
      const audioFlight = createSceneAudioGenerationFlight(generateAudioBtn, rowId);
      podcastVideoState.busy = true;
      setButtonLoadingState(generateAudioBtn, true, {
        loadingTitle: shouldRegenerate ? "Regenerando voz de escena..." : "Generando voz de escena..."
      });
      updatePodcastPlayerUi();
      try {
        await runtime.generateDialogueAudioForRow(rowId, { regenerate: shouldRegenerate, silent: false });
        await audioFlight.finish(true);
      } catch (error) {
        await audioFlight.finish(false);
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
      if (isTimelineSceneRowGenerating(session, rowId) || dialogueVideoGenerationPending.has(pendingKey)) {
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
          promptProfile: PODCASTER_VIDEO_PROMPT_PROFILE,
          promptDirective: false,
          loadingButton: loadingBtn,
          loadingTitle: "Generando video de escena...",
          selectRow: false,
          syncStage: false,
          silent: false,
          syncStageAfterGenerate: false,
          regenerate: false
        });
      } catch (error) {
        if (isDialogueVideoCanceledError(error)) {
          traceVisualReferenceScene("ui-generate-canceled", {
            sessionId: String(session?.id || "").trim(),
            rowId
          });
          return;
        }
        traceVisualReferenceScene("ui-generate-failed", {
          sessionId: String(session?.id || "").trim(),
          rowId,
          message: String(error?.message || "").trim(),
          hasReferenceImage: getRowReferenceImageList(session, rowId).length > 0,
          hasReferenceVideo: Boolean(getRowReferenceVideoMap(session)[rowId] || null)
        });
        setGenerationStatus("Error", "");
        addChatMessage("system", `No se pudo generar video de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${buildGenerationErrorMessage(error, "Error al generar video.")}).`);
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
      if (isTimelineSceneRowGenerating(session, rowId) || dialogueVideoGenerationPending.has(pendingKey)) {
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
          promptProfile: PODCASTER_VIDEO_PROMPT_PROFILE,
          quality: "final",
          highQuality: true,
          promptDirective: false,
          loadingButton: loadingBtn,
          loadingTitle: hasStoredMediaSource(existingClip) ? "Analizando clip y regenerando escena..." : "Generando video de escena...",
          selectRow: true,
          syncStage: false,
          silent: false,
          syncStageAfterGenerate: true,
          regenerate: true,
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
        addChatMessage("system", `No se pudo regenerar con mejora la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${buildGenerationErrorMessage(error, "Error al generar video.")}).`);
      }
      return;
    }
}

function logSceneVideoGeneration(stage = "", meta = {}) {
  console.log(`[Podcaster][SceneVideoRef][${stage}]`, meta);
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
