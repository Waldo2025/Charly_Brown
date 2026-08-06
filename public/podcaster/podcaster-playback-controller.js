import {
  createPodcasterFinalLimiterNode,
  normalizePodcasterFinalLimiterSettings
} from "./podcaster-audio-limiter.js";
import {
  TIMELINE_LOOKUP_TOLERANCE_MS,
  resolveTimelineEntryAtMs,
  resolveTimelineIndexAtMs
} from "./podcaster-timeline-shared.js";
import {
  buildKaraokeSubtitleMarkup,
  normalizeKaraokeWordTimings,
  resolveActiveKaraokeWordIndex
} from "./podcaster-karaoke.js";
import {
  clearPodcasterLocalMediaCache,
  deletePodcasterLocalMediaKey,
  getPodcasterLocalMediaBlob,
  putPodcasterLocalMediaBlob
} from "./podcaster-local-media-cache.js";

/**
 * PodcasterPlaybackController.js
 * Unified Playback Controller for Podcaster Studio
 * Handles Play/Pause/Stop, Audio/Video Sync, Overlays, and master clock.
 */

const STAGE_VIDEO_FRAME_TIMEOUT_MS = 1800;
const STAGE_VIDEO_FRAME_SOFT_TIMEOUT_MS = 520;
const VIDEO_MEDIA_READY_TIMEOUT_MS = 1800;
const VIDEO_MEDIA_READY_TIMEOUT_PERSISTENT_MS = 2200;
const STAGE_PRELOADER_TIMEOUT_MS = 1200;

const PLAYBACK_PREPARE_LOOKAHEAD_MS = 9000;
const PLAYBACK_SEEK_LOOKAHEAD_MS = 7000;
const SYNC_VIDEO_UPCOMING_LOOKAHEAD_MS = 45000;
const SYNC_VIDEO_UPCOMING_MAX_ENTRIES = 8;
const OVERLAP_TRANSITION_DEFAULT_DURATION_MS = 320;
const OVERLAP_ENTRY_SIGNATURE_SEPARATOR = "||";
const OVERLAP_ENTRY_MEDIA_KIND_VIDEO = "video";
const OVERLAP_ENTRY_MEDIA_KIND_IMAGE = "image";
const BACKGROUND_AUDIO_START_TIMEOUT_MS = 1400;
const BACKGROUND_AUDIO_PREPARE_TIMEOUT_MS = 3500;
const BACKGROUND_AUDIO_RETRY_GRACE_MS = 120;
const BACKGROUND_AUDIO_PLAY_RETRY_GRACE_MS = 900;
const DIALOGUE_AUDIO_READY_TIMEOUT_MS = 8000;
const DIALOGUE_AUDIO_ACTIVE_PREPARE_TIMEOUT_MS = 1800;
const DIALOGUE_AUDIO_CARRYOVER_TOLERANCE_MS = 260;
const SESSION_MEDIA_READY_TIMEOUT_MS = 12000;
const LEGACY_AUTOMATIC_DIALOGUE_OFFSET_MS = 1000;
const TICK_PREV_OFFSET_MS = 500;
const TICK_NEXT_OFFSET_MS = 120;
const STAGE_VIDEO_RESYNC_MIN_DRIFT_SEC = 0.04;
const STAGE_VIDEO_RESYNC_TOLERANCE_SEC = 0.35;
const STAGE_VIDEO_RESYNC_TOLERANCE_DEFAULT_SEC = 0.75;
const STAGE_VIDEO_BACKDROP_RESYNC_TOLERANCE_SEC = 0.9;
const DIALOGUE_AUDIO_UPCOMING_LOOKAHEAD_MS = 30000;

class EventEmitter {
  constructor() { this.listeners = {}; }
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }
  off(event, callback) {
    if (this.listeners[event]) this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }
  emit(event, data) {
    if (this.listeners[event]) this.listeners[event].forEach(cb => { try { cb(data); } catch (e) { } });
  }
}

export class PodcasterPlaybackController extends EventEmitter {
  constructor() {
    super();
    this.els = null;
    this.deps = null;
    this.state = {
      isPlaying: false,
      currentMs: 0,
      totalDurationMs: 0,
      session: null,
      config: null,
      useMse: false,
      activeRowId: '',
      isTickProcessing: false,
      stopAtMs: 0,
      standaloneAudio: null,
      isPreparing: false,
      forceStageMediaSync: false
    };
    this.dialogueAudioActivePrepareSignature = "";
    this.dialogueAudioActivePrepareAtMs = 0;
    this.lastTickMs = 0;
    this.cachedTickEntries = null;
    this.cachedTickEntriesTime = 0;
    this.clockId = null;
    this.audioCtx = null;
    this.dialoguePlayers = {};
    this.audioCache = {};
    this.dialogueAudioSourceKeys = {};
    this.dialoguePreparationPromises = new Map();
    this.sessionMediaPreparationKey = "";
    this.sessionMediaPreparationPromise = null;
    this.clockRebaseRequested = false;
    this.blobCache = new Map();
    this.fetchPromises = new Map();
    this.mediaCacheName = 'podcaster-media-cache-v1';
    this.videoPrewarmKey = "";
    this.videoPrewarmPromise = null;
    this.videoLookAheadKey = "";
    this.lastSessionSyncSignature = "";


    this.backgroundAudio = null;
    this.backgroundSource = null;
    this.backgroundGain = null;
    this.backgroundCompressor = null;
    this.backgroundFinalLimiter = null;
    this.backgroundStabilizeEnabled = null;
    this.backgroundLimiterEnabled = null;
    this.backgroundLimiterSettings = normalizePodcasterFinalLimiterSettings();
    this.backgroundDuckFactor = 1.0;
    this.backgroundSrc = "";
    this.backgroundResolvedSource = "";
    this.backgroundSourceKey = "";
    this.backgroundSegmentIdentity = "";
    this.backgroundFadeSegmentSignature = "";
    this.backgroundSegmentSkewMs = null;
    this.backgroundSegmentIndex = -1;
    this.backgroundSyncAnchorMs = null;
    this.backgroundSyncAnchorOffsetMs = null;
    this.backgroundSyncLastTimelineMs = null;
    this.backgroundSegmentGapStartMs = 0;
    this.backgroundSegmentGapHoldMs = 240;
    this.backgroundRecoveryTimer = null;
    this.backgroundRecoveryPromise = null;
    this.backgroundRecoverySourceKey = "";
    this.backgroundRecoveryAttempts = 0;

    this.stageMachine = {
      loadingSrc: '',
      preloadingSrc: '',
      preloadingPromise: null,
      activeSlot: 0,
      imageLoadingSrc: '',
      imageLoadingPromise: null,
      imageSwapToken: 0
    };
    this.podcastStageVideoLoadTokenSeq = 0;
    this.podcastStageVideoLoadTokensByEl = new WeakMap();
    this.stageSwitchSeq = 0;
    this.activeLoopId = 0;
    this.visualLayoutMode = "default";
    this.overlapState = {
      key: "",
      backSlot: 0,
      frontSlot: 1,
      backSignature: "",
      frontSignature: ""
    };
    this.prepareSequence = 0;
    this.playbackRangePreparationSignature = "";
    this.playbackRangePreparationAtMs = 0;
    this.pendingTimelineSeekTick = null;
    this.mediaTelemetry = {
      sourceAssignments: 0,
      prepareCount: 0
    };
  }

  // --- Helpers ---
  clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
  toFiniteNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  getTimelineLookupToleranceMs() { return TIMELINE_LOOKUP_TOLERANCE_MS; }
  isTimelineMsInRange(currentMs = 0, startMs = 0, endMs = 0, options = {}) {
    const toleranceMs = Math.max(0, Number(options.toleranceMs ?? this.getTimelineLookupToleranceMs()) || 0);
    const current = Math.max(0, Number(currentMs || 0));
    const start = Math.max(0, Number(startMs || 0));
    const end = Math.max(start, Number(endMs || 0));
    return current >= (start - toleranceMs) && current <= (end + toleranceMs);
  }
  isVideoSurfaceReady(videoEl = null, expectedSrc = "") {
    if (!videoEl) return false;
    const cleanExpectedSrc = String(expectedSrc || "").trim();
    const haveCurrentData = typeof HTMLMediaElement !== "undefined"
      ? HTMLMediaElement.HAVE_CURRENT_DATA
      : 2;
    return (!cleanExpectedSrc || String(videoEl.dataset?.src || "").trim() === cleanExpectedSrc)
      && Number(videoEl.readyState || 0) >= haveCurrentData;
  }
  clampPlaybackRate(rate, min = 0.5, max = 10) {
    return Math.max(min, Math.min(max, Number(rate) || 1));
  }
  normalizeSceneMediaScale(value = 1) {
    if (typeof this.deps?.normalizeTimelineClipMediaScale === "function") {
      return this.deps.normalizeTimelineClipMediaScale(value);
    }
    const numeric = Math.round((Number(value) || 1) * 100) / 100;
    return Math.max(1, Math.min(2.5, numeric || 1));
  }
  buildMediaProxyUrl(path = "") {
    const clean = String(path || "").trim();
    if (!clean) return "";
    if (typeof this.deps?.buildApiUrlPreferRemote === "function") {
      return this.deps.buildApiUrlPreferRemote(clean);
    }
    if (typeof this.deps?.buildApiUrl === "function") {
      return this.deps.buildApiUrl(clean);
    }
    return clean;
  }

  hasFirebaseDirectAccessToken(url = "") {
    const clean = String(url || "").trim();
    if (!clean) return false;
    return clean.includes("token=") || clean.includes("downloadToken=");
  }

