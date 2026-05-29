/**
 * podcaster-timeline-model.js
 * Extracted Timeline Model, Track Structure, and Duration Math Helper functions.
 */
import { requirePodcasterGenerationShared } from "./podcaster-generation-shared.js";
import { getTransitionForEdge, normalizeTransitionsByEdge } from "./podcaster-scene-transition.js";
import {
  buildAugmentedTimelineRuntimeEntries,
  formatTrackHeadPlayheadTime,
  getSceneEffectiveDurationMs,
  normalizeFrameHoldsByRowId,
  normalizeSpeedRangesByRowId,
  resolveSceneSourceStateAtTimelineMs
} from "./podcaster-scene-timing.js";

// === INJECTED GLOBALS (For compatibility) ===
function readRuntimeNumber(name, fallback) {
  const numeric = Number(window[name]);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const STUDIO_TIMELINE_MIN_CLIP_MS = readRuntimeNumber("STUDIO_TIMELINE_MIN_CLIP_MS", 500);
const STUDIO_TIMELINE_SNAP_MS = readRuntimeNumber("STUDIO_TIMELINE_SNAP_MS", 10);
const STUDIO_TIMELINE_VERSION = readRuntimeNumber("STUDIO_TIMELINE_VERSION", 3);
const STUDIO_TIMELINE_TRACK_VERSION = readRuntimeNumber("STUDIO_TIMELINE_TRACK_VERSION", 1);
const STUDIO_TIMELINE_PIXELS_PER_SEC = readRuntimeNumber("STUDIO_TIMELINE_PIXELS_PER_SEC", 52);
const STUDIO_TIMELINE_MIN_CLIP_PX = readRuntimeNumber("STUDIO_TIMELINE_MIN_CLIP_PX", 96);
const STUDIO_AUDIO_TRACK_MIN_LOOP_PX = readRuntimeNumber("STUDIO_AUDIO_TRACK_MIN_LOOP_PX", 24);
const STUDIO_GEMINI_SCENE_DELAY_MS = readRuntimeNumber("STUDIO_GEMINI_SCENE_DELAY_MS", 0);
const VIDEO_SCENE_MAX_SEC = readRuntimeNumber("VIDEO_SCENE_MAX_SEC", 8);
const STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS = readRuntimeNumber("STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS", 7000);
const AVAILABLE_PODCASTER_VIDEO_MODELS = Object.freeze([
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
  "veo-3.1-lite-generate-preview",
  "veo-3.0-generate-001",
  "veo-3.0-fast-generate-001",
  "veo-2.0-generate-001"
]);

// Dynamic lookups for functions/vars defined in podcaster.js (loaded after this script)
const toFiniteNumber = (v, fallback) => (window.toFiniteNumber || ((val, fb) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fb;
}))(v, fallback);

function getActiveSession() {
  if (typeof window.getActiveSession === "function") {
    return window.getActiveSession();
  }
  const stateRef = window.state;
  const sessions = Array.isArray(stateRef?.sessions) ? stateRef.sessions : [];
  const activeSessionId = String(stateRef?.activeSessionId || "").trim();
  return sessions.find((session) => String(session?.id || "").trim() === activeSessionId) || null;
}

function getSessionRows(session = null) {
  if (typeof window.getSessionRows === "function") {
    return window.getSessionRows(session);
  }
  const activeSession = session || getActiveSession();
  if (!activeSession) return [];
  if (Array.isArray(activeSession?.script?.rows)) return activeSession.script.rows.filter(Boolean);
  if (Array.isArray(activeSession?.rows)) return activeSession.rows.filter(Boolean);
  return [];
}

function resolveVideoContentTypeFallback(session = null) {
  const activeSession = session || getActiveSession();
  const explicitType = String(
    activeSession?.script?.videoContentType
    || activeSession?.videoContentType
    || ""
  ).trim().toLowerCase();
  if (explicitType) return explicitType;
  if (activeSession?.script?.videoMode === true || activeSession?.videoMode === true) return "creative";
  return "none";
}

function isEducationalVideoMode(session = null) {
  if (typeof window.isEducationalVideoMode === "function") {
    return window.isEducationalVideoMode(session);
  }
  return resolveVideoContentTypeFallback(session) === "creative";
}

function resolveDialogueVideoForRow(session = null, rowId = "") {
  if (typeof window.resolveDialogueVideoForRow === "function") {
    return window.resolveDialogueVideoForRow(session, rowId);
  }
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!key) return null;
  return activeSession?.dialogueVideoMap?.[key] || null;
}

function resolvePrimaryDialogueVideoSegment(sceneClip = null, options = {}) {
  if (typeof window.resolvePrimaryDialogueVideoSegment === "function") {
    return window.resolvePrimaryDialogueVideoSegment(sceneClip, options);
  }
  if (!sceneClip || typeof sceneClip !== "object") return null;
  if (sceneClip.primarySegment && typeof sceneClip.primarySegment === "object") return sceneClip.primarySegment;
  const segments = Array.isArray(sceneClip.segments) ? sceneClip.segments.filter(Boolean) : [];
  if (segments.length) return segments[0];
  const generatedVideos = Array.isArray(sceneClip.generatedVideos) ? sceneClip.generatedVideos.filter(Boolean) : [];
  if (generatedVideos.length && generatedVideos[0]?.video && typeof generatedVideos[0].video === "object") {
    return generatedVideos[0].video;
  }
  return null;
}

function resolveStorageVideoUrl(rawUrl = "", storagePath = "", options = {}) {
  if (typeof window.resolveStorageVideoUrl === "function") {
    return window.resolveStorageVideoUrl(rawUrl, storagePath, options);
  }
  const normalizedMedia = normalizePersistedMediaReference(rawUrl, storagePath);
  return String(normalizedMedia.downloadUrl || rawUrl || "").trim();
}

function resolveDialogueAudioForRow(session = null, rowId = "") {
  if (typeof window.resolveDialogueAudioForRow === "function") {
    return window.resolveDialogueAudioForRow(session, rowId);
  }
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!key) return null;
  return activeSession?.dialogueAudioMap?.[key] || null;
}

function resolveRowAudioDurationMs(rowId = "", session = null) {
  if (typeof window.resolveRowAudioDurationMs === "function") {
    return window.resolveRowAudioDurationMs(rowId, session);
  }
  const audioClip = resolveDialogueAudioForRow(session, rowId);
  if (!audioClip || typeof audioClip !== "object") return 0;
  if (audioClip.durationMs !== undefined) return Math.max(0, Math.round(toFiniteNumber(audioClip.durationMs, 0)));
  if (audioClip.durationSec !== undefined) return Math.max(0, Math.round(toFiniteNumber(audioClip.durationSec, 0) * 1000));
  if (audioClip.duration !== undefined) return Math.max(0, Math.round(toFiniteNumber(audioClip.duration, 0) * 1000));
  return 0;
}

function resolveSpeakerDisplayName(speakerKey = "", session = null) {
  if (typeof window.resolveSpeakerDisplayName === "function") {
    return window.resolveSpeakerDisplayName(speakerKey, session);
  }
  return String(speakerKey || "").trim() || "Host";
}

function isVideoPodcastMode(session = null) {
  if (typeof window.isVideoPodcastMode === "function") {
    return window.isVideoPodcastMode(session);
  }
  return resolveVideoContentTypeFallback(session) === "videopodcast";
}

function isPodcastMode(session = null) {
  if (typeof window.isPodcastMode === "function") {
    return window.isPodcastMode(session);
  }
  return !isEducationalVideoMode(session);
}

const upsertPodcastVideoConfig = (...args) => window.upsertPodcastVideoConfig(...args);
const syncGeminiDialogueTrackWithRuntime = (...args) => window.syncGeminiDialogueTrackWithRuntime(...args);
const renderPodcastVideoTimeline = (...args) => window.renderPodcastVideoTimeline(...args);
const renderPodcastTransitionTimeline = (...args) => window.renderPodcastTransitionTimeline(...args);
const syncPodcastStudioInspector = (...args) => window.syncPodcastStudioInspector(...args);
const scheduleSessionLocalPersist = (...args) => window.scheduleSessionLocalPersist(...args);
function getPodcastVideoConfig(session = null) {
  if (typeof window.getPodcastVideoConfig === "function") {
    return window.getPodcastVideoConfig(session);
  }
  return session?.podcastVideoConfig || {};
}

function normalizeOnScreenTextClipItem(raw = {}, rowId = "") {
  const key = String(rowId || raw?.rowId || "").trim();
  if (!key) return null;
  const startMs = Math.max(0, Math.round(toFiniteNumber(raw?.startMs ?? raw?.start, 0)));
  const sourceDurationMs = Math.max(
    STUDIO_TIMELINE_MIN_CLIP_MS,
    Math.round(toFiniteNumber(raw?.sourceDurationMs ?? raw?.durationMs ?? raw?.duration, STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS))
  );
  const trimInMs = Math.max(0, Math.round(toFiniteNumber(raw?.trimInMs ?? raw?.trimIn, 0)));
  const trimOutMs = Math.max(
    trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
    Math.round(toFiniteNumber(raw?.trimOutMs ?? raw?.trimOut, Math.min(sourceDurationMs, STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS)))
  );
  return {
    rowId: key,
    startMs,
    sourceDurationMs: Math.max(sourceDurationMs, trimOutMs),
    trimInMs,
    trimOutMs,
    durationMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, trimOutMs - trimInMs),
    hidden: raw?.hidden === true,
    autoHidden: raw?.autoHidden === true,
    zIndex: Math.max(1, Math.round(toFiniteNumber(raw?.zIndex, 1)))
  };
}

function normalizeOnScreenTextClipsByRowId(raw = {}) {
  if (
    typeof window.normalizeOnScreenTextClipsByRowId === "function" &&
    window.normalizeOnScreenTextClipsByRowId !== normalizeOnScreenTextClipsByRowId
  ) {
    return window.normalizeOnScreenTextClipsByRowId(raw);
  }
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, item]) => {
    const normalized = normalizeOnScreenTextClipItem(item, rowId);
    if (!normalized) return;
    next[normalized.rowId] = normalized;
  });
  return next;
}

function normalizeOnScreenTextLayoutByRowId(raw = {}) {
  if (
    typeof window.normalizeOnScreenTextLayoutByRowId === "function" &&
    window.normalizeOnScreenTextLayoutByRowId !== normalizeOnScreenTextLayoutByRowId
  ) {
    return window.normalizeOnScreenTextLayoutByRowId(raw);
  }
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, item]) => {
    const key = String(rowId || "").trim();
    if (!key || !item || typeof item !== "object") return;
    next[key] = { ...item };
  });
  return next;
}

