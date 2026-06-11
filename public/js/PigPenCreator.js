import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadString,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getDefaultFirebaseApp } from "./firebase-default-app.js";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js";
import { authFetchJson } from "./api-client.js";
import {
  normalizeEscapeRoomProject,
  normalizeMission,
  normalizeQuestion,
  normalizeQuestionList,
  normalizeAcceptedAnswers,
  normalizeTextList,
  normalizePairList,
  normalizeMediaValue,
  normalizeString,
  normalizeRoomTitle,
  buildMissionId,
  validateQuestionAnswer
} from "./escape-room-creator-model.mjs";
import {
  buildEscapeRoomPackage,
  buildPreviewDocument
} from "./escape-room-package-builder.mjs";

const app = getDefaultFirebaseApp();
void bootstrapFirebaseAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);

const TEXT_MODEL_DEFAULT = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";
const ALLOWED_TEXT_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-flash-latest"
]);
const FORM_STORAGE_KEY = "PigPenCreator.formState.v2";
const PROJECT_STORAGE_KEY = "PigPenCreator.projectState.v1";
const ACTIVE_SESSION_STORAGE_KEY = "PigPenCreator.activeSessionId.v1";
const THEME_STORAGE_KEY = "PigPenCreator.theme.v1";
const PREVIEW_THEME_STORAGE_KEY = "PigPenCreator.previewTheme.v1";
const ESCAPE_ROOM_COLLECTION = "escapeRoom";
const SESSION_TITLE_DEFAULT = "Sesion sin titulo";
const TEXT_SUBTYPES = ["palabra", "letra", "numero", "codigo_corto", "frase_corta"];
const THEME_PRESETS = {
  nebula: { bgStart: "#0e0b19", bgEnd: "#1c1231", primary: "#f472b6", accent: "#22d3ee" },
  midnight: { bgStart: "#0b1220", bgEnd: "#172033", primary: "#60a5fa", accent: "#38bdf8" },
  jade: { bgStart: "#071713", bgEnd: "#12332d", primary: "#34d399", accent: "#22d3ee" },
  sunset: { bgStart: "#21100e", bgEnd: "#3a1824", primary: "#fb7185", accent: "#f59e0b" }
};
const PREVIEW_THEME_PRESETS = {
  midnightAurora: { label: "Midnight Aurora", baseColor: "#7c3aed", mood: "Frio oscuro con acentos violetas." },
  glacier: { label: "Glacier", baseColor: "#38bdf8", mood: "Frio limpio con brillo glacial." },
  volcanic: { label: "Volcanic", baseColor: "#ef4444", mood: "Calido intenso con contraste oscuro." },
  emberGold: { label: "Ember Gold", baseColor: "#f59e0b", mood: "Calido dorado con fondo dramático." },
  jadeNight: { label: "Jade Night", baseColor: "#10b981", mood: "Oscuro vegetal con acentos jade." },
  roseVelvet: { label: "Rose Velvet", baseColor: "#ec4899", mood: "Oscuro elegante con rosa profundo." },
  steelBlue: { label: "Steel Blue", baseColor: "#3b82f6", mood: "Frio técnico con acento azul acero." },
  plumHeat: { label: "Plum Heat", baseColor: "#d946ef", mood: "Morado cálido con brillo magenta." }
};
const PREVIEW_THEME_DEFAULT = {
  presetId: "midnightAurora",
  baseColor: "#7c3aed",
  cardRadius: 22,
  titleSize: 46,
  subtitleSize: 22,
  paragraphSize: 16
};

const elements = {
  form: document.getElementById("escapeRoomForm"),
  missionEditorList: document.getElementById("missionEditorList"),
  missionEmpty: document.getElementById("erMissionEmpty"),
  btnGenerar: document.getElementById("btnGenerar"),
  btnLimpiar: document.getElementById("btnLimpiar"),
  btnExportar: document.getElementById("btnExportar"),
  btnPublicar: document.getElementById("btnPublicar"),
  btnCopiarJson: document.getElementById("btnCopiarJson"),
  btnSugerirObjetivo: document.getElementById("btnSugerirObjetivo"),
  btnAddMission: document.getElementById("btnAddMission"),
  loading: document.getElementById("loadingIndicator"),
  emptyState: document.getElementById("erEmptyState"),
  previewPanel: document.getElementById("escapeRoomPreviewPanel"),
  previewFrame: document.getElementById("escapeRoomPreviewFrame"),
  previewSpinner: document.getElementById("erPreviewSpinner"),
  resultadoContainer: document.getElementById("resultadoContainer"),
  jsonPreview: document.getElementById("jsonPreview"),
  statusBanner: document.getElementById("erStatusBanner"),
  tabButtons: Array.from(document.querySelectorAll("[data-er-tab]")),
  modeloSelect: document.getElementById("modeloSelect"),
  preguntasPorSalaInput: document.getElementById("preguntasPorSalaInput"),
  narrativaSelect: document.getElementById("narrativaSelect"),
  narrativaCustomField: document.getElementById("narrativaCustomField"),
  narrativaCustomInput: document.getElementById("narrativaCustomInput"),
  estiloImagenSelect: document.getElementById("estiloImagenSelect"),
  missionCount: document.getElementById("erMissionCount"),
  unlockedCount: document.getElementById("erUnlockedCount"),
  typeSummary: document.getElementById("erTypeSummary"),
  btnNewSession: document.getElementById("btnNewSession"),
  sessionList: document.getElementById("erSessionList"),
  sessionsLoading: document.getElementById("erSessionsLoading"),
  sessionsEmpty: document.getElementById("erSessionsEmpty"),
  activeSessionName: document.getElementById("erActiveSessionName"),
  saveState: document.getElementById("erSaveState"),
  themeBgStart: document.getElementById("themeBgStart"),
  themeBgEnd: document.getElementById("themeBgEnd"),
  themePrimary: document.getElementById("themePrimary"),
  themeAccent: document.getElementById("themeAccent"),
  themePresetButtons: Array.from(document.querySelectorAll("[data-theme-preset]")),
  previewThemePresetButtons: Array.from(document.querySelectorAll("[data-preview-theme-preset]")),
  previewBaseColor: document.getElementById("previewBaseColor"),
  previewCardRadius: document.getElementById("previewCardRadius"),
  previewThemeSummary: document.getElementById("previewThemeSummary"),
  btnPreviewThemeReset: document.getElementById("btnPreviewThemeReset")
};

const state = {
  project: null,
  generationNote: "",
  activeTab: "preview",
  isLoading: false,
  isGenerating: false,
  formPersistenceSuspended: false,
  refreshHandle: null,
  sortable: null,
  projectStorageNoticeShown: false,
  sessions: [],
  activeSessionId: "",
  activeSessionMeta: null,
  sessionsLoading: true,
  sessionSaveHandle: null,
  isHydratingFromRemote: false,
  suspendSessionSave: false,
  saveState: "idle",
  currentUser: null,
  previewTheme: { ...PREVIEW_THEME_DEFAULT }
};

function hideBootSpinner() {
  const spinner = document.getElementById("pigpenBootSpinner");
  if (spinner) {
    spinner.classList.add("is-hidden");
  }
}

onAuthStateChanged(auth, async (user) => {
  try {
    if (user) {
      state.currentUser = user;
      setHeaderUserEmail(user.email || "");
      await user.getIdToken();
      await loadSessionsFromFirebase();
    } else {
      state.currentUser = null;
      setHeaderUserEmail("");
      window.location.href = "index.html";
    }
  } catch (error) {
    console.error("Error en cambio de estado de autenticación:", error);
  } finally {
    hideBootSpinner();
  }
});

function setHeaderUserEmail(email = "") {
  const el = document.getElementById("headerUserEmail");
  if (!el) return;
  const safeEmail = String(email || "").trim();
  el.textContent = safeEmail || "Sin sesión";
  el.setAttribute("title", safeEmail || "Usuario autenticado");
}

function applyTheme(theme = {}) {
  const root = document.documentElement;
  const bgStart = String(theme.bgStart || THEME_PRESETS.nebula.bgStart);
  const bgEnd = String(theme.bgEnd || THEME_PRESETS.nebula.bgEnd);
  const primary = String(theme.primary || THEME_PRESETS.nebula.primary);
  const accent = String(theme.accent || THEME_PRESETS.nebula.accent);
  root.style.setProperty("--er-page-bg", bgStart);
  root.style.setProperty("--er-page-bg-2", bgEnd);
  root.style.setProperty("--er-primary", primary);
  root.style.setProperty("--er-primary-3", accent);
  if (elements.themeBgStart) elements.themeBgStart.value = bgStart;
  if (elements.themeBgEnd) elements.themeBgEnd.value = bgEnd;
  if (elements.themePrimary) elements.themePrimary.value = primary;
  if (elements.themeAccent) elements.themeAccent.value = accent;
}

function saveTheme(theme = {}) {
  if (!isLocalStorageAvailable()) return;
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
}

function readThemeFromInputs() {
  return {
    bgStart: elements.themeBgStart?.value || THEME_PRESETS.nebula.bgStart,
    bgEnd: elements.themeBgEnd?.value || THEME_PRESETS.nebula.bgEnd,
    primary: elements.themePrimary?.value || THEME_PRESETS.nebula.primary,
    accent: elements.themeAccent?.value || THEME_PRESETS.nebula.accent
  };
}

function restoreTheme() {
  if (!isLocalStorageAvailable()) {
    applyTheme(THEME_PRESETS.nebula);
    return;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) || "null");
    applyTheme(parsed || THEME_PRESETS.nebula);
  } catch (_) {
    applyTheme(THEME_PRESETS.nebula);
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampUnit(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value = "", fallback = "#7c3aed") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  return fallback.toLowerCase();
}

function hexToRgb(hex = "#000000") {
  const normalized = normalizeHexColor(hex, "#000000").slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex({ r = 0, g = 0, b = 0 } = {}) {
  const toHex = (value) => Math.round(clampNumber(value, 0, 255, 0)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(colorA, colorB, weight = 0.5) {
  const left = hexToRgb(colorA);
  const right = hexToRgb(colorB);
  const ratio = clampUnit(weight);
  return rgbToHex({
    r: left.r + (right.r - left.r) * ratio,
    g: left.g + (right.g - left.g) * ratio,
    b: left.b + (right.b - left.b) * ratio
  });
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clampUnit(s);
  const light = clampUnit(l);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255
  };
}

function rgbToHsl({ r = 0, g = 0, b = 0 } = {}) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  const light = (max + min) / 2;
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  return { h: (hue + 360) % 360, s: sat, l: light };
}

function shiftHexColor(baseColor, { hue = 0, saturation = 0, lightness = 0 } = {}) {
  const hsl = rgbToHsl(hexToRgb(baseColor));
  return rgbToHex(hslToRgb(hsl.h + hue, clampUnit(hsl.s + saturation), clampUnit(hsl.l + lightness)));
}

function getPreviewPresetMeta(presetId = "") {
  return PREVIEW_THEME_PRESETS[presetId] || PREVIEW_THEME_PRESETS[PREVIEW_THEME_DEFAULT.presetId];
}

function derivePreviewPalette(presetId = PREVIEW_THEME_DEFAULT.presetId, baseColor = PREVIEW_THEME_DEFAULT.baseColor) {
  const preset = getPreviewPresetMeta(presetId);
  const base = normalizeHexColor(baseColor || preset.baseColor, preset.baseColor);
  const backgroundColor = mixHex(shiftHexColor(base, { saturation: -0.16, lightness: -0.34 }), "#05070d", 0.72);
  const cardColor = mixHex(backgroundColor, base, 0.14);
  const elevatedCardColor = mixHex(cardColor, "#ffffff", 0.06);
  const titleColor = mixHex(base, "#ffffff", 0.84);
  const subtitleColor = mixHex(base, "#ffffff", 0.68);
  const paragraphColor = mixHex(base, "#f8fafc", 0.54);
  const buttonColor = mixHex(base, "#ffffff", 0.08);
  const buttonTextColor = mixHex(base, "#ffffff", 0.9);
  return {
    backgroundColor,
    cardColor,
    elevatedCardColor,
    titleColor,
    subtitleColor,
    paragraphColor,
    buttonColor,
    buttonTextColor,
    accentColor: base,
    accentStrong: shiftHexColor(base, { saturation: 0.08, lightness: 0.1 }),
    accentSoft: mixHex(base, backgroundColor, 0.52),
    successColor: "#34d399",
    warningColor: "#f59e0b",
    dangerColor: "#fb7185"
  };
}

function normalizePreviewThemeConfig(theme = {}) {
  const presetId = PREVIEW_THEME_PRESETS[theme.presetId] ? theme.presetId : PREVIEW_THEME_DEFAULT.presetId;
  const baseColor = normalizeHexColor(theme.baseColor || getPreviewPresetMeta(presetId).baseColor, PREVIEW_THEME_DEFAULT.baseColor);
  const palette = derivePreviewPalette(presetId, baseColor);
  return {
    presetId,
    baseColor,
    cardRadius: clampNumber(theme.cardRadius, 0, 40, PREVIEW_THEME_DEFAULT.cardRadius),
    titleSize: clampNumber(theme.titleSize, 24, 72, PREVIEW_THEME_DEFAULT.titleSize),
    subtitleSize: clampNumber(theme.subtitleSize, 14, 40, PREVIEW_THEME_DEFAULT.subtitleSize),
    paragraphSize: clampNumber(theme.paragraphSize, 12, 28, PREVIEW_THEME_DEFAULT.paragraphSize),
    ...palette
  };
}

function savePreviewTheme(theme = {}) {
  if (!isLocalStorageAvailable()) return;
  window.localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, JSON.stringify(normalizePreviewThemeConfig(theme)));
}

function readPreviewThemeFromInputs() {
  return normalizePreviewThemeConfig({
    presetId: state.previewTheme?.presetId || PREVIEW_THEME_DEFAULT.presetId,
    baseColor: elements.previewBaseColor?.value,
    cardRadius: elements.previewCardRadius?.value,
    titleSize: state.previewTheme?.titleSize,
    subtitleSize: state.previewTheme?.subtitleSize,
    paragraphSize: state.previewTheme?.paragraphSize
  });
}

function syncPreviewThemeInputs(theme = {}) {
  const nextTheme = normalizePreviewThemeConfig(theme);
  if (elements.previewBaseColor) elements.previewBaseColor.value = nextTheme.baseColor;
  if (elements.previewCardRadius) elements.previewCardRadius.value = String(nextTheme.cardRadius);
  if (elements.previewThemeSummary) {
    const meta = getPreviewPresetMeta(nextTheme.presetId);
    elements.previewThemeSummary.textContent = `${meta.label} · ${meta.mood}`;
  }
  elements.previewThemePresetButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.previewThemePreset === nextTheme.presetId);
  });
}

function applyPreviewTheme(theme = {}, { persist = true, syncProject = true, refresh = true } = {}) {
  const nextTheme = normalizePreviewThemeConfig(theme);
  state.previewTheme = nextTheme;
  syncPreviewThemeInputs(nextTheme);
  if (syncProject && state.project && typeof state.project === "object") {
    state.project.themeConfig = { ...nextTheme };
  }
  if (persist) savePreviewTheme(nextTheme);
  if (refresh) scheduleOutputRefresh();
}

function restorePreviewTheme({ preferProject = true } = {}) {
  let candidate = null;
  if (preferProject && state.project?.themeConfig) {
    candidate = state.project.themeConfig;
  } else if (isLocalStorageAvailable()) {
    try {
      candidate = JSON.parse(window.localStorage.getItem(PREVIEW_THEME_STORAGE_KEY) || "null");
    } catch (_) {
      candidate = null;
    }
  }
  applyPreviewTheme(candidate || PREVIEW_THEME_DEFAULT, { persist: false, syncProject: Boolean(state.project), refresh: false });
}

function setRemoteSaveState(nextState = "idle", detail = "") {
  state.saveState = nextState;
  if (!elements.saveState) return;
  const labels = {
    idle: "Sin cambios remotos",
    saving: "Guardando...",
    saved: "Guardado",
    error: detail || "Error al guardar"
  };
  elements.saveState.textContent = labels[nextState] || labels.idle;
}

function setActiveSessionStorage(sessionId = "") {
  if (!isLocalStorageAvailable()) return;
  if (sessionId) {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
    return;
  }
  window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
}

function getStoredActiveSessionId() {
  if (!isLocalStorageAvailable()) return "";
  return String(window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || "").trim();
}

