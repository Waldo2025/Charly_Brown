const PODCASTER_LOCAL_MEDIA_DB_NAME = "podcaster-local-media-cache";
const PODCASTER_LOCAL_MEDIA_DB_VERSION = 1;
const PODCASTER_LOCAL_MEDIA_STORE = "media";

function openPodcasterLocalMediaDb() {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(PODCASTER_LOCAL_MEDIA_DB_NAME, PODCASTER_LOCAL_MEDIA_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PODCASTER_LOCAL_MEDIA_STORE)) {
          db.createObjectStore(PODCASTER_LOCAL_MEDIA_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB."));
    } catch (error) {
      reject(error);
    }
  });
}

function withStore(mode, runner) {
  return openPodcasterLocalMediaDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(PODCASTER_LOCAL_MEDIA_STORE, mode);
    const store = tx.objectStore(PODCASTER_LOCAL_MEDIA_STORE);
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    tx.oncomplete = () => {
      try { db.close(); } catch (_) { }
    };
    tx.onerror = () => finishReject(tx.error || new Error("No se pudo acceder a IndexedDB."));
    tx.onabort = () => finishReject(tx.error || new Error("La transacción de IndexedDB fue abortada."));
    runner(store, finishResolve, finishReject);
  }));
}

export function buildPodcasterLocalMediaKey(prefix = "", id = "") {
  const cleanPrefix = String(prefix || "").trim() || "media";
  const cleanId = String(id || "").trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${cleanPrefix}:${cleanId}`;
}

export async function putPodcasterLocalMediaBlob(key = "", blob = null, metadata = {}) {
  const cleanKey = String(key || "").trim();
  if (!cleanKey || !(blob instanceof Blob)) return "";
  const payload = {
    key: cleanKey,
    blob,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    updatedAt: new Date().toISOString()
  };
  await withStore("readwrite", (store, resolve, reject) => {
    const request = store.put(payload);
    request.onsuccess = () => resolve(cleanKey);
    request.onerror = () => reject(request.error || new Error("No se pudo guardar el blob."));
  });
  return cleanKey;
}

function decodeBase64ToUint8Array(base64Value = "") {
  const cleanBase64 = String(base64Value || "").replace(/\s+/g, "");
  const binary = atob(cleanBase64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function convertDataUrlToBlob(dataUrl = "") {
  const cleanDataUrl = String(dataUrl || "").trim();
  const match = /^data:([^;,]+)?((?:;[^,]+)*?),(.*)$/i.exec(cleanDataUrl);
  if (!match) return null;
  const mimeType = String(match[1] || "application/octet-stream").trim() || "application/octet-stream";
  const params = String(match[2] || "");
  const payload = String(match[3] || "");
  const isBase64 = /;base64/i.test(params);
  try {
    if (isBase64) {
      return new Blob([decodeBase64ToUint8Array(payload)], { type: mimeType });
    }
    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  } catch (_) {
    return null;
  }
}

export async function putPodcasterLocalMediaDataUrl(key = "", dataUrl = "", metadata = {}) {
  const cleanDataUrl = String(dataUrl || "").trim();
  if (!cleanDataUrl.startsWith("data:")) return "";
  const blob = convertDataUrlToBlob(cleanDataUrl);
  if (!(blob instanceof Blob)) return "";
  return putPodcasterLocalMediaBlob(key, blob, metadata);
}

export async function getPodcasterLocalMediaBlob(key = "") {
  const cleanKey = String(key || "").trim();
  if (!cleanKey) return null;
  return withStore("readonly", (store, resolve, reject) => {
    const request = store.get(cleanKey);
    request.onsuccess = () => resolve(request.result?.blob instanceof Blob ? request.result.blob : null);
    request.onerror = () => reject(request.error || new Error("No se pudo leer el blob."));
  });
}

export async function getPodcasterLocalMediaDataUrl(key = "") {
  const blob = await getPodcasterLocalMediaBlob(key);
  if (!(blob instanceof Blob)) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").trim());
    reader.onerror = () => reject(reader.error || new Error("No se pudo convertir el blob."));
    reader.readAsDataURL(blob);
  });
}

export async function deletePodcasterLocalMediaKey(key = "") {
  const cleanKey = String(key || "").trim();
  if (!cleanKey) return false;
  await withStore("readwrite", (store, resolve, reject) => {
    const request = store.delete(cleanKey);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("No se pudo eliminar el blob."));
  });
  return true;
}
