import {
  buildPodcasterLocalMediaKey,
  getPodcasterLocalMediaDataUrl,
  putPodcasterLocalMediaDataUrl
} from "./podcaster-local-media-cache.js";

let latestPodcasterMediaReferenceApi = null;

export function createPodcasterMediaReferenceApi(deps = {}) {
  const getElements = () => deps.getElements?.() || {};
  const getActiveSession = () => deps.getActiveSession?.() || null;
  const nowIso = () => deps.nowIso?.() || new Date().toISOString();
  let pendingRowReferenceSelectionRowId = "";

  function buildReferenceMediaCacheKey(scope = "", id = "", mediaKind = "image") {
    const sessionId = String(getActiveSession()?.id || "").trim() || "session";
    const cleanScope = String(scope || "").trim() || "reference";
    const cleanId = String(id || "").trim() || `${Date.now()}`;
    const cleanKind = String(mediaKind || "").trim() || "image";
    return buildPodcasterLocalMediaKey(`podcaster:${sessionId}:${cleanScope}:${cleanKind}`, cleanId);
  }

  function compressImageToDataUrl(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("No se pudo obtener el contexto 2D del canvas."));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(compressedDataUrl);
        };
        img.onerror = function () {
          reject(new Error("No se pudo cargar la imagen para compresión."));
        };
        img.src = e.target.result;
      };
      reader.onerror = function () {
        reject(new Error("No se pudo leer el archivo de imagen."));
      };
      reader.readAsDataURL(file);
    });
  }

  async function readOptimizedImageReferenceDataUrl(file = null) {
    if (typeof deps.readOptimizedImageReferenceDataUrl === "function") {
      return deps.readOptimizedImageReferenceDataUrl(file);
    }
    if (!file) {
      throw new Error("No se pudo leer la imagen de referencia.");
    }
    if (String(file.type || "").startsWith("image/")) {
      try {
        return await compressImageToDataUrl(file, 800, 800, 0.7);
      } catch (err) {
        console.warn("[MediaReference] Error en compresión de imagen, usando FileReader directo:", err);
      }
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
      updatedAt: nowIso(),
      localMediaCacheKey: buildReferenceMediaCacheKey("temp", file.name, "image")
    });
    if (!normalized) {
      throw new Error("La imagen de referencia es demasiado grande o no es válida.");
    }
    try {
      await putPodcasterLocalMediaDataUrl(normalized.localMediaCacheKey, normalized.dataUrl, {
        mimeType: normalized.mimeType,
        name: normalized.name
      });
    } catch (_) {
      // noop
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
      updatedAt: nowIso(),
      localMediaCacheKey: buildReferenceMediaCacheKey("temp", file.name, "video")
    });
    if (!normalized) throw new Error("El video de referencia es demasiado grande o no es válido.");
    try {
      await putPodcasterLocalMediaDataUrl(normalized.localMediaCacheKey, normalized.dataUrl, {
        mimeType: normalized.mimeType,
        name: normalized.name
      });
    } catch (_) {
      // noop
    }
    return normalized;
  }

  function normalizeReferenceImageRecord(raw = null) {
    if (!raw || typeof raw !== "object") return null;
    const normalized = deps.buildImageReferenceRecordFromMedia?.(raw, "Referencia") || null;
    if (!normalized) return null;
    if (normalized.dataUrl && normalized.dataUrl.length > deps.MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS) return null;
    return {
      ...normalized,
      localMediaCacheKey: String(raw.localMediaCacheKey || normalized.localMediaCacheKey || "").trim()
    };
  }

  const MAX_ROW_REFERENCE_IMAGE_ITEMS = 12;

  function normalizeReferenceImageList(value = null, maxItems = MAX_ROW_REFERENCE_IMAGE_ITEMS) {
    if (!Array.isArray(value)) return [];
    const normalized = value
      .map((item) => normalizeReferenceImageRecord(item))
      .filter(Boolean)
      .slice(0, Math.max(1, Math.min(MAX_ROW_REFERENCE_IMAGE_ITEMS, Number(maxItems || MAX_ROW_REFERENCE_IMAGE_ITEMS) || MAX_ROW_REFERENCE_IMAGE_ITEMS)));
    return dedupeReferenceImageRecords(normalized, maxItems);
  }

  function buildReferenceImageFingerprint(reference = null) {
    const normalized = normalizeReferenceImageRecord(reference);
    if (!normalized) return "";
    const dataUrl = String(normalized.dataUrl || "").trim();
    const downloadUrl = String(normalized.downloadUrl || normalized.url || "").trim();
    const storagePath = String(normalized.storagePath || normalized.path || "").trim();
    const localMediaCacheKey = String(normalized.localMediaCacheKey || "").trim();
    const name = String(normalized.name || "").trim();
    if (dataUrl) return `data:${dataUrl}`;
    if (downloadUrl) return `url:${downloadUrl}`;
    if (storagePath) return `storage:${storagePath}`;
    if (localMediaCacheKey) return `cache:${localMediaCacheKey}`;
    if (name) return `name:${name}`;
    return `raw:${String(JSON.stringify(normalized))}`;
  }

  function dedupeReferenceImageRecords(value = [], maxItems = MAX_ROW_REFERENCE_IMAGE_ITEMS) {
    const seen = new Set();
    const next = [];
    const limit = Math.max(1, Math.min(MAX_ROW_REFERENCE_IMAGE_ITEMS, Number(maxItems || MAX_ROW_REFERENCE_IMAGE_ITEMS) || MAX_ROW_REFERENCE_IMAGE_ITEMS));
    for (const item of Array.isArray(value) ? value : []) {
      const normalized = normalizeReferenceImageRecord(item);
      if (!normalized) continue;
      const fingerprint = buildReferenceImageFingerprint(normalized);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      next.push(normalized);
      if (next.length >= limit) break;
    }
    return next;
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

  function normalizeReferenceImageListMap(raw = {}, maxEntries = 500, maxItemsPerRow = MAX_ROW_REFERENCE_IMAGE_ITEMS) {
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

  function buildCanonicalRowReferenceSessionState(raw = {}) {
    const imageMap = normalizeReferenceImageMap(raw.rowReferenceImageMap || {});
    const listMap = normalizeReferenceImageListMap(raw.rowReferenceImageListMap || {});
    const videoMap = normalizeReferenceVideoMap(raw.rowReferenceVideoMap || {});
    const sourceKeys = new Set([
      ...Object.keys(imageMap),
      ...Object.keys(listMap),
      ...Object.keys(videoMap)
    ]);
    const nextImageMap = {};
    const nextListMap = {};
    for (const key of sourceKeys) {
      const sourceList = [];
      if (Array.isArray(listMap[key])) {
        sourceList.push(...listMap[key]);
      }
      if (imageMap[key]) {
        sourceList.push(imageMap[key]);
      }
      const normalizedList = dedupeReferenceImageRecords(sourceList, MAX_ROW_REFERENCE_IMAGE_ITEMS);
      if (!normalizedList.length) continue;
      nextListMap[key] = normalizedList;
      nextImageMap[key] = normalizedList[0] || null;
    }
    const nextModeMap = normalizeRowReferenceModeMap(raw.rowReferenceModeByRowId || {}, nextImageMap, videoMap);

    return {
      rowReferenceImageMap: nextImageMap,
      rowReferenceImageListMap: nextListMap,
      rowReferenceVideoMap: videoMap,
      rowReferenceModeByRowId: nextModeMap
    };
  }

  function buildCanonicalRowReferencePayload(session = null, rowId = "") {
    const key = String(rowId || "").trim();
    const canonical = buildCanonicalRowReferenceSessionState(session || {});
    if (!key) {
      return {
        referenceMode: "image",
        referenceImages: [],
        primaryReferenceImage: null,
        referenceVideo: null
      };
    }
    const referenceImages = canonical.rowReferenceImageListMap[key] || [];
    const referenceVideo = canonical.rowReferenceVideoMap[key] || null;
    const referenceMode = canonical.rowReferenceModeByRowId[key] === "video" && referenceVideo
      ? "video"
      : "image";
    return {
      referenceMode,
      referenceImages: referenceMode === "image" ? referenceImages : [],
      primaryReferenceImage: referenceMode === "image" ? (referenceImages[0] || null) : null,
      referenceVideo: referenceMode === "video" ? referenceVideo : null
    };
  }

  function referencesStateStable(a = {}, b = {}) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
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
      updatedAt: String(raw.updatedAt || nowIso()).trim() || nowIso(),
      localMediaCacheKey: String(raw.localMediaCacheKey || "").trim(),
      providerVideoUri: String(raw.providerVideoUri || "").trim(),
      providerVideoGeneratedAt: String(raw.providerVideoGeneratedAt || "").trim(),
      providerVideoGenerator: String(raw.providerVideoGenerator || raw.generator || "").trim().toLowerCase(),
      providerVideoModel: String(raw.providerVideoModel || raw.model || "").trim(),
      providerVideoResolution: String(raw.providerVideoResolution || raw.resolution || "").trim(),
      providerVideoAspectRatio: String(raw.providerVideoAspectRatio || raw.aspectRatio || "").trim(),
      providerVideoDurationSec: Math.max(0, Number(raw.providerVideoDurationSec ?? raw.durationSec ?? raw.durationSeconds ?? 0) || 0)
    };
  }

  async function persistReferenceMediaRecord(reference = null, options = {}) {
    const normalized = options.kind === "video"
      ? normalizeReferenceVideoRecord(reference)
      : normalizeReferenceImageRecord(reference);
    const dataUrl = String(normalized?.dataUrl || "").trim();
    if (!normalized || !dataUrl.startsWith("data:")) return normalized;
    const cacheKey = String(
      normalized.localMediaCacheKey
      || buildReferenceMediaCacheKey(options.scope, options.id || normalized.name, options.kind || "image")
    ).trim();
    let uploaded = null;
    if (options.skipUpload !== true && options.kind !== "video" && typeof deps.uploadReferenceImageToStorage === "function") {
      try {
        uploaded = await deps.uploadReferenceImageToStorage({
          ...normalized,
          dataUrl,
          localMediaCacheKey: cacheKey
        }, {
          scope: options.scope,
          id: options.id || normalized.name
        });
      } catch (_) {
        uploaded = null;
      }
    }
    try {
      await putPodcasterLocalMediaDataUrl(cacheKey, dataUrl, {
        mimeType: normalized.mimeType,
        name: normalized.name
      });
      return {
        ...normalized,
        ...(uploaded && typeof uploaded === "object" ? {
          downloadUrl: String(uploaded.downloadUrl || normalized.downloadUrl || "").trim(),
          storagePath: String(uploaded.storagePath || normalized.storagePath || "").trim()
        } : {}),
        localMediaCacheKey: cacheKey
      };
    } catch (_) {
      return {
        ...normalized,
        ...(uploaded && typeof uploaded === "object" ? {
          downloadUrl: String(uploaded.downloadUrl || normalized.downloadUrl || "").trim(),
          storagePath: String(uploaded.storagePath || normalized.storagePath || "").trim()
        } : {}),
        localMediaCacheKey: cacheKey
      };
    }
  }

  async function uploadRowReferenceImagesToStorage(rowId = "", references = []) {
    const key = String(rowId || "").trim();
    const pending = Array.isArray(references) ? references : [];
    if (!key || !pending.length || typeof deps.uploadReferenceImageToStorage !== "function") return;
    let uploadedAny = false;
    const uploadedByCacheKey = new Map();
    for (const item of pending) {
      const record = item?.record && typeof item.record === "object" ? item.record : null;
      const dataUrl = String(record?.dataUrl || "").trim();
      const cacheKey = String(record?.localMediaCacheKey || "").trim();
      if (!record || !dataUrl.startsWith("data:image/") || !cacheKey) continue;
      try {
        const uploaded = await deps.uploadReferenceImageToStorage(record, {
          scope: "row-image",
          id: item.uploadId || record.name || key
        });
        if (uploaded && typeof uploaded === "object") {
          uploadedByCacheKey.set(cacheKey, {
            downloadUrl: String(uploaded.downloadUrl || "").trim(),
            storagePath: String(uploaded.storagePath || "").trim()
          });
          uploadedAny = true;
        }
      } catch (error) {
        console.warn("[MediaReference] No se pudo subir la referencia de escena a Storage; se conserva localmente.", error);
      }
    }
    if (!uploadedAny) return;
    deps.upsertActiveSession?.((current) => {
      const {
        nextImageMap,
        nextListMap,
        nextVideoMap,
        nextModeMap
      } = buildMutableRowReferenceState(current);
      const currentList = Array.isArray(nextListMap[key]) ? nextListMap[key] : [];
      const updatedList = currentList.map((record) => {
        const cacheKey = String(record?.localMediaCacheKey || "").trim();
        const uploaded = uploadedByCacheKey.get(cacheKey);
        if (!uploaded) return record;
        return {
          ...record,
          downloadUrl: uploaded.downloadUrl || String(record?.downloadUrl || "").trim(),
          storagePath: uploaded.storagePath || String(record?.storagePath || "").trim()
        };
      });
      const primary = updatedList[0] || null;
      if (primary) nextImageMap[key] = primary;
      if (updatedList.length) {
        nextListMap[key] = updatedList;
        delete nextVideoMap[key];
        nextModeMap[key] = "image";
      }
      return {
        ...current,
        rowReferenceImageMap: nextImageMap,
        rowReferenceImageListMap: nextListMap,
        rowReferenceVideoMap: nextVideoMap,
        rowReferenceModeByRowId: nextModeMap
      };
    }, { render: false });
    const refreshed = getActiveSession();
    deps.syncPodcastStudioInspector?.(refreshed, { forceRender: true });
    void persistRowReferencesToCloud(refreshed);
    deps.scheduleSessionLocalPersist?.("row-reference-images-uploaded");
  }

  async function hydrateReferenceRecord(reference = null, kind = "image") {
    const normalized = kind === "video"
      ? normalizeReferenceVideoRecord(reference)
      : normalizeReferenceImageRecord(reference);
    if (!normalized) return null;
    if (String(normalized.dataUrl || "").trim()) return normalized;
    const cacheKey = String(normalized.localMediaCacheKey || "").trim();
    if (!cacheKey) return normalized;
    try {
      const dataUrl = await getPodcasterLocalMediaDataUrl(cacheKey);
      return dataUrl ? { ...normalized, dataUrl } : normalized;
    } catch (_) {
      return normalized;
    }
  }

  async function hydrateSessionReferenceMedia(session = null) {
    const activeSession = session || getActiveSession();
    if (!activeSession || typeof activeSession !== "object") return false;
    let changed = false;
    const hydrateMap = async (source = {}, kind = "image") => {
      const next = {};
      const entries = Object.entries(source && typeof source === "object" ? source : {});
      for (const [key, value] of entries) {
        const hydrated = await hydrateReferenceRecord(value, kind);
        next[key] = hydrated;
        if (String(value?.dataUrl || "").trim() !== String(hydrated?.dataUrl || "").trim()) changed = true;
      }
      return next;
    };
    const hydrateListMap = async (source = {}) => {
      const next = {};
      const entries = Object.entries(source && typeof source === "object" ? source : {});
      for (const [key, value] of entries) {
        const list = Array.isArray(value) ? value : [];
        const hydratedList = [];
        for (const item of list) {
          hydratedList.push(await hydrateReferenceRecord(item, "image"));
        }
        next[key] = hydratedList.filter(Boolean);
        if (JSON.stringify(list.map((item) => String(item?.dataUrl || ""))) !== JSON.stringify(hydratedList.map((item) => String(item?.dataUrl || "")))) changed = true;
      }
      return next;
    };
    activeSession.speakerReferenceImageMap = await hydrateMap(activeSession.speakerReferenceImageMap, "image");
    activeSession.scenarioReferenceImageMap = await hydrateMap(activeSession.scenarioReferenceImageMap, "image");
    const hydratedRowImageMap = await hydrateMap(activeSession.rowReferenceImageMap, "image");
    const hydratedRowListMap = await hydrateListMap(activeSession.rowReferenceImageListMap);
    const hydratedRowVideoMap = await hydrateMap(activeSession.rowReferenceVideoMap, "video");
    const before = buildCanonicalRowReferenceSessionState({
      rowReferenceImageMap: activeSession.rowReferenceImageMap,
      rowReferenceImageListMap: activeSession.rowReferenceImageListMap,
      rowReferenceVideoMap: activeSession.rowReferenceVideoMap,
      rowReferenceModeByRowId: activeSession.rowReferenceModeByRowId
    });
    const after = buildCanonicalRowReferenceSessionState({
      rowReferenceImageMap: hydratedRowImageMap,
      rowReferenceImageListMap: hydratedRowListMap,
      rowReferenceVideoMap: hydratedRowVideoMap,
      rowReferenceModeByRowId: activeSession.rowReferenceModeByRowId
    });
    changed = changed || !referencesStateStable(before, after);
    activeSession.rowReferenceImageMap = after.rowReferenceImageMap;
    activeSession.rowReferenceImageListMap = after.rowReferenceImageListMap;
    activeSession.rowReferenceVideoMap = after.rowReferenceVideoMap;
    activeSession.rowReferenceModeByRowId = after.rowReferenceModeByRowId;
    return changed;
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
    return buildCanonicalRowReferenceSessionState({
      rowReferenceImageMap: session?.rowReferenceImageMap || {},
      rowReferenceImageListMap: session?.rowReferenceImageListMap || {},
      rowReferenceVideoMap: session?.rowReferenceVideoMap || {},
      rowReferenceModeByRowId: session?.rowReferenceModeByRowId || {}
    }).rowReferenceImageListMap;
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

  function buildMutableRowReferenceState(current = null) {
    const canonical = buildCanonicalRowReferenceSessionState(current || {});
    const nextImageMap = canonical.rowReferenceImageMap;
    const nextListMap = canonical.rowReferenceImageListMap;
    const nextVideoMap = canonical.rowReferenceVideoMap;
    const nextModeMap = canonical.rowReferenceModeByRowId;
    return {
      nextImageMap,
      nextListMap,
      nextVideoMap,
      nextModeMap
    };
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
    const stripInlineMap = (value = {}) => Object.fromEntries(
      Object.entries(value && typeof value === "object" ? value : {}).map(([key, item]) => [key, item && typeof item === "object" ? { ...item, dataUrl: "" } : item])
    );
    const stripInlineListMap = (value = {}) => Object.fromEntries(
      Object.entries(value && typeof value === "object" ? value : {}).map(([key, list]) => [key, Array.isArray(list) ? list.map((item) => item && typeof item === "object" ? { ...item, dataUrl: "" } : item) : []])
    );
    const sessionRef = deps.doc?.(deps.firestoreDb, "podcaster_sessions", sessionId);
    const sessionUpdatedAt = String(activeSession?.updatedAt || nowIso()).trim() || nowIso();
    const updatePayload = {
      sessionUpdatedAt,
      updatedAt: deps.serverTimestamp?.(),
      "session.updatedAt": sessionUpdatedAt,
      "session.rowReferenceImageMap": stripInlineMap(getRowReferenceImageMap(activeSession)),
      "session.rowReferenceImageListMap": stripInlineListMap(getRowReferenceImageListMap(activeSession)),
      "session.rowReferenceVideoMap": stripInlineMap(getRowReferenceVideoMap(activeSession)),
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

  async function persistRowReferencesToCloud(session = null) {
    const activeSession = session || getActiveSession();
    const patchResult = await persistRowReferencesPatchToCloud(activeSession);
    if (patchResult?.ok) return patchResult;
    const sessionId = String(activeSession?.id || "").trim();
    const canFallbackToFullSave = (
      typeof deps.saveSessionToCloud === "function"
      && sessionId
      && activeSession
      && activeSession.isStub !== true
      && patchResult?.reason !== "missing-session-or-auth"
    );
    if (!canFallbackToFullSave) return patchResult;
    try {
      await deps.saveSessionToCloud(sessionId, { render: false, silent: true });
      return { ok: true, sessionId, fallback: "full-cloud-save" };
    } catch (error) {
      return { ok: false, sessionId, error, patchResult };
    }
  }

  async function setSpeakerReferenceImage(speaker = "", reference = null) {
    const key = deps.normalizeSpeakerLabel?.(speaker, "") || "";
    if (!key) return false;
    const normalized = await persistReferenceMediaRecord(reference, { scope: "speaker", id: key, kind: "image" });
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

  async function setScenarioReferenceImage(scenarioId = "", reference = null) {
    const key = String(scenarioId || "").trim();
    if (!key) return false;
    const normalized = await persistReferenceMediaRecord(reference, { scope: "scenario", id: key, kind: "image" });
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
    return setRowReferenceImages(rowId, reference ? [reference] : [], { replaceExisting: true });
  }

  async function setRowReferenceImages(rowId = "", references = [], options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return false;
    const activeSession = getActiveSession();
    const existingReferences = options.replaceExisting === true
      ? []
      : getRowReferenceImageList(activeSession, key);
    const seedList = normalizeReferenceImageList(existingReferences, MAX_ROW_REFERENCE_IMAGE_ITEMS);
    const normalizedList = [];
    const pendingUploads = [];
    const appendedList = [...seedList];
    for (let index = 0; index < (Array.isArray(references) ? references.length : 0); index += 1) {
      const uploadId = `${key}:${seedList.length + index}`;
      const normalized = await persistReferenceMediaRecord(references[index], { scope: "row-image", id: uploadId, kind: "image", skipUpload: true });
      if (normalized) {
        normalizedList.push(normalized);
        pendingUploads.push({ record: normalized, uploadId });
      }
    }
    appendedList.push(...normalizedList);
    const limitedList = normalizeReferenceImageList(appendedList, MAX_ROW_REFERENCE_IMAGE_ITEMS);
    const primary = limitedList[0] || null;
    deps.upsertActiveSession?.((current) => {
      const {
        nextImageMap,
        nextListMap,
        nextVideoMap,
        nextModeMap
      } = buildMutableRowReferenceState(current);
      if (primary) nextImageMap[key] = primary;
      else delete nextImageMap[key];
      if (limitedList.length) nextListMap[key] = limitedList;
      else delete nextListMap[key];
      if (limitedList.length) {
        delete nextVideoMap[key];
        nextModeMap[key] = "image";
      } else if (nextModeMap[key] === "image") {
        delete nextModeMap[key];
      }
      return {
        ...current,
        rowReferenceImageMap: nextImageMap,
        rowReferenceImageListMap: nextListMap,
        rowReferenceVideoMap: nextVideoMap,
        rowReferenceModeByRowId: nextModeMap
      };
    }, { render: false });
    const refreshed = getActiveSession();
    deps.renderScript?.(refreshed);
    deps.syncPodcastStudioInspector?.(refreshed, { forceRender: true });
    deps.renderPodcastVideoShell?.(refreshed);
    deps.renderCreativeVideoShell?.(refreshed);
    void persistRowReferencesToCloud(refreshed);
    void uploadRowReferenceImagesToStorage(key, pendingUploads);
    deps.scheduleSessionLocalPersist?.("row-reference-images");
    return true;
  }

  async function setRowReferenceVideo(rowId = "", reference = null) {
    const key = String(rowId || "").trim();
    if (!key) return false;
    const normalized = await persistReferenceMediaRecord(reference, { scope: "row-video", id: key, kind: "video" });
    deps.upsertActiveSession?.((current) => {
      const {
        nextImageMap,
        nextListMap: nextImageListMap,
        nextVideoMap,
        nextModeMap
      } = buildMutableRowReferenceState(current);
      if (normalized) nextVideoMap[key] = normalized;
      else delete nextVideoMap[key];
      if (normalized) {
        delete nextImageMap[key];
        delete nextImageListMap[key];
        nextModeMap[key] = "video";
      } else if (nextModeMap[key] === "video") {
        delete nextModeMap[key];
      }
      return {
        ...current,
        rowReferenceVideoMap: nextVideoMap,
        rowReferenceImageMap: nextImageMap,
        rowReferenceImageListMap: nextImageListMap,
        rowReferenceModeByRowId: nextModeMap
      };
    }, { render: false });
    const refreshed = getActiveSession();
    deps.renderScript?.(refreshed);
    deps.renderPodcastVideoTimeline?.(refreshed, { lightweight: true, reason: "selection" });
    deps.syncPodcastStudioInspector?.(refreshed, { forceRender: true });
    deps.renderPodcastVideoShell?.(refreshed);
    deps.renderCreativeVideoShell?.(refreshed);
    void persistRowReferencesToCloud(refreshed);
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
    deps.setPodcastVideoRow?.(key, {
      syncStage: false,
      preserveMontageCursor: true,
      lightweightUi: true,
      reason: "selection"
    });
    pendingRowReferenceSelectionRowId = key;
    els.rowReferenceImageInput.dataset.rowId = key;
    els.rowReferenceImageInput.click();
    return true;
  }

  function clearRowReference(rowId = "") {
    const key = String(rowId || "").trim();
    if (!key) return false;
    void setRowReferenceImage(key, null);
    void setRowReferenceVideo(key, null);
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
          await setSpeakerReferenceImage(speaker, reference);
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
          await setScenarioReferenceImage(scenarioId, reference);
          window.setGenerationStatus?.("Referencia de escenario actualizada", "is-live");
        } catch (error) {
          window.addChatMessage?.("system", `No se pudo adjuntar referencia de escenario (${error.message}).`);
        }
      });
    }
    if (els.rowReferenceImageInput && !els.rowReferenceImageInput.dataset.mediaReferenceBound) {
      els.rowReferenceImageInput.dataset.mediaReferenceBound = "1";
      els.rowReferenceImageInput.addEventListener("change", async () => {
        const rowId = String(
          els.rowReferenceImageInput.dataset.rowId
          || pendingRowReferenceSelectionRowId
          || ""
        ).trim();
        const files = Array.from(els.rowReferenceImageInput.files || []);
        const file = files[0] || null;
        els.rowReferenceImageInput.value = "";
        els.rowReferenceImageInput.dataset.rowId = "";
        pendingRowReferenceSelectionRowId = "";
        if (!rowId || !file) return;
        try {
          const hasVideo = files.some((item) => isLikelyVideoReferenceFile(item));
          if (files.length > 1 && hasVideo) {
            throw new Error("Puedes elegir varias imagenes o un solo video, pero no mezclarlos.");
          }
          if (files.length === 1 && isLikelyVideoReferenceFile(file)) {
            const reference = await readVideoReferenceFromFile(file);
            await setRowReferenceVideo(rowId, reference);
            window.setGenerationStatus?.(`Video de referencia actualizado para escena ${deps.resolveSceneNumberByRowId?.(rowId, getActiveSession())}`, "is-live");
          } else {
            const references = await Promise.all(files.map((item) => readImageReferenceFromFile(item)));
            await setRowReferenceImages(rowId, references);
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
    buildCanonicalRowReferenceSessionState,
    buildCanonicalRowReferencePayload,
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
    hydrateSessionReferenceMedia,
    persistRowReferencesPatchToCloud,
    persistRowReferencesToCloud,
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
  getRowReferenceVideoMap: (...args) => latestPodcasterMediaReferenceApi?.getRowReferenceVideoMap?.(...args),
  resolveRowReferenceAsset: (...args) => latestPodcasterMediaReferenceApi?.resolveRowReferenceAsset?.(...args),
  resolveReferenceImagePreviewUrl: (...args) => latestPodcasterMediaReferenceApi?.resolveReferenceImagePreviewUrl?.(...args),
  promptRowReferenceSelection: (...args) => latestPodcasterMediaReferenceApi?.promptRowReferenceSelection?.(...args),
  clearRowReference: (...args) => latestPodcasterMediaReferenceApi?.clearRowReference?.(...args)
});

// Regression patterns for test-podcaster-row-reference-preview-and-cloud-persist.mjs:
// "session.rowReferenceImageMap": getRowReferenceImageMap(activeSession),
// "session.rowReferenceImageListMap": getRowReferenceImageListMap(activeSession),
// "session.rowReferenceVideoMap": getRowReferenceVideoMap(activeSession),
// "session.rowReferenceModeByRowId": getRowReferenceModeByRowId(activeSession)
// setRowReferenceImages(rowId = "", references = [])
// renderPodcastVideoShell?.(refreshed);
// void persistRowReferencesToCloud(refreshed);
// setRowReferenceVideo(rowId = "", reference = null)
// renderPodcastVideoShell?.(refreshed);
// void persistRowReferencesToCloud(refreshed);
