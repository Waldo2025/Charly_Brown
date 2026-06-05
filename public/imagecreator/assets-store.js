import {
  getDownloadURL,
  ref,
  uploadString
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

export async function uploadGeneratedResults(results = [], { uid = "", sessionId = "", messageId = "" } = {}) {
  const cleanUid = String(uid || "").trim();
  const cleanSessionId = String(sessionId || "").trim();
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanUid || !cleanSessionId || !cleanMessageId) {
    return Array.isArray(results) ? results : [];
  }

  const uploaded = [];
  for (const [index, result] of (Array.isArray(results) ? results : []).entries()) {
    const dataUrl = String(result?.dataUrl || "").trim();
    const mimeType = String(result?.mimeType || "image/png").trim() || "image/png";
    if (!dataUrl) {
      uploaded.push(result);
      // eslint-disable-next-line no-continue
      continue;
    }
    const storagePath = `images/${cleanUid}/image-creator/${cleanSessionId}/${cleanMessageId}/${makeStorageFileName(result, index)}`;
    const storageRef = ref(storage, storagePath);
    // eslint-disable-next-line no-await-in-loop
    await uploadString(storageRef, dataUrl, "data_url", {
      contentType: mimeType,
      cacheControl: "public,max-age=31536000,immutable"
    });
    // eslint-disable-next-line no-await-in-loop
    const downloadUrl = await getDownloadURL(storageRef);
    uploaded.push({
      ...result,
      downloadUrl,
      storagePath
    });
  }
  return uploaded;
}
