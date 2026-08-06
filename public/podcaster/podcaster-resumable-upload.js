import { authFetchJson } from "../js/api-client-podcaster.js?v=2026-1.0.10.537";

export function dataUrlToFile(dataUrl = "", fileName = "asset") {
  const source = String(dataUrl || "").trim();
  const match = source.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!match) throw new Error("El archivo local no tiene un Data URL válido.");
  const mimeType = String(match[1] || "application/octet-stream").trim();
  const bytes = atob(match[2]);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
  return new File([buffer], String(fileName || "asset"), { type: mimeType, lastModified: Date.now() });
}

function uploadToResumableSession(uploadUrl, file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl, true);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (typeof onProgress === "function") onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    };
    request.onerror = () => reject(new Error("No se pudo cargar el archivo directamente a Cloud Storage."));
    request.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      return reject(new Error(`Cloud Storage rechazó la carga (${request.status}).`));
    };
    const abort = () => request.abort();
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
    }
    request.send(file);
  });
}

export async function uploadPodcasterAsset(file, options = {}) {
  if (!(file instanceof Blob) || !Number(file.size || 0)) throw new Error("No se recibió un archivo válido.");
  const fileName = String(options.fileName || file.name || "asset").trim() || "asset";
  const contentType = String(options.contentType || file.type || "application/octet-stream").trim().toLowerCase();
  const created = await authFetchJson("/api/podcaster/uploads/create", {
    method: "POST",
    body: {
      kind: String(options.kind || "").trim(),
      sessionId: String(options.sessionId || "").trim(),
      rowId: String(options.rowId || "row").trim(),
      fileName,
      contentType,
      size: Number(file.size || 0),
      previousStoragePath: String(options.previousStoragePath || "").trim()
    }
  });
  await uploadToResumableSession(String(created?.uploadUrl || ""), file, {
    onProgress: options.onProgress,
    signal: options.signal
  });
  const finalized = await authFetchJson("/api/podcaster/uploads/finalize", {
    method: "POST",
    body: { uploadId: String(created?.uploadId || "") }
  });
  return {
    uploadId: String(created?.uploadId || ""),
    media: finalized?.media || null,
    idempotent: finalized?.idempotent === true
  };
}
