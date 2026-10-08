// public/imagecreator/scene-blob-store.js
// Almacenamiento local de alto rendimiento mediante IndexedDB con Blobs binarios
// Evita el límite de ~5MB de localStorage y no requiere codificación en Base64.

const DB_NAME = "lucy_studio_blobs_v1";
const DB_VERSION = 1;
const STORE_SCENES = "scene_blobs";
const STORE_CHECKPOINTS = "script_checkpoints";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB no está soportado en este navegador."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SCENES)) {
        const store = db.createObjectStore(STORE_SCENES, { keyPath: "key" });
        store.createIndex("scriptId", "scriptId", { unique: false });
        store.createIndex("sceneIndex", "sceneIndex", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
        db.createObjectStore(STORE_CHECKPOINTS, { keyPath: "scriptId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Error abriendo IndexedDB"));
  });

  return dbPromise;
}

// Convertir Data URL (base64) a Blob binario puro
export async function dataUrlToBlob(dataUrl = "") {
  if (!dataUrl) return null;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    // Si ya es un URL regular o blob URL
    try {
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch (_) {
      return null;
    }
  }

  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch (_) {}

  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1).replace(/\s+/g, "");
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

  try {
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
  } catch (_) {
    return null;
  }
}

// Convertir Blob a Data URL si es estrictamente necesario para un consumidor legacy
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve("");
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function makeKey(scriptId = "draft", sceneIndex = 0) {
  return `${scriptId}_scene_${sceneIndex}`;
}

// Guardar Blob de Escena en IndexedDB
export async function saveSceneBlob(scriptId, sceneIndex, data = {}) {
  const db = await openDb();
  let blob = data.blob;

  if (!blob && data.dataUrl) {
    blob = await dataUrlToBlob(data.dataUrl);
  }

  const record = {
    key: makeKey(scriptId, sceneIndex),
    scriptId: String(scriptId || "draft"),
    sceneIndex: Number(sceneIndex),
    blob: blob || null,
    mimeType: data.mimeType || blob?.type || "image/png",
    prompt: data.prompt || "",
    textoPantalla: data.textoPantalla || "",
    approved: data.approved === true,
    downloadUrl: data.downloadUrl || "",
    storagePath: data.storagePath || "",
    updatedAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SCENES], "readwrite");
    const store = tx.objectStore(STORE_SCENES);
    const req = store.put(record);

    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

// Obtener Blob de Escena desde IndexedDB
export async function getSceneBlob(scriptId, sceneIndex) {
  const db = await openDb();
  const key = makeKey(scriptId, sceneIndex);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SCENES], "readonly");
    const store = tx.objectStore(STORE_SCENES);
    const req = store.get(key);

    req.onsuccess = () => {
      const record = req.result;
      if (!record) return resolve(null);

      let objectUrl = "";
      if (record.blob instanceof Blob) {
        objectUrl = URL.createObjectURL(record.blob);
      } else if (record.downloadUrl) {
        objectUrl = record.downloadUrl;
      }

      resolve({
        ...record,
        objectUrl,
        dataUrl: objectUrl // Para compatibilidad inmediata con previews
      });
    };

    req.onerror = () => reject(req.error);
  });
}

// Obtener todas las escenas de un guion desde IndexedDB
export async function getAllSceneBlobsForScript(scriptId) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SCENES], "readonly");
    const store = tx.objectStore(STORE_SCENES);
    const index = store.index("scriptId");
    const req = index.getAll(String(scriptId || "draft"));

    req.onsuccess = () => {
      const results = (req.result || []).map((record) => {
        let objectUrl = "";
        if (record.blob instanceof Blob) {
          objectUrl = URL.createObjectURL(record.blob);
        } else if (record.downloadUrl) {
          objectUrl = record.downloadUrl;
        }
        return {
          ...record,
          objectUrl,
          dataUrl: objectUrl
        };
      });
      resolve(results);
    };

    req.onerror = () => reject(req.error);
  });
}

// Guardar Checkpoint de Generación en Segundo Plano
export async function saveScriptCheckpoint(scriptId, checkpointData = {}) {
  const db = await openDb();
  const record = {
    scriptId: String(scriptId || "draft"),
    ...checkpointData,
    updatedAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CHECKPOINTS], "readwrite");
    const store = tx.objectStore(STORE_CHECKPOINTS);
    const req = store.put(record);

    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

// Obtener Checkpoint de Generación
export async function getScriptCheckpoint(scriptId) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CHECKPOINTS], "readonly");
    const store = tx.objectStore(STORE_CHECKPOINTS);
    const req = store.get(String(scriptId || "draft"));

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Eliminar Checkpoint de Generación
export async function clearScriptCheckpoint(scriptId) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CHECKPOINTS], "readwrite");
    const store = tx.objectStore(STORE_CHECKPOINTS);
    const req = store.delete(String(scriptId || "draft"));

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
