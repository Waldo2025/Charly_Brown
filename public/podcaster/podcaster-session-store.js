import podcasterMediaState from "./podcaster-media-state.js";
function createLocalStorageSessionAdapter(deps = {}) {
  const storage = deps.storage || globalThis.localStorage;
  return {
    getItem(key = "") {
      try {
        return String(storage?.getItem?.(String(key || "").trim()) || "");
      } catch (_) {
        return "";
      }
    },
    setItem(key = "", value = "") {
      try {
        storage?.setItem?.(String(key || "").trim(), String(value ?? ""));
      } catch (_) {
        // noop
      }
    },
    removeItem(key = "") {
      try {
        storage?.removeItem?.(String(key || "").trim());
      } catch (_) {
        // noop
      }
    },
    readJson(key = "", fallback = null) {
      try {
        const raw = storage?.getItem?.(String(key || "").trim());
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    },
    writeJson(key = "", value = null) {
      try {
        storage?.setItem?.(String(key || "").trim(), JSON.stringify(value ?? null));
      } catch (_) {
        // noop
      }
    }
  };
}

function resolveSessionStorageKey(uid = "", deps = {}) {
  const base = String(deps.STORAGE_KEY_BASE || "cb_podcaster_sessions_v2").trim() || "cb_podcaster_sessions_v2";
  return `${base}:${String(uid || "").trim() || "auth_required"}`;
}

function resolveDeletedSessionsStorageKey(uid = "", deps = {}) {
  const base = String(deps.STORAGE_KEY_BASE || "cb_podcaster_sessions_v2").trim() || "cb_podcaster_sessions_v2";
  return `${base}:deleted:${String(uid || "").trim() || "auth_required"}`;
}

function resolveSessionSyncMetaStorageKey(uid = "", deps = {}) {
  const base = String(deps.SESSION_SYNC_META_KEY_BASE || "cb_podcaster_session_sync_v1").trim() || "cb_podcaster_session_sync_v1";
  return `${base}:${String(uid || "").trim() || "auth_required"}`;
}

function readJsonArrayStorage(storageAdapter, key = "") {
  const parsed = storageAdapter?.readJson?.(String(key || "").trim(), []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeJsonArrayStorage(storageAdapter, key = "", value = []) {
  storageAdapter?.writeJson?.(String(key || "").trim(), Array.isArray(value) ? value : []);
}

function resolveStorageUidCandidates(uid = "", deps = {}) {
  const candidates = [
    uid,
    deps.resolveCurrentUid?.(),
    deps.getStorageScopeUid?.()
  ];
  const normalized = candidates
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [""];
}

function loadDeletedSessionIds(uid = "", deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  return Array.from(new Set(
    readJsonArrayStorage(nextStorage, resolveDeletedSessionsStorageKey(uid, deps))
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  ));
}

function looksLikeSessionListStub(session = null) {
  const source = session && typeof session === "object" ? session : {};
  if (source.isStub === true) return true;
  if (source.isStub === false) return false;
  const rows = Array.isArray(source?.script?.rows) ? source.script.rows : [];
  const hasRows = rows.length > 0;
  const hasChat = Array.isArray(source.chat) && source.chat.length > 0;
  const hasVideoMap = source.dialogueVideoMap && typeof source.dialogueVideoMap === "object" && Object.keys(source.dialogueVideoMap).length > 0;
  const hasAudioMap = source.dialogueAudioMap && typeof source.dialogueAudioMap === "object" && Object.keys(source.dialogueAudioMap).length > 0;
  const hasPodcastConfig = source.podcastVideoConfig && typeof source.podcastVideoConfig === "object" && Object.keys(source.podcastVideoConfig).length > 0;
  return !hasRows && !hasChat && !hasVideoMap && !hasAudioMap && !hasPodcastConfig;
}

function normalizeApiSessionListItem(session = null) {
  const source = session && typeof session === "object" ? session : {};
  return {
    ...source,
    script: {
      ...(source.script && typeof source.script === "object" ? source.script : {}),
      rows: Array.isArray(source?.script?.rows) ? source.script.rows : []
    },
    isStub: looksLikeSessionListStub(source)
  };
}

function isVideoSessionListItem(session = null) {
  const generationMode = String(session?.podcastStudioUiState?.composerGenerationMode || "").trim().toLowerCase();
  const contentType = String(session?.script?.videoContentType || session?.videoContentType || "").trim().toLowerCase();
  return generationMode === "video" || contentType === "creative";
}

function normalizeAdminUser(docSnap = null) {
  const data = typeof docSnap?.data === "function" ? docSnap.data() || {} : (docSnap || {});
  const uid = String(data.uid || data.userId || docSnap?.id || "").trim();
  const displayName = String(data.displayName || data.name || `${data.firstName || ""} ${data.lastName || ""}`).replace(/\s+/g, " ").trim();
  const email = String(data.email || "").trim();
  return uid ? { uid, displayName: displayName || email || "Usuario", email } : null;
}

function hasLocalSessionContent(session = null) {
  const source = session && typeof session === "object" ? session : {};
  const rows = Array.isArray(source?.script?.rows) ? source.script.rows : [];
  if (rows.length > 0) return true;
  if (Array.isArray(source.chat) && source.chat.length > 0) return true;
  if (source.dialogueVideoMap && typeof source.dialogueVideoMap === "object" && Object.keys(source.dialogueVideoMap).length > 0) return true;
  if (source.dialogueAudioMap && typeof source.dialogueAudioMap === "object" && Object.keys(source.dialogueAudioMap).length > 0) return true;
  const cfg = source.podcastVideoConfig && typeof source.podcastVideoConfig === "object" ? source.podcastVideoConfig : {};
  if (cfg.timelineClipsByRowId && typeof cfg.timelineClipsByRowId === "object" && Object.keys(cfg.timelineClipsByRowId).length > 0) return true;
  if (Array.isArray(cfg.geminiDialogueTrack?.segments) && cfg.geminiDialogueTrack.segments.length > 0) return true;
  if (Array.isArray(cfg.freeVoiceTrack?.clips) && cfg.freeVoiceTrack.clips.length > 0) return true;
  if (cfg.freeVoiceTrack?.added === true || cfg.freeVideoTrack?.added === true) return true;
  if (Array.isArray(cfg.freeVideoTrack?.clips) && cfg.freeVideoTrack.clips.length > 0) return true;
  return false;
}

function isPlainRecord(value = null) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasRecordEntries(value = null) {
  return isPlainRecord(value) && Object.keys(value).length > 0;
}

function mergeRecordMaps(base = null, incoming = null) {
  const currentBase = isPlainRecord(base) ? base : {};
  const nextIncoming = isPlainRecord(incoming) ? incoming : {};
  return {
    ...currentBase,
    ...nextIncoming
  };
}

function mergeRecordMapsByEntry(base = null, incoming = null) {
  const merged = mergeRecordMaps(base, incoming);
  const currentBase = isPlainRecord(base) ? base : {};
  const nextIncoming = isPlainRecord(incoming) ? incoming : {};
  Object.keys(merged).forEach((key) => {
    if (isPlainRecord(currentBase[key]) && isPlainRecord(nextIncoming[key])) {
      merged[key] = {
        ...currentBase[key],
        ...nextIncoming[key]
      };
    }
  });
  return merged;
}

function mergeArrayByPresence(base = null, incoming = null) {
  return Array.isArray(incoming) && incoming.length ? incoming : (Array.isArray(base) ? base : []);
}

function mergeGeminiDialogueTrackForLoad(base = null, incoming = null) {
  const currentBase = isPlainRecord(base) ? base : {};
  const nextIncoming = isPlainRecord(incoming) ? incoming : {};
  const baseSegments = Array.isArray(currentBase.segments) ? currentBase.segments : [];
  const incomingSegments = Array.isArray(nextIncoming.segments) ? nextIncoming.segments : [];
  // A normalized session stub has enabled:false and no segments or revision.
  // Borrowing the saved segments while retaining those default flags silently
  // disabled Gemini on reload. An authored empty/excluded track has a revision
  // or exclusions and still takes precedence.
  const incomingIsPlaceholder = !incomingSegments.length && baseSegments.length > 0
    && !nextIncoming.updatedAt && !(nextIncoming.excludedRowIds || []).length;
  if (incomingIsPlaceholder) return { ...currentBase };
  return {
    ...currentBase,
    ...nextIncoming,
    segments: incomingSegments.length || nextIncoming.updatedAt || (nextIncoming.excludedRowIds || []).length
      ? incomingSegments
      : baseSegments,
    missingRowIds: mergeArrayByPresence(currentBase.missingRowIds, nextIncoming.missingRowIds),
    excludedRowIds: mergeArrayByPresence(currentBase.excludedRowIds, nextIncoming.excludedRowIds)
  };
}

function mergePanelMusicConfigForLoad(base = null, incoming = null) {
  const currentBase = isPlainRecord(base) ? base : {};
  const nextIncoming = isPlainRecord(incoming) ? incoming : {};
  const baseSourceItems = Array.isArray(currentBase.sourceItems) ? currentBase.sourceItems : [];
  const incomingSourceItems = Array.isArray(nextIncoming.sourceItems) ? nextIncoming.sourceItems : [];
  return {
    ...currentBase,
    ...nextIncoming,
    trackLibrary: mergeRecordMaps(currentBase.trackLibrary, nextIncoming.trackLibrary),
    sourceItems: incomingSourceItems.length ? incomingSourceItems : baseSourceItems
  };
}

function mergePodcastVideoConfigRecords(base = null, incoming = null) {
  const currentBase = isPlainRecord(base) ? base : {};
  const nextIncoming = isPlainRecord(incoming) ? incoming : {};
  return {
    ...currentBase,
    ...nextIncoming,
    timelineTracks: mergeArrayByPresence(currentBase.timelineTracks, nextIncoming.timelineTracks),
    timelineClipsByRowId: mergeRecordMapsByEntry(currentBase.timelineClipsByRowId, nextIncoming.timelineClipsByRowId),
    timelineOnScreenTextClipsByRowId: mergeRecordMapsByEntry(currentBase.timelineOnScreenTextClipsByRowId, nextIncoming.timelineOnScreenTextClipsByRowId),
    timelineOnScreenTextLayoutByRowId: mergeRecordMapsByEntry(currentBase.timelineOnScreenTextLayoutByRowId, nextIncoming.timelineOnScreenTextLayoutByRowId),
    timelineOverlayCardsById: Object.hasOwn(nextIncoming, "timelineOverlayCardsById")
      ? (nextIncoming.timelineOverlayCardsById || {})
      : (currentBase.timelineOverlayCardsById || {}),
    timelineSceneAudioMixByRowId: mergeRecordMapsByEntry(currentBase.timelineSceneAudioMixByRowId, nextIncoming.timelineSceneAudioMixByRowId),
    timelineTrackHeightsById: mergeRecordMaps(currentBase.timelineTrackHeightsById, nextIncoming.timelineTrackHeightsById),
    transitionsByEdge: mergeRecordMaps(currentBase.transitionsByEdge, nextIncoming.transitionsByEdge),
    frameHoldsByRowId: mergeRecordMaps(currentBase.frameHoldsByRowId, nextIncoming.frameHoldsByRowId),
    speedRangesByRowId: mergeRecordMaps(currentBase.speedRangesByRowId, nextIncoming.speedRangesByRowId),
    onScreenTextTrack: mergeRecordMaps(currentBase.onScreenTextTrack, nextIncoming.onScreenTextTrack),
    panelMusicConfig: mergePanelMusicConfigForLoad(currentBase.panelMusicConfig, nextIncoming.panelMusicConfig),
    geminiDialogueTrack: mergeGeminiDialogueTrackForLoad(currentBase.geminiDialogueTrack, nextIncoming.geminiDialogueTrack)
  };
}

function sceneRowSignature(row = null) {
  const source = row && typeof row === "object" ? row : {};
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const scene = normalize(source.sceneDescription || source.scenePrompt);
  const visual = normalize(source.visualNotes || source.visual);
  const transition = normalize(source.transition);
  return scene && visual ? `${scene}\u0000${visual}\u0000${transition}` : "";
}

function areMirroredSceneRows(firstRows = [], secondRows = []) {
  return firstRows.length >= 2 && firstRows.length === secondRows.length
    && firstRows.every((row, index) => {
      const signature = sceneRowSignature(row);
      return signature && signature === sceneRowSignature(secondRows[index]);
    });
}

function collapseMirroredSceneBlock(rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  if (source.length < 4 || source.length % 2 !== 0) return source;
  const half = source.length / 2;
  return areMirroredSceneRows(source.slice(0, half), source.slice(half))
    ? source.slice(0, half)
    : source;
}

function collapseMirroredSessionRows(session = null) {
  if (!session || typeof session !== "object") return session;
  const scriptRows = Array.isArray(session.script?.rows) ? session.script.rows : [];
  const rows = scriptRows.length ? scriptRows : (Array.isArray(session.rows) ? session.rows : []);
  const collapsed = collapseMirroredSceneBlock(rows);
  if (!collapsed.length) return session;
  const validRowIds = new Set(collapsed.map((row) => String(row?.id || "").trim()).filter(Boolean));
  const config = isPlainRecord(session.podcastVideoConfig) ? session.podcastVideoConfig : {};
  const pruneRowMap = (map) => isPlainRecord(map)
    ? Object.fromEntries(Object.entries(map).filter(([rowId]) => validRowIds.has(String(rowId).trim())))
    : map;
  const geminiTrack = isPlainRecord(config.geminiDialogueTrack) ? config.geminiDialogueTrack : null;
  const nextConfig = {
    ...config,
    timelineClipsByRowId: pruneRowMap(config.timelineClipsByRowId),
    timelineOnScreenTextClipsByRowId: pruneRowMap(config.timelineOnScreenTextClipsByRowId),
    timelineOnScreenTextLayoutByRowId: pruneRowMap(config.timelineOnScreenTextLayoutByRowId),
    ...(geminiTrack ? { geminiDialogueTrack: {
      ...geminiTrack,
      segments: Array.isArray(geminiTrack.segments)
        ? geminiTrack.segments.filter((segment) => validRowIds.has(String(segment?.rowId || "").trim()))
        : geminiTrack.segments,
      missingRowIds: Array.isArray(geminiTrack.missingRowIds)
        ? geminiTrack.missingRowIds.filter((rowId) => validRowIds.has(String(rowId).trim()))
        : geminiTrack.missingRowIds,
      excludedRowIds: Array.isArray(geminiTrack.excludedRowIds)
        ? geminiTrack.excludedRowIds.filter((rowId) => validRowIds.has(String(rowId).trim()))
        : geminiTrack.excludedRowIds
    } } : {})
  };
  return {
    ...session,
    script: { ...(session.script || {}), rows: collapsed },
    rows: collapsed,
    podcastVideoConfig: nextConfig
  };
}

function mergeRowsPreservingFallback(primaryRows = [], fallbackRows = []) {
  const primary = Array.isArray(primaryRows) ? primaryRows : [];
  const fallback = Array.isArray(fallbackRows) ? fallbackRows : [];
  if (!primary.length) return fallback.slice();
  if (!fallback.length) return primary.slice();
  if (areMirroredSceneRows(primary, fallback)) {
    return primary.map((row, index) => ({ ...fallback[index], ...row }));
  }
  const fallbackById = new Map(
    fallback
      .map((row) => [String(row?.id || "").trim(), row])
      .filter(([rowId]) => rowId)
  );
  const merged = primary.map((row) => {
    const rowId = String(row?.id || "").trim();
    const fallbackRow = rowId ? fallbackById.get(rowId) : null;
    if (rowId) fallbackById.delete(rowId);
    return fallbackRow && typeof fallbackRow === "object" && row && typeof row === "object"
      ? { ...fallbackRow, ...row }
      : row;
  });
  fallbackById.forEach((row) => merged.push(row));
  return collapseMirroredSceneBlock(merged);
}

function buildSessionFromPodcasterDoc(data = null, sessionId = "") {
  const docData = isPlainRecord(data) ? data : {};
  const nested = isPlainRecord(docData.session) ? docData.session : {};
  const topLevel = { ...docData };
  delete topLevel.session;

  const session = {
    ...topLevel,
    ...nested,
    id: String(sessionId || nested.id || topLevel.id || "").trim()
  };

  const nestedRows = mergeRowsPreservingFallback(
    Array.isArray(nested?.script?.rows) ? nested.script.rows : [],
    Array.isArray(nested?.rows) ? nested.rows : []
  );
  const topRows = mergeRowsPreservingFallback(
    Array.isArray(topLevel?.script?.rows) ? topLevel.script.rows : [],
    Array.isArray(topLevel?.rows) ? topLevel.rows : []
  );
  const rows = collapseMirroredSceneBlock(mergeRowsPreservingFallback(nestedRows, topRows));
  if (rows.length) {
    session.script = {
      ...(isPlainRecord(topLevel.script) ? topLevel.script : {}),
      ...(isPlainRecord(nested.script) ? nested.script : {}),
      rows
    };
    session.rows = rows;
  }

  session.podcastVideoConfig = mergePodcastVideoConfigRecords(topLevel.podcastVideoConfig, nested.podcastVideoConfig);
  session.podcastStudioUiState = {
    ...(isPlainRecord(topLevel.podcastStudioUiState) ? topLevel.podcastStudioUiState : {}),
    ...(isPlainRecord(nested.podcastStudioUiState) ? nested.podcastStudioUiState : {}),
    podcastVideoConfig: mergePodcastVideoConfigRecords(
      topLevel.podcastStudioUiState?.podcastVideoConfig,
      nested.podcastStudioUiState?.podcastVideoConfig
    )
  };

  [
    "dialogueVideoMap",
    "dialogueAudioMap",
    "rowReferenceImageMap",
    "rowReferenceImageListMap",
    "rowReferenceVideoMap",
    "rowReferenceModeByRowId",
    "timelineClipMap",
    "panelMusicConfig",
    "visualEffectsMap",
    "stylizedTextMap"
  ].forEach((key) => {
    const nestedValue = nested[key];
    const topValue = topLevel[key];
    const merged = mergeRecordMaps(topValue, nestedValue);
    if (hasRecordEntries(merged)) {
      session[key] = merged;
    }
  });

  if (hasRecordEntries(session.panelMusicConfig)) {
    session.podcastVideoConfig = mergePodcastVideoConfigRecords(session.podcastVideoConfig, {
      panelMusicConfig: session.panelMusicConfig
    });
  }

  return collapseMirroredSessionRows(session);
}

function mergeLocalSessionsByContent(primary = [], fallback = []) {
  const result = [];
  const byId = new Map();
  const pushOrMerge = (session = null) => {
    const id = String(session?.id || "").trim();
    if (!id) return;
    const existingIndex = byId.get(id);
    if (existingIndex === undefined) {
      byId.set(id, result.length);
      result.push(session);
      return;
    }
    const existing = result[existingIndex];
    const existingHasContent = hasLocalSessionContent(existing);
    const nextHasContent = hasLocalSessionContent(session);
    if (!existingHasContent && nextHasContent) {
      result[existingIndex] = {
        ...existing,
        ...session,
        cloudMeta: existing?.cloudMeta || session?.cloudMeta || null,
        isStub: false
      };
    }
  };
  (Array.isArray(primary) ? primary : []).forEach(pushOrMerge);
  (Array.isArray(fallback) ? fallback : []).forEach(pushOrMerge);
  return result;
}

function sanitizeSessionForFingerprint(session = null, deps = {}) {
  const source = session && typeof session === "object" ? session : {};
  const normalizePodcastVideoConfig = deps.normalizePodcastVideoConfig || ((value) => value || {});
  const normalizeCreativeVideoConfig = deps.normalizeCreativeVideoConfig || ((value) => value || {});
  const normalizePodcastStudioUiState = deps.normalizePodcastStudioUiState || ((value) => value || {});
  const stripDataUrl = (record = null) => {
    if (!record || typeof record !== "object") return record;
    const next = { ...record };
    if ("dataUrl" in next) next.dataUrl = "";
    if ("localDataUrl" in next) next.localDataUrl = "";
    return next;
  };
  const stripRecordMap = (value = {}) => Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {}).map(([key, item]) => [key, stripDataUrl(item)])
  );
  const stripRecordListMap = (value = {}) => Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {}).map(([key, list]) => [key, Array.isArray(list) ? list.map((item) => stripDataUrl(item)) : []])
  );
  return {
    id: String(source.id || "").trim(),
    title: String(source.title || "").trim(),
    prompt: String(source.prompt || "").trim(),
    archived: source.archived === true,
    publicar: source.publicar === true,
    speechLocale: String(source.speechLocale || source.languageCode || "es-MX").trim() || "es-MX",
    script: source.script || {},
    speakerVoiceMap: source.speakerVoiceMap || {},
    speakerExpressionMap: source.speakerExpressionMap || {},
    speakerNameMap: source.speakerNameMap || {},
    speakerScenarioMap: source.speakerScenarioMap || {},
    speakerScenarioVariantsMap: source.speakerScenarioVariantsMap || {},
    globalScenarioDeck: source.globalScenarioDeck || null,
    disfluencyDefaults: source.disfluencyDefaults || null,
    ttsDirectionDefaults: source.ttsDirectionDefaults || null,
    panelMusicConfig: source.panelMusicConfig ? {
      ...source.panelMusicConfig,
      trackLibrary: {
        ...(source.panelMusicConfig.trackLibrary || {}),
        uploaded: stripDataUrl(source.panelMusicConfig.trackLibrary?.uploaded || null),
        uploadedTracks: Array.isArray(source.panelMusicConfig.trackLibrary?.uploadedTracks)
          ? source.panelMusicConfig.trackLibrary.uploadedTracks.map((track) => stripDataUrl(track))
          : [],
        ai: stripDataUrl(source.panelMusicConfig.trackLibrary?.ai || null)
      },
      track: stripDataUrl(source.panelMusicConfig.track || null)
    } : null,
    dialogueVideoMap: source.dialogueVideoMap || {},
    dialogueAudioMap: source.dialogueAudioMap || {},
    rowReferenceImageMap: stripRecordMap(source.rowReferenceImageMap || {}),
    rowReferenceImageListMap: stripRecordListMap(source.rowReferenceImageListMap || {}),
    rowReferenceVideoMap: stripRecordMap(source.rowReferenceVideoMap || {}),
    rowReferenceModeByRowId: source.rowReferenceModeByRowId || {},
    podcastVideoConfig: normalizePodcastVideoConfig(source.podcastVideoConfig || {}),
    creativeVideoConfig: normalizeCreativeVideoConfig(source.creativeVideoConfig || {}),
    visualEffectsMap: source.visualEffectsMap || {},
    stylizedTextMap: source.stylizedTextMap || {},
    podcastStudioUiState: normalizePodcastStudioUiState(source.podcastStudioUiState || null, source)
  };
}