function normalizeOverlayCardPosition(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const widthPct = Math.max(0.22, Math.min(0.9, toFiniteNumber(source.widthPct, 0.56)));
  const heightPct = Math.max(0.12, Math.min(0.55, toFiniteNumber(source.heightPct, 0.2)));
  return {
    xPct: Math.max(0, Math.min(1 - widthPct, toFiniteNumber(source.xPct, 0.06))),
    yPct: Math.max(0, Math.min(1 - heightPct, toFiniteNumber(source.yPct, 0.68))),
    widthPct,
    heightPct
  };
}

function normalizeOverlayCardPreset(value = "") {
  const preset = String(value || "lower-third").trim().toLowerCase();
  return new Set(["lower-third", "info-panel", "phone-cta"]).has(preset) ? preset : "lower-third";
}

function normalizeOverlayCardStyleModel(value = "", fallback = "lower-third-slab") {
  const styleModel = String(value || fallback).trim();
  return styleModel || fallback;
}

function normalizeOverlayCardAnimation(value = "", fallback = "slide-left") {
  const animation = String(value || fallback).trim().toLowerCase();
  return new Set(["slide-left", "slide-right", "slide-up", "slide-down", "fade"]).has(animation)
    ? animation
    : fallback;
}

function normalizeOverlayCardLoopAnimation(value = "", fallback = "none") {
  const loopAnimation = String(value || fallback).trim().toLowerCase();
  return loopAnimation || fallback;
}

function normalizeOverlayCardItem(raw = {}, fallbackId = "") {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || fallbackId || "").trim();
  if (!id) return null;
  const textLines = Array.isArray(raw.textLines)
    ? raw.textLines.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 4)
    : [raw.title, raw.subtitle, raw.detail].map((line) => String(line || "").trim()).filter(Boolean).slice(0, 4);
  if (!textLines.length) return null;
  const startMs = Math.max(0, Math.round(toFiniteNumber(raw.startMs, 0)));
  const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(toFiniteNumber(raw.durationMs, 4000)));
  const exitDelayMs = Math.max(0, Math.min(durationMs, Math.round(toFiniteNumber(raw.exitDelayMs, Math.max(0, durationMs - 520)))));
  return {
    id,
    rowId: String(raw.rowId || "").trim(),
    startMs,
    durationMs,
    exitDelayMs,
    preset: normalizeOverlayCardPreset(raw.preset),
    styleModel: normalizeOverlayCardStyleModel(raw.styleModel, "lower-third-slab"),
    animationPreset: String(raw.animationPreset || "broadcast-soft").trim() || "broadcast-soft",
    textLines,
    position: normalizeOverlayCardPosition(raw.position || raw.size || {}),
    enterAnimation: normalizeOverlayCardAnimation(raw.enterAnimation, "slide-left"),
    exitAnimation: normalizeOverlayCardAnimation(raw.exitAnimation, "fade"),
    style: raw.style && typeof raw.style === "object" ? {
      accentColor: String(raw.style.accentColor || "#38bdf8").trim() || "#38bdf8",
      backgroundColor: String(raw.style.backgroundColor || "#0f172a").trim() || "#0f172a",
      textColor: String(raw.style.textColor || "#f8fafc").trim() || "#f8fafc",
      fontScale: Math.max(0.65, Math.min(1.8, toFiniteNumber(raw.style.fontScale, 1))),
      loopAnimation: normalizeOverlayCardLoopAnimation(raw.style.loopAnimation, "none")
    } : {
      accentColor: "#38bdf8",
      backgroundColor: "#0f172a",
      textColor: "#f8fafc",
      fontScale: 1,
      loopAnimation: "none"
    },
    zIndex: Math.max(1, Math.min(999, Math.round(toFiniteNumber(raw.zIndex, 20))))
  };
}

function normalizeOverlayCardsById(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([id, item]) => {
    const normalized = normalizeOverlayCardItem(item, id);
    if (!normalized) return;
    next[normalized.id] = normalized;
  });
  return next;
}

function normalizeOnScreenTextTrackSettings(raw = {}) {
  if (typeof window.normalizeOnScreenTextTrackSettings === "function") {
    return window.normalizeOnScreenTextTrackSettings(raw);
  }
  return {
    enabled: raw?.enabled !== false,
    showTrack: raw?.showTrack !== false
  };
}

function getOnScreenTextClipText(row = null) {
  return String(
    row?.onScreenText
    || row?.textoPantalla
    || row?.textoEnPantalla
    || ""
  ).replace(/\s+/g, " ").trim();
}

function buildDefaultOnScreenTextClipsByRowId(session = null) {
  const activeSession = session || getActiveSession();
  const useFullSceneDuration = isPodcastMode(activeSession) && !isEducationalVideoMode(activeSession);
  const rows = getSessionRows(activeSession);
  const sceneClips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const next = {};
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const sceneClip = sceneClips[rowId] || null;
    const sceneStartMs = Math.max(0, Number(sceneClip?.startMs || 0) || 0);
    const sceneDurationMs = sceneClip
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(sceneClip))
      : Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getRowSourceDurationMs(row, activeSession));
    const desiredDurationMs = useFullSceneDuration
      ? sceneDurationMs
      : Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        Math.min(STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS, sceneDurationMs)
      );
    const centeredStartMs = useFullSceneDuration
      ? sceneStartMs
      : sceneStartMs + Math.max(0, Math.round((sceneDurationMs - desiredDurationMs) / 2));
    const hasText = Boolean(getOnScreenTextClipText(row));
    const clip = normalizeOnScreenTextClipItem({
      rowId,
      startMs: centeredStartMs,
      sourceDurationMs: sceneDurationMs,
      trimInMs: 0,
      trimOutMs: desiredDurationMs,
      hidden: !hasText,
      autoHidden: !hasText,
      zIndex: index + 1
    }, rowId);
    if (!clip) return;
    next[rowId] = clip;
  });
  return next;
}

function ensureOnScreenTextClipsByRowId(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return {};
  const cfg = getPodcastVideoConfig(activeSession);
  const existing = normalizeOnScreenTextClipsByRowId(cfg?.timelineOnScreenTextClipsByRowId || {});
  if (Object.keys(existing).length) return existing;
  return buildDefaultOnScreenTextClipsByRowId(activeSession);
}

const LOCAL_STUDIO_TRANSITION_TYPES = ["cut", "fade", "crossfade"];

function getPodcastVideoState() {
  if (window.podcastVideoState && typeof window.podcastVideoState === "object") {
    return window.podcastVideoState;
  }
  if (!window.__podcasterTimelineModelStateFallback || typeof window.__podcasterTimelineModelStateFallback !== "object") {
    window.__podcasterTimelineModelStateFallback = {
      enabled: false,
      timelineZoom: 1,
      timelineDurationSec: 0,
      lastTimelineClipsSessionId: "",
      lastTimelineClipsUpdatedAt: "",
      cachedTimelineClips: null
    };
  }
  return window.__podcasterTimelineModelStateFallback;
}

function requirePodcasterGenerationApi() {
  return requirePodcasterGenerationShared();
}

// Helper to normalize volume overrides in clip item
function normalizeSceneVolumeOverridePct(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(numeric)));
  return clamped;
}

function normalizePersistedMediaReference(rawUrl = "", storagePath = "") {
  if (typeof window.normalizePersistedMediaReference === "function") {
    return window.normalizePersistedMediaReference(rawUrl, storagePath);
  }
  return {
    downloadUrl: String(rawUrl || "").trim(),
    storagePath: String(storagePath || "").trim()
  };
}

function resolveStorageAudioUrl(rawUrl = "", storagePath = "", options = {}) {
  if (typeof window.resolveStorageAudioUrl === "function") {
    return window.resolveStorageAudioUrl(rawUrl, storagePath, options);
  }
  const normalizedMedia = normalizePersistedMediaReference(rawUrl, storagePath);
  return String(normalizedMedia.downloadUrl || rawUrl || "").trim();
}

function normalizeGeminiDialogueTrackSegment(raw = {}, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const rowId = String(raw.rowId || "").trim();
  const normalizedMedia = normalizePersistedMediaReference(
    String(raw.audioSrc || raw.url || raw.downloadUrl || "").trim(),
    String(raw.storagePath || "").trim()
  );
  const downloadUrl = String(normalizedMedia.downloadUrl || "").trim();
  const storagePath = String(normalizedMedia.storagePath || "").trim();
  const audioSrc = String(resolveStorageAudioUrl(downloadUrl, storagePath) || downloadUrl || "").trim();
  if (!rowId || (!audioSrc && !downloadUrl && !storagePath)) return null;

  let startMs = 0;
  if (raw.startMs !== undefined) {
    startMs = Math.round(toFiniteNumber(raw.startMs, 0));
  } else if (raw.start !== undefined) {
    startMs = Math.round(toFiniteNumber(raw.start, 0) * 1000);
  }

  let anchorStartMs = startMs;
  if (raw.anchorStartMs !== undefined && raw.anchorStartMs !== null) {
    anchorStartMs = Math.max(0, Math.round(Number(raw.anchorStartMs) || 0));
  } else if (raw.anchorStart !== undefined && raw.anchorStart !== null) {
    anchorStartMs = Math.max(0, Math.round(Number(raw.anchorStart) * 1000));
  }

  let trimInMs = 0;
  if (raw.trimInMs !== undefined) {
    trimInMs = Math.round(toFiniteNumber(raw.trimInMs, 0));
  } else if (raw.trimIn !== undefined) {
    trimInMs = Math.round(toFiniteNumber(raw.trimIn, 0) * 1000);
  }
  trimInMs = Math.max(0, trimInMs);

  let trimOutMs = trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS;
  if (raw.trimOutMs !== undefined) {
    trimOutMs = Math.round(toFiniteNumber(raw.trimOutMs, trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS));
  } else if (raw.trimOut !== undefined) {
    trimOutMs = Math.round(toFiniteNumber(raw.trimOut, 0) * 1000);
  }
  trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, trimOutMs);

  let durationMs = trimOutMs - trimInMs;
  if (raw.durationMs !== undefined) {
    durationMs = Math.round(toFiniteNumber(raw.durationMs, trimOutMs - trimInMs));
  } else if (raw.durationSec !== undefined) {
    durationMs = Math.round(toFiniteNumber(raw.durationSec, 0) * 1000);
  } else if (raw.duration !== undefined) {
    durationMs = Math.round(toFiniteNumber(raw.duration, 0) * 1000);
  } else if (raw.end !== undefined && raw.start !== undefined) {
    durationMs = Math.round((toFiniteNumber(raw.end, 0) - toFiniteNumber(raw.start, 0)) * 1000);
  }
  durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, durationMs);

  let endMs = startMs + durationMs;
  if (raw.endMs !== undefined) {
    endMs = Math.round(toFiniteNumber(raw.endMs, startMs + durationMs));
  } else if (raw.end !== undefined) {
    endMs = Math.round(toFiniteNumber(raw.end, 0) * 1000);
  }
  endMs = Math.max(startMs + STUDIO_TIMELINE_MIN_CLIP_MS, endMs);

  return {
    rowId,
    sceneIndex: Math.max(1, Math.round(toFiniteNumber(raw.sceneIndex, index + 1))),
    speakerName: String(raw.speakerName || "").replace(/\s+/g, " ").trim(),
    audioSrc,
    downloadUrl,
    storagePath,
    startMs,
    anchorStartMs,
    endMs,
    trimInMs,
    trimOutMs,
    durationMs
  };
}

