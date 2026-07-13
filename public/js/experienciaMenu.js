import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getDefaultFirebaseApp } from "./firebase-default-app.js";

const STORAGE_KEY_PREFIX = "experienciaMenu.v3";
const CLOUD_COLLECTION = "experiencia_menu_sessions";
const DEFAULT_THEME_ID = "theme-1";
const DEFAULT_THEMES = Array.from({ length: 10 }, (_, index) => ({
  id: `theme-${index + 1}`,
  name: `Tema ${index + 1}`
}));

const EXPERIENCE_TYPES = [
  {
    key: "podcast",
    title: "Podcast",
    category: "Contenido en audio",
    description: "Escucha explicaciones, conversaciones y contenidos del curso desde cualquier lugar.",
    actionText: "Explorar episodios",
    icon: "bi-soundwave",
    cardClass: "asc-light-podcast"
  },
  {
    key: "video",
    title: "Video",
    category: "Contenido audiovisual",
    description: "Observa contenidos visuales, demostraciones y explicaciones que facilitan la comprensión.",
    actionText: "Ver contenidos",
    icon: "bi-play-btn",
    cardClass: "asc-light-video"
  },
  {
    key: "escape",
    title: "Escape Room",
    category: "Experiencia interactiva",
    description: "Resuelve desafíos, encuentra pistas y demuestra lo aprendido para completar la misión.",
    actionText: "Iniciar experiencia",
    icon: "bi-fingerprint",
    cardClass: "asc-light-escape"
  }
];

const EXPORT_LOGO_FILES = ["logo.png", "logoCharly3.png"];
const EXPORT_ZIP_LIBRARY_SRC = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
const BUILDER_PANEL_WIDTH_KEY = "experienciaMenu.builderPanelWidth.v1";
const BUILDER_PANEL_MIN_WIDTH = 280;
const BUILDER_PANEL_MAX_WIDTH = 760;
const app = getDefaultFirebaseApp();
const auth = getAuth(app);
const firestoreDb = getFirestore(app);
let pendingJsZipLoad = null;
let currentOwnerId = "";
let pendingCloudSaveTimer = null;

