import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
import { authFetchJson, buildApiUrl, buildVeoApiUrl, hasAvailableApiBase } from "./api-client.js";
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
  replacePrimaryAcceptedAnswer,
  normalizePresentationMode,
  normalizeMissionTitle,
  normalizeMissionRelease,
  resolveTextSubtypeForAnswer,
  extractSingleWordAnswer,
  buildSingleWordChallenge,
  buildMissionId,
  validateQuestionAnswer
} from "./escape-room-creator-model.mjs";
import {
  buildEscapeRoomPackage,
  buildPreviewDocument
} from "./escape-room-package-builder.mjs";
import {
  findEscapeRoomManifestPath,
  isSafeArchivePath,
  restorePigPenArchiveAssets
} from "./escape-room-zip-import.mjs";

const app = getDefaultFirebaseApp();
void bootstrapFirebaseAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);

const TEXT_MODEL_DEFAULT = "gemini-2.5-flash";
// Gemini 3 Pro Image prioriza instrucciones complejas y renderizado de texto cuando
// sea inevitable. En PigPen, el texto evaluable se mantiene fuera de la imagen.
const IMAGE_MODEL = "gemini-3-pro-image";
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
const BRIEF_WIDTH_STORAGE_KEY = "PigPenCreator.briefWidth.v1";
const BRIEF_WIDTH_DEFAULT = 340;
const BRIEF_WIDTH_MIN = 280;
const BRIEF_WIDTH_MAX = 560;
// El estudio multipanel cabe desde una tablet grande / laptop compacta.
// Reservar los drawers hasta 1439px hacia que incluso ventanas amplias
// parecieran la version movil.
const STUDIO_DESKTOP_MEDIA = "(min-width: 1024px)";
const ESCAPE_ROOM_COLLECTION = "escapeRoom";
const TOPICS_SUBCOLLECTION = "topics";
const SESSION_SCHEMA_VERSION = 2;
const SESSION_TITLE_DEFAULT = "Sesion sin titulo";
const PRESENTATION_MODE_ROOMS = "salas";
const PRESENTATION_MODE_MENU = "menu_secciones";
const DEFAULT_INSTRUCTIONS_BY_PRESENTATION = Object.freeze({
  salas: "Recorre cada sala en orden, resuelve sus desafíos y reúne las claves para completar la misión.",
  menu_secciones: "Lee la introducción y las instrucciones. Completa cada actividad en orden para desbloquear el mensaje final."
});
const TEXT_SUBTYPES = ["palabra", "frase_libre", "letra", "numero", "codigo_corto"];
const TEXT_SUBTYPE_LABELS = Object.freeze({
  palabra: "Palabra exacta",
  frase_libre: "Frase libre",
  letra: "Letra",
  numero: "Número",
  codigo_corto: "Código corto"
});
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
const PROMPT_LANGUAGE_MODES = {
  "es-mx": {
    name: "Español latinoamericano (es-MX)",
    directive: "Escribe todo en español latinoamericano neutro (es-419), sin modismos de España."
  },
  "es-419": {
    name: "Español latinoamericano (es-419)",
    directive: "Escribe todo en español latinoamericano neutral (es-419), sin modismos de España."
  },
  "es-es": {
    name: "Español de España (es-ES)",
    directive: "Escribe todo en español de España (es-ES), con usos y tono propios de España."
  },
  "en-us": {
    name: "Inglés (en-US)",
    directive: "Write all content in U.S. English (en-US), concise and clear."
  },
  "en-gb": {
    name: "English (en-GB)",
    directive: "Write all content in British English (en-GB), clear and concise."
  },
  "fr-fr": {
    name: "Francés (fr-FR)",
    directive: "Écris tout le contenu en français (fr-FR), de manière claire et concise."
  },
  "pt-br": {
    name: "Português (pt-BR)",
    directive: "Escreva todo o conteúdo em português brasileiro (pt-BR), claro e direto."
  }
};
const MISSION_LEVEL_COLORS = {
  1: "#fcc659",
  2: "#bbd152",
  3: "#e95297",
  4: "#02b0a3"
};
const THEME_COMBINE_COLORS = {
  1: "#2da6b1",
  2: "#ea5a5a",
  3: "#952e89",
  4: "#e48119"
};
const SUPPORT_GRAPHIC_UPLOAD_ENDPOINT = "/api/unidades/support-graphics/upload";
const DATA_URL_PATTERN = /^data:([^;,]+)(;[^,]*)?,(.*)$/i;
const GENERIC_PISTA_MARKERS = [
  "pista sutil",
  "pista util",
  "pista útil",
  "añade una pista",
  "añade una pista útil",
  "agrega una pista",
  "agrega pista",
  "sin dar respuesta",
  "pista para resolver",
  "sin definir",
  "sin pista",
  "texto de pista",
  "instrucción de pista",
  "introducción de pista",
  "sugerencia",
  "pista breve"
];
const QUESTION_HINT_MIN_LENGTH = 24;
const QUESTION_HINT_STOP_WORDS = new Set([
  "de", "del", "al", "la", "el", "los", "las", "un", "una", "uno", "una", "y", "o", "a", "en", "con", "para", "por", "sin", "sobre", "entre", "que", "del", "su", "sus", "es", "son", "sino", "tambien", "también", "cada", "cuando", "cuál", "cual", "donde", "dónde", "quien", "quién", "como", "cómo", "porque", "pues", "pero", "siempre", "nunca", "si", "no", "ser", "este", "esta", "estos", "estas", "esos", "esas", "ese", "esa", "aquellos", "aquellas", "lo", "me", "te", "nos", "vos", "ellos", "ellas", "nosotros", "vosotros", "yo", "más", "mas", "muy", "tan", "tal", "todo", "toda", "todos", "todas", "ningun", "ninguna", "ninguno", "ningunos", "ningunas", "aqui", "aca", "solo", "sólo", "hay", "ya", "tambien", "también", "bien", "dentro", "entre", "fue", "fueron", "ser", "estar", "son", "era", "eran", "eran", "sera", "tambien", "si", "como", "cuando", "quien", "donde"
]);

function cleanHintText(value = "") {
  return normalizeString(value, "").trim();
}

function hasConcreteHintSignal(value = "") {
  const normalized = cleanHintText(value).toLowerCase();
  if (!normalized) return false;
  if (/\d/.test(normalized)) return true;
  const concretePatterns = /\b(color|número|numero|cantidad|valor|suma|resta|compara|compara|encuentra|busca|identifica|coincid|relacion|orden|secuencia|personaje|lugar|objeto|acción|accion|condición|condicion|fórmula|formula|método|metodo|cifra|fecha)\b/i;
  if (concretePatterns.test(normalized)) return true;
  const words = normalized.match(/[a-záéíóúüñ]{4,}/gi);
  return Array.isArray(words) && words.length >= 5;
}

function isGenericHint(value = "") {
  const normalized = cleanHintText(value).toLowerCase();
  if (!normalized) return true;
  if (normalized.length < QUESTION_HINT_MIN_LENGTH) return true;
  if (new Set(normalized.split(/\s+/)).size <= 3) return true;
  if (!hasConcreteHintSignal(normalized)) return true;
  return GENERIC_PISTA_MARKERS.some((marker) => normalized === marker || normalized.includes(marker));
}

function extractQuestionHintKeywords(text = "") {
  const sentence = cleanHintText(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  if (!sentence) return [];
  const words = sentence
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3)
    .filter((word) => !QUESTION_HINT_STOP_WORDS.has(word));

  const unique = [...new Set(words)];
  return unique.slice(0, 3);
}

function buildFallbackHint({ reto = "", missionTitle = "", respuestas = [] }, fallbackLabel = "" ) {
  const answerList = Array.isArray(respuestas) ? respuestas : [respuestas];
  const answerHints = extractQuestionHintKeywords(answerList.join(" "));
  const tokens = extractQuestionHintKeywords(`${reto} ${missionTitle} ${fallbackLabel}`).filter((token) => !answerHints.includes(token));
  if (tokens.length) {
    const sample = tokens.slice(0, 2).map((token) => `"${token}"`).join(" y ");
    return `En el enunciado${fallbackLabel ? ` ${fallbackLabel}` : ""}, usa el detalle ${sample} para descartar opciones que no cumplan esa condición.`;
  }

  const missionContext = missionTitle ? ` Usa el contexto de ${missionTitle}.` : "";
  return `Lee con atención el enunciado y busca una pista concreta (número, acción, personaje, lugar o condición). No des la respuesta; identifica qué detalle permite descartar opciones incorrectas.${missionContext}`.trim();
}

function normalizeQuestionHint(question = {}, missionTitle = "", fallbackLabel = "") {
  const current = cleanHintText(question.pista);
  const reto = cleanHintText(question.reto || "");
  const corrected = isGenericHint(current)
    ? buildFallbackHint({ reto, missionTitle, respuestas: question.respuestas_aceptadas || [] }, fallbackLabel)
    : current;
  return cleanHintText(corrected);
}

const elements = {
  form: document.getElementById("escapeRoomForm"),
  missionEditorList: document.getElementById("missionEditorList"),
  missionEmpty: document.getElementById("erMissionEmpty"),
  btnGenerar: document.getElementById("btnGenerar"),
  btnLimpiar: document.getElementById("btnLimpiar"),
  btnExportar: document.getElementById("btnExportar"),
  btnRepairEscapeRoom: document.getElementById("btnRepairEscapeRoom"),
  btnPreviewAutofill: document.getElementById("btnPreviewAutofill"),
  publishToggle: document.getElementById("publishToggle"),
  publishSwitchLabel: document.getElementById("publishSwitchLabel"),
  btnCopiarJson: document.getElementById("btnCopiarJson"),
  btnSugerirObjetivo: document.getElementById("btnSugerirObjetivo"),
  objectiveIdeaModal: document.getElementById("objectiveIdeaModal"),
  objectiveIdeaTextarea: document.getElementById("objectiveIdeaTextarea"),
  btnObjectiveIdeaGenerate: document.getElementById("btnObjectiveIdeaGenerate"),
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
  nivelSelect: document.getElementById("nivelSelect"),
  gradoSelect: document.getElementById("gradoSelect"),
  trimestreSelect: document.getElementById("trimestreSelect"),
  materiaSelect: document.getElementById("materiaSelect"),
  unidadTemaLabel: document.getElementById("unidadTemaLabel"),
  unidadTemaSelect: document.getElementById("unidadTemaSelect"),
  estacionField: document.getElementById("estacionField"),
  estacionSelect: document.getElementById("estacionSelect"),
  narrativaSelect: document.getElementById("narrativaSelect"),
  narrativaCustomField: document.getElementById("narrativaCustomField"),
  narrativaCustomInput: document.getElementById("narrativaCustomInput"),
  estiloImagenSelect: document.getElementById("estiloImagenSelect"),
  missionCount: document.getElementById("erMissionCount"),
  unlockedCount: document.getElementById("erUnlockedCount"),
  typeSummary: document.getElementById("erTypeSummary"),
  btnNewSession: document.getElementById("btnNewSession"),
  btnAddTopic: document.getElementById("btnAddTopic"),
  newTopicModal: document.getElementById("erNewTopicModal"),
  newTopicForm: document.getElementById("erNewTopicForm"),
  newTopicNumber: document.getElementById("erNewTopicNumber"),
  newTopicError: document.getElementById("erNewTopicError"),
  topicList: document.getElementById("erTopicList"),
  topicEmpty: document.getElementById("erTopicEmpty"),
  newSessionModal: document.getElementById("erNewSessionModal"),
  btnCreateBlankSession: document.getElementById("btnCreateBlankSession"),
  btnImportZipSession: document.getElementById("btnImportZipSession"),
  importZipInput: document.getElementById("erImportZipInput"),
  importZipStatus: document.getElementById("erImportZipStatus"),
  sessionList: document.getElementById("erSessionList"),
  sessionsLoading: document.getElementById("erSessionsLoading"),
  sessionsEmpty: document.getElementById("erSessionsEmpty"),
  themeBgStart: document.getElementById("themeBgStart"),
  themeBgEnd: document.getElementById("themeBgEnd"),
  themePrimary: document.getElementById("themePrimary"),
  themeAccent: document.getElementById("themeAccent"),
  themePresetButtons: Array.from(document.querySelectorAll("[data-theme-preset]")),
  previewThemePresetButtons: Array.from(document.querySelectorAll("[data-preview-theme-preset]")),
  previewBaseColor: document.getElementById("previewBaseColor"),
  previewCardRadius: document.getElementById("previewCardRadius"),
  previewThemeSummary: document.getElementById("previewThemeSummary"),
  previewRoomPaletteReference: document.getElementById("previewRoomPaletteReference"),
  btnPreviewThemeReset: document.getElementById("btnPreviewThemeReset"),
  activityImageInput: document.getElementById("activityImageInput"),
  idiomaSelect: document.getElementById("idiomaSelect"),
  strictImagePromptMode: document.getElementById("strictImagePromptMode"),
  modoPresentacionSelect: document.getElementById("modoPresentacionSelect"),
  presentationModeHelp: document.getElementById("erPresentationModeHelp"),
  missionFieldLabel: document.getElementById("erMissionFieldLabel"),
  questionCountLabel: document.getElementById("erQuestionCountLabel"),
  addMissionLabel: document.getElementById("erAddMissionLabel"),
  missionCountLabel: document.getElementById("erMissionCountLabel"),
  unlockedCountLabel: document.getElementById("erUnlockedCountLabel"),
  studioKicker: document.getElementById("erStudioKicker"),
  studioTitle: document.getElementById("erStudioTitle"),
  studioHelp: document.getElementById("erStudioHelp"),
  generalContentCard: document.getElementById("erGeneralContentCard"),
  generalContentHelp: document.getElementById("erGeneralContentHelp"),
  generalContentInputs: Array.from(document.querySelectorAll("[data-project-field]")),
  summaryCard: document.querySelector(".er-summary-card"),
  studioWorkspace: document.getElementById("erStudioWorkspace"),
  briefPanel: document.getElementById("briefCollapse"),
  briefResizeHandle: document.getElementById("erBriefResizeHandle"),
  inspectorPanel: document.getElementById("erInspectorPanel"),
  inspectorContentPanel: document.getElementById("erInspectorContentPanel"),
  inspectorRoomsPanel: document.getElementById("erInspectorRoomsPanel"),
  inspectorTabButtons: Array.from(document.querySelectorAll("[data-er-inspector-tab]")),
  inspectorTabPanels: Array.from(document.querySelectorAll("[data-er-inspector-panel]")),
  panelToggleButtons: Array.from(document.querySelectorAll("[data-studio-panel-toggle]")),
  studioBackdrop: document.getElementById("erStudioBackdrop"),
  missionWorkspacePanel: document.getElementById("erMissionWorkspacePanel"),
  missionNavigatorList: document.getElementById("erMissionNavigatorList"),
  roomListTitle: document.getElementById("erRoomListTitle")
};

let objectiveIdeaModalInstance = null;
let newSessionModalInstance = null;
let newTopicModalInstance = null;

const state = {
  project: null,
  generationNote: "",
  activeTab: "preview",
  isLoading: false,
  isGenerating: false,
  formPersistenceSuspended: false,
  refreshHandle: null,
  sortable: null,
  selectedMissionId: null,
  selectedQuestionId: null,
  expandedMissionIds: new Set(),
  inspectorTab: "rooms",
  briefOpen: true,
  inspectorOpen: true,
  activeDrawer: null,
  panelReturnFocus: null,
  sessionMenuId: null,
  sessionMenuReturnFocus: null,
  briefWidth: BRIEF_WIDTH_DEFAULT,
  projectStorageNoticeShown: false,
  sessions: [],
  topics: [],
  activeTopicId: "",
  topicsLoading: false,
  activeSessionId: "",
  activeSessionMeta: null,
  sessionsLoading: true,
  sessionSaveHandle: null,
  sessionSaveInFlight: false,
  sessionSaveQueued: false,
  isHydratingFromRemote: false,
  suspendSessionSave: false,
  saveState: "idle",
  currentUser: null,
  previewTheme: { ...PREVIEW_THEME_DEFAULT },
  pendingImageReplacementTarget: null
};

function isStudioDesktop() {
  return window.matchMedia(STUDIO_DESKTOP_MEDIA).matches;
}

function mountStudioPanels() {
  if (!elements.studioWorkspace) return;
  if (elements.generalContentCard && elements.inspectorContentPanel) {
    elements.inspectorContentPanel.append(elements.generalContentCard);
  }
  if (elements.briefPanel && elements.studioBackdrop) {
    elements.studioWorkspace.insertBefore(elements.briefPanel, elements.studioBackdrop);
  }
}

function syncSummaryBarHeight() {
  const height = Math.ceil(elements.summaryCard?.getBoundingClientRect().height || 0);
  if (height > 0) document.querySelector(".er-page")?.style.setProperty("--er-summary-height", `${height}px`);
}

function wireSummaryBarMeasurements() {
  syncSummaryBarHeight();
  if (typeof window.ResizeObserver === "function" && elements.summaryCard) {
    const observer = new window.ResizeObserver(syncSummaryBarHeight);
    observer.observe(elements.summaryCard);
  }
  window.addEventListener("resize", syncSummaryBarHeight);
}

function setInspectorTab(tabName = "rooms") {
  const nextTab = ["topics", "content", "rooms"].includes(tabName) ? tabName : "rooms";
  state.inspectorTab = nextTab;
  elements.inspectorTabButtons.forEach((button) => {
    const active = button.dataset.erInspectorTab === nextTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  elements.inspectorTabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.erInspectorPanel !== nextTab);
  });
}

function getBriefWidthLimit() {
  if (!elements.studioWorkspace || !isStudioDesktop()) return BRIEF_WIDTH_MAX;
  const workspaceWidth = elements.studioWorkspace.clientWidth || window.innerWidth;
  const sessionsWidth = document.querySelector(".er-sessions-panel")?.offsetWidth || 220;
  const inspectorWidth = state.inspectorOpen ? (elements.inspectorPanel?.offsetWidth || 220) : 0;
  return Math.max(BRIEF_WIDTH_MIN, Math.min(BRIEF_WIDTH_MAX, workspaceWidth - sessionsWidth - inspectorWidth - 360));
}

function applyBriefWidth(width, { persist = false } = {}) {
  const maxWidth = getBriefWidthLimit();
  const nextWidth = Math.round(Math.min(maxWidth, Math.max(BRIEF_WIDTH_MIN, Number(width) || BRIEF_WIDTH_DEFAULT)));
  state.briefWidth = nextWidth;
  elements.studioWorkspace?.style.setProperty("--er-brief-width", `${nextWidth}px`);
  elements.briefResizeHandle?.setAttribute("aria-valuemax", String(maxWidth));
  elements.briefResizeHandle?.setAttribute("aria-valuenow", String(nextWidth));
  if (persist && isLocalStorageAvailable()) {
    window.localStorage.setItem(BRIEF_WIDTH_STORAGE_KEY, String(nextWidth));
  }
}

function restoreBriefWidth() {
  let savedWidth = BRIEF_WIDTH_DEFAULT;
  if (isLocalStorageAvailable()) {
    savedWidth = Number(window.localStorage.getItem(BRIEF_WIDTH_STORAGE_KEY)) || BRIEF_WIDTH_DEFAULT;
  }
  applyBriefWidth(savedWidth);
}

function getPanelByName(panelName) {
  return panelName === "brief" ? elements.briefPanel : elements.inspectorPanel;
}

function syncStudioPanels() {
  const desktop = isStudioDesktop();
  const briefVisible = desktop ? state.briefOpen : state.activeDrawer === "brief";
  const inspectorVisible = desktop ? state.inspectorOpen : state.activeDrawer === "inspector";
  elements.briefPanel?.classList.toggle("is-open", briefVisible);
  elements.inspectorPanel?.classList.toggle("is-open", inspectorVisible);
  if (elements.briefPanel) elements.briefPanel.inert = !briefVisible;
  if (elements.inspectorPanel) elements.inspectorPanel.inert = !inspectorVisible;
  elements.briefPanel?.setAttribute("aria-hidden", String(!briefVisible));
  elements.inspectorPanel?.setAttribute("aria-hidden", String(!inspectorVisible));
  elements.panelToggleButtons.forEach((button) => {
    const panelName = button.dataset.studioPanelToggle;
    const expanded = panelName === "brief" ? briefVisible : inspectorVisible;
    button.setAttribute("aria-expanded", String(expanded));
    const actionLabel = `${expanded ? "Cerrar" : "Abrir"} ${panelName === "brief" ? "brief" : "panel de contenido"}`;
    button.setAttribute("aria-label", actionLabel);
    button.dataset.erTooltip = actionLabel;
  });
  const drawerOpen = !desktop && Boolean(state.activeDrawer);
  elements.studioBackdrop?.classList.toggle("hidden", !drawerOpen);
  document.body.classList.toggle("er-drawer-open", drawerOpen);
  applyBriefWidth(state.briefWidth);
}