function deriveSessionTitle() {
  const projectTitle = normalizeString(state.project?.titulo, "");
  if (projectTitle) return projectTitle;
  const tema = normalizeString(document.getElementById("temaInput")?.value || "", "");
  if (tema) return `Escape Room: ${tema.split(/\r?\n/)[0].trim()}`;
  const objetivo = normalizeString(document.getElementById("objetivoInput")?.value || "", "");
  if (objetivo) return objetivo.slice(0, 60);
  return SESSION_TITLE_DEFAULT;
}

function sortSessions(items = []) {
  return [...items].sort((a, b) => {
    const aTime = Number(a.updatedAtMs || a.createdAtMs || 0);
    const bTime = Number(b.updatedAtMs || b.createdAtMs || 0);
    return bTime - aTime;
  });
}

function serializeFormState() {
  if (!elements.form) return {};
  const formState = {};
  elements.form.querySelectorAll("input, select, textarea").forEach((field) => {
    if (!field.id) return;
    if (field.type === "button" || field.type === "submit" || field.type === "reset") return;
    formState[field.id] = field.value;
  });
  if (elements.modeloSelect?.id) {
    formState[elements.modeloSelect.id] = elements.modeloSelect.value;
  }
  return formState;
}

function applyFormState(formState = {}) {
  if (!elements.form || !formState || typeof formState !== "object") return;
  state.formPersistenceSuspended = true;
  try {
    Object.entries(formState).forEach(([fieldId, value]) => {
      const field = document.getElementById(fieldId);
      if (field) field.value = value;
    });
  } finally {
    state.formPersistenceSuspended = false;
  }
  syncNarrativaCustomField();
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapSessionDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ownerId: String(data.ownerId || ""),
    ownerEmail: String(data.ownerEmail || ""),
    title: normalizeString(data.title, SESSION_TITLE_DEFAULT),
    status: normalizeString(data.status, "draft"),
    formState: data.formState && typeof data.formState === "object" ? data.formState : {},
    project: data.project && typeof data.project === "object" ? data.project : null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt)
  };
}

async function fetchRemoteSessions(uid) {
  const baseRef = collection(db, ESCAPE_ROOM_COLLECTION);
  try {
    const snapshot = await getDocs(query(baseRef, where("ownerId", "==", uid), orderBy("updatedAt", "desc")));
    return sortSessions(snapshot.docs.map(mapSessionDoc));
  } catch (error) {
    const snapshot = await getDocs(query(baseRef, where("ownerId", "==", uid)));
    return sortSessions(snapshot.docs.map(mapSessionDoc));
  }
}

function buildSessionPayload({ title, status = "draft", project, formState } = {}) {
  return {
    ownerId: state.currentUser?.uid || "",
    ownerEmail: state.currentUser?.email || "",
    title: normalizeString(title, deriveSessionTitle()),
    status,
    formState: formState || serializeFormState(),
    project: project ?? (state.project ? materializeProjectForExport() : null)
  };
}

function resetEditorState({ preserveForm = false } = {}) {
  if (!preserveForm) {
    state.formPersistenceSuspended = true;
    try {
      elements.form?.reset();
      document.getElementById("duracionInput").value = 35;
      document.getElementById("numMisionesInput").value = 4;
      document.getElementById("preguntasPorSalaInput").value = 1;
      document.getElementById("ritmoSelect").value = "progresivo";
      document.getElementById("dificultadSelect").value = "equilibrada";
      document.getElementById("pistasSelect").value = "moderadas";
      if (elements.modeloSelect) elements.modeloSelect.value = TEXT_MODEL_DEFAULT;
    } finally {
      state.formPersistenceSuspended = false;
    }
    syncNarrativaCustomField();
  }
  state.project = null;
  state.generationNote = "";
  elements.jsonPreview.textContent = "";
  elements.previewFrame?.removeAttribute("srcdoc");
  renderMissionEditor();
  renderOutputsNow();
}

function renderSessionList() {
  if (!elements.sessionList || !elements.sessionsLoading || !elements.sessionsEmpty) return;
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  elements.sessionsLoading.classList.toggle("hidden", !state.sessionsLoading);
  elements.sessionsEmpty.classList.toggle("hidden", state.sessionsLoading || sessions.length > 0);
  elements.sessionList.classList.toggle("hidden", state.sessionsLoading || sessions.length === 0);
  if (state.activeSessionName) {
    state.activeSessionName.textContent = state.activeSessionId
      ? (deriveSessionTitle() || state.activeSessionMeta?.title || SESSION_TITLE_DEFAULT)
      : "Sin sesión activa";
  }
  if (state.sessionsLoading || sessions.length === 0) {
    elements.sessionList.innerHTML = "";
    return;
  }
  elements.sessionList.innerHTML = sessions.map((session) => `
    <article class="er-session-item ${session.id === state.activeSessionId ? "is-active" : ""}" data-session-id="${escapeHtmlAttr(session.id)}">
      <div class="er-session-item-head">
        <div>
          <h3 class="er-session-item-title">${escapeHtml(session.title || SESSION_TITLE_DEFAULT)}</h3>
          <div class="er-session-item-meta">${escapeHtml(session.status || "draft")}</div>
        </div>
        ${session.id === state.activeSessionId ? '<span class="er-badge">Activa</span>' : ""}
      </div>
      <div class="er-session-item-actions">
        <button type="button" class="er-button er-button-secondary er-button-mini er-session-open" data-session-action="open" data-session-id="${escapeHtmlAttr(session.id)}">
          <i class="fas fa-folder-open"></i>
          <span>Abrir</span>
        </button>
        <button type="button" class="er-session-action" title="Renombrar" aria-label="Renombrar sesión" data-session-action="rename" data-session-id="${escapeHtmlAttr(session.id)}">
          <i class="fas fa-pen"></i>
        </button>
        <button type="button" class="er-session-action" title="Eliminar" aria-label="Eliminar sesión" data-session-action="delete" data-session-id="${escapeHtmlAttr(session.id)}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </article>
  `).join("");
}

async function loadSessionIntoEditor(session) {
  state.isHydratingFromRemote = true;
  try {
    resetEditorState({ preserveForm: false });
    applyFormState(session.formState || {});
    state.project = session.project ? withDefaultRoutes(session.project) : null;
    restorePreviewTheme({ preferProject: true });
    state.generationNote = "";
    state.activeSessionId = session.id;
    state.activeSessionMeta = {
      id: session.id,
      title: session.title || SESSION_TITLE_DEFAULT,
      status: session.status || "draft"
    };
    setActiveSessionStorage(session.id);
    renderMissionEditor();
    renderOutputsNow();
    setActiveTab(state.activeTab || "preview");
    setRemoteSaveState("saved");
  } finally {
    state.isHydratingFromRemote = false;
  }
  renderSessionList();
}

async function loadSessionsFromFirebase({ preferredSessionId = "" } = {}) {
  if (!state.currentUser?.uid) return;
  state.sessionsLoading = true;
  renderSessionList();
  try {
    state.sessions = await fetchRemoteSessions(state.currentUser.uid);
    state.sessionsLoading = false;
    const sessionId = preferredSessionId || state.activeSessionId || getStoredActiveSessionId();
    const toLoad = state.sessions.find((session) => session.id === sessionId) || state.sessions[0] || null;
    if (toLoad) {
      await loadSessionIntoEditor(toLoad);
    } else {
      state.activeSessionId = "";
      state.activeSessionMeta = null;
      setActiveSessionStorage("");
      renderSessionList();
      setRemoteSaveState("idle");
    }
  } catch (error) {
    state.sessionsLoading = false;
    renderSessionList();
    setRemoteSaveState("error", "Error al cargar sesiones");
    setStatus("No fue posible cargar las sesiones de Firebase.", "bad");
  }
}

async function createRemoteSession({ title, project = null, formState = null, activate = true } = {}) {
  const payload = buildSessionPayload({ title, project, formState });
  const docRef = await addDoc(collection(db, ESCAPE_ROOM_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await loadSessionsFromFirebase({ preferredSessionId: activate ? docRef.id : state.activeSessionId });
  return docRef.id;
}

async function uploadImageIfDataUrl(value, path) {
  if (!isDataUrl(value)) return value;
  if (!state.currentUser?.uid) return value;
  try {
    const storageInstance = getStorage(app);
    const refInstance = storageRef(storageInstance, path);
    const mimeMatch = value.match(/^data:([^;]+);/);
    const contentType = mimeMatch ? mimeMatch[1] : "image/png";
    await uploadString(refInstance, value, "data_url", { contentType });
    return await getDownloadURL(refInstance);
  } catch (error) {
    console.warn("No se pudo subir la imagen a Firebase Storage:", error);
    return value;
  }
}

async function uploadProjectImagesToFirebaseStorage(sessionId) {
  if (!state.project || !state.currentUser?.uid || !sessionId) return;
  const uid = state.currentUser.uid;
  const project = state.project;

  // 1. Cover Image
  if (project.backgroundImage && isDataUrl(project.backgroundImage)) {
    const downloadUrl = await uploadImageIfDataUrl(project.backgroundImage, `escaperooms/${uid}/${sessionId}/cover.png`);
    if (downloadUrl) project.backgroundImage = downloadUrl;
  }

  // 2. Mission Images
  if (Array.isArray(project.misiones)) {
    for (const [index, mission] of project.misiones.entries()) {
      if (mission.imagen && isDataUrl(mission.imagen)) {
        const downloadUrl = await uploadImageIfDataUrl(mission.imagen, `escaperooms/${uid}/${sessionId}/mission_${index}_${Date.now()}.png`);
        if (downloadUrl) {
          mission.imagen = downloadUrl;
          if (mission.media && mission.media.tipo === "imagen") {
            mission.media.url = downloadUrl;
          }
        }
      }
      if (mission.media?.url && isDataUrl(mission.media.url)) {
        const downloadUrl = await uploadImageIfDataUrl(mission.media.url, `escaperooms/${uid}/${sessionId}/mission_media_${index}_${Date.now()}.png`);
        if (downloadUrl) mission.media.url = downloadUrl;
      }

      // 3. Question Images
      if (Array.isArray(mission.preguntas)) {
        for (const [questionIndex, question] of mission.preguntas.entries()) {
          if (question.imagen && isDataUrl(question.imagen)) {
            const downloadUrl = await uploadImageIfDataUrl(question.imagen, `escaperooms/${uid}/${sessionId}/question_${index}_${questionIndex}_${Date.now()}.png`);
            if (downloadUrl) {
              question.imagen = downloadUrl;
              if (question.media && question.media.tipo === "imagen") {
                question.media.url = downloadUrl;
              }
            }
          }
          if (question.media?.url && isDataUrl(question.media.url)) {
            const downloadUrl = await uploadImageIfDataUrl(question.media.url, `escaperooms/${uid}/${sessionId}/question_media_${index}_${questionIndex}_${Date.now()}.png`);
            if (downloadUrl) question.media.url = downloadUrl;
          }
        }
      }
    }
  }
}

async function ensureActiveRemoteSession() {
  if (state.activeSessionId) return state.activeSessionId;
  if (!state.currentUser?.uid) return "";
  const strippedProject = state.project ? stripHeavyAssetsFromProject(state.project) : null;
  const sessionId = await createRemoteSession({
    title: deriveSessionTitle(),
    project: strippedProject,
    formState: serializeFormState(),
    activate: true
  });
  return sessionId;
}

async function persistActiveSession() {
  if (state.isHydratingFromRemote || state.suspendSessionSave || !state.currentUser?.uid) return;
  try {
    setRemoteSaveState("saving");
    const sessionId = await ensureActiveRemoteSession();
    if (!sessionId) return;

    // Subir imágenes pesadas a Storage y reemplazarlas en el estado local con URLs HTTPS
    await uploadProjectImagesToFirebaseStorage(sessionId);

    const payload = buildSessionPayload({
      title: deriveSessionTitle(),
      project: state.project ? materializeProjectForExport() : null,
      formState: serializeFormState()
    });
    await updateDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId), {
      ...payload,
      updatedAt: serverTimestamp()
    });
    const nextTitle = payload.title || SESSION_TITLE_DEFAULT;
    state.sessions = sortSessions(state.sessions.map((session) => (
      session.id === sessionId
        ? { ...session, ...payload, title: nextTitle, updatedAtMs: Date.now() }
        : session
    )));
    state.activeSessionMeta = {
      id: sessionId,
      title: nextTitle,
      status: payload.status || "draft"
    };
    renderSessionList();
    setRemoteSaveState("saved");
  } catch (error) {
    console.error("No se pudo guardar la sesión activa:", error);
    setRemoteSaveState("error", "Error al guardar");
    setStatus("No se pudo guardar la sesión en Firebase.", "bad");
  }
}

async function updateActiveSessionMetadata(payload = {}) {
  const sessionId = await ensureActiveRemoteSession();
  if (!sessionId) {
    throw new Error("No hay sesión activa para sincronizar.");
  }

  await uploadProjectImagesToFirebaseStorage(sessionId);

  const sessionPayload = buildSessionPayload({
    title: deriveSessionTitle(),
    status: payload.status || state.activeSessionMeta?.status || "draft",
    project: state.project ? materializeProjectForExport() : null,
    formState: serializeFormState()
  });
  await updateDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId), {
    ...sessionPayload,
    updatedAt: serverTimestamp()
  });

  const nextTitle = sessionPayload.title || SESSION_TITLE_DEFAULT;
  state.sessions = sortSessions(state.sessions.map((session) => (
    session.id === sessionId
      ? { ...session, ...sessionPayload, title: nextTitle, updatedAtMs: Date.now() }
      : session
  )));
  state.activeSessionId = sessionId;
  state.activeSessionMeta = {
    id: sessionId,
    title: nextTitle,
    status: sessionPayload.status || "draft"
  };
  renderSessionList();
  return sessionId;
}

async function publishActiveSession() {
  if (!state.project) {
    setStatus("Genera o carga un escape room antes de publicarlo.", "warning");
    return;
  }

  try {
    setRemoteSaveState("saving");
    setLoading(true);
    await updateActiveSessionMetadata({ status: "published" });
    setRemoteSaveState("saved");
    setStatus("Sesión publicada y sincronizada con Firebase.", "success");
  } catch (error) {
    console.error("No se pudo publicar la sesión:", error);
    setRemoteSaveState("error", "Error al publicar");
    setStatus("No fue posible publicar la sesión.", "bad");
  } finally {
    setLoading(false);
    refreshPanels();
  }
}

function scheduleSessionSave() {
  if (state.isHydratingFromRemote || state.suspendSessionSave || !state.currentUser?.uid) return;
  if (state.sessionSaveHandle) window.clearTimeout(state.sessionSaveHandle);
  state.sessionSaveHandle = window.setTimeout(() => {
    state.sessionSaveHandle = null;
    void persistActiveSession();
  }, 550);
}

async function renameSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const nextTitle = window.prompt("Nuevo nombre de la sesión", session.title || SESSION_TITLE_DEFAULT);
  if (nextTitle === null) return;
  const safeTitle = normalizeString(nextTitle, "").trim();
  if (!safeTitle) return;
  try {
    await updateDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId), {
      title: safeTitle,
      updatedAt: serverTimestamp()
    });
    state.sessions = sortSessions(state.sessions.map((item) => (
      item.id === sessionId ? { ...item, title: safeTitle, updatedAtMs: Date.now() } : item
    )));
    if (state.activeSessionId === sessionId) {
      state.activeSessionMeta = {
        ...(state.activeSessionMeta || { id: sessionId, status: "draft" }),
        title: safeTitle
      };
    }
    renderSessionList();
    setStatus("Sesión renombrada.", "success");
  } catch (error) {
    console.error("No se pudo renombrar la sesión:", error);
    setStatus("No fue posible renombrar la sesión.", "bad");
  }
}

async function deleteSessionById(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const confirmed = window.confirm(`Eliminar la sesión "${session.title || SESSION_TITLE_DEFAULT}"?`);
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId));
    state.sessions = state.sessions.filter((item) => item.id !== sessionId);
    const wasActive = state.activeSessionId === sessionId;
    if (wasActive) {
      state.activeSessionId = "";
      state.activeSessionMeta = null;
      setActiveSessionStorage("");
      state.suspendSessionSave = true;
      try {
        if (!state.sessions.length) {
          resetEditorState({ preserveForm: false });
        }
      } finally {
        state.suspendSessionSave = false;
      }
    }
    renderSessionList();
    if (wasActive && state.sessions.length) {
      await loadSessionIntoEditor(state.sessions[0]);
    }
    setStatus("Sesión eliminada.", "success");
  } catch (error) {
    console.error("No se pudo eliminar la sesión:", error);
    setStatus("No fue posible eliminar la sesión.", "bad");
  }
}

