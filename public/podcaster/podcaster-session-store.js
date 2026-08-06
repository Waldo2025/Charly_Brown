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
  return {
    ...currentBase,
    ...nextIncoming,
    segments: incomingSegments.length ? incomingSegments : baseSegments,
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
    timelineOverlayCardsById: mergeRecordMapsByEntry(currentBase.timelineOverlayCardsById, nextIncoming.timelineOverlayCardsById),
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

function mergeRowsPreservingFallback(primaryRows = [], fallbackRows = []) {
  const primary = Array.isArray(primaryRows) ? primaryRows : [];
  const fallback = Array.isArray(fallbackRows) ? fallbackRows : [];
  if (!primary.length) return fallback.slice();
  if (!fallback.length) return primary.slice();
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
  return merged;
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
  const rows = mergeRowsPreservingFallback(nestedRows, topRows);
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

  return session;
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
  let clone = null;
  try {
    clone = JSON.parse(JSON.stringify(source));
  } catch (_) {
    clone = { ...source };
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
  for (const candidateUid of storageCandidates) {
    const storageKey = resolveSessionStorageKey(candidateUid, deps);
    if (!scopedStorageKey) scopedStorageKey = storageKey;
    loadDeletedSessionIds(candidateUid, deps, nextStorage).forEach((id) => deletedSessionIds.add(id));
    const nextScopedSessions = readJsonArrayStorage(nextStorage, storageKey)
      .filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
    if (nextScopedSessions.length) {
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
  const mergedLocal = mergeLocalSessionsByContent(scopedSessions, mergedLegacy);
  if (mergedLocal.length && scopedStorageKey) {
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
    const sessionKeys = sessionData ? Object.keys(sessionData) : [];
    const isShallowSession = Boolean(
      sessionData
      && sessionKeys.length
      && sessionKeys.every((key) => key === "id" || key === "title" || key === "script")
      && Array.isArray(sessionData?.script?.rows)
    );
    if (deletedSessionIds.has(String(docSnap.id || "").trim())) return;
    merged.set(docSnap.id, {
      ...(sessionData || {}),
      id: docSnap.id,
      title: data.title || sessionData?.title || "Sin título",
      updatedAt: data.sessionUpdatedAt || sessionData?.updatedAt || data.updatedAt?.toDate?.().toISOString() || (typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString()),
      archived: typeof data.archived === "boolean" ? data.archived : sessionData?.archived === true,
      publicar: typeof data.publicar === "boolean" ? data.publicar : sessionData?.publicar === true,
      isStub: !sessionData || isShallowSession,
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

async function loadSingleSessionFromCloud(sessionId = "", uid = "", deps = {}) {
  const key = String(sessionId || "").trim();
  if (!uid || !key) return null;
  if (deps.hasAvailableApiBase?.()) {
    try {
      const response = await deps.authFetchJson(`/api/podcaster/sessions/get?sessionId=${encodeURIComponent(key)}`, {
        method: "GET",
        preferRemote: false
      });
      const session = response?.session && typeof response.session === "object" ? response.session : null;
      if (session) return session;
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

function mergeCloudVsLocalSessions(cloudSessions = [], localSessions = [], deps = {}) {
  const mergeSessionRowsWithFallback = deps.mergeSessionRowsWithFallback || ((primaryRows = [], fallbackRows = []) => primaryRows.length ? primaryRows : fallbackRows);
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
  const mergeDialogueAudioMapByEntryUpdatedAt = (primaryMap = {}, secondaryMap = {}) => {
    const next = {};
    const keys = new Set([
      ...Object.keys(primaryMap && typeof primaryMap === "object" ? primaryMap : {}),
      ...Object.keys(secondaryMap && typeof secondaryMap === "object" ? secondaryMap : {})
    ]);
    keys.forEach((key) => {
      const resolved = chooseNewerByUpdatedAt(
        primaryMap && typeof primaryMap === "object" ? primaryMap[key] : null,
        secondaryMap && typeof secondaryMap === "object" ? secondaryMap[key] : null
      );
      if (resolved && typeof resolved === "object") {
        next[key] = resolved;
      }
    });
    return next;
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
    if (!localSession) return cloudSession;
    const localRows = Array.isArray(localSession?.script?.rows) ? localSession.script.rows : [];
    const cloudRows = Array.isArray(cloudSession?.script?.rows) ? cloudSession.script.rows : [];
    const localUpdatedAt = Date.parse(String(localSession?.updatedAt || ""));
    const cloudUpdatedAt = Date.parse(String(cloudSession?.updatedAt || ""));
    const preferLocalSessionFlags = Number.isFinite(localUpdatedAt) && (!Number.isFinite(cloudUpdatedAt) || localUpdatedAt >= cloudUpdatedAt);
    const localHasContent = hasLocalSessionContent(localSession);
    const cloudHasContent = hasLocalSessionContent(cloudSession);
    if (localHasContent && !cloudHasContent) {
      return {
        ...cloudSession,
        ...localSession,
        id,
        title: cloudSession?.title || localSession?.title || "Sin título",
        updatedAt: cloudSession?.updatedAt || localSession?.updatedAt,
        cloudMeta: cloudSession?.cloudMeta || localSession?.cloudMeta || null,
        archived: preferLocalSessionFlags ? localSession?.archived === true : cloudSession?.archived === true,
        publicar: preferLocalSessionFlags ? localSession?.publicar === true : cloudSession?.publicar === true,
        isStub: false
      };
    }
    const isShallow = cloudSession.isStub === true || !cloudSession.dialogueVideoMap || Object.keys(cloudSession.dialogueVideoMap).length === 0;
    const hasConcreteCloudRows = cloudSession.isStub !== true && cloudRows.length > 0;
    const resolvedRows = mergeRowsByUpdatedAt(
      mergeSessionRowsWithFallback(cloudRows, localRows),
      localRows
    );
    const finalRows = hasConcreteCloudRows
      ? mergeRowsByUpdatedAt(cloudRows, localRows)
      : resolvedRows;
    const preferLocalVideoConfig = Number.isFinite(localUpdatedAt) && (!Number.isFinite(cloudUpdatedAt) || localUpdatedAt > cloudUpdatedAt);
    const preferLocalDialogueAudioMap = Number.isFinite(localUpdatedAt) && (!Number.isFinite(cloudUpdatedAt) || localUpdatedAt > cloudUpdatedAt);
    // Compatibility: podcastVideoConfig: preferLocalVideoConfig ? (localSession?.podcastVideoConfig || cloudSession?.podcastVideoConfig || {}) : (cloudSession?.podcastVideoConfig || localSession?.podcastVideoConfig || {})
    const resolvedPodcastVideoConfig = preferLocalVideoConfig
      ? (localSession?.podcastVideoConfig || cloudSession?.podcastVideoConfig || {})
      : (cloudSession?.podcastVideoConfig || localSession?.podcastVideoConfig || {});
    
    return {
      ...localSession,
      ...cloudSession,
      archived: preferLocalSessionFlags ? localSession?.archived === true : cloudSession?.archived === true,
      publicar: preferLocalSessionFlags ? localSession?.publicar === true : cloudSession?.publicar === true,
      dialogueAudioMap: preferLocalDialogueAudioMap
        ? mergeDialogueAudioMapByEntryUpdatedAt(localSession?.dialogueAudioMap || {}, cloudSession?.dialogueAudioMap || {})
        : mergeDialogueAudioMapByEntryUpdatedAt(cloudSession?.dialogueAudioMap || {}, localSession?.dialogueAudioMap || {}),
      dialogueVideoMap: isShallow && localSession?.dialogueVideoMap && Object.keys(localSession.dialogueVideoMap).length > 0 
        ? localSession.dialogueVideoMap 
        : mergeRecordMaps(localSession?.dialogueVideoMap || {}, cloudSession?.dialogueVideoMap || {}),
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
    };
  });
  localById.forEach((session) => merged.push(session));
  return merged.sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
}

function replaceLocalSessionFromCloud(uid = "", cloudSession = null, deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  const key = String(cloudSession?.id || "").trim();
  if (!key || !cloudSession) return null;
  const current = loadSessionsFromLocalCache(uid, deps, nextStorage);
  const next = [
    cloudSession,
    ...current.filter((session) => String(session?.id || "").trim() !== key)
  ];
  persistSessionsToLocalCache(uid, next, deps, nextStorage);
  persistSessionSyncMeta(uid, key, {
    dirty: false,
    cloudFingerprint: computeSessionFingerprint(cloudSession, deps),
    localFingerprint: computeSessionFingerprint(cloudSession, deps),
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
  const existingSnap = await deps.getDoc(sessionRef);
  const existing = existingSnap.exists() ? (existingSnap.data() || {}) : null;
  if (existing && String(existing.ownerId || "").trim() !== uid) {
    throw new Error("No puedes sobrescribir una sesión de otro usuario.");
  }
  const sessionUpdatedAt = String(sanitized.updatedAt || deps.nowIso?.() || new Date().toISOString()).trim()
    || (typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString());
  await deps.setDoc(sessionRef, {
    ownerId: uid,
    title: sanitized.title,
    archived: sanitized.archived === true,
    publicar: sanitized.publicar === true,
    sessionUpdatedAt,
    session: sanitized,
    sharedWithIds: Array.isArray(existing?.sharedWithIds) ? existing.sharedWithIds : [],
    sharedWith: Array.isArray(existing?.sharedWith) ? existing.sharedWith : [],
    createdAt: existing?.createdAt || deps.serverTimestamp(),
    updatedAt: deps.serverTimestamp()
  }, { merge: true });
  return {
    ok: true,
    sessionId: sanitized.id,
    ownerId: uid,
    savedAt: typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString()
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
        ...payload,
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
    cloudFingerprint: computeSessionFingerprint(payload, deps),
    localFingerprint: computeSessionFingerprint(payload, deps),
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

  const resolvedSessions = mergeCloudVsLocalSessions(cloudSessions, localSessions, deps);
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
    mergeCloudVsLocalSessions(cloudSessions = [], localSessions = []) {
      return mergeCloudVsLocalSessions(cloudSessions, localSessions, deps);
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