function normalizeGeminiDialogueTrack(raw = {}) {
  const segments = Array.isArray(raw?.segments)
    ? raw.segments.map((item, index) => normalizeGeminiDialogueTrackSegment(item, index)).filter(Boolean)
    : [];
  const uniqueMissing = Array.from(new Set(
    (Array.isArray(raw?.missingRowIds) ? raw.missingRowIds : [])
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean)
  ));
  const uniqueExcluded = Array.from(new Set(
    (Array.isArray(raw?.excludedRowIds) ? raw.excludedRowIds : [])
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean)
  ));
  return {
    enabled: raw?.enabled === true && segments.length > 0,
    volumePct: Math.max(0, Math.min(100, Math.round(toFiniteNumber(raw?.volumePct, 100)))),
    updatedAt: String(raw?.updatedAt || "").trim(),
    segments: segments
      .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0) || Number(a.sceneIndex || 0) - Number(b.sceneIndex || 0)),
    missingRowIds: uniqueMissing,
    excludedRowIds: uniqueExcluded
  };
}

// === EXTRACTED LOGIC ===

function normalizeTimelineClipVisualLayoutMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "blur-backdrop" ? "blur-backdrop" : "default";
}

function normalizeTimelineClipMediaScale(value = 1) {
  const numeric = Math.round(toFiniteNumber(value, 1) * 100) / 100;
  return Math.max(1, Math.min(2.5, numeric || 1));
}

function normalizeTimelineClipMediaOffset(value = 0) {
  const numeric = Math.round(toFiniteNumber(value, 0) * 1000) / 1000;
  return Math.max(-0.5, Math.min(0.5, numeric || 0));
}

function normalizeTimelineClipMediaMotionPreset(value = "") {
  const preset = String(value || "none").trim().toLowerCase();
  return new Set(["pan-left-right", "pan-right-left", "pan-up-down", "pan-down-up"]).has(preset)
    ? preset
    : "none";
}

function normalizeTimelineClipItem(raw = {}, rowId = "") {
  const key = String(rowId || raw?.rowId || "").trim();
  if (!key) return null;

  // Support seconds/milliseconds start fallbacks
  let startMs = 0;
  if (raw?.startMs !== undefined) {
    startMs = Math.round(toFiniteNumber(raw.startMs, 0));
  } else if (raw?.start !== undefined) {
    startMs = Math.round(toFiniteNumber(raw.start, 0) * 1000);
  }

  // Support seconds/milliseconds end/duration fallbacks
  let sourceDurationMs = 30000;
  if (raw?.sourceDurationMs !== undefined) {
    sourceDurationMs = Math.round(toFiniteNumber(raw.sourceDurationMs, 30000));
  } else if (raw?.durationMs !== undefined) {
    sourceDurationMs = Math.round(toFiniteNumber(raw.durationMs, 30000));
  } else if (raw?.durationSec !== undefined) {
    sourceDurationMs = Math.round(toFiniteNumber(raw.durationSec, 30) * 1000);
  } else if (raw?.end !== undefined && raw?.start !== undefined) {
    sourceDurationMs = Math.round((toFiniteNumber(raw.end, 0) - toFiniteNumber(raw.start, 0)) * 1000);
  }
  sourceDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, sourceDurationMs);

  let trimInMs = 0;
  if (raw?.trimInMs !== undefined) {
    trimInMs = Math.round(toFiniteNumber(raw.trimInMs, 0));
  } else if (raw?.trimIn !== undefined) {
    trimInMs = Math.round(toFiniteNumber(raw.trimIn, 0) * 1000);
  }
  trimInMs = Math.max(0, Math.min(sourceDurationMs - STUDIO_TIMELINE_MIN_CLIP_MS, trimInMs));

  const fallbackTrimOut = sourceDurationMs;
  let trimOutMs = fallbackTrimOut;
  if (raw?.trimOutMs !== undefined) {
    trimOutMs = Math.round(toFiniteNumber(raw.trimOutMs, fallbackTrimOut));
  } else if (raw?.trimOut !== undefined) {
    trimOutMs = Math.round(toFiniteNumber(raw.trimOut, 0) * 1000);
  }
  trimOutMs = Math.max(
    trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
    Math.min(sourceDurationMs, trimOutMs)
  );

  const veoVolumeOverridePct = normalizeSceneVolumeOverridePct(
    raw?.veoVolumeOverridePct != null ? raw.veoVolumeOverridePct : raw?.veoVolumePct
  );
  const geminiVolumeOverridePct = normalizeSceneVolumeOverridePct(
    raw?.geminiVolumeOverridePct != null ? raw.geminiVolumeOverridePct : raw?.geminiVolumePct
  );
  return {
    rowId: key,
    speakerKey: String(raw?.speakerKey || "").trim(),
    trackId: String(raw?.trackId || "").trim() || `speaker:${String(raw?.speakerKey || "unknown").trim().toLowerCase() || "unknown"}`,
    startMs: Math.max(0, startMs),
    sourceDurationMs,
    trimInMs,
    trimOutMs,
    veoVolumeOverridePct,
    geminiVolumeOverridePct,
    mediaScale: normalizeTimelineClipMediaScale(raw?.mediaScale),
    mediaOffsetXPct: normalizeTimelineClipMediaOffset(raw?.mediaOffsetXPct),
    mediaOffsetYPct: normalizeTimelineClipMediaOffset(raw?.mediaOffsetYPct),
    mediaMotionPreset: normalizeTimelineClipMediaMotionPreset(raw?.mediaMotionPreset),
    visualLayoutMode: normalizeTimelineClipVisualLayoutMode(raw?.visualLayoutMode),
    zIndex: Math.max(1, Math.round(toFiniteNumber(raw?.zIndex, 1)))
  };
}

function normalizeTimelineClipsByRowId(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, clip]) => {
    const normalized = normalizeTimelineClipItem(clip, rowId);
    if (!normalized) return;
    next[normalized.rowId] = normalized;
  });
  return next;
}

function normalizeTimelineTrackItem(raw = {}, index = 0) {
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const fallbackLabel = `Track ${index + 1}`;
  const label = String(raw?.label || fallbackLabel).trim() || fallbackLabel;
  return {
    id,
    label,
    order: Math.max(0, Math.round(toFiniteNumber(raw?.order, index)))
  };
}

function normalizeTimelineTracks(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const next = [];
  raw.forEach((item, index) => {
    const normalized = normalizeTimelineTrackItem(item, index);
    if (!normalized || seen.has(normalized.id)) return;
    seen.add(normalized.id);
    next.push(normalized);
  });
  next.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id || "").localeCompare(String(b.id || "")));
  return next.map((track, index) => ({
    ...track,
    order: index
  }));
}

function hasExplicitMultiTrackTimeline(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const cfg = getPodcastVideoConfig(activeSession);
  const clips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const usedTrackIds = new Set(
    Object.values(clips)
      .map((clip) => String(clip?.trackId || "").trim())
      .filter(Boolean)
  );
  const explicitNarradorTrackIds = new Set(
    normalizeTimelineTracks(cfg?.timelineTracks || [])
      .map((track) => String(track?.id || "").trim())
      .filter((trackId) => isNarradorSceneTrackId(trackId))
  );
  return usedTrackIds.size > 1 || explicitNarradorTrackIds.size > 1;
}

function resolveTimelineDefaultTrackIdForSpeaker(speakerKey = "") {
  const key = String(speakerKey || "").trim().toLowerCase() || "unknown";
  return `speaker:${key}`;
}

function isNarradorSceneTrackId(trackId = "") {
  return /^speaker:narrador(?:-\d+)?$/i.test(String(trackId || "").trim());
}

function getNarradorSceneTrackOrdinal(trackId = "") {
  const normalized = String(trackId || "").trim().toLowerCase();
  if (normalized === "speaker:narrador") return 1;
  const match = normalized.match(/^speaker:narrador-(\d+)$/);
  return match ? Math.max(2, Math.round(Number(match[1]) || 2)) : 0;
}

function buildNarradorSceneTrackLabel(trackId = "", session = null) {
  const ordinal = getNarradorSceneTrackOrdinal(trackId);
  const baseLabel = resolveSpeakerDisplayName("Narrador", session || getActiveSession());
  if (ordinal <= 1) return baseLabel;
  return `${baseLabel} ${ordinal}`;
}

function isEducationalVisibleSceneTrack(trackId = "") {
  return isNarradorSceneTrackId(trackId);
}

function isSceneTimelineTrackId(trackId = "", session = null) {
  const key = String(trackId || "").trim();
  if (!key || key === "on-screen-text" || key === "audio-track") return false;
  if (key.startsWith("montage-audio:") || key.startsWith("audio-track-uploaded-")) return false;
  if (session && isEducationalVideoMode(session)) {
    return isEducationalVisibleSceneTrack(key);
  }
  return true;
}

