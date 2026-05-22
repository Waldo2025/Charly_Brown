import {
  getPodcasterLocalMediaDataUrl,
  putPodcasterLocalMediaDataUrl
} from "./podcaster-local-media-cache.js";

export function createPodcasterPanelMusicApi(deps = {}) {
  const panelMusicState = {
    preset: "ambient",
    volume: 22,
    montageVolume: 100,
    duckingWhenGeminiPct: 60,
    stabilize: false,
    limiterEnabled: false,
    playing: false,
    sourceType: "preset",
    selectedTrackKind: "uploaded",
    trackLibrary: {
      uploaded: null,
      uploadedTracks: [],
      ai: null
    },
    track: null
  };
  const podcastAudioTrackUiState = {
    activeLoopIndex: -1
  };
  const panelMusicGlobalLibraryState = {
    items: [],
    loading: false,
    loadedAt: "",
    error: ""
  };

  let panelMusicAudioCtx = null;
  let panelMusicNodes = [];
  let panelMusicAudioEl = null;
  let panelMusicAiGenerating = false;
  let panelMusicDurationProbeCtx = null;
  const panelMusicDurationProbePendingKinds = new Set();

  const getEls = () => deps.getElements?.() || {};
  const getActiveSession = () => deps.getActiveSession?.() || null;
  const getSessionRows = (session = null) => deps.getSessionRows?.(session) || [];
  const getTimelineTotalDurationMs = (session = null) => Math.max(
    Math.max(1, Number(deps.studioTimelineMinClipMs || 500) || 500),
    Number(deps.getTimelineTotalDurationMs?.(session) || 0) || 0
  );
  const buildTimelineRuntimeEntries = (session = null) => deps.buildTimelineRuntimeEntries?.(session) || [];
  const nowIso = () => deps.nowIso?.() || new Date().toISOString();
  const logPodcastRenderDebug = (...args) => deps.logPodcastRenderDebug?.(...args);
  const syncPodcastStudioInspector = (...args) => deps.syncPodcastStudioInspector?.(...args);
  const getPodcastVideoConfig = (session = null) => deps.getPodcastVideoConfig?.(session || getActiveSession()) || {};
  const upsertPodcastVideoConfig = (...args) => deps.upsertPodcastVideoConfig?.(...args);
  const addChatMessage = (...args) => deps.addChatMessage?.(...args);
  const setGenerationStatus = (...args) => deps.setGenerationStatus?.(...args);
  const renderPodcastVideoTimeline = (...args) => deps.renderPodcastVideoTimeline?.(...args);
  const upsertActiveSession = (...args) => deps.upsertActiveSession?.(...args);
  const scheduleSessionLocalPersist = (...args) => deps.scheduleSessionLocalPersist?.(...args);
  const resolveStorageAudioUrl = (...args) => deps.resolveStorageAudioUrl?.(...args) || "";
  const authFetchJson = (...args) => deps.authFetchJson?.(...args);
  const escapeHtml = (value = "") => deps.escapeHtml?.(value) || String(value || "");
  const resolveCurrentUid = () => deps.resolveCurrentUid?.() || "";
  const playbackController = () => deps.getPlaybackController?.() || null;
  const podcastVideoState = () => deps.getPodcastVideoState?.() || null;
  const minClipMs = Math.max(1, Number(deps.studioTimelineMinClipMs || 500) || 500);
  const maxLocalMusicDataUrlChars = Math.max(1000, Number(deps.maxLocalMusicDataUrlChars || 1_800_000) || 1_800_000);
  const panelMusicStorageKeyBase = String(deps.panelMusicStorageKeyBase || "cb_podcaster_panel_music_v1").trim() || "cb_podcaster_panel_music_v1";

  function getGlobalAudioMixState(session = null) {
    const cfg = getPodcastVideoConfig(session);
    return {
      masterVolume: Math.max(0, Math.min(100, Number(cfg?.masterVolume ?? 100) || 100)),
      stabilize: cfg?.audioMasterStabilize === true,
      limiterEnabled: cfg?.audioMasterLimiterEnabled === true
    };
  }

  function persistGlobalAudioMixState(patch = {}) {
    const nextPatch = patch && typeof patch === "object" ? patch : {};
    upsertPodcastVideoConfig((cfg) => ({
      ...cfg,
      ...nextPatch
    }), { autosaveReason: "audio-mix" });
    scheduleSessionLocalPersist("audio-mix");
    const session = getActiveSession();
    const config = getPodcastVideoConfig(session);
    playbackController()?.sync?.(session, config);
    const currentMs = Math.max(0, Number(podcastVideoState()?.montageCursorMs || 0));
    const speed = Number(config?.playbackSpeed || 1) || 1;
    playbackController()?.syncBackgroundMusic?.(currentMs, speed);
  }

  function resolvePanelMusicTrackKind(value = "") {
    return String(value || "").trim() === "ai" ? "ai" : "uploaded";
  }

  function resolvePanelMusicStorageKey(uid = resolveCurrentUid()) {
    return `${panelMusicStorageKeyBase}:${String(uid || "").trim() || "auth_required"}`;
  }

  function resolvePanelMusicSessionCacheKey(sessionId = "", kind = "uploaded", uid = resolveCurrentUid()) {
    const safeSessionId = String(sessionId || "").trim() || "session";
    const safeKind = resolvePanelMusicTrackKind(kind);
    const safeUid = String(uid || "").trim() || "auth_required";
    return `${panelMusicStorageKeyBase}:cache:${safeUid}:${safeSessionId}:${safeKind}`;
  }

  function cleanupLegacyPanelMusicSessionStorageCaches(uid = resolveCurrentUid()) {
    const prefix = `${panelMusicStorageKeyBase}:cache:${String(uid || "").trim() || "auth_required"}:`;
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = String(localStorage.key(index) || "").trim();
        if (key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => {
        try { localStorage.removeItem(key); } catch (_) { }
      });
    } catch (_) {
      // noop
    }
  }

  function persistPanelMusicSessionTrackCache(sessionId = "", kind = "", localDataUrl = "") {
    const key = resolvePanelMusicSessionCacheKey(sessionId, kind);
    const value = String(localDataUrl || "").trim();
    if (!value) {
      return;
    }
    void putPodcasterLocalMediaDataUrl(key, value.slice(0, maxLocalMusicDataUrlChars), { kind: resolvePanelMusicTrackKind(kind) }).catch(() => { });
  }

  function loadPanelMusicSessionTrackCache(sessionId = "", kind = "") {
    void sessionId;
    void kind;
    return "";
  }

  async function hydratePanelMusicLocalCaches(session = null) {
    const activeSession = session || getActiveSession();
    const sessionId = String(activeSession?.id || "").trim();
    if (!activeSession || !sessionId) return false;
    cleanupLegacyPanelMusicSessionStorageCaches();
    const hydrateTrack = async (track, kind) => {
      const normalized = normalizePanelMusicTrack(track);
      if (!normalized || String(normalized.localDataUrl || "").trim() || normalized.storagePath || normalized.downloadUrl) return normalized;
      try {
        const localDataUrl = await getPodcasterLocalMediaDataUrl(resolvePanelMusicSessionCacheKey(sessionId, kind));
        return localDataUrl ? { ...normalized, localDataUrl } : normalized;
      } catch (_) {
        return normalized;
      }
    };
    const cfg = activeSession?.panelMusicConfig;
    if (!cfg || typeof cfg !== "object") return false;
    let changed = false;
    const uploadedTracks = Array.isArray(cfg.trackLibrary?.uploadedTracks) ? cfg.trackLibrary.uploadedTracks : [];
    const hydratedUploadedTracks = [];
    for (const track of uploadedTracks) {
      const hydrated = await hydrateTrack(track, "uploaded");
      hydratedUploadedTracks.push(hydrated);
      if (String(track?.localDataUrl || "").trim() !== String(hydrated?.localDataUrl || "").trim()) changed = true;
    }
    const hydratedUploaded = await hydrateTrack(cfg.trackLibrary?.uploaded || null, "uploaded");
    const hydratedAi = await hydrateTrack(cfg.trackLibrary?.ai || null, "ai");
    const hydratedTrack = await hydrateTrack(cfg.track || null, cfg?.track?.model ? "ai" : "uploaded");
    if (String(cfg.trackLibrary?.uploaded?.localDataUrl || "").trim() !== String(hydratedUploaded?.localDataUrl || "").trim()) changed = true;
    if (String(cfg.trackLibrary?.ai?.localDataUrl || "").trim() !== String(hydratedAi?.localDataUrl || "").trim()) changed = true;
    if (String(cfg.track?.localDataUrl || "").trim() !== String(hydratedTrack?.localDataUrl || "").trim()) changed = true;
    activeSession.panelMusicConfig = {
      ...cfg,
      trackLibrary: {
        ...(cfg.trackLibrary || {}),
        uploadedTracks: hydratedUploadedTracks,
        uploaded: hydratedUploadedTracks[0] || hydratedUploaded || null,
        ai: hydratedAi
      },
      track: hydratedTrack
    };
    if (panelMusicState.selectedTrackKind) {
      syncPanelMusicStateFromSession(activeSession);
    }
    return changed;
  }

  function normalizePanelMusicMutedLoopIndexes(value = []) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
      value
        .map((item) => Math.max(0, Math.floor(Number(item) || 0)))
        .filter((item) => Number.isFinite(item) && item >= 0 && item <= 999)
    )).sort((a, b) => a - b);
  }

  function normalizePanelMusicLoopSettings(value = [], sourceDurationMs = 0) {
    if (!Array.isArray(value)) return [];
    const maxDurationMs = Math.max(minClipMs, Math.round(Number(sourceDurationMs || 0) || 0));
    const maxTrimInMs = Math.max(0, maxDurationMs - minClipMs);
    const map = new Map();
    value.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const loopIndex = Math.max(0, Math.floor(Number(item.loopIndex) || 0));
      if (!Number.isFinite(loopIndex) || loopIndex > 999) return;
      const trimInMs = Math.max(0, Math.min(maxTrimInMs, Math.round(Number(item.trimInMs || 0) || 0)));
      const rawTrimOutMs = Math.round(Number(item.trimOutMs || maxDurationMs) || maxDurationMs);
      const trimOutMs = Math.max(trimInMs + minClipMs, Math.min(maxDurationMs, rawTrimOutMs));
      map.set(loopIndex, {
        loopIndex,
        trimInMs,
        trimOutMs,
        fadeInMs: Math.max(0, Math.min(trimOutMs - trimInMs, Math.round(Number(item.fadeInMs || 0) || 0))),
        fadeOutMs: Math.max(0, Math.min(trimOutMs - trimInMs, Math.round(Number(item.fadeOutMs || 0) || 0)))
      });
    });
    return Array.from(map.values()).sort((a, b) => a.loopIndex - b.loopIndex);
  }

  function resolvePanelMusicEffectiveSourceDurationMs(track = null) {
    const source = track && typeof track === "object" ? track : {};
    const durationFromSec = Math.max(0, Math.round((Number(source.durationSec || 0) || 0) * 1000));
    const durationFromTrim = Math.max(0, Math.round(Number(source.trimOutMs || 0) || 0));
    const durationFromLoops = Array.isArray(source.loopSettings)
      ? source.loopSettings.reduce((max, item) => {
        const trimOutMs = Math.max(0, Math.round(Number(item?.trimOutMs || 0) || 0));
        return Math.max(max, trimOutMs);
      }, 0)
      : 0;
    return Math.max(durationFromSec, durationFromTrim, durationFromLoops);
  }

  function normalizePanelMusicTrack(track = null) {
    if (!track || typeof track !== "object") return null;
    const sourceDurationMs = resolvePanelMusicEffectiveSourceDurationMs(track);
    const startOffsetMs = Math.max(0, Math.round(Number(track.startOffsetMs || 0) || 0));
    const maxTrimInMs = Math.max(0, sourceDurationMs - minClipMs);
    const trimInMs = Math.max(0, Math.min(maxTrimInMs, Math.round(Number(track.trimInMs || 0) || 0)));
    const rawTrimOutMs = Math.round(Number(track.trimOutMs || sourceDurationMs) || sourceDurationMs);
    const trimOutMs = sourceDurationMs > 0
      ? Math.max(trimInMs + minClipMs, Math.min(sourceDurationMs, rawTrimOutMs))
      : 0;
    return {
      libraryId: String(track.libraryId || "").trim(),
      slotLabel: String(track.slotLabel || "").trim(),
      enabledInSession: track.enabledInSession !== false,
      name: String(track.name || "Audio").trim() || "Audio",
      mimeType: String(track.mimeType || "audio/mpeg").trim() || "audio/mpeg",
      size: Math.max(0, Number(track.size || 0) || 0),
      durationSec: Math.max(0, Number(track.durationSec || 0) || 0),
      startOffsetMs,
      trimInMs,
      trimOutMs,
      localDataUrl: String(track.localDataUrl || "").trim().slice(0, maxLocalMusicDataUrlChars),
      downloadUrl: String(track.downloadUrl || "").trim(),
      storagePath: String(track.storagePath || "").trim(),
      updatedAt: String(track.updatedAt || nowIso()).trim() || nowIso(),
      model: String(track.model || "").trim(),
      prompt: String(track.prompt || "").trim(),
      durationMeasuredWith: String(track.durationMeasuredWith || "").trim().toLowerCase(),
      montageVolume: track.montageVolume !== undefined ? Math.max(0, Math.min(100, Number(track.montageVolume) || 0)) : 100,
      duckingWhenGeminiPct: track.duckingWhenGeminiPct !== undefined ? Math.max(40, Math.min(100, Number(track.duckingWhenGeminiPct) || 0)) : 60,
      stabilize: track.stabilize === true,
      loopSettings: normalizePanelMusicLoopSettings(track.loopSettings || [], sourceDurationMs),
      mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(track.mutedLoopIndexes || []),
      segmentStartOverrides: Array.isArray(track.segmentStartOverrides)
        ? track.segmentStartOverrides
          .map((item) => ({
            loopIndex: Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)),
            startMs: Math.max(0, Math.round(Number(item?.startMs || 0) || 0))
          }))
          .filter((item) => Number.isFinite(item.loopIndex) && item.loopIndex <= 999 && Number.isFinite(item.startMs))
        : []
    };
  }

  function normalizeGlobalPanelMusicLibraryTrack(track = null) {
    const normalized = normalizePanelMusicTrack(track);
    if (!normalized) return null;
    return {
      ...normalized,
      libraryId: String(track?.libraryId || normalized.libraryId || "").trim(),
      ownerEmail: String(track?.ownerEmail || "").trim()
    };
  }

  function normalizePanelMusicTrackList(value = []) {
    const list = Array.isArray(value) ? value.map((item) => normalizePanelMusicTrack(item)).filter(Boolean) : [];
    return list.map((track, index) => ({
      ...track,
      slotLabel: String(track.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
      enabledInSession: track.enabledInSession !== false
    }));
  }

  function serializePanelMusicTrackForStorage(track = null, options = {}) {
    const normalized = normalizePanelMusicTrack(track);
    if (!normalized) return null;
    const includePrompt = options.includePrompt !== false;
    return {
      libraryId: normalized.libraryId,
      slotLabel: normalized.slotLabel,
      enabledInSession: normalized.enabledInSession !== false,
      name: normalized.name,
      mimeType: normalized.mimeType,
      size: normalized.size,
      durationSec: normalized.durationSec,
      startOffsetMs: normalized.startOffsetMs,
      trimInMs: normalized.trimInMs,
      trimOutMs: normalized.trimOutMs,
      localDataUrl: "",
      downloadUrl: normalized.downloadUrl,
      storagePath: normalized.storagePath,
      updatedAt: normalized.updatedAt,
      model: normalized.model,
      prompt: includePrompt ? normalized.prompt : "",
      durationMeasuredWith: normalized.durationMeasuredWith,
      montageVolume: normalized.montageVolume,
      duckingWhenGeminiPct: normalized.duckingWhenGeminiPct,
      stabilize: normalized.stabilize === true,
      loopSettings: Array.isArray(normalized.loopSettings)
        ? normalized.loopSettings.map((item) => ({
          loopIndex: Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)),
          trimInMs: Math.max(0, Number(item?.trimInMs || 0) || 0),
          trimOutMs: Math.max(0, Number(item?.trimOutMs || 0) || 0),
          fadeInMs: Math.max(0, Number(item?.fadeInMs || 0) || 0),
          fadeOutMs: Math.max(0, Number(item?.fadeOutMs || 0) || 0)
        }))
        : [],
      mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(normalized.mutedLoopIndexes || []),
      segmentStartOverrides: Array.isArray(normalized.segmentStartOverrides)
        ? normalized.segmentStartOverrides.map((item) => ({
          loopIndex: Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)),
          startMs: Math.max(0, Number(item?.startMs || 0) || 0)
        }))
        : []
    };
  }

  function buildPanelMusicStorageTrackRef(track = null) {
    const normalized = normalizePanelMusicTrack(track);
    if (!normalized) return null;
    return {
      kind: normalized.model ? "ai" : "uploaded",
      libraryId: normalized.libraryId,
      slotLabel: normalized.slotLabel,
      model: normalized.model,
      name: normalized.name
    };
  }

  function resolveStoredPanelMusicTrack(trackLibrary = {}, ref = null, fallbackKind = "uploaded") {
    const kind = resolvePanelMusicTrackKind(ref?.kind || fallbackKind);
    if (kind === "ai") return normalizePanelMusicTrack(trackLibrary.ai || null);
    const uploadedTracks = normalizePanelMusicTrackList(trackLibrary.uploadedTracks || []);
    const libraryId = String(ref?.libraryId || "").trim();
    const slotLabel = String(ref?.slotLabel || "").trim();
    const model = String(ref?.model || "").trim();
    const name = String(ref?.name || "").trim().toLowerCase();
    const exact = uploadedTracks.find((track) => {
      if (model && String(track?.model || "").trim() !== model) return false;
      if (libraryId && String(track?.libraryId || "").trim() === libraryId) return true;
      if (slotLabel && String(track?.slotLabel || "").trim() === slotLabel) return true;
      if (name && String(track?.name || "").trim().toLowerCase() === name) return true;
      return false;
    });
    return normalizePanelMusicTrack(exact || uploadedTracks[0] || null);
  }

  function buildPanelMusicStoragePayload(options = {}) {
    const includePrompt = options.includePrompt !== false;
    const uploadedTracks = getPanelMusicUploadedTracks().map((track) => serializePanelMusicTrackForStorage(track, { includePrompt })).filter(Boolean);
    const aiTrack = serializePanelMusicTrackForStorage(panelMusicState.trackLibrary?.ai || null, { includePrompt });
    return {
      version: 2,
      preset: panelMusicState.preset,
      volume: panelMusicState.volume,
      montageVolume: panelMusicState.montageVolume,
      duckingWhenGeminiPct: Math.max(40, Math.min(100, Number(panelMusicState.duckingWhenGeminiPct ?? 60))),
      stabilize: panelMusicState.stabilize === true,
      limiterEnabled: panelMusicState.limiterEnabled === true,
      sourceType: panelMusicState.sourceType === "track" ? "track" : "preset",
      selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
      selectedTrackRef: buildPanelMusicStorageTrackRef(panelMusicState.track),
      trackLibrary: {
        uploadedTracks,
        ai: aiTrack
      }
    };
  }

  function writePanelMusicStoragePayload(payload = null) {
    const storageKey = resolvePanelMusicStorageKey();
    const serialized = JSON.stringify(payload || {});
    localStorage.setItem(storageKey, serialized);
  }

  function getPanelMusicUploadedTracks() {
    const list = normalizePanelMusicTrackList(panelMusicState.trackLibrary?.uploadedTracks || []);
    if (list.length) return list;
    const legacy = normalizePanelMusicTrack(panelMusicState.trackLibrary?.uploaded || null);
    return legacy ? [{ ...legacy, slotLabel: String(legacy.slotLabel || "Audio 1").trim() || "Audio 1" }] : [];
  }

  function getEnabledPanelMusicUploadedTracks() {
    return getPanelMusicUploadedTracks().filter((track) => track?.enabledInSession !== false);
  }

  function getPanelMusicTrackDurationSec(track = null) {
    const normalized = normalizePanelMusicTrack(track);
    const directDurationSec = Math.max(0, Number(normalized?.durationSec || 0) || 0);
    if (directDurationSec > 0.05) return directDurationSec;
    const effectiveDurationSec = Math.max(0, resolvePanelMusicEffectiveSourceDurationMs(normalized) / 1000);
    if (effectiveDurationSec > 0.05) {
      return Number(effectiveDurationSec.toFixed(3));
    }
    const sizeBytes = Math.max(0, Number(normalized?.size || 0) || 0);
    if (sizeBytes <= 0) return 0;
    const mimeType = String(normalized?.mimeType || "").trim().toLowerCase();
    if (!mimeType.includes("wav") && !mimeType.includes("wave")) {
      logPodcastRenderDebug("audio-track-duration-awaiting-measurement", {
        name: String(normalized?.name || ""),
        mimeType,
        sizeBytes
      });
      return 0;
    }
    const bitsPerSecond = 1411200;
    const estimatedDurationSec = Math.max(0, Number(((sizeBytes * 8) / bitsPerSecond).toFixed(2)) || 0);
    logPodcastRenderDebug("audio-track-duration-fallback", {
      name: String(normalized?.name || ""),
      mimeType,
      sizeBytes,
      bitsPerSecond,
      estimatedDurationSec
    });
    return estimatedDurationSec;
  }

  function getPanelMusicLoopSetting(track = null, loopIndex = 0) {
    const normalized = normalizePanelMusicTrack(track);
    if (!normalized) return null;
    const sourceDurationMs = Math.max(
      minClipMs,
      Math.round(getPanelMusicTrackDurationSec(normalized) * 1000) || minClipMs
    );
    const settings = normalizePanelMusicLoopSettings(normalized.loopSettings || [], sourceDurationMs);
    const key = Math.max(0, Math.floor(Number(loopIndex) || 0));
    const existing = settings.find((item) => item.loopIndex === key);
    if (existing) return existing;
    const defaultTrimInMs = Math.max(0, Math.min(sourceDurationMs - minClipMs, Math.round(Number(normalized.trimInMs || 0) || 0)));
    const defaultTrimOutMs = Math.max(
      defaultTrimInMs + minClipMs,
      Math.min(sourceDurationMs, Math.round(Number(normalized.trimOutMs || sourceDurationMs) || sourceDurationMs))
    );
    return {
      loopIndex: key,
      trimInMs: defaultTrimInMs,
      trimOutMs: defaultTrimOutMs,
      fadeInMs: Math.max(0, Math.min(defaultTrimOutMs - defaultTrimInMs, Math.round(Number(normalized.fadeInMs || 0) || 0))),
      fadeOutMs: Math.max(0, Math.min(defaultTrimOutMs - defaultTrimInMs, Math.round(Number(normalized.fadeOutMs || 0) || 0)))
    };
  }

  function getPanelMusicLoopVisibleDurationMs(track = null, loopIndex = 0) {
    const loopSetting = getPanelMusicLoopSetting(track, loopIndex);
    const trimInMs = Math.max(0, Number(loopSetting?.trimInMs || 0) || 0);
    const trimOutMs = Math.max(trimInMs + minClipMs, Number(loopSetting?.trimOutMs || trimInMs + minClipMs) || trimInMs + minClipMs);
    return Math.max(minClipMs, trimOutMs - trimInMs);
  }

  function upsertPanelMusicLoopSetting(loopSettings = [], loopIndex = 0, nextValue = {}) {
    const key = Math.max(0, Math.floor(Number(loopIndex) || 0));
    const filtered = Array.isArray(loopSettings)
      ? loopSettings.filter((item) => Math.max(0, Math.floor(Number(item?.loopIndex) || 0)) !== key)
      : [];
    filtered.push({
      loopIndex: key,
      trimInMs: Math.max(0, Math.round(Number(nextValue?.trimInMs || 0) || 0)),
      trimOutMs: Math.max(0, Math.round(Number(nextValue?.trimOutMs || 0) || 0)),
      fadeInMs: Math.max(0, Math.round(Number(nextValue?.fadeInMs || 0) || 0)),
      fadeOutMs: Math.max(0, Math.round(Number(nextValue?.fadeOutMs || 0) || 0))
    });
    return filtered.sort((a, b) => Number(a.loopIndex || 0) - Number(b.loopIndex || 0));
  }

  function setPanelMusicUploadedTracks(tracks = [], options = {}) {
    const normalizedList = normalizePanelMusicTrackList(tracks);
    panelMusicState.trackLibrary.uploadedTracks = normalizedList;
    panelMusicState.trackLibrary.uploaded = normalizedList[0] || null;
    if (options.selectIndex !== undefined) {
      const nextTrack = normalizedList[Math.max(0, Math.min(normalizedList.length - 1, Number(options.selectIndex) || 0))] || null;
      panelMusicState.track = nextTrack;
      panelMusicState.selectedTrackKind = "uploaded";
      panelMusicState.sourceType = nextTrack ? "track" : "preset";
    } else {
      syncActivePanelMusicTrack({ kind: panelMusicState.selectedTrackKind, forceTrack: false });
    }
  }

  function updateUploadedTrackAt(index = 0, nextTrack = null, options = {}) {
    const tracks = getPanelMusicUploadedTracks();
    const next = [...tracks];
    if (nextTrack) {
      next[Math.max(0, index)] = normalizePanelMusicTrack({
        ...(tracks[index] || {}),
        ...nextTrack,
        slotLabel: String(nextTrack?.slotLabel || tracks[index]?.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`
      });
    } else {
      next.splice(Math.max(0, index), 1);
    }
    setPanelMusicUploadedTracks(next, { selectIndex: options.selectIndex });
  }

  function getPanelMusicTrackByKind(kind = "") {
    const trackKind = resolvePanelMusicTrackKind(kind);
    if (trackKind === "uploaded") {
      const uploadedTracks = getEnabledPanelMusicUploadedTracks();
      const selectedTrack = normalizePanelMusicTrack(panelMusicState.track);
      if (selectedTrack && !selectedTrack.model) {
        const selectedSlotLabel = String(selectedTrack.slotLabel || "").trim();
        const match = uploadedTracks.find((item) => String(item?.slotLabel || "").trim() === selectedSlotLabel);
        if (match) return normalizePanelMusicTrack(match);
        return selectedTrack;
      }
      return normalizePanelMusicTrack(uploadedTracks[0] || null);
    }
    return normalizePanelMusicTrack(panelMusicState.trackLibrary?.[trackKind] || null);
  }

  function getPanelMusicTrackAvailability(kind = "") {
    const trackKind = resolvePanelMusicTrackKind(kind);
    if (trackKind === "uploaded") {
      const uploadedTracks = getPanelMusicUploadedTracks();
      if (uploadedTracks.length) {
        const selectedTrack = normalizePanelMusicTrack(panelMusicState.track);
        if (selectedTrack && !selectedTrack.model) return selectedTrack;
        return uploadedTracks[0];
      }
    }
    const libraryTrack = getPanelMusicTrackByKind(trackKind);
    if (libraryTrack) return libraryTrack;
    const activeTrack = normalizePanelMusicTrack(panelMusicState.track);
    if (!activeTrack) return null;
    if (trackKind === "ai" && activeTrack.model) return activeTrack;
    if (trackKind === "uploaded" && !activeTrack.model) return activeTrack;
    return null;
  }

  function getAvailablePanelMusicTrackKinds() {
    const kinds = [];
    if (getPanelMusicTrackAvailability("uploaded")) kinds.push("uploaded");
    if (getPanelMusicTrackAvailability("ai")) kinds.push("ai");
    return kinds;
  }

  function syncActivePanelMusicTrack(options = {}) {
    const preferredKind = resolvePanelMusicTrackKind(options.kind || panelMusicState.selectedTrackKind);
    const availableKinds = getAvailablePanelMusicTrackKinds();
    const nextKind = availableKinds.includes(preferredKind)
      ? preferredKind
      : (availableKinds[0] || "uploaded");
    panelMusicState.selectedTrackKind = nextKind;
    panelMusicState.track = getPanelMusicTrackAvailability(nextKind);
    if (!panelMusicState.track) {
      panelMusicState.sourceType = "preset";
    } else if (options.forceTrack === true || panelMusicState.sourceType === "track") {
      panelMusicState.sourceType = "track";
    }
  }

  function selectPanelMusicTrackKind(kind = "", options = {}) {
    const trackKind = resolvePanelMusicTrackKind(kind);
    const exactTrack = getPanelMusicTrackByKind(trackKind);
    if (!exactTrack) {
      if (options.notify !== false) {
        addChatMessage("system", trackKind === "ai"
          ? "Todavía no hay audio IA disponible para seleccionar."
          : "Todavía no hay audio cargado disponible para seleccionar.");
      }
      return false;
    }
    panelMusicState.selectedTrackKind = trackKind;
    panelMusicState.track = exactTrack;
    panelMusicState.sourceType = "track";
    return true;
  }

  function selectUploadedPanelMusicTrackByIndex(index = 0) {
    const trackIndex = Math.max(0, Math.floor(Number(index) || 0));
    const tracks = getPanelMusicUploadedTracks();
    const track = normalizePanelMusicTrack(tracks[trackIndex] || null);
    if (!track) return null;
    panelMusicState.selectedTrackKind = "uploaded";
    panelMusicState.track = track;
    panelMusicState.sourceType = "track";
    return track;
  }

  function setPanelMusicTrack(kind = "", track = null, options = {}) {
    const trackKind = resolvePanelMusicTrackKind(kind);
    const normalizedTrack = normalizePanelMusicTrack(track);
    panelMusicState.trackLibrary[trackKind] = normalizedTrack;
    if (trackKind === "uploaded" && normalizedTrack) {
      const uploadedTracks = getPanelMusicUploadedTracks();
      const selectedSlotLabel = String(normalizedTrack.slotLabel || "").trim();
      const nextUploadedTracks = uploadedTracks.map((item, index) => {
        const itemSlotLabel = String(item?.slotLabel || `Audio ${index + 1}`).trim();
        if (selectedSlotLabel && itemSlotLabel === selectedSlotLabel) {
          return {
            ...item,
            ...normalizedTrack,
            slotLabel: itemSlotLabel || `Audio ${index + 1}`
          };
        }
        return item;
      });
      if (nextUploadedTracks.length) {
        panelMusicState.trackLibrary.uploadedTracks = normalizePanelMusicTrackList(nextUploadedTracks);
        panelMusicState.trackLibrary.uploaded = panelMusicState.trackLibrary.uploadedTracks[0] || normalizedTrack;
      }
    }
    if (options.select === true) {
      selectPanelMusicTrackKind(trackKind, { notify: false });
      return;
    }
    syncActivePanelMusicTrack({
      kind: panelMusicState.selectedTrackKind,
      forceTrack: false
    });
  }

  function buildUploadedPanelMusicSegments(session = null) {
    const activeSession = session || getActiveSession();
    const allTracks = getPanelMusicUploadedTracks();
    const uploadedTracks = getEnabledPanelMusicUploadedTracks().filter((track) => getPanelMusicTrackDurationSec(track) > 0.05);
    const entries = buildTimelineRuntimeEntries(activeSession);
    const totalDurationMs = Math.max(minClipMs, getTimelineTotalDurationMs(activeSession));
    const sceneEntries = entries.length ? entries : [{ startMs: 0, endMs: totalDurationMs }];
    if (!uploadedTracks.length) return [];
    const resolveFullTrackIndex = (track = null, fallbackIndex = 0) => {
      const normalized = normalizePanelMusicTrack(track);
      if (!normalized) return Math.max(0, Math.floor(Number(fallbackIndex) || 0));
      const slotLabel = String(normalized.slotLabel || "").trim();
      if (slotLabel) {
        const byLabel = allTracks.findIndex((item) => String(item?.slotLabel || "").trim() === slotLabel);
        if (byLabel >= 0) return byLabel;
      }
      const byIdentity = allTracks.findIndex((item) => item === track);
      if (byIdentity >= 0) return byIdentity;
      return Math.max(0, Math.floor(Number(fallbackIndex) || 0));
    };
    const applyOverrides = (segmentList = []) => segmentList.map((segment) => {
      const trackIndex = Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0));
      const loopIndex = Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0));
      const track = allTracks[trackIndex] || null;
      const overrides = Array.isArray(track?.segmentStartOverrides) ? track.segmentStartOverrides : [];
      const override = overrides.find((item) => Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)) === loopIndex);
      if (!override) return segment;
      const durationMs = Math.max(minClipMs, Math.round(Number(segment?.endMs || 0) - Number(segment?.startMs || 0) || 0));
      const nextStart = Math.max(0, Math.min(totalDurationMs - durationMs, Math.round(Number(override.startMs || 0) || 0)));
      return {
        ...segment,
        startMs: nextStart,
        endMs: nextStart + durationMs
      };
    });
    if (uploadedTracks.length === 1) {
      const single = uploadedTracks[0];
      const fullTrackIndex = resolveFullTrackIndex(single, 0);
      const segments = [];
      let sceneCursor = 0;
      let loopIndex = 0;
      while (sceneCursor < sceneEntries.length && loopIndex < 120) {
        const loopVisibleDurationMs = getPanelMusicLoopVisibleDurationMs(single, loopIndex);
        const startMs = Math.max(0, Number(sceneEntries[sceneCursor]?.startMs || 0) || 0);
        let endSceneCursor = sceneCursor;
        let segmentEndMs = Math.max(startMs, Number(sceneEntries[sceneCursor]?.endMs || startMs) || startMs);
        while (endSceneCursor + 1 < sceneEntries.length) {
          const candidateEndMs = Math.max(segmentEndMs, Number(sceneEntries[endSceneCursor + 1]?.endMs || segmentEndMs) || segmentEndMs);
          if ((candidateEndMs - startMs) > loopVisibleDurationMs + 1) break;
          endSceneCursor += 1;
          segmentEndMs = candidateEndMs;
        }
        const sceneBatchDurationMs = Math.max(minClipMs, segmentEndMs - startMs);
        const loopSetting = getPanelMusicLoopSetting({
          ...single,
          durationSec: sceneBatchDurationMs / 1000,
          trimInMs: 0,
          trimOutMs: sceneBatchDurationMs
        }, loopIndex);
        const trimInMs = Math.max(0, Math.min(sceneBatchDurationMs - minClipMs, Number(loopSetting?.trimInMs || 0) || 0));
        const trimOutMs = Math.max(
          trimInMs + minClipMs,
          Math.min(sceneBatchDurationMs, Number(loopSetting?.trimOutMs || sceneBatchDurationMs) || sceneBatchDurationMs)
        );
        const visibleDurationMs = Math.max(minClipMs, trimOutMs - trimInMs);
        segments.push({
          ...single,
          slotLabel: String(single.slotLabel || "Audio 1").trim() || "Audio 1",
          trackIndex: fullTrackIndex,
          startMs,
          endMs: startMs + trimOutMs,
          durationSec: getPanelMusicTrackDurationSec(single),
          trimInMs,
          trimOutMs,
          fadeInMs: Math.max(0, Math.min(visibleDurationMs, Number(loopSetting?.fadeInMs || 0) || 0)),
          fadeOutMs: Math.max(0, Math.min(visibleDurationMs, Number(loopSetting?.fadeOutMs || 0) || 0)),
          loop: false,
          loopIndex
        });
        sceneCursor = endSceneCursor + 1;
        loopIndex += 1;
      }
      return applyOverrides(segments);
    }
    const segments = [];
    let sceneCursor = 0;
    uploadedTracks.forEach((track, index) => {
      if (sceneCursor >= sceneEntries.length) return;
      const fullTrackIndex = resolveFullTrackIndex(track, index);
      const trackVisibleDurationMs = getPanelMusicLoopVisibleDurationMs(track, 0);
      const remainingTracksAfterCurrent = Math.max(0, uploadedTracks.length - index - 1);
      const startMs = Math.max(0, Number(sceneEntries[sceneCursor]?.startMs || 0) || 0);
      let endSceneCursor = sceneCursor;
      let segmentEndMs = Math.max(startMs, Number(sceneEntries[sceneCursor]?.endMs || startMs) || startMs);
      while (endSceneCursor + 1 < sceneEntries.length) {
        const remainingScenesAfterCandidate = Math.max(0, sceneEntries.length - (endSceneCursor + 2));
        if (remainingScenesAfterCandidate < remainingTracksAfterCurrent) break;
        const candidateEndMs = Math.max(segmentEndMs, Number(sceneEntries[endSceneCursor + 1]?.endMs || segmentEndMs) || segmentEndMs);
        if ((candidateEndMs - startMs) > trackVisibleDurationMs + 1) break;
        endSceneCursor += 1;
        segmentEndMs = candidateEndMs;
      }
      const availableDurationMs = Math.max(minClipMs, totalDurationMs - startMs);
      const visibleDurationMs = Math.max(minClipMs, Math.min(trackVisibleDurationMs, availableDurationMs));
      segments.push({
        ...track,
        slotLabel: String(track.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
        trackIndex: fullTrackIndex,
        startMs,
        endMs: startMs + visibleDurationMs,
        durationSec: getPanelMusicTrackDurationSec(track),
        trimInMs: 0,
        trimOutMs: visibleDurationMs,
        fadeInMs: 0,
        fadeOutMs: 0,
        loop: false,
        loopIndex: 0
      });
      sceneCursor = endSceneCursor + 1;
    });
    return applyOverrides(segments);
  }

  function groupUploadedPanelMusicSegmentsByTrack(session = null) {
    const segments = buildUploadedPanelMusicSegments(session);
    const groups = [];
    const indexByKey = new Map();
    segments.forEach((segment, fallbackIndex) => {
      const trackIndex = Math.max(0, Math.floor(Number(segment?.trackIndex ?? fallbackIndex) || 0));
      const slotLabel = String(segment?.slotLabel || `Audio ${trackIndex + 1}`).trim() || `Audio ${trackIndex + 1}`;
      const key = `${trackIndex}:${slotLabel}`;
      if (!indexByKey.has(key)) {
        indexByKey.set(key, groups.length);
        groups.push({
          trackIndex,
          slotLabel,
          name: String(segment?.name || slotLabel).trim() || slotLabel,
          segments: []
        });
      }
      groups[indexByKey.get(key)].segments.push(segment);
    });
    return groups;
  }

  function getPanelMusicLoopSegments(session = null, track = null) {
    const normalized = normalizePanelMusicTrack(track);
    const durationSec = getPanelMusicTrackDurationSec(normalized);
    const totalDurationMs = Math.max(minClipMs, getTimelineTotalDurationMs(session || getActiveSession()));
    if (!normalized || durationSec <= 0.05) return [];
    const sourceDurationMs = Math.max(minClipMs, Math.round(durationSec * 1000));
    const startOffsetMs = Math.max(0, Math.min(totalDurationMs, Number(normalized.startOffsetMs || 0) || 0));
    const loopSettings = normalizePanelMusicLoopSettings(normalized.loopSettings || [], sourceDurationMs);
    const segments = [];
    let cursorMs = startOffsetMs;
    let loopIndex = 0;
    while (cursorMs < totalDurationMs && loopIndex < 120) {
      const loopSetting = loopSettings.find((item) => item.loopIndex === loopIndex) || getPanelMusicLoopSetting(normalized, loopIndex);
      const effectiveLoopMs = Math.max(
        minClipMs,
        Math.round(Number(loopSetting?.trimOutMs || sourceDurationMs) || sourceDurationMs) - Math.round(Number(loopSetting?.trimInMs || 0) || 0)
      );
      segments.push({
        loopIndex,
        startMs: cursorMs,
        trimInMs: Math.max(0, Number(loopSetting?.trimInMs || 0) || 0),
        trimOutMs: Math.max(minClipMs, Number(loopSetting?.trimOutMs || sourceDurationMs) || sourceDurationMs),
        effectiveLoopMs,
        fadeInMs: Math.max(0, Math.min(effectiveLoopMs, Number(loopSetting?.fadeInMs || 0) || 0)),
        fadeOutMs: Math.max(0, Math.min(effectiveLoopMs, Number(loopSetting?.fadeOutMs || 0) || 0))
      });
      cursorMs += effectiveLoopMs;
      loopIndex += 1;
    }
    return segments;
  }

  function getPanelMusicLoopCount(session = null, track = null) {
    return getPanelMusicLoopSegments(session, track).length || 1;
  }

  async function decodeAudioDurationInfoFromSrc(src = "") {
    const source = String(src || "").trim();
    if (!source) return { durationSec: 0, method: "" };
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return { durationSec: 0, method: "" };
    if (!panelMusicDurationProbeCtx) panelMusicDurationProbeCtx = new AudioContextCtor();
    const response = await fetch(source);
    if (!response.ok) {
      const error = new Error(`No se pudo leer audio (${response.status}).`);
      error.status = Number(response.status) || 0;
      throw error;
    }
    const arrayBuffer = await response.arrayBuffer();
    if (!(arrayBuffer instanceof ArrayBuffer) || !arrayBuffer.byteLength) return { durationSec: 0, method: "" };
    const decodedBuffer = await new Promise((resolve, reject) => {
      try {
        panelMusicDurationProbeCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
    return {
      durationSec: Math.max(0, Number(decodedBuffer?.duration || 0) || 0),
      method: "decode"
    };
  }

  function isMissingAudioSourceError(error = null) {
    const status = Number(error?.status || 0);
    if (status === 404) return true;
    const text = String(error?.message || error || "").toLowerCase();
    return text.includes("(404)") || text.includes(" 404 ");
  }

  function isProxyStoragePathMediaUrl(src = "") {
    const source = String(src || "").trim();
    return Boolean(source && source.includes("/api/assets/proxy-media?storagePath="));
  }

  async function decodeAudioDurationInfoFromArrayBuffer(arrayBuffer = null) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor || !(arrayBuffer instanceof ArrayBuffer) || !arrayBuffer.byteLength) {
      return { durationSec: 0, method: "" };
    }
    if (!panelMusicDurationProbeCtx) panelMusicDurationProbeCtx = new AudioContextCtor();
    const decodedBuffer = await new Promise((resolve, reject) => {
      try {
        panelMusicDurationProbeCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
    return {
      durationSec: Math.max(0, Number(decodedBuffer?.duration || 0) || 0),
      method: "decode"
    };
  }

  function readAudioDurationSecFromSrc(src = "") {
    const source = String(src || "").trim();
    if (!source) return Promise.resolve({ durationSec: 0, method: "" });
    return new Promise((resolve) => {
      const audio = new Audio();
      let finished = false;
      let timeoutId = 0;
      const clear = () => {
        audio.onloadedmetadata = null;
        audio.ondurationchange = null;
        audio.oncanplay = null;
        audio.ontimeupdate = null;
        audio.onerror = null;
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = 0;
        }
      };
      const done = (value = 0, method = "metadata") => {
        if (finished) return;
        finished = true;
        clear();
        resolve({
          durationSec: Math.max(0, Number(value || 0) || 0),
          method
        });
      };
      const tryResolveFiniteDuration = (method = "metadata") => {
        const duration = Number(audio.duration || 0);
        if (Number.isFinite(duration) && duration > 0.05) {
          done(duration, method);
          return true;
        }
        return false;
      };
      const tryProbeInfiniteDuration = () => {
        const duration = Number(audio.duration || 0);
        if (!Number.isFinite(duration) || duration === Infinity) {
          try {
            audio.currentTime = 1e101;
            return true;
          } catch (_) {
            return false;
          }
        }
        return false;
      };
      audio.preload = "auto";
      audio.crossOrigin = "anonymous";
      audio.onloadedmetadata = () => {
        if (tryResolveFiniteDuration("metadata")) return;
        if (!tryProbeInfiniteDuration()) done(0, "");
      };
      audio.ondurationchange = () => {
        tryResolveFiniteDuration("metadata");
      };
      audio.oncanplay = () => {
        tryResolveFiniteDuration("metadata");
      };
      audio.ontimeupdate = () => {
        if (tryResolveFiniteDuration("metadata-probe")) {
          try { audio.currentTime = 0; } catch (_) { }
        }
      };
      audio.onerror = () => done(0, "");
      timeoutId = window.setTimeout(() => done(0, ""), 7000);
      audio.src = source;
      try { audio.load(); } catch (_) { done(0, ""); }
    });
  }

  async function measureAudioDurationInfoFromSrc(src = "") {
    const source = String(src || "").trim();
    if (!source) return { durationSec: 0, method: "" };
    try {
      const decoded = await decodeAudioDurationInfoFromSrc(source);
      if (Number(decoded?.durationSec || 0) > 0.05) {
        logPodcastRenderDebug("audio-track-duration-measured", {
          method: decoded.method,
          durationSec: decoded.durationSec,
          srcKind: source.startsWith("data:") ? "data-url" : "remote"
        });
        return decoded;
      }
    } catch (error) {
      if (isMissingAudioSourceError(error)) return { durationSec: 0, method: "missing" };
    }
    const metadata = await readAudioDurationSecFromSrc(source);
    logPodcastRenderDebug("audio-track-duration-measured", {
      method: metadata.method || "metadata_failed",
      durationSec: Number(metadata?.durationSec || 0) || 0,
      srcKind: source.startsWith("data:") ? "data-url" : "remote"
    });
    return metadata;
  }

  async function measureAudioDurationInfoFromFile(file = null) {
    if (!(file instanceof File)) return { durationSec: 0, method: "" };
    try {
      const buffer = await file.arrayBuffer();
      const decoded = await decodeAudioDurationInfoFromArrayBuffer(buffer);
      if (Number(decoded?.durationSec || 0) > 0.05) {
        logPodcastRenderDebug("audio-track-duration-measured", {
          method: decoded.method,
          durationSec: decoded.durationSec,
          srcKind: "file"
        });
        return decoded;
      }
    } catch (_) {
      // fallback below
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const metadata = await readAudioDurationSecFromSrc(objectUrl);
      logPodcastRenderDebug("audio-track-duration-measured", {
        method: metadata.method || "metadata_failed",
        durationSec: Number(metadata?.durationSec || 0) || 0,
        srcKind: "file-object-url"
      });
      return metadata;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function ensurePanelMusicTrackDuration(kind = "", options = {}) {
    const trackKind = resolvePanelMusicTrackKind(kind || panelMusicState.selectedTrackKind);
    if (panelMusicDurationProbePendingKinds.has(trackKind)) return getPanelMusicTrackByKind(trackKind);
    const track = getPanelMusicTrackByKind(trackKind);
    if (!track) return null;
    const measuredWith = String(track.durationMeasuredWith || "").trim().toLowerCase();
    if (!options.force && measuredWith === "missing") return track;
    if (!options.force && getPanelMusicTrackDurationSec(track) > 0.05 && measuredWith === "decode") return track;
    const src = String(track.localDataUrl || resolveStorageAudioUrl(track.downloadUrl || "", track.storagePath || "") || track.downloadUrl || "").trim();
    if (!src || isProxyStoragePathMediaUrl(src)) return track;
    panelMusicDurationProbePendingKinds.add(trackKind);
    try {
      const durationInfo = await measureAudioDurationInfoFromSrc(src);
      if (String(durationInfo?.method || "").trim().toLowerCase() === "missing") {
        const nextTrack = { ...track, durationSec: 0, durationMeasuredWith: "missing", updatedAt: nowIso() };
        setPanelMusicTrack(trackKind, nextTrack, { select: panelMusicState.selectedTrackKind === trackKind });
        persistPanelMusicSettings();
        persistPanelMusicToActiveSession();
        return nextTrack;
      }
      const durationSec = Math.max(0, Number(durationInfo?.durationSec || 0) || 0);
      if (durationSec <= 0.05) return track;
      const nextTrack = {
        ...track,
        durationSec,
        durationMeasuredWith: String(durationInfo?.method || measuredWith || "").trim().toLowerCase(),
        updatedAt: nowIso()
      };
      setPanelMusicTrack(trackKind, nextTrack, { select: panelMusicState.selectedTrackKind === trackKind });
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      if (options.render !== false) {
        syncMusicControls();
        renderPodcastVideoTimeline(getActiveSession());
      }
      return nextTrack;
    } finally {
      panelMusicDurationProbePendingKinds.delete(trackKind);
    }
  }

  async function ensureAllEnabledUploadedTrackDurations(options = {}) {
    const tracks = getEnabledPanelMusicUploadedTracks();
    if (!tracks.length) return tracks;
    for (let index = 0; index < tracks.length; index += 1) {
      const track = normalizePanelMusicTrack(tracks[index]);
      if (!track) continue;
      const measuredWith = String(track.durationMeasuredWith || "").trim().toLowerCase();
      if (!options.force && measuredWith === "missing") continue;
      if (!options.force && getPanelMusicTrackDurationSec(track) > 0.05 && measuredWith === "decode") continue;
      const src = String(track.localDataUrl || resolveStorageAudioUrl(track.downloadUrl || "", track.storagePath || "") || track.downloadUrl || "").trim();
      if (!src || isProxyStoragePathMediaUrl(src)) continue;
      try {
        const durationInfo = await measureAudioDurationInfoFromSrc(src);
        if (String(durationInfo?.method || "").trim().toLowerCase() === "missing") {
          updateUploadedTrackAt(index, {
            ...track,
            durationSec: 0,
            durationMeasuredWith: "missing",
            updatedAt: nowIso()
          }, { selectIndex: index });
          continue;
        }
        const durationSec = Math.max(0, Number(durationInfo?.durationSec || 0) || 0);
        if (durationSec <= 0.05) continue;
        updateUploadedTrackAt(index, {
          ...track,
          durationSec,
          durationMeasuredWith: String(durationInfo?.method || measuredWith || "").trim().toLowerCase(),
          updatedAt: nowIso()
        }, { selectIndex: index });
      } catch (_) {
        // noop
      }
    }
    if (options.render !== false) {
      syncMusicControls();
      renderPodcastVideoTimeline(getActiveSession());
    }
    return getEnabledPanelMusicUploadedTracks();
  }

  function persistPanelMusicSettings() {
    try {
      writePanelMusicStoragePayload(buildPanelMusicStoragePayload({ includePrompt: true }));
    } catch (_) {
      try {
        localStorage.removeItem(resolvePanelMusicStorageKey());
      } catch (_) {
        // noop
      }
      try {
        writePanelMusicStoragePayload(buildPanelMusicStoragePayload({ includePrompt: false }));
      } catch (storageError) {
        console.warn("[podcaster-panel-music] No se pudo persistir la configuración local de música.", storageError);
      }
    }
  }

  function getPanelMontageMusicConfig() {
    const uploadedMode = panelMusicState.selectedTrackKind === "uploaded";
    const activeTrack = normalizePanelMusicTrack(panelMusicState.track);
    const uploadedSegments = uploadedMode ? buildUploadedPanelMusicSegments(getActiveSession()) : [];
    const uploadedTracks = uploadedMode ? getPanelMusicUploadedTracks() : [];
    const sourceItems = uploadedSegments.map((segment) => {
      const trackIndex = Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0));
      const loopIndex = Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0));
      const track = uploadedTracks[trackIndex] || null;
      const mutedLoopIndexes = new Set(normalizePanelMusicMutedLoopIndexes(track?.mutedLoopIndexes || []));
      return {
        slotLabel: String(segment?.slotLabel || "").trim(),
        sourceUrl: String(resolveStorageAudioUrl(segment?.downloadUrl || "", segment?.storagePath || "") || "").trim(),
        startOffsetMs: Math.max(0, Number(segment?.startMs || 0) || 0),
        endOffsetMs: Math.max(0, Number(segment?.endMs || 0) || 0),
        loop: segment?.loop === true,
        durationSec: Math.max(0, Number(segment?.durationSec || 0) || 0),
        trimInMs: Math.max(0, Number(segment?.trimInMs || 0) || 0),
        trimOutMs: Math.max(0, Number(segment?.trimOutMs || 0) || 0),
        fadeInMs: Math.max(0, Number(segment?.fadeInMs || 0) || 0),
        fadeOutMs: Math.max(0, Number(segment?.fadeOutMs || 0) || 0),
        trackIndex,
        loopIndex,
        muted: mutedLoopIndexes.has(loopIndex),
        volume: track?.montageVolume !== undefined ? track.montageVolume : panelMusicState.montageVolume,
        duckingWhenGeminiPct: track?.duckingWhenGeminiPct !== undefined ? track.duckingWhenGeminiPct : panelMusicState.duckingWhenGeminiPct,
        stabilize: track?.stabilize !== undefined ? track.stabilize : panelMusicState.stabilize
      };
    }).filter((segment) => segment.sourceUrl);
    const sourceUrl = (!uploadedMode && panelMusicState.sourceType === "track") ? resolvePanelMusicTrackSrc() : "";
    const sourceType = uploadedMode
      ? (sourceItems.length ? "track" : "none")
      : (panelMusicState.sourceType === "track" ? "track" : "none");
    return {
      sourceType,
      selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
      preset: ["ambient", "focus", "pulse"].includes(String(panelMusicState.preset || "").trim())
        ? String(panelMusicState.preset).trim()
        : "ambient",
      sourceUrl: String(sourceUrl || "").trim(),
      sourceItems,
      volume: Math.max(0, Math.min(100, Number(panelMusicState.montageVolume ?? 0))),
      montageVolume: Math.max(0, Math.min(100, Number(panelMusicState.montageVolume ?? 0))),
      duckingWhenGeminiPct: Math.max(40, Math.min(100, Number(panelMusicState.duckingWhenGeminiPct ?? 60))),
      stabilize: panelMusicState.stabilize === true,
      limiterEnabled: panelMusicState.limiterEnabled === true,
      durationSec: Math.max(0, Number(activeTrack?.durationSec || 0) || 0),
      startOffsetMs: Math.max(0, Number(activeTrack?.startOffsetMs || 0) || 0),
      trimInMs: Math.max(0, Number(activeTrack?.trimInMs || 0) || 0),
      trimOutMs: Math.max(0, Number(activeTrack?.trimOutMs || 0) || 0),
      loopSettings: Array.isArray(activeTrack?.loopSettings)
        ? activeTrack.loopSettings.map((item) => ({
          loopIndex: Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)),
          trimInMs: Math.max(0, Number(item?.trimInMs || 0) || 0),
          trimOutMs: Math.max(0, Number(item?.trimOutMs || 0) || 0),
          fadeInMs: Math.max(0, Number(item?.fadeInMs || 0) || 0),
          fadeOutMs: Math.max(0, Number(item?.fadeOutMs || 0) || 0)
        }))
        : [],
      mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(activeTrack?.mutedLoopIndexes || [])
    };
  }

  function persistPanelMusicToActiveSession() {
    const session = getActiveSession();
    if (!session) return;
    const sanitizeTrackForSession = (track) => {
      const normalized = normalizePanelMusicTrack(track);
      if (!normalized) return null;
      const isPersistedInFirebase = Boolean(String(normalized.storagePath || "").trim() && String(normalized.downloadUrl || "").trim());
      persistPanelMusicSessionTrackCache(session.id, normalized.model ? "ai" : "uploaded", isPersistedInFirebase ? "" : (normalized.localDataUrl || ""));
      return {
        ...normalized,
        localDataUrl: ""
      };
    };
    const montageCfg = getPanelMontageMusicConfig();
    upsertActiveSession((current) => ({
      ...current,
      panelMusicConfig: {
        ...montageCfg,
        trackLibrary: {
          uploaded: sanitizeTrackForSession(panelMusicState.trackLibrary?.uploaded || null),
          uploadedTracks: getPanelMusicUploadedTracks().map((track) => sanitizeTrackForSession(track)).filter(Boolean),
          ai: sanitizeTrackForSession(panelMusicState.trackLibrary?.ai || null)
        },
        track: sanitizeTrackForSession(panelMusicState.track)
      }
    }), { render: false });
  }

  function persistAudioTrackMixSettings() {
    persistPanelMusicSettings();
    persistPanelMusicToActiveSession();
    scheduleSessionLocalPersist("background-music");
    playbackController()?.syncBackgroundMusic?.(Math.max(0, Number(podcastVideoState()?.montageCursorMs || 0)), 1);
  }

  function setAllSessionUploadedTracksEnabled(enabled = true) {
    const nextTracks = getPanelMusicUploadedTracks().map((track) => ({ ...track, enabledInSession: enabled === true }));
    setPanelMusicUploadedTracks(nextTracks, { selectIndex: 0 });
    persistAudioTrackMixSettings();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
  }

  function toggleSessionUploadedTrackEnabled(index = 0) {
    const trackIndex = Math.max(0, Math.floor(Number(index) || 0));
    const tracks = getPanelMusicUploadedTracks();
    const track = tracks[trackIndex] || null;
    if (!track) return false;
    const nextTracks = [...tracks];
    nextTracks[trackIndex] = { ...track, enabledInSession: track.enabledInSession === false };
    setPanelMusicUploadedTracks(nextTracks, { selectIndex: trackIndex });
    persistAudioTrackMixSettings();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
    return true;
  }

  function removeUploadedTrackAt(index = 0) {
    const nextIndex = Math.max(0, Math.floor(Number(index) || 0));
    const tracks = getPanelMusicUploadedTracks();
    if (nextIndex < 0 || nextIndex >= tracks.length) return false;
    const nextTracks = tracks.filter((_, itemIndex) => itemIndex !== nextIndex).map((track, itemIndex) => ({
      ...track,
      slotLabel: `Audio ${itemIndex + 1}`
    }));
    setPanelMusicUploadedTracks(nextTracks, { selectIndex: Math.max(0, Math.min(nextTracks.length - 1, nextIndex - 1)) });
    if (!nextTracks.length) {
      panelMusicState.track = null;
      panelMusicState.sourceType = "preset";
    }
    persistAudioTrackMixSettings();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
    return true;
  }

  function addGlobalMusicTrackToSession(track = null) {
    const normalized = normalizeGlobalPanelMusicLibraryTrack(track);
    if (!normalized) return false;
    const existingTracks = getPanelMusicUploadedTracks();
    const normalizedLibraryId = String(normalized.libraryId || "").trim();
    const normalizedName = String(normalized.name || "").trim().toLowerCase();
    const normalizedSize = Math.max(0, Number(normalized.size || 0) || 0);
    const normalizedDurationSec = Math.max(0, Number(normalized.durationSec || 0) || 0);
    const existingIndex = existingTracks.findIndex((item) => {
      const itemLibraryId = String(item?.libraryId || "").trim();
      if (normalizedLibraryId && itemLibraryId === normalizedLibraryId) return true;
      if (itemLibraryId) return false;
      const itemName = String(item?.name || "").trim().toLowerCase();
      const itemSize = Math.max(0, Number(item?.size || 0) || 0);
      const itemDurationSec = Math.max(0, Number(item?.durationSec || 0) || 0);
      const sameName = normalizedName && itemName === normalizedName;
      const sameSize = normalizedSize > 0 && itemSize > 0 && normalizedSize === itemSize;
      const similarDuration = normalizedDurationSec > 0 && itemDurationSec > 0 && Math.abs(normalizedDurationSec - itemDurationSec) <= 1.5;
      return sameName && (sameSize || similarDuration);
    });
    if (existingIndex >= 0) {
      const nextTracks = [...existingTracks];
      nextTracks[existingIndex] = {
        ...nextTracks[existingIndex],
        ...normalized,
        slotLabel: String(nextTracks[existingIndex]?.slotLabel || normalized.slotLabel || `Audio ${existingIndex + 1}`).trim() || `Audio ${existingIndex + 1}`,
        localDataUrl: ""
      };
      setPanelMusicUploadedTracks(nextTracks, { selectIndex: existingIndex });
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      syncMusicControls();
      renderPodcastVideoTimeline(getActiveSession());
      return true;
    }
    const nextTrack = {
      ...normalized,
      slotLabel: `Audio ${existingTracks.length + 1}`,
      localDataUrl: ""
    };
    setPanelMusicUploadedTracks([...existingTracks, nextTrack], { selectIndex: existingTracks.length });
    persistPanelMusicSettings();
    persistPanelMusicToActiveSession();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
    return true;
  }

  function reconcileSessionUploadedTracksWithGlobalLibrary() {
    const libraryById = new Map(
      (Array.isArray(panelMusicGlobalLibraryState.items) ? panelMusicGlobalLibraryState.items : [])
        .map((item) => [String(item?.libraryId || "").trim(), normalizeGlobalPanelMusicLibraryTrack(item)])
        .filter(([libraryId, item]) => libraryId && item)
    );
    const existingTracks = getPanelMusicUploadedTracks();
    if (!existingTracks.length || !libraryById.size) return false;
    let changed = false;
    const nextTracks = existingTracks.map((track, index) => {
      const libraryId = String(track?.libraryId || "").trim();
      const libraryTrack = libraryId ? libraryById.get(libraryId) : null;
      if (!libraryTrack) return track;
      const needsRepair = !String(track?.downloadUrl || "").trim() || !String(track?.storagePath || "").trim();
      if (!needsRepair) return track;
      changed = true;
      return normalizePanelMusicTrack({
        ...track,
        ...libraryTrack,
        slotLabel: String(track?.slotLabel || libraryTrack?.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
        localDataUrl: ""
      });
    });
    if (!changed) return false;
    const selectedTrack = normalizePanelMusicTrack(panelMusicState.track);
    const selectedIndex = selectedTrack && !selectedTrack.model
      ? Math.max(0, nextTracks.findIndex((track) => String(track?.slotLabel || "").trim() === String(selectedTrack.slotLabel || "").trim()))
      : 0;
    setPanelMusicUploadedTracks(nextTracks, { selectIndex: selectedIndex });
    persistPanelMusicSettings();
    persistPanelMusicToActiveSession();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
    return true;
  }

  async function fetchGlobalPanelMusicLibrary(options = {}) {
    panelMusicGlobalLibraryState.loading = true;
    if (options.render !== false) syncMusicControls();
    try {
      const response = await authFetchJson("/api/podcaster/music/library/list", { method: "GET" });
      panelMusicGlobalLibraryState.items = Array.isArray(response?.tracks)
        ? response.tracks.map((track) => normalizeGlobalPanelMusicLibraryTrack(track)).filter(Boolean)
        : [];
      panelMusicGlobalLibraryState.loadedAt = nowIso();
      panelMusicGlobalLibraryState.error = "";
      reconcileSessionUploadedTracksWithGlobalLibrary();
    } catch (error) {
      panelMusicGlobalLibraryState.error = String(error?.message || "No se pudo cargar la biblioteca global.");
    } finally {
      panelMusicGlobalLibraryState.loading = false;
      if (options.render !== false) syncMusicControls();
    }
    return panelMusicGlobalLibraryState.items;
  }

  function loadPanelMusicSettings() {
    const storageKey = resolvePanelMusicStorageKey();
    const normalizeDucking = (value, fallback = 60) => {
      const raw = Number(value);
      if (!Number.isFinite(raw)) return fallback;
      if (raw >= 40 && raw <= 100) return raw;
      if (raw >= 0 && raw < 40) return Math.max(40, 100 - raw);
      return fallback;
    };
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const preset = ["ambient", "focus", "pulse"].includes(parsed?.preset) ? parsed.preset : "ambient";
      const volume = Math.max(0, Math.min(100, Number(parsed?.volume ?? 22)));
      const montageVolume = Math.max(0, Math.min(100, Number(parsed?.montageVolume ?? 0)));
      const duckingWhenGeminiPct = normalizeDucking(parsed?.duckingWhenGeminiPct, 60);
      const stabilize = parsed?.stabilize === true || String(parsed?.stabilize || "").trim().toLowerCase() === "true";
      const limiterEnabled = parsed?.limiterEnabled === true || String(parsed?.limiterEnabled || "").trim().toLowerCase() === "true";
      const sourceType = parsed?.sourceType === "track" ? "track" : "preset";
      const legacyTrack = normalizePanelMusicTrack(parsed?.track || null);
      const trackLibrary = {
        uploaded: normalizePanelMusicTrack(parsed?.trackLibrary?.uploaded || null),
        uploadedTracks: normalizePanelMusicTrackList(parsed?.trackLibrary?.uploadedTracks || []),
        ai: normalizePanelMusicTrack(parsed?.trackLibrary?.ai || null)
      };
      if (!trackLibrary.uploadedTracks.length && trackLibrary.uploaded) {
        trackLibrary.uploadedTracks = [{ ...trackLibrary.uploaded, slotLabel: String(trackLibrary.uploaded.slotLabel || "Audio 1").trim() || "Audio 1", enabledInSession: trackLibrary.uploaded.enabledInSession !== false }];
      }
      if (!trackLibrary.uploaded && trackLibrary.uploadedTracks.length) trackLibrary.uploaded = trackLibrary.uploadedTracks[0];
      if (!trackLibrary.uploaded && legacyTrack && !legacyTrack.model) trackLibrary.uploaded = legacyTrack;
      if (!trackLibrary.ai && legacyTrack && legacyTrack.model) trackLibrary.ai = legacyTrack;
      const selectedTrackKind = resolvePanelMusicTrackKind(parsed?.selectedTrackKind || (trackLibrary.ai && !trackLibrary.uploaded ? "ai" : "uploaded"));
      const selectedTrackRef = parsed?.selectedTrackRef && typeof parsed.selectedTrackRef === "object"
        ? parsed.selectedTrackRef
        : buildPanelMusicStorageTrackRef(parsed?.track || null);
      const track = resolveStoredPanelMusicTrack(trackLibrary, selectedTrackRef, selectedTrackKind);
      return {
        preset,
        volume,
        montageVolume,
        duckingWhenGeminiPct,
        stabilize,
        limiterEnabled,
        sourceType,
        selectedTrackKind,
        trackLibrary,
        track,
        playing: false
      };
    } catch (_) {
      return {
        preset: "ambient",
        volume: 22,
        montageVolume: 100,
        duckingWhenGeminiPct: 60,
        stabilize: false,
        limiterEnabled: false,
        sourceType: "preset",
        selectedTrackKind: "uploaded",
        trackLibrary: { uploaded: null, uploadedTracks: [], ai: null },
        track: null,
        playing: false
      };
    }
  }

  function loadPanelMusicSettingsIntoState() {
    Object.assign(panelMusicState, loadPanelMusicSettings());
    syncActivePanelMusicTrack({ kind: panelMusicState.selectedTrackKind });
    return panelMusicState;
  }

  function buildDefaultPanelMusicAiPrompt(session = null) {
    const activeSession = session || getActiveSession();
    const hosts = (activeSession?.script?.hosts || []).filter(Boolean);
    const speakers = hosts.length ? hosts.join(", ") : "dos hosts";
    const title = String(activeSession?.title || "").trim();
    const rows = getSessionRows(activeSession);
    const scenarioHint = String(activeSession?.speakerScenarioMap?.[String(rows[0]?.speaker || "").trim()] || "").replace(/\s+/g, " ").trim();
    const preset = String(panelMusicState.preset || "ambient").trim().toLowerCase();
    const styleMap = {
      ambient: "ambient cinematica suave, pads calidos, piano sutil, texturas etereas",
      focus: "lofi instrumental enfocada, piano limpio, percusion ligera, sintes suaves",
      pulse: "electronic ligera, ritmo moderno, bajo limpio, sintetizadores energicos"
    };
    return [
      "Instrumental only. No vocals, no spoken words, no choir, no narration.",
      "Background music for a conversational podcast studio.",
      `Mood/style: ${styleMap[preset] || styleMap.ambient}.`,
      `Hosts: ${speakers}.`,
      title ? `Podcast title: ${title}.` : "",
      scenarioHint ? `Scenario inspiration: ${scenarioHint}.` : "",
      "Keep it polished, loop-friendly, non-intrusive, warm, and supportive under dialogue."
    ].filter(Boolean).join(" ");
  }

  async function generatePanelMusicWithAi() {
    const session = getActiveSession();
    const sessionId = String(session?.id || "").trim();
    if (!sessionId) throw new Error("No hay sesión activa.");
    const els = getEls();
    const promptInput = String(els.panelMusicAiPrompt?.value || "").replace(/\s+/g, " ").trim();
    const prompt = promptInput || buildDefaultPanelMusicAiPrompt(session);
    const previousAiTrack = getPanelMusicTrackByKind("ai");
    let response = null;
    try {
      response = await authFetchJson("/api/podcaster/music/generate", {
        method: "POST",
        body: {
          sessionId,
          prompt,
          preset: String(panelMusicState.preset || "ambient").trim(),
          previousStoragePath: String(previousAiTrack?.storagePath || "").trim()
        }
      });
    } catch (error) {
      const detail = String(error?.message || "").trim().toLowerCase();
      if (detail.includes("http 404") || detail.includes("not found")) {
        throw new Error("El backend activo no expone /api/podcaster/music/generate. Reinicia con npm run dev:local o despliega la versión nueva en Render.");
      }
      throw error;
    }
    const track = response?.track && typeof response.track === "object" ? response.track : null;
    if (!track) throw new Error("No se recibió track generado.");
    setPanelMusicTrack("ai", {
      name: String(track.name || "AI Music").trim() || "AI Music",
      mimeType: String(track.mimeType || "audio/mpeg").trim() || "audio/mpeg",
      size: Math.max(0, Number(track.size || 0) || 0),
      durationSec: Math.max(0, Number(track.durationSec || 0) || 0),
      localDataUrl: "",
      downloadUrl: String(track.downloadUrl || "").trim(),
      storagePath: String(track.storagePath || "").trim(),
      updatedAt: String(track.updatedAt || nowIso()).trim() || nowIso(),
      model: String(track.model || "").trim(),
      prompt
    }, { select: true });
    persistPanelMusicSettings();
    persistPanelMusicToActiveSession();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
    if (getPanelMusicTrackDurationSec(panelMusicState.track) <= 0.05) {
      ensurePanelMusicTrackDuration("ai").catch(() => { });
    }
    if (panelMusicState.playing) {
      stopPanelMusic();
      await startPanelMusic();
    }
    return panelMusicState.track;
  }

  function resolvePanelMusicTrackSrc() {
    const track = normalizePanelMusicTrack(panelMusicState.track);
    if (!track) return "";
    const localDataUrl = String(track.localDataUrl || "").trim();
    if (localDataUrl) return localDataUrl;
    const remote = String(track.downloadUrl || "").trim();
    return resolveStorageAudioUrl(remote);
  }

  function stopPanelMusic() {
    if (panelMusicAudioEl) {
      try { panelMusicAudioEl.pause(); } catch (_) { }
      panelMusicAudioEl = null;
    }
    panelMusicNodes.forEach((node) => {
      try { if (node?.stop) node.stop(); } catch (_) { }
      try { if (node?.disconnect) node.disconnect(); } catch (_) { }
    });
    panelMusicNodes = [];
    panelMusicState.playing = false;
    syncMusicControls();
  }

  async function startPanelMusic() {
    if (podcastVideoState()?.montageActive) return;
    if (panelMusicState.playing) return;
    const musicSrc = panelMusicState.sourceType === "track" ? resolvePanelMusicTrackSrc() : "";
    if (musicSrc) {
      const audio = new Audio(musicSrc);
      audio.crossOrigin = "anonymous";
      audio.loop = true;
      audio.volume = Math.max(0, Math.min(1, (Number(panelMusicState.volume) || 0) / 100));
      panelMusicAudioEl = audio;
      await audio.play();
      panelMusicState.playing = true;
      syncMusicControls();
      return;
    }
    if (!panelMusicAudioCtx) panelMusicAudioCtx = new AudioContext();
    if (panelMusicAudioCtx.state === "suspended") await panelMusicAudioCtx.resume().catch(() => { });
    const ctx = panelMusicAudioCtx;
    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.9;
    master.gain.value = Math.max(0, Math.min(1, (Number(panelMusicState.volume) || 0) / 100 * 0.22));
    filter.connect(master);
    master.connect(ctx.destination);
    const pushOsc = (type, freq, gainValue, detune = 0) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      panelMusicNodes.push(osc, gain);
    };
    if (panelMusicState.preset === "focus") {
      pushOsc("triangle", 180, 0.21);
      pushOsc("sine", 270, 0.13, 4);
    } else if (panelMusicState.preset === "pulse") {
      pushOsc("sawtooth", 92, 0.14);
      pushOsc("square", 184, 0.08, -3);
    } else {
      pushOsc("sine", 146.83, 0.18);
      pushOsc("sine", 220, 0.11, 6);
    }
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = panelMusicState.preset === "pulse" ? 0.22 : 0.08;
    lfoGain.gain.value = panelMusicState.preset === "pulse" ? 0.04 : 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();
    panelMusicNodes.push(master, filter, lfo, lfoGain);
    panelMusicState.playing = true;
    syncMusicControls();
  }

  function syncMusicControls() {
    const els = getEls();
    if (els.panelMusicPreset) els.panelMusicPreset.value = panelMusicState.preset;
    if (els.panelMusicVolume) els.panelMusicVolume.value = String(panelMusicState.volume);
    if (els.panelMusicTrackInfo) {
      const uploadedTracks = getPanelMusicUploadedTracks();
      const track = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
      if (panelMusicState.sourceType === "track" && track) {
        const origin = panelMusicState.selectedTrackKind === "ai"
          ? "IA"
          : (track.storagePath ? "Firebase" : track.localDataUrl ? "Local" : "Sin origen");
        els.panelMusicTrackInfo.textContent = panelMusicState.selectedTrackKind === "uploaded" && uploadedTracks.length > 1
          ? `${uploadedTracks.length} audios cargados · ${origin}`
          : `${track.slotLabel || track.name || "Audio"} · ${origin}`;
      } else {
        els.panelMusicTrackInfo.textContent = "Sin canción seleccionada. Se usará preset.";
      }
    }
    if (els.panelMusicTrackList) {
      const uploadedTracks = getPanelMusicUploadedTracks();
      const selectedCount = uploadedTracks.filter((track) => track?.enabledInSession !== false).length;
      els.panelMusicTrackList.innerHTML = uploadedTracks.length
        ? uploadedTracks.map((track, index) => {
          const isSelected = panelMusicState.selectedTrackKind === "uploaded"
            && !panelMusicState.track?.model
            && String(panelMusicState.track?.slotLabel || "").trim() === String(track.slotLabel || "").trim();
          const isEnabledInSession = track.enabledInSession !== false;
          const origin = track.storagePath ? "Firebase" : (track.localDataUrl ? "Local" : "Sin origen");
          return `
            <div class="panel-music-track-item${isSelected ? " is-selected" : ""}${isEnabledInSession ? "" : " is-disabled"}">
              <span class="panel-music-track-item-copy">
                <strong>${escapeHtml(track.slotLabel || `Audio ${index + 1}`)}</strong>
                <span>${escapeHtml(track.name || "Audio")} · ${escapeHtml(origin)} · ${escapeHtml(`${Math.round(getPanelMusicTrackDurationSec(track))}s`)} · ${isEnabledInSession ? "Seleccionado" : "No seleccionado"}</span>
              </span>
              <span class="panel-music-track-item-actions">
                <button class="row-icon-btn" type="button" data-action="toggle-session-audio-enabled" data-track-index="${index}" title="${isEnabledInSession ? "Quitar de esta sesión" : "Seleccionar para esta sesión"}">
                  <i class="fas ${isEnabledInSession ? "fa-check-square" : "fa-square"}"></i>
                </button>
                <button class="row-icon-btn" type="button" data-action="select-uploaded-audio-item" data-track-index="${index}" title="Editar este audio">
                  <i class="fas fa-sliders-h"></i>
                </button>
                <button class="row-icon-btn" type="button" data-action="remove-session-audio-item" data-track-index="${index}" title="Quitar de esta sesión">
                  <i class="fas fa-times"></i>
                </button>
              </span>
            </div>
          `;
        }).join("")
        : `<div class="music-track-info">Sin audios cargados.</div>`;
      if (els.selectAllSessionAudiosBtn) els.selectAllSessionAudiosBtn.disabled = !uploadedTracks.length || selectedCount === uploadedTracks.length;
      if (els.clearAllSessionAudiosBtn) els.clearAllSessionAudiosBtn.disabled = !uploadedTracks.length || selectedCount <= 1;
    }
    if (els.panelMusicGlobalLibraryList) {
      if (panelMusicGlobalLibraryState.loading) {
        els.panelMusicGlobalLibraryList.innerHTML = `<div class="music-track-info">Cargando biblioteca global...</div>`;
      } else if (panelMusicGlobalLibraryState.error) {
        els.panelMusicGlobalLibraryList.innerHTML = `<div class="music-track-info">${escapeHtml(panelMusicGlobalLibraryState.error)}</div>`;
      } else if (panelMusicGlobalLibraryState.items.length) {
        els.panelMusicGlobalLibraryList.innerHTML = panelMusicGlobalLibraryState.items.map((track) => `
          <div class="panel-music-track-item">
            <span class="panel-music-track-item-copy">
              <strong>${escapeHtml(track.name || "Audio")}</strong>
              <span>${escapeHtml(`${Math.round(getPanelMusicTrackDurationSec(track))}s`)}${track.ownerEmail ? ` · ${escapeHtml(track.ownerEmail)}` : ""}</span>
            </span>
            <span class="panel-music-track-item-actions">
              <button class="row-icon-btn" type="button" data-action="use-global-audio-item" data-library-id="${escapeHtml(track.libraryId)}" title="Añadir a esta sesión">
                <i class="fas fa-plus"></i>
              </button>
              <button class="row-icon-btn" type="button" data-action="delete-global-audio-item" data-library-id="${escapeHtml(track.libraryId)}" title="Eliminar de la biblioteca global">
                <i class="fas fa-trash"></i>
              </button>
            </span>
          </div>
        `).join("");
      } else {
        els.panelMusicGlobalLibraryList.innerHTML = `<div class="music-track-info">No hay audios globales todavía.</div>`;
      }
    }
    if (els.audioTrackSourceSelect) {
      const uploadedTrack = getPanelMusicTrackAvailability("uploaded");
      const aiTrack = getPanelMusicTrackAvailability("ai");
      els.audioTrackSourceSelect.value = panelMusicState.sourceType === "track"
        ? resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind)
        : "preset";
      const uploadedOption = els.audioTrackSourceSelect.querySelector('option[value="uploaded"]');
      const aiOption = els.audioTrackSourceSelect.querySelector('option[value="ai"]');
      if (uploadedOption) uploadedOption.disabled = !uploadedTrack;
      if (aiOption) aiOption.disabled = !aiTrack;
    }
    if (els.audioTrackSourceInfo) {
      const uploadedTrack = getPanelMusicTrackAvailability("uploaded");
      const aiTrack = getPanelMusicTrackAvailability("ai");
      const currentLabel = panelMusicState.sourceType === "track" && panelMusicState.track
        ? `${panelMusicState.selectedTrackKind === "ai" ? "Usando IA" : "Usando audio cargado"}: ${panelMusicState.track.name || "Audio"}`
        : "Usando preset del estudio.";
      const inventory = [
        uploadedTrack ? `Cargado: ${uploadedTrack.name || "Audio"}` : "Cargado: ninguno",
        aiTrack ? `IA: ${aiTrack.name || "Audio IA"}` : "IA: ninguno"
      ].join(" · ");
      els.audioTrackSourceInfo.textContent = `${currentLabel} ${inventory}`;
    }
    if (els.panelMusicAiPrompt && !String(els.panelMusicAiPrompt.value || "").trim()) {
      els.panelMusicAiPrompt.value = buildDefaultPanelMusicAiPrompt(getActiveSession());
    }
    if (els.panelMusicPlayBtn) els.panelMusicPlayBtn.disabled = panelMusicState.playing;
    if (els.panelMusicStopBtn) els.panelMusicStopBtn.disabled = !panelMusicState.playing;
    if (els.clearPanelMusicTrackBtn) els.clearPanelMusicTrackBtn.disabled = !panelMusicState.track;
    if (els.generatePanelMusicAiBtn) els.generatePanelMusicAiBtn.disabled = panelMusicAiGenerating;
    const activeTrack = (panelMusicState.selectedTrackKind === "uploaded" && panelMusicState.track) ? panelMusicState.track : null;
    const globalAudioMix = getGlobalAudioMixState();
    const currentVolume = globalAudioMix.masterVolume;
    const currentDuck = activeTrack ? activeTrack.duckingWhenGeminiPct : panelMusicState.duckingWhenGeminiPct;
    const currentStabilize = globalAudioMix.stabilize;
    const currentLimiterEnabled = globalAudioMix.limiterEnabled;
    if (els.audioTrackMontageVolume) els.audioTrackMontageVolume.value = String(Math.max(0, Math.min(100, Number(currentVolume) || 0)));
    if (els.audioTrackMontageVolumeNumber) els.audioTrackMontageVolumeNumber.value = String(Math.max(0, Math.min(100, Number(currentVolume) || 0)));
    if (els.audioTrackDuckVolume) els.audioTrackDuckVolume.value = String(Math.max(40, Math.min(100, Number(currentDuck) || 60)));
    if (els.audioTrackDuckVolumeNumber) els.audioTrackDuckVolumeNumber.value = String(Math.max(40, Math.min(100, Number(currentDuck) || 60)));
    if (els.audioTrackStabilizeToggle) els.audioTrackStabilizeToggle.checked = currentStabilize === true;
    if (els.audioTrackLimiterToggle) els.audioTrackLimiterToggle.checked = currentLimiterEnabled;
    if (els.audioTrackMixInfo) {
      els.audioTrackMixInfo.textContent = `Volumen general ${Math.round(Number(currentVolume) || 0)}% · ${currentStabilize ? "Estabilización activa" : "Sin estabilización"} · ${currentLimiterEnabled ? "Limitador activo" : "Sin limitador"}`;
    }
  }

  function syncPanelMusicStateFromSession(session = null) {
    const cfg = session?.panelMusicConfig && typeof session.panelMusicConfig === "object" ? session.panelMusicConfig : null;
    if (!cfg) return;
    const sessionId = String(session?.id || "").trim();
    const hydrateTrackFromCache = (track, kind) => {
      const normalized = normalizePanelMusicTrack(track);
      if (!normalized || String(normalized.localDataUrl || "").trim()) return normalized;
      const cachedLocalDataUrl = loadPanelMusicSessionTrackCache(sessionId, kind);
      return cachedLocalDataUrl ? { ...normalized, localDataUrl: cachedLocalDataUrl } : normalized;
    };
    const next = {
      preset: ["ambient", "focus", "pulse"].includes(String(cfg?.preset || "").trim()) ? String(cfg.preset).trim() : "ambient",
      volume: Math.max(0, Math.min(100, Number(cfg?.volume) || 22)),
      montageVolume: Math.max(0, Math.min(100, Number(cfg?.montageVolume ?? cfg?.volume ?? 0))),
      duckingWhenGeminiPct: (() => {
        const raw = Number(cfg?.duckingWhenGeminiPct);
        if (!Number.isFinite(raw)) return 60;
        if (raw >= 40 && raw <= 100) return raw;
        if (raw >= 0 && raw < 40) return Math.max(40, 100 - raw);
        return 60;
      })(),
      stabilize: cfg?.stabilize === true || String(cfg?.stabilize || "").trim().toLowerCase() === "true",
      limiterEnabled: cfg?.limiterEnabled === true || String(cfg?.limiterEnabled || "").trim().toLowerCase() === "true",
      sourceType: String(cfg?.sourceType || "").trim() === "track" ? "track" : "preset",
      selectedTrackKind: resolvePanelMusicTrackKind(cfg?.selectedTrackKind || "uploaded"),
      trackLibrary: {
        uploaded: hydrateTrackFromCache(cfg?.trackLibrary?.uploaded || null, "uploaded"),
        uploadedTracks: normalizePanelMusicTrackList((cfg?.trackLibrary?.uploadedTracks || []).map((track) => hydrateTrackFromCache(track, "uploaded"))),
        ai: hydrateTrackFromCache(cfg?.trackLibrary?.ai || null, "ai")
      },
      track: hydrateTrackFromCache(cfg?.track || null, cfg?.track?.model ? "ai" : "uploaded")
    };
    if (!next.trackLibrary.uploaded && next.track && !next.track.model) next.trackLibrary.uploaded = next.track;
    if (!next.trackLibrary.uploadedTracks.length && next.trackLibrary.uploaded) {
      next.trackLibrary.uploadedTracks = [{ ...next.trackLibrary.uploaded, slotLabel: String(next.trackLibrary.uploaded.slotLabel || "Audio 1").trim() || "Audio 1" }];
    }
    if (!next.trackLibrary.ai && next.track && next.track.model) next.trackLibrary.ai = next.track;
    Object.assign(panelMusicState, next);
    syncActivePanelMusicTrack({ kind: next.selectedTrackKind });
    const activeTrack = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
    const shouldProbeTrackDuration = panelMusicState.sourceType === "track" && (
      getPanelMusicTrackDurationSec(activeTrack) <= 0.05
      || String(activeTrack?.durationMeasuredWith || "").trim().toLowerCase() !== "decode"
    );
    if (shouldProbeTrackDuration) {
      ensurePanelMusicTrackDuration(panelMusicState.selectedTrackKind, {
        render: false,
        force: getPanelMusicTrackDurationSec(activeTrack) > 0.05
      }).then(() => {
        syncMusicControls();
        renderPodcastVideoTimeline(getActiveSession());
      }).catch(() => { });
    }
    if (getEnabledPanelMusicUploadedTracks().length) {
      ensureAllEnabledUploadedTrackDurations({ render: false, force: false }).then(() => {
        syncMusicControls();
        renderPodcastVideoTimeline(getActiveSession());
      }).catch(() => { });
    }
  }

  function setPanelMontageMusicVolume(nextVolume = 22) {
    const clamped = Math.max(0, Math.min(100, Number(nextVolume) || 0));
    panelMusicState.montageVolume = clamped;
    persistGlobalAudioMixState({ masterVolume: clamped });
    const els = getEls();
    if (els.audioTrackMontageVolume) els.audioTrackMontageVolume.value = String(clamped);
    if (els.audioTrackMontageVolumeNumber) els.audioTrackMontageVolumeNumber.value = String(clamped);
    persistAudioTrackMixSettings();
    syncMusicControls();
  }

  function setPanelMontageDuckingWhenGeminiPct(nextValue = 60) {
    const clamped = Math.max(40, Math.min(100, Number(nextValue) || 0));
    if (panelMusicState.selectedTrackKind === "uploaded" && panelMusicState.track) {
      const currentTrack = normalizePanelMusicTrack(panelMusicState.track);
      const currentSlotLabel = String(currentTrack?.slotLabel || "").trim();
      const currentLibraryId = String(currentTrack?.libraryId || "").trim();
      const idx = getPanelMusicUploadedTracks().findIndex((track) => {
        const trackSlotLabel = String(track?.slotLabel || "").trim();
        const trackLibraryId = String(track?.libraryId || "").trim();
        if (currentSlotLabel && trackSlotLabel === currentSlotLabel) return true;
        if (currentLibraryId && trackLibraryId === currentLibraryId) return true;
        return false;
      });
      const nextTrack = {
        ...(currentTrack || {}),
        duckingWhenGeminiPct: clamped,
        updatedAt: nowIso()
      };
      if (idx >= 0) {
        updateUploadedTrackAt(idx, nextTrack, { selectIndex: idx });
      } else {
        setPanelMusicTrack("uploaded", nextTrack, { select: true });
      }
    } else {
      panelMusicState.duckingWhenGeminiPct = clamped;
    }
    const els = getEls();
    if (els.audioTrackDuckVolume) els.audioTrackDuckVolume.value = String(clamped);
    if (els.audioTrackDuckVolumeNumber) els.audioTrackDuckVolumeNumber.value = String(clamped);
    persistAudioTrackMixSettings();
    syncMusicControls();
  }

  function setPanelMontageStabilize(enabled = false) {
    const isEnabled = enabled === true;
    panelMusicState.stabilize = isEnabled;
    persistGlobalAudioMixState({ audioMasterStabilize: isEnabled });
    const els = getEls();
    if (els.audioTrackStabilizeToggle) els.audioTrackStabilizeToggle.checked = isEnabled;
    persistAudioTrackMixSettings();
    syncMusicControls();
  }

  function setPanelMontageLimiterEnabled(enabled = false) {
    const isEnabled = enabled === true;
    panelMusicState.limiterEnabled = isEnabled;
    persistGlobalAudioMixState({ audioMasterLimiterEnabled: isEnabled });
    const els = getEls();
    if (els.audioTrackLimiterToggle) els.audioTrackLimiterToggle.checked = isEnabled;
    persistAudioTrackMixSettings();
    syncMusicControls();
  }

  function togglePanelMusicLoopMute(loopIndex = 0, kind = "") {
    const trackKind = resolvePanelMusicTrackKind(kind || panelMusicState.selectedTrackKind);
    const track = getPanelMusicTrackByKind(trackKind);
    if (!track) return false;
    const normalizedLoopIndex = Math.max(0, Math.floor(Number(loopIndex) || 0));
    const currentMuted = new Set(normalizePanelMusicMutedLoopIndexes(track.mutedLoopIndexes || []));
    if (currentMuted.has(normalizedLoopIndex)) currentMuted.delete(normalizedLoopIndex);
    else currentMuted.add(normalizedLoopIndex);
    setPanelMusicTrack(trackKind, {
      ...track,
      mutedLoopIndexes: Array.from(currentMuted).sort((a, b) => a - b),
      updatedAt: nowIso()
    }, { select: panelMusicState.selectedTrackKind === trackKind });
    persistAudioTrackMixSettings();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
    return true;
  }

  function updatePanelMusicTrack(kind = "", mutator = null, options = {}) {
    const trackKind = resolvePanelMusicTrackKind(kind || panelMusicState.selectedTrackKind);
    const track = getPanelMusicTrackByKind(trackKind);
    if (!track || typeof mutator !== "function") return false;
    const nextTrack = normalizePanelMusicTrack(mutator({ ...track }));
    if (!nextTrack) return false;
    setPanelMusicTrack(trackKind, nextTrack, { select: panelMusicState.selectedTrackKind === trackKind || options.select === true });
    persistAudioTrackMixSettings();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
    return true;
  }

  function handleTimelineSelectAudioLoopChip(target = null, event = null) {
    const chip = target?.closest?.("[data-action='timeline-select-audio-loop']");
    if (!chip) return false;
    const trackIndex = Number(chip.dataset.trackIndex);
    const trackKind = resolvePanelMusicTrackKind(chip.dataset.trackKind || panelMusicState.selectedTrackKind);
    const loopIndex = Math.max(0, Math.floor(Number(chip.dataset.loopIndex || 0) || 0));
    const selectionState = podcastVideoState()?.timelineAudioSelection || null;
    const buildSelectionKey = (kind = "", loop = 0) => `${resolvePanelMusicTrackKind(kind)}:${Math.max(0, Math.floor(Number(loop || 0) || 0))}`;
    if (selectionState) {
      selectionState.geminiRowIds?.clear?.();
    }
    if (trackKind === "uploaded" && Number.isFinite(trackIndex)) {
      const key = `u:${Math.max(0, Math.floor(trackIndex || 0))}:${loopIndex}`;
      const multi = event?.metaKey || event?.ctrlKey;
      const selection = selectionState?.uploadedKeys;
      if (selection instanceof Set) {
        if (multi) {
          if (selection.has(key)) selection.delete(key);
          else selection.add(key);
        } else {
          selection.clear();
          selection.add(key);
        }
      }
      if (selectionState) {
        selectionState.panelLoopKey = "";
      }
    } else if (selectionState) {
      selectionState.uploadedKeys?.clear?.();
      selectionState.panelLoopKey = buildSelectionKey(trackKind, loopIndex);
    }
    if (Number.isFinite(trackIndex)) {
      selectUploadedPanelMusicTrackByIndex(trackIndex);
    } else if (trackKind !== panelMusicState.selectedTrackKind) {
      selectPanelMusicTrackKind(trackKind, { notify: false });
    }
    podcastAudioTrackUiState.activeLoopIndex = loopIndex;
    renderPodcastVideoTimeline(getActiveSession());
    return true;
  }

  function handleTimelineToggleAudioLoopMute(target = null) {
    const btn = target?.closest?.("[data-action='timeline-toggle-audio-loop-mute']");
    if (!btn) return false;
    const trackIndex = Number(btn.dataset.trackIndex);
    const trackKind = resolvePanelMusicTrackKind(btn.dataset.trackKind || panelMusicState.selectedTrackKind);
    if (Number.isFinite(trackIndex)) {
      selectUploadedPanelMusicTrackByIndex(trackIndex);
    } else if (trackKind !== panelMusicState.selectedTrackKind) {
      selectPanelMusicTrackKind(trackKind, { notify: false });
    }
    const loopIndex = Math.max(0, Math.floor(Number(btn.dataset.loopIndex || 0) || 0));
    togglePanelMusicLoopMute(loopIndex, trackKind);
    return true;
  }

  async function ensurePanelMusicTrackUploaded(sessionId = "", options = {}) {
    const silent = options.silent === true;
    if (panelMusicState.sourceType !== "track" || !panelMusicState.track) return null;
    if (resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind) !== "uploaded") return panelMusicState.track;
    const currentTrack = panelMusicState.track;
    const existingStoragePath = String(currentTrack.storagePath || "").trim();
    const existingDownloadUrl = String(currentTrack.downloadUrl || "").trim();
    if (existingStoragePath && existingDownloadUrl) return currentTrack;
    const localDataUrl = String(currentTrack.localDataUrl || "").trim();
    if (!localDataUrl) throw new Error("No se encontró el archivo local para subir música a Storage.");
    if (!silent) setGenerationStatus("Subiendo música a Firebase Storage...", "is-busy");
    const upload = await authFetchJson("/api/podcaster/music/upload", {
      method: "POST",
      body: JSON.stringify({
        sessionId: String(sessionId || getActiveSession()?.id || "").trim(),
        fileName: String(currentTrack.name || "podcast-music").trim() || "podcast-music",
        mimeType: String(currentTrack.mimeType || "audio/mpeg").trim() || "audio/mpeg",
        durationSec: Math.max(0, Number(currentTrack.durationSec || 0) || 0),
        audioDataUrl: localDataUrl,
        previousStoragePath: existingStoragePath
      })
    });
    setPanelMusicTrack("uploaded", {
      ...currentTrack,
      durationSec: Math.max(0, Number(upload?.track?.durationSec || currentTrack.durationSec || 0) || 0),
      startOffsetMs: Math.max(0, Number(currentTrack.startOffsetMs || 0) || 0),
      durationMeasuredWith: String(currentTrack.durationMeasuredWith || "").trim().toLowerCase(),
      downloadUrl: String(upload?.track?.downloadUrl || "").trim(),
      storagePath: String(upload?.track?.storagePath || "").trim(),
      updatedAt: String(upload?.track?.updatedAt || nowIso()).trim() || nowIso(),
      localDataUrl: ""
    }, { select: true });
    const uploadedTracks = getPanelMusicUploadedTracks();
    const selectedIndex = Math.max(0, uploadedTracks.findIndex((item) => String(item.slotLabel || "").trim() === String(currentTrack.slotLabel || "").trim()));
    updateUploadedTrackAt(selectedIndex, {
      ...currentTrack,
      durationSec: Math.max(0, Number(upload?.track?.durationSec || currentTrack.durationSec || 0) || 0),
      startOffsetMs: Math.max(0, Number(currentTrack.startOffsetMs || 0) || 0),
      durationMeasuredWith: String(currentTrack.durationMeasuredWith || "").trim().toLowerCase(),
      downloadUrl: String(upload?.track?.downloadUrl || "").trim(),
      storagePath: String(upload?.track?.storagePath || "").trim(),
      updatedAt: String(upload?.track?.updatedAt || nowIso()).trim() || nowIso(),
      localDataUrl: ""
    }, { selectIndex: selectedIndex });
    persistPanelMusicSettings();
    persistPanelMusicToActiveSession();
    syncMusicControls();
    return panelMusicState.track;
  }

  loadPanelMusicSettingsIntoState();

  return {
    panelMusicState,
    panelMusicGlobalLibraryState,
    podcastAudioTrackUiState,
    resolvePanelMusicStorageKey,
    resolvePanelMusicSessionCacheKey,
    persistPanelMusicSessionTrackCache,
    loadPanelMusicSessionTrackCache,
    hydratePanelMusicLocalCaches,
    normalizePanelMusicMutedLoopIndexes,
    normalizePanelMusicLoopSettings,
    normalizePanelMusicTrack,
    normalizeGlobalPanelMusicLibraryTrack,
    normalizePanelMusicTrackList,
    resolvePanelMusicTrackKind,
    getPanelMusicUploadedTracks,
    getEnabledPanelMusicUploadedTracks,
    setPanelMusicUploadedTracks,
    setAllSessionUploadedTracksEnabled,
    toggleSessionUploadedTrackEnabled,
    removeUploadedTrackAt,
    addGlobalMusicTrackToSession,
    reconcileSessionUploadedTracksWithGlobalLibrary,
    fetchGlobalPanelMusicLibrary,
    updateUploadedTrackAt,
    getPanelMusicTrackByKind,
    getPanelMusicTrackAvailability,
    getAvailablePanelMusicTrackKinds,
    getPanelMusicTrackDurationSec,
    getPanelMusicLoopCount,
    buildUploadedPanelMusicSegments,
    groupUploadedPanelMusicSegmentsByTrack,
    getPanelMusicLoopSegments,
    getPanelMusicLoopSetting,
    upsertPanelMusicLoopSetting,
    measureAudioDurationInfoFromFile,
    ensurePanelMusicTrackDuration,
    ensureAllEnabledUploadedTrackDurations,
    togglePanelMusicLoopMute,
    updatePanelMusicTrack,
    syncActivePanelMusicTrack,
    selectPanelMusicTrackKind,
    selectUploadedPanelMusicTrackByIndex,
    setPanelMusicTrack,
    loadPanelMusicSettings,
    loadPanelMusicSettingsIntoState,
    persistPanelMusicSettings,
    persistPanelMusicToActiveSession,
    persistAudioTrackMixSettings,
    buildDefaultPanelMusicAiPrompt,
    generatePanelMusicWithAi,
    syncMusicControls,
    syncPanelMusicStateFromSession,
    setPanelMontageMusicVolume,
    setPanelMontageDuckingWhenGeminiPct,
    setPanelMontageStabilize,
    setPanelMontageLimiterEnabled,
    stopPanelMusic,
    startPanelMusic,
    resolvePanelMusicTrackSrc,
    getPanelMontageMusicConfig,
    handleTimelineSelectAudioLoopChip,
    handleTimelineToggleAudioLoopMute,
    ensurePanelMusicTrackUploaded,
    getPanelMusicAiGenerating: () => panelMusicAiGenerating,
    setPanelMusicAiGenerating: (value) => {
      panelMusicAiGenerating = value === true;
      return panelMusicAiGenerating;
    }
  };
}