const sessionFingerprintCache = new WeakMap();

function sanitizeSessionForLocalCache(session = null) {
  const source = session && typeof session === "object" ? session : {};
  const stripInlineRecord = (record = null) => {
    if (!record || typeof record !== "object") return record;
    return {
      ...record,
      ...(Object.prototype.hasOwnProperty.call(record, "dataUrl") ? { dataUrl: "" } : {}),
      ...(Object.prototype.hasOwnProperty.call(record, "localDataUrl") ? { localDataUrl: "" } : {})
    };
  };
  const stripInlineRecordMap = (value = {}) => Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {}).map(([key, item]) => [key, stripInlineRecord(item)])
  );
  const stripInlineRecordListMap = (value = {}) => Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {}).map(([key, list]) => [
      key,
      Array.isArray(list) ? list.map((item) => stripInlineRecord(item)) : []
    ])
  );
  // Remove large inline references before JSON.stringify. Stripping them only
  // after cloning still duplicates and serializes every base64 byte on the UI thread.
  const sourceForClone = {
    ...source,
    speakerReferenceImageMap: stripInlineRecordMap(source.speakerReferenceImageMap || {}),
    scenarioReferenceImageMap: stripInlineRecordMap(source.scenarioReferenceImageMap || {}),
    rowReferenceImageMap: stripInlineRecordMap(source.rowReferenceImageMap || {}),
    rowReferenceVideoMap: stripInlineRecordMap(source.rowReferenceVideoMap || {}),
    rowReferenceImageListMap: stripInlineRecordListMap(source.rowReferenceImageListMap || {})
  };
  let clone = null;
  try {
    clone = JSON.parse(JSON.stringify(sourceForClone));
  } catch (_) {
    clone = { ...sourceForClone };
  }
  const stripDataUrl = (record = null) => {
    if (!record || typeof record !== "object") return;
    if ("dataUrl" in record) record.dataUrl = "";
    if ("localDataUrl" in record) record.localDataUrl = "";
  };
  const stripRecordMap = (value = {}) => {
    Object.values(value && typeof value === "object" ? value : {}).forEach((item) => stripDataUrl(item));
  };
  const stripRecordListMap = (value = {}) => {
    Object.values(value && typeof value === "object" ? value : {}).forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((item) => stripDataUrl(item));
    });
  };
  stripRecordMap(clone.speakerReferenceImageMap || {});
  stripRecordMap(clone.scenarioReferenceImageMap || {});
  stripRecordMap(clone.rowReferenceImageMap || {});
  stripRecordMap(clone.rowReferenceVideoMap || {});
  stripRecordListMap(clone.rowReferenceImageListMap || {});
  if (clone.panelMusicConfig && typeof clone.panelMusicConfig === "object") {
    stripDataUrl(clone.panelMusicConfig.track || null);
    stripDataUrl(clone.panelMusicConfig.trackLibrary?.uploaded || null);
    stripDataUrl(clone.panelMusicConfig.trackLibrary?.ai || null);
    if (Array.isArray(clone.panelMusicConfig.trackLibrary?.uploadedTracks)) {
      clone.panelMusicConfig.trackLibrary.uploadedTracks.forEach((track) => stripDataUrl(track));
    }
  }
  return clone;
}

