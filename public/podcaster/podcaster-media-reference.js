let latestPodcasterMediaReferenceApi = null;

export function createPodcasterMediaReferenceApi(deps = {}) {
  const getElements = () => deps.getElements?.() || {};
  const getActiveSession = () => deps.getActiveSession?.() || null;
  const nowIso = () => deps.nowIso?.() || new Date().toISOString();

  async function readOptimizedImageReferenceDataUrl(file = null) {
    if (typeof deps.readOptimizedImageReferenceDataUrl === "function") {
      return deps.readOptimizedImageReferenceDataUrl(file);
    }
    if (typeof deps.readDataUrlFromFile !== "function") {
      throw new Error("No se pudo leer la imagen de referencia.");
    }
    return deps.readDataUrlFromFile(file, {
      maxChars: deps.MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS,
      errorMessage: "No se pudo leer la imagen de referencia."
    });
  }

  async function readImageReferenceFromFile(file = null) {
    if (!(file instanceof File)) throw new Error("No se recibió una imagen válida.");
    if (!String(file.type || "").startsWith("image/")) {
      throw new Error("El archivo debe ser una imagen.");
    }
    const dataUrl = await readOptimizedImageReferenceDataUrl(file);
    const normalized = normalizeReferenceImageRecord({
      name: String(file.name || "Referencia").trim() || "Referencia",
      dataUrl,
      mimeType: String(dataUrl.match(/^data:([^;,]+)/i)?.[1] || file.type || "image/jpeg").trim().toLowerCase() || "image/jpeg",
      updatedAt: nowIso()
    });
    if (!normalized) {
      throw new Error("La imagen de referencia es demasiado grande o no es válida.");
    }
    return normalized;
  }

  function isLikelyVideoReferenceFile(file = null) {
    if (!(file instanceof File)) return false;
    const type = String(file.type || "").trim().toLowerCase();
    const name = String(file.name || "").trim().toLowerCase();
    return type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi|mpeg|mpg)$/i.test(name);
  }

  async function readVideoReferenceFromFile(file = null) {
    if (!(file instanceof File)) throw new Error("No se recibió un video válido.");
    if (!isLikelyVideoReferenceFile(file)) {
      throw new Error("El archivo debe ser un video.");
    }
    const dataUrl = await deps.readDataUrlFromFile(file, {
      maxChars: deps.MAX_LOCAL_REFERENCE_VIDEO_DATA_URL_CHARS,
      errorMessage: "No se pudo leer el video de referencia."
    });
    const normalized = normalizeReferenceVideoRecord({
      name: String(file.name || "Referencia de video").trim() || "Referencia de video",
      dataUrl,
      mimeType: String(file.type || "video/mp4").trim().toLowerCase() || "video/mp4",
      updatedAt: nowIso()
    });
    if (!normalized) throw new Error("El video de referencia es demasiado grande o no es válido.");
    return normalized;
  }

  function normalizeReferenceImageRecord(raw = null) {
    if (!raw || typeof raw !== "object") return null;
    const normalized = deps.buildImageReferenceRecordFromMedia?.(raw, "Referencia") || null;
    if (!normalized) return null;
    if (normalized.dataUrl && normalized.dataUrl.length > deps.MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS) return null;
    return normalized;
  }

  function normalizeReferenceImageList(value = null, maxItems = 4) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => normalizeReferenceImageRecord(item))
      .filter(Boolean)
      .slice(0, Math.max(1, Math.min(8, Number(maxItems || 4) || 4)));
  }

  function normalizeReferenceImageMap(raw = {}) {
    const next = {};
    if (!raw || typeof raw !== "object") return next;
    Object.entries(raw).forEach(([key, value]) => {
      const cleanKey = String(key || "").trim();
      const normalized = normalizeReferenceImageRecord(value);
      if (!cleanKey || !normalized) return;
      next[cleanKey] = normalized;
    });
    return next;
  }

  function normalizeReferenceImageListMap(raw = {}, maxEntries = 500, maxItemsPerRow = 4) {
    const next = {};
    if (!raw || typeof raw !== "object") return next;
    Object.entries(raw).slice(0, maxEntries).forEach(([key, value]) => {
      const cleanKey = String(key || "").trim();
      const normalizedList = normalizeReferenceImageList(value, maxItemsPerRow);
      if (!cleanKey || !normalizedList.length) return;
      next[cleanKey] = normalizedList;
    });
    return next;
  }

  function normalizeReferenceVideoRecord(raw = null) {
    if (!raw || typeof raw !== "object") return null;
    const dataUrl = String(raw.dataUrl || "").trim().slice(0, deps.MAX_LOCAL_REFERENCE_VIDEO_DATA_URL_CHARS);
    const mediaRef = deps.normalizeMediaReferenceFromRecord?.(
      raw,
      ["downloadUrl", "url", "dataUrl"],
      ["storagePath", "path"]
    ) || { downloadUrl: "", storagePath: "" };
    const downloadUrl = String(mediaRef.downloadUrl || "").trim();
    const storagePath = String(mediaRef.storagePath || "").trim();
    const mimeType = String(raw.mimeType || "video/mp4").trim().toLowerCase() || "video/mp4";
    const explicitType = String(raw.type || "").trim().toLowerCase();
    if (!dataUrl.startsWith("data:video/") && !downloadUrl && !storagePath) return null;
    if (mimeType.startsWith("image/") || explicitType === "image") return null;
    return {
      name: String(raw.name || "Referencia de video").trim().slice(0, 180) || "Referencia de video",
      dataUrl,
      downloadUrl,
      storagePath,
      mimeType,
      type: explicitType || null,
      updatedAt: String(raw.updatedAt || nowIso()).trim() || nowIso()
    };
  }

  function normalizeReferenceVideoMap(raw = {}) {
    const next = {};
    if (!raw || typeof raw !== "object") return next;
    Object.entries(raw).forEach(([key, value]) => {
      const cleanKey = String(key || "").trim();
      const normalized = normalizeReferenceVideoRecord(value);
      if (!cleanKey || !normalized) return;
      next[cleanKey] = normalized;
    });
    return next;
  }

  function normalizeRowReferenceModeMap(raw = {}, imageMap = {}, videoMap = {}) {
    const next = {};
    const source = raw && typeof raw === "object" ? raw : {};
    const validKeys = new Set([...Object.keys(imageMap || {}), ...Object.keys(videoMap || {})]);
    Object.entries(source).forEach(([key, value]) => {
      const cleanKey = String(key || "").trim();
      if (!cleanKey || !validKeys.has(cleanKey)) return;
      const mode = String(value || "").trim().toLowerCase() === "video" ? "video" : "image";
      if (mode === "video" && !videoMap[cleanKey]) return;
      if (mode === "image" && !imageMap[cleanKey]) return;
      next[cleanKey] = mode;
    });
    Object.keys(videoMap || {}).forEach((key) => {
      if (!next[key] && !imageMap[key]) next[key] = "video";
    });
    return next;
  }

  function getSpeakerReferenceImageMap(session = null) {
    return normalizeReferenceImageMap(session?.speakerReferenceImageMap || {});
  }

  function getScenarioReferenceImageMap(session = null) {
    return normalizeReferenceImageMap(session?.scenarioReferenceImageMap || {});
  }

  function getRowReferenceImageListMap(session = null) {
    const normalizedListMap = normalizeReferenceImageListMap(session?.rowReferenceImageListMap || {});
    const legacyMap = normalizeReferenceImageMap(session?.rowReferenceImageMap || {});
    Object.entries(legacyMap).forEach(([key, value]) => {
      if (!normalizedListMap[key]?.length && value) {
        normalizedListMap[key] = [value];
      }
    });
    return normalizedListMap;
  }

  function getRowReferenceImageList(session = null, rowId = "") {
    const listMap = getRowReferenceImageListMap(session);
    return listMap[String(rowId || "").trim()] || [];
  }

  function getRowReferenceImageMap(session = null) {
    const listMap = getRowReferenceImageListMap(session);
    const next = {};
    Object.entries(listMap).forEach(([key, list]) => {
      const primary = Array.isArray(list) ? list[0] : null;
      if (primary) next[key] = primary;
    });
    return next;
  }

  function getRowReferenceVideoMap(session = null) {
    return normalizeReferenceVideoMap(session?.rowReferenceVideoMap || {});
  }

  function getRowReferenceModeByRowId(session = null) {
    const imageMap = getRowReferenceImageMap(session);
    const videoMap = getRowReferenceVideoMap(session);
    return normalizeRowReferenceModeMap(session?.rowReferenceModeByRowId || {}, imageMap, videoMap);
  }

  function resolveRowReferenceAsset(rowId = "", session = null) {
    const key = String(rowId || "").trim();
    if (!key) return null;
    const activeSession = session || getActiveSession();
    const imageReferences = getRowReferenceImageListMap(activeSession)[key] || [];
    const imageReference = getRowReferenceImageMap(activeSession)[key] || null;
    const videoReference = getRowReferenceVideoMap(activeSession)[key] || null;
    const mode = getRowReferenceModeByRowId(activeSession)[key];
    if (mode === "video" && videoReference) {
      return { kind: "video", ...videoReference };
    }
    if (imageReference) {
      return { kind: "image", images: imageReferences, imageCount: imageReferences.length, ...imageReference };
    }
    if (videoReference) {
      return { kind: "video", ...videoReference };
    }
    return null;
  }

  function resolveReferenceImagePreviewUrl(reference = null) {
    if (!reference || typeof reference !== "object") return "";
    const dataUrl = String(reference.dataUrl || "").trim();
    if (dataUrl) return dataUrl;
    return deps.resolveStorageVideoUrl?.(
      String(reference.downloadUrl || "").trim(),
      String(reference.storagePath || "").trim(),
      {
        type: "image",
        mimeType: String(reference.mimeType || "image/png").trim(),
        updatedAt: String(reference.updatedAt || "").trim()
      }
    ) || "";
  }

  async function persistRowReferencesPatchToCloud(session = null) {
    const activeSession = session || getActiveSession();
    const uid = deps.resolveCurrentUid?.();
    const sessionId = String(activeSession?.id || "").trim();
    if (!uid || !sessionId || !activeSession || activeSession.isStub) {
      return { ok: false, skipped: true, reason: "missing-session-or-auth" };
    }
    const cloudMeta = activeSession?.cloudMeta || {};
    if (!String(cloudMeta?.savedAt || "").trim() && !String(cloudMeta?.ownerId || "").trim()) {
      return { ok: false, skipped: true, reason: "local-only-session" };
    }
    const sessionRef = deps.doc?.(deps.firestoreDb, "podcaster_sessions", sessionId);
    const sessionUpdatedAt = String(activeSession?.updatedAt || nowIso()).trim() || nowIso();
    const updatePayload = {
      sessionUpdatedAt,
      updatedAt: deps.serverTimestamp?.(),
      "session.updatedAt": sessionUpdatedAt,
      "session.rowReferenceImageMap": getRowReferenceImageMap(activeSession),
      "session.rowReferenceImageListMap": getRowReferenceImageListMap(activeSession),
      "session.rowReferenceVideoMap": getRowReferenceVideoMap(activeSession),
      "session.rowReferenceModeByRowId": getRowReferenceModeByRowId(activeSession)
    };
    try {
      await deps.updateDoc?.(sessionRef, updatePayload);
      if (activeSession?.cloudMeta && typeof activeSession.cloudMeta === "object") {
        activeSession.cloudMeta.savedAt = sessionUpdatedAt;
      }
      return { ok: true, sessionId, savedAt: sessionUpdatedAt };
    } catch (error) {
      void error;
      return { ok: false, sessionId, error };
    }
  }

  function setSpeakerReferenceImage(speaker = "", reference = null) {
    const key = deps.normalizeSpeakerLabel?.(speaker, "") || "";
    if (!key) return false;
    const normalized = normalizeReferenceImageRecord(reference);
    deps.upsertActiveSession?.((current) => {
      const nextMap = { ...getSpeakerReferenceImageMap(current) };
      if (normalized) nextMap[key] = normalized;
      else delete nextMap[key];
      return { ...current, speakerReferenceImageMap: nextMap };
    }, { render: false });
    const session = getActiveSession();
    deps.renderPodcastPortraitStrip?.(session, { force: true, reason: "structure" });
    deps.scheduleSessionLocalPersist?.("speaker-reference-image");
    return true;
  }

  function setScenarioReferenceImage(scenarioId = "", reference = null) {
    const key = String(scenarioId || "").trim();
    if (!key) return false;
    const normalized = normalizeReferenceImageRecord(reference);
    deps.upsertActiveSession?.((current) => {
      const nextMap = { ...getScenarioReferenceImageMap(current) };
      if (normalized) nextMap[key] = normalized;
      else delete nextMap[key];
      return { ...current, scenarioReferenceImageMap: nextMap };
    }, { render: false });
    const session = getActiveSession();
    deps.renderPodcastPortraitStrip?.(session, { force: true, reason: "structure" });
    deps.scheduleSessionLocalPersist?.("scenario-reference-image");
    return true;
  }

  function setRowReferenceImage(rowId = "", reference = null) {
    return setRowReferenceImages(rowId, reference ? [reference] : []);
  }

  function setRowReferenceImages(rowId = "", references = []) {
    const key = String(rowId || "").trim();
    if (!key) return false;
    const normalizedList = normalizeReferenceImageList(references, 4);
    const primary = normalizedList[0] || null;
    deps.upsertActiveSession?.((current) => {
      const nextMap = { ...getRowReferenceImageMap(current) };
      const nextListMap = { ...getRowReferenceImageListMap(current) };
      const nextVideoMap = { ...getRowReferenceVideoMap(current) };
      const nextModeMap = { ...getRowReferenceModeByRowId(current) };
      if (primary) nextMap[key] = primary;
      else delete nextMap[key];
      if (normalizedList.length) nextListMap[key] = normalizedList;
      else delete nextListMap[key];
      if (normalizedList.length) {
        delete nextVideoMap[key];
        nextModeMap[key] = "image";
      } else if (nextModeMap[key] === "image") {
        delete nextModeMap[key];
      }
      return {
        ...current,
        rowReferenceImageMap: nextMap,
        rowReferenceImageListMap: nextListMap,
        rowReferenceVideoMap: nextVideoMap,
        rowReferenceModeByRowId: nextModeMap
      };
    }, { render: false });
    const refreshed = getActiveSession();
    deps.renderScript?.(refreshed);
    deps.syncPodcastStudioInspector?.(refreshed);
    deps.renderPodcastVideoShell?.(refreshed);
    deps.renderCreativeVideoShell?.(refreshed);
    void persistRowReferencesPatchToCloud(refreshed);
    deps.scheduleSessionLocalPersist?.("row-reference-images");
    return true;
  }

  function setRowReferenceVideo(rowId = "", reference = null) {
    const key = String(rowId || "").trim();
    if (!key) return false;
    const normalized = normalizeReferenceVideoRecord(reference);
    deps.upsertActiveSession?.((current) => {
      const nextMap = { ...getRowReferenceVideoMap(current) };
      const nextImageMap = { ...getRowReferenceImageMap(current) };
      const nextImageListMap = { ...getRowReferenceImageListMap(current) };
      const nextModeMap = { ...getRowReferenceModeByRowId(current) };
      if (normalized) nextMap[key] = normalized;
      else delete nextMap[key];
      if (normalized) {
        delete nextImageMap[key];
        delete nextImageListMap[key];
        nextModeMap[key] = "video";
      } else if (nextModeMap[key] === "video") {
        delete nextModeMap[key];
      }
      return {
        ...current,
        rowReferenceVideoMap: nextMap,
        rowReferenceImageMap: nextImageMap,
        rowReferenceImageListMap: nextImageListMap,
        rowReferenceModeByRowId: nextModeMap
      };
    }, { render: false });
    const refreshed = getActiveSession();
    deps.renderScript?.(refreshed);
    deps.renderPodcastVideoTimeline?.(refreshed, { force: true, reason: "structure" });
    deps.syncPodcastStudioInspector?.(refreshed);
    deps.renderPodcastVideoShell?.(refreshed);
    deps.renderCreativeVideoShell?.(refreshed);
    void persistRowReferencesPatchToCloud(refreshed);
    deps.scheduleSessionLocalPersist?.("row-reference-video");
    return true;
  }

  function promptSpeakerReferenceSelection(speaker = "") {
    const key = String(speaker || "").trim();
    const els = getElements();
    if (!key || !els.speakerReferenceImageInput) return false;
    els.speakerReferenceImageInput.dataset.speaker = key;
    els.speakerReferenceImageInput.click();
    return true;
  }

  function promptScenarioReferenceSelection(scenarioId = "") {
    const key = String(scenarioId || "").trim();
    const els = getElements();
    if (!key || !els.scenarioReferenceImageInput) return false;
    els.scenarioReferenceImageInput.dataset.scenarioId = key;
    els.scenarioReferenceImageInput.click();
    return true;
  }

  function promptRowReferenceSelection(rowId = "") {
    const key = String(rowId || "").trim();
    const els = getElements();
    if (!key || !els.rowReferenceImageInput) return false;
    els.rowReferenceImageInput.dataset.rowId = key;
    els.rowReferenceImageInput.click();
    return true;
  }

  function clearRowReference(rowId = "") {
    const key = String(rowId || "").trim();
    if (!key) return false;
    setRowReferenceImage(key, null);
    setRowReferenceVideo(key, null);
    return true;
  }

  function bindInputEvents() {
    const els = getElements();
    if (els.speakerReferenceImageInput && !els.speakerReferenceImageInput.dataset.mediaReferenceBound) {
      els.speakerReferenceImageInput.dataset.mediaReferenceBound = "1";
      els.speakerReferenceImageInput.addEventListener("change", async () => {
        const speaker = String(els.speakerReferenceImageInput.dataset.speaker || "").trim();
        const file = els.speakerReferenceImageInput.files?.[0] || null;
        els.speakerReferenceImageInput.value = "";
        els.speakerReferenceImageInput.dataset.speaker = "";
        if (!speaker || !file) return;
        try {
          const reference = await readImageReferenceFromFile(file);
          setSpeakerReferenceImage(speaker, reference);
          window.setGenerationStatus?.(`Referencia actualizada para ${deps.resolveSpeakerDisplayName?.(speaker, getActiveSession())}`, "is-live");
        } catch (error) {
          window.addChatMessage?.("system", `No se pudo adjuntar referencia para ${deps.resolveSpeakerDisplayName?.(speaker, getActiveSession())} (${error.message}).`);
        }
      });
    }
    if (els.scenarioReferenceImageInput && !els.scenarioReferenceImageInput.dataset.mediaReferenceBound) {
      els.scenarioReferenceImageInput.dataset.mediaReferenceBound = "1";
      els.scenarioReferenceImageInput.addEventListener("change", async () => {
        const scenarioId = String(els.scenarioReferenceImageInput.dataset.scenarioId || "").trim();
        const file = els.scenarioReferenceImageInput.files?.[0] || null;
        els.scenarioReferenceImageInput.value = "";
        els.scenarioReferenceImageInput.dataset.scenarioId = "";
        if (!scenarioId || !file) return;
        try {
          const reference = await readImageReferenceFromFile(file);
          setScenarioReferenceImage(scenarioId, reference);
          window.setGenerationStatus?.("Referencia de escenario actualizada", "is-live");
        } catch (error) {
          window.addChatMessage?.("system", `No se pudo adjuntar referencia de escenario (${error.message}).`);
        }
      });
    }
    if (els.rowReferenceImageInput && !els.rowReferenceImageInput.dataset.mediaReferenceBound) {
      els.rowReferenceImageInput.dataset.mediaReferenceBound = "1";
      els.rowReferenceImageInput.addEventListener("change", async () => {
        const rowId = String(els.rowReferenceImageInput.dataset.rowId || "").trim();
        const files = Array.from(els.rowReferenceImageInput.files || []);
        const file = files[0] || null;
        els.rowReferenceImageInput.value = "";
        els.rowReferenceImageInput.dataset.rowId = "";
        if (!rowId || !file) return;
        try {
          const hasVideo = files.some((item) => isLikelyVideoReferenceFile(item));
          if (files.length > 1 && hasVideo) {
            throw new Error("Puedes elegir varias imagenes o un solo video, pero no mezclarlos.");
          }
          if (files.length === 1 && isLikelyVideoReferenceFile(file)) {
            const reference = await readVideoReferenceFromFile(file);
            setRowReferenceVideo(rowId, reference);
            window.setGenerationStatus?.(`Video de referencia actualizado para escena ${deps.resolveSceneNumberByRowId?.(rowId, getActiveSession())}`, "is-live");
          } else {
            const references = await Promise.all(files.map((item) => readImageReferenceFromFile(item)));
            setRowReferenceImages(rowId, references);
            window.setGenerationStatus?.(
              references.length > 1
                ? `${references.length} referencias actualizadas para escena ${deps.resolveSceneNumberByRowId?.(rowId, getActiveSession())}`
                : `Referencia actualizada para escena ${deps.resolveSceneNumberByRowId?.(rowId, getActiveSession())}`,
              "is-live"
            );
          }
        } catch (error) {
          window.addChatMessage?.("system", `No se pudo adjuntar referencia para la escena ${deps.resolveSceneNumberByRowId?.(rowId, getActiveSession())} (${error.message}).`);
        }
      });
    }
  }

  latestPodcasterMediaReferenceApi = {
    readImageReferenceFromFile,
    isLikelyVideoReferenceFile,
    readVideoReferenceFromFile,
    normalizeReferenceImageRecord,
    normalizeReferenceImageList,
    normalizeReferenceImageMap,
    normalizeReferenceImageListMap,
    normalizeReferenceVideoRecord,
    normalizeReferenceVideoMap,
    normalizeRowReferenceModeMap,
    getSpeakerReferenceImageMap,
    getScenarioReferenceImageMap,
    getRowReferenceImageListMap,
    getRowReferenceImageList,
    getRowReferenceImageMap,
    getRowReferenceVideoMap,
    getRowReferenceModeByRowId,
    resolveRowReferenceAsset,
    resolveReferenceImagePreviewUrl,
    persistRowReferencesPatchToCloud,
    setSpeakerReferenceImage,
    setScenarioReferenceImage,
    setRowReferenceImage,
    setRowReferenceImages,
    setRowReferenceVideo,
    promptSpeakerReferenceSelection,
    promptScenarioReferenceSelection,
    promptRowReferenceSelection,
    clearRowReference,
    bindInputEvents
  };
  window.PodcasterMediaReferenceApi = latestPodcasterMediaReferenceApi;
  return latestPodcasterMediaReferenceApi;
}

Object.assign(window, {
  getRowReferenceImageListMap: (...args) => latestPodcasterMediaReferenceApi?.getRowReferenceImageListMap?.(...args),
  getRowReferenceImageList: (...args) => latestPodcasterMediaReferenceApi?.getRowReferenceImageList?.(...args),
  getRowReferenceImageMap: (...args) => latestPodcasterMediaReferenceApi?.getRowReferenceImageMap?.(...args),
  getRowReferenceVideoMap: (...args) => latestPodcasterMediaReferenceApi?.getRowReferenceVideoMap?.(...args)
});