function isLocalStorageAvailable() {
  try {
    const key = "__er_creator_test__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
}

function parseTopicLines(value = "") {
  return String(value)
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function saveFormState() {
  if (!elements.form || state.formPersistenceSuspended || !isLocalStorageAvailable()) return;
  try {
    const formState = serializeFormState();
    window.localStorage.removeItem(FORM_STORAGE_KEY);
    window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formState));
  } catch (error) {
    const isQuota = error?.name === "QuotaExceededError" || String(error?.message || "").toLowerCase().includes("quota");
    if (!isQuota) {
      console.warn("No se pudo guardar el estado del formulario:", error);
    }
  }
  scheduleSessionSave();
}

function restoreFormState() {
  if (!elements.form || !isLocalStorageAvailable()) return;
  const rawState = window.localStorage.getItem(FORM_STORAGE_KEY);
  if (!rawState) return;
  try {
    const formState = JSON.parse(rawState);
    applyFormState(formState);
  } catch (error) {
    console.warn("No se pudo restaurar el formulario:", error);
  }
}

function clearFormState() {
  if (!isLocalStorageAvailable()) return;
  window.localStorage.removeItem(FORM_STORAGE_KEY);
}

function isDataUrl(value = "") {
  return /^data:/i.test(String(value || "").trim());
}

function containsEmbeddedDataUrl(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? isDataUrl(value) : false;
  }

  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((entry) => containsEmbeddedDataUrl(entry, seen));
  }

  return Object.values(value).some((entry) => containsEmbeddedDataUrl(entry, seen));
}

function clonePlainObject(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (error) {
      // Fallback below.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function stripHeavyAssetsFromProject(project) {
  if (!project || typeof project !== "object") return project;
  const stripped = clonePlainObject(project);

  if (isDataUrl(stripped.backgroundImage)) {
    stripped.backgroundImage = "";
  }

  if (Array.isArray(stripped.misiones)) {
    stripped.misiones = stripped.misiones.map((mission) => {
      if (!mission || typeof mission !== "object") return mission;

      if (isDataUrl(mission.imagen)) {
        mission.imagen = "";
      }

      if (mission.media && typeof mission.media === "object") {
        if (isDataUrl(mission.media.url)) {
          mission.media.url = "";
        }
        if (!mission.media.url && !mission.media.alt && !mission.media.texto && !mission.media.titulo) {
          mission.media = null;
        }
      }

      if (Array.isArray(mission.preguntas)) {
        mission.preguntas = mission.preguntas.map((question) => {
          if (!question || typeof question !== "object") return question;

          if (isDataUrl(question.imagen)) {
            question.imagen = "";
          }

          if (question.media && typeof question.media === "object") {
            if (isDataUrl(question.media.url)) {
              question.media.url = "";
            }
            if (!question.media.url && !question.media.alt && !question.media.texto && !question.media.titulo) {
              question.media = null;
            }
          }

          return question;
        });
      }

      return mission;
    });
  }

  return stripped;
}

function saveProjectState() {
  if (!state.project || state.formPersistenceSuspended || !isLocalStorageAvailable()) return;
  try {
    const projectToStore = containsEmbeddedDataUrl(state.project)
      ? stripHeavyAssetsFromProject(state.project)
      : state.project;
    window.localStorage.removeItem(PROJECT_STORAGE_KEY);
    window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projectToStore));
    if (projectToStore !== state.project && !state.projectStorageNoticeShown) {
      state.projectStorageNoticeShown = true;
      setStatus("El proyecto se guardó sin imágenes embebidas para no superar el límite del navegador.", "warning");
    }
  } catch (error) {
    const quotaExceeded = error?.name === "QuotaExceededError" || String(error?.message || "").toLowerCase().includes("quota");
    if (!quotaExceeded) {
      console.warn("No se pudo guardar el proyecto del creador:", error);
      return;
    }

    try {
      const lightweightProject = stripHeavyAssetsFromProject(state.project);
      window.localStorage.removeItem(PROJECT_STORAGE_KEY);
      window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(lightweightProject));
      if (!state.projectStorageNoticeShown) {
        state.projectStorageNoticeShown = true;
        console.warn("El proyecto excedía la cuota del navegador; se guardó sin imágenes embebidas.");
        setStatus("El proyecto se guardó sin imágenes embebidas para no superar el límite del navegador.", "warning");
      }
    } catch (lightweightError) {
      const isQuota = lightweightError?.name === "QuotaExceededError" || String(lightweightError?.message || "").toLowerCase().includes("quota");
      if (!isQuota) {
        console.warn("No se pudo guardar ni la versión ligera del proyecto:", lightweightError);
      }
      setStatus("El proyecto excede la cuota de almacenamiento del navegador.", "bad");
    }
  }
}

function restoreProjectState() {
  if (!isLocalStorageAvailable()) return;
  const rawState = window.localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!rawState) return;
  try {
    const parsed = JSON.parse(rawState);
    state.project = withDefaultRoutes(parsed);
  } catch (error) {
    console.warn("No se pudo restaurar el proyecto del creador:", error);
  }
}

function clearProjectState() {
  if (!isLocalStorageAvailable()) return;
  window.localStorage.removeItem(PROJECT_STORAGE_KEY);
}

function syncNarrativaCustomField() {
  const isCustom = elements.narrativaSelect?.value === "otro";
  elements.narrativaCustomField?.classList.toggle("hidden", !isCustom);
  if (elements.narrativaCustomInput) elements.narrativaCustomInput.required = Boolean(isCustom);
}

function setStatus(message = "", type = "info") {
  if (!elements.statusBanner) return;
  if (!message) {
    elements.statusBanner.className = "er-status-banner hidden";
    elements.statusBanner.textContent = "";
    return;
  }
  elements.statusBanner.className = `er-status-banner is-${type}`;
  elements.statusBanner.textContent = message;
}

function isPublishedSession() {
  return normalizeString(state.activeSessionMeta?.status, "draft") === "published";
}

function syncActionButtons() {
  const hasData = Boolean(state.project);
  const canPublish = Boolean(state.currentUser?.uid) && hasData && !state.isGenerating;

  elements.btnGenerar.disabled = state.isLoading;
  elements.btnLimpiar.disabled = state.isLoading;
  elements.btnAddMission.disabled = state.isLoading;
  elements.btnExportar.disabled = state.isLoading || !hasData || state.isGenerating;
  elements.btnCopiarJson.disabled = state.isLoading || !hasData || state.isGenerating;

  if (elements.btnPublicar) {
    elements.btnPublicar.disabled = state.isLoading || !canPublish;
    elements.btnPublicar.classList.toggle("is-published", isPublishedSession());
    elements.btnPublicar.innerHTML = isPublishedSession()
      ? '<i class="fas fa-rotate"></i><span>Actualizar publicación</span>'
      : '<i class="fas fa-globe"></i><span>Publicar</span>';
  }
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  syncActionButtons();
  elements.loading.classList.toggle("hidden", !isLoading);
}

function setActiveTab(tabName = "preview") {
  state.activeTab = tabName;
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.erTab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  refreshPanels();
}

function refreshPanels() {
  const hasData = Boolean(state.project);
  const showPreview = (hasData || state.isGenerating) && state.activeTab === "preview";
  elements.emptyState.classList.toggle("hidden", hasData || state.isGenerating);
  elements.previewPanel.classList.toggle("hidden", !showPreview);
  elements.resultadoContainer.classList.toggle("hidden", !hasData || state.activeTab !== "json");
  elements.missionEmpty.classList.toggle("hidden", hasData && state.project.misiones.length > 0);
  syncActionButtons();

  if (elements.previewSpinner) {
    elements.previewSpinner.classList.toggle("hidden", !state.isGenerating);
  }
}

function getFormData() {
  const temaLines = parseTopicLines(document.getElementById("temaInput")?.value || "");
  const narrativaBase = elements.narrativaSelect?.value || "";
  const narrativaPersonalizada = String(elements.narrativaCustomInput?.value || "").trim();
  const narrativa = narrativaBase === "otro" ? (narrativaPersonalizada || "Otro") : narrativaBase;
  const estiloImagen = String(elements.estiloImagenSelect?.value || "").trim();
  return {
    nivel: document.getElementById("nivelSelect")?.value || "Primaria",
    grado: document.getElementById("gradoSelect")?.value || "Primero",
    publico: document.getElementById("publicoSelect")?.value || "Grupo completo",
    duracion: Number(document.getElementById("duracionInput")?.value || 35),
    tema: temaLines.join(" / "),
    temaPrincipal: temaLines[0] || "",
    temas: temaLines,
    misiones: Number(document.getElementById("numMisionesInput")?.value || 4),
    preguntasPorSala: Number(document.getElementById("preguntasPorSalaInput")?.value || 1),
    modelo: ALLOWED_TEXT_MODELS.has(String(elements.modeloSelect?.value || "").trim())
      ? String(elements.modeloSelect?.value || TEXT_MODEL_DEFAULT).trim()
      : TEXT_MODEL_DEFAULT,
    narrativa,
    narrativaBase,
    narrativaPersonalizada,
    estiloImagen,
    ritmo: document.getElementById("ritmoSelect")?.value || "progresivo",
    dificultad: document.getElementById("dificultadSelect")?.value || "equilibrada",
    pistas: document.getElementById("pistasSelect")?.value || "moderadas",
    objetivo: String(document.getElementById("objetivoInput")?.value || "").trim()
  };
}

function buildPrompt(data) {
  const temas = Array.isArray(data.temas) ? data.temas : [];
  const objetivosTematicos = temas.length ? temas.map((tema) => `- ${tema}`).join("\n") : `- ${data.tema}`;
  const objetivoFinal = data.objetivo || `Guiar al alumnado a completar el escape room sobre ${data.tema}`;
  const narrativaEtiqueta = data.narrativaBase === "otro"
    ? `Otra narrativa: ${data.narrativaPersonalizada || "personalizada"}`
    : data.narrativa;

  return `
Eres un experto en gamificación, narrativa educativa y diseño de escape rooms profesionales.
Responde únicamente con JSON válido.
Escribe todo en español latinoamericano neutral (es-419), sin modismos de España.
Diseña una experiencia para alumnado de ${data.grado} de ${data.nivel}.

Brief:
- Tema curricular principal: ${data.temaPrincipal || data.tema}
- Temas o subtemas clave:
${objetivosTematicos}
- Audiencia: ${data.publico}
- Duración estimada: ${data.duracion} minutos
- Cantidad exacta de misiones/salas: ${data.misiones}
- La lista "misiones" debe contener exactamente ${data.misiones} elementos.
- No agregues, omitas ni combines salas.
- Preguntas internas por sala: ${data.preguntasPorSala}
- Estilo narrativo: ${narrativaEtiqueta}
- Ritmo: ${data.ritmo}
- Dificultad: ${data.dificultad}
- Pistas: ${data.pistas}
- Objetivo final: ${objetivoFinal}
- Elementos base: narrativa inicial, objetivo claro, reglas implícitas, pistas graduales, retos encadenados, progreso visible, ambientación coherente, clímax y cierre satisfactorio.
- Variedad de interacción: mezcla texto, opción múltiple, relación de columnas y multimedia.
- En los retos de texto, usa subtipos variados: palabra, letra, numero, codigo_corto y frase_corta cuando convenga.
- Para opción múltiple incluye 3 a 5 opciones plausibles y solo una correcta.
- En opción múltiple, la respuesta correcta debe coincidir exactamente con una de las opciones.
- Para relación de columnas incluye 3 o 4 pares claros.
- Para multimedia incluye media con tipo, url o referencia, y alt.
- CRÍTICO PARA IMÁGENES COHERENTES Y DE APOYO: En cada pregunta (especialmente las multimedia o con "imagen_prompt"), describe con detalle minucioso los elementos visuales necesarios. Si la pregunta menciona mapas, leyendas, coordenadas, nombres o puntos específicos en una imagen (ej. "el Río Amazonas", "la zona verde oscuro"), la propiedad "imagen_prompt" y el "alt" de la pregunta DEBEN detallar exhaustivamente dichos elementos visuales, nombres y coordenadas exactas para que la IA generadora de imágenes los dibuje en la imagen correspondiente y no queden incoherentes. La imagen debe servir como apoyo visual o pista para resolver el ejercicio, pero bajo ninguna circunstancia debe contener o mostrar explícitamente la respuesta del reto.
- Cada sala del mapa debe incluir una lista "preguntas" con exactamente ${data.preguntasPorSala} preguntas internas.
- Las preguntas internas de una misma sala pueden resolverse en cualquier orden.
- Cada pregunta interna debe tener su propio "tipo_interaccion", "reto", "respuesta_correcta" o estructura equivalente, y feedback no vacío.
- Cada sala debe declarar qué otras salas desbloquea al resolverse. Usa una estructura simple de mapa libre.
- No dejes respuestas vacías ni feedback vacío; cada sala y cada pregunta debe poder validarse de forma inequívoca.

Devuelve SOLO un JSON con esta estructura:
{
  "titulo": "Nombre creativo y memorable",
  "subtitulo": "Gancho breve",
  "introduccion": "Apertura narrativa",
  "ambientacion": "Descripción del mundo visual",
  "linea_visual_base": "Dirección visual consistente",
  "misiones": [
    {
      "id": "m1",
      "release": "SALA 01",
      "titulo": "Sala 01",
      "historia": "Texto inmersivo",
      "reto": "Descripción de la sala",
      "preguntas": [
        {
          "id": "q1",
          "titulo": "Pregunta 1",
          "reto": "Desafío interno",
          "tipo_interaccion": "texto | opcion_multiple | relacion_columnas | multimedia",
          "subtipo_respuesta": "palabra | letra | numero | codigo_corto | frase_corta",
          "respuesta_correcta": "respuesta corta",
          "respuestas_aceptadas": ["respuesta corta", "variantes"],
          "opciones": ["Opción A", "Opción B", "Opción C"],
          "parejas": [{ "izquierda": "Elemento 1", "derecha": "Respuesta 1" }],
          "media": { "tipo": "imagen | audio | video", "url": "URL o data", "alt": "Texto alternativo" },
          "pista": "Pista sutil",
          "retroalimentacion_correcta": "Mensaje de éxito",
          "retroalimentacion_incorrecta": "Mensaje de error",
          "imagen_prompt": "Descripción visual opcional",
          "imagen_alt": "Descripción breve accesible",
          "imagen": ""
        }
      ],
      "desbloquea": ["m2"],
      "bloqueada_inicial": false
    }
  ],
  "conclusion": "Cierre satisfactorio"
}`.trim();
}

function extractGeneratedJson(rawText = "") {
  const cleaned = String(rawText).replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  }
  throw new Error("No se pudo interpretar el JSON devuelto por la IA.");
}

function extractGeminiImageData(imageData = {}) {
  const parts = imageData?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    const mime = String(inline?.mimeType || inline?.mime_type || "").trim();
    const base64 = String(inline?.data || "").trim();
    if (mime && base64 && /^image\//i.test(mime)) {
      return `data:${mime};base64,${base64}`;
    }
  }
  throw new Error("No se recibió una imagen válida.");
}

function buildVisualDirection(data = {}) {
  const temas = Array.isArray(data.temas) ? data.temas.filter(Boolean) : [];
  const temaResumen = temas.length ? temas.join(", ") : normalizeString(data.tema, "la temática principal");
  // Prioridad: 1) estilo elegido por el usuario en el brief, 2) linea_visual_base generada por la IA, 3) fallback genérico
  const estiloUsuario = normalizeString(data.estiloImagen, "");
  const estiloIA = normalizeString(data.linea_visual_base, "");
  const narrativaCtx = normalizeString(data.narrativa, "la narrativa del escape room");
  const line = estiloUsuario
    ? `${estiloUsuario} La dirección visual debe ser coherente con: ${narrativaCtx}.`
    : (estiloIA || `Ilustración editorial coherente con ${narrativaCtx}.`);
  return {
    temaResumen,
    line,
    ambientacion: normalizeString(data.ambientacion, "")
  };
}