function computeSessionFingerprint(session = null, deps = {}) {
  if (!session || typeof session !== "object") return "";
  try {
    if (sessionFingerprintCache.has(session)) {
      return sessionFingerprintCache.get(session);
    }
    const fp = JSON.stringify(sanitizeSessionForFingerprint(session, deps));
    sessionFingerprintCache.set(session, fp);
    return fp;
  } catch (_) {
    return "";
  }
}

function loadSessionSyncMeta(uid = "", sessionId = "", deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  const key = String(sessionId || "").trim();
  if (!key) return null;
  const allMeta = nextStorage?.readJson?.(resolveSessionSyncMetaStorageKey(uid, deps), {}) || {};
  return allMeta && typeof allMeta === "object" ? (allMeta[key] || null) : null;
}

function persistSessionSyncMeta(uid = "", sessionId = "", patch = {}, deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  const key = String(sessionId || "").trim();
  if (!key) return null;
  const storageKey = resolveSessionSyncMetaStorageKey(uid, deps);
  const current = nextStorage?.readJson?.(storageKey, {}) || {};
  const nextValue = {
    ...(current?.[key] || {}),
    ...(patch && typeof patch === "object" ? patch : {})
  };
  nextStorage?.writeJson?.(storageKey, {
    ...(current && typeof current === "object" ? current : {}),
    [key]: nextValue
  });
  return nextValue;
}

