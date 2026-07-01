import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  uploadString
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { firebaseWebConfig } from "../js/firebase-web-config.js";
import { requirePodcasterPublicLibraryRuntime } from "./podcaster-runtime-registry.js";

const runtime = requirePodcasterPublicLibraryRuntime();

// --- State ---
const podcastSceneLibraryState = {
  items: [],
  loading: false,
  loadedAt: "",
  error: "",
  filters: {
    query: "",
    tagColor: "all"
  }
};

const podcastSceneInsertModalState = {
  open: false,
  libraryItem: null,
  selectedInsertIndex: 0
};

const podcastSceneLibraryEditModalState = {
  open: false,
  item: null
};

// --- Constants ---
const PODCAST_LIBRARY_TAG_COLORS = [
  { value: "slate", label: "Slate" },
  { value: "red", label: "Rojo" },
  { value: "amber", label: "Ámbar" },
  { value: "emerald", label: "Emerald" },
  { value: "sky", label: "Sky" },
  { value: "violet", label: "Violeta" },
  { value: "pink", label: "Rosa" }
];

const VIDEO_SCENE_MIN_SEC = 1;
const VIDEO_SCENE_MAX_SEC = 600;
const STUDIO_TIMELINE_MIN_CLIP_MS = 100;
const STUDIO_TIMELINE_TRACK_VERSION = 1;
const STUDIO_TIMELINE_VERSION = 1;
const PODCASTER_SCENE_LIBRARY_COLLECTION = "podcaster_scene_library";

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseWebConfig);
const firestoreDb = getFirestore(firebaseApp);
const firebaseStorage = getStorage(firebaseApp);

// --- Helpers ---
function getPodcastLibraryTagColorMeta(color = "") {
  const key = String(color || "slate").trim().toLowerCase();
  return PODCAST_LIBRARY_TAG_COLORS.find((item) => item.value === key) || PODCAST_LIBRARY_TAG_COLORS[0];
}

function getPodcastLibraryTagColorStyle(color = "") {
  const key = String(color || "slate").trim().toLowerCase();
  const palette = {
    slate: { bg: "#94a3b8", text: "#e2e8f0", border: "#64748b" },
    red: { bg: "#ef4444", text: "#fee2e2", border: "#b91c1c" },
    amber: { bg: "#f59e0b", text: "#fffbeb", border: "#d97706" },
    emerald: { bg: "#10b981", text: "#ecfdf5", border: "#059669" },
    sky: { bg: "#38bdf8", text: "#eff6ff", border: "#0284c7" },
    violet: { bg: "#8b5cf6", text: "#f5f3ff", border: "#7c3aed" },
    pink: { bg: "#ec4899", text: "#fdf2f8", border: "#db2777" }
  };
  return palette[key] || palette.slate;
}

function filterPodcastSceneLibraryItems(items = []) {
  const query = String(podcastSceneLibraryState.filters?.query || "").trim().toLowerCase();
  const tagColor = String(podcastSceneLibraryState.filters?.tagColor || "all").trim().toLowerCase();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item) return false;
    if (tagColor !== "all" && String(item.tagColor || "slate").trim().toLowerCase() !== tagColor) return false;
    if (!query) return true;
    const haystack = [
      item.title,
      item.tagLabel,
      item.sceneDescription,
      item.voiceOverText,
      item.videoDirective,
      item.scenePrompt,
      item.ownerEmail
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    return haystack.includes(query);
  });
}

function getSessionRows(session = null) {
  if (typeof runtime.getSessionRows === "function") {
    const rows = runtime.getSessionRows(session);
    return Array.isArray(rows) ? rows : [];
  }
  const directRows = session?.script?.rows;
  return Array.isArray(directRows) ? directRows : [];
}

function getCurrentUser() {
  try {
    return getAuth(firebaseApp).currentUser || null;
  } catch (_) {
    return null;
  }
}

function nowIso() {
  return typeof runtime.nowIso === "function" ? runtime.nowIso() : new Date().toISOString();
}