function buildCoverVisualPrompt(data = {}) {
  const visual = buildVisualDirection(data);
  return [
    `Portada representativa del escape room ${normalizeString(data.titulo, "")}.`,
    `Tema principal: ${visual.temaResumen}.`,
    `Dirección visual: ${visual.line}.`,
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    "Sin texto legible, sin marcas de agua, acabado profesional."
  ].filter(Boolean).join("\n");
}

function buildRoomVisualPrompt({ data, mission, index }) {
  const visual = buildVisualDirection(data);
  return [
    `Escena funcional para la sala ${index + 1} (${normalizeString(mission.titulo, `Sala ${String(index + 1).padStart(2, "0")}`)}).`,
    `Tema principal: ${visual.temaResumen}.`,
    `Dirección visual: ${visual.line}.`,
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    `La imagen debe apoyar el reto: ${normalizeString(mission.reto, "Resolver la sala.")}`,
    `REGLA ESTRICTA: La imagen es un apoyo visual o pista para que el estudiante resuelva el reto. Bajo ninguna circunstancia muestres o escribas la respuesta correcta o solución final directamente sobre el dibujo.`,
    normalizeString(mission.imagen_prompt, "") || "Sin texto legible y útil para resolver la sala."
  ].filter(Boolean).join("\n");
}

function buildQuestionVisualPrompt({ data, mission, question, roomIndex, questionIndex }) {
  const visual = buildVisualDirection(data);
  return [
    `Escena funcional para la pregunta ${questionIndex + 1} de la sala ${roomIndex + 1} (${normalizeString(mission.titulo, `Sala ${String(roomIndex + 1).padStart(2, "0")}`)}).`,
    `Pregunta interna: ${normalizeString(question.titulo, `Pregunta ${questionIndex + 1}`)}.`,
    `Tema principal: ${visual.temaResumen}.`,
    `Dirección visual: ${visual.line}.`,
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    `La imagen debe apoyar el reto: ${normalizeString(question.reto, "Resolver la pregunta.")}`,
    `REGLA ESTRICTA: La imagen es un apoyo visual o pista para resolver el ejercicio. Bajo ninguna circunstancia muestres, dibujes o escribas la respuesta correcta o el valor de la solución final de forma explícita en la imagen. La solución debe quedar oculta para que el estudiante la deduzca.`,
    normalizeString(question.imagen_prompt, "") || normalizeString(question.media?.texto || question.media?.alt, "") || "Sin texto legible y útil para resolver la pregunta."
  ].filter(Boolean).join("\n");
}

async function generateGeminiImage(prompt, { aspectRatio = "16:9", imageSize = "1K", temperature = 0.58 } = {}) {
  const imageData = await authFetchJson("/api/gemini/generate", {
    method: "POST",
    body: {
      model: IMAGE_MODEL,
      payload: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio, imageSize },
          temperature
        }
      }
    }
  });
  return extractGeminiImageData(imageData);
}

async function generateCoverImage(project, context) {
  try {
    return await generateGeminiImage(buildCoverVisualPrompt({ ...project, ...context }), { aspectRatio: "16:9" });
  } catch (error) {
    console.warn("No se pudo generar la portada:", error);
    return "";
  }
}
async function generateMissionImages(project, context, onProgress) {
  let generated = 0;
  let failed = 0;
  let total = 0;

  // Calcular total de imágenes a generar de antemano
  for (const [index, mission] of project.misiones.entries()) {
    total += 1;
    for (const [questionIndex, question] of (Array.isArray(mission.preguntas) ? mission.preguntas.entries() : [])) {
      if (!question) continue;
      const hasMedia = question.media && (question.media.tipo === "imagen" || !question.media.tipo);
      const needsImage = question.tipo_interaccion === "multimedia" || question.imagen_prompt || question.imagen || hasMedia;
      if (!needsImage) continue;
      total += 1;
    }
  }

  let processed = 0;

  for (const [index, mission] of project.misiones.entries()) {
    processed += 1;
    if (onProgress) onProgress(processed, total);

    try {
      const image = await generateGeminiImage(buildRoomVisualPrompt({ data: { ...project, ...context }, mission, index }), { aspectRatio: "4:3" });
      mission.imagen = image;
      mission.imagen_alt = mission.imagen_alt || mission.media?.alt || `Imagen de la sala ${index + 1}`;
      if (mission.media) {
        mission.media.url = image;
        if (!mission.media.tipo) mission.media.tipo = "imagen";
      } else {
        mission.media = {
          tipo: "imagen",
          url: image,
          alt: mission.imagen_alt,
          titulo: mission.titulo,
          texto: ""
        };
      }
      generated += 1;
    } catch (error) {
      console.warn(`No se pudo generar la imagen de la sala ${index + 1}:`, error);
      failed += 1;
    }

    for (const [questionIndex, question] of (Array.isArray(mission.preguntas) ? mission.preguntas.entries() : [])) {
      if (!question) continue;
      const hasMedia = question.media && (question.media.tipo === "imagen" || !question.media.tipo);
      const needsImage = question.tipo_interaccion === "multimedia" || question.imagen_prompt || question.imagen || hasMedia;
      if (!needsImage) continue;

      processed += 1;
      if (onProgress) onProgress(processed, total);

      try {
        const image = await generateGeminiImage(buildQuestionVisualPrompt({ data: { ...project, ...context }, mission, question, roomIndex: index, questionIndex }), { aspectRatio: "4:3" });
        question.imagen = image;
        question.imagen_alt = question.imagen_alt || question.media?.alt || `Imagen de la pregunta ${questionIndex + 1}`;
        if (question.media) {
          question.media.url = image;
          if (!question.media.tipo) question.media.tipo = "imagen";
        } else {
          question.media = {
            tipo: "imagen",
            url: image,
            alt: question.imagen_alt,
            titulo: question.titulo,
            texto: ""
          };
        }
        generated += 1;
      } catch (error) {
        console.warn(`No se pudo generar la imagen de la pregunta ${questionIndex + 1} de la sala ${index + 1}:`, error);
        failed += 1;
      }
    }
  }
  return { generated, failed, total };
}

function createQuestionDraft(roomIndex = 0, questionIndex = 0, partial = {}) {
  const title = partial.titulo || `Pregunta ${String(questionIndex + 1).padStart(2, "0")}`;
  const question = normalizeQuestion({
    id: partial.id || `question-${roomIndex + 1}-${questionIndex + 1}`,
    titulo: title,
    reto: partial.reto || "Define aquí el desafío interno de la pregunta.",
    tipo_interaccion: partial.tipo_interaccion || "texto",
    subtipo_respuesta: partial.subtipo_respuesta || "palabra",
    respuesta_correcta: partial.respuesta_correcta || "",
    respuestas_aceptadas: partial.respuestas_aceptadas || [],
    opciones: partial.opciones || ["Opción A", "Opción B", "Opción C"],
    parejas: partial.parejas || [
      { izquierda: "Elemento 1", derecha: "Respuesta 1" },
      { izquierda: "Elemento 2", derecha: "Respuesta 2" },
      { izquierda: "Elemento 3", derecha: "Respuesta 3" }
    ],
    media: partial.media || null,
    pista: partial.pista || "Añade una pista útil, pero no obvia.",
    retroalimentacion_correcta: partial.retroalimentacion_correcta || "",
    retroalimentacion_incorrecta: partial.retroalimentacion_incorrecta || "",
    imagen_prompt: partial.imagen_prompt || "",
    imagen_alt: partial.imagen_alt || "",
    imagen: partial.imagen || "",
    bloqueada_inicial: partial.bloqueada_inicial ?? false
  }, roomIndex, questionIndex);

  question._correctOptionIndex = typeof partial._correctOptionIndex === "number"
    ? partial._correctOptionIndex
    : findCorrectOptionIndex(question);
  return question;
}

function createMissionDraft(index = 0, partial = {}, questionCount = 1) {
  const title = normalizeRoomTitle(partial.titulo, `Sala ${String(index + 1).padStart(2, "0")}`);
  const preguntas = Array.isArray(partial.preguntas) && partial.preguntas.length
    ? normalizeQuestionList(partial.preguntas, index)
    : Array.from({ length: Math.max(1, questionCount) }, (_, questionIndex) => createQuestionDraft(index, questionIndex, {}));

  const mission = normalizeMission({
    id: partial.id || buildMissionId(title, index),
    titulo: title,
    release: partial.release || `SALA ${String(index + 1).padStart(2, "0")}`,
    historia: partial.historia || "Introduce aquí la escena y el contexto de la sala.",
    reto: partial.reto || "Define aquí el reto principal de la sala.",
    tipo_interaccion: partial.tipo_interaccion || "texto",
    subtipo_respuesta: partial.subtipo_respuesta || "palabra",
    respuesta_correcta: partial.respuesta_correcta || "",
    respuestas_aceptadas: partial.respuestas_aceptadas || [],
    opciones: partial.opciones || ["Opción A", "Opción B", "Opción C"],
    parejas: partial.parejas || [
      { izquierda: "Elemento 1", derecha: "Respuesta 1" },
      { izquierda: "Elemento 2", derecha: "Respuesta 2" },
      { izquierda: "Elemento 3", derecha: "Respuesta 3" }
    ],
    media: partial.media || null,
    pista: partial.pista || "Añade una pista útil, pero no obvia.",
    retroalimentacion_correcta: partial.retroalimentacion_correcta || "",
    retroalimentacion_incorrecta: partial.retroalimentacion_incorrecta || "",
    desbloquea: partial.desbloquea || [],
    bloqueada_inicial: partial.bloqueada_inicial ?? index !== 0,
    preguntas
  }, index);

  mission._correctOptionIndex = typeof partial._correctOptionIndex === "number"
    ? partial._correctOptionIndex
    : findCorrectOptionIndex(mission);
  return mission;
}

function getMissionLabel(index = 0, mission = {}) {
  return mission.titulo || `Sala ${String(index + 1).padStart(2, "0")}`;
}

function getNormalizedAnswerToken(value = "") {
  return normalizeAcceptedAnswers(value)?.[0] || "";
}

function findCorrectOptionIndex(mission = {}) {
  const options = Array.isArray(mission.opciones) ? mission.opciones : [];
  if (!options.length) return -1;
  const accepted = normalizeAcceptedAnswers(mission.respuestas_aceptadas || mission.respuesta_correcta || []);
  if (!accepted.length) return -1;

  const normalizedOptions = options.map(opt => getNormalizedAnswerToken(opt));

  // Intento 1: Coincidencia exacta con tokens normalizados
  let index = options.findIndex((option) => accepted.includes(getNormalizedAnswerToken(option)));
  if (index >= 0) return index;

  // Intento 2: Si la respuesta es una sola letra ("a"-"h") o número ("1"-"8") indicando el índice
  for (const acc of accepted) {
    if (acc.length === 1) {
      const matchExact = normalizedOptions.indexOf(acc);
      if (matchExact >= 0) return matchExact;

      const letterCode = acc.charCodeAt(0) - 97; // 'a' es 97
      if (letterCode >= 0 && letterCode < options.length) {
        return letterCode;
      }

      const numCode = parseInt(acc, 10) - 1;
      if (!isNaN(numCode) && numCode >= 0 && numCode < options.length) {
        return numCode;
      }
    }
  }

  // Intento 3: Coincidencia parcial (subcadena o supercadena)
  for (const acc of accepted) {
    const matchSubstring = normalizedOptions.findIndex(opt => opt.includes(acc) || acc.includes(opt));
    if (matchSubstring >= 0) return matchSubstring;
  }

  // Intento 4: Coincidencia de prefijo
  for (const acc of accepted) {
    const matchPrefix = normalizedOptions.findIndex(opt => opt.startsWith(acc));
    if (matchPrefix >= 0) return matchPrefix;
  }

  return -1;
}

function repairQuestionAnswers(question = {}, roomIndex = 0, questionIndex = 0) {
  const repaired = {
    ...question,
    retroalimentacion_correcta: normalizeString(question.retroalimentacion_correcta, "Correcto."),
    retroalimentacion_incorrecta: normalizeString(question.retroalimentacion_incorrecta, "Respuesta incorrecta. Intenta de nuevo.")
  };

  if (repaired.tipo_interaccion === "opcion_multiple") {
    const optionIndex = typeof repaired._correctOptionIndex === "number" && repaired._correctOptionIndex >= 0
      ? repaired._correctOptionIndex
      : findCorrectOptionIndex(repaired);
    repaired._correctOptionIndex = optionIndex;
    if (optionIndex >= 0 && repaired.opciones[optionIndex]) {
      const correctValue = repaired.opciones[optionIndex];
      repaired.respuesta_correcta = correctValue;
      repaired.respuestas_aceptadas = [correctValue];
    }
  } else if (repaired.tipo_interaccion === "relacion_columnas") {
    repaired.parejas = normalizePairList(repaired.parejas || []);
  } else {
    const accepted = normalizeAcceptedAnswers(repaired.respuestas_aceptadas || repaired.respuesta_correcta || []);
    repaired.respuestas_aceptadas = accepted;
    if (!repaired.respuesta_correcta && accepted.length) {
      repaired.respuesta_correcta = accepted[0];
    }
  }

  repaired.titulo = normalizeString(repaired.titulo, `Pregunta ${questionIndex + 1}`);
  repaired.id = normalizeString(repaired.id, `question-${roomIndex + 1}-${questionIndex + 1}`);
  return repaired;
}

function repairMissionAnswers(mission = {}, index = 0) {
  const preguntas = Array.isArray(mission.preguntas) && mission.preguntas.length
    ? mission.preguntas.map((question, questionIndex) => repairQuestionAnswers(question, index, questionIndex))
    : [repairQuestionAnswers(createQuestionDraft(index, 0, mission), index, 0)];

  const repaired = {
    ...mission,
    preguntas,
    retroalimentacion_correcta: normalizeString(mission.retroalimentacion_correcta, "Correcto."),
    retroalimentacion_incorrecta: normalizeString(mission.retroalimentacion_incorrecta, "Respuesta incorrecta. Intenta de nuevo.")
  };

  if (repaired.tipo_interaccion === "opcion_multiple") {
    const optionIndex = typeof repaired._correctOptionIndex === "number" && repaired._correctOptionIndex >= 0
      ? repaired._correctOptionIndex
      : findCorrectOptionIndex(repaired);
    repaired._correctOptionIndex = optionIndex;
    if (optionIndex >= 0 && repaired.opciones[optionIndex]) {
      const correctValue = repaired.opciones[optionIndex];
      repaired.respuesta_correcta = correctValue;
      repaired.respuestas_aceptadas = [correctValue];
    }
  } else if (repaired.tipo_interaccion === "relacion_columnas") {
    repaired.parejas = normalizePairList(repaired.parejas || []);
  } else {
    const accepted = normalizeAcceptedAnswers(repaired.respuestas_aceptadas || repaired.respuesta_correcta || []);
    repaired.respuestas_aceptadas = accepted;
    if (!repaired.respuesta_correcta && accepted.length) {
      repaired.respuesta_correcta = accepted[0];
    }
  }

  if (!repaired.respuesta_correcta && preguntas[0]?.respuesta_correcta) {
    repaired.respuesta_correcta = preguntas[0].respuesta_correcta;
  }
  if ((!repaired.respuestas_aceptadas || !repaired.respuestas_aceptadas.length) && preguntas[0]?.respuestas_aceptadas?.length) {
    repaired.respuestas_aceptadas = [...preguntas[0].respuestas_aceptadas];
  }

  repaired.titulo = normalizeString(repaired.titulo, getMissionLabel(index, repaired));
  repaired.preguntas = preguntas;
  return repaired;
}

function validateQuestionSetup(question = {}, roomIndex = 0, questionIndex = 0) {
  const issues = [];
  const label = `Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}`;
  const accepted = normalizeAcceptedAnswers(question.respuestas_aceptadas || question.respuesta_correcta || []);
  const options = normalizeTextList(question.opciones || []);
  const pairs = normalizePairList(question.parejas || []);

  if (!normalizeString(question.retroalimentacion_correcta, "").trim()) {
    question.retroalimentacion_correcta = "Correcto.";
  }
  if (!normalizeString(question.retroalimentacion_incorrecta, "").trim()) {
    question.retroalimentacion_incorrecta = "Respuesta incorrecta. Intenta de nuevo.";
  }

  if (question.tipo_interaccion === "opcion_multiple") {
    if (options.length < 2) issues.push(`${label}: necesita al menos 2 opciones.`);
    const optionIndex = findCorrectOptionIndex(question);
    if (optionIndex < 0) {
      issues.push(`${label}: la respuesta correcta no coincide con ninguna opción.`);
    } else {
      const correctValue = options[optionIndex] || question.opciones[optionIndex] || "";
      question._correctOptionIndex = optionIndex;
      question.respuesta_correcta = correctValue;
      question.respuestas_aceptadas = correctValue ? [correctValue] : [];
    }
  } else if (question.tipo_interaccion === "relacion_columnas") {
    if (pairs.length < 2) issues.push(`${label}: necesita al menos 2 parejas para ser válida.`);
    question.parejas = pairs;
  } else {
    if (!accepted.length) {
      issues.push(`${label}: no tiene una respuesta correcta válida.`);
    } else {
      question.respuestas_aceptadas = accepted;
      if (!question.respuesta_correcta) {
        question.respuesta_correcta = accepted[0];
      }
    }
  }

  if (question.tipo_interaccion === "multimedia" && !question.media?.url && !normalizeString(question.media?.texto || question.media?.alt || "", "").trim()) {
    issues.push(`${label}: la pregunta multimedia necesita un recurso o una indicación textual.`);
  }

  return issues;
}