function markSessionDirty(uid = "", sessionId = "", reason = "", deps = {}, storageAdapter = null) {
  return persistSessionSyncMeta(uid, sessionId, {
    dirty: true,
    lastLocalPersistAt: typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString(),
    dirtyReason: String(reason || "").trim() || undefined
  }, deps, storageAdapter);
}

function loadSessionsFromLocalCache(uid = "", deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  const forceCloud = deps.forceCloud === true;
  if (forceCloud) return [];
  const storageCandidates = resolveStorageUidCandidates(uid, deps);
  const deletedSessionIds = new Set();
  let scopedStorageKey = "";
  let scopedSessions = [];
  let scopedSourcesWithSessions = 0;
  let scopedEntriesRead = 0;
  for (const candidateUid of storageCandidates) {
    const storageKey = resolveSessionStorageKey(candidateUid, deps);
    if (!scopedStorageKey) scopedStorageKey = storageKey;
    loadDeletedSessionIds(candidateUid, deps, nextStorage).forEach((id) => deletedSessionIds.add(id));
    const nextScopedSessions = readJsonArrayStorage(nextStorage, storageKey)
      .filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
    if (nextScopedSessions.length) {
      scopedSourcesWithSessions += 1;
      scopedEntriesRead += nextScopedSessions.length;
      scopedSessions = mergeLocalSessionsByContent(scopedSessions, nextScopedSessions);
    }
  }
  const base = String(deps.STORAGE_KEY_BASE || "cb_podcaster_sessions_v2").trim() || "cb_podcaster_sessions_v2";
  const legacyKey = String(deps.LEGACY_STORAGE_KEY || "cb_podcaster_sessions_v1").trim() || "cb_podcaster_sessions_v1";
  const legacyCandidates = [
    legacyKey,
    `${base}:auth_required`,
    `${base}:anon`,
    base
  ];
  const mergedLegacy = legacyCandidates.reduce((acc, key) => {
    const sessions = readJsonArrayStorage(nextStorage, key)
      .filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
    return sessions.length ? mergeLocalSessionsByContent(acc, sessions) : acc;
  }, []);
  const mergedLocal = mergeLocalSessionsByContent(scopedSessions, mergedLegacy)
    .map(collapseMirroredSessionRows);
  if (mergedLocal.length && scopedStorageKey
    && (mergedLegacy.length > 0 || scopedSourcesWithSessions > 1 || mergedLocal.length !== scopedEntriesRead)) {
    nextStorage?.writeJson?.(scopedStorageKey, mergedLocal);
  }
  return mergedLocal;
}

function persistSessionsToLocalCache(uid = "", sessions = [], deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  const nextList = Array.isArray(sessions) ? sessions.map((session) => sanitizeSessionForLocalCache(session)) : [];
  resolveStorageUidCandidates(uid, deps).forEach((candidateUid) => {
    const storageKey = resolveSessionStorageKey(candidateUid, deps);
    nextStorage?.writeJson?.(storageKey, nextList);
  });
  const list = Array.isArray(sessions) ? sessions : [];
  list.forEach((session) => {
    const sessionId = String(session?.id || "").trim();
    if (!sessionId) return;
    resolveStorageUidCandidates(uid, deps).forEach((candidateUid) => {
      persistSessionSyncMeta(candidateUid, sessionId, {
        localFingerprint: computeSessionFingerprint(session, deps),
        lastLocalPersistAt: typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString()
      }, deps, nextStorage);
    });
  });
  return list;
}

async function loadCloudSessionsDirect(uid = "", deps = {}) {
  if (!uid) return [];
  const deletedSessionIds = new Set(loadDeletedSessionIds(uid, deps, deps.storageAdapter));
  const merged = new Map();
  const sessionCollection = deps.collection(deps.firestoreDb, "podcaster_sessions");
  const [ownedSnap, sharedSnap] = await Promise.all([
    deps.getDocs(
      deps.query(
        sessionCollection,
        deps.where("ownerId", "==", uid),
        deps.limit(40)
      )
    ),
    deps.getDocs(
      deps.query(
        sessionCollection,
        deps.where("sharedWithIds", "array-contains", uid),
        deps.limit(40)
      )
    )
  ]);
  [...(ownedSnap?.docs || []), ...(sharedSnap?.docs || [])].forEach((docSnap) => {
    const data = docSnap.data() || {};
    const sessionData = data.session && typeof data.session === "object" ? data.session : null;
    if (deletedSessionIds.has(String(docSnap.id || "").trim())) return;
    const rootAcademicMetadata = data.academicMetadata && typeof data.academicMetadata === "object"
      ? data.academicMetadata
      : {};
    const nestedAcademicMetadata = sessionData?.academicMetadata && typeof sessionData.academicMetadata === "object"
      ? sessionData.academicMetadata
      : {};
    const academicMetadata = {
      ...nestedAcademicMetadata,
      ...rootAcademicMetadata,
      nivel: data.nivel || rootAcademicMetadata.nivel || sessionData?.nivel || nestedAcademicMetadata.nivel || "",
      grado: data.grado || rootAcademicMetadata.grado || sessionData?.grado || nestedAcademicMetadata.grado || "",
      trimestre: data.trimestre || rootAcademicMetadata.trimestre || sessionData?.trimestre || nestedAcademicMetadata.trimestre || "",
      unidad: data.unidad || rootAcademicMetadata.unidad || sessionData?.unidad || nestedAcademicMetadata.unidad || "",
      materia: data.materia || rootAcademicMetadata.materia || sessionData?.materia || nestedAcademicMetadata.materia || "",
      unitLabel: rootAcademicMetadata.unitLabel || nestedAcademicMetadata.unitLabel || data.academicMetadataUnitLabel || sessionData?.academicMetadataUnitLabel || ""
    };
    merged.set(docSnap.id, {
      id: docSnap.id,
      title: data.title || sessionData?.title || "Sin título",
      podcastStudioUiState: sessionData?.podcastStudioUiState || null,
      workspaceType: sessionData?.workspaceType || data.workspaceType || null,
      videoContentType: sessionData?.script?.videoContentType || sessionData?.videoContentType || null,
      script: { rows: [], videoContentType: sessionData?.script?.videoContentType || sessionData?.videoContentType || null },
      nivel: academicMetadata.nivel,
      grado: academicMetadata.grado,
      trimestre: academicMetadata.trimestre,
      unidad: academicMetadata.unidad,
      materia: academicMetadata.materia,
      academicMetadata,
      updatedAt: data.sessionUpdatedAt || sessionData?.updatedAt || data.updatedAt?.toDate?.().toISOString() || (typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString()),
      archived: typeof data.archived === "boolean" ? data.archived : sessionData?.archived === true,
      publicar: typeof data.publicar === "boolean" ? data.publicar : sessionData?.publicar === true,
      isStub: true,
      cloudMeta: {
        ownerId: String(data.ownerId || "").trim() || null,
        savedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null
      }
    });
  });
  return Array.from(merged.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function loadSessionsFromCloud(uid = "", deps = {}) {
  const deletedSessionIds = new Set(loadDeletedSessionIds(uid, deps, deps.storageAdapter));
  if (deps.preferDirectSessionFirestore === true) {
    const directSessions = await loadCloudSessionsDirect(uid, deps).catch(() => []);
    return directSessions.filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
  }
  if (deps.hasAvailableApiBase?.()) {
    try {
      const response = await deps.authFetchJson("/api/podcaster/sessions/list", {
        method: "GET",
        preferRemote: false
      });
      const apiSessions = Array.isArray(response?.sessions) ? response.sessions.map(normalizeApiSessionListItem) : [];
      return apiSessions.filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
    } catch (_) {
      const directSessions = await loadCloudSessionsDirect(uid, deps).catch(() => []);
      return directSessions.filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
    }
  }
  const directSessions = await loadCloudSessionsDirect(uid, deps);
  return directSessions.filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
}

async function listAdminUsers(deps = {}) {
  const uid = String(deps.resolveCurrentUid?.() || "").trim();
  if (!uid || deps.getCurrentUserIsAdmin?.() !== true) throw new Error("Acceso exclusivo para administradores.");
  if (deps.preferDirectFirestoreReads?.() !== true && deps.hasAvailableApiBase?.()) {
    try {
      const response = await deps.authFetchJson("/api/podcaster/users/list", { method: "GET", preferRemote: false });
      return (Array.isArray(response?.users) ? response.users : [])
        .map(normalizeAdminUser)
        .filter((user) => user && user.uid !== uid);
    } catch (_) {
      // The Firestore fallback uses the same admin-only UI gate and security rules.
    }
  }
  const snapshot = await deps.getDocs(deps.query(
    deps.collection(deps.firestoreDb, "users"),
    deps.limit(250)
  ));
  return (snapshot?.docs || [])
    .map(normalizeAdminUser)
    .filter((user) => user && user.uid !== uid)
    .sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email), "es"));
}