function normalizeStorageSegment(value = "", fallback = "item") {
  const text = String(value || "").trim();
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

function createLibraryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `scene_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function clampText(value = "", max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function getImageExtension(mimeType = "image/jpeg") {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

function getVideoExtension(mimeType = "video/mp4", fileName = "") {
  const type = String(mimeType || "").toLowerCase();
  const ext = String(fileName || "").split("?")[0].split(".").pop().toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("matroska")) return "mkv";
  if (["mp4", "webm", "mov", "mkv"].includes(ext)) return ext;
  return "mp4";
}

function stripPublicSceneTokenizedUrl(rawUrl = "", storagePath = "") {
  const cleanUrl = String(rawUrl || "").trim();
  if (!cleanUrl) return "";
  if (!/googleapis\.com|firebasestorage\.app/i.test(cleanUrl)) return cleanUrl;
  if (!/[?&](?:token|downloadToken)=/.test(cleanUrl)) return cleanUrl;
  return "";
}

function isImageLikeLibrarySource(value = "") {
  return /\.(?:jpg|jpeg|png|webp|gif|avif)(?:$|\?)/i.test(String(value || "").trim());
}

function isPublicSceneLibraryImageItem(item = null) {
  const mimeType = String(item?.mimeType || item?.thumbMimeType || "").trim().toLowerCase();
  return mimeType.startsWith("image/")
    || isImageLikeLibrarySource(item?.downloadUrl || "")
    || isImageLikeLibrarySource(item?.storagePath || "")
    || isImageLikeLibrarySource(item?.videoStoragePath || "");
}

async function resolvePublicSceneLibraryPlayableUrlDirect(item = null) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  if (!normalized) return "";
  const storagePath = clampText(normalized.storagePath || normalized.videoStoragePath || "", 900);
  if (storagePath) {
    const directUrl = await getDownloadURL(storageRef(firebaseStorage, storagePath)).catch(() => "");
    if (directUrl) return directUrl;
  }
  const directDownloadUrl = clampText(normalized.downloadUrl || "", 3000);
  if (directDownloadUrl && /[?&](?:token|downloadToken)=/.test(directDownloadUrl)) {
    return "";
  }
  return directDownloadUrl;
}

function normalizePublicSceneVisualEffects(value = null) {
  if (!value || typeof value !== "object") return null;
  const effects = Array.isArray(value.effects)
    ? value.effects
      .map((effect) => clampText(effect || "", 60))
      .filter(Boolean)
      .slice(0, 8)
    : [];
  const speed = Math.max(1, Math.min(10, Math.round(Number(value.speed || 5) || 5)));
  if (!effects.length) return null;
  return { effects, speed };
}

function resolvePublicSceneVisualEffectsForRow(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!session || !key) return null;
  return normalizePublicSceneVisualEffects(session?.visualEffectsMap?.[key]);
}

function normalizeLibraryDocData(data = {}, libraryId = "") {
  return {
    libraryId,
    title: clampText(data.title || data.name || data.publicSceneTitle || "Escena pública", 180) || "Escena pública",
    sourceSessionId: clampText(data.sourceSessionId || "", 140),
    sourceRowId: clampText(data.sourceRowId || "", 120),
    sourceRowNumber: Math.max(0, Number(data.sourceRowNumber || 0) || 0),
    ownerId: clampText(data.ownerId || "", 140),
    ownerEmail: clampText(data.ownerEmail || "", 180),
    durationSec: Math.max(0, Math.min(VIDEO_SCENE_MAX_SEC, Number(data.durationSec || 0) || 0)),
    downloadUrl: clampText(data.downloadUrl || "", 3000),
    storagePath: clampText(data.storagePath || "", 900),
    mimeType: clampText(data.mimeType || "video/mp4", 120) || "video/mp4",
    thumbUrl: clampText(data.thumbUrl || data.thumbnailUrl || "", 3000),
    thumbStoragePath: clampText(data.thumbStoragePath || data.thumbnailStoragePath || "", 900),
    thumbMimeType: clampText(data.thumbMimeType || "image/jpeg", 120) || "image/jpeg",
    sceneDescription: clampText(data.sceneDescription || "", 1200),
    onScreenText: clampText(data.onScreenText || "", 500),
    transition: clampText(data.transition || "", 500),
    visualNotes: clampText(data.visualNotes || "", 1200),
    videoDirective: clampText(data.videoDirective || "", 1400),
    scenePrompt: clampText(data.scenePrompt || "", 1200),
    voiceOverText: clampText(data.voiceOverText || "", 4000),
    tagLabel: clampText(data.tagLabel || "", 120),
    tagColor: clampText(data.tagColor || "slate", 40) || "slate",
    imagePrompts: Array.isArray(data.imagePrompts)
      ? data.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
      : [],
    visualEffects: normalizePublicSceneVisualEffects(data.visualEffects),
    videoPreset: clampText(data.videoPreset || "creative", 40) || "creative",
    sourceType: clampText(data.sourceType || "", 80),
    originalName: clampText(data.originalName || "", 180),
    size: Math.max(0, Number(data.size || 0) || 0),
    createdAt: clampText(data.createdAt || "", 80),
    updatedAt: clampText(data.updatedAt || "", 80),
    publicSceneLibraryId: libraryId,
    publicScenePublishedAt: clampText(data.publicScenePublishedAt || data.updatedAt || data.createdAt || "", 80)
  };
}

async function fetchPodcastSceneLibraryDirect() {
  const q = query(
    collection(firestoreDb, PODCASTER_SCENE_LIBRARY_COLLECTION),
    orderBy("updatedAt", "desc"),
    limit(250)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((docSnap) => normalizeLibraryDocData(docSnap.data() || {}, docSnap.id))
    .map((item) => runtime.normalizePodcastSceneLibraryItem(item))
    .filter(Boolean);
}

async function uploadSceneLibraryThumbDirect(thumbSource = "", libraryId = "") {
  const source = String(thumbSource || "").trim();
  if (!source) return { thumbUrl: "", thumbStoragePath: "", thumbMimeType: "image/jpeg" };
  if (!source.startsWith("data:")) return { thumbUrl: source, thumbStoragePath: "", thumbMimeType: "image/jpeg" };
  const mimeType = String(source.match(/^data:([^;,]+)/i)?.[1] || "image/jpeg").trim() || "image/jpeg";
  const ext = getImageExtension(mimeType);
  const path = `podcaster/library/scenes/${normalizeStorageSegment(libraryId, "scene")}/thumb.${ext}`;
  const ref = storageRef(firebaseStorage, path);
  await uploadString(ref, source, "data_url", {
    contentType: mimeType,
    customMetadata: {
      kind: "podcaster_scene_library_thumb",
      libraryId
    }
  });
  return {
    thumbUrl: await getDownloadURL(ref),
    thumbStoragePath: path,
    thumbMimeType: mimeType
  };
}

async function resolveSceneLibraryVideoDirect(payload = {}, libraryId = "") {
  const storagePath = clampText(payload.storagePath || "", 900);
  const mimeType = clampText(payload.mimeType || "video/mp4", 120) || "video/mp4";
  if (storagePath) {
    const ref = storageRef(firebaseStorage, storagePath);
    const downloadUrl = await getDownloadURL(ref).catch(() => clampText(payload.downloadUrl || "", 3000));
    return {
      downloadUrl: downloadUrl || clampText(payload.downloadUrl || "", 3000),
      storagePath,
      mimeType
    };
  }
  const downloadUrl = clampText(payload.downloadUrl || "", 3000);
  if (!downloadUrl) throw new Error("Falta video de la escena.");
  return { downloadUrl, storagePath: "", mimeType };
}

async function publishPodcastSceneLibraryItemDirect(payload = {}) {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error("AUTH_REQUIRED");
  const libraryId = clampText(payload.libraryId || "", 140) || createLibraryId();
  const ref = doc(firestoreDb, PODCASTER_SCENE_LIBRARY_COLLECTION, libraryId);
  const existingSnap = await getDoc(ref).catch(() => null);
  const existing = existingSnap?.exists?.() ? (existingSnap.data() || {}) : {};
  const videoAsset = await resolveSceneLibraryVideoDirect(payload, libraryId);
  const thumbAsset = await uploadSceneLibraryThumbDirect(payload.thumbDataUrl || payload.thumbUrl || "", libraryId);
  const timestamp = nowIso();
  const item = normalizeLibraryDocData({
    ...existing,
    sourceSessionId: payload.sessionId || payload.sourceSessionId || "",
    sourceRowId: payload.rowId || payload.sourceRowId || "",
    sourceRowNumber: Math.max(0, Number(payload.sourceRowNumber || 0) || 0),
    ownerId: user.uid,
    ownerEmail: user.email || existing.ownerEmail || "",
    title: payload.title || existing.title || "Escena pública",
    durationSec: Math.max(VIDEO_SCENE_MIN_SEC, Math.min(VIDEO_SCENE_MAX_SEC, Number(payload.durationSec || 0) || VIDEO_SCENE_MIN_SEC)),
    downloadUrl: videoAsset.downloadUrl,
    storagePath: videoAsset.storagePath,
    mimeType: videoAsset.mimeType,
    thumbUrl: thumbAsset.thumbUrl || payload.thumbUrl || existing.thumbUrl || "",
    thumbStoragePath: thumbAsset.thumbStoragePath || existing.thumbStoragePath || "",
    thumbMimeType: thumbAsset.thumbMimeType || existing.thumbMimeType || "image/jpeg",
    sceneDescription: payload.sceneDescription || "",
    onScreenText: payload.onScreenText || "",
    transition: payload.transition || "",
    visualNotes: payload.visualNotes || "",
    videoDirective: payload.videoDirective || "",
    scenePrompt: payload.scenePrompt || "",
    voiceOverText: payload.voiceOverText || "",
    tagLabel: existing.tagLabel || payload.tagLabel || "",
    tagColor: existing.tagColor || payload.tagColor || "slate",
    imagePrompts: Array.isArray(payload.imagePrompts) ? payload.imagePrompts : [],
    visualEffects: payload.visualEffects || existing.visualEffects || null,
    videoPreset: payload.videoPreset || "creative",
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp
  }, libraryId);
  await setDoc(ref, item, { merge: true });
  return runtime.normalizePodcastSceneLibraryItem(item);
}

async function uploadLocalPodcastSceneLibraryVideoDirect(file = null, measured = {}) {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error("AUTH_REQUIRED");
  if (!(file instanceof File)) throw new Error("No se recibió un video válido.");
  const libraryId = createLibraryId();
  const mimeType = String(file.type || "video/mp4").trim() || "video/mp4";
  const ext = getVideoExtension(mimeType, file.name || "");
  const path = `podcaster/library/scenes/${normalizeStorageSegment(libraryId, "scene")}/local-video.${ext}`;
  const ref = storageRef(firebaseStorage, path);
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref, file, {
      contentType: mimeType,
      customMetadata: {
        kind: "podcaster_scene_library_video",
        source: "local_upload",
        libraryId,
        uid: user.uid,
        originalName: String(file.name || "video-local").slice(0, 180),
        size: String(Number(file.size || 0) || 0)
      }
    });
    task.on("state_changed", null, reject, resolve);
  });
  const thumbAsset = await uploadSceneLibraryThumbDirect(String(measured?.thumbDataUrl || "").trim(), libraryId);
  const timestamp = nowIso();
  const item = normalizeLibraryDocData({
    ownerId: user.uid,
    ownerEmail: user.email || "",
    title: String(file.name || "Video local").replace(/\.[^.]+$/, "").slice(0, 180) || "Video local",
    durationSec: Math.max(0, Number(measured?.durationSec || 0) || 0),
    downloadUrl: await getDownloadURL(ref),
    storagePath: path,
    mimeType,
    thumbUrl: thumbAsset.thumbUrl || "",
    thumbStoragePath: thumbAsset.thumbStoragePath || "",
    thumbMimeType: thumbAsset.thumbMimeType || "image/jpeg",
    tagLabel: "Local",
    tagColor: "sky",
    videoPreset: "local",
    sourceType: "local_upload",
    originalName: String(file.name || "video-local").slice(0, 180),
    size: Math.max(0, Number(file.size || 0) || 0),
    createdAt: timestamp,
    updatedAt: timestamp
  }, libraryId);
  await setDoc(doc(firestoreDb, PODCASTER_SCENE_LIBRARY_COLLECTION, libraryId), item, { merge: true });
  return runtime.normalizePodcastSceneLibraryItem(item);
}

async function updatePodcastSceneLibraryItemDirect({ libraryId = "", title = "", tagLabel = "", tagColor = "slate" } = {}) {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error("AUTH_REQUIRED");
  const ref = doc(firestoreDb, PODCASTER_SCENE_LIBRARY_COLLECTION, String(libraryId || "").trim());
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("La escena pública no existe.");
  const data = snap.data() || {};
  const updatedAt = nowIso();
  const next = normalizeLibraryDocData({
    ...data,
    title,
    tagLabel,
    tagColor,
    updatedAt
  }, snap.id);
  await setDoc(ref, next, { merge: true });
  return runtime.normalizePodcastSceneLibraryItem(next);
}

async function deletePodcastSceneLibraryItemDirect(item = null) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  const user = getCurrentUser();
  if (!normalized?.libraryId || !user?.uid) throw new Error("AUTH_REQUIRED");
  const ref = doc(firestoreDb, PODCASTER_SCENE_LIBRARY_COLLECTION, normalized.libraryId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return true;
  const data = snap.data() || {};
  await deleteDoc(ref);
  await Promise.allSettled([data.storagePath, data.thumbStoragePath]
    .map((path) => String(path || "").trim())
    .filter(Boolean)
    .map((path) => deleteObject(storageRef(firebaseStorage, path))));
  return true;
}

async function fetchPodcastSceneLibrary(options = {}) {
  podcastSceneLibraryState.loading = true;
  if (options.render !== false) renderPodcastSceneLibrary(runtime.getActiveSession());
  try {
    podcastSceneLibraryState.items = await fetchPodcastSceneLibraryDirect();
    podcastSceneLibraryState.loadedAt = runtime.nowIso();
    podcastSceneLibraryState.error = "";
  } catch (error) {
    podcastSceneLibraryState.error = String(error?.message || "No se pudo cargar la librería pública de escenas.");
  } finally {
    podcastSceneLibraryState.loading = false;
    if (options.render !== false) renderPodcastSceneLibrary(runtime.getActiveSession());
  }
  return podcastSceneLibraryState.items;
}

function renderPodcastSceneLibrary(session = null) {
  if (!runtime.els.podcastSceneLibraryList) return;
  closePodcastSceneLibraryMenu();
  const activeSession = session || runtime.getActiveSession();
  const activeRowId = String(runtime.podcastVideoState?.activeRowId || "").trim();
  const rows = getSessionRows(activeSession);
  const insertIndex = rows.findIndex((row) => String(row?.id || "").trim() === activeRowId);
  const defaultInsertIndex = insertIndex >= 0 ? insertIndex + 1 : rows.length;
  const filteredItems = filterPodcastSceneLibraryItems(podcastSceneLibraryState.items);
  if (runtime.els.refreshPodcastSceneLibraryBtn) {
    runtime.els.refreshPodcastSceneLibraryBtn.disabled = podcastSceneLibraryState.loading === true;
  }
  if (runtime.els.uploadLocalPodcastSceneBtn) {
    runtime.els.uploadLocalPodcastSceneBtn.disabled = podcastSceneLibraryState.loading === true;
  }
  if (runtime.els.podcastSceneLibrarySearchInput) {
    const value = String(podcastSceneLibraryState.filters?.query || "");
    if (String(runtime.els.podcastSceneLibrarySearchInput.value || "") !== value) {
      runtime.els.podcastSceneLibrarySearchInput.value = value;
    }
  }
  if (runtime.els.podcastSceneLibraryColorFilterSelect) {
    const value = String(podcastSceneLibraryState.filters?.tagColor || "all");
    if (String(runtime.els.podcastSceneLibraryColorFilterSelect.value || "") !== value) {
      runtime.els.podcastSceneLibraryColorFilterSelect.value = value;
    }
  }
  if (podcastSceneLibraryState.loading) {
    runtime.els.podcastSceneLibraryList.innerHTML = `<div class="podcast-scene-library-empty">Cargando librería pública...</div>`;
    return;
  }
  if (podcastSceneLibraryState.error) {
    runtime.els.podcastSceneLibraryList.innerHTML = `<div class="podcast-scene-library-empty">${runtime.escapeHtml(podcastSceneLibraryState.error)}</div>`;
    return;
  }
  if (!podcastSceneLibraryState.items.length) {
    runtime.els.podcastSceneLibraryList.innerHTML = `<div class="podcast-scene-library-empty">No hay escenas públicas todavía. Publica una escena para verla aquí.</div>`;
    return;
  }
  if (!filteredItems.length) {
    runtime.els.podcastSceneLibraryList.innerHTML = `<div class="podcast-scene-library-empty">No se encontraron escenas con esos filtros.</div>`;
    return;
  }
  runtime.els.podcastSceneLibraryList.innerHTML = filteredItems.map((item) => {
    const title = String(item.title || "Escena pública").trim() || "Escena pública";
    const duration = runtime.secondsToClock(Math.max(VIDEO_SCENE_MIN_SEC, Number(item.durationSec) || VIDEO_SCENE_MIN_SEC));
    const thumbUrl = String(item.thumbUrl || item.downloadUrl || "").trim();
    const tagLabel = String(item.tagLabel || "").trim();
    const tagMeta = getPodcastLibraryTagColorMeta(item.tagColor);
    const tagStyle = getPodcastLibraryTagColorStyle(item.tagColor);
    return `
      <article class="podcast-scene-library-card" data-library-id="${runtime.escapeHtml(item.libraryId)}">
        <div class="podcast-scene-library-thumb">
          ${thumbUrl
        ? `<img src="SnoopyPodcastCreator.png" data-library-thumb="${runtime.escapeHtml(thumbUrl)}" alt="${runtime.escapeHtml(title)}" loading="lazy">`
        : `<div class="podcast-scene-library-thumb-empty">Sin miniatura</div>`}
        </div>
        <div class="podcast-scene-library-copy">
          <div class="podcast-scene-library-title-row">
            <strong title="${runtime.escapeHtml(title)}">${runtime.escapeHtml(runtime.trimWords(title, 8) || title)}</strong>
            <div class="podcast-scene-library-title-actions">
              ${tagLabel || tagMeta ? `
                <span class="podcast-scene-library-tag" title="${runtime.escapeHtml(tagLabel || tagMeta.label)}" aria-label="${runtime.escapeHtml(tagLabel || tagMeta.label)}" style="background:${runtime.escapeHtml(tagStyle.bg)};border-color:${runtime.escapeHtml(tagStyle.border)};box-shadow:0 0 0 1px rgba(255,255,255,0.26) inset, 0 0 0 1px ${runtime.escapeHtml(tagStyle.border)};"></span>` : ""}
              <button class="row-icon-btn podcast-scene-library-menu-btn" type="button" data-action="toggle-podcast-scene-library-menu" data-library-id="${runtime.escapeHtml(item.libraryId)}" aria-haspopup="menu" aria-expanded="false" title="Más opciones" aria-label="Más opciones">
                <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <span class="podcast-scene-library-meta">${runtime.escapeHtml(duration)}${item.ownerEmail ? ` · ${runtime.escapeHtml(item.ownerEmail)}` : ""}</span>
          <p>${runtime.escapeHtml(runtime.trimWords(item.sceneDescription || item.voiceOverText || item.videoDirective || title, 12) || "Escena pública reutilizable.")}</p>
        </div>
      </article>
    `;
  }).join("");
  runtime.attachPodcastLibraryThumbnailLoading();
}

function getPodcastSceneLibraryMenuPortal() {
  let portal = document.getElementById("podcastSceneLibraryMenuPortal");
  if (portal) return portal;
  portal = document.createElement("div");
  portal.id = "podcastSceneLibraryMenuPortal";
  portal.className = "podcast-scene-library-actions-portal";
  portal.setAttribute("aria-hidden", "false");
  document.body.appendChild(portal);
  return portal;
}

function closePodcastSceneLibraryMenu() {
  const portal = document.getElementById("podcastSceneLibraryMenuPortal");
  [portal].filter(Boolean).forEach((target) => {
    target.innerHTML = "";
    delete target.dataset.openLibraryId;
    target.classList.remove("is-open");
  });
  if (runtime.els.podcastSceneLibraryList) {
    runtime.els.podcastSceneLibraryList
      .querySelectorAll("[data-action='toggle-podcast-scene-library-menu'][aria-expanded='true']")
      .forEach((btn) => btn.setAttribute("aria-expanded", "false"));
  }
}

function buildPodcastSceneLibraryMenuHtml(item, defaultInsertIndex) {
  const libraryId = String(item?.libraryId || "").trim();
  const insertIndex = Math.max(0, Math.round(runtime.toFiniteNumber(defaultInsertIndex, 0)));
  return `
    <div class="podcast-scene-library-menu is-visible" role="menu" aria-label="Acciones de escena" data-library-id="${runtime.escapeHtml(libraryId)}">
      <button class="row-icon-btn" type="button" role="menuitem" data-action="play-public-scene" data-library-id="${runtime.escapeHtml(libraryId)}" title="Reproducir en el preview" aria-label="Reproducir en el preview">
        <i class="fas fa-play"></i>
      </button>
      <button class="row-icon-btn" type="button" role="menuitem" data-action="edit-public-scene" data-library-id="${runtime.escapeHtml(libraryId)}" title="Editar datos" aria-label="Editar datos">
        <i class="fas fa-pen"></i>
      </button>
      <button class="row-icon-btn" type="button" role="menuitem" data-action="delete-public-scene" data-library-id="${runtime.escapeHtml(libraryId)}" title="Eliminar de la biblioteca" aria-label="Eliminar de la biblioteca">
        <i class="fas fa-trash"></i>
      </button>
      <button class="row-icon-btn" type="button" role="menuitem" data-action="insert-public-scene" data-library-id="${runtime.escapeHtml(libraryId)}" data-insert-index="${insertIndex}" title="Insertar en el timeline" aria-label="Insertar en el timeline">
        <i class="fas fa-plus"></i>
      </button>
    </div>
  `;
}

function openPodcastSceneLibraryMenu(item, anchorEl, defaultInsertIndex) {
  if (!item || !anchorEl) return;
  runtime.closePodcastTimelineClipMenu();
  closePodcastSceneLibraryMenu();
  const libraryId = String(item.libraryId || "").trim();
  if (!libraryId) return;
  const portal = getPodcastSceneLibraryMenuPortal();
  const menuHtml = buildPodcastSceneLibraryMenuHtml(item, defaultInsertIndex);
  portal.innerHTML = menuHtml;
  const menu = portal.querySelector(".podcast-scene-library-menu");
  if (!menu) return;
  const anchorRect = anchorEl.getBoundingClientRect();
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
  const gap = 10;
  const margin = 8;
  menu.style.visibility = "hidden";
  menu.style.left = "0px";
  menu.style.top = "0px";
  portal.classList.add("is-open");
  const menuRect = menu.getBoundingClientRect();
  let left = Math.round(anchorRect.right - menuRect.width);
  left = Math.max(margin, Math.min(viewportW - menuRect.width - margin, left));
  let top = Math.round(anchorRect.bottom + gap);
  if (top + menuRect.height > viewportH - margin) {
    top = Math.round(anchorRect.top - menuRect.height - gap);
  }
  top = Math.max(margin, Math.min(viewportH - menuRect.height - margin, top));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "";
  portal.dataset.openLibraryId = libraryId;
  const toggleBtn = anchorEl.closest(".podcast-scene-library-card")?.querySelector("[data-action='toggle-podcast-scene-library-menu'][data-library-id]") || anchorEl;
  toggleBtn?.setAttribute("aria-expanded", "true");
}

function buildPodcastSceneInsertPositions(session = null) {
  const activeSession = session || runtime.getActiveSession();
  const rows = getSessionRows(activeSession);
  if (!rows.length) {
    return [{
      insertIndex: 0,
      label: "Al inicio del timeline",
      detail: "Se insertará como la primera escena."
    }];
  }
  const positions = [{
    insertIndex: 0,
    label: "Antes de la escena 1",
    detail: "Se insertará antes de la primera escena."
  }];
  for (let index = 0; index < rows.length - 1; index += 1) {
    positions.push({
      insertIndex: index + 1,
      label: `Entre escena ${index + 1} y ${index + 2}`,
      detail: "Se insertará entre ambas escenas."
    });
  }
  positions.push({
    insertIndex: rows.length,
    label: "Al final del timeline",
    detail: "Se insertará después de la última escena."
  });
  return positions;
}

function renderPodcastSceneInsertModal() {
  if (!runtime.els.podcastSceneInsertModal) return;
  const open = podcastSceneInsertModalState.open === true && Boolean(podcastSceneInsertModalState.libraryItem);
  if (!open) {
    runtime.els.podcastSceneInsertModal.hidden = true;
    return;
  }
  const item = podcastSceneInsertModalState.libraryItem;
  const session = runtime.getActiveSession();
  const positions = buildPodcastSceneInsertPositions(session);
  const currentIndex = Math.max(0, Math.min(positions.length - 1, Math.round(runtime.toFiniteNumber(podcastSceneInsertModalState.selectedInsertIndex, positions[positions.length - 1]?.insertIndex ?? 0))));
  podcastSceneInsertModalState.selectedInsertIndex = positions[currentIndex]?.insertIndex ?? 0;
  if (runtime.els.podcastSceneInsertTitle) {
    runtime.els.podcastSceneInsertTitle.textContent = `Insertar “${String(item?.title || "Escena pública").trim()}”`;
  }
  if (runtime.els.podcastSceneInsertHint) {
    runtime.els.podcastSceneInsertHint.textContent = "Elige dónde colocar la escena en el timeline. También puedes crear un track nuevo para dejarla en otra fila.";
  }
  if (runtime.els.podcastSceneInsertList) {
    runtime.els.podcastSceneInsertList.innerHTML = positions.map((position) => {
      const selected = Number(position.insertIndex) === Number(podcastSceneInsertModalState.selectedInsertIndex);
      return `
        <button type="button" class="podcast-scene-insert-option${selected ? " is-selected" : ""}" data-action="select-scene-insert-position" data-insert-index="${runtime.escapeHtml(position.insertIndex)}">
          <strong>${runtime.escapeHtml(position.label)}</strong>
          <span>${runtime.escapeHtml(position.detail)}</span>
        </button>
      `;
    }).join("");
  }
  if (runtime.els.confirmPodcastSceneInsertBtn) {
    runtime.els.confirmPodcastSceneInsertBtn.disabled = !item;
  }
  if (runtime.els.confirmPodcastSceneInsertNewTrackBtn) {
    runtime.els.confirmPodcastSceneInsertNewTrackBtn.disabled = !item;
  }
  runtime.els.podcastSceneInsertModal.hidden = false;
}

function setPodcastSceneInsertModalOpen(isOpen = false, item = null, selectedInsertIndex = null) {
  podcastSceneInsertModalState.open = Boolean(isOpen) && Boolean(item);
  podcastSceneInsertModalState.libraryItem = podcastSceneInsertModalState.open ? runtime.normalizePodcastSceneLibraryItem(item) : null;
  const session = runtime.getActiveSession();
  const rows = getSessionRows(session);
  const fallbackIndex = rows.length;
  const nextIndex = Number.isFinite(Number(selectedInsertIndex))
    ? Math.max(0, Math.min(rows.length, Math.round(Number(selectedInsertIndex))))
    : fallbackIndex;
  podcastSceneInsertModalState.selectedInsertIndex = nextIndex;
  if (!podcastSceneInsertModalState.open && runtime.els.podcastSceneInsertModal) {
    runtime.els.podcastSceneInsertModal.hidden = true;
  }
  renderPodcastSceneInsertModal();
}

function closePodcastSceneInsertModal() {
  podcastSceneInsertModalState.open = false;
  podcastSceneInsertModalState.libraryItem = null;
  podcastSceneInsertModalState.selectedInsertIndex = 0;
  if (runtime.els.podcastSceneInsertModal) {
    runtime.els.podcastSceneInsertModal.hidden = true;
  }
}

function confirmPodcastSceneInsertSelection(options = {}) {
  const item = podcastSceneInsertModalState.libraryItem;
  if (!item) return false;
  const insertIndex = Math.max(0, Math.round(runtime.toFiniteNumber(podcastSceneInsertModalState.selectedInsertIndex, 0)));
  const inserted = insertLibrarySceneIntoSession(item, {
    insertIndex,
    insertIntoNewTrack: options.insertIntoNewTrack === true
  });
  if (inserted) {
    closePodcastSceneInsertModal();
  }
  return inserted;
}

function setPodcastSceneLibraryEditModalOpen(isOpen = false, item = null) {
  podcastSceneLibraryEditModalState.open = Boolean(isOpen) && Boolean(item);
  podcastSceneLibraryEditModalState.item = podcastSceneLibraryEditModalState.open ? runtime.normalizePodcastSceneLibraryItem(item) : null;
  if (!runtime.els.podcastSceneLibraryEditModal) return;
  if (!podcastSceneLibraryEditModalState.open) {
    runtime.els.podcastSceneLibraryEditModal.hidden = true;
    return;
  }
  const normalized = podcastSceneLibraryEditModalState.item;
  if (runtime.els.podcastSceneLibraryEditTitle) {
    runtime.els.podcastSceneLibraryEditTitle.textContent = `Editar “${String(normalized?.title || "Escena pública").trim()}”`;
  }
  if (runtime.els.podcastSceneLibraryEditName) {
    runtime.els.podcastSceneLibraryEditName.value = String(normalized?.title || "");
  }
  if (runtime.els.podcastSceneLibraryEditTagLabel) {
    runtime.els.podcastSceneLibraryEditTagLabel.value = String(normalized?.tagLabel || "");
  }
  if (runtime.els.podcastSceneLibraryEditTagColor) {
    runtime.els.podcastSceneLibraryEditTagColor.value = String(normalized?.tagColor || "slate");
  }
  runtime.els.podcastSceneLibraryEditModal.hidden = false;
}

function closePodcastSceneLibraryEditModal() {
  podcastSceneLibraryEditModalState.open = false;
  podcastSceneLibraryEditModalState.item = null;
  if (runtime.els.podcastSceneLibraryEditModal) {
    runtime.els.podcastSceneLibraryEditModal.hidden = true;
  }
}

async function savePodcastSceneLibraryEdit() {
  const item = podcastSceneLibraryEditModalState.item;
  if (!item) return false;
  const libraryId = String(item.libraryId || "").trim();
  const title = String(runtime.els.podcastSceneLibraryEditName?.value || "").trim();
  const tagLabel = String(runtime.els.podcastSceneLibraryEditTagLabel?.value || "").trim();
  const tagColor = String(runtime.els.podcastSceneLibraryEditTagColor?.value || "slate").trim() || "slate";
  if (!title) {
    runtime.addChatMessage("system", "El nombre de la escena no puede estar vacío.");
    return false;
  }
  const updated = await updatePodcastSceneLibraryItemDirect({
    libraryId,
    title,
    tagLabel,
    tagColor
  });
  if (!updated) throw new Error("No se pudo actualizar la escena pública.");
  podcastSceneLibraryState.items = podcastSceneLibraryState.items.map((scene) => (
    String(scene?.libraryId || "").trim() === libraryId ? updated : scene
  ));
  podcastSceneLibraryState.loadedAt = runtime.nowIso();
  podcastSceneLibraryState.error = "";
  closePodcastSceneLibraryEditModal();
  renderPodcastSceneLibrary(runtime.getActiveSession());
  return true;
}

async function deletePodcastSceneLibraryItem(item = null) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  if (!normalized) return false;
  const libraryId = String(normalized.libraryId || "").trim();
  const confirmed = window.confirm(`Se eliminará "${normalized.title}" de la biblioteca pública. ¿Deseas continuar?`);
  if (!confirmed) return false;
  await deletePodcastSceneLibraryItemDirect(normalized);
  podcastSceneLibraryState.items = podcastSceneLibraryState.items.filter((scene) => String(scene?.libraryId || "").trim() !== libraryId);
  renderPodcastSceneLibrary(runtime.getActiveSession());
  return true;
}

async function playPodcastSceneLibraryPreview(item = null) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  if (!normalized) return false;
  const source = await resolvePublicSceneLibraryPlayableUrlDirect(normalized);
  if (!source) return false;
  if (isPublicSceneLibraryImageItem(normalized)) {
    if (typeof window.PodcasterMediaReplacement?.swapStageToImagePreview === "function") {
      const swapped = window.PodcasterMediaReplacement.swapStageToImagePreview(source, {
        rowId: String(normalized.sourceRowId || normalized.libraryId || "").trim(),
        fallbackUrl: String(normalized.downloadUrl || "").trim(),
        afterSwap: () => runtime.setPodcastVideoStatus(`Reproduciendo vista previa: ${normalized.title}`)
      });
      if (swapped) return true;
    }
    const image = runtime.els.podcastActiveSpeakerImage || null;
    if (!image) return false;
    image.src = source;
    image.dataset.src = source;
    image.hidden = false;
    image.style.opacity = "1";
    image.style.visibility = "visible";
    runtime.setPodcastVideoStatus(`Reproduciendo vista previa: ${normalized.title}`);
    return true;
  }
  const videoSource = runtime.resolveStorageVideoUrl(source, "");
  const video = runtime.getActiveStageVideoEl?.() || runtime.els.podcastActiveSpeakerVideoAlt || runtime.els.podcastActiveSpeakerVideo || null;
  if (!video) return false;
  
  if (typeof runtime.stopRowAudio === "function") {
    runtime.stopRowAudio();
  }
  await runtime.stopGeminiLiveSession().catch(() => { });

  video.dataset.src = videoSource;
  video.src = videoSource;
  video.load();
  
  const ok = await runtime.safeMediaPlay(video);
  if (ok) {
    runtime.setPodcastVideoStatus(`Reproduciendo vista previa: ${normalized.title}`);
  }
  return ok;
}

async function publishCurrentSceneToLibrary(rowId = "", options = {}) {
  const key = String(rowId || "").trim() || String(runtime.podcastVideoState?.activeRowId || "").trim();
  const session = runtime.getActiveSession();
  if (!session || !key) return null;
  const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
  if (!row) return null;
  const clip = runtime.resolveDialogueVideoForRow(session, key);
  const primarySegment = runtime.resolvePrimaryDialogueVideoSegment(clip);
  const videoUrl = runtime.resolveStorageVideoUrl(primarySegment?.downloadUrl || clip?.downloadUrl || "", primarySegment?.storagePath || clip?.storagePath || "");
  if (!videoUrl) {
    throw new Error("La escena no tiene video para publicar.");
  }
  const sceneTitle = String(row.publicSceneTitle || row.sceneDescription || row.scenePrompt || row.voiceOverText || `Escena ${runtime.resolveSceneNumberByRowId(key, session)}`).trim();
  const captureCandidate = runtime.getActiveStageVideoEl?.() || runtime.els.podcastActiveSpeakerVideoAlt || runtime.els.podcastActiveSpeakerVideo || null;
  let thumbDataUrl = "";
  if (captureCandidate && String(captureCandidate.dataset?.src || "").trim() === String(videoUrl || "").trim()) {
    thumbDataUrl = await runtime.captureVideoFrameDataUrl(captureCandidate, { timeSec: captureCandidate.currentTime || 0 });
  }
  if (!thumbDataUrl) {
    thumbDataUrl = String(runtime.els.podcastActiveSpeakerImage?.src || "").trim();
  }
  if (!thumbDataUrl) {
    thumbDataUrl = "SnoopyPodcastCreator.png";
  }
  const payload = {
    libraryId: String(row.publicSceneLibraryId || "").trim(),
    sessionId: String(session.id || "").trim(),
    rowId: key,
    title: sceneTitle,
    durationSec: Math.max(VIDEO_SCENE_MIN_SEC, Math.min(VIDEO_SCENE_MAX_SEC, Number(row.durationSec) || VIDEO_SCENE_MAX_SEC)),
    downloadUrl: String(primarySegment?.downloadUrl || clip?.downloadUrl || "").trim(),
    storagePath: String(primarySegment?.storagePath || clip?.storagePath || "").trim(),
    mimeType: String(primarySegment?.mimeType || clip?.mimeType || "video/mp4").trim() || "video/mp4",
    thumbDataUrl,
    thumbMimeType: "image/jpeg",
    sceneDescription: String(row.sceneDescription || row.scenePrompt || "").trim(),
    onScreenText: String(row.onScreenText || "").trim(),
    transition: String(row.transition || "").trim(),
    visualNotes: String(row.visualNotes || row.notes || "").trim(),
    videoDirective: String(row.videoDirective || "").trim(),
    scenePrompt: String(row.scenePrompt || "").trim(),
    voiceOverText: String(row.voiceOverText || row.text || "").trim(),
    imagePrompts: runtime.normalizeVideoImagePrompts(row.imagePrompts || []),
    visualEffects: resolvePublicSceneVisualEffectsForRow(session, key),
    videoPreset: String(row.videoPreset || runtime.resolveActiveVideoPreset(session) || "creative").trim() || "creative"
  };
  if (options.loadingButton) {
    runtime.setButtonLoadingState(options.loadingButton, true, {
      loadingTitle: "Publicando escena..."
    });
  }
  try {
    const published = await publishPodcastSceneLibraryItemDirect(payload);
    if (!published) throw new Error("No se pudo publicar la escena.");
    const persistedVideoUrl = stripPublicSceneTokenizedUrl(
      String(published.downloadUrl || "").trim(),
      String(published.storagePath || "").trim()
    );
    podcastSceneLibraryState.items = [
      published,
      ...podcastSceneLibraryState.items.filter((item) => String(item?.libraryId || "").trim() !== published.libraryId)
    ];
    podcastSceneLibraryState.loadedAt = runtime.nowIso();
    podcastSceneLibraryState.error = "";
    runtime.upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((item) => (
          String(item?.id || "").trim() === key
            ? {
              ...item,
              publicSceneLibraryId: published.libraryId,
              publicScenePublishedAt: published.updatedAt || published.createdAt || runtime.nowIso(),
              publicSceneTitle: published.title,
              publicSceneThumbUrl: published.thumbUrl || "",
              publicSceneVideoUrl: persistedVideoUrl,
              publicSceneVideoStoragePath: published.storagePath || "",
              publicSceneStoragePath: published.storagePath || ""
            }
            : item
        )),
        dialogueVideoMap: {
          ...runtime.getDialogueVideoMap(current),
          [key]: {
            ...runtime.getDialogueVideoMap(current)[key],
            publicSceneLibraryId: published.libraryId,
            publicScenePublishedAt: published.updatedAt || published.createdAt || runtime.nowIso(),
            publicSceneTitle: published.title,
            publicSceneThumbUrl: published.thumbUrl || "",
            publicSceneVideoUrl: persistedVideoUrl,
            publicSceneVideoStoragePath: published.storagePath || "",
            publicSceneStoragePath: published.storagePath || ""
          }
        }
      }
    }), { render: false });
    renderPodcastSceneLibrary(runtime.getActiveSession());
    runtime.render();
    runtime.scheduleSessionLocalPersist("public-scene");
    return published;
  } finally {
    if (options.loadingButton) {
      runtime.setButtonLoadingState(options.loadingButton, false);
    }
  }
}

async function uploadLocalPodcastSceneLibraryVideo(file = null) {
  if (!(file instanceof File)) throw new Error("No se recibió un video válido.");
  if (!String(file.type || "").startsWith("video/")) throw new Error("El archivo debe ser un video.");
  const button = runtime.els.uploadLocalPodcastSceneBtn || null;
  runtime.setButtonLoadingState(button, true, { loadingTitle: "Subiendo video..." });
  podcastSceneLibraryState.loading = true;
  renderPodcastSceneLibrary(runtime.getActiveSession());
  try {
    const measured = await runtime.measureVideoFile(file);
    const item = await uploadLocalPodcastSceneLibraryVideoDirect(file, measured);
    if (!item) throw new Error("No se recibió el item de librería.");
    podcastSceneLibraryState.items = [
      item,
      ...podcastSceneLibraryState.items.filter((entry) => String(entry?.libraryId || "").trim() !== item.libraryId)
    ];
    podcastSceneLibraryState.error = "";
    podcastSceneLibraryState.loadedAt = runtime.nowIso();
    runtime.setGenerationStatus("Video local agregado a la librería", "is-live");
  } finally {
    podcastSceneLibraryState.loading = false;
    runtime.setButtonLoadingState(button, false);
    renderPodcastSceneLibrary(runtime.getActiveSession());
  }
}

function insertLibrarySceneIntoSession(item = null, options = {}) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  if (!normalized) return false;
  const session = runtime.getActiveSession();
  if (!session) return false;
  const insertIndex = Number.isFinite(Number(options.insertIndex))
    ? Math.max(0, Math.min((session?.script?.rows || []).length, Math.round(Number(options.insertIndex))))
    : runtime.getSceneInsertIndexForLibraryItem(session, options.targetRowId || "");
  const insertIntoNewTrack = options.insertIntoNewTrack === true;
  const row = runtime.buildPublicSceneRowFromLibraryItem(normalized);
  if (!row) return false;
  const rowId = String(row.id || "").trim();
  const videoSource = normalized.downloadUrl || normalized.storagePath || "";
  const restoredVisualEffects = normalizePublicSceneVisualEffects(normalized.visualEffects);
  const persistedVideoUrl = stripPublicSceneTokenizedUrl(
    String(normalized.downloadUrl || "").trim(),
    String(normalized.storagePath || "").trim()
  );
  const clip = runtime.normalizeDialogueVideoMap({
    [rowId]: {
      rowId,
      speaker: "Narrador",
      mimeType: normalized.mimeType || "video/mp4",
      model: "veo-pro",
      variant: "creative",
      promptVersion: "copied_from_library_v1",
      publicSceneLibraryId: normalized.libraryId,
      publicScenePublishedAt: normalized.updatedAt || normalized.createdAt || runtime.nowIso(),
      publicSceneTitle: normalized.title,
      publicSceneThumbUrl: normalized.thumbUrl || "",
      publicSceneVideoUrl: persistedVideoUrl,
      publicSceneVideoStoragePath: normalized.storagePath || "",
      publicSceneStoragePath: normalized.storagePath || "",
      videoDirective: row.videoDirective,
      scenePrompt: row.scenePrompt,
      imagePrompts: row.imagePrompts,
      durationSec: normalized.durationSec,
      targetSpeechLine: row.voiceOverText,
      updatedAt: runtime.nowIso(),
      downloadUrl: persistedVideoUrl,
      storagePath: normalized.storagePath || "",
      segments: [{
        id: `${rowId}-seg-1`,
        index: 0,
        durationSec: normalized.durationSec,
        downloadUrl: persistedVideoUrl,
        storagePath: normalized.storagePath || "",
        mimeType: normalized.mimeType || "video/mp4",
        variant: "creative",
        targetSpeechLine: row.voiceOverText
      }]
    }
  })[rowId] || null;
  runtime.upsertActiveSession((current) => {
    const rows = Array.isArray(current?.script?.rows) ? [...current.script.rows] : [];
    const safeIndex = Math.max(0, Math.min(rows.length, insertIndex));
    const insertedRow = {
      ...row,
      publicScenePublishedAt: normalized.updatedAt || normalized.createdAt || runtime.nowIso(),
      publicSceneTitle: normalized.title,
      publicSceneThumbUrl: normalized.thumbUrl || "",
      publicSceneVideoUrl: persistedVideoUrl,
      publicSceneVideoStoragePath: normalized.storagePath || "",
      publicSceneStoragePath: normalized.storagePath || "",
      publicSceneLibraryId: "", 
      sourcePublicSceneLibraryId: normalized.libraryId,
      playbackRate: normalized.playbackRate || 1
    };
    rows.splice(safeIndex, 0, insertedRow);
    const nextDialogueVideoMap = {
      ...runtime.getDialogueVideoMap(current),
      [rowId]: clip || {
        rowId,
        speaker: "Narrador",
        mimeType: normalized.mimeType || "video/mp4",
        model: "veo-pro",
        variant: "creative",
        promptVersion: "copied_from_library_v1",
        publicSceneVideoUrl: persistedVideoUrl,
        publicSceneVideoStoragePath: normalized.storagePath || "",
        publicSceneStoragePath: normalized.storagePath || "",
        videoDirective: row.videoDirective,
        scenePrompt: row.scenePrompt,
        imagePrompts: row.imagePrompts,
        durationSec: normalized.durationSec,
        targetSpeechLine: row.voiceOverText,
        updatedAt: runtime.nowIso(),
        downloadUrl: normalized.downloadUrl || "",
        storagePath: normalized.storagePath || "",
        segments: [{
          id: `${rowId}-seg-1`,
          index: 0,
          durationSec: normalized.durationSec,
          downloadUrl: normalized.downloadUrl || "",
          storagePath: normalized.storagePath || "",
          mimeType: normalized.mimeType || "video/mp4",
          variant: "public",
          targetSpeechLine: row.voiceOverText
        }]
      }
    };
    const nextSessionSnapshot = {
      ...current,
      script: {
        ...current.script,
        rows
      },
      dialogueVideoMap: nextDialogueVideoMap,
      visualEffectsMap: restoredVisualEffects
        ? {
          ...(current.visualEffectsMap || {}),
          [rowId]: restoredVisualEffects
        }
        : (current.visualEffectsMap || {})
    };
    const cfg = runtime.getPodcastVideoConfig(nextSessionSnapshot);
    let nextTracks = runtime.normalizeTimelineTracks(cfg.timelineTracks || []);
    if (!nextTracks.length) {
      nextTracks = runtime.buildDefaultTimelineTracks(nextSessionSnapshot);
    }
    const nextClips = runtime.normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {});
    const previousRow = safeIndex > 0 ? rows[safeIndex - 1] || null : null;
    const nextRow = safeIndex < rows.length - 1 ? rows[safeIndex + 1] || null : null;
    const previousRowId = String(previousRow?.id || "").trim();
    const nextRowId = String(nextRow?.id || "").trim();
    const previousClip = previousRowId ? nextClips[previousRowId] || null : null;
    const nextClip = nextRowId ? nextClips[nextRowId] || null : null;
    let assignedTrackId = String(nextClip?.trackId || previousClip?.trackId || "").trim()
      || runtime.resolveTimelineDefaultTrackIdForSpeaker(String(insertedRow?.speaker || "Narrador").trim());
    if (insertIntoNewTrack) {
      const anchorTrackId = String(nextClip?.trackId || previousClip?.trackId || "").trim();
      const anchorTrackIndex = nextTracks.findIndex((track) => String(track?.id || "").trim() === anchorTrackId);
      const variantTrack = runtime.buildTimelineVariantTrackDescriptor(String(insertedRow?.speaker || "Narrador").trim(), nextTracks);
      assignedTrackId = variantTrack.id;
      const newTrackIndex = anchorTrackIndex >= 0 ? anchorTrackIndex + (nextClip ? 0 : 1) : nextTracks.length;
      nextTracks.splice(newTrackIndex, 0, {
        id: assignedTrackId,
        label: variantTrack.label,
        order: newTrackIndex
      });
      nextTracks = runtime.normalizeTimelineTracks(nextTracks);
    }
    const sourceDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.round(Math.max(0, Number(normalized.durationSec || 0) || 0) * 1000) || runtime.getRowSourceDurationMs(insertedRow, nextSessionSnapshot)
    );
    const inferredStartMs = (() => {
      if (!insertIntoNewTrack && previousClip && String(previousClip.trackId || "").trim() === assignedTrackId) {
        return runtime.getTimelineClipEndMs(previousClip);
      }
      if (nextClip) return Math.max(0, Number(nextClip.startMs || 0));
      if (previousClip) return runtime.getTimelineClipEndMs(previousClip);
      return 0;
    })();
    const insertedTimelineClip = runtime.normalizeTimelineClipItem({
      rowId,
      speakerKey: String(insertedRow?.speaker || "Narrador").trim(),
      trackId: assignedTrackId,
      startMs: inferredStartMs,
      sourceDurationMs,
      trimInMs: 0,
      trimOutMs: sourceDurationMs,
      zIndex: Math.max(1, Number(nextClip?.zIndex || previousClip?.zIndex || safeIndex + 1))
    }, rowId);
    runtime.logPodcastBatchDebug("public-scene-insert-track", {
      rowId,
      insertIntoNewTrack,
      assignedTrackId,
      insertedClipTrackId: String(insertedTimelineClip?.trackId || "").trim(),
      timelineTracks: nextTracks.map((track) => ({
        id: String(track?.id || "").trim(),
        label: String(track?.label || "").trim()
      }))
    });
    return {
      ...nextSessionSnapshot,
      podcastVideoConfig: runtime.normalizePodcastVideoConfig({
        ...cfg,
        timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
        timelineVersion: STUDIO_TIMELINE_VERSION,
        timelineTracks: nextTracks,
        timelineViewMode: insertIntoNewTrack ? "tracks" : (String(cfg.timelineViewMode || "tracks").trim().toLowerCase() === "normal" ? "normal" : "tracks"),
        timelineClipsByRowId: insertedTimelineClip
          ? {
            ...nextClips,
            [rowId]: insertedTimelineClip
          }
          : nextClips
      })
    };
  }, { render: false });
  
  runtime.ensureOnScreenTextClipForRowId(runtime.getActiveSession(), rowId, { persist: true });
  runtime.ensureOnScreenTextClipsByRowId(runtime.getActiveSession(), { persist: true });
  if (insertIntoNewTrack) {
    runtime.setTimelineViewMode("tracks");
  }
  runtime.syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
  runtime.renderPodcastVideoTimeline(runtime.getActiveSession(), { force: true, reason: "structure" });
  runtime.renderPodcastTransitionTimeline(runtime.getActiveSession());
  runtime.syncPodcastStudioInspector(runtime.getActiveSession());
  runtime.render();
  if (rowId) {
    runtime.setPodcastVideoRow(rowId, {
      syncStage: false,
      preserveMontageCursor: true,
      reason: "structure"
    });
    queueMicrotask(() => {
      const safeRowId = String(rowId || "").trim();
      if (!safeRowId) return;
      try {
        const scriptRow = runtime.els.scriptTableBody?.querySelector?.(`.script-row[data-row-id="${CSS.escape(safeRowId)}"]`);
        scriptRow?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        const timelineClip = runtime.els.podcastVideoTimeline?.querySelector?.(`.podcast-video-timeline-clip[data-row-id="${CSS.escape(safeRowId)}"], .podcast-video-timeline-item[data-row-id="${CSS.escape(safeRowId)}"]`);
        timelineClip?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
      } catch (_) { }
    });
  }
  runtime.scheduleSessionLocalPersist("public-scene-insert");
  clonePublicSceneLibraryVideoToSession({
    sessionId: String(runtime.getActiveSession()?.id || "").trim(),
    rowId,
    speakerLabel: String(row?.speaker || "Narrador").trim() || "Narrador",
    sourceStoragePath: String(normalized.storagePath || "").trim(),
    sourceUrl: String(normalized.downloadUrl || "").trim(),
    mimeType: String(normalized.mimeType || "video/mp4").trim() || "video/mp4"
  }).catch(() => { });
  return true;
}

async function clonePublicSceneLibraryVideoToSession({
  sessionId = "",
  rowId = "",
  speakerLabel = "Narrador",
  sourceStoragePath = "",
  sourceUrl = "",
  mimeType = "video/mp4"
} = {}) {
  const activeSession = runtime.getActiveSession();
  const safeSessionId = String(sessionId || activeSession?.id || "").trim();
  const safeRowId = String(rowId || "").trim();
  if (!safeSessionId || !safeRowId) return false;
  const current = runtime.resolveDialogueVideoForRow(activeSession, safeRowId);
  const currentStoragePath = String(current?.storagePath || runtime.resolvePrimaryDialogueVideoSegment(current)?.storagePath || "").trim();
  if (/^podcaster\/sessions\//i.test(currentStoragePath)) return false;
  const nextStoragePath = String(sourceStoragePath || currentStoragePath || "").trim();
  const nextDownloadUrl = stripPublicSceneTokenizedUrl(
    String(sourceUrl || current?.downloadUrl || runtime.resolvePrimaryDialogueVideoSegment(current)?.downloadUrl || "").trim(),
    nextStoragePath
  );
  const nextMimeType = String(mimeType || current?.mimeType || "video/mp4").trim() || "video/mp4";
  if (!nextStoragePath || (!nextDownloadUrl && !sourceUrl && !current?.downloadUrl && !runtime.resolvePrimaryDialogueVideoSegment(current)?.downloadUrl)) return false;

  runtime.upsertActiveSession((base) => {
    const map = { ...runtime.getDialogueVideoMap(base) };
    const prev = map[safeRowId] || runtime.resolveDialogueVideoForRow(base, safeRowId) || null;
    if (!prev) return base;
    const segments = runtime.resolveDialogueVideoSegments(prev);
    const primary = runtime.resolvePrimaryDialogueVideoSegment(prev);
    const mergedPrimary = {
      ...(primary && primary !== prev ? primary : {}),
      downloadUrl: nextDownloadUrl,
      storagePath: nextStoragePath,
      mimeType: nextMimeType,
      variant: String(prev?.variant || "public").trim() || "public",
      updatedAt: runtime.nowIso()
    };
    const nextSegments = segments.length
      ? segments.map((seg) => ({
        ...seg,
        downloadUrl: nextDownloadUrl,
        storagePath: nextStoragePath,
        mimeType: nextMimeType
      }))
      : [{
        id: `${safeRowId}-seg-1`,
        index: 0,
        durationSec: Number(prev?.durationSec || 0) || VIDEO_SCENE_MIN_SEC,
        downloadUrl: nextDownloadUrl,
        storagePath: nextStoragePath,
        mimeType: nextMimeType,
        variant: "session-clone",
        targetSpeechLine: String(prev?.targetSpeechLine || "").trim()
      }];
    map[safeRowId] = runtime.normalizeDialogueVideoMap({
      [safeRowId]: {
        ...prev,
        mimeType: nextMimeType,
        model: "public-scene-library-clone",
        publicSceneVideoUrl: nextDownloadUrl,
        publicSceneVideoStoragePath: nextStoragePath,
        publicSceneStoragePath: nextStoragePath,
        storagePath: nextStoragePath,
        downloadUrl: nextDownloadUrl,
        updatedAt: runtime.nowIso(),
        segments: nextSegments
      }
    })[safeRowId] || prev;
    const rows = Array.isArray(base?.script?.rows) ? base.script.rows.map((row) => (
      String(row?.id || "").trim() === safeRowId
        ? {
          ...row,
          publicSceneVideoUrl: nextDownloadUrl,
          publicSceneVideoStoragePath: nextStoragePath,
          publicSceneStoragePath: nextStoragePath
        }
        : row
    )) : [];
    return {
      ...base,
      dialogueVideoMap: map,
      script: {
        ...base.script,
        rows
      }
    };
  }, { render: false });
  runtime.renderPodcastVideoShell(runtime.getActiveSession());
  runtime.scheduleSessionLocalPersist("public-scene-clone");
  return true;
}

// --- Exposure to Window ---
Object.assign(window, {
  podcastSceneLibraryState,
  podcastSceneInsertModalState,
  podcastSceneLibraryEditModalState,
  PODCAST_LIBRARY_TAG_COLORS,
  getPodcastLibraryTagColorMeta,
  getPodcastLibraryTagColorStyle,
  filterPodcastSceneLibraryItems,
  fetchPodcastSceneLibrary,
  renderPodcastSceneLibrary,
  getPodcastSceneLibraryMenuPortal,
  closePodcastSceneLibraryMenu,
  buildPodcastSceneLibraryMenuHtml,
  openPodcastSceneLibraryMenu,
  buildPodcastSceneInsertPositions,
  renderPodcastSceneInsertModal,
  setPodcastSceneInsertModalOpen,
  closePodcastSceneInsertModal,
  confirmPodcastSceneInsertSelection,
  setPodcastSceneLibraryEditModalOpen,
  closePodcastSceneLibraryEditModal,
  savePodcastSceneLibraryEdit,
  deletePodcastSceneLibraryItem,
  playPodcastSceneLibraryPreview,
  publishCurrentSceneToLibrary,
  uploadLocalPodcastSceneLibraryVideo,
  insertLibrarySceneIntoSession,
  clonePublicSceneLibraryVideoToSession
});