function buildEducationalSceneTrackIdRemap(session = null, tracks = [], clipMap = {}) {
  const activeSession = session || getActiveSession();
  if (!isEducationalVideoMode(activeSession)) return {};
  const rows = getSessionRows(activeSession);
  if (!rows.length) return {};
  const rowById = new Map(rows.map((row) => [String(row?.id || "").trim(), row]));
  const inputTracks = Array.isArray(tracks) ? tracks : [];
  const normalizedClipMap = clipMap && typeof clipMap === "object" ? clipMap : {};
  const trackOrderById = new Map(inputTracks.map((track, index) => [String(track?.id || "").trim(), index]));
  const usedVisibleIds = new Set(
    inputTracks
      .map((track) => String(track?.id || "").trim())
      .filter((trackId) => isNarradorSceneTrackId(trackId))
  );
  usedVisibleIds.add("speaker:narrador");
  const candidates = Object.entries(normalizedClipMap)
    .map(([rowId, clip]) => {
      const key = String(rowId || "").trim();
      const trackId = String(clip?.trackId || "").trim();
      const row = rowById.get(key) || null;
      const speaker = String(row?.speaker || "").trim().toLowerCase();
      if (!key || !trackId || !row || speaker !== "narrador" || isNarradorSceneTrackId(trackId)) return null;
      return {
        rowId: key,
        trackId,
        trackOrder: Number(trackOrderById.get(trackId) ?? Number.MAX_SAFE_INTEGER),
        startMs: Math.max(0, Number(clip?.startMs || 0)),
        zIndex: Math.max(1, Number(clip?.zIndex || 1))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.trackOrder - b.trackOrder || a.startMs - b.startMs || a.zIndex - b.zIndex || a.rowId.localeCompare(b.rowId));
  const remap = {};
  candidates.forEach((item) => {
    if (remap[item.trackId]) return;
    let ordinal = 2;
    let nextId = `speaker:narrador-${ordinal}`;
    while (usedVisibleIds.has(nextId)) {
      ordinal += 1;
      nextId = `speaker:narrador-${ordinal}`;
    }
    usedVisibleIds.add(nextId);
    remap[item.trackId] = nextId;
  });
  return remap;
}

function buildTimelineVariantTrackDescriptor(baseSpeakerKey = "", existingTracks = []) {
  const speakerKey = String(baseSpeakerKey || "").trim() || "Narrador";
  const baseTrackId = resolveTimelineDefaultTrackIdForSpeaker(speakerKey);
  const normalizedTracks = Array.isArray(existingTracks) ? existingTracks : [];
  const usedIds = new Set(normalizedTracks.map((track) => String(track?.id || "").trim()).filter(Boolean));
  const displayName = resolveSpeakerDisplayName(speakerKey, getActiveSession());
  let suffix = 2;
  let nextId = `${baseTrackId}-${suffix}`;
  while (usedIds.has(nextId)) {
    suffix += 1;
    nextId = `${baseTrackId}-${suffix}`;
  }
  return {
    id: nextId,
    label: `${displayName} ${suffix}`
  };
}

function buildDefaultTimelineTracks(session = null) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  const seenSpeakers = new Set();
  const tracks = [];
  rows.forEach((row) => {
    const speakerKey = String(row?.speaker || "").trim();
    if (!speakerKey || seenSpeakers.has(speakerKey)) return;
    seenSpeakers.add(speakerKey);
    tracks.push({
      id: resolveTimelineDefaultTrackIdForSpeaker(speakerKey),
      label: resolveSpeakerDisplayName(speakerKey, activeSession),
      order: tracks.length
    });
  });
  if (!tracks.length) {
    tracks.push({
      id: "speaker:unknown",
      label: "Track 1",
      order: 0
    });
  }
  return tracks;
}

function normalizePodcastVideoConfig(raw = {}) {
  const normalizeTimelineSceneAudioMixByRowId = (source = {}) => {
    const next = {};
    if (!source || typeof source !== "object") return next;
    Object.entries(source).forEach(([rowId, rawMix]) => {
      const key = String(rowId || "").trim();
      if (!key || !rawMix || typeof rawMix !== "object") return;
      const backgroundMusicVolumePct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(rawMix?.backgroundMusicVolumePct, Number.NaN))));
      if (!Number.isFinite(backgroundMusicVolumePct)) return;
      next[key] = { backgroundMusicVolumePct };
    });
    return next;
  };
  const audioMode = String(raw?.audioMode || "").trim().toLowerCase();
  const timelineViewMode = String(raw?.timelineViewMode || "").trim().toLowerCase();
  const masterVolume = Math.max(0, Math.min(100, toFiniteNumber(raw?.masterVolume, 100)));
  const clipVolume = Math.max(0, Math.min(100, toFiniteNumber(raw?.clipVolume, 100)));
  const audioMasterStabilize = raw?.audioMasterStabilize === true;
  const audioMasterLimiterEnabled = raw?.audioMasterLimiterEnabled === true;
  const normalizedAudioMode = audioMode === "veo-native-audio" ? "veo-native-audio" : "gemini-live-per-scene";
  const montageDefaultVeoVolumePct = Math.max(
    0,
    Math.min(
      100,
      toFiniteNumber(
        raw?.montageDefaultVeoVolumePct,
        normalizedAudioMode === "veo-native-audio" ? clipVolume : 0
      )
    )
  );
  const montageDefaultGeminiVolumePct = Math.max(
    0,
    Math.min(
      100,
      toFiniteNumber(
        raw?.montageDefaultGeminiVolumePct,
        masterVolume
      )
    )
  );
  const timelineTrackHeightsById = (() => {
    const source = raw?.timelineTrackHeightsById && typeof raw.timelineTrackHeightsById === "object"
      ? raw.timelineTrackHeightsById
      : {};
    const next = {};
    Object.entries(source || {}).forEach(([trackId, value]) => {
      const key = String(trackId || "").trim();
      if (!key) return;
      const height = toFiniteNumber(value, Number.NaN);
      if (!Number.isFinite(height)) return;
      next[key] = Math.round(Math.max(56, Math.min(520, height)));
    });
    return next;
  })();
  const geminiDialogueTrackIndex = Math.max(0, Math.min(999, Math.floor(toFiniteNumber(raw?.geminiDialogueTrackIndex, 0))));
  const normalizedVideoModel = (() => {
    const requestedModel = String(raw?.videoModel || "").trim();
    if (requestedModel && AVAILABLE_PODCASTER_VIDEO_MODELS.includes(requestedModel)) return requestedModel;
    return raw?.cheapVideoMode === false ? "veo-3.1-generate-preview" : "veo-3.1-lite-generate-preview";
  })();
  return {
    enabled: raw?.enabled === true,
    editorEnabled: raw?.editorEnabled === true,
    autoGenerateScenarioImages: raw?.autoGenerateScenarioImages === true,
    autoGeneratePortraits: raw?.autoGeneratePortraits === true,
    allowLivePreviewWithoutStoredAudio: raw?.allowLivePreviewWithoutStoredAudio === true,
    cheapVideoMode: raw?.cheapVideoMode !== false,
    videoModel: normalizedVideoModel,
    timelineVersion: Math.max(1, Math.round(toFiniteNumber(raw?.timelineVersion, STUDIO_TIMELINE_VERSION))),
    timelineTrackVersion: Math.max(1, Math.round(toFiniteNumber(raw?.timelineTrackVersion, STUDIO_TIMELINE_TRACK_VERSION))),
    timelineTracks: normalizeTimelineTracks(raw?.timelineTracks || []),
    timelineClipsByRowId: normalizeTimelineClipsByRowId(raw?.timelineClipsByRowId || {}),
    timelineOnScreenTextTrackVersion: Math.max(1, Math.round(toFiniteNumber(raw?.timelineOnScreenTextTrackVersion, STUDIO_TIMELINE_TRACK_VERSION))),
    timelineOnScreenTextClipsByRowId: normalizeOnScreenTextClipsByRowId(raw?.timelineOnScreenTextClipsByRowId || {}),
    timelineOnScreenTextLayoutByRowId: normalizeOnScreenTextLayoutByRowId(raw?.timelineOnScreenTextLayoutByRowId || {}),
    timelineOverlayCardsById: normalizeOverlayCardsById(raw?.timelineOverlayCardsById || {}),
    timelineSceneAudioMixByRowId: normalizeTimelineSceneAudioMixByRowId(raw?.timelineSceneAudioMixByRowId || {}),
    timelineOnScreenTextDefaultsVersion: Math.max(1, Math.round(toFiniteNumber(raw?.timelineOnScreenTextDefaultsVersion, 1))),
    timelineOnScreenTextLayoutDefaultsVersion: Math.max(1, Math.round(toFiniteNumber(raw?.timelineOnScreenTextLayoutDefaultsVersion, 1))),
    timelineTrackHeightsById,
    timelineViewMode: timelineViewMode === "normal" ? "normal" : "tracks",
    transitionsByEdge: normalizeTransitionsByEdge(raw?.transitionsByEdge || {}),
    frameHoldsByRowId: normalizeFrameHoldsByRowId(raw?.frameHoldsByRowId || {}),
    speedRangesByRowId: normalizeSpeedRangesByRowId(raw?.speedRangesByRowId || {}),
    onScreenTextTrack: normalizeOnScreenTextTrackSettings(raw?.onScreenTextTrack || {}),
    geminiDialogueTrack: normalizeGeminiDialogueTrack(raw?.geminiDialogueTrack || {}),
    geminiDialogueTrackIndex,
    audioMode: normalizedAudioMode,
    masterVolume,
    clipVolume,
    audioMasterStabilize,
    audioMasterLimiterEnabled,
    montageDefaultVeoVolumePct,
    montageDefaultGeminiVolumePct,
    playbackSpeed: Math.max(0.5, Math.min(2.0, toFiniteNumber(raw?.playbackSpeed, 1.0))),
    reelModeEnabled: raw?.reelModeEnabled === true
  };
}

function getRowSourceDurationMs(row = null, session = null) {
  if (!row) return 8000;
  const rowId = String(row?.id || "").trim();
  const videoClip = rowId ? resolveDialogueVideoForRow(session, rowId) : null;
  const videoMs = Math.max(0, Number(videoClip?.durationSec) || 0) * 1000;
  const audioMs = resolveRowAudioDurationMs(rowId, session);
  const rowMs = Math.max(0, Number(row?.durationSec) || 0) * 1000;
  const isVideoEducational = isEducationalVideoMode(session);
  const isVideoEditor = Boolean(getPodcastVideoState()?.enabled) || getPodcastVideoConfig(session || getActiveSession())?.enabled === true;
  const isPodcast = isPodcastMode(session);
  const candidate = isVideoEducational
    ? (videoMs > 0 ? videoMs : (rowMs > 0 ? rowMs : (audioMs > 0 ? audioMs : VIDEO_SCENE_MAX_SEC * 1000)))
    : (isVideoEditor
      ? (videoMs > 0 ? videoMs : (isPodcast && audioMs > 0 ? audioMs : (rowMs > 0 ? rowMs : (audioMs > 0 ? audioMs : 8000))))
      : (audioMs > 0
        ? audioMs
        : rowMs > 0
          ? rowMs
          : videoMs > 0
            ? videoMs
            : 800));
  const bounded = isVideoEducational
    ? Math.min(VIDEO_SCENE_MAX_SEC * 1000, Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, candidate || (VIDEO_SCENE_MAX_SEC * 1000)))
    : Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, candidate || 8000);
  return Math.round(bounded);
}

function buildDefaultTimelineClipsByRowId(session = null) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  const next = {};
  let cursorMs = 0;
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const speakerKey = String(row?.speaker || "").trim();
    const sourceDurationMs = getRowSourceDurationMs(row, activeSession);
    const clip = normalizeTimelineClipItem({
      rowId,
      speakerKey,
      trackId: resolveTimelineDefaultTrackIdForSpeaker(speakerKey),
      startMs: cursorMs,
      sourceDurationMs,
      trimInMs: 0,
      trimOutMs: sourceDurationMs,
      zIndex: index + 1
    }, rowId);
    if (!clip) return;
    next[rowId] = clip;
    cursorMs += Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, clip.trimOutMs - clip.trimInMs);
  });
  return next;
}