function getTypeConfig(type) {
  return EXPERIENCE_TYPES.find((item) => item.key === type) || EXPERIENCE_TYPES[0];
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(value = "") {
  return String(value || "recursos-digitales")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "recursos-digitales";
}

function normalizeValue(value = "") {
  return String(value || "").trim();
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

let sessionState = {
  userKey: "",
  activeSessionId: "",
  sessions: []
};

function formatSessionTime(value = 0) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "Ahora";
  const date = new Date(timestamp);
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function getCurrentUserKey() {
  const uid = normalizeValue(auth.currentUser?.uid || currentOwnerId);
  if (uid) return uid;
  const email = normalizeValue(document.getElementById("headerUserEmail")?.textContent);
  return sanitizeFileName(email) || "usuario";
}

function getSessionStorageKey() {
  const userKey = getCurrentUserKey();
  return `${STORAGE_KEY_PREFIX}:${userKey}`;
}

function normalizeSessionItem(item = {}) {
  return {
    id: normalizeValue(item.id) || makeId(),
    themeId: normalizeValue(item.themeId) || DEFAULT_THEME_ID,
    type: getTypeConfig(normalizeValue(item.type)).key,
    name: normalizeValue(item.name) || "",
    url: normalizeValue(item.url)
  };
}

function normalizeTheme(theme = {}, index = 0) {
  return {
    id: normalizeValue(theme.id) || (index === 0 ? DEFAULT_THEME_ID : makeId()),
    name: normalizeValue(theme.name) || `Tema ${index + 1}`
  };
}

function normalizeThemes(payload = {}) {
  const sourceThemes = Array.isArray(payload.themes) ? payload.themes : [];
  const themes = sourceThemes.map(normalizeTheme).filter((theme) => theme.id && theme.name);
  DEFAULT_THEMES.forEach((defaultTheme) => {
    if (!themes.some((theme) => theme.id === defaultTheme.id)) {
      themes.push({ ...defaultTheme });
    }
  });
  return themes;
}

function normalizeSessionState(payload = {}) {
  const themes = normalizeThemes(payload);
  const fallbackThemeId = themes[0].id;
  const themeIds = new Set(themes.map((theme) => theme.id));
  const items = Array.isArray(payload.items) ? payload.items.map(normalizeSessionItem) : [];
  const safeItems = items.map((entry) => {
    const config = getTypeConfig(entry.type);
    return {
      id: entry.id || makeId(),
      themeId: themeIds.has(entry.themeId) ? entry.themeId : fallbackThemeId,
      type: entry.type,
      name: normalizeValue(entry.name) || config.title,
      url: normalizeValue(entry.url)
    };
  });
  return {
    id: normalizeValue(payload.id) || makeId(),
    name: normalizeValue(payload.name) || "Sesión nueva",
    title: normalizeValue(payload.title) || "Recursos digitales",
    themes,
    items: safeItems,
    updatedAt: Number(payload.updatedAt) || Date.now()
  };
}

function migrateLegacyState(rawState = {}) {
  if (!rawState || typeof rawState !== "object") return null;
  const oldItems = Array.isArray(rawState.items) ? rawState.items.map(normalizeSessionItem) : [];
  if (!oldItems.length && !normalizeValue(rawState.title)) return null;
  return normalizeSessionState({
    id: makeId(),
    name: "Sesión principal",
    title: normalizeValue(rawState.title) || "Recursos digitales",
    items: oldItems,
    updatedAt: Date.now()
  });
}

function loadLegacySession() {
  const rawLegacy = localStorage.getItem("experienciaMenu.v2");
  if (!rawLegacy) return null;
  try {
    const parsed = JSON.parse(rawLegacy);
    if (Array.isArray(parsed)) return null;
    return migrateLegacyState(parsed);
  } catch (_) {
    return null;
  }
}

function loadSessionData() {
  const storageKey = getSessionStorageKey();
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    const legacy = loadLegacySession();
    const sessions = legacy ? [legacy] : [];
    sessionState = {
      userKey: getCurrentUserKey(),
      activeSessionId: legacy ? legacy.id : "",
      sessions
    };
    persistSessionData();
    return sessionState;
  }
  try {
    const parsed = JSON.parse(raw);
    const loaded = normalizeSessionStatePayload(parsed);
    sessionState = loaded;
  } catch (_) {
    const legacy = loadLegacySession();
    sessionState = {
      userKey: getCurrentUserKey(),
      activeSessionId: legacy ? legacy.id : "",
      sessions: legacy ? [legacy] : []
    };
  }
  return sessionState;
}

function buildNewSession(name = "", title = "Recursos digitales") {
  return {
    id: makeId(),
    name: normalizeValue(name) || getNextSessionName(),
    title: normalizeValue(title) || "Recursos digitales",
    themes: DEFAULT_THEMES.map((theme) => ({ ...theme })),
    items: [],
    updatedAt: Date.now()
  };
}

function getNextSessionName() {
  const existing = new Set(sessionState.sessions.map((session) => normalizeValue(session.name).toLowerCase()));
  for (let index = 1; index <= 999; index += 1) {
    const candidate = `Sesión ${index}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `Sesión ${sessionState.sessions.length + 1}`;
}

function createSession(name = "", setActive = true, shouldPersist = true) {
  const nextSession = buildNewSession(name);
  sessionState.sessions.push(nextSession);
  if (setActive) {
    sessionState.activeSessionId = nextSession.id;
  }
  if (!sessionState.activeSessionId && !setActive) {
    sessionState.activeSessionId = nextSession.id;
  }
  if (shouldPersist) {
    persistSessionData();
  }
  return nextSession;
}

function hydrateSessionFromState(session = {}, payload = {}) {
  if (!session || typeof session !== "object") return;
  const items = Array.isArray(payload.items)
    ? payload.items.map(normalizeExperience)
    : [];
  session.title = normalizeValue(payload.title || session.title || "Recursos digitales");
  session.themes = normalizeThemes(payload);
  session.items = items;
  session.updatedAt = Date.now();
  if (payload.name) {
    session.name = normalizeValue(payload.name);
  }
}

function normalizeSessionStatePayload(payload = {}) {
  const sessions = Array.isArray(payload.sessions)
    ? payload.sessions.map(normalizeSessionState)
    : [];
  const normalizedUserKey = sanitizeFileName(normalizeValue(payload.userKey)) || getCurrentUserKey();
  let activeSessionId = normalizeValue(payload.activeSessionId);
  if (sessions.length && !sessions.some((session) => session.id === activeSessionId)) {
    activeSessionId = sessions[0].id || "";
  }
  return {
    userKey: normalizedUserKey || getCurrentUserKey(),
    activeSessionId,
    sessions
  };
}

function ensureActiveSession() {
  if (!sessionState.sessions.length) {
    const session = createSession("Sesión 1", true, false);
    persistSessionData();
    return session;
  }
  const found = sessionState.sessions.find((session) => session.id === sessionState.activeSessionId);
  if (!found) {
    sessionState.activeSessionId = sessionState.sessions[0].id;
  }
  return getActiveSession();
}

function getActiveSession() {
  return sessionState.sessions.find((session) => session.id === sessionState.activeSessionId) || sessionState.sessions[0];
}

function persistSessionData() {
  const storageKey = getSessionStorageKey();
  localStorage.setItem(storageKey, JSON.stringify({
    userKey: sessionState.userKey || getCurrentUserKey(),
    activeSessionId: sessionState.activeSessionId,
    sessions: sessionState.sessions
  }));
  scheduleCloudSessionPersist();
}

function buildCloudSessionPayload(session = {}) {
  const normalized = normalizeSessionState(session);
  return {
    ownerId: currentOwnerId,
    sessionId: normalized.id,
    name: normalized.name,
    title: normalized.title,
    themes: normalized.themes,
    items: normalized.items,
    updatedAtMs: normalized.updatedAt,
    updatedAt: new Date(normalized.updatedAt || Date.now()).toISOString(),
    session: normalized,
    serverUpdatedAt: serverTimestamp()
  };
}

function normalizeCloudSessionDoc(snapshot) {
  const data = snapshot?.data?.() || {};
  const source = data.session && typeof data.session === "object"
    ? data.session
    : {
        id: data.sessionId || snapshot.id,
        name: data.name,
        title: data.title,
        themes: data.themes,
        items: data.items,
        updatedAt: data.updatedAtMs
      };
  return normalizeSessionState({
    ...source,
    id: source.id || snapshot.id
  });
}

async function saveSessionToCloud(session = {}) {
  if (!currentOwnerId || !session?.id) return;
  const sessionRef = doc(firestoreDb, CLOUD_COLLECTION, session.id);
  await setDoc(sessionRef, buildCloudSessionPayload(session), { merge: true });
}

function scheduleCloudSessionPersist() {
  if (!currentOwnerId) return;
  window.clearTimeout(pendingCloudSaveTimer);
  pendingCloudSaveTimer = window.setTimeout(() => {
    void persistAllSessionsToCloud();
  }, 500);
}

async function persistAllSessionsToCloud() {
  if (!currentOwnerId) return;
  const sessions = Array.isArray(sessionState.sessions) ? sessionState.sessions : [];
  await Promise.all(sessions.map((session) => saveSessionToCloud(session).catch((error) => {
    console.warn("[experienciaMenu] No se pudo guardar sesión en Firestore", error);
  })));
}

async function deleteSessionFromCloud(sessionId = "") {
  const cleanId = normalizeValue(sessionId);
  if (!currentOwnerId || !cleanId) return;
  try {
    await deleteDoc(doc(firestoreDb, CLOUD_COLLECTION, cleanId));
  } catch (error) {
    console.warn("[experienciaMenu] No se pudo eliminar sesión en Firestore", error);
  }
}

async function loadCloudSessions(ownerId = "") {
  const cleanOwnerId = normalizeValue(ownerId);
  if (!cleanOwnerId) return [];
  const sessionsQuery = query(
    collection(firestoreDb, CLOUD_COLLECTION),
    where("ownerId", "==", cleanOwnerId)
  );
  const snapshot = await getDocs(sessionsQuery);
  return snapshot.docs
    .map(normalizeCloudSessionDoc)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

async function bootstrapCloudSessions(user) {
  const ownerId = normalizeValue(user?.uid);
  if (!ownerId) return;
  currentOwnerId = ownerId;
  sessionState.userKey = ownerId;

  try {
    const cloudSessions = await loadCloudSessions(ownerId);
    if (cloudSessions.length) {
      const activeId = sessionState.activeSessionId;
      sessionState = {
        userKey: ownerId,
        activeSessionId: cloudSessions.some((session) => session.id === activeId)
          ? activeId
          : cloudSessions[0].id,
        sessions: cloudSessions
      };
      persistSessionData();
      const active = ensureActiveSession();
      applyStateToDom(active);
      renderSessionList();
      renderPreview(active);
      return;
    }

    ensureActiveSession();
    await persistAllSessionsToCloud();
  } catch (error) {
    console.warn("[experienciaMenu] No se pudieron cargar sesiones desde Firestore", error);
  }
}

function resolveUserOrReload(forceKey = getCurrentUserKey()) {
  const nextKey = normalizeValue(forceKey) || getCurrentUserKey();
  if (!nextKey || nextKey === sessionState.userKey) {
    return;
  }

  syncActiveSessionFromDom();
  sessionState = {
    userKey: nextKey,
    activeSessionId: "",
    sessions: []
  };
  loadSessionData();
  const session = ensureActiveSession();
  applyStateToDom(session);
  renderSessionList();
  renderPreview(session);
}

function syncActiveSessionFromDom() {
  const activeSession = getActiveSession();
  if (!activeSession) return;
  const snapshot = getCurrentStateFromDom();
  hydrateSessionFromState(activeSession, snapshot);
  persistSessionData();
}

function renderSessionList() {
  const sessionList = document.getElementById("sessionList");
  const emptyMessage = document.getElementById("sessionListEmpty");
  if (!sessionList || !emptyMessage) return;

  const sessions = sessionState.sessions || [];
  if (!sessions.length) {
    sessionList.innerHTML = "";
    emptyMessage.hidden = false;
    return;
  }

  emptyMessage.hidden = true;
  const activeId = sessionState.activeSessionId || "";

  sessionList.innerHTML = sessions.map((session) => {
    const isActive = session.id === activeId;
    const updated = formatSessionTime(session.updatedAt);
    return `
      <div class="session-item ${isActive ? "is-active" : ""}" data-session-id="${escapeHtml(session.id)}">
        <div class="session-item-label">${escapeHtml(normalizeValue(session.name) || "Sesión sin nombre")}</div>
        <span class="session-item-time">${escapeHtml(updated)}</span>
        ${sessions.length > 1 ? `<button type="button" class="session-item-delete" data-action="delete-session" data-session-id="${escapeHtml(session.id)}" aria-label="Eliminar sesión"><i class="fas fa-trash" aria-hidden="true"></i></button>` : ""}
      </div>
    `;
  }).join("");
}

function deleteSession(sessionId) {
  const id = normalizeValue(sessionId);
  if (!id || !sessionState.sessions.length) return;
  if (sessionState.sessions.length <= 1) return;

  sessionState.sessions = sessionState.sessions.filter((session) => session.id !== id);
  void deleteSessionFromCloud(id);
  if (sessionState.activeSessionId === id) {
    sessionState.activeSessionId = sessionState.sessions[0]?.id || "";
  }
  if (!sessionState.activeSessionId && sessionState.sessions.length) {
    sessionState.activeSessionId = sessionState.sessions[0].id;
  }
  persistSessionData();
  renderSessionList();
  const activeSession = getActiveSession();
  applyStateToDom(activeSession || createSession("Sesión 1", true, false));
  renderPreview(getCurrentStateFromDom());
}

function switchActiveSession(sessionId) {
  const nextId = normalizeValue(sessionId);
  if (!nextId) return;
  const target = sessionState.sessions.find((session) => session.id === nextId);
  if (!target) return;
  if (nextId === sessionState.activeSessionId) return;

  syncActiveSessionFromDom();
  sessionState.activeSessionId = nextId;
  applyStateToDom(target);
  renderSessionList();
  renderPreview(target);
  persistSessionData();
}

function installUserWatcher() {
  const userElement = document.getElementById("headerUserEmail");
  if (!userElement) return;

  const handleUser = () => {
    const nextKey = getCurrentUserKey();
    if (nextKey && nextKey !== sessionState.userKey) {
      resolveUserOrReload(nextKey);
    }
  };

  const observer = new MutationObserver(handleUser);
  observer.observe(userElement, {
    characterData: true,
    childList: true,
    subtree: true
  });
}

function applyStateToDom(state = {}) {
  const title = normalizeValue(state.title);
  const normalized = normalizeSessionState(state);
  const themes = normalized.themes;
  const items = normalized.items;

  const titleInput = document.getElementById("cursoNombre");
  if (titleInput) titleInput.value = title || "Recursos digitales";
  renderThemeSelect(themes);

  const list = document.getElementById("experienceList");
  if (!list) return;

  if (!items.length) {
    list.className = "experience-list empty";
    list.innerHTML = "<p>No hay experiencias agregadas todavía. Añade una arriba.</p>";
    return;
  }

  list.className = "experience-list";
  list.innerHTML = themes.map((theme) => {
    const themeItems = items.filter((item) => item.themeId === theme.id);
    if (!themeItems.length) return "";
    return `
      <section class="theme-group" data-theme-id="${escapeHtml(theme.id)}">
        <h4 class="theme-group-title">${escapeHtml(theme.name)}</h4>
        ${themeItems.map((item, index) => buildExperienceCard(item, index + 1, themes)).join("")}
      </section>
    `;
  }).join("");
}

function renderThemeSelect(themes = []) {
  const select = document.getElementById("experienceTheme");
  if (!select) return;
  const currentValue = normalizeValue(select.value);
  const safeThemes = normalizeThemes({ themes });
  select.innerHTML = safeThemes.map((theme) => (
    `<option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name)}</option>`
  )).join("");
  if (safeThemes.some((theme) => theme.id === currentValue)) {
    select.value = currentValue;
  }
}

function triggerDownloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 0);
}

function loadJsZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (pendingJsZipLoad) return pendingJsZipLoad;

  pendingJsZipLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = EXPORT_ZIP_LIBRARY_SRC;
    script.async = true;
    script.onload = () => {
      if (window.JSZip) {
        resolve(window.JSZip);
      } else {
        reject(new Error("No se cargó JSZip correctamente."));
      }
    };
    script.onerror = () => reject(new Error("No fue posible cargar JSZip desde CDN."));
    document.head.appendChild(script);
  });

  return pendingJsZipLoad;
}

async function loadLogoForExport() {
  for (const fileName of EXPORT_LOGO_FILES) {
    try {
      const response = await fetch(fileName, { cache: "reload" });
      if (!response.ok) continue;
      const blob = await response.blob();
      return blob;
    } catch (_) {
      // se prueba el siguiente archivo de logo
    }
  }
  return null;
}

function makeId() {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeExperience(item = {}) {
  const type = getTypeConfig(normalizeValue(item.type)).key;
  const config = getTypeConfig(type);
  return {
    id: normalizeValue(item.id) || makeId(),
    themeId: normalizeValue(item.themeId) || DEFAULT_THEME_ID,
    type,
    name: normalizeValue(item.name) || config.title,
    url: normalizeValue(item.url)
  };
}

function readStoredState() {
  const session = getActiveSession() || ensureActiveSession();
  if (!session) {
    return { title: "Recursos digitales", items: [] };
  }
  return {
    title: session.title || "Recursos digitales",
    themes: normalizeThemes(session),
    items: Array.isArray(session.items) ? session.items : []
  };
}

function saveState(state) {
  const active = getActiveSession() || ensureActiveSession();
  if (!active) return;
  hydrateSessionFromState(active, state);
  persistSessionData();
  renderSessionList();
}

function getCurrentStateFromDom() {
  const title = normalizeValue(document.getElementById("cursoNombre")?.value);
  const active = getActiveSession();
  const themes = normalizeThemes(active || {});
  const items = Array.from(document.querySelectorAll(".experience-edit-card")).map((node) => ({
    id: normalizeValue(node.dataset.experienceId),
    themeId: normalizeValue(node.querySelector('[data-field="themeId"]')?.value || node.dataset.themeId),
    type: normalizeValue(node.dataset.type),
    name: normalizeValue(node.querySelector('[data-field="name"]')?.value),
    url: normalizeValue(node.querySelector('[data-field="url"]')?.value)
  })).map(normalizeExperience);

  return { title: title || "Recursos digitales", themes, items };
}

function buildExperienceCard(item, index, themes = []) {
  const config = getTypeConfig(item.type);
  const themeOptions = normalizeThemes({ themes }).map((theme) => (
    `<option value="${escapeHtml(theme.id)}" ${theme.id === item.themeId ? "selected" : ""}>${escapeHtml(theme.name)}</option>`
  )).join("");

  return `
    <article class="experience-edit-card ${config.key === 'podcast' ? 'experiencia-podcast' : config.key === 'video' ? 'experiencia-video' : 'experiencia-escape'}" data-experience-id="${escapeHtml(item.id)}" data-theme-id="${escapeHtml(item.themeId)}" data-type="${escapeHtml(item.type)}">
      <div class="experience-row-head">
        <p class="experience-number">#${String(index).padStart(2, "0")}</p>
        <h3>${escapeHtml(config.title)}</h3>
        <span class="experience-badge">${escapeHtml(config.title)}</span>
        <button type="button" class="btn btn-danger" data-action="remove-experience" data-id="${escapeHtml(item.id)}">
          <i class="fas fa-trash" aria-hidden="true"></i>
          Eliminar
        </button>
      </div>
      <label class="experience-theme-field">
        <span>Tema</span>
        <select data-field="themeId">${themeOptions}</select>
      </label>
      <label>
        <span>Nombre</span>
        <input type="text" data-field="name" value="${escapeHtml(item.name)}" />
      </label>
      <label>
        <span>URL del recurso</span>
        <input type="url" data-field="url" value="${escapeHtml(item.url)}" placeholder="https://..." />
      </label>
    </article>
  `;
}

function addExperienceItem() {
  const themeId = normalizeValue(document.getElementById("experienceTheme")?.value) || DEFAULT_THEME_ID;
  const type = getTypeConfig(document.getElementById("experienceType")?.value).key;
  const name = normalizeValue(document.getElementById("experienceName")?.value);
  const url = normalizeValue(document.getElementById("experienceUrl")?.value);

  if (!name) {
    alert("Escribe un nombre para la experiencia.");
    return;
  }

  const state = getCurrentStateFromDom();
  state.items.push({
    id: makeId(),
    themeId,
    type,
    name,
    url
  });

  applyStateToDom(state);
  saveState(state);
  renderPreview(state);
  if (document.getElementById("experienceName")) document.getElementById("experienceName").value = "";
  if (document.getElementById("experienceUrl")) document.getElementById("experienceUrl").value = "";
}

function addThemeItem() {
  const state = getCurrentStateFromDom();
  const themes = normalizeThemes(state);
  const nextName = window.prompt("Nombre del tema", `Tema ${themes.length + 1}`);
  const cleanName = normalizeValue(nextName);
  if (!cleanName) return;
  const nextTheme = { id: makeId(), name: cleanName };
  state.themes = [...themes, nextTheme];
  applyStateToDom(state);
  const select = document.getElementById("experienceTheme");
  if (select) select.value = nextTheme.id;
  saveState(getCurrentStateFromDom());
  renderPreview(getCurrentStateFromDom());
}

function removeExperience(id) {
  const state = getCurrentStateFromDom();
  state.items = state.items.filter((item) => item.id !== id);
  applyStateToDom(state);
  saveState(state);
  renderPreview(state);
}

function renderPreview(state) {
  const preview = document.getElementById("previewCard");
  if (!preview) return;
  preview.innerHTML = `
    <p class="preview-title">Vista previa del menu exportado</p>
    <div class="preview-shell">
      <iframe class="inline-export-preview-frame" title="Vista previa del menu exportado"></iframe>
    </div>
  `;
  const frame = preview.querySelector(".inline-export-preview-frame");
  if (frame) {
    frame.srcdoc = getExportMarkup(state);
  }
}

function showPreview() {
  const preview = document.getElementById("previewCard");
  const state = getCurrentStateFromDom();
  saveState(state);
  renderPreview(state);
  openExportPreview(state);
  if (!preview) return;
  preview.classList.remove("is-highlighted");
  void preview.offsetWidth;
  preview.classList.add("is-highlighted");
  preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openExportPreview(state = getCurrentStateFromDom()) {
  const modal = document.getElementById("exportPreviewModal");
  const frame = document.getElementById("exportPreviewFrame");
  if (!modal || !frame) return;
  frame.srcdoc = getExportMarkup(state);
  modal.hidden = false;
  document.body.classList.add("export-preview-open");
}

function closeExportPreview() {
  const modal = document.getElementById("exportPreviewModal");
  const frame = document.getElementById("exportPreviewFrame");
  if (!modal || !frame) return;
  modal.hidden = true;
  frame.srcdoc = "";
  document.body.classList.remove("export-preview-open");
}

function getMaxBuilderPanelWidth() {
  const viewportWidth = window.innerWidth || BUILDER_PANEL_MAX_WIDTH;
  return clampNumber(viewportWidth - 460, BUILDER_PANEL_MIN_WIDTH, BUILDER_PANEL_MAX_WIDTH);
}

function setBuilderPanelWidth(width) {
  const nextWidth = clampNumber(width, BUILDER_PANEL_MIN_WIDTH, getMaxBuilderPanelWidth());
  document.documentElement.style.setProperty("--em-builder-width", `${nextWidth}px`);
  try {
    localStorage.setItem(BUILDER_PANEL_WIDTH_KEY, String(nextWidth));
  } catch (_) {
    // no-op
  }
}

function restoreBuilderPanelWidth() {
  let storedWidth = "";
  try {
    storedWidth = localStorage.getItem(BUILDER_PANEL_WIDTH_KEY) || "";
  } catch (_) {
    storedWidth = "";
  }
  if (!storedWidth) return;
  setBuilderPanelWidth(storedWidth);
}

function installBuilderPanelResize() {
  const handle = document.getElementById("builderPanelResizeHandle");
  if (!handle) return;

  let startX = 0;
  let startWidth = 0;
  let isResizing = false;

  const stopResize = () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.classList.remove("is-resizing-experience-builder");
  };

  const resize = (event) => {
    if (!isResizing) return;
    const delta = startX - event.clientX;
    setBuilderPanelWidth(startWidth + delta);
  };

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const currentWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--em-builder-width")) || 480;
    startX = event.clientX;
    startWidth = currentWidth;
    isResizing = true;
    document.body.classList.add("is-resizing-experience-builder");
    handle.setPointerCapture?.(event.pointerId);
  });

  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
  window.addEventListener("resize", () => {
    const currentWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--em-builder-width")) || 480;
    setBuilderPanelWidth(currentWidth);
  });
}

function buildExportCard(item) {
  const config = getTypeConfig(item.type);
  const safeName = escapeHtml(item.name || config.title);
  const safeDescription = escapeHtml(config.description);
  const safeCategory = escapeHtml(config.category);
  const safeAction = escapeHtml(config.actionText);
  const safeIcon = escapeHtml(config.icon);
  const safeUrl = escapeHtml(normalizeValue(item.url));
  const hasLink = Boolean(safeUrl);
  const linkAttrs = hasLink ? `href="${safeUrl}" target="_blank" rel="noopener noreferrer" aria-label="${safeName}"` : "";
  const anchorOpen = hasLink
    ? `<a class="asc-light-card ${config.cardClass}" ${linkAttrs}>`
    : `<div class="asc-light-card ${config.cardClass}">`;
  const anchorClose = hasLink ? "</a>" : "</div>";

  return `
    ${anchorOpen}
      <div class="asc-light-card-top">
        <div class="asc-light-icon" aria-hidden="true">
          <i class="bi ${safeIcon}"></i>
        </div>
        <span class="asc-light-number"></span>
      </div>
      <div class="asc-light-card-content">
        <span class="asc-light-category">${safeCategory}</span>
        <h3 class="asc-light-card-title">${safeName}</h3>
        <p class="asc-light-card-text">${safeDescription}</p>
      </div>
      <div class="asc-light-action">
        <span>${safeAction}</span>
        <span class="asc-light-arrow" aria-hidden="true">
          <i class="bi bi-arrow-up-right"></i>
        </span>
      </div>
    ${anchorClose}
  `;
}

function getExportMarkup(state) {
  const safeTitle = escapeHtml(state.title || "Recursos digitales");
  const normalized = normalizeSessionState(state);
  const topicSections = normalized.themes.map((theme) => {
    const items = normalized.items.filter((item) => item.themeId === theme.id);
    if (!items.length) return "";
    return `
    <section class="asc-light-topic" aria-label="${escapeHtml(theme.name)}">
      <h3 class="asc-light-topic-title">${escapeHtml(theme.name)}</h3>
      <div class="asc-light-grid">
        ${items.map(buildExportCard).join("")}
      </div>
    </section>`;
  }).join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
  <style>
    :root { --hub-background: #f6f8fc; }
    html,
    body { margin: 0; padding: 0; min-height: 100vh; background: var(--hub-background); }
    .asc-light-hub,
    .asc-light-hub * { box-sizing: border-box; }
    .asc-light-hub {
      --hub-text: #172033;
      --hub-muted: #657087;
      --hub-border: #e7eaf0;
      --hub-background: #f6f8fc;
      position: relative;
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 24px 14px;
      overflow: hidden;
      border: 0;
      border-radius: 0;
      background:
        radial-gradient(circle at 5% 0%, rgba(99, 102, 241, 0.09), transparent 28%),
        radial-gradient(circle at 95% 100%, rgba(14, 165, 233, 0.08), transparent 30%),
        var(--hub-background);
      box-shadow: none;
      color: var(--hub-text);
      font-family: "Inter", Arial, sans-serif;
      isolation: isolate;
    }
    .asc-light-header,
    .asc-light-topics,
    .asc-light-footer {
      width: min(100%, 1120px);
      margin-left: auto;
      margin-right: auto;
    }
    .asc-light-hub::before {
      content: "";
      position: absolute;
      top: -125px;
      right: -100px;
      width: 330px;
      height: 330px;
      border: 1px solid rgba(99, 102, 241, 0.08);
      border-radius: 50%;
      box-shadow: 0 0 0 45px rgba(99, 102, 241, 0.025), 0 0 0 90px rgba(99, 102, 241, 0.015);
      z-index: -1;
    }
    .asc-light-hub::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      opacity: 0.4;
      background-image:
        linear-gradient(rgba(74, 85, 113, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(74, 85, 113, 0.045) 1px, transparent 1px);
      background-size: 54px 54px;
      mask-image: linear-gradient(to bottom, black, transparent 80%);
      -webkit-mask-image: linear-gradient(to bottom, black, transparent 80%);
    }
    .asc-light-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 32px;
      margin-bottom: 40px;
    }
    .asc-light-heading { max-width: 720px; }
    .asc-light-title {
      margin: 0; color: #172033; font-size: clamp(24px, 4vw, 42px); font-weight: 800; line-height: 1.08; letter-spacing: -0.035em;
    }
    .asc-light-title span { background: linear-gradient(90deg, #4f46e5, #0284c7); background-clip: text; -webkit-background-clip: text; color: transparent; -webkit-text-fill-color: transparent; }
    .asc-light-description {
      max-width: 650px; margin: 16px 0 0; color: var(--hub-muted); font-size: 13px; line-height: 1.58;
    }
    .asc-light-topics { display: grid; gap: 28px; }
    .asc-light-topic-title { margin: 0 0 12px; color: #172033; font-size: 18px; font-weight: 800; line-height: 1.2; letter-spacing: 0; }
    .asc-light-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 270px)); justify-content: center; gap: 12px; }
    .asc-light-card { --card-accent: #6366f1; --card-accent-rgb: 99, 102, 241; --card-soft: #eef2ff; position: relative; width: min(100%, 270px); min-height: 220px; display: flex; flex-direction: column; padding: 12px; overflow: hidden; border: 1px solid var(--hub-border); border-radius: 14px; background: #fff; box-shadow: 0 7px 12px rgba(43, 52, 78, 0.07), inset 0 1px 0 #ffffff; color: #172033 !important; text-decoration: none !important; transition: transform 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease; }
    .asc-light-card::before {
      content: ""; position: absolute; right: -85px; bottom: -100px; width: 245px; height: 245px; border-radius: 50%; background: rgba(var(--card-accent-rgb), 0.08); transition: transform 0.5s ease, opacity 0.5s ease;
    }
    .asc-light-card::after {
      content: ""; position: absolute; top: 0; left: 28px; right: 28px; height: 3px; border-radius: 0 0 12px 12px;
      background: linear-gradient(90deg, transparent, var(--card-accent), transparent); opacity: 0.8;
    }
    .asc-light-card:hover, .asc-light-card:focus {
      transform: translateY(-8px);
      box-shadow: none;
      color: #172033 !important; text-decoration: none !important; outline: none;
    }
    .asc-light-card:hover::before { transform: scale(1.18); }
    .asc-light-brand {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 56px;
      height: 56px;
      object-fit: contain;
      border-radius: 0;
      background: none;
      padding: 0;
      box-shadow: none;
      border: 0;
      display: block;
      filter: drop-shadow(0 2px 6px rgba(23, 32, 51, 0.14));
    }
    .asc-light-podcast { --card-accent: #9333ea; --card-accent-rgb: 147, 51, 234; --card-soft: #faf5ff; }
    .asc-light-video { --card-accent: #0284c7; --card-accent-rgb: 2, 132, 199; --card-soft: #f0f9ff; }
    .asc-light-escape { --card-accent: #059669; --card-accent-rgb: 5, 150, 105; --card-soft: #ecfdf5; }
    .asc-light-card-top {
      position: relative; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px;
    }
    .asc-light-icon {
      width: 48px; height: 48px; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid rgba(var(--card-accent-rgb), 0.16); border-radius: 14px; background: var(--card-soft); color: var(--card-accent);
      font-size: 22px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 8px 12px rgba(var(--card-accent-rgb), 0.07);
    }
    .asc-light-number { color: #b4bbc8; font-size: 12px; font-weight: 750; letter-spacing: 0.15em; }
    .asc-light-card-content { position: relative; z-index: 2; margin-top: auto; padding-top: 74px; }
    .asc-light-category {
      display: block; margin-bottom: 8px; color: var(--card-accent); font-size: 9px; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase;
    }
    .asc-light-card-title { margin: 0 0 8px; color: #172033; font-size: 16px; font-weight: 740; line-height: 1.15; letter-spacing: -0.02em; }
    .asc-light-card-text { margin: 0; color: #677287; font-size: 11px; line-height: 1.45; }
    .asc-light-action {
      position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; margin-top: 18px; padding-top: 14px;
      border-top: 1px solid #edf0f4; color: #313b4f; font-size: 10px; font-weight: 700;
    }
    .asc-light-arrow {
      width: 33px; height: 33px; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid rgba(var(--card-accent-rgb), 0.18); border-radius: 50%; background: var(--card-soft); color: var(--card-accent);
      transition: transform 0.3s ease, background 0.3s ease, color 0.3s ease;
    }
    .asc-light-card:hover .asc-light-arrow { transform: translateX(4px); background: var(--card-accent); color: #ffffff; }
    .asc-light-footer { display: flex; align-items: center; gap: 10px; margin-top: 24px; color: #9099aa; font-size: 11px; }
    .asc-light-footer-line { width: 42px; height: 1px; background: linear-gradient(90deg, #6366f1, transparent); }
    @media (max-width: 900px) {
      .asc-light-hub { padding: 24px 12px; border-radius: 0; }
      .asc-light-header { align-items: flex-start; flex-direction: column; }
      .asc-light-grid { grid-template-columns: repeat(auto-fit, minmax(230px, 270px)); justify-content: center; }
      .asc-light-brand { top: 12px; right: 12px; width: 48px; height: 48px; }
      .asc-light-card { min-height: 210px; padding: 12px; width: min(100%, 270px); }
      .asc-light-card-content { padding-top: 44px; }
      .asc-light-counter { display: none; }
    }
    @media (max-width: 520px) {
      .asc-light-hub { padding: 20px 10px; border-radius: 0; }
      .asc-light-brand { top: 10px; right: 10px; width: 44px; height: 44px; }
      .asc-light-title { font-size: 26px; }
      .asc-light-description { font-size: 12px; }
      .asc-light-grid { grid-template-columns: minmax(0, min(100%, 250px)); }
      .asc-light-card { min-height: 200px; padding: 12px; border-radius: 14px; width: min(100%, 250px); }
      .asc-light-card-content { padding-top: 38px; }
      .asc-light-icon { width: 46px; height: 46px; font-size: 20px; }
      .asc-light-card-title { font-size: 15px; }
      .asc-light-card-text { font-size: 10px; }
      .asc-light-action { margin-top: 14px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .asc-light-card, .asc-light-card::before, .asc-light-arrow { transition: none; }
    }
  </style>
</head>
<body>
    <section class="asc-light-hub" aria-labelledby="asc-light-title">
    <img src="logo.png" alt="Logo" class="asc-light-brand" />
    <header class="asc-light-header">
    <div class="asc-light-heading">
        <h2 class="asc-light-title" id="asc-light-title">
          ${safeTitle}
        </h2>
        <p class="asc-light-description">
          Accede a contenidos audiovisuales y experiencias interactivas diseñadas para complementar tu aprendizaje.
        </p>
      </div>
    </header>
    <div class="asc-light-topics">
      ${topicSections || '<p class="asc-light-description">Sin experiencias configuradas.</p>'}
    </div>
    <footer class="asc-light-footer">
      <span class="asc-light-footer-line"></span>
      <span>Selecciona una experiencia para comenzar</span>
    </footer>
  </section>
</body>
</html>`;
}