async function loadAdminVideoSessionsDirect(owner = "", deps = {}) {
  const snapshot = await deps.getDocs(deps.query(
    deps.collection(deps.firestoreDb, "podcaster_sessions"),
    deps.where("ownerId", "==", owner),
    deps.limit(100)
  ));
  return (snapshot?.docs || [])
    .map((docSnap) => {
      const data = docSnap.data() || {};
      const nested = data.session && typeof data.session === "object" ? data.session : {};
      return normalizeApiSessionListItem({
        id: docSnap.id,
        title: data.title || nested.title || "Sin título",
        updatedAt: data.sessionUpdatedAt || nested.updatedAt || data.updatedAt?.toDate?.().toISOString() || "",
        archived: data.archived === true,
        podcastStudioUiState: nested.podcastStudioUiState || null,
        videoContentType: nested?.script?.videoContentType || nested.videoContentType || null,
        script: { rows: [], videoContentType: nested?.script?.videoContentType || nested.videoContentType || null },
        cloudMeta: { ownerId: owner, savedAt: data.updatedAt?.toDate?.().toISOString() || null },
        isStub: true
      });
    })
    .filter(isVideoSessionListItem)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function isAdminSessionResponseScopedToOwner(response = null, sessions = [], owner = "") {
  const responseOwner = String(response?.scope?.ownerId || response?.ownerId || "").trim();
  if (responseOwner && responseOwner !== owner) return false;
  if (!sessions.length) return responseOwner === owner;
  return sessions.every((session) => String(session?.cloudMeta?.ownerId || "").trim() === owner);
}

async function listAdminVideoSessions(ownerId = "", deps = {}) {
  const uid = String(deps.resolveCurrentUid?.() || "").trim();
  const owner = String(ownerId || "").trim();
  if (!uid || !owner || owner === uid || deps.getCurrentUserIsAdmin?.() !== true) {
    throw new Error("Selecciona otro usuario con una cuenta administradora.");
  }
  if (deps.preferDirectFirestoreReads?.() !== true && deps.hasAvailableApiBase?.()) {
    try {
      const params = new URLSearchParams({ ownerId: owner, type: "video", archived: "all" });
      const response = await deps.authFetchJson(`/api/podcaster/sessions/list?${params.toString()}`, {
        method: "GET",
        preferRemote: false
      });
      const apiSessions = (Array.isArray(response?.sessions) ? response.sessions : [])
        .map(normalizeApiSessionListItem);
      if (isAdminSessionResponseScopedToOwner(response, apiSessions, owner)) {
        return apiSessions.filter(isVideoSessionListItem);
      }
    } catch (_) {
      // Fall through to the signed-in Firestore reader when the API is unavailable.
    }
  }
  return loadAdminVideoSessionsDirect(owner, deps);
}

async function loadSingleSessionFromCloud(sessionId = "", uid = "", deps = {}) {
  const key = String(sessionId || "").trim();
  if (!uid || !key) return null;
  if (deps.preferDirectFirestoreReads?.() !== true && deps.hasAvailableApiBase?.()) {
    try {
      const response = await deps.authFetchJson(`/api/podcaster/sessions/get?sessionId=${encodeURIComponent(key)}`, {
        method: "GET",
        preferRemote: false
      });
      const session = response?.session && typeof response.session === "object" ? response.session : null;
      if (session) return collapseMirroredSessionRows(session);
    } catch (error) {
      console.warn("[podcaster][session-store] API session get failed; falling back to Firestore", {
        sessionId: key,
        status: Number(error?.status || 0) || null,
        error: String(error?.message || error?.detail?.error || "unknown").slice(0, 160)
      });
    }
  }
  try {
    const sessionRef = deps.doc(deps.firestoreDb, "podcaster_sessions", key);
    const sessionSnap = await deps.getDoc(sessionRef);
    if (!sessionSnap.exists()) return null;
    const data = sessionSnap.data() || {};
    const sessionData = buildSessionFromPodcasterDoc(data, key);
    return sessionData && typeof sessionData === "object" ? sessionData : null;
  } catch (error) {
    console.warn("[podcaster][session-store] Firestore session get failed", {
      sessionId: key,
      error: String(error?.message || error?.code || "unknown").slice(0, 160)
    });
    return null;
  }
}

function mergePodcastVideoConfigForLoad(cloudConfig = null, localConfig = null, deps = {}) {
  const normalizePodcastVideoConfig = deps.normalizePodcastVideoConfig || ((value) => (value && typeof value === "object" ? value : {}));
  const local = localConfig && typeof localConfig === "object" ? localConfig : {};
  const cloud = cloudConfig && typeof cloudConfig === "object" ? cloudConfig : {};
  return normalizePodcastVideoConfig(mergePodcastVideoConfigRecords(local, {
    ...cloud,
    reelModeEnabled: local.reelModeEnabled === true ? true : cloud.reelModeEnabled === true
  }));
}

function resolveUpdatedAtMs(value = null) {
  if (value?.toDate && typeof value.toDate === "function") return value.toDate().getTime();
  if (Number.isFinite(Number(value?.seconds))) {
    return (Number(value.seconds) * 1000) + (Number(value.nanoseconds || 0) / 1e6);
  }
  return Date.parse(String(value || ""));
}

function isManualSceneReplacement(entry = null) {
  const sourceType = String(entry?.sourceType || entry?.replacementSource || "").trim().toLowerCase();
  return entry?.manuallyReplaced === true || sourceType === "manual-replacement" || sourceType === "manual";
}

export function mergeMediaMapByEntryUpdatedAt(currentMap = {}, incomingMap = {}) {
  return podcasterMediaState.mergeMediaMapByEntryUpdatedAt(currentMap, incomingMap);
}

export function reconcileDialogueVideoState(currentSession = {}, incomingSession = {}) {
  const currentDeleted = currentSession?.dialogueVideoDeletedAtMap && typeof currentSession.dialogueVideoDeletedAtMap === "object"
    ? currentSession.dialogueVideoDeletedAtMap
    : {};
  const incomingDeleted = incomingSession?.dialogueVideoDeletedAtMap && typeof incomingSession.dialogueVideoDeletedAtMap === "object"
    ? incomingSession.dialogueVideoDeletedAtMap
    : {};
  const deletedAtMap = { ...currentDeleted };
  Object.entries(incomingDeleted).forEach(([rowId, value]) => {
    const currentMs = resolveUpdatedAtMs(deletedAtMap[rowId]);
    const incomingMs = resolveUpdatedAtMs(value);
    if (!Number.isFinite(currentMs) || (Number.isFinite(incomingMs) && incomingMs > currentMs)) {
      deletedAtMap[rowId] = value;
    }
  });
  const dialogueVideoMap = mergeMediaMapByEntryUpdatedAt(
    currentSession?.dialogueVideoMap || {},
    incomingSession?.dialogueVideoMap || {}
  );
  Object.entries(deletedAtMap).forEach(([rowId, deletedAt]) => {
    const deletedMs = resolveUpdatedAtMs(deletedAt);
    const mediaMs = resolveUpdatedAtMs(dialogueVideoMap[rowId]?.updatedAt);
    if (Number.isFinite(deletedMs) && (!Number.isFinite(mediaMs) || deletedMs >= mediaMs)) {
      delete dialogueVideoMap[rowId];
    }
  });
  return { dialogueVideoMap, dialogueVideoDeletedAtMap: deletedAtMap };
}

function mergeCloudVsLocalSessions(cloudSessions = [], localSessions = [], deps = {}, storageAdapter = null) {
  const mergeSessionRowsWithFallback = deps.mergeSessionRowsWithFallback || ((primaryRows = [], fallbackRows = []) => primaryRows.length ? primaryRows : fallbackRows);
  const mergeAcademicMetadataPreferCloud = (cloudSession = null, localSession = null) => {
    const cloudAcademic = cloudSession?.academicMetadata && typeof cloudSession.academicMetadata === "object" ? cloudSession.academicMetadata : {};
    const localAcademic = localSession?.academicMetadata && typeof localSession.academicMetadata === "object" ? localSession.academicMetadata : {};
    const fields = ["nivel", "grado", "trimestre", "unidad", "materia"];
    const values = Object.fromEntries(fields.map((field) => [
      field,
      String(cloudSession?.[field] || cloudAcademic?.[field] || localSession?.[field] || localAcademic?.[field] || "").trim()
    ]));
    const unitLabel = String(cloudAcademic.unitLabel || localAcademic.unitLabel || (values.nivel.toLowerCase() === "secundaria" ? "Tema" : "Unidad")).trim();
    return {
      ...values,
      academicMetadata: {
        ...localAcademic,
        ...cloudAcademic,
        ...values,
        unitLabel
      }
    };
  };
  const chooseNewerByUpdatedAt = (primary = null, secondary = null) => {
    if (!primary) return secondary;
    if (!secondary) return primary;
    const primaryUpdatedAt = Date.parse(String(primary?.updatedAt || ""));
    const secondaryUpdatedAt = Date.parse(String(secondary?.updatedAt || ""));
    if (Number.isFinite(primaryUpdatedAt) && Number.isFinite(secondaryUpdatedAt) && secondaryUpdatedAt > primaryUpdatedAt) {
      return {
        ...primary,
        ...secondary
      };
    }
    return {
      ...secondary,
      ...primary
    };
  };
  const mergeRowsByUpdatedAt = (primaryRows = [], secondaryRows = []) => {
    const secondaryById = new Map(
      (Array.isArray(secondaryRows) ? secondaryRows : [])
        .map((row) => [String(row?.id || "").trim(), row])
        .filter(([rowId]) => rowId)
    );
    const mergedPrimary = (Array.isArray(primaryRows) ? primaryRows : []).map((row) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId) return row;
      const fallbackRow = secondaryById.get(rowId) || null;
      if (fallbackRow) secondaryById.delete(rowId);
      return chooseNewerByUpdatedAt(row, fallbackRow) || row;
    });
    secondaryById.forEach((row) => {
      mergedPrimary.push(row);
    });
    return mergedPrimary;
  };
  const localById = new Map(
    (Array.isArray(localSessions) ? localSessions : [])
      .map((session) => [String(session?.id || "").trim(), session])
      .filter(([id]) => id)
  );
  const merged = (Array.isArray(cloudSessions) ? cloudSessions : []).map((cloudSession) => {
    const id = String(cloudSession?.id || "").trim();
    const localSession = id ? localById.get(id) : null;
    if (id) localById.delete(id);
    if (!localSession) return collapseMirroredSessionRows(cloudSession);
    const localRows = collapseMirroredSceneBlock(Array.isArray(localSession?.script?.rows) ? localSession.script.rows : []);
    const cloudRows = collapseMirroredSceneBlock(Array.isArray(cloudSession?.script?.rows) ? cloudSession.script.rows : []);
    const localUpdatedAt = Date.parse(String(localSession?.updatedAt || ""));
    const cloudUpdatedAt = Date.parse(String(cloudSession?.updatedAt || ""));
    const localDirty = loadSessionSyncMeta(deps.resolveCurrentUid?.(), id, deps, storageAdapter)?.dirty === true;
    const preferLocalSessionFlags = Number.isFinite(localUpdatedAt) && (!Number.isFinite(cloudUpdatedAt) || localUpdatedAt >= cloudUpdatedAt);
    const localHasContent = hasLocalSessionContent(localSession);
    const cloudHasContent = hasLocalSessionContent(cloudSession);
    if (localHasContent && !cloudHasContent) {
      const academicSnapshot = mergeAcademicMetadataPreferCloud(cloudSession, localSession);
      return collapseMirroredSessionRows({
        ...cloudSession,
        ...localSession,
        id,
        title: cloudSession?.title || localSession?.title || "Sin título",
        updatedAt: cloudSession?.updatedAt || localSession?.updatedAt,
        cloudMeta: cloudSession?.cloudMeta || localSession?.cloudMeta || null,
        archived: preferLocalSessionFlags ? localSession?.archived === true : cloudSession?.archived === true,
        publicar: preferLocalSessionFlags ? localSession?.publicar === true : cloudSession?.publicar === true,
        ...academicSnapshot,
        isStub: false
      });
    }
    const isShallow = cloudSession.isStub === true || !cloudSession.dialogueVideoMap || Object.keys(cloudSession.dialogueVideoMap).length === 0;
    const hasConcreteCloudRows = cloudSession.isStub !== true && cloudRows.length > 0;
    const resolvedRows = mergeRowsByUpdatedAt(
      mergeSessionRowsWithFallback(cloudRows, localRows),
      localRows
    );
    const finalRows = collapseMirroredSceneBlock(hasConcreteCloudRows
      ? (localDirty ? mergeRowsByUpdatedAt(cloudRows, localRows) : cloudRows)
      : resolvedRows);
    const preferLocalVideoConfig = (cloudSession.isStub === true || localDirty)
      && Number.isFinite(localUpdatedAt) && (!Number.isFinite(cloudUpdatedAt) || localUpdatedAt > cloudUpdatedAt);
    const preferLocalDialogueAudioMap = (cloudSession.isStub === true || localDirty)
      && Number.isFinite(localUpdatedAt) && (!Number.isFinite(cloudUpdatedAt) || localUpdatedAt > cloudUpdatedAt);
    // Compatibility: podcastVideoConfig: preferLocalVideoConfig ? (localSession?.podcastVideoConfig || cloudSession?.podcastVideoConfig || {}) : (cloudSession?.podcastVideoConfig || localSession?.podcastVideoConfig || {})
    const resolvedPodcastVideoConfig = preferLocalVideoConfig
      ? (localSession?.podcastVideoConfig || cloudSession?.podcastVideoConfig || {})
      : (cloudSession?.podcastVideoConfig || localSession?.podcastVideoConfig || {});
    const reconciledVideoState = reconcileDialogueVideoState(localSession, cloudSession);

    const academicSnapshot = mergeAcademicMetadataPreferCloud(cloudSession, localSession);
    return collapseMirroredSessionRows({
      ...localSession,
      ...cloudSession,
      archived: preferLocalSessionFlags ? localSession?.archived === true : cloudSession?.archived === true,
      publicar: preferLocalSessionFlags ? localSession?.publicar === true : cloudSession?.publicar === true,
      ...academicSnapshot,
      dialogueAudioMap: preferLocalDialogueAudioMap
        ? mergeMediaMapByEntryUpdatedAt(cloudSession?.dialogueAudioMap || {}, localSession?.dialogueAudioMap || {})
        : mergeMediaMapByEntryUpdatedAt(localSession?.dialogueAudioMap || {}, cloudSession?.dialogueAudioMap || {}),
      dialogueVideoMap: isShallow && localSession?.dialogueVideoMap && Object.keys(localSession.dialogueVideoMap).length > 0
        ? localSession.dialogueVideoMap
        : reconciledVideoState.dialogueVideoMap,
      dialogueVideoDeletedAtMap: reconciledVideoState.dialogueVideoDeletedAtMap,
      rowReferenceImageMap: isShallow && localSession?.rowReferenceImageMap && Object.keys(localSession.rowReferenceImageMap).length > 0
        ? localSession.rowReferenceImageMap
        : mergeRecordMaps(localSession?.rowReferenceImageMap || {}, cloudSession?.rowReferenceImageMap || {}),
      rowReferenceImageListMap: isShallow && localSession?.rowReferenceImageListMap && Object.keys(localSession.rowReferenceImageListMap).length > 0
        ? localSession.rowReferenceImageListMap
        : mergeRecordMaps(localSession?.rowReferenceImageListMap || {}, cloudSession?.rowReferenceImageListMap || {}),
      rowReferenceVideoMap: isShallow && localSession?.rowReferenceVideoMap && Object.keys(localSession.rowReferenceVideoMap).length > 0
        ? localSession.rowReferenceVideoMap
        : mergeRecordMaps(localSession?.rowReferenceVideoMap || {}, cloudSession?.rowReferenceVideoMap || {}),
      rowReferenceModeByRowId: isShallow && localSession?.rowReferenceModeByRowId && Object.keys(localSession.rowReferenceModeByRowId).length > 0
        ? localSession.rowReferenceModeByRowId
        : mergeRecordMaps(localSession?.rowReferenceModeByRowId || {}, cloudSession?.rowReferenceModeByRowId || {}),
      timelineClipMap: mergeRecordMaps(localSession?.timelineClipMap || {}, cloudSession?.timelineClipMap || {}),
      script: {
        ...(localSession?.script || {}),
        ...(cloudSession?.script || {}),
        rows: finalRows // Compatibility: rows: resolvedRows
      },
      podcastVideoConfig: mergePodcastVideoConfigForLoad(
        preferLocalVideoConfig ? localSession?.podcastVideoConfig : cloudSession?.podcastVideoConfig,
        preferLocalVideoConfig ? cloudSession?.podcastVideoConfig : localSession?.podcastVideoConfig,
        deps
      ),
      rows: finalRows,
      isStub: cloudSession.isStub === true
    });
  });
  localById.forEach((session) => merged.push(collapseMirroredSessionRows(session)));
  return merged.sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
}

