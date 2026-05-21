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

function sanitizeSessionForFingerprint(session = null, deps = {}) {
  const source = session && typeof session === "object" ? session : {};
  const normalizePodcastVideoConfig = deps.normalizePodcastVideoConfig || ((value) => value || {});
  const normalizeCreativeVideoConfig = deps.normalizeCreativeVideoConfig || ((value) => value || {});
  const normalizePodcastStudioUiState = deps.normalizePodcastStudioUiState || ((value) => value || {});
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
    panelMusicConfig: source.panelMusicConfig || null,
    dialogueVideoMap: source.dialogueVideoMap || {},
    dialogueAudioMap: source.dialogueAudioMap || {},
    rowReferenceImageMap: source.rowReferenceImageMap || {},
    rowReferenceImageListMap: source.rowReferenceImageListMap || {},
    rowReferenceVideoMap: source.rowReferenceVideoMap || {},
    rowReferenceModeByRowId: source.rowReferenceModeByRowId || {},
    podcastVideoConfig: normalizePodcastVideoConfig(source.podcastVideoConfig || {}),
    creativeVideoConfig: normalizeCreativeVideoConfig(source.creativeVideoConfig || {}),
    visualEffectsMap: source.visualEffectsMap || {},
    stylizedTextMap: source.stylizedTextMap || {},
    podcastStudioUiState: normalizePodcastStudioUiState(source.podcastStudioUiState || null, source)
  };
}

const sessionFingerprintCache = new WeakMap();

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
  for (const candidateUid of storageCandidates) {
    const storageKey = resolveSessionStorageKey(candidateUid, deps);
    const deletedSessionIds = new Set(loadDeletedSessionIds(candidateUid, deps, nextStorage));
    const scopedSessions = readJsonArrayStorage(nextStorage, storageKey)
      .filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
    if (scopedSessions.length) return scopedSessions;
  }
  const base = String(deps.STORAGE_KEY_BASE || "cb_podcaster_sessions_v2").trim() || "cb_podcaster_sessions_v2";
  const legacyKey = String(deps.LEGACY_STORAGE_KEY || "cb_podcaster_sessions_v1").trim() || "cb_podcaster_sessions_v1";
  const mergeSessionsById = deps.mergeSessionsById || ((primary = [], secondary = []) => [...primary, ...secondary]);
  const legacyCandidates = [
    legacyKey,
    `${base}:auth_required`,
    `${base}:anon`,
    base
  ];
  const mergedLegacy = legacyCandidates.reduce((acc, key) => {
    const sessions = readJsonArrayStorage(nextStorage, key)
      .filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
    return sessions.length ? mergeSessionsById(acc, sessions) : acc;
  }, []);
  if (mergedLegacy.length) {
    nextStorage?.writeJson?.(storageKey, mergedLegacy);
  }
  return mergedLegacy;
}

