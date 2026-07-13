const DB_NAME = "cb_analizar_pdf_files_v1";
const STORE_NAME = "files";
const SESSION_STORE_NAME = "analysisSessions";
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("bySession", "sessionId", { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
        db.createObjectStore(SESSION_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB."));
  });
}

function runTransaction(mode = "readonly", executor) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
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
    tx.oncomplete = () => finishResolve(undefined);
    tx.onerror = () => finishReject(tx.error || new Error("Transacción IndexedDB falló."));
    tx.onabort = () => finishReject(tx.error || new Error("Transacción IndexedDB abortada."));
    try {
      executor(store, finishResolve, finishReject);
    } catch (error) {
      finishReject(error);
    }
  }));
}

function runObjectStoreTransaction(storeName = STORE_NAME, mode = "readonly", executor) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
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
    tx.oncomplete = () => finishResolve(undefined);
    tx.onerror = () => finishReject(tx.error || new Error("Transacción IndexedDB falló."));
    tx.onabort = () => finishReject(tx.error || new Error("Transacción IndexedDB abortada."));
    try {
      executor(store, finishResolve, finishReject);
    } catch (error) {
      finishReject(error);
    }
  }));
}

export function buildAnalizarPdfLocalBlobKey(sessionId = "", revisionId = "", fileId = "") {
  return [String(sessionId || "").trim(), String(revisionId || "").trim(), String(fileId || "").trim()]
    .filter(Boolean)
    .join("::");
}

export async function putAnalizarPdfCachedFile({
  sessionId = "",
  revisionId = "",
  fileId = "",
  file = null
} = {}) {
  if (!(file instanceof File)) {
    throw new Error("Archivo inválido para caché local.");
  }
  const id = buildAnalizarPdfLocalBlobKey(sessionId, revisionId, fileId);
  if (!id) {
    throw new Error("Faltan sessionId, revisionId o fileId para caché local.");
  }
  const record = {
    id,
    sessionId: String(sessionId || "").trim(),
    revisionId: String(revisionId || "").trim(),
    fileId: String(fileId || "").trim(),
    fileName: String(file.name || "").trim(),
    type: String(file.type || "application/octet-stream").trim(),
    size: Number(file.size || 0) || 0,
    lastModified: Number(file.lastModified || 0) || 0,
    blob: file,
    updatedAt: new Date().toISOString()
  };
  await runTransaction("readwrite", (store) => {
    store.put(record);
  });
  return record;
}

export async function getAnalizarPdfCachedFile(localBlobKey = "") {
  const cleanKey = String(localBlobKey || "").trim();
  if (!cleanKey) return null;
  return runTransaction("readonly", (store, resolve) => {
    const request = store.get(cleanKey);
    request.onsuccess = () => {
      const record = request.result || null;
      if (!record?.blob) {
        resolve(null);
        return;
      }
      const file = new File(
        [record.blob],
        String(record.fileName || "documento.bin").trim() || "documento.bin",
        {
          type: String(record.type || "application/octet-stream").trim() || "application/octet-stream",
          lastModified: Number(record.lastModified || 0) || Date.now()
        }
      );
      resolve({
        ...record,
        file
      });
    };
    request.onerror = () => resolve(null);
  });
}

export async function listAnalizarPdfCachedFilesByRevision(sessionId = "", revisionId = "") {
  const cleanSessionId = String(sessionId || "").trim();
  const cleanRevisionId = String(revisionId || "").trim();
  if (!cleanSessionId || !cleanRevisionId) return [];
  return runTransaction("readonly", (store, resolve) => {
    const matches = [];
    const index = store.index("bySession");
    const request = index.openCursor(cleanSessionId);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(matches);
        return;
      }
      const record = cursor.value || {};
      if (String(record.revisionId || "").trim() === cleanRevisionId && record.blob) {
        const file = new File(
          [record.blob],
          String(record.fileName || "documento.bin").trim() || "documento.bin",
          {
            type: String(record.type || "application/octet-stream").trim() || "application/octet-stream",
            lastModified: Number(record.lastModified || 0) || Date.now()
          }
        );
        matches.push({ ...record, file });
      }
      cursor.continue();
    };
    request.onerror = () => resolve(matches);
  });
}

export async function listAnalizarPdfCachedFilesBySession(sessionId = "") {
  const cleanSessionId = String(sessionId || "").trim();
  if (!cleanSessionId) return [];
  return runTransaction("readonly", (store, resolve) => {
    const matches = [];
    const index = store.index("bySession");
    const request = index.openCursor(cleanSessionId);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(matches);
        return;
      }
      const record = cursor.value || {};
      if (record.blob) {
        const file = new File(
          [record.blob],
          String(record.fileName || "documento.bin").trim() || "documento.bin",
          {
            type: String(record.type || "application/octet-stream").trim() || "application/octet-stream",
            lastModified: Number(record.lastModified || 0) || Date.now()
          }
        );
        matches.push({ ...record, file });
      }
      cursor.continue();
    };
    request.onerror = () => resolve(matches);
  });
}

export async function deleteAnalizarPdfCachedFile(localBlobKey = "") {
  const cleanKey = String(localBlobKey || "").trim();
  if (!cleanKey) return;
  await runTransaction("readwrite", (store) => {
    store.delete(cleanKey);
  });
}

export async function deleteAnalizarPdfCachedFilesBySession(sessionId = "") {
  const cleanSessionId = String(sessionId || "").trim();
  if (!cleanSessionId) return;
  await runTransaction("readwrite", (store) => {
    const index = store.index("bySession");
    const request = index.openCursor(cleanSessionId);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

export async function putAnalizarPdfCachedAnalysisSession(session = null) {
  const sessionId = String(session?.id || "").trim();
  if (!sessionId || !session) return null;
  const record = {
    id: sessionId,
    session,
    updatedAt: new Date().toISOString()
  };
  await runObjectStoreTransaction(SESSION_STORE_NAME, "readwrite", (store) => {
    store.put(record);
  });
  return record;
}

export async function getAnalizarPdfCachedAnalysisSession(sessionId = "") {
  const cleanSessionId = String(sessionId || "").trim();
  if (!cleanSessionId) return null;
  return runObjectStoreTransaction(SESSION_STORE_NAME, "readonly", (store, resolve) => {
    const request = store.get(cleanSessionId);
    request.onsuccess = () => resolve(request.result?.session || null);
    request.onerror = () => resolve(null);
  });
}

export async function deleteAnalizarPdfCachedAnalysisSession(sessionId = "") {
  const cleanSessionId = String(sessionId || "").trim();
  if (!cleanSessionId) return;
  await runObjectStoreTransaction(SESSION_STORE_NAME, "readwrite", (store) => {
    store.delete(cleanSessionId);
  });
}