async function exportHtml() {
  const state = getCurrentStateFromDom();
  saveState(state);
  const exportMarkup = getExportMarkup(state);
  const folderName = sanitizeFileName(state.title);
  const htmlFileName = `${folderName}-experiencias.html`;
  const zipFileName = `${folderName}-export.zip`;

  try {
    const JSZip = await loadJsZip();
    const zip = new JSZip();
    const packageFolder = zip.folder(folderName);

    packageFolder.file(htmlFileName, exportMarkup, { binary: false });

    const logoBlob = await loadLogoForExport();
    if (logoBlob) {
      const logoArrayBuffer = await logoBlob.arrayBuffer();
      packageFolder.file("logo.png", logoArrayBuffer, { binary: true });
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerDownloadBlob(zipBlob, zipFileName);
    return;
  } catch (error) {
    // Fallback: exportar solo HTML si no es posible generar ZIP.
    const fallbackBlob = new Blob([exportMarkup], { type: "text/html;charset=utf-8" });
    triggerDownloadBlob(fallbackBlob, htmlFileName);
  }
}

function bindEvents() {
  const form = document.getElementById("configForm");
  const btnNewSession = document.getElementById("btnNewSession");
  const sessionList = document.getElementById("sessionList");
  const btnPreview = document.getElementById("btnPreview");
  const btnCloseExportPreview = document.getElementById("btnCloseExportPreview");
  const exportPreviewModal = document.getElementById("exportPreviewModal");
  const btnAddExperience = document.getElementById("btnAddExperience");
  const btnAddTheme = document.getElementById("btnAddTheme");
  const experienceList = document.getElementById("experienceList");

  if (btnAddExperience) {
    btnAddExperience.addEventListener("click", addExperienceItem);
  }

  if (btnAddTheme) {
    btnAddTheme.addEventListener("click", addThemeItem);
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void exportHtml();
    });

    form.addEventListener("input", () => {
      const state = getCurrentStateFromDom();
      saveState(state);
      renderPreview(state);
    });
  }

  if (experienceList) {
    experienceList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='remove-experience']");
      if (!button) return;
      const id = normalizeValue(button.dataset.id);
      if (!id) return;
      removeExperience(id);
    });
  }

  if (sessionList) {
    sessionList.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action='delete-session']");
      const sessionItem = event.target.closest(".session-item");
      if (actionButton) {
        const id = normalizeValue(actionButton.dataset.sessionId);
        if (id) deleteSession(id);
        return;
      }

      const id = normalizeValue(sessionItem?.dataset?.sessionId);
      if (!id) return;
      switchActiveSession(id);
    });
  }

  if (btnNewSession) {
    btnNewSession.addEventListener("click", () => {
      syncActiveSessionFromDom();
      const nextSession = createSession();
      applyStateToDom(nextSession);
      renderSessionList();
      renderPreview(nextSession);
      saveState(nextSession);
    });
  }

  if (btnPreview) {
    btnPreview.addEventListener("click", () => {
      showPreview();
    });
  }

  if (btnCloseExportPreview) {
    btnCloseExportPreview.addEventListener("click", closeExportPreview);
  }

  if (exportPreviewModal) {
    exportPreviewModal.addEventListener("click", (event) => {
      if (event.target === exportPreviewModal) {
        closeExportPreview();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeExportPreview();
    }
  });
}