function ensureTimelineTracks(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const persist = options.persist === true;
  const cfg = getPodcastVideoConfig(activeSession);
  const rows = getSessionRows(activeSession);
  const validRowIds = new Set(rows.map((row) => String(row?.id || "").trim()).filter(Boolean));
  const lockPodcastTracksToSpeakers = isPodcastMode(activeSession) && !isEducationalVideoMode(activeSession);
  const existingTracks = normalizeTimelineTracks(cfg.timelineTracks || []);
  const existingClipMap = Object.fromEntries(
    Object.entries(normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {}))
      .filter(([rowId]) => validRowIds.has(String(rowId || "").trim()))
  );
  const educationalTrackIdRemap = buildEducationalSceneTrackIdRemap(activeSession, existingTracks, existingClipMap);
  const fallbackTracks = buildDefaultTimelineTracks(activeSession);
  const sourceTracks = lockPodcastTracksToSpeakers
    ? fallbackTracks
    : (existingTracks.length ? existingTracks : fallbackTracks);
  const usedTrackIds = new Set();
  rows.forEach((row) => {
    const speakerKey = String(row?.speaker || "").trim();
    if (!speakerKey) return;
    usedTrackIds.add(resolveTimelineDefaultTrackIdForSpeaker(speakerKey));
  });
  if (!lockPodcastTracksToSpeakers) {
    Object.values(existingClipMap).forEach((clip) => {
      const rawTrackId = String(clip?.trackId || "").trim();
      const trackId = String(educationalTrackIdRemap[rawTrackId] || rawTrackId).trim();
      if (!trackId) return;
      usedTrackIds.add(trackId);
    });
  }
  const nextTracks = sourceTracks.map((track, index) => ({
    id: String(educationalTrackIdRemap[String(track.id || "").trim()] || track.id || "").trim(),
    label: (() => {
      const rawTrackId = String(educationalTrackIdRemap[String(track.id || "").trim()] || track.id || "").trim();
      if (isNarradorSceneTrackId(rawTrackId)) {
        return buildNarradorSceneTrackLabel(rawTrackId, activeSession);
      }
      return String(track.label || `Track ${index + 1}`).trim() || `Track ${index + 1}`;
    })(),
    order: index
  })).filter((track) => track.id && usedTrackIds.has(track.id));
  const knownTrackIds = new Set(nextTracks.map((track) => track.id));
  const ensureTrack = (trackId = "", label = "") => {
    const id = String(trackId || "").trim();
    if (!id || knownTrackIds.has(id)) return;
    knownTrackIds.add(id);
    nextTracks.push({
      id,
      label: String(label || `Track ${nextTracks.length + 1}`).trim() || `Track ${nextTracks.length + 1}`,
      order: nextTracks.length
    });
  };
  rows.forEach((row) => {
    const speakerKey = String(row?.speaker || "").trim();
    if (!speakerKey) return;
    const trackId = resolveTimelineDefaultTrackIdForSpeaker(speakerKey);
    ensureTrack(trackId, resolveSpeakerDisplayName(speakerKey, activeSession));
  });
  if (!lockPodcastTracksToSpeakers) {
    Object.values(existingClipMap).forEach((clip) => {
      const rawTrackId = String(clip?.trackId || "").trim();
      const trackId = String(educationalTrackIdRemap[rawTrackId] || rawTrackId).trim();
      if (!trackId) return;
      ensureTrack(
        trackId,
        isNarradorSceneTrackId(trackId)
          ? buildNarradorSceneTrackLabel(trackId, activeSession)
          : `Track ${nextTracks.length + 1}`
      );
    });
  }
  if (!nextTracks.length) {
    nextTracks.push({
      id: "speaker:unknown",
      label: "Track 1",
      order: 0
    });
  }
  const normalizedNext = normalizeTimelineTracks(nextTracks);
  const changed = JSON.stringify(normalizedNext) !== JSON.stringify(existingTracks)
    || Number(cfg.timelineTrackVersion || 1) !== STUDIO_TIMELINE_TRACK_VERSION;
  if (persist && changed) {
    upsertPodcastVideoConfig((base) => ({
      ...base,
      timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineTracks: normalizedNext
    }));
  }
  return normalizedNext;
}

function ensureTimelineClipsByRowId(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const sessionId = String(activeSession?.id || "").trim();
  const persist = options.persist === true;
  const videoState = getPodcastVideoState();

  if (!persist && videoState.lastTimelineClipsSessionId === sessionId && activeSession.updatedAt === videoState.lastTimelineClipsUpdatedAt && videoState.cachedTimelineClips) {
    return videoState.cachedTimelineClips;
  }

  const rows = getSessionRows(activeSession);
  const validRowIds = new Set(rows.map((row) => String(row?.id || "").trim()).filter(Boolean));
  const lockPodcastTracksToSpeakers = isPodcastMode(activeSession) && !isEducationalVideoMode(activeSession);
  const cfg = getPodcastVideoConfig(activeSession);
  const existing = Object.fromEntries(
    Object.entries(normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {}))
      .filter(([rowId]) => validRowIds.has(String(rowId || "").trim()))
  );
  const educationalTrackIdRemap = buildEducationalSceneTrackIdRemap(activeSession, normalizeTimelineTracks(cfg.timelineTracks || []), existing);
  const timelineTracks = ensureTimelineTracks(activeSession, { persist: false });
  const validTrackIds = new Set(timelineTracks.map((track) => String(track.id || "").trim()).filter(Boolean));
  const fallbackTrackId = String(timelineTracks[0]?.id || "speaker:unknown").trim() || "speaker:unknown";
  const fallback = buildDefaultTimelineClipsByRowId(activeSession);
  const next = {};
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const existingClip = existing[rowId];
    const base = existingClip || fallback[rowId];
    if (!base) return;
    const rowSourceDurationMs = getRowSourceDurationMs(row, activeSession);
    const speakerKey = String(row?.speaker || "").trim();
    const speakerTrackId = resolveTimelineDefaultTrackIdForSpeaker(speakerKey);
    const baseTrackId = String(educationalTrackIdRemap[String(base.trackId || "").trim()] || base.trackId || "").trim();
    const selectedTrackId = lockPodcastTracksToSpeakers
      ? (validTrackIds.has(speakerTrackId) ? speakerTrackId : fallbackTrackId)
      : (validTrackIds.has(baseTrackId)
        ? baseTrackId
        : (validTrackIds.has(speakerTrackId) ? speakerTrackId : fallbackTrackId));
    let existingSourceDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(existingClip?.sourceDurationMs || base?.sourceDurationMs || rowSourceDurationMs)
    );

    // Auto-expand if the underlying media is longer than what's stored
    // (We don't auto-shrink to prevent UI jumps during media loading/generation states)
    if (rowSourceDurationMs > existingSourceDurationMs) {
      existingSourceDurationMs = rowSourceDurationMs;
    }

    let existingTrimInMs = Math.max(0, Number(existingClip?.trimInMs ?? base?.trimInMs ?? 0));
    let existingTrimOutMs = Math.max(
      existingTrimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(existingClip?.trimOutMs ?? base?.trimOutMs ?? existingSourceDurationMs)
    );

    // If the clip was at the minimum fallback, was completely untrimmed, or is stuck at the fallback duration due to a previous bug, expand its out-point
    const prevSourceDuration = Number(existingClip?.sourceDurationMs || base?.sourceDurationMs || 0);
    const wasFallback = prevSourceDuration <= STUDIO_TIMELINE_MIN_CLIP_MS;
    const wasUntrimmed = Number(existingClip?.trimOutMs || base?.trimOutMs || 0) >= prevSourceDuration;
    const prevTrimOut = Number(existingClip?.trimOutMs || base?.trimOutMs || 0);
    const wasVictimOfTrimBug = prevTrimOut > 0 && prevTrimOut <= STUDIO_TIMELINE_MIN_CLIP_MS + 50 && rowSourceDurationMs > STUDIO_TIMELINE_MIN_CLIP_MS + 500;

    if ((rowSourceDurationMs > prevSourceDuration && (wasFallback || wasUntrimmed)) || wasVictimOfTrimBug) {
      existingTrimOutMs = Math.max(existingTrimOutMs, rowSourceDurationMs);
    }

    const sourceDurationMs = Math.max(existingSourceDurationMs, existingTrimOutMs);
    const normalized = normalizeTimelineClipItem({
      ...base,
      speakerKey,
      trackId: selectedTrackId,
      sourceDurationMs,
      trimInMs: existingTrimInMs,
      trimOutMs: existingTrimOutMs,
      zIndex: Math.max(1, Number(base.zIndex || index + 1))
    }, rowId);
    if (!normalized) return;
    next[rowId] = normalized;
  });
  const changed = JSON.stringify(next) !== JSON.stringify(existing) || Number(cfg.timelineVersion || 1) !== STUDIO_TIMELINE_VERSION;
  if (persist && changed) {
    upsertPodcastVideoConfig((base, s) => ({
      ...base,
      timelineVersion: STUDIO_TIMELINE_VERSION,
      timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineTracks: ensureTimelineTracks(s || activeSession, { persist: false }),
      timelineClipsByRowId: next
    }));
  }
  
  if (!persist) {
    videoState.lastTimelineClipsSessionId = sessionId;
    videoState.lastTimelineClipsUpdatedAt = activeSession.updatedAt;
    videoState.cachedTimelineClips = next;
  }

  return next;
}

function getTimelineClipStoreByKind(session = null, kind = "scene", options = {}) {
  const clipKind = String(kind || "scene").trim().toLowerCase();
  if (clipKind === "on-screen-text") {
    return ensureOnScreenTextClipsByRowId(session, options);
  }
  return ensureTimelineClipsByRowId(session, options);
}

function reflowTimelineClipsByScriptOrder(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const persist = options.persist !== false;
  const shouldRender = options.render !== false;
  if (!activeSession) return false;
  const rows = getSessionRows(activeSession);
  if (!rows.length) return false;
  const cfg = getPodcastVideoConfig(activeSession);
  const baseMap = ensureTimelineClipsByRowId(activeSession, { persist: false });
  let cursorMs = 0;
  const nextMap = {};
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const base = baseMap[rowId] || null;
    if (!base) return;
    const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(base));
    const nextClip = normalizeTimelineClipItem({
      ...base,
      startMs: cursorMs,
      zIndex: index + 1
    }, rowId);
    if (!nextClip) return;
    nextMap[rowId] = nextClip;
    cursorMs += durationMs;
  });
  const changed = JSON.stringify(nextMap) !== JSON.stringify(normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {}));
  if (!changed) return false;
  if (persist) {
    upsertPodcastVideoConfig((baseCfg) => ({
      ...baseCfg,
      timelineVersion: STUDIO_TIMELINE_VERSION,
      timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineTracks: ensureTimelineTracks(activeSession, { persist: false }),
      timelineClipsByRowId: nextMap
    }));
    getPodcastVideoState().timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
    syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
    if (shouldRender) {
      renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
      renderPodcastTransitionTimeline(getActiveSession());
      syncPodcastStudioInspector(getActiveSession());
    }
  }
  return true;
}

