import {
  createAuthorizedAssetResolver,
  extractAuthorizedAssetStoragePath
} from "./podcaster-authorized-asset-resolver.js";

function storagePathFromPreviewSource(value = "", baseUrl = "") {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const proxyPath = extractAuthorizedAssetStoragePath(clean, { baseUrl });
  if (proxyPath) return proxyPath;
  if (/^gs:\/\//i.test(clean)) return clean.replace(/^gs:\/\/[^/]+\//i, "");
  if (/^podcaster\//i.test(clean)) return clean;
  return "";
}

function mediaTypeFromPreviewSource(value = "") {
  return /\.(?:png|jpe?g|webp|gif|avif|bmp|heic)(?:[?#]|$)/i.test(String(value || ""))
    ? "image/png"
    : "video/mp4";
}

export function createMontageExportPreviewAssetResolver({ authFetchJson, baseUrl = "" } = {}) {
  const signedAssets = createAuthorizedAssetResolver({ authFetchJson, baseUrl });

  async function resolveUrl(value = "", options = {}) {
    const clean = String(value || "").trim();
    if (/^(?:data:|blob:)/i.test(clean)) return clean;
    const storagePath = storagePathFromPreviewSource(options.storagePath || clean, baseUrl)
      || storagePathFromPreviewSource(clean, baseUrl);
    if (storagePath) {
      // The browser's <video>/<img> request cannot carry a Firebase Bearer header.
      return signedAssets.resolveUrl(
        `/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`,
        { storagePath }
      );
    }
    if (/^https?:\/\//i.test(clean) && !/\/api\/assets\/proxy-(?:media|image)(?:\?|$)/i.test(clean)) return clean;
    return "";
  }

  async function resolveStatusMedia(status = {}) {
    const source = status && typeof status === "object" ? status : {};
    const storagePath = String(source.currentStoragePath || "").trim();
    const downloadUrl = String(source.currentDownloadUrl || "").trim();
    const mediaType = mediaTypeFromPreviewSource(storagePath || downloadUrl);
    try {
      const url = await resolveUrl(downloadUrl || storagePath, { storagePath });
      return url ? { dataUrl: url, mediaType } : null;
    } catch (_) {
      // An unavailable preview must not trigger an unauthenticated proxy request.
      return null;
    }
  }

  return Object.freeze({ resolveUrl, resolveStatusMedia });
}
