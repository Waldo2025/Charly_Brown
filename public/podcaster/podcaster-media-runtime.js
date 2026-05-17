export function createPodcasterMediaRuntimeApi(deps = {}) {
  const staleProxyMediaUrls = new Set();
  const staleDialogueVideoSourceKeys = new Set();
  const localProxyMediaUnavailableTtlMs = Math.max(1000, Number(deps.localProxyMediaUnavailableTtlMs || 45000) || 45000);
  let localProxyMediaUnavailable = false;
  let localProxyMediaUnavailableAt = 0;
  let staleMediaReRenderTimer = null;

  function isLocalProxyMediaUrl(url = "") {
    const src = String(url || "").trim();
    if (!src) return false;
    if (!/\/api\/assets\/proxy-media\?/i.test(src)) return false;
    return /^https?:\/\/(?:127\.0\.0\.1|localhost):8787\//i.test(src);
  }

  function markLocalProxyMediaUnavailable(reason = "") {
    localProxyMediaUnavailableAt = Date.now();
    if (localProxyMediaUnavailable) return;
    localProxyMediaUnavailable = true;
    try {
      deps.setGenerationStatus?.(`Backend local (127.0.0.1:8787) no disponible${reason ? `: ${reason}` : ""}.`, "");
    } catch (_) { }
  }

  function shouldShortCircuitLocalProxyMediaFetch(url = "") {
    if (!isLocalProxyMediaUrl(url)) return false;
    if (!localProxyMediaUnavailable || !localProxyMediaUnavailableAt) return false;
    return (Date.now() - localProxyMediaUnavailableAt) <= localProxyMediaUnavailableTtlMs;
  }

  function buildDialogueVideoSourceKey(sessionId = "", rowId = "", storagePath = "", downloadUrl = "") {
    const cleanSessionId = String(sessionId || "").trim();
    const cleanRowId = String(rowId || "").trim();
    const cleanStoragePath = String(storagePath || "").trim();
    const cleanDownloadUrl = String(downloadUrl || "").trim();
    if (!cleanRowId) return "";
    return `${cleanSessionId}:${cleanRowId}:${cleanStoragePath || cleanDownloadUrl}`;
  }

  function markStaleProxyMediaUrl(url = "", reason = "proxy-media-404", payload = {}) {
    const clean = String(url || "").trim();
    if (!clean) return;
    staleProxyMediaUrls.add(clean);
    if (staleMediaReRenderTimer) clearTimeout(staleMediaReRenderTimer);
    staleMediaReRenderTimer = setTimeout(() => {
      if (typeof deps.renderPodcastVideoTimeline === "function") {
        deps.renderPodcastVideoTimeline(deps.getActiveSession?.(), { force: true, reason: "media-stale" });
      }
    }, 250);
    if (deps.isRenderDebugEnabled?.() === true) {
      void reason;
      void payload;
    }
  }

  function isMarkedStaleProxyMediaUrl(url = "") {
    const clean = String(url || "").trim();
    return clean ? staleProxyMediaUrls.has(clean) : false;
  }

  function parseFirebaseStorageObjectUrl(rawUrl = "") {
    const clean = String(rawUrl || "").trim();
    if (!clean) return null;
    try {
      const parsed = new URL(clean, window.location.origin);
      const host = String(parsed.hostname || "").toLowerCase();
      const isFirebaseStorageHost = (
        host === "firebasestorage.googleapis.com"
        || host.endsWith("firebasestorage.app")
        || host === "storage.googleapis.com"
      );
      if (!isFirebaseStorageHost) return null;
      if (host === "firebasestorage.googleapis.com") {
        const match = String(parsed.pathname || "").match(/^\/(?:v0\/)?b\/([^/]+)\/o\/(.+)$/);
        if (!match) return null;
        const bucket = String(match[1] || "").trim();
        let objectPath = String(match[2] || "").trim();
        if (!bucket || !objectPath) return null;
        try { objectPath = decodeURIComponent(objectPath); } catch (_) { }
        if (/%2f/i.test(objectPath) || /%25/i.test(objectPath)) {
          try { objectPath = decodeURIComponent(objectPath); } catch (_) { }
        }
        objectPath = objectPath.replace(/^\/+/, "").trim();
        return objectPath ? { bucket, storagePath: objectPath } : null;
      }
      if (host === "storage.googleapis.com") {
        const parts = String(parsed.pathname || "").split("/").filter(Boolean);
        if (parts.length < 2) return null;
        const bucket = String(parts.shift() || "").trim();
        const storagePath = parts.join("/").trim();
        return bucket && storagePath ? { bucket, storagePath } : null;
      }
      const pathname = String(parsed.pathname || "").replace(/^\/+/, "").trim();
      return pathname ? { bucket: host, storagePath: pathname } : null;
    } catch (_) {
      return null;
    }
  }

  function deriveStoragePathFromMediaSource(rawUrl = "", storagePath = "") {
    const cleanStoragePath = String(storagePath || "").trim();
    if (cleanStoragePath.startsWith("gs://")) return cleanStoragePath;
    const parsed = parseFirebaseStorageObjectUrl(rawUrl);
    if (parsed?.bucket && parsed?.storagePath) {
      return `gs://${parsed.bucket}/${parsed.storagePath}`;
    }
    if (cleanStoragePath) return cleanStoragePath;
    return String(parsed?.storagePath || "").trim();
  }

  function normalizePersistedMediaReference(rawUrl = "", storagePath = "") {
    const cleanUrl = String(rawUrl || "").trim();
    const cleanStoragePath = deriveStoragePathFromMediaSource(cleanUrl, storagePath || "");
    if (!cleanUrl && !cleanStoragePath) {
      return { downloadUrl: "", storagePath: "" };
    }
    return {
      storagePath: cleanStoragePath,
      downloadUrl: cleanUrl || (cleanStoragePath ? "" : "")
    };
  }

  function normalizeMediaReferenceFromRecord(record = {}, urlKeys = ["downloadUrl", "url"], pathKeys = ["storagePath", "path"]) {
    if (!record || typeof record !== "object") {
      return normalizePersistedMediaReference("", "");
    }
    const rawUrl = urlKeys.map((key) => String(record?.[key] || "").trim()).find(Boolean) || "";
    const rawStoragePath = pathKeys.map((key) => String(record?.[key] || "").trim()).find(Boolean) || "";
    return normalizePersistedMediaReference(rawUrl, rawStoragePath);
  }

  function isLikelyImageMediaRecord(record = null) {
    if (!record || typeof record !== "object") return false;
    const mimeType = String(record?.mimeType || "").trim().toLowerCase();
    if (mimeType.startsWith("image/")) return true;
    const explicitType = String(record?.type || record?.mediaKind || "").trim().toLowerCase();
    if (explicitType === "image") return true;
    const mediaRef = normalizeMediaReferenceFromRecord(record, ["downloadUrl", "url", "dataUrl"], ["storagePath", "path"]);
    const source = `${String(mediaRef.downloadUrl || "").trim()} ${String(mediaRef.storagePath || "").trim()}`.toLowerCase();
    return /\.(png|jpe?g|webp|gif)(\?|$|\s)/i.test(source);
  }

  function buildImageReferenceRecordFromMedia(raw = null, fallbackName = "Referencia") {
    if (!raw || typeof raw !== "object") return null;
    const dataUrl = String(raw?.dataUrl || "").trim();
    const mediaRef = normalizeMediaReferenceFromRecord(raw, ["downloadUrl", "url", "dataUrl"], ["storagePath", "path"]);
    const downloadUrl = String(mediaRef.downloadUrl || "").trim();
    const storagePath = String(mediaRef.storagePath || "").trim();
    const mimeType = String(raw?.mimeType || "").trim().toLowerCase() || "image/png";
    if (!dataUrl.startsWith("data:image/") && !downloadUrl && !storagePath) return null;
    if (!isLikelyImageMediaRecord({ ...raw, downloadUrl, storagePath, mimeType })) return null;
    return {
      name: String(raw?.name || fallbackName).trim().slice(0, 180) || fallbackName,
      dataUrl,
      downloadUrl,
      storagePath,
      mimeType,
      updatedAt: String(raw?.updatedAt || deps.nowIso?.()).trim() || deps.nowIso?.() || new Date().toISOString()
    };
  }

  function resolveStaleAwareProxyMediaUrl(rawUrl = "", storagePath = "", kind = "media", options = {}) {
    const clean = String(rawUrl || "").trim();
    const cleanStoragePath = String(storagePath || "").trim();
    const proxyPath = kind === "image" ? "/api/assets/proxy-image" : "/api/assets/proxy-media";
    const timestamp = options.updatedAt || options.timestamp || "";
    let finalUrl = "";
    if (cleanStoragePath) {
      const proxyUrl = deps.buildApiUrl?.(`${proxyPath}?storagePath=${encodeURIComponent(cleanStoragePath)}`) || "";
      finalUrl = isMarkedStaleProxyMediaUrl(proxyUrl) ? clean : proxyUrl;
    }
    if (!finalUrl && clean) {
      try {
        const parsed = new URL(clean, window.location.origin);
        const proxyUrl = deps.buildApiUrl?.(`${proxyPath}?url=${encodeURIComponent(parsed.toString())}`) || "";
        finalUrl = isMarkedStaleProxyMediaUrl(proxyUrl) ? clean : proxyUrl;
      } catch (_) {
        finalUrl = clean;
      }
    }
    if (finalUrl && timestamp && finalUrl.includes("/api/assets/proxy-")) {
      const separator = finalUrl.includes("?") ? "&" : "?";
      finalUrl = `${finalUrl}${separator}u=${encodeURIComponent(deps.resolveDateIso?.(timestamp) || timestamp)}`;
    }
    return finalUrl || clean || "";
  }

  function markStaleDialogueVideoSource(sessionId = "", rowId = "", source = null, reason = "stale-scene-video-storage-path") {
    const normalized = normalizePersistedMediaReference(source?.downloadUrl || "", source?.storagePath || "");
    const storagePath = String(normalized.storagePath || "").trim();
    const downloadUrl = String(source?.downloadUrl || "").trim();
    const key = buildDialogueVideoSourceKey(sessionId, rowId, storagePath, downloadUrl);
    if (key) staleDialogueVideoSourceKeys.add(key);
    const storageProxyUrl = storagePath ? deps.buildApiUrl?.(`/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`) : "";
    const downloadProxyUrl = downloadUrl ? deps.resolveStorageVideoUrl?.(downloadUrl, "") : "";
    [storageProxyUrl, downloadProxyUrl].filter(Boolean).forEach((url) => {
      markStaleProxyMediaUrl(url, reason, {
        rowId,
        storagePath: storagePath || undefined
      });
      const videoCache = deps.getPodcastStageVideoCache?.();
      const cachedVideo = videoCache?.get?.(url);
      if (cachedVideo?.objectUrl) {
        try { URL.revokeObjectURL(cachedVideo.objectUrl); } catch (_) { }
      }
      videoCache?.delete?.(url);
      const audioCache = deps.getPodcastStageAudioCache?.();
      const cachedAudio = audioCache?.get?.(url);
      if (cachedAudio?.objectUrl) {
        try { URL.revokeObjectURL(cachedAudio.objectUrl); } catch (_) { }
      }
      audioCache?.delete?.(url);
    });
    deps.logPodcastRenderDebug?.("dialogue-video-source-stale", {
      sessionId,
      rowId,
      reason,
      storagePath,
      downloadUrl: downloadUrl ? `${downloadUrl.slice(0, 180)}${downloadUrl.length > 180 ? "..." : ""}` : "",
      staleKey: key
    });
  }

  function isStaleDialogueVideoSource(sessionId = "", rowId = "", source = null) {
    const storagePath = String(source?.storagePath || "").trim();
    const downloadUrl = String(source?.downloadUrl || "").trim();
    const key = buildDialogueVideoSourceKey(sessionId, rowId, storagePath, downloadUrl);
    return key ? staleDialogueVideoSourceKeys.has(key) : false;
  }

  return {
    isLocalProxyMediaUrl,
    markLocalProxyMediaUnavailable,
    shouldShortCircuitLocalProxyMediaFetch,
    buildDialogueVideoSourceKey,
    markStaleProxyMediaUrl,
    isMarkedStaleProxyMediaUrl,
    resolveStaleAwareProxyMediaUrl,
    parseFirebaseStorageObjectUrl,
    deriveStoragePathFromMediaSource,
    normalizePersistedMediaReference,
    normalizeMediaReferenceFromRecord,
    isLikelyImageMediaRecord,
    buildImageReferenceRecordFromMedia,
    markStaleDialogueVideoSource,
    isStaleDialogueVideoSource
  };
}
