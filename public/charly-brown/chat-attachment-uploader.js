// @ts-check
import { storage, auth } from "../js/firebase-instance.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

const DB_NAME = "CharlyBrownUploadsDB";
const STORE_NAME = "pending_attachments";
const DB_VERSION = 1;

let dbPromise = null;

function getIndexedDb() {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        resolve(/** @type {IDBOpenDBRequest} */ (event.target).result);
      };
      request.onerror = (event) => {
        console.warn("[chat-attachment-uploader] Error al abrir IndexedDB:", event);
        resolve(null);
      };
    } catch (err) {
      console.warn("[chat-attachment-uploader] IndexedDB no disponible:", err);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Guarda un archivo pendiente en IndexedDB para persistencia entre recargas.
 */
export async function savePendingUploadToDb(item = {}) {
  const db = await getIndexedDb();
  if (!db || !item?.id || !item?.file) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id: item.id,
        file: item.file,
        name: item.name,
        size: item.size,
        type: item.type,
        sessionId: item.sessionId || "session",
        uid: item.uid || "anonymous",
        createdAt: item.createdAt || Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Elimina un archivo de IndexedDB una vez completada o cancelada la subida.
 */
export async function removePendingUploadFromDb(id = "") {
  const db = await getIndexedDb();
  if (!db || !id) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Recupera todos los archivos pendientes guardados en IndexedDB para una sesión.
 */
export async function getPendingUploadsFromDb(sessionId = "") {
  const db = await getIndexedDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? req.result : [];
        if (!sessionId || sessionId === "session") return resolve(list);
        resolve(list.filter((item) => !item.sessionId || item.sessionId === sessionId || item.sessionId === "session"));
      };
      req.onerror = () => resolve([]);
    } catch (_) {
      resolve([]);
    }
  });
}

// Registro activo de tareas de subida para permitir cancelación
const activeUploadTasks = new Map();
const extractionControllers = new Map();

/**
 * Cancela una subida activa en segundo plano.
 */
export function cancelActiveUpload(id = "") {
  if (!id) return;
  const task = activeUploadTasks.get(id);
  if (task && typeof task.cancel === "function") {
    try {
      task.cancel();
    } catch (_) {}
  }
  activeUploadTasks.delete(id);
  extractionControllers.get(id)?.abort();
  extractionControllers.delete(id);
  removePendingUploadFromDb(id).catch(() => {});
}

/**
 * Ejecuta la subida reanudable en segundo plano a Firebase Storage con progreso.
 */
export async function startBackgroundUpload({
  id = "",
  file,
  name = "",
  type = "",
  uid = "anonymous",
  sessionId = "session",
  onProgress = null
} = {}) {
  if (!file) throw new Error("No hay archivo para subir.");

  const safeName = (name || file.name || "archivo").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `charly_attachments/${uid}/${sessionId}/${Date.now()}_${safeName}`;
  const fileRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(fileRef, file, {
    contentType: type || file.type || "application/octet-stream"
  });

  if (id) {
    activeUploadTasks.set(id, uploadTask);
  }

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const total = snapshot.totalBytes || 1;
        const transferred = snapshot.bytesTransferred || 0;
        const progress = Math.min(100, Math.max(0, Math.round((transferred / total) * 100)));
        onProgress?.({
          id,
          progress,
          bytesTransferred: transferred,
          totalBytes: total,
          state: snapshot.state
        });
      },
      (error) => {
        if (id) activeUploadTasks.delete(id);
        reject(error);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const bucketName = storage?.app?.options?.storageBucket || "gdt-production.firebasestorage.app";
          const gsUri = `gs://${bucketName}/${storagePath}`;

          if (id) {
            activeUploadTasks.delete(id);
            await removePendingUploadFromDb(id).catch(() => {});
          }

          let extractionStoragePath = '';
          if (String(file.name || '').toLowerCase().endsWith('.pdf')) {
            const controller = new AbortController();
            extractionControllers.set(id, controller);
            const batches = new Map();
            const uploadJson = async (path, value) => {
              const task = uploadBytesResumable(ref(storage, path), new Blob([JSON.stringify(value)], { type: 'application/json' }));
              await new Promise((resolveUpload, rejectUpload) => task.on('state_changed', null, rejectUpload, resolveUpload));
            };
            try {
              const { extractPdf } = await import('../document-processing/pdf-extractor.js');
              const manifest = await extractPdf(file, { signal: controller.signal,
                onProgress: progress => onProgress?.({ progress: Math.round(progress.completed / progress.pageCount * 100), phase: 'extraction', ...progress }),
                onBatch: async pages => {
                  const first = Math.min(...pages.map(page => page.page));
                  const path = `${storagePath}.pages-${first}.json`;
                  await uploadJson(path, pages); batches.set(first, { first, path });
                }
              });
              if (!manifest.complete) throw Error('No se pudo extraer todo el PDF; hay páginas con errores.');
              extractionStoragePath = `${storagePath}.extraction.json`;
              await uploadJson(extractionStoragePath, { ...manifest, sourcePath: storagePath, batches: [...batches.values()].sort((a,b) => a.first-b.first) });
            } catch (error) {
              if (controller.signal.aborted) throw Object.assign(error, { code: 'storage/canceled' });
              if (!window.confirm(`La extracción local no se completó: ${error.message}. ¿Continuar con análisis en el servidor? Puede consumir cómputo adicional.`)) throw error;
            } finally { extractionControllers.delete(id); }
          }
          resolve({
            extractionStoragePath,
            id,
            name: name || file.name,
            size: file.size,
            type: type || file.type,
            storagePath,
            downloadUrl,
            gsUri,
            progress: 100
          });
        } catch (err) {
          if (id) activeUploadTasks.delete(id);
          reject(err);
        }
      }
    );
  });
}