function validateMissionSetup(mission = {}, index = 0) {
  const issues = [];
  const label = getMissionLabel(index, mission);
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];

  if (questions.length) {
    questions.forEach((question, questionIndex) => {
      issues.push(...validateQuestionSetup(question, index, questionIndex));
    });
    return issues;
  }

  const accepted = normalizeAcceptedAnswers(mission.respuestas_aceptadas || mission.respuesta_correcta || []);
  const options = normalizeTextList(mission.opciones || []);
  const pairs = normalizePairList(mission.parejas || []);

  if (!normalizeString(mission.retroalimentacion_correcta, "").trim()) {
    mission.retroalimentacion_correcta = "Correcto.";
  }
  if (!normalizeString(mission.retroalimentacion_incorrecta, "").trim()) {
    mission.retroalimentacion_incorrecta = "Respuesta incorrecta. Intenta de nuevo.";
  }

  if (mission.tipo_interaccion === "opcion_multiple") {
    if (options.length < 2) issues.push(`${label}: necesita al menos 2 opciones.`);
    const optionIndex = findCorrectOptionIndex(mission);
    if (optionIndex < 0) {
      issues.push(`${label}: la respuesta correcta no coincide con ninguna opción.`);
    } else {
      const correctValue = options[optionIndex] || mission.opciones[optionIndex] || "";
      mission._correctOptionIndex = optionIndex;
      mission.respuesta_correcta = correctValue;
      mission.respuestas_aceptadas = correctValue ? [correctValue] : [];
    }
  } else if (mission.tipo_interaccion === "relacion_columnas") {
    if (pairs.length < 2) issues.push(`${label}: necesita al menos 2 parejas para ser válida.`);
    mission.parejas = pairs;
  } else {
    if (!accepted.length) {
      issues.push(`${label}: no tiene una respuesta correcta válida.`);
    } else {
      mission.respuestas_aceptadas = accepted;
      if (!mission.respuesta_correcta) {
        mission.respuesta_correcta = accepted[0];
      }
    }
  }

  if (mission.tipo_interaccion === "multimedia" && !mission.media?.url && !normalizeString(mission.media?.texto || mission.media?.alt || "", "").trim()) {
    issues.push(`${label}: la sala multimedia necesita un recurso o una indicación textual.`);
  }

  return issues;
}

function validateProjectSetup(project = null) {
  const normalized = withDefaultRoutes(project || state.project || {});
  const issues = [];

  normalized.misiones.forEach((mission, index) => {
    issues.push(...validateMissionSetup(mission, index));
  });

  return {
    project: normalized,
    issues
  };
}

function isRenderableMediaUrl(url = "") {
  return /^data:/i.test(String(url || "")) || /^assets\//i.test(String(url || "")) || /^\.{0,2}\//.test(String(url || "")) || /^https?:\/\//i.test(String(url || ""));
}

function sanitizeMissionMedia(media = null) {
  if (!media || typeof media !== "object") return null;
  if (!media.url || !isRenderableMediaUrl(media.url)) {
    return media.texto || media.alt ? { ...media, url: "" } : null;
  }
  return media;
}

function withDefaultRoutes(project) {
  const hydrated = normalizeEscapeRoomProject(project);
  hydrated.themeConfig = normalizePreviewThemeConfig(project?.themeConfig || state.previewTheme);
  hydrated.misiones = hydrated.misiones.map((mission, index) => {
    const nextMission = hydrated.misiones[index + 1];
    const hasRoute = Array.isArray(mission.desbloquea) && mission.desbloquea.length > 0;
    const questionCount = Array.isArray(mission.preguntas) && mission.preguntas.length ? mission.preguntas.length : 1;
    const draft = createMissionDraft(index, {
      ...mission,
      desbloquea: hasRoute ? mission.desbloquea : (nextMission ? [nextMission.id] : [])
    }, questionCount);
    if (mission.tipo_interaccion === "opcion_multiple") {
      draft._correctOptionIndex = findCorrectOptionIndex(draft);
    }
    return draft;
  });

  if (hydrated.misiones.length && hydrated.misiones.every((mission) => mission.bloqueada_inicial)) {
    hydrated.misiones[0].bloqueada_inicial = false;
  }

  hydrated.misiones.forEach((mission) => {
    if (mission.imagen && !mission.media?.url) {
      mission.media = {
        tipo: "imagen",
        url: mission.imagen,
        alt: mission.imagen_alt || mission.titulo,
        titulo: mission.titulo,
        texto: mission.reto
      };
    }
  });

  return hydrated;
}

function fitProjectToConfiguredCounts(project, formData = {}) {
  const targetMissionCount = Math.max(1, Number(formData.misiones || 1));
  const targetQuestionCount = Math.max(1, Number(formData.preguntasPorSala || 1));
  const normalized = withDefaultRoutes(project || {});
  const sourceMissions = Array.isArray(normalized.misiones) ? normalized.misiones : [];
  const adjustedMissionCount = sourceMissions.length !== targetMissionCount;
  let adjustedQuestionCount = false;

  const missions = Array.from({ length: targetMissionCount }, (_, missionIndex) => {
    const sourceMission = sourceMissions[missionIndex] || {};
    const questions = Array.isArray(sourceMission.preguntas) ? [...sourceMission.preguntas] : [];
    const alignedQuestions = questions.slice(0, targetQuestionCount);
    if (alignedQuestions.length !== questions.length) {
      adjustedQuestionCount = true;
    }

    while (alignedQuestions.length < targetQuestionCount) {
      alignedQuestions.push(createQuestionDraft(missionIndex, alignedQuestions.length, {}));
      adjustedQuestionCount = true;
    }

    return createMissionDraft(missionIndex, {
      ...sourceMission,
      id: sourceMission.id || `m${missionIndex + 1}`,
      release: `SALA ${String(missionIndex + 1).padStart(2, "0")}`,
      preguntas: alignedQuestions,
      desbloquea: Array.isArray(sourceMission.desbloquea) ? sourceMission.desbloquea : []
    }, targetQuestionCount);
  });

  const missionIds = new Set(missions.map((mission) => mission.id));
  missions.forEach((mission, index) => {
    const nextMission = missions[index + 1];
    const validRoutes = Array.isArray(mission.desbloquea)
      ? [...new Set(mission.desbloquea.filter((id) => missionIds.has(id) && id !== mission.id))]
      : [];
    mission.desbloquea = validRoutes.length ? validRoutes : (nextMission ? [nextMission.id] : []);
    if (index === 0) {
      mission.bloqueada_inicial = false;
    }
    const missionQuestions = Array.isArray(mission.preguntas) ? mission.preguntas.slice(0, targetQuestionCount) : [];
    if (Array.isArray(mission.preguntas) && missionQuestions.length !== mission.preguntas.length) {
      adjustedQuestionCount = true;
    }
    mission.preguntas = missionQuestions;
    while (mission.preguntas.length < targetQuestionCount) {
      mission.preguntas.push(createQuestionDraft(index, mission.preguntas.length, {}));
      adjustedQuestionCount = true;
    }
  });

  if (missions.length && missions.every((mission) => mission.bloqueada_inicial)) {
    missions[0].bloqueada_inicial = false;
  }

  return {
    project: withDefaultRoutes({
      ...normalized,
      misiones: missions
    }),
    adjusted: adjustedMissionCount || adjustedQuestionCount,
    adjustedMissionCount,
    adjustedQuestionCount
  };
}

function createProjectFromForm(seedCount = 1) {
  const formData = getFormData();
  const baseTitle = formData.temaPrincipal || formData.tema || "Escape Room";
  const questionCount = Math.max(1, Number(formData.preguntasPorSala || 1));
  const misiones = Array.from({ length: Math.max(1, seedCount) }, (_, index) => createMissionDraft(index, {}, questionCount));
  return withDefaultRoutes({
    themeConfig: state.previewTheme,
    titulo: `Escape Room: ${baseTitle}`,
    subtitulo: `Sala para ${formData.grado} de ${formData.nivel}`,
    introduccion: formData.objetivo || `Completa el escape room sobre ${baseTitle}.`,
    ambientacion: formData.narrativa || "Aventura inmersiva",
    linea_visual_base: "Arena eSports con energía competitiva, neón y progresión visible.",
    misiones,
    conclusion: "El equipo logra abrir la bóveda final.",
    duracion_minutos: formData.duracion
  });
}

function materializeProjectForExport() {
  if (!state.project) return null;
  const project = withDefaultRoutes({
    ...state.project,
    themeConfig: normalizePreviewThemeConfig(state.project.themeConfig || state.previewTheme),
    misiones: state.project.misiones.map((mission, index) => repairMissionAnswers({
      ...mission,
      respuestas_aceptadas: Array.isArray(mission.respuestas_aceptadas)
        ? mission.respuestas_aceptadas
        : normalizeTextList(mission.respuestas_aceptadas || []),
      media: sanitizeMissionMedia(mission.media?.url ? normalizeMediaValue(mission.media) : mission.media)
    }, index))
  });
  return project;
}

function renderJsonPreview() {
  const project = materializeProjectForExport();
  elements.jsonPreview.textContent = project ? JSON.stringify(project, null, 2) : "";
}

function renderPreview() {
  const project = materializeProjectForExport();
  if (!project || !elements.previewFrame) {
    elements.previewFrame?.removeAttribute("srcdoc");
    return;
  }
  elements.previewFrame.srcdoc = buildPreviewDocument(project);
}

function updateSummaryStats() {
  const project = materializeProjectForExport();
  const missionCount = project?.misiones.length || 0;
  const unlockedCount = project?.misiones.filter((mission) => !mission.bloqueada_inicial).length || 0;
  const types = missionCount
    ? [...new Set(project.misiones.map((mission) => mission.tipo_interaccion))].join(" · ")
    : "-";
  elements.missionCount.textContent = String(missionCount);
  elements.unlockedCount.textContent = String(unlockedCount);
  elements.typeSummary.textContent = types;
}

function scheduleOutputRefresh() {
  if (state.refreshHandle) window.clearTimeout(state.refreshHandle);
  state.refreshHandle = window.setTimeout(() => {
    state.refreshHandle = null;
    updateSummaryStats();
    renderJsonPreview();
    renderPreview();
    refreshPanels();
    saveProjectState();
    scheduleSessionSave();
  }, 80);
}

function renderOutputsNow() {
  updateSummaryStats();
  renderJsonPreview();
  renderPreview();
  refreshPanels();
  saveProjectState();
  renderSessionList();
  scheduleSessionSave();
}

function getMissionTypeBadge(type) {
  const labels = {
    texto: "Texto",
    opcion_multiple: "Opción múltiple",
    relacion_columnas: "Relación",
    multimedia: "Multimedia"
  };
  return labels[type] || type;
}

function getMissionPreviewMedia(mission) {
  if (mission.media?.url) {
    if (mission.media.tipo === "audio") return `<audio controls src="${escapeHtmlAttr(mission.media.url)}"></audio>`;
    if (mission.media.tipo === "video") return `<video controls src="${escapeHtmlAttr(mission.media.url)}"></video>`;
    return `<img src="${escapeHtmlAttr(mission.media.url)}" alt="${escapeHtmlAttr(mission.media.alt || mission.titulo)}">`;
  }
  if (mission.imagen) {
    return `<img src="${escapeHtmlAttr(mission.imagen)}" alt="${escapeHtmlAttr(mission.imagen_alt || mission.titulo)}">`;
  }
  return `<div class="er-muted">Sin recurso visual todavía.</div>`;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value = "") {
  return escapeHtml(value);
}

function getQuestionPreviewMedia(question = {}) {
  if (question.media?.url) {
    if (question.media.tipo === "audio") return `<audio controls src="${escapeHtmlAttr(question.media.url)}"></audio>`;
    if (question.media.tipo === "video") return `<video controls src="${escapeHtmlAttr(question.media.url)}"></video>`;
    return `<img src="${escapeHtmlAttr(question.media.url)}" alt="${escapeHtmlAttr(question.media.alt || question.titulo)}">`;
  }
  if (question.imagen) {
    return `<img src="${escapeHtmlAttr(question.imagen)}" alt="${escapeHtmlAttr(question.imagen_alt || question.titulo)}">`;
  }
  return `<div class="er-empty-inline">Sin imagen o recurso visual todavía.</div>`;
}

function getQuestionTypeLabel(question = {}) {
  const labels = {
    texto: "Texto",
    opcion_multiple: "Opción múltiple",
    relacion_columnas: "Relación de columnas",
    multimedia: "Multimedia"
  };
  return labels[question.tipo_interaccion] || question.tipo_interaccion || "Pregunta";
}

function getQuestionQuestionText(question = {}, questionIndex = 0) {
  return normalizeString(question.titulo, `Pregunta ${String(questionIndex + 1).padStart(2, "0")}`);
}