function replaceLocalSessionFromCloud(uid = "", cloudSession = null, deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  const key = String(cloudSession?.id || "").trim();
  if (!key || !cloudSession) return null;
  const current = loadSessionsFromLocalCache(uid, deps, nextStorage);
  const previousLocal = current.find((session) => String(session?.id || "").trim() === key) || null;
  // Adoptamos la sesión de la nube, pero las selecciones de media locales (por
  // ejemplo visualEffectsMap/dialogueVideoMap con su stopMotion) se fusionan por
  // updatedAt con tombstones. Reemplazarlas a ciegas borraba el stop motion que
  // el usuario recién subió cuando llegaba un refresh de la nube.
  const mergedSession = previousLocal
    ? podcasterMediaState.reconcileSessionMedia(previousLocal, cloudSession)
    : cloudSession;
  const next = [
    mergedSession,
    ...current.filter((session) => String(session?.id || "").trim() !== key)
  ];
  persistSessionsToLocalCache(uid, next, deps, nextStorage);
  persistSessionSyncMeta(uid, key, {
    dirty: false,
    cloudFingerprint: computeSessionFingerprint(cloudSession, deps),
    localFingerprint: computeSessionFingerprint(mergedSession, deps),
    lastKnownCloudUpdatedAt: String(cloudSession?.updatedAt || "").trim()
  }, deps, nextStorage);
  return next;
}