function focusPanel(panelName) {
  const panel = getPanelByName(panelName);
  const focusable = panel?.querySelector("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
  window.requestAnimationFrame(() => focusable?.focus());
}

function openStudioPanel(panelName, trigger = null) {
  if (!getPanelByName(panelName)) return;
  if (isStudioDesktop()) {
    if (panelName === "brief") state.briefOpen = true;
    if (panelName === "inspector") state.inspectorOpen = true;
  } else {
    state.activeDrawer = panelName;
    state.panelReturnFocus = trigger || document.activeElement;
  }
  syncStudioPanels();
  focusPanel(panelName);
}

function closeStudioPanel(panelName, { restoreFocus = true } = {}) {
  if (isStudioDesktop()) {
    if (panelName === "brief") state.briefOpen = false;
    if (panelName === "inspector") state.inspectorOpen = false;
  } else if (state.activeDrawer === panelName) {
    state.activeDrawer = null;
  }
  syncStudioPanels();
  if (!isStudioDesktop() && restoreFocus && state.panelReturnFocus instanceof HTMLElement) {
    const returnTarget = state.panelReturnFocus;
    state.panelReturnFocus = null;
    window.requestAnimationFrame(() => returnTarget.focus());
  }
}

function toggleStudioPanel(panelName, trigger) {
  const open = isStudioDesktop()
    ? (panelName === "brief" ? state.briefOpen : state.inspectorOpen)
    : state.activeDrawer === panelName;
  if (open) closeStudioPanel(panelName);
  else openStudioPanel(panelName, trigger);
}

function trapDrawerFocus(event) {
  if (event.key !== "Tab" || isStudioDesktop() || !state.activeDrawer) return;
  const panel = getPanelByName(state.activeDrawer);
  const focusable = Array.from(panel?.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']") || [])
    .filter((element) => !element.closest(".hidden") && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function wireBriefResizer() {
  const handle = elements.briefResizeHandle;
  if (!handle) return;
  handle.addEventListener("pointerdown", (event) => {
    if (!isStudioDesktop()) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.briefWidth;
    handle.setPointerCapture?.(event.pointerId);
    handle.classList.add("is-resizing");
    const onMove = (moveEvent) => applyBriefWidth(startWidth + startX - moveEvent.clientX);
    const onEnd = () => {
      handle.classList.remove("is-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      applyBriefWidth(state.briefWidth, { persist: true });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  });
  handle.addEventListener("keydown", (event) => {
    if (!isStudioDesktop() || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") applyBriefWidth(BRIEF_WIDTH_MIN, { persist: true });
    else if (event.key === "End") applyBriefWidth(getBriefWidthLimit(), { persist: true });
    else applyBriefWidth(state.briefWidth + (event.key === "ArrowLeft" ? 16 : -16), { persist: true });
  });
  handle.addEventListener("dblclick", () => applyBriefWidth(BRIEF_WIDTH_DEFAULT, { persist: true }));
}

function wireStudioShell() {
  elements.panelToggleButtons.forEach((button) => {
    button.addEventListener("click", () => toggleStudioPanel(button.dataset.studioPanelToggle, button));
  });
  elements.studioBackdrop?.addEventListener("click", () => {
    if (state.activeDrawer) closeStudioPanel(state.activeDrawer);
  });
  elements.inspectorTabButtons.forEach((button) => {
    button.addEventListener("click", () => setInspectorTab(button.dataset.erInspectorTab));
  });
  document.addEventListener("keydown", (event) => {
    trapDrawerFocus(event);
    if (event.key === "Escape" && state.activeDrawer) {
      event.preventDefault();
      closeStudioPanel(state.activeDrawer);
    }
  });
  window.addEventListener("resize", syncStudioPanels);
  wireBriefResizer();
}

function getPresentationMode(project = state.project) {
  const projectMode = project?.modo_presentacion;
  const formMode = elements.modoPresentacionSelect?.value;
  return normalizePresentationMode(projectMode || formMode || PRESENTATION_MODE_ROOMS);
}

function isMenuSectionsMode(project = state.project) {
  return getPresentationMode(project) === PRESENTATION_MODE_MENU;
}

function getPresentationTerminology(mode = getPresentationMode()) {
  const normalizedMode = normalizePresentationMode(mode);
  if (normalizedMode === PRESENTATION_MODE_MENU) {
    return {
      mode: normalizedMode,
      formatLabel: "Menú por secciones",
      itemSingular: "actividad",
      itemSingularTitle: "Actividad",
      itemPlural: "actividades",
      itemPluralTitle: "Actividades",
      sectionPlural: "secciones"
    };
  }
  return {
    mode: PRESENTATION_MODE_ROOMS,
    formatLabel: "Por salas",
    itemSingular: "sala",
    itemSingularTitle: "Sala",
    itemPlural: "salas",
    itemPluralTitle: "Salas",
    sectionPlural: "salas"
  };
}

function getDefaultMissionTitle(index = 0, mode = getPresentationMode()) {
  const terms = getPresentationTerminology(mode);
  return normalizeMissionTitle("", `${terms.itemSingularTitle} ${index + 1}`, normalizePresentationMode(mode));
}

function getDefaultMissionRelease(index = 0, mode = getPresentationMode()) {
  const terms = getPresentationTerminology(mode);
  return normalizeMissionRelease("", `${terms.itemSingularTitle.toUpperCase()} ${String(index + 1).padStart(2, "0")}`, normalizePresentationMode(mode));
}

function syncPresentationModeUi({ preferProject = false } = {}) {
  const requestedMode = preferProject && state.project
    ? state.project.modo_presentacion
    : elements.modoPresentacionSelect?.value;
  const mode = normalizePresentationMode(requestedMode || state.project?.modo_presentacion || PRESENTATION_MODE_ROOMS);
  const terms = getPresentationTerminology(mode);

  if (elements.modoPresentacionSelect && elements.modoPresentacionSelect.value !== mode) {
    elements.modoPresentacionSelect.value = mode;
  }
  document.documentElement.dataset.escapeRoomPresentation = mode;
  if (elements.presentationModeHelp) {
    elements.presentationModeHelp.textContent = mode === PRESENTATION_MODE_MENU
      ? "Portada con cards para introducción, instrucciones, actividades y mensaje final."
      : "Recorrido tradicional por salas encadenadas.";
  }
  if (elements.missionFieldLabel) elements.missionFieldLabel.textContent = terms.itemPluralTitle;
  if (elements.questionCountLabel) elements.questionCountLabel.textContent = `Preguntas / ${terms.itemSingular}`;
  if (elements.addMissionLabel) elements.addMissionLabel.textContent = `Añadir ${terms.itemSingular}`;
  if (elements.missionCountLabel) elements.missionCountLabel.textContent = terms.itemPluralTitle;
  if (elements.unlockedCountLabel) elements.unlockedCountLabel.textContent = "Disponibles";
  syncMissionWorkspaceHeading(terms);
  if (elements.missionEmpty) {
    elements.missionEmpty.textContent = `Genera un escape room o añade una ${terms.itemSingular} manualmente para empezar a editar.`;
  }
  if (elements.roomListTitle) elements.roomListTitle.textContent = terms.itemPluralTitle;
  if (elements.missionNavigatorList) elements.missionNavigatorList.setAttribute("aria-label", `Lista ordenable de ${terms.itemPlural}`);
  if (elements.btnAddMission) {
    elements.btnAddMission.setAttribute("aria-label", `Añadir ${terms.itemSingular}`);
    elements.btnAddMission.dataset.erTooltip = `Añadir ${terms.itemSingular}`;
  }
  const roomsTab = elements.inspectorTabButtons.find((button) => button.dataset.erInspectorTab === "rooms");
  if (roomsTab) {
    roomsTab.setAttribute("aria-label", terms.itemPluralTitle);
    roomsTab.textContent = terms.itemPluralTitle;
  }
}

function renderGeneralContentEditor() {
  const hasProject = Boolean(state.project);
  elements.generalContentCard?.classList.toggle("is-empty", !hasProject);
  if (elements.generalContentHelp) {
    const terms = getPresentationTerminology();
    elements.generalContentHelp.textContent = hasProject
      ? "Los cambios se sincronizan con la vista previa, el JSON y la sesión activa."
      : `Genera o añade una ${terms.itemSingular} para habilitar estos contenidos.`;
  }
  elements.generalContentInputs.forEach((field) => {
    field.disabled = !hasProject;
    const projectField = String(field.dataset.projectField || "").trim();
    const nextValue = hasProject && projectField ? normalizeString(state.project?.[projectField], "") : "";
    if (field.value !== nextValue) field.value = nextValue;
  });
}

function updateGeneralProjectField(field, value) {
  if (!state.project || !field) return;
  const projectField = String(field.dataset.projectField || "").trim();
  if (!projectField) return;
  state.project[projectField] = String(value ?? "");
  scheduleOutputRefresh();
}

function remapGenericMissionPresentation(missions = [], nextMode = PRESENTATION_MODE_ROOMS) {
  const genericTitlePattern = /^(?:sala|actividad|misi[oó]n)\s*0*\d+$/i;
  const genericReleasePattern = /^(?:sala|actividad|misi[oó]n)\s*0*\d+$/i;
  return missions.map((mission, index) => ({
    ...mission,
    titulo: genericTitlePattern.test(normalizeString(mission?.titulo, ""))
      ? getDefaultMissionTitle(index, nextMode)
      : mission.titulo,
    release: genericReleasePattern.test(normalizeString(mission?.release, ""))
      ? getDefaultMissionRelease(index, nextMode)
      : mission.release
  }));
}

function handlePresentationModeChange() {
  const nextMode = normalizePresentationMode(elements.modoPresentacionSelect?.value || PRESENTATION_MODE_ROOMS);
  if (state.project) {
    const currentInstructions = normalizeString(state.project.instrucciones, "");
    const usesGeneratedFallback = Object.values(DEFAULT_INSTRUCTIONS_BY_PRESENTATION).includes(currentInstructions);
    state.project = withDefaultRoutes({
      ...state.project,
      modo_presentacion: nextMode,
      instrucciones: usesGeneratedFallback
        ? DEFAULT_INSTRUCTIONS_BY_PRESENTATION[nextMode]
        : currentInstructions,
      misiones: remapGenericMissionPresentation(state.project.misiones || [], nextMode)
    });
  }
  syncPresentationModeUi({ preferProject: Boolean(state.project) });
  renderGeneralContentEditor();
  renderMissionEditor();
  renderOutputsNow();
  saveFormState();
  const terms = getPresentationTerminology(nextMode);
  setStatus(`Formato actualizado a ${terms.formatLabel}. El contenido de las ${terms.itemPlural} se conservó.`, "info");
}

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
  const resolvedPalette = Object.fromEntries(
    Object.entries(palette).map(([key, fallback]) => [key, normalizeHexColor(theme[key], fallback)])
  );
  return {
    presetId,
    baseColor,
    cardRadius: clampNumber(theme.cardRadius, 0, 40, PREVIEW_THEME_DEFAULT.cardRadius),
    titleSize: clampNumber(theme.titleSize, 24, 72, PREVIEW_THEME_DEFAULT.titleSize),
    subtitleSize: clampNumber(theme.subtitleSize, 14, 40, PREVIEW_THEME_DEFAULT.subtitleSize),
    paragraphSize: clampNumber(theme.paragraphSize, 12, 28, PREVIEW_THEME_DEFAULT.paragraphSize),
    ...resolvedPalette
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

function resolvePaletteItemsFromMap(labelPrefix, palette) {
  return Object.entries(palette)
    .map(([index, color]) => ({
      label: `${labelPrefix} ${index}`,
      color: normalizeHexColor(color, "#ffffff"),
      index
    }))
    .sort((left, right) => Number(left.index) - Number(right.index));
}

async function copyTextToClipboard(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (typeof navigator?.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // fallback below
    }
  }
  try {
    const temp = document.createElement("textarea");
    temp.value = text;
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.appendChild(temp);
    temp.focus();
    temp.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(temp);
    return Boolean(copied);
  } catch (_) {
    return false;
  }
}

function renderPreviewRoomPaletteReference() {
  const container = elements.previewRoomPaletteReference;
  if (!container) return;

  const stationItems = resolvePaletteItemsFromMap("Estación", MISSION_LEVEL_COLORS);
  const themeItems = resolvePaletteItemsFromMap("Tema/Unidad", THEME_COMBINE_COLORS);

  const buildSection = (title, items) => `
    <section class="er-preview-palette-section">
      <h6 class="er-preview-palette-title">${title}</h6>
      <div class="er-preview-palette-list">
        ${items.map((item) => `
          <div class="er-preview-palette-item" style="--preview-palette-color:${item.color}">
            <span class="er-preview-palette-label">${escapeHtml(item.label)}</span>
            <span class="er-preview-palette-chip" aria-hidden="true"></span>
            <code class="er-preview-palette-code">${item.color}</code>
            <button type="button" class="er-icon-button er-preview-palette-copy" data-preview-palette-copy="${item.color}" title="Copiar ${escapeHtml(item.color)}">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        `).join("")}
      </div>
    </section>
  `;

  container.innerHTML = [
    buildSection("Colores por estación", stationItems),
    buildSection("Colores por tema / unidad", themeItems)
  ].join("");
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

function isVerboseDraftSessionTitle(value = "") {
  const candidate = normalizeString(value, "");
  if (!candidate) return false;
  return candidate.startsWith("Escape Room:") && candidate.length > 80;
}

function normalizeSessionTitle(title, project = null) {
  const candidate = normalizeString(title, "");
  if (candidate && candidate !== SESSION_TITLE_DEFAULT && !isVerboseDraftSessionTitle(candidate)) {
    return candidate;
  }
  const projectTitle = normalizeString(project?.titulo, "");
  if (projectTitle) return projectTitle;
  return SESSION_TITLE_DEFAULT;
}

function getAcademicFieldMode() {
  return String(elements.nivelSelect?.value || "Primaria").trim() === "Secundaria" ? "Secundaria" : "Primaria";
}

function normalizePaletteIndex(value, fallback = 1) {
  const index = Number(value);
  const fallbackValue = Number(fallback);
  const safeFallback = Number.isFinite(fallbackValue) ? (Math.trunc(fallbackValue) > 0
    ? ((Math.trunc(fallbackValue) - 1) % 4 + 4) % 4 + 1
    : 1) : 1;
  if (!Number.isFinite(index)) return safeFallback;
  const normalized = Math.trunc(index);
  if (normalized <= 0) return safeFallback;
  return ((normalized - 1) % 4 + 4) % 4 + 1;
}

function normalizePromptLanguage(value = "es-419") {
  const normalized = String(value || "es-419").trim().toLowerCase();
const aliases = {
    es: "es-mx",
    "es-mx": "es-mx",
    "es-419": "es-mx",
    "es-es": "es-es",
    "en": "en-us",
    "en-us": "en-us",
    "en-gb": "en-gb",
    "fr": "fr-fr",
    "fr-fr": "fr-fr",
    "pt": "pt-br",
    "pt-br": "pt-br"
  };
  return aliases[normalized] || "es-419";
}

function resolvePromptLanguageDirective(languageCode = "es-419") {
  const normalized = normalizePromptLanguage(languageCode);
  return PROMPT_LANGUAGE_MODES[normalized] || PROMPT_LANGUAGE_MODES["es-419"];
}

function parseStationIndex(rawValue, fallback = 1) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized || normalized === "todas") {
    return normalizePaletteIndex(fallback, fallback);
  }
  const byName = {
    "primera estación": 1,
    "segunda estación": 2,
    "tercera estación": 3,
    "cuarta estación": 4
  };
  if (Object.prototype.hasOwnProperty.call(byName, normalized)) {
    return byName[normalized];
  }
  const parsed = Number.parseInt(normalized, 10);
  return normalizePaletteIndex(parsed, fallback);
}

function resolveRoomColorPalette({ index = 0, formData = {} }) {
  const missionIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const safeRoomIndex = Math.max(0, missionIndex) + 1;
  const unidadTemaMode = String(formData.nivel || "").trim() === "Secundaria"
    ? "Secundaria"
    : String(formData.nivel || "").trim() === "Primaria"
      ? "Primaria"
      : getAcademicFieldMode();
  const isSecondary = unidadTemaMode === "Secundaria";
  const stationSource = normalizeString(formData.estacion, isSecondary ? "Todas" : "");
  const levelIndex = isSecondary && stationSource && stationSource.toLowerCase() !== "todas"
    ? parseStationIndex(stationSource, safeRoomIndex)
    : normalizePaletteIndex(safeRoomIndex, safeRoomIndex);
  const themeSource = isSecondary ? normalizeString(formData.temaSecundaria, "1") : normalizeString(formData.unidad, "1");
  const themeIndex = normalizePaletteIndex(parseInt(themeSource, 10), 1);
  return {
    levelColor: MISSION_LEVEL_COLORS[levelIndex] || MISSION_LEVEL_COLORS[1],
    themeColor: THEME_COMBINE_COLORS[themeIndex] || THEME_COMBINE_COLORS[1],
    levelIndex,
    themeIndex
  };
}

function buildMissionAcademicPalette(index = 0, formData = {}) {
  const palette = resolveRoomColorPalette({ index, formData });
  return {
    color_estacion: palette.levelColor,
    color_tema_unidad: palette.themeColor,
    estacion_index: palette.levelIndex,
    tema_unidad_index: palette.themeIndex
  };
}

function applyAcademicMissionPalettes(project = {}, formData = {}) {
  const missions = Array.isArray(project?.misiones) ? project.misiones : [];
  return {
    ...project,
    misiones: missions.map((mission, index) => ({
      ...mission,
      paleta_academica: buildMissionAcademicPalette(index, formData)
    }))
  };
}

function buildAcademicPreviewTheme(formData = {}) {
  const palette = resolveRoomColorPalette({ index: 0, formData });
  const baseColor = mixHex(palette.themeColor, palette.levelColor, 0.34);
  const derived = normalizePreviewThemeConfig({
    ...PREVIEW_THEME_DEFAULT,
    baseColor
  });
  return normalizePreviewThemeConfig({
    ...derived,
    baseColor,
    backgroundColor: palette.themeColor,
    buttonColor: palette.themeColor,
    accentColor: palette.levelColor,
    accentStrong: mixHex(palette.levelColor, "#ffffff", 0.16),
    accentSoft: mixHex(palette.levelColor, derived.backgroundColor, 0.52)
  });
}

function buildImageTextPolicyLine({ formData = {}, allowOptionalText = true }) {
  const isStrict = Boolean(formData.strictImagePromptMode);
  if (!allowOptionalText || isStrict) {
    return [
      "REGLA NO NEGOCIABLE: no incluyas texto legible dentro de la imagen.",
      "No dibujes letras, palabras, números, rótulos, nombres, coordenadas, leyendas, señales, marcas de agua ni interfaces con texto.",
      "No muestres códigos hexadecimales, nombres de colores, muestras de paleta ni anotaciones técnicas de color.",
      "Representa la información mediante objetos, colores, símbolos no textuales o composición visual.",
      "Todo contenido que el estudiante deba leer debe aparecer fuera de la imagen, en el reto, las opciones o la pista de la actividad."
    ].join(" ");
  }
  return [
    "TEXTO MÍNIMO EN IMAGEN: inclúyelo solo si es imprescindible para la pista visual.",
    "Máximo dos etiquetas, de una o dos palabras cada una; nunca frases, instrucciones, párrafos, listas, coordenadas ni respuestas.",
    "Escribe cada etiqueta con ortografía exacta y clara en el idioma solicitado; revísala antes de finalizar.",
    "Si no puedes escribir una etiqueta con certeza, omítela en vez de inventar caracteres. No mezcles idiomas ni uses texto decorativo, marcas de agua o logotipos.",
    "Los colores sirven únicamente para la composición: no escribas códigos hexadecimales, nombres de colores, muestras de paleta ni anotaciones técnicas de color."
  ].join(" ");
}

function buildAcademicFormState(project = {}) {
  if (!project || typeof project !== "object") return {};
  const nivel = normalizeString(project.nivel, "");
  const isSecondary = nivel === "Secundaria";
  return {
    modoPresentacionSelect: normalizePresentationMode(project.modo_presentacion),
    ...(nivel ? { nivelSelect: nivel } : {}),
    ...(project.grado ? { gradoSelect: project.grado } : {}),
    ...(project.trimestre ? { trimestreSelect: project.trimestre } : {}),
    ...(project.materia ? { materiaSelect: project.materia } : {}),
    ...((project.unidad || project.tema) ? { unidadTemaSelect: isSecondary ? project.tema : project.unidad } : {}),
    ...(project.estacion ? { estacionSelect: project.estacion } : {})
  };
}

function syncAcademicFields() {
  const unidadTemaModo = getAcademicFieldMode();
  const isSecondary = unidadTemaModo === "Secundaria";
  if (elements.unidadTemaLabel) {
    elements.unidadTemaLabel.textContent = isSecondary ? "Tema" : "Unidad";
  }
  if (elements.estacionField) {
    elements.estacionField.classList.toggle("hidden", !isSecondary);
  }
  if (elements.estacionSelect) {
    elements.estacionSelect.required = isSecondary;
    if (!isSecondary) elements.estacionSelect.value = "Todas";
  }
}

function getSessionAcademicMetadata(project = null) {
  const normalizedProject = project && typeof project === "object" ? project : null;
  const formData = getFormData();
  return {
    nivel: normalizedProject?.nivel || formData.nivel || "Primaria",
    grado: normalizedProject?.grado || formData.grado || "Primero",
    trimestre: normalizedProject?.trimestre || formData.trimestre || "1",
    materia: normalizedProject?.materia || formData.materia || "Español",
    unidad: normalizedProject?.unidad || formData.unidad || "",
    tema: normalizedProject?.tema || formData.temaSecundaria || "",
    estacion: normalizedProject?.estacion || formData.estacion || ""
  };
}

function deriveSessionTitle() {
  return normalizeSessionTitle(state.activeSessionMeta?.title, state.project);
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
    if (field.type === "checkbox") {
      formState[field.id] = Boolean(field.checked);
      return;
    }
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
      if (!field) return;
      if (field.type === "checkbox") {
        field.checked = Boolean(value);
        return;
      }
      if (field.id === "unidadTemaSelect" && value !== "" && !Array.from(field.options || []).some((option) => option.value === String(value))) {
        field.add(new Option(String(value), String(value)));
      }
      field.value = value;
    });
  } finally {
    state.formPersistenceSuspended = false;
  }
  syncAcademicFields();
  syncNarrativaCustomField();
  syncPresentationModeUi();
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
  const project = data.project && typeof data.project === "object" ? data.project : null;
  return {
    id: docSnap.id,
    ownerId: String(data.ownerId || ""),
    ownerEmail: String(data.ownerEmail || ""),
    title: normalizeSessionTitle(data.title, project),
    status: normalizeString(data.status, "draft"),
    nivel: normalizeString(data.nivel, ""),
    grado: normalizeString(data.grado, ""),
    trimestre: normalizeString(data.trimestre, ""),
    materia: normalizeString(data.materia, ""),
    unidad: normalizeString(data.unidad, ""),
    tema: normalizeString(data.tema, ""),
    estacion: normalizeString(data.estacion, ""),
    formState: data.formState && typeof data.formState === "object" ? data.formState : {},
    project,
    schemaVersion: Number(data.schemaVersion) || 1,
    activeTopicId: normalizeString(data.activeTopicId, ""),
    topicCount: Number(data.topicCount) || 0,
    topicSummaries: Array.isArray(data.topicSummaries) ? data.topicSummaries : [],
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt)
  };
}

function normalizeTopicNumber(value, fallback = 1) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return fallback;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function getCurrentAcademicNumber(project = state.project, formState = serializeFormState()) {
  return normalizeTopicNumber(
    project?.tema || project?.unidad || formState?.unidadTemaSelect,
    1
  );
}

function getTopicTitle(topic = {}) {
  return normalizeString(topic.project?.titulo || topic.title, "Nuevo escape room");
}

function mapTopicDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    academicNumber: normalizeTopicNumber(data.academicNumber, 1),
    title: normalizeString(data.title, "Nuevo escape room"),
    formState: data.formState && typeof data.formState === "object" ? data.formState : {},
    project: data.project && typeof data.project === "object" ? data.project : null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    updatedAtMs: toMillis(data.updatedAt)
  };
}

function sortTopics(topics = []) {
  return [...topics].sort((a, b) => a.academicNumber - b.academicNumber || a.id.localeCompare(b.id));
}

function buildTopicSummary(topic = {}) {
  return {
    id: topic.id,
    academicNumber: normalizeTopicNumber(topic.academicNumber, 1),
    title: getTopicTitle(topic),
    hasProject: Boolean(topic.project)
  };
}

function renderTopicList() {
  if (!elements.topicList || !elements.topicEmpty) return;
  const topics = sortTopics(state.topics);
  elements.topicEmpty.classList.toggle("hidden", topics.length > 0);
  elements.topicList.innerHTML = topics.map((topic) => `
    <button type="button" class="er-topic-button ${topic.id === state.activeTopicId ? "is-active" : ""}"
      data-topic-id="${escapeHtmlAttr(topic.id)}" aria-pressed="${topic.id === state.activeTopicId ? "true" : "false"}">
      <span class="er-topic-number">Tema ${topic.academicNumber}</span>
      <span class="er-topic-title">${escapeHtml(getTopicTitle(topic))}</span>
    </button>
  `).join("");
}

async function fetchSessionTopics(sessionId) {
  if (!sessionId) return [];
  const ref = collection(db, ESCAPE_ROOM_COLLECTION, sessionId, TOPICS_SUBCOLLECTION);
  try {
    const snapshot = await getDocs(query(ref, orderBy("academicNumber", "asc")));
    return sortTopics(snapshot.docs.map(mapTopicDoc));
  } catch (_) {
    const snapshot = await getDocs(ref);
    return sortTopics(snapshot.docs.map(mapTopicDoc));
  }
}

function buildTopicPayload({ academicNumber, project = state.project, formState = serializeFormState(), title } = {}) {
  const normalizedProject = project ? withDefaultRoutes(project) : null;
  return {
    academicNumber: normalizeTopicNumber(academicNumber, getCurrentAcademicNumber(normalizedProject, formState)),
    title: normalizeString(title || normalizedProject?.titulo, "Nuevo escape room"),
    formState: formState || {},
    project: normalizedProject
  };
}

async function updateSessionTopicIndex(sessionId, { mirrorActive = true } = {}) {
  if (!sessionId) return;
  const summaries = sortTopics(state.topics).map(buildTopicSummary);
  const active = state.topics.find((topic) => topic.id === state.activeTopicId) || null;
  const patch = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    activeTopicId: state.activeTopicId || "",
    topicCount: summaries.length,
    topicSummaries: summaries,
    updatedAt: serverTimestamp()
  };
  if (mirrorActive && active) {
    patch.project = active.project || null;
    patch.formState = active.formState || {};
    Object.assign(patch, getSessionAcademicMetadata(active.project));
  }
  await updateDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId), patch);
}