export function compactTimelineTrackClipsFromRow(session = null, clipMap = {}, rowId = "", options = {}) {
  const activeSession = session || getActiveSession();
  const pivotRowId = String(rowId || "").trim();
  if (!activeSession || !pivotRowId || !clipMap || typeof clipMap !== "object") return normalizeTimelineClipsByRowId(clipMap || {});
  const rows = getSessionRows(activeSession);
  if (!rows.length) return normalizeTimelineClipsByRowId(clipMap || {});
  const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
  const normalizedClipMap = normalizeTimelineClipsByRowId(clipMap || {});
  const pivotClip = normalizedClipMap[pivotRowId];
  if (!pivotClip) return normalizedClipMap;
  const trackId = String(pivotClip?.trackId || "").trim();
  if (!trackId) return normalizedClipMap;

  const sameTrack = Object.values(normalizedClipMap)
    .filter((item) => String(item?.trackId || "").trim() === trackId)
    .sort((a, b) => (
      Number(a.startMs || 0) - Number(b.startMs || 0)
      || Number(rowIndexById.get(String(a?.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b?.rowId || "").trim()) || 0)
    ));
  const pivotIndex = sameTrack.findIndex((item) => String(item?.rowId || "").trim() === pivotRowId);
  if (pivotIndex < 0) return normalizedClipMap;

  const nextMap = { ...normalizedClipMap };
  let previousClip = nextMap[pivotRowId];
  sameTrack.slice(pivotIndex + 1).forEach((item) => {
    const itemRowId = String(item?.rowId || "").trim();
    const current = nextMap[itemRowId];
    if (!itemRowId || !current || !previousClip) return;
    const transition = options.allowTransitionOverlap === false
      ? { type: "cut", durationMs: 0 }
      : getTransitionForEdge(activeSession, String(previousClip?.rowId || "").trim(), itemRowId);
    const overlapMs = Math.max(
      0,
      Math.min(
        getTimelineClipEffectiveDurationMs(previousClip),
        getTimelineClipEffectiveDurationMs(current),
        Math.round(Number(transition?.durationMs || 0) || 0)
      )
    );
    const desiredStartMs = Math.max(0, snapTimelineMs(getTimelineClipEndMs(previousClip) - overlapMs));
    const normalized = normalizeTimelineClipItem({
      ...current,
      startMs: desiredStartMs
    }, itemRowId);
    if (!normalized) return;
    nextMap[itemRowId] = normalized;
    previousClip = normalized;
  });
  return nextMap;
}

function hasValidPersistedSceneTimelineMap(session = null) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  if (rows.length < 2) return false;
  const cfg = getPodcastVideoConfig(activeSession);
  const persisted = normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {});
  const ordered = rows
    .map((row) => {
      const rowId = String(row?.id || "").trim();
      return rowId ? persisted[rowId] || null : null;
    })
    .filter(Boolean);
  if (ordered.length < 2 || ordered.length !== rows.length) return false;
  const startMsValues = ordered.map((clip) => Math.max(0, Number(clip?.startMs || 0) || 0));
  const uniqueStarts = new Set(startMsValues.map((ms) => Math.round(ms))).size;
  const positiveStarts = startMsValues.filter((ms) => ms > Math.max(1, STUDIO_TIMELINE_SNAP_MS / 2)).length;
  if (uniqueStarts <= 1 && positiveStarts === 0) return false;
  return ordered.every((clip) => {
    const trackId = String(clip?.trackId || "").trim();
    const durationMs = getTimelineClipEffectiveDurationMs(clip);
    return Boolean(trackId) && Number.isFinite(durationMs) && durationMs >= STUDIO_TIMELINE_MIN_CLIP_MS;
  });
}

function shouldAutoRepairTimelineLayout(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const rows = getSessionRows(activeSession);
  if (rows.length < 2) return false;

  const cfg = getPodcastVideoConfig(activeSession);
  const clips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const orderedClips = rows
    .map((row) => clips[String(row?.id || "").trim()])
    .filter(Boolean);
  if (orderedClips.length < 2) return false;

  const trackIds = new Set(
    orderedClips.map((clip) => String(clip?.trackId || "").trim()).filter(Boolean)
  );

  const startMsValues = orderedClips.map((clip) => Math.max(0, Number(clip?.startMs || 0)));
  const uniqueStarts = new Set(startMsValues.map((ms) => Math.round(ms))).size;
  const positiveStarts = startMsValues.filter((ms) => ms > Math.max(1, STUDIO_TIMELINE_SNAP_MS / 2)).length;
  const looksReset = uniqueStarts <= 1 && positiveStarts === 0;
  if (looksReset) return true;

  if (hasValidPersistedSceneTimelineMap(activeSession)) {
    return false;
  }

  const sceneMaxEnd = orderedClips.reduce((acc, clip) => Math.max(acc, getTimelineClipEndMs(clip)), 0);
  const onScreenTextMaxEnd = getOnScreenTextTimelineMaxEndMs(activeSession);
  const hasLaggingSceneTimeline = onScreenTextMaxEnd > sceneMaxEnd + Math.max(2000, STUDIO_TIMELINE_MIN_CLIP_MS * 2);
  if (hasLaggingSceneTimeline) return true;

  if (trackIds.size <= 1) {
    const runtime = buildTimelineRuntimeEntries(activeSession)
      .filter((entry) => Boolean(String(entry?.rowId || "").trim()));
    const visual = runtime
      .filter((entry) => Boolean(String(entry?.videoSrc || "").trim()))
      .sort((a, b) => (
        Number(a.startMs || 0) - Number(b.startMs || 0)
        || Number(a.zIndex || 0) - Number(b.zIndex || 0)
        || Number(a.index || 0) - Number(b.index || 0)
      ));
    let prevEnd = null;
    for (let i = 0; i < visual.length; i += 1) {
      const start = Math.max(0, Number(visual[i]?.startMs || 0));
      const end = Math.max(0, Number(visual[i]?.endMs || 0));
      if (prevEnd != null && start < prevEnd - Math.max(1, STUDIO_TIMELINE_SNAP_MS / 2)) {
        return true;
      }
      prevEnd = Math.max(prevEnd == null ? 0 : prevEnd, end);
    }
  }

  return false;
}

function getTimelineClipEffectiveDurationMs(clip = null) {
  if (!clip || typeof clip !== "object") return STUDIO_TIMELINE_MIN_CLIP_MS;
  return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(clip.trimOutMs || 0) - Number(clip.trimInMs || 0)));
}

function getTimelineClipEndMs(clip = null) {
  if (!clip || typeof clip !== "object") return 0;
  return Math.max(0, Number(clip.startMs || 0)) + getTimelineClipEffectiveDurationMs(clip);
}

function getOnScreenTextTimelineMaxEndMs(session = null) {
  const clipMap = ensureOnScreenTextClipsByRowId(session, { persist: false });
  return Object.values(clipMap || {}).reduce((acc, clip) => {
    const startMs = Math.max(0, Number(clip?.startMs || 0) || 0);
    const durationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(clip?.durationMs || 0) || (Number(clip?.endMs || 0) - startMs) || STUDIO_TIMELINE_MIN_CLIP_MS
    );
    return Math.max(acc, startMs + durationMs);
  }, 0);
}

function getTimelineTotalDurationMs(session = null) {
  const runtimeEntries = buildTimelineRuntimeEntries(session);
  const runtimeMaxEnd = runtimeEntries.reduce((acc, entry) => Math.max(acc, Math.max(0, Number(entry?.endMs || 0))), 0);
  const map = ensureTimelineClipsByRowId(session);
  const clipMaxEnd = Object.values(map).reduce((acc, clip) => Math.max(acc, getTimelineClipEndMs(clip)), 0);
  const cfg = getPodcastVideoConfig(session || getActiveSession());
  const geminiTrack = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  const geminiMaxEnd = geminiTrack.enabled === true
    ? (geminiTrack.segments || []).reduce((acc, segment) => {
      const rowId = String(segment?.rowId || "").trim();
      const startMs = Math.max(0, Number(segment?.startMs || 0) || 0);
      const measuredAudioVisibleMs = rowId
        ? Math.max(0, Math.round(Number(resolveRowAudioDurationMs(rowId, session || getActiveSession()) || 0) || 0))
        : 0;
      const durationMs = Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        measuredAudioVisibleMs,
        Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - startMs) || STUDIO_TIMELINE_MIN_CLIP_MS
      );
      return Math.max(acc, startMs + durationMs);
    }, 0)
    : 0;
  const onScreenTextMaxEnd = getOnScreenTextTimelineMaxEndMs(session);
  const maxEnd = Math.max(runtimeMaxEnd, clipMaxEnd, geminiMaxEnd, onScreenTextMaxEnd);
  return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, maxEnd);
}

function snapTimelineMs(value = 0) {
  const ms = Math.max(0, Number(value) || 0);
  return Math.round(ms / STUDIO_TIMELINE_SNAP_MS) * STUDIO_TIMELINE_SNAP_MS;
}

function getStudioTimelineZoom(session = null) {
  const raw = toFiniteNumber(getPodcastVideoState()?.timelineZoom, 1);
  return Math.max(0.25, Math.min(1, raw));
}

function getStudioTimelinePixelsPerSec(session = null) {
  return STUDIO_TIMELINE_PIXELS_PER_SEC * getStudioTimelineZoom(session);
}

function getStudioTimelineMinClipPx(session = null) {
  const zoom = getStudioTimelineZoom(session);
  return Math.max(44, Math.round(STUDIO_TIMELINE_MIN_CLIP_PX * zoom));
}

function getStudioAudioTrackMinLoopPx(session = null) {
  const zoom = getStudioTimelineZoom(session);
  return Math.max(12, Math.round(STUDIO_AUDIO_TRACK_MIN_LOOP_PX * zoom));
}

function timelineMsToPx(valueMs = 0, session = null) {
  return (Math.max(0, Number(valueMs) || 0) / 1000) * getStudioTimelinePixelsPerSec(session);
}

function timelinePxToMs(valuePx = 0, session = null) {
  return (Number(valuePx) || 0) / getStudioTimelinePixelsPerSec(session) * 1000;
}