function persistSessionsToLocalCache(uid = "", sessions = [], deps = {}, storageAdapter = null) {
  const nextStorage = storageAdapter || createLocalStorageSessionAdapter(deps);
  const nextList = Array.isArray(sessions) ? sessions : [];
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
  const ownedSnap = await deps.getDocs(
    deps.query(
      deps.collection(deps.firestoreDb, "podcaster_sessions"),
      deps.where("ownerId", "==", uid),
      deps.orderBy("updatedAt", "desc"),
      deps.limit(40)
    )
  );
  const merged = new Map();
  [...ownedSnap.docs].forEach((docSnap) => {
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
      archived: data.archived === true,
      publicar: data.publicar === true,
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
  if (deps.hasAvailableApiBase?.()) {
    try {
      const response = await deps.authFetchJson("/api/podcaster/sessions/list", { method: "GET" });
      const apiSessions = Array.isArray(response?.sessions) ? response.sessions : [];
      return apiSessions.filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
    } catch (_) {
      return [];
    }
  }
  const directSessions = await loadCloudSessionsDirect(uid, deps);
  return directSessions.filter((session) => !deletedSessionIds.has(String(session?.id || "").trim()));
}

async function loadSingleSessionFromCloud(sessionId = "", uid = "", deps = {}) {
  const key = String(sessionId || "").trim();
  if (!uid || !key) return null;
  try {
    const sessionRef = deps.doc(deps.firestoreDb, "podcaster_sessions", key);
    const sessionSnap = await deps.getDoc(sessionRef);
    if (!sessionSnap.exists()) return null;
    const data = sessionSnap.data() || {};
    const sessionData = data?.session && typeof data.session === "object" ? data.session : data;
    return sessionData && typeof sessionData === "object" ? sessionData : null;
  } catch (_) {
    return null;
  }
}

function mergeCloudVsLocalSessions(cloudSessions = [], localSessions = [], deps = {}) {
  const mergeSessionRowsWithFallback = deps.mergeSessionRowsWithFallback || ((primaryRows = [], fallbackRows = []) => primaryRows.length ? primaryRows : fallbackRows);
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
    const isShallow = cloudSession.isStub === true || !cloudSession.dialogueVideoMap || Object.keys(cloudSession.dialogueVideoMap).length === 0;
    const hasConcreteCloudRows = cloudSession.isStub !== true && cloudRows.length > 0;
    const resolvedRows = mergeSessionRowsWithFallback(cloudRows, localRows);
    const finalRows = hasConcreteCloudRows
      ? cloudRows
      : resolvedRows;
    
    return {
      ...localSession,
      ...cloudSession,
      dialogueVideoMap: isShallow && localSession?.dialogueVideoMap && Object.keys(localSession.dialogueVideoMap).length > 0 
        ? localSession.dialogueVideoMap 
        : (cloudSession?.dialogueVideoMap || localSession?.dialogueVideoMap || {}),
      rowReferenceImageMap: isShallow && localSession?.rowReferenceImageMap && Object.keys(localSession.rowReferenceImageMap).length > 0
        ? localSession.rowReferenceImageMap
        : (cloudSession?.rowReferenceImageMap || localSession?.rowReferenceImageMap || {}),
      rowReferenceImageListMap: isShallow && localSession?.rowReferenceImageListMap && Object.keys(localSession.rowReferenceImageListMap).length > 0
        ? localSession.rowReferenceImageListMap
        : (cloudSession?.rowReferenceImageListMap || localSession?.rowReferenceImageListMap || {}),
      rowReferenceVideoMap: isShallow && localSession?.rowReferenceVideoMap && Object.keys(localSession.rowReferenceVideoMap).length > 0
        ? localSession.rowReferenceVideoMap
        : (cloudSession?.rowReferenceVideoMap || localSession?.rowReferenceVideoMap || {}),
      rowReferenceModeByRowId: isShallow && localSession?.rowReferenceModeByRowId && Object.keys(localSession.rowReferenceModeByRowId).length > 0
        ? localSession.rowReferenceModeByRowId
        : (cloudSession?.rowReferenceModeByRowId || localSession?.rowReferenceModeByRowId || {}),
      script: {
        ...(localSession?.script || {}),
        ...(cloudSession?.script || {}),
        rows: finalRows
      },
      podcastVideoConfig: cloudSession.isStub === true
        ? (localSession?.podcastVideoConfig || cloudSession?.podcastVideoConfig || {})
        : (cloudSession?.podcastVideoConfig || localSession?.podcastVideoConfig || {}),
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

async function saveSessionManuallyToCloud(sessionId = "", options = {}, deps = {}, storageAdapter = null) {
  const uid = String(deps.resolveCurrentUid?.() || "").trim();
  const getSessions = deps.getSessions || (() => []);
  const setSessions = deps.setSessions || (() => {});
  const getActiveSession = deps.getActiveSession || (() => null);
  const silent = options?.silent === true;
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
  const response = deps.hasAvailableApiBase?.()
    ? await deps.authFetchJson("/api/podcaster/sessions/save", {
      method: "POST",
      body: JSON.stringify({ session: payload })
    })
    : await saveSessionDirectToCloud(payload, deps);
  const savedAt = String(response?.savedAt || deps.nowIso?.() || new Date().toISOString()).trim()
    || (typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString());
  const nextSessions = getSessions().map((session) => (
    String(session?.id || "").trim() === String(target?.id || "").trim()
      ? {
        ...payload,
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
    cloudSessions.forEach((session) => {
      replaceLocalSessionFromCloud(uid, session, deps, nextStorage);
    });
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