async function createTopicDocument(sessionId, payload) {
  const ref = await addDoc(collection(db, ESCAPE_ROOM_COLLECTION, sessionId, TOPICS_SUBCOLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  const topic = { id: ref.id, ...payload, createdAt: null, updatedAt: null, updatedAtMs: Date.now() };
  state.topics = sortTopics([...state.topics.filter((item) => item.id !== topic.id), topic]);
  return topic;
}

async function migrateLegacySessionTopic(session) {
  const formState = {
    ...(session.project ? buildImportedFormState(session.project) : buildAcademicFormState(session.project)),
    ...(session.formState || {})
  };
  return createTopicDocument(session.id, buildTopicPayload({
    academicNumber: getCurrentAcademicNumber(session.project, formState),
    project: session.project,
    formState,
    title: session.project?.titulo || session.title
  }));
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
  const normalizedProject = project === undefined ? (state.project ? materializeProjectForExport() : null) : (project || null);
  const academic = getSessionAcademicMetadata(normalizedProject);
  return {
    ownerId: state.currentUser?.uid || "",
    ownerEmail: state.currentUser?.email || "",
    title: normalizeSessionTitle(title, normalizedProject),
    status,
    schemaVersion: SESSION_SCHEMA_VERSION,
    activeTopicId: state.activeTopicId || "",
    topicCount: state.topics.length,
    topicSummaries: sortTopics(state.topics).map(buildTopicSummary),
    ...academic,
    formState: formState === undefined ? serializeFormState() : (formState || null),
    project: normalizedProject
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
    syncAcademicFields();
    syncNarrativaCustomField();
    syncPresentationModeUi();
  }
  state.project = null;
  state.selectedMissionId = null;
  state.selectedQuestionId = null;
  state.expandedMissionIds.clear();
  state.activeTab = "preview";
  state.generationNote = "";
  elements.jsonPreview.textContent = "";
  elements.previewFrame?.removeAttribute("srcdoc");
  renderGeneralContentEditor();
  renderMissionEditor();
  renderOutputsNow();
}

function renderSessionList() {
  if (!elements.sessionList || !elements.sessionsLoading || !elements.sessionsEmpty) return;
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  elements.sessionsLoading.classList.toggle("hidden", !state.sessionsLoading);
  elements.sessionsEmpty.classList.toggle("hidden", state.sessionsLoading || sessions.length > 0);
  elements.sessionList.classList.toggle("hidden", state.sessionsLoading || sessions.length === 0);
  if (state.sessionsLoading || sessions.length === 0) {
    elements.sessionList.innerHTML = "";
    return;
  }
  if (state.sessionMenuId && !sessions.some((session) => session.id === state.sessionMenuId)) {
    state.sessionMenuId = null;
  }
  elements.sessionList.innerHTML = sessions.map((session) => `
    <article class="er-session-item ${session.id === state.activeSessionId ? "is-active" : ""}" data-session-id="${escapeHtmlAttr(session.id)}">
      <button type="button" class="er-session-title-button" data-session-action="open" data-session-id="${escapeHtmlAttr(session.id)}" title="${escapeHtmlAttr(session.title || SESSION_TITLE_DEFAULT)}">
        <span>${escapeHtml(session.title || SESSION_TITLE_DEFAULT)}</span>
      </button>
      <div class="er-session-menu-wrap">
        <button type="button" class="er-session-kebab er-studio-icon-button" data-session-menu-toggle data-session-id="${escapeHtmlAttr(session.id)}" data-er-tooltip="Opciones de sesión" aria-label="Opciones de ${escapeHtmlAttr(session.title || SESSION_TITLE_DEFAULT)}" aria-haspopup="menu" aria-expanded="${state.sessionMenuId === session.id ? "true" : "false"}">
          <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
        </button>
        <div class="er-session-menu ${state.sessionMenuId === session.id ? "is-open" : ""}" role="menu" ${state.sessionMenuId === session.id ? "" : "hidden"}>
          <button type="button" role="menuitem" data-session-action="rename" data-session-id="${escapeHtmlAttr(session.id)}"><i class="fas fa-pen"></i><span>Renombrar</span></button>
          <button type="button" role="menuitem" class="is-danger" data-session-action="delete" data-session-id="${escapeHtmlAttr(session.id)}"><i class="fas fa-trash"></i><span>Eliminar</span></button>
        </div>
      </div>
    </article>
  `).join("");
}

function closeSessionMenu({ restoreFocus = false } = {}) {
  if (!state.sessionMenuId) return;
  const sessionId = state.sessionMenuId;
  state.sessionMenuId = null;
  state.sessionMenuReturnFocus = null;
  renderSessionList();
  if (restoreFocus) {
    window.requestAnimationFrame(() => {
      elements.sessionList?.querySelector(`[data-session-menu-toggle][data-session-id="${CSS.escape(sessionId)}"]`)?.focus();
    });
  }
}

function toggleSessionMenu(sessionId, trigger) {
  if (state.sessionMenuId === sessionId) {
    closeSessionMenu({ restoreFocus: true });
    return;
  }
  state.sessionMenuId = sessionId;
  state.sessionMenuReturnFocus = trigger;
  renderSessionList();
  window.requestAnimationFrame(() => {
    elements.sessionList?.querySelector(`.er-session-item[data-session-id="${CSS.escape(sessionId)}"] [role="menuitem"]`)?.focus();
  });
}

async function loadSessionIntoEditor(session) {
  closeSessionMenu();
  state.isHydratingFromRemote = true;
  try {
    state.activeSessionId = session.id;
    state.activeTopicId = "";
    state.topics = [];
    state.activeSessionMeta = {
      id: session.id,
      title: session.title || SESSION_TITLE_DEFAULT,
      status: session.status || "draft"
    };
    setActiveSessionStorage(session.id);
    state.topicsLoading = true;
    state.topics = await fetchSessionTopics(session.id);
    if (!state.topics.length && (session.project || Object.keys(session.formState || {}).length)) {
      state.topics = [await migrateLegacySessionTopic(session)];
    }
    state.topicsLoading = false;
    const activeTopic = state.topics.find((topic) => topic.id === session.activeTopicId)
      || state.topics[0]
      || null;
    if (activeTopic) {
      await loadTopicIntoEditor(activeTopic, { updateParent: true });
    } else {
      state.activeTopicId = "";
      resetEditorState({ preserveForm: false });
      renderTopicList();
    }
    setRemoteSaveState("saved");
  } finally {
    state.isHydratingFromRemote = false;
  }
  renderSessionList();
}

async function loadTopicIntoEditor(topic, { updateParent = true } = {}) {
  if (!topic) return;
  state.isHydratingFromRemote = true;
  try {
    resetEditorState({ preserveForm: false });
    applyFormState({ ...buildAcademicFormState(topic.project), ...(topic.formState || {}) });
    state.project = topic.project ? withDefaultRoutes(topic.project) : null;
    state.activeTopicId = topic.id;
    state.selectedMissionId = null;
    state.selectedQuestionId = null;
    state.expandedMissionIds.clear();
    state.generationNote = "";
    syncPresentationModeUi({ preferProject: Boolean(state.project) });
    restorePreviewTheme({ preferProject: true });
    renderMissionEditor();
    renderOutputsNow();
    setActiveTab("preview");
    renderTopicList();
    if (updateParent && state.activeSessionId) await updateSessionTopicIndex(state.activeSessionId);
  } finally {
    state.isHydratingFromRemote = false;
  }
}

async function flushPendingTopicSave() {
  if (state.sessionSaveHandle) {
    window.clearTimeout(state.sessionSaveHandle);
    state.sessionSaveHandle = null;
  }
  if (state.sessionSaveInFlight) {
    state.sessionSaveQueued = true;
    await new Promise((resolve) => {
      const poll = () => state.sessionSaveInFlight ? window.setTimeout(poll, 40) : resolve();
      poll();
    });
    return;
  }
  if (state.activeSessionId && state.activeTopicId) await persistActiveSession();
}

async function selectTopic(topicId) {
  if (!topicId || topicId === state.activeTopicId || state.isGenerating) return;
  const topic = state.topics.find((item) => item.id === topicId);
  if (!topic) return;
  await flushPendingTopicSave();
  await loadTopicIntoEditor(topic, { updateParent: true });
  setStatus(`Tema ${topic.academicNumber} abierto.`, "success");
}

function getNewTopicModal() {
  if (!elements.newTopicModal || !window.bootstrap?.Modal) return null;
  newTopicModalInstance ||= window.bootstrap.Modal.getOrCreateInstance(elements.newTopicModal);
  return newTopicModalInstance;
}

function buildInheritedTopicFormState(academicNumber) {
  const inherited = serializeFormState();
  inherited.unidadTemaSelect = String(academicNumber);
  inherited.temaInput = "";
  inherited.objetivoInput = "";
  return inherited;
}

function openNewTopicDialog() {
  if (state.activeSessionMeta?.status === "published") {
    setStatus("Mueve la sesión a Borrador antes de crear un tema nuevo.", "warning");
    return;
  }
  if (!state.activeSessionId) {
    setStatus("Crea o abre una sesión antes de añadir temas.", "warning");
    return;
  }
  if (elements.newTopicError) elements.newTopicError.textContent = "";
  if (elements.newTopicNumber) elements.newTopicNumber.value = "";
  getNewTopicModal()?.show();
  window.setTimeout(() => elements.newTopicNumber?.focus(), 160);
}

async function createNewTopicFromDialog(event) {
  event.preventDefault();
  const raw = String(elements.newTopicNumber?.value || "").trim();
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    if (elements.newTopicError) elements.newTopicError.textContent = "Escribe un número entero positivo.";
    elements.newTopicNumber?.focus();
    return;
  }
  const academicNumber = Number(raw);
  if (state.topics.some((topic) => topic.academicNumber === academicNumber)) {
    if (elements.newTopicError) elements.newTopicError.textContent = `El Tema ${academicNumber} ya existe en esta sesión.`;
    elements.newTopicNumber?.focus();
    return;
  }
  if (state.activeSessionMeta?.status === "published") {
    getNewTopicModal()?.hide();
    setStatus("Mueve la sesión a Borrador antes de crear un tema nuevo.", "warning");
    return;
  }

  const button = document.getElementById("erCreateTopicButton");
  if (button) button.disabled = true;
  try {
    await flushPendingTopicSave();
    const formState = buildInheritedTopicFormState(academicNumber);
    const topic = await createTopicDocument(state.activeSessionId, buildTopicPayload({
      academicNumber,
      project: null,
      formState,
      title: "Nuevo escape room"
    }));
    state.activeTopicId = topic.id;
    await loadTopicIntoEditor(topic, { updateParent: true });
    getNewTopicModal()?.hide();
    setInspectorTab("topics");
    openStudioPanel("brief", elements.btnAddTopic);
    setStatus(`Tema ${academicNumber} creado. Añade el tema curricular y el objetivo final.`, "success");
    window.setTimeout(() => document.getElementById("temaInput")?.focus(), 180);
  } catch (error) {
    console.error("No se pudo crear el tema:", error);
    if (elements.newTopicError) elements.newTopicError.textContent = "No fue posible crear el tema.";
  } finally {
    if (button) button.disabled = false;
  }
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

async function createRemoteSession({ title, project = null, formState = null, activate = true, reloadEditor = true } = {}) {
  const payload = {
    ...buildSessionPayload({ title, project, formState }),
    schemaVersion: SESSION_SCHEMA_VERSION,
    activeTopicId: "",
    topicCount: 0,
    topicSummaries: []
  };
  const docRef = await addDoc(collection(db, ESCAPE_ROOM_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  if (reloadEditor) {
    await loadSessionsFromFirebase({ preferredSessionId: activate ? docRef.id : state.activeSessionId });
  } else {
    const now = Date.now();
    const localSession = {
      id: docRef.id,
      ...payload,
      createdAt: null,
      updatedAt: null,
      createdAtMs: now,
      updatedAtMs: now
    };
    state.sessions = sortSessions([
      localSession,
      ...state.sessions.filter((session) => session.id !== docRef.id)
    ]);
    if (activate) {
      state.topics = [];
      state.activeTopicId = "";
      state.activeSessionId = docRef.id;
      state.activeSessionMeta = {
        id: docRef.id,
        title: payload.title || SESSION_TITLE_DEFAULT,
        status: payload.status || "draft"
      };
      setActiveSessionStorage(docRef.id);
    }
    renderSessionList();
  }
  return docRef.id;
}

async function uploadImageIfDataUrl(value, path) {
  if (!isDataUrl(value)) return value;
  if (!state.currentUser?.uid) return value;
  const pathHint = String(path || "");
  const isLocalOrigin = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (isLocalOrigin) {
    try {
      return (await uploadImageToBackendForFallback(value, pathHint, "replacement")) || value;
    } catch (error) {
      console.warn("La imagen se conservará embebida porque el almacenamiento local no está disponible:", error);
      return value;
    }
  }
  try {
    const storageInstance = getStorage(app);
    const refInstance = storageRef(storageInstance, path);
    const parseResult = parseDataUrl(value);
    const contentType = parseResult?.contentType || "image/png";
    await uploadString(refInstance, value, "data_url", { contentType });
    return await getDownloadURL(refInstance);
  } catch (error) {
    const isLikelyCorsOrNetwork = /xmlhttprequest|network|cors|fetch|storage|permission/i.test(String(error?.message || ""));
    if (!isLikelyCorsOrNetwork) {
      console.warn("No se pudo subir la imagen a Firebase Storage:", error);
      return value;
    }
    try {
      const uploadedUrl = await uploadImageToBackendForFallback(value, pathHint, "replacement");
      if (uploadedUrl) {
        return uploadedUrl;
      }
      return value;
    } catch (fallbackError) {
      console.warn("Fallback de imagen por backend no disponible:", fallbackError);
      return value;
    }
  }
}

function parseDataUrl(value = "") {
  const raw = String(value || "").trim();
  const match = raw.match(DATA_URL_PATTERN);
  if (!match) return null;
  const contentType = String(match[1] || "image/png").trim() || "image/png";
  const encoded = String(match[3] || "").trim();
  if (!encoded || !raw.includes(";base64,")) {
    return null;
  }
  return { contentType, encoded };
}

function toBackendStoragePath(path, uid) {
  const safePath = String(path || "").trim().replace(/^\/+/, "");
  const safeUid = String(uid || "").trim();
  if (!safePath || !safeUid) return "";
  if (safePath.startsWith("unidadesGeneradasAssets/")) return safePath;
  const escapedPrefix = `escaperooms/${safeUid}/`;
  if (safePath.startsWith(escapedPrefix)) {
    return `unidadesGeneradasAssets/${safeUid}/${safePath.slice(escapedPrefix.length)}`;
  }
  if (safePath.startsWith(`escaperooms/${safeUid}`)) {
    return `unidadesGeneradasAssets/${safeUid}/${safePath.slice(`escaperooms/${safeUid}`.length).replace(/^\/+/, "")}`;
  }
  return `unidadesGeneradasAssets/${safeUid}/${safePath.replace(/^\/+/, "")}`;
}

async function uploadImageToBackendForFallback(value, path, role = "imagen") {
  const uid = state.currentUser?.uid;
  if (!uid) return "";
  const parsed = parseDataUrl(value);
  if (!parsed) return "";
  const storagePath = toBackendStoragePath(path, uid);
  if (!storagePath) return "";
  const endpoint = buildApiUrl(SUPPORT_GRAPHIC_UPLOAD_ENDPOINT);
  if (!endpoint) return "";

  const response = await authFetchJson(endpoint, {
    method: "POST",
    body: {
      path: storagePath,
      mimeType: parsed.contentType || "image/png",
      dataBase64: parsed.encoded,
      metadata: { role, subtema: "escaperoom" }
    }
  });
  return response?.downloadUrl || "";
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error("No se recibió un archivo de imagen válido."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo seleccionado."));
    reader.readAsDataURL(file);
  });
}

function buildActivityImagePath({ missionIndex, questionIndex }) {
  const safeMission = Number.isFinite(Number(missionIndex)) ? Math.max(0, Number(missionIndex)) : 0;
  if (Number.isFinite(Number(questionIndex))) {
    const safeQuestion = Math.max(0, Number(questionIndex));
    return `question_${safeMission}_${safeQuestion}_${Date.now()}.png`;
  }
  return `mission_${safeMission}_${Date.now()}.png`;
}

function getActivityImageFileInput() {
  return elements.activityImageInput;
}

async function uploadProjectImagesToFirebaseStorage(sessionId, topicId = state.activeTopicId || "legacy") {
  if (!state.project || !state.currentUser?.uid || !sessionId) return;
  const uid = state.currentUser.uid;
  const project = state.project;

  // 1. Cover Image
  if (project.backgroundImage && isDataUrl(project.backgroundImage)) {
    const downloadUrl = await uploadImageIfDataUrl(project.backgroundImage, `escaperooms/${uid}/${sessionId}/${topicId}/cover.png`);
    if (downloadUrl) project.backgroundImage = downloadUrl;
  }

  // 2. Mission Images
  if (Array.isArray(project.misiones)) {
    for (const [index, mission] of project.misiones.entries()) {
      if (mission.imagen && isDataUrl(mission.imagen)) {
        const downloadUrl = await uploadImageIfDataUrl(mission.imagen, `escaperooms/${uid}/${sessionId}/${topicId}/mission_${index}_${Date.now()}.png`);
        if (downloadUrl) {
          mission.imagen = downloadUrl;
          if (mission.media && mission.media.tipo === "imagen") {
            mission.media.url = downloadUrl;
          }
        }
      }
      if (mission.media?.url && isDataUrl(mission.media.url)) {
        const downloadUrl = await uploadImageIfDataUrl(mission.media.url, `escaperooms/${uid}/${sessionId}/${topicId}/mission_media_${index}_${Date.now()}.png`);
        if (downloadUrl) mission.media.url = downloadUrl;
      }

      // 3. Question Images
      if (Array.isArray(mission.preguntas)) {
        for (const [questionIndex, question] of mission.preguntas.entries()) {
          if (question.imagen && isDataUrl(question.imagen)) {
            const downloadUrl = await uploadImageIfDataUrl(question.imagen, `escaperooms/${uid}/${sessionId}/${topicId}/question_${index}_${questionIndex}_${Date.now()}.png`);
            if (downloadUrl) {
              question.imagen = downloadUrl;
              if (question.media && question.media.tipo === "imagen") {
                question.media.url = downloadUrl;
              }
            }
          }
          if (question.media?.url && isDataUrl(question.media.url)) {
            const downloadUrl = await uploadImageIfDataUrl(question.media.url, `escaperooms/${uid}/${sessionId}/${topicId}/question_media_${index}_${questionIndex}_${Date.now()}.png`);
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
    activate: true,
    reloadEditor: false
  });
  return sessionId;
}

async function ensureActiveTopic(sessionId) {
  if (state.activeTopicId) return state.activeTopicId;
  if (!sessionId) return "";
  const payload = buildTopicPayload({
    academicNumber: getCurrentAcademicNumber(),
    project: state.project ? materializeProjectForExport() : null,
    formState: serializeFormState()
  });
  const topic = await createTopicDocument(sessionId, payload);
  state.activeTopicId = topic.id;
  renderTopicList();
  await updateSessionTopicIndex(sessionId);
  return topic.id;
}

async function persistActiveSession() {
  if (state.isHydratingFromRemote || state.suspendSessionSave || !state.currentUser?.uid) return;
  try {
    setRemoteSaveState("saving");
    const sessionId = await ensureActiveRemoteSession();
    if (!sessionId) return;
    const topicId = await ensureActiveTopic(sessionId);
    if (!topicId) return;

    // Subir imágenes pesadas a Storage y reemplazarlas en el estado local con URLs HTTPS
    await uploadProjectImagesToFirebaseStorage(sessionId, topicId);

    const topicPayload = buildTopicPayload({
      academicNumber: getCurrentAcademicNumber(),
      project: state.project ? materializeProjectForExport() : null,
      formState: serializeFormState()
    });
    await setDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId, TOPICS_SUBCOLLECTION, topicId), {
      ...topicPayload,
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.topics = sortTopics(state.topics.map((topic) => topic.id === topicId
      ? { ...topic, ...topicPayload, updatedAtMs: Date.now() }
      : topic));

    const payload = buildSessionPayload({
      title: deriveSessionTitle(),
      status: state.activeSessionMeta?.status || "draft",
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
    renderTopicList();
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

  const topicId = await ensureActiveTopic(sessionId);
  await uploadProjectImagesToFirebaseStorage(sessionId, topicId);

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

async function handlePublishToggleChange() {
  if (!state.project) {
    setStatus("Genera o carga un escape room antes de publicarlo.", "warning");
    syncActionButtons();
    return;
  }

  const nextPublished = elements.publishToggle?.checked === true;
  try {
    setRemoteSaveState("saving");
    setLoading(true);
    if (nextPublished) {
      await flushPendingTopicSave();
      const invalidTopics = state.topics.filter((topic) => {
        const topicText = normalizeString(topic.formState?.temaInput, "").trim();
        const objective = normalizeString(topic.formState?.objetivoInput, "").trim();
        return !topicText || !objective || !topic.project || validateProjectSetup(topic.project).issues.length > 0;
      });
      if (invalidTopics.length) {
        throw new Error(`Completa Tema curricular, Objetivo final y Escape Room en ${invalidTopics.map((topic) => `Tema ${topic.academicNumber}`).join(", ")}.`);
      }
    }
    await updateActiveSessionMetadata({ status: nextPublished ? "published" : "draft" });
    setRemoteSaveState("saved");
    setStatus(
      nextPublished ? "Sesión publicada y sincronizada con Firebase." : "Sesión movida a borrador.",
      "success"
    );
  } catch (error) {
    console.error("No se pudo actualizar la sesión:", error);
    setRemoteSaveState("error", "Error al publicar");
    setStatus(error?.message || "No fue posible actualizar la publicación.", "bad");
  } finally {
    setLoading(false);
    refreshPanels();
  }
}

function scheduleSessionSave() {
  if (state.isHydratingFromRemote || state.suspendSessionSave || !state.currentUser?.uid) return;
  if (state.isGenerating) {
    if (state.sessionSaveHandle) window.clearTimeout(state.sessionSaveHandle);
    state.sessionSaveHandle = null;
    state.sessionSaveQueued = true;
    return;
  }
  if (state.sessionSaveInFlight) {
    state.sessionSaveQueued = true;
    return;
  }
  if (state.sessionSaveHandle) window.clearTimeout(state.sessionSaveHandle);
  state.sessionSaveHandle = window.setTimeout(() => {
    state.sessionSaveHandle = null;
    if (state.isGenerating) {
      state.sessionSaveQueued = true;
      return;
    }
    state.sessionSaveInFlight = true;
    state.sessionSaveQueued = false;
    void persistActiveSession().finally(() => {
      state.sessionSaveInFlight = false;
      if (state.sessionSaveQueued) scheduleSessionSave();
    });
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
    const topicSnapshot = await getDocs(collection(db, ESCAPE_ROOM_COLLECTION, sessionId, TOPICS_SUBCOLLECTION));
    await Promise.all(topicSnapshot.docs.map((topicDoc) => deleteDoc(topicDoc.ref)));
    await deleteDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId));
    state.sessions = state.sessions.filter((item) => item.id !== sessionId);
    const wasActive = state.activeSessionId === sessionId;
    if (wasActive) {
      state.activeSessionId = "";
      state.activeSessionMeta = null;
      state.activeTopicId = "";
      state.topics = [];
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

function getObjectiveIdeaModal() {
  if (!elements.objectiveIdeaModal || !window.bootstrap?.Modal) return null;
  if (!objectiveIdeaModalInstance) {
    objectiveIdeaModalInstance = window.bootstrap.Modal.getOrCreateInstance(elements.objectiveIdeaModal);
  }
  return objectiveIdeaModalInstance;
}

function getNewSessionModal() {
  if (!elements.newSessionModal || !window.bootstrap?.Modal) return null;
  if (!newSessionModalInstance) {
    newSessionModalInstance = window.bootstrap.Modal.getOrCreateInstance(elements.newSessionModal);
  }
  return newSessionModalInstance;
}

function setImportZipStatus(message = "", type = "") {
  if (!elements.importZipStatus) return;
  elements.importZipStatus.textContent = message;
  elements.importZipStatus.dataset.state = type;
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) return reject(new Error("Selecciona un archivo ZIP válido."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo ZIP."));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
}

function getPigPenJsZip() {
  const JSZipCtor = window.htmlDocx?.JSZip || window.JSZip;
  if (!JSZipCtor) throw new Error("El lector de archivos ZIP no está disponible todavía.");
  return JSZipCtor;
}

async function readPigPenZip(file) {
  if (!file || !/\.zip$/i.test(file.name || "")) {
    throw new Error("Selecciona un archivo con extensión .zip.");
  }
  const JSZipCtor = getPigPenJsZip();
  const zip = new JSZipCtor();
  const data = await readFileAsArrayBuffer(file);
  try {
    if (typeof zip.loadAsync === "function") {
      await zip.loadAsync(data);
    } else if (typeof zip.load === "function") {
      zip.load(data);
    } else {
      throw new Error("Esta versión del lector ZIP no permite importar archivos.");
    }
  } catch (error) {
    throw new Error("El ZIP está corrupto o no se pudo abrir.");
  }

  const paths = Object.keys(zip.files || {}).filter((path) => isSafeArchivePath(path));
  const manifestPath = findEscapeRoomManifestPath(paths);
  if (!manifestPath) {
    throw new Error("El ZIP no es un escape room de PigPen: falta assets/escape-room.json.");
  }
  const manifestEntry = zip.files[manifestPath];
  if (!manifestEntry || manifestEntry.dir) throw new Error("No se encontró un manifiesto válido en el ZIP.");
  let sourceProject;
  try {
    sourceProject = JSON.parse(typeof manifestEntry.asText === "function" ? manifestEntry.asText() : "");
  } catch (_) {
    throw new Error("El archivo assets/escape-room.json no contiene JSON válido.");
  }
  if (!sourceProject || typeof sourceProject !== "object" || Array.isArray(sourceProject)) {
    throw new Error("El manifiesto del escape room no contiene un proyecto válido.");
  }
  const getBinary = async (path) => {
    if (!isSafeArchivePath(path)) return null;
    const entry = zip.files[path];
    if (!entry || entry.dir || typeof entry.asUint8Array !== "function") return null;
    try { return entry.asUint8Array(); } catch (_) { return null; }
  };
  return restorePigPenArchiveAssets(sourceProject, { manifestPath, getBinary });
}

function buildImportedFormState(project = {}) {
  const missionCount = Array.isArray(project.misiones) ? project.misiones.length : 1;
  const questionCount = Math.max(1, ...(Array.isArray(project.misiones)
    ? project.misiones.map((mission) => Array.isArray(mission.preguntas) ? mission.preguntas.length : 1)
    : [1]));
  const isSecondary = project.nivel === "Secundaria";
  return {
    ...buildAcademicFormState(project),
    temaInput: project.tema_curricular || project.titulo || "",
    objetivoInput: project.introduccion || "",
    duracionInput: String(Math.min(120, Math.max(10, Number(project.duracion_minutos) || 35))),
    numMisionesInput: String(Math.min(8, Math.max(2, missionCount))),
    preguntasPorSalaInput: String(Math.min(6, questionCount)),
    narrativaSelect: "otro",
    narrativaCustomInput: project.ambientacion || "",
    ...(isSecondary && project.estacion ? { estacionSelect: project.estacion } : {})
  };
}

async function importZipAsNewSession(file) {
  setImportZipStatus("Leyendo el ZIP y restaurando recursos…");
  const imported = await readPigPenZip(file); // valida todo antes de crear una sesión remota
  const importedProject = withDefaultRoutes(imported.project);
  const importedFormState = buildImportedFormState(importedProject);
  const title = normalizeSessionTitle(importedProject.titulo, importedProject);

  state.suspendSessionSave = true;
  try {
    const sessionId = await createRemoteSession({
      title,
      project: null,
      formState: null,
      activate: true,
      reloadEditor: false
    });
    applyFormState(importedFormState);
    state.project = importedProject;
    const importedTopic = await createTopicDocument(sessionId, buildTopicPayload({
      academicNumber: getCurrentAcademicNumber(importedProject, importedFormState),
      project: importedProject,
      formState: importedFormState,
      title
    }));
    state.activeTopicId = importedTopic.id;
    applyPreviewTheme(importedProject.themeConfig, { persist: true, syncProject: true, refresh: false });
    state.selectedMissionId = null;
    state.selectedQuestionId = null;
    state.expandedMissionIds.clear();
    state.activeTab = "preview";
    renderMissionEditor();
    renderOutputsNow();
    setActiveTab("preview");

    setImportZipStatus("Guardando recursos importados…");
    await uploadProjectImagesToFirebaseStorage(sessionId, importedTopic.id);
    const payload = buildSessionPayload({
      title,
      project: materializeProjectForExport(),
      formState: serializeFormState()
    });
    await updateDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId), {
      ...payload,
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId, TOPICS_SUBCOLLECTION, importedTopic.id), {
      ...buildTopicPayload({
        academicNumber: importedTopic.academicNumber,
        project: materializeProjectForExport(),
        formState: serializeFormState(),
        title
      }),
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.sessions = sortSessions(state.sessions.map((session) => session.id === sessionId
      ? { ...session, ...payload, updatedAtMs: Date.now() }
      : session));
    state.activeSessionMeta = { id: sessionId, title: payload.title, status: payload.status || "draft" };
    renderSessionList();
    setRemoteSaveState("saved");
    const missing = imported.missingPaths.length;
    setStatus(
      `ZIP importado: ${importedProject.misiones.length} ${getPresentationTerminology(importedProject.modo_presentacion).itemPlural}${missing ? ` · ${missing} recurso${missing === 1 ? "" : "s"} no pudo restaurarse` : ""}.`,
      missing ? "warn" : "success"
    );
    return { missing };
  } finally {
    state.suspendSessionSave = false;
  }
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
    syncPresentationModeUi({ preferProject: true });
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
  if (elements.btnAddTopic) {
    elements.btnAddTopic.disabled = state.isLoading || state.isGenerating || !state.activeSessionId || isPublishedSession();
  }
  if (elements.modoPresentacionSelect) {
    elements.modoPresentacionSelect.disabled = state.isLoading || state.isGenerating;
  }
  elements.btnExportar.disabled = state.isLoading || !hasData || state.isGenerating;
  elements.btnCopiarJson.disabled = state.isLoading || !hasData || state.isGenerating;
  if (elements.btnRepairEscapeRoom) {
    elements.btnRepairEscapeRoom.disabled = state.isLoading || !hasData || state.isGenerating;
  }
  if (elements.btnPreviewAutofill) {
    elements.btnPreviewAutofill.disabled = state.isLoading || !hasData || state.isGenerating;
  }

  if (elements.publishToggle) {
    elements.publishToggle.disabled = state.isLoading || !canPublish;
    elements.publishToggle.checked = isPublishedSession();
  }
  if (elements.publishSwitchLabel) {
    elements.publishSwitchLabel.textContent = isPublishedSession() ? "Publicado" : "Borrador";
  }
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  syncActionButtons();
  elements.loading.classList.toggle("hidden", !isLoading);
}

function setActiveTab(tabName = "preview") {
  const nextTab = tabName === "json" ? "json" : "preview";
  state.activeTab = nextTab;
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.erTab === nextTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  refreshPanels();
}

function refreshPanels() {
  const hasData = Boolean(state.project);
  const showPreview = (hasData || state.isGenerating) && state.activeTab === "preview";
  const showMission = hasData && Boolean(state.selectedMissionId);
  elements.emptyState.classList.toggle("hidden", hasData || state.isGenerating);
  elements.previewPanel.classList.toggle("hidden", !showPreview);
  elements.resultadoContainer.classList.toggle("hidden", !hasData || state.activeTab !== "json");
  elements.missionWorkspacePanel?.classList.toggle("hidden", !showMission);
  elements.missionEmpty.classList.toggle("hidden", hasData && state.project.misiones.length > 0);
  renderTopicList();
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
  const unidadTemaModo = getAcademicFieldMode();
  const unidadTemaValor = String(document.getElementById("unidadTemaSelect")?.value || "").trim();
  return {
    modoPresentacion: normalizePresentationMode(elements.modoPresentacionSelect?.value || PRESENTATION_MODE_ROOMS),
    idioma: elements.idiomaSelect?.value || "es-419",
    strictImagePromptMode: Boolean(elements.strictImagePromptMode?.checked),
    nivel: document.getElementById("nivelSelect")?.value || "Primaria",
    grado: document.getElementById("gradoSelect")?.value || "Primero",
    trimestre: document.getElementById("trimestreSelect")?.value || "1",
    materia: document.getElementById("materiaSelect")?.value || "Español",
    unidad: unidadTemaModo === "Primaria" ? unidadTemaValor : "",
    temaSecundaria: unidadTemaModo === "Secundaria" ? unidadTemaValor : "",
    publico: document.getElementById("publicoSelect")?.value || "Grupo completo",
    duracion: Number(document.getElementById("duracionInput")?.value || 35),
    tema: temaLines.join(" / "),
    temaPrincipal: temaLines[0] || "",
    temas: temaLines,
    estacion: unidadTemaModo === "Secundaria" ? (document.getElementById("estacionSelect")?.value || "Todas") : "",
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

function buildRoomsPrompt(data) {
  const temas = Array.isArray(data.temas) ? data.temas : [];
  const objetivosTematicos = temas.length ? temas.map((tema) => `- ${tema}`).join("\n") : `- ${data.tema}`;
  const objetivoFinal = data.objetivo || `Guiar al alumnado a completar el escape room sobre ${data.tema}`;
  const narrativaEtiqueta = data.narrativaBase === "otro"
    ? `Otra narrativa: ${data.narrativaPersonalizada || "personalizada"}`
    : data.narrativa;
  const estiloImagen = normalizeString(data.estiloImagen, "Ilustración editorial educativa coherente con la narrativa");
  const languageMode = resolvePromptLanguageDirective(data.idioma);

  return `
Eres un experto en gamificación, narrativa educativa y diseño de escape rooms profesionales.
Responde únicamente con JSON válido.
${languageMode.directive}
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
- Estilo visual obligatorio para todas las imágenes del escape room: ${estiloImagen}
- Mantén ese estilo visual en portada, salas y preguntas.
- No mezcles estilos incompatibles. Si el estilo visual no menciona ciencia ficción, futurismo, neón, hologramas, pantallas digitales, interfaces tecnológicas o estética cyberpunk, NO los agregues.
- Ritmo: ${data.ritmo}
- Dificultad: ${data.dificultad}
- Pistas: ${data.pistas}
- Objetivo final: ${objetivoFinal}
- Elementos base: narrativa inicial, objetivo claro, reglas implícitas, pistas graduales, retos encadenados, progreso visible, ambientación coherente, clímax y cierre satisfactorio.
- Variedad de interacción: mezcla texto, opción múltiple, relación de columnas y multimedia.
- En los retos de texto usa palabra, letra, numero, codigo_corto o frase_libre.
- Para palabra, letra, numero y codigo_corto exige una única respuesta objetiva de máximo 32 caracteres. Formula esos retos como identificar, nombrar o completar una clave inequívoca.
- Usa frase_libre únicamente cuando la intención sea reflexionar, proponer, justificar, explicar o describir. En frase_libre cualquier texto no vacío se considera correcto: deja respuesta_correcta vacía y respuestas_aceptadas como arreglo vacío.
- Si una solución cerrada necesita dos o más palabras, usa opción múltiple o relación de columnas; no intentes validarla como texto exacto.
- Para opción múltiple incluye 3 a 5 opciones plausibles y solo una correcta.
- En opción múltiple, la respuesta correcta debe coincidir exactamente con una de las opciones.
- Para relación de columnas incluye 3 o 4 pares claros.
- Para multimedia incluye media con tipo, url o referencia, y alt.
- CRÍTICO PARA IMÁGENES COHERENTES Y DE APOYO: Cada "imagen_prompt" debe describir objetos, composición, colores, personajes y ambiente. Los colores son solo una decisión visual: nunca pidas ni incluyas códigos hexadecimales, nombres de colores, paletas escritas o anotaciones técnicas de color dentro de la imagen. El texto es excepcional: solo se permiten hasta dos etiquetas de una o dos palabras, con ortografía exacta en el idioma objetivo; nunca frases, párrafos, listas, coordenadas, leyendas extensas ni la respuesta. Si el ejercicio necesita datos escritos, colócalos en "reto", "opciones", "parejas" o "pista". El "alt" sí debe describir el contenido visual para accesibilidad. La imagen nunca debe revelar explícitamente la respuesta.
- Cada sala del mapa debe incluir una lista "preguntas" con exactamente ${data.preguntasPorSala} preguntas internas.
- Las preguntas internas de una misma sala pueden resolverse en cualquier orden.
- Cada pregunta interna debe tener su propio "tipo_interaccion", "reto", "respuesta_correcta" o estructura equivalente, y feedback no vacío.
- Cada pregunta interna debe tener su propia pista escrita y accionable (no vacía y no genérica), basada en una pista textual concreta del reto, sin revelar la respuesta.
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
          "subtipo_respuesta": "palabra | frase_libre | letra | numero | codigo_corto",
          "respuesta_correcta": "una_palabra o vacío para frase_libre",
          "respuestas_aceptadas": ["variantes cerradas; vacío para frase_libre"],
          "opciones": ["Opción A", "Opción B", "Opción C"],
          "parejas": [{ "izquierda": "Elemento 1", "derecha": "Respuesta 1" }],
          "media": { "tipo": "imagen | audio | video", "url": "URL o data", "alt": "Texto alternativo" },
          "pista": "Usa la condición exacta del enunciado para descartar opciones y hallar la respuesta.",
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

function buildMenuSectionsPrompt(data) {
  const temas = Array.isArray(data.temas) ? data.temas : [];
  const objetivosTematicos = temas.length ? temas.map((tema) => `- ${tema}`).join("\n") : `- ${data.tema}`;
  const objetivoFinal = data.objetivo || `Guiar al alumnado a completar el escape room sobre ${data.tema}`;
  const narrativaEtiqueta = data.narrativaBase === "otro"
    ? `Otra narrativa: ${data.narrativaPersonalizada || "personalizada"}`
    : data.narrativa;
  const estiloImagen = normalizeString(data.estiloImagen, "Ilustración editorial educativa coherente con la narrativa");
  const languageMode = resolvePromptLanguageDirective(data.idioma);

  return `
Eres un experto en gamificación, narrativa educativa y diseño de escape rooms profesionales.
Responde únicamente con JSON válido.
${languageMode.directive}
Diseña una experiencia para alumnado de ${data.grado} de ${data.nivel} con formato de menú principal por secciones, no por pantallas llamadas salas.

Brief:
- Tema curricular principal: ${data.temaPrincipal || data.tema}
- Temas o subtemas clave:
${objetivosTematicos}
- Audiencia: ${data.publico}
- Duración estimada: ${data.duracion} minutos
- Cantidad exacta de actividades: ${data.misiones}
- La lista "misiones" es el modelo compartido y debe contener exactamente ${data.misiones} actividades.
- No agregues, omitas ni combines actividades.
- Preguntas internas por actividad: ${data.preguntasPorSala}
- Estilo narrativo: ${narrativaEtiqueta}
- Estilo visual obligatorio: ${estiloImagen}
- Mantén ese estilo visual en portada, cards, actividades y preguntas.
- Ritmo: ${data.ritmo}
- Dificultad: ${data.dificultad}
- Pistas: ${data.pistas}
- Objetivo final: ${objetivoFinal}

Estructura y comportamiento obligatorios:
- La experiencia abre en un menú con cards en este orden: Introducción, Instrucciones, actividades y Mensaje final.
- Redacta "instrucciones" específicas, claras y accionables para explicar inicio, orden, respuestas, pistas, progreso, temporizador y mensaje final.
- Cada actividad debe incluir exactamente ${data.preguntasPorSala} preguntas que puedan resolverse en cualquier orden.
- Las actividades se desbloquean secuencialmente; cada actividad declara solo la siguiente en "desbloquea".
- Usa títulos y releases genéricos "Actividad 1" y "ACTIVIDAD 01" cuando no exista un nombre editorial mejor. No llames sala a ninguna actividad.
- Mezcla texto, opción múltiple, relación de columnas y multimedia. Para texto usa palabra, letra, numero, codigo_corto o frase_libre.
- Para palabra, letra, numero y codigo_corto exige una única respuesta objetiva de máximo 32 caracteres y formula el reto como identificar, nombrar o completar una clave.
- Usa frase_libre únicamente para reflexionar, proponer, justificar, explicar o describir. Cualquier texto no vacío será correcto: deja respuesta_correcta vacía y respuestas_aceptadas como arreglo vacío.
- Si una solución cerrada necesita dos o más palabras, usa opción múltiple o relación de columnas.
- En opción múltiple incluye de 3 a 5 opciones plausibles y una sola respuesta que coincida exactamente con una opción.
- En relación de columnas incluye 3 o 4 pares claros.
- Cada pregunta debe tener respuesta inequívoca, pista específica y feedback correcto e incorrecto no vacíos.
- Toda imagen debe apoyar el reto sin mostrar la solución; "imagen_prompt" y "imagen_alt" deben describir los detalles funcionales necesarios. Los colores son solo una decisión visual: nunca incluyas códigos hexadecimales, nombres de colores, paletas escritas o anotaciones técnicas dentro de la imagen.

Devuelve SOLO un JSON con esta estructura:
{
  "modo_presentacion": "menu_secciones",
  "titulo": "Nombre creativo y memorable",
  "subtitulo": "Gancho breve",
  "introduccion": "Apertura narrativa",
  "instrucciones": "Cómo iniciar, avanzar, responder, usar pistas y llegar al mensaje final",
  "ambientacion": "Descripción del mundo visual",
  "linea_visual_base": "Dirección visual consistente",
  "misiones": [
    {
      "id": "m1",
      "release": "ACTIVIDAD 01",
      "titulo": "Actividad 1",
      "historia": "Contexto inmersivo de la actividad",
      "reto": "Descripción de la actividad",
      "preguntas": [
        {
          "id": "q1",
          "titulo": "Pregunta 1",
          "reto": "Desafío interno",
          "tipo_interaccion": "texto | opcion_multiple | relacion_columnas | multimedia",
          "subtipo_respuesta": "palabra | frase_libre | letra | numero | codigo_corto",
          "respuesta_correcta": "una_palabra o vacío para frase_libre",
          "respuestas_aceptadas": ["variantes cerradas; vacío para frase_libre"],
          "opciones": ["Opción A", "Opción B", "Opción C"],
          "parejas": [{ "izquierda": "Elemento 1", "derecha": "Respuesta 1" }],
          "media": { "tipo": "imagen | audio | video", "url": "", "alt": "Texto alternativo" },
          "pista": "Pista concreta sin revelar la respuesta",
          "retroalimentacion_correcta": "Mensaje de éxito",
          "retroalimentacion_incorrecta": "Mensaje de error",
          "imagen_prompt": "Descripción visual funcional",
          "imagen_alt": "Descripción breve accesible",
          "imagen": ""
        }
      ],
      "desbloquea": ["m2"],
      "bloqueada_inicial": false
    }
  ],
  "conclusion": "Mensaje final satisfactorio"
}`.trim();
}

function buildPrompt(data) {
  return normalizePresentationMode(data?.modoPresentacion) === PRESENTATION_MODE_MENU
    ? buildMenuSectionsPrompt(data)
    : buildRoomsPrompt(data);
}

function prepareGeneratedProjectForPresentation(project, requestedMode = PRESENTATION_MODE_ROOMS) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return project;
  const mode = normalizePresentationMode(requestedMode);
  const currentInstructions = normalizeString(project.instrucciones, "");
  const usesMismatchedFallback = Object.values(DEFAULT_INSTRUCTIONS_BY_PRESENTATION).includes(currentInstructions)
    && currentInstructions !== DEFAULT_INSTRUCTIONS_BY_PRESENTATION[mode];
  return {
    ...project,
    modo_presentacion: mode,
    instrucciones: usesMismatchedFallback ? "" : currentInstructions
  };
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

function extractJsonFromGeminiResponse(rawResponse = {}) {
  const text = String(rawResponse?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  return extractGeneratedJson(text);
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
  const estiloUsuario = normalizeString(data.estiloImagen, "");
  const estiloIA = normalizeString(data.linea_visual_base, "");
  const narrativaCtx = normalizeString(data.narrativa, "la narrativa del escape room");
  const estiloLower = estiloUsuario.toLowerCase();
  const allowsFuturistic = /(futur|ciencia ficcion|ciencia ficción|cyberpunk|neon|neón|tecnolog|hologram|digital|sci[- ]?fi)/i.test(estiloLower);
  const restrictions = allowsFuturistic
    ? ""
    : " Evita por completo hologramas, neón, interfaces digitales, armaduras sci-fi, pantallas flotantes y estética futurista.";
  const line = estiloUsuario
    ? `Estilo visual obligatorio: ${estiloUsuario}. Debe ser coherente con ${narrativaCtx}.${restrictions}`
    : `${estiloIA || `Ilustración editorial coherente con ${narrativaCtx}.`}${restrictions}`;
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
  const languageMode = resolvePromptLanguageDirective(data?.idioma);
  const terms = getPresentationTerminology(data?.modo_presentacion || data?.modoPresentacion);
  return [
    `Escena funcional para la ${terms.itemSingular} ${index + 1} (${normalizeString(mission.titulo, getDefaultMissionTitle(index, terms.mode))}).`,
    `Tema principal: ${visual.temaResumen}.`,
    `Dirección visual: ${visual.line}.`,
    `Idioma del contenido pedagógico y de cualquier etiqueta mínima: ${languageMode.name}.`,
    buildImageTextPolicyLine({ formData: data, allowOptionalText: true }),
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    `La imagen debe apoyar el reto: ${normalizeString(mission.reto, `Resolver la ${terms.itemSingular}.`)}`,
    `REGLA ESTRICTA: La imagen es un apoyo visual o pista para que el estudiante resuelva el reto. Bajo ninguna circunstancia muestres o escribas la respuesta correcta o solución final directamente sobre el dibujo.`,
    normalizeString(mission.imagen_prompt, "") || `Apoyo visual útil para resolver la ${terms.itemSingular}.`,
    buildImageTextPolicyLine({ formData: data, allowOptionalText: true })
  ].filter(Boolean).join("\n");
}

function buildQuestionVisualPrompt({ data, mission, question, roomIndex, questionIndex }) {
  const visual = buildVisualDirection(data);
  const languageMode = resolvePromptLanguageDirective(data?.idioma);
  const terms = getPresentationTerminology(data?.modo_presentacion || data?.modoPresentacion);
  return [
    `Escena funcional para la pregunta ${questionIndex + 1} de la ${terms.itemSingular} ${roomIndex + 1} (${normalizeString(mission.titulo, getDefaultMissionTitle(roomIndex, terms.mode))}).`,
    `Pregunta interna: ${normalizeString(question.titulo, `Pregunta ${questionIndex + 1}`)}.`,
    `Tema principal: ${visual.temaResumen}.`,
    `Dirección visual: ${visual.line}.`,
    `Idioma del contenido pedagógico y de cualquier etiqueta mínima: ${languageMode.name}.`,
    buildImageTextPolicyLine({ formData: data, allowOptionalText: true }),
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    `La imagen debe apoyar el reto: ${normalizeString(question.reto, "Resolver la pregunta.")}`,
    `REGLA ESTRICTA: La imagen es un apoyo visual o pista para resolver el ejercicio. Bajo ninguna circunstancia muestres, dibujes o escribas la respuesta correcta o el valor de la solución final de forma explícita en la imagen. La solución debe quedar oculta para que el estudiante la deduzca.`,
    normalizeString(question.imagen_prompt, "") || normalizeString(question.media?.texto || question.media?.alt, "") || "Apoyo visual útil para resolver la pregunta.",
    buildImageTextPolicyLine({ formData: data, allowOptionalText: true })
  ].filter(Boolean).join("\n");
}

async function generateGeminiImage(prompt, { aspectRatio = "16:9", imageSize = "2K", temperature = 0.58 } = {}) {
  const imageData = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
    method: "POST",
    body: {
      model: IMAGE_MODEL,
      payload: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
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

function resolveImageGenerationScope(project, options = {}) {
  const missionIndexes = Array.isArray(options.missionIndexes)
    ? options.missionIndexes
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < (project?.misiones?.length || 0))
    : null;
  const questionScope = options.questionScope && Number.isInteger(Number(options.questionScope.missionIndex)) && Number.isInteger(Number(options.questionScope.questionIndex))
    ? {
        missionIndex: Number(options.questionScope.missionIndex),
        questionIndex: Number(options.questionScope.questionIndex)
      }
    : null;
  return {
    missionIndexes: missionIndexes ? new Set(missionIndexes) : null,
    questionScope,
    includeMissionImage: options.includeMissionImage !== false,
    includeQuestions: options.includeQuestions !== false,
    forceQuestionImages: options.forceQuestionImages === true
  };
}

function questionNeedsImage(question = {}) {
  const hasMedia = question.media && (question.media.tipo === "imagen" || !question.media.tipo);
  return question.tipo_interaccion === "multimedia" || question.imagen_prompt || question.imagen || hasMedia;
}

async function generateMissionImages(project, context, onProgress, options = {}) {
  const scope = resolveImageGenerationScope(project, options);
  const terms = getPresentationTerminology(project?.modo_presentacion || context?.modoPresentacion);
  let generated = 0;
  let failed = 0;
  let total = 0;

  // Calcular total de imágenes a generar de antemano
  for (const [index, mission] of project.misiones.entries()) {
    if (scope.missionIndexes && !scope.missionIndexes.has(index)) {
      continue;
    }
    if (scope.includeMissionImage) {
      total += 1;
    }
    for (const [questionIndex, question] of (Array.isArray(mission.preguntas) ? mission.preguntas.entries() : [])) {
      if (!question) continue;
      if (scope.questionScope && (scope.questionScope.missionIndex !== index || scope.questionScope.questionIndex !== questionIndex)) {
        continue;
      }
      const needsImage = scope.includeQuestions && (scope.forceQuestionImages || questionNeedsImage(question));
      if (!needsImage) continue;
      total += 1;
    }
  }

  let processed = 0;

  for (const [index, mission] of project.misiones.entries()) {
    if (scope.missionIndexes && !scope.missionIndexes.has(index)) {
      continue;
    }
    if (scope.includeMissionImage) {
      processed += 1;
      if (onProgress) onProgress(processed, total);

      try {
        const image = await generateGeminiImage(buildRoomVisualPrompt({ data: { ...project, ...context }, mission, index }), { aspectRatio: "4:3" });
        mission.imagen = image;
        mission.imagen_alt = mission.imagen_alt || mission.media?.alt || `Imagen de la ${terms.itemSingular} ${index + 1}`;
        mission.media = {
          ...(mission.media || {}),
          tipo: "imagen",
          url: image,
          alt: mission.imagen_alt,
          titulo: mission.media?.titulo || mission.titulo,
          texto: mission.media?.texto || mission.reto
        };
        generated += 1;
      } catch (error) {
        console.warn(`No se pudo generar la imagen de la ${terms.itemSingular} ${index + 1}:`, error);
        failed += 1;
      }
    }

    for (const [questionIndex, question] of (Array.isArray(mission.preguntas) ? mission.preguntas.entries() : [])) {
      if (!question) continue;
      if (scope.questionScope && (scope.questionScope.missionIndex !== index || scope.questionScope.questionIndex !== questionIndex)) {
        continue;
      }
      const needsImage = scope.includeQuestions && (scope.forceQuestionImages || questionNeedsImage(question));
      if (!needsImage) continue;

      processed += 1;
      if (onProgress) onProgress(processed, total);

      try {
        const image = await generateGeminiImage(buildQuestionVisualPrompt({ data: { ...project, ...context }, mission, question, roomIndex: index, questionIndex }), { aspectRatio: "4:3" });
        question.imagen = image;
        question.imagen_alt = question.imagen_alt || question.media?.alt || `Imagen de la pregunta ${questionIndex + 1}`;
        question.media = {
          ...(question.media || {}),
          tipo: "imagen",
          url: image,
          alt: question.imagen_alt,
          titulo: question.media?.titulo || question.titulo,
          texto: question.media?.texto || question.reto
        };
        generated += 1;
      } catch (error) {
        console.warn(`No se pudo generar la imagen de la pregunta ${questionIndex + 1} de la ${terms.itemSingular} ${index + 1}:`, error);
        failed += 1;
      }
    }
  }
  return { generated, failed, total };
}

function buildRoomRegenerationPrompt({ formData = {}, missionIndex = 0, sourceMission = {}, questionCount = 1 }) {
  const safeIndex = Math.max(0, Number(missionIndex) || 0);
  const visual = buildVisualDirection(formData);
  const languageMode = resolvePromptLanguageDirective(formData.idioma);
  const strictTextPolicy = buildImageTextPolicyLine({ formData, allowOptionalText: false });
  const terms = getPresentationTerminology(formData.modoPresentacion);
  return [
    `Regenera una sola ${terms.itemSingular} del escape room, como objeto JSON estricto.`,
    `Genera exactamente la ${terms.itemSingular} #${safeIndex + 1} y ${questionCount} preguntas internas.`,
    `Debe devolver solo JSON con esta forma: {"mission": {...}}.`,
    `Idioma objetivo del contenido: ${languageMode.name}.`,
    "Mantén el nivel de detalle, coherencia narrativa y dificultad de la experiencia original.",
    strictTextPolicy,
    `Tema principal: ${formData.temaPrincipal || formData.tema}.`,
    `Narrativa: ${formData.narrativa || "general"}.`,
    `Estilo visual general: ${visual.line}.`,
    `La ${terms.itemSingular} debe incluir: id, titulo, release, historia, reto, tipo_interaccion, subtipo_respuesta, respuesta_correcta, respuestas_aceptadas, opciones, parejas, media, pista, retroalimentacion_correcta, retroalimentacion_incorrecta, desbloquea y bloqueada_inicial.`,
    'Regla de respuestas: usa palabra para validación exacta de una sola palabra; usa frase_libre para reflexión o desarrollo, donde cualquier texto no vacío es correcto y no debe existir respuesta modelo.',
    "Dentro de preguntas usa la estructura esperada por la app con: id, titulo, reto, tipo_interaccion, subtipo_respuesta, respuesta_correcta, respuestas_aceptadas, opciones, parejas, media, pista, retroalimentacion_correcta, retroalimentacion_incorrecta, imagen_prompt, imagen_alt e imagen.",
    `Si no hay suficientes respuestas u opciones, usa defaults claros y consistentes con preguntas de nivel ${formData.nivel}.`,
    `Si la ${terms.itemSingular} anterior ya existía, conserva su id si aplica: ${sourceMission.id || "m" + (safeIndex + 1)}`
  ].filter(Boolean).join("\n");
}

function buildQuestionRegenerationPrompt({ formData = {}, mission = {}, missionIndex = 0, questionIndex = 0, sourceQuestion = {} }) {
  const safeQuestionIndex = Math.max(0, Number(questionIndex) || 0);
  const visual = buildVisualDirection(formData);
  const languageMode = resolvePromptLanguageDirective(formData.idioma);
  const strictTextPolicy = buildImageTextPolicyLine({ formData, allowOptionalText: false });
  const terms = getPresentationTerminology(formData.modoPresentacion);
  return [
    "Regenera una sola pregunta interna, como objeto JSON estricto.",
    "Devuelve solo JSON con esta forma: {\"question\": {...}}.",
    `No cambies otras preguntas ni la ${terms.itemSingular}.`,
    `La pregunta es la #${safeQuestionIndex + 1} de la ${terms.itemSingular} #${Number(missionIndex) + 1}.`,
    `Idioma objetivo del contenido: ${languageMode.name}.`,
    strictTextPolicy,
    `Tema principal: ${formData.temaPrincipal || formData.tema}.`,
    `Narrativa de la ${terms.itemSingular}: ${mission.reto || mission.historia || ""}.`,
    `Estilo visual base: ${visual.line}.`,
    "La pregunta debe incluir: id, titulo, reto, tipo_interaccion, subtipo_respuesta, respuesta_correcta, respuestas_aceptadas, opciones, parejas, media, pista, retroalimentacion_correcta, retroalimentacion_incorrecta, imagen_prompt, imagen_alt, imagen y pista textual.",
    'Regla de respuestas: usa palabra para validación exacta de una sola palabra; usa frase_libre para reflexión o desarrollo, donde cualquier texto no vacío es correcto y no debe existir respuesta modelo.',
    "Regenera una pista específica y accionable: menciona 1 o 2 detalles concretos del reto (número, personaje, lugar, condición o relación) para guiar al alumnado sin dar la respuesta.",
    `Mantén coherencia pedagógica para ${formData.nivel} y dificulta de forma similar al entorno actual.`,
    `Si puedes, conserva la intención de: ${sourceQuestion?.reto || "reto existente"} y ${sourceQuestion?.respuesta_correcta || "respuesta correcta"}.`
  ].join("\n");
}

function pickMissionFromGeminiPayload(parsed = {}) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("La IA no devolvió una misión válida.");
  }
  if (parsed.mission && typeof parsed.mission === "object") return parsed.mission;
  if (parsed.misiones && Array.isArray(parsed.misiones) && parsed.misiones.length) return parsed.misiones[0];
  if (parsed.title) return parsed;
  throw new Error("La IA no devolvió una estructura de misión reconocible.");
}

function pickQuestionFromGeminiPayload(parsed = {}) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("La IA no devolvió una pregunta válida.");
  }
  if (parsed.question && typeof parsed.question === "object") return parsed.question;
  if (parsed.pregunta && typeof parsed.pregunta === "object") return parsed.pregunta;
  if (parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length) return parsed.questions[0];
  throw new Error("La IA no devolvió una estructura de pregunta reconocible.");
}

async function replaceActivityImage({ missionIndex, questionIndex, file }) {
  if (!state.currentUser?.uid) {
    setStatus("Debes iniciar sesión para guardar imágenes en Firebase.", "warning");
    return;
  }
  if (!state.project) {
    setStatus("Genera un escape room antes de sustituir una imagen.", "warning");
    return;
  }
  const targetMission = Number(missionIndex);
  const targetQuestion = Number.isFinite(Number(questionIndex)) ? Number(questionIndex) : null;
  const terms = getPresentationTerminology();

  const mission = state.project.misiones?.[targetMission];
  if (!mission) {
    setStatus(`No se encontró la ${terms.itemSingular} objetivo.`, "bad");
    return;
  }
  if (targetQuestion !== null && !mission.preguntas?.[targetQuestion]) {
    setStatus("No se encontró la pregunta objetivo.", "bad");
    return;
  }

  if (!file) {
    setStatus("Selecciona una imagen para sustituir.", "warning");
    return;
  }

  if (!file.type.startsWith("image/")) {
    setStatus("El archivo seleccionado no parece ser una imagen.", "warning");
    return;
  }

  state.isGenerating = true;
  renderMissionEditor();
  const activityLabel = targetQuestion === null
    ? `${terms.itemSingular} ${targetMission + 1}`
    : `pregunta ${targetQuestion + 1} de la ${terms.itemSingular} ${targetMission + 1}`;
  setStatus(`Subiendo imagen para ${activityLabel}...`, "info");

  try {
    const sessionId = await ensureActiveRemoteSession();
    if (!sessionId) {
      throw new Error("No se pudo crear o recuperar la sesión activa.");
    }
    const uid = state.currentUser.uid;
    const imageDataUrl = await readImageFileAsDataUrl(file);
    const fileName = buildActivityImagePath({
      missionIndex: targetMission,
      questionIndex: targetQuestion
    });
    const topicId = await ensureActiveTopic(sessionId);
    const storagePath = `escaperooms/${uid}/${sessionId}/${topicId}/${fileName}`;
    const storageUrl = await uploadImageIfDataUrl(imageDataUrl, storagePath);

    if (targetQuestion === null) {
      mission.imagen = storageUrl;
      mission.imagen_alt = mission.imagen_alt || mission.media?.alt || `Imagen de la ${terms.itemSingular} ${targetMission + 1}`;
      mission.media = {
        ...(mission.media || {}),
        tipo: "imagen",
        url: storageUrl,
        alt: mission.imagen_alt,
        titulo: mission.media?.titulo || mission.titulo,
        texto: mission.media?.texto || mission.reto
      };
    } else {
      const question = mission.preguntas[targetQuestion];
      question.imagen = storageUrl;
      question.imagen_alt = question.imagen_alt || question.media?.alt || `Imagen de la pregunta ${targetQuestion + 1}`;
      question.media = {
        ...(question.media || {}),
        tipo: "imagen",
        url: storageUrl,
        alt: question.imagen_alt,
        titulo: question.media?.titulo || question.titulo,
        texto: question.media?.texto || question.reto
      };
    }

    renderOutputsNow();
    const savedMessage = isDataUrl(storageUrl)
      ? `Imagen sustituida para ${activityLabel}, pero no se pudo guardar en Storage en este entorno.`
      : `Imagen sustituida y guardada para ${activityLabel}.`;
    setStatus(savedMessage, isDataUrl(storageUrl) ? "warning" : "success");
  } catch (error) {
    console.error("No se pudo sustituir la imagen:", error);
    setStatus(`No fue posible sustituir la imagen de ${activityLabel}.`, "bad");
  } finally {
    state.isGenerating = false;
    refreshPanels();
  }
}

async function regenerateMissionContent(index) {
  const terms = getPresentationTerminology();
  if (!state.project) {
    setStatus(`Genera un escape room antes de regenerar una ${terms.itemSingular}.`, "warning");
    return;
  }
  const missionIndex = Number(index);
  if (!Number.isInteger(missionIndex) || missionIndex < 0 || missionIndex >= state.project.misiones.length) {
    setStatus(`Selecciona una ${terms.itemSingular} válida para regenerar.`, "warning");
    return;
  }

  const sourceMission = state.project.misiones[missionIndex];
  const formData = getFormData();
  const questionCount = Math.max(1, Array.isArray(sourceMission.preguntas) ? sourceMission.preguntas.length : Number(formData.preguntasPorSala || 1));
  const prompt = buildRoomRegenerationPrompt({
    formData,
    missionIndex,
    sourceMission,
    questionCount
  });

  state.isGenerating = true;
  setStatus(`Regenerando ${terms.itemSingular} ${missionIndex + 1}...`, "info");
  renderMissionEditor();
  try {
    const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
      method: "POST",
      body: {
        model: formData.modelo || TEXT_MODEL_DEFAULT,
        payload: {
          systemInstruction: {
            parts: [{
              text: "Responde únicamente con JSON válido. Sin texto adicional."
            }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.72
          }
        }
      }
    });

    const missionPayload = pickMissionFromGeminiPayload(extractJsonFromGeminiResponse(response));
    const normalized = createMissionDraft(missionIndex, {
      ...missionPayload,
      id: missionPayload.id || sourceMission.id,
      release: sourceMission.release || getDefaultMissionRelease(missionIndex, terms.mode),
      bloqueada_inicial: missionIndex !== 0
    }, questionCount, terms.mode);

    state.project.misiones[missionIndex] = normalized;
    state.project = withDefaultRoutes(state.project);

    state.project.misiones[missionIndex].release = getDefaultMissionRelease(missionIndex, terms.mode);
    if (!state.project.misiones[missionIndex].media) {
      state.project.misiones[missionIndex].media = null;
    }

    const imageStats = await generateMissionImages(state.project, formData, (current, total) => {
      setStatus(`Regenerando ${terms.itemSingular} ${missionIndex + 1} (${current}/${total})`, "info");
      renderMissionEditor();
    }, {
      missionIndexes: [missionIndex],
      includeMissionImage: true,
      includeQuestions: true,
      forceQuestionImages: true
    });

    renderMissionEditor();
    renderOutputsNow();
    setStatus(
      `${terms.itemSingularTitle} ${missionIndex + 1} regenerada · ${imageStats.generated}/${imageStats.total} imágenes listas${imageStats.failed ? ` · ${imageStats.failed} sin imagen` : ""}.`,
      "success"
    );
  } catch (error) {
    console.error(`No se pudo regenerar la ${terms.itemSingular}:`, error);
    setStatus(`No se pudo regenerar la ${terms.itemSingular}. Intenta de nuevo.`, "bad");
  } finally {
    state.isGenerating = false;
    refreshPanels();
  }
}

async function regenerateQuestionContent(missionIndex, questionIndex) {
  if (!state.project) {
    setStatus("Genera un escape room antes de regenerar una pregunta.", "warning");
    return;
  }
  const roomIndex = Number(missionIndex);
  const qIndex = Number(questionIndex);
  const mission = state.project.misiones?.[roomIndex];
  const question = mission?.preguntas?.[qIndex];
  const terms = getPresentationTerminology();
  if (!mission || !question) {
    setStatus("Selecciona una pregunta válida para regenerar.", "warning");
    return;
  }

  const formData = getFormData();
  const prompt = buildQuestionRegenerationPrompt({
    formData,
    mission,
    missionIndex: roomIndex,
    questionIndex: qIndex,
    sourceQuestion: question
  });
  state.isGenerating = true;
  setStatus(`Regenerando pregunta ${qIndex + 1} de la ${terms.itemSingular} ${roomIndex + 1}...`, "info");

  try {
    const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
      method: "POST",
      body: {
        model: formData.modelo || TEXT_MODEL_DEFAULT,
        payload: {
          systemInstruction: {
            parts: [{
              text: "Responde únicamente con JSON válido. Sin texto adicional."
            }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7
          }
        }
      }
    });

    const questionPayload = pickQuestionFromGeminiPayload(extractJsonFromGeminiResponse(response));
    const normalized = createQuestionDraft(roomIndex, qIndex, {
      ...questionPayload,
      id: question.id
    });
    mission.preguntas[qIndex] = normalized;
    state.project = withDefaultRoutes(state.project);

    const imageStats = await generateMissionImages(state.project, formData, (current, total) => {
      setStatus(`Regenerando pregunta ${qIndex + 1} (${current}/${total})`, "info");
      renderMissionEditor();
    }, {
      missionIndexes: [roomIndex],
      includeMissionImage: false,
      includeQuestions: true,
      forceQuestionImages: true,
      questionScope: { missionIndex: roomIndex, questionIndex: qIndex }
    });

    renderMissionEditor();
    renderOutputsNow();
    setStatus(
      `Pregunta ${qIndex + 1} de ${terms.itemSingular} ${roomIndex + 1} regenerada · ${imageStats.generated}/${imageStats.total} imágenes listas${imageStats.failed ? ` · ${imageStats.failed} sin imagen` : ""}.`,
      "success"
    );
  } catch (error) {
    console.error("No se pudo regenerar la pregunta:", error);
    setStatus("No se pudo regenerar la pregunta. Intenta de nuevo.", "bad");
  } finally {
    state.isGenerating = false;
    refreshPanels();
  }
}

function createQuestionDraft(roomIndex = 0, questionIndex = 0, partial = {}, presentationMode = getPresentationMode()) {
  const title = partial.titulo || `Pregunta ${String(questionIndex + 1).padStart(2, "0")}`;
  const draftQuestion = {
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
    pista: partial.pista || "",
    retroalimentacion_correcta: partial.retroalimentacion_correcta || "",
    retroalimentacion_incorrecta: partial.retroalimentacion_incorrecta || "",
    imagen_prompt: partial.imagen_prompt || "",
    imagen_alt: partial.imagen_alt || "",
    imagen: partial.imagen || "",
    bloqueada_inicial: partial.bloqueada_inicial ?? false
  };
  const terms = getPresentationTerminology(presentationMode);
  const normalizedHintQuestion = {
    ...draftQuestion,
    pista: normalizeQuestionHint(draftQuestion, `${terms.itemSingularTitle} ${roomIndex + 1}`, "")
  };
  const question = normalizeQuestion({
    ...normalizedHintQuestion
  }, roomIndex, questionIndex);

  question._correctOptionIndex = typeof partial._correctOptionIndex === "number"
    ? partial._correctOptionIndex
    : findCorrectOptionIndex(question);
  return question;
}

function createMissionDraft(index = 0, partial = {}, questionCount = 1, presentationMode = getPresentationMode()) {
  const mode = normalizePresentationMode(presentationMode);
  const terms = getPresentationTerminology(mode);
  const title = normalizeMissionTitle(partial.titulo, getDefaultMissionTitle(index, mode), mode);
  const preguntas = Array.isArray(partial.preguntas) && partial.preguntas.length
    ? normalizeQuestionList(partial.preguntas, index)
    : Array.from({ length: Math.max(1, questionCount) }, (_, questionIndex) => createQuestionDraft(index, questionIndex, {}, mode));

  const mission = normalizeMission({
    id: partial.id || buildMissionId(title, index),
    titulo: title,
    release: normalizeMissionRelease(partial.release, getDefaultMissionRelease(index, mode), mode),
    historia: partial.historia || `Introduce aquí la escena y el contexto de la ${terms.itemSingular}.`,
    reto: partial.reto || `Define aquí el reto principal de la ${terms.itemSingular}.`,
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
  }, index, mode);

  const repairedMission = repairMissionAnswers({
    ...mission,
    ...partial,
    titulo: title,
    release: normalizeMissionRelease(partial.release, getDefaultMissionRelease(index, mode), mode),
    preguntas
  }, index);

  repairedMission._correctOptionIndex = typeof partial._correctOptionIndex === "number"
    ? partial._correctOptionIndex
    : findCorrectOptionIndex(repairedMission);
  return repairedMission;
}

function getMissionLabel(index = 0, mission = {}) {
  return mission.titulo || getDefaultMissionTitle(index);
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
  const terms = getPresentationTerminology();
  const missionLabel = `${terms.itemSingularTitle} ${roomIndex + 1}`;
  const repaired = {
    ...question,
    retroalimentacion_correcta: normalizeString(question.retroalimentacion_correcta, "Correcto."),
    retroalimentacion_incorrecta: normalizeString(question.retroalimentacion_incorrecta, "Respuesta incorrecta. Intenta de nuevo."),
    pista: ""
  };
  repaired.pista = normalizeQuestionHint(repaired, missionLabel);
  repaired.subtipo_respuesta = resolveTextSubtypeForAnswer(repaired.subtipo_respuesta, repaired.respuesta_correcta);
  if (["texto", "multimedia"].includes(repaired.tipo_interaccion) && repaired.subtipo_respuesta === "frase_corta") repaired.subtipo_respuesta = "palabra";

  if (["texto", "multimedia"].includes(repaired.tipo_interaccion) && repaired.subtipo_respuesta === "palabra") {
    repaired.respuesta_correcta = extractSingleWordAnswer(repaired.respuesta_correcta);
    repaired.reto = buildSingleWordChallenge(repaired.reto, repaired.titulo || `Pregunta ${questionIndex + 1}`, repaired.respuesta_correcta);
  }

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
    const acceptedSource = ["texto", "multimedia"].includes(repaired.tipo_interaccion) && repaired.subtipo_respuesta === "palabra"
      ? [repaired.respuesta_correcta, ...(Array.isArray(repaired.respuestas_aceptadas) ? repaired.respuestas_aceptadas : [repaired.respuestas_aceptadas])]
          .map((answer) => extractSingleWordAnswer(answer, repaired.respuesta_correcta))
      : repaired.respuestas_aceptadas || repaired.respuesta_correcta || [];
    const accepted = normalizeAcceptedAnswers(acceptedSource);
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
  repaired.subtipo_respuesta = resolveTextSubtypeForAnswer(repaired.subtipo_respuesta, repaired.respuesta_correcta);
  if (["texto", "multimedia"].includes(repaired.tipo_interaccion) && repaired.subtipo_respuesta === "frase_corta") repaired.subtipo_respuesta = "palabra";

  if (["texto", "multimedia"].includes(repaired.tipo_interaccion) && repaired.subtipo_respuesta === "palabra") {
    repaired.respuesta_correcta = extractSingleWordAnswer(repaired.respuesta_correcta || preguntas[0]?.respuesta_correcta);
    repaired.reto = buildSingleWordChallenge(repaired.reto, repaired.titulo || getMissionLabel(index, repaired), repaired.respuesta_correcta);
  }

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
    const acceptedSource = ["texto", "multimedia"].includes(repaired.tipo_interaccion) && repaired.subtipo_respuesta === "palabra"
      ? [repaired.respuesta_correcta, ...(Array.isArray(repaired.respuestas_aceptadas) ? repaired.respuestas_aceptadas : [repaired.respuestas_aceptadas])]
          .map((answer) => extractSingleWordAnswer(answer, repaired.respuesta_correcta))
      : repaired.respuestas_aceptadas || repaired.respuesta_correcta || [];
    const accepted = normalizeAcceptedAnswers(acceptedSource);
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

function repairGeneratedQuestion(question = {}, roomIndex = 0, questionIndex = 0) {
  const repaired = repairQuestionAnswers(question, roomIndex, questionIndex);
  const label = repaired.titulo || `Pregunta ${questionIndex + 1}`;

  if (repaired.tipo_interaccion === "opcion_multiple") {
    const options = [...new Set(normalizeTextList(repaired.opciones || []))];
    const fallbackOptions = ["Opción principal", "Otra alternativa", "Tercera alternativa"];
    while (options.length < 2) {
      options.push(fallbackOptions.find((option) => !options.includes(option)) || `Alternativa ${options.length + 1}`);
    }
    repaired.opciones = options;

    let correctIndex = findCorrectOptionIndex(repaired);
    if (correctIndex < 0) {
      const declaredAnswer = normalizeString(question.respuesta_correcta, "");
      if (declaredAnswer && !repaired.opciones.includes(declaredAnswer)) {
        repaired.opciones.push(declaredAnswer);
        correctIndex = repaired.opciones.length - 1;
      } else {
        correctIndex = 0;
      }
    }
    repaired._correctOptionIndex = correctIndex;
    repaired.respuesta_correcta = repaired.opciones[correctIndex];
    repaired.respuestas_aceptadas = [repaired.respuesta_correcta];
  } else if (repaired.tipo_interaccion === "relacion_columnas") {
    const pairs = normalizePairList(repaired.parejas || []);
    while (pairs.length < 2) {
      const pairNumber = pairs.length + 1;
      pairs.push({
        izquierda: `${label} · elemento ${pairNumber}`,
        derecha: `Correspondencia ${pairNumber}`
      });
    }
    repaired.parejas = pairs;
  } else if (repaired.subtipo_respuesta === "frase_libre") {
    repaired.respuesta_correcta = "";
    repaired.respuestas_aceptadas = [];
  } else if (!normalizeAcceptedAnswers(repaired.respuestas_aceptadas || repaired.respuesta_correcta || []).length) {
    const subtypeFallbacks = {
      letra: "A",
      numero: "1",
      codigo_corto: "CLAVE"
    };
    const fallbackAnswer = subtypeFallbacks[repaired.subtipo_respuesta]
      || extractSingleWordAnswer(repaired.titulo || repaired.reto, "clave")
      || "clave";
    repaired.respuesta_correcta = fallbackAnswer;
    repaired.respuestas_aceptadas = [fallbackAnswer];
    if (repaired.subtipo_respuesta === "palabra") {
      repaired.reto = buildSingleWordChallenge(repaired.reto, label, fallbackAnswer);
    }
  }

  if (repaired.tipo_interaccion === "multimedia" && !repaired.media?.url && !normalizeString(repaired.media?.texto || repaired.media?.alt || "", "")) {
    repaired.media = {
      tipo: "imagen",
      url: "",
      alt: `Apoyo visual para ${label}`,
      titulo: label,
      texto: normalizeString(repaired.reto, `Resuelve ${label}.`)
    };
  }

  return repaired;
}

function repairGeneratedProject(project = {}, formData = {}) {
  const aligned = fitProjectToConfiguredCounts(project, formData);
  const presentationMode = normalizePresentationMode(formData.modoPresentacion || aligned.project.modo_presentacion);
  const repairedMissions = aligned.project.misiones.map((mission, missionIndex) => {
    const questions = Array.isArray(mission.preguntas) && mission.preguntas.length
      ? mission.preguntas.map((question, questionIndex) => repairGeneratedQuestion(question, missionIndex, questionIndex))
      : [repairGeneratedQuestion(createQuestionDraft(missionIndex, 0, mission, presentationMode), missionIndex, 0)];
    return repairMissionAnswers({ ...mission, preguntas: questions }, missionIndex);
  });

  return {
    ...aligned,
    project: withDefaultRoutes({
      ...aligned.project,
      modo_presentacion: presentationMode,
      misiones: repairedMissions
    })
  };
}

function validateQuestionSetup(question = {}, roomIndex = 0, questionIndex = 0, presentationMode = getPresentationMode()) {
  const issues = [];
  const terms = getPresentationTerminology(presentationMode);
  const label = `${terms.itemSingularTitle} ${roomIndex + 1} · Pregunta ${questionIndex + 1}`;
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
  } else if (question.subtipo_respuesta === "frase_libre") {
    question.respuesta_correcta = "";
    question.respuestas_aceptadas = [];
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

function validateMissionSetup(mission = {}, index = 0, presentationMode = getPresentationMode()) {
  const issues = [];
  const terms = getPresentationTerminology(presentationMode);
  const label = getMissionLabel(index, mission);
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];

  if (questions.length) {
    questions.forEach((question, questionIndex) => {
      issues.push(...validateQuestionSetup(question, index, questionIndex, presentationMode));
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
  } else if (mission.subtipo_respuesta === "frase_libre") {
    mission.respuesta_correcta = "";
    mission.respuestas_aceptadas = [];
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
    issues.push(`${label}: la ${terms.itemSingular} multimedia necesita un recurso o una indicación textual.`);
  }

  return issues;
}

function validateProjectSetup(project = null) {
  const normalized = withDefaultRoutes(project || state.project || {});
  const issues = [];
  const mode = normalizePresentationMode(normalized.modo_presentacion);

  normalized.misiones.forEach((mission, index) => {
    issues.push(...validateMissionSetup(mission, index, mode));
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

function applySequentialMissionRoutes(missions = []) {
  return missions.map((mission, index) => {
    const nextMission = missions[index + 1] || null;
    return {
      ...mission,
      bloqueada_inicial: index !== 0,
      desbloquea: nextMission ? [nextMission.id] : []
    };
  });
}

function withDefaultRoutes(project) {
  const hydrated = normalizeEscapeRoomProject(project);
  const presentationMode = normalizePresentationMode(hydrated.modo_presentacion);
  hydrated.themeConfig = normalizePreviewThemeConfig(project?.themeConfig || state.previewTheme);
  const sequentialMissions = applySequentialMissionRoutes(hydrated.misiones);
  hydrated.misiones = sequentialMissions.map((mission, index) => {
    const nextMission = sequentialMissions[index + 1];
    const questionCount = Array.isArray(mission.preguntas) && mission.preguntas.length ? mission.preguntas.length : 1;
    const draft = createMissionDraft(index, {
      ...mission,
      desbloquea: nextMission ? [nextMission.id] : [],
      bloqueada_inicial: index !== 0
    }, questionCount, presentationMode);
    if (mission.tipo_interaccion === "opcion_multiple") {
      draft._correctOptionIndex = findCorrectOptionIndex(draft);
    }
    return draft;
  });

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

  return applyAcademicMissionPalettes(hydrated, {
    nivel: hydrated.nivel,
    unidad: hydrated.unidad,
    temaSecundaria: hydrated.tema,
    estacion: hydrated.estacion
  });
}

function fitProjectToConfiguredCounts(project, formData = {}) {
  const targetMissionCount = Math.max(1, Number(formData.misiones || 1));
  const targetQuestionCount = Math.max(1, Number(formData.preguntasPorSala || 1));
  const normalized = withDefaultRoutes(project || {});
  const presentationMode = normalizePresentationMode(formData.modoPresentacion || normalized.modo_presentacion);
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
      alignedQuestions.push(createQuestionDraft(missionIndex, alignedQuestions.length, {}, presentationMode));
      adjustedQuestionCount = true;
    }

    return createMissionDraft(missionIndex, {
      ...sourceMission,
      id: sourceMission.id || `m${missionIndex + 1}`,
      release: getDefaultMissionRelease(missionIndex, presentationMode),
      preguntas: alignedQuestions,
      desbloquea: [],
      bloqueada_inicial: missionIndex !== 0
    }, targetQuestionCount, presentationMode);
  });

  const sequentialMissions = applySequentialMissionRoutes(missions);
  sequentialMissions.forEach((mission, index) => {
    const missionQuestions = Array.isArray(mission.preguntas) ? mission.preguntas.slice(0, targetQuestionCount) : [];
    if (Array.isArray(mission.preguntas) && missionQuestions.length !== mission.preguntas.length) {
      adjustedQuestionCount = true;
    }
    mission.preguntas = missionQuestions;
    while (mission.preguntas.length < targetQuestionCount) {
      mission.preguntas.push(createQuestionDraft(index, mission.preguntas.length, {}, presentationMode));
      adjustedQuestionCount = true;
    }
  });

  return {
    project: withDefaultRoutes({
      ...normalized,
      modo_presentacion: presentationMode,
      misiones: sequentialMissions
    }),
    adjusted: adjustedMissionCount || adjustedQuestionCount,
    adjustedMissionCount,
    adjustedQuestionCount
  };
}

function createProjectFromForm(seedCount = 1) {
  const formData = getFormData();
  const presentationMode = normalizePresentationMode(formData.modoPresentacion);
  const academicTheme = buildAcademicPreviewTheme(formData);
  const baseTitle = formData.temaPrincipal || formData.tema || "Escape Room";
  const questionCount = Math.max(1, Number(formData.preguntasPorSala || 1));
  const misiones = Array.from({ length: Math.max(1, seedCount) }, (_, index) => createMissionDraft(index, {}, questionCount, presentationMode));
  return withDefaultRoutes({
    modo_presentacion: presentationMode,
    nivel: formData.nivel,
    grado: formData.grado,
    trimestre: formData.trimestre,
    materia: formData.materia,
    unidad: formData.unidad,
    tema: formData.temaSecundaria,
    tema_curricular: formData.tema,
    estacion: formData.estacion,
    themeConfig: academicTheme,
    titulo: `Escape Room: ${baseTitle}`,
    subtitulo: `${presentationMode === PRESENTATION_MODE_MENU ? "Experiencia" : "Sala"} para ${formData.grado} de ${formData.nivel}`,
    introduccion: formData.objetivo || `Completa el escape room sobre ${baseTitle}.`,
    instrucciones: DEFAULT_INSTRUCTIONS_BY_PRESENTATION[presentationMode],
    ambientacion: formData.narrativa || "Aventura inmersiva",
    linea_visual_base: "Arena eSports con energía competitiva, neón y progresión visible.",
    misiones,
    conclusion: "El equipo logra abrir la bóveda final.",
    duracion_minutos: formData.duracion
  });
}

function materializeProjectForExport() {
  if (!state.project) return null;
  const formData = getFormData();
  const project = withDefaultRoutes({
    ...state.project,
    modo_presentacion: normalizePresentationMode(formData.modoPresentacion || state.project.modo_presentacion),
    nivel: formData.nivel,
    grado: formData.grado,
    trimestre: formData.trimestre,
    materia: formData.materia,
    unidad: formData.unidad,
    tema: formData.temaSecundaria,
    tema_curricular: formData.tema,
    estacion: formData.estacion,
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

function syncPreviewEditorialButton(action = "autofill") {
  if (!elements.btnPreviewAutofill) return;
  const shouldVerify = action === "verify";
  const actionLabel = shouldVerify ? "Verificar respuestas" : "Autocompletar respuestas";
  elements.btnPreviewAutofill.dataset.erTooltip = actionLabel;
  elements.btnPreviewAutofill.setAttribute("aria-label", actionLabel);
  const icon = elements.btnPreviewAutofill.querySelector("i");
  if (icon) icon.className = shouldVerify ? "fas fa-check" : "fas fa-wand-magic-sparkles";
}

function renderPreview() {
  const project = materializeProjectForExport();
  if (!project || !elements.previewFrame) {
    elements.previewFrame?.removeAttribute("srcdoc");
    return;
  }
  syncPreviewEditorialButton("autofill");
  elements.previewFrame.srcdoc = buildPreviewDocument(project, { editorialReview: true });
}

function repairEscapeRoomRuntime() {
  if (!state.project) {
    setStatus("Genera un escape room antes de repararlo.", "warning");
    return;
  }

  const materialized = materializeProjectForExport() || state.project;
  const repairedProject = withDefaultRoutes({
    ...materialized,
    misiones: materialized.misiones.map((mission, missionIndex) => repairMissionAnswers(mission, missionIndex))
  });
  const validation = validateProjectSetup(repairedProject);
  state.project = validation.project;
  renderMissionEditor();
  renderOutputsNow();
  setActiveTab("preview");
  if (validation.issues.length) {
    setStatus(
      `Preview, JSON y export recompuestos. Revisa estos contenidos pendientes: ${validation.issues.join(" · ")}`,
      "warning"
    );
    return;
  }
  setStatus(
    "Escape room reparado: preguntas, respuestas, rutas, preview, JSON y export fueron recompuestos.",
    "success"
  );
}

function triggerPreviewEditorialAutofill() {
  const frame = elements.previewFrame;
  if (!frame || !state.project) {
    setStatus("Genera un escape room antes de usar la resolución automática del preview.", "warning");
    return;
  }

  try {
    const frameDoc = frame.contentDocument || frame.contentWindow?.document;
    const button = frameDoc?.querySelector?.("[data-editorial-autofill]");
    if (!button) {
      setStatus("El preview todavía no está listo para autocompletarse.", "warning");
      return;
    }
    button.click();
    const nextAction = button.dataset.editorialAction === "verify" ? "verify" : "autofill";
    const shouldVerify = nextAction === "verify";
    syncPreviewEditorialButton(nextAction);
    setStatus(
      shouldVerify
        ? "Respuestas autocompletadas. Pulsa Verificar para validarlas."
        : "Se ejecutó la verificación de las respuestas del preview.",
      "success"
    );
  } catch (error) {
    console.error("No se pudo activar la resolución automática del preview:", error);
    setStatus("No fue posible resolver automáticamente el preview.", "bad");
  }
}

function updateSummaryStats() {
  const project = materializeProjectForExport();
  const missionCount = project?.misiones.length || 0;
  const unlockedCount = project?.misiones.filter((mission) => !mission.bloqueada_inicial).length || 0;
  const terms = getPresentationTerminology(project?.modo_presentacion || elements.modoPresentacionSelect?.value);
  const types = missionCount
    ? [...new Set(project.misiones.map((mission) => mission.tipo_interaccion))].join(" · ")
    : "-";
  elements.missionCount.textContent = String(missionCount);
  elements.unlockedCount.textContent = String(unlockedCount);
  elements.typeSummary.textContent = terms.formatLabel;
  elements.typeSummary.title = types === "-" ? "" : `Interacciones: ${types}`;
  syncPresentationModeUi({ preferProject: Boolean(project) });
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
  renderGeneralContentEditor();
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
      <button type="button" class="er-icon-button er-studio-icon-button" data-question-action="remove-option" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-question-option-index="${optionIndex}" data-er-tooltip="Eliminar opción" aria-label="Eliminar opción">
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
      <button type="button" class="er-icon-button er-studio-icon-button" data-question-action="remove-pair" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-question-pair-index="${pairIndex}" data-er-tooltip="Eliminar pareja" aria-label="Eliminar pareja">
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
            <button type="button" class="er-icon-button er-studio-icon-button" data-question-action="replace-question-image" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-er-tooltip="Sustituir imagen" aria-label="Sustituir imagen de pregunta">
            <i class="fas fa-image"></i>
          </button>
          <button type="button" class="er-icon-button er-studio-icon-button" data-question-action="regenerate-question" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-er-tooltip="Regenerar pregunta" aria-label="Regenerar pregunta completa">
            <i class="fas fa-rotate-right"></i>
          </button>
          <button type="button" class="er-icon-button er-studio-icon-button" data-question-action="delete-question" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-er-tooltip="Eliminar pregunta" aria-label="Eliminar pregunta">
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
              ${TEXT_SUBTYPES.map((subtype) => `<option value="${subtype}" ${question.subtipo_respuesta === subtype ? "selected" : ""}>${TEXT_SUBTYPE_LABELS[subtype] || subtype}</option>`).join("")}
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
            ${(question.tipo_interaccion === "texto" || question.tipo_interaccion === "multimedia") && question.subtipo_respuesta === "frase_libre" ? `
              <div class="er-type-group">
                <strong>Validación de frase libre</strong>
                <p class="er-inline-note">Se aceptará cualquier respuesta no vacía. El campo del jugador tendrá revisión ortográfica del navegador.</p>
              </div>
            ` : ""}

            ${(question.tipo_interaccion === "texto" || question.tipo_interaccion === "multimedia") && question.subtipo_respuesta !== "frase_libre" ? `
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
                <button type="button" class="er-button er-studio-icon-button" data-question-action="add-option" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-er-tooltip="Añadir opción" aria-label="Añadir opción">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
            ` : ""}

            ${question.tipo_interaccion === "relacion_columnas" ? `
              <div class="er-type-group">
                <strong>Parejas</strong>
                <div class="er-inline-list">${pairRows}</div>
                <button type="button" class="er-button er-studio-icon-button" data-question-action="add-pair" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-er-tooltip="Añadir pareja" aria-label="Añadir pareja">
                  <i class="fas fa-plus"></i>
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
              <div class="er-inline-note"><strong>Respuesta:</strong> ${question.subtipo_respuesta === "frase_libre" ? "Cualquier texto no vacío" : escapeHtml(question.respuesta_correcta || "Sin definir")}</div>
            </div>
          </div>
        </section>
      </div>
    </details>
  `;
}

function getSelectedMissionIndex() {
  if (!state.project || !state.selectedMissionId) return -1;
  return state.project.misiones.findIndex((mission) => mission.id === state.selectedMissionId);
}

function syncMissionWorkspaceHeading(terms = getPresentationTerminology()) {
  const mission = state.project?.misiones?.find((item) => item.id === state.selectedMissionId) || null;
  const questionIndex = mission?.preguntas?.findIndex((question) => question.id === state.selectedQuestionId) ?? -1;
  const question = questionIndex >= 0 ? mission.preguntas[questionIndex] : null;
  if (elements.studioKicker) {
    elements.studioKicker.textContent = question
      ? `${terms.itemSingularTitle} · Pregunta ${String(questionIndex + 1).padStart(2, "0")}`
      : `${terms.itemSingularTitle} seleccionada`;
  }
  if (elements.studioTitle) {
    elements.studioTitle.textContent = question
      ? getQuestionQuestionText(question, questionIndex)
      : (mission?.titulo || (terms.mode === PRESENTATION_MODE_MENU ? "Editor de actividad y preguntas" : "Editor de sala, rutas y preguntas"));
  }
  if (elements.studioHelp) {
    elements.studioHelp.textContent = question
      ? `Editando solo esta pregunta de ${mission?.titulo || terms.itemSingular}.`
      : `Vista completa de la ${terms.itemSingular}: contenido, rutas y todas sus preguntas.`;
  }
}

function renderMissionNavigator() {
  if (!elements.missionNavigatorList) return;
  const missions = Array.isArray(state.project?.misiones) ? state.project.misiones : [];
  if (state.selectedMissionId && !missions.some((mission) => mission.id === state.selectedMissionId)) {
    state.selectedMissionId = null;
    state.selectedQuestionId = null;
  }
  const selectedMission = missions.find((mission) => mission.id === state.selectedMissionId) || null;
  if (state.selectedQuestionId && !selectedMission?.preguntas?.some((question) => question.id === state.selectedQuestionId)) {
    state.selectedQuestionId = null;
  }
  const terms = getPresentationTerminology();
  const formData = getFormData();
  elements.missionNavigatorList.innerHTML = missions.map((mission, index) => {
    const selected = mission.id === state.selectedMissionId && !state.selectedQuestionId;
    const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
    const expanded = state.expandedMissionIds.has(mission.id);
    const palette = resolveRoomColorPalette({ index, formData });
    const paletteStyle = `--room-level-color:${palette.levelColor};--room-theme-color:${palette.themeColor};`;
    return `
      <article class="er-mission-nav-item ${selected ? "is-active" : ""}" data-mission-nav-item data-mission-id="${escapeHtmlAttr(mission.id)}" style="${escapeHtmlAttr(paletteStyle)}">
        <span class="er-mission-nav-drag" title="Arrastrar para reordenar" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
        <button type="button" class="er-mission-nav-select" data-mission-select="${escapeHtmlAttr(mission.id)}" aria-pressed="${selected ? "true" : "false"}" title="${escapeHtmlAttr(mission.titulo)}">
          <span class="er-mission-nav-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="er-mission-nav-copy"><strong>${escapeHtml(mission.titulo)}</strong><small>${questions.length} ${questions.length === 1 ? "pregunta" : "preguntas"}</small></span>
        </button>
        <button type="button" class="er-mission-nav-expand er-studio-icon-button" data-mission-expand="${escapeHtmlAttr(mission.id)}" data-er-tooltip="${expanded ? "Ocultar" : "Mostrar"} preguntas" aria-expanded="${expanded ? "true" : "false"}" aria-label="${expanded ? "Ocultar" : "Mostrar"} preguntas de ${escapeHtmlAttr(mission.titulo)}">
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="er-mission-nav-questions ${expanded ? "" : "hidden"}">
          ${questions.map((question, questionIndex) => {
            const questionSelected = mission.id === state.selectedMissionId && question.id === state.selectedQuestionId;
            return `
              <button type="button" class="er-mission-nav-question ${questionSelected ? "is-active" : ""}" data-question-select="${escapeHtmlAttr(question.id)}" data-mission-id="${escapeHtmlAttr(mission.id)}" aria-pressed="${questionSelected ? "true" : "false"}" title="${escapeHtmlAttr(getQuestionQuestionText(question, questionIndex))}">
                <span>${String(questionIndex + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(getQuestionQuestionText(question, questionIndex))}</strong>
              </button>
            `;
          }).join("") || '<div class="er-mission-nav-no-questions">Sin preguntas</div>'}
          <span class="er-mission-nav-move" aria-label="Mover ${terms.itemSingular}">
            <button type="button" class="er-studio-icon-button" data-mission-move="-1" data-mission-id="${escapeHtmlAttr(mission.id)}" data-er-tooltip="Mover arriba" aria-label="Mover arriba" ${index === 0 ? "disabled" : ""}><i class="fas fa-chevron-up"></i></button>
            <button type="button" class="er-studio-icon-button" data-mission-move="1" data-mission-id="${escapeHtmlAttr(mission.id)}" data-er-tooltip="Mover abajo" aria-label="Mover abajo" ${index === missions.length - 1 ? "disabled" : ""}><i class="fas fa-chevron-down"></i></button>
          </span>
        </div>
      </article>
    `;
  }).join("");
  ensureSortable();
}

function selectMissionById(missionId, { focusEditor = true } = {}) {
  if (!state.project?.misiones.some((mission) => mission.id === missionId)) return;
  const shouldHide = state.selectedMissionId === missionId && !state.selectedQuestionId;
  state.selectedMissionId = shouldHide ? null : missionId;
  state.selectedQuestionId = null;
  if (!shouldHide) state.expandedMissionIds.add(missionId);
  setInspectorTab("rooms");
  renderMissionEditor();
  if (!isStudioDesktop() && state.activeDrawer === "inspector") {
    closeStudioPanel("inspector", { restoreFocus: false });
  }
  if (!shouldHide && focusEditor) window.requestAnimationFrame(() => elements.studioTitle?.focus?.());
}

function selectQuestionById(missionId, questionId, { focusEditor = true } = {}) {
  const mission = state.project?.misiones.find((item) => item.id === missionId);
  if (!mission?.preguntas?.some((question) => question.id === questionId)) return;
  state.selectedMissionId = missionId;
  state.selectedQuestionId = questionId;
  state.expandedMissionIds.add(missionId);
  setInspectorTab("rooms");
  renderMissionEditor();
  if (!isStudioDesktop() && state.activeDrawer === "inspector") {
    closeStudioPanel("inspector", { restoreFocus: false });
  }
  if (focusEditor) window.requestAnimationFrame(() => elements.studioTitle?.focus?.());
}

function toggleMissionQuestions(missionId) {
  if (state.expandedMissionIds.has(missionId)) state.expandedMissionIds.delete(missionId);
  else state.expandedMissionIds.add(missionId);
  renderMissionNavigator();
  window.requestAnimationFrame(() => elements.missionNavigatorList?.querySelector(`[data-mission-expand="${CSS.escape(missionId)}"]`)?.focus());
}

function moveMission(missionId, direction) {
  if (!state.project) return;
  const oldIndex = state.project.misiones.findIndex((mission) => mission.id === missionId);
  const newIndex = oldIndex + Number(direction || 0);
  if (oldIndex < 0 || newIndex < 0 || newIndex >= state.project.misiones.length) return;
  const mode = getPresentationMode(state.project);
  const [moved] = state.project.misiones.splice(oldIndex, 1);
  state.project.misiones.splice(newIndex, 0, moved);
  state.project.misiones = state.project.misiones.map((mission, index) => ({
    ...mission,
    release: getDefaultMissionRelease(index, mode)
  }));
  state.project = withDefaultRoutes(state.project);
  renderMissionEditor();
  scheduleOutputRefresh();
  window.requestAnimationFrame(() => elements.missionNavigatorList?.querySelector(`[data-mission-select="${CSS.escape(missionId)}"]`)?.focus());
}

function wireMissionNavigatorEvents() {
  elements.missionNavigatorList?.addEventListener("click", (event) => {
    const questionButton = event.target.closest("[data-question-select]");
    if (questionButton) {
      selectQuestionById(questionButton.dataset.missionId, questionButton.dataset.questionSelect);
      return;
    }
    const selectButton = event.target.closest("[data-mission-select]");
    if (selectButton) {
      selectMissionById(selectButton.dataset.missionSelect);
      return;
    }
    const expandButton = event.target.closest("[data-mission-expand]");
    if (expandButton) {
      toggleMissionQuestions(expandButton.dataset.missionExpand);
      return;
    }
    const moveButton = event.target.closest("[data-mission-move]");
    if (moveButton) moveMission(moveButton.dataset.missionId, Number(moveButton.dataset.missionMove));
  });
}

function renderMissionEditor() {
  if (!elements.missionEditorList) return;
  renderMissionNavigator();
  if (!state.project || state.project.misiones.length === 0) {
    elements.missionEditorList.innerHTML = "";
    refreshPanels();
    return;
  }

  const terms = getPresentationTerminology(state.project.modo_presentacion);

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

  const selectedIndex = getSelectedMissionIndex();
  if (selectedIndex < 0) {
    elements.missionEditorList.innerHTML = "";
    refreshPanels();
    return;
  }
  const selectedMission = state.project.misiones[selectedIndex];
  const selectedQuestionIndex = selectedMission?.preguntas?.findIndex((question) => question.id === state.selectedQuestionId) ?? -1;
  syncMissionWorkspaceHeading(terms);
  if (selectedQuestionIndex >= 0) {
    elements.missionEditorList.innerHTML = `
      <div class="er-question-focus" data-question-focus>
        ${renderQuestionCard(selectedIndex, selectedQuestionIndex, selectedMission.preguntas[selectedQuestionIndex])}
      </div>
    `;
    refreshPanels();
    return;
  }
  const selectedEntries = state.project.misiones
    .map((mission, index) => ({ mission, index }))
    .filter(({ mission }) => mission.id === state.selectedMissionId);

  elements.missionEditorList.innerHTML = selectedEntries.map(({ mission, index }) => {
    const formData = getFormData();
    const roomPalette = resolveRoomColorPalette({ index, formData });
    const roomStyle = `--room-level-color: ${roomPalette.levelColor}; --room-theme-color: ${roomPalette.themeColor};`;
    const nextMission = state.project.misiones[index + 1] || null;
    const unlockSummary = nextMission
      ? `<div class="er-muted">Esta ${terms.itemSingular} desbloquea automáticamente: <strong>${escapeHtml(nextMission.titulo)}</strong> <small>(${escapeHtml(nextMission.id)})</small></div>`
      : `<div class="er-muted">Esta es la última ${terms.itemSingular} y no desbloquea otra más.</div>`;

    const optionRows = mission.opciones.map((option, optionIndex) => `
      <div class="er-option-row">
        <input type="radio" name="correct-option-${index}" data-action="set-correct-option" data-index="${index}" data-option-index="${optionIndex}" ${mission._correctOptionIndex === optionIndex ? "checked" : ""}>
        <input class="er-option-input" type="text" data-field="option-value" data-index="${index}" data-option-index="${optionIndex}" value="${escapeHtmlAttr(option)}">
        <button type="button" class="er-icon-button er-studio-icon-button" data-action="remove-option" data-index="${index}" data-option-index="${optionIndex}" data-er-tooltip="Eliminar opción" aria-label="Eliminar opción">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join("");

    const pairRows = mission.parejas.map((pair, pairIndex) => `
      <div class="er-match-row">
        <input class="er-match-input" type="text" data-field="pair-left" data-index="${index}" data-pair-index="${pairIndex}" value="${escapeHtmlAttr(pair.izquierda)}" placeholder="Columna A">
        <input class="er-match-input" type="text" data-field="pair-right" data-index="${index}" data-pair-index="${pairIndex}" value="${escapeHtmlAttr(pair.derecha)}" placeholder="Columna B">
        <button type="button" class="er-icon-button er-studio-icon-button" data-action="remove-pair" data-index="${index}" data-pair-index="${pairIndex}" data-er-tooltip="Eliminar pareja" aria-label="Eliminar pareja">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join("");

    const answersAsText = Array.isArray(mission.respuestas_aceptadas)
      ? mission.respuestas_aceptadas.join("\n")
      : "";

    return `
      <details class="er-mission-card ${mission.bloqueada_inicial ? "is-locked" : ""}" data-mission-card data-index="${index}" style="${roomStyle}" open>
        <summary class="er-mission-head">
          <div class="er-drag-handle" title="Arrastrar para reordenar">
            <i class="fas fa-grip-vertical"></i>
          </div>
          <div class="er-mission-meta">
            <div class="er-mission-index">${terms.itemSingularTitle} ${String(index + 1).padStart(2, "0")}</div>
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
            <button type="button" class="er-icon-button er-studio-icon-button" data-action="replace-mission-image" data-index="${index}" data-er-tooltip="Sustituir imagen" aria-label="Sustituir imagen de ${terms.itemSingular}">
            <i class="fas fa-image"></i>
          </button>
            <button type="button" class="er-icon-button er-studio-icon-button" data-action="regenerate-mission" data-index="${index}" data-er-tooltip="Regenerar ${terms.itemSingular}" aria-label="Regenerar ${terms.itemSingular} completa">
            <i class="fas fa-rotate-right"></i>
          </button>
            <button type="button" class="er-icon-button er-studio-icon-button" data-action="delete-mission" data-index="${index}" data-er-tooltip="Eliminar ${terms.itemSingular}" aria-label="Eliminar ${terms.itemSingular}">
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
              <span>${terms.itemSingularTitle}</span>
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
            <p class="er-inline-note">El escape room usa desbloqueo secuencial: cada ${terms.itemSingular} abre solo la siguiente.</p>
            <div class="er-unlock-grid">
              ${unlockSummary}
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
                <div class="er-inline-note"><strong>Desbloquea:</strong> ${mission.desbloquea.length ? mission.desbloquea.map(escapeHtml).join(", ") : `Ninguna ${terms.itemSingular} extra`}</div>
              </div>
            </div>
          </section>

          <section class="er-question-panel">
            <div class="er-label">Preguntas internas</div>
            <div class="er-question-panel-head">
              <p class="er-inline-note">Aquí se ven y editan todas las preguntas configuradas para esta ${terms.itemSingular}. Cada tarjeta puede desplegarse o contraerse.</p>
              <button type="button" class="er-button er-studio-icon-button" data-action="add-question" data-index="${index}" data-er-tooltip="Añadir pregunta" aria-label="Añadir pregunta">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            <div class="er-question-list">
              ${(Array.isArray(mission.preguntas) && mission.preguntas.length)
                ? mission.preguntas.map((question, questionIndex) => renderQuestionCard(index, questionIndex, question)).join("")
                : `<div class="er-empty-inline">Esta ${terms.itemSingular} no tiene preguntas configuradas todavía.</div>`}
            </div>
          </section>
        </div>
      </details>
    `;
  }).join("");

  refreshPanels();
}

function ensureSortable() {
  if (!elements.missionNavigatorList || !window.Sortable) return;
  if (state.sortable) state.sortable.destroy();
  state.sortable = window.Sortable.create(elements.missionNavigatorList, {
    draggable: "[data-mission-nav-item]",
    handle: ".er-mission-nav-drag",
    animation: 150,
    onEnd(event) {
      if (!state.project) return;
      const mode = getPresentationMode(state.project);
      const [moved] = state.project.misiones.splice(event.oldIndex, 1);
      state.project.misiones.splice(event.newIndex, 0, moved);
      state.project.misiones = state.project.misiones.map((mission, index) => ({
        ...mission,
        release: getDefaultMissionRelease(index, mode)
      }));
      state.project = withDefaultRoutes(state.project);
      renderMissionEditor();
      scheduleOutputRefresh();
    }
  });
}

function addMission() {
  const formData = getFormData();
  const terms = getPresentationTerminology(formData.modoPresentacion);
  const questionCount = Math.max(1, Number(formData.preguntasPorSala || 1));
  if (!state.project) {
    state.project = createProjectFromForm(1);
    applyPreviewTheme(state.project.themeConfig, { persist: true, syncProject: true, refresh: false });
  } else {
    state.project.misiones.push(createMissionDraft(state.project.misiones.length, {}, questionCount, terms.mode));
  }
  state.project = withDefaultRoutes(state.project);
  state.selectedMissionId = state.project.misiones.at(-1)?.id || null;
  state.selectedQuestionId = null;
  if (state.selectedMissionId) state.expandedMissionIds.add(state.selectedMissionId);
  setInspectorTab("rooms");
  renderMissionEditor();
  renderOutputsNow();
  if (!isStudioDesktop() && state.activeDrawer === "inspector") closeStudioPanel("inspector", { restoreFocus: false });
  setStatus(`${terms.itemSingularTitle} añadida al editor.`, "info");
}

function deleteMission(index) {
  if (!state.project) return;
  const deletingSelected = state.project.misiones[index]?.id === state.selectedMissionId;
  const deletedMissionId = state.project.misiones[index]?.id || null;
  const fallbackMission = state.project.misiones[index + 1] || state.project.misiones[index - 1] || null;
  state.project.misiones.splice(index, 1);
  state.project = withDefaultRoutes(state.project);
  if (deletedMissionId) state.expandedMissionIds.delete(deletedMissionId);
  if (deletingSelected) {
    state.selectedMissionId = fallbackMission?.id || null;
    state.selectedQuestionId = null;
  }
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
    const rawAcceptedAnswers = normalizeTextList(String(value || "").split(/\r?\n+/));
    const acceptedAnswers = ["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "palabra"
      ? rawAcceptedAnswers.map((answer) => extractSingleWordAnswer(answer)).filter(Boolean)
      : rawAcceptedAnswers;
    question.respuestas_aceptadas = acceptedAnswers;
    question.respuesta_correcta = acceptedAnswers[0] || "";
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "respuesta_correcta") {
    const previousCorrect = normalizeString(question.respuesta_correcta, "").trim();
    const rawNextCorrect = normalizeString(value, "").trim();
    const nextCorrect = ["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "palabra"
      ? extractSingleWordAnswer(rawNextCorrect)
      : rawNextCorrect;
    question.respuesta_correcta = nextCorrect;
    question.respuestas_aceptadas = replacePrimaryAcceptedAnswer(
      question.respuestas_aceptadas,
      previousCorrect,
      nextCorrect
    );
    question.subtipo_respuesta = resolveTextSubtypeForAnswer(question.subtipo_respuesta, nextCorrect);
    if (["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "frase_corta") question.subtipo_respuesta = "palabra";
    if (["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "palabra") {
      question.reto = buildSingleWordChallenge(question.reto, question.titulo, nextCorrect);
    }
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
    if (value === "texto" || value === "multimedia") {
      question.subtipo_respuesta = resolveTextSubtypeForAnswer(question.subtipo_respuesta, question.respuesta_correcta);
      if (question.subtipo_respuesta === "frase_corta") question.subtipo_respuesta = "palabra";
      if (question.subtipo_respuesta === "palabra") {
        question.respuesta_correcta = extractSingleWordAnswer(question.respuesta_correcta);
        question.respuestas_aceptadas = [question.respuesta_correcta, ...(question.respuestas_aceptadas || [])]
          .map((answer) => extractSingleWordAnswer(answer, question.respuesta_correcta))
          .filter(Boolean);
        question.reto = buildSingleWordChallenge(question.reto, question.titulo, question.respuesta_correcta);
      }
    }
    renderMissionEditor();
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "subtipo_respuesta") {
    question.subtipo_respuesta = resolveTextSubtypeForAnswer(value, question.respuesta_correcta);
    if (question.subtipo_respuesta === "frase_libre") {
      question.respuesta_correcta = "";
      question.respuestas_aceptadas = [];
    }
    if (["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "frase_corta") question.subtipo_respuesta = "palabra";
    if (["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "palabra") {
      question.respuesta_correcta = extractSingleWordAnswer(question.respuesta_correcta);
      question.respuestas_aceptadas = [question.respuesta_correcta, ...(question.respuestas_aceptadas || [])]
        .map((answer) => extractSingleWordAnswer(answer, question.respuesta_correcta))
        .filter(Boolean);
      question.reto = buildSingleWordChallenge(question.reto, question.titulo, question.respuesta_correcta);
    }
    renderMissionEditor();
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
  const deletingSelected = mission.id === state.selectedMissionId && mission.preguntas[questionIndex]?.id === state.selectedQuestionId;
  const fallbackQuestion = mission.preguntas[questionIndex + 1] || mission.preguntas[questionIndex - 1] || null;
  mission.preguntas.splice(questionIndex, 1);
  mission.preguntas = mission.preguntas.map((question, index) => createQuestionDraft(missionIndex, index, question));
  if (deletingSelected) state.selectedQuestionId = fallbackQuestion?.id || null;
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
      if (questionAction === "replace-question-image") {
        const fileInput = getActivityImageFileInput();
        if (!fileInput) return;
        state.pendingImageReplacementTarget = { missionIndex, questionIndex };
        fileInput.value = "";
        fileInput.click();
      }
      if (questionAction === "regenerate-question") {
        void regenerateQuestionContent(missionIndex, questionIndex);
      }
      return;
    }

    const index = Number(button.dataset.index);
    const action = button.dataset.action;

    if (action === "delete-mission") deleteMission(index);
    if (action === "add-option") addOption(index);
    if (action === "remove-option") removeOption(index, Number(button.dataset.optionIndex));
    if (action === "add-pair") addPair(index);
    if (action === "remove-pair") removePair(index, Number(button.dataset.pairIndex));
    if (action === "replace-mission-image") {
      const fileInput = getActivityImageFileInput();
      if (!fileInput) return;
      state.pendingImageReplacementTarget = { missionIndex: index, questionIndex: null };
      fileInput.value = "";
      fileInput.click();
    }
    if (action === "regenerate-mission") {
      void regenerateMissionContent(index);
    }
  });

  elements.activityImageInput?.addEventListener("change", (event) => {
    const input = event.target;
    const file = input.files?.[0] || null;
    const target = state.pendingImageReplacementTarget;
    state.pendingImageReplacementTarget = null;
    input.value = "";
    if (!file || !target) {
      return;
    }
    void replaceActivityImage({
      missionIndex: target.missionIndex,
      questionIndex: target.questionIndex,
      file
    });
  });
}

function wireSessionEvents() {
  elements.btnNewSession?.addEventListener("click", () => {
    setImportZipStatus("");
    if (elements.importZipInput) elements.importZipInput.value = "";
    const modal = getNewSessionModal();
    if (modal) {
      modal.show();
      return;
    }
    void createBlankSession();
  });

  async function createBlankSession() {
    try {
      setRemoteSaveState("saving");

      await createRemoteSession({
        title: SESSION_TITLE_DEFAULT,
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
  }

  elements.btnCreateBlankSession?.addEventListener("click", async () => {
    const button = elements.btnCreateBlankSession;
    if (button) button.disabled = true;
    try {
      await createBlankSession();
      getNewSessionModal()?.hide();
    } finally {
      if (button) button.disabled = false;
    }
  });

  elements.btnImportZipSession?.addEventListener("click", () => {
    setImportZipStatus("Selecciona un ZIP exportado por PigPen.");
    elements.importZipInput?.click();
  });

  elements.importZipInput?.addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0] || null;
    input.value = "";
    if (!file) return;
    const importButton = elements.btnImportZipSession;
    const blankButton = elements.btnCreateBlankSession;
    if (importButton) importButton.disabled = true;
    if (blankButton) blankButton.disabled = true;
    try {
      const { missing } = await importZipAsNewSession(file);
      setImportZipStatus(missing ? "Importación terminada con algunos recursos ausentes." : "Importación terminada.", missing ? "warning" : "success");
      getNewSessionModal()?.hide();
    } catch (error) {
      console.error("No se pudo importar el ZIP de PigPen:", error);
      setImportZipStatus(error?.message || "No fue posible importar este ZIP.", "error");
      setRemoteSaveState("error", "Error al importar");
    } finally {
      if (importButton) importButton.disabled = false;
      if (blankButton) blankButton.disabled = false;
    }
  });

  elements.sessionList?.addEventListener("click", async (event) => {
    const menuToggle = event.target.closest("[data-session-menu-toggle]");
    if (menuToggle) {
      const sessionId = String(menuToggle.dataset.sessionId || "").trim();
      if (sessionId) toggleSessionMenu(sessionId, menuToggle);
      return;
    }
    const button = event.target.closest("[data-session-action]");
    if (!button) return;
    const sessionId = String(button.dataset.sessionId || "").trim();
    if (!sessionId) return;
    const action = button.dataset.sessionAction;
    if (action === "open") {
      closeSessionMenu();
      const session = state.sessions.find((item) => item.id === sessionId);
      if (session) await loadSessionIntoEditor(session);
      return;
    }
    if (action === "rename") {
      closeSessionMenu();
      await renameSession(sessionId);
      return;
    }
    if (action === "delete") {
      closeSessionMenu();
      await deleteSessionById(sessionId);
    }
  });

  document.addEventListener("click", (event) => {
    if (state.sessionMenuId && !event.target.closest(".er-session-menu-wrap")) closeSessionMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.sessionMenuId) {
      event.preventDefault();
      closeSessionMenu({ restoreFocus: true });
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

  elements.previewRoomPaletteReference?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-preview-palette-copy]");
    if (!button) return;
    const color = String(button.dataset.previewPaletteCopy || "").trim();
    if (!color) return;
    const copied = await copyTextToClipboard(color);
    setStatus(
      copied ? `Color ${color} copiado al portapapeles.` : `No se pudo copiar ${color} automáticamente.`,
      copied ? "success" : "warning"
    );
  });

  renderPreviewRoomPaletteReference();
}

function isRemoteUrl(value) {
  if (typeof value !== "string") return false;
  return /^(https?:)?\/\//i.test(value);
}

function resolveRemoteAssetDownloadUrl(rawUrl = "") {
  const clean = String(rawUrl || "").trim();
  if (!clean) return "";
  if (!hasAvailableApiBase()) return clean;
  try {
    const parsed = new URL(clean, window.location.origin);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return parsed.toString();
    }
    if (/\/api\/assets\/proxy-media\?/i.test(parsed.toString())) {
      return buildApiUrl(parsed.pathname + parsed.search);
    }
    return buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
  } catch (_) {
    return clean;
  }
}

/**
 * Fetch a remote resource and return its ArrayBuffer.
 * Returns null if the request fails or the response is not ok.
 */
async function fetchBinaryAsset(url) {
  try {
    const rawUrl = String(url || "").trim();
    // Los assets locales del Creator (por ejemplo logo.png) deben descargarse
    // directamente. Enviarlos al proxy remoto los convierte erróneamente en un
    // recurso externo cuando hay una API configurada.
    const finalUrl = isRemoteUrl(rawUrl)
      ? resolveRemoteAssetDownloadUrl(rawUrl)
      : new URL(rawUrl, window.location.href).toString();
    const response = await fetch(finalUrl, { mode: "cors" });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return buffer;
  } catch (e) {
    console.warn(`No se pudo descargar el recurso remoto para empaquetarlo: ${url}`, e);
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
  let downloaded = 0;
  let failed = 0;

  // 1. Background Image
  if (project.backgroundImage && isRemoteUrl(project.backgroundImage)) {
    const buffer = await fetchBinaryAsset(project.backgroundImage);
    if (buffer) {
      const ext = inferExtensionFromContentType("image/png", "png"); // fallback content-type; actual type not needed for extension inference here
      const fileName = `${mediaFolder}/${sanitizeFileNameForAssets(project.titulo, "escape-room")}-background.${ext}`;
      remoteFiles[fileName] = new Uint8Array(buffer);
      project.backgroundImage = fileName;
      downloaded += 1;
    } else {
      failed += 1;
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
          downloaded += 1;
        } else {
          failed += 1;
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
          downloaded += 1;
        } else {
          failed += 1;
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
              downloaded += 1;
            } else {
              failed += 1;
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
              downloaded += 1;
            } else {
              failed += 1;
            }
          }
        }
      }
    }
  }

  return { downloaded, failed };
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

  const remoteAssetStats = await downloadRemoteAssets(projectClone, remoteFiles, mediaFolder);

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
  if (remoteAssetStats.failed > 0) {
    setStatus(
      `Paquete ZIP generado con recursos remotos omitidos por CORS: ${remoteAssetStats.failed}. El juego seguirá usando esas URLs remotas.`,
      "warning"
    );
    return;
  }
  setStatus("Paquete ZIP generado con index.html y assets.", "success");
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("", "info");

  const formData = getFormData();
  const terms = getPresentationTerminology(formData.modoPresentacion);
  if (!formData.tema) {
    setStatus("Escribe un tema curricular antes de generar el escape room.", "warning");
    document.getElementById("temaInput")?.focus();
    return;
  }

  if (formData.misiones < 2 || formData.misiones > 8) {
    setStatus(`El número de ${terms.itemPlural} debe estar entre 2 y 8.`, "warning");
    document.getElementById("numMisionesInput")?.focus();
    return;
  }

  if (formData.preguntasPorSala < 1 || formData.preguntasPorSala > 6) {
    setStatus(`Las preguntas por ${terms.itemSingular} deben estar entre 1 y 6.`, "warning");
    document.getElementById("preguntasPorSalaInput")?.focus();
    return;
  }

  elements.btnGenerar.classList.add("is-generating");
  elements.btnGenerar.setAttribute("aria-busy", "true");
  elements.btnGenerar.dataset.erTooltip = "Generando escape room";
  setLoading(true);
  state.isGenerating = true;
  state.generationNote = "";
  renderGeneralContentEditor();
  refreshPanels();

  try {
    const generated = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
      method: "POST",
      body: {
        model: formData.modelo || TEXT_MODEL_DEFAULT,
        payload: {
          systemInstruction: {
            parts: [{
              text: [
                "Responde únicamente con JSON válido.",
                resolvePromptLanguageDirective(formData.idioma || "es-419").directive,
                "Mantén coherencia visual por escape room.",
                `Respeta exactamente la cantidad de ${terms.itemPlural} y preguntas solicitadas.`,
                `Cada ${terms.itemSingular} debe tener progresión clara y rutas de desbloqueo simples.`,
                formData.modoPresentacion === PRESENTATION_MODE_MENU
                  ? "El formato debe ser menu_secciones, con introducción, instrucciones, actividades y mensaje final."
                  : "El formato debe ser salas y conservar el recorrido tradicional por salas."
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

    const rawText = (generated?.candidates?.[0]?.content?.parts || [])
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .join("")
      || normalizeString(generated?.text || generated?.output_text, "");
    const parsed = prepareGeneratedProjectForPresentation(
      extractGeneratedJson(rawText),
      formData.modoPresentacion
    );

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

    const initialValidation = validateProjectSetup(parsed);
    const alignment = repairGeneratedProject(initialValidation.project, formData);
    const alignedValidation = validateProjectSetup(alignment.project);
    if (alignedValidation.issues.length) {
      console.error("[PigPenCreator] La respuesta siguió inválida después de repararla:", {
        issues: alignedValidation.issues,
        project: alignedValidation.project
      });
      state.isGenerating = false;
      renderGeneralContentEditor();
      renderMissionEditor();
      refreshPanels();
      setStatus(
        `La IA no generó todas las ${terms.itemPlural} y preguntas con respuestas válidas: ${alignedValidation.issues.join(" · ")}`,
        "bad"
      );
      return;
    }
    const academicTheme = buildAcademicPreviewTheme(formData);
    const project = applyAcademicMissionPalettes({
      ...alignedValidation.project,
      modo_presentacion: terms.mode,
      nivel: formData.nivel,
      grado: formData.grado,
      trimestre: formData.trimestre,
      materia: formData.materia,
      unidad: formData.unidad,
      tema: formData.temaSecundaria,
      tema_curricular: formData.tema,
      estacion: formData.estacion,
      estiloImagen: formData.estiloImagen,
      themeConfig: academicTheme,
      duracion_minutos: formData.duracion
    }, formData);
    const alignmentNote = alignment.adjusted
      ? `Ajustado a ${formData.misiones} ${terms.itemPlural}${formData.preguntasPorSala ? ` y ${formData.preguntasPorSala} preguntas por ${terms.itemSingular}` : ""}`
      : "";

    // Establecer proyecto en el estado y renderizar texto/preview inmediatamente
    state.project = project;
    applyPreviewTheme(academicTheme, { persist: true, syncProject: true, refresh: false });
    state.selectedMissionId = null;
    state.selectedQuestionId = null;
    state.expandedMissionIds.clear();
    state.generationNote = `${alignmentNote ? `${alignmentNote} · ` : ""}Generando imágenes en segundo plano...`;

    renderMissionEditor();
    renderOutputsNow();
    setActiveTab("preview");
    setLoading(false);
    setStatus(
      `Generado: "${state.project.titulo}" · ${state.project.misiones.length} ${terms.itemPlural} · ${formData.duracion} min · ${state.generationNote}`,
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
            `Generado: "${project.titulo}" · ${project.misiones.length} ${terms.itemPlural} · ${formData.duracion} min · ${state.generationNote}`,
            "success"
          );
        });

        // Estado de finalización
        state.generationNote = `${alignmentNote ? `${alignmentNote} · ` : ""}${coverImage ? "1 portada · " : ""}${imageStats.generated}/${imageStats.total} imágenes funcionales listas${imageStats.failed ? ` · ${imageStats.failed} sin imagen` : ""}`;
        renderMissionEditor();
        renderOutputsNow();
        setStatus(
          `Generado: "${project.titulo}" · ${project.misiones.length} ${terms.itemPlural} · ${formData.duracion} min · ${state.generationNote}`,
          "success"
        );
      } catch (bgError) {
        console.error("Error en la generación de imágenes en segundo plano:", bgError);
      } finally {
        state.isGenerating = false;
        refreshPanels();
        if (state.sessionSaveQueued) scheduleSessionSave();
      }
    })();
  } catch (error) {
    console.error(error);
    setStatus(`No se pudo generar el escape room: ${error.message}`, "bad");
    state.isGenerating = false;
    renderMissionEditor();
    refreshPanels();
  } finally {
    elements.btnGenerar.classList.remove("is-generating");
    elements.btnGenerar.removeAttribute("aria-busy");
    elements.btnGenerar.dataset.erTooltip = "Generar escape room";
    setLoading(false);
  }
});

elements.btnAddMission.addEventListener("click", addMission);
elements.btnAddTopic?.addEventListener("click", openNewTopicDialog);
elements.newTopicForm?.addEventListener("submit", createNewTopicFromDialog);
elements.topicList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic-id]");
  if (button) void selectTopic(button.dataset.topicId);
});
elements.btnExportar.addEventListener("click", exportPackage);
elements.btnRepairEscapeRoom?.addEventListener("click", repairEscapeRoomRuntime);
elements.btnPreviewAutofill?.addEventListener("click", triggerPreviewEditorialAutofill);
elements.publishToggle?.addEventListener("change", handlePublishToggleChange);

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

function setButtonLoading(button, isLoading, loadingLabel, idleHtml) {
  if (!button) return;
  if (isLoading) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (button.classList.contains("er-studio-icon-button")) {
      button.dataset.erIdleTooltip ||= button.dataset.erTooltip || button.getAttribute("aria-label") || "Acción";
      button.dataset.erTooltip = loadingLabel;
      button.setAttribute("aria-label", loadingLabel);
      button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
    } else {
      button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${loadingLabel}</span>`;
    }
    return;
  }
  button.disabled = false;
  button.removeAttribute("aria-busy");
  button.innerHTML = idleHtml;
  if (button.classList.contains("er-studio-icon-button") && button.dataset.erIdleTooltip) {
    button.dataset.erTooltip = button.dataset.erIdleTooltip;
    button.setAttribute("aria-label", button.dataset.erIdleTooltip);
  }
}

function buildObjectiveSeedPrompt({ tema, narrativa, numMisiones, preguntasPorSala, duracion, modoPresentacion }) {
  const terms = getPresentationTerminology(modoPresentacion);
  return [
    `Tema curricular: "${tema}"`,
    `Narrativa: "${narrativa}"`,
    `Formato: ${terms.formatLabel}`,
    `Cantidad de ${terms.itemPlural}: ${numMisiones}`,
    `Preguntas por ${terms.itemSingular}: ${preguntasPorSala}`,
    `Duración total: ${duracion} minutos`,
    "",
    "Redacta un borrador inicial de ideas para el objetivo del escape room.",
    "Debe servir como punto de partida para que el usuario lo edite antes de generar el objetivo final.",
    "Entrega entre 3 y 6 líneas breves en texto plano.",
    "Incluye aprendizajes clave, habilidades y una meta final coherente con el tema curricular.",
    "No uses encabezados, markdown ni HTML."
  ].join("\n");
}

function buildObjectiveFinalPrompt({ tema, narrativa, numMisiones, preguntasPorSala, duracion, userIdeas, modoPresentacion }) {
  const terms = getPresentationTerminology(modoPresentacion);
  return [
    `Tema curricular: "${tema}"`,
    `Narrativa: "${narrativa}"`,
    `Formato: ${terms.formatLabel}`,
    `Cantidad de ${terms.itemPlural}: ${numMisiones}`,
    `Preguntas por ${terms.itemSingular}: ${preguntasPorSala}`,
    `Duración total: ${duracion} minutos`,
    "",
    "Ideas y prioridades propuestas por el usuario para el objetivo:",
    userIdeas,
    "",
    "Redacta un objetivo final integral para el escape room con base en el tema curricular y en las ideas del usuario.",
    "Debe describir con claridad qué debe lograr el grupo al terminar, qué conocimientos o habilidades desarrollará y cómo se relaciona con la experiencia.",
    "Escribe un texto claro, útil y listo para pegarse en el campo 'Objetivo final'.",
    "Entrega un bloque breve de 1 a 2 párrafos, sin encabezados, sin markdown y sin HTML."
  ].join("\n");
}

async function generateObjectiveText(prompt, temperature = 0.85, language = "es-419") {
  const model = elements.modeloSelect?.value || TEXT_MODEL_DEFAULT;
  const languageMode = resolvePromptLanguageDirective(language);
  const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
    method: "POST",
    body: {
      model,
      payload: {
        systemInstruction: {
          parts: [{
            text: `Eres un experto diseñador instruccional y de escape rooms educativos. ${languageMode.directive} Queda estrictamente prohibido usar modismos o estilo ajenos al idioma indicado. Devuelve solo texto plano, sin markdown, sin encabezados y sin HTML.`
          }]
        },
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature
        }
      }
    }
  });
  return String(response?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

function getObjectiveSuggestionContext() {
  const tema = String(document.getElementById("temaInput")?.value || "").trim();
  if (!tema) {
    setStatus("Por favor, ingresa primero un tema curricular para poder sugerir un objetivo.", "warning");
    document.getElementById("temaInput")?.focus();
    return null;
  }
  return {
    tema,
    modoPresentacion: normalizePresentationMode(elements.modoPresentacionSelect?.value || PRESENTATION_MODE_ROOMS),
    numMisiones: document.getElementById("numMisionesInput")?.value || 4,
    preguntasPorSala: document.getElementById("preguntasPorSalaInput")?.value || 1,
    duracion: document.getElementById("duracionInput")?.value || 35,
    narrativa: elements.narrativaSelect?.value || ""
  };
}

async function sugerirObjetivoFinal() {
  const context = getObjectiveSuggestionContext();
  if (!context) return;

  const btn = elements.btnSugerirObjetivo;
  const originalText = btn ? btn.innerHTML : "";
  setButtonLoading(btn, true, "Preparando ideas...", originalText);
  try {
    const seedText = await generateObjectiveText(
      buildObjectiveSeedPrompt(context),
      0.82,
      elements.idiomaSelect?.value || "es-419"
    );
    if (!seedText) {
      setStatus("No se recibió un borrador inicial claro. Intenta de nuevo.", "warning");
      return;
    }
    if (elements.objectiveIdeaTextarea) {
      elements.objectiveIdeaTextarea.value = seedText;
    }
    const modal = getObjectiveIdeaModal();
    if (modal) {
      modal.show();
      window.setTimeout(() => elements.objectiveIdeaTextarea?.focus(), 180);
    }
    setStatus("Edita las ideas propuestas y luego genera el objetivo final.", "info");
  } catch (err) {
    console.error("Error al sugerir objetivo final:", err);
    setStatus("Error al preparar las ideas del objetivo. Intenta de nuevo.", "bad");
  } finally {
    setButtonLoading(btn, false, "Preparando ideas...", originalText);
  }
}

async function generateFinalObjectiveFromIdeas() {
  const context = getObjectiveSuggestionContext();
  if (!context) return;
  const userIdeas = String(elements.objectiveIdeaTextarea?.value || "").trim();
  if (!userIdeas) {
    setStatus("Escribe o ajusta al menos una idea antes de generar el objetivo final.", "warning");
    elements.objectiveIdeaTextarea?.focus();
    return;
  }

  const button = elements.btnObjectiveIdeaGenerate;
  const originalText = button ? button.innerHTML : "";
  setButtonLoading(button, true, "Generando objetivo...", originalText);
  try {
    const generatedText = await generateObjectiveText(
      buildObjectiveFinalPrompt({ ...context, userIdeas }),
      0.88,
      elements.idiomaSelect?.value || "es-419"
    );
    if (!generatedText) {
      setStatus("No se recibió un objetivo final claro. Intenta de nuevo.", "warning");
      return;
    }
    const objetivoInput = document.getElementById("objetivoInput");
    if (objetivoInput) {
      objetivoInput.value = generatedText;
      saveFormState();
    }
    getObjectiveIdeaModal()?.hide();
    setStatus("Objetivo final sugerido exitosamente por la IA.", "success");
  } catch (err) {
    console.error("Error al generar el objetivo final:", err);
    setStatus("Error al generar el objetivo final. Intenta de nuevo.", "bad");
  } finally {
    setButtonLoading(button, false, "Generando objetivo...", originalText);
  }
}

elements.btnSugerirObjetivo?.addEventListener("click", sugerirObjetivoFinal);
elements.btnObjectiveIdeaGenerate?.addEventListener("click", generateFinalObjectiveFromIdeas);

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
    state.selectedMissionId = null;
    state.selectedQuestionId = null;
    state.expandedMissionIds.clear();
    state.activeTab = "preview";
    state.generationNote = "";
    elements.jsonPreview.textContent = "";
    elements.previewFrame.removeAttribute("srcdoc");
    renderMissionEditor();
    renderOutputsNow();
    setStatus("Formulario y editor listos para un nuevo escape room.", "info");
  } finally {
    state.formPersistenceSuspended = false;
    syncAcademicFields();
    syncNarrativaCustomField();
  }
});

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.erTab || "preview"));
});

window.addEventListener("message", (event) => {
  if (event.source !== elements.previewFrame?.contentWindow) return;
  const payload = event.data;
  if (!payload || payload.type !== "pigpen-editorial-action") return;
  syncPreviewEditorialButton(payload.action === "verify" ? "verify" : "autofill");
});

if (elements.form) {
  elements.form.addEventListener("input", saveFormState);
  elements.form.addEventListener("change", saveFormState);
}

elements.modeloSelect?.addEventListener("change", saveFormState);

elements.nivelSelect?.addEventListener("change", syncAcademicFields);
elements.narrativaSelect?.addEventListener("change", syncNarrativaCustomField);
elements.modoPresentacionSelect?.addEventListener("change", handlePresentationModeChange);
elements.generalContentInputs.forEach((field) => {
  field.addEventListener("input", (event) => updateGeneralProjectField(event.currentTarget, event.currentTarget.value));
});

mountStudioPanels();
wireSummaryBarMeasurements();
restoreBriefWidth();
setInspectorTab("rooms");
syncStudioPanels();
wireStudioShell();
wireMissionNavigatorEvents();
restoreFormState();
restoreProjectState();
restoreTheme();
restorePreviewTheme({ preferProject: true });
syncAcademicFields();
syncNarrativaCustomField();
syncPresentationModeUi({ preferProject: Boolean(state.project) });
wireMissionEditorEvents();
wireSessionEvents();
wireThemeEvents();
wirePreviewThemeEvents();
renderMissionEditor();
renderOutputsNow();
setActiveTab("preview");
renderSessionList();
setRemoteSaveState("idle");