function renderQuestionOptionRows(missionIndex, questionIndex, question) {
  return (Array.isArray(question.opciones) ? question.opciones : []).map((option, optionIndex) => `
    <div class="er-option-row">
      <input type="radio" name="correct-question-option-${missionIndex}-${questionIndex}" data-question-action="set-correct-option" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-question-option-index="${optionIndex}" ${question._correctOptionIndex === optionIndex ? "checked" : ""}>
      <input class="er-option-input" type="text" data-question-field="option-value" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-question-option-index="${optionIndex}" value="${escapeHtmlAttr(option)}">
      <button type="button" class="er-icon-button" data-question-action="remove-option" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-question-option-index="${optionIndex}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join("");
}

function renderQuestionPairRows(missionIndex, questionIndex, question) {
  return (Array.isArray(question.parejas) ? question.parejas : []).map((pair, pairIndex) => `
    <div class="er-match-row">
      <input class="er-match-input" type="text" data-question-field="pair-left" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-question-pair-index="${pairIndex}" value="${escapeHtmlAttr(pair.izquierda)}" placeholder="Columna A">
      <input class="er-match-input" type="text" data-question-field="pair-right" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-question-pair-index="${pairIndex}" value="${escapeHtmlAttr(pair.derecha)}" placeholder="Columna B">
      <button type="button" class="er-icon-button" data-question-action="remove-pair" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-question-pair-index="${pairIndex}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join("");
}

function renderQuestionCard(missionIndex, questionIndex, question) {
  const questionTitle = getQuestionQuestionText(question, questionIndex);
  const questionId = normalizeString(question.id, `question-${missionIndex + 1}-${questionIndex + 1}`);
  const answerText = Array.isArray(question.respuestas_aceptadas) ? question.respuestas_aceptadas.join("\n") : "";
  const optionRows = renderQuestionOptionRows(missionIndex, questionIndex, question);
  const pairRows = renderQuestionPairRows(missionIndex, questionIndex, question);
  return `
    <details class="er-question-accordion" open data-question-card data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
      <summary class="er-question-summary">
        <div class="er-question-summary-main">
          <span class="er-question-index">Pregunta ${String(questionIndex + 1).padStart(2, "0")}</span>
          <h4>${escapeHtml(questionTitle)}</h4>
          <p>${escapeHtml(questionId)} · ${escapeHtml(getQuestionTypeLabel(question))}</p>
        </div>
        <div class="er-question-summary-actions">
          <span class="er-badge">${escapeHtml(question.tipo_interaccion)}</span>
          <button type="button" class="er-icon-button" data-question-action="delete-question" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </summary>
      <div class="er-question-body">
        <div class="er-question-grid">
          <label class="er-field">
            <span>Título</span>
            <input type="text" data-question-field="titulo" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.titulo)}">
          </label>
          <label class="er-field">
            <span>ID interno</span>
            <input type="text" value="${escapeHtmlAttr(question.id)}" readonly>
          </label>
          <label class="er-field">
            <span>Tipo de interacción</span>
            <select data-question-field="tipo_interaccion" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
              <option value="texto" ${question.tipo_interaccion === "texto" ? "selected" : ""}>Texto</option>
              <option value="opcion_multiple" ${question.tipo_interaccion === "opcion_multiple" ? "selected" : ""}>Opción múltiple</option>
              <option value="relacion_columnas" ${question.tipo_interaccion === "relacion_columnas" ? "selected" : ""}>Relación de columnas</option>
              <option value="multimedia" ${question.tipo_interaccion === "multimedia" ? "selected" : ""}>Multimedia</option>
            </select>
          </label>
          <label class="er-field">
            <span>Subtipo de respuesta</span>
            <select data-question-field="subtipo_respuesta" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
              ${TEXT_SUBTYPES.map((subtype) => `<option value="${subtype}" ${question.subtipo_respuesta === subtype ? "selected" : ""}>${subtype}</option>`).join("")}
            </select>
          </label>
          <div class="er-field-row er-field-wide er-field-row--2">
            <label class="er-field">
              <span>Reto</span>
              <textarea rows="3" data-question-field="reto" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(question.reto)}</textarea>
            </label>
            <label class="er-field">
              <span>Pista</span>
              <textarea rows="2" data-question-field="pista" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(question.pista)}</textarea>
            </label>
          </div>
          <div class="er-field-row er-field-wide er-field-row--3">
            <label class="er-field">
              <span>Imagen / recurso visual: prompt</span>
              <textarea rows="2" data-question-field="imagen_prompt" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" placeholder="Describe la imagen funcional de esta pregunta.">${escapeHtml(question.imagen_prompt)}</textarea>
            </label>
            <label class="er-field">
              <span>Imagen / recurso visual: alt</span>
              <input type="text" data-question-field="imagen_alt" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.imagen_alt)}">
            </label>
            <label class="er-field">
              <span>Imagen generada o recurso</span>
              <textarea rows="2" data-question-field="imagen" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" placeholder="URL, data URL o deja vacío para generar">${escapeHtml(question.imagen)}</textarea>
            </label>
          </div>
        </div>

        <section class="er-type-panel er-question-type-panel">
          <div class="er-label">Configuración de la pregunta</div>
          <div class="er-type-layout">
            ${(question.tipo_interaccion === "texto" || question.tipo_interaccion === "multimedia") ? `
              <div class="er-type-group">
                <strong>Respuesta correcta</strong>
                <input class="er-inline-input" type="text" data-question-field="respuesta_correcta" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.respuesta_correcta)}">
              </div>
              <div class="er-type-group">
                <strong>Respuestas aceptadas</strong>
                <textarea rows="3" data-question-field="respuestas_aceptadas" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" placeholder="Una por línea">${escapeHtml(answerText)}</textarea>
              </div>
            ` : ""}

            ${question.tipo_interaccion === "opcion_multiple" ? `
              <div class="er-type-group">
                <strong>Opciones</strong>
                <div class="er-inline-list">${optionRows}</div>
                <button type="button" class="er-button er-button-mini" data-question-action="add-option" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
                  <i class="fas fa-plus"></i>
                  <span>Añadir opción</span>
                </button>
              </div>
            ` : ""}

            ${question.tipo_interaccion === "relacion_columnas" ? `
              <div class="er-type-group">
                <strong>Parejas</strong>
                <div class="er-inline-list">${pairRows}</div>
                <button type="button" class="er-button er-button-mini" data-question-action="add-pair" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
                  <i class="fas fa-plus"></i>
                  <span>Añadir pareja</span>
                </button>
              </div>
            ` : ""}

            ${question.tipo_interaccion === "multimedia" ? `
              <div class="er-type-group">
                <strong>Media</strong>
                <label class="er-field">
                  <span>Tipo de media</span>
                  <select data-question-field="media.tipo" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
                    <option value="imagen" ${question.media?.tipo === "imagen" ? "selected" : ""}>Imagen</option>
                    <option value="audio" ${question.media?.tipo === "audio" ? "selected" : ""}>Audio</option>
                    <option value="video" ${question.media?.tipo === "video" ? "selected" : ""}>Video</option>
                  </select>
                </label>
                <label class="er-field">
                  <span>URL o data URL</span>
                  <textarea rows="3" data-question-field="media.url" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(question.media?.url || "")}</textarea>
                </label>
                <label class="er-field">
                  <span>Texto alternativo</span>
                  <input type="text" data-question-field="media.alt" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.media?.alt || "")}">
                </label>
              </div>
            ` : ""}

            <div class="er-type-group">
              <strong>Feedback</strong>
              <label class="er-field">
                <span>Feedback correcto</span>
                <input type="text" data-question-field="retroalimentacion_correcta" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.retroalimentacion_correcta)}">
              </label>
              <label class="er-field">
                <span>Feedback incorrecto</span>
                <input type="text" data-question-field="retroalimentacion_incorrecta" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.retroalimentacion_incorrecta)}">
              </label>
            </div>
          </div>
        </section>

        <section class="er-preview-panel er-question-preview-panel">
          <div class="er-label">Vista rápida</div>
          <div class="er-preview-grid">
            <div class="er-preview-poster">${getQuestionPreviewMedia(question)}</div>
            <div class="er-type-layout">
              <div class="er-preview-badges">
                <span class="er-badge">${escapeHtml(getQuestionTypeLabel(question))}</span>
                <span class="er-badge">${escapeHtml(question.subtipo_respuesta)}</span>
              </div>
              <p class="er-inline-note">${escapeHtml(question.reto)}</p>
              <div class="er-inline-note"><strong>Respuesta:</strong> ${escapeHtml(question.respuesta_correcta || "Sin definir")}</div>
            </div>
          </div>
        </section>
      </div>
    </details>
  `;
}

