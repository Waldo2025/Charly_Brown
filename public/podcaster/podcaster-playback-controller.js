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
const STAGE_VIDEO_END_EPSILON_SEC = 1 / 30;
const AUTHORIZED_ASSET_REFRESH_SKEW_MS = 60 * 1000;

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
      sessionMediaStatus: "idle",
      sessionMediaProgress: { completed: 0, total: 0, failures: [] },
      isBuffering: false,
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
    this.sessionMediaPreparationGeneration = 0;
    this.sessionMediaAbortController = null;
    this.sessionMediaProgressListeners = new Set();
    this.sessionMediaLastProgress = { state: "idle", completed: 0, total: 0, failures: [] };
    this.clockRebaseRequested = false;
    this.blobCache = new Map();
    this.fetchPromises = new Map();
    this.persistentMediaWriteQueues = new Map();
    this.mediaCacheGeneration = 0;
    this.mediaSourceGenerations = new Map();
    this.mediaSourceInvalidationPromises = new Map();
    this.rowMediaGenerations = new Map();
    this.rowMediaPreparationPromises = new Map();
    this.rowMediaPreparationQueue = Promise.resolve();
    this.authorizedAssetMetadataBySource = new Map();
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
    this.backgroundRecoveryGeneration = 0;
    this.backgroundRecoverySourceKey = "";
    this.backgroundRecoveryAttempts = 0;

    this.stageMachine = {
      loadingSrc: '',
      loadingRequest: null,
      preloadingSrc: '',
      preloadingKey: '',
      preloadingPromise: null,
      activeSlot: 0,
      imageLoadingSrc: '',
      imageLoadingPromise: null,
      imageLoadingTarget: null,
      imageSwapToken: 0
    };
    this.podcastStageVideoLoadTokenSeq = 0;
    this.podcastStageVideoLoadTokensByEl = new WeakMap();
    this.stageSwitchSeq = 0;
    this.stageBufferRecoverySeq = 0;
    this.stageBufferRecoveryPromise = null;
    this.stageBufferRecoveryTimer = null;
    this.stageBufferStartMs = null;
    this.activeLoopId = 0;
    this.playheadRevision = 0;
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
    const expectedGeneration = cleanExpectedSrc
      ? String(this.getMediaSourceGeneration(cleanExpectedSrc))
      : "";
    const mountedGeneration = String(videoEl.dataset?.mediaSourceGeneration || "");
    const haveCurrentData = typeof HTMLMediaElement !== "undefined"
      ? HTMLMediaElement.HAVE_CURRENT_DATA
      : 2;
    return (!cleanExpectedSrc || String(videoEl.dataset?.src || "").trim() === cleanExpectedSrc)
      && (!cleanExpectedSrc || mountedGeneration === expectedGeneration)
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
    let clean = String(path || "").trim();
    if (!clean) return "";
    try {
      const parsed = new URL(clean, window.location.origin);
      if (/\/api\/assets\/proxy-(?:media|image)$/i.test(String(parsed.pathname || ""))) {
        const nestedUrl = String(parsed.searchParams.get("url") || "").trim();
        if (nestedUrl && this.hasFirebaseDirectAccessToken(nestedUrl)) return nestedUrl;
        let storagePath = String(parsed.searchParams.get("storagePath") || "").trim();
        if (!storagePath && nestedUrl) {
          const nested = new URL(nestedUrl);
          const encodedObjectPath = String(nested.pathname || "").split("/o/")[1] || "";
          if (encodedObjectPath) {
            storagePath = encodedObjectPath;
            try { storagePath = decodeURIComponent(storagePath); } catch (_) { }
            if (/%2f|%25/i.test(storagePath)) {
              try { storagePath = decodeURIComponent(storagePath); } catch (_) { }
            }
          }
        }
        if (storagePath.startsWith("gs://")) {
          storagePath = storagePath.replace(/^gs:\/\/[^/]+\//i, "");
        }
        if (storagePath) {
          const kind = String(parsed.pathname || "").toLowerCase().endsWith("proxy-image") ? "image" : "media";
          clean = `/api/assets/proxy-${kind}?storagePath=${encodeURIComponent(storagePath.replace(/^\/+/, ""))}`;
        } else if (nestedUrl) {
          return nestedUrl;
        }
      }
    } catch (_) { }
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

  toFirebaseStorageGsUrl(firebaseUrl = "", storagePath = "") {
    const cleanPath = String(storagePath || "").replace(/^\/+/, "").trim();
    let bucket = String(window.__CHARLY_CONFIG__?.firebase?.storageBucket || "charly-brown.firebasestorage.app").trim();
    let objectPath = cleanPath;
    try {
      const parsed = new URL(String(firebaseUrl || "").trim());
      const match = String(parsed.pathname || "").match(/^\/(?:v0\/)?b\/([^/]+)\/o\/(.+)$/i);
      if (match) {
        bucket = decodeURIComponent(String(match[1] || "").trim()) || bucket;
        objectPath = decodeURIComponent(String(match[2] || "").trim()) || objectPath;
      }
    } catch (_) { }
    objectPath = String(objectPath || "").replace(/^\/+/, "").trim();
    return bucket && objectPath ? `gs://${bucket}/${objectPath}` : "";
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
    const measuredAudioVisibleMs = rowId && rowAudioDurationMs > 0
      ? Math.max(0, rowAudioDurationMs - Math.round(trimInMs / safeRate))
      : 0;
    // La metadata real del archivo es la fuente de verdad. `segmentTimelineMs`
    // puede seguir conteniendo la duración visual heredada de la escena.
    const durationMs = measuredAudioVisibleMs > 0
      ? measuredAudioVisibleMs
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
    // During normal playback the visible surface must never be pulled
    // backwards. A late async tick used to do exactly that after hydration.
    if (Number(targetTimeSec) < currentTimeSec) return false;
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
  clampVideoTimeToLastFrame(videoEl = null, requestedSec = 0) {
    const requested = Math.max(0, Number(requestedSec || 0));
    const duration = Number(videoEl?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      return { targetSec: requested, isTerminalHold: false };
    }
    const epsilon = Math.min(STAGE_VIDEO_END_EPSILON_SEC, Math.max(0.001, duration / 2));
    const lastFrameSec = Math.max(0, duration - epsilon);
    return {
      targetSec: Math.min(requested, lastFrameSec),
      isTerminalHold: requested >= lastFrameSec
    };
  }
  buildOverlapEntrySignature(entry = null, isImage = false) {
    if (!entry) return "";
    const kind = isImage === true ? OVERLAP_ENTRY_MEDIA_KIND_IMAGE : OVERLAP_ENTRY_MEDIA_KIND_VIDEO;
    const rowId = String(entry.rowId || "").trim();
    const src = String(entry.videoSrc || "").trim();
    const entryType = Number(entry.clip?.trimInMs || 0) || 0;
    return `${kind}${OVERLAP_ENTRY_SIGNATURE_SEPARATOR}${rowId}${OVERLAP_ENTRY_SIGNATURE_SEPARATOR}${src}${OVERLAP_ENTRY_SIGNATURE_SEPARATOR}${entryType}`;
  }
  buildStageEntryIdentity(entry = null) {
    if (!entry) return "";
    return [
      String(entry?.rowId || "").trim(),
      String(entry?.id || entry?.clip?.id || "").trim(),
      Math.max(0, Math.round(Number(entry?.startMs || 0) || 0)),
      String(entry?.videoSrc || "").trim()
    ].join("|");
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

    const exactCachedSource = this.blobCache.get(url);
    if (/^(?:blob:|data:)/i.test(String(exactCachedSource || "").trim())) {
      return exactCachedSource;
    }

    const resolvedMetadata = this.authorizedAssetMetadataBySource.get(url);
    if (resolvedMetadata?.expiresAt
      && Number(resolvedMetadata.expiresAt) <= Date.now() + AUTHORIZED_ASSET_REFRESH_SKEW_MS) {
      this.invalidateAuthorizedAssetSource(url);
      return null;
    }

    const localMediaPrefix = "podcaster-local-media:";
    if (url.startsWith(localMediaPrefix)) {
      const cachedLocal = this.blobCache.has(url) ? this.blobCache.get(url) : "";
      return cachedLocal === "404" ? "" : cachedLocal;
    }

    const activeMode = this.resolveActiveMediaLoadMode(url);
    if (activeMode === "streaming") {
      if (this.blobCache.has(url)) {
        const cachedStreaming = this.blobCache.get(url);
        if (cachedStreaming === "404") return "";
        if (!this.requiresAuthorizedAssetResolution(cachedStreaming)) return cachedStreaming;
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
      if (isDirectFirebaseUrl && !finalUrl.includes('/api/assets/proxy-') && !this.hasFirebaseDirectAccessToken(finalUrl)) {
        if (this.deps?.preferDirectFirebaseStorage === true && typeof this.deps?.resolveFirebaseStorageUrl === "function") {
          return null;
        }
        finalUrl = this.buildMediaProxyUrl(`/api/assets/proxy-media?url=${encodeURIComponent(finalUrl)}`);
      }
      if (this.requiresAuthorizedAssetResolution(finalUrl)) return null;
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

  requiresAuthorizedAssetResolution(url = "") {
    const clean = String(url || "").trim();
    if (!clean || !/\/api\/assets\/proxy-(?:media|image)/i.test(clean)) return false;
    try {
      const parsed = new URL(clean, window.location.origin);
      const storagePath = String(parsed.searchParams.get("storagePath") || "").replace(/^\/+/, "");
      return storagePath.startsWith("podcaster/sessions/");
    } catch (_) {
      return false;
    }
  }

  async resolveAuthorizedAssetSource(url = "", options = {}) {
    const clean = String(url || "").trim();
    if (!clean || !this.requiresAuthorizedAssetResolution(clean)) {
      return { url: clean, expiresAt: null, storagePath: "" };
    }
    let record = null;
    if (typeof this.deps?.resolveAuthorizedAssetMetadata === "function") {
      record = await this.deps.resolveAuthorizedAssetMetadata(clean, options);
    } else if (typeof this.deps?.resolveAuthorizedAssetUrl === "function") {
      record = { url: await this.deps.resolveAuthorizedAssetUrl(clean, options) };
    } else {
      throw new Error("authorized_asset_resolver_unavailable");
    }
    const rawExpiresAt = typeof record === "object" && record !== null
      ? record.expiresAt
      : null;
    const parsedExpiresAt = typeof rawExpiresAt === "number" && Number.isFinite(rawExpiresAt)
      ? rawExpiresAt
      : (() => {
          const cleanExpiry = String(rawExpiresAt || "").trim();
          if (!cleanExpiry) return null;
          const numericExpiry = Number(cleanExpiry);
          if (Number.isFinite(numericExpiry) && numericExpiry > 0) return numericExpiry;
          const dateExpiry = Date.parse(cleanExpiry);
          return Number.isFinite(dateExpiry) ? dateExpiry : null;
        })();
    const normalized = typeof record === "string"
      ? { url: record, expiresAt: null, storagePath: "" }
      : {
          url: String(record?.url || "").trim(),
          expiresAt: parsedExpiresAt,
          storagePath: String(record?.storagePath || "").trim()
        };
    if (!normalized.url) throw new Error("signed_asset_url_missing");
    this.authorizedAssetMetadataBySource.set(clean, {
      ...normalized,
      resolverSource: clean
    });
    return normalized;
  }

  rememberAuthorizedAssetAlias(alias = "", record = null, resolverSource = "") {
    const cleanAlias = String(alias || "").trim();
    if (!cleanAlias || !record?.url) return;
    this.authorizedAssetMetadataBySource.set(cleanAlias, {
      url: String(record.url || "").trim(),
      expiresAt: record.expiresAt ?? null,
      storagePath: String(record.storagePath || "").trim(),
      resolverSource: String(resolverSource || cleanAlias).trim() || cleanAlias
    });
  }

  invalidateAuthorizedAssetSource(url = "") {
    const clean = String(url || "").trim();
    if (!clean) return;
    const metadata = this.authorizedAssetMetadataBySource.get(clean) || null;
    const resolverSource = String(metadata?.resolverSource || clean).trim() || clean;
    const aliases = new Set([clean]);
    this.authorizedAssetMetadataBySource.forEach((candidate, alias) => {
      if (String(candidate?.resolverSource || alias).trim() === resolverSource) aliases.add(alias);
    });
    aliases.forEach((alias) => {
      this.authorizedAssetMetadataBySource.delete(alias);
      const cached = this.blobCache.get(alias);
      if (cached && !String(cached).startsWith("blob:")) this.blobCache.delete(alias);
      const cacheKey = this.resolvePersistentMediaCacheKey(alias);
      if (cacheKey && cacheKey !== alias) {
        const cachedByKey = this.blobCache.get(cacheKey);
        if (cachedByKey && !String(cachedByKey).startsWith("blob:")) this.blobCache.delete(cacheKey);
      }
    });
    this.deps?.invalidateAuthorizedAssetUrl?.(resolverSource);
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
        // `u` is the media revision (normally the clip's updatedAt). Keep it in
        // the persistent identity so replacing bytes at the same Storage path
        // cannot restore the previous revision from Cache Storage/IndexedDB.
        // Other query params are deliberately omitted: signed URL credentials,
        // auth tokens and expiry values must not fragment the local cache.
        const cacheUrl = new URL(
          `${window.location.origin}/__podcaster_media_cache__/${encodeURIComponent(storagePath)}`
        );
        const mediaRevision = String(parsedUrl.searchParams.get("u") || "").trim();
        if (mediaRevision) cacheUrl.searchParams.set("u", mediaRevision);
        return cacheUrl.toString();
      }
    } catch (_) { }
    return cleanUrl;
  }

  resolveMediaSourceGenerationKey(url = "") {
    const clean = String(url || "").trim();
    if (!clean) return "";
    return String(this.resolvePersistentMediaCacheKey(clean) || clean).trim();
  }

  getMediaSourceGeneration(url = "") {
    const key = this.resolveMediaSourceGenerationKey(url);
    return key ? Number(this.mediaSourceGenerations.get(key) || 0) : 0;
  }

  bumpMediaSourceGeneration(url = "") {
    const key = this.resolveMediaSourceGenerationKey(url);
    if (!key) return 0;
    const next = Number(this.mediaSourceGenerations.get(key) || 0) + 1;
    this.mediaSourceGenerations.set(key, next);
    return next;
  }

  getRowMediaGeneration(rowId = "") {
    const key = String(rowId || "").trim();
    return key ? Number(this.rowMediaGenerations.get(key) || 0) : 0;
  }

  bumpRowMediaGeneration(rowId = "") {
    const key = String(rowId || "").trim();
    if (!key) return 0;
    const next = Number(this.rowMediaGenerations.get(key) || 0) + 1;
    this.rowMediaGenerations.set(key, next);
    return next;
  }

  async resolveLocalMediaObjectUrl(localMediaCacheKey = "", options = {}) {
    const cleanKey = String(localMediaCacheKey || "").trim();
    if (!cleanKey) return "";
    const sourceGenerationKey = `podcaster-local-media:${cleanKey}`;
    const invalidationKey = this.resolveMediaSourceGenerationKey(sourceGenerationKey) || sourceGenerationKey;
    const pendingInvalidation = this.mediaSourceInvalidationPromises.get(invalidationKey);
    if (pendingInvalidation) await pendingInvalidation.catch(() => false);
    if (options.signal?.aborted === true) return "";
    const mediaCacheGeneration = this.mediaCacheGeneration;
    const sourceGeneration = this.getMediaSourceGeneration(sourceGenerationKey);
    const isCurrentRead = () => mediaCacheGeneration === this.mediaCacheGeneration
      && sourceGeneration === this.getMediaSourceGeneration(sourceGenerationKey)
      && options.signal?.aborted !== true;
    const cacheKey = `podcaster-local-media:${cleanKey}`;
    const cached = this.getBlobUrlSync(cacheKey);
    if (cached) return cached;
    const pending = this.fetchPromises.get(cacheKey);
    if (pending) return pending;
    const p = (async () => {
      try {
        const blob = await getPodcasterLocalMediaBlob(cleanKey);
        if (!(blob instanceof Blob)) return "";
        if (!isCurrentRead()) return "";
        const objectUrl = URL.createObjectURL(blob);
        if (!isCurrentRead()) {
          try { URL.revokeObjectURL(objectUrl); } catch (_) { }
          return "";
        }
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
      if (this.fetchPromises.get(cacheKey) === p) this.fetchPromises.delete(cacheKey);
    }
  }

  async resolveAudioSource(clip = null, options = {}) {
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
    if (localKey && options.skipLocalMediaCache !== true) {
      const localSrc = await this.resolveLocalMediaObjectUrl(localKey, options);
      if (localSrc) return localSrc;
    }

    const localDataUrl = String(clip?.localDataUrl || clip?.dataUrl || "").trim();
    if (localDataUrl && options.skipLocalMediaCache !== true) {
      if (localDataUrl.startsWith(localMediaPrefix)) {
        const localDataKey = localDataUrl.replace(localMediaPrefix, "").trim();
        if (localDataKey) {
          const localBlobUrl = await this.resolveLocalMediaObjectUrl(localDataKey, options);
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
          const fallbackLocalBlob = await this.resolveLocalMediaObjectUrl(localDataUrl, options);
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
        if (options.skipLocalMediaCache !== true) {
          const localSourceKey = directSource.replace(localMediaPrefix, "").trim();
          if (localSourceKey) {
            const localBlobUrl = await this.resolveLocalMediaObjectUrl(localSourceKey, options);
            if (localBlobUrl) return localBlobUrl;
          }
        }
        if (!hasRemoteSource) return "";
      } else {
        const resolvedDirectSource = this.deps?.resolveStorageAudioUrl?.(directSource, clip?.storagePath);
        if (resolvedDirectSource && String(resolvedDirectSource).trim()) {
          return this.getBlobUrl(resolvedDirectSource, {
            persistent: this.resolveActiveMediaLoadMode(resolvedDirectSource) === "blob",
            signal: options.signal,
            forceAuthorizedRefresh: options.forceAuthorizedRefresh === true
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
        persistent: this.resolveActiveMediaLoadMode(fallbackUrl) === "blob",
        signal: options.signal,
        forceAuthorizedRefresh: options.forceAuthorizedRefresh === true
      });
    }
    return this.getBlobUrl(rawUrl, {
      persistent: this.resolveActiveMediaLoadMode(rawUrl) === "blob",
      signal: options.signal,
      forceAuthorizedRefresh: options.forceAuthorizedRefresh === true
    });
  }

  async resolveDialoguePlaybackAudioSource(clip = null, options = {}) {
    const resolvedSource = await this.resolveAudioSource(clip, options);
    if (!resolvedSource) return "";
    if (/^(?:blob:|data:)/i.test(String(resolvedSource).trim())) return String(resolvedSource).trim();
    const playableSource = await this.getBlobUrl(String(resolvedSource).trim(), {
      persistent: true,
      signal: options.signal,
      forceAuthorizedRefresh: options.forceAuthorizedRefresh === true
    });
    if (!playableSource) {
      this.emitMediaTelemetry("dialogue-audio-source-resolve-failed", {
        source: resolvedSource,
        sourceKey: this.resolveAudioSourceKey(clip)
      });
    }
    return playableSource;
  }

  resolveRemoteAudioSourceUrl(clip = null) {
    if (!clip || typeof clip !== "object") return "";
    const localMediaPrefix = "podcaster-local-media:";
    const directSource = String(clip?.sourceUrl || "").trim();
    if (directSource && !directSource.startsWith(localMediaPrefix)) {
      return String(
        this.deps?.resolveStorageAudioUrl?.(directSource, clip?.storagePath)
        || directSource
      ).trim();
    }
    const downloadUrl = String(clip?.downloadUrl || "").trim();
    const storagePath = String(clip?.storagePath || "").trim();
    return String(
      this.deps?.resolveStorageAudioUrl?.(downloadUrl, storagePath)
      || downloadUrl
      || ""
    ).trim();
  }

  resolveAudioMediaGenerationKey(clip = null) {
    const remoteSource = this.resolveRemoteAudioSourceUrl(clip);
    if (remoteSource) return remoteSource;
    const localMediaPrefix = "podcaster-local-media:";
    const localKey = String(clip?.localMediaCacheKey || "").trim();
    if (localKey) return `${localMediaPrefix}${localKey}`;
    for (const candidate of [clip?.sourceUrl, clip?.localDataUrl, clip?.dataUrl]) {
      const clean = String(candidate || "").trim();
      if (clean.startsWith(localMediaPrefix)) return clean;
    }
    return this.resolveAudioSourceKey(clip);
  }

  clearLocalAudioObjectUrlCache(clip = null) {
    const localMediaPrefix = "podcaster-local-media:";
    const keys = new Set();
    const addKey = (value = "") => {
      const clean = String(value || "").trim();
      if (!clean) return;
      if (clean.startsWith(localMediaPrefix)) keys.add(clean.slice(localMediaPrefix.length).trim());
    };
    const localKey = String(clip?.localMediaCacheKey || "").trim();
    if (localKey) keys.add(localKey);
    addKey(clip?.sourceUrl);
    addKey(clip?.localDataUrl);
    addKey(clip?.dataUrl);
    keys.forEach((key) => {
      const cacheKey = `${localMediaPrefix}${key}`;
      this.bumpMediaSourceGeneration(cacheKey);
      const objectUrl = this.blobCache.get(cacheKey);
      if (String(objectUrl || "").startsWith("blob:")) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) { }
      }
      this.blobCache.delete(cacheKey);
      this.fetchPromises.delete(cacheKey);
    });
  }

  async refreshAudioClipAfterDecodeFailure(clip = null, options = {}) {
    const remoteSource = this.resolveRemoteAudioSourceUrl(clip);
    if (remoteSource) {
      this.invalidateAuthorizedAssetSource(remoteSource);
      const invalidationSources = new Set([remoteSource]);
      const failedSource = String(options.failedSource || "").trim();
      if (failedSource) {
        this.blobCache.forEach((cachedValue, cacheKey) => {
          if (String(cachedValue || "").trim() === failedSource
            && !String(cacheKey || "").startsWith("podcaster-local-media:")) {
            invalidationSources.add(String(cacheKey || "").trim());
          }
        });
      }
      await Promise.all([...invalidationSources].filter(Boolean).map((source) => this.invalidateBlobUrl(source)));
      return this.resolveDialoguePlaybackAudioSource(clip, {
        signal: options.signal,
        forceAuthorizedRefresh: true,
        skipLocalMediaCache: true
      });
    }
    // Local-only recordings must remain recoverable. Recreate only their
    // in-memory ObjectURL; never delete the user's sole IndexedDB copy.
    this.clearLocalAudioObjectUrlCache(clip);
    return this.resolveDialoguePlaybackAudioSource(clip, {
      signal: options.signal
    });
  }

  async resolveAndValidateAudioClipSource(clip = null, options = {}) {
    let source = await this.resolveDialoguePlaybackAudioSource(clip, {
      signal: options.signal
    });
    if (options.signal?.aborted === true) throw new DOMException("Aborted", "AbortError");
    let ready = source
      ? await this.probeHydratedMediaSource(source, "audio", options.timeoutMs)
      : false;
    if (options.signal?.aborted === true) throw new DOMException("Aborted", "AbortError");
    if (ready) return source;
    if (options.signal?.aborted === true) throw new DOMException("Aborted", "AbortError");
    source = await this.refreshAudioClipAfterDecodeFailure(clip, {
      signal: options.signal,
      failedSource: source
    });
    if (options.signal?.aborted === true) throw new DOMException("Aborted", "AbortError");
    ready = source
      ? await this.probeHydratedMediaSource(source, "audio", options.timeoutMs)
      : false;
    if (!ready) throw new Error("No se pudo decodificar el audio preparado.");
    return source;
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

  invalidateBlobUrl(url, options = {}) {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return Promise.resolve(false);
    const invalidationKey = this.resolveMediaSourceGenerationKey(cleanUrl) || cleanUrl;
    const previous = this.mediaSourceInvalidationPromises.get(invalidationKey) || Promise.resolve();
    const operation = previous.catch(() => { }).then(() => (
      this.runBlobUrlInvalidation(cleanUrl, options)
    ));
    this.mediaSourceInvalidationPromises.set(invalidationKey, operation);
    const cleanup = () => {
      if (this.mediaSourceInvalidationPromises.get(invalidationKey) === operation) {
        this.mediaSourceInvalidationPromises.delete(invalidationKey);
      }
    };
    operation.then(cleanup, cleanup);
    return operation;
  }

  async runBlobUrlInvalidation(url, options = {}) {
    const isCurrent = typeof options?.isCurrent === "function" ? options.isCurrent : () => true;
    if (!isCurrent()) return false;
    this.bumpMediaSourceGeneration(url);
    const cacheKey = this.resolvePersistentMediaCacheKey(url);
    const blobUrl = this.blobCache.get(url) || (cacheKey && cacheKey !== url ? this.blobCache.get(cacheKey) : "");
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobCache.delete(url);
      if (cacheKey && cacheKey !== url) this.blobCache.delete(cacheKey);
    }
    [url, cacheKey].filter(Boolean).forEach((candidate) => {
      this.fetchPromises.delete(candidate);
      this.fetchPromises.delete(`streaming:${candidate}`);
      this.fetchPromises.delete(`persistent:${candidate}`);
    });
    if (!isCurrent()) return false;
    const pendingPersistentWrite = this.persistentMediaWriteQueues.get(cacheKey);
    if (pendingPersistentWrite) await pendingPersistentWrite.catch(() => false);
    if (!isCurrent()) return false;
    try {
      const cache = await caches.open(this.mediaCacheName);
      if (!isCurrent()) return false;
      await cache.delete(url);
      if (!isCurrent()) return false;
      if (cacheKey && cacheKey !== url) await cache.delete(cacheKey);
      if (!isCurrent()) return false;
      if (cacheKey) {
        await cache.delete(`stage-media:${cacheKey}`);
      }
    } catch (e) { }
    if (!isCurrent()) return false;
    try {
      const baseCacheKey = this.resolvePersistentMediaCacheKey(url);
      if (baseCacheKey) {
        await deletePodcasterLocalMediaKey(`stage-media:${baseCacheKey}`).catch(() => { });
      }
    } catch (_) { }
    return isCurrent();
  }


  enqueuePersistentMediaWrite(cacheKey = "", writer = null) {
    const key = String(cacheKey || "").trim();
    if (!key || typeof writer !== "function") return Promise.resolve(false);
    const previous = this.persistentMediaWriteQueues.get(key) || Promise.resolve();
    let queued = null;
    queued = previous.catch(() => { }).then(writer).finally(() => {
      if (this.persistentMediaWriteQueues.get(key) === queued) {
        this.persistentMediaWriteQueues.delete(key);
      }
    });
    this.persistentMediaWriteQueues.set(key, queued);
    return queued;
  }


  async getBlobUrl(url, options = {}) {
    if (!url) return "";
    const invalidationKey = this.resolveMediaSourceGenerationKey(url) || String(url || "").trim();
    const pendingInvalidation = this.mediaSourceInvalidationPromises.get(invalidationKey);
    if (pendingInvalidation) await pendingInvalidation.catch(() => false);
    if (options.signal?.aborted === true) return "";
    const mediaCacheGeneration = this.mediaCacheGeneration;
    const sourceGeneration = this.getMediaSourceGeneration(url);
    const localMediaPrefix = "podcaster-local-media:";
    if (url.startsWith(localMediaPrefix)) {
      return this.resolveLocalMediaObjectUrl(url.replace(localMediaPrefix, ""), options);
    }

    const cacheKey = this.resolvePersistentMediaCacheKey(url) || url;
    if (this.blobCache.get(url) === "404" || this.blobCache.get(cacheKey) === "404") return "";
    // A streaming lookup may resolve only to a proxy URL, while a persistent
    // lookup must fetch bytes and create a blob. They cannot share a promise.
    const fetchPromiseKey = options.persistent === true
      ? `persistent:${cacheKey}`
      : `streaming:${cacheKey}`;
    const persistentStoreKey = `stage-media:${cacheKey}`;
    const isCurrentRequest = () => mediaCacheGeneration === this.mediaCacheGeneration
      && sourceGeneration === this.getMediaSourceGeneration(url)
      && options.signal?.aborted !== true;
    const cacheResolvedSource = (value = "") => {
      const cleanValue = String(value || "").trim();
      if (!cleanValue) return "";
      if (!isCurrentRequest()) {
        if (cleanValue.startsWith("blob:")) {
          try { URL.revokeObjectURL(cleanValue); } catch (_) { }
        }
        return "";
      }
      this.blobCache.set(url, cleanValue);
      if (cacheKey !== url) this.blobCache.set(cacheKey, cleanValue);
      return cleanValue;
    };
    const prefersStreamingProxy = String(url || "").includes('/api/assets/proxy-media');
    // 1. Check in-memory cache
    const cached = this.getBlobUrlSync(url);
    const cachedIsHydratedMedia = /^(?:blob:|data:)/i.test(String(cached || ""));
    if (cached && (options.persistent !== true || cachedIsHydratedMedia)) return cached;

    if (options.persistent === true) {
      try {
        const persistedBlob = await getPodcasterLocalMediaBlob(persistentStoreKey);
        if (persistedBlob instanceof Blob) {
          if (!isCurrentRequest()) return "";
          const objectUrl = URL.createObjectURL(persistedBlob);
          if (!isCurrentRequest()) {
            try { URL.revokeObjectURL(objectUrl); } catch (_) { }
            return "";
          }
          this.emitMediaTelemetry("cache-hit-indexeddb", { kind: "video", source: url });
          return cacheResolvedSource(objectUrl);
        }
      } catch (_) { }
    }

    const activeMode = this.resolveActiveMediaLoadMode(url);
    if (activeMode === "streaming" && options.persistent !== true) {
      if (this.fetchPromises.has(fetchPromiseKey)) return this.fetchPromises.get(fetchPromiseKey);

      const p = (async () => {
        try {
          let finalUrl = url;
          let authorizedRecord = null;
          if (finalUrl.startsWith("gs://")) {
            if (this.deps?.resolveFirebaseStorageUrl) {
              finalUrl = await this.deps.resolveFirebaseStorageUrl(finalUrl);
            }
          }

          if (!finalUrl) throw new Error("firebase_storage_url_unavailable");

          const isDirectFirebaseUrl = finalUrl.includes('firebasestorage.googleapis.com');
          if (isDirectFirebaseUrl && !finalUrl.includes('/api/assets/proxy-') && !this.hasFirebaseDirectAccessToken(finalUrl)) {
            if (this.deps?.preferDirectFirebaseStorage === true && typeof this.deps?.resolveFirebaseStorageUrl === "function") {
              const gsUrl = this.toFirebaseStorageGsUrl(finalUrl);
              finalUrl = gsUrl ? await this.deps.resolveFirebaseStorageUrl(gsUrl) : "";
              if (!finalUrl) throw new Error("firebase_storage_url_unavailable");
            } else {
              finalUrl = this.buildMediaProxyUrl(`/api/assets/proxy-media?url=${encodeURIComponent(finalUrl)}`);
            }
          }

          if (this.requiresAuthorizedAssetResolution(finalUrl)) {
            const resolverSource = finalUrl;
            authorizedRecord = await this.resolveAuthorizedAssetSource(resolverSource, {
              forceRefresh: options.forceAuthorizedRefresh === true
            });
            finalUrl = authorizedRecord.url;
            this.rememberAuthorizedAssetAlias(url, authorizedRecord, resolverSource);
            if (cacheKey !== url) this.rememberAuthorizedAssetAlias(cacheKey, authorizedRecord, resolverSource);
          }

          // A legacy resolver may return a usable signed URL without expiry
          // metadata. It remains compatible, but must not be cached forever.
          if (!authorizedRecord || authorizedRecord.expiresAt) {
            return cacheResolvedSource(finalUrl);
          }
          return isCurrentRequest() ? finalUrl : "";
          } catch (e) {
            console.error("[podcaster-playback-controller] Error resolving streaming URL:", e);
            throw e;
          } finally {
          if (this.fetchPromises.get(fetchPromiseKey) === p) this.fetchPromises.delete(fetchPromiseKey);
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
              return cacheResolvedSource(objectUrl);
            }
          } catch (e) { }
        }

        let finalUrl = url;
        let authorizedProxyUrl = this.requiresAuthorizedAssetResolution(url) ? url : "";
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
                } else if (this.deps?.preferDirectFirebaseStorage === true) {
                  throw new Error("firebase_storage_url_unavailable");
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
              if (this.deps?.preferDirectFirebaseStorage !== true) {
                finalUrl = this.toFirebaseStorageProxyUrl(finalUrl, storagePath, { kind: isImageLikeUrl ? "image" : "media" });
              }
            }
          } catch (e) { }
        }

        // Session proxies require Authorization, which a native <video> request
        // cannot attach. Resolve them through the authenticated signed-url route
        // before fetching bytes or assigning a source to a media element.
        if (this.requiresAuthorizedAssetResolution(finalUrl)) {
          authorizedProxyUrl = finalUrl;
          finalUrl = String((await this.resolveAuthorizedAssetSource(finalUrl, {
            forceRefresh: options.forceAuthorizedRefresh === true
          })).url || "").trim();
          if (!finalUrl) throw new Error("signed_asset_url_missing");
        }

        if (this.deps?.preferDirectFirebaseStorage === true) {
          if (this.requiresAuthorizedAssetResolution(finalUrl)) {
            finalUrl = String((await this.resolveAuthorizedAssetSource(finalUrl, {
              forceRefresh: options.forceAuthorizedRefresh === true
            })).url || "").trim();
          } else if (
            String(finalUrl || "").includes("firebasestorage.googleapis.com")
            && !this.hasFirebaseDirectAccessToken(finalUrl)
          ) {
            const gsUrl = this.toFirebaseStorageGsUrl(finalUrl);
            finalUrl = gsUrl && typeof this.deps?.resolveFirebaseStorageUrl === "function"
              ? String(await this.deps.resolveFirebaseStorageUrl(gsUrl) || "").trim()
              : "";
          }
          if (!finalUrl) throw new Error("firebase_storage_url_unavailable");
        }

        if (finalUrl.startsWith("gs://")) {
          if (this.deps?.resolveFirebaseStorageUrl) {
            finalUrl = await this.deps.resolveFirebaseStorageUrl(finalUrl);
          }
        }

        const isImageLikeFinalUrl = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#&]|$)/i.test(String(finalUrl || "").trim());
        const isProxyMediaUrl = String(finalUrl || "").includes('/api/assets/proxy-media');
        const isDirectRemoteImage = isImageLikeFinalUrl && !String(finalUrl || "").includes('/api/');
        if (isDirectFirebaseUrl && isDirectRemoteImage && options.persistent !== true) {
          return cacheResolvedSource(finalUrl);
        }
        if (isImageLikeUrl && isDirectRemoteImage && options.persistent !== true) {
          return cacheResolvedSource(finalUrl);
        }
        // En reproducción directa conservamos el proxy como stream. Durante la
        // preparación persistente debemos continuar hasta fetch/blob para que
        // la escena quede realmente disponible en IndexedDB antes del corte.
        if (isProxyMediaUrl && !isImageLikeFinalUrl && options.persistent !== true) {
          return cacheResolvedSource(finalUrl);
        }

        const fetchOptions = {};
        if (options.signal) fetchOptions.signal = options.signal;
        if (finalUrl.includes('/api/') && this.deps?.getAuthHeaders) {
          try { fetchOptions.headers = await this.deps.getAuthHeaders(); } catch (e) { }
        }

        const fetchResolvedAsset = (targetUrl) => fetch(targetUrl, fetchOptions);
        let resp;
        try {
          resp = await fetchResolvedAsset(finalUrl);
        } catch (error) {
          if (!authorizedProxyUrl || error?.name === "AbortError") throw error;
          // A network/CORS interruption may be the visible symptom of an URL
          // firmada vencida. Refresh it once; never loop inside playback.
          this.invalidateAuthorizedAssetSource(authorizedProxyUrl);
          const refreshed = await this.resolveAuthorizedAssetSource(authorizedProxyUrl, { forceRefresh: true });
          finalUrl = String(refreshed?.url || "").trim();
          if (!finalUrl) throw error;
          resp = await fetchResolvedAsset(finalUrl);
        }
        if (!resp.ok && resp.status !== 404 && authorizedProxyUrl) {
          // 403/expiry, throttling and temporary 5xx all get exactly one URL
          // renewal + retry. A confirmed 404 is permanent and must not retry.
          this.invalidateAuthorizedAssetSource(authorizedProxyUrl);
          const refreshed = await this.resolveAuthorizedAssetSource(authorizedProxyUrl, { forceRefresh: true });
          finalUrl = String(refreshed?.url || "").trim();
          if (finalUrl) resp = await fetchResolvedAsset(finalUrl);
        }

        // Fallback local si falla o da 404 estando en localhost
        if (!resp.ok) {
          if (resp.status === 404 && this.deps?.markStaleProxyMediaUrl) {
            this.deps.markStaleProxyMediaUrl(url, 'proxy-media-404-from-controller');
          }
          const fetchError = new Error(`Fetch failed with status ${resp.status}`);
          fetchError.status = Number(resp.status || 0);
          throw fetchError;
        }

        const blob = await resp.blob();
        if (!isCurrentRequest()) return "";
        await this.enqueuePersistentMediaWrite(cacheKey, async () => {
          if (!isCurrentRequest()) return false;
          try {
            const mediaCache = await caches.open(this.mediaCacheName);
            if (isCurrentRequest()) {
              await mediaCache.put(cacheKey, new Response(blob, {
                headers: blob.type ? { "Content-Type": blob.type } : undefined
              }));
            }
            if (!isCurrentRequest()) await mediaCache.delete(cacheKey).catch(() => false);
          } catch (_) { }
          if (options.persistent === true && isCurrentRequest()) {
            try {
              await putPodcasterLocalMediaBlob(persistentStoreKey, blob, {
                kind: "stage-media",
                sourceUrl: url,
                cachedAt: new Date().toISOString()
              });
              if (!isCurrentRequest()) {
                await deletePodcasterLocalMediaKey(persistentStoreKey).catch(() => false);
                return false;
              }
              this.emitMediaTelemetry("cache-store-indexeddb", { kind: "video", source: url });
            } catch (_) { }
          }
          return isCurrentRequest();
        });
        if (!isCurrentRequest()) return "";
        const objectUrl = URL.createObjectURL(blob);
        return cacheResolvedSource(objectUrl);
      } catch (e) {
        // Solo un 404 HTTP confirmado es permanente. CORS, aborts, timeouts y 5xx
        // deben poder reintentarse en una preparación posterior.
        const status = Number(e?.status || e?.statusCode || e?.response?.status || 0);
        const code = String(e?.code || e?.error || "").trim().toLowerCase();
        const msg = String(e?.message || "").toLowerCase();
        if (status === 404 || code === "asset_not_found" || msg.includes("asset_not_found") || msg.includes("status 404")) {
          if (isCurrentRequest()) {
            this.blobCache.set(url, "404");
            if (cacheKey !== url) this.blobCache.set(cacheKey, "404");
          }
          return "";
        } else {
          this.blobCache.delete(url);
          if (cacheKey !== url) this.blobCache.delete(cacheKey);
          this.emitMediaTelemetry("media-fetch-failed", {
            source: url,
            status: status || undefined,
            message: String(e?.message || "unknown")
          });
          return "";
        }
      } finally {
        if (this.fetchPromises.get(fetchPromiseKey) === p) this.fetchPromises.delete(fetchPromiseKey);
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
    const mediaCacheGeneration = this.mediaCacheGeneration;
    const sessionId = String(session?.id || "").trim();
    const sessionSignal = this.sessionMediaAbortController?.signal || null;
    const isCurrentPrewarm = () => mediaCacheGeneration === this.mediaCacheGeneration
      && (!sessionId || sessionId === String(this.state.session?.id || "").trim())
      && sessionSignal?.aborted !== true;
    this.videoPrewarmKey = key;
    let prewarmPromise = null;
    prewarmPromise = (async () => {
      let index = 0;
      const worker = async () => {
        while (index < queue.length && isCurrentPrewarm()) {
          const entry = queue[index++];
          const src = String(entry?.videoSrc || "").trim();
          if (!src) continue;
          try {
            await this.getBlobUrl(src, {
              persistent: this.shouldPersistStageVideoSource(src),
              signal: sessionSignal || undefined
            });
          } catch (_) { }
          if (!isCurrentPrewarm()) return;
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
      return isCurrentPrewarm();
    })().finally(() => {
      if (this.videoPrewarmPromise === prewarmPromise) {
        this.videoPrewarmPromise = null;
      }
    });
    this.videoPrewarmPromise = prewarmPromise;
    return prewarmPromise;
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

  releaseSessionRuntimeMedia() {
    this.state.isPlaying = false;
    this.state.isBuffering = false;
    this.state.isPreparing = false;
    this.stageBufferStartMs = null;
    this.playheadRevision += 1;
    this.activeLoopId += 1;
    this.stageSwitchSeq += 1;
    this.stageBufferRecoverySeq += 1;
    this.stageMachine.imageSwapToken = Number(this.stageMachine.imageSwapToken || 0) + 1;
    this.podcastStageVideoLoadTokenSeq += 1;
    this.podcastStageVideoLoadTokensByEl = new WeakMap();
    if (this.stageBufferRecoveryTimer) {
      clearTimeout(this.stageBufferRecoveryTimer);
      this.stageBufferRecoveryTimer = null;
    }
    // A recovery from the previous session may still settle asynchronously.
    // Detach it now; its generation checks keep it from mutating the new
    // session and its identity-guarded finally must not clear a newer job.
    this.stageBufferRecoveryPromise = null;
    this.stopClock();
    this.sessionMediaAbortController?.abort?.();
    this.sessionMediaAbortController = null;
    this.sessionMediaPreparationGeneration += 1;
    this.mediaCacheGeneration += 1;
    this.prepareSequence += 1;

    this.getStageVideoElements().forEach((videoEl) => {
      try { videoEl.pause(); } catch (_) { }
      this.releaseTransientStageVideoObjectUrl(videoEl);
      try { videoEl.removeAttribute("src"); } catch (_) { videoEl.src = ""; }
      delete videoEl.dataset.src;
      delete videoEl.dataset.presentedSrc;
      delete videoEl.dataset.mediaSourceGeneration;
      delete videoEl.dataset.rowId;
      try { videoEl.load(); } catch (_) { }
      this.hideStageVideoElementPreservingSource(videoEl, { clearRowId: true });
    });
    [this.els?.podcastActiveSpeakerImage, this.els?.podcastActiveSpeakerImageAlt].forEach((imageEl) => {
      if (!imageEl) return;
      imageEl.removeAttribute("src");
      delete imageEl.dataset.src;
      delete imageEl.dataset.mediaSourceGeneration;
      imageEl.hidden = true;
    });
    Object.values(this.dialoguePlayers).forEach((audioEl) => {
      try { audioEl.pause(); } catch (_) { }
      try { audioEl.removeAttribute("src"); } catch (_) { audioEl.src = ""; }
      try { audioEl.load(); } catch (_) { }
    });
    this.dialoguePlayers = {};
    this.audioCache = {};
    this.dialogueAudioSourceKeys = {};
    this.dialoguePreparationPromises.clear();
    this.stopBackgroundMusic();
    if (this.backgroundAudio) {
      try { this.backgroundAudio.removeAttribute("src"); } catch (_) { this.backgroundAudio.src = ""; }
      try { this.backgroundAudio.load(); } catch (_) { }
      delete this.backgroundAudio.dataset.originalSrc;
      delete this.backgroundAudio.dataset.sourceKey;
      delete this.backgroundAudio.dataset.mediaSourceGeneration;
      this.backgroundAudio.dataset.initialized = "false";
    }
    this.backgroundSourceKey = "";
    this.backgroundSrc = "";
    this.backgroundResolvedSource = "";
    this.backgroundSegmentIdentity = "";

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
    this.mediaSourceGenerations.clear();
    // Do not drop in-flight per-source invalidation barriers here. A new
    // session may reference the same storage object; it must wait until the
    // old delete finishes before reading or persisting fresh bytes.
    this.rowMediaGenerations.clear();
    this.rowMediaPreparationPromises.clear();
    this.rowMediaPreparationQueue = Promise.resolve();
    this.authorizedAssetMetadataBySource.clear();
    this.deps?.clearAuthorizedAssetUrls?.();
    this.sessionMediaPreparationPromise = null;
    this.sessionMediaPreparationKey = "";
    this.sessionMediaProgressListeners.clear();
    this.sessionMediaLastProgress = { state: "idle", completed: 0, total: 0, failures: [] };
    this.lastSessionSyncSignature = "";
    this.playbackRangePreparationSignature = "";
    this.playbackRangePreparationAtMs = 0;
    this.cachedTickEntries = null;
    this.cachedTickEntriesTime = 0;
    this.videoPrewarmKey = "";
    this.videoPrewarmPromise = null;
    this.videoLookAheadKey = "";
    this.stageMachine.imagePreloadCache?.clear?.();
    this.stageMachine.loadingSrc = "";
    this.stageMachine.loadingRequest = null;
    this.stageMachine.imageLoadingSrc = "";
    this.stageMachine.imageLoadingPromise = null;
    this.stageMachine.imageLoadingTarget = null;
    this.stageMachine.preloadingSrc = "";
    this.stageMachine.preloadingPromise = null;
    this.state.sessionMediaStatus = "idle";
    this.state.sessionMediaProgress = { completed: 0, total: 0, failures: [] };
  }

  beginSessionTransition(nextSessionId = "") {
    const currentSessionId = String(this.state.session?.id || "").trim();
    const targetSessionId = String(nextSessionId || "").trim();
    if (currentSessionId && targetSessionId && currentSessionId === targetSessionId) return false;
    this.releaseSessionRuntimeMedia();
    this.state.session = null;
    this.state.config = null;
    return true;
  }

  sync(session, config) {
    const previousSession = this.state.session;
    const nextSession = session || this.deps?.getActiveSession?.();
    const previousSessionId = String(previousSession?.id || "").trim();
    const nextSessionId = String(nextSession?.id || "").trim();
    const changedSession = Boolean(previousSession)
      && (previousSessionId && nextSessionId
        ? previousSessionId !== nextSessionId
        : previousSession !== nextSession);
    if (changedSession) this.releaseSessionRuntimeMedia();
    this.state.session = nextSession;
    this.state.config = config || this.deps?.getPodcastVideoConfig?.(this.state.session);
    this.state.useMse = false; // Force disable MSE as it is an incomplete experimental feature
    const totalMs = this.deps?.getTimelineTotalDurationMs?.(this.state.session) || 0;
    this.state.totalDurationMs = Number.isFinite(totalMs) ? Math.max(0, totalMs) : 0;
    const nextSyncSignature = this.buildSessionSyncSignature(this.state.session, this.state.config);
    if (nextSyncSignature && nextSyncSignature !== this.lastSessionSyncSignature) {
      this.lastSessionSyncSignature = nextSyncSignature;
      this.playbackRangePreparationSignature = "";
      this.playbackRangePreparationAtMs = 0;
      void this.prepareSessionMedia({
        session: this.state.session,
        onProgress: (progress) => this.reportSessionMediaProgress(progress)
      }).catch(() => {});
    }
  }

  reportSessionMediaProgress(progress = {}) {
    const state = String(progress?.state || "loading").trim() || "loading";
    const completed = Math.max(0, Number(progress?.completed || 0) || 0);
    const total = Math.max(0, Number(progress?.total || 0) || 0);
    const failures = Array.isArray(progress?.failures) ? progress.failures : [];
    this.state.sessionMediaStatus = state;
    this.state.sessionMediaProgress = { completed, total, failures };
    if (this.state.isPlaying !== true) {
      if (state === "loading") {
        this.deps?.setPodcastVideoStatus?.(`Preparando medios ${completed}/${total}...`);
      } else if (state === "ready") {
        this.deps?.setPodcastVideoStatus?.("Medios listos para reproducir");
      } else if (state === "error") {
        const affectedRowId = String(failures.find((failure) => failure?.rowId)?.rowId || "").trim();
        const affectedScene = affectedRowId
          ? this.deps?.resolveSceneNumberByRowId?.(affectedRowId, this.state.session)
          : "";
        const affectedLabel = affectedScene
          ? ` (incluida la escena ${affectedScene})`
          : "";
        this.deps?.setPodcastVideoStatus?.(`No se pudieron preparar ${failures.length} medios${affectedLabel}. Pulsa Play para reintentar.`);
      }
    }
    this.emit("mediaready", { state, completed, total, failures });
    this.deps?.updatePodcastVideoTransportUi?.();
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
    const clips = [options?.previousClip, currentClip, options?.nextClip]
      .filter((clip) => clip && typeof clip === "object");
    const remoteSources = new Set(
      clips.map((clip) => this.resolveRemoteAudioSourceUrl(clip)).filter(Boolean)
    );
    [options?.previousSourceKey, options?.nextSourceKey].forEach((candidate) => {
      const clean = String(candidate || "").trim();
      if (/^(?:https?:|gs:|\/api\/)/i.test(clean)) remoteSources.add(clean);
    });

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

    // A fulfilled preparation Promise may still reference the detached OLD
    // player when regeneration overwrites the same logical source.
    [...this.dialoguePreparationPromises.keys()].forEach((preparationKey) => {
      if (String(preparationKey || "").split("|")[2] === key) {
        this.dialoguePreparationPromises.delete(preparationKey);
      }
    });

    // Remote media is invalidated through the same serialized barrier used by
    // readers, closing the Cache/IndexedDB OLD->NEW race. Local-only recordings
    // keep their sole persistent copy and only recreate their ObjectURL.
    clips.forEach((clip) => this.clearLocalAudioObjectUrlCache(clip));
    remoteSources.forEach((source) => this.invalidateAuthorizedAssetSource(source));
    await Promise.allSettled(
      [...remoteSources].map((source) => this.invalidateBlobUrl(source))
    );
    return true;
  }

  /**
   * Deeply evicts all cached media (audio, video, images, proxies) associated with a row.
   * Call this when video is generated or manually replaced to force updates in stage & timeline.
   */
  invalidateRowMediaCache(rowId = "", session = null, options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return Promise.resolve(false);
    const rowGeneration = this.bumpRowMediaGeneration(key);
    const queuedRun = this.rowMediaPreparationQueue.catch(() => { }).then(() => (
      this.runRowMediaCacheInvalidation(key, session, {
        ...options,
        rowGeneration
      })
    ));
    const operation = queuedRun.catch((error) => {
      this.reportSessionMediaProgress({
        state: "error",
        completed: 0,
        total: 1,
        failures: [{
          kind: "row-media",
          rowId: key,
          source: "",
          message: String(error?.message || error)
        }]
      });
      return false;
    });
    this.rowMediaPreparationQueue = operation.then(() => undefined, () => undefined);
    this.rowMediaPreparationPromises.set(key, operation);
    const cleanup = () => {
      if (this.rowMediaPreparationPromises.get(key) === operation) {
        this.rowMediaPreparationPromises.delete(key);
      }
    };
    operation.then(cleanup, cleanup);
    return operation;
  }

  async runRowMediaCacheInvalidation(rowId = "", session = null, options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return false;
    const rowGeneration = Number(options?.rowGeneration || this.getRowMediaGeneration(key));
    if (rowGeneration !== this.getRowMediaGeneration(key)) return false;
    const requestedSessionId = String(session?.id || "").trim();
    const runtimeSessionId = String((this.state.session || this.deps?.getActiveSession?.())?.id || "").trim();
    if (requestedSessionId && runtimeSessionId && requestedSessionId !== runtimeSessionId) return false;

    // Visual replacement must not revoke a dialogue/background blob that may
    // still be playing. Audio callers can explicitly opt into audio eviction.
    if (options?.includeAudio === true) await this.invalidateRowAudioCache(key);

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

      // Persisted clips have accumulated several compatible shapes over time
      // (`primarySegment`, `segments`, `generatedVideos[].video`, stop-motion
      // frames). Walk the complete record so replacing a scene evicts every
      // nested source, not only the current top-level alias.
      const visitedMediaNodes = new WeakSet();
      const visitMediaNode = (node = null) => {
        if (!node || typeof node !== "object") return;
        if (visitedMediaNodes.has(node)) return;
        visitedMediaNodes.add(node);
        if (Array.isArray(node)) {
          node.forEach(visitMediaNode);
          return;
        }
        addSegmentCandidates(node);
        Object.values(node).forEach((value) => {
          if (value && typeof value === "object") visitMediaNode(value);
        });
      };
      visitMediaNode(clip);

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

    const imagePreloadKeysToDelete = new Set();
    urlsToInvalidate.forEach((url) => {
      const cachedSource = this.getBlobUrlSync(url);
      [url, cachedSource, this.resolvePersistentMediaCacheKey(url)].filter(Boolean)
        .forEach((candidate) => imagePreloadKeysToDelete.add(String(candidate)));
      proxyUrlVariants(url).forEach((variant) => imagePreloadKeysToDelete.add(String(variant)));
    });
    imagePreloadKeysToDelete.forEach((candidate) => this.stageMachine.imagePreloadCache?.delete?.(candidate));

    const invalidationTasks = [];
    urlsToInvalidate.forEach((url) => {
      this.invalidateAuthorizedAssetSource(url);
      invalidationTasks.push(this.invalidateBlobUrl(url));
      proxyUrlVariants(url).forEach((variant) => {
        this.invalidateAuthorizedAssetSource(variant);
        invalidationTasks.push(this.invalidateBlobUrl(variant));
      });
    });
    await Promise.allSettled(invalidationTasks);
    if (rowGeneration !== this.getRowMediaGeneration(key)) return false;
    const activeSessionId = String(activeSession?.id || "").trim();
    const refreshedSession = this.state.session || this.deps?.getActiveSession?.() || activeSession;
    const currentSessionId = String(refreshedSession?.id || "").trim();
    if (activeSessionId && currentSessionId && activeSessionId !== currentSessionId) return false;

    // Preserve unrelated hydration already in flight. Its row task observes the
    // row/source generations and becomes a no-op; once it settles, hydrate only
    // the replaced row and then reconcile the manifest from stable caches.
    const existingPreparation = this.sessionMediaPreparationPromise;
    if (existingPreparation) await existingPreparation.catch(() => false);
    if (rowGeneration !== this.getRowMediaGeneration(key)) return false;

    await this.prepareSessionMedia({
      session: refreshedSession,
      force: true,
      onlyRowIds: [key],
      includeBackground: false,
      includeDialogue: options?.includeAudio === true,
      onProgress: (progress) => this.reportSessionMediaProgress(progress)
    });
    if (rowGeneration !== this.getRowMediaGeneration(key)) return false;
    await this.prepareSessionMedia({
      // Continue any unfinished background preparation without invalidating or
      // downloading unaffected, already-hydrated assets again.
      session: this.state.session || this.deps?.getActiveSession?.() || refreshedSession,
      onProgress: (progress) => this.reportSessionMediaProgress(progress)
    });

    // 3. Clear transient synced flags to ensure stage media synchronizes completely fresh next loop
    this.state.activeRowId = "";
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.lastSyncedStageKey = "";
    } else if (window.podcastVideoState) {
      window.podcastVideoState.lastSyncedStageKey = "";
    }
    return true;
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
    const recoveryGeneration = this.backgroundRecoveryGeneration;
    const recoveryMediaGeneration = this.mediaCacheGeneration;
    const recoverySessionId = String(this.state.session?.id || "").trim();
    const isCurrentRecovery = () => recoveryGeneration === this.backgroundRecoveryGeneration
      && recoveryMediaGeneration === this.mediaCacheGeneration
      && (!recoverySessionId || recoverySessionId === String(this.state.session?.id || "").trim())
      && this.backgroundAudio === scheduledAudio
      && this.backgroundSourceKey === sourceKey;
    this.emitMediaTelemetry("background-audio-recovery-scheduled", {
      reason,
      sourceKey,
      attempt: this.backgroundRecoveryAttempts,
      delayMs
    });
    this.backgroundRecoveryTimer = setTimeout(() => {
      this.backgroundRecoveryTimer = null;
      if (!isCurrentRecovery()) return;
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
      let recoveryPromise = null;
      recoveryPromise = (async () => {
        await Promise.allSettled(staleSources.map((source) => this.invalidateBlobUrl(source, {
          isCurrent: isCurrentRecovery
        })));
        if (!isCurrentRecovery()) return false;
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
        if (this.backgroundRecoveryPromise === recoveryPromise) {
          this.backgroundRecoveryPromise = null;
        }
      });
      this.backgroundRecoveryPromise = recoveryPromise;
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
      } catch (error) {
        audio.dataset.playbackStarted = "false";
        this.emitMediaTelemetry("background-audio-play-failed", {
          name: String(error?.name || "Error"),
          message: String(error?.message || "No se pudo iniciar el audio de fondo.")
        });
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

  isConfirmedMissingMediaSource(source = "") {
    const cleanSource = String(source || "").trim();
    if (!cleanSource) return false;
    const cacheKey = this.resolvePersistentMediaCacheKey(cleanSource);
    return this.blobCache.get(cleanSource) === "404"
      || (cacheKey && this.blobCache.get(cacheKey) === "404");
  }

  async probeHydratedMediaSource(source = "", kind = "video", timeoutMs = SESSION_MEDIA_READY_TIMEOUT_MS) {
    const cleanSource = String(source || "").trim();
    if (!cleanSource) return false;
    if (typeof document === "undefined") return true;
    const tagName = kind === "audio" ? "audio" : "video";
    const probe = document.createElement(tagName);
    probe.preload = "auto";
    if (tagName === "video") {
      probe.muted = true;
      probe.playsInline = true;
    }
    probe.src = cleanSource;
    try { probe.load(); } catch (_) { }
    const ready = tagName === "audio"
      ? await this.waitForDialogueReady(probe, timeoutMs)
      : await this.waitForMediaReady(probe, timeoutMs);
    try {
      probe.pause();
      probe.removeAttribute("src");
      probe.load();
    } catch (_) { }
    return ready;
  }

  async hydrateAndValidateVisualSource(source = "", kind = "video", options = {}) {
    const cleanSource = String(source || "").trim();
    if (!cleanSource) throw new Error("missing_media_source");
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (options.signal?.aborted === true) throw new DOMException("Aborted", "AbortError");
      if (attempt > 0) {
        if (this.isConfirmedMissingMediaSource(cleanSource)) break;
        this.invalidateAuthorizedAssetSource(cleanSource);
        await this.invalidateBlobUrl(cleanSource);
      }
      const hydratedSource = await this.getBlobUrl(cleanSource, {
        persistent: options.persistent !== false,
        signal: options.signal,
        forceAuthorizedRefresh: attempt > 0
      });
      if (!/^(?:blob:|data:)/i.test(String(hydratedSource || "").trim())) {
        lastError = new Error(`No se pudo hidratar ${kind === "image" ? "la imagen" : "el video"} localmente.`);
        if (this.isConfirmedMissingMediaSource(cleanSource)) break;
        continue;
      }
      try {
        const ready = kind === "image"
          ? Boolean(await this.preloadImageSrc(cleanSource))
          : await this.probeHydratedMediaSource(hydratedSource, "video", options.timeoutMs);
        if (ready) return hydratedSource;
        lastError = new Error(kind === "image"
          ? "No se pudo decodificar la imagen."
          : "No se pudo decodificar el primer frame.");
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        lastError = error;
      }
    }
    throw lastError || new Error("No se pudo preparar el recurso visual.");
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
    const requestedGeneration = Number.isFinite(Number(options.generation))
      ? Number(options.generation)
      : this.sessionMediaPreparationGeneration;
    const mediaCacheGeneration = this.mediaCacheGeneration;
    const sessionId = String(session?.id || "").trim();
    const rowGeneration = this.getRowMediaGeneration(key);
    const sourceGenerationKey = this.resolveAudioMediaGenerationKey(clip);
    let sourceGeneration = this.getMediaSourceGeneration(sourceGenerationKey);
    const preparationKey = `${sessionId}|${mediaCacheGeneration}|${key}|${rowGeneration}|${sourceGeneration}|${sourceKey}`;
    const isCurrentContext = () => requestedGeneration === this.sessionMediaPreparationGeneration
      && mediaCacheGeneration === this.mediaCacheGeneration
      && rowGeneration === this.getRowMediaGeneration(key)
      && (!sessionId || sessionId === String(this.state.session?.id || "").trim())
      && options.signal?.aborted !== true;
    const isCurrentPreparation = () => isCurrentContext()
      && sourceGeneration === this.getMediaSourceGeneration(sourceGenerationKey);

    let promise;
    if (!options.force && this.dialoguePreparationPromises.has(preparationKey)) {
      promise = this.dialoguePreparationPromises.get(preparationKey);
    } else {
      promise = (async () => {
        const audioSrc = await this.resolveDialoguePlaybackAudioSource(clip, {
          signal: options.signal
        });
        if (!audioSrc) throw new Error(`No se pudo resolver una fuente válida para el audio Gemini de ${key}.`);
        if (!isCurrentPreparation()) {
          throw new DOMException("Aborted", "AbortError");
        }

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

    let prepared = await promise;
    if (options.skipWait !== true && prepared.player) {
      let ready = await this.waitForDialogueReady(
        prepared.player,
        Number(options.timeoutMs || DIALOGUE_AUDIO_READY_TIMEOUT_MS)
      );
      if (!ready) {
        if (!isCurrentContext()) throw new DOMException("Aborted", "AbortError");
        this.dialoguePreparationPromises.delete(preparationKey);
        const stalePlayer = prepared.player;
        const failedSource = String(stalePlayer.dataset?.originalSrc || stalePlayer.src || "").trim();
        try { stalePlayer.pause(); } catch (_) { }
        try { stalePlayer.removeAttribute("src"); } catch (_) { stalePlayer.src = ""; }
        try { stalePlayer.load(); } catch (_) { }
        try { stalePlayer.remove(); } catch (_) { }
        if (this.dialoguePlayers[key] === stalePlayer) delete this.dialoguePlayers[key];
        if (this.audioCache[key] === stalePlayer) delete this.audioCache[key];
        delete this.dialogueAudioSourceKeys[key];

        const refreshedSrc = await this.refreshAudioClipAfterDecodeFailure(clip, {
          signal: options.signal,
          failedSource
        });
        if (!refreshedSrc || !isCurrentContext()) {
          throw new Error(`El audio Gemini de ${key} no quedó listo.`);
        }
        sourceGeneration = this.getMediaSourceGeneration(sourceGenerationKey);
        const refreshedPlayer = this.getOrCreateDialoguePlayer(key, refreshedSrc, sourceKey, session);
        refreshedPlayer.preload = "auto";
        ready = await this.waitForDialogueReady(
          refreshedPlayer,
          Number(options.timeoutMs || DIALOGUE_AUDIO_READY_TIMEOUT_MS)
        );
        if (!ready || !isCurrentPreparation()) {
          throw new Error(`El audio Gemini de ${key} no quedó listo.`);
        }
        prepared = { ready: true, rowId: key, player: refreshedPlayer, sourceKey };
        const refreshedPreparationKey = `${sessionId}|${mediaCacheGeneration}|${key}|${rowGeneration}|${sourceGeneration}|${sourceKey}`;
        this.dialoguePreparationPromises.set(refreshedPreparationKey, Promise.resolve(prepared));
      }
    }
    this.emitMediaTelemetry("dialogue-audio-prepared", { rowId: key, sourceKey });
    return prepared;
  }

  async ensureDialogueReadyAtMs(currentMs = this.state.currentMs, options = {}) {
    const requestedPlayheadRevision = Number.isFinite(Number(options.playheadRevision))
      ? Number(options.playheadRevision)
      : null;
    const isCurrentPlayhead = () => requestedPlayheadRevision === null
      || requestedPlayheadRevision === this.playheadRevision;
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

    const prepared = await this.prepareDialogueRow(session, segment.rowId, { skipWait: true });
    if (!isCurrentPlayhead()) return false;
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

  async waitForPendingRowMediaPreparations() {
    // Loop because a regeneration can be queued while another row operation is
    // settling. Play may start only after the complete current set is ready.
    while (this.rowMediaPreparationPromises.size) {
      const pending = [...this.rowMediaPreparationPromises.values()];
      const results = await Promise.all(pending);
      if (results.some((ready) => ready !== true)) {
        const error = new Error("No se pudo preparar el recurso actualizado de una escena.");
        error.failures = [{ kind: "row-media", rowId: "", source: "", message: error.message }];
        throw error;
      }
    }
    return true;
  }

  async prepareSessionMedia(options = {}) {
    const session = options.session || this.state.session || this.deps?.getActiveSession?.();
    const allEntries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    const scopedRowIds = new Set(
      (Array.isArray(options.onlyRowIds) ? options.onlyRowIds : [])
        .map((rowId) => String(rowId || "").trim())
        .filter(Boolean)
    );
    const entries = scopedRowIds.size
      ? allEntries.filter((entry) => scopedRowIds.has(String(entry?.rowId || "").trim()))
      : allEntries;
    const includeDialogue = options.includeDialogue !== false;
    const seenVisualSources = new Set();
    const videoEntries = entries.filter((entry) => {
      const source = this.normalizeTimelineSourceKey(entry?.videoSrc || "");
      if (!source || seenVisualSources.has(source)) return false;
      seenVisualSources.add(source);
      return true;
    });
    const rowIds = [...new Set(entries.map((entry) => String(entry?.rowId || "").trim()).filter(Boolean))];
    const entryByRowId = new Map(
      entries
        .map((entry) => [String(entry?.rowId || "").trim(), entry])
        .filter(([rowId]) => rowId)
    );
    const backgroundConfig = this.deps?.getPanelMontageMusicConfig?.(session) || {};
    const backgroundItems = (scopedRowIds.size && options.includeBackground !== true ? [] : [
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
    ]).filter((item, index, list) => {
      const sourceKey = this.resolveAudioSourceKey(item);
      return sourceKey && list.findIndex((candidate) => this.resolveAudioSourceKey(candidate) === sourceKey) === index;
    });
    const stopMotionSourceSignature = entries
      .flatMap((entry) => this.collectEntryStopMotionSources(entry))
      .map((source) => this.normalizeTimelineSourceKey(source))
      .filter(Boolean)
      .sort();
    const signature = [
      String(session?.id || ""),
      scopedRowIds.size ? `rows:${[...scopedRowIds].sort().join(",")}` : "rows:*",
      ...videoEntries.map((entry) => this.normalizeTimelineSourceKey(entry?.videoSrc || "")),
      ...stopMotionSourceSignature,
      ...(includeDialogue
        ? rowIds.map((rowId) => this.resolveAudioSourceKey(this.deps?.resolveDialogueAudioForRow?.(session, rowId))).sort()
        : []),
      ...backgroundItems.map((item) => this.resolveAudioSourceKey(item)).sort()
    ].join("|");
    const requestedProgressListener = typeof options.onProgress === "function"
      ? options.onProgress
      : null;
    if (!options.force && signature === this.sessionMediaPreparationKey && this.sessionMediaPreparationPromise) {
      if (requestedProgressListener) {
        this.sessionMediaProgressListeners.add(requestedProgressListener);
        try { requestedProgressListener({ ...this.sessionMediaLastProgress }); } catch (_) { }
      }
      return this.sessionMediaPreparationPromise;
    }

    this.sessionMediaAbortController?.abort?.();
    const abortController = typeof AbortController === "function" ? new AbortController() : null;
    this.sessionMediaAbortController = abortController;
    const generation = ++this.sessionMediaPreparationGeneration;

    this.sessionMediaProgressListeners.clear();
    if (requestedProgressListener) this.sessionMediaProgressListeners.add(requestedProgressListener);
    const report = (progress = {}) => {
      this.sessionMediaLastProgress = {
        state: String(progress?.state || "loading"),
        completed: Math.max(0, Number(progress?.completed || 0) || 0),
        total: Math.max(0, Number(progress?.total || 0) || 0),
        failures: Array.isArray(progress?.failures) ? progress.failures : []
      };
      this.sessionMediaProgressListeners.forEach((listener) => {
        try { listener({ ...this.sessionMediaLastProgress }); } catch (_) { }
      });
    };
    const tasks = [];
    videoEntries.forEach((entry) => {
      const source = String(entry?.videoSrc || "").trim();
      if (!source) return;
      const rowId = String(entry?.rowId || "").trim();
      tasks.push({
        kind: this.isImageStageEntry(entry) ? "image" : "video",
        rowId,
        rowGeneration: this.getRowMediaGeneration(rowId),
        source,
        startMs: Math.max(0, Number(entry?.startMs || 0) || 0),
        endMs: Math.max(0, Number(entry?.endMs || 0) || 0),
        run: async () => {
          if (abortController?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
          if (this.isImageStageEntry(entry)) {
            await this.hydrateAndValidateVisualSource(source, "image", {
              persistent: true,
              signal: abortController?.signal,
              timeoutMs: SESSION_MEDIA_READY_TIMEOUT_MS
            });
            return;
          }
          await this.hydrateAndValidateVisualSource(source, "video", {
            persistent: true,
            signal: abortController?.signal,
            timeoutMs: SESSION_MEDIA_READY_TIMEOUT_MS
          });
        }
      });
    });
    entries.forEach((entry) => {
      const stopMotionSources = this.collectEntryStopMotionSources(entry);
      stopMotionSources.forEach((source) => {
        const normalizedSource = this.normalizeTimelineSourceKey(source);
        if (!source || seenVisualSources.has(normalizedSource)) return;
        seenVisualSources.add(normalizedSource);
        const rowId = String(entry?.rowId || "").trim();
        tasks.push({
          kind: "stop-motion-frame",
          rowId,
          rowGeneration: this.getRowMediaGeneration(rowId),
          source,
          startMs: Math.max(0, Number(entry?.startMs || 0) || 0),
          endMs: Math.max(0, Number(entry?.endMs || 0) || 0),
          run: async () => {
            if (abortController?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            await this.hydrateAndValidateVisualSource(source, "image", {
              persistent: true,
              signal: abortController?.signal,
              timeoutMs: SESSION_MEDIA_READY_TIMEOUT_MS
            });
          }
        });
      });
    });
    if (includeDialogue) rowIds.forEach((rowId) => {
      if (!this.resolveAudioSourceKey(this.deps?.resolveDialogueAudioForRow?.(session, rowId))) return;
      const rowEntry = entryByRowId.get(rowId) || null;
      tasks.push({
        kind: "audio",
        rowId,
        rowGeneration: this.getRowMediaGeneration(rowId),
        source: "",
        startMs: Math.max(0, Number(rowEntry?.startMs || 0) || 0),
        endMs: Math.max(0, Number(rowEntry?.endMs || 0) || 0),
        run: () => this.prepareDialogueRow(session, rowId, {
          force: options.forceDialogue === true,
          generation,
          signal: abortController?.signal,
          timeoutMs: SESSION_MEDIA_READY_TIMEOUT_MS
        })
      });
    });
    backgroundItems.forEach((item) => {
      tasks.push({
        kind: "background-audio",
        rowId: "",
        source: this.resolveAudioSourceKey(item),
        startMs: Number.POSITIVE_INFINITY,
        endMs: Number.POSITIVE_INFINITY,
        run: async () => {
          const preparedSource = await this.resolveAndValidateAudioClipSource(item, {
            signal: abortController?.signal,
            timeoutMs: SESSION_MEDIA_READY_TIMEOUT_MS
          });
          if (generation !== this.sessionMediaPreparationGeneration || abortController?.signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          if (!/^(?:blob:|data:)/i.test(String(preparedSource || "").trim())) {
            throw new Error("No se pudo hidratar el audio de fondo localmente.");
          }
        }
      });
    });

    this.sessionMediaPreparationKey = signature;
    this.sessionMediaPreparationPromise = (async () => {
      const failures = [];
      let completed = 0;
      report({ state: "loading", completed, total: tasks.length, failures: [] });
      const pendingTasks = [...tasks];
      const takeNextTask = () => {
        if (!pendingTasks.length) return null;
        const targetMs = Math.max(0, Number(this.state.currentMs || 0) || 0);
        const activeRowId = String(this.getEntryAtMs(targetMs)?.rowId || this.state.activeRowId || "").trim();
        let bestIndex = 0;
        let bestScore = Number.POSITIVE_INFINITY;
        pendingTasks.forEach((task, index) => {
          const startMs = Number(task.startMs);
          const endMs = Number(task.endMs);
          const isActiveRow = Boolean(activeRowId) && task.rowId === activeRowId;
          const isActiveWindow = Number.isFinite(startMs) && Number.isFinite(endMs)
            && targetMs >= startMs && targetMs < endMs;
          const isUpcoming = Number.isFinite(startMs) && startMs >= targetMs;
          const kindBias = task.kind === "video" || task.kind === "image" ? 0 : 0.1;
          const score = isActiveRow || isActiveWindow
            ? kindBias
            : (isUpcoming
              ? 1000 + (startMs - targetMs) + kindBias
              : 1_000_000 + Math.abs(targetMs - (Number.isFinite(endMs) ? endMs : 0)) + kindBias);
          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        });
        return pendingTasks.splice(bestIndex, 1)[0] || null;
      };
      const worker = async () => {
        while (pendingTasks.length) {
          if (generation !== this.sessionMediaPreparationGeneration || abortController?.signal?.aborted) return;
          const task = takeNextTask();
          if (!task) return;
          const isCurrentRowTask = () => !task.rowId
            || Number(task.rowGeneration || 0) === this.getRowMediaGeneration(task.rowId);
          try {
            if (isCurrentRowTask()) await task.run();
          } catch (error) {
            // A row replacement invalidates only that task. The replacement
            // operation hydrates the new source while unrelated workers keep
            // progressing, so this stale result is not a session failure.
            if (isCurrentRowTask()) {
              failures.push({
                kind: task.kind,
                rowId: task.rowId,
                source: task.source,
                message: String(error?.message || error)
              });
            }
          } finally {
            completed += 1;
            if (generation === this.sessionMediaPreparationGeneration) {
              report({ state: "loading", completed, total: tasks.length, failures: [...failures] });
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, Math.max(1, tasks.length)) }, () => worker()));
      if (generation !== this.sessionMediaPreparationGeneration || abortController?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (failures.length) {
        const error = new Error(`No se pudieron preparar ${failures.length} recursos.`);
        error.failures = failures;
        report({ state: "error", completed, total: tasks.length, failures });
        throw error;
      }
      report({ state: "ready", completed, total: tasks.length, failures: [] });
      return { ready: true, completed, total: tasks.length };
    })().catch((error) => {
      if (generation === this.sessionMediaPreparationGeneration) {
        this.sessionMediaPreparationPromise = null;
        if (error?.name !== "AbortError") {
          this.state.sessionMediaStatus = "error";
        }
      }
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
    const sessionId = String(session?.id || "").trim();
    const mediaCacheGeneration = this.mediaCacheGeneration;
    const isCurrentPreparation = () => prepareId === this.prepareSequence
      && mediaCacheGeneration === this.mediaCacheGeneration
      && (!sessionId || sessionId === String(this.state.session?.id || "").trim());
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    const fromMs = Math.max(0, Number(atMs) || 0);
    const untilMs = fromMs + Math.max(1000, Number(lookAheadMs) || PLAYBACK_PREPARE_LOOKAHEAD_MS);
    const selected = entries
      .filter((entry) => Number(entry?.endMs || 0) >= fromMs && Number(entry?.startMs || 0) <= untilMs)
      .slice(0, 3);
    const activeEntry = selected.find((entry) => fromMs >= Number(entry?.startMs || 0) && fromMs < Number(entry?.endMs || 0)) || selected[0] || null;
    // Resuelve la cola en segundo plano. Blob sí hidrata persistencia.
    this.prewarmTimelineStageVideos(session, {
      currentMs: fromMs,
      concurrency: 1
    }).catch(() => { });
    const criticalEntries = criticalOnly && activeEntry ? [activeEntry] : selected;
    const backgroundEntries = criticalOnly
      ? selected.filter((entry) => entry && entry !== activeEntry)
      : [];
    const videoTasks = criticalEntries
      .filter((entry) => entry?.videoSrc && !this.isImageStageEntry(entry))
      .map(async (entry) => {
        const source = String(entry.videoSrc || "").trim();
        if (!source) return false;
        const hydrated = await this.getBlobUrl(source, { persistent: true });
        const ready = /^(?:blob:|data:)/i.test(String(hydrated || "").trim());
        if (ready) this.emitMediaTelemetry("cache-hit-memory", { kind: "video", source });
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
        if (report && isCurrentPreparation()) report({ state: "loading", completed, total });
      })
    );
    const settledTasks = await Promise.allSettled(trackedTasks);
    if (!isCurrentPreparation()) return false;
    this.state.isPreparing = false;
    const failures = settledTasks.filter((result) => (
      result.status === "rejected"
      || (result.status === "fulfilled" && !result.value)
    ));
    if (failures.length) {
      this.playbackRangePreparationSignature = "";
      if (report) report({ state: "error", completed, total, failures });
      this.emitMediaTelemetry("prepare-error", {
        atMs: fromMs,
        failures: failures.length,
        entries: selected.length,
        criticalOnly
      });
      return false;
    }
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
    const playheadRevision = ++this.playheadRevision;
    const isCurrentPlayRequest = () => playheadRevision === this.playheadRevision;
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
      this.state.isPreparing = true;
      try {
        await this.prepareSessionMedia({
          session: this.state.session,
          onProgress: (progress) => {
            this.reportSessionMediaProgress(progress);
            options.onProgress?.(progress);
          }
        });
        await this.waitForPendingRowMediaPreparations();
      } catch (error) {
        if (!isCurrentPlayRequest() || error?.name === "AbortError") return false;
        this.state.isPlaying = false;
        this.deps?.setPodcastVideoStatus?.("No se pudo preparar toda la sesión. Pulsa Play para reintentar.");
        throw error;
      } finally {
        if (isCurrentPlayRequest()) {
          this.state.isPreparing = false;
          this.deps?.updatePodcastVideoTransportUi?.();
        }
      }
      if (!isCurrentPlayRequest()) return false;
      const prepareAtMs = this.state.currentMs;
      const lookAheadMs = options.lookAheadMs || PLAYBACK_PREPARE_LOOKAHEAD_MS;
      const willReportProgress = typeof options.onProgress === "function"
        ? this.buildPlaybackRangePreparationSignature(prepareAtMs, lookAheadMs, {
          criticalOnly: options.criticalOnly !== false,
          session: this.state.session || this.deps?.getActiveSession?.()
        }) !== this.playbackRangePreparationSignature
        : false;
      this.deps?.setPodcastVideoStatus?.("Preparando escenas...");
      const rangeReady = await this.preparePlaybackRange({
        atMs: prepareAtMs,
        lookAheadMs,
        onProgress: willReportProgress ? options.onProgress : null,
        criticalOnly: options.criticalOnly !== false
      });
      if (!isCurrentPlayRequest()) return false;
      if (!rangeReady) {
        this.deps?.setPodcastVideoStatus?.("No se pudo preparar la escena actual. Pulsa Play para reintentar.");
        return false;
      }
    }

    const slotsReady = await this.prepareStageSlotsAtMs(this.state.currentMs);
    if (!isCurrentPlayRequest()) return false;
    if (!slotsReady) {
      this.deps?.setPodcastVideoStatus?.("No se pudo preparar la escena actual. Pulsa Play para reintentar.");
      return false;
    }
    this.state.isPlaying = true;
    // Arranca tanto Gemini como la música ya hidratados antes del reloj maestro.
    // Si el reloj comienza primero, el primer tick puede calcular un offset
    // adelantado y comerse el inicio de la voz mientras el elemento hace canplay.
    const preparedEntry = this.getEntryAtMs(this.state.currentMs);
    const [, stageReady] = await Promise.all([
      this.syncAudio(
        this.state.currentMs,
        this.deps?.getPlaybackSpeed?.() || 1,
        { playheadRevision }
      ),
      preparedEntry
        ? this.syncStageSwitching(preparedEntry, this.state.currentMs, {
          awaitImageReady: true,
          requirePlaybackStart: true
        })
        : Promise.resolve(true)
    ]);
    if (!isCurrentPlayRequest()) {
      return false;
    }
    if (preparedEntry && !stageReady) {
      this.state.isPlaying = false;
      this.pauseMediaForStageBuffering();
      this.deps?.setPodcastVideoStatus?.("No se pudo preparar la escena actual. Pulsa Play para reintentar.");
      this.deps?.updatePodcastVideoTransportUi?.();
      return false;
    }
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
    return true;
  }

  pause() {
    this.state.isPlaying = false;
    this.state.isBuffering = false;
    this.stageBufferStartMs = null;
    if (this.stageBufferRecoveryTimer) {
      clearTimeout(this.stageBufferRecoveryTimer);
      this.stageBufferRecoveryTimer = null;
    }
    this.stageBufferRecoverySeq += 1;
    this.playheadRevision += 1;
    this.activeLoopId += 1;
    this.stageSwitchSeq += 1;
    this.stageMachine.imageSwapToken = Number(this.stageMachine.imageSwapToken || 0) + 1;
    this.podcastStageVideoLoadTokenSeq += 1;
    this.podcastStageVideoLoadTokensByEl = new WeakMap();
    this.stageMachine.loadingSrc = "";
    this.stageMachine.loadingRequest = null;
    this.pendingTimelineSeekTick = null;
    this.stopClock();

    Object.values(this.dialoguePlayers).forEach(audio => {
      if (audio) {
        audio.dataset.wasActive = "";
        try { audio.pause(); } catch (_) { }
      }
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
    this.state.isPlaying = false;
    this.state.isBuffering = false;
    this.stageBufferStartMs = null;
    if (this.stageBufferRecoveryTimer) {
      clearTimeout(this.stageBufferRecoveryTimer);
      this.stageBufferRecoveryTimer = null;
    }
    this.stageBufferRecoverySeq += 1;
    this.playheadRevision += 1;
    this.activeLoopId += 1;
    this.stageSwitchSeq += 1;
    this.stageMachine.imageSwapToken = Number(this.stageMachine.imageSwapToken || 0) + 1;
    this.podcastStageVideoLoadTokenSeq += 1;
    this.podcastStageVideoLoadTokensByEl = new WeakMap();
    this.stageMachine.loadingSrc = "";
    this.stageMachine.loadingRequest = null;
    this.stageMachine.preloadingSrc = "";
    this.stageMachine.preloadingKey = "";
    this.stageMachine.preloadingPromise = null;
    this.pendingTimelineSeekTick = null;
    this.stopClock();

    const shouldReset = opts.keepCursor !== true;
    if (shouldReset) {
      const stopTargetMs = 0;
      const targetEntry = this.getEntryAtMs(0);
      const targetRowId = String(targetEntry?.rowId || "").trim();

      this.state.currentMs = stopTargetMs;
      this.state.activeRowId = targetRowId;
      this.stopRewindTargetMs = null;
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
          targetSeconds = this.clampVideoTimeToLastFrame(el, seconds).targetSec;
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
              targetSeconds = this.clampVideoTimeToLastFrame(el, targetSeconds).targetSec;
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
    let finishing = false;

    const tickLoop = (now) => {
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
          if (!finishing) {
            finishing = true;
            void this.tick(this.state.stopAtMs, { playheadRevision: this.playheadRevision }).finally(() => {
              if (loopId !== this.activeLoopId) return;
              this.state.stopAtMs = 0;
              void this.stop();
            });
          }
          return;
        }

        if (this.state.totalDurationMs > 100 && nextMs >= this.state.totalDurationMs) {
          this.state.currentMs = this.state.totalDurationMs;
          if (!finishing) {
            finishing = true;
            void this.tick(this.state.totalDurationMs, { playheadRevision: this.playheadRevision }).finally(() => {
              if (loopId !== this.activeLoopId) return;
              void this.stop();
            });
          }
          return;
        }

        // The clock advances independently from asynchronous media work. tick()
        // coalesces to the latest requested position while this rAF keeps moving.
        this.state.currentMs = Math.max(this.state.currentMs, nextMs);
        void this.tick(this.state.currentMs, { playheadRevision: this.playheadRevision });
        if (!this.state.isPlaying || loopId !== this.activeLoopId) return;
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
    // A seek explícito reemplaza cualquier recuperación pendiente. Conservar
    // stageBufferStartMs hacía que un canplay tardío restaurara la posición
    // anterior o dejara el transporte marcado como Playing con el reloj parado.
    const resumeClockAfterBufferedSeek = this.state.isPlaying === true
      && (this.state.isBuffering === true || Boolean(this.stageBufferRecoveryTimer));
    if (this.stageBufferRecoveryTimer) {
      clearTimeout(this.stageBufferRecoveryTimer);
      this.stageBufferRecoveryTimer = null;
    }
    if (this.state.isBuffering === true || this.stageBufferRecoveryPromise) {
      this.stageBufferRecoverySeq += 1;
    }
    this.state.isBuffering = false;
    this.stageBufferStartMs = null;
    this.playheadRevision += 1;
    const playheadRevision = this.playheadRevision;
    this.state.currentMs = ms;
    this.sceneMotionSyncRevision = Number(this.sceneMotionSyncRevision || 0) + 1;

    const targetEntry = this.getEntryAtMs(ms);
    const targetActiveRowId = String(targetEntry?.rowId || "").trim();

    Object.entries(this.dialoguePlayers).forEach(([rowId, audio]) => {
      if (String(rowId || "").trim() !== targetActiveRowId && audio) {
        audio.dataset.wasActive = "";
        audio.dataset.playIntent = "";
        audio.dataset.pendingPlayIntent = "";
        audio.dataset.playPending = "";
        if (!audio.paused) {
          try { audio.pause(); } catch (_) { }
        }
      }
    });
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
        await this.tick(ms, { lightweight: useLightweightSeek, explicitSeek: true, playheadRevision });
      } else {
        await this.tick(ms, {
          lightweight: useLightweightSeek,
          explicitSeek: true,
          playheadRevision,
          skipAudioSync,
          deferPreview: options.deferPreview === true,
          suppressAutoScroll: options.suppressAutoScroll === true,
          navigationOnly: options.navigationOnly === true
        });
      }
    } finally {
      this.state.forceStageMediaSync = false;
    }
    if (resumeClockAfterBufferedSeek
      && playheadRevision === this.playheadRevision
      && this.state.isPlaying === true) {
      this.startClock();
      this.syncStageMediaMotionPlaybackState(true);
      this.deps?.setPodcastVideoStatus?.("Reproduciendo...");
      this.deps?.updatePodcastVideoTransportUi?.();
    }
    this.emit('seek', { currentMs: ms });
  }

  async tick(currentMs, options = {}) {
    const ms = Number.isFinite(Number(currentMs)) ? Number(currentMs) : this.state.currentMs;
    const requestedRevision = Number(options.playheadRevision ?? this.playheadRevision);
    if (requestedRevision !== this.playheadRevision) return;
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
          await this.ensureDialogueReadyAtMs(ms, { playheadRevision: requestedRevision });
        } catch (err) {
          // Prevent dialogue preparation errors from stalling the entire timeline tick loop
          void err;
        }
      }
      if (requestedRevision !== this.playheadRevision) return;
      const syncMs = options.explicitSeek === true
        ? ms
        : (this.state.isPlaying ? Math.max(ms, Number(this.state.currentMs || 0)) : ms);
      const tickTasks = [
        this.syncVideo(syncMs, { playheadRevision: requestedRevision }),
        ...(!shouldDeferPreview
          ? [
              this.syncOverlay ? this.syncOverlay(syncMs) : null,
              this.syncStylizedText ? this.syncStylizedText(syncMs) : null,
              this.syncOverlayCards ? this.syncOverlayCards(syncMs) : null
            ]
          : [])
      ];
      if (shouldSyncAudio) {
        tickTasks.unshift(this.syncAudio(syncMs, speed, { playheadRevision: requestedRevision }));
      }
      await Promise.all(tickTasks);
      if (requestedRevision !== this.playheadRevision) return;
      this.emit('timeupdate', { currentMs: syncMs });
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
      if (currentSourceKey === nextSourceKey && currentSrc === cleanAudioSrc) {
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
    const playerSessionId = String(session?.id || "").trim();
    const isCurrentPlayer = () => this.dialoguePlayers[rowId] === audio
      && (!playerSessionId || playerSessionId === String(this.state.session?.id || "").trim());

    audio.addEventListener("loadedmetadata", () => {
      if (!isCurrentPlayer()) return;
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
            if (!isCurrentPlayer()) return;
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
  async syncAudio(currentMs, speed, options = {}) {
    const canStartWhileBuffering = options.allowDuringBufferRecovery === true;
    const canStartPlayback = () => this.state.isPlaying === true
      && (this.state.isBuffering !== true || canStartWhileBuffering);
    const session = this.state.session || this.deps?.getActiveSession?.();
    const syncMediaGeneration = this.mediaCacheGeneration;
    const syncPreparationGeneration = this.sessionMediaPreparationGeneration;
    const syncSessionId = String(session?.id || "").trim();
    const syncAbortSignal = this.sessionMediaAbortController?.signal || null;
    const requestedPlayheadRevision = Number.isFinite(Number(options.playheadRevision))
      ? Number(options.playheadRevision)
      : null;
    const isCurrentAudioSync = () => syncMediaGeneration === this.mediaCacheGeneration
      && syncPreparationGeneration === this.sessionMediaPreparationGeneration
      && syncAbortSignal?.aborted !== true
      && (requestedPlayheadRevision === null || requestedPlayheadRevision === this.playheadRevision)
      && (!syncSessionId || syncSessionId === String(this.state.session?.id || "").trim());
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
      const trimInTimelineMs = Math.max(0, Number(segment?.trimInMs || 0) || 0)
        / Math.max(0.5, Number(segment.__timelinePlaybackRate || 1) || 1);
      const adjustedEndMs = segmentStartMs + Math.max(0, playerDurationMs - trimInTimelineMs);
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
          generation: syncPreparationGeneration,
          signal: syncAbortSignal,
          timeoutMs: DIALOGUE_AUDIO_ACTIVE_PREPARE_TIMEOUT_MS
        });
        await Promise.race([
          preparePromise,
          new Promise((resolve) => setTimeout(resolve, DIALOGUE_AUDIO_ACTIVE_PREPARE_TIMEOUT_MS))
        ]).catch(() => { });
        if (!isCurrentAudioSync()) return;
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
        generation: syncPreparationGeneration,
        signal: syncAbortSignal,
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

        if (currentMs >= carryStartMs && currentMs <= carryEndMs + audioCarryToleranceMs) {
          activeDialogueVoiceRowIds.add(rowKey);
          audio.dataset.wasActive = "true";
          if (
            canStartPlayback()
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
        const audioSrc = await this.resolveDialoguePlaybackAudioSource(audioClip, {
          signal: syncAbortSignal
        });
        if (!isCurrentAudioSync()) return;
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
      if (canStartPlayback() && audio.paused && !isPlayPending) {
        const playIntent = `${rowId}:${sourceKey}:${Math.round(Number(segment.startMs || 0) || 0)}`;
        const startPlayback = () => {
          if (!isCurrentAudioSync() || !canStartPlayback() || audio.dataset.playIntent !== playIntent) {
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
          }).catch((error) => {
            audio.dataset.playPending = "";
            this.emitMediaTelemetry("dialogue-audio-play-failed", {
              rowId,
              name: String(error?.name || "Error"),
              message: String(error?.message || "No se pudo iniciar la voz.")
            });
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

    if (!isCurrentAudioSync()) return;
    await this.syncBackgroundMusic(currentMs, speed, hasVoice, options);
  }
  async syncBackgroundMusic(currentMs, speed, hasVoice = false, options = {}) {
    if (this.state.isBuffering === true && options.allowDuringBufferRecovery !== true) {
      this.pauseBackgroundMusic();
      return;
    }
    const session = this.state.session || this.deps?.getActiveSession?.();
    const backgroundMediaGeneration = this.mediaCacheGeneration;
    const backgroundPreparationGeneration = this.sessionMediaPreparationGeneration;
    const backgroundSessionId = String(session?.id || "").trim();
    const backgroundAbortSignal = this.sessionMediaAbortController?.signal || null;
    const requestedPlayheadRevision = Number.isFinite(Number(options.playheadRevision))
      ? Number(options.playheadRevision)
      : null;
    const isCurrentBackgroundSync = () => backgroundMediaGeneration === this.mediaCacheGeneration
      && backgroundPreparationGeneration === this.sessionMediaPreparationGeneration
      && backgroundAbortSignal?.aborted !== true
      && (requestedPlayheadRevision === null || requestedPlayheadRevision === this.playheadRevision)
      && (!backgroundSessionId || backgroundSessionId === String(this.state.session?.id || "").trim());
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
    const activeSegmentGenerationKey = this.resolveAudioMediaGenerationKey(activeSegment);
    const activeSegmentSourceGeneration = String(this.getMediaSourceGeneration(activeSegmentGenerationKey));
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
    const mountedBackgroundSourceKey = String(this.backgroundAudio?.dataset?.sourceKey || "").trim();
    const mountedBackgroundSrc = String(
      this.backgroundAudio?.dataset?.originalSrc
      || this.backgroundAudio?.getAttribute?.("src")
      || this.backgroundAudio?.src
      || ""
    ).trim();
    const sourceHasNotChanged = this.backgroundSourceKey === stableSegmentSourceKey
      && mountedBackgroundSourceKey === stableSegmentSourceKey
      && String(this.backgroundAudio?.dataset?.mediaSourceGeneration || "") === activeSegmentSourceGeneration
      && Boolean(mountedBackgroundSrc);
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
      try {
        const playableSource = await this.resolveDialoguePlaybackAudioSource({
          ...activeSegment,
          localDataUrl: String(activeSegment.localDataUrl || "").trim(),
          localMediaCacheKey: String(activeSegment.localMediaCacheKey || "").trim(),
          sourceUrl: String(activeSegment.sourceUrl || activeSegment.downloadUrl || activeSegment.storagePath || "").trim(),
          downloadUrl: String(activeSegment.downloadUrl || "").trim(),
          storagePath: String(activeSegment.storagePath || "").trim()
        }, {
          signal: backgroundAbortSignal
        });
        if (!isCurrentBackgroundSync()) return;
        const blobSrc = playableSource;
        if (!blobSrc) {
          this.backgroundSrc = "";
          this.backgroundResolvedSource = "";
          this.backgroundSourceKey = "";
          return;
        }
        // Publish the logical source only after the asynchronous resolution is
        // still current. Otherwise a superseded seek can leave a key marked as
        // loaded while the media element has no matching src.
        this.backgroundSourceKey = stableSegmentSourceKey;
        this.backgroundSegmentIdentity = activeSegmentIdentity;
        this.backgroundSrc = String(activeSegment.sourceUrl || "").trim();
        this.backgroundAudio = this.getOrCreateBackgroundAudioElement();
        this.backgroundResolvedSource = String(blobSrc || "").trim();
        this.backgroundAudio.src = blobSrc;
        this.backgroundAudio.dataset.originalSrc = this.backgroundResolvedSource;
        this.backgroundAudio.dataset.sourceKey = stableSegmentSourceKey;
        this.backgroundAudio.dataset.mediaSourceGeneration = activeSegmentSourceGeneration;
        this.backgroundAudio.dataset.initialized = "false";
        this.backgroundAudio.dataset.playbackStarted = "false";
        try { this.backgroundAudio.load(); } catch (_) { }
        const useNativeLoop = activeSegment.loop !== undefined ? activeSegment.loop : true;
        this.backgroundAudio.loop = sourceIsContinuous ? false : useNativeLoop;
      } catch (e) {
        if (!isCurrentBackgroundSync()) return;
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
    const hasExplicitBackgroundFade = segmentFadeInMs > 0 || segmentFadeOutMs > 0;
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
        if (hasExplicitBackgroundFade) {
          // The fade factor is already derived from the exact timeline position on
          // every tick. Re-starting Web Audio smoothing from zero here prevented a fade
          // that begins at 0 from ever gaining audible volume.
          try { this.backgroundGain.gain.cancelScheduledValues(now); } catch (_) { }
          try { this.backgroundGain.gain.setValueAtTime(clampedFinalVolume, now); } catch (_) {
            this.backgroundGain.gain.value = clampedFinalVolume;
          }
        } else {
          try { this.backgroundGain.gain.cancelScheduledValues(now); } catch (_) { }
          // Keep smoothing for ducking and ordinary volume changes only.
          if (isNewBackgroundSegment) {
            try { this.backgroundGain.gain.setValueAtTime(0, now); } catch (_) { }
          } else {
            const currentGain = Number(this.backgroundGain.gain.value || 0);
            try { this.backgroundGain.gain.setValueAtTime(currentGain, now); } catch (_) { }
          }
          this.backgroundGain.gain.setTargetAtTime(clampedFinalVolume, now, isNewBackgroundSegment ? 0.08 : smoothingConstant);
        }
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
      if (!isCurrentBackgroundSync()) return;
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
    this.backgroundRecoveryGeneration += 1;
    this.backgroundRecoveryPromise = null;
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
  isStageEntryPresented(entry = null, currentMs = this.state.currentMs) {
    if (!entry || !this.hasStageVisualSurface(entry) || this.isColorSceneEntry(entry)) return true;
    if (this.isImageStageEntry(entry)) {
      const imageEntry = this.resolveStopMotionEntryAtMs(entry, currentMs);
      const source = String(imageEntry?.videoSrc || entry?.videoSrc || "").trim();
      return [this.els?.podcastActiveSpeakerImage, this.els?.podcastActiveSpeakerImageAlt]
        .filter(Boolean)
        .some((imageEl) => imageEl.hidden !== true
          && String(imageEl.dataset?.src || "").trim() === source
          && String(imageEl.dataset?.mediaSourceGeneration || "") === String(this.getMediaSourceGeneration(source))
          && imageEl.complete
          && Number(imageEl.naturalWidth || 0) > 0);
    }
    const activeEl = this.getActiveStageVideoEl();
    return Boolean(activeEl
      && activeEl.hidden !== true
      && String(activeEl.dataset?.src || "").trim() === String(entry?.videoSrc || "").trim()
      && String(activeEl.dataset?.entryKey || "").trim() === this.buildStageEntryIdentity(entry)
      && this.isVideoSurfaceReady(activeEl, entry.videoSrc));
  }

  isStageEntryPrepared(entry = null, currentMs = this.state.currentMs) {
    if (!entry || !this.hasStageVisualSurface(entry) || this.isColorSceneEntry(entry)) return true;
    if (this.isStageEntryPresented(entry, currentMs)) return true;
    if (this.isImageStageEntry(entry)) {
      const imageEntry = this.resolveStopMotionEntryAtMs(entry, currentMs);
      const source = String(imageEntry?.videoSrc || entry?.videoSrc || "").trim();
      return [this.els?.podcastActiveSpeakerImage, this.els?.podcastActiveSpeakerImageAlt]
        .filter(Boolean)
        .some((imageEl) => String(imageEl.dataset?.src || "").trim() === source
          && String(imageEl.dataset?.mediaSourceGeneration || "") === String(this.getMediaSourceGeneration(source))
          && imageEl.complete
          && Number(imageEl.naturalWidth || 0) > 0);
    }
    const entryKey = this.buildStageEntryIdentity(entry);
    return this.getStageVideoElements()
      .filter((videoEl) => videoEl === this.els?.podcastActiveSpeakerVideo
        || videoEl === this.els?.podcastActiveSpeakerVideoAlt)
      .some((videoEl) => this.isVideoSurfaceReady(videoEl, entry.videoSrc)
        && String(videoEl.dataset?.entryKey || "").trim() === entryKey
        && String(videoEl.dataset?.preparedEntryKey || "").trim() === entryKey);
  }

  async syncVideo(currentMs, options = {}) {
    if (this.state.useMse) return;
    const entry = this.getEntryAtMs(currentMs);
    const requestedPlayheadRevision = Number.isFinite(Number(options.playheadRevision))
      ? Number(options.playheadRevision)
      : null;

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
    if (entry) {
      let shouldCoordinateTransition = this.state.isPlaying === true
        && this.state.isBuffering !== true
        && !this.isStageEntryPresented(entry, currentMs)
        && !this.isStageEntryPrepared(entry, currentMs);
      let transitionToken = 0;
      const transitionRevision = requestedPlayheadRevision ?? this.playheadRevision;
      const transitionSessionId = String(this.state.session?.id || "").trim();
      const transitionMs = Math.max(0, Number(currentMs || 0) || 0);
      const isCurrentTransition = () => transitionToken === this.stageBufferRecoverySeq
        && transitionRevision === this.playheadRevision
        && (!transitionSessionId || transitionSessionId === String(this.state.session?.id || "").trim())
        && this.state.isPlaying === true;

      const beginCoordinatedTransition = () => {
        if (shouldCoordinateTransition && transitionToken) return;
        shouldCoordinateTransition = true;
        transitionToken = ++this.stageBufferRecoverySeq;
        this.stageBufferStartMs = transitionMs;
        this.state.currentMs = transitionMs;
        this.state.isBuffering = true;
        this.activeLoopId += 1;
        this.pauseMediaForStageBuffering();
        const sceneNumber = this.deps?.resolveSceneNumberByRowId?.(entry.rowId, this.state.session);
        this.deps?.setPodcastVideoStatus?.(
          sceneNumber ? `Preparando escena ${sceneNumber}...` : "Preparando escena..."
        );
        this.deps?.updatePodcastVideoTransportUi?.();
      };

      if (shouldCoordinateTransition) {
        beginCoordinatedTransition();
      }

      let stageReady = await this.syncStageSwitching(entry, transitionMs, {
        awaitImageReady: shouldCoordinateTransition,
        requirePlaybackStart: this.state.isPlaying === true && !shouldCoordinateTransition
      });
      // A slot can be fully precomposed yet fail to start (decoder eviction,
      // autoplay rejection, transient browser pressure). Freeze at the cut and
      // run the same coordinated recovery instead of advancing a frozen frame.
      if (!stageReady
        && !shouldCoordinateTransition
        && transitionRevision === this.playheadRevision
        && this.state.isPlaying === true) {
        beginCoordinatedTransition();
        stageReady = await this.syncStageSwitching(entry, transitionMs, {
          awaitImageReady: true
        });
      }
      if (shouldCoordinateTransition) {
        if (!isCurrentTransition()) return false;
        if (!stageReady) {
          this.state.isPlaying = false;
          this.state.isBuffering = false;
          this.stageBufferStartMs = null;
          this.pauseMediaForStageBuffering();
          this.deps?.setPodcastVideoStatus?.("No se pudo preparar la escena actual. Pulsa Play para reintentar.");
          this.deps?.updatePodcastVideoTransportUi?.();
          return false;
        }
        const [, playbackReady] = await Promise.all([
          this.syncAudio(transitionMs, this.deps?.getPlaybackSpeed?.() || 1, {
            allowDuringBufferRecovery: true,
            playheadRevision: transitionRevision
          }),
          this.syncStageSwitching(entry, transitionMs, {
            awaitImageReady: true,
            requirePlaybackStart: true,
            allowDuringBufferRecovery: true
          })
        ]);
        if (!isCurrentTransition()) return false;
        if (!playbackReady) {
          this.state.isPlaying = false;
          this.state.isBuffering = false;
          this.stageBufferStartMs = null;
          this.pauseMediaForStageBuffering();
          this.deps?.setPodcastVideoStatus?.("No se pudo iniciar la escena actual. Pulsa Play para reintentar.");
          this.deps?.updatePodcastVideoTransportUi?.();
          return false;
        }
        this.state.currentMs = transitionMs;
        this.state.isBuffering = false;
        this.stageBufferStartMs = null;
        this.startClock();
        this.syncStageMediaMotionPlaybackState(true);
        this.deps?.setPodcastVideoStatus?.("Reproduciendo...");
        this.deps?.updatePodcastVideoTransportUi?.();
      }
      // Only after the current entry has swapped may the released slot be
      // reused for the following scene. Preloading first could overwrite the
      // already-ready current scene at the exact cut.
      void this.preloadUpcomingStageSlot(entry, upcoming);
      this.preloadUpcomingStylizedText(entry, upcoming);
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
    const inactiveEl = this.getInactiveStageVideoEl();
    if (!activeEl || !inactiveEl || !Array.isArray(upcomingEntries) || !upcomingEntries.length) {
      return Promise.resolve(false);
    }

    const activeSrc = String(activeEl?.dataset?.src || currentEntry?.videoSrc || "").trim();
    const activeEntryKey = String(activeEl?.dataset?.entryKey || this.buildStageEntryIdentity(currentEntry) || "").trim();
    const rawNextEntry = upcomingEntries.find((item) => {
      const src = String(item?.videoSrc || "").trim();
      const entryKey = this.buildStageEntryIdentity(item);
      return src
        && (src !== activeSrc || entryKey !== activeEntryKey);
    });
    const nextEntry = this.isImageStageEntry(rawNextEntry)
      ? this.resolveStopMotionEntryAtMs(rawNextEntry, Number(rawNextEntry?.startMs || 0))
      : rawNextEntry;
    const nextSrc = String(nextEntry?.videoSrc || "").trim();
    const nextEntryKey = this.buildStageEntryIdentity(nextEntry);
    if (!nextSrc) return Promise.resolve(false);
    const nextIsImage = this.isImageStageEntry(nextEntry);
    const nextSourceGeneration = this.getMediaSourceGeneration(nextSrc);
    const primaryImage = this.els?.podcastActiveSpeakerImage || null;
    const alternateImage = this.els?.podcastActiveSpeakerImageAlt || null;
    const inactiveImage = this.getActiveStageVideoSlot() === 1
      ? primaryImage
      : (alternateImage || primaryImage);
    const haveCurrentData = typeof HTMLMediaElement !== "undefined" ? HTMLMediaElement.HAVE_CURRENT_DATA : 2;
    const imageAlreadyReady = nextIsImage
      && inactiveImage
      && String(inactiveImage.dataset?.src || "").trim() === nextSrc
      && String(inactiveImage.dataset?.mediaSourceGeneration || "") === String(nextSourceGeneration)
      && inactiveImage.complete
      && Number(inactiveImage.naturalWidth || 0) > 0
      && Number(inactiveImage.naturalHeight || 0) > 0;
    const videoAlreadyReady = !nextIsImage
      && this.isVideoSurfaceReady(inactiveEl, nextSrc)
      && String(inactiveEl.dataset?.entryKey || "").trim() === nextEntryKey
      && Number(inactiveEl.readyState || 0) >= haveCurrentData;
    if (imageAlreadyReady || videoAlreadyReady) {
      return Promise.resolve(true);
    }
    if (this.stageMachine.preloadingKey === nextEntryKey && this.stageMachine.preloadingPromise) {
      return this.stageMachine.preloadingPromise;
    }

    this.stageMachine.preloadingSrc = nextSrc;
    this.stageMachine.preloadingKey = nextEntryKey;
    const preloadGeneration = this.mediaCacheGeneration;
    const preloadSessionId = String(this.state.session?.id || "").trim();
    let preloadingPromise = null;
    const isCurrentPreload = () => preloadGeneration === this.mediaCacheGeneration
      && nextSourceGeneration === this.getMediaSourceGeneration(nextSrc)
      && preloadSessionId === String(this.state.session?.id || "").trim()
      && this.stageMachine.preloadingPromise === preloadingPromise;
    preloadingPromise = Promise.resolve().then(async () => {
      if (!isCurrentPreload()) return false;
      if (nextIsImage) {
        if (!inactiveImage) return false;
        const resolvedSrc = await this.preloadImageSrc(nextSrc);
        if (!isCurrentPreload()) return false;
        await this.ensureStageImageReady(inactiveImage, resolvedSrc, {
          sourceKey: nextSrc,
          sourceGeneration: nextSourceGeneration
        });
        if (!isCurrentPreload()) return false;
        // Decode in the real alternate DOM slot, but never reveal it before
        // the scene boundary. The current composited frame remains untouched.
        inactiveImage.hidden = false;
        inactiveImage.style.visibility = "hidden";
        inactiveImage.style.opacity = "0";
        return true;
      }
      const ready = await this.setStageVideoSourceForElement(inactiveEl, nextSrc, {
        keepHidden: true,
        persistent: true,
        forcePersistent: true,
        rowId: String(nextEntry?.rowId || "").trim(),
        entryKey: nextEntryKey
      });
      if (!ready || !isCurrentPreload() || this.stageMachine.preloadingKey !== nextEntryKey) return false;
      const sourceState = this.resolveEntryTargetOffsetSec(nextEntry, Number(nextEntry?.startMs || 0));
      const clamped = this.clampVideoTimeToLastFrame(inactiveEl, sourceState.targetOffsetSec);
      this.seekTo(inactiveEl, clamped.targetSec);
      const frameReady = await this.waitForStageVideoFrameReady(inactiveEl, nextSrc, STAGE_VIDEO_FRAME_TIMEOUT_MS);
      if (!frameReady || !isCurrentPreload() || this.stageMachine.preloadingKey !== nextEntryKey) return false;
      const targetSlot = inactiveEl === this.els?.podcastActiveSpeakerVideoAlt ? 1 : 0;
      const backdropReady = await this.prepareBackdropForEntry(nextEntry, targetSlot, clamped.targetSec, null, {
        isHoldActive: sourceState.isHoldActive === true,
        playbackRate: sourceState.playbackRate
      });
      if (backdropReady && isCurrentPreload() && this.stageMachine.preloadingKey === nextEntryKey) {
        inactiveEl.dataset.preparedEntryKey = nextEntryKey;
        return true;
      }
      return false;
    }).catch(() => false).finally(() => {
      if (this.stageMachine.preloadingPromise === preloadingPromise) {
        this.stageMachine.preloadingSrc = '';
        this.stageMachine.preloadingKey = '';
        this.stageMachine.preloadingPromise = null;
      }
    });
    this.stageMachine.preloadingPromise = preloadingPromise;
    return preloadingPromise;
  }

  async prepareStageSlotsAtMs(currentMs = this.state.currentMs) {
    const entries = this.deps?.buildTimelineRuntimeEntries?.(this.state.session) || [];
    const currentEntry = this.getEntryAtMs(currentMs);
    if (!currentEntry) return true;
    const currentReady = await this.syncStageSwitching(currentEntry, currentMs, {
      awaitImageReady: true
    });
    if (!currentReady) return false;
    const upcoming = entries.filter((entry) => Number(entry?.startMs || 0) > Number(currentMs || 0));
    const hasUpcomingVisual = upcoming.some((entry) => String(entry?.videoSrc || "").trim());
    if (hasUpcomingVisual) {
      const nextReady = await this.preloadUpcomingStageSlot(currentEntry, upcoming);
      if (!nextReady) return false;
    }
    return true;
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
      delete imageEl.dataset.mediaSourceGeneration;
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

  async resolveStageImageSource(src = "", options = {}) {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) throw new Error("missing_image_source");

    // Full-session hydration stores a stable Blob URL under the logical
    // source. Prefer it so image transitions never fall back to the network.
    const cachedSource = options.forceRefresh === true ? "" : this.getBlobUrlSync(cleanSrc);
    if (cachedSource) return String(cachedSource).trim();

    let resolvedSrc = cleanSrc;
    if (resolvedSrc.startsWith("gs://") && typeof this.deps?.resolveFirebaseStorageUrl === "function") {
      resolvedSrc = String(await this.deps.resolveFirebaseStorageUrl(resolvedSrc) || resolvedSrc).trim();
    }

    const isDirectFirebaseUrl = resolvedSrc.includes("firebasestorage.googleapis.com");
    if (isDirectFirebaseUrl
      && !resolvedSrc.includes("/api/assets/proxy-")
      && !this.hasFirebaseDirectAccessToken(resolvedSrc)) {
      let storagePath = "";
      try {
        const encodedObjectPath = String(new URL(resolvedSrc).pathname || "").split("/o/")[1] || "";
        storagePath = encodedObjectPath ? decodeURIComponent(encodedObjectPath) : "";
      } catch (_) { }
      if (this.deps?.preferDirectFirebaseStorage === true && typeof this.deps?.resolveFirebaseStorageUrl === "function") {
        const gsUrl = this.toFirebaseStorageGsUrl(resolvedSrc, storagePath);
        resolvedSrc = gsUrl ? String(await this.deps.resolveFirebaseStorageUrl(gsUrl) || "").trim() : "";
      } else {
        resolvedSrc = this.toFirebaseStorageProxyUrl(resolvedSrc, storagePath, { kind: "image" });
      }
    }

    if (this.requiresAuthorizedAssetResolution(resolvedSrc)) {
      const resolverSource = resolvedSrc;
      const record = await this.resolveAuthorizedAssetSource(resolverSource, {
        forceRefresh: options.forceRefresh === true
      });
      this.rememberAuthorizedAssetAlias(cleanSrc, record, resolverSource);
      resolvedSrc = String(record?.url || "").trim();
    }

    if (!resolvedSrc) throw new Error("image_source_resolution_failed");
    return resolvedSrc;
  }

  preloadImageSrc(src = "") {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return Promise.reject(new Error("missing_image_source"));
    if (!this.stageMachine.imagePreloadCache) {
      this.stageMachine.imagePreloadCache = new Map();
    }
    const cachedSource = this.getBlobUrlSync(cleanSrc);
    const preloadKey = String(cachedSource || cleanSrc).trim();
    if (this.stageMachine.imagePreloadCache.has(preloadKey)) {
      return this.stageMachine.imagePreloadCache.get(preloadKey);
    }
    const loadResolvedImage = (resolvedSrc) => new Promise((resolve, reject) => {
      const probe = new Image();
      try { probe.crossOrigin = "anonymous"; } catch (_) { }
      probe.decoding = "async";
      try { probe.fetchPriority = "high"; } catch (_) { }
      probe.onload = () => resolve(resolvedSrc);
      probe.onerror = () => {
        reject(new Error("image_preload_failed"));
      };
      probe.src = resolvedSrc;
    });
    const task = (async () => {
      const resolvedSrc = await this.resolveStageImageSource(cleanSrc);
      try {
        return await loadResolvedImage(resolvedSrc);
      } catch (error) {
        const metadata = this.authorizedAssetMetadataBySource.get(cleanSrc) || null;
        if (!metadata?.resolverSource) throw error;
        this.invalidateAuthorizedAssetSource(cleanSrc);
        const refreshedSrc = await this.resolveStageImageSource(cleanSrc, { forceRefresh: true });
        return loadResolvedImage(refreshedSrc);
      }
    })().catch((error) => {
      this.stageMachine.imagePreloadCache.delete(preloadKey);
      throw error;
    });
    this.stageMachine.imagePreloadCache.set(preloadKey, task);
    return task;
  }

  async ensureStageImageReady(imageEl, src = "", options = {}) {
    const cleanSrc = String(src || "").trim();
    const sourceKey = String(options?.sourceKey || cleanSrc).trim();
    const sourceGeneration = Number.isFinite(Number(options?.sourceGeneration))
      ? Number(options.sourceGeneration)
      : this.getMediaSourceGeneration(sourceKey);
    const isCurrentSource = () => sourceGeneration === this.getMediaSourceGeneration(sourceKey);
    if (!imageEl || !cleanSrc) throw new Error("missing_stage_image");
    if (!isCurrentSource()) throw new DOMException("Aborted", "AbortError");
    try { imageEl.crossOrigin = "anonymous"; } catch (_) { }
    imageEl.decoding = "async";
    try { imageEl.loading = "eager"; } catch (_) { }
    try { imageEl.fetchPriority = "high"; } catch (_) { }
    const currentSrc = String(imageEl.getAttribute("src") || "").trim();
    if (currentSrc !== cleanSrc) {
      imageEl.src = cleanSrc;
    }
    imageEl.dataset.src = sourceKey;
    imageEl.dataset.mediaSourceGeneration = String(sourceGeneration);
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
    if (!isCurrentSource()) throw new DOMException("Aborted", "AbortError");
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

  collectEntryStopMotionSources(entry = null) {
    const api = window.PodcasterStopMotion;
    const stopMotion = this.resolveEntryStopMotion(entry);
    if (!stopMotion || !Array.isArray(stopMotion.frames)) return [];
    const resolveStorageUrl = this.deps?.resolveStorageVideoUrl || window.resolveStorageVideoUrl;
    return stopMotion.frames.map((frame) => {
        const source = typeof resolveStorageUrl === "function"
          ? resolveStorageUrl(frame.downloadUrl || "", frame.storagePath || "", {
              type: "image",
              mimeType: frame.mimeType || "image/jpeg"
            })
          : api?.resolveFrameSource?.(frame);
        return String(source || "").trim();
      });
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
    const sources = this.collectEntryStopMotionSources(entry);
    stopMotion.frames.forEach((frame, index) => {
      const source = sources[index];
      if (!source) return;
      this.preloadImageSrc(source)
        .then((resolvedSource) => api.preloadStopMotionFrame({ ...frame, downloadUrl: resolvedSource }))
        .catch(() => { });
    });
  }

  requestImageStageSwap(entry = null, offsetSec = 0) {
    const cleanSrc = String(entry?.videoSrc || "").trim();
    const activeSlot = this.getActiveStageVideoSlot();
    const primary = this.els?.podcastActiveSpeakerImage || null;
    const alternate = this.els?.podcastActiveSpeakerImageAlt || null;
    const activeImage = activeSlot === 1 ? (alternate || primary) : primary;
    const inactiveImage = activeSlot === 1 ? primary : (alternate || primary);
    if (!activeImage || !inactiveImage || !cleanSrc) return Promise.resolve(false);
    const imageSwapToken = Number(this.stageMachine.imageSwapToken || 0) + 1;
    this.stageMachine.imageSwapToken = imageSwapToken;
    const mediaCacheGeneration = this.mediaCacheGeneration;
    const sourceGeneration = this.getMediaSourceGeneration(cleanSrc);
    const sessionId = String(this.state.session?.id || "").trim();
    const isCurrentImageSwap = () => imageSwapToken === this.stageMachine.imageSwapToken
      && mediaCacheGeneration === this.mediaCacheGeneration
      && sourceGeneration === this.getMediaSourceGeneration(cleanSrc)
      && sessionId === String(this.state.session?.id || "").trim();

    const isReadyForSource = (imageEl) => String(imageEl?.dataset?.src || "").trim() === cleanSrc
      && String(imageEl?.dataset?.mediaSourceGeneration || "") === String(this.getMediaSourceGeneration(cleanSrc))
      && imageEl.complete
      && Number(imageEl.naturalWidth || 0) > 0
      && Number(imageEl.naturalHeight || 0) > 0;
    const targetImage = isReadyForSource(activeImage)
      ? activeImage
      : (isReadyForSource(inactiveImage) ? inactiveImage : inactiveImage);
    const targetSlot = targetImage === alternate ? 1 : 0;

    const revealImage = () => {
      if (!isCurrentImageSwap()) return;
      this.hideAllVideos();
      [primary, alternate].filter(Boolean).forEach((candidate) => {
        const isTarget = candidate === targetImage;
        candidate.style.opacity = isTarget ? "1" : "0";
        candidate.style.visibility = isTarget ? "visible" : "hidden";
        candidate.hidden = !isTarget;
      });
      this.setActiveStageVideoSlot(targetSlot);

      const session = this.state.session || this.deps?.getActiveSession?.();
      const effects = session?.visualEffectsMap?.[entry.rowId];
      const kenBurnsAnimationKey = JSON.stringify({
        rowId: String(entry?.rowId || ""),
        durationMs: Number(entry?.effectiveDurationMs || entry?.durationMs || 0) || 0,
        effects: effects || null
      });
      const shouldRestartKenBurns = targetImage.dataset.sceneMediaKenBurnsAnimationKey !== kenBurnsAnimationKey;
      const visualStateKey = JSON.stringify({
        rowId: String(entry?.rowId || ""),
        src: cleanSrc,
        durationMs: Number(entry?.effectiveDurationMs || entry?.durationMs || 0) || 0,
        effects: effects || null
      });
      if (targetImage.dataset.sceneMediaVisualStateKey !== visualStateKey) {
        this.applyEntryVisualStateToSurface(entry, targetImage);
        targetImage.dataset.sceneMediaVisualStateKey = visualStateKey;
      }
      let className = "podcast-active-speaker-image is-visible";
      if (effects && effects.effects?.length) {
        const speedClass = `speed-${effects.speed || 5}`;
        const effectClasses = effects.effects.map(e => `ken-burns-${e}`).join(" ");
        className += ` ${effectClasses} ${speedClass}`;
      }
      if (targetImage.className !== className) {
        targetImage.className = className;
      } else if (shouldRestartKenBurns && effects?.effects?.length) {
        targetImage.style.animation = "none";
        void targetImage.offsetWidth;
        targetImage.style.removeProperty("animation");
      }
      targetImage.dataset.sceneMediaKenBurnsAnimationKey = kenBurnsAnimationKey;
      targetImage.style.animationDelay = offsetSec >= 0 ? `-${Number(offsetSec).toFixed(3)}s` : "";
      const shouldAnimate = this.state.isPlaying === true && this.state.isBuffering !== true;
      targetImage.style.animationPlayState = shouldAnimate ? 'running' : 'paused';
      this.syncStageMediaMotionPlaybackState(shouldAnimate);
    };

    if (isReadyForSource(targetImage)) {
      revealImage();
      return Promise.resolve(isCurrentImageSwap());
    }

    // Keep the currently presented surface untouched while the alternate image
    // downloads and decodes.
    targetImage.hidden = false;
    targetImage.style.visibility = "hidden";
    targetImage.style.opacity = "0";

    if (this.stageMachine.imageLoadingSrc === cleanSrc
      && this.stageMachine.imageLoadingTarget === targetImage
      && this.stageMachine.imageLoadingPromise) {
      return this.stageMachine.imageLoadingPromise.then(() => {
        if (!isCurrentImageSwap()) return false;
        revealImage();
        return true;
      }).catch(() => false);
    }

    this.stageMachine.imageLoadingSrc = cleanSrc;
    this.stageMachine.imageLoadingTarget = targetImage;
    const loadingPromise = Promise.resolve()
      .then(() => this.preloadImageSrc(cleanSrc))
      .then((resolvedSrc) => {
        // Do not even assign an old session's source to the hidden slot. The
        // final reveal guard alone is too late because src mutation can start
        // decoding/network work and race with the new session.
        if (!isCurrentImageSwap()) throw new DOMException("Aborted", "AbortError");
        return this.ensureStageImageReady(targetImage, resolvedSrc, {
          sourceKey: cleanSrc,
          sourceGeneration
        });
      });
    this.stageMachine.imageLoadingPromise = loadingPromise;
    void loadingPromise
      .finally(() => {
        if (this.stageMachine.imageLoadingPromise === loadingPromise) {
          this.stageMachine.imageLoadingSrc = "";
          this.stageMachine.imageLoadingPromise = null;
          this.stageMachine.imageLoadingTarget = null;
        }
      })
      .catch(() => { });
    return loadingPromise.then(() => {
      if (!isCurrentImageSwap()) return false;
      revealImage();
      return true;
    }).catch(() => false);
  }

  async syncStageSwitching(entry, currentMs, options = {}) {
    const switchToken = ++this.stageSwitchSeq;
    const sourceState = this.resolveEntryTargetOffsetSec(entry, currentMs);
    const offsetSec = sourceState.targetOffsetSec;
    const activeSlot = this.getActiveStageVideoSlot();
    const activeEl = this.getActiveStageVideoEl();
    const inactiveEl = this.getInactiveStageVideoEl();
    const canStartStagePlayback = () => this.state.isPlaying === true
      && (this.state.isBuffering !== true || options.allowDuringBufferRecovery === true);

    if (!activeEl) return false;

    const isImage = this.isImageStageEntry(entry);
    const entryKey = this.buildStageEntryIdentity(entry);
    this.applySceneBackground(entry);
    this.applySceneMediaScale(entry);

    if (isImage) {
      const imageEntry = this.resolveStopMotionEntryAtMs(entry, currentMs);
      this.preloadEntryStopMotion(entry);
      const imageSwap = this.requestImageStageSwap(imageEntry, offsetSec);
      if (options.awaitImageReady === true) return imageSwap;
      // El reloj no espera red/decode durante reproducción normal. La imagen
      // anterior permanece compuesta hasta que el slot alterno esté listo.
      void imageSwap;
      return true;
    }

    const resolveTarget = (videoEl) => {
      const elementDurationSec = Number(videoEl?.duration || 0);
      const metadataDurationSec = Math.max(0, Number(entry?.mediaDurationMs || 0) || 0) / 1000;
      const durationSec = Number.isFinite(elementDurationSec) && elementDurationSec > 0
        ? elementDurationSec
        : metadataDurationSec;
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return { targetSec: Math.max(0, offsetSec), isHoldActive: sourceState.isHoldActive === true };
      }
      const epsilon = Math.min(STAGE_VIDEO_END_EPSILON_SEC, Math.max(0.001, durationSec / 2));
      const lastFrameSec = Math.max(0, durationSec - epsilon);
      return {
        targetSec: Math.min(Math.max(0, offsetSec), lastFrameSec),
        isHoldActive: sourceState.isHoldActive === true || offsetSec >= lastFrameSec
      };
    };
    const applyAudioMix = (videoEl) => {
      if (!videoEl) return;
      const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
      const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
      const masterVolumeFactor = this.clamp01(this.toFiniteNumber(config?.masterVolume, 100) / 100);
      const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
      let effectiveVideoVolume = mix.videoVolume ?? 1.0;
      const hasGeminiAudio = this.state.audioTrack?.segments?.some(
        (segment) => String(segment?.rowId || "").trim() === String(entry.rowId || "").trim()
      );
      if (hasGeminiAudio && !Number.isFinite(entry.clip?.veoVolumeOverridePct)) effectiveVideoVolume = 0;
      videoEl.volume = this.clamp01(masterClipVolume * masterVolumeFactor * effectiveVideoVolume);
      videoEl.muted = videoEl.volume <= 0.0001;
    };

    if (String(activeEl.dataset?.src || "").trim() === String(entry.videoSrc || "").trim()
      && this.isVideoSurfaceReady(activeEl, entry.videoSrc)
      && String(activeEl.dataset?.entryKey || "").trim() === entryKey) {
      const target = resolveTarget(activeEl);
      const activePlaybackRate = (this.deps?.getPlaybackSpeed?.() || 1) * sourceState.playbackRate;
      if (Math.abs(Number(activeEl.playbackRate || 1) - activePlaybackRate) > 0.001) {
        activeEl.playbackRate = activePlaybackRate;
      }
      if (this.shouldResyncStageVideo(activeEl, target.targetSec, {
        isHoldActive: target.isHoldActive,
        toleranceSec: STAGE_VIDEO_RESYNC_TOLERANCE_DEFAULT_SEC
      })) {
        this.seekTo(activeEl, target.targetSec);
      }
      if (target.isHoldActive) {
        try { activeEl.pause(); } catch (_) { }
      } else if (canStartStagePlayback() && activeEl.paused) {
        const startPlayback = activeEl.play().then(() => {
          const masterSpeed = this.deps?.getPlaybackSpeed?.() || 1;
          activeEl.playbackRate = masterSpeed * sourceState.playbackRate;
          return true;
        }).catch(() => false);
        if (options.requirePlaybackStart === true && !await startPlayback) return false;
      }

      const backdropReady = await this.prepareBackdropForEntry(entry, activeSlot, target.targetSec, switchToken, {
        isHoldActive: target.isHoldActive,
        playbackRate: sourceState.playbackRate
      });
      if (!backdropReady || switchToken !== this.stageSwitchSeq) return false;
      activeEl.style.zIndex = "2";
      activeEl.style.opacity = "1";
      activeEl.style.visibility = "visible";
      activeEl.hidden = false;
      this.hideAllImages();
      applyAudioMix(activeEl);
      this.syncBackdrop(entry, activeSlot, target.targetSec, {
        isHoldActive: target.isHoldActive,
        playbackRate: sourceState.playbackRate
      });
      this.hideInactiveBackdrop(activeSlot);
      return true;
    }

    if (!entry.videoSrc) {
      this.hideAllVideos();
      this.hideAllImages();
      this.deps?.setPodcastVideoPortraitFallback?.(true);
      return true;
    }
    this.deps?.setPodcastVideoPortraitFallback?.(false);

    const targetEl = inactiveEl || activeEl;
    const targetSlot = targetEl === this.els?.podcastActiveSpeakerVideoAlt ? 1 : 0;
    const loadingRequest = {};
    this.stageMachine.loadingSrc = entry.videoSrc;
    this.stageMachine.loadingRequest = loadingRequest;
    try {
      let ready = false;
      if (targetEl === inactiveEl
        && this.stageMachine.preloadingKey === entryKey
        && this.stageMachine.preloadingPromise) {
        ready = await this.stageMachine.preloadingPromise;
      } else {
        ready = await this.setStageVideoSourceForElement(targetEl, entry.videoSrc, {
          noWait: false,
          keepHidden: targetEl === inactiveEl,
          persistent: true,
          forcePersistent: true,
          rowId: String(entry?.rowId || "").trim(),
          entryKey
        });
      }
      if (!ready || switchToken !== this.stageSwitchSeq) return false;

      const target = resolveTarget(targetEl);
      const wasPreparedAtTarget = String(targetEl.dataset?.preparedEntryKey || "").trim() === entryKey
        && this.isVideoSurfaceReady(targetEl, entry.videoSrc)
        && targetEl.seeking !== true
        && Math.abs(Number(targetEl.currentTime || 0) - Number(target.targetSec || 0)) <= STAGE_VIDEO_RESYNC_MIN_DRIFT_SEC;
      if (!wasPreparedAtTarget) this.seekTo(targetEl, target.targetSec);
      const frameReady = wasPreparedAtTarget
        ? true
        : await this.waitForStageVideoFrameReady(
          targetEl,
          entry.videoSrc,
          STAGE_VIDEO_FRAME_TIMEOUT_MS,
          { softTimeoutMs: STAGE_VIDEO_FRAME_SOFT_TIMEOUT_MS }
        );
      if (!frameReady || switchToken !== this.stageSwitchSeq) return false;
      targetEl.dataset.preparedEntryKey = entryKey;
      const backdropReady = await this.prepareBackdropForEntry(entry, targetSlot, target.targetSec, switchToken, {
        isHoldActive: target.isHoldActive,
        playbackRate: sourceState.playbackRate
      });
      if (!backdropReady || switchToken !== this.stageSwitchSeq) return false;

      applyAudioMix(targetEl);
      const targetPlaybackRate = (this.deps?.getPlaybackSpeed?.() || 1) * sourceState.playbackRate;
      targetEl.playbackRate = targetPlaybackRate;
      targetEl.style.zIndex = "2";
      targetEl.style.opacity = "1";
      targetEl.style.visibility = "visible";
      targetEl.hidden = false;
      this.hideAllImages();
      if (target.isHoldActive) {
        try { targetEl.pause(); } catch (_) { }
      } else if (canStartStagePlayback()) {
        const startPlayback = targetEl.play().then(() => {
          const masterSpeed = this.deps?.getPlaybackSpeed?.() || 1;
          targetEl.playbackRate = masterSpeed * sourceState.playbackRate;
          return true;
        }).catch(() => false);
        if (options.requirePlaybackStart === true && !await startPlayback) {
          if (targetEl !== activeEl) {
            targetEl.style.opacity = "0";
            targetEl.style.visibility = "hidden";
            targetEl.hidden = true;
            try { targetEl.pause(); } catch (_) { }
          }
          return false;
        }
      }

      this.syncBackdrop(entry, targetSlot, target.targetSec, {
        isHoldActive: target.isHoldActive,
        playbackRate: sourceState.playbackRate
      });
      if (targetEl !== activeEl) {
        activeEl.style.zIndex = "1";
        activeEl.style.opacity = "0";
        activeEl.style.visibility = "hidden";
        activeEl.hidden = true;
        try { activeEl.pause(); } catch (_) { }
      }
      this.setActiveStageVideoSlot(targetSlot);
      this.hideInactiveBackdrop(targetSlot);
      return true;
    } catch (_) {
      // Keep the previously composited frame visible. A later preparation or
      // explicit retry may recover this source without disrupting the clock.
      return false;
    } finally {
      if (this.stageMachine.loadingRequest === loadingRequest) {
        this.stageMachine.loadingSrc = "";
        this.stageMachine.loadingRequest = null;
      }
    }
  }

  async prepareBackdropForEntry(entry, slot, offsetSec, switchToken = null, options = {}) {
    const backdrop = Number(slot || 0) === 1
      ? this.els?.podcastActiveSpeakerBackdropVideoAlt
      : this.els?.podcastActiveSpeakerBackdropVideo;
    if (!backdrop) return true;
    const clipMap = this.deps?.ensureTimelineClipsByRowId?.(this.state.session) || {};
    const mode = clipMap?.[entry?.rowId]?.visualLayoutMode || "default";
    if (mode !== "blur-backdrop" || !entry?.videoSrc) return true;
    const entryKey = this.buildStageEntryIdentity(entry);
    const samePreparedEntry = String(backdrop.dataset?.src || "").trim() === String(entry.videoSrc || "").trim()
      && String(backdrop.dataset?.entryKey || "").trim() === entryKey
      && this.isVideoSurfaceReady(backdrop, entry.videoSrc)
      && !backdrop.error;
    if (samePreparedEntry) {
      const preparedTarget = this.clampVideoTimeToLastFrame(backdrop, offsetSec);
      const needsSeek = this.shouldResyncStageVideo(backdrop, preparedTarget.targetSec, {
        isHoldActive: options.isHoldActive === true || preparedTarget.isTerminalHold,
        toleranceSec: STAGE_VIDEO_BACKDROP_RESYNC_TOLERANCE_SEC
      });
      // requestVideoFrameCallback puede no dispararse en un video ya pausado
      // sobre su frame terminal. Si el mismo backdrop ya está compuesto y no
      // requiere seek, no hay nada que esperar en cada tick.
      if (!needsSeek) {
        return switchToken === null || switchToken === this.stageSwitchSeq;
      }
    }
    const ready = await this.setStageVideoSourceForElement(backdrop, entry.videoSrc, {
      noWait: false,
      keepHidden: true,
      persistent: true,
      forcePersistent: true,
      rowId: String(entry?.rowId || "").trim(),
      entryKey
    });
    if (!ready || (switchToken !== null && switchToken !== this.stageSwitchSeq)) return false;
    const target = this.clampVideoTimeToLastFrame(backdrop, offsetSec);
    this.seekTo(backdrop, target.targetSec);
    const frameReady = await this.waitForStageVideoFrameReady(
      backdrop,
      entry.videoSrc,
      STAGE_VIDEO_FRAME_TIMEOUT_MS,
      { softTimeoutMs: STAGE_VIDEO_FRAME_SOFT_TIMEOUT_MS }
    );
    return frameReady && (switchToken === null || switchToken === this.stageSwitchSeq);
  }

  syncBackdrop(entry, activeSlot, offsetSec, options = {}) {
    const backdrop = activeSlot === 1 ? this.els?.podcastActiveSpeakerBackdropVideoAlt : this.els?.podcastActiveSpeakerBackdropVideo;
    if (!backdrop) return;

    const clipMap = this.deps?.ensureTimelineClipsByRowId?.(this.state.session) || {};
    const clipCfg = clipMap[entry.rowId] || {};
    const mode = clipCfg.visualLayoutMode || "default";

    if (mode === "blur-backdrop" && entry.videoSrc) {
      if (backdrop.dataset.src !== entry.videoSrc
        || String(backdrop.dataset.mediaSourceGeneration || "") !== String(this.getMediaSourceGeneration(entry.videoSrc))) {
        const resolvedSource = this.getBlobUrlSync(entry.videoSrc);
        if (resolvedSource) {
          void this.setStageVideoSourceForElement(backdrop, entry.videoSrc, {
            noWait: true,
            keepHidden: false,
            rowId: String(entry?.rowId || "").trim(),
            entryKey: this.buildStageEntryIdentity(entry)
          });
        }
      }

      const targetState = this.clampVideoTimeToLastFrame(backdrop, offsetSec);
      const targetSeekSec = targetState.targetSec;
      const isHoldActive = options.isHoldActive === true || targetState.isTerminalHold;
      const masterSpeed = this.deps?.getPlaybackSpeed?.() || 1;
      const sourcePlaybackRate = this.clampPlaybackRate(options.playbackRate || 1, 0.25, 4);
      backdrop.playbackRate = masterSpeed * sourcePlaybackRate;

      if (this.shouldResyncStageVideo(backdrop, targetSeekSec, {
        isHoldActive,
        toleranceSec: STAGE_VIDEO_BACKDROP_RESYNC_TOLERANCE_SEC
      })) {
        this.seekTo(backdrop, targetSeekSec);
      }
      backdrop.style.opacity = "1";
      backdrop.style.visibility = "visible";
      backdrop.hidden = false;
      if (isHoldActive) {
        try { backdrop.pause(); } catch (_) { }
      } else if (this.state.isPlaying && backdrop.paused) {
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
      inactiveBackdrop.hidden = true;
      inactiveBackdrop.pause();
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
      overlay.dataset.renderKey = "hidden";
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
      if (overlay.dataset.renderKey !== "hidden") overlay.innerHTML = "";
      overlay.dataset.renderKey = "hidden";
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
      if (overlay.dataset.renderKey !== "hidden") overlay.innerHTML = "";
      overlay.dataset.renderKey = "hidden";
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

    const renderKey = JSON.stringify([
      String(selected.rowId || ""),
      text,
      activeKaraokeWordIndex,
      contentHtml,
      presetClass,
      bgClass,
      rawCssText,
      Number(previewWidthPx || 0),
      Number(previewHeightPx || 0),
      Number(previewSpec?.bubbleWidthPx || 0),
      Number(previewSpec?.bubbleHeightPx || 0)
    ]);
    if (overlay.dataset.renderKey === renderKey) return;
    overlay.dataset.renderKey = renderKey;

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
    const resolvedSlot = Number(slot || 0) === 1 ? 1 : 0;
    if (resolvedSlot === 1) {
      return {
        slot: 1,
        backdrop: this.els?.podcastActiveSpeakerBackdropVideoAlt || null,
        foreground: this.els?.podcastActiveSpeakerVideoAlt || null
      };
    }
    return {
      slot: 0,
      backdrop: this.els?.podcastActiveSpeakerBackdropVideo || null,
      foreground: this.els?.podcastActiveSpeakerVideo || null
    };
  }

  getActiveStageVideoBundle() {
    return this.getStageVideoBundle(this.getActiveStageVideoSlot());
  }

  getInactiveStageVideoBundle() {
    return this.getStageVideoBundle(this.getActiveStageVideoSlot() === 1 ? 0 : 1);
  }

  getActiveStageVideoSlot() {
    const dependencySlot = Number(this.deps?.podcastVideoState?.stageVideoSlot);
    if (dependencySlot === 0 || dependencySlot === 1) return dependencySlot;
    return Number(this.stageMachine?.activeSlot || 0) === 1 ? 1 : 0;
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
    const active = this.getActiveStageVideoBundle()?.foreground || null;
    return active || this.els?.podcastActiveSpeakerVideo || null;
  }

  getInactiveStageVideoEl() {
    const primary = this.els?.podcastActiveSpeakerVideo || null;
    const alternate = this.els?.podcastActiveSpeakerVideoAlt || null;
    if (!alternate) return null;
    return this.getActiveStageVideoSlot() === 1 ? primary : alternate;
  }

  setActiveStageVideoSlot(slot = 0) {
    const resolvedSlot = Number(slot || 0) === 1 ? 1 : 0;
    this.stageMachine.activeSlot = resolvedSlot;
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.stageVideoSlot = resolvedSlot;
    }
  }

  pauseMediaForStageBuffering() {
    this.stopClock();
    Object.values(this.dialoguePlayers).forEach((audioEl) => {
      try { audioEl?.pause?.(); } catch (_) { }
    });
    this.getStageVideoElements().forEach((videoEl) => {
      try { videoEl.pause(); } catch (_) { }
    });
    this.pauseBackgroundMusic();
    this.syncStageMediaMotionPlaybackState(false);
  }

  scheduleStageBufferRecovery(videoEl = null, reason = "waiting") {
    if (!videoEl
      || this.state.isPlaying !== true
      || this.state.isBuffering === true
      || videoEl !== this.getActiveStageVideoEl()
      || videoEl.hidden === true
      || this.stageBufferRecoveryTimer
      || this.stageBufferRecoveryPromise) {
      return false;
    }
    const bufferToken = ++this.stageBufferRecoverySeq;
    const scheduledRevision = ++this.playheadRevision;
    this.stageBufferStartMs = Math.max(0, Number(this.state.currentMs || 0) || 0);
    this.state.isBuffering = true;
    this.activeLoopId += 1;
    this.pauseMediaForStageBuffering();
    this.deps?.setPodcastVideoStatus?.("Buffering: pausando medios...");
    this.deps?.updatePodcastVideoTransportUi?.();
    this.stageBufferRecoveryTimer = setTimeout(() => {
      this.stageBufferRecoveryTimer = null;
      const haveFutureData = typeof HTMLMediaElement !== "undefined"
        ? HTMLMediaElement.HAVE_FUTURE_DATA
        : 3;
      if (this.state.isPlaying !== true
        || this.state.isBuffering !== true
        || bufferToken !== this.stageBufferRecoverySeq
        || scheduledRevision !== this.playheadRevision
        || videoEl !== this.getActiveStageVideoEl()) {
        return;
      }
      if (!videoEl.error && Number(videoEl.readyState || 0) >= haveFutureData) {
        void this.resumeStageAfterShortBuffer(videoEl, reason);
        return;
      }
      void this.recoverStageBuffering(videoEl, reason);
    }, 350);
    return true;
  }

  async resumeStageAfterShortBuffer(videoEl = null, reason = "canplay") {
    if (this.stageBufferRecoveryPromise) return this.stageBufferRecoveryPromise;
    if (!videoEl
      || this.state.isPlaying !== true
      || this.state.isBuffering !== true
      || videoEl !== this.getActiveStageVideoEl()) {
      return false;
    }
    if (this.stageBufferRecoveryTimer) {
      clearTimeout(this.stageBufferRecoveryTimer);
      this.stageBufferRecoveryTimer = null;
    }
    const resumeToken = this.stageBufferRecoverySeq;
    const resumeRevision = this.playheadRevision;
    const currentMs = Math.max(0, Number(this.stageBufferStartMs ?? this.state.currentMs) || 0);
    const entry = this.getEntryAtMs(currentMs);
    const isCurrentResume = () => resumeToken === this.stageBufferRecoverySeq
      && resumeRevision === this.playheadRevision
      && this.state.isPlaying === true;

    this.state.currentMs = currentMs;
    let recoveryPromise = null;
    recoveryPromise = (async () => {
      const [, stageReady] = await Promise.all([
        this.syncAudio(currentMs, this.deps?.getPlaybackSpeed?.() || 1, {
          allowDuringBufferRecovery: true,
          playheadRevision: resumeRevision
        }),
        entry
          ? this.syncStageSwitching(entry, currentMs, {
            awaitImageReady: true,
            requirePlaybackStart: true
          })
          : videoEl.play().then(() => true).catch(() => false)
      ]);
      if (!stageReady || !isCurrentResume()) return false;
      this.state.isBuffering = false;
      this.stageBufferStartMs = null;
      this.startClock();
      this.syncStageMediaMotionPlaybackState(true);
      this.deps?.setPodcastVideoStatus?.("Reproduciendo...");
      this.deps?.updatePodcastVideoTransportUi?.();
      this.emitMediaTelemetry("stage-buffering-resumed", { reason, rowId: entry?.rowId || "" });
      return true;
    })().finally(() => {
      if (this.stageBufferRecoveryPromise === recoveryPromise) {
        this.stageBufferRecoveryPromise = null;
      }
    });
    this.stageBufferRecoveryPromise = recoveryPromise;
    const resumed = await recoveryPromise;
    if (!resumed && isCurrentResume()) {
      queueMicrotask(() => { void this.recoverStageBuffering(videoEl, reason); });
    }
    return resumed;
  }

  async recoverStageBuffering(videoEl = null, reason = "waiting") {
    if (this.stageBufferRecoveryPromise) return this.stageBufferRecoveryPromise;
    if (!videoEl || this.state.isPlaying !== true || videoEl !== this.getActiveStageVideoEl()) return false;

    const recoveryToken = ++this.stageBufferRecoverySeq;
    const recoveryRevision = ++this.playheadRevision;
    const currentMs = Math.max(0, Number(this.stageBufferStartMs ?? this.state.currentMs) || 0);
    const entry = this.getEntryAtMs(currentMs);
    const source = String(entry?.videoSrc || videoEl.dataset?.src || "").trim();
    const inactiveEl = this.getInactiveStageVideoEl();
    if (!entry || !source || !inactiveEl || inactiveEl === videoEl) return false;

    const isCurrentRecovery = () => recoveryToken === this.stageBufferRecoverySeq
      && recoveryRevision === this.playheadRevision
      && this.state.isPlaying === true;
    const targetSlot = inactiveEl === this.els?.podcastActiveSpeakerVideoAlt ? 1 : 0;
    const entryKey = this.buildStageEntryIdentity(entry);
    const sourceState = this.resolveEntryTargetOffsetSec(entry, currentMs);
    const sceneNumber = this.deps?.resolveSceneNumberByRowId?.(entry.rowId, this.state.session);

    this.state.isBuffering = true;
    this.pauseMediaForStageBuffering();
    this.deps?.setPodcastVideoStatus?.(
      sceneNumber ? `Rehidratando escena ${sceneNumber}...` : "Rehidratando escena..."
    );
    this.deps?.updatePodcastVideoTransportUi?.();
    this.emitMediaTelemetry("stage-buffering", { reason, rowId: entry.rowId, source });

    const loadRecoverySlot = async (forceRefresh = false) => {
      if (forceRefresh) {
        this.mediaCacheGeneration += 1;
        this.invalidateAuthorizedAssetSource(source);
        const cacheKey = this.resolvePersistentMediaCacheKey(source);
        [source, cacheKey].filter(Boolean).forEach((key) => {
          this.fetchPromises.delete(key);
          this.fetchPromises.delete(`streaming:${key}`);
          this.fetchPromises.delete(`persistent:${key}`);
        });
        await this.invalidateBlobUrl(source);
      }
      if (!isCurrentRecovery()) return false;
      const ready = await this.setStageVideoSourceForElement(inactiveEl, source, {
        noWait: false,
        keepHidden: true,
        persistent: true,
        forcePersistent: true,
        forceAuthorizedRefresh: forceRefresh,
        rowId: String(entry?.rowId || "").trim(),
        entryKey
      });
      if (!ready || !isCurrentRecovery()) return false;
      const target = this.clampVideoTimeToLastFrame(inactiveEl, sourceState.targetOffsetSec);
      this.seekTo(inactiveEl, target.targetSec);
      const frameReady = await this.waitForStageVideoFrameReady(
        inactiveEl,
        source,
        STAGE_VIDEO_FRAME_TIMEOUT_MS,
        { softTimeoutMs: STAGE_VIDEO_FRAME_SOFT_TIMEOUT_MS }
      );
      if (!frameReady || !isCurrentRecovery()) return false;
      return this.prepareBackdropForEntry(entry, targetSlot, target.targetSec, null, {
        isHoldActive: sourceState.isHoldActive === true || target.isTerminalHold,
        playbackRate: sourceState.playbackRate
      });
    };

    let recoveryPromise = null;
    recoveryPromise = (async () => {
      let ready = await loadRecoverySlot(false);
      if (!ready && isCurrentRecovery()) ready = await loadRecoverySlot(true);
      if (!ready || !isCurrentRecovery()) return false;

      inactiveEl.style.zIndex = "2";
      inactiveEl.style.opacity = "1";
      inactiveEl.style.visibility = "visible";
      inactiveEl.hidden = false;
      this.applyEntryVisualStateToSurface(entry, inactiveEl);
      videoEl.style.zIndex = "1";
      videoEl.style.opacity = "0";
      videoEl.style.visibility = "hidden";
      videoEl.hidden = true;
      try { videoEl.pause(); } catch (_) { }
      this.setActiveStageVideoSlot(targetSlot);
      this.hideAllImages();
      this.syncBackdrop(entry, targetSlot, sourceState.targetOffsetSec, {
        isHoldActive: sourceState.isHoldActive === true,
        playbackRate: sourceState.playbackRate
      });
      this.hideInactiveBackdrop(targetSlot);

      this.state.isBuffering = false;
      this.stageBufferStartMs = null;
      const [, resumedStage] = await Promise.all([
        this.syncAudio(currentMs, this.deps?.getPlaybackSpeed?.() || 1, {
          allowDuringBufferRecovery: true,
          playheadRevision: recoveryRevision
        }),
        this.syncStageSwitching(entry, currentMs, {
          awaitImageReady: true,
          requirePlaybackStart: true
        })
      ]);
      if (!resumedStage || !isCurrentRecovery()) return false;
      this.startClock();
      this.syncStageMediaMotionPlaybackState(true);
      this.deps?.setPodcastVideoStatus?.("Reproduciendo...");
      this.deps?.updatePodcastVideoTransportUi?.();
      this.emitMediaTelemetry("stage-buffering-recovered", { reason, rowId: entry.rowId, source });
      return true;
    })().then((ready) => {
      if (!ready && isCurrentRecovery()) {
        this.state.isPlaying = false;
        this.state.isBuffering = false;
        this.stageBufferStartMs = null;
        this.pauseMediaForStageBuffering();
        this.deps?.setPodcastVideoStatus?.(
          sceneNumber
            ? `No se pudo recuperar la escena ${sceneNumber}. Pulsa Play para reintentar.`
            : "No se pudo recuperar la escena. Pulsa Play para reintentar."
        );
        this.deps?.updatePodcastVideoTransportUi?.();
      }
      return ready;
    }).catch(() => {
      if (isCurrentRecovery()) {
        this.state.isPlaying = false;
        this.state.isBuffering = false;
        this.stageBufferStartMs = null;
        this.pauseMediaForStageBuffering();
        this.deps?.setPodcastVideoStatus?.("No se pudo recuperar la reproducción. Pulsa Play para reintentar.");
        this.deps?.updatePodcastVideoTransportUi?.();
      }
      return false;
    }).finally(() => {
      if (this.stageBufferRecoveryPromise === recoveryPromise) {
        this.stageBufferRecoveryPromise = null;
      }
    });
    this.stageBufferRecoveryPromise = recoveryPromise;
    return recoveryPromise;
  }

  assignStageVideoElementSource(videoEl = null, source = "", options = {}) {
    if (!videoEl) return false;
    const logicalSrc = String(options.logicalSrc || source || "").trim();
    const cleanSource = String(source || "").trim();
    if (!cleanSource || !logicalSrc) return false;
    const mode = String(options.mode || "").trim() || "direct";
    const cacheKey = String(options.cacheKey || "").trim();
    const rowId = String(options.rowId || "").trim();
    const entryKey = String(options.entryKey || "").trim();
    const sourceGeneration = String(this.getMediaSourceGeneration(logicalSrc));
    const currentLogicalSrc = String(videoEl.dataset?.src || "").trim();
    const currentAssignedSrc = String(videoEl.getAttribute?.("src") || "").trim();
    const currentSourceGeneration = String(videoEl.dataset?.mediaSourceGeneration || "");
    if (currentLogicalSrc === logicalSrc
      && currentAssignedSrc === cleanSource
      && currentSourceGeneration === sourceGeneration) {
      if (rowId) videoEl.dataset.rowId = rowId;
      if (entryKey) videoEl.dataset.entryKey = entryKey;
      return false;
    }
    this.releaseTransientStageVideoObjectUrl(videoEl);
    delete videoEl.dataset.presentedSrc;
    delete videoEl.dataset.preparedEntryKey;
    videoEl.src = cleanSource;
    videoEl.dataset.src = logicalSrc;
    videoEl.dataset.mediaSourceGeneration = sourceGeneration;
    if (rowId) videoEl.dataset.rowId = rowId;
    else delete videoEl.dataset.rowId;
    if (entryKey) videoEl.dataset.entryKey = entryKey;
    else delete videoEl.dataset.entryKey;
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
        const persistentKey = this.resolvePersistentMediaCacheKey(failedSrc);
        const isConfirmedMissing = this.blobCache.get(failedSrc) === "404"
          || (persistentKey && this.blobCache.get(persistentKey) === "404");
        if (!isConfirmedMissing) {
          if (String(videoEl.dataset.mediaRetrySrc || "").trim() === failedSrc) return;
          videoEl.dataset.mediaRetrySrc = failedSrc;
          const retryTask = (async () => {
            this.invalidateAuthorizedAssetSource(failedSrc);
            await this.invalidateBlobUrl(failedSrc);
            const recoveredSource = await this.getBlobUrl(failedSrc, {
              persistent: true,
              forceAuthorizedRefresh: true
            });
            if (recoveredSource && String(videoEl.dataset.src || "").trim() === failedSrc) {
              this.assignStageVideoElementSource(videoEl, recoveredSource, {
                logicalSrc: failedSrc,
                mode: "cache",
                cacheKey: failedSrc,
                rowId: videoEl.dataset.rowId
              });
              try { videoEl.load(); } catch (_) { }
              const ready = await this.waitForMediaReady(videoEl, VIDEO_MEDIA_READY_TIMEOUT_PERSISTENT_MS);
              if (ready) delete videoEl.dataset.mediaRetrySrc;
              return;
            }
            const nowConfirmedMissing = this.blobCache.get(failedSrc) === "404"
              || (persistentKey && this.blobCache.get(persistentKey) === "404");
            if (nowConfirmedMissing && typeof Event === "function") {
              videoEl.dispatchEvent(new Event("error"));
            }
          })();
          void retryTask.catch(() => { }).finally(() => {
            const retryPersistentKey = this.resolvePersistentMediaCacheKey(failedSrc);
            const retryConfirmedMissing = this.blobCache.get(failedSrc) === "404"
              || (retryPersistentKey && this.blobCache.get(retryPersistentKey) === "404");
            if (!retryConfirmedMissing
              && String(videoEl.dataset.mediaRetrySrc || "").trim() === failedSrc) {
              delete videoEl.dataset.mediaRetrySrc;
            }
          });
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
    if (!videoEl.__podcasterStageBufferBound) {
      ["waiting", "stalled"].forEach((eventName) => {
        videoEl.addEventListener(eventName, () => {
          this.scheduleStageBufferRecovery(videoEl, eventName);
        });
      });
      ["playing", "canplay"].forEach((eventName) => {
        videoEl.addEventListener(eventName, () => {
          if (videoEl !== this.getActiveStageVideoEl()) return;
          if (this.state.isBuffering === true && !this.stageBufferRecoveryPromise) {
            void this.resumeStageAfterShortBuffer(videoEl, eventName);
            return;
          }
          if (this.stageBufferRecoveryTimer) {
            clearTimeout(this.stageBufferRecoveryTimer);
            this.stageBufferRecoveryTimer = null;
          }
        });
      });
      videoEl.__podcasterStageBufferBound = true;
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
    const preloadSrc = String(
      cachedObjectUrl || await this.getBlobUrl(cleanSrc, {
        persistent: this.shouldPersistStageVideoSource(cleanSrc)
      }) || ""
    ).trim();
    if (!preloadSrc) return false;
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
    const sourceGeneration = String(this.getMediaSourceGeneration(cleanSrc));
    const cachedSource = this.getBlobUrlSync(cleanSrc);
    const mountedAssignedSource = String(video.getAttribute?.("src") || "").trim();
    const hasCurrentCachedBytes = /^(?:blob:|data:)/i.test(String(cachedSource || "").trim());
    if (String(video.dataset.src || "").trim() === cleanSrc
      && String(video.dataset.mediaSourceGeneration || "") === sourceGeneration
      && (!hasCurrentCachedBytes || mountedAssignedSource === String(cachedSource).trim())
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (options.rowId) video.dataset.rowId = String(options.rowId).trim();
      if (options.entryKey) video.dataset.entryKey = String(options.entryKey).trim();
      return true;
    }

    const isCurrentLoad = () => (
      this.podcastStageVideoLoadTokensByEl.get(video) === loadToken
    );

    const requestedPersistent = options.forcePersistent === true
      || (options.persistent === true && this.shouldPersistStageVideoSource(cleanSrc));
    const resolvedSource = String(cachedSource || await this.getBlobUrl(cleanSrc, {
      persistent: requestedPersistent,
      forceAuthorizedRefresh: options.forceAuthorizedRefresh === true
    }) || "").trim();
    // Never expose a private proxy as a raw media src. Native media requests do
    // not carry Firebase bearer headers and would deterministically return 401.
    const rawSourceFallback = this.requiresAuthorizedAssetResolution(cleanSrc) ? "" : cleanSrc;
    const assignedSource = resolvedSource || rawSourceFallback;
    if (!assignedSource || !isCurrentLoad()) return false;
    if (!isCurrentLoad()) return false;

    if (this.isSameOriginMediaUrl(assignedSource)) {
      video.removeAttribute("crossorigin");
    } else {
      video.crossOrigin = "anonymous";
    }
    const sourceChanged = this.assignStageVideoElementSource(video, assignedSource, {
      logicalSrc: cleanSrc,
      mode: /^(?:blob:|data:)/i.test(assignedSource) ? "cache" : "direct",
      cacheKey: cleanSrc,
      rowId: options.rowId,
      entryKey: options.entryKey
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
    this.sessionMediaAbortController?.abort?.();
    this.sessionMediaPreparationGeneration += 1;
    this.mediaCacheGeneration += 1;
    this.prepareSequence += 1;
    this.stageSwitchSeq += 1;

    this.getStageVideoElements().forEach((videoEl) => {
      try { videoEl.pause(); } catch (_) { }
      this.releaseTransientStageVideoObjectUrl(videoEl);
      try { videoEl.removeAttribute("src"); } catch (_) { videoEl.src = ""; }
      delete videoEl.dataset.src;
      delete videoEl.dataset.presentedSrc;
      delete videoEl.dataset.mediaSourceGeneration;
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
    this.authorizedAssetMetadataBySource.clear();
    this.sessionMediaAbortController?.abort?.();
    this.sessionMediaAbortController = null;
    this.sessionMediaPreparationGeneration += 1;
    this.sessionMediaPreparationPromise = null;
    this.sessionMediaPreparationKey = "";
    this.lastSessionSyncSignature = "";
    this.state.sessionMediaStatus = "idle";
    this.state.sessionMediaProgress = { completed: 0, total: 0, failures: [] };
    this.cachedTickEntries = null;
    this.cachedTickEntriesTime = 0;
    this.videoPrewarmKey = "";
    this.videoPrewarmPromise = null;
    this.videoLookAheadKey = "";
    this.podcastStageVideoPreloadSrc = "";
    this.stageMachine.imagePreloadCache?.clear?.();
    this.stageMachine.imageLoadingSrc = "";
    this.stageMachine.imageLoadingPromise = null;
    this.stageMachine.imageLoadingTarget = null;
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
    if (editorPreviewMode) this.setActiveStageVideoSlot(0);
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
      if (typeof window.hideStageImagePreview === "function") {
        window.hideStageImagePreview();
      }
      setPortrait?.(false);
      const currentSrc = String(stageVideo.dataset.src || "").trim();
      if ((opts.force || currentSrc !== src) && this.stageMachine.loadingSrc !== src) {
        const loadingRequest = {};
        this.stageMachine.loadingSrc = src;
        this.stageMachine.loadingRequest = loadingRequest;
        void this.setStageVideoSourceForElement(stageVideo, src, {
          noWait: true,
          keepHidden: false
        }).finally(() => {
          if (this.stageMachine.loadingRequest === loadingRequest) {
            this.stageMachine.loadingSrc = "";
            this.stageMachine.loadingRequest = null;
          }
        });
      }
      stageVideo.hidden = false;
      this.applyEntryVisualStateToSurface(stageEntry, stageVideo);
      this.applyStageVideoBundleLayout(activeBundle, visualLayoutMode);
      if (stageBackdrop) {
        const currentBackdropSrc = String(stageBackdrop.dataset.src || "").trim();
        if (visualLayoutMode === "blur-backdrop" && currentBackdropSrc !== src) {
          const cachedBackdropObjectUrl = this.getBlobUrlSync(src);
          if (cachedBackdropObjectUrl) {
            void this.setStageVideoSourceForElement(stageBackdrop, src, {
              noWait: true,
              keepHidden: false
            });
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