async function saveSessionDirectToCloud(payload = null, deps = {}) {
  const uid = String(deps.resolveCurrentUid?.() || "").trim();
  if (!uid) throw new Error("AUTH_REQUIRED");
  const sanitized = payload && typeof payload === "object" ? payload : null;
  if (!sanitized?.id) {
    throw new Error("La sesión no tiene un ID válido.");
  }
  const sessionRef = deps.doc(deps.firestoreDb, "podcaster_sessions", sanitized.id);
  const priorForSavings = await deps.getDoc(sessionRef);
  const priorData = priorForSavings.exists() ? priorForSavings.data() || {} : null;
  const { claimSavings } = await import("../js/savings-client.js");
  const isVideo = (value) => String(value?.podcastStudioUiState?.composerGenerationMode || "").toLowerCase() === "video"
    || ["video", "creative", "videopodcast"].includes(String(value?.script?.videoContentType || value?.videoContentType || "").toLowerCase());
  const newSessionClaim = !priorData
    ? await claimSavings("podcasterSessions", sanitized.id).catch(() => null)
    : null;
  const videoClaim = isVideo(sanitized) && !isVideo(priorData?.session || priorData)
    ? await claimSavings("videoSessions", sanitized.id).catch(() => null)
    : null;
  const sessionUpdatedAt = String(sanitized.updatedAt || deps.nowIso?.() || new Date().toISOString()).trim()
    || (typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString());
  let committedSession = sanitized;
  const writeSession = (existing = null) => {
    const ownerId = existing ? String(existing.ownerId || "").trim() : uid;
    const sharedWithIds = Array.isArray(existing?.sharedWithIds) ? existing.sharedWithIds.map(String) : [];
    const isAdmin = deps.getCurrentUserIsAdmin?.() === true;
    const isOwnerOrShared = ownerId === uid || sharedWithIds.includes(uid);
    const canEditArchivedAsAdmin = isAdmin && ownerId && ownerId !== uid;
    if (existing && !isOwnerOrShared && !isAdmin) {
      throw new Error("No tienes permiso para editar esta sesión.");
    }
    if (existing?.archived === true && !canEditArchivedAsAdmin) {
      throw new Error("Desarchiva la sesión antes de editarla.");
    }
    const currentSession = existing?.session && typeof existing.session === "object" ? existing.session : {};
    committedSession = podcasterMediaState.reconcileSessionMedia(currentSession, sanitized);
    if (existing) committedSession.archived = existing.archived === true;
    return {
      ownerId,
      title: committedSession.title,
      archived: existing ? existing.archived === true : committedSession.archived === true,
      publicar: committedSession.publicar === true,
      sessionUpdatedAt,
      session: committedSession,
      ...(newSessionClaim?.permit ? { savingsPermit: newSessionClaim.permit } : {}),
      ...(videoClaim?.permit ? { savingsVideoPermit: videoClaim.permit } : {}),
      sharedWithIds: Array.isArray(existing?.sharedWithIds) ? existing.sharedWithIds : [],
      sharedWith: Array.isArray(existing?.sharedWith) ? existing.sharedWith : [],
      lastEditedByUid: uid,
      lastEditedAt: deps.serverTimestamp(),
      createdAt: existing?.createdAt || deps.serverTimestamp(),
      updatedAt: deps.serverTimestamp()
    };
  };
  let saveCommitted = false;
  if (typeof deps.runTransaction === "function") {
    try {
      await deps.runTransaction(deps.firestoreDb, async (transaction) => {
        const existingSnap = await transaction.get(sessionRef);
        const existing = existingSnap.exists() ? (existingSnap.data() || {}) : null;
        transaction.set(sessionRef, writeSession(existing), { merge: true });
      });
      saveCommitted = true;
    } catch (txError) {
      const code = String(txError?.code || "").toLowerCase();
      const message = String(txError?.message || "").toLowerCase();
      const isRetryableError = code.includes("failed-precondition")
        || code.includes("aborted")
        || code.includes("unavailable")
        || message.includes("failed-precondition")
        || message.includes("precondition");
      if (!isRetryableError) {
        throw txError;
      }
      console.warn("[podcaster-session-store] Transacción falló por precondición/concurrencia; usando setDoc merge directo:", txError);
    }
  }
  if (!saveCommitted) {
    const existingSnap = await deps.getDoc(sessionRef).catch(() => null);
    const existing = existingSnap?.exists?.() ? (existingSnap.data() || {}) : null;
    await deps.setDoc(sessionRef, writeSession(existing), { merge: true });
  }
  return {
    ok: true,
    sessionId: sanitized.id,
    ownerId: String((await deps.getDoc(sessionRef)).data()?.ownerId || uid).trim(),
    savedAt: typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString(),
    session: committedSession
  };
}

function isRecoverableSessionSaveAuthError(error = null) {
  const message = String(error?.message || error?.code || "").trim();
  const status = Number(error?.status || 0);
  const detailError = String(error?.detail?.error || error?.detail?.code || "").trim();
  return status === 401
    || status === 403
    || /^AUTH_/i.test(message)
    || /^AUTH_/i.test(detailError);
}

