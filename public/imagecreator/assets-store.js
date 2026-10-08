import {
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { storage } from "../js/firebase-instance.js";

function extensionFromMimeType(mimeType = "") {
  const clean = String(mimeType || "").trim().toLowerCase();
  if (clean === "image/jpeg" || clean === "image/jpg") return "jpg";
  if (clean === "image/webp") return "webp";
  return "png";
}

function makeStorageFileName(result = {}, index = 0) {
  const ext = extensionFromMimeType(result?.mimeType);
  const base = String(result?.id || `result-${index + 1}`).trim() || `result-${index + 1}`;
  return `${base}.${ext}`;
}

async function toBlob(blobOrUrl, fallbackMime = "image/png") {
  if (blobOrUrl instanceof Blob) return blobOrUrl;
  if (!blobOrUrl || typeof blobOrUrl !== "string") return null;
  const str = blobOrUrl.trim();
  if (str.startsWith("blob:") || str.startsWith("http:") || str.startsWith("https:")) {
    try {
      const res = await fetch(str);
      return await res.blob();
    } catch (_) {}
  }
  if (str.startsWith("data:")) {
    try {
      const res = await fetch(str);
      return await res.blob();
    } catch (_) {}
    const commaIdx = str.indexOf(",");
    if (commaIdx !== -1) {
      const header = str.slice(0, commaIdx);
      const rawData = str.slice(commaIdx + 1).replace(/\s+/g, "");
      const mimeMatch = header.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
      const isBase64 = header.includes(";base64");
      if (isBase64) {
        try {
          const bin = atob(rawData);
          const len = bin.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = bin.charCodeAt(i);
          }
          return new Blob([bytes], { type: mime });
        } catch (_) {}
      }
      return new Blob([decodeURIComponent(rawData)], { type: mime });
    }
  }
  return null;
}

export async function uploadGeneratedResults(results = [], { uid = "", sessionId = "", messageId = "" } = {}) {
  const cleanUid = String(uid || "").trim();
  const cleanSessionId = String(sessionId || "").trim();
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanUid || !cleanSessionId || !cleanMessageId) {
    return Array.isArray(results) ? results : [];
  }

  const uploaded = [];
  for (const [index, result] of (Array.isArray(results) ? results : []).entries()) {
    // Si ya tiene un downloadUrl permanente de Firebase Storage, conservarlo
    if (result?.downloadUrl && result.downloadUrl.startsWith("https://firebasestorage.googleapis.com")) {
      uploaded.push(result);
      // eslint-disable-next-line no-continue
      continue;
    }

    const mimeType = String(result?.mimeType || "image/png").trim() || "image/png";
    const dataUrl = String(result?.dataUrl || "").trim();
    let blob = result?.blob;

    if (!blob && dataUrl) {
      // eslint-disable-next-line no-await-in-loop
      blob = await toBlob(dataUrl, mimeType);
    }
    if (!(blob instanceof Blob) && result?.dataUrl) {
      // eslint-disable-next-line no-await-in-loop
      blob = await toBlob(result.dataUrl, mimeType);
    }

    if (!blob) {
      uploaded.push(result);
      // eslint-disable-next-line no-continue
      continue;
    }

    const storagePath = `images/${cleanUid}/image-creator/${cleanSessionId}/${cleanMessageId}/${makeStorageFileName(result, index)}`;
    const storageRef = ref(storage, storagePath);
    const metadata = {
      contentType: mimeType,
      cacheControl: "public,max-age=31536000,immutable"
    };

    try {
      // eslint-disable-next-line no-await-in-loop
      await uploadBytes(storageRef, blob, metadata);
      // eslint-disable-next-line no-await-in-loop
      const downloadUrl = await getDownloadURL(storageRef);
      uploaded.push({
        ...result,
        downloadUrl,
        storagePath
      });
    } catch (err) {
      console.warn(`[assets-store] Error subiendo imagen ${index + 1}:`, err);
      uploaded.push(result);
    }
  }
  return uploaded;
}