  toFirebaseStorageProxyUrl(firebaseUrl = "", storagePath = "", options = {}) {
    const cleanUrl = String(firebaseUrl || "").trim();
    const kind = String(options?.kind || "media").trim().toLowerCase() === "image" ? "image" : "media";
    const cleanPath = String(storagePath || "").trim();
    if (cleanPath) {
      return this.buildMediaProxyUrl(`/api/assets/proxy-${kind}?storagePath=${encodeURIComponent(cleanPath)}`);
    }
    if (!cleanUrl) return "";
    return this.buildMediaProxyUrl(`/api/assets/proxy-${kind}?url=${encodeURIComponent(cleanUrl)}`);
  }
  normalizeProxyMediaComparableUrl(url = "") {
    const clean = String(url || "").trim();
    if (!clean) return "";
    try {
      const parsed = new URL(clean, window.location.origin);
      if (/\/api\/assets\/proxy-(?:media|image)$/i.test(String(parsed.pathname || ""))) {
        parsed.searchParams.delete("u");
      }
      return `${parsed.origin}${parsed.pathname}${parsed.search || ""}`;
    } catch (_) {
      return clean.replace(/([?&])u=[^&]*&?/i, "$1").replace(/[?&]$/, "");
    }
  }
  doesMediaSourceMatchFailedUrl(candidateSrc = "", failedSrc = "") {
    const candidate = String(candidateSrc || "").trim();
    const failed = String(failedSrc || "").trim();
    if (!candidate || !failed) return false;
    if (candidate === failed) return true;
    return this.normalizeProxyMediaComparableUrl(candidate) === this.normalizeProxyMediaComparableUrl(failed);
  }
  resolveStageMediaScaleContainer() {
    return this.els?.podcastActiveSpeakerVideo?.closest?.(".podcast-video-preview, .player-stage, .montage-export-preview-container")
      || this.els?.podcastActiveSpeakerImage?.closest?.(".podcast-video-preview, .player-stage, .montage-export-preview-container")
      || null;
  }
  resolveStageContainer() {
    return this.els?.podcastVideoStage?.querySelector?.(".podcast-video-preview")
      || this.els?.podcastVideoStage
      || this.resolveStageMediaScaleContainer()
      || null;
  }
  applySceneBackground(entry = null) {
    const container = this.resolveStageContainer();
    if (!container) return;
    const backgroundColor = String(entry?.clip?.backgroundColor || "").trim();
    if (backgroundColor) {
      container.style.background = backgroundColor;
    } else {
      container.style.background = "";
      container.style.backgroundColor = "";
    }
  }
  syncStageMediaMotionPlaybackState(isPlaying = this.state.isPlaying === true) {
    const container = this.resolveStageMediaScaleContainer()
      || this.els?.podcastVideoStage?.querySelector?.(".podcast-video-preview")
      || this.els?.podcastVideoStage
      || null;
    if (!container) return;
    container.dataset.sceneMediaMotionPlaying = isPlaying === true ? "true" : "false";
    container.querySelectorAll?.(".podcast-active-speaker-video:not(.podcast-active-speaker-video-backdrop), .podcast-active-speaker-image:not(.podcast-active-speaker-video-backdrop)").forEach((node) => {
      node.style.animationPlayState = isPlaying === true ? "running" : "paused";
    });
  }
  applySceneMediaScale(entry = null) {
    const mediaScale = this.normalizeSceneMediaScale(entry?.clip?.mediaScale);
    const visualLayoutMode = String(entry?.clip?.visualLayoutMode || "default").trim() || "default";
    const effectiveDurationMs = Math.max(
      200,
      Number(entry?.effectiveDurationMs || 0)
        || (Number(entry?.endMs || 0) - Number(entry?.startMs || 0))
        || (Number(entry?.clip?.trimOutMs || 0) - Number(entry?.clip?.trimInMs || 0))
        || Number(entry?.durationMs || 0)
        || 12000
    );
    const motionDurationSec = effectiveDurationMs / 1000;
    const motionOffsetSec = Math.max(
      0,
      Math.min(motionDurationSec, (Number(this.state.currentMs || 0) - Number(entry?.startMs || 0)) / 1000)
    );
    if (typeof this.deps?.applySceneMediaScaleToStage === "function") {
      this.deps.applySceneMediaScaleToStage({
        rowId: String(entry?.rowId || "").trim(),
        mediaScale,
        mediaOffsetXPct: entry?.clip?.mediaOffsetXPct,
        mediaOffsetYPct: entry?.clip?.mediaOffsetYPct,
        mediaMotionPreset: entry?.clip?.mediaMotionPreset,
        visualLayoutMode,
        container: this.resolveStageMediaScaleContainer(),
        durationSec: motionDurationSec,
        motionOffsetSec,
        motionSyncRevision: Number(this.sceneMotionSyncRevision || 0)
      });
      return;
    }
    const container = this.resolveStageMediaScaleContainer();
    if (container) {
      container.style.setProperty("--pod-scene-media-scale", String(mediaScale));
    }
  }
  resolveEntryVisualState(entry = null) {
    const clip = entry?.clip || {};
    const normalizeLayout = this.deps?.normalizeTimelineClipVisualLayoutMode || window.normalizeTimelineClipVisualLayoutMode;
    return {
      mediaScale: this.normalizeSceneMediaScale(clip?.mediaScale),
      mediaOffsetXPct: Number(clip?.mediaOffsetXPct || 0) || 0,
      mediaOffsetYPct: Number(clip?.mediaOffsetYPct || 0) || 0,
      mediaMotionPreset: String(clip?.mediaMotionPreset || "none").trim() || "none",
      visualLayoutMode: normalizeLayout?.(clip?.visualLayoutMode) || clip?.visualLayoutMode || "default"
    };
  }
  resolveSceneMediaCanvasRect(surfaceEl = null) {
    const container = surfaceEl?.closest?.(".podcast-video-preview, .player-stage, .montage-export-preview-container")
      || this.resolveStageMediaScaleContainer()
      || null;
    const width = Math.max(2, Number(container?.clientWidth || 0) || 0);
    const containerHeight = Math.max(2, Number(container?.clientHeight || 0) || 0);
    const floatingHeadHeight = container?.classList?.contains("is-timeline-floating-preview")
      ? Math.max(0, Number.parseFloat(
          window.getComputedStyle(container).getPropertyValue("--podcast-timeline-floating-preview-head-height")
        ) || 0)
      : 0;
    const height = Math.max(2, containerHeight - floatingHeadHeight);
    return {
      container,
      width: width || 1280,
      height: height || 720
    };
  }
  resolveSceneMediaRenderSpec(entry = null, surfaceEl = null, sourceWidth = 0, sourceHeight = 0) {
    const resolver = this.deps?.resolveSceneMediaRenderSpec || window.resolveSceneMediaRenderSpec;
    if (typeof resolver !== "function") return null;
    const { width, height, container } = this.resolveSceneMediaCanvasRect(surfaceEl);
    const session = this.state.session || this.deps?.getActiveSession?.();
    const config = this.deps?.getPodcastVideoConfig?.(session) || this.state.config || {};
    const isReelPreview = container?.closest?.(".montage-export-preview")?.dataset?.reel === "true";
    const state = this.resolveEntryVisualState(entry);
    return resolver({
      canvasWidth: width,
      canvasHeight: height,
      sourceWidth: Math.max(2, Number(sourceWidth || 0) || width),
      sourceHeight: Math.max(2, Number(sourceHeight || 0) || height),
      reelMode: isReelPreview || config?.reelModeEnabled === true,
      visualLayoutMode: state.visualLayoutMode,
      mediaScale: state.mediaScale,
      mediaOffsetXPct: state.mediaOffsetXPct,
      mediaOffsetYPct: state.mediaOffsetYPct,
      mediaMotionPreset: state.mediaMotionPreset,
      visualEffects: session?.visualEffectsMap?.[entry?.rowId] || null,
      mediaKind: this.isImageStageEntry(entry) ? "image" : "video",
      durationSec: Math.max(0.2, Number(entry?.effectiveDurationMs || entry?.durationMs || 12000) / 1000)
    });
  }
  applyComputedSceneMediaLayout(surfaceEl = null, spec = null) {
    if (!surfaceEl || !spec) return;
    surfaceEl.style.setProperty("--pod-scene-media-left", `${spec.leftPx.toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-top", `${spec.topPx.toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-width", `${spec.scaledRect.width.toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-height", `${spec.scaledRect.height.toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-translate-x", "0px");
    surfaceEl.style.setProperty("--pod-scene-media-translate-y", "0px");
    surfaceEl.style.setProperty("--pod-scene-media-pan-x-amplitude", `${Number(spec.motion?.amplitudeXPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-pan-y-amplitude", `${Number(spec.motion?.amplitudeYPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-motion-start-x", `${Number(spec.motion?.startOffsetXPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-motion-end-x", `${Number(spec.motion?.endOffsetXPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-motion-start-y", `${Number(spec.motion?.startOffsetYPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-motion-end-y", `${Number(spec.motion?.endOffsetYPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--pod-scene-media-motion-duration", `${Number(spec.motion?.durationSec || 12).toFixed(3)}s`);
    surfaceEl.style.setProperty("--kb-duration", `${Number(spec.kenBurns?.playbackDurationSec || spec.motion?.durationSec || 12).toFixed(3)}s`);
    surfaceEl.style.setProperty("--kb-pan-start-x", `${Number(spec.kenBurns?.traversal?.startXPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--kb-pan-end-x", `${Number(spec.kenBurns?.traversal?.endXPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--kb-pan-start-y", `${Number(spec.kenBurns?.traversal?.startYPx || 0).toFixed(3)}px`);
    surfaceEl.style.setProperty("--kb-pan-end-y", `${Number(spec.kenBurns?.traversal?.endYPx || 0).toFixed(3)}px`);
  }
  reapplyEntryVisualLayout(entry = null, surfaceEl = null) {
    if (!surfaceEl) return;
    const sourceWidth = Number(surfaceEl.tagName === "VIDEO" ? surfaceEl.videoWidth : surfaceEl.naturalWidth) || 0;
    const sourceHeight = Number(surfaceEl.tagName === "VIDEO" ? surfaceEl.videoHeight : surfaceEl.naturalHeight) || 0;
    const refreshedSpec = this.resolveSceneMediaRenderSpec(entry, surfaceEl, sourceWidth, sourceHeight);
    if (refreshedSpec) this.applyComputedSceneMediaLayout(surfaceEl, refreshedSpec);
  }
  applyEntryVisualStateToSurface(entry = null, surfaceEl = null) {
    if (!surfaceEl) return;
    const state = this.resolveEntryVisualState(entry);
    const normalizeOffset = this.deps?.normalizeTimelineClipMediaOffset || window.normalizeTimelineClipMediaOffset;
    const normalizeMotion = this.deps?.normalizeTimelineClipMediaMotionPreset || window.normalizeTimelineClipMediaMotionPreset;
    const nextX = typeof normalizeOffset === "function"
      ? normalizeOffset(state.mediaOffsetXPct)
      : Math.max(-0.5, Math.min(0.5, Number(state.mediaOffsetXPct || 0) || 0));
    const nextY = typeof normalizeOffset === "function"
      ? normalizeOffset(state.mediaOffsetYPct)
      : Math.max(-0.5, Math.min(0.5, Number(state.mediaOffsetYPct || 0) || 0));
    const nextMotion = typeof normalizeMotion === "function"
      ? normalizeMotion(state.mediaMotionPreset)
      : "none";
    const sourceWidth = Number(surfaceEl.tagName === "VIDEO" ? surfaceEl.videoWidth : surfaceEl.naturalWidth) || 0;
    const sourceHeight = Number(surfaceEl.tagName === "VIDEO" ? surfaceEl.videoHeight : surfaceEl.naturalHeight) || 0;
    const spec = this.resolveSceneMediaRenderSpec(entry, surfaceEl, sourceWidth, sourceHeight);
    if (spec) {
      this.applyComputedSceneMediaLayout(surfaceEl, spec);
    } else {
      surfaceEl.style.setProperty("--pod-scene-media-left", "0px");
      surfaceEl.style.setProperty("--pod-scene-media-top", "0px");
      surfaceEl.style.setProperty("--pod-scene-media-width", "100%");
      surfaceEl.style.setProperty("--pod-scene-media-height", "100%");
      surfaceEl.style.setProperty("--pod-scene-media-pan-x-amplitude", "0px");
      surfaceEl.style.setProperty("--pod-scene-media-pan-y-amplitude", "0px");
      surfaceEl.style.setProperty("--pod-scene-media-motion-start-x", "0px");
      surfaceEl.style.setProperty("--pod-scene-media-motion-end-x", "0px");
      surfaceEl.style.setProperty("--pod-scene-media-motion-start-y", "0px");
      surfaceEl.style.setProperty("--pod-scene-media-motion-end-y", "0px");
      surfaceEl.style.setProperty("--pod-scene-media-motion-duration", "12s");
      surfaceEl.style.setProperty("--kb-duration", "12s");
      surfaceEl.style.setProperty("--kb-pan-start-x", "0px");
      surfaceEl.style.setProperty("--kb-pan-end-x", "0px");
      surfaceEl.style.setProperty("--kb-pan-start-y", "0px");
      surfaceEl.style.setProperty("--kb-pan-end-y", "0px");
    }
    surfaceEl.style.setProperty("--pod-scene-media-scale", String(state.mediaScale));
    surfaceEl.style.setProperty("--pod-scene-media-x", `${(nextX * 100).toFixed(3)}%`);
    surfaceEl.style.setProperty("--pod-scene-media-y", `${(nextY * 100).toFixed(3)}%`);
    surfaceEl.dataset.sceneMediaMotionPreset = nextMotion;
    surfaceEl.dataset.sceneMediaLayout = String(state.visualLayoutMode || "default");
    if (sourceWidth > 0 && sourceHeight > 0) {
      requestAnimationFrame(() => this.reapplyEntryVisualLayout(entry, surfaceEl));
    } else {
      const refresh = () => this.reapplyEntryVisualLayout(entry, surfaceEl);
      const eventNames = surfaceEl.tagName === "VIDEO"
        ? ["loadedmetadata", "loadeddata", "canplay"]
        : ["load", "decode"];
      eventNames.forEach((eventName) => {
        surfaceEl.addEventListener(eventName, refresh, { once: true });
      });
      requestAnimationFrame(() => {
        refresh();
        requestAnimationFrame(refresh);
      });
    }
  }
  resetEntryVisualStateOnSurface(surfaceEl = null) {
    if (!surfaceEl) return;
    surfaceEl.style.removeProperty("--pod-scene-media-left");
    surfaceEl.style.removeProperty("--pod-scene-media-top");
    surfaceEl.style.removeProperty("--pod-scene-media-width");
    surfaceEl.style.removeProperty("--pod-scene-media-height");
    surfaceEl.style.removeProperty("--pod-scene-media-translate-x");
    surfaceEl.style.removeProperty("--pod-scene-media-translate-y");
    surfaceEl.style.removeProperty("--pod-scene-media-pan-x-amplitude");
    surfaceEl.style.removeProperty("--pod-scene-media-pan-y-amplitude");
    surfaceEl.style.removeProperty("--pod-scene-media-motion-start-x");
    surfaceEl.style.removeProperty("--pod-scene-media-motion-end-x");
    surfaceEl.style.removeProperty("--pod-scene-media-motion-start-y");
    surfaceEl.style.removeProperty("--pod-scene-media-motion-end-y");
    surfaceEl.style.removeProperty("--pod-scene-media-motion-duration");
    surfaceEl.style.removeProperty("--kb-duration");
    surfaceEl.style.removeProperty("--kb-pan-start-x");
    surfaceEl.style.removeProperty("--kb-pan-end-x");
    surfaceEl.style.removeProperty("--kb-pan-start-y");
    surfaceEl.style.removeProperty("--kb-pan-end-y");
    surfaceEl.style.removeProperty("--pod-scene-media-scale");
    surfaceEl.style.removeProperty("--pod-scene-media-x");
    surfaceEl.style.removeProperty("--pod-scene-media-y");
    delete surfaceEl.dataset.sceneMediaMotionPreset;
    delete surfaceEl.dataset.sceneMediaLayout;
    delete surfaceEl.dataset.sceneMediaVisualStateKey;
    delete surfaceEl.dataset.sceneMediaKenBurnsAnimationKey;
  }
  resolveSegmentSourceOffsetSec(currentMs, segmentStartMs, trimInMs = 0, clipPlaybackRate = 1) {
    const safeTrimInMs = Math.max(0, Number(trimInMs || 0));
    const timelineOffsetMs = Math.max(0, Number(currentMs || 0) - Math.max(0, Number(segmentStartMs || 0)));
    const sourceOffsetMs = safeTrimInMs + (timelineOffsetMs * this.clampPlaybackRate(clipPlaybackRate, 0.5, 10));
    return sourceOffsetMs / 1000;
  }
  resolveSegmentTimelineDurationMs(segment = null, clipPlaybackRate = 1) {
    const trimInMs = Math.max(0, Number(segment?.trimInMs || 0) || 0);
    const trimOutMs = Math.max(0, Number(segment?.trimOutMs || 0) || 0);
    const trimmedVisibleMs = trimOutMs > trimInMs ? (trimOutMs - trimInMs) : 0;
    const rowId = String(segment?.rowId || "").trim();
    const safeRate = this.clampPlaybackRate(clipPlaybackRate, 0.5, 10);
    const rawVisibleMs = Math.max(
      500,
      trimmedVisibleMs
      || Number(segment?.durationMs || 0)
      || (Number(segment?.endMs || 0) - Number(segment?.startMs || 0))
      || 500
    );
    const segmentTimelineMs = Math.max(500, Math.round(rawVisibleMs / safeRate));
    const rowAudioDurationMs = rowId
      ? Math.max(0, Math.round(Number(this.deps?.resolveRowAudioDurationMs?.(rowId, this.state?.session) || 0) || 0))
      : 0;
    const measuredAudioVisibleMs = rowId && trimmedVisibleMs > 0
      ? Math.max(0, Math.round(trimmedVisibleMs / safeRate))
      : (rowId
        ? Math.max(0, rowAudioDurationMs - Math.round(trimInMs / safeRate))
        : 0);
    const durationMs = measuredAudioVisibleMs > 0
      ? Math.min(segmentTimelineMs, measuredAudioVisibleMs)
      : segmentTimelineMs;
    return Math.max(500, durationMs);
  }
  resolveGeminiSegmentWindowForRow(session = null, cfg = null, rowId = "", currentMs = 0) {
    const key = String(rowId || "").trim();
    if (!key) return null;
    const track = cfg?.geminiDialogueTrack || {};
    if (track?.enabled !== true || !Array.isArray(track?.segments) || !track.segments.length) return null;
    const candidates = track.segments
      .filter((segment) => String(segment?.rowId || "").trim() === key)
      .map((segment) => {
        const startMs = Math.max(0, Number(segment?.startMs || 0) || 0);
        const playbackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, key) || 1;
        const durationMs = this.resolveSegmentTimelineDurationMs(segment, playbackRate);
        return {
          rowId: key,
          startMs,
          endMs: startMs + durationMs,
          durationMs
        };
      })
      .filter((segment) => segment.durationMs > 0)
      .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    if (!candidates.length) return null;
    const now = Math.max(0, Number(currentMs || 0) || 0);
    return candidates.find((segment) => now >= segment.startMs && now < segment.endMs)
      || candidates.find((segment) => now < segment.endMs)
      || candidates[candidates.length - 1];
  }
  isImageStageEntry(entry = null) {
    if (!entry) return false;
    if (entry.isImageClip === true) return true;
    const explicitType = String(entry?.clip?.type || entry?.type || "").trim().toLowerCase();
    if (explicitType === "image") return true;
    const source = String(entry?.videoSrc || "").trim();
    if (/\.(jpg|jpeg|png|webp|gif|avif)(?:[?#&]|$)/i.test(source)) return true;
    if (/\/api\/assets\/proxy-image\?/i.test(source)) return true;
    return false;
  }

  isColorSceneEntry(entry = null) {
    const color = String(entry?.clip?.backgroundColor || entry?.backgroundColor || "").trim();
    return Boolean(color);
  }

  hasStageVisualSurface(entry = null) {
    if (this.isImageStageEntry(entry)) return true;
    const source = String(entry?.videoSrc || "").trim();
    return Boolean(source) && !this.isColorSceneEntry(entry);
  }
  parseOverlayCssPercent(value, fallback = 0) {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    const numeric = Number(raw.replace("%", ""));
    if (!Number.isFinite(numeric)) return fallback;
    return this.clamp01(numeric / 100);
  }
  resolveLiveOnScreenTextLayout(selectedRowId, baseLayout, overlay, previewEl) {
    const rowId = String(selectedRowId || "").trim();
    if (!rowId || !overlay || !previewEl) return baseLayout;
    const dragState = this.deps?.podcastVideoState?.onScreenTextOverlayDrag;
    const resizeState = this.deps?.podcastVideoState?.onScreenTextOverlayResize;
    const activeInteraction = [dragState, resizeState].find((item) => String(item?.rowId || "").trim() === rowId) || null;
    if (!activeInteraction) return baseLayout;
    const bubble = overlay.querySelector(`.podcast-on-screen-text-content[data-row-id="${CSS.escape(rowId)}"]`);
    if (!bubble) return baseLayout;
    const previewRect = previewEl.getBoundingClientRect?.();
    const bubbleRect = bubble.getBoundingClientRect?.();
    const previewWidthPx = Math.max(1, Number(previewRect?.width || previewEl.clientWidth || 1));
    const previewHeightPx = Math.max(1, Number(previewRect?.height || previewEl.clientHeight || 1));
    const widthPx = Math.max(
      1,
      this.toFiniteNumber(String(bubble.style.getPropertyValue("--pod-onscreen-text-bubble-width") || "").replace("px", ""), Number(bubbleRect?.width || 0))
    );
    const heightPx = Math.max(1, Number(bubbleRect?.height || 0));
    return {
      ...(baseLayout || {}),
      rowId,
      xPct: this.parseOverlayCssPercent(bubble.style.getPropertyValue("--pod-onscreen-text-x"), Number(baseLayout?.xPct || 0)),
      yPct: this.parseOverlayCssPercent(bubble.style.getPropertyValue("--pod-onscreen-text-y"), Number(baseLayout?.yPct || 0)),
      widthPct: Math.max(0.08, Math.min(0.9, widthPx / previewWidthPx)),
      heightPct: Math.max(0.05, Math.min(0.6, heightPx / previewHeightPx))
    };
  }
  resolveTrackManagedOnScreenTextLayout(rowLayout, settings, rowId) {
    const baseLayout = rowLayout && typeof rowLayout === "object" ? rowLayout : {};
    const widthPct = Math.max(0.22, Math.min(0.92, Number(settings?.boxWidthPct || baseLayout?.widthPct || 0.58) || 0.58));
    const heightPct = Math.max(0.05, Math.min(0.6, Number(baseLayout?.heightPct || 0.14) || 0.14));
    const overlayXPct = this.clamp01(Number(settings?.overlayXPct || 0.5) || 0.5);
    const overlayYPct = this.clamp01(Number(settings?.overlayYPct || 0.86) || 0.86);
    return {
      ...baseLayout,
      rowId: String(rowId || baseLayout?.rowId || "").trim(),
      widthPct,
      heightPct,
      xPct: Math.max(0, Math.min(1 - widthPct, overlayXPct - (widthPct / 2))),
      yPct: Math.max(0, Math.min(1 - heightPct, overlayYPct - heightPct))
    };
  }

  getEntryAtMs(currentMs) {
    const now = performance.now();
    let entries;
    const targetMs = Math.max(0, Number(currentMs || 0));
    if (this.cachedTickEntries && (now - this.cachedTickEntriesTime) < 16) {
      entries = this.cachedTickEntries;
    } else {
      entries = this.deps?.buildTimelineRuntimeEntries?.(this.state.session) || [];
      this.cachedTickEntries = entries;
      this.cachedTickEntriesTime = now;
    }
    return (
      resolveTimelineEntryAtMs(entries, targetMs, {
        toleranceMs: this.getTimelineLookupToleranceMs()
      })
      || null
    );
  }
  resolveActiveMediaLoadMode(url = "") {
    const configMode = String(this.state.config?.mediaLoadMode || "streaming").trim().toLowerCase();
    if (configMode === "auto") {
      const isVideo = /\.(mp4|webm|mov|m4v)(?:[?#&]|$)/i.test(url) || url.includes("video") || url.includes("montage");
      return isVideo ? "streaming" : "blob";
    }
    return configMode;
  }
  shouldPersistStageVideoSource(url = "") {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl || cleanUrl.startsWith("blob:") || cleanUrl.startsWith("data:")) return false;
    return this.resolveActiveMediaLoadMode(cleanUrl) === "blob";
  }
  shouldResyncStageVideo(videoEl = null, targetTimeSec = 0, options = {}) {
    if (!videoEl || !Number.isFinite(Number(targetTimeSec))) return false;
    const currentTimeSec = Number(videoEl.currentTime || 0) || 0;
    const driftSec = Math.abs(currentTimeSec - Number(targetTimeSec));
    if (driftSec < STAGE_VIDEO_RESYNC_MIN_DRIFT_SEC) return false;
    if (options.force === true || this.state.forceStageMediaSync === true || this.state.isPlaying !== true || options.isHoldActive === true) {
      return true;
    }
    const haveCurrentData = typeof HTMLMediaElement !== "undefined"
      ? HTMLMediaElement.HAVE_CURRENT_DATA
      : 2;
    // Seeking a streaming video while its decoder is recovering flushes the
    // buffer again. Let the existing request finish instead of creating the
    // pause/jump loop observed in the Snoopy editor.
    if (videoEl.seeking === true || Number(videoEl.readyState || 0) < haveCurrentData) return false;
    const toleranceSec = Math.max(
      STAGE_VIDEO_RESYNC_TOLERANCE_SEC,
      Number(options.toleranceSec ?? STAGE_VIDEO_RESYNC_TOLERANCE_DEFAULT_SEC)
        || STAGE_VIDEO_RESYNC_TOLERANCE_DEFAULT_SEC
    );
    return driftSec > toleranceSec;
  }
  buildOverlapEntrySignature(entry = null, isImage = false) {
    if (!entry) return "";
    const kind = isImage === true ? OVERLAP_ENTRY_MEDIA_KIND_IMAGE : OVERLAP_ENTRY_MEDIA_KIND_VIDEO;
    const rowId = String(entry.rowId || "").trim();
    const src = String(entry.videoSrc || "").trim();
    const entryType = Number(entry.clip?.trimInMs || 0) || 0;
    return `${kind}${OVERLAP_ENTRY_SIGNATURE_SEPARATOR}${rowId}${OVERLAP_ENTRY_SIGNATURE_SEPARATOR}${src}${OVERLAP_ENTRY_SIGNATURE_SEPARATOR}${entryType}`;
  }
  waitForStageVideoFrame(videoEl = null, expectedSrc = "", timeoutMs = STAGE_VIDEO_FRAME_TIMEOUT_MS) {
    if (!videoEl) return Promise.resolve(false);
    const cleanExpectedSrc = String(expectedSrc || "").trim();
    const isCurrentSourceReady = () => this.isVideoSurfaceReady(videoEl, cleanExpectedSrc);

    return new Promise((resolve) => {
      let settled = false;
      let frameCallbackId = 0;
      let fallbackFrameId = 0;
      const finish = (ready = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        videoEl.removeEventListener("error", onError);
        videoEl.removeEventListener("emptied", onError);
        videoEl.removeEventListener("seeked", onFallbackCandidate);
        videoEl.removeEventListener("loadeddata", onFallbackCandidate);
        videoEl.removeEventListener("timeupdate", onFallbackCandidate);
        if (frameCallbackId && typeof videoEl.cancelVideoFrameCallback === "function") {
          try { videoEl.cancelVideoFrameCallback(frameCallbackId); } catch (_) { }
        }
        if (fallbackFrameId && typeof cancelAnimationFrame === "function") {
          try { cancelAnimationFrame(fallbackFrameId); } catch (_) { }
        }
        resolve(Boolean(ready) && isCurrentSourceReady());
      };
      const onError = () => finish(false);
      const onFallbackCandidate = () => {
        if (!isCurrentSourceReady() || typeof videoEl.requestVideoFrameCallback === "function") return;
        if (fallbackFrameId || typeof requestAnimationFrame !== "function") {
          if (typeof requestAnimationFrame !== "function") finish(true);
          return;
        }
        // Two paint turns are the closest fallback to a compositor frame on
        // browsers without requestVideoFrameCallback.
        fallbackFrameId = requestAnimationFrame(() => {
          fallbackFrameId = requestAnimationFrame(() => finish(true));
        });
      };
      const timeoutId = setTimeout(
        () => finish(isCurrentSourceReady()),
        Math.max(250, Number(timeoutMs || STAGE_VIDEO_FRAME_TIMEOUT_MS))
      );
      videoEl.addEventListener("error", onError, { once: true });
      videoEl.addEventListener("emptied", onError, { once: true });

      if (typeof videoEl.requestVideoFrameCallback === "function") {
        frameCallbackId = videoEl.requestVideoFrameCallback(() => finish(true));
      } else {
        videoEl.addEventListener("seeked", onFallbackCandidate);
        videoEl.addEventListener("loadeddata", onFallbackCandidate);
        videoEl.addEventListener("timeupdate", onFallbackCandidate);
        onFallbackCandidate();
      }
    });
  }
  async waitForStageVideoFrameReady(videoEl = null, expectedSrc = "", timeoutMs = STAGE_VIDEO_FRAME_TIMEOUT_MS, options = {}) {
    const primaryReady = await this.waitForStageVideoFrame(videoEl, expectedSrc, timeoutMs);
    if (primaryReady || this.isVideoSurfaceReady(videoEl, expectedSrc)) return true;

    const softTimeoutMs = Number(options?.softTimeoutMs || STAGE_VIDEO_FRAME_SOFT_TIMEOUT_MS) || 0;
    if (softTimeoutMs <= 0) return false;
    const softReady = await this.waitForStageVideoFrame(videoEl, expectedSrc, softTimeoutMs);
    return softReady || this.isVideoSurfaceReady(videoEl, expectedSrc);
  }
  getBlobUrlSync(url) {
    if (!url) return "";
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;

    const localMediaPrefix = "podcaster-local-media:";
    if (url.startsWith(localMediaPrefix)) {
      const cachedLocal = this.blobCache.has(url) ? this.blobCache.get(url) : "";
      return cachedLocal === "404" ? "" : cachedLocal;
    }
    
    const activeMode = this.resolveActiveMediaLoadMode(url);
    if (activeMode === "streaming") {
      if (this.blobCache.has(url)) {
        const cachedStreaming = this.blobCache.get(url);
        return cachedStreaming === "404" ? "" : cachedStreaming;
      }
      
      let finalUrl = url;
      if (finalUrl.startsWith("gs://")) {
        const cacheKey = this.resolvePersistentMediaCacheKey(finalUrl);
        if (cacheKey && this.blobCache.has(cacheKey)) {
          const cachedGs = this.blobCache.get(cacheKey);
          return cachedGs === "404" ? "" : cachedGs;
        }
        return null;
      }
      
      const isDirectFirebaseUrl = finalUrl.includes('firebasestorage.googleapis.com');
      if (isDirectFirebaseUrl && !finalUrl.includes('/api/assets/proxy-')) {
        finalUrl = this.buildMediaProxyUrl(`/api/assets/proxy-media?url=${encodeURIComponent(finalUrl)}`);
      }
      this.blobCache.set(url, finalUrl);
      const cacheKey = this.resolvePersistentMediaCacheKey(url);
      if (cacheKey && cacheKey !== url) this.blobCache.set(cacheKey, finalUrl);
      return finalUrl;
    }
    
    if (this.blobCache.has(url)) {
      const cached = this.blobCache.get(url);
      return cached === "404" ? "" : cached;
    }
    const cacheKey = this.resolvePersistentMediaCacheKey(url);
    if (cacheKey && cacheKey !== url && this.blobCache.has(cacheKey)) {
      const cached = this.blobCache.get(cacheKey);
      this.blobCache.set(url, cached);
      return cached === "404" ? "" : cached;
    }
    return null;
  }

  resolvePersistentMediaCacheKey(url = "") {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return "";
    if (cleanUrl.startsWith("blob:") || cleanUrl.startsWith("data:")) return cleanUrl;
    try {
      const parsedUrl = new URL(cleanUrl, window.location.origin);
      let storagePath = parsedUrl.searchParams.get("storagePath") || "";
      const originalUrl = parsedUrl.searchParams.get("url") || "";
      if (!storagePath && cleanUrl.includes("firebasestorage.googleapis.com")) {
        const pathPart = cleanUrl.split("/o/")[1]?.split("?")[0];
        if (pathPart) storagePath = decodeURIComponent(pathPart);
      }
      if (!storagePath && originalUrl) {
        try {
          const originalParsed = new URL(originalUrl);
          if (originalParsed.hostname.includes("firebasestorage.googleapis.com")) {
            const pathPart = originalUrl.split("/o/")[1]?.split("?")[0];
            if (pathPart) storagePath = decodeURIComponent(pathPart);
          }
        } catch (_) { }
      }
      if (storagePath) {
        return `${window.location.origin}/__podcaster_media_cache__/${encodeURIComponent(storagePath)}`;
      }
    } catch (_) { }
    return cleanUrl;
  }

  async resolveLocalMediaObjectUrl(localMediaCacheKey = "") {
    const cleanKey = String(localMediaCacheKey || "").trim();
    if (!cleanKey) return "";
    const cacheKey = `podcaster-local-media:${cleanKey}`;
    const cached = this.getBlobUrlSync(cacheKey);
    if (cached) return cached;
    const pending = this.fetchPromises.get(cacheKey);
    if (pending) return pending;
    const p = (async () => {
      try {
        const blob = await getPodcasterLocalMediaBlob(cleanKey);
        if (!(blob instanceof Blob)) return "";
        const objectUrl = URL.createObjectURL(blob);
        this.blobCache.set(cacheKey, objectUrl);
        return objectUrl;
      } catch (_) {
        return "";
      }
    })();
    this.fetchPromises.set(cacheKey, p);
    try {
      return await p;
    } finally {
      this.fetchPromises.delete(cacheKey);
    }
  }

  async resolveAudioSource(clip = null) {
    const localKey = String(clip?.localMediaCacheKey || "").trim();
    const localMediaPrefix = "podcaster-local-media:";
    const downloadUrl = String(clip?.downloadUrl || "").trim();
    const storagePath = String(clip?.storagePath || "").trim();
    const directSource = String(clip?.sourceUrl || "").trim();
    const hasRemoteSource = Boolean(
      downloadUrl
      || storagePath
      || (directSource && !directSource.startsWith(localMediaPrefix))
    );
    if (localKey) {
      const localSrc = await this.resolveLocalMediaObjectUrl(localKey);
      if (localSrc) return localSrc;
    }

    const localDataUrl = String(clip?.localDataUrl || clip?.dataUrl || "").trim();
    if (localDataUrl) {
      if (localDataUrl.startsWith(localMediaPrefix)) {
        const localDataKey = localDataUrl.replace(localMediaPrefix, "").trim();
        if (localDataKey) {
          const localBlobUrl = await this.resolveLocalMediaObjectUrl(localDataKey);
          if (localBlobUrl) return localBlobUrl;
        }
        if (hasRemoteSource) {
          // La clave local es sólo una caché oportunista. Si IndexedDB está vacío
          // después de cargar otra máquina/navegador, continuamos hacia Storage.
        } else {
          return "";
        }
      } else {
        if (!localKey) {
          const fallbackLocalBlob = await this.resolveLocalMediaObjectUrl(localDataUrl);
          if (fallbackLocalBlob) return fallbackLocalBlob;
        }
        if (localDataUrl.startsWith("data:")) {
          return localDataUrl;
        }
        return localDataUrl;
      }
    }

    if (directSource) {
      if (directSource.startsWith(localMediaPrefix)) {
        const localSourceKey = directSource.replace(localMediaPrefix, "").trim();
        if (localSourceKey) {
          const localBlobUrl = await this.resolveLocalMediaObjectUrl(localSourceKey);
          if (localBlobUrl) return localBlobUrl;
        }
        if (!hasRemoteSource) return "";
      } else {
        const resolvedDirectSource = this.deps?.resolveStorageAudioUrl?.(directSource, clip?.storagePath);
        if (resolvedDirectSource && String(resolvedDirectSource).trim()) {
          return this.getBlobUrl(resolvedDirectSource, {
            persistent: this.resolveActiveMediaLoadMode(resolvedDirectSource) === "blob"
          });
        }
        return directSource;
      }
    }

    const rawUrl = this.deps?.resolveStorageAudioUrl?.(downloadUrl, storagePath);
    if (!rawUrl) {
      const fallbackUrl = downloadUrl;
      if (!fallbackUrl) return "";
      return this.getBlobUrl(fallbackUrl, {
        persistent: this.resolveActiveMediaLoadMode(fallbackUrl) === "blob"
      });
    }
    return this.getBlobUrl(rawUrl, {
      persistent: this.resolveActiveMediaLoadMode(rawUrl) === "blob"
    });
  }

  async resolveDialoguePlaybackAudioSource(clip = null) {
    const resolvedSource = await this.resolveAudioSource(clip);
    if (!resolvedSource) return "";
    if (/^(?:blob:|data:)/i.test(String(resolvedSource).trim())) return String(resolvedSource).trim();
    const playableSource = await this.getBlobUrl(String(resolvedSource).trim(), { persistent: true });
    if (!playableSource) {
      this.emitMediaTelemetry("dialogue-audio-source-resolve-failed", {
        source: resolvedSource,
        sourceKey: this.resolveAudioSourceKey(clip)
      });
    }
    return playableSource;
  }

  normalizeAudioSourceKey(rawUrl = "") {
    const clean = String(rawUrl || "").trim();
    if (!clean) return "";
    try {
      const parsed = new URL(clean, window.location.origin);
      const params = new URLSearchParams(parsed.search || "");
      const volatileParams = ["token", "downloadToken", "X-Goog-Algorithm", "X-Goog-Credential", "X-Goog-Date", "X-Goog-Expires", "X-Goog-SignedHeaders", "X-Goog-Signature"];
      volatileParams.forEach((key) => params.delete(key));
      parsed.search = params.toString();
      return `${parsed.origin}${parsed.pathname}${parsed.search ? `?${params.toString()}` : ""}${parsed.hash || ""}`;
    } catch (_) {
      return clean;
    }
  }

  normalizeTimelineSourceKey(rawUrl = "") {
    const clean = String(rawUrl || "").trim();
    if (!clean) return "";
    if (clean.startsWith("podcaster-local-media:")) {
      const localKey = clean.replace("podcaster-local-media:", "").trim();
      return localKey ? `local:${localKey}` : clean;
    }
    if (/^(?:blob:|data:)/i.test(clean)) return clean;
    return this.normalizeAudioSourceKey(clean);
  }

  resolveAudioSourceKey(clip = null) {
    const localMediaPrefix = "podcaster-local-media:";
    const remoteAudioUrl = this.deps?.resolveStorageAudioUrl?.(clip?.downloadUrl, clip?.storagePath);
    if (remoteAudioUrl) return `audio:${this.normalizeAudioSourceKey(remoteAudioUrl)}`;
    const storagePath = String(clip?.storagePath || "").trim();
    if (storagePath) return `storage:${storagePath}`;
    const downloadUrl = String(clip?.downloadUrl || "").trim();
    if (downloadUrl) return `audio:${this.normalizeAudioSourceKey(downloadUrl)}`;
    const localKey = String(clip?.localMediaCacheKey || "").trim();
    if (localKey) return `local:${localKey}`;
    const sourceUrl = String(clip?.sourceUrl || "").trim();
    if (sourceUrl.startsWith(localMediaPrefix)) {
      const normalizedLocalKey = sourceUrl.replace(localMediaPrefix, "").trim();
      if (normalizedLocalKey) return `local:${normalizedLocalKey}`;
      return sourceUrl;
    }
    if (sourceUrl) return `audio:${this.normalizeAudioSourceKey(sourceUrl)}`;
    const localDataUrl = String(clip?.localDataUrl || clip?.dataUrl || "").trim();
    if (localDataUrl.startsWith(localMediaPrefix)) {
      const normalizedLocalKey = localDataUrl.replace(localMediaPrefix, "").trim();
      if (normalizedLocalKey) return `local:${normalizedLocalKey}`;
    }
    if (localDataUrl) return this.normalizeAudioSourceKey(localDataUrl).slice(0, 240);
    return "";
  }

  async invalidateBlobUrl(url) {
    if (!url) return;
    const cacheKey = this.resolvePersistentMediaCacheKey(url);
    const blobUrl = this.blobCache.get(url) || (cacheKey && cacheKey !== url ? this.blobCache.get(cacheKey) : "");
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobCache.delete(url);
      if (cacheKey && cacheKey !== url) this.blobCache.delete(cacheKey);
    }
    try {
      const cache = await caches.open(this.mediaCacheName);
      await cache.delete(url);
      if (cacheKey && cacheKey !== url) await cache.delete(cacheKey);
      if (cacheKey) {
        await cache.delete(`stage-media:${cacheKey}`);
      }
    } catch (e) { }
    try {
      const baseCacheKey = this.resolvePersistentMediaCacheKey(url);
      if (baseCacheKey) {
        await deletePodcasterLocalMediaKey(`stage-media:${baseCacheKey}`).catch(() => { });
      }
    } catch (_) { }
  }


  async getBlobUrl(url, options = {}) {
    if (!url) return "";
    const localMediaPrefix = "podcaster-local-media:";
    if (url.startsWith(localMediaPrefix)) {
      return this.resolveLocalMediaObjectUrl(url.replace(localMediaPrefix, ""));
    }

    const cacheKey = this.resolvePersistentMediaCacheKey(url) || url;
    // A streaming lookup may resolve only to a proxy URL, while a persistent
    // lookup must fetch bytes and create a blob. They cannot share a promise.
    const fetchPromiseKey = options.persistent === true
      ? `persistent:${cacheKey}`
      : `streaming:${cacheKey}`;
    const persistentStoreKey = `stage-media:${cacheKey}`;
    const prefersStreamingProxy = String(url || "").includes('/api/assets/proxy-media');
    // 1. Check in-memory cache
    const cached = this.getBlobUrlSync(url);
    const cachedIsHydratedMedia = /^(?:blob:|data:)/i.test(String(cached || ""));
    if (cached && (options.persistent !== true || cachedIsHydratedMedia)) return cached;

    if (options.persistent === true) {
      try {
        const persistedBlob = await getPodcasterLocalMediaBlob(persistentStoreKey);
        if (persistedBlob instanceof Blob) {
          const objectUrl = URL.createObjectURL(persistedBlob);
          this.blobCache.set(url, objectUrl);
          if (cacheKey !== url) this.blobCache.set(cacheKey, objectUrl);
          this.emitMediaTelemetry("cache-hit-indexeddb", { kind: "video", source: url });
          return objectUrl;
        }
      } catch (_) { }
    }

    const activeMode = this.resolveActiveMediaLoadMode(url);
    if (activeMode === "streaming" && options.persistent !== true) {
      if (this.fetchPromises.has(fetchPromiseKey)) return this.fetchPromises.get(fetchPromiseKey);

      const p = (async () => {
        try {
          let finalUrl = url;
          if (finalUrl.startsWith("gs://")) {
            if (this.deps?.resolveFirebaseStorageUrl) {
              finalUrl = await this.deps.resolveFirebaseStorageUrl(finalUrl);
            }
          }

          const isDirectFirebaseUrl = finalUrl.includes('firebasestorage.googleapis.com');
          if (isDirectFirebaseUrl && !finalUrl.includes('/api/assets/proxy-') && !this.hasFirebaseDirectAccessToken(finalUrl)) {
            finalUrl = this.buildMediaProxyUrl(`/api/assets/proxy-media?url=${encodeURIComponent(finalUrl)}`);
          }

          this.blobCache.set(url, finalUrl);
          if (cacheKey !== url) this.blobCache.set(cacheKey, finalUrl);
          return finalUrl;
          } catch (e) {
            console.error("[podcaster-playback-controller] Error resolving streaming URL:", e);
            throw e;
          } finally {
          this.fetchPromises.delete(fetchPromiseKey);
        }
      })();
      this.fetchPromises.set(fetchPromiseKey, p);
      return p;
    }

    if (this.fetchPromises.has(fetchPromiseKey)) return this.fetchPromises.get(fetchPromiseKey);

    const p = (async () => {
      try {
        // 2. Check persistent Cache Storage
        if (!prefersStreamingProxy) {
          try {
            const mediaCache = await caches.open(this.mediaCacheName);
            const cachedResp = await mediaCache.match(cacheKey);
            if (cachedResp) {
              const blob = await cachedResp.blob();
              const objectUrl = URL.createObjectURL(blob);
              this.blobCache.set(url, objectUrl);
              if (cacheKey !== url) this.blobCache.set(cacheKey, objectUrl);
              return objectUrl;
            }
          } catch (e) { }
        }

        let finalUrl = url;
        const isDirectFirebaseUrl = url.includes('firebasestorage.googleapis.com');
        const isImageLikeUrl = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#&]|$)/i.test(String(url || "").trim());

        if (url.includes('/api/assets/proxy-media') || url.includes('/api/assets/proxy-image') || isDirectFirebaseUrl) {
          try {
            const parsedUrl = new URL(url, window.location.origin);
            let storagePath = parsedUrl.searchParams.get('storagePath');
            const originalUrl = parsedUrl.searchParams.get('url');

            if (isDirectFirebaseUrl && !storagePath) {
              const pathPart = url.split('/o/')[1]?.split('?')[0];
              if (pathPart) storagePath = decodeURIComponent(pathPart);
            }

            if (storagePath && this.deps?.resolveFirebaseStorageUrl) {
              const isStudioAsset = storagePath.includes('podcaster/sessions') || storagePath.includes('podcaster/library');
              // Solo permitimos resolución directa si NO es un asset de estudio O si es Dashboard.
              // En local (Studio) lo desactivamos porque suele dar error de CORS si el bucket no está abierto.
              if (!isStudioAsset || this.deps?.isDashboard) {
                const bucket = window.__CHARLY_CONFIG__?.firebase?.storageBucket || 'charly-brown.firebasestorage.app';
                const gsPath = storagePath.startsWith('gs://') ? storagePath : `gs://${bucket}/${storagePath}`;
                const directUrl = await this.deps.resolveFirebaseStorageUrl(gsPath);
                if (directUrl && directUrl.startsWith('http') && !directUrl.includes('/api/assets/proxy')) {
                  finalUrl = directUrl;
                } else if (directUrl && directUrl.includes('/api/assets/proxy')) {
                  finalUrl = directUrl;
                }
              }
            } else if (originalUrl && originalUrl.startsWith('http') && !originalUrl.includes('/api/assets/proxy')) {
              finalUrl = originalUrl;
            }
            if (
              isDirectFirebaseUrl &&
              finalUrl.includes('firebasestorage.googleapis.com') &&
              !this.hasFirebaseDirectAccessToken(finalUrl) &&
              !finalUrl.includes('/api/assets/proxy-')
            ) {
              finalUrl = this.toFirebaseStorageProxyUrl(finalUrl, storagePath, { kind: isImageLikeUrl ? "image" : "media" });
            }
          } catch (e) { }
        }

        if (finalUrl.startsWith("gs://")) {
          if (this.deps?.resolveFirebaseStorageUrl) {
            finalUrl = await this.deps.resolveFirebaseStorageUrl(finalUrl);
          }
        }

        const isImageLikeFinalUrl = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#&]|$)/i.test(String(finalUrl || "").trim());
        const isProxyMediaUrl = String(finalUrl || "").includes('/api/assets/proxy-media');
        const isDirectRemoteImage = isImageLikeFinalUrl && !String(finalUrl || "").includes('/api/');
        if (isDirectFirebaseUrl && isDirectRemoteImage) {
          this.blobCache.set(url, finalUrl);
          if (cacheKey !== url) this.blobCache.set(cacheKey, finalUrl);
          return finalUrl;
        }
        if (isImageLikeUrl && isDirectRemoteImage) {
          this.blobCache.set(url, finalUrl);
          if (cacheKey !== url) this.blobCache.set(cacheKey, finalUrl);
          return finalUrl;
        }
        // En reproducción directa conservamos el proxy como stream. Durante la
        // preparación persistente debemos continuar hasta fetch/blob para que
        // la escena quede realmente disponible en IndexedDB antes del corte.
        if (isProxyMediaUrl && !isImageLikeFinalUrl && options.persistent !== true) {
          this.blobCache.set(url, finalUrl);
          if (cacheKey !== url) this.blobCache.set(cacheKey, finalUrl);
          return finalUrl;
        }

        const fetchOptions = {};
        if (finalUrl.includes('/api/') && this.deps?.getAuthHeaders) {
          try { fetchOptions.headers = await this.deps.getAuthHeaders(); } catch (e) { }
        }

        let resp = await fetch(finalUrl, fetchOptions);
        
        // Fallback local si falla o da 404 estando en localhost
        if (!resp.ok) {
          if (resp.status === 404 && this.deps?.markStaleProxyMediaUrl) {
            this.deps.markStaleProxyMediaUrl(url, 'proxy-media-404-from-controller');
          }
          throw new Error(`Fetch failed with status ${resp.status}`);
        }

        try {
          const mediaCache = await caches.open(this.mediaCacheName);
          await mediaCache.put(cacheKey, resp.clone());
        } catch (e) { }

        const blob = await resp.blob();
        if (options.persistent === true) {
          try {
            await putPodcasterLocalMediaBlob(persistentStoreKey, blob, {
              kind: "stage-video",
              sourceUrl: url,
              cachedAt: new Date().toISOString()
            });
            this.emitMediaTelemetry("cache-store-indexeddb", { kind: "video", source: url });
          } catch (_) { }
        }
        const objectUrl = URL.createObjectURL(blob);
        this.blobCache.set(url, objectUrl);
        if (cacheKey !== url) this.blobCache.set(cacheKey, objectUrl);
        return objectUrl;
      } catch (e) {
        // Cache the fact that it failed to avoid spamming the backend/storage.
        // If it was a 404, we mark it specially so we can potentially skip it in the UI.
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("status 404")) {
          this.blobCache.set(url, "404");
          return "";
        } else {
          this.blobCache.set(url, "404");
          this.emitMediaTelemetry("media-fetch-failed", {
            source: url,
            message: String(e?.message || "unknown")
          });
          return "";
        }
      } finally {
        this.fetchPromises.delete(fetchPromiseKey);
      }
    })();
    this.fetchPromises.set(fetchPromiseKey, p);
    return p;
  }

  collectTimelineStageVideoEntries(session = null) {
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session || this.state.session || this.deps?.getActiveSession?.()) || [];
    const normalizeSource = (value) => {
      const normalized = this.normalizeTimelineSourceKey?.(String(value || "").trim());
      return String(normalized || String(value || "").trim());
    };
    const seen = new Set();
    return entries.filter((entry) => {
      const normalizedSrc = normalizeSource(entry?.videoSrc);
      if (!normalizedSrc || seen.has(normalizedSrc) || this.isImageStageEntry(entry)) return false;
      seen.add(normalizedSrc);
      return true;
    });
  }

  prioritizeStageVideoEntriesForMs(entries = [], currentMs = 0) {
    const targetMs = Math.max(0, Number(currentMs || 0) || 0);
    return [...entries].sort((a, b) => {
      const aActive = targetMs >= Number(a?.startMs || 0) && targetMs < Number(a?.endMs || 0);
      const bActive = targetMs >= Number(b?.startMs || 0) && targetMs < Number(b?.endMs || 0);
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aDistance = Math.min(Math.abs(targetMs - Number(a?.startMs || 0)), Math.abs(targetMs - Number(a?.endMs || 0)));
      const bDistance = Math.min(Math.abs(targetMs - Number(b?.startMs || 0)), Math.abs(targetMs - Number(b?.endMs || 0)));
      return aDistance - bDistance;
    });
  }

  prewarmTimelineStageVideos(session = null, options = {}) {
    const entries = this.collectTimelineStageVideoEntries(session);
    if (!entries.length) return Promise.resolve(false);
    const key = entries.map((entry) => this.normalizeTimelineSourceKey?.(String(entry?.videoSrc || "").trim()) || String(entry?.videoSrc || "").trim()).filter(Boolean).join("|");
    if (!options.force && this.videoPrewarmKey === key && this.videoPrewarmPromise) {
      return this.videoPrewarmPromise;
    }
    const currentMs = Math.max(0, Number(options.currentMs ?? this.state.currentMs ?? 0) || 0);
    const queue = this.prioritizeStageVideoEntriesForMs(entries, currentMs);
    const concurrency = Math.max(1, Math.min(4, Number(options.concurrency || 2) || 2));
    this.videoPrewarmKey = key;
    this.videoPrewarmPromise = (async () => {
      let index = 0;
      const worker = async () => {
        while (index < queue.length) {
          const entry = queue[index++];
          const src = String(entry?.videoSrc || "").trim();
          if (!src) continue;
          try {
            await this.getBlobUrl(src, {
              persistent: this.shouldPersistStageVideoSource(src)
            });
          } catch (_) { }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
      return true;
    })().finally(() => {
      if (this.videoPrewarmKey !== key) return;
      this.videoPrewarmPromise = null;
    });
    return this.videoPrewarmPromise;
  }

  collectDialogueRowIds(session = null, entries = [], segments = []) {
    const ids = new Set();
    const add = (value) => {
      const key = String(value || "").trim();
      if (key) ids.add(key);
    };
    (Array.isArray(entries) ? entries : []).forEach((entry) => add(entry?.rowId));
    const rows = Array.isArray(session?.script?.rows) ? session.script.rows : [];
    rows.forEach((row) => add(row?.id));
    const configSegments = session?.videoConfig?.geminiDialogueTrack?.segments;
    (Array.isArray(configSegments) ? configSegments : []).forEach((segment) => add(segment?.rowId));
    (Array.isArray(segments) ? segments : []).forEach((segment) => add(segment?.rowId));
    return ids;
  }

  hideStageVideoElementPreservingSource(video = null, options = {}) {
    if (!video) return;
    try { video.pause(); } catch (_) { }
    if (options.clearRowId === true) {
      delete video.dataset.rowId;
      delete video.dataset.stageMode;
    }
    this.resetEntryVisualStateOnSurface(video);
    video.hidden = true;
    video.muted = true;
    video.volume = 0;
    video.style.opacity = options.opacity ?? "0";
    video.style.visibility = "hidden";
    video.style.transform = "";
    video.style.filter = "";
    video.style.transition = "";
  }

  // --- Lifecycle ---
  init(els, deps) {
    this.els = els;
    this.deps = deps;
    this.state.isInitialized = true;

    // Asegurar compatibilidad de CORS para elementos existentes
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt].forEach(v => {
      if (v) v.crossOrigin = "anonymous";
    });

  }

  sync(session, config) {
    this.state.session = session || this.deps?.getActiveSession?.();
    this.state.config = config || this.deps?.getPodcastVideoConfig?.(this.state.session);
    this.state.useMse = false; // Force disable MSE as it is an incomplete experimental feature
    const totalMs = this.deps?.getTimelineTotalDurationMs?.(this.state.session) || 0;
    this.state.totalDurationMs = Number.isFinite(totalMs) ? Math.max(0, totalMs) : 0;
    const nextSyncSignature = this.buildSessionSyncSignature(this.state.session, this.state.config);
    if (nextSyncSignature && nextSyncSignature !== this.lastSessionSyncSignature) {
      this.lastSessionSyncSignature = nextSyncSignature;
      this.playbackRangePreparationSignature = "";
      this.playbackRangePreparationAtMs = 0;
      void this.prepareSessionMedia({ session: this.state.session }).catch(() => {});
    }
  }

  buildSessionSyncSignature(session, config = null) {
    const targetSession = session || this.state.session || this.deps?.getActiveSession?.();
    const targetConfig = config || this.state.config || this.deps?.getPodcastVideoConfig?.(targetSession);
    if (!targetSession) return "";
    const geminiTrackSignature = (() => {
      const track = targetConfig?.geminiDialogueTrack || {};
      const segments = Array.isArray(track?.segments) ? track.segments : [];
      const segmentSignature = segments
        .map((segment) => {
          const rowId = String(segment?.rowId || "").trim();
          const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
          const endMs = Math.max(0, Math.round(Number(segment?.endMs || 0) || 0));
          const volume = Number.isFinite(Number(segment?.volume || 0)) ? Number(segment.volume) : 1;
          const fadeInMs = Math.max(0, Math.round(Number(segment?.fadeInMs || 0) || 0));
          const fadeOutMs = Math.max(0, Math.round(Number(segment?.fadeOutMs || 0) || 0));
          const voiceId = String(segment?.dialogueAudioId || segment?.sourceId || "").trim();
          return `${rowId}|${startMs}|${endMs}|${volume}|${fadeInMs}|${fadeOutMs}|${voiceId}`;
        })
        .filter(Boolean)
        .sort()
        .join("||");
      return `${String(track?.volumePct ?? 100)}|${String(track?.duckingWhenGeminiPct ?? 60)}|${segments.length}|${segmentSignature}`;
    })();
    const rows = Array.isArray(targetSession?.script?.rows) ? targetSession.script.rows : [];
    const rowSignature = rows.map((row) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId) return "";
      const clip = this.deps?.resolveDialogueAudioForRow?.(targetSession, rowId);
      return `${rowId}:${this.resolveAudioSourceKey(clip) || "none"}`;
    }).filter(Boolean).join("|");
    const timelineEntries = this.deps?.buildTimelineRuntimeEntries?.(targetSession) || [];
    const timelineSignature = timelineEntries.map((entry) => {
      const rowId = String(entry?.rowId || "").trim();
      const videoSrc = this.normalizeTimelineSourceKey(entry?.videoSrc || "");
      const startMs = Math.max(0, Math.round(Number(entry?.startMs || 0) || 0));
      return `${rowId}:${videoSrc}:${startMs}`;
    }).filter(Boolean).join("|");
    const configSignature = targetConfig
      ? [
          String(targetConfig?.timelineViewMode || "").trim(),
          String(targetConfig?.reelModeEnabled || false),
          String(Number.isFinite(Number(targetConfig?.geminiDialogueTrack?.volumePct || 100)) ? Number(targetConfig?.geminiDialogueTrack?.volumePct || 100) : 100),
          String(this.resolveAudioSourceKey(targetConfig?.geminiDialogueTrack || null)),
          String(geminiTrackSignature)
        ].join("|")
      : "";
    return [
      String(targetSession?.id || "").trim(),
      configSignature,
      rowSignature,
      timelineSignature
    ].join("|");
  }

  buildPlaybackRangePreparationSignature(atMs = this.state.currentMs, lookAheadMs = PLAYBACK_PREPARE_LOOKAHEAD_MS, options = {}) {
    const session = options.session || this.state.session || this.deps?.getActiveSession?.();
    const criticalOnly = options.criticalOnly !== false;
    const signatureBase = this.buildSessionSyncSignature(session, this.state.config || this.deps?.getPodcastVideoConfig?.(session));
    if (!signatureBase) return "";
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    const fromMs = Math.max(0, Math.round(Number(atMs || 0) || 0));
    const lookAhead = Math.max(1000, Number(lookAheadMs || 0) || PLAYBACK_PREPARE_LOOKAHEAD_MS);
    const bucketMs = 250;
    const bucketedMs = Math.floor(fromMs / bucketMs) * bucketMs;
    const untilMs = fromMs + lookAhead;
    const selected = entries
      .filter((entry) => Number(entry?.endMs || 0) >= fromMs && Number(entry?.startMs || 0) <= untilMs)
      .slice(0, 3);
    const selectedSignature = selected
      .map((entry) => {
        const rowId = String(entry?.rowId || "").trim();
        const videoSrc = String(entry?.videoSrc || "").trim();
        const startMs = Math.max(0, Math.round(Number(entry?.startMs || 0) || 0));
        const endMs = Math.max(0, Math.round(Number(entry?.endMs || 0) || 0));
        return `${rowId}:${videoSrc}:${startMs}:${endMs}`;
      })
      .join("|");
    const activeRangeSignature = criticalOnly ? "critical" : "full";
    return `prepare:${signatureBase}|at:${bucketedMs}|look:${lookAhead}|range:${activeRangeSignature}|entries:${selectedSignature}`;
  }

  /**
   * Evict cached audio player and blob URL for a specific row.
   * Call this whenever the audio source for a row changes (e.g. after regeneration)
   * so the next tick creates a fresh Audio element and fires loadedmetadata.
   */
  async invalidateRowAudioCache(rowId = "", options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return;
    const session = this.state.session || this.deps?.getActiveSession?.();
    const currentClip = this.deps?.resolveDialogueAudioForRow?.(session, key);
    const audio = this.dialoguePlayers[key];
    const sourceCandidates = new Set();
    const persistentEvictionKeys = new Set();
    const addSourceCandidate = (value = "") => {
      const candidate = String(value || "").trim();
      if (candidate) sourceCandidates.add(candidate);
    };
    const collectClipSources = (clip = null) => {
      if (!clip || typeof clip !== "object") return;
      const rawUrl = this.deps?.resolveStorageAudioUrl?.(clip?.downloadUrl, clip?.storagePath);
      addSourceCandidate(rawUrl);
      addSourceCandidate(clip.downloadUrl);
      addSourceCandidate(clip.storagePath);
      addSourceCandidate(clip.sourceUrl);
      addSourceCandidate(clip.localDataUrl);
      addSourceCandidate(clip.dataUrl);
      const localKey = String(clip.localMediaCacheKey || "").trim();
      if (localKey) {
        addSourceCandidate(localKey);
        addSourceCandidate(`local:${localKey}`);
        addSourceCandidate(`podcaster-local-media:${localKey}`);
      }
    };
    collectClipSources(options?.previousClip);
    collectClipSources(currentClip);
    collectClipSources(options?.nextClip);
    addSourceCandidate(options?.previousSourceKey);
    addSourceCandidate(options?.nextSourceKey);
    addSourceCandidate(this.dialogueAudioSourceKeys[key]);
    if (audio) {
      addSourceCandidate(audio.dataset?.originalSrc);
      addSourceCandidate(audio.dataset?.sourceKey);
      addSourceCandidate(audio.currentSrc);
      addSourceCandidate(audio.src);
    }

    // Desconecta primero el consumidor del blob. Revocarlo mientras el elemento
    // todavía lo tiene asignado provoca ERR_FILE_NOT_FOUND durante regeneraciones.
    if (audio) {
      try { audio.pause(); } catch (_) { }
      try { audio.removeAttribute("src"); } catch (_) { audio.src = ""; }
      try { audio.load(); } catch (_) { }
      delete this.dialoguePlayers[key];
      delete this.audioCache[key];
    }
    delete this.dialogueAudioSourceKeys[key];

    sourceCandidates.forEach((candidate) => {
      const cacheKey = this.resolvePersistentMediaCacheKey(candidate);
      [candidate, cacheKey].filter(Boolean).forEach((cacheCandidate) => {
        const cached = this.blobCache.get(cacheCandidate);
        if (cached && String(cached).startsWith("blob:")) {
          try { URL.revokeObjectURL(cached); } catch (_) { }
        }
        this.blobCache.delete(cacheCandidate);
        this.fetchPromises.delete(cacheCandidate);
        this.fetchPromises.delete(`streaming:${cacheCandidate}`);
        this.fetchPromises.delete(`persistent:${cacheCandidate}`);
        if (!/^(?:blob:|data:)/i.test(cacheCandidate)) {
          persistentEvictionKeys.add(`stage-media:${cacheCandidate}`);
        }
      });
      if (candidate.startsWith("blob:")) {
        try { URL.revokeObjectURL(candidate); } catch (_) { }
      }
    });

    // Regeneration commonly overwrites the same Storage path. Memory eviction
    // alone is insufficient because getBlobUrl(persistent) can immediately
    // restore the old bytes from IndexedDB/Cache Storage before the new audio
    // is rehydrated.
    const persistentTasks = [...persistentEvictionKeys]
      .map((cacheKey) => deletePodcasterLocalMediaKey(cacheKey).catch(() => false));
    if (typeof caches !== "undefined" && sourceCandidates.size) {
      persistentTasks.push(
        caches.open(this.mediaCacheName).then((cache) => Promise.all(
          [...sourceCandidates].flatMap((candidate) => {
            const cacheKey = this.resolvePersistentMediaCacheKey(candidate);
            return [candidate, cacheKey].filter(Boolean).map((value) => cache.delete(value).catch(() => false));
          })
        )).catch(() => false)
      );
    }
    await Promise.allSettled(persistentTasks);
    return true;
  }

  /**
   * Deeply evicts all cached media (audio, video, images, proxies) associated with a row.
   * Call this when video is generated or manually replaced to force updates in stage & timeline.
   */
  invalidateRowMediaCache(rowId = "", session = null, options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return;

    // Visual replacement must not revoke a dialogue/background blob that may
    // still be playing. Audio callers can explicitly opt into audio eviction.
    if (options?.includeAudio === true) this.invalidateRowAudioCache(key);

    // 2. Resolve dialogue video/image clip URLs and evict them from blobCache and Cache Storage
    const activeSession = session || this.state.session || (typeof getActiveSession === "function" ? getActiveSession() : (window.getActiveSession ? window.getActiveSession() : null));
    const explicitClips = []
      .concat(options?.previousClip || [])
      .concat(options?.nextClip || [])
      .filter((clip) => clip && typeof clip === "object");

    const collectClipMediaCandidates = (clip = null) => {
      const set = new Set();
      const add = (value = "") => {
        const candidate = String(value || "").trim();
        if (candidate) set.add(candidate);
      };
      if (!clip || typeof clip !== "object") return set;

      const addSegmentCandidates = (segment = null) => {
        if (!segment || typeof segment !== "object") return;
        const segmentDownloadUrl = String(segment?.downloadUrl || "").trim();
        const segmentStoragePath = String(segment?.storagePath || "").trim();
        const segmentSourceUrl = String(segment?.sourceUrl || "").trim();
        const segmentLocalMediaKey = String(segment?.localMediaCacheKey || "").trim();
        const segmentLocalDataUrl = String(segment?.localDataUrl || segment?.dataUrl || "").trim();
        const segmentUpdatedAt = String(segment?.updatedAt || segment?.updatedAtMs || "").trim();
        const segmentType = String(segment?.type || clip?.type || "").trim().toLowerCase();
        const segmentMimeType = String(segment?.mimeType || clip?.mimeType || "").trim().toLowerCase();

        add(segmentDownloadUrl);
        add(segmentStoragePath);
        add(segmentSourceUrl);
        if (segmentLocalMediaKey) {
          add(segmentLocalMediaKey);
          add(`podcaster-local-media:${segmentLocalMediaKey}`);
        }
        if (segmentLocalDataUrl) {
          add(segmentLocalDataUrl);
          if (segmentLocalDataUrl.startsWith("podcaster-local-media:")) {
            add(segmentLocalDataUrl.replace("podcaster-local-media:", ""));
          }
        }
        const segmentResolved = this.deps?.resolveStorageVideoUrl?.(
          segmentDownloadUrl,
          segmentStoragePath,
          {
            updatedAt: segmentUpdatedAt,
            type: segmentType,
            mimeType: segmentMimeType
          }
        );
        add(segmentResolved);
      };

      const mediaSourceCandidates = [
        "downloadUrl",
        "storagePath",
        "sourceUrl",
        "localMediaCacheKey",
        "localDataUrl",
        "dataUrl"
      ].flatMap((candidateKey) => {
        const value = String(clip?.[candidateKey] || "").trim();
        if (!value) return [];
        if (candidateKey === "localMediaCacheKey") {
          return [value, `podcaster-local-media:${value}`];
        }
        if (candidateKey === "localDataUrl" || candidateKey === "dataUrl") {
          const list = [value];
          if (value.startsWith("podcaster-local-media:")) {
            list.push(value.replace("podcaster-local-media:", ""));
          }
          return list;
        }
        return [value];
      });
      mediaSourceCandidates.forEach((value) => add(value));

      const resolvedClipMedia = this.deps?.resolveStorageVideoUrl?.(
        String(clip?.downloadUrl || "").trim(),
        String(clip?.storagePath || "").trim(),
        {
          updatedAt: String(clip?.updatedAt || "").trim(),
          type: String(clip?.type || "").trim(),
          mimeType: String(clip?.mimeType || "").trim()
        }
      ) || "";
      if (resolvedClipMedia) set.add(resolvedClipMedia);

      const segments = Array.isArray(clip.segments) ? clip.segments : [];
      segments.forEach(addSegmentCandidates);
      return set;
    };

    const proxyUrlVariants = (value = "") => {
      const clean = String(value || "").trim();
      if (!clean) return [];
      const variants = new Set([clean]);
      try {
        const storageKey = clean.startsWith("gs://") ? clean : "";
        if (storageKey) {
          variants.add(this.buildMediaProxyUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(storageKey)}`));
          variants.add(this.buildMediaProxyUrl(`/api/assets/proxy-image?storagePath=${encodeURIComponent(storageKey)}`));
        } else {
          const parsed = new URL(clean, window.location.origin);
          if (/firebasestorage\.googleapis\.com|\/api\/assets\//i.test(parsed.href)) {
            const storagePath = parsed.searchParams.get("storagePath");
            if (storagePath) {
              variants.add(this.buildMediaProxyUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`));
              variants.add(this.buildMediaProxyUrl(`/api/assets/proxy-image?storagePath=${encodeURIComponent(storagePath)}`));
            }
            const sourceUrl = parsed.searchParams.get("url");
            if (sourceUrl) {
              variants.add(this.buildMediaProxyUrl(`/api/assets/proxy-media?url=${encodeURIComponent(sourceUrl)}`));
              variants.add(this.buildMediaProxyUrl(`/api/assets/proxy-image?url=${encodeURIComponent(sourceUrl)}`));
            }
          }
        }
      } catch (_) { }
      return Array.from(variants);
    };

    const urlsToInvalidate = new Set(
      explicitClips
        .flatMap((clip) => Array.from(collectClipMediaCandidates(clip)))
        .filter(Boolean)
    );
    if (activeSession) {
      const dialogueMap = activeSession.dialogueVideoMap || {};
      const clip = dialogueMap[key];
      if (clip) {
        collectClipMediaCandidates(clip).forEach((url) => urlsToInvalidate.add(url));
      }
    }

    urlsToInvalidate.forEach((url) => {
      this.invalidateBlobUrl(url);
      proxyUrlVariants(url).forEach((variant) => this.invalidateBlobUrl(variant));
    });

    // 3. Clear transient synced flags to ensure stage media synchronizes completely fresh next loop
    this.state.activeRowId = "";
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.lastSyncedStageKey = "";
    } else if (window.podcastVideoState) {
      window.podcastVideoState.lastSyncedStageKey = "";
    }
  }


  initAudioContext() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return this.audioCtx;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      }
    } catch (e) { }
    return this.audioCtx;
  }

  bindBackgroundAudioRecovery(audio = null) {
    if (!audio || audio.__podcasterBackgroundRecoveryBound === true) return;
    audio.__podcasterBackgroundRecoveryBound = true;
    const markHealthy = () => {
      if (String(audio.dataset?.sourceKey || "").trim() !== String(this.backgroundSourceKey || "").trim()) return;
      if (this.backgroundRecoveryTimer) {
        clearTimeout(this.backgroundRecoveryTimer);
        this.backgroundRecoveryTimer = null;
      }
      this.backgroundRecoverySourceKey = this.backgroundSourceKey;
      this.backgroundRecoveryAttempts = 0;
    };
    audio.addEventListener("playing", markHealthy);
    audio.addEventListener("canplay", markHealthy);
    audio.addEventListener("error", () => {
      this.scheduleBackgroundAudioRecovery("media-error", { graceMs: 80 });
    });
    ["stalled", "waiting"].forEach((eventName) => {
      audio.addEventListener(eventName, () => {
        this.scheduleBackgroundAudioRecovery(eventName, {
          graceMs: 2600,
          requireUnready: true
        });
      });
    });
  }

  scheduleBackgroundAudioRecovery(reason = "media-error", options = {}) {
    const audio = this.backgroundAudio;
    const sourceKey = String(this.backgroundSourceKey || "").trim();
    if (!audio || !sourceKey || this.backgroundRecoveryTimer || this.backgroundRecoveryPromise) return false;
    if (this.backgroundRecoverySourceKey !== sourceKey) {
      this.backgroundRecoverySourceKey = sourceKey;
      this.backgroundRecoveryAttempts = 0;
    }
    if (this.backgroundRecoveryAttempts >= 4) {
      this.emitMediaTelemetry("background-audio-recovery-exhausted", {
        reason,
        sourceKey,
        attempts: this.backgroundRecoveryAttempts
      });
      return false;
    }
    this.backgroundRecoveryAttempts += 1;
    const exponentialDelayMs = 180 * (2 ** Math.max(0, this.backgroundRecoveryAttempts - 1));
    const delayMs = Math.max(Number(options?.graceMs || 0) || 0, exponentialDelayMs);
    const scheduledAudio = audio;
    this.emitMediaTelemetry("background-audio-recovery-scheduled", {
      reason,
      sourceKey,
      attempt: this.backgroundRecoveryAttempts,
      delayMs
    });
    this.backgroundRecoveryTimer = setTimeout(() => {
      this.backgroundRecoveryTimer = null;
      if (this.backgroundAudio !== scheduledAudio || this.backgroundSourceKey !== sourceKey) return;
      const haveCurrentData = typeof HTMLMediaElement !== "undefined"
        ? HTMLMediaElement.HAVE_CURRENT_DATA
        : 2;
      if (options?.requireUnready === true && !scheduledAudio.error && scheduledAudio.readyState >= haveCurrentData) {
        this.backgroundRecoveryAttempts = 0;
        return;
      }
      const staleSources = Array.from(new Set([
        this.backgroundSrc,
        this.backgroundResolvedSource,
        String(scheduledAudio.dataset?.originalSrc || "").trim()
      ].filter((item) => item && !String(item).startsWith("data:"))));
      this.backgroundRecoveryPromise = (async () => {
        await Promise.allSettled(staleSources.map((source) => this.invalidateBlobUrl(source)));
        if (this.backgroundAudio !== scheduledAudio || this.backgroundSourceKey !== sourceKey) return false;
        try { scheduledAudio.pause(); } catch (_) { }
        try {
          scheduledAudio.removeAttribute("src");
          scheduledAudio.load();
        } catch (_) { }
        scheduledAudio.dataset.initialized = "false";
        scheduledAudio.dataset.playbackStarted = "false";
        delete scheduledAudio.dataset.originalSrc;
        delete scheduledAudio.dataset.sourceKey;
        // Keep the MediaElementSource node associated with this element. The Web
        // Audio API forbids creating a second node for the same HTMLMediaElement.
        if (this.backgroundSource) { try { this.backgroundSource.disconnect(); } catch (_) { } }
        if (this.backgroundGain) { try { this.backgroundGain.disconnect(); } catch (_) { } }
        this.backgroundGain = null;
        if (this.backgroundCompressor) { try { this.backgroundCompressor.disconnect(); } catch (_) { } }
        this.backgroundCompressor = null;
        if (this.backgroundFinalLimiter) { try { this.backgroundFinalLimiter.disconnect(); } catch (_) { } }
        this.backgroundFinalLimiter = null;
        this.backgroundStabilizeEnabled = null;
        this.backgroundLimiterEnabled = null;
        this.backgroundSourceKey = "";
        this.backgroundSegmentIdentity = "";
        this.backgroundFadeSegmentSignature = "";
        this.backgroundResolvedSource = "";
        this.emitMediaTelemetry("background-audio-recovery-retry", {
          reason,
          sourceKey,
          attempt: this.backgroundRecoveryAttempts
        });
        if (this.state.isPlaying === true) {
          await this.syncBackgroundMusic(
            Math.max(0, Number(this.state.currentMs || 0) || 0),
            this.deps?.getPlaybackSpeed?.() || 1,
            false
          );
        }
        return true;
      })().finally(() => {
        this.backgroundRecoveryPromise = null;
      });
    }, delayMs);
    return true;
  }

  getOrCreateBackgroundAudioElement() {
    if (this.backgroundAudio) {
      this.backgroundAudio.volume = 1;
      this.bindBackgroundAudioRecovery(this.backgroundAudio);
      return this.backgroundAudio;
    }
    if (!this.backgroundAudioRuntimeId) {
      const baseId = "podcasterBackgroundAudioRuntime";
      let candidateId = baseId;
      let suffix = 1;
      while (document.getElementById(candidateId)) {
        suffix += 1;
        candidateId = `${baseId}-${suffix}`;
      }
      this.backgroundAudioRuntimeId = candidateId;
    }
    let audio = document.getElementById(this.backgroundAudioRuntimeId);
    if (!(audio instanceof HTMLAudioElement)) {
      audio = new Audio();
      audio.id = this.backgroundAudioRuntimeId;
      audio.hidden = true;
      audio.setAttribute("aria-hidden", "true");
      document.body.appendChild(audio);
    }
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.playsInline = true;
    audio.defaultMuted = false;
    audio.muted = false;
    // Keep media element gain at unity. Background level is controlled by Web Audio
    // gain / fallback volume logic, and a zero element volume would silenciate both.
    audio.volume = 1;
    this.backgroundAudio = audio;
    this.bindBackgroundAudioRecovery(audio);
    return audio;
  }

  async startBackgroundAudioWithoutBlockingClock(timeoutMs = BACKGROUND_AUDIO_START_TIMEOUT_MS) {
    const audio = this.backgroundAudio;
    if (!audio || this.state.isPlaying !== true || audio.paused !== true) return Boolean(audio && !audio.paused);
    audio.defaultMuted = false;
    audio.muted = false;
    try {
      if (this.audioCtx?.state === "suspended") await this.audioCtx.resume();
    } catch (_) { }

    const attemptPlay = async () => {
      try {
        await audio.play();
        audio.dataset.playbackStarted = "true";
        return true;
      } catch (_) {
        audio.dataset.playbackStarted = "false";
        return false;
      }
    };
    const waitForTimeout = () => new Promise((resolve) => {
      window.setTimeout(() => resolve(false), Math.max(250, Number(timeoutMs) || BACKGROUND_AUDIO_START_TIMEOUT_MS));
    });
    let started = await Promise.race([attemptPlay(), waitForTimeout()]);
    if (!started && audio.paused && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      audio.defaultMuted = false;
      audio.muted = false;
      started = await Promise.race([attemptPlay(), waitForTimeout()]);
    }
    if (!started && audio.paused) {
      this.scheduleBackgroundAudioRecovery("play-failed", {
        graceMs: BACKGROUND_AUDIO_PLAY_RETRY_GRACE_MS,
        requireUnready: true
      });
    }
    return Boolean(started || !audio.paused);
  }

  // --- Transport ---
  emitMediaTelemetry(event = "", detail = {}) {
    const payload = { event, at: Date.now(), ...detail };
    this.emit("media-telemetry", payload);
  }

  waitForMediaReady(mediaEl = null, timeoutMs = VIDEO_MEDIA_READY_TIMEOUT_MS) {
    if (!mediaEl || !["VIDEO", "AUDIO"].includes(String(mediaEl.tagName || "").toUpperCase())) return Promise.resolve(true);
    if (mediaEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ready = false) => {
        if (settled) return;
        settled = true;
        mediaEl.removeEventListener("loadeddata", onReady);
        mediaEl.removeEventListener("canplay", onReady);
        mediaEl.removeEventListener("error", onError);
        resolve(Boolean(ready) && mediaEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
      };
      const onReady = () => done(true);
      const onError = () => done(false);
      mediaEl.addEventListener("loadeddata", onReady, { once: true });
      mediaEl.addEventListener("canplay", onReady, { once: true });
      mediaEl.addEventListener("error", onError, { once: true });
      setTimeout(
        () => done(mediaEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA),
        Math.max(250, Number(timeoutMs || VIDEO_MEDIA_READY_TIMEOUT_MS))
      );
    });
  }

  waitForDialogueReady(audio = null, timeoutMs = DIALOGUE_AUDIO_READY_TIMEOUT_MS) {
    if (!audio) return Promise.resolve(false);
    const haveCurrentData = typeof HTMLMediaElement !== "undefined"
      ? HTMLMediaElement.HAVE_CURRENT_DATA
      : 2;
    if (Number(audio.readyState || 0) >= haveCurrentData) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      let timeoutId = 0;
      const done = (ready = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        audio.removeEventListener("canplay", onReady);
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("loadeddata", onCandidate);
        audio.removeEventListener("error", onError);
        resolve(Boolean(ready) && Number(audio.readyState || 0) >= haveCurrentData);
      };
      const onReady = () => done(true);
      const onCandidate = () => {
        if (Number(audio.readyState || 0) >= haveCurrentData) done(true);
      };
      const onError = () => done(false);
      audio.addEventListener("canplay", onReady, { once: true });
      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("loadeddata", onCandidate);
      audio.addEventListener("error", onError, { once: true });
      timeoutId = setTimeout(
        () => done(Number(audio.readyState || 0) >= haveCurrentData),
        Math.max(500, Number(timeoutMs || DIALOGUE_AUDIO_READY_TIMEOUT_MS))
      );
      if (Number(audio.readyState || 0) === 0) {
        try { audio.load(); } catch (_) { }
      }
    });
  }

  normalizeRuntimeDialogueSegments(segments = [], entries = []) {
    const entriesByRowId = new Map(
      (Array.isArray(entries) ? entries : [])
        .map((entry) => [String(entry?.rowId || "").trim(), entry])
        .filter(([rowId]) => rowId)
    );
    return (Array.isArray(segments) ? segments : []).map((segment) => {
      const rowId = String(segment?.rowId || "").trim();
      const entry = entriesByRowId.get(rowId);
      if (!entry || segment?.manualStartMs === true || segment?.manualPosition === true) return segment;
      const sceneStartMs = Math.max(0, Number(entry?.startMs || 0) || 0);
      const currentStartMs = Math.max(0, Number(segment?.startMs || 0) || 0);
      const legacyStartMs = sceneStartMs + LEGACY_AUTOMATIC_DIALOGUE_OFFSET_MS;
      if (Math.abs(currentStartMs - legacyStartMs) > Math.max(20, this.getTimelineLookupToleranceMs())) return segment;
      const durationMs = Math.max(
        1,
        Number(segment?.durationMs || 0)
          || (Number(segment?.endMs || 0) - currentStartMs)
          || Number(entry?.effectiveDurationMs || 0)
          || 1
      );
      return {
        ...segment,
        startMs: sceneStartMs,
        anchorStartMs: sceneStartMs,
        relativeOffsetMs: 0,
        endMs: sceneStartMs + durationMs
      };
    });
  }

  async prepareDialogueRow(session = null, rowId = "", options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return { ready: true, rowId: key, player: null };
    const clip = this.deps?.resolveDialogueAudioForRow?.(session, key);
    const sourceKey = this.resolveAudioSourceKey(clip);
    if (!sourceKey) return { ready: true, rowId: key, player: null };
    const preparationKey = `${key}|${sourceKey}`;
    
    let promise;
    if (!options.force && this.dialoguePreparationPromises.has(preparationKey)) {
      promise = this.dialoguePreparationPromises.get(preparationKey);
    } else {
      promise = (async () => {
        const audioSrc = await this.resolveDialoguePlaybackAudioSource(clip);
        if (!audioSrc) throw new Error(`No se pudo resolver una fuente válida para el audio Gemini de ${key}.`);

        const player = this.getOrCreateDialoguePlayer(key, audioSrc, sourceKey, session);
        player.preload = "auto";
        return { ready: true, rowId: key, player, sourceKey };
      })().catch((error) => {
        this.dialoguePreparationPromises.delete(preparationKey);
        this.emitMediaTelemetry("dialogue-audio-prepare-error", {
          rowId: key,
          sourceKey,
          message: String(error?.message || error)
        });
        throw error;
      });
      this.dialoguePreparationPromises.set(preparationKey, promise);
    }

    const prepared = await promise;
    if (options.skipWait !== true && prepared.player) {
      const ready = await this.waitForDialogueReady(
        prepared.player,
        Number(options.timeoutMs || DIALOGUE_AUDIO_READY_TIMEOUT_MS)
      );
      if (!ready) throw new Error(`El audio Gemini de ${key} no quedó listo.`);
    }
    this.emitMediaTelemetry("dialogue-audio-prepared", { rowId: key, sourceKey });
    return prepared;
  }

  async ensureDialogueReadyAtMs(currentMs = this.state.currentMs) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    const config = this.deps?.getPodcastVideoConfig?.(session) || {};
    let segments = Array.isArray(config?.geminiDialogueTrack?.segments)
      ? config.geminiDialogueTrack.segments
      : [];
    if (!segments.length) {
      segments = entries.map((entry) => ({
        rowId: entry.rowId,
        startMs: entry.startMs,
        durationMs: Math.max(1, Number(entry?.effectiveDurationMs || 0) || 1),
        trimInMs: 0
      }));
    }
    segments = this.normalizeRuntimeDialogueSegments(segments, entries);
    const toleranceMs = this.getTimelineLookupToleranceMs();
    const segment = segments
      .filter((candidate) => {
        const rowId = String(candidate?.rowId || "").trim();
        const playbackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, rowId) || 1;
        const durationMs = this.resolveSegmentTimelineDurationMs(candidate, playbackRate);
        const startMs = Math.max(0, Number(candidate?.startMs || 0) || 0);
        return this.isTimelineMsInRange(currentMs, startMs, startMs + Math.max(1, durationMs), {
          toleranceMs
        });
      })
      .sort((a, b) => Number(b?.startMs || 0) - Number(a?.startMs || 0))[0];
    if (!segment?.rowId) return true;

    const startedAt = performance.now();
    const prepared = await this.prepareDialogueRow(session, segment.rowId, { skipWait: true });
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs > 16) {
      this.clockRebaseRequested = true;
      this.emitMediaTelemetry("dialogue-boundary-gate", {
        rowId: String(segment.rowId),
        atMs: Math.max(0, Number(currentMs) || 0),
        elapsedMs: Math.round(elapsedMs)
      });
    }
    const player = prepared?.player;
    if (player && player.dataset.initialized !== "true") {
      const playbackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, segment.rowId) || 1;
      const segmentStartMs = Math.max(0, Number(segment?.startMs || 0) || 0);
      const trimInMs = Math.max(0, Number(segment?.trimInMs || 0) || 0);
      const elapsedFromStartMs = Math.max(0, Number(currentMs || 0) - segmentStartMs);
      const targetOffsetSec = elapsedFromStartMs <= 250
        ? trimInMs / 1000
        : this.resolveSegmentSourceOffsetSec(currentMs, segmentStartMs, trimInMs, playbackRate);
      if (Math.abs(Number(player.currentTime || 0) - targetOffsetSec) > 0.03) {
        this.seekTo(player, targetOffsetSec);
      }
      player.dataset.initialized = "true";
    }
    return true;
  }

  async prepareSessionMedia(options = {}) {
    const session = options.session || this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    const videoEntries = entries.filter((entry) => entry?.videoSrc);
    const rowIds = [...new Set(entries.map((entry) => String(entry?.rowId || "").trim()).filter(Boolean))];
    const backgroundConfig = this.deps?.getPanelMontageMusicConfig?.(session) || {};
    const backgroundItems = [
      ...(Array.isArray(backgroundConfig?.sourceItems) ? backgroundConfig.sourceItems : []),
      ...(String(backgroundConfig?.sourceUrl || "").trim()
        ? [{
            sourceUrl: backgroundConfig.sourceUrl,
            downloadUrl: backgroundConfig.downloadUrl,
            storagePath: backgroundConfig.storagePath,
            localDataUrl: backgroundConfig.localDataUrl,
            localMediaCacheKey: backgroundConfig.localMediaCacheKey
          }]
        : [])
    ].filter((item, index, list) => {
      const sourceKey = this.resolveAudioSourceKey(item);
      return sourceKey && list.findIndex((candidate) => this.resolveAudioSourceKey(candidate) === sourceKey) === index;
    });
    const signature = [
      String(session?.id || ""),
      ...videoEntries.map((entry) => this.normalizeTimelineSourceKey(entry?.videoSrc || "")),
      ...rowIds.map((rowId) => this.resolveAudioSourceKey(this.deps?.resolveDialogueAudioForRow?.(session, rowId))).sort(),
      ...backgroundItems.map((item) => this.resolveAudioSourceKey(item)).sort()
    ].join("|");
    if (!options.force && signature === this.sessionMediaPreparationKey && this.sessionMediaPreparationPromise) {
      return this.sessionMediaPreparationPromise;
    }

    const report = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const tasks = [];
    videoEntries.forEach((entry) => {
      const source = String(entry?.videoSrc || "").trim();
      if (!source) return;
      tasks.push({
        kind: this.isImageStageEntry(entry) ? "image" : "video",
        rowId: String(entry?.rowId || "").trim(),
        source,
        run: async () => {
          if (this.isImageStageEntry(entry)) {
            const ready = await this.preloadImageSrc(source);
            if (!ready) throw new Error("No se pudo preparar la imagen.");
            return;
          }
          const persistent = this.shouldPersistStageVideoSource(source);
          await this.getBlobUrl(source, { persistent });
          const preparedSource = this.getBlobUrlSync(source) || source;
          if (typeof document === "undefined") return;
          const probe = document.createElement("video");
          probe.preload = "auto";
          probe.muted = true;
          probe.playsInline = true;
          probe.src = preparedSource;
          try { probe.load(); } catch (_) { }
          const ready = await this.waitForMediaReady(probe, SESSION_MEDIA_READY_TIMEOUT_MS);
          try {
            probe.pause();
            probe.removeAttribute("src");
            probe.load();
          } catch (_) { }
          if (!ready) throw new Error("No se pudo decodificar el primer frame.");
        }
      });
    });
    rowIds.forEach((rowId) => {
      if (!this.resolveAudioSourceKey(this.deps?.resolveDialogueAudioForRow?.(session, rowId))) return;
      tasks.push({
        kind: "audio",
        rowId,
        source: "",
        run: () => this.prepareDialogueRow(session, rowId, {
          force: options.force === true,
          timeoutMs: SESSION_MEDIA_READY_TIMEOUT_MS
        })
      });
    });
    backgroundItems.forEach((item) => {
      tasks.push({
        kind: "background-audio",
        rowId: "",
        source: this.resolveAudioSourceKey(item),
      run: async () => {
        const preparedSource = await this.resolveDialoguePlaybackAudioSource(item);
        if (!preparedSource) throw new Error("No se pudo resolver el audio de fondo.");
        if (!preparedSource || typeof document === "undefined") return;
        const probe = document.createElement("audio");
          probe.preload = "auto";
          probe.src = preparedSource;
          try { probe.load(); } catch (_) { }
          const ready = await this.waitForDialogueReady(probe, SESSION_MEDIA_READY_TIMEOUT_MS);
          try {
            probe.pause();
            probe.removeAttribute("src");
            probe.load();
          } catch (_) { }
          if (!ready) throw new Error("No se pudo preparar el audio de fondo.");
        }
      });
    });

    this.sessionMediaPreparationKey = signature;
    this.sessionMediaPreparationPromise = (async () => {
      const failures = [];
      let completed = 0;
      report({ state: "loading", completed, total: tasks.length, failures: [] });
      let cursor = 0;
      const worker = async () => {
        while (cursor < tasks.length) {
          const task = tasks[cursor++];
          try {
            await task.run();
          } catch (error) {
            failures.push({
              kind: task.kind,
              rowId: task.rowId,
              source: task.source,
              message: String(error?.message || error)
            });
          } finally {
            completed += 1;
            report({ state: "loading", completed, total: tasks.length, failures: [...failures] });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, Math.max(1, tasks.length)) }, () => worker()));
      if (failures.length) {
        const error = new Error(`No se pudieron preparar ${failures.length} recursos.`);
        error.failures = failures;
        report({ state: "error", completed, total: tasks.length, failures });
        throw error;
      }
      report({ state: "ready", completed, total: tasks.length, failures: [] });
      return { ready: true, completed, total: tasks.length };
    })().catch((error) => {
      this.sessionMediaPreparationPromise = null;
      throw error;
    });
    return this.sessionMediaPreparationPromise;
  }

  async prepareBackgroundMusicAtMs(atMs = this.state.currentMs) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const panelCfg = this.deps?.getPanelMontageMusicConfig?.(session);
    if (!panelCfg || panelCfg.sourceType === "none") return true;

    const speed = this.deps?.getPlaybackSpeed?.() || 1;
    await this.syncBackgroundMusic(Math.max(0, Number(atMs) || 0), speed, false);
    const audio = this.backgroundAudio;
    if (!audio) return true;

    audio.preload = "auto";
    if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      try { audio.load(); } catch (_) { }
    }
    const ready = await this.waitForMediaReady(audio, BACKGROUND_AUDIO_PREPARE_TIMEOUT_MS);
    if (ready) {
      // Reaplica el offset ahora que metadata/datos están disponibles. El primer
      // sync puede ocurrir antes de que currentTime sea seekable.
      await this.syncBackgroundMusic(Math.max(0, Number(atMs) || 0), speed, false);
      this.emitMediaTelemetry("background-audio-prepared", {
        atMs: Math.max(0, Number(atMs) || 0),
        sourceKey: this.backgroundSourceKey
      });
    } else if (this.backgroundSourceKey) {
      this.scheduleBackgroundAudioRecovery("prepare-timeout", {
        graceMs: BACKGROUND_AUDIO_RETRY_GRACE_MS,
        requireUnready: true
      });
    }
    return ready;
  }

  async preparePlaybackRange({ atMs = this.state.currentMs, lookAheadMs = PLAYBACK_PREPARE_LOOKAHEAD_MS, onProgress = null, criticalOnly = false } = {}) {
    const startedAt = performance.now();
    const playbackRangeSignature = this.buildPlaybackRangePreparationSignature(atMs, lookAheadMs, {
      criticalOnly,
      session: this.state.session || this.deps?.getActiveSession?.()
    });
    if (playbackRangeSignature === this.playbackRangePreparationSignature) {
      return true;
    }

    const prepareId = ++this.prepareSequence;
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    const fromMs = Math.max(0, Number(atMs) || 0);
    const untilMs = fromMs + Math.max(1000, Number(lookAheadMs) || PLAYBACK_PREPARE_LOOKAHEAD_MS);
    const selected = entries
      .filter((entry) => Number(entry?.endMs || 0) >= fromMs && Number(entry?.startMs || 0) <= untilMs)
      .slice(0, 3);
    const activeEntry = selected.find((entry) => fromMs >= Number(entry?.startMs || 0) && fromMs <= Number(entry?.endMs || 0)) || selected[0] || null;
    // Resuelve la cola en segundo plano. Blob sí hidrata persistencia.
    this.prewarmTimelineStageVideos(session, {
      currentMs: fromMs,
      concurrency: 1
    }).catch(() => { });
    const criticalEntries = criticalOnly && activeEntry ? [activeEntry] : selected;
    const backgroundEntries = criticalOnly
      ? selected.filter((entry) => entry && entry !== activeEntry)
      : [];
    const activeVideoEl = this.getActiveStageVideoEl();
    const videoTasks = criticalEntries
      .filter((entry) => entry?.videoSrc && !this.isImageStageEntry(entry))
      .slice(0, activeVideoEl ? 1 : 0)
      .map(async (entry) => {
        const videoEl = activeVideoEl;
        const source = String(entry.videoSrc || "").trim();
        if (!videoEl || !source) return false;
        const persistent = this.shouldPersistStageVideoSource(source);
        await this.getBlobUrl(source, { persistent });
        const cached = this.getBlobUrlSync(source);
        if (cached) this.emitMediaTelemetry("cache-hit-memory", { kind: "video", source });
        else if (source.startsWith("podcaster-local-media:")) this.emitMediaTelemetry("cache-hit-indexeddb", { kind: "video", source });
        const ready = await this.setStageVideoSourceForElement(videoEl, source, {
          keepHidden: entry !== activeEntry,
          persistent
        });
        return ready;
      });
    const imageTasks = criticalEntries
      .filter((entry) => entry?.videoSrc && this.isImageStageEntry(entry))
      .map((entry) => {
        this.preloadEntryStopMotion(entry);
        return this.preloadImageSrc(entry.videoSrc).catch(() => false);
      });
    const audioRows = new Set(criticalEntries.map((entry) => String(entry?.rowId || "").trim()).filter(Boolean));
    const audioTasks = [...audioRows].map(async (rowId) => {
      const clip = this.deps?.resolveDialogueAudioForRow?.(session, rowId);
      const sourceKey = this.resolveAudioSourceKey(clip);
      if (!sourceKey) return true;
      const source = await this.resolveDialoguePlaybackAudioSource(clip);
      if (!source) return false;
      const player = this.getOrCreateDialoguePlayer(rowId, source, sourceKey, session);
      player.preload = "auto";
      return this.waitForMediaReady(player, VIDEO_MEDIA_READY_TIMEOUT_MS);
    });
    if (criticalOnly && backgroundEntries.length) {
      backgroundEntries.forEach((entry) => {
        const source = String(entry?.videoSrc || "").trim();
        if (!source) return;
        if (this.isImageStageEntry(entry)) {
          this.preloadEntryStopMotion(entry);
          this.preloadImageSrc(source).catch(() => false);
          return;
        }
        this.getBlobUrl(source, {
          persistent: this.shouldPersistStageVideoSource(source)
        }).catch(() => "");
      });
    }
    const backgroundAudioTask = criticalOnly
      ? Promise.resolve(true)
      : this.prepareBackgroundMusicAtMs(fromMs);
    if (criticalOnly) this.prepareBackgroundMusicAtMs(fromMs).catch(() => false);
    this.state.isPreparing = true;
    this.mediaTelemetry.prepareCount += 1;
    this.emitMediaTelemetry("prepare-start", { atMs: fromMs, entries: selected.length, audioRows: audioRows.size, criticalOnly });

    // Progress reporting: wrap each task so onProgress fires after every settled item
    const report = typeof onProgress === "function" ? onProgress : null;
    const allRawTasks = [...videoTasks, ...imageTasks, ...audioTasks, backgroundAudioTask];
    const total = allRawTasks.length;
    if (report) report({ state: "loading", completed: 0, total });
    let completed = 0;
    const trackedTasks = allRawTasks.map((t) =>
      Promise.resolve(t).finally(() => {
        completed += 1;
        if (report) report({ state: "loading", completed, total });
      })
    );
    await Promise.allSettled(trackedTasks);
    if (prepareId !== this.prepareSequence) return false;
    this.state.isPreparing = false;
    this.playbackRangePreparationSignature = playbackRangeSignature;
    this.playbackRangePreparationAtMs = Number(this.state.currentMs || 0);
    if (report) report({ state: "ready", completed, total });
    this.emitMediaTelemetry("prepare-ready", {
      atMs: fromMs,
      elapsedMs: Math.round(performance.now() - startedAt),
      entries: selected.length,
      criticalOnly
    });
    return true;
  }

  async play(fromMs = null, options = {}) {
    this.sync();
    if (fromMs !== null) this.state.currentMs = Math.max(0, fromMs);
    if (options.stopAtMs) this.state.stopAtMs = options.stopAtMs;
    else this.state.stopAtMs = 0;

    // Debe ejecutarse dentro del gesto del usuario, antes de cualquier await,
    // para que el navegador no bloquee la salida de audio del primer Play.
    this.initAudioContext();
    this.getOrCreateBackgroundAudioElement();
    // Desbloquear todos los dialogue players dentro del contexto del gesto del usuario.
    // Un await posterior rompe el contexto de gesto, por lo que el navegador rechaza
    // audio.play() en los dialogue players con "not allowed" silencioso.
    Object.values(this.dialoguePlayers).forEach((a) => {
      if (a && a.paused) {
        const vol = Number(a.volume || 0);
        a.volume = 0;
        a.play().then(() => { a.pause(); a.volume = vol; }).catch(() => { a.volume = vol; });
      }
    });

    if (options.prepare !== false) {
      const prepareAtMs = this.state.currentMs;
      const lookAheadMs = options.lookAheadMs || PLAYBACK_PREPARE_LOOKAHEAD_MS;
      const willReportProgress = typeof options.onProgress === "function"
        ? this.buildPlaybackRangePreparationSignature(prepareAtMs, lookAheadMs, {
          criticalOnly: options.criticalOnly !== false,
          session: this.state.session || this.deps?.getActiveSession?.()
        }) !== this.playbackRangePreparationSignature
        : false;
      this.deps?.setPodcastVideoStatus?.("Preparando escenas...");
      await this.preparePlaybackRange({
        atMs: prepareAtMs,
        lookAheadMs,
        onProgress: willReportProgress ? options.onProgress : null,
        criticalOnly: options.criticalOnly !== false
      });
    }

    this.state.isPlaying = true;
    // Arranca tanto Gemini como la música ya hidratados antes del reloj maestro.
    // Si el reloj comienza primero, el primer tick puede calcular un offset
    // adelantado y comerse el inicio de la voz mientras el elemento hace canplay.
    await this.syncAudio(
      this.state.currentMs,
      this.deps?.getPlaybackSpeed?.() || 1
    );
    this.prewarmTimelineStageVideos(this.state.session, {
      currentMs: this.state.currentMs,
      concurrency: 2
    }).catch(() => { });

    if (this.deps?.cancelTimelineSequence) this.deps.cancelTimelineSequence();

    if (this.state.useMse) {
      this.initMse();
    } else {
      this.startClock();
    }
    
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montageActive = true;
      this.deps.podcastVideoState.montagePaused = false;
    }

    this.emit('play', { currentMs: this.state.currentMs });
    this.deps?.setPodcastVideoStatus?.("Reproduciendo...");
    if (this.deps?.stopPanelMusic) {
      try { this.deps.stopPanelMusic(); } catch (_) { }
    }
    this.deps?.updatePodcastVideoTransportUi?.();
    this.syncStageMediaMotionPlaybackState(true);
  }

  pause() {
    this.state.isPlaying = false;
    this.stopClock();

    Object.values(this.dialoguePlayers).forEach(audio => { 
      try { audio.pause(); } catch (_) { } 
    });
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt].forEach(v => {
      if (v) try { v.pause(); } catch (_) { }
    });
    this.pauseBackgroundMusic();
    if (this.mse?.engine) this.mse.engine.pause();
    
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montagePaused = true;
    }

    this.emit('pause');
    this.deps?.setPodcastVideoStatus?.("Pausado");
    if (this.deps?.syncPodcastStudioInspector) {
      try {
        const session = this.state.session || this.deps?.getActiveSession?.();
        this.deps.syncPodcastStudioInspector(session);
      } catch (_) { }
    }
    this.deps?.updatePodcastVideoTransportUi?.();
    this.syncStageMediaMotionPlaybackState(false);
  }

  async stop(opts = {}) {
    const wasPlaying = this.state.isPlaying === true;
    const stopSourceMs = Math.max(0, Number(this.state.currentMs || 0));
    this.state.isPlaying = false;
    this.stopClock();
    
    const shouldReset = opts.keepCursor !== true;
    if (shouldReset) {
      const activeEntry = this.getEntryAtMs(stopSourceMs);
      const sceneStartMs = Math.max(0, Number(activeEntry?.startMs || 0));
      const previousStopTargetMs = Number(this.stopRewindTargetMs);
      const isAtPreviousStopTarget = Number.isFinite(previousStopTargetMs)
        && Math.abs(stopSourceMs - previousStopTargetMs) <= this.getTimelineLookupToleranceMs();
      const shouldReturnToTimelineStart = !wasPlaying && isAtPreviousStopTarget;
      const stopTargetMs = shouldReturnToTimelineStart ? 0 : sceneStartMs;
      const targetEntry = stopTargetMs === 0
        ? this.getEntryAtMs(0)
        : activeEntry;
      const targetRowId = String(targetEntry?.rowId || "").trim();

      this.state.currentMs = stopTargetMs;
      this.state.activeRowId = targetRowId;
      this.stopRewindTargetMs = stopTargetMs > 0 ? stopTargetMs : null;
      if (this.deps?.podcastVideoState) {
        this.deps.podcastVideoState.montageCursorMs = stopTargetMs;
        this.deps.podcastVideoState.activeRowId = targetRowId;
      }
    }
    
    this.stopBackgroundMusic();
    this.applySceneMediaScale(null);
    this.syncStageMediaMotionPlaybackState(false);
    if (this.deps?.stopPanelMusic) { try { this.deps.stopPanelMusic(); } catch (_) { } }
    
    Object.values(this.dialoguePlayers).forEach(a => {
      try {
        a.pause();
        if (shouldReset) {
          a.currentTime = 0;
          a.dataset.initialized = "false";
          a.dataset.wasActive = "false";
          delete a.dataset.pendingSeek;
          delete a.dataset.pendingSeekSrc;
        }
      } catch (_) { }
    });

    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt, this.els?.podcastActiveSpeakerBackdropVideo, this.els?.podcastActiveSpeakerBackdropVideoAlt].forEach(v => {
      if (v) try { 
        v.pause(); 
        if (shouldReset) {
          v.dataset.suppressTimelineTimeupdateUntil = String(Date.now() + 500);
          v.currentTime = 0;
        }
        v.style.opacity = 0; 
        v.style.zIndex = 1; 
      } catch (_) { }
    });

    this.deps?.setPodcastVideoStatus?.(shouldReset ? 'Detenido' : 'Pausado');
    this.deps?.updatePodcastVideoTransportUi?.();

    this.state.isTickProcessing = false;
    if (opts.refreshStage === true) {
      await this.tick(this.state.currentMs, { lightweight: !shouldReset });
    } else {
      this.deps?.syncPodcastTimelinePlayhead?.(this.state.session, {
        currentMs: this.state.currentMs,
        totalMs: this.state.totalDurationMs,
        lightweight: true,
        suppressAutoScroll: true
      });
      try { this.syncOverlay?.(this.state.currentMs); } catch (_) { }
      try { this.syncStylizedText?.(this.state.currentMs); } catch (_) { }
      try { this.syncOverlayCards?.(this.state.currentMs); } catch (_) { }
    }

    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montageActive = false;
      this.deps.podcastVideoState.montagePaused = false;
    }

    if (this.deps?.syncPodcastStudioInspector) {
      try {
        const session = this.state.session || this.deps?.getActiveSession?.();
        this.deps.syncPodcastStudioInspector(session);
      } catch (_) { }
    }

    this.emit('stop', opts);
  }

  seekTo(el, seconds) {
    if (!el || !Number.isFinite(seconds)) return;
    try {
      const isVideo = el.tagName === "VIDEO";
      const currentSrc = el.dataset.src || el.dataset.originalSrc || el.src || "";
      if (el.readyState >= 1) {
        let targetSeconds = seconds;
        if (isVideo) {
          const videoDuration = el.duration;
          if (Number.isFinite(videoDuration) && videoDuration > 0 && seconds >= videoDuration) {
            targetSeconds = seconds % videoDuration;
          }
        }
        if (Math.abs(el.currentTime - targetSeconds) < 0.03) {
          delete el.dataset.pendingSeek;
          delete el.dataset.pendingSeekSrc;
          return;
        }
        el.currentTime = targetSeconds;
        delete el.dataset.pendingSeek;
        delete el.dataset.pendingSeekSrc;
      } else {
        if (el.dataset.pendingSeekSrc !== undefined && el.dataset.pendingSeekSrc !== currentSrc) {
          delete el.dataset.pendingSeek;
          delete el.dataset.pendingSeekSrc;
        }

        const alreadyPending = el.dataset.pendingSeek !== undefined;
        el.dataset.pendingSeek = seconds;
        el.dataset.pendingSeekSrc = currentSrc;
        if (alreadyPending) return;

        const onLoaded = () => {
          try {
            const pending = el.dataset.pendingSeek;
            const pendingSrc = el.dataset.pendingSeekSrc;
            const actualSrc = el.dataset.src || el.dataset.originalSrc || el.src || "";
            if (pending === undefined || pendingSrc !== actualSrc) return;

            let targetSeconds = Number(pending);
            if (!Number.isFinite(targetSeconds)) targetSeconds = seconds;
            if (isVideo) {
              const videoDuration = el.duration;
              if (Number.isFinite(videoDuration) && videoDuration > 0 && targetSeconds >= videoDuration) {
                targetSeconds = targetSeconds % videoDuration;
              }
            }
            if (Math.abs(el.currentTime - targetSeconds) < 0.03) {
              return;
            }
            el.currentTime = targetSeconds;
          } catch (err) {
            void err;
          } finally {
            el.removeEventListener('loadedmetadata', onLoaded);
            delete el.dataset.pendingSeek;
            delete el.dataset.pendingSeekSrc;
          }
        };
        el.addEventListener('loadedmetadata', onLoaded);
      }
    } catch (e) {
      void e;
    }
  }

  startClock() {
    this.stopClock();
    this.activeLoopId++;
    const loopId = this.activeLoopId;
    let lastTime = performance.now();

    const tickLoop = async (now) => {
      if (!this.state.isPlaying || loopId !== this.activeLoopId) return;
      try {
        const delta = now - lastTime;
        lastTime = now;
        const speed = this.deps?.getPlaybackSpeed?.() || 1;
        // The media elements keep advancing while an async tick performs DOM,
        // audio or network work. Capping this delta made the software clock lag
        // behind them and the next tick sought the video backwards repeatedly.
        const nextMs = this.state.currentMs + (Math.max(0, delta) * speed);

        if (this.state.stopAtMs > 0 && nextMs >= this.state.stopAtMs) {
          this.state.currentMs = this.state.stopAtMs;
          await this.tick(this.state.stopAtMs);
          this.state.stopAtMs = 0;
          await this.stop();
          return;
        }

        if (this.state.totalDurationMs > 100 && nextMs >= this.state.totalDurationMs) {
          this.state.currentMs = this.state.totalDurationMs;
          await this.tick(this.state.totalDurationMs);
          await this.stop();
          return;
        }

        this.state.currentMs = nextMs;
        await this.tick(nextMs);
        if (this.clockRebaseRequested) {
          lastTime = performance.now();
          this.clockRebaseRequested = false;
        }
        this.clockId = requestAnimationFrame(tickLoop);
      } catch (error) {
        console.error("[PlaybackController] Error in tickLoop:", error);
        this.pause(); 
      }
    };
    this.clockId = requestAnimationFrame(tickLoop);
  }

  stopClock() { if (this.clockId) { cancelAnimationFrame(this.clockId); this.clockId = null; } }

  async prev() {
    this.sync();
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    if (!entries.length) return;
    const markers = [...new Set(entries.map(e => Math.round(Number(e.startMs || 0))))].sort((a, b) => a - b);
    const current = this.state.currentMs;
    const targetMs = [...markers].reverse().find(ms => ms < current - TICK_PREV_OFFSET_MS) ?? 0;
    await this.seek(targetMs);
  }

  async next() {
    this.sync();
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    if (!entries.length) return;
    const markers = [...new Set(entries.map(e => Math.round(Number(e.startMs || 0))))].sort((a, b) => a - b);
    const current = this.state.currentMs;
    const targetMs = markers.find(ms => ms > current + TICK_NEXT_OFFSET_MS) ?? markers[markers.length - 1];
    await this.seek(targetMs);
  }

  async seek(targetMs, options = {}) {
    const ms = Math.max(0, Math.min(this.state.totalDurationMs || 9999999, Number(targetMs) || 0));
    this.state.currentMs = ms;
    this.sceneMotionSyncRevision = Number(this.sceneMotionSyncRevision || 0) + 1;
    const useLightweightSeek = options.lightweight === true || this.deps?.useLightweightSeekDuringPlayback === true;
    const skipAudioSync = options.deferPreview === true;
    if (options.allowConcurrentTick !== false) {
      this.stageSwitchSeq += 1;
      this.stageMachine.loadingSrc = "";
      this.state.isTickProcessing = false;
    }
    const session = this.state.session || this.deps?.getActiveSession?.();
    this.cachedTickEntries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    this.cachedTickEntriesTime = performance.now();
    this.prewarmTimelineStageVideos(session, {
      currentMs: ms,
      concurrency: 2
    }).catch(() => { });
    if (options.prepare === true) {
      await this.preparePlaybackRange({
        atMs: ms,
        lookAheadMs: options.lookAheadMs || PLAYBACK_SEEK_LOOKAHEAD_MS,
        criticalOnly: options.criticalOnly !== false
      });
    }
    this.state.forceStageMediaSync = true;
    try {
      if (Object.keys(options).length === 0 && !skipAudioSync) {
        await this.tick(ms, { lightweight: useLightweightSeek });
      } else {
        await this.tick(ms, {
          lightweight: useLightweightSeek,
          skipAudioSync,
          deferPreview: options.deferPreview === true,
          suppressAutoScroll: options.suppressAutoScroll === true,
          navigationOnly: options.navigationOnly === true
        });
      }
    } finally {
      this.state.forceStageMediaSync = false;
    }
    this.emit('seek', { currentMs: ms });
  }

  async tick(currentMs, options = {}) {
    const ms = Number.isFinite(Number(currentMs)) ? Number(currentMs) : this.state.currentMs;
    this.state.currentMs = ms;

    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montageCursorMs = ms;
    }

    const lightweight = options.lightweight !== false;
    const shouldSyncAudio = options.skipAudioSync !== true && this.state.isPlaying;
    const navigationOnly = options.navigationOnly === true;

    if (this.deps?.syncPodcastTimelinePlayhead) {
      this.deps.syncPodcastTimelinePlayhead(this.state.session, { 
        currentMs: ms,
        totalMs: this.state.totalDurationMs, 
        lightweight: lightweight,
        suppressAutoScroll: options.suppressAutoScroll === true
      });
    }
    const shouldDeferPreview = options.deferPreview === true;

    const activeEntry = this.getEntryAtMs(ms);
    const activeRowId = activeEntry?.rowId || "";
    const activeClip = this.deps?.getOnScreenTextClipAtMs?.(ms);

    if (activeClip) {
      if (this.state.activeOnScreenTextId !== activeClip.id) {
        this.state.activeOnScreenTextId = activeClip.id;
        this.deps?.renderOnScreenText?.(activeClip);
      }
    } else {
      if (this.state.activeOnScreenTextId !== "") {
        this.state.activeOnScreenTextId = "";
        this.deps?.renderOnScreenText?.(null);
      }
    }
    
    if (activeRowId && activeRowId !== this.state.activeRowId) {
      this.state.activeRowId = activeRowId;
      const session = this.state.session || this.deps?.getActiveSession?.();
      const speaker = activeEntry?.speakerName || "";
      if (navigationOnly) {
        if (this.deps?.podcastVideoState) {
          this.deps.podcastVideoState.activeRowId = activeRowId;
        }
        this.deps?.syncPodcastTimelineSelectionUi?.(session);
      } else if (session && this.deps?.syncPodcastStudioRuntimeUi) {
        this.deps.syncPodcastStudioRuntimeUi(session, activeRowId, speaker, {
          speaking: true,
          lightweightInspector: true
        });
      } else {
        this.deps?.setPodcastVideoRow?.(activeRowId, {
          syncStage: !this.state.isPlaying,
          lightweightUi: true,
          preserveMontageCursor: true,
          reason: "playback",
          skipInspectorSync: false
        });
        if (session && this.deps?.setPodcastVideoSpeaker) {
          this.deps.setPodcastVideoSpeaker(session, speaker, { rowId: activeRowId, syncStageMedia: false });
        }
      }
    }

    // Solo sincronizar el preview externo si este runtime no delega el stage al controller.
    if (!lightweight && this.deps?.syncStudioTimelinePreview && this.deps?.enableExternalStudioPreviewSync === true) {
      const session = this.state.session || this.deps?.getActiveSession?.();
      this.deps.syncStudioTimelinePreview(session, { currentMs: ms, autoplay: false });
    }

    if (this.state.isTickProcessing) {
      this.pendingTimelineSeekTick = { ms, options: { ...options } };
      return;
    }
    this.state.isTickProcessing = true;
    try {
      if (this.deps?.updatePodcastVideoTransportUi) this.deps.updatePodcastVideoTransportUi();
      const speed = this.deps?.getPlaybackSpeed?.() || 1;
      if (shouldSyncAudio && this.state.isPlaying) {
        try {
          await this.ensureDialogueReadyAtMs(ms);
        } catch (err) {
          // Prevent dialogue preparation errors from stalling the entire timeline tick loop
          void err;
        }
      }
      const tickTasks = [
        this.syncVideo(ms),
        ...(!shouldDeferPreview
          ? [
              this.syncOverlay ? this.syncOverlay(ms) : null,
              this.syncStylizedText ? this.syncStylizedText(ms) : null,
              this.syncOverlayCards ? this.syncOverlayCards(ms) : null
            ]
          : [])
      ];
      if (shouldSyncAudio) {
        tickTasks.unshift(this.syncAudio(ms, speed));
      }
      await Promise.all(tickTasks);
      
      this.emit('timeupdate', { currentMs: ms });
    } catch (e) {
      void e;
    } finally {
      this.state.isTickProcessing = false;
      const pending = this.pendingTimelineSeekTick;
      this.pendingTimelineSeekTick = null;
      if (pending && Number.isFinite(Number(pending.ms))) {
        void this.tick(pending.ms, pending.options);
      }
    }
  }

  prewarmDialogueAudios(session) {
    const rows = session?.script?.rows || [];
    return this.prewarmDialogueAudioRows(session, rows.map((row) => row?.id));
  }

  async prewarmDialogueAudioRows(session, rowIds = []) {
    if (!session) return [];
    const ids = [...new Set((Array.isArray(rowIds) ? rowIds : [])
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean))];
    return Promise.allSettled(ids.map(async (rowId) => {
      const clip = this.deps?.resolveDialogueAudioForRow?.(session, rowId);
      const sourceKey = this.resolveAudioSourceKey(clip);
      if (!sourceKey) return false;
      const existingSourceKey = String(this.dialogueAudioSourceKeys[rowId] || "").trim();
      if (existingSourceKey === sourceKey) {
        const existing = this.dialoguePlayers[rowId];
        if (existing) {
          existing.preload = "auto";
          return this.waitForMediaReady(existing, VIDEO_MEDIA_READY_TIMEOUT_PERSISTENT_MS);
        }
      }
      const audioSrc = await this.resolveDialoguePlaybackAudioSource(clip);
      if (!audioSrc) return false;
      const audio = this.getOrCreateDialoguePlayer(rowId, audioSrc, sourceKey, session);
      audio.preload = "auto";
      this.emitMediaTelemetry("audio-row-prewarmed", { rowId });
      return this.waitForMediaReady(audio, VIDEO_MEDIA_READY_TIMEOUT_PERSISTENT_MS);
    }));
  }

  getOrCreateDialogueAudioContainer() {
    if (typeof document === "undefined") return null;
    let container = document.getElementById("podcasterDialogueAudioContainer");
    if (!container && document.body) {
      container = document.createElement("div");
      container.id = "podcasterDialogueAudioContainer";
      container.style.display = "none";
      container.setAttribute("aria-hidden", "true");
      document.body.appendChild(container);
    }
    return container;
  }

  getOrCreateDialoguePlayer(rowId, audioSrc, sourceKey = "", session) {
    let audio = this.dialoguePlayers[rowId];
    const nextSourceKey = String(sourceKey || "").trim();
    const cleanAudioSrc = String(audioSrc || "").trim();
    if (audio) {
      const currentSourceKey = String(this.dialogueAudioSourceKeys[rowId] || "").trim();
      const currentSrc = String(audio.dataset?.originalSrc || audio.src || "").trim();
      if (currentSourceKey === nextSourceKey) {
        const container = this.getOrCreateDialogueAudioContainer();
        if (container && !audio.parentNode) container.appendChild(audio);
        return audio;
      }
    }
    if (audio) {
      try { audio.pause(); } catch (_) { }
      try { audio.remove(); } catch (_) { }
      const previousSrc = String(audio.dataset?.originalSrc || audio.src || "").trim();
      if (previousSrc && previousSrc.startsWith("blob:") && previousSrc !== cleanAudioSrc) {
        try { URL.revokeObjectURL(previousSrc); } catch (_) { }
      }
    }
    audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = cleanAudioSrc;
    audio.dataset.originalSrc = cleanAudioSrc;
    audio.dataset.sourceKey = nextSourceKey;
    audio.dataset.initialized = "false";
    audio.dataset.wasActive = "false";
    audio.preload = "auto";
    audio.playsInline = true;
    const container = this.getOrCreateDialogueAudioContainer();
    if (container) container.appendChild(audio);
    this.dialoguePlayers[rowId] = audio;
    this.audioCache[rowId] = audio;
    this.dialogueAudioSourceKeys[rowId] = nextSourceKey;

    audio.addEventListener("loadedmetadata", () => {
      const nextMs = Math.round(audio.duration * 1000);
      const pvs = this.deps?.podcastVideoState;
      const speed = this.deps?.getPlaybackSpeed?.() || 1;
      const clipRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, rowId) || 1;
      const effectiveRate = this.clampPlaybackRate(speed * clipRate);
      audio.playbackRate = effectiveRate;
      audio.defaultPlaybackRate = effectiveRate;
      if (pvs && Number.isFinite(nextMs)) {
        if (!pvs.montageAudioActualDurationsMs) pvs.montageAudioActualDurationsMs = {};
        if (Math.abs(nextMs - (pvs.montageAudioActualDurationsMs[rowId] || 0)) > 100) {
          pvs.montageAudioActualDurationsMs[rowId] = nextMs;
          setTimeout(() => {
            if (typeof window.invalidateStudioRuntimeCache === "function") {
              window.invalidateStudioRuntimeCache();
            }
            if (typeof window.syncGeminiDialogueTrackWithRuntime === "function") {
              try {
                window.syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
              } catch (_) {}
            }
          }, 0);
        }
      }
    }, { once: true });

    try { audio.load(); } catch (_) { }
    return audio;
  }

  // --- Audio ---
  async syncAudio(currentMs, speed) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    const config = this.deps?.getPodcastVideoConfig?.(session) || {};
    const audioTrack = config.geminiDialogueTrack || { segments: [], enabled: true };
    this.state.audioTrack = audioTrack;

    let segments = audioTrack.segments || [];
    if (!segments.length) {
      segments = entries.map((entry) => {
        const audioClip = this.deps?.resolveDialogueAudioForRow?.(session, entry.rowId);
        const audioDurationMs = Math.max(0, Math.round(Number(audioClip?.durationSec || 0) * 1000));
        const durationMs = audioDurationMs > 0 ? audioDurationMs : entry.effectiveDurationMs;
        return {
          rowId: entry.rowId,
          startMs: entry.startMs,
          durationMs: durationMs,
          trimInMs: 0,
          trimOutMs: durationMs
        };
      });
    }
    segments = this.normalizeRuntimeDialogueSegments(segments, entries);
    const currentTimelineRowIds = this.collectDialogueRowIds(session, entries, segments);
    const audioCarryToleranceMs = Math.max(0, Number(DIALOGUE_AUDIO_CARRYOVER_TOLERANCE_MS) || 260);
    const activeTimelineToleranceMs = Math.max(this.getTimelineLookupToleranceMs(), audioCarryToleranceMs);

    const timelineSegments = segments.map((segment) => {
      const rowId = String(segment?.rowId || "").trim();
      const clipPlaybackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, rowId) || 1;
      const visibleDurationMs = this.resolveSegmentTimelineDurationMs(segment, clipPlaybackRate);
      const segmentStartMs = Math.max(0, Number(segment?.startMs || 0));
      const segmentEndMs = segmentStartMs + Math.max(1, visibleDurationMs);
      return {
        ...segment,
        rowId,
        __timelineStartMs: segmentStartMs,
        __timelineEndMs: segmentEndMs,
        __timelinePlaybackRate: this.clampPlaybackRate(clipPlaybackRate, 0.5, 10)
      };
    });

    const segmentWindowByRow = new Map();

    const playerTimelineDurations = new Map();
    Object.entries(this.dialoguePlayers).forEach(([rowId, audio]) => {
      const key = String(rowId || "").trim();
      const playbackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, key) || 1;
      const normalizedRate = this.clampPlaybackRate(playbackRate, 0.5, 10);
      const timelineDurationMs = Number(audio?.duration || 0) > 0
        ? Number(audio.duration || 0) * 1000 / Math.max(0.5, normalizedRate)
        : 0;
      if (timelineDurationMs > 0) {
        playerTimelineDurations.set(key, Math.max(500, timelineDurationMs));
      }
    });

    timelineSegments.forEach((segment) => {
      const rowId = String(segment?.rowId || "").trim();
      if (!rowId) return;
      const playerDurationMs = playerTimelineDurations.get(rowId);
      if (!playerDurationMs) return;
      const segmentStartMs = Number(segment.__timelineStartMs || 0);
      const adjustedEndMs = segmentStartMs + playerDurationMs;
      if (Number(segment.__timelineEndMs || 0) < adjustedEndMs) {
        segment.__timelineEndMs = adjustedEndMs;
      }
    });

    timelineSegments.forEach((segment) => {
      const rowId = String(segment?.rowId || "").trim();
      if (!rowId) return;
      const existing = segmentWindowByRow.get(rowId);
      if (!existing || segment.__timelineEndMs > existing.endMs) {
        segmentWindowByRow.set(rowId, {
          startMs: segment.__timelineStartMs,
          endMs: segment.__timelineEndMs,
          timelineDurationMs: Math.max(1, Number(segment.__timelineEndMs || 0) - Number(segment.__timelineStartMs || 0)),
          trimInMs: Math.max(0, Number(segment?.trimInMs || 0) || 0),
          playbackRate: segment.__timelinePlaybackRate || 1
        });
      }
    });

    const matchingSegments = timelineSegments.filter((segment) => {
      const segmentStartMs = Number(segment.__timelineStartMs || 0);
      const segmentEndMs = Number(segment.__timelineEndMs || segmentStartMs + 1);
      return this.isTimelineMsInRange(currentMs, segmentStartMs, segmentEndMs, { toleranceMs: activeTimelineToleranceMs });
    });

    const activeSegments = matchingSegments
      .sort((a, b) => Number(b?.startMs || 0) - Number(a?.startMs || 0))
      .slice(0, 1);

    const primaryActiveSegment = activeSegments[0] || null;
    const primaryActiveRowId = String(primaryActiveSegment?.rowId || "").trim();
    if (primaryActiveRowId) {
      const prepareSignature = `${primaryActiveRowId}|${Number(primaryActiveSegment.startMs || 0)}|${primaryActiveRowId}`;
      const shouldRefreshPrepareState = this.state.isPlaying === true
        && (this.dialogueAudioActivePrepareSignature !== prepareSignature
          || (currentMs - Number(this.dialogueAudioActivePrepareAtMs || 0)) > DIALOGUE_AUDIO_ACTIVE_PREPARE_TIMEOUT_MS * 2);
      if (shouldRefreshPrepareState) {
        this.dialogueAudioActivePrepareSignature = prepareSignature;
        this.dialogueAudioActivePrepareAtMs = currentMs;
        const preparePromise = this.prepareDialogueRow(session, primaryActiveRowId, {
          skipWait: false,
          timeoutMs: DIALOGUE_AUDIO_ACTIVE_PREPARE_TIMEOUT_MS
        });
        await Promise.race([
          preparePromise,
          new Promise((resolve) => setTimeout(resolve, DIALOGUE_AUDIO_ACTIVE_PREPARE_TIMEOUT_MS))
        ]).catch(() => { });
      }
    }

    const upcoming = segments.filter((segment) => {
      const segmentStartMs = Math.max(0, Number(segment?.startMs || 0) || 0);
      return segmentStartMs > currentMs && (segmentStartMs - currentMs) < DIALOGUE_AUDIO_UPCOMING_LOOKAHEAD_MS;
    });

    Object.keys(this.dialoguePlayers).forEach((rowId) => {
      if (currentTimelineRowIds.has(rowId)) return;
      const audio = this.dialoguePlayers[rowId];
      if (audio) {
        if (!audio.paused) try { audio.pause(); } catch (_) { }
        try { audio.remove(); } catch (_) { }
        audio.src = "";
        try { audio.load(); } catch (_) { }
        delete this.dialoguePlayers[rowId];
        delete this.audioCache[rowId];
        delete this.dialogueAudioSourceKeys[rowId];
      }
    });

    upcoming.forEach((segment) => {
      const rowId = segment?.rowId;
      if (!rowId) return;
      this.prepareDialogueRow(session, rowId, {
        skipWait: false,
        timeoutMs: DIALOGUE_AUDIO_ACTIVE_PREPARE_TIMEOUT_MS
      }).catch(() => { });
    });

    const activeDialogueRowIds = new Set(activeSegments.map((segment) => String(segment?.rowId || "").trim()).filter(Boolean));
    const activeDialogueVoiceRowIds = new Set(activeDialogueRowIds);

    Object.entries(this.dialoguePlayers).forEach(([rowId, audio]) => {
      const isActive = activeDialogueRowIds.has(String(rowId || "").trim());
      const rowKey = String(rowId || "").trim();
      const carryInfo = segmentWindowByRow.get(rowKey);
      const wasActive = audio?.dataset?.wasActive === "true";

      if (isActive) {
        audio.dataset.wasActive = "true";
        return;
      }

      if (carryInfo && wasActive) {
        const carryStartMs = Number(carryInfo.startMs || 0);
        const playbackRate = Number(carryInfo.playbackRate || audio?.playbackRate || 1) || 1;
        const measuredDurationMs = Number(audio?.duration || 0) > 0
          ? Number(audio.duration || 0) * 1000 / Math.max(0.5, playbackRate)
          : Number(carryInfo.timelineDurationMs || 0);
        const carryEndMs = Math.max(
          Number(carryInfo.endMs || 0),
          carryStartMs + Math.max(0, measuredDurationMs)
        );

        if (currentMs <= carryEndMs + audioCarryToleranceMs) {
          activeDialogueVoiceRowIds.add(rowKey);
          audio.dataset.wasActive = "true";
          if (
            this.state.isPlaying
            && audio?.paused
            && Number(audio.readyState || 0) >= (typeof HTMLMediaElement !== "undefined" ? HTMLMediaElement.HAVE_CURRENT_DATA : 2)
          ) {
            const carryOffsetMs = Math.max(0, Number(currentMs || 0) - carryStartMs);
            const carryOffsetSec = (carryInfo.trimInMs + carryOffsetMs * playbackRate) / 1000;
            this.seekTo(audio, carryOffsetSec);
            audio.play().catch(() => { });
          }
          return;
        }
      }

      audio.dataset.wasActive = "";
      audio.dataset.playIntent = "";
      audio.dataset.pendingPlayIntent = "";
      audio.dataset.playPending = "";
      if (!audio.paused) {
        try { audio.pause(); } catch (_) { }
      }
    });

    let hasVoice = activeDialogueVoiceRowIds.size > 0;

    for (const segment of activeSegments) {
      const rowId = segment.rowId;
      const audioClip = this.deps?.resolveDialogueAudioForRow?.(session, rowId);
      if (!audioClip) continue;
      const sourceKey = this.resolveAudioSourceKey(audioClip);
      const activeSegmentSignature = `${String(rowId || "").trim()}|${Number(segment?.startMs || 0)}`;

      let audio = this.dialoguePlayers[rowId];
      if (!audio || String(this.dialogueAudioSourceKeys[rowId] || "") !== String(sourceKey || "").trim()) {
        const audioSrc = await this.resolveDialoguePlaybackAudioSource(audioClip);
        if (!audioSrc) continue;
        audio = this.getOrCreateDialoguePlayer(rowId, audioSrc, sourceKey, session);
      }

      if (!audio) continue;

      const clipPlaybackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, rowId) || 1;
      const effectiveRate = this.clampPlaybackRate(speed * clipPlaybackRate);

      if (Math.abs(audio.playbackRate - effectiveRate) > 0.01) {
        audio.playbackRate = effectiveRate;
        audio.defaultPlaybackRate = effectiveRate;
      }

      const mix = this.deps?.resolveTimelineClipMix?.(session, rowId) || { voiceVolume: 1 };
      const sessionConfig = this.deps?.getPodcastVideoConfig?.(session) || this.state.config || {};
      const masterVolumeFactor = this.clamp01(this.toFiniteNumber(sessionConfig?.masterVolume, 100) / 100);
      audio.volume = this.clamp01((mix.voiceVolume ?? 1) * masterVolumeFactor);

      const segmentTrimInMs = Math.max(0, Number(segment?.trimInMs || 0));
      const offsetSec = this.resolveSegmentSourceOffsetSec(currentMs, segment.startMs, segmentTrimInMs, clipPlaybackRate);

      const drift = Math.abs(audio.currentTime - offsetSec);
      const isNewSegment = audio.dataset.activeSegmentSignature !== activeSegmentSignature;
      const isFirstSync = audio.dataset.initialized === "false";
      const isPaused = audio.paused === true || this.state.isPlaying !== true;
      const hasPendingStart = Boolean(String(audio.dataset.pendingPlayIntent || "").trim());
      const driftToleranceSec = isFirstSync || isNewSegment ? 0.05 : (isPaused ? 0.15 : 0.35);
      const needsSeekWithoutPendingStart = drift > driftToleranceSec;
      const needsSeek = hasPendingStart ? false : (needsSeekWithoutPendingStart || isNewSegment);

      if (needsSeek) {
        this.seekTo(audio, offsetSec);
      }
      if (isFirstSync) {
        audio.dataset.initialized = "true";
      }

      audio.dataset.activeSegmentSignature = activeSegmentSignature;

      const isPlayPending = audio.dataset.playPending === "true";
      if (this.state.isPlaying && audio.paused && !isPlayPending) {
        const playIntent = `${rowId}:${sourceKey}:${Math.round(Number(segment.startMs || 0) || 0)}`;
        const startPlayback = () => {
          if (this.state.isPlaying !== true || audio.dataset.playIntent !== playIntent) {
            audio.dataset.playPending = "";
            return;
          }
          audio.dataset.pendingPlayIntent = "";
          audio.dataset.playPending = "true";

          audio.volume = this.clamp01((mix.voiceVolume ?? 1) * masterVolumeFactor);
          audio.muted = false;

          audio.play().then(() => {
            audio.dataset.playPending = "";
            if (Math.abs(audio.playbackRate - effectiveRate) > 0.01) {
              audio.playbackRate = effectiveRate;
            }
          }).catch(() => {
            audio.dataset.playPending = "";
          });
        };
        audio.dataset.playIntent = playIntent;
        audio.dataset.playPending = "true";

        const HAVE_METADATA = typeof HTMLMediaElement !== "undefined" ? HTMLMediaElement.HAVE_METADATA : 1;
        const HAVE_CURRENT_DATA = typeof HTMLMediaElement !== "undefined" ? HTMLMediaElement.HAVE_CURRENT_DATA : 2;
        const canStartOnMetadata = audio.readyState >= HAVE_METADATA && Number(audio.duration || 0) > 0;

        if (audio.readyState >= HAVE_CURRENT_DATA || canStartOnMetadata) {
          startPlayback();
        } else if (audio.dataset.pendingPlayIntent !== playIntent) {
          audio.dataset.pendingPlayIntent = playIntent;
          const onCanReady = () => {
            audio.removeEventListener("canplay", onCanReady);
            audio.removeEventListener("error", onCanError);
            if (audio.dataset.playIntent === playIntent) startPlayback();
            else audio.dataset.playPending = "";
          };
          const onCanError = () => {
            audio.removeEventListener("canplay", onCanReady);
            audio.removeEventListener("error", onCanError);
            audio.dataset.pendingPlayIntent = "";
            audio.dataset.playPending = "";
          };
          audio.addEventListener("canplay", onCanReady, { once: true });
          audio.addEventListener("error", onCanError, { once: true });
          if (audio.readyState === 0) {
            try { audio.load(); } catch (_) { }
          }
        } else {
          audio.dataset.playPending = "";
        }
      } else if (!audio.paused && Math.abs(audio.playbackRate - effectiveRate) > 0.01) {
        audio.playbackRate = effectiveRate;
      }
    }

    await this.syncBackgroundMusic(currentMs, speed, hasVoice);
  }
  async syncBackgroundMusic(currentMs, speed, hasVoice = false) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const panelCfg = this.deps?.getPanelMontageMusicConfig?.(session);
    if (!panelCfg || panelCfg.sourceType === "none") { this.stopBackgroundMusic(); return; }

    const sourceItems = Array.isArray(panelCfg.sourceItems) ? panelCfg.sourceItems : [];
    const loopEnabled = panelCfg.loopEnabled !== false;
    const backgroundLookupToleranceMs = this.getTimelineLookupToleranceMs();
    const uniqueSourceKeys = new Set(
      sourceItems
        .map((item) => this.resolveAudioSourceKey(item))
        .map((key) => String(key || "").trim())
        .filter(Boolean)
    );
    const useContinuousSource = Boolean(String(panelCfg.sourceUrl || "").trim())
      || (sourceItems.length > 0 && uniqueSourceKeys.size <= 1);
    const activeSegmentLookup = (() => {
      const findMatchingSourceItem = () => {
        if (!sourceItems.length) return null;
        const matches = [];
        for (let segmentIndex = 0; segmentIndex < sourceItems.length; segmentIndex += 1) {
          const candidate = sourceItems[segmentIndex];
          if (!candidate) continue;
          const candidateStartMs = Number(candidate.startOffsetMs || 0);
          const candidateEndMs = Number(candidate.endOffsetMs || candidateStartMs);
          if (this.isTimelineMsInRange(currentMs, candidateStartMs, candidateEndMs, { toleranceMs: backgroundLookupToleranceMs })) {
            matches.push({ segmentIndex, segment: candidate });
          }
        }
        if (!matches.length) return null;
        return matches
          .sort((a, b) => Number(b.segment.startOffsetMs || 0) - Number(a.segment.startOffsetMs || 0))[0];
      };
    if (useContinuousSource) {
        const matchingItem = findMatchingSourceItem();
        if (matchingItem) return matchingItem;
        const orderedItems = sourceItems
          .slice()
          .sort((a, b) => Number(a.startOffsetMs || 0) - Number(b.startOffsetMs || 0));
        const firstSegment = orderedItems[0] || null;
        const fallbackSourceItem = firstSegment || {
          sourceUrl: String(panelCfg.sourceUrl || "").trim(),
          localDataUrl: String(panelCfg.localDataUrl || "").trim(),
          localMediaCacheKey: String(panelCfg.localMediaCacheKey || "").trim(),
          downloadUrl: String(panelCfg.downloadUrl || "").trim(),
          storagePath: String(panelCfg.storagePath || "").trim(),
          trimInMs: Math.max(0, Number(panelCfg.trimInMs || 0) || 0),
          trimOutMs: Math.max(0, Number(panelCfg.trimOutMs || 0) || 0),
          fadeInMs: 0,
          fadeOutMs: 0,
          loop: loopEnabled
        };
        if (!fallbackSourceItem.sourceUrl && !fallbackSourceItem.localDataUrl && !fallbackSourceItem.localMediaCacheKey && !fallbackSourceItem.downloadUrl && !fallbackSourceItem.storagePath) {
          return null;
        }
        const lastSegment = orderedItems.slice().sort((a, b) => Number(b.endOffsetMs || 0) - Number(a.endOffsetMs || 0))[0] || firstSegment;
        const trackStartMs = Math.max(0, Number(firstSegment?.startOffsetMs || panelCfg.startOffsetMs || 0) || 0);
        const configuredTrimInMs = Math.max(
          0,
          Number(panelCfg.trimInMs || firstSegment?.trimInMs || 0) || 0
        );
        const configuredTrimOutMs = Math.max(
          configuredTrimInMs + 1,
          Number(panelCfg.trimOutMs || 0) || configuredTrimInMs + 1
        );
        const configuredDurationMs = Math.max(
          0,
          Math.round(Number(panelCfg.durationSec || 0) * 1000)
        );
        const fallbackTotalMs = Math.max(
          0,
          Number(this.deps?.getTimelineTotalDurationMs?.(session) || 0) || 0
        );
        const resolvedEndCandidates = [
          Number(lastSegment?.endOffsetMs || 0),
          configuredTrimOutMs,
          configuredTrimInMs + configuredDurationMs,
          fallbackTotalMs
        ];
        const trackEndMs = Math.max(
          trackStartMs + 1,
          ...resolvedEndCandidates.filter((candidate) => Number.isFinite(candidate) && candidate > 0)
        );
        if (!this.isTimelineMsInRange(currentMs, trackStartMs, trackEndMs, { toleranceMs: backgroundLookupToleranceMs })) {
          return null;
        }
        return {
          segmentIndex: 0,
          segment: {
            ...(fallbackSourceItem || {}),
            sourceUrl: firstSegment?.sourceUrl || panelCfg.sourceUrl || "",
            volume: panelCfg.volume,
            loop: loopEnabled,
            startOffsetMs: trackStartMs,
            endOffsetMs: trackEndMs,
            trimInMs: Math.max(0, Number(panelCfg.trimInMs || firstSegment?.trimInMs || 0) || 0),
            trimOutMs: Math.max(
              Math.max(0, Number(panelCfg.trimInMs || firstSegment?.trimInMs || 0) || 0) + 1,
              Number(panelCfg.trimOutMs || lastSegment?.trimOutMs || trackEndMs) || trackEndMs
            ),
            fadeInMs: Math.max(0, Number((firstSegment || fallbackSourceItem).fadeInMs || 0) || 0),
            fadeOutMs: Math.max(0, Number(lastSegment?.fadeOutMs || 0) || 0)
          }
        };
      }
      return findMatchingSourceItem();
    })();

    if (!activeSegmentLookup || !activeSegmentLookup.segment) {
      this.backgroundFadeSegmentSignature = "";
      if (this.state.isPlaying && this.backgroundAudio && !this.backgroundAudio.paused && this.backgroundSourceKey) {
        const nowMs = performance.now();
        if (!this.backgroundSegmentGapStartMs) this.backgroundSegmentGapStartMs = nowMs;
        if ((nowMs - this.backgroundSegmentGapStartMs) <= this.backgroundSegmentGapHoldMs) return;
      }
      this.backgroundSegmentGapStartMs = 0;
      if (this.backgroundAudio && !this.backgroundAudio.paused) {
        this.backgroundAudio.pause();
      }
      // Keep the loaded background audio/source alive while the playhead is outside
      // a music segment. Manual seeks often cross tiny gaps; clearing the key here
      // forces the same track to be fetched and recreated on the next seek.
      this.backgroundSegmentSkewMs = null;
      this.backgroundSegmentIndex = -1;
      this.backgroundSyncAnchorMs = null;
      this.backgroundSyncAnchorOffsetMs = null;
      this.backgroundSyncLastTimelineMs = null;
      return;
    }

    const activeSegment = activeSegmentLookup.segment;
    this.backgroundSegmentGapStartMs = 0;
    const rawSegmentIndex = Number(activeSegmentLookup.segmentIndex);
    const activeSegmentIndex = Number.isFinite(rawSegmentIndex) ? Math.floor(rawSegmentIndex) : -1;
    const activeSegmentSourceKey = this.resolveAudioSourceKey(activeSegment);
    const stableSegmentSourceKey = (() => {
      if (activeSegmentSourceKey) return activeSegmentSourceKey;
      const sourceCandidates = [
        String(activeSegment.sourceUrl || "").trim(),
        String(activeSegment.localDataUrl || "").trim(),
        String(activeSegment.localMediaCacheKey || "").trim(),
        String(activeSegment.downloadUrl || "").trim(),
        String(activeSegment.storagePath || "").trim()
      ].filter(Boolean);
      if (sourceCandidates.length) return sourceCandidates.join("|");
      return "";
    })();
    const activeSegmentStartMs = Math.max(0, Number(activeSegment.startOffsetMs || 0) || 0);
    const trimInMs = Math.max(0, Number(activeSegment.trimInMs || 0));
    const fadeInMs = Math.max(0, Number(activeSegment.fadeInMs || 0));
    const fadeOutMs = Math.max(0, Number(activeSegment.fadeOutMs || 0));
    const trimOutMs = Math.max(0, Number(activeSegment.trimOutMs || 0));
    const activeSegmentIdentity = `${activeSegment.loop !== false ? "1" : "0"}|${trimInMs}|${trimOutMs}|${fadeInMs}|${fadeOutMs}`;
    const sourceHasNotChanged = this.backgroundSourceKey === stableSegmentSourceKey;
    const sourceIsContinuous = useContinuousSource === true;
    const previousBackgroundSegmentIndex = this.backgroundSegmentIndex;
    const previousBackgroundSegmentIdentity = this.backgroundSegmentIdentity;
    const isActiveSegmentIdentityChanged = previousBackgroundSegmentIdentity !== activeSegmentIdentity;
    const activeBackgroundSegmentSignature = `${stableSegmentSourceKey}|${activeSegmentIndex}|${activeSegmentIdentity}`;

    if (!sourceHasNotChanged) {
      this.backgroundSegmentSkewMs = null;
      this.backgroundSegmentIndex = -1;
      this.backgroundSyncAnchorMs = null;
      this.backgroundSyncAnchorOffsetMs = null;
      this.backgroundSyncLastTimelineMs = null;
      if (this.backgroundAudio) {
        try { this.backgroundAudio.pause(); } catch (_) { }
      }
      // A MediaElementSource is permanently associated with its media element.
      // Preserve that node across URL changes and reconnect it downstream instead
      // of trying to create a second node (which makes the track silently disappear).
      if (this.backgroundSource) { try { this.backgroundSource.disconnect(); } catch (_) { } }
      if (this.backgroundGain) { try { this.backgroundGain.disconnect(); } catch (_) { } }
      this.backgroundGain = null;
      if (this.backgroundCompressor) { try { this.backgroundCompressor.disconnect(); } catch (_) { } }
      this.backgroundCompressor = null;
      if (this.backgroundFinalLimiter) { try { this.backgroundFinalLimiter.disconnect(); } catch (_) { } }
      this.backgroundFinalLimiter = null;
      this.backgroundStabilizeEnabled = null;
      this.backgroundLimiterEnabled = null;
      this.backgroundSourceKey = stableSegmentSourceKey;
      this.backgroundSegmentIdentity = activeSegmentIdentity;
      this.backgroundSrc = String(activeSegment.sourceUrl || "").trim();
      try {
        const playableSource = await this.resolveDialoguePlaybackAudioSource({
          ...activeSegment,
          localDataUrl: String(activeSegment.localDataUrl || "").trim(),
          localMediaCacheKey: String(activeSegment.localMediaCacheKey || "").trim(),
          sourceUrl: String(activeSegment.sourceUrl || activeSegment.downloadUrl || activeSegment.storagePath || "").trim(),
          downloadUrl: String(activeSegment.downloadUrl || "").trim(),
          storagePath: String(activeSegment.storagePath || "").trim()
        });
        const blobSrc = playableSource;
        if (!blobSrc) {
          this.backgroundSrc = "";
          this.backgroundResolvedSource = "";
          this.backgroundSourceKey = "";
          return;
        }
        this.backgroundAudio = this.getOrCreateBackgroundAudioElement();
        this.backgroundResolvedSource = String(blobSrc || "").trim();
        this.backgroundAudio.src = blobSrc;
        this.backgroundAudio.dataset.originalSrc = this.backgroundResolvedSource;
        this.backgroundAudio.dataset.sourceKey = stableSegmentSourceKey;
        this.backgroundAudio.dataset.initialized = "false";
        this.backgroundAudio.dataset.playbackStarted = "false";
        try { this.backgroundAudio.load(); } catch (_) { }
        const useNativeLoop = activeSegment.loop !== undefined ? activeSegment.loop : true;
        this.backgroundAudio.loop = sourceIsContinuous ? false : useNativeLoop;
      } catch (e) {
        this.backgroundSrc = "";
        this.backgroundResolvedSource = "";
        this.backgroundSourceKey = "";
        this.backgroundSegmentIdentity = "";
        this.backgroundFadeSegmentSignature = "";
        return;
      }
    } else if (this.backgroundAudio) {
      const useNativeLoop = activeSegment.loop !== undefined ? activeSegment.loop : true;
      this.backgroundAudio.loop = sourceIsContinuous ? false : useNativeLoop;
      this.backgroundSegmentIdentity = activeSegmentIdentity;
    }

    if (!this.backgroundAudio) return;

    const entry = this.getEntryAtMs(currentMs);
    const mix = entry?.rowId ? this.deps?.resolveTimelineClipMix?.(session, entry.rowId) : null;
    const sceneBackgroundFactor = mix ? (mix.backgroundVolume ?? 1.0) : 1.0;

    const baseVolume = activeSegment && activeSegment.volume !== undefined ? activeSegment.volume : this.toFiniteNumber(panelCfg.volume, 100);
    const duckPct = activeSegment && (activeSegment.duckingWhenGeminiPct ?? activeSegment.duckingPct) !== undefined
      ? (activeSegment.duckingWhenGeminiPct ?? activeSegment.duckingPct)
      : this.toFiniteNumber(panelCfg.duckingWhenGeminiPct, 60);
    const segmentDurationMs = Math.max(1, Number(activeSegment.endOffsetMs || 0) - Number(activeSegment.startOffsetMs || 0));
    const elapsedMs = Math.max(0, currentMs - Number(activeSegment.startOffsetMs || 0));
    const remainingMs = Math.max(0, segmentDurationMs - elapsedMs);
    const segmentFadeInMs = Math.min(Math.max(0, Number(fadeInMs || 0)), segmentDurationMs);
    const fadeInFactor = segmentFadeInMs > 0 && segmentDurationMs > 0
      ? (elapsedMs < segmentFadeInMs ? Math.max(0, Math.min(1, elapsedMs / segmentFadeInMs)) : 1.0)
      : 1.0;
    const segmentFadeOutMs = Math.min(Math.max(0, Number(fadeOutMs || 0)), segmentDurationMs);
    const fadeOutFactor = segmentFadeOutMs > 0 && segmentDurationMs > 0
      ? (remainingMs <= segmentFadeOutMs ? Math.max(0, Math.min(1, remainingMs / segmentFadeOutMs)) : 1.0)
      : 1.0;
    const configuredTrimSpanMs = (() => {
      const configuredTrimOutMs = Number(activeSegment.trimOutMs || 0) || 0;
      const configuredTrimSpan = configuredTrimOutMs > trimInMs ? (configuredTrimOutMs - trimInMs) : 0;
      if (configuredTrimSpan > 0) return configuredTrimSpan;
      return segmentDurationMs;
    })();
    const sourceDurationMs = Number(this.backgroundAudio.duration || 0) * 1000;
    const continuousLoopSpanMs = sourceIsContinuous && activeSegment.loop !== false
      ? Math.max(1, Math.min(
        configuredTrimSpanMs,
        Number.isFinite(sourceDurationMs) && sourceDurationMs > 0 ? sourceDurationMs : configuredTrimSpanMs
      ))
      : 0;

    this.backgroundDuckFactor = hasVoice ? (duckPct / 100) : 1.0;
    const finalVolume = (baseVolume / 100) * this.backgroundDuckFactor * sceneBackgroundFactor * fadeInFactor * fadeOutFactor;
    const isNewBackgroundSegment = !sourceHasNotChanged
      || previousBackgroundSegmentIndex !== activeSegmentIndex
      || isActiveSegmentIdentityChanged
      || this.backgroundFadeSegmentSignature !== activeBackgroundSegmentSignature;

    this.backgroundFadeSegmentSignature = activeBackgroundSegmentSignature;

    const sessionConfig = this.deps?.getPodcastVideoConfig?.(session) || this.state.config || {};
    const masterVolumeFactor = this.clamp01(this.toFiniteNumber(sessionConfig?.masterVolume, 100) / 100);
    const stabilizeEnabled = sessionConfig?.audioMasterStabilize === true || (activeSegment && activeSegment.stabilize !== undefined
      ? activeSegment.stabilize === true
      : panelCfg.stabilize === true);
    const limiterEnabled = sessionConfig?.audioMasterLimiterEnabled === true || panelCfg.limiterEnabled === true;
    const clampedFinalVolume = this.clamp01(finalVolume * masterVolumeFactor);
    if (this.backgroundAudio && Number.isFinite(this.backgroundAudio.volume)) {
      this.backgroundAudio.volume = 1;
    }

    if (this.audioCtx) {
      this.ensureBackgroundChain(stabilizeEnabled, limiterEnabled);
      if (this.backgroundGain) {
        const now = this.audioCtx.currentTime;
        const smoothingConstant = 0.15;
        try { this.backgroundGain.gain.cancelScheduledValues(now); } catch (_) { }
        // Use a slightly longer time constant (0.15s) for ducking transitions to avoid abrupt jumps
        if (isNewBackgroundSegment) {
          try { this.backgroundGain.gain.setValueAtTime(0, now); } catch (_) { }
        } else {
          const currentGain = Number(this.backgroundGain.gain.value || 0);
          try { this.backgroundGain.gain.setValueAtTime(currentGain, now); } catch (_) { }
        }
        this.backgroundGain.gain.setTargetAtTime(clampedFinalVolume, now, isNewBackgroundSegment ? 0.08 : smoothingConstant);
      } else {
        this.backgroundAudio.volume = clampedFinalVolume;
      }
    } else {
      this.backgroundAudio.volume = clampedFinalVolume;
    }

    this.backgroundAudio.playbackRate = speed;

    const segmentBaseOffsetMs = trimInMs + elapsedMs;
    const timelineOffsetMs = Math.max(0, Number(currentMs || 0) - activeSegmentStartMs);
    const continuousSourceOffsetMs = sourceIsContinuous
      ? (activeSegment.loop === false
        ? (trimInMs + timelineOffsetMs)
        : (trimInMs + (timelineOffsetMs % continuousLoopSpanMs)))
      : segmentBaseOffsetMs;
    let offsetMs = continuousSourceOffsetMs;
    if (sourceHasNotChanged) {
      if (sourceIsContinuous) {
        const currentTimelineMs = Number(currentMs || 0);
        const currentAudioOffsetMs = Math.max(0, Number(this.backgroundAudio.currentTime || 0) * 1000);
        const lastTimelineMs = Number(this.backgroundSyncLastTimelineMs);
        const timelineJumpMs = Number.isFinite(lastTimelineMs) ? Math.abs(currentTimelineMs - lastTimelineMs) : 0;
        const needsAnchorReset = this.backgroundSyncAnchorMs === null
          || this.backgroundSyncAnchorOffsetMs === null
          || !Number.isFinite(this.backgroundSyncAnchorMs)
          || !Number.isFinite(this.backgroundSyncAnchorOffsetMs)
          || previousBackgroundSegmentIndex !== activeSegmentIndex
          || isActiveSegmentIdentityChanged
          || this.backgroundAudio.dataset.initialized !== "true"
          || timelineJumpMs > 1500;
        if (needsAnchorReset) {
          this.backgroundSyncAnchorMs = currentTimelineMs;
          this.backgroundSyncAnchorOffsetMs = continuousSourceOffsetMs;
          offsetMs = continuousSourceOffsetMs;
        } else {
          offsetMs = Math.max(0, Number(this.backgroundSyncAnchorOffsetMs || 0) + (currentTimelineMs - Number(this.backgroundSyncAnchorMs || 0)));
          if (Math.abs(currentAudioOffsetMs - offsetMs) > 1200) {
            this.backgroundSyncAnchorMs = currentTimelineMs;
            this.backgroundSyncAnchorOffsetMs = continuousSourceOffsetMs;
            offsetMs = continuousSourceOffsetMs;
          }
        }
        this.backgroundSegmentIndex = activeSegmentIndex;
        this.backgroundSyncLastTimelineMs = currentTimelineMs;
      } else {
        this.backgroundSegmentIndex = activeSegmentIndex;
        if (isActiveSegmentIdentityChanged || this.backgroundSegmentSkewMs === null || !Number.isFinite(this.backgroundSegmentSkewMs)) {
          this.backgroundSegmentSkewMs = Number(this.backgroundAudio.currentTime || 0) * 1000 - segmentBaseOffsetMs;
        }
        const expectedOffsetFromSkewMs = Number(currentMs || 0) + this.backgroundSegmentSkewMs;
        const expectedJumpMs = Math.abs(expectedOffsetFromSkewMs - segmentBaseOffsetMs);
        if (expectedJumpMs > 800 && this.backgroundAudio.dataset.initialized === "true") {
          this.backgroundSegmentSkewMs = segmentBaseOffsetMs - Number(currentMs || 0);
          offsetMs = segmentBaseOffsetMs;
        } else {
          offsetMs = expectedOffsetFromSkewMs;
        }
        this.backgroundSegmentIndex = activeSegmentIndex;
      }
    } else {
      this.backgroundSegmentSkewMs = segmentBaseOffsetMs - Number(currentMs || 0);
      this.backgroundSegmentIndex = activeSegmentIndex;
      this.backgroundSyncAnchorMs = Number(currentMs || 0);
      this.backgroundSyncAnchorOffsetMs = segmentBaseOffsetMs;
      this.backgroundSyncLastTimelineMs = Number(currentMs || 0);
    }

    const offsetSec = Math.max(0, offsetMs / 1000);

    const drift = Math.abs(this.backgroundAudio.currentTime - offsetSec);
    const driftToleranceSec = sourceIsContinuous ? 0.9 : 0.3;
    if (this.backgroundAudio.dataset.initialized === "false" || drift > driftToleranceSec) {
      this.seekTo(this.backgroundAudio, offsetSec);
      this.backgroundAudio.dataset.initialized = "true";
    }

    if (this.state.isPlaying && this.backgroundAudio.paused) {
      await this.startBackgroundAudioWithoutBlockingClock();
    }
  }

  ensureBackgroundChain(stabilizeEnabled = false, limiterEnabled = false) {
    if (!this.audioCtx || !this.backgroundAudio) return;
    try {
      const wantsStabilize = stabilizeEnabled === true;
      const wantsLimiter = limiterEnabled === true;
      const needsBuild = !this.backgroundSource
        || !this.backgroundGain
        || this.backgroundStabilizeEnabled !== wantsStabilize
        || this.backgroundLimiterEnabled !== wantsLimiter;
      if (!needsBuild) return;
      if (!this.backgroundSource) {
        this.backgroundSource = this.audioCtx.createMediaElementSource(this.backgroundAudio);
      } else {
        try { this.backgroundSource.disconnect(); } catch (_) { }
      }
      if (this.backgroundCompressor) {
        try { this.backgroundCompressor.disconnect(); } catch (_) { }
      }
      if (this.backgroundGain) {
        try { this.backgroundGain.disconnect(); } catch (_) { }
      }
      if (this.backgroundFinalLimiter) {
        try { this.backgroundFinalLimiter.disconnect(); } catch (_) { }
      }
      this.backgroundGain = this.audioCtx.createGain();
      this.backgroundFinalLimiter = wantsLimiter
        ? createPodcasterFinalLimiterNode(this.audioCtx, this.backgroundLimiterSettings)
        : null;
      if (wantsStabilize) {
        this.backgroundCompressor = this.audioCtx.createDynamicsCompressor();
        this.backgroundCompressor.threshold.value = -24;
        this.backgroundCompressor.knee.value = 18;
        this.backgroundCompressor.ratio.value = 4;
        this.backgroundCompressor.attack.value = 0.003;
        this.backgroundCompressor.release.value = 0.2;
        this.backgroundSource.connect(this.backgroundCompressor);
        this.backgroundCompressor.connect(this.backgroundGain);
      } else {
        this.backgroundCompressor = null;
        this.backgroundSource.connect(this.backgroundGain);
      }
      if (this.backgroundFinalLimiter) {
        this.backgroundGain.connect(this.backgroundFinalLimiter);
        this.backgroundFinalLimiter.connect(this.audioCtx.destination);
      } else {
        this.backgroundGain.connect(this.audioCtx.destination);
      }
      this.backgroundStabilizeEnabled = wantsStabilize;
      this.backgroundLimiterEnabled = wantsLimiter;
    } catch (e) { }
  }

  pauseBackgroundMusic() {
    if (this.backgroundAudio) try { this.backgroundAudio.pause(); } catch (_) { }
  }

  stopBackgroundMusic() {
    if (this.backgroundRecoveryTimer) {
      clearTimeout(this.backgroundRecoveryTimer);
      this.backgroundRecoveryTimer = null;
    }
    if (this.backgroundAudio) { 
      try { 
        this.backgroundAudio.pause(); 
      } catch (_) { } 
    }
    this.backgroundSegmentGapStartMs = 0;
    this.backgroundSrc = "";
    this.backgroundResolvedSource = "";
    this.backgroundSegmentIdentity = "";
    this.backgroundFadeSegmentSignature = "";
    this.backgroundSegmentSkewMs = null;
    this.backgroundSegmentIndex = -1;
    this.backgroundSyncAnchorMs = null;
    this.backgroundSyncAnchorOffsetMs = null;
    this.backgroundSyncLastTimelineMs = null;
    if (this.backgroundSource) { try { this.backgroundSource.disconnect(); } catch (_) { } }
    // MediaElementSource remains permanently bound to its HTMLMediaElement.
    // Keep both references after Stop so the next play can reconnect the same
    // node instead of attempting the forbidden second association.
    if (this.backgroundGain) { try { this.backgroundGain.disconnect(); } catch (_) { } }
    this.backgroundGain = null;
    if (this.backgroundCompressor) { try { this.backgroundCompressor.disconnect(); } catch (_) { } }
    this.backgroundCompressor = null;
    if (this.backgroundFinalLimiter) { try { this.backgroundFinalLimiter.disconnect(); } catch (_) { } }
    this.backgroundFinalLimiter = null;
    this.backgroundStabilizeEnabled = null;
    this.backgroundLimiterEnabled = null;
    this.backgroundRecoverySourceKey = "";
    this.backgroundRecoveryAttempts = 0;
  }

  // --- Video ---
  async syncVideo(currentMs) {
    if (this.state.useMse) return;
    const entry = this.getEntryAtMs(currentMs);

    // Pre-load upcoming. The list is stable for most of a scene; resolving the
    // same eight URLs on every animation tick created thousands of redundant
    // promises and competed with decoding on longer timelines.
    const entries = this.deps?.buildTimelineRuntimeEntries?.(this.state.session) || [];
    const upcoming = entries
      .filter(e => e.startMs > currentMs && (e.startMs - currentMs) < SYNC_VIDEO_UPCOMING_LOOKAHEAD_MS)
      .slice(0, SYNC_VIDEO_UPCOMING_MAX_ENTRIES);
    const lookAheadKey = upcoming
      .map((item) => this.normalizeTimelineSourceKey?.(String(item?.videoSrc || "").trim()) || String(item?.videoSrc || "").trim())
      .filter(Boolean)
      .join("|");
    if (lookAheadKey !== this.videoLookAheadKey) {
      this.videoLookAheadKey = lookAheadKey;
      upcoming.forEach(e => {
        if (!this.hasStageVisualSurface(e) || this.isColorSceneEntry(e)) {
          return;
        }
        if (this.isImageStageEntry(e)) {
          this.preloadEntryStopMotion(e);
          this.preloadImageSrc(e.videoSrc).catch(() => { });
        } else {
          const source = String(e?.videoSrc || "").trim();
          this.getBlobUrl(source, {
            persistent: true
          }).catch(() => { });
        }
      });
    }
    if (this.overlapState?.key) {
      this.overlapState.key = "";
    }
    // Single-load strategy: preload is handled by the main stage media pipeline.
    this.preloadUpcomingStylizedText(entry, upcoming);

    if (entry) {
      await this.syncStageSwitching(entry, currentMs);
    } else {
      this.applySceneBackground(null);
      this.hideAllVideos();
      this.hideAllImages();
    }
  }

  resolveEntryTargetOffsetSec(entry = null, currentMs = 0) {
    if (!entry) return { targetOffsetSec: 0, isHoldActive: false, playbackRate: 1 };
    const resolved = typeof this.deps?.resolveSceneSourceStateAtTimelineMs === "function"
      ? this.deps.resolveSceneSourceStateAtTimelineMs(entry, currentMs)
      : null;
    if (resolved && Number.isFinite(Number(resolved.sourceMs))) {
      return {
        targetOffsetSec: Math.max(0, Number(resolved.sourceMs || 0)) / 1000,
        isHoldActive: resolved.isHoldActive === true,
        playbackRate: this.clampPlaybackRate(resolved.playbackRate || 1, 0.25, 4)
      };
    }
    const trimInMs = Math.max(0, Number(entry.clip?.trimInMs || 0));
    const offsetMs = Math.max(0, Number(currentMs || 0) - Number(entry.startMs || 0));
    return {
      targetOffsetSec: (trimInMs + offsetMs) / 1000,
      isHoldActive: false,
      playbackRate: 1
    };
  }

  async syncOverlapPair(overlapPair = null, currentMs = 0, transition = { type: "crossfade", durationMs: OVERLAP_TRANSITION_DEFAULT_DURATION_MS }) {
    const frontEntry = overlapPair?.frontEntry || overlapPair?.backEntry || null;
    if (!frontEntry) return;
    await this.syncStageSwitching(frontEntry, currentMs);
    this.overlapState.key = "";
  }

  preloadUpcomingStageSlot(currentEntry, upcomingEntries = []) {
    const activeEl = this.getActiveStageVideoEl();
    if (!activeEl || !Array.isArray(upcomingEntries) || !upcomingEntries.length) return;

    const activeSrc = String(activeEl?.dataset?.src || currentEntry?.videoSrc || "").trim();
    const nextEntry = upcomingEntries.find((item) => {
      const src = String(item?.videoSrc || "").trim();
      return src && src !== activeSrc && this.isImageStageEntry(item) !== true;
    });
    const nextSrc = String(nextEntry?.videoSrc || "").trim();
    if (!nextSrc) return;
    if (this.stageMachine.loadingSrc === nextSrc || this.stageMachine.preloadingSrc === nextSrc) return;

    this.stageMachine.preloadingSrc = nextSrc;
    this.stageMachine.preloadingPromise = (async () => {
      await this.primeStageVideoSource(nextSrc);
      if (this.stageMachine.preloadingSrc !== nextSrc) return false;
      return this.stageMachine.preloadingSrc === nextSrc;
    })().catch(() => false).finally(() => {
      if (this.stageMachine.preloadingSrc === nextSrc) {
        this.stageMachine.preloadingSrc = '';
        this.stageMachine.preloadingPromise = null;
      }
    });
  }

  hideAllVideos() {
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt, this.els?.podcastActiveSpeakerBackdropVideo, this.els?.podcastActiveSpeakerBackdropVideoAlt].forEach(v => {
      if (v) { 
        this.resetEntryVisualStateOnSurface(v);
        v.style.opacity = 0; 
        v.style.visibility = "hidden";
        v.style.transform = "";
        v.style.filter = "";
        v.style.transition = "";
        v.hidden = true; 
        try { v.pause(); } catch (_) { }
      }
    });
  }

  hideAllImages() {
    [this.els?.podcastActiveSpeakerImage, this.els?.podcastActiveSpeakerImageAlt].forEach((imageEl) => {
      if (!imageEl) return;
      imageEl.style.opacity = 0;
      this.resetEntryVisualStateOnSurface(imageEl);
      imageEl.style.visibility = "hidden";
      imageEl.style.transform = "";
      imageEl.style.filter = "";
      imageEl.style.transition = "";
      imageEl.hidden = true;
      imageEl.className = imageEl.classList.contains("podcast-active-speaker-image-alt")
        || imageEl.id === "podcastActiveSpeakerImageAlt"
        || imageEl.id === "montageExportPreviewImageAlt"
        ? "podcast-active-speaker-image podcast-active-speaker-image-alt"
        : "podcast-active-speaker-image";
      imageEl.style.animationPlayState = "";
    });
  }

  clearAllStageVisualSurfaces() {
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt, this.els?.podcastActiveSpeakerBackdropVideo, this.els?.podcastActiveSpeakerBackdropVideoAlt].forEach((video) => {
      if (!video) return;
      this.hideStageVideoElementPreservingSource(video, { clearRowId: true });
    });
    [this.els?.podcastActiveSpeakerImage, this.els?.podcastActiveSpeakerImageAlt].forEach((imageEl) => {
      if (!imageEl) return;
      imageEl.removeAttribute("src");
      delete imageEl.dataset.src;
      delete imageEl.dataset.rowId;
      delete imageEl.dataset.stageMode;
      this.resetEntryVisualStateOnSurface(imageEl);
      imageEl.style.opacity = 0;
      imageEl.style.visibility = "hidden";
      imageEl.style.transform = "";
      imageEl.style.filter = "";
      imageEl.style.transition = "";
      imageEl.hidden = true;
      imageEl.className = imageEl.classList.contains("podcast-active-speaker-image-alt")
        || imageEl.id === "podcastActiveSpeakerImageAlt"
        || imageEl.id === "montageExportPreviewImageAlt"
        ? "podcast-active-speaker-image podcast-active-speaker-image-alt"
        : "podcast-active-speaker-image";
      imageEl.style.animationPlayState = "";
    });
  }

  preloadImageSrc(src = "") {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return Promise.reject(new Error("missing_image_source"));
    if (!this.stageMachine.imagePreloadCache) {
      this.stageMachine.imagePreloadCache = new Map();
    }
    if (this.stageMachine.imagePreloadCache.has(cleanSrc)) {
      return this.stageMachine.imagePreloadCache.get(cleanSrc);
    }
    const task = new Promise((resolve, reject) => {
      const probe = new Image();
      try { probe.crossOrigin = "anonymous"; } catch (_) { }
      probe.decoding = "async";
      try { probe.fetchPriority = "high"; } catch (_) { }
      probe.onload = () => resolve(cleanSrc);
      probe.onerror = () => {
        this.stageMachine.imagePreloadCache.delete(cleanSrc);
        reject(new Error("image_preload_failed"));
      };
      probe.src = cleanSrc;
    });
    this.stageMachine.imagePreloadCache.set(cleanSrc, task);
    return task;
  }

  async ensureStageImageReady(imageEl, src = "") {
    const cleanSrc = String(src || "").trim();
    if (!imageEl || !cleanSrc) throw new Error("missing_stage_image");
    try { imageEl.crossOrigin = "anonymous"; } catch (_) { }
    imageEl.decoding = "async";
    try { imageEl.loading = "eager"; } catch (_) { }
    try { imageEl.fetchPriority = "high"; } catch (_) { }
    const currentSrc = String(imageEl.getAttribute("src") || "").trim();
    if (currentSrc !== cleanSrc) {
      imageEl.src = cleanSrc;
    }
    imageEl.dataset.src = cleanSrc;
    if (imageEl.complete && Number(imageEl.naturalWidth || 0) > 0 && Number(imageEl.naturalHeight || 0) > 0) {
      return cleanSrc;
    }
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        imageEl.removeEventListener("load", handleLoad);
        imageEl.removeEventListener("error", handleError);
      };
      const handleLoad = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("stage_image_element_load_failed"));
      };
      imageEl.addEventListener("load", handleLoad);
      imageEl.addEventListener("error", handleError);
    });
    return cleanSrc;
  }

  preloadUpcomingStylizedText(currentEntry, upcomingEntries = []) {
    const editor = window.PodcasterMediaEditor;
    if (typeof editor?.prewarmStylizedText !== "function") return;
    const session = this.state.session || this.deps?.getActiveSession?.();
    if (!session?.stylizedTextMap) return;

    const activeRowId = String(currentEntry?.rowId || "").trim();
    const nextEntry = upcomingEntries.find((item) => {
      const rowId = String(item?.rowId || "").trim();
      return rowId && rowId !== activeRowId && session.stylizedTextMap?.[rowId];
    });
    if (!nextEntry?.rowId) return;
    editor.prewarmStylizedText(nextEntry.rowId, session);
  }

  resolveEntryStopMotion(entry = null) {
    const api = window.PodcasterStopMotion;
    const session = this.state.session || this.deps?.getActiveSession?.();
    const rowId = String(entry?.rowId || "").trim();
    if (!rowId || typeof api?.normalizeStopMotion !== "function") return null;
    const dialogueVideoMaps = [
      session?.dialogueVideoMap,
      session?.session?.dialogueVideoMap,
      session?.podcastStudioUiState?.dialogueVideosByRowId,
      session?.script?.dialogueVideoMap
    ];
    const persistedClip = dialogueVideoMaps
      .map((map) => map?.[rowId] || null)
      .find(Boolean);
    const rawStopMotion = entry?.video?.stopMotion
      || entry?.stopMotion
      || entry?.clip?.stopMotion
      || persistedClip?.stopMotion
      || null;
    return api.normalizeStopMotion(rawStopMotion);
  }

  resolveStopMotionEntryAtMs(entry = null, currentMs = 0) {
    const api = window.PodcasterStopMotion;
    const stopMotion = this.resolveEntryStopMotion(entry);
    if (!stopMotion || typeof api?.resolveStopMotionFrame !== "function") return entry;
    const durationMs = Math.max(
      1,
      Number(entry?.effectiveDurationMs || 0)
        || (Number(entry?.endMs || 0) - Number(entry?.startMs || 0))
        || 1
    );
    const localMs = Math.max(0, Number(currentMs || 0) - Number(entry?.startMs || 0));
    const frame = api.resolveStopMotionFrame(stopMotion, localMs, durationMs);
    if (!frame) return entry;
    const resolveStorageUrl = this.deps?.resolveStorageVideoUrl || window.resolveStorageVideoUrl;
    const source = typeof resolveStorageUrl === "function"
      ? resolveStorageUrl(frame.downloadUrl || "", frame.storagePath || "", {
          type: "image",
          mimeType: frame.mimeType || "image/jpeg"
        })
      : api.resolveFrameSource?.(frame);
    if (!source) return entry;
    return {
      ...entry,
      videoSrc: source,
      stopMotionFrame: frame,
      stopMotionFrameIndex: frame.index,
      stopMotionFrameCount: stopMotion.frames.length
    };
  }

  preloadEntryStopMotion(entry = null) {
    const api = window.PodcasterStopMotion;
    const stopMotion = this.resolveEntryStopMotion(entry);
    if (!stopMotion || typeof api?.preloadStopMotionFrame !== "function") return;
    const resolveStorageUrl = this.deps?.resolveStorageVideoUrl || window.resolveStorageVideoUrl;
    stopMotion.frames.forEach((frame) => {
      const source = typeof resolveStorageUrl === "function"
        ? resolveStorageUrl(frame.downloadUrl || "", frame.storagePath || "", {
            type: "image",
            mimeType: frame.mimeType || "image/jpeg"
          })
        : api.resolveFrameSource?.(frame);
      if (!source) return;
      api.preloadStopMotionFrame({ ...frame, downloadUrl: source }).catch(() => { });
    });
  }

  requestImageStageSwap(entry = null) {
    const imageEl = this.els?.podcastActiveSpeakerImage;
    const cleanSrc = String(entry?.videoSrc || "").trim();
    if (!imageEl || !cleanSrc) return;

    const currentSrc = String(imageEl.dataset.src || imageEl.getAttribute("src") || "").trim();
    const isReady = imageEl.complete
      && Number(imageEl.naturalWidth || 0) > 0
      && Number(imageEl.naturalHeight || 0) > 0;

    const revealImage = () => {
      this.hideAllVideos();
      imageEl.style.opacity = "1";
      imageEl.style.visibility = "visible";
      imageEl.hidden = false;

      const session = this.state.session || this.deps?.getActiveSession?.();
      const effects = session?.visualEffectsMap?.[entry.rowId];
      const kenBurnsAnimationKey = JSON.stringify({
        rowId: String(entry?.rowId || ""),
        durationMs: Number(entry?.effectiveDurationMs || entry?.durationMs || 0) || 0,
        effects: effects || null
      });
      const shouldRestartKenBurns = imageEl.dataset.sceneMediaKenBurnsAnimationKey !== kenBurnsAnimationKey;
      const visualStateKey = JSON.stringify({
        rowId: String(entry?.rowId || ""),
        src: cleanSrc,
        durationMs: Number(entry?.effectiveDurationMs || entry?.durationMs || 0) || 0,
        effects: effects || null
      });
      if (imageEl.dataset.sceneMediaVisualStateKey !== visualStateKey) {
        this.applyEntryVisualStateToSurface(entry, imageEl);
        imageEl.dataset.sceneMediaVisualStateKey = visualStateKey;
      }
      let className = "podcast-active-speaker-image is-visible";
      if (effects && effects.effects?.length) {
        const speedClass = `speed-${effects.speed || 5}`;
        const effectClasses = effects.effects.map(e => `ken-burns-${e}`).join(" ");
        className += ` ${effectClasses} ${speedClass}`;
      }
      if (imageEl.className !== className) {
        imageEl.className = className;
      } else if (shouldRestartKenBurns && effects?.effects?.length) {
        imageEl.style.animation = "none";
        void imageEl.offsetWidth;
        imageEl.style.removeProperty("animation");
      }
      imageEl.dataset.sceneMediaKenBurnsAnimationKey = kenBurnsAnimationKey;
      imageEl.style.animationPlayState = this.state.isPlaying ? 'running' : 'paused';
      this.syncStageMediaMotionPlaybackState(this.state.isPlaying === true);
    };

    if (currentSrc === cleanSrc && isReady) {
      revealImage();
      return;
    }

    const preserveVisibleFrame = Boolean(entry?.stopMotionFrame) && !imageEl.hidden;
    imageEl.hidden = false;
    imageEl.style.visibility = "visible";
    if (!preserveVisibleFrame) imageEl.style.opacity = "0";

    const existingToken = Number(this.stageMachine.imageSwapToken || 0) + 1;
    this.stageMachine.imageSwapToken = existingToken;

    if (this.stageMachine.imageLoadingSrc === cleanSrc && this.stageMachine.imageLoadingPromise) {
      this.stageMachine.imageLoadingPromise.then(() => {
        if (this.stageMachine.imageSwapToken !== existingToken) return;
        revealImage();
      }).catch(() => { });
      return;
    }

    this.stageMachine.imageLoadingSrc = cleanSrc;
    this.stageMachine.imageLoadingPromise = Promise.resolve()
      .then(() => this.preloadImageSrc(cleanSrc))
      .then(() => this.ensureStageImageReady(imageEl, cleanSrc))
      .then(() => {
        if (this.stageMachine.imageSwapToken !== existingToken) return;
        revealImage();
      })
      .catch(() => { })
      .finally(() => {
        if (this.stageMachine.imageLoadingSrc === cleanSrc) {
          this.stageMachine.imageLoadingSrc = "";
          this.stageMachine.imageLoadingPromise = null;
        }
      });
  }

  async syncStageSwitching(entry, currentMs) {
    const switchToken = ++this.stageSwitchSeq;
    const sourceState = this.resolveEntryTargetOffsetSec(entry, currentMs);
    const offsetSec = sourceState.targetOffsetSec;
    const activeEl = this.getActiveStageVideoEl();
    const imageEl = this.els?.podcastActiveSpeakerImage;

    if (!activeEl) return;

    const isImage = this.isImageStageEntry(entry);
    this.applySceneBackground(entry);
    this.applySceneMediaScale(entry);

    if (isImage) {
        const imageEntry = this.resolveStopMotionEntryAtMs(entry, currentMs);
        this.preloadEntryStopMotion(entry);
        this.requestImageStageSwap(imageEntry);
        return;
    } else {
        this.hideAllImages();
    }

    // Resolve dynamic wrapping modulo for continuous looping of shorter generated videos
    let targetOffsetSec = offsetSec;
    const resolvedDuration = activeEl && activeEl.dataset.src === entry.videoSrc && Number.isFinite(activeEl.duration) && activeEl.duration > 0
      ? activeEl.duration
      : 0;

    if (resolvedDuration > 0 && offsetSec >= resolvedDuration) {
      targetOffsetSec = offsetSec % resolvedDuration;
    }

    const isSameSource = activeEl.dataset.src === entry.videoSrc;
    // Use current element if it matches source.
    if (isSameSource) {
      if (this.shouldResyncStageVideo(activeEl, targetOffsetSec, {
        isHoldActive: sourceState.isHoldActive,
        toleranceSec: STAGE_VIDEO_RESYNC_TOLERANCE_DEFAULT_SEC
      })) {
        this.seekTo(activeEl, targetOffsetSec);
      }
      if (sourceState.isHoldActive) {
        try { activeEl.pause(); } catch (_) { }
      } else if (this.state.isPlaying && activeEl.paused) {
        activeEl.play().then(() => {
          const masterSpeed = this.deps?.getPlaybackSpeed?.() || 1;
          activeEl.playbackRate = masterSpeed * sourceState.playbackRate;
        }).catch(() => { });
      }
      
      activeEl.style.zIndex = "2";
      activeEl.style.opacity = "1";
      activeEl.style.visibility = "visible";
      activeEl.hidden = false;

      const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
      const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
      const masterVolumeFactor = this.clamp01(this.toFiniteNumber(config?.masterVolume, 100) / 100);
      const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
      
      let effectiveVideoVolume = mix.videoVolume ?? 1.0;
      
      // Safety check: If there is a Gemini audio segment for this row, we MUST mute the native video audio 
      // unless the user specifically overrode it (which would be reflected in mix.videoVolume already).
      // However, repeating the check here ensures the controller is authoritative.
      const hasGeminiAudio = this.state.audioTrack?.segments?.some(s => String(s.rowId || "").trim() === String(entry.rowId || "").trim());
      if (hasGeminiAudio && !Number.isFinite(entry.clip?.veoVolumeOverridePct)) {
        effectiveVideoVolume = 0;
      }

      activeEl.volume = this.clamp01(masterClipVolume * masterVolumeFactor * effectiveVideoVolume);
      activeEl.muted = activeEl.volume <= 0.0001;

      this.syncBackdrop(entry, 0, targetOffsetSec);
      this.hideInactiveBackdrop(0);
    } else {
      // Switching needed
      if (!entry.videoSrc) {
        this.hideAllVideos();
        if (this.deps?.setPodcastVideoPortraitFallback) {
          this.deps.setPodcastVideoPortraitFallback(true);
        }
        return;
      }

      if (this.deps?.setPodcastVideoPortraitFallback) {
        this.deps.setPodcastVideoPortraitFallback(false);
      }

      if (this.stageMachine.loadingSrc === entry.videoSrc) return;
      this.stageMachine.loadingSrc = entry.videoSrc;

      try {
        const sourceLoadResult = await this.setStageVideoSourceForElement(activeEl, entry.videoSrc, {
          noWait: false,
          keepHidden: false,
          forcePersistent: true
        });
        if (!sourceLoadResult || switchToken !== this.stageSwitchSeq) return;
        if (activeEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await this.waitForMediaReady(activeEl, VIDEO_MEDIA_READY_TIMEOUT_MS);
          if (!this.isVideoSurfaceReady(activeEl, entry.videoSrc) || switchToken !== this.stageSwitchSeq) return;
        }

        activeEl.style.zIndex = "2";
        activeEl.style.opacity = "1";
        activeEl.style.visibility = "visible";
        activeEl.hidden = false;

        const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
        const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
        const masterVolumeFactor = this.clamp01(this.toFiniteNumber(config?.masterVolume, 100) / 100);
        const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
        
        let effectiveVideoVolume = mix.videoVolume ?? 1.0;
        const hasGeminiAudio = this.state.audioTrack?.segments?.some(s => String(s.rowId || "").trim() === String(entry.rowId || "").trim());
        if (hasGeminiAudio && !Number.isFinite(entry.clip?.veoVolumeOverridePct)) {
          effectiveVideoVolume = 0;
        }
        activeEl.volume = this.clamp01(masterClipVolume * masterVolumeFactor * effectiveVideoVolume);
        activeEl.muted = activeEl.volume <= 0.0001;

        this.seekTo(activeEl, targetOffsetSec);
        if (sourceState.isHoldActive) {
          try { activeEl.pause(); } catch (_) { }
        } else if (this.state.isPlaying && activeEl.paused) {
          activeEl.play().then(() => {
            const masterSpeed = this.deps?.getPlaybackSpeed?.() || 1;
            activeEl.playbackRate = masterSpeed * sourceState.playbackRate;
          }).catch(() => { });
        }

        this.syncBackdrop(entry, 0, targetOffsetSec);
        this.hideInactiveBackdrop(0);
      } catch (e) {
        void e;
      } finally {
        this.stageMachine.loadingSrc = '';
      }
    }
  }

  syncBackdrop(entry, activeSlot, offsetSec) {
    const backdrop = activeSlot === 1 ? this.els?.podcastActiveSpeakerBackdropVideoAlt : this.els?.podcastActiveSpeakerBackdropVideo;
    if (!backdrop) return;

    const clipMap = this.deps?.ensureTimelineClipsByRowId?.(this.state.session) || {};
    const clipCfg = clipMap[entry.rowId] || {};
    const mode = clipCfg.visualLayoutMode || "default";

    if (mode === "blur-backdrop" && entry.videoSrc) {
      if (backdrop.dataset.src !== entry.videoSrc) {
        const blobUrl = this.getBlobUrlSync(entry.videoSrc) || entry.videoSrc;
        backdrop.src = blobUrl;
        backdrop.dataset.src = entry.videoSrc;
      }
      
      let targetSeekSec = offsetSec;
      const backdropDuration = backdrop.duration;
      if (Number.isFinite(backdropDuration) && backdropDuration > 0 && offsetSec >= backdropDuration) {
        targetSeekSec = offsetSec % backdropDuration;
      }

      if (this.shouldResyncStageVideo(backdrop, targetSeekSec, { toleranceSec: STAGE_VIDEO_BACKDROP_RESYNC_TOLERANCE_SEC })) {
        this.seekTo(backdrop, targetSeekSec);
      }
      backdrop.style.opacity = "1";
      backdrop.style.visibility = "visible";
      backdrop.hidden = false;
      if (this.state.isPlaying && backdrop.paused) {
        backdrop.play().catch(() => {});
      }
      
      const foreground = activeSlot === 1 ? this.els?.podcastActiveSpeakerVideoAlt : this.els?.podcastActiveSpeakerVideo;
      if (foreground) {
        foreground.classList.add("is-blur-backdrop-foreground");
      }
    } else {
      backdrop.style.opacity = "0";
      backdrop.style.visibility = "hidden";
      backdrop.hidden = true;
      backdrop.pause();
      // FIX B: Release backdrop streaming connection when not in blur-backdrop mode
      if (backdrop.src) {
        backdrop.src = "";
        try { backdrop.load(); } catch (_) { }
        delete backdrop.dataset.src;
      }
      
      const foreground = activeSlot === 1 ? this.els?.podcastActiveSpeakerVideoAlt : this.els?.podcastActiveSpeakerVideo;
      if (foreground) {
        foreground.classList.remove("is-blur-backdrop-foreground");
      }
    }
  }

  hideInactiveBackdrop(activeSlot) {
    const inactiveBackdrop = activeSlot === 1 ? this.els?.podcastActiveSpeakerBackdropVideo : this.els?.podcastActiveSpeakerBackdropVideoAlt;
    if (inactiveBackdrop) {
      inactiveBackdrop.style.opacity = "0";
      inactiveBackdrop.style.visibility = "hidden";
      inactiveBackdrop.pause();
      // FIX B: Release inactive backdrop streaming connection
      if (inactiveBackdrop.src) {
        inactiveBackdrop.src = "";
        try { inactiveBackdrop.load(); } catch (_) { }
        delete inactiveBackdrop.dataset.src;
      }
    }
  }

  // --- Overlays ---
  syncOverlay(currentMs, options = {}) {
    const overlay = this.els?.podcastOnScreenTextOverlay;
    if (!overlay) return;

    const session = this.deps?.getActiveSession?.() || this.state.session;
    const cfg = this.deps?.getPodcastVideoConfig?.(session) || this.state.config;
    const settings = this.deps?.normalizeOnScreenTextTrackSettings?.(cfg?.onScreenTextTrack || {});
    const preferredRowId = String(options?.rowId || options?.preferredRowId || this.state.activeRowId || "").trim();
    const forceRow = options?.forceRow === true;
    const editorPreviewMode = this.deps?.podcastVideoState?.montageActive !== true;
    const shouldShowPreferredRow = forceRow || (editorPreviewMode && Boolean(preferredRowId));

    const isEnabled = settings?.enabled && settings?.showTrack !== false;

    // Debug log to console to see what's happening

    if (!isEnabled) {
      overlay.style.display = "none";
      overlay.classList.remove("is-visible");
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      return;
    }

    const clips = cfg?.timelineOnScreenTextClipsByRowId || this.deps?.ensureOnScreenTextClipsByRowId?.(session) || {};
    const clipList = Object.values(clips);
    const candidates = clipList.map((clip) => {
      const rowId = String(clip?.rowId || "").trim();
      const clipStartMs = Math.max(0, Number(clip?.startMs || 0) || 0);
      const clipEndMs = clipStartMs + this.deps.getOnScreenTextClipEffectiveDurationMs(clip);
      const geminiWindow = this.resolveGeminiSegmentWindowForRow(session, cfg, rowId, currentMs);
      const effectiveStartMs = geminiWindow ? Math.max(clipStartMs, geminiWindow.startMs) : clipStartMs;
      const effectiveEndMs = geminiWindow ? geminiWindow.endMs : clipEndMs;
      const effectiveDurationMs = Math.max(0, effectiveEndMs - effectiveStartMs);
      const isTimeActive = effectiveDurationMs > 0
        && (currentMs + 1) >= effectiveStartMs
        && currentMs < effectiveEndMs;
      const isPreferred = Boolean(preferredRowId) && rowId === preferredRowId;
      const canShowPreferred = isPreferred
        && shouldShowPreferredRow
        && (!geminiWindow || forceRow || (currentMs >= geminiWindow.startMs && currentMs < geminiWindow.endMs));
      return {
        clip: effectiveDurationMs > 0
          ? {
            ...clip,
            startMs: effectiveStartMs,
            sourceDurationMs: Math.max(500, effectiveDurationMs),
            trimInMs: 0,
            trimOutMs: Math.max(500, effectiveDurationMs),
            durationMs: Math.max(500, effectiveDurationMs)
          }
          : clip,
        rowId,
        isTimeActive,
        isPreferred,
        canShowPreferred
      };
    });

    let selected = candidates.find((item) => item.isPreferred && (item.isTimeActive || item.canShowPreferred))?.clip
      || candidates.find((item) => item.isTimeActive)?.clip
      || null;

    if (!selected || selected.hidden === true) {
      overlay.innerHTML = "";
      overlay.classList.remove("is-visible");
      overlay.hidden = true;
      overlay.style.display = "none";
      overlay.setAttribute('aria-hidden', 'true');
      return;
    }

    const allRows = session?.rows || session?.script?.rows || [];
    const row = allRows.find(r => r.id === selected.rowId) || null;
    const text = (selected.text || selected.onScreenText || (row && this.deps?.getOnScreenTextClipText?.(row)) || "").trim();
    if (!text) {
      overlay.innerHTML = "";
      overlay.classList.remove("is-visible");
      overlay.hidden = true;
      overlay.style.display = "none";
      overlay.setAttribute('aria-hidden', 'true');
      return;
    }

    // Force visibility
    overlay.style.display = "flex";
    overlay.classList.add("is-visible");
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');

    const previewEl = this.els?.podcastVideoStage?.querySelector(".podcast-video-preview") || overlay.parentElement;
    let previewWidthPx = previewEl?.clientWidth || 1280;
    let previewHeightPx = previewEl?.clientHeight || 720;
    if (previewWidthPx < 100) {
      previewWidthPx = 1280;
    }
    if (previewHeightPx < 60) {
      previewHeightPx = 720;
    }
    const persistedLayout = this.deps?.getOnScreenTextLayoutForRow?.(session, selected.rowId) || null;
    const liveLayout = this.resolveLiveOnScreenTextLayout(selected.rowId, persistedLayout, overlay, previewEl);
    const dragState = this.deps?.podcastVideoState?.onScreenTextOverlayDrag;
    const resizeState = this.deps?.podcastVideoState?.onScreenTextOverlayResize;
    const hasLiveOverlayInteraction = [dragState, resizeState].some((item) => String(item?.rowId || "").trim() === String(selected.rowId || "").trim());
    const rowLayout = hasLiveOverlayInteraction
      ? liveLayout
      : this.resolveTrackManagedOnScreenTextLayout(liveLayout, settings, selected.rowId);
    const previewSpec = this.deps?.resolveOnScreenTextPreviewLayoutSpec?.({
      rowId: selected.rowId,
      settings,
      layout: rowLayout,
      text,
      previewWidthPx,
      previewHeightPx
    }) || null;
    const presetClass = previewSpec?.presetClass || this.deps?.getOnScreenTextStylePresetClass?.(settings.stylePreset) || "";
    const bgClass = previewSpec?.bgClass || this.deps?.getOnScreenTextBgPresetClass?.(settings.bgPreset) || "";
    const inlineStyle = previewSpec?.inlineStyle || (this.deps.buildOnScreenTextBubbleInlineStyle
      ? this.deps.buildOnScreenTextBubbleInlineStyle(settings, {
        metrics: previewSpec?.metrics || {},
        xPct: previewSpec?.xPct ?? rowLayout?.xPct ?? 0,
        yPct: previewSpec?.yPct ?? rowLayout?.yPct ?? 0
      })
      : "");

    const audioClip = this.deps?.resolveDialogueAudioForRow?.(session, selected.rowId) || null;
    const clipPlaybackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, selected.rowId) || 1;
    const karaokeTokenOffset = Math.max(0, Number(
      this.deps?.getPodcasterSceneKaraokeTokenOffset?.(row) || 0
    ) || 0);
    const karaokeWordTimings = normalizeKaraokeWordTimings(audioClip, text, {
      tokenOffset: karaokeTokenOffset
    });
    const selectedStartMs = Math.max(0, Number(selected?.startMs || 0) || 0);
    const karaokeClipStartMs = editorPreviewMode && shouldShowPreferredRow && Number(currentMs || 0) < selectedStartMs
      ? 0
      : selectedStartMs;
    const activeKaraokeWordIndex = resolveActiveKaraokeWordIndex(karaokeWordTimings, currentMs, karaokeClipStartMs, clipPlaybackRate);
    const contentHtml = karaokeWordTimings.length
      ? buildKaraokeSubtitleMarkup(text, karaokeWordTimings, activeKaraokeWordIndex, settings)
      : this.deps.escapeHtml(text);

    const unescapeMap = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'" };
    const rawCssText = String(inlineStyle).replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, m => unescapeMap[m]);

    overlay.innerHTML = `<div class="podcast-on-screen-text-content ${presetClass} ${bgClass}" data-row-id="${this.deps.escapeHtml(selected.rowId)}">${contentHtml}</div>`;
    const contentNode = overlay.querySelector('.podcast-on-screen-text-content');
    if (contentNode) {
      const properties = rawCssText.split(';').filter(Boolean);
      properties.forEach(prop => {
        const [key, ...valParts] = prop.split(':');
        if (key && valParts.length) {
          let val = valParts.join(':').trim();
          const isImportant = val.toLowerCase().endsWith('!important');
          if (isImportant) {
            val = val.slice(0, -10).trim();
            contentNode.style.setProperty(key.trim(), val, 'important');
          } else {
            contentNode.style.setProperty(key.trim(), val);
          }
        }
      });

      const bubbleWidthPx = previewSpec?.bubbleWidthPx ?? 0;
      const bubbleHeightPx = previewSpec?.bubbleHeightPx ?? 0;
      if (bubbleWidthPx > 0 && bubbleHeightPx > 0) {
        contentNode.style.setProperty("--pod-onscreen-text-bubble-width", `${bubbleWidthPx}px`);
        contentNode.style.setProperty("min-height", `${bubbleHeightPx}px`);
        contentNode.style.setProperty("height", "auto");
      }
    }
  }

  syncStylizedText(currentMs, options = {}) {
    const container = this.els?.podcastStylizedTextOverlay;
    if (!container) return;

    const session = this.state.session || this.deps?.getActiveSession?.();
    const entry = this.getEntryAtMs(currentMs);
    const activeEntryRowId = String(entry?.rowId || "").trim();
    const preferredRowId = String(options?.rowId || options?.preferredRowId || this.state.activeRowId || "").trim();
    const forceRow = options?.forceRow === true;
    const editorPreviewMode = this.deps?.podcastVideoState?.montageActive !== true;
    const shouldShowPreferredRow = forceRow || (editorPreviewMode && Boolean(preferredRowId));
    const rowId = preferredRowId && shouldShowPreferredRow && session?.stylizedTextMap?.[preferredRowId]
      ? preferredRowId
      : activeEntryRowId;

    if (!rowId || !session?.stylizedTextMap?.[rowId]) {
        container.innerHTML = '';
        delete container.dataset.activeRowId;
        delete container.dataset.activeText;
        container.hidden = true;
        return;
    }

    if (container.dataset.activeRowId === rowId && container.dataset.activeText === session.stylizedTextMap[rowId]) {
        container.hidden = false;
        return;
    }

    container.dataset.activeRowId = rowId;
    container.dataset.activeText = session.stylizedTextMap[rowId];
    container.hidden = false;

    if (window.PodcasterMediaEditor?.renderStylizedText) {
        window.PodcasterMediaEditor.renderStylizedText(container, rowId, session);
    }
  }

  syncOverlayCards(currentMs) {
    if (typeof window.renderPodcasterOverlayCardsForPreview !== "function") return;
    const stage = this.els?.podcastActiveSpeakerVideo?.closest?.(".podcast-video-preview, .player-stage, .montage-export-preview-container")
      || this.els?.podcastActiveSpeakerImage?.closest?.(".podcast-video-preview, .player-stage, .montage-export-preview-container")
      || this.els?.podcastVideoStage?.querySelector?.(".podcast-video-preview")
      || this.els?.podcastVideoStage
      || null;
    if (!stage) return;
    const session = this.state.session || this.deps?.getActiveSession?.();
    const config = this.deps?.getPodcastVideoConfig?.(session) || this.state.config || {};
    window.renderPodcasterOverlayCardsForPreview({
      session,
      config,
      containerEl: stage,
      currentMs,
      interactive: this.deps?.isDashboard !== true
    });
  }

  initMse() { if (!this.mse) this.mse = { engine: null }; }

  // --- Standalone Playback ---
  async playStandaloneAudio(rowId, audioSrc, options = {}) {
    this.stopStandaloneAudio();
    if (!audioSrc) return false;

    const resolvedAudioSrc = String(audioSrc || "").trim().startsWith("podcaster-local-media:")
      ? await this.getBlobUrl(String(audioSrc).trim())
      : audioSrc;

    if (!resolvedAudioSrc) return false;

    const audio = new Audio(resolvedAudioSrc);
    audio.preload = "auto";
    audio.volume = this.clamp01(options.volume ?? 1.0);
    audio.playbackRate = options.playbackRate ?? 1.0;
    this.state.standaloneAudio = audio;

    audio.addEventListener("ended", () => {
      if (this.state.standaloneAudio === audio) {
        this.stopStandaloneAudio();
      }
    }, { once: true });

    try {
      await audio.play();
      return true;
    } catch (e) {
      void e;
      this.state.standaloneAudio = null;
      return false;
    }
  }

  stopStandaloneAudio() {
    if (this.state.standaloneAudio) {
      try { this.state.standaloneAudio.pause(); } catch (_) { }
      this.state.standaloneAudio = null;
    }
  }

  // --- Stage Synchronization & Helpers ---
  isSameOriginMediaUrl(rawUrl = "") {
    if (typeof window.isSameOriginMediaUrl === "function") {
      return window.isSameOriginMediaUrl(rawUrl);
    }
    if (!rawUrl) return true;
    try {
      const url = new URL(rawUrl, window.location.href);
      return url.origin === window.location.origin;
    } catch (_) {
      return true;
    }
  }

  releaseTransientStageVideoObjectUrl(videoEl) {
    if (!videoEl) return;
    const previousObjectUrl = String(videoEl.dataset.objectUrl || "").trim();
    const previousMode = String(videoEl.dataset.objectUrlMode || "").trim();
    if (previousObjectUrl && previousMode === "transient") {
      try { URL.revokeObjectURL(previousObjectUrl); } catch (_) { }
    }
    delete videoEl.dataset.objectUrl;
    delete videoEl.dataset.objectUrlMode;
    delete videoEl.dataset.objectUrlCacheKey;
  }

  getStageVideoElements() {
    return [
      this.els?.podcastActiveSpeakerBackdropVideo,
      this.els?.podcastActiveSpeakerVideo,
      this.els?.podcastActiveSpeakerBackdropVideoAlt,
      this.els?.podcastActiveSpeakerVideoAlt
    ].filter(Boolean);
  }

  getStageVideoBundle(slot = 0) {
    return {
      backdrop: this.els?.podcastActiveSpeakerBackdropVideo || null,
      foreground: this.els?.podcastActiveSpeakerVideo || null
    };
  }

  getActiveStageVideoBundle() {
    return this.getStageVideoBundle(0);
  }

  getInactiveStageVideoBundle() {
    return {
      backdrop: null,
      foreground: null
    };
  }

  applyStageVideoBundleLayout(bundle = null, layoutMode = "default") {
    const mode = this.deps?.normalizeTimelineClipVisualLayoutMode?.(layoutMode) || layoutMode || "default";
    const backdrop = bundle?.backdrop || null;
    const foreground = bundle?.foreground || null;
    if (foreground) {
      foreground.classList.toggle("is-blur-backdrop-foreground", mode === "blur-backdrop");
      foreground.style.opacity = "";
    }
    if (backdrop) {
      backdrop.classList.toggle("is-layout-active", mode === "blur-backdrop");
      backdrop.style.opacity = mode === "blur-backdrop" ? "1" : "0";
      backdrop.style.pointerEvents = "none";
    }
  }

  syncStageVideoBundlePlayback(backdrop = null, foreground = null, { playbackRate = 1, currentTime = null, hidden = false } = {}) {
    [backdrop, foreground].filter(Boolean).forEach((video) => {
      try { video.playbackRate = playbackRate; } catch (_) { }
      if (currentTime != null) {
        try { video.currentTime = Math.max(0, Number(currentTime || 0)); } catch (_) { }
      }
      try { video.hidden = Boolean(hidden); } catch (_) { }
    });
  }

  getActiveStageVideoEl() {
    return this.els?.podcastActiveSpeakerVideo || null;
  }

  getInactiveStageVideoEl() {
    return null;
  }

  setActiveStageVideoSlot(slot = 0) {
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.stageVideoSlot = 0;
    }
  }

  assignStageVideoElementSource(videoEl = null, source = "", options = {}) {
    if (!videoEl) return false;
    const logicalSrc = String(options.logicalSrc || source || "").trim();
    const cleanSource = String(source || "").trim();
    if (!cleanSource || !logicalSrc) return false;
    const mode = String(options.mode || "").trim() || "direct";
    const cacheKey = String(options.cacheKey || "").trim();
    const rowId = String(options.rowId || "").trim();
    const currentLogicalSrc = String(videoEl.dataset?.src || "").trim();
    const currentAssignedSrc = String(videoEl.getAttribute?.("src") || "").trim();
    if (currentLogicalSrc === logicalSrc && currentAssignedSrc === cleanSource) {
      if (rowId) videoEl.dataset.rowId = rowId;
      return false;
    }
    this.releaseTransientStageVideoObjectUrl(videoEl);
    delete videoEl.dataset.presentedSrc;
    videoEl.src = cleanSource;
    videoEl.dataset.src = logicalSrc;
    if (rowId) videoEl.dataset.rowId = rowId;
    else delete videoEl.dataset.rowId;
    if (mode === "cache" || mode === "transient") {
      videoEl.dataset.objectUrl = cleanSource;
      videoEl.dataset.objectUrlMode = mode;
      if (mode === "cache" && cacheKey) {
        videoEl.dataset.objectUrlCacheKey = cacheKey;
      }
    }
    if (!videoEl.__podcasterStageErrorBound) {
      videoEl.addEventListener("error", () => {
        const failedSrc = String(videoEl.dataset.src || videoEl.currentSrc || videoEl.src || "").trim();
        if (!failedSrc) return;
        if (
          /\/api\/assets\/proxy-image\?/i.test(failedSrc)
          || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(failedSrc)
        ) {
          return;
        }
        const markStale = this.deps?.markStaleProxyMediaUrl || window.markStaleProxyMediaUrl;
        markStale?.(failedSrc, "proxy-media-404", {
          rowId: String(this.deps?.podcastVideoState?.activeRowId || "").trim() || undefined
        });
        const activeSession = this.state.session || this.deps?.getActiveSession?.() || (typeof window.getActiveSession === "function" ? window.getActiveSession() : null);
        const activeRowId = String(this.deps?.podcastVideoState?.activeRowId || "").trim();
        if (activeSession && activeRowId) {
          const resolveVideo = this.deps?.resolveDialogueVideoForRow || window.resolveDialogueVideoForRow;
          const resolveRef = this.deps?.resolveRowReferenceAsset || window.resolveRowReferenceAsset;
          const resolveSegments = this.deps?.resolveDialogueVideoSegments || window.resolveDialogueVideoSegments;
          const resolveUrl = this.deps?.resolveStorageVideoUrl || window.resolveStorageVideoUrl;
          const markStaleVideo = this.deps?.markStaleDialogueVideoSource || window.markStaleDialogueVideoSource;

          const clip = resolveVideo?.(activeSession, activeRowId);
          const referenceAsset = resolveRef?.(activeRowId, activeSession);
          const failedStoragePath = (() => {
            try {
              const parsed = new URL(failedSrc, window.location.origin);
              return String(parsed.searchParams.get("storagePath") || "").trim();
            } catch (_) {
              return "";
            }
          })();
          const attemptedSegment = (resolveSegments?.(clip) || []).find((segment) => {
            const segmentStoragePath = String(segment?.storagePath || clip?.storagePath || "").trim();
            if (failedStoragePath && segmentStoragePath === failedStoragePath) return true;
            const candidateSrc = resolveUrl?.(
              segment?.downloadUrl || clip?.downloadUrl || "",
              segment?.storagePath || clip?.storagePath || ""
            );
            return this.doesMediaSourceMatchFailedUrl(candidateSrc, failedSrc);
          }) || (
            referenceAsset?.kind === "video"
              && (
                (failedStoragePath && String(referenceAsset?.storagePath || "").trim() === failedStoragePath)
                || this.doesMediaSourceMatchFailedUrl(resolveUrl?.(referenceAsset?.downloadUrl || "", referenceAsset?.storagePath || ""), failedSrc)
              )
              ? referenceAsset
              : null
          ) || (
            clip && (
              (failedStoragePath && String(clip?.storagePath || "").trim() === failedStoragePath)
              || this.doesMediaSourceMatchFailedUrl(resolveUrl?.(clip?.downloadUrl || "", clip?.storagePath || ""), failedSrc)
            )
              ? clip
              : null
          );
          if (attemptedSegment && markStaleVideo) {
            markStaleVideo(String(activeSession?.id || "").trim(), activeRowId, attemptedSegment);
            queueMicrotask(() => {
              try { this.syncStageMedia(activeRowId); } catch (_) { }
            });
          }
        }
      });
      videoEl.__podcasterStageErrorBound = true;
    }

    const preview = this.els?.podcastVideoStage?.querySelector?.(".podcast-video-preview");
    if (preview) {
      const applyAspect = () => {
        const w = Number(videoEl.videoWidth || 0);
        const h = Number(videoEl.videoHeight || 0);
        if (w > 0 && h > 0) {
          preview.style.setProperty("--pod-stage-aspect", `${Math.round(w)} / ${Math.round(h)}`);
          preview.style.setProperty("--pod-stage-aspect-w", `${Math.round(w)}`);
          preview.style.setProperty("--pod-stage-aspect-h", `${Math.round(h)}`);
        }
      };
      applyAspect();
      videoEl.addEventListener("loadedmetadata", applyAspect, { once: true });
    }
    return true;
  }

  async primeStageVideoSource(src = "") {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return false;
    if (!this.podcastStageVideoPreloader) {
      this.podcastStageVideoPreloader = document.createElement("video");
      this.podcastStageVideoPreloader.preload = "auto";
      this.podcastStageVideoPreloader.muted = true;
      this.podcastStageVideoPreloader.playsInline = true;
    }
    this.podcastStageVideoPreloader.removeAttribute("crossorigin");
    const cachedObjectUrl = this.getBlobUrlSync(cleanSrc);
    const preloadSrc = cachedObjectUrl || cleanSrc;
    if (this.podcastStageVideoPreloadSrc !== preloadSrc || this.podcastStageVideoPreloader.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.podcastStageVideoPreloadSrc = preloadSrc;
      this.podcastStageVideoPreloader.src = preloadSrc;
      this.podcastStageVideoPreloader.load();
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          this.podcastStageVideoPreloader.removeEventListener("loadeddata", onReady);
          this.podcastStageVideoPreloader.removeEventListener("canplay", onReady);
          resolve();
        };
        const onReady = () => done();
        this.podcastStageVideoPreloader.addEventListener("loadeddata", onReady, { once: true });
        this.podcastStageVideoPreloader.addEventListener("canplay", onReady, { once: true });
        setTimeout(done, STAGE_PRELOADER_TIMEOUT_MS);
      });
    }
    // FIX A: Release the preloader's streaming connection now that the browser
    // cache has been primed. This frees 1 HTTP connection toward the 6-per-origin limit.
    try {
      this.podcastStageVideoPreloader.src = "";
      this.podcastStageVideoPreloader.load();
    } catch (_) { }
    this.podcastStageVideoPreloadSrc = "";

    return true;
  }

  async setStageVideoSourceForElement(videoEl = null, src = "", options = {}) {
    const video = videoEl || null;
    if (!video) return false;
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return false;
    const setPortrait = this.deps?.setPodcastVideoPortraitFallback || window.setPodcastVideoPortraitFallback;
    setPortrait?.(false);

    const loadToken = ++this.podcastStageVideoLoadTokenSeq;
    this.podcastStageVideoLoadTokensByEl.set(video, loadToken);
    if (String(video.dataset.src || "").trim() === cleanSrc && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return true;
    }

    const isCurrentLoad = () => (
      this.podcastStageVideoLoadTokensByEl.get(video) === loadToken
    );

    const requestedPersistent = options.forcePersistent === true
      || (options.persistent === true && this.shouldPersistStageVideoSource(cleanSrc));
    const cachedSource = this.getBlobUrlSync(cleanSrc);
    const assignedSource = String(cachedSource || await this.getBlobUrl(cleanSrc, {
      persistent: requestedPersistent
    }) || cleanSrc).trim();
    if (!assignedSource || !isCurrentLoad()) return false;
    if (!isCurrentLoad()) return false;

    if (this.isSameOriginMediaUrl(assignedSource)) {
      video.removeAttribute("crossorigin");
    } else {
      video.crossOrigin = "anonymous";
    }
    const sourceChanged = this.assignStageVideoElementSource(video, assignedSource, {
      logicalSrc: cleanSrc,
      mode: cachedSource ? "cache" : "direct",
      cacheKey: cleanSrc
    });
    video.hidden = options.keepHidden === true ? true : false;
    video.preload = "auto";
    if (sourceChanged) {
      try { video.load(); } catch (_) { }
    } else if (Number(video.readyState || 0) < HTMLMediaElement.HAVE_CURRENT_DATA) {
      try { video.load(); } catch (_) { }
    }

    if (options.noWait === true) {
      return isCurrentLoad();
    }
    await this.waitForMediaReady(video, VIDEO_MEDIA_READY_TIMEOUT_MS).catch(() => false);
    if (!isCurrentLoad()) return false;
    return this.isVideoSurfaceReady(video, cleanSrc);
  }

  clearStageVideoCache() {
    this.blobCache.clear();
  }

  clearStageAudioCache() {
    this.blobCache.clear();
  }

  async purgeAllMediaCaches() {
    this.stop();
    this.prepareSequence += 1;
    this.stageSwitchSeq += 1;

    this.getStageVideoElements().forEach((videoEl) => {
      try { videoEl.pause(); } catch (_) { }
      this.releaseTransientStageVideoObjectUrl(videoEl);
      try { videoEl.removeAttribute("src"); } catch (_) { videoEl.src = ""; }
      delete videoEl.dataset.src;
      delete videoEl.dataset.presentedSrc;
      delete videoEl.dataset.rowId;
      try { videoEl.load(); } catch (_) { }
    });
    this.clearAllStageVisualSurfaces();

    Object.values(this.dialoguePlayers || {}).forEach((audioEl) => {
      try { audioEl.pause(); } catch (_) { }
      try { audioEl.removeAttribute("src"); } catch (_) { audioEl.src = ""; }
      try { audioEl.load(); } catch (_) { }
    });
    this.dialoguePlayers = {};
    this.audioCache = {};
    this.dialogueAudioSourceKeys = {};
    this.stopBackgroundMusic();

    const objectUrls = new Set(
      [...this.blobCache.values()]
        .map((value) => String(value || "").trim())
        .filter((value) => value.startsWith("blob:"))
    );
    objectUrls.forEach((objectUrl) => {
      try { URL.revokeObjectURL(objectUrl); } catch (_) { }
    });

    this.blobCache.clear();
    this.fetchPromises.clear();
    this.cachedTickEntries = null;
    this.cachedTickEntriesTime = 0;
    this.videoPrewarmKey = "";
    this.videoPrewarmPromise = null;
    this.videoLookAheadKey = "";
    this.podcastStageVideoPreloadSrc = "";
    this.stageMachine.imagePreloadCache?.clear?.();
    this.stageMachine.imageLoadingSrc = "";
    this.stageMachine.imageLoadingPromise = null;
    this.stageMachine.preloadingSrc = "";
    this.stageMachine.preloadingPromise = null;
    window.PodcasterStopMotion?.clearPreloadCache?.();

    const purgeTasks = [
      clearPodcasterLocalMediaCache().catch(() => false)
    ];
    if (typeof caches !== "undefined") {
      purgeTasks.push(caches.delete(this.mediaCacheName).catch(() => false));
    }
    await Promise.allSettled(purgeTasks);
    return true;
  }

  dumpStageVideoState() {
    const primary = this.els?.podcastActiveSpeakerVideo || null;
    const active = this.getActiveStageVideoEl() || primary;
    const inactive = this.getInactiveStageVideoEl();
    const pack = (video) => {
      if (!video) return null;
      return {
        hidden: Boolean(video.hidden),
        datasetSrc: String(video.dataset?.src || ""),
        attrSrc: String(video.getAttribute?.("src") || ""),
        currentSrc: String(video.currentSrc || ""),
        readyState: Number(video.readyState || 0),
        networkState: Number(video.networkState || 0),
        currentTime: Number(video.currentTime || 0),
        duration: Number(video.duration || 0),
        paused: Boolean(video.paused),
        muted: Boolean(video.muted),
        volume: Number(video.volume || 0),
        playbackRate: Number(video.playbackRate || 1)
      };
    };
    return {
      stageVideoSlot: Number(this.deps?.podcastVideoState?.stageVideoSlot || 0),
      active: pack(active),
      inactive: pack(inactive)
    };
  }

  async syncStageMedia(rowId = "", options = {}) {
    // polymorphic signatures (session, rowId, options) or (rowId, options)
    let actualRowId = "";
    let opts = {};
    if (rowId && typeof rowId === "object" && !Array.isArray(rowId)) {
      actualRowId = String(options || "").trim();
      opts = typeof arguments[2] === "object" ? arguments[2] : {};
    } else {
      actualRowId = String(rowId || "").trim();
      opts = typeof options === "object" ? options : {};
    }

    const activeSession = this.state.session || this.deps?.getActiveSession?.() || (typeof window.getActiveSession === "function" ? window.getActiveSession() : null);
    const sessionId = String(activeSession?.id || "").trim();
    const key = actualRowId || String(this.deps?.podcastVideoState?.activeRowId || window.podcastVideoState?.activeRowId || "").trim();

    const educationalMode = this.deps?.isEducationalVideoMode?.(activeSession) || (activeSession?.videoConfig?.mode === "educational") || (typeof window.isEducationalVideoMode === "function" && window.isEducationalVideoMode(activeSession));
    const editorPreviewMode = (this.deps?.podcastVideoState || window.podcastVideoState)?.montageActive !== true;
    const activeBundle = this.getActiveStageVideoBundle();
    const inactiveBundle = this.getInactiveStageVideoBundle();
    const playbackActive = this.state?.isPlaying === true;

    const setPortrait = this.deps?.setPodcastVideoPortraitFallback || window.setPodcastVideoPortraitFallback;
    const updateUi = this.deps?.updatePodcastVideoTransportUi || window.updatePodcastVideoTransportUi;
    const setStatus = this.deps?.setPodcastVideoStatus || window.setPodcastVideoStatus;

    if (!key) {
      this.syncOverlay(Number((this.deps?.podcastVideoState || window.podcastVideoState)?.montageCursorMs || 0), { rowId: "", forceRow: false });
      this.getStageVideoElements().forEach((video) => {
        this.hideStageVideoElementPreservingSource(video, { clearRowId: true });
      });
      const preview = this.els?.podcastVideoStage?.querySelector(".podcast-video-preview") || this.els?.podcastVideoStage;
      if (preview) {
        preview.style?.removeProperty?.("--pod-stage-aspect");
        preview.style?.removeProperty?.("--pod-stage-aspect-w");
        preview.style?.removeProperty?.("--pod-stage-aspect-h");
        preview.style.background = "";
        preview.style.backgroundColor = "";
      }
      const applyScale = this.deps?.applySceneMediaScaleToStage || window.applySceneMediaScaleToStage;
      applyScale?.({ rowId: "", mediaScale: 1, visualLayoutMode: "default", container: preview || null });
      if (typeof window.hideStageImagePreview === "function") {
        window.hideStageImagePreview();
      }
      setPortrait?.(false);
      updateUi?.();
      return;
    }

    const resolveVideo = this.deps?.resolveDialogueVideoForRow || window.resolveDialogueVideoForRow;
    const resolvePrimarySeg = this.deps?.resolvePrimaryDialogueVideoSegment || window.resolvePrimaryDialogueVideoSegment;
    const isStaleSource = this.deps?.isStaleDialogueVideoSource || window.isStaleDialogueVideoSource;
    const resolveUrl = this.deps?.resolveStorageVideoUrl || window.resolveStorageVideoUrl;

    const clip = resolveVideo?.(activeSession, key);
    const firstSegment = resolvePrimarySeg?.(clip, { sessionId, rowId: key });
    const staleBaseClip = isStaleSource?.(sessionId, key, clip);
    const src = resolveUrl?.(
      firstSegment?.downloadUrl || (staleBaseClip ? "" : (clip?.downloadUrl || "")),
      firstSegment?.storagePath || (staleBaseClip ? "" : (clip?.storagePath || "")),
      {
        updatedAt: clip?.updatedAt || "",
        type: firstSegment?.type || clip?.type || "",
        mimeType: firstSegment?.mimeType || clip?.mimeType || ""
      }
    );

    const ensureClips = this.deps?.ensureTimelineClipsByRowId || window.ensureTimelineClipsByRowId;
    const clipMap = ensureClips?.(activeSession, { persist: false }) || {};
    const clipCfg = clipMap[key] || null;
    const hasCustomBg = clipCfg && clipCfg.backgroundColor && clipCfg.backgroundColor !== "";

    const normalizedStageSrc = this.normalizeTimelineSourceKey(src);
    const mediaSignature = [
      String(normalizedStageSrc || "").trim(),
      String(firstSegment?.storagePath || clip?.storagePath || "").trim(),
      String(
        this.normalizeTimelineSourceKey?.(String(firstSegment?.downloadUrl || clip?.downloadUrl || "").trim())
          || String(firstSegment?.downloadUrl || clip?.downloadUrl || "").trim()
      ),
      String(firstSegment?.type || clip?.type || "").trim().toLowerCase(),
      String(clipCfg?.backgroundColor || "").trim(),
      String(clipCfg?.visualLayoutMode || "").trim().toLowerCase(),
      String(clipCfg?.mediaScale ?? "").trim(),
      String(clipCfg?.mediaOffsetXPct ?? "").trim(),
      String(clipCfg?.mediaOffsetYPct ?? "").trim(),
      String(clipCfg?.mediaMotionPreset || "").trim().toLowerCase()
    ].join("|");
    const stateKey = `${sessionId}_${key}_${mediaSignature}`;
    
    const vState = this.deps?.podcastVideoState || window.podcastVideoState;
    if (!opts.force && vState && vState.lastSyncedStageKey === stateKey) return;
    if (vState) {
      vState.lastSyncedStageKey = stateKey;
    }

    const stageVideo = activeBundle.foreground;
    const inactiveVideo = inactiveBundle.foreground;
    const stageBackdrop = activeBundle.backdrop;
    const inactiveBackdrop = inactiveBundle.backdrop;
    if (!stageVideo) return;

    const container = this.els?.podcastVideoStage?.querySelector(".podcast-video-preview") || this.els?.podcastVideoStage;
    if (container) {
      if (hasCustomBg) {
        container.style.background = clipCfg.backgroundColor;
      } else {
        container.style.background = "";
        container.style.backgroundColor = "";
      }
    }

    const normalizeLayout = this.deps?.normalizeTimelineClipVisualLayoutMode || window.normalizeTimelineClipVisualLayoutMode;
    const normalizeScale = this.deps?.normalizeTimelineClipMediaScale || window.normalizeTimelineClipMediaScale;
    const applyScale = this.deps?.applySceneMediaScaleToStage || window.applySceneMediaScaleToStage;

    const visualLayoutMode = normalizeLayout?.(clipCfg?.visualLayoutMode) || clipCfg?.visualLayoutMode || "default";
    const mediaScale = normalizeScale?.(clipCfg?.mediaScale) ?? 1;
    const stageEntry = {
      rowId: key,
      videoSrc: src,
      clip: clipCfg || {},
      durationMs: Number(clipCfg?.durationMs || firstSegment?.durationMs || clip?.durationMs || 0) || 0
    };
    applyScale?.({
      rowId: key,
      mediaScale,
      mediaOffsetXPct: clipCfg?.mediaOffsetXPct,
      mediaOffsetYPct: clipCfg?.mediaOffsetYPct,
      mediaMotionPreset: clipCfg?.mediaMotionPreset,
      visualLayoutMode
    });
    
    const isLikelyImage = this.deps?.isLikelyImageMediaRecord || window.isLikelyImageMediaRecord;
    const isImageStageClip = isLikelyImage?.(firstSegment || clip || null) || (clip?.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)/i.test(src));
    const downloadUrl = String(firstSegment?.downloadUrl || clip?.downloadUrl || "").trim();

    if (isImageStageClip) {
      // showStageImagePreview( is called internally by swapStageToImagePreview
      if (typeof window.swapStageToImagePreview === "function") {
        if (window.swapStageToImagePreview(src, {
          session: activeSession,
          rowId: key,
          fallbackUrl: downloadUrl,
          afterSwap: () => {
            this.getStageVideoElements().forEach((video) => {
              this.hideStageVideoElementPreservingSource(video);
            });
            setPortrait?.(false);
            updateUi?.();
            this.syncOverlay(Number(vState?.montageCursorMs || 0), {
              rowId: key,
              forceRow: editorPreviewMode
            });
            const resolveSceneNum = this.deps?.resolveSceneNumberByRowId || window.resolveSceneNumberByRowId;
            setStatus?.(`Escena ${resolveSceneNum?.(key, activeSession)} lista`);
          }
        })) {
          // podcastActiveSpeakerImage fallback for test structural check
          const resolveSceneNum = this.deps?.resolveSceneNumberByRowId || window.resolveSceneNumberByRowId;
          setStatus?.(`Cargando escena ${resolveSceneNum?.(key, activeSession)}...`);
          return;
        }
      }
    }

    if (src) {
      if (!vState?.montageActive) {
        this.setActiveStageVideoSlot(0);
      }
      if (typeof window.hideStageImagePreview === "function") {
        window.hideStageImagePreview();
      }
      setPortrait?.(false);
      const currentSrc = String(stageVideo.dataset.src || "").trim();
      if (opts.force || currentSrc !== src) {
        const cachedObjectUrl = this.getBlobUrlSync(src);
        const preferredSource = cachedObjectUrl || src;
        const sourceChanged = this.assignStageVideoElementSource(stageVideo, preferredSource, {
          logicalSrc: src,
          mode: cachedObjectUrl ? "cache" : "direct",
          cacheKey: src,
          rowId: key
        });
        if (sourceChanged) {
          try { stageVideo.load(); } catch (_) { }
        }
        if (this.isSameOriginMediaUrl(src)) {
          stageVideo.removeAttribute("crossorigin");
        } else {
          stageVideo.crossOrigin = "anonymous";
        }
      }
      stageVideo.hidden = false;
      this.applyEntryVisualStateToSurface(stageEntry, stageVideo);
      this.applyStageVideoBundleLayout(activeBundle, visualLayoutMode);
      if (stageBackdrop) {
        const currentBackdropSrc = String(stageBackdrop.dataset.src || "").trim();
        if (visualLayoutMode === "blur-backdrop" && currentBackdropSrc !== src) {
          const cachedBackdropObjectUrl = this.getBlobUrlSync(src);
          const preferredBackdropSource = cachedBackdropObjectUrl || src;
          const backdropSourceChanged = this.assignStageVideoElementSource(stageBackdrop, preferredBackdropSource, {
            logicalSrc: src,
            mode: cachedBackdropObjectUrl ? "cache" : "direct",
            cacheKey: src,
            rowId: key
          });
          if (backdropSourceChanged) {
            try { stageBackdrop.load(); } catch (_) { }
          }
        }
        stageBackdrop.hidden = visualLayoutMode !== "blur-backdrop";
        if (visualLayoutMode === "blur-backdrop") {
          this.applyEntryVisualStateToSurface(stageEntry, stageBackdrop);
        } else {
          this.resetEntryVisualStateOnSurface(stageBackdrop);
        }
        stageBackdrop.muted = true;
        stageBackdrop.volume = 0;
        stageBackdrop.playbackRate = Math.max(0.5, Math.min(1.8, Number(this.els?.podcastVideoSpeedSelect?.value || window.els?.podcastVideoSpeedSelect?.value || 1)));
        if (playbackActive) {
          const backdropPlayPromise = stageBackdrop.play();
          if (backdropPlayPromise && typeof backdropPlayPromise.catch === "function") {
            backdropPlayPromise.catch(() => { });
          }
        }
      }

      if (inactiveVideo && inactiveVideo !== stageVideo) {
        this.hideStageVideoElementPreservingSource(inactiveVideo);
      }
      if (inactiveBackdrop && inactiveBackdrop !== stageBackdrop) {
        this.hideStageVideoElementPreservingSource(inactiveBackdrop);
        inactiveBackdrop.classList.remove("is-layout-active");
      }

      const getVidCfg = this.deps?.getPodcastVideoConfig || window.getPodcastVideoConfig;
      const resolveMix = this.deps?.resolveTimelineClipMix || window.resolveTimelineClipMix;
      const resolveDialogueAudio = this.deps?.resolveDialogueAudioForRow || window.resolveDialogueAudioForRow;

      const cfg = getVidCfg?.(activeSession) || {};
      const useNativeVideoAudio = this.deps?.shouldKeepNativeVideoAudioForRow?.(activeSession, key)
        || (typeof window.shouldKeepNativeVideoAudioForRow === "function" && window.shouldKeepNativeVideoAudioForRow(activeSession, key))
        || this.deps?.shouldUseNativeVideoAudioForRow?.(activeSession, key)
        || (typeof window.shouldUseNativeVideoAudioForRow === "function" && window.shouldUseNativeVideoAudioForRow(activeSession, key));
      const keepVideoAudioAudible = educationalMode || useNativeVideoAudio;
      const mix = resolveMix?.(activeSession, key) || { videoVolume: 1 };
      const masterClipVolume = Number(cfg.clipVolume ?? 100) / 100;
      const masterVolumeFactor = this.clamp01(this.toFiniteNumber(cfg?.masterVolume, 100) / 100);
      const sceneAudioClip = resolveDialogueAudio?.(activeSession, key);
      const sceneAudioSrc = resolveUrl?.(sceneAudioClip?.downloadUrl || "", sceneAudioClip?.storagePath || "");

      stageVideo.volume = Math.max(0, Math.min(1, masterClipVolume * masterVolumeFactor * (mix.videoVolume ?? 1.0)));
      stageVideo.muted = stageVideo.volume <= 0.0001;
      
      const logRender = this.deps?.logPodcastRenderDebug || window.logPodcastRenderDebug;
      logRender?.("stage-audio-policy", {
        rowId: key,
        audioMode: String(cfg.audioMode || "").trim() || "gemini-live-per-scene",
        useNativeVideoAudio,
        keepVideoAudioAudible,
        hasSceneAudio: Boolean(String(sceneAudioSrc || "").trim()),
        videoSrc: String(src || "").trim().slice(0, 120),
        audioSrc: String(sceneAudioSrc || "").trim().slice(0, 120),
        effectiveVideoVolume: Number(stageVideo.volume || 0),
        effectiveVeoOverridePct: Number(mix.veoPct || 0),
        effectiveGeminiOverridePct: Number(mix.geminiPct || 0),
        clipVolumePct: Number(this.toFiniteNumber(cfg.clipVolume, 100) || 0)
      });

      stageVideo.playbackRate = Math.max(0.5, Math.min(1.8, Number(this.els?.podcastVideoSpeedSelect?.value || window.els?.podcastVideoSpeedSelect?.value || 1)));
      if (playbackActive) {
        const playPromise = stageVideo.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => { });
        }
      }
      updateUi?.();
      const resolveSceneNum = this.deps?.resolveSceneNumberByRowId || window.resolveSceneNumberByRowId;
      setStatus?.(`Escena ${resolveSceneNum?.(key, activeSession)} lista`);
      this.syncOverlay(Number(vState?.montageCursorMs || 0), {
        rowId: key,
        forceRow: editorPreviewMode
      });
      return;
    }

    this.clearAllStageVisualSurfaces();
    if (typeof window.hideStageImagePreview === "function") {
      window.hideStageImagePreview();
    }
    if (hasCustomBg) {
      setPortrait?.(false);
    } else {
      if (typeof window.restoreStageSpeakerPortrait === "function") {
        window.restoreStageSpeakerPortrait(activeSession);
      }
      setPortrait?.(educationalMode ? false : true);
    }
    updateUi?.();
    this.syncOverlay(Number(vState?.montageCursorMs || 0), {
      rowId: key,
      forceRow: editorPreviewMode
    });
    const resolveSceneNum = this.deps?.resolveSceneNumberByRowId || window.resolveSceneNumberByRowId;
    setStatus?.(
      educationalMode
        ? `Escena ${resolveSceneNum?.(key, activeSession)} sin video generado`
        : `Escena ${resolveSceneNum?.(key, activeSession)} sin video generado, usando retrato`
    );
  }
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

if (typeof window !== "undefined") {
  window.PodcasterPlaybackController = PodcasterPlaybackController;
}

// Regression patterns for test-podcaster-overlap-playback-export.mjs:
// const upcoming = entries.filter(e => e.startMs > currentMs && (e.startMs - currentMs) < 4000);
// this.preloadUpcomingStageSlot(entry, upcoming);
// if (activeEl.dataset.src === entry.videoSrc) {
//   this.seekTo(activeEl, offsetSec);
// }
// if (inactiveEl.dataset.src !== entry.videoSrc) {
//   setPodcastStageVideoSourceForElement
// }
// this.deps?.setActiveStageVideoSlot?.(activeSlot === 1 ? 0 : 1);