function resolveTimelineDragStepMs(event = null) {
  if (event?.altKey) return 1;
  if (event?.shiftKey) return 50;
  return STUDIO_TIMELINE_SNAP_MS;
}

function snapTimelineMsWithStep(value = 0, stepMs = STUDIO_TIMELINE_SNAP_MS) {
  const step = Math.max(1, Number(stepMs) || STUDIO_TIMELINE_SNAP_MS);
  const ms = Number(value) || 0;
  return Math.round(ms / step) * step;
}

function buildTimelineRuntimeEntries(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return [];

  const useOverrides = Boolean(options && (options.overrideClips || options.overrideConfig));
  const cacheKey = `${activeSession.id}:${activeSession.updatedAt || ''}:${window.state.activeSessionId}:${activeSession.podcastVideoConfig?.geminiDialogueTrack?.updatedAt || ''}`;
  if (!useOverrides && window.studioRuntimeEntriesCache && window.studioRuntimeEntriesCacheKey === cacheKey) {
    return window.studioRuntimeEntriesCache;
  }

  const effectiveConfig = normalizePodcastVideoConfig({
    ...(getPodcastVideoConfig(activeSession) || {}),
    ...(options?.overrideConfig || {}),
    timelineClipsByRowId: options?.overrideClips || options?.overrideConfig?.timelineClipsByRowId || getPodcastVideoConfig(activeSession)?.timelineClipsByRowId || {}
  });
  const effectiveSession = {
    ...activeSession,
    podcastVideoConfig: effectiveConfig
  };

  const rows = getSessionRows(effectiveSession);
  const augmentedEntries = buildAugmentedTimelineRuntimeEntries(effectiveSession, {
    clipMap: effectiveConfig.timelineClipsByRowId || {}
  });
  const entries = augmentedEntries.map((runtimeEntry, index) => {
    const row = runtimeEntry.row || rows[index] || null;
    const rowId = String(runtimeEntry?.rowId || row?.id || "").trim();
    const clip = runtimeEntry?.clip || effectiveConfig.timelineClipsByRowId?.[rowId] || null;
    if (!rowId || !clip) return null;
    const sceneClip = resolveDialogueVideoForRow(activeSession, rowId);
    const primarySegment = resolvePrimaryDialogueVideoSegment(sceneClip, {
      sessionId: String(activeSession?.id || "").trim(),
      rowId
    });
    const videoSrc = resolveStorageVideoUrl(
      primarySegment?.downloadUrl || sceneClip?.downloadUrl || "",
      primarySegment?.storagePath || sceneClip?.storagePath || ""
    );
    const audioClip = resolveDialogueAudioForRow(activeSession, rowId);
    const audioSrc = resolveStorageAudioUrl(audioClip?.downloadUrl || "", audioClip?.storagePath || "");
    const audioDurationMs = resolveRowAudioDurationMs(rowId, activeSession);
    const speakerKey = String(row?.speaker || "").trim();
    const isImageClip = (() => {
      const mime = String(
        sceneClip?.mimeType || primarySegment?.mimeType || ""
      ).toLowerCase().trim();
      if (mime.startsWith("image/")) return true;
      const explicitType = String(sceneClip?.type || "").toLowerCase().trim();
      if (explicitType === "image") return true;
      const rawUrl = String(
        primarySegment?.downloadUrl || sceneClip?.downloadUrl || ""
      );
      if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(rawUrl)) return true;
      const rawPath = String(
        primarySegment?.storagePath || sceneClip?.storagePath || ""
      );
      if (/\.(jpg|jpeg|png|webp|gif)$/i.test(rawPath)) return true;
      return false;
    })();
    return {
      row,
      rowId,
      index: Number(runtimeEntry?.index ?? index),
      speakerKey,
      speakerName: resolveSpeakerDisplayName(speakerKey, activeSession),
      clip,
      startMs: Math.max(0, Number(runtimeEntry?.startMs || 0)),
      endMs: Math.max(0, Number(runtimeEntry?.endMs || 0)),
      effectiveDurationMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(runtimeEntry?.effectiveDurationMs || 0)),
      baseDurationMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(runtimeEntry?.baseDurationMs || 0)),
      frameHolds: Array.isArray(runtimeEntry?.frameHolds) ? runtimeEntry.frameHolds : [],
      speedRanges: Array.isArray(runtimeEntry?.speedRanges) ? runtimeEntry.speedRanges : [],
      transitionOut: runtimeEntry?.transitionOut || null,
      sourceDurationMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(runtimeEntry?.sourceDurationMs || clip?.sourceDurationMs || 0)),
      videoSrc,
      audioSrc,
      audioDurationMs,
      isImageClip,
      zIndex: Math.max(1, Number(clip.zIndex || index + 1))
    };
  }).filter(Boolean);

  const sorted = entries.sort((a, b) => a.startMs - b.startMs || a.index - b.index);
  if (!useOverrides) {
    window.studioRuntimeEntriesCache = sorted;
    window.studioRuntimeEntriesCacheKey = cacheKey;
  }
  return sorted;
}

function resolveTimelineRuntimeEntryAtMs(session = null, currentMs = 0, runtimeEntries = null) {
  const activeSession = session || getActiveSession();
  const entries = Array.isArray(runtimeEntries) ? runtimeEntries : buildTimelineRuntimeEntries(activeSession);
  const targetMs = Math.max(0, Number(currentMs || 0) || 0);
  return entries
    .filter((entry) => targetMs >= Number(entry?.startMs || 0) && targetMs < Number(entry?.endMs || 0))
    .sort((a, b) => Number(b?.startMs || 0) - Number(a?.startMs || 0) || Number(b?.zIndex || 0) - Number(a?.zIndex || 0))[0] || null;
}

function resolveTimelineRuntimeEntriesAtMs(session = null, currentMs = 0, runtimeEntries = null, options = {}) {
  const activeSession = session || getActiveSession();
  const entries = Array.isArray(runtimeEntries) ? runtimeEntries : buildTimelineRuntimeEntries(activeSession);
  const targetMs = Math.max(0, Number(currentMs || 0) || 0);
  const videoOnly = options?.videoOnly === true;
  return entries
    .filter((entry) => targetMs >= Number(entry?.startMs || 0) && targetMs < Number(entry?.endMs || 0))
    .filter((entry) => !videoOnly || Boolean(String(entry?.videoSrc || "").trim()))
    .sort((a, b) => (
      Number(a?.startMs || 0) - Number(b?.startMs || 0)
      || Number(a?.zIndex || 0) - Number(b?.zIndex || 0)
      || Number(a?.index || 0) - Number(b?.index || 0)
    ));
}

function resolveTimelineRuntimeOverlapPairAtMs(session = null, currentMs = 0, runtimeEntries = null) {
  const activeEntries = resolveTimelineRuntimeEntriesAtMs(session, currentMs, runtimeEntries, { videoOnly: true });
  if (activeEntries.length < 2) {
    return {
      activeEntries,
      backEntry: null,
      frontEntry: null,
      overlapStartMs: 0,
      overlapEndMs: 0,
      overlapDurationMs: 0,
      progress: 1,
      isOverlapActive: false
    };
  }
  const backEntry = activeEntries[activeEntries.length - 2] || null;
  const frontEntry = activeEntries[activeEntries.length - 1] || null;
  const overlapStartMs = Math.max(
    0,
    Number(backEntry?.startMs || 0),
    Number(frontEntry?.startMs || 0)
  );
  const overlapEndMs = Math.min(
    Math.max(overlapStartMs, Number(backEntry?.endMs || overlapStartMs)),
    Math.max(overlapStartMs, Number(frontEntry?.endMs || overlapStartMs))
  );
  const overlapDurationMs = Math.max(0, overlapEndMs - overlapStartMs);
  const progress = overlapDurationMs > 0
    ? Math.max(0, Math.min(1, (Math.max(0, Number(currentMs || 0)) - overlapStartMs) / overlapDurationMs))
    : 1;
  return {
    activeEntries,
    backEntry,
    frontEntry,
    overlapStartMs,
    overlapEndMs,
    overlapDurationMs,
    progress,
    isOverlapActive: overlapDurationMs >= 20
  };
}

function getTimelineViewMode(session = null) {
  const activeSession = session || getActiveSession();
  const cfg = getPodcastVideoConfig(activeSession);
  const uiMode = String(activeSession?.podcastStudioUiState?.timelineViewMode || "").trim().toLowerCase();
  if (uiMode === "tracks" || uiMode === "normal") return uiMode;
  return String(cfg.timelineViewMode || "tracks").trim().toLowerCase() === "normal" ? "normal" : "tracks";
}

function resolveEffectiveNativeVeoVolumePct(session = null) {
  const cfg = getPodcastVideoConfig(session || getActiveSession());
  const clip = Math.max(0, Math.min(100, toFiniteNumber(cfg.clipVolume, 100)));
  if (clip > 0) return clip;
  const master = Math.max(0, Math.min(100, toFiniteNumber(cfg.masterVolume, 100)));
  if (master > 0) return master;
  return 100;
}

function resolveTimelineClipMix(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const cfg = getPodcastVideoConfig(activeSession);
  ensureMontageDefaultVolumesPersisted(activeSession);
  const key = String(rowId || "").trim();
  const clip = key ? ensureTimelineClipsByRowId(activeSession, { persist: false })[key] : null;
  const dialogueTrack = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  const masterPct = Math.max(0, Math.min(100, toFiniteNumber(cfg.masterVolume, 100)));
  const fallbackVeoPct = Math.max(
    0,
    Math.min(100, toFiniteNumber(cfg.montageDefaultVeoVolumePct, resolveEffectiveNativeVeoVolumePct(activeSession)))
  );
  const fallbackGeminiPct = Math.max(
    0,
    Math.min(100, toFiniteNumber(dialogueTrack?.volumePct, toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100)))
  );
  const veoOverride = toFiniteNumber(clip?.veoVolumeOverridePct, Number.NaN);
  const geminiOverride = toFiniteNumber(clip?.geminiVolumeOverridePct, Number.NaN);
  let veoPct = Number.isFinite(veoOverride) ? Math.max(0, Math.min(100, Math.round(veoOverride))) : fallbackVeoPct;
  const hasGeminiSegment = (dialogueTrack.enabled !== false) && (dialogueTrack.segments || []).some(s => String(s.rowId || "").trim() === key);

  if (hasGeminiSegment && !Number.isFinite(veoOverride)) {
    veoPct = 0;
  }

  let geminiPct = Number.isFinite(geminiOverride) ? Math.max(0, Math.min(100, Math.round(geminiOverride))) : fallbackGeminiPct;
  if (isPodcastMode(activeSession)) {
    geminiPct = 100;
  }
  const backgroundOverride = cfg?.timelineSceneAudioMixByRowId?.[key]?.backgroundMusicVolumePct;
  const backgroundPct = Number.isFinite(backgroundOverride) ? Math.max(0, Math.min(200, Math.round(backgroundOverride))) : 100;

  return {
    masterPct,
    veoPct,
    geminiPct,
    backgroundPct,
    videoVolume: Math.max(0, Math.min(1, veoPct / 100)),
    voiceVolume: Math.max(0, Math.min(1, geminiPct / 100)),
    backgroundVolume: Math.max(0, Math.min(2, backgroundPct / 100))
  };
}