function renderMissionEditor() {
  if (!elements.missionEditorList) return;
  if (!state.project || state.project.misiones.length === 0) {
    elements.missionEditorList.innerHTML = "";
    refreshPanels();
    return;
  }

  state.project.misiones.forEach((mission) => {
    if (mission.tipo_interaccion === "opcion_multiple" && (typeof mission._correctOptionIndex !== "number" || mission._correctOptionIndex < 0)) {
      mission._correctOptionIndex = findCorrectOptionIndex(mission);
    }
    if (Array.isArray(mission.preguntas)) {
      mission.preguntas.forEach((question) => {
        if (question.tipo_interaccion === "opcion_multiple" && (typeof question._correctOptionIndex !== "number" || question._correctOptionIndex < 0)) {
          question._correctOptionIndex = findCorrectOptionIndex(question);
        }
      });
    }
  });

  elements.missionEditorList.innerHTML = state.project.misiones.map((mission, index) => {
    const unlockChoices = state.project.misiones
      .filter((candidate) => candidate.id !== mission.id)
      .map((candidate) => `
        <label class="er-check-card">
          <input type="checkbox" data-action="toggle-unlock" data-index="${index}" data-target-id="${escapeHtmlAttr(candidate.id)}" ${mission.desbloquea.includes(candidate.id) ? "checked" : ""}>
          <span>${escapeHtml(candidate.titulo)} <small class="er-muted">(${escapeHtml(candidate.id)})</small></span>
        </label>
      `)
      .join("");

    const optionRows = mission.opciones.map((option, optionIndex) => `
      <div class="er-option-row">
        <input type="radio" name="correct-option-${index}" data-action="set-correct-option" data-index="${index}" data-option-index="${optionIndex}" ${mission._correctOptionIndex === optionIndex ? "checked" : ""}>
        <input class="er-option-input" type="text" data-field="option-value" data-index="${index}" data-option-index="${optionIndex}" value="${escapeHtmlAttr(option)}">
        <button type="button" class="er-icon-button" data-action="remove-option" data-index="${index}" data-option-index="${optionIndex}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join("");

    const pairRows = mission.parejas.map((pair, pairIndex) => `
      <div class="er-match-row">
        <input class="er-match-input" type="text" data-field="pair-left" data-index="${index}" data-pair-index="${pairIndex}" value="${escapeHtmlAttr(pair.izquierda)}" placeholder="Columna A">
        <input class="er-match-input" type="text" data-field="pair-right" data-index="${index}" data-pair-index="${pairIndex}" value="${escapeHtmlAttr(pair.derecha)}" placeholder="Columna B">
        <button type="button" class="er-icon-button" data-action="remove-pair" data-index="${index}" data-pair-index="${pairIndex}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join("");

    const answersAsText = Array.isArray(mission.respuestas_aceptadas)
      ? mission.respuestas_aceptadas.join("\n")
      : "";

  return `
      <details class="er-mission-card ${mission.bloqueada_inicial ? "is-locked" : ""}" data-mission-card data-index="${index}">
        <summary class="er-mission-head">
          <div class="er-drag-handle" title="Arrastrar para reordenar">
            <i class="fas fa-grip-vertical"></i>
          </div>
          <div class="er-mission-meta">
            <div class="er-mission-index">Sala ${String(index + 1).padStart(2, "0")}</div>
            <h3>${escapeHtml(mission.titulo)}</h3>
            <p>${escapeHtml(mission.id)}</p>
            <div class="er-mission-badges">
              <span class="er-badge">${getMissionTypeBadge(mission.tipo_interaccion)}</span>
              <span class="er-badge">${escapeHtml(mission.subtipo_respuesta)}</span>
              <span class="er-badge">${(Array.isArray(mission.preguntas) && mission.preguntas.length) || 0} preguntas</span>
              ${mission.bloqueada_inicial ? `<span class="er-badge">Bloqueada al iniciar</span>` : `<span class="er-badge">Disponible al iniciar</span>`}
            </div>
          </div>
          <div class="er-mission-actions">
            <button type="button" class="er-icon-button" data-action="delete-mission" data-index="${index}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </summary>
        <div class="er-mission-body">
          <div class="er-mission-grid">
            <label class="er-field">
              <span>Título</span>
              <input type="text" data-field="titulo" data-index="${index}" value="${escapeHtmlAttr(mission.titulo)}">
            </label>
            <label class="er-field">
              <span>ID interno</span>
              <input type="text" value="${escapeHtmlAttr(mission.id)}" readonly>
            </label>
            <label class="er-field">
              <span>Sala</span>
              <input type="text" data-field="release" data-index="${index}" value="${escapeHtmlAttr(mission.release)}">
            </label>
            <label class="er-field">
              <span>Tipo de interacción</span>
              <select data-field="tipo_interaccion" data-index="${index}">
                <option value="texto" ${mission.tipo_interaccion === "texto" ? "selected" : ""}>Texto</option>
                <option value="opcion_multiple" ${mission.tipo_interaccion === "opcion_multiple" ? "selected" : ""}>Opción múltiple</option>
                <option value="relacion_columnas" ${mission.tipo_interaccion === "relacion_columnas" ? "selected" : ""}>Relación de columnas</option>
                <option value="multimedia" ${mission.tipo_interaccion === "multimedia" ? "selected" : ""}>Multimedia</option>
              </select>
            </label>
            <label class="er-field er-field-wide">
              <span>Historia</span>
              <textarea rows="3" data-field="historia" data-index="${index}">${escapeHtml(mission.historia)}</textarea>
            </label>
            <div class="er-field-row er-field-wide er-field-row--2">
              <label class="er-field">
                <span>Reto</span>
                <textarea rows="3" data-field="reto" data-index="${index}">${escapeHtml(mission.reto)}</textarea>
              </label>
              <label class="er-field">
                <span>Pista</span>
                <textarea rows="2" data-field="pista" data-index="${index}">${escapeHtml(mission.pista)}</textarea>
              </label>
            </div>
          </div>

          <section class="er-routing-panel">
            <div class="er-label">Rutas y desbloqueos</div>
            <p class="er-inline-note">Marca qué salas se desbloquean al resolver esta sala.</p>
            <div class="er-unlock-grid">
              ${unlockChoices || `<div class="er-muted">No hay otras salas para desbloquear.</div>`}
            </div>
          </section>

          <section class="er-preview-panel">
            <div class="er-label">Vista rápida</div>
            <div class="er-preview-grid">
              <div class="er-preview-poster">${getMissionPreviewMedia(mission)}</div>
              <div class="er-type-layout">
                <div class="er-preview-badges">
                  <span class="er-badge">${getMissionTypeBadge(mission.tipo_interaccion)}</span>
                  <span class="er-badge">${escapeHtml(mission.subtipo_respuesta)}</span>
                </div>
                <p class="er-inline-note">${escapeHtml(mission.reto)}</p>
                <div class="er-inline-note"><strong>Desbloquea:</strong> ${mission.desbloquea.length ? mission.desbloquea.map(escapeHtml).join(", ") : "Ninguna sala extra"}</div>
              </div>
            </div>
          </section>

          <section class="er-question-panel">
            <div class="er-label">Preguntas internas</div>
            <div class="er-question-panel-head">
              <p class="er-inline-note">Aquí se ven y editan todas las preguntas configuradas para esta sala. Cada tarjeta puede desplegarse o contraerse.</p>
              <button type="button" class="er-button er-button-mini" data-action="add-question" data-index="${index}">
                <i class="fas fa-plus"></i>
                <span>Añadir pregunta</span>
              </button>
            </div>
            <div class="er-question-list">
              ${(Array.isArray(mission.preguntas) && mission.preguntas.length)
                ? mission.preguntas.map((question, questionIndex) => renderQuestionCard(index, questionIndex, question)).join("")
                : `<div class="er-empty-inline">Esta sala no tiene preguntas configuradas todavía.</div>`}
            </div>
          </section>
        </div>
      </details>
    `;
  }).join("");

  ensureSortable();
  refreshPanels();
}

function ensureSortable() {
  if (!elements.missionEditorList || !window.Sortable) return;
  if (state.sortable) state.sortable.destroy();
  state.sortable = window.Sortable.create(elements.missionEditorList, {
    handle: ".er-drag-handle",
    animation: 150,
    onEnd(event) {
      if (!state.project) return;
      const [moved] = state.project.misiones.splice(event.oldIndex, 1);
      state.project.misiones.splice(event.newIndex, 0, moved);
      state.project.misiones = state.project.misiones.map((mission, index) => ({
        ...mission,
        release: `SALA ${String(index + 1).padStart(2, "0")}`
      }));
      renderMissionEditor();
      scheduleOutputRefresh();
    }
  });
}

function addMission() {
  const formData = getFormData();
  const questionCount = Math.max(1, Number(formData.preguntasPorSala || 1));
  if (!state.project) {
    state.project = createProjectFromForm(1);
  } else {
    state.project.misiones.push(createMissionDraft(state.project.misiones.length, {}, questionCount));
  }
  state.project = withDefaultRoutes(state.project);
  renderMissionEditor();
  renderOutputsNow();
  setStatus("Sala añadida al editor.", "info");
}

function deleteMission(index) {
  if (!state.project) return;
  state.project.misiones.splice(index, 1);
  state.project = withDefaultRoutes(state.project);
  renderMissionEditor();
  renderOutputsNow();
}

function getQuestionAt(missionIndex, questionIndex) {
  const mission = state.project?.misiones[missionIndex];
  if (!mission || !Array.isArray(mission.preguntas)) return null;
  const question = mission.preguntas[questionIndex];
  return question || null;
}

function updateMissionField(index, fieldPath, value) {
  const mission = state.project?.misiones[index];
  if (!mission) return;

  if (fieldPath === "respuestas_aceptadas") {
    mission.respuestas_aceptadas = normalizeTextList(String(value || "").split(/\r?\n+/));
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "bloqueada_inicial") {
    mission.bloqueada_inicial = Boolean(value);
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "media.tipo") {
    mission.media = normalizeMediaValue({ ...(mission.media || {}), tipo: value }) || { tipo: value, url: "", alt: "", titulo: "", texto: "" };
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "media.url" || fieldPath === "media.alt") {
    const key = fieldPath.split(".")[1];
    mission.media = normalizeMediaValue({ ...(mission.media || { tipo: "imagen" }), [key]: value }) || mission.media;
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "tipo_interaccion") {
    mission.tipo_interaccion = value;
    if (value === "opcion_multiple" && mission.opciones.length < 3) {
      mission.opciones = ["Opción A", "Opción B", "Opción C"];
    }
    if (value === "relacion_columnas" && mission.parejas.length < 3) {
      mission.parejas = normalizePairList([
        { izquierda: "Elemento 1", derecha: "Respuesta 1" },
        { izquierda: "Elemento 2", derecha: "Respuesta 2" },
        { izquierda: "Elemento 3", derecha: "Respuesta 3" }
      ]);
    }
    if (value === "opcion_multiple") {
      mission._correctOptionIndex = findCorrectOptionIndex(mission);
      if (mission._correctOptionIndex < 0) {
        mission.respuesta_correcta = "";
        mission.respuestas_aceptadas = [];
      }
    }
    renderMissionEditor();
    scheduleOutputRefresh();
    return;
  }

  mission[fieldPath] = value;
  scheduleOutputRefresh();
}

function updateQuestionField(missionIndex, questionIndex, fieldPath, value) {
  const question = getQuestionAt(missionIndex, questionIndex);
  if (!question) return;

  if (fieldPath === "respuestas_aceptadas") {
    question.respuestas_aceptadas = normalizeTextList(String(value || "").split(/\r?\n+/));
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "media.tipo") {
    question.media = normalizeMediaValue({ ...(question.media || {}), tipo: value }) || { tipo: value, url: "", alt: "", titulo: "", texto: "" };
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "media.url" || fieldPath === "media.alt") {
    const key = fieldPath.split(".")[1];
    question.media = normalizeMediaValue({ ...(question.media || { tipo: "imagen" }), [key]: value }) || question.media;
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "tipo_interaccion") {
    question.tipo_interaccion = value;
    if (value === "opcion_multiple" && (!Array.isArray(question.opciones) || question.opciones.length < 3)) {
      question.opciones = ["Opción A", "Opción B", "Opción C"];
    }
    if (value === "relacion_columnas" && (!Array.isArray(question.parejas) || question.parejas.length < 3)) {
      question.parejas = normalizePairList([
        { izquierda: "Elemento 1", derecha: "Respuesta 1" },
        { izquierda: "Elemento 2", derecha: "Respuesta 2" },
        { izquierda: "Elemento 3", derecha: "Respuesta 3" }
      ]);
    }
    if (value === "opcion_multiple") {
      question._correctOptionIndex = findCorrectOptionIndex(question);
      if (question._correctOptionIndex < 0) {
        question.respuesta_correcta = "";
        question.respuestas_aceptadas = [];
      }
    }
    renderMissionEditor();
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "subtipo_respuesta") {
    question.subtipo_respuesta = value;
    scheduleOutputRefresh();
    return;
  }

  question[fieldPath] = value;
  scheduleOutputRefresh();
}

function toggleMissionUnlock(index, targetId, checked) {
  const mission = state.project?.misiones[index];
  if (!mission) return;
  const unlocks = new Set(mission.desbloquea || []);
  if (checked) unlocks.add(targetId);
  else unlocks.delete(targetId);
  mission.desbloquea = [...unlocks];
  scheduleOutputRefresh();
}

function setCorrectOption(index, optionIndex) {
  const mission = state.project?.misiones[index];
  if (!mission) return;
  mission._correctOptionIndex = Number.isFinite(optionIndex) ? optionIndex : -1;
  const correctValue = mission.opciones[optionIndex] || "";
  mission.respuesta_correcta = correctValue;
  mission.respuestas_aceptadas = correctValue ? [correctValue] : [];
  scheduleOutputRefresh();
}

function updateOptionValue(index, optionIndex, value) {
  const mission = state.project?.misiones[index];
  if (!mission) return;
  mission.opciones[optionIndex] = value;
  if (mission._correctOptionIndex === optionIndex) {
    mission.respuesta_correcta = value;
    mission.respuestas_aceptadas = value ? [value] : [];
  }
  scheduleOutputRefresh();
}

function addOption(index) {
  const mission = state.project?.misiones[index];
  if (!mission) return;
  mission.opciones.push(`Opción ${String.fromCharCode(65 + mission.opciones.length)}`);
  renderMissionEditor();
  scheduleOutputRefresh();
}

function removeOption(index, optionIndex) {
  const mission = state.project?.misiones[index];
  if (!mission || mission.opciones.length <= 2) return;
  mission.opciones.splice(optionIndex, 1);
  mission._correctOptionIndex = findCorrectOptionIndex(mission);
  if (mission._correctOptionIndex >= 0) {
    mission.respuesta_correcta = mission.opciones[mission._correctOptionIndex] || "";
    mission.respuestas_aceptadas = mission.respuesta_correcta ? [mission.respuesta_correcta] : [];
  } else {
    mission.respuesta_correcta = "";
    mission.respuestas_aceptadas = [];
  }
  renderMissionEditor();
  scheduleOutputRefresh();
}

function updatePairValue(index, pairIndex, side, value) {
  const mission = state.project?.misiones[index];
  if (!mission) return;
  mission.parejas[pairIndex][side] = value;
  scheduleOutputRefresh();
}

function addPair(index) {
  const mission = state.project?.misiones[index];
  if (!mission) return;
  mission.parejas.push({ izquierda: `Elemento ${mission.parejas.length + 1}`, derecha: `Respuesta ${mission.parejas.length + 1}` });
  renderMissionEditor();
  scheduleOutputRefresh();
}

function removePair(index, pairIndex) {
  const mission = state.project?.misiones[index];
  if (!mission || mission.parejas.length <= 2) return;
  mission.parejas.splice(pairIndex, 1);
  renderMissionEditor();
  scheduleOutputRefresh();
}

function addQuestion(missionIndex) {
  const mission = state.project?.misiones[missionIndex];
  if (!mission) return;
  const questionIndex = Array.isArray(mission.preguntas) ? mission.preguntas.length : 0;
  if (!Array.isArray(mission.preguntas)) mission.preguntas = [];
  mission.preguntas.push(createQuestionDraft(missionIndex, questionIndex, {}));
  renderMissionEditor();
  scheduleOutputRefresh();
}

function removeQuestion(missionIndex, questionIndex) {
  const mission = state.project?.misiones[missionIndex];
  if (!mission || !Array.isArray(mission.preguntas) || mission.preguntas.length <= 1) return;
  mission.preguntas.splice(questionIndex, 1);
  mission.preguntas = mission.preguntas.map((question, index) => createQuestionDraft(missionIndex, index, question));
  renderMissionEditor();
  scheduleOutputRefresh();
}

function setQuestionCorrectOption(missionIndex, questionIndex, optionIndex) {
  const question = getQuestionAt(missionIndex, questionIndex);
  if (!question) return;
  question._correctOptionIndex = Number.isFinite(optionIndex) ? optionIndex : -1;
  const correctValue = question.opciones?.[optionIndex] || "";
  question.respuesta_correcta = correctValue;
  question.respuestas_aceptadas = correctValue ? [correctValue] : [];
  scheduleOutputRefresh();
}

function updateQuestionOptionValue(missionIndex, questionIndex, optionIndex, value) {
  const question = getQuestionAt(missionIndex, questionIndex);
  if (!question) return;
  question.opciones[optionIndex] = value;
  if (question._correctOptionIndex === optionIndex) {
    question.respuesta_correcta = value;
    question.respuestas_aceptadas = value ? [value] : [];
  }
  scheduleOutputRefresh();
}

function addQuestionOption(missionIndex, questionIndex) {
  const question = getQuestionAt(missionIndex, questionIndex);
  if (!question) return;
  if (!Array.isArray(question.opciones)) question.opciones = [];
  question.opciones.push(`Opción ${String.fromCharCode(65 + question.opciones.length)}`);
  renderMissionEditor();
  scheduleOutputRefresh();
}

function removeQuestionOption(missionIndex, questionIndex, optionIndex) {
  const question = getQuestionAt(missionIndex, questionIndex);
  if (!question || !Array.isArray(question.opciones) || question.opciones.length <= 2) return;
  question.opciones.splice(optionIndex, 1);
  question._correctOptionIndex = findCorrectOptionIndex(question);
  if (question._correctOptionIndex >= 0) {
    question.respuesta_correcta = question.opciones[question._correctOptionIndex] || "";
    question.respuestas_aceptadas = question.respuesta_correcta ? [question.respuesta_correcta] : [];
  } else {
    question.respuesta_correcta = "";
    question.respuestas_aceptadas = [];
  }
  renderMissionEditor();
  scheduleOutputRefresh();
}

function updateQuestionPairValue(missionIndex, questionIndex, pairIndex, side, value) {
  const question = getQuestionAt(missionIndex, questionIndex);
  if (!question) return;
  question.parejas[pairIndex][side] = value;
  scheduleOutputRefresh();
}

function addQuestionPair(missionIndex, questionIndex) {
  const question = getQuestionAt(missionIndex, questionIndex);
  if (!question) return;
  if (!Array.isArray(question.parejas)) question.parejas = [];
  question.parejas.push({ izquierda: `Elemento ${question.parejas.length + 1}`, derecha: `Respuesta ${question.parejas.length + 1}` });
  renderMissionEditor();
  scheduleOutputRefresh();
}

function removeQuestionPair(missionIndex, questionIndex, pairIndex) {
  const question = getQuestionAt(missionIndex, questionIndex);
  if (!question || !Array.isArray(question.parejas) || question.parejas.length <= 2) return;
  question.parejas.splice(pairIndex, 1);
  renderMissionEditor();
  scheduleOutputRefresh();
}

function wireMissionEditorEvents() {
  elements.missionEditorList.addEventListener("input", (event) => {
    const target = event.target;
    const questionField = target.dataset.questionField;
    if (questionField) {
      const missionIndex = Number(target.dataset.questionMissionIndex);
      const questionIndex = Number(target.dataset.questionIndex);
      if (Number.isNaN(missionIndex) || Number.isNaN(questionIndex)) return;

      if (questionField === "option-value") {
        updateQuestionOptionValue(missionIndex, questionIndex, Number(target.dataset.questionOptionIndex), target.value);
        return;
      }

      if (questionField === "pair-left") {
        updateQuestionPairValue(missionIndex, questionIndex, Number(target.dataset.questionPairIndex), "izquierda", target.value);
        return;
      }

      if (questionField === "pair-right") {
        updateQuestionPairValue(missionIndex, questionIndex, Number(target.dataset.questionPairIndex), "derecha", target.value);
        return;
      }

      updateQuestionField(missionIndex, questionIndex, questionField, target.type === "checkbox" ? target.checked : target.value);
      return;
    }

    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    const field = target.dataset.field;
    if (!field) return;

    if (field === "option-value") {
      updateOptionValue(index, Number(target.dataset.optionIndex), target.value);
      return;
    }

    if (field === "pair-left") {
      updatePairValue(index, Number(target.dataset.pairIndex), "izquierda", target.value);
      return;
    }

    if (field === "pair-right") {
      updatePairValue(index, Number(target.dataset.pairIndex), "derecha", target.value);
      return;
    }

    updateMissionField(index, field, target.type === "checkbox" ? target.checked : target.value);
  });

  elements.missionEditorList.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.questionAction === "set-correct-option") {
      const missionIndex = Number(target.dataset.questionMissionIndex);
      const questionIndex = Number(target.dataset.questionIndex);
      if (Number.isNaN(missionIndex) || Number.isNaN(questionIndex)) return;
      setQuestionCorrectOption(missionIndex, questionIndex, Number(target.dataset.questionOptionIndex));
      return;
    }

    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;

    if (target.dataset.action === "toggle-unlock") {
      toggleMissionUnlock(index, target.dataset.targetId, target.checked);
      return;
    }

    if (target.dataset.action === "set-correct-option") {
      setCorrectOption(index, Number(target.dataset.optionIndex));
    }
  });

  elements.missionEditorList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action], [data-question-action]");
    if (!button) return;
    const questionAction = button.dataset.questionAction;
    if (questionAction) {
      const missionIndex = Number(button.dataset.questionMissionIndex);
      const questionIndex = Number(button.dataset.questionIndex);
      if (Number.isNaN(missionIndex) || Number.isNaN(questionIndex)) return;
      if (questionAction === "delete-question") removeQuestion(missionIndex, questionIndex);
      if (questionAction === "add-option") addQuestionOption(missionIndex, questionIndex);
      if (questionAction === "remove-option") removeQuestionOption(missionIndex, questionIndex, Number(button.dataset.questionOptionIndex));
      if (questionAction === "add-pair") addQuestionPair(missionIndex, questionIndex);
      if (questionAction === "remove-pair") removeQuestionPair(missionIndex, questionIndex, Number(button.dataset.questionPairIndex));
      return;
    }

    const index = Number(button.dataset.index);
    const action = button.dataset.action;

    if (action === "delete-mission") deleteMission(index);
    if (action === "add-option") addOption(index);
    if (action === "remove-option") removeOption(index, Number(button.dataset.optionIndex));
    if (action === "add-pair") addPair(index);
    if (action === "remove-pair") removePair(index, Number(button.dataset.pairIndex));
  });
}

function wireSessionEvents() {
  elements.btnNewSession?.addEventListener("click", async () => {
    try {
      setRemoteSaveState("saving");

      await createRemoteSession({
        title: deriveSessionTitle(),
        project: null,
        formState: null,
        activate: true
      });
      setStatus("Nueva sesión vacía creada.", "success");
      setRemoteSaveState("saved");
    } catch (error) {
      console.error("No se pudo crear la sesión:", error);
      setRemoteSaveState("error", "Error al crear");
      setStatus("No fue posible crear la sesión.", "bad");
    }
  });

  elements.sessionList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-session-action]");
    if (!button) return;
    const sessionId = String(button.dataset.sessionId || "").trim();
    if (!sessionId) return;
    const action = button.dataset.sessionAction;
    if (action === "open") {
      const session = state.sessions.find((item) => item.id === sessionId);
      if (session) await loadSessionIntoEditor(session);
      return;
    }
    if (action === "rename") {
      await renameSession(sessionId);
      return;
    }
    if (action === "delete") {
      await deleteSessionById(sessionId);
    }
  });
}

function wireThemeEvents() {
  elements.themePresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const preset = THEME_PRESETS[String(button.dataset.themePreset || "").trim()];
      if (!preset) return;
      applyTheme(preset);
      saveTheme(preset);
    });
  });

  [elements.themeBgStart, elements.themeBgEnd, elements.themePrimary, elements.themeAccent].forEach((input) => {
    input?.addEventListener("input", () => {
      const theme = readThemeFromInputs();
      applyTheme(theme);
      saveTheme(theme);
    });
  });
}

function wirePreviewThemeEvents() {
  elements.previewThemePresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const presetId = String(button.dataset.previewThemePreset || "").trim();
      const preset = getPreviewPresetMeta(presetId);
      applyPreviewTheme({
        ...state.previewTheme,
        presetId,
        baseColor: preset.baseColor
      });
    });
  });

  [elements.previewBaseColor, elements.previewCardRadius].forEach((input) => {
    input?.addEventListener("input", () => {
      applyPreviewTheme(readPreviewThemeFromInputs());
    });
    input?.addEventListener("change", () => {
      applyPreviewTheme(readPreviewThemeFromInputs());
    });
  });

  elements.btnPreviewThemeReset?.addEventListener("click", () => {
    applyPreviewTheme(PREVIEW_THEME_DEFAULT);
  });
}

function isRemoteUrl(value) {
  if (typeof value !== "string") return false;
  return /^(https?:)?\/\//i.test(value);
}

/**
 * Fetch a remote resource and return its ArrayBuffer.
 * Returns null if the request fails or the response is not ok.
 */
async function fetchBinaryAsset(url) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return buffer;
  } catch (e) {
    console.warn(`Failed to fetch binary asset ${url}:`, e);
    return null;
  }
}

function inferExtensionFromContentType(contentType, fallback = "png") {
  if (!contentType) return fallback;
  const mime = contentType.toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return fallback;
}

