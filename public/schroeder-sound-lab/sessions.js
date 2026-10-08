import { authFetchJson } from "../js/api-client.js";

export const WORKSPACE_TYPE = "schroeder-sound-lab";

const STORAGE_VERSION = 2;
const STORAGE_PREFIX = "schroeder-sound-lab:sessions";
let localOwnerId = "";
const FALLBACK_DB = "schroeder-sound-lab-local";
const FALLBACK_STORE = "sessions";

function storageKey() {
  if (!localOwnerId) throw new Error("No hay un usuario activo para guardar las sesiones.");
  return `${STORAGE_PREFIX}:v${STORAGE_VERSION}:${localOwnerId}`;
}

function openFallbackDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FALLBACK_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FALLBACK_STORE)) request.result.createObjectStore(FALLBACK_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local."));
  });
}

async function readFallback(key) {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(FALLBACK_STORE, "readonly").objectStore(FALLBACK_STORE).get(key);
    request.onsuccess = () => resolve(request.result || "");
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function writeFallback(key, payload) {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(FALLBACK_STORE, "readwrite").objectStore(FALLBACK_STORE).put(payload, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function readStore() {
  try {
    const key = storageKey();
    const raw = localStorage.getItem(key) || await readFallback(key) || "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function compactSession(session) {
  const lab = session?.soundLab && typeof session.soundLab === "object" ? session.soundLab : {};
  return {
    id: String(session?.id || ""),
    title: String(session?.title || "Nueva sesión").slice(0, 120),
    workspaceType: WORKSPACE_TYPE,
    archived: session?.archived === true,
    updatedAt: String(session?.updatedAt || new Date().toISOString()),
    soundLab: {
      mode: lab.mode === "voice" ? "voice" : "music",
      settings: lab.settings && typeof lab.settings === "object" ? lab.settings : {},
      messages: (Array.isArray(lab.messages) ? lab.messages : []).slice(-120).map((message) => ({
        role: message?.role === "user" ? "user" : "assistant",
        type: message?.type === "audio-reference" ? "audio-reference" : message?.type === "genre" ? "genre" : "message",
        genre: message?.type === "genre" ? String(message?.genre || "").slice(0, 80) : "",
        url: message?.type === "audio-reference" ? String(message?.url || message?.downloadUrl || message?.previewUrl || message?.storagePath || "").slice(0, 1000) : "",
        mode: message?.mode === "voice" ? "voice" : "",
        text: String(message?.text || "").slice(0, 6000),
        createdAt: String(message?.createdAt || "")
      })),
      draft: lab.draft && typeof lab.draft === "object" ? lab.draft : null,
      jobs: (Array.isArray(lab.jobs) ? lab.jobs : []).slice(-12),
      pending: (Array.isArray(lab.pending) ? lab.pending : []).slice(-20),
      library: (Array.isArray(lab.library) ? lab.library : []).slice(0, 250)
    }
  };
}

async function writeStore(sessions) {
  const key = storageKey();
  const compact = sessions.slice(0, 40).map(compactSession);
  const payload = JSON.stringify(compact);
  try {
    localStorage.setItem(key, payload);
  } catch (error) {
    if (String(error?.name || "") !== "QuotaExceededError") throw error;
    Object.keys(localStorage)
      .filter((item) => item.startsWith(`${STORAGE_PREFIX}:`))
      .forEach((item) => localStorage.removeItem(item));
    localStorage.removeItem("schroeder-sound-lab-theme");
    try {
      localStorage.setItem(key, payload);
    } catch (retryError) {
      await writeFallback(key, payload).catch((fallbackError) => {
        throw new Error("No se pudo guardar la sesión en el navegador.", { cause: fallbackError || retryError });
      });
    }
  }
}

export function configureLocalSessions(uid) {
  localOwnerId = String(uid || "").trim();
}

export function makeSession() {
  const id = `schroeder_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  return {
    id,
    title: "Nueva sesión",
    workspaceType: WORKSPACE_TYPE,
    archived: false,
    updatedAt: new Date().toISOString(),
    script: { rows: [] },
    soundLab: { mode: "music", settings: {}, messages: [], draft: null, jobs: [], pending: [], library: [] }
  };
}

export async function listSessions() {
  return (await readStore())
    .map((session) => ({
      id: session.id,
      title: session.title || "Nueva sesión",
      workspaceType: WORKSPACE_TYPE,
      updatedAt: session.updatedAt || "",
      archived: session.archived === true
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function loadSession(sessionId) {
  return (await readStore()).find((session) => session.id === sessionId) || null;
}

export async function saveSession(session) {
  session.updatedAt = new Date().toISOString();
  const sessions = await readStore();
  await writeStore([session, ...sessions.filter((item) => item.id !== session.id)]);
  return session;
}

export async function deleteSession(sessionId) {
  await writeStore((await readStore()).filter((session) => session.id !== sessionId));
  return { ok: true, sessionId };
}

export async function listUsers() {
  const data = await authFetchJson("/api/podcaster/users/list", { method: "GET" });
  return Array.isArray(data?.users) ? data.users : [];
}

export async function approveAudio(item, session) {
  return authFetchJson("/api/schroeder/library/approve", {
    method: "POST",
    body: {
      previewStoragePath: item.storagePath,
      audioId: item.id,
      sessionId: session.id,
      title: item.title,
      kind: item.kind,
      format: item.format,
      mimeType: item.mimeType,
      model: item.model,
      durationSec: Number(item.durationSec || item.draft?.durationSec || 0) || 0,
      prompt: item.prompt || item.draft?.prompt || "",
      genre: item.genre || item.draft?.genre || "",
      bpm: Number(item.bpm || item.draft?.bpm || 0) || 0,
      key: item.key || item.draft?.key || "",
      musicalFingerprint: item.musicalFingerprint || item.draft?.musicalFingerprint || null,
      createdAt: item.createdAt
    }
  });
}

export async function discardPreview(item) {
  if (!item?.storagePath || !String(item.storagePath).startsWith("schroeder-sound-lab/previews/")) return { ok: true };
  return authFetchJson("/api/schroeder/previews/delete", {
    method: "POST",
    body: { storagePath: item.storagePath }
  });
}

export async function listPendingPreviews(sessionId) {
  const query = new URLSearchParams({ sessionId: String(sessionId || "").trim() });
  const data = await authFetchJson(`/api/schroeder/previews/list?${query.toString()}`, { method: "GET" });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function deleteApprovedAudio(item) {
  if (!item?.storagePath) return { ok: true };
  return authFetchJson("/api/schroeder/library/delete", {
    method: "POST",
    body: { storagePath: item.storagePath }
  });
}

export async function renameApprovedAudio(item, title) {
  const cleanTitle = String(title || "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!item?.storagePath || !cleanTitle) throw new Error("Escribe un título válido.");
  return authFetchJson("/api/schroeder/library/rename", {
    method: "POST",
    body: { storagePath: item.storagePath, title: cleanTitle }
  });
}

export async function addApprovedAudioToPodcaster(item) {
  if (!item?.storagePath || item.kind !== "music") throw new Error("Selecciona una canción aprobada.");
  return authFetchJson("/api/schroeder/library/add-to-podcaster", {
    method: "POST",
    body: {
      audioId: item.id,
      storagePath: item.storagePath,
      title: item.title,
      durationSec: Number(item.durationSec || item.draft?.durationSec || 0) || 0,
      mimeType: item.mimeType || "audio/mpeg",
      size: Number(item.size || 0) || 0,
      model: item.model || item.draft?.model || "lyria-3.5",
      prompt: item.prompt || item.draft?.prompt || "",
      bpm: Number(item.bpm || item.draft?.bpm || 0) || 0,
      key: item.key || item.draft?.key || "",
      genre: item.genre || item.draft?.genre || "",
      musicalFingerprint: item.musicalFingerprint || item.draft?.musicalFingerprint || null
    }
  });
}

export async function listApprovedAudio(ownerId = "") {
  const query = new URLSearchParams();
  if (ownerId) query.set("ownerId", ownerId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await authFetchJson(`/api/schroeder/library/list${suffix}`, { method: "GET" });
  return Array.isArray(data?.items) ? data.items : [];
}