async function saveSessionManuallyToCloud(sessionId = "", options = {}, deps = {}, storageAdapter = null) {
  const uid = String(deps.resolveCurrentUid?.() || "").trim();
  const getSessions = deps.getSessions || (() => []);
  const setSessions = deps.setSessions || (() => {});
  const getActiveSession = deps.getActiveSession || (() => null);
  const silent = options?.silent === true;
  deps.persistPanelMusicToActiveSession?.();
  const initialTarget = sessionId
    ? getSessions().find((session) => String(session?.id || "").trim() === String(sessionId || "").trim()) || null
    : getActiveSession();
  if (!initialTarget) throw new Error("No hay sesión activa para guardar.");
  if (initialTarget.isStub) return null;
  if (initialTarget.archived === true && deps.canEditArchivedSession?.(initialTarget) !== true) {
    throw new Error("Desarchiva la sesión antes de editarla.");
  }
  if (
    deps.hasAvailableApiBase?.()
    && deps.panelMusicState?.sourceType === "track"
    && deps.panelMusicState?.track
    && String(deps.panelMusicState.track.localDataUrl || "").trim()
    && !(String(deps.panelMusicState.track.storagePath || "").trim() && String(deps.panelMusicState.track.downloadUrl || "").trim())
  ) {
    await deps.ensurePanelMusicTrackUploaded?.(initialTarget.id, { silent: true });
  }
  const target = sessionId
    ? getSessions().find((session) => String(session?.id || "").trim() === String(sessionId || "").trim()) || null
    : getActiveSession();
  if (!target) throw new Error("No hay sesión activa para guardar.");
  if (!silent) window.setGenerationStatus?.("Guardando sesión en Firebase...", "is-busy");
  const rawPayload = deps.buildCloudSessionPayload(target);
  const compacted = deps.compactCloudSessionPayload(rawPayload);
  const payload = compacted.payload;
  if (compacted.bytes > Number(deps.MAX_CLOUD_SESSION_PAYLOAD_BYTES || 0)) {
    const error = new Error("La sesión sigue excediendo el tamaño permitido incluso tras compactarla.");
    error.code = "SESSION_TOO_LARGE";
    error.detail = {
      bytes: compacted.bytes,
      limitBytes: deps.MAX_CLOUD_SESSION_PAYLOAD_BYTES,
      strippedReferenceMedia: compacted.strippedReferenceMedia,
      trimmedChat: compacted.trimmedChat
    };
    throw error;
  }
  let response = null;
  const useSessionSaveApi = options?.useApi === true && deps.hasAvailableApiBase?.();
  if (useSessionSaveApi) {
    try {
      response = await deps.authFetchJson("/api/podcaster/sessions/save", {
        method: "POST",
        sameOrigin: true,
        body: JSON.stringify({ session: payload })
      });
    } catch (error) {
      if (!isRecoverableSessionSaveAuthError(error)) throw error;
      deps.logPodcastRenderDebug?.("cloud-session-save-api-auth-fallback", {
        sessionId: String(payload?.id || "").trim(),
        status: Number(error?.status || 0),
        error: String(error?.message || error?.detail?.error || "AUTH_FORBIDDEN")
      });
      response = await saveSessionDirectToCloud(payload, deps);
    }
  } else {
    response = await saveSessionDirectToCloud(payload, deps);
  }
  const savedAt = String(response?.savedAt || deps.nowIso?.() || new Date().toISOString()).trim()
    || (typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString());
  const committedPayload = response?.session && typeof response.session === "object"
    ? response.session
    : payload;
  const localReferenceMedia = {
    speakerReferenceImageMap: target.speakerReferenceImageMap,
    scenarioReferenceImageMap: target.scenarioReferenceImageMap,
    rowReferenceImageMap: target.rowReferenceImageMap,
    rowReferenceImageListMap: target.rowReferenceImageListMap,
    rowReferenceVideoMap: target.rowReferenceVideoMap,
    rowReferenceModeByRowId: target.rowReferenceModeByRowId
  };
  const nextSessions = getSessions().map((session) => (
    String(session?.id || "").trim() === String(target?.id || "").trim()
      ? {
        ...committedPayload,
        ...localReferenceMedia,
        cloudMeta: {
          ...(session.cloudMeta || {}),
          savedAt,
          ownerId: String(response?.ownerId || "").trim() || session.cloudMeta?.ownerId || null
        }
      }
      : session
  ));
  setSessions(nextSessions);
  persistSessionsToLocalCache(uid, nextSessions, deps, storageAdapter);
  persistSessionSyncMeta(uid, String(target?.id || "").trim(), {
    dirty: false,
    cloudFingerprint: computeSessionFingerprint(committedPayload, deps),
    localFingerprint: computeSessionFingerprint(committedPayload, deps),
    lastKnownCloudUpdatedAt: savedAt,
    lastManualCloudSaveAt: savedAt
  }, deps, storageAdapter);
  deps.logPodcastRenderDebug?.("cloud-session-save-media", {
    sessionId: String(target?.id || "").trim(),
    dialogueVideoKeys: Object.keys(deps.getDialogueVideoMap?.(payload) || {}).length,
    dialogueAudioKeys: Object.keys(deps.getDialogueAudioMap?.(payload) || {}).length
  });
  if (!silent) {
    console.log("[podcaster][session-store] Sesión guardada en Firebase", {
      savedAt: deps.formatDate?.(savedAt) || savedAt,
      sessionId: String(target?.id || "").trim()
    });
    if (compacted.strippedReferenceMedia || compacted.trimmedChat) {
      const notes = [];
      if (compacted.strippedReferenceMedia) notes.push("referencias locales pesadas omitidas del guardado cloud");
      if (compacted.trimmedChat) notes.push("historial de chat recortado");
      window.setGenerationStatus?.(`Sesión guardada · ${notes.join(" · ")}`, "is-live");
    } else {
      window.setGenerationStatus?.("Sesión guardada", "is-live");
    }
    window.playSessionSavedAnimation?.();
    if (options.render !== false) {
      deps.render?.();
    }
  }
  return response;
}

async function bootstrapSessions(uid = "", deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  const localSessions = loadSessionsFromLocalCache(uid, deps, nextStorage);
  let cloudSessions = [];
  try {
    cloudSessions = await loadSessionsFromCloud(uid, deps);
  } catch (_) {
    cloudSessions = [];
  }

  // A list response contains only metadata. When it matches the cached list,
  // avoid fingerprinting and rewriting every full script and media map.
  if (cloudSessions.length > 0 && cloudSessions.length === localSessions.length
    && cloudSessions.every((session) => session?.isStub === true)) {
    const localById = new Map(localSessions.map((session) => [String(session?.id || "").trim(), session]));
    const sameMetadata = cloudSessions.every((cloud) => {
      const local = localById.get(String(cloud?.id || "").trim());
      if (!local) return false;
      return String(local.updatedAt || "") === String(cloud.updatedAt || "")
        && String(local.title || "") === String(cloud.title || "")
        && (local.archived === true) === (cloud.archived === true)
        && (local.publicar === true) === (cloud.publicar === true)
        && JSON.stringify(local.academicMetadata || {}) === JSON.stringify(cloud.academicMetadata || {});
    });
    if (sameMetadata) return { sessions: localSessions, useLocal: true };
  }

  const localFingerprint = JSON.stringify(
    (Array.isArray(localSessions) ? localSessions : [])
      .map((session) => sanitizeSessionForFingerprint(session, deps))
      .sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")))
  );
  const cloudFingerprint = JSON.stringify(
    (Array.isArray(cloudSessions) ? cloudSessions : [])
      .map((session) => sanitizeSessionForFingerprint(session, deps))
      .sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")))
  );
  const localUpdatedAt = (Array.isArray(localSessions) ? localSessions : [])
    .map((session) => String(session?.updatedAt || "").trim())
    .sort()
    .join("|");
  const cloudUpdatedAt = (Array.isArray(cloudSessions) ? cloudSessions : [])
    .map((session) => String(session?.updatedAt || "").trim())
    .sort()
    .join("|");

  if (localFingerprint && cloudFingerprint && localFingerprint === cloudFingerprint && localUpdatedAt === cloudUpdatedAt) {
    persistSessionsToLocalCache(uid, localSessions, deps, nextStorage);
    return {
      sessions: localSessions,
      useLocal: true
    };
  }

  const resolvedSessions = mergeCloudVsLocalSessions(cloudSessions, localSessions, deps, nextStorage);
  if (cloudSessions.length) {
    persistSessionsToLocalCache(uid, resolvedSessions, deps, nextStorage);
  } else {
    persistSessionsToLocalCache(uid, resolvedSessions, deps, nextStorage);
  }

  return {
    sessions: resolvedSessions,
    useLocal: !cloudSessions.length
  };
}

function createPodcasterSessionStore(deps = {}) {
  const storageAdapter = deps.storageAdapter || createLocalStorageSessionAdapter(deps);
  return {
    storageAdapter,
    loadSessionsFromLocalCache(uid = deps.resolveCurrentUid?.()) {
      return loadSessionsFromLocalCache(uid, deps, storageAdapter);
    },
    persistSessionsToLocalCache(uid = deps.resolveCurrentUid?.(), sessions = deps.getSessions?.() || []) {
      return persistSessionsToLocalCache(uid, sessions, deps, storageAdapter);
    },
    loadSessionsFromCloud(uid = deps.resolveCurrentUid?.()) {
      return loadSessionsFromCloud(uid, deps);
    },
    loadSingleSessionFromCloud(sessionId = "", uid = deps.resolveCurrentUid?.()) {
      return loadSingleSessionFromCloud(sessionId, uid, deps);
    },
    listAdminUsers() {
      return listAdminUsers(deps);
    },
    listAdminVideoSessions(ownerId = "") {
      return listAdminVideoSessions(ownerId, deps);
    },
    mergeCloudVsLocalSessions(cloudSessions = [], localSessions = []) {
      return mergeCloudVsLocalSessions(cloudSessions, localSessions, deps, storageAdapter);
    },
    computeSessionFingerprint(session = null) {
      return computeSessionFingerprint(session, deps);
    },
    loadSessionSyncMeta(uid = deps.resolveCurrentUid?.(), sessionId = "") {
      return loadSessionSyncMeta(uid, sessionId, deps, storageAdapter);
    },
    persistSessionSyncMeta(uid = deps.resolveCurrentUid?.(), sessionId = "", patch = {}) {
      return persistSessionSyncMeta(uid, sessionId, patch, deps, storageAdapter);
    },
    markDirty(sessionId = "", reason = "", uid = deps.resolveCurrentUid?.()) {
      return markSessionDirty(uid, sessionId, reason, deps, storageAdapter);
    },
    async saveManual(sessionId = "", options = {}) {
      return saveSessionManuallyToCloud(sessionId, options, deps, storageAdapter);
    },
    replaceLocalSessionFromCloud(uid = deps.resolveCurrentUid?.(), cloudSession = null) {
      return replaceLocalSessionFromCloud(uid, cloudSession, deps, storageAdapter);
    },
    async bootstrapSessions(uid = deps.resolveCurrentUid?.()) {
      return bootstrapSessions(uid, deps, storageAdapter);
    }
  };
}

export {
  loadSessionsFromLocalCache,
  persistSessionsToLocalCache,
  loadSessionsFromCloud,
  loadSingleSessionFromCloud,
  listAdminUsers,
  listAdminVideoSessions,
  mergeCloudVsLocalSessions,
  computeSessionFingerprint,
  loadSessionSyncMeta,
  persistSessionSyncMeta,
  markSessionDirty,
  saveSessionManuallyToCloud,
  replaceLocalSessionFromCloud,
  saveSessionDirectToCloud,
  bootstrapSessions,
  createPodcasterSessionStore
};