function resolveTimelineClipVoiceVolume(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const cfg = getPodcastVideoConfig(activeSession);
  ensureMontageDefaultVolumesPersisted(activeSession);
  const key = String(rowId || "").trim();
  const clip = key ? ensureTimelineClipsByRowId(activeSession, { persist: false })[key] : null;
  const dialogueTrack = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  const override = toFiniteNumber(clip?.geminiVolumeOverridePct, Number.NaN);
  const pct = Number.isFinite(override)
    ? Math.max(0, Math.min(100, Math.round(override)))
    : Math.max(0, Math.min(100, toFiniteNumber(dialogueTrack?.volumePct, toFiniteNumber(cfg.montageDefaultGeminiVolumePct, toFiniteNumber(cfg.masterVolume, 100)))));
  const masterFactor = Math.max(0, Math.min(1, toFiniteNumber(cfg.masterVolume, 100) / 100));
  return Math.max(0, Math.min(1, (pct / 100) * masterFactor));
}

function getTimelineClipRestoreTarget(clip = null) {
  const minMs = STUDIO_TIMELINE_MIN_CLIP_MS;
  const hardMaxMs = Math.max(minMs, Math.round(VIDEO_SCENE_MAX_SEC * 1000));
  const sourceDurationMs = Math.max(
    minMs,
    Math.min(
      hardMaxMs,
      Math.round(toFiniteNumber(clip?.sourceDurationMs, 0)) || Math.round(VIDEO_SCENE_MAX_SEC * 1000)
    )
  );
  const restoreTrimInMs = 0;
  const restoreTrimOutMs = Math.max(minMs, Math.min(sourceDurationMs, hardMaxMs));
  const currentTrimInMs = Math.max(0, Math.round(toFiniteNumber(clip?.trimInMs, 0)));
  const currentTrimOutMs = Math.max(
    currentTrimInMs + minMs,
    Math.round(toFiniteNumber(clip?.trimOutMs, currentTrimInMs + minMs))
  );
  const hasCuts = currentTrimInMs !== restoreTrimInMs || currentTrimOutMs !== restoreTrimOutMs;
  return {
    restoreTrimInMs,
    restoreTrimOutMs,
    sourceDurationMs,
    hasCuts
  };
}

function getTimelineSceneVideoGenerationStatus(session = null, rowId = "") {
  const generationApi = requirePodcasterGenerationApi();
  const generationKey = generationApi.buildTimelineSceneGenerationKey(session, rowId);
  return generationKey ? (generationApi.timelineSceneVideoGenerationStatus.get(generationKey) || null) : null;
}

function resolveTimelineSequenceStartIndex(entries = [], startMs = 0) {
  const list = Array.isArray(entries) ? entries : [];
  const cursorMs = Math.max(0, Number(startMs || 0));
  const activeIndex = list.findIndex((entry) => cursorMs >= entry.startMs && cursorMs < entry.endMs);
  if (activeIndex >= 0) return activeIndex;
  const nextIndex = list.findIndex((entry) => Number(entry.startMs || 0) >= cursorMs);
  return nextIndex >= 0 ? nextIndex : Math.max(0, list.length - 1);
}

function getReorderableTimelineTrackIds(session = null) {
  const activeSession = session || getActiveSession();
  const tracks = ensureTimelineTracks(activeSession, { persist: false });
  const clips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  return tracks
    .map((track) => String(track?.id || "").trim())
    .filter(Boolean)
    .filter((trackId) => Object.values(clips).some((clip) => String(clip?.trackId || "").trim() === trackId));
}

function canReorderTimelineLayout(session = null) {
  const activeSession = session || getActiveSession();
  const rowCount = Array.isArray(activeSession?.script?.rows) ? activeSession.script.rows.length : 0;
  return rowCount >= 2;
}

function preserveGeminiDialogueOffsetsForReorderedTimeline(beforeSession = null) {
  const afterSession = getActiveSession();
  const sessionBefore = beforeSession || afterSession;
  if (!afterSession || !sessionBefore) return false;
  const beforeCfg = getPodcastVideoConfig(sessionBefore);
  const afterCfg = getPodcastVideoConfig(afterSession);
  const beforeTrack = normalizeGeminiDialogueTrack(beforeCfg?.geminiDialogueTrack || {});
  const afterTrack = normalizeGeminiDialogueTrack(afterCfg?.geminiDialogueTrack || {});
  if (!beforeTrack.enabled || !beforeTrack.segments.length) return false;
  if (!afterTrack.enabled || !afterTrack.segments.length) return false;
  const beforeClips = ensureTimelineClipsByRowId(sessionBefore, { persist: false });
  const afterClips = ensureTimelineClipsByRowId(afterSession, { persist: false });
  const offsetByRowId = new Map(beforeTrack.segments.map((segment) => {
    const rowId = String(segment?.rowId || "").trim();
    const clip = beforeClips[rowId];
    if (!rowId || !clip || !segment.enabled) return null;
    const offsetMs = Math.round(Number(segment.startMs || 0) - Number(clip.startMs || 0));
    return [rowId, offsetMs];
  }).filter(Boolean));
  let changed = false;
  const nextSegments = afterTrack.segments.map((segment) => {
    const rowId = String(segment?.rowId || "").trim();
    const clip = afterClips[rowId];
    if (!rowId || !clip) return segment;
    const offsetMs = offsetByRowId.get(rowId);
    if (offsetMs == null) return segment;
    const targetStartMs = Math.max(0, Math.round(Number(clip.startMs || 0) + offsetMs));
    if (Math.round(segment.startMs || 0) === targetStartMs) return segment;
    changed = true;
    return {
      ...segment,
      startMs: targetStartMs,
      anchorStartMs: targetStartMs
    };
  });
  if (changed) {
    upsertPodcastVideoConfig((base) => ({
      ...base,
      geminiDialogueTrack: {
        ...afterTrack,
        segments: nextSegments,
        updatedAt: window.nowIso ? window.nowIso() : new Date().toISOString()
      }
    }));
  }
  return changed;
}

function ensureMontageDefaultVolumesPersisted(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const rawCfg = activeSession?.podcastVideoConfig && typeof activeSession.podcastVideoConfig === "object"
    ? activeSession.podcastVideoConfig
    : {};
  const hasVeo = Object.prototype.hasOwnProperty.call(rawCfg, "montageDefaultVeoVolumePct");
  const hasGemini = Object.prototype.hasOwnProperty.call(rawCfg, "montageDefaultGeminiVolumePct");
  if (hasVeo && hasGemini) return false;
  const cfg = getPodcastVideoConfig(activeSession);
  const audioMode = String(cfg.audioMode || "gemini-live-per-scene").trim().toLowerCase();
  const fallbackVeo = audioMode === "veo-native-audio"
    ? Math.max(0, Math.min(100, Math.round(toFiniteNumber(cfg.clipVolume, 100))))
    : 0;
  const fallbackGemini = Math.max(0, Math.min(100, Math.round(toFiniteNumber(cfg.masterVolume, 100))));
  upsertPodcastVideoConfig((base) => ({
    ...base,
    montageDefaultVeoVolumePct: hasVeo ? base.montageDefaultVeoVolumePct : fallbackVeo,
    montageDefaultGeminiVolumePct: hasGemini ? base.montageDefaultGeminiVolumePct : fallbackGemini
  }));
  return true;
}

// === WINDOW BINDINGS (Export to runtime) ===
Object.assign(window, {
  normalizeTransitionsByEdge,
  normalizeTimelineClipVisualLayoutMode,
  normalizeTimelineClipMediaScale,
  normalizeTimelineClipMediaOffset,
  normalizeTimelineClipMediaMotionPreset,
  normalizeTimelineClipItem,
  normalizeTimelineClipsByRowId,
  normalizeOverlayCardItem,
  normalizeOverlayCardsById,
  normalizeOnScreenTextClipItem,
  normalizeOnScreenTextClipsByRowId,
  normalizeGeminiDialogueTrackSegment,
  normalizeGeminiDialogueTrack,
  normalizeTimelineTrackItem,
  normalizeTimelineTracks,
  hasExplicitMultiTrackTimeline,
  resolveTimelineDefaultTrackIdForSpeaker,
  isNarradorSceneTrackId,
  getNarradorSceneTrackOrdinal,
  buildNarradorSceneTrackLabel,
  isEducationalVisibleSceneTrack,
  isSceneTimelineTrackId,
  buildEducationalSceneTrackIdRemap,
  buildTimelineVariantTrackDescriptor,
  normalizePodcastVideoConfig,
  getRowSourceDurationMs,
  buildDefaultTimelineClipsByRowId,
  ensureTimelineTracks,
  ensureTimelineClipsByRowId,
  getTimelineClipStoreByKind,
  reflowTimelineClipsByScriptOrder,
  compactTimelineTrackClipsFromRow,
  shouldAutoRepairTimelineLayout,
  getTimelineClipEffectiveDurationMs,
  getTimelineClipEndMs,
  getTimelineTotalDurationMs,
  snapTimelineMs,
  getStudioTimelineZoom,
  getStudioTimelinePixelsPerSec,
  getStudioTimelineMinClipPx,
  getStudioAudioTrackMinLoopPx,
  timelineMsToPx,
  timelinePxToMs,
  resolveTimelineDragStepMs,
  snapTimelineMsWithStep,
  buildTimelineRuntimeEntries,
  resolveTimelineRuntimeEntryAtMs,
  resolveTimelineRuntimeEntriesAtMs,
  resolveTimelineRuntimeOverlapPairAtMs,
  getSceneEffectiveDurationMs,
  resolveSceneSourceStateAtTimelineMs,
  formatTrackHeadPlayheadTime,
  getTimelineViewMode,
  resolveTimelineClipMix,
  resolveTimelineClipVoiceVolume,
  getTimelineClipRestoreTarget,
  getTimelineSceneVideoGenerationStatus,
  resolveTimelineSequenceStartIndex,
  getReorderableTimelineTrackIds,
  canReorderTimelineLayout,
  preserveGeminiDialogueOffsetsForReorderedTimeline,
  ensureMontageDefaultVolumesPersisted
});