function sanitizeFileNameForAssets(value = "", fallback = "EscapeRoom") {
  const normalized = String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

async function downloadRemoteAssets(project, remoteFiles, mediaFolder) {
  // 1. Background Image
  if (project.backgroundImage && isRemoteUrl(project.backgroundImage)) {
    const buffer = await fetchBinaryAsset(project.backgroundImage);
    if (buffer) {
      const ext = inferExtensionFromContentType("image/png", "png"); // fallback content-type; actual type not needed for extension inference here
      const fileName = `${mediaFolder}/${sanitizeFileNameForAssets(project.titulo, "escape-room")}-background.${ext}`;
      remoteFiles[fileName] = new Uint8Array(buffer);
      project.backgroundImage = fileName;
    }
  }

  // 2. Misiones
  if (Array.isArray(project.misiones)) {
    for (const [index, mission] of project.misiones.entries()) {
      const missionBase = sanitizeFileNameForAssets(mission.id || `mission-${index + 1}`, "mission");

      // Mission imagen
      if (mission.imagen && isRemoteUrl(mission.imagen)) {
        const buffer = await fetchBinaryAsset(mission.imagen);
        if (buffer) {
          const ext = inferExtensionFromContentType("image/png", "png");
          const fileName = `${mediaFolder}/${missionBase}-reference.${ext}`;
          remoteFiles[fileName] = new Uint8Array(buffer);
          mission.imagen = fileName;
          if (mission.media && mission.media.tipo === "imagen") {
            mission.media.url = fileName;
          }
        }
      }

      // Mission media
      if (mission.media?.url && isRemoteUrl(mission.media.url)) {
        const buffer = await fetchBinaryAsset(mission.media.url);
        if (buffer) {
          const ext = inferExtensionFromContentType("application/octet-stream", mission.media.tipo === "audio" ? "mp3" : mission.media.tipo === "video" ? "mp4" : "png");
          const fileName = `${mediaFolder}/${missionBase}-media.${ext}`;
          remoteFiles[fileName] = new Uint8Array(buffer);
          mission.media.url = fileName;
        }
      }

      // 3. Preguntas
      if (Array.isArray(mission.preguntas)) {
        for (const [questionIndex, question] of mission.preguntas.entries()) {
          const questionBase = `${missionBase}-${sanitizeFileNameForAssets(question.id || `question-${questionIndex + 1}`, "question")}`;

          // Question imagen
          if (question.imagen && isRemoteUrl(question.imagen)) {
            const buffer = await fetchBinaryAsset(question.imagen);
            if (buffer) {
              const ext = inferExtensionFromContentType("image/png", "png");
              const fileName = `${mediaFolder}/${missionBase}-${questionIndex}-question.${ext}`;
              remoteFiles[fileName] = new Uint8Array(buffer);
              question.imagen = fileName;
              if (question.media && question.media.tipo === "imagen") {
                question.media.url = fileName;
              }
            }
          }

          // Question media
          if (question.media?.url && isRemoteUrl(question.media.url)) {
            const buffer = await fetchBinaryAsset(question.media.url);
            if (buffer) {
              const ext = inferExtensionFromContentType("application/octet-stream", question.media.tipo === "audio" ? "mp3" : question.media.tipo === "video" ? "mp4" : "png");
              const fileName = `${mediaFolder}/${missionBase}-${questionIndex}-${question.media.tipo}.${ext}`;
              remoteFiles[fileName] = new Uint8Array(buffer);
              question.media.url = fileName;
            }
          }
        }
      }
    }
  }
}

async function exportPackage() {
  const originalProject = materializeProjectForExport();
  if (!originalProject) return;
  const validation = validateProjectSetup(originalProject);
  if (validation.issues.length) {
    setStatus(`No se puede exportar: ${validation.issues.join(" · ")}`, "bad");
    return;
  }
  const JSZipCtor = window.htmlDocx?.JSZip || window.JSZip;
  if (!JSZipCtor) {
    setStatus("JSZip no está disponible en esta pantalla.", "warning");
    return;
  }

  setStatus("Descargando recursos remotos para empaquetado...", "info");

  const projectClone = clonePlainObject(originalProject);
  const remoteFiles = {};
  const mediaFolder = "assets/media";

  await downloadRemoteAssets(projectClone, remoteFiles, mediaFolder);

  try {
    const logoBuffer = await fetchBinaryAsset("logo.png");
    if (logoBuffer) {
      remoteFiles["logo.png"] = new Uint8Array(logoBuffer);
    }
  } catch (e) {
    console.warn("No se pudo descargar logo.png para el paquete:", e);
  }

  const pkg = buildEscapeRoomPackage(projectClone);
  const zip = new JSZipCtor();

  Object.entries(pkg.files).forEach(([path, content]) => {
    if (typeof content === "string" && content.startsWith("data:")) {
      const [, base64 = ""] = content.split(",");
      zip.file(path, base64, { base64: true });
      return;
    }
    zip.file(path, content);
  });

  Object.entries(remoteFiles).forEach(([path, blob]) => {
    // `blob` is a Uint8Array containing binary data. Explicitly mark as binary for JSZip.
    zip.file(path, blob, { binary: true });
  });

  setStatus("Generando paquete ZIP...", "info");

  let blob = null;
  if (typeof zip.generateAsync === "function") {
    blob = await zip.generateAsync({ type: "blob" });
  } else if (typeof zip.generate === "function") {
    blob = zip.generate({ type: "blob" });
  } else {
    throw new Error("La librería ZIP cargada no soporta generateAsync ni generate.");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${pkg.downloadName}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Paquete ZIP generado con index.html y assets.", "success");
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("", "info");

  const formData = getFormData();
  if (!formData.tema) {
    setStatus("Escribe un tema curricular antes de generar el escape room.", "warning");
    document.getElementById("temaInput")?.focus();
    return;
  }

  if (formData.misiones < 2 || formData.misiones > 8) {
    setStatus("El número de salas debe estar entre 2 y 8.", "warning");
    document.getElementById("numMisionesInput")?.focus();
    return;
  }

  if (formData.preguntasPorSala < 1 || formData.preguntasPorSala > 6) {
    setStatus("Las preguntas por sala deben estar entre 1 y 6.", "warning");
    document.getElementById("preguntasPorSalaInput")?.focus();
    return;
  }

  setLoading(true);
  state.isGenerating = true;
  state.project = null;
  state.generationNote = "";
  refreshPanels();

  try {
    const generated = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: {
        model: formData.modelo || TEXT_MODEL_DEFAULT,
        payload: {
          systemInstruction: {
            parts: [{
              text: [
                "Responde únicamente con JSON válido.",
                "Escribe en español latinoamericano neutral (es-419).",
                "Mantén coherencia visual por escape room.",
                "Respeta exactamente la cantidad de salas y preguntas solicitadas.",
                "Cada sala debe tener progresión clara y rutas de desbloqueo simples."
              ].join(" ")
            }]
          },
          contents: [{ role: "user", parts: [{ text: buildPrompt(formData) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.72
          }
        }
      }
    });

    const rawText = generated?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = extractGeneratedJson(rawText);

    // Limpiar URLs de imágenes ficticias / marcadores de posición generados por la IA
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.misiones)) {
        for (const mission of parsed.misiones) {
          if (mission.media && typeof mission.media === "object") {
            if (mission.media.url && !mission.media.url.startsWith("data:")) {
              mission.media.url = "";
            }
          }
          if (Array.isArray(mission.preguntas)) {
            for (const question of mission.preguntas) {
              if (question.media && typeof question.media === "object") {
                if (question.media.url && !question.media.url.startsWith("data:")) {
                  question.media.url = "";
                }
              }
            }
          }
        }
      }
    }

    const validation = validateProjectSetup(parsed);
    if (validation.issues.length) {
      state.project = null;
      renderMissionEditor();
      refreshPanels();
      setStatus(`La IA generó salas inválidas: ${validation.issues.join(" · ")}`, "bad");
      return;
    }

    const alignment = fitProjectToConfiguredCounts(validation.project, formData);
    const project = {
      ...alignment.project,
      themeConfig: normalizePreviewThemeConfig(state.previewTheme),
      duracion_minutos: formData.duracion
    };
    const alignmentNote = alignment.adjusted
      ? `Ajustado a ${formData.misiones} salas${formData.preguntasPorSala ? ` y ${formData.preguntasPorSala} preguntas por sala` : ""}`
      : "";

    // Establecer proyecto en el estado y renderizar texto/preview inmediatamente
    state.project = project;
    state.generationNote = `${alignmentNote ? `${alignmentNote} · ` : ""}Generando imágenes en segundo plano...`;

    renderMissionEditor();
    renderOutputsNow();
    setActiveTab("preview");
    setLoading(false);
    setStatus(
      `Generado: "${state.project.titulo}" · ${state.project.misiones.length} salas · ${formData.duracion} min · ${state.generationNote}`,
      "success"
    );

    // Iniciar la generación de imágenes de forma asíncrona en segundo plano
    (async () => {
      try {
        let coverImage = "";
        try {
          coverImage = await generateCoverImage(project, formData);
          if (coverImage) {
            project.backgroundImage = coverImage;
            renderOutputsNow();
          }
        } catch (e) {
          console.warn("No se pudo generar la portada en segundo plano:", e);
        }

        const imageStats = await generateMissionImages(project, formData, (current, total) => {
          const progressNote = `Generando imágenes (${current}/${total})...`;
          state.generationNote = `${alignmentNote ? `${alignmentNote} · ` : ""}${coverImage ? "1 portada · " : ""}${progressNote}`;
          renderMissionEditor();
          renderOutputsNow();
          setStatus(
            `Generado: "${project.titulo}" · ${project.misiones.length} salas · ${formData.duracion} min · ${state.generationNote}`,
            "success"
          );
        });

        // Estado de finalización
        state.generationNote = `${alignmentNote ? `${alignmentNote} · ` : ""}${coverImage ? "1 portada · " : ""}${imageStats.generated}/${imageStats.total} imágenes funcionales listas${imageStats.failed ? ` · ${imageStats.failed} sin imagen` : ""}`;
        renderMissionEditor();
        renderOutputsNow();
        setStatus(
          `Generado: "${project.titulo}" · ${project.misiones.length} salas · ${formData.duracion} min · ${state.generationNote}`,
          "success"
        );
      } catch (bgError) {
        console.error("Error en la generación de imágenes en segundo plano:", bgError);
      } finally {
        state.isGenerating = false;
        refreshPanels();
      }
    })();
  } catch (error) {
    console.error(error);
    setStatus(`No se pudo generar el escape room: ${error.message}`, "bad");
    state.project = null;
    state.isGenerating = false;
    renderMissionEditor();
    refreshPanels();
  } finally {
    setLoading(false);
  }
});

elements.btnAddMission.addEventListener("click", addMission);
elements.btnExportar.addEventListener("click", exportPackage);
elements.btnPublicar?.addEventListener("click", publishActiveSession);

elements.btnCopiarJson.addEventListener("click", async () => {
  const project = materializeProjectForExport();
  if (!project) return;
  const validation = validateProjectSetup(project);
  if (validation.issues.length) {
    setStatus(`No se puede copiar el JSON: ${validation.issues.join(" · ")}`, "bad");
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(project, null, 2));
    setStatus("JSON copiado al portapapeles.", "success");
  } catch {
    setStatus("No fue posible copiar el JSON en este navegador.", "warning");
  }
});

async function sugerirObjetivoFinal() {
  const tema = String(document.getElementById("temaInput")?.value || "").trim();
  if (!tema) {
    setStatus("Por favor, ingresa primero un tema curricular para poder sugerir un objetivo.", "warning");
    document.getElementById("temaInput")?.focus();
    return;
  }

  const numMisiones = document.getElementById("numMisionesInput")?.value || 4;
  const preguntasPorSala = document.getElementById("preguntasPorSalaInput")?.value || 1;
  const duracion = document.getElementById("duracionInput")?.value || 35;
  const narrativa = elements.narrativaSelect?.value || "";

  const btn = elements.btnSugerirObjetivo;
  const originalText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Pensando...</span>`;
  }
  try {
    const model = elements.modeloSelect?.value || TEXT_MODEL_DEFAULT;
    const response = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: {
        model,
        payload: {
          systemInstruction: {
            parts: [{
              text: "Eres un experto diseñador instruccional y de escape rooms educativos. Tu tarea es generar un Brief detallado y estructurado de objetivos pedagógicos, narrativa y diseño para la creación del escape room. Escribe única y exclusivamente en español latinoamericano neutro (es-419). Queda estrictamente prohibido utilizar modismos o conjugaciones verbales típicas de España (como vosotros, tenéis, deberéis, etc.). Debes estructurar el texto obligatoriamente en 5 secciones separadas por saltos de línea:\n1) PROPÓSITO PEDAGÓGICO GENERAL (aprendizajes, habilidades y competencias que se desarrollarán en relación al tema curricular).\n2) NARRATIVA INICIAL Y REGLAS DE ESCAPE (el gancho de la historia, las reglas de juego implícitas y cómo se enlazan las pistas y el progreso visual).\n3) ENFOQUE DIDÁCTICO POR SALA (para cada una de las salas indicadas define con precisión qué subtema o concepto se abordará y el tipo de desafío cognitivo o lógico a resolver. Asimismo, describe detalladamente qué elementos y referencias visuales explícitas -como mapas, leyendas, coordenadas o símbolos específicos- DEBEN contener las imágenes de apoyo para que los alumnos puedan resolver la pregunta).\n4) CANDADOS, LLAVES Y MECANISMOS DE BLOQUEO (diseñar qué tipo de candado físico o digital, código de dirección, combinación de colores, contraseña numérica o llaves físicas se asocian a cada reto para bloquear y desbloquear el progreso).\n5) CLÍMAX Y CONCLUSIÓN (la resolución del gran enigma final en el panel de control o cierre del escape room).\n\nSé sumamente descriptivo y propón metas claras y coherentes para que el motor de generación de salas lo entienda perfectamente."
            }]
          },
          contents: [{
            role: "user",
            parts: [{
              text: `Tema curricular: "${tema}"\nNarrativa: "${narrativa}"\nCantidad de salas/misiones: ${numMisiones}\nPreguntas por sala: ${preguntasPorSala}\nDuración total: ${duracion} minutos\n\nGenera el Brief estructurado de 5 secciones detallando el Propósito Pedagógico General, la Narrativa Inicial/Reglas de progreso, el Enfoque Didáctico por sala (con detalles explícitos para las imágenes correspondientes), los Candados/Llaves/Mecanismos de bloqueo de cada desafío y el Clímax/Conclusión. Usa guiones sencillos (-) para listar salas e ítems. Escribe todo en texto plano con saltos de línea. No utilices negritas de markdown (**), símbolos complejos ni etiquetas HTML.`
            }]
          }],
          generationConfig: {
            temperature: 0.9
          }
        }
      }
    });

    const generatedText = String(response?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (generatedText) {
      const objetivoInput = document.getElementById("objetivoInput");
      if (objetivoInput) {
        objetivoInput.value = generatedText;
        saveFormState();
        setStatus("Objetivo final sugerido exitosamente por la IA.", "success");
      }
    } else {
      setStatus("No se recibió una sugerencia clara de la IA. Intenta de nuevo.", "warning");
    }
  } catch (err) {
    console.error("Error al sugerir objetivo final:", err);
    setStatus("Error al generar el objetivo. Intenta de nuevo.", "bad");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

elements.btnSugerirObjetivo?.addEventListener("click", sugerirObjetivoFinal);

elements.btnLimpiar.addEventListener("click", () => {
  state.formPersistenceSuspended = true;
  try {
    clearFormState();
    clearProjectState();
    elements.form.reset();
    document.getElementById("duracionInput").value = 35;
    document.getElementById("numMisionesInput").value = 4;
    document.getElementById("preguntasPorSalaInput").value = 1;
    document.getElementById("ritmoSelect").value = "progresivo";
    document.getElementById("dificultadSelect").value = "equilibrada";
    document.getElementById("pistasSelect").value = "moderadas";
    elements.modeloSelect.value = TEXT_MODEL_DEFAULT;
    state.project = null;
    state.generationNote = "";
    elements.jsonPreview.textContent = "";
    elements.previewFrame.removeAttribute("srcdoc");
    renderMissionEditor();
    renderOutputsNow();
    setStatus("Formulario y editor listos para un nuevo escape room.", "info");
  } finally {
    state.formPersistenceSuspended = false;
    syncNarrativaCustomField();
  }
});

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.erTab || "preview"));
});

if (elements.form) {
  elements.form.addEventListener("input", saveFormState);
  elements.form.addEventListener("change", saveFormState);
}

elements.modeloSelect?.addEventListener("change", saveFormState);

elements.narrativaSelect?.addEventListener("change", syncNarrativaCustomField);

restoreFormState();
restoreProjectState();
restoreTheme();
restorePreviewTheme({ preferProject: true });
syncNarrativaCustomField();
wireMissionEditorEvents();
wireSessionEvents();
wireThemeEvents();
wirePreviewThemeEvents();
renderMissionEditor();
renderOutputsNow();
setActiveTab("preview");
renderSessionList();
setRemoteSaveState("idle");