function initialize() {
  restoreBuilderPanelWidth();
  sessionState.userKey = getCurrentUserKey();
  loadSessionData();
  const activeSession = getActiveSession() || ensureActiveSession();
  applyStateToDom(activeSession || { title: "Recursos digitales", items: [] });
  renderSessionList();
  renderPreview(getCurrentStateFromDom());
  installBuilderPanelResize();
  installUserWatcher();
  bindEvents();
  onAuthStateChanged(auth, (user) => {
    if (!user?.uid) {
      currentOwnerId = "";
      return;
    }
    void bootstrapCloudSessions(user);
  });
}

function revealExperienceMenu() {
  const bootScreen = document.getElementById("experienciaBootScreen");
  document.body.classList.remove("experiencia-loading");
  document.body.classList.add("experiencia-ready");
  if (bootScreen) {
    bootScreen.remove();
  }
}

window.aplicarNombresExperiencias = (payload = {}) => {
  const inputItems = Array.isArray(payload.items) ? payload.items : [];
  const state = {
    title: normalizeValue(payload.title) || "Recursos digitales",
    items: inputItems.map((entry) => normalizeExperience(entry))
  };
  syncActiveSessionFromDom();
  applyStateToDom(state);
  saveState(state);
  renderPreview(state);
};

try {
  initialize();
} finally {
  revealExperienceMenu();
}
