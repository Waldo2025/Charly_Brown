import { userStatus } from "./pigpen-user-status.mjs?v=20260912-v1";
import { expressionRiddleIssues, coordinateRiddleIssues, MECHANIC_COHERENCE_INSTRUCTION } from "./pigpen-mechanic-coherence.mjs?v=20260912-text-pieces-v5";
import { PEDAGOGY_VERSION, PEDAGOGY_INSTRUCTION, BRIEFING_NARRATIVE_INSTRUCTION, selectedExperienceInstruction, composePedagogicalRoom, pedagogicalRoomIssues } from "./pigpen-pedagogy.mjs?v=20260912-author-narrative-v4";
import { CONTENT_SLOT, fixedSchemaValue, fixedInteraction, contentDocument, contentInstructions, fillContentDocument } from "./pigpen-fixed-content.mjs?v=20260917-attributes-v8";
import { repairJsonCommas } from "./pigpen-json-syntax.mjs?v=20260912-commas-v1";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc as firestoreAddDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc as firestoreSetDoc,
  updateDoc as firestoreUpdateDoc,
  writeBatch,
  runTransaction,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadString,
  getDownloadURL, getBytes, getMetadata, uploadBytes
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getDefaultFirebaseApp } from "./firebase-default-app.js";
import { deleteTopicOnly } from "./pigpen-topic-delete.mjs?v=20260909-v1";
import { buildStructuralGroups, topicReferenceKey } from "./pigpen-structural-view.mjs?v=20260909-v1";
import { topicAcademic, topicSummary, compareTopics, sessionTopicCandidates, topicMatchesFilters, matchingSessionTopics, copyTopicResources, createTopicTransferService } from "./pigpen-topic-transfer.mjs?v=20260909-v1";
import { prepareEscapeRoomCloudPayload } from "./escape-room-cloud-payload.mjs?v=2";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js";
import { authFetch, authFetchJson, buildApiUrl, buildGeminiApiUrl, hasAvailableApiBase } from "./api-client.js?v=20260902-gemini-direct";
import {
  normalizeEscapeRoomProject,
  normalizeMission,
  normalizeQuestion,
  normalizeQuestionList,
  normalizeAcceptedAnswers,
  normalizeBaseText,
  normalizeTextList,
  normalizeSequenceItems,
  normalizePairList,
  normalizeMediaValue,
  normalizeString,
  removeQuestionAtIndex,
  replacePrimaryAcceptedAnswer,
  normalizePresentationMode,
  normalizeMissionTitle,
  normalizeMissionRelease,
  resolveTextSubtypeForAnswer,
  resolveOptionAnswerIndex,
  isSingleWordAnswer,
  buildMissionId,
  resolveFinalPasscode,
  validateQuestionAnswer,
  stripPrivateGenerationFields
} from "./escape-room-creator-model.mjs?v=20260912-jigsaw-v63";
import {
  buildEscapeRoomPackage,
  buildPreviewDocument
} from "./escape-room-package-builder.mjs?v=20260912-jigsaw-v106";
import {
  findEscapeRoomManifestPath,
  isSafeArchivePath,
  restorePigPenArchiveAssets
} from "./escape-room-zip-import.mjs";
import {
  buildMoodleAnswerKeyHtml
} from "./escape-room-answer-export.mjs?v=20260909-retired-format-v6";
import {
  buildEditorialWorkbookBlob,
  buildEditorialWorkbook,
  previewEditorialImport,
  readEditorialWorkbook
} from "./escape-room-editorial-workbook.mjs?v=20260909-word-bank-v21";
import {
  assignBriefingCoverageAnchors,
  auditMissionChallengeIntro,
  auditEscapeRoomText
} from "./escape-room-content-quality.mjs?v=20260905-distinct-coverage-v43";
import {
  ESCAPE_ROOM_INTERACTION_CATALOG,
  buildInteractionPlan
} from "./escape-room-interaction-plan.mjs?v=20260904-unlimited-questions-v44";
import { normalizeGameLocale } from "./escape-room-game-i18n.mjs?v=20260904-ai-editorial-source-v36";
import { CLOSED_ANSWER_SUBTYPES, DRAG_DROP_AUTHORING_TEMPLATE, QUESTION_BRIEF_GROUNDING, QUESTION_AUTHORING_TEMPLATES, buildQuestionAuthoringTemplate, QUESTION_DIVERSITY_INSTRUCTION, findRepeatedQuestionPlans, closeGeneratedAnswer, questionInteractionIssues, repairAnswerEntryInstruction, answerDisclosureIssues, matchingPromptIssues, normalizeFillBlankMarkers } from "./escape-room-question-policy.mjs?v=20260912-choice-banks-v23";
import { buildDifficultyInstruction, getQuestionDifficulty } from "./escape-room-difficulty-policy.mjs?v=20260909-b1-cognitive-demand-v3";
import {
  applyMechanicContractToQuestion,
  inferRequiredObjectiveMechanic,
  materializeObjectiveBlueprintMechanics,
  objectiveAnswerTargetsEquivalent,
  reconcileObjectiveMechanicContract,
  shiftCipherText
} from "./escape-room-mechanics.mjs?v=20260910-cipher-boolean-v29";
import { collectDeterministicObjectiveSourceRepairs } from "./escape-room-objective-source.mjs?v=20260906-classification-safe-v2";
import {
  normalizeObjectiveUnlockFragment,
  normalizeThematicFinalWord,
  partitionThematicFinalWord,
  resolveFixedThematicUnlock
} from "./escape-room-objective-unlock.mjs?v=20260908-thematic-word-v1";
import {
  dataUrlToBlob,
  detectAssetMimeType,
  extensionForMimeType,
  optimizeRasterImage
} from "./escape-room-image-optimizer.mjs?v=20260831-web-image-assets";

import { experience } from "./escape-room-experience.mjs?v=20260914-attributes-v10";
import { objectiveCheckpointStore } from "./pigpen-objective-checkpoint.mjs";
import { readQuestionPreferences, saveQuestionPreferences } from "./pigpen-question-preferences.mjs";
import { experienceContractSchema, experienceAuthoringInstruction, renderExperienceEditor, updateExperienceEditor } from "./escape-room-experience-authoring.mjs?v=20260914-attributes-v12";
import { mountExperienceModal } from "./pigpen-experience-modal.mjs?v=20260917-presets-v1";
import { createRewardEngine } from "./escape-room-rewards.mjs?v=20260912-jigsaw-v3";
const rewardEngine = createRewardEngine(experience);
let experienceConfig = readQuestionPreferences();
let experienceConfirmationRequired = false;
let experienceModal;

const app = getDefaultFirebaseApp();
void bootstrapFirebaseAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);

const TEXT_MODEL_DEFAULT = "gemini-2.5-flash";
const CONTENT_GENERATION_CONTRACT_VERSION = 38;
const OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION = 3;
// Flash Image reduce la latencia interactiva; el proxy cambia a Pro si se agota
// la cuota del modelo principal.
const IMAGE_MODEL_DEFAULT = "gemini-3.1-flash-image";
const FALLBACK_TEXT_MODELS = Object.freeze([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-flash-latest"
]);
const FALLBACK_IMAGE_MODELS = Object.freeze([
  "gemini-3.1-flash-image",
  "gemini-3-pro-image"
]);
const ALLOWED_TEXT_MODELS = new Set(FALLBACK_TEXT_MODELS);
const ALLOWED_IMAGE_MODELS = new Set(FALLBACK_IMAGE_MODELS);
const FORM_STORAGE_KEY = "PigPenCreator.formState.v2";
const BRIEF_SECTIONS_STORAGE_KEY = "PigPenCreator.briefSections.v1";
const PROJECT_STORAGE_KEY = "PigPenCreator.projectState.v1";
const OBJECTIVE_BLUEPRINT_STORAGE_KEY = "PigPenCreator.objectiveBlueprint.v38";
const PENDING_ASSET_DB_NAME = "PigPenCreator.pendingAssets.v1";
const PENDING_ASSET_STORE_NAME = "assets";
const ACTIVE_SESSION_STORAGE_KEY = "PigPenCreator.activeSessionId.v1";
const THEME_STORAGE_KEY = "PigPenCreator.theme.v1";
const PREVIEW_THEME_STORAGE_KEY = "PigPenCreator.previewTheme.v1";
const SESSION_FILTERS_STORAGE_KEY = "PigPenCreator.sessionFilters.v1";
const BRIEF_WIDTH_STORAGE_KEY = "PigPenCreator.briefWidth.v1";
const BRIEF_WIDTH_DEFAULT = 340;
const BRIEF_WIDTH_MIN = 200;
const BRIEF_WIDTH_MAX = 480;
const INSPECTOR_WIDTH_STORAGE_KEY = "PigPenCreator.inspectorWidth.v1";
const INSPECTOR_WIDTH_DEFAULT = 220;
const INSPECTOR_WIDTH_MIN = 200;
const INSPECTOR_WIDTH_MAX = 480;
const SESSIONS_WIDTH_STORAGE_KEY = "PigPenCreator.sessionsWidth.v1";
const SESSIONS_WIDTH_DEFAULT = 340;
const SESSIONS_WIDTH_MIN = 200;
const SESSIONS_WIDTH_MAX = 560;
const MISSION_WORKSPACE_WIDTH_STORAGE_KEY = "PigPenCreator.missionWorkspaceWidth.v1";
const MISSION_WORKSPACE_WIDTH_DEFAULT = 360;
const MISSION_WORKSPACE_WIDTH_MIN = 240;
const MISSION_WORKSPACE_WIDTH_MAX = 560;
const STUDIO_MAIN_MIN_WIDTH = 360;
const CREATOR_LOGO_URL = new URL("../logo.png", import.meta.url);
// El estudio multipanel cabe desde una tablet grande / laptop compacta.
// Reservar los drawers hasta 1439px hacia que incluso ventanas amplias
// parecieran la version movil.
const STUDIO_DESKTOP_MEDIA = "(min-width: 1024px)";
const ESCAPE_ROOM_COLLECTION = "escapeRoom";
const TOPICS_SUBCOLLECTION = "topics";
const SESSION_SCHEMA_VERSION = 3;
const SESSION_TITLE_DEFAULT = "Sesion sin titulo";
const PRESENTATION_MODE_ROOMS = "salas";
const PRESENTATION_MODE_MENU = "menu_secciones";
const TEXT_SUBTYPES = ["palabra", "frase_corta", "letra", "numero", "codigo_corto"];
const TEXT_SUBTYPE_LABELS = Object.freeze({
  palabra: "Palabra exacta",
  frase_corta: "Frase corta",
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
  4: "#e48119",
  5: "#708e2c",
  6: "#4a7cb1",
  7: "#cb2637",
  8: "#bd348c",
  9: "#f2a85d"
};
const SUPPORT_GRAPHIC_UPLOAD_ENDPOINT = "/api/unidades/support-graphics/upload";
const DATA_URL_PATTERN = /^data:([^;,]+)(;[^,]*)?,(.*)$/i;
const elements = {
  form: document.getElementById("escapeRoomForm"),
  missionEditorList: document.getElementById("missionEditorList"),
  missionEmpty: document.getElementById("erMissionEmpty"),
  btnGenerar: document.getElementById("btnGenerar"),
  btnGenerarBottom: document.getElementById("btnGenerarBottom"),
  btnLimpiar: document.getElementById("btnLimpiar"),
  btnExportar: document.getElementById("btnExportar"),
  btnShareEscapeRoom: document.getElementById("btnShareEscapeRoom"),
  shareMenu: document.getElementById("erShareMenu"),
  shareMenuStatus: document.getElementById("erShareMenuStatus"),
  shareMenuActions: Array.from(document.querySelectorAll("[data-er-share-action]")),
  zipExportModal: document.getElementById("erZipExportModal"),
  zipExportStatus: document.getElementById("erZipExportStatus"),
  btnCopyAllAnswers: document.getElementById("btnCopyAllAnswers"),
  btnEditorialReview: document.getElementById("btnEditorialReview"),
  btnExportEditorialWorkbook: document.getElementById("btnExportEditorialWorkbook"),
  btnSelectEditorialWorkbook: document.getElementById("btnSelectEditorialWorkbook"),
  editorialDriveUrl: document.getElementById("erEditorialDriveUrl"),
  btnImportEditorialDrive: document.getElementById("btnImportEditorialDrive"),
  editorialWorkbookInput: document.getElementById("erEditorialWorkbookInput"),
  editorialReviewStatus: document.getElementById("erEditorialReviewStatus"),
  editorialReviewPreview: document.getElementById("erEditorialReviewPreview"),
  editorialReviewSummary: document.getElementById("erEditorialReviewSummary"),
  editorialReviewIssues: document.getElementById("erEditorialReviewIssues"),
  editorialReviewDiff: document.getElementById("erEditorialReviewDiff"),
  btnApplyEditorialWorkbook: document.getElementById("btnApplyEditorialWorkbook"),
  btnPreviewAutofill: document.getElementById("btnPreviewAutofill"),
  publishToggle: document.getElementById("publishToggle"),
  publishSwitchLabel: document.getElementById("publishSwitchLabel"),
  btnCopiarJson: document.getElementById("btnCopiarJson"),
  btnSugerirObjetivo: document.getElementById("btnSugerirObjetivo"),
  objectiveIdeaModal: document.getElementById("objectiveIdeaModal"),
  objectiveIdeaTextarea: document.getElementById("objectiveIdeaTextarea"),
  btnObjectiveIdeaGenerate: document.getElementById("btnObjectiveIdeaGenerate"),
  objectiveEnrichmentLoader: document.getElementById("objectiveEnrichmentLoader"),
  btnAddMission: document.getElementById("btnAddMission"),
  loading: document.getElementById("loadingIndicator"),
  emptyState: document.getElementById("erEmptyState"),
  previewPanel: document.getElementById("escapeRoomPreviewPanel"),
  previewFrame: document.getElementById("escapeRoomPreviewFrame"),
  previewSpinner: document.getElementById("erPreviewSpinner"),
  previewSpinnerTitle: document.getElementById("erPreviewSpinnerTitle"),
  previewSpinnerDetail: document.getElementById("erPreviewSpinnerDetail"),
  previewProgressBar: document.getElementById("erPreviewProgressBar"),
  previewSpinnerLog: document.getElementById("erPreviewSpinnerLog"),
  resultadoContainer: document.getElementById("resultadoContainer"),
  jsonPreview: document.getElementById("jsonPreview"),
  statusBanner: document.getElementById("erStatusBanner"),
  tabButtons: Array.from(document.querySelectorAll("[data-er-tab]")),
  modelConfigModal: document.getElementById("modelConfigModal"),
  objetivoModeloSelect: document.getElementById("objetivoModeloSelect"),
  imagenModeloSelect: document.getElementById("imagenModeloSelect"),
  geminiModelCatalogStatus: document.getElementById("geminiModelCatalogStatus"),
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
  estiloImagenCustomField: document.getElementById("estiloImagenCustomField"),
  estiloImagenCustomInput: document.getElementById("estiloImagenCustomInput"),
  missionCount: document.getElementById("erMissionCount"),
  unlockedCount: document.getElementById("erUnlockedCount"),
  typeSummary: document.getElementById("erTypeSummary"),
  outputGrade: document.getElementById("erOutputGrade"),
  outputTrimester: document.getElementById("erOutputTrimester"),
  outputTopic: document.getElementById("erOutputTopic"),
  btnNewSession: document.getElementById("btnNewSession"),
  btnAddTopic: document.getElementById("btnAddTopic"),
  newTopicModal: document.getElementById("erNewTopicModal"),
  newTopicForm: document.getElementById("erNewTopicForm"),
  newTopicNumber: document.getElementById("erNewTopicNumber"),
  newTopicNumberLabel: document.getElementById("erNewTopicNumberLabel"),
  newTopicError: document.getElementById("erNewTopicError"),
  topicList: document.getElementById("erTopicList"),
  topicEmpty: document.getElementById("erTopicEmpty"),
  newSessionModal: document.getElementById("erNewSessionModal"),
  btnCreateBlankSession: document.getElementById("btnCreateBlankSession"),
  btnImportZipSession: document.getElementById("btnImportZipSession"),
  btnCreateSheetsSession: document.getElementById("btnCreateSheetsSession"),
  sheetsImportModal: document.getElementById("erSheetsImportModal"),
  importZipInput: document.getElementById("erImportZipInput"),
  importZipStatus: document.getElementById("erImportZipStatus"),
  sessionList: document.getElementById("erSessionList"),
  sessionsLoading: document.getElementById("erSessionsLoading"),
  sessionsEmpty: document.getElementById("erSessionsEmpty"),
  sessionsFilteredEmpty: document.getElementById("erSessionsFilteredEmpty"),
  sessionsCount: document.getElementById("erSessionsCount"),
  sessionFilters: document.getElementById("erSessionFilters"),
  sessionFiltersModal: document.getElementById("erSessionFiltersModal"),
  sessionNameFilter: document.getElementById("erSessionNameFilter"),
  sessionTrimesterFilters: Array.from(document.querySelectorAll("[data-session-trimester-filter]")),
  sessionSubjectFilters: Array.from(document.querySelectorAll("[data-session-subject-filter]")),
  sessionThemeFilters: Array.from(document.querySelectorAll("[data-session-theme-filter]")),
  sessionLevelFilters: Array.from(document.querySelectorAll("[data-session-level-filter]")),
  sessionGradeFilters: Array.from(document.querySelectorAll("[data-session-grade-filter]")),
  btnResetSessionFilters: document.getElementById("btnResetSessionFilters"),
  sessionIndexWarning: document.getElementById("erSessionIndexWarning"),
  btnRetrySessionIndex: document.getElementById("btnRetrySessionIndex"),
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
  modoPresentacionSelect: document.getElementById("modoPresentacionSelect"),
  presentationModeHelp: document.getElementById("erPresentationModeHelp"),
  missionFieldLabel: document.getElementById("erMissionFieldLabel"),
  questionCountLabel: document.getElementById("erQuestionCountLabel"),
  addMissionLabel: document.getElementById("erAddMissionLabel"),
  missionCountLabel: document.getElementById("erMissionCountLabel"),
  unlockedCountLabel: document.getElementById("erUnlockedCountLabel"),
  btnRegenerateSelectedMission: document.getElementById("btnRegenerateSelectedMission"),
  btnCloseMissionWorkspace: document.getElementById("btnCloseMissionWorkspace"),
  generalContentCard: document.getElementById("erGeneralContentCard"),
  generalContentHelp: document.getElementById("erGeneralContentHelp"),
  generalContentInputs: Array.from(document.querySelectorAll("[data-project-field]")),
  generalCoverPreview: document.getElementById("generalCoverPreview"),
  generalCoverEmpty: document.getElementById("generalCoverEmpty"),
  generalCoverReplaceLabel: document.getElementById("generalCoverReplaceLabel"),
  btnReplaceCoverImage: document.getElementById("btnReplaceCoverImage"),
  btnRegenerateCoverImage: document.getElementById("btnRegenerateCoverImage"),
  btnRegenerateEndingImage: document.getElementById("btnRegenerateEndingImage"),
  btnReplaceEndingImage: document.getElementById("btnReplaceEndingImage"),
  summaryCard: document.querySelector(".er-summary-card"),
  studioWorkspace: document.getElementById("erStudioWorkspace"),
  mainColumn: document.querySelector(".er-main-column"),
  sessionsPanel: document.querySelector(".er-sessions-panel"),
  sessionsResizeHandle: document.getElementById("erSessionsResizeHandle"),
  briefPanel: document.getElementById("briefCollapse"),
  briefResizeHandle: document.getElementById("erBriefResizeHandle"),
  inspectorPanel: document.getElementById("erInspectorPanel"),
  inspectorResizeHandle: document.getElementById("erInspectorResizeHandle"),
  inspectorContentPanel: document.getElementById("erInspectorContentPanel"),
  inspectorRoomsPanel: document.getElementById("erInspectorRoomsPanel"),
  inspectorTabButtons: Array.from(document.querySelectorAll("[data-er-inspector-tab]")),
  inspectorTabPanels: Array.from(document.querySelectorAll("[data-er-inspector-panel]")),
  panelToggleButtons: Array.from(document.querySelectorAll("[data-studio-panel-toggle]")),
  studioBackdrop: document.getElementById("erStudioBackdrop"),
  missionWorkspacePanel: document.getElementById("erMissionWorkspacePanel"),
  missionWorkspaceResizeHandle: document.getElementById("erMissionWorkspaceResizeHandle"),
  missionNavigatorList: document.getElementById("erMissionNavigatorList"),
  roomListTitle: document.getElementById("erRoomListTitle"),
  deleteQuestionDialog: document.getElementById("erDeleteQuestionDialog"),
  deleteQuestionDescription: document.getElementById("erDeleteQuestionDescription")
};

let objectiveIdeaModalInstance = null;
let newSessionModalInstance = null;
let newTopicModalInstance = null;
let createSessionFromSheetsPending = false;
let allowCreatorExitOnce = false;
let creatorHistoryGuardArmed = false;
let restoringCreatorHistoryGuard = false;

const CREATOR_HISTORY_GUARD_KEY = "__pigPenCreatorExitGuard";

const state = {
  project: null,
  objectiveBlueprint: null,
  objectiveBlueprintKey: "",
  pendingObjectiveBrief: null,
  pendingGenerationDraft: null,
  pendingGenerationDraftKey: "",
  generationNote: "",
  activeTab: "preview",
  isLoading: false,
  isGenerating: false,
  isGeneratingImagesInBackground: false,
  isExporting: false,
  exportReturnFocus: null,
  shareMenuOpen: false,
  shareLink: "",
  shareInFlight: false,
  answerCopyInFlight: false,
  editorialReviewInFlight: false,
  editorialImportDocument: null,
  editorialImportPreview: null,
  editorialImportFileName: "",
  formPersistenceSuspended: false,
  refreshHandle: null,
  sortable: null,
  selectedMissionId: null,
  selectedQuestionId: null,
  selectedBriefingMissionId: null,
  expandedMissionIds: new Set(),
  inspectorTab: "topics",
  briefOpen: true,
  inspectorOpen: true,
  activeDrawer: null,
  panelReturnFocus: null,
  sessionMenuId: null,
  sessionMenuReturnFocus: null,
  briefWidth: BRIEF_WIDTH_DEFAULT,
  inspectorWidth: INSPECTOR_WIDTH_DEFAULT,
  sessionsWidth: SESSIONS_WIDTH_DEFAULT,
  missionWorkspaceWidth: MISSION_WORKSPACE_WIDTH_DEFAULT,
  previewStudioFullscreen: false,
  pendingQuestionRemoval: null,
  sessionNameFilter: "",
  sessionTrimesterFilter: "",
  sessionSubjectFilter: "",
  sessionThemeFilter: "",
  sessionIndexFailures: [],
  sessionLevelFilter: "",
  sessionGradoFilter: "",
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
  pendingAssetRetryHandle: null,
  pendingAssetRetryAttempt: 0,
  isHydratingFromRemote: false,
  suspendSessionSave: false,
  saveState: "idle",
  currentUser: null,
  previewTheme: { ...PREVIEW_THEME_DEFAULT },
  pendingImageReplacementTarget: null
};

let topicTransferUi = null;
let topicTransferService = null;
const structuralView = { enabled: readStructuralViewPreference(), groupKey: '', search: '', navigationBusy: false };

function isGenerationBusy() {
  return state.isGenerating || state.isGeneratingImagesInBackground || Boolean(topicTransferUi?.busy) || structuralView.navigationBusy;
}

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
  if (elements.missionWorkspacePanel && elements.inspectorPanel) {
    elements.studioWorkspace.insertBefore(elements.missionWorkspacePanel, elements.inspectorPanel);
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

function setInspectorTab(tabName = "topics") {
  const nextTab = ["topics", "content", "rooms"].includes(tabName) ? tabName : "topics";
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

function getPanelWidthBounds(panelName) {
  const isBrief = panelName === "brief";
  const configuredMin = isBrief ? BRIEF_WIDTH_MIN : INSPECTOR_WIDTH_MIN;
  const configuredMax = isBrief ? BRIEF_WIDTH_MAX : INSPECTOR_WIDTH_MAX;
  if (!elements.studioWorkspace || !isStudioDesktop()) {
    return { min: configuredMin, max: configuredMax };
  }
  const workspaceWidth = elements.studioWorkspace.clientWidth || window.innerWidth;
  const sessionsWidth = elements.sessionsPanel?.offsetWidth || state.sessionsWidth;
  const otherWidth = isBrief
    ? (state.inspectorOpen ? state.inspectorWidth : 0)
    : (state.briefOpen ? state.briefWidth : 0);
  const available = Math.max(0, workspaceWidth - sessionsWidth - otherWidth - STUDIO_MAIN_MIN_WIDTH);
  const max = Math.min(configuredMax, available);
  return { min: Math.min(configuredMin, max), max };
}

function getSessionsWidthBounds() {
  if (!elements.studioWorkspace || !isStudioDesktop()) {
    return { min: SESSIONS_WIDTH_MIN, max: SESSIONS_WIDTH_MAX };
  }
  const workspaceWidth = elements.studioWorkspace.clientWidth || window.innerWidth;
  const sidePanelsWidth = (state.briefOpen ? state.briefWidth : 0)
    + (state.inspectorOpen ? state.inspectorWidth : 0);
  const available = Math.max(0, workspaceWidth - sidePanelsWidth - STUDIO_MAIN_MIN_WIDTH);
  const max = Math.max(SESSIONS_WIDTH_MIN, Math.min(SESSIONS_WIDTH_MAX, available));
  return { min: SESSIONS_WIDTH_MIN, max };
}

function getMissionWorkspaceWidthBounds() {
  if (!elements.mainColumn || !isStudioDesktop()) {
    return { min: MISSION_WORKSPACE_WIDTH_MIN, max: MISSION_WORKSPACE_WIDTH_MAX };
  }
  const mainColumnWidth = elements.mainColumn.clientWidth || window.innerWidth;
  const max = Math.min(MISSION_WORKSPACE_WIDTH_MAX, Math.max(0, mainColumnWidth - 20));
  return { min: Math.min(MISSION_WORKSPACE_WIDTH_MIN, max), max };
}

function applySessionsWidth(width, { persist = false } = {}) {
  const bounds = getSessionsWidthBounds();
  const nextWidth = Math.round(Math.min(bounds.max, Math.max(bounds.min, Number(width) || SESSIONS_WIDTH_DEFAULT)));
  state.sessionsWidth = nextWidth;
  elements.studioWorkspace?.style.setProperty("--er-sessions-width", `${nextWidth}px`);
  elements.sessionsResizeHandle?.setAttribute("aria-valuemin", String(bounds.min));
  elements.sessionsResizeHandle?.setAttribute("aria-valuemax", String(bounds.max));
  elements.sessionsResizeHandle?.setAttribute("aria-valuenow", String(nextWidth));
  if (persist && isLocalStorageAvailable()) {
    window.localStorage.setItem(SESSIONS_WIDTH_STORAGE_KEY, String(nextWidth));
  }
}

function applyBriefWidth(width, { persist = false } = {}) {
  const bounds = getPanelWidthBounds("brief");
  const nextWidth = Math.round(Math.min(bounds.max, Math.max(bounds.min, Number(width) || BRIEF_WIDTH_DEFAULT)));
  state.briefWidth = nextWidth;
  elements.studioWorkspace?.style.setProperty("--er-brief-width", `${nextWidth}px`);
  elements.briefResizeHandle?.setAttribute("aria-valuemin", String(bounds.min));
  elements.briefResizeHandle?.setAttribute("aria-valuemax", String(bounds.max));
  elements.briefResizeHandle?.setAttribute("aria-valuenow", String(nextWidth));
  if (persist && isLocalStorageAvailable()) {
    window.localStorage.setItem(BRIEF_WIDTH_STORAGE_KEY, String(nextWidth));
  }
}

function applyInspectorWidth(width, { persist = false } = {}) {
  const bounds = getPanelWidthBounds("inspector");
  const nextWidth = Math.round(Math.min(bounds.max, Math.max(bounds.min, Number(width) || INSPECTOR_WIDTH_DEFAULT)));
  state.inspectorWidth = nextWidth;
  elements.studioWorkspace?.style.setProperty("--er-inspector-width", `${nextWidth}px`);
  elements.inspectorResizeHandle?.setAttribute("aria-valuemin", String(bounds.min));
  elements.inspectorResizeHandle?.setAttribute("aria-valuemax", String(bounds.max));
  elements.inspectorResizeHandle?.setAttribute("aria-valuenow", String(nextWidth));
  if (persist && isLocalStorageAvailable()) {
    window.localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(nextWidth));
  }
}

function applyMissionWorkspaceWidth(width, { persist = false } = {}) {
  const bounds = getMissionWorkspaceWidthBounds();
  const nextWidth = Math.round(Math.min(bounds.max, Math.max(bounds.min, Number(width) || MISSION_WORKSPACE_WIDTH_DEFAULT)));
  state.missionWorkspaceWidth = nextWidth;
  elements.studioWorkspace?.style.setProperty("--er-mission-workspace-width", `${nextWidth}px`);
  elements.missionWorkspaceResizeHandle?.setAttribute("aria-valuemin", String(bounds.min));
  elements.missionWorkspaceResizeHandle?.setAttribute("aria-valuemax", String(bounds.max));
  elements.missionWorkspaceResizeHandle?.setAttribute("aria-valuenow", String(nextWidth));
  if (persist && isLocalStorageAvailable()) {
    window.localStorage.setItem(MISSION_WORKSPACE_WIDTH_STORAGE_KEY, String(nextWidth));
  }
}

function restoreBriefWidth() {
  let savedWidth = BRIEF_WIDTH_DEFAULT;
  if (isLocalStorageAvailable()) {
    savedWidth = Number(window.localStorage.getItem(BRIEF_WIDTH_STORAGE_KEY)) || BRIEF_WIDTH_DEFAULT;
  }
  applyBriefWidth(savedWidth);
}

function restoreInspectorWidth() {
  let savedWidth = INSPECTOR_WIDTH_DEFAULT;
  if (isLocalStorageAvailable()) {
    savedWidth = Number(window.localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY)) || INSPECTOR_WIDTH_DEFAULT;
  }
  applyInspectorWidth(savedWidth);
}

function restoreSessionsWidth() {
  let savedWidth = SESSIONS_WIDTH_DEFAULT;
  if (isLocalStorageAvailable()) {
    savedWidth = Number(window.localStorage.getItem(SESSIONS_WIDTH_STORAGE_KEY)) || SESSIONS_WIDTH_DEFAULT;
  }
  applySessionsWidth(savedWidth);
}

function restoreMissionWorkspaceWidth() {
  let savedWidth = MISSION_WORKSPACE_WIDTH_DEFAULT;
  if (isLocalStorageAvailable()) {
    savedWidth = Number(window.localStorage.getItem(MISSION_WORKSPACE_WIDTH_STORAGE_KEY)) || MISSION_WORKSPACE_WIDTH_DEFAULT;
  }
  applyMissionWorkspaceWidth(savedWidth);
}

function getPanelByName(panelName) {
  return panelName === "brief" ? elements.briefPanel : elements.inspectorPanel;
}

function syncStudioPanels() {
  const desktop = isStudioDesktop();
  const briefVisible = desktop ? state.briefOpen : state.activeDrawer === "brief";
  const inspectorVisible = state.previewStudioFullscreen
    || (desktop ? state.inspectorOpen : state.activeDrawer === "inspector");
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
  applyInspectorWidth(state.inspectorWidth);
  applySessionsWidth(state.sessionsWidth);
  applyMissionWorkspaceWidth(state.missionWorkspaceWidth);
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

function wirePanelResizer({ handle, stateKey, applyWidth, getBounds, defaultWidth, direction = "left" }) {
  if (!handle) return;
  handle.addEventListener("pointerdown", (event) => {
    if (!isStudioDesktop()) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state[stateKey];
    handle.setPointerCapture?.(event.pointerId);
    handle.classList.add("is-resizing");
    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      applyWidth(startWidth + (direction === "right" ? delta : -delta));
    };
    const onEnd = () => {
      handle.classList.remove("is-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      applyWidth(state[stateKey], { persist: true });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  });
  handle.addEventListener("keydown", (event) => {
    if (!isStudioDesktop() || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const bounds = getBounds();
    if (event.key === "Home") applyWidth(bounds.min, { persist: true });
    else if (event.key === "End") applyWidth(bounds.max, { persist: true });
    else {
      const grows = direction === "right" ? event.key === "ArrowRight" : event.key === "ArrowLeft";
      applyWidth(state[stateKey] + (grows ? 16 : -16), { persist: true });
    }
  });
  handle.addEventListener("dblclick", () => applyWidth(defaultWidth, { persist: true }));
}

function wireSessionsResizer() {
  wirePanelResizer({
    handle: elements.sessionsResizeHandle,
    stateKey: "sessionsWidth",
    applyWidth: applySessionsWidth,
    getBounds: getSessionsWidthBounds,
    defaultWidth: SESSIONS_WIDTH_DEFAULT,
    direction: "right"
  });
}

function wireBriefResizer() {
  wirePanelResizer({
    handle: elements.briefResizeHandle,
    stateKey: "briefWidth",
    applyWidth: applyBriefWidth,
    getBounds: () => getPanelWidthBounds("brief"),
    defaultWidth: BRIEF_WIDTH_DEFAULT
  });
}

function wireInspectorResizer() {
  wirePanelResizer({
    handle: elements.inspectorResizeHandle,
    stateKey: "inspectorWidth",
    applyWidth: applyInspectorWidth,
    getBounds: () => getPanelWidthBounds("inspector"),
    defaultWidth: INSPECTOR_WIDTH_DEFAULT
  });
}

function wireMissionWorkspaceResizer() {
  wirePanelResizer({
    handle: elements.missionWorkspaceResizeHandle,
    stateKey: "missionWorkspaceWidth",
    applyWidth: applyMissionWorkspaceWidth,
    getBounds: getMissionWorkspaceWidthBounds,
    defaultWidth: MISSION_WORKSPACE_WIDTH_DEFAULT
  });
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
  wireSessionsResizer();
  wireBriefResizer();
  wireInspectorResizer();
  wireMissionWorkspaceResizer();
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
  const normalized = {
    mode: PRESENTATION_MODE_ROOMS,
    formatLabel: "Por salas",
    itemSingular: "sala",
    itemSingularTitle: "Sala",
    itemPlural: "salas",
    itemPluralTitle: "Salas",
    sectionPlural: "salas"
  };
  return normalized;
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
    const storedValue = hasProject && projectField ? normalizeString(state.project?.[projectField], "") : "";
    const nextValue = projectField === "backgroundImagePrompt" && hasProject
      ? (storedValue || buildCoverImagePromptSeed(state.project))
      : storedValue;
    if (field.value !== nextValue) field.value = nextValue;
  });
  const coverSource = hasProject ? normalizeString(state.project?.backgroundImage, "") : "";
  if (elements.generalCoverPreview) {
    elements.generalCoverPreview.hidden = !coverSource;
    if (coverSource && elements.generalCoverPreview.src !== coverSource) elements.generalCoverPreview.src = coverSource;
    elements.generalCoverPreview.alt = hasProject
      ? normalizeString(state.project.backgroundImageAlt, `Imagen de inicio de ${state.project.titulo || "escape room"}`)
      : "Vista previa de la imagen de inicio";
  }
  if (elements.generalCoverEmpty) elements.generalCoverEmpty.hidden = Boolean(coverSource);
  if (elements.generalCoverReplaceLabel) elements.generalCoverReplaceLabel.textContent = coverSource ? "Sustituir imagen" : "Añadir imagen";
  if (elements.btnReplaceCoverImage) elements.btnReplaceCoverImage.disabled = !hasProject || isGenerationBusy() || state.isLoading;
  if (elements.btnRegenerateCoverImage) elements.btnRegenerateCoverImage.disabled = !hasProject || isGenerationBusy() || state.isLoading;
  if (elements.btnRegenerateEndingImage) {
    if (elements.btnReplaceEndingImage) elements.btnReplaceEndingImage.disabled = !hasProject || isGenerationBusy() || state.isLoading;
    elements.btnRegenerateEndingImage.disabled = !hasProject || isGenerationBusy() || state.isLoading;
    elements.btnRegenerateEndingImage.querySelector("span").textContent = state.project?.endingImage
      ? "Regenerar imagen de finalización" : "Generar imagen de finalización";
    const image = document.getElementById("generalEndingImage");
    const preview = document.getElementById("generalEndingPreview");
    if (image && preview) {
      const source = hasProject ? (state.project.endingImage || (!state.project.dedicatedEndingImage && state.project.backgroundImage)) : "";
      preview.hidden = !source;
      if (source) image.src = source;
      else image.removeAttribute("src");
    }
  }
}

function normalizeEditableFinalKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function updateGeneralProjectField(field, value) {
  if (!state.project || !field) return;
  const projectField = String(field.dataset.projectField || "").trim();
  if (!projectField) return;
  state.project[projectField] = projectField === "clave_final"
    ? normalizeEditableFinalKey(value)
    : String(value ?? "");
  if (projectField === "clave_final") {
    field.value = state.project.clave_final;
    document.querySelectorAll('[data-editor-final-key]').forEach((input) => {
      if (input !== field) input.value = state.project.clave_final;
    });
  }
  scheduleOutputRefresh();
}

function handlePresentationModeChange() {
  const nextMode = normalizePresentationMode(elements.modoPresentacionSelect?.value || PRESENTATION_MODE_ROOMS);
  if (state.project) {
    state.project = withDefaultRoutes({
      ...state.project,
      modo_presentacion: nextMode
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
      schedulePendingAssetRetry(800);
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
  const storage = getTabWorkspaceStorage();
  if (!storage) return;
  if (sessionId) {
    storage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
    return;
  }
  storage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
}

function getStoredActiveSessionId() {
  const storage = getTabWorkspaceStorage();
  return storage ? String(storage.getItem(ACTIVE_SESSION_STORAGE_KEY) || "").trim() : "";
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
  return String(elements.nivelSelect?.value || "Secundaria").trim() === "Secundaria" ? "Secundaria" : "Primaria";
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
  const requestedThemeIndex = Number.parseInt(themeSource, 10);
  const themeIndex = Object.prototype.hasOwnProperty.call(THEME_COMBINE_COLORS, requestedThemeIndex)
    ? requestedThemeIndex
    : 1;
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

function buildImageTextPolicyLine({ allowOptionalText = true } = {}) {
  if (!allowOptionalText) {
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
    __experienceConfig: experience.config(project.experience_config),
    modoPresentacionSelect: normalizePresentationMode(project.modo_presentacion),
    idiomaSelect: project.idioma || "es-419",
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
  updateOutputAcademicIndicators();
}

function getSelectedOptionLabel(select, fallback = "—") {
  const option = select?.selectedOptions?.[0];
  return normalizeString(option?.textContent || select?.value, fallback);
}

function updateOutputAcademicIndicators() {
  if (elements.outputGrade) {
    elements.outputGrade.textContent = getSelectedOptionLabel(elements.gradoSelect);
  }
  if (elements.outputTrimester) {
    elements.outputTrimester.textContent = `Trim ${normalizeString(elements.trimestreSelect?.value, "—")}`;
  }
  if (elements.outputTopic) {
    const academicUnitLabel = getAcademicFieldMode() === "Secundaria" ? "Tema" : "Unidad";
    elements.outputTopic.textContent = `${academicUnitLabel} ${normalizeString(elements.unidadTemaSelect?.value, "—")}`;
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
  const formState = { __experienceConfig: experience.config(experienceConfig), __experienceConfirmationRequired: experienceConfirmationRequired };
  elements.form.querySelectorAll("input, select, textarea").forEach((field) => {
    if (!field.id) return;
    if (field.type === "button" || field.type === "submit" || field.type === "reset") return;
    if (field.type === "checkbox") {
      formState[field.id] = Boolean(field.checked);
      return;
    }
    formState[field.id] = field.value;
  });
  if (elements.objetivoModeloSelect?.id) {
    formState.objetivoModeloSelect = elements.objetivoModeloSelect.dataset.pendingModelValue
      || elements.objetivoModeloSelect.value;
  }
  if (elements.imagenModeloSelect?.id) {
    formState[elements.imagenModeloSelect.id] = elements.imagenModeloSelect.dataset.pendingModelValue
      || elements.imagenModeloSelect.value;
  }
  const durationInput = document.getElementById("duracionInput");
  formState.__durationMode = durationInput?.dataset.durationMode === "manual" ? "manual" : "auto";
  if (state.objectiveBlueprint && state.objectiveBlueprintKey) {
    formState.__objectiveBlueprintVersion = CONTENT_GENERATION_CONTRACT_VERSION;
    formState.__objectiveBlueprintKey = state.objectiveBlueprintKey;
    formState.__objectiveBlueprint = structuredClone(state.objectiveBlueprint);
  }
  return formState;
}

function applyFormState(formState = {}) {
  experienceConfig = experience.config(formState.__experienceConfig);
  experienceConfirmationRequired = formState.__experienceConfirmationRequired === true;
  if (!elements.form || !formState || typeof formState !== "object") return;
  formState = {
    ...formState,
    objetivoModeloSelect: formState.objetivoModeloSelect || formState.modeloSelect || TEXT_MODEL_DEFAULT
  };
  delete formState.modeloSelect;
  state.formPersistenceSuspended = true;
  try {
    Object.entries(formState).forEach(([fieldId, value]) => {
      if (fieldId.startsWith("__")) return;
      const field = document.getElementById(fieldId);
      if (!field) return;
      if (["objetivoModeloSelect", "imagenModeloSelect"].includes(fieldId) && value) {
        field.dataset.pendingModelValue = String(value);
      }
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
  syncImageStyleCustomField();
  syncPresentationModeUi();
  const durationInput = document.getElementById("duracionInput");
  if (durationInput) {
    durationInput.dataset.durationMode = formState.__durationMode === "manual" ? "manual" : "auto";
    if (durationInput.dataset.durationMode === "auto") syncConfiguredEstimatedDuration();
  }
  state.objectiveBlueprint = null;
  state.objectiveBlueprintKey = "";
  if (formState.__objectiveBlueprint && typeof formState.__objectiveBlueprint === "object") {
    const currentContext = getFormData();
    const sourceContract = formState.__objectiveBlueprint.source_contract || null;
    const blueprint = upgradeObjectiveBlueprintForReuse(formState.__objectiveBlueprint, currentContext);
    const currentKey = buildObjectiveBlueprintKey(currentContext, blueprint.source_contract);
    if (formState.__objectiveBlueprintKey === currentKey
      || objectiveBlueprintMatchesCurrentForm(formState.__objectiveBlueprint, currentContext)) {
      state.objectiveBlueprint = blueprint;
      state.objectiveBlueprintKey = currentKey;
      persistObjectiveBlueprint(currentKey, blueprint);
    } else if (sourceContract?.original_objective_hash) {
      // Conserva el contrato como plan desactualizado para poder recompilar una
      // edición manual o un cambio de configuración sin perder el origen.
      state.objectiveBlueprint = blueprint;
      state.objectiveBlueprintKey = normalizeString(formState.__objectiveBlueprintKey, "");
    }
  }
  syncObjectivePlanStatus();
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
    ...topicAcademic(data),
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
  return [...topics].sort(compareTopics);
}

function buildTopicSummary(topic = {}) {
  return topicSummary(topic);
}

function setupTopicTrimesterGroups() {
  const list = elements.topicList;
  if (!list) return;
  let preferences = {};
  try {
    const saved = JSON.parse(localStorage.getItem('PigPenCreator.topicTrimesters.v1') || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) preferences = saved;
  } catch (_) { /* All groups start open if storage is unavailable. */ }
  for (const heading of Array.from(list.querySelectorAll(':scope > .er-topic-trimester'))) {
    const label = heading.textContent.trim();
    const key = label.match(/\d+/)?.[0] || 'none';
    const group = document.createElement('details');
    group.className = 'er-topic-trimester-group';
    group.open = preferences[key] !== false;
    const summary = document.createElement('summary');
    summary.className = 'er-topic-trimester-toggle';
    const content = document.createElement('div');
    content.className = 'er-topic-trimester-content';
    let next = heading.nextElementSibling;
    while (next && !next.classList.contains('er-topic-trimester')) {
      const following = next.nextElementSibling;
      content.appendChild(next);
      next = following;
    }
    summary.innerHTML = '<span>' + escapeHtml(label) + '</span><span class="er-topic-trimester-count">' + content.children.length + '</span><i class="fas fa-chevron-down" aria-hidden="true"></i>';
    group.append(summary, content);
    heading.replaceWith(group);
    let previousOpen = group.open;
    group.addEventListener('toggle', () => {
      if (group.open === previousOpen) return;
      previousOpen = group.open;
      preferences[key] = group.open;
      try { localStorage.setItem('PigPenCreator.topicTrimesters.v1', JSON.stringify(preferences)); } catch (_) { /* Keep the local UI usable. */ }
    });
  }
}

function renderTopicList() {
  if (!elements.topicList || !elements.topicEmpty) return;
  if (structuralView.enabled) { renderStructuralTopics(); return; }
  const topics = sortTopics(state.topics);
  elements.topicEmpty.classList.toggle("hidden", topics.length > 0);
  let previousTrimester = Symbol('first-trimester');
  elements.topicList.innerHTML = topics.map((topic) => {
    const academic = topicAcademic(topic);
    const group = academic.trimestre !== previousTrimester
      ? `<h4 class="er-topic-trimester">${academic.trimestre ? `Trimestre ${academic.trimestre}` : "Sin trimestre"}</h4>` : "";
    previousTrimester = academic.trimestre;
    return `${group}
    <div class="er-topic-item">
      <button type="button" class="er-topic-button ${topic.id === state.activeTopicId ? "is-active" : ""}"
        data-topic-id="${escapeHtmlAttr(topic.id)}" aria-pressed="${topic.id === state.activeTopicId ? "true" : "false"}">
        <span class="er-topic-number">Tema ${topic.academicNumber}</span>
        <span class="er-topic-copy"><span class="er-topic-title" title="${escapeHtmlAttr(getTopicTitle(topic))}">${escapeHtml(getTopicTitle(topic))}</span><small class="er-topic-academic">${escapeHtml([academic.nivel, academic.grado, academic.materia].filter(Boolean).join(" · "))}</small></span>
      </button>
      <button type="button" class="er-topic-export er-studio-icon-button" data-topic-copy-answers="${escapeHtmlAttr(topic.id)}"
        data-er-tooltip="Copiar respuestas HTML" aria-label="Copiar respuestas HTML del Tema ${topic.academicNumber}" ${state.answerCopyInFlight ? "disabled" : ""}>
        <i class="fas fa-code" aria-hidden="true"></i>
      </button>
      <details class="er-topic-actions">
        <summary class="er-studio-icon-button" aria-label="Acciones de ${escapeHtmlAttr(getTopicTitle(topic))}"><i class="fas fa-ellipsis-vertical" aria-hidden="true"></i></summary>
        <div class="er-topic-actions-menu">
          <button type="button" data-topic-copy-answers="${escapeHtmlAttr(topic.id)}" ${state.answerCopyInFlight ? "disabled" : ""}>Copiar respuestas</button>
          <button type="button" data-topic-transfer="copy" data-transfer-topic-id="${escapeHtmlAttr(topic.id)}">Copiar a otra sesión</button>
          <button type="button" data-topic-transfer="move" data-transfer-topic-id="${escapeHtmlAttr(topic.id)}" ${isPublishedSession() ? "disabled" : ""}>Mover a otra sesión</button>
          <button type="button" data-delete-topic="${escapeHtmlAttr(topic.id)}" data-delete-session="${escapeHtmlAttr(state.activeSessionId)}" ${isPublishedSession() ? 'disabled' : ''}><i class="fas fa-trash" aria-hidden="true"></i> Eliminar tema</button>
        </div>
      </details>
    </div>
  `; }).join("");
  setupTopicTrimesterGroups();
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

async function writeHtmlToClipboard(html = "") {
  const markup = String(html || "").trim();
  if (!markup) throw new Error("No hay contenido HTML para copiar.");
  // Ambos formatos contienen el HTML fuente. Los editores visuales consumen
  // text/html y los campos de código (por ejemplo, Moodle) consumen text/plain.
  // Así se conservan los style="..." inline en los dos destinos.
  const plainText = markup;

  if (typeof navigator?.clipboard?.write === "function" && typeof window.ClipboardItem === "function") {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({
        "text/html": new Blob([markup], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" })
      })]);
      return;
    } catch (error) {
      console.warn("El navegador rechazó la copia enriquecida; se usará la copia compatible:", error);
    }
  }

  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.setAttribute("aria-hidden", "true");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "0";
  holder.innerHTML = markup;
  document.body.appendChild(holder);
  let wroteRichClipboardData = false;
  const handleCopy = (event) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/html", markup);
    event.clipboardData.setData("text/plain", plainText);
    wroteRichClipboardData = true;
  };
  document.addEventListener("copy", handleCopy);
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(holder);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const copied = document.execCommand("copy");
    selection?.removeAllRanges();
    if (!copied || !wroteRichClipboardData) throw new Error("El navegador no permitió copiar las respuestas con formato.");
  } finally {
    document.removeEventListener("copy", handleCopy);
    holder.remove();
  }
}

function getLatestTopicForAnswerCopy(topic = {}) {
  if (topic.id !== state.activeTopicId || !state.project) return topic;
  return {
    ...topic,
    title: state.project.titulo || topic.title,
    project: materializeProjectForExport()
  };
}

async function copyAnswerKeyToClipboard({ sessionTitle, topics, successMessage }) {
  const result = buildMoodleAnswerKeyHtml({ sessionTitle, topics });
  if (!result.questionCount) {
    setStatus("No hay preguntas generadas para copiar en esta selección.", "warning");
    return false;
  }
  await writeHtmlToClipboard(result.html);
  setStatus(`${successMessage} HTML con CSS inline listo para pegar.`, "success");
  return true;
}

async function copyTopicAnswers(topicId, sessionId = state.activeSessionId) {
  if (!topicId || state.answerCopyInFlight || state.isGenerating) return;
  state.answerCopyInFlight = true;
  renderTopicList();
  syncActionButtons();
  try {
    const localSession = sessionId === state.activeSessionId;
    const session = localSession ? state.activeSessionMeta : state.sessions.find(item => item.id === sessionId);
    const topics = localSession ? state.topics : await fetchSessionTopics(sessionId);
    const topic = topics.find(item => item.id === topicId)
      || (!localSession && topicId === 'legacy' && !topics.length && session?.project
        ? { id: 'legacy', project: session.project, title: session.title } : null);
    if (!topic) throw new Error('No se encontró el tema solicitado.');
    const latestTopic = localSession ? getLatestTopicForAnswerCopy(topic) : topic;
    const sessionTitle = session?.title || SESSION_TITLE_DEFAULT;
    await copyAnswerKeyToClipboard({
      sessionTitle,
      topics: [latestTopic],
      successMessage: `Respuestas del Tema ${latestTopic.academicNumber} copiadas.`
    });
  } catch (error) {
    console.error("No se pudieron copiar las respuestas del tema:", error);
    setStatus("No fue posible copiar las respuestas de este tema.", "bad");
  } finally {
    state.answerCopyInFlight = false;
    renderTopicList();
    syncActionButtons();
  }
}

async function copyAllTopicAnswers() {
  if (!state.activeSessionId || state.answerCopyInFlight || state.isGenerating) return;
  state.answerCopyInFlight = true;
  renderTopicList();
  syncActionButtons();
  try {
    const group = structuralView.enabled ? selectedStructuralGroup() : null;
    const pendingSave = (structuralView.enabled ? Promise.resolve() : flushPendingTopicSave())
      .catch((error) => console.warn("No se pudo guardar el tema antes de copiar la sesión:", error));
    const topics = [];
    if (structuralView.enabled) {
      const sessions = new Map();
      for (const entry of group?.topics || []) {
        if (!sessions.has(entry.sessionId)) {
          sessions.set(entry.sessionId, entry.sessionId === state.activeSessionId
            ? state.topics : await fetchSessionTopics(entry.sessionId));
        }
        const session = state.sessions.find(item => item.id === entry.sessionId);
        const sourceTopics = sessions.get(entry.sessionId);
        const topic = sourceTopics.find(item => item.id === entry.topicId)
          || (entry.topicId === 'legacy' && !sourceTopics.length && session?.project
            ? { ...entry, id: 'legacy', project: session.project } : null);
        if (!topic) throw new Error('No se encontró uno de los temas del grupo. Actualiza el índice e inténtalo de nuevo.');
        topics.push(entry.sessionId === state.activeSessionId ? getLatestTopicForAnswerCopy(topic) : topic);
      }
    } else {
      topics.push(...state.topics.map(getLatestTopicForAnswerCopy));
    }
    await copyAnswerKeyToClipboard({
      sessionTitle: group ? `${group.materia} · ${group.grado}` : state.activeSessionMeta?.title || SESSION_TITLE_DEFAULT,
      topics,
      successMessage: group ? "Respuestas de todos los temas del grupo copiadas." : "Respuestas de todos los temas copiadas."
    });
    await pendingSave;
  } catch (error) {
    console.error("No se pudieron copiar las respuestas de la sesión:", error);
    setStatus("No fue posible copiar las respuestas de esta sesión.", "bad");
  } finally {
    state.answerCopyInFlight = false;
    renderTopicList();
    syncActionButtons();
  }
}

let editorialXlsxPromise = null;
let editorialJsZipPromise = null;

function ensureEditorialXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (editorialXlsxPromise) return editorialXlsxPromise;
  editorialXlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "vendor/xlsx/xlsx.full.min.js";
    script.async = true;
    script.dataset.role = "pigpen-editorial-xlsx";
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("El lector de Excel no quedó disponible."));
    script.onerror = () => reject(new Error("No se pudo cargar el lector de Excel."));
    document.head.appendChild(script);
  });
  return editorialXlsxPromise;
}

function ensureEditorialJsZip() {
  if (window.JSZip?.loadAsync) return Promise.resolve(window.JSZip);
  if (editorialJsZipPromise) return editorialJsZipPromise;
  editorialJsZipPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "vendor/jszip/jszip.min.js";
    script.async = true;
    script.dataset.role = "pigpen-editorial-jszip";
    script.onload = () => window.JSZip?.loadAsync
      ? resolve(window.JSZip)
      : reject(new Error("El compresor moderno de Excel no quedó disponible."));
    script.onerror = () => reject(new Error("No se pudo cargar el compresor de Excel."));
    document.head.appendChild(script);
  });
  return editorialJsZipPromise;
}

function getLatestTopicsForEditorialReview(fallbackProject = null) {
  const topics = state.topics.map((topic) => getLatestTopicForAnswerCopy(topic));
  if (topics.length || !fallbackProject) return topics;
  return [{
    id: state.activeTopicId || "local-export",
    academicNumber: getCurrentAcademicNumber(fallbackProject),
    title: normalizeString(fallbackProject.titulo, "Escape Room"),
    formState: serializeFormState(),
    project: fallbackProject
  }];
}

function buildEditorialCorrectionsFileName(projectTitle = "") {
  const safeTitle = sanitizeFileNameForAssets(projectTitle || "Escape_Room", "Escape_Room")
    .replace(/-+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `Correcciones_${safeTitle || "Escape_Room"}.xlsx`;
}

function triggerFileDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadEditorialWorkbook({ flushPendingSave = true, projectTitle = "", fallbackProject = null } = {}) {
  if (!confirmRealSessionAction('Exportar revisión editorial de la sesión completa')) throw new Error('Exportación editorial cancelada.');
  if (flushPendingSave) {
    if (structuralView.enabled) await flushStructuralEdits();
    else await flushPendingTopicSave();
  }
  const XLSX = await ensureEditorialXlsx();
  const topics = getLatestTopicsForEditorialReview(fallbackProject);
  if (!topics.length) throw new Error("No hay temas disponibles para crear el archivo editorial.");
  const workbook = buildEditorialWorkbook(XLSX, {
    sessionId: state.activeSessionId,
    sessionTitle: state.activeSessionMeta?.title || SESSION_TITLE_DEFAULT,
    status: state.activeSessionMeta?.status || "draft",
    topics
  });
  const escapeRoomTitle = projectTitle || state.project?.titulo || state.activeSessionMeta?.title || "Escape Room";
  const fileName = buildEditorialCorrectionsFileName(escapeRoomTitle);
  try {
    const JSZipCtor = await ensureEditorialJsZip();
    const blob = await buildEditorialWorkbookBlob(XLSX, JSZipCtor, workbook);
    triggerFileDownload(blob, fileName);
  } catch (styleError) {
    console.warn("El archivo editorial se descargará sin estilos avanzados:", styleError);
    XLSX.writeFile(workbook, fileName, { compression: true });
  }
  return fileName;
}

function setEditorialReviewStatus(message = "", type = "") {
  if (!elements.editorialReviewStatus) return;
  elements.editorialReviewStatus.textContent = message;
  elements.editorialReviewStatus.dataset.state = type;
}

function resetEditorialImportPreview() {
  state.editorialImportDocument = null;
  state.editorialImportPreview = null;
  state.editorialImportFileName = "";
  elements.editorialReviewPreview?.classList.add("hidden");
  if (elements.editorialReviewSummary) elements.editorialReviewSummary.innerHTML = "";
  if (elements.editorialReviewIssues) elements.editorialReviewIssues.innerHTML = "";
  if (elements.editorialReviewDiff) elements.editorialReviewDiff.innerHTML = "";
  if (elements.btnApplyEditorialWorkbook) elements.btnApplyEditorialWorkbook.disabled = true;
}

function enrichEditorialPreview(preview) {
  const validationErrors = [];
  for (const topicId of preview.changedTopicIds || []) {
    const topic = preview.nextTopics.find((item) => item.id === topicId);
    if (!topic?.project) continue;
    const validation = validateProjectSetup(topic.project);
    validation.issues.forEach((issue) => validationErrors.push(`Tema ${topic.academicNumber}: ${issue}`));
    topic.project = validation.project;
  }
  return { ...preview, errors: [...new Set([...(preview.errors || []), ...validationErrors])] };
}

function renderEditorialImportPreview(preview) {
  state.editorialImportPreview = preview;
  const errors = preview.errors || [];
  const conflicts = preview.conflicts || [];
  const changes = preview.changes || [];
  elements.editorialReviewPreview?.classList.remove("hidden");
  if (elements.editorialReviewSummary) {
    elements.editorialReviewSummary.innerHTML = `
      <div><span>Cambios detectados</span><strong>${changes.length}</strong></div>
      <div><span>Temas afectados</span><strong>${preview.changedTopicIds?.length || 0}</strong></div>
      <div><span>Errores o conflictos</span><strong>${errors.length + conflicts.length}</strong></div>`;
  }
  if (elements.editorialReviewIssues) {
    elements.editorialReviewIssues.innerHTML = [
      ...errors.map((message) => `<div class="er-editorial-review-issue is-error"><strong>Error:</strong> ${escapeHtml(message)}</div>`),
      ...conflicts.map((message) => `<div class="er-editorial-review-issue"><strong>Conflicto:</strong> ${escapeHtml(message)}</div>`)
    ].join("");
  }
  if (elements.editorialReviewDiff) {
    elements.editorialReviewDiff.innerHTML = changes.length
      ? changes.map((change) => `<tr><td>${escapeHtml(change.reference)}</td><td>${escapeHtml(change.field)}</td><td>${escapeHtml(change.before)}</td><td>${escapeHtml(change.after)}</td></tr>`).join("")
      : '<tr><td colspan="4">El archivo no contiene cambios en la columna Texto.</td></tr>';
  }
  const canApply = changes.length > 0 && errors.length === 0 && conflicts.length === 0 && !isPublishedSession();
  if (elements.btnApplyEditorialWorkbook) elements.btnApplyEditorialWorkbook.disabled = !canApply;
  if (isPublishedSession() && changes.length) {
    setEditorialReviewStatus("Mueve la sesión a Borrador antes de aplicar las correcciones.", "warning");
  } else if (errors.length || conflicts.length) {
    setEditorialReviewStatus("Corrige los problemas indicados antes de continuar.", "bad");
  } else if (changes.length) {
    setEditorialReviewStatus("Archivo validado. Revisa las diferencias y confirma para guardar.", "success");
  } else {
    setEditorialReviewStatus("No se detectaron cambios en la columna Texto.", "warning");
  }
}

async function exportEditorialWorkbook() {
  if (!state.activeSessionId || state.editorialReviewInFlight) return;
  state.editorialReviewInFlight = true;
  syncActionButtons();
  setEditorialReviewStatus("Preparando la sesión completa…", "");
  try {
    const fileName = await downloadEditorialWorkbook();
    setEditorialReviewStatus(`${fileName} descargado.`, "success");
  } catch (error) {
    console.error("No se pudo exportar la revisión editorial:", error);
    setEditorialReviewStatus(error?.message || "No fue posible crear el archivo editorial.", "bad");
  } finally {
    state.editorialReviewInFlight = false;
    syncActionButtons();
  }
}

async function loadEditorialWorkbook(file) {
  if (!file || state.editorialReviewInFlight) return;
  if (!/\.xlsx$/i.test(file.name || "")) {
    setEditorialReviewStatus("Selecciona un archivo .xlsx generado por PigPen.", "bad");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setEditorialReviewStatus("El archivo excede el límite de 10 MB.", "bad");
    return;
  }
  state.editorialReviewInFlight = true;
  resetEditorialImportPreview();
  syncActionButtons();
  setEditorialReviewStatus("Leyendo y comparando el archivo…", "");
  try {
    await flushPendingTopicSave();
    const XLSX = await ensureEditorialXlsx();
    const buffer = await readFileAsArrayBuffer(file);
    const document = readEditorialWorkbook(XLSX, buffer);
    const preview = enrichEditorialPreview(previewEditorialImport(document, {
      sessionId: state.activeSessionId,
      topics: getLatestTopicsForEditorialReview()
    }));
    state.editorialImportDocument = document;
    state.editorialImportFileName = file.name;
    renderEditorialImportPreview(preview);
  } catch (error) {
    console.error("No se pudo leer el archivo editorial:", error);
    setEditorialReviewStatus(error?.message || "No fue posible leer el archivo editorial.", "bad");
  } finally {
    state.editorialReviewInFlight = false;
    syncActionButtons();
  }
}

function isSupportedEditorialDriveUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:"
      && ["docs.google.com", "drive.google.com"].includes(url.hostname)
      && (/\/(?:spreadsheets\/d|file\/d)\/[a-zA-Z0-9_-]{20,}/.test(url.pathname) || /^[a-zA-Z0-9_-]{20,}$/.test(url.searchParams.get("id") || ""));
  } catch (_) {
    return false;
  }
}

async function loadEditorialWorkbookFromDrive() {
  const driveUrl = String(elements.editorialDriveUrl?.value || "").trim();
  if (!isSupportedEditorialDriveUrl(driveUrl)) {
    setEditorialReviewStatus("Pega un enlace válido de Google Drive o Google Sheets.", "bad");
    elements.editorialDriveUrl?.focus();
    return;
  }
  if (state.editorialReviewInFlight) return;
  state.editorialReviewInFlight = true;
  resetEditorialImportPreview();
  syncActionButtons();
  setEditorialReviewStatus("Descargando el archivo desde Google Drive…", "");
  try {
    await flushPendingTopicSave();
    const response = await authFetch("/api/pigpen/editorial-workbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: driveUrl })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || payload?.error || "No se pudo descargar el archivo desde Drive.");
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > 10 * 1024 * 1024) throw new Error("El archivo de Drive está vacío o excede el límite de 10 MB.");
    const XLSX = await ensureEditorialXlsx();
    const document = readEditorialWorkbook(XLSX, buffer);
    const preview = enrichEditorialPreview(previewEditorialImport(document, {
      sessionId: state.activeSessionId,
      topics: getLatestTopicsForEditorialReview()
    }));
    state.editorialImportDocument = document;
    state.editorialImportFileName = "archivo-editorial-drive.xlsx";
    renderEditorialImportPreview(preview);
  } catch (error) {
    console.error("No se pudo importar la revisión editorial desde Drive:", error);
    setEditorialReviewStatus(error?.message || "No fue posible importar el archivo desde Drive.", "bad");
  } finally {
    state.editorialReviewInFlight = false;
    syncActionButtons();
  }
}

async function applyEditorialWorkbook() {
  if (!state.editorialImportDocument || state.editorialReviewInFlight || isPublishedSession()) return;
  if (!confirmRealSessionAction('Aplicar correcciones editoriales')) return;
  state.editorialReviewInFlight = true;
  syncActionButtons();
  if (elements.btnApplyEditorialWorkbook) elements.btnApplyEditorialWorkbook.disabled = true;
  setEditorialReviewStatus("Comprobando la versión más reciente de la sesión…", "");
  try {
    await flushPendingTopicSave();
    const latestTopics = await fetchSessionTopics(state.activeSessionId);
    const freshPreview = enrichEditorialPreview(previewEditorialImport(state.editorialImportDocument, {
      sessionId: state.activeSessionId,
      topics: latestTopics
    }));
    renderEditorialImportPreview(freshPreview);
    if (elements.btnApplyEditorialWorkbook) elements.btnApplyEditorialWorkbook.disabled = true;
    if (freshPreview.errors.length || freshPreview.conflicts.length || !freshPreview.changes.length) return;
    if (freshPreview.changedTopicIds.length > 498) throw new Error("La importación contiene demasiados temas para una sola operación segura.");

    setEditorialReviewStatus("Guardando las correcciones…", "");
    const batch = writeBatch(db);
    const changedIds = new Set(freshPreview.changedTopicIds);
    for (const topic of freshPreview.nextTopics) {
      if (!changedIds.has(topic.id)) continue;
      const topicRef = doc(db, ESCAPE_ROOM_COLLECTION, state.activeSessionId, TOPICS_SUBCOLLECTION, topic.id);
      batch.update(topicRef, await prepareRemoteDocument(topicRef, {
        project: topic.project,
        title: normalizeString(topic.project?.titulo || topic.title, "Escape room"),
        updatedAt: serverTimestamp()
      }));
    }
    const active = freshPreview.nextTopics.find((topic) => topic.id === state.activeTopicId) || freshPreview.nextTopics[0] || null;
    const sessionRef = doc(db, ESCAPE_ROOM_COLLECTION, state.activeSessionId);
    batch.update(sessionRef, await prepareRemoteDocument(sessionRef, {
      schemaVersion: SESSION_SCHEMA_VERSION,
      topicCount: freshPreview.nextTopics.length,
      topicSummaries: sortTopics(freshPreview.nextTopics).map(buildTopicSummary),
      activeTopicId: state.activeTopicId || active?.id || "",
      ...(active && changedIds.has(active.id)
        ? { project: active.project, ...getSessionAcademicMetadata(active.project) }
        : {}),
      lastEditorialImportAt: serverTimestamp(),
      lastEditorialImportFile: state.editorialImportFileName,
      lastEditorialImportChangeCount: freshPreview.changes.length,
      updatedAt: serverTimestamp()
    }));
    await batch.commit();

    const now = Date.now();
    state.topics = sortTopics(freshPreview.nextTopics.map((topic) => changedIds.has(topic.id) ? { ...topic, updatedAtMs: now } : topic));
    const activeTopic = state.topics.find((topic) => topic.id === state.activeTopicId) || state.topics[0] || null;
    if (activeTopic) await loadTopicIntoEditor(activeTopic, { updateParent: false });
    state.sessions = sortSessions(state.sessions.map((session) => session.id === state.activeSessionId
      ? { ...session, topicSummaries: state.topics.map(buildTopicSummary), topicCount: state.topics.length, project: activeTopic?.project || session.project, updatedAtMs: now }
      : session));
    renderSessionList();
    renderTopicList();
    setRemoteSaveState("saved");
    setStatus(`${freshPreview.changes.length} corrección${freshPreview.changes.length === 1 ? "" : "es"} editorial${freshPreview.changes.length === 1 ? "" : "es"} aplicada${freshPreview.changes.length === 1 ? "" : "s"}.`, "success");
    setEditorialReviewStatus("Correcciones aplicadas correctamente.", "success");
    resetEditorialImportPreview();
  } catch (error) {
    console.error("No se pudieron aplicar las correcciones editoriales:", error);
    setEditorialReviewStatus(error?.message || "No fue posible aplicar las correcciones.", "bad");
  } finally {
    state.editorialReviewInFlight = false;
    syncActionButtons();
    const retryPreview = state.editorialImportPreview;
    const canRetry = retryPreview
      && retryPreview.changes?.length > 0
      && retryPreview.errors?.length === 0
      && retryPreview.conflicts?.length === 0
      && !isPublishedSession();
    if (elements.btnApplyEditorialWorkbook) elements.btnApplyEditorialWorkbook.disabled = !canRetry;
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
  // Published content is read-only. Rebuilding the local search index is safe.
  if (state.activeSessionMeta?.status !== "published") {
    await updateDoc(doc(db, ESCAPE_ROOM_COLLECTION, sessionId), patch);
  }
  syncLocalSessionIndex(sessionId, patch);
}

function syncLocalSessionIndex(sessionId, patch) {
  state.sessions = state.sessions.map(session => session.id === sessionId ? { ...session, ...patch } : session);
  renderSessionList();
}

async function rebuildSessionTopicIndexes(sessions) {
  // Stage all reads before publishing any result to the filters.
  const rebuilt = [...sessions];
  const failures = [];
  await runWithConcurrency(sessions.map((_, index) => index), 3, async index => {
    const session = sessions[index];
    try {
      const topics = await fetchSessionTopics(session.id);
      if (topics.length) {
        rebuilt[index] = { ...session, topicCount: topics.length, topicSummaries: sortTopics(topics).map(buildTopicSummary) };
      } else if (session.topicCount > 0 || session.topicSummaries?.length) {
        // An empty read must not silently erase a previously known collection.
        failures.push(session.id);
      }
    } catch (_) {
      failures.push(session.id);
    }
  });
  return { sessions: rebuilt, failures };
}

async function retrySessionTopicIndexes() {
  if (state.sessionsLoading) return;
  const uid = state.currentUser?.uid;
  const sessions = state.sessions;
  state.sessionsLoading = true;
  renderSessionList();
  try {
    const result = await rebuildSessionTopicIndexes(sessions);
    if (state.currentUser?.uid !== uid) return;
    state.sessions = state.sessions.map(session => {
      const indexed = result.sessions.find(item => item.id === session.id);
      if (!indexed || result.failures.includes(session.id)) return session;
      const refreshed = { ...session, topicCount: indexed.topicCount, topicSummaries: indexed.topicSummaries };
      // Keep edits made in the active editor while the reads were in flight.
      if (session.id !== state.activeSessionId || !state.topics.length) return refreshed;
      return { ...refreshed, topicCount: state.topics.length, topicSummaries: sortTopics(state.topics).map(buildTopicSummary) };
    });
    state.sessionIndexFailures = result.failures;
  } finally {
    state.sessionsLoading = false;
    renderSessionList();
  }
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

async function copyTransferResources(raw, args) {
  const storage = getStorage(app);
  const bucket = storageRef(storage).bucket;
  const hashBytes = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  return copyTopicResources(raw, { bucket, copyAsset: async (url, path) => {
    args.onProgress?.("Copiando y verificando un recurso del tema…");
    let bytes, contentType;
    if (path) {
      const sourceRef = storageRef(storage, path);
      const metadata = await getMetadata(sourceRef);
      bytes = await getBytes(sourceRef, metadata.size + 1);
      contentType = metadata.contentType || "application/octet-stream";
    } else {
      const response = await fetch(url);
      bytes = await response.arrayBuffer();
      contentType = response.headers.get("content-type") || "image/png";
    }
    const hash = await hashBytes(bytes);
    const destination = storageRef(storage, `escaperooms/${args.uid}/${args.destinationId}/${args.operationId}/${hash}.bin`);
    let exists = false;
    try { await getMetadata(destination); exists = true; } catch (error) { if (error.code !== "storage/object-not-found") throw error; }
    if (!exists) await uploadBytes(destination, bytes, { contentType });
    if (await hashBytes(await getBytes(destination, bytes.byteLength + 1)) !== hash) throw new Error("La copia de un recurso no coincide con el original. No se trasladó el tema.");
    return getDownloadURL(destination);
  } });
}

function getTopicTransferService() {
  topicTransferService ||= createTopicTransferService({ db,
    sdk: { doc, collection, getDoc, getDocs, runTransaction, serverTimestamp }, copyResources: copyTransferResources });
  return topicTransferService;
}

function renderTopicTransferDestinations() {
  const select = document.getElementById("erTransferDestination");
  const search = normalizeSessionNameSearch(document.getElementById("erTransferSearch").value);
  const previous = select.value;
  const candidates = state.sessions.filter(session => session.id !== topicTransferUi?.sourceId && session.status !== "published"
    && normalizeSessionNameSearch(session.title).includes(search));
  select.innerHTML = '<option value="">Selecciona una sesión en borrador</option>' + candidates.map(session =>
    `<option value="${escapeHtmlAttr(session.id)}">${escapeHtml(session.title || SESSION_TITLE_DEFAULT)}</option>`).join("");
  select.value = candidates.some(session => session.id === previous) ? previous : "";
}

function openTopicTransfer(topicId, mode) {
  if (isGenerationBusy()) return;
  const topic = state.topics.find(item => item.id === topicId);
  if (!topic || !state.activeSessionId || (mode === "move" && isPublishedSession())) return;
  topicTransferUi = { sourceId: state.activeSessionId, topicId, mode, busy: false };
  const academic = topicAcademic(topic);
  document.getElementById("erTransferTitle").textContent = mode === "move" ? "Mover tema a otra sesión" : "Copiar tema a otra sesión";
  document.getElementById("erTransferSummary").textContent = `${getTopicTitle(topic)} · Tema ${topic.academicNumber} · ${[academic.nivel, academic.grado, academic.materia, academic.trimestre ? `Trimestre ${academic.trimestre}` : "Sin trimestre"].filter(Boolean).join(" · ")}`;
  document.getElementById("erTransferOrigin").textContent = `Origen: ${state.activeSessionMeta?.title || SESSION_TITLE_DEFAULT}. ${mode === "move" ? "Se quitará del origen solo al confirmar el traslado completo." : "El original se conservará sin cambios."}`;
  document.getElementById("erTransferSearch").value = "";
  document.getElementById("erTransferStatus").textContent = "Si coinciden tema y trimestre, se conservarán ambos escape rooms.";
  document.getElementById("erTransferOpenDestination").hidden = true;
  document.getElementById("erTransferSubmit").disabled = false;
  document.getElementById("erTransferSubmit").textContent = mode === "move" ? "Confirmar movimiento" : "Crear copia";
  renderTopicTransferDestinations();
  window.bootstrap.Modal.getOrCreateInstance(document.getElementById("erTopicTransferModal")).show();
}

async function submitTopicTransfer(event) {
  event.preventDefault();
  if (!topicTransferUi || topicTransferUi.busy) return;
  const destinationId = document.getElementById("erTransferDestination").value;
  const status = document.getElementById("erTransferStatus");
  if (!destinationId) { status.textContent = "Selecciona una sesión de destino."; return; }
  const { sourceId, topicId, mode } = topicTransferUi;
  const uid = state.currentUser?.uid;
  const journalKey = `PigPenCreator.transfer.${uid}.${sourceId}.${topicId}.${destinationId}.${mode}`;
  // Persist before starting: the same logical operation survives a lost response.
  let operationId;
  try {
    operationId = localStorage.getItem(journalKey) || crypto.randomUUID();
    localStorage.setItem(journalKey, operationId);
  } catch (_) { status.textContent = "No se puede registrar la operación en este navegador. Habilita el almacenamiento para trasladar con seguridad."; return; }
  topicTransferUi.busy = true;
  topicTransferUi.journalKey = journalKey;
  const previousSuspension = state.suspendSessionSave;
  const args = { uid, sourceId, topicId, destinationId, operationId, mode, onProgress: text => { status.textContent = text; } };
  document.getElementById("erTransferSubmit").disabled = true;
  document.getElementById("erTransferSearch").disabled = true;
  document.getElementById("erTransferDestination").disabled = true;
  if (elements.studioWorkspace) elements.studioWorkspace.inert = true;
  try {
    const service = getTopicTransferService();
    let result = await service.completed(args);
    if (!result) {
      status.textContent = "Guardando modificaciones pendientes…";
      if (!isPublishedSession()) {
        const hasPendingSave = state.sessionSaveHandle || state.sessionSaveInFlight || state.sessionSaveQueued || state.saveState === "error";
        if (hasPendingSave) {
          await flushPendingTopicSave();
          if (state.saveState === "error") throw new Error("No se guardaron las modificaciones pendientes. No se trasladó el tema.");
          // An in-flight save may predate the final edit. Save the queued edit too.
          if (state.sessionSaveQueued) {
            await persistActiveSession();
            if (state.saveState === "error") throw new Error("El guardado falló. El tema original se conserva.");
          }
        }
      }
      state.suspendSessionSave = true;
      result = await service.transfer(args);
    }
    topicTransferUi.result = result;
    state.suspendSessionSave = true;
    if (state.sessionSaveHandle) window.clearTimeout(state.sessionSaveHandle);
    state.sessionSaveHandle = null;
    state.sessionSaveQueued = false;
    // Do not flush a moved, now-deleted active topic while refreshing the editor.
    state.activeTopicId = "";
    await loadSessionsFromFirebase({ preferredSessionId: sourceId });
    status.textContent = `${mode === "move" ? "Tema movido" : "Copia creada"}. El contenido y los recursos se conservaron. Exporta nuevamente el archivo de revisión editorial en el destino.`;
    document.getElementById("erTransferOpenDestination").hidden = false;
    // Keep the completed journal until the modal closes; double clicks/retries replay it.
  } catch (error) {
    console.error("No se pudo trasladar el tema:", error);
    status.textContent = `${error.message || "No se completó el traslado."} Puedes reintentar; se verificará primero si ya se confirmó.`;
  } finally {
    state.suspendSessionSave = previousSuspension;
    topicTransferUi.busy = false;
    document.getElementById("erTransferSubmit").disabled = Boolean(topicTransferUi.result);
    document.getElementById("erTransferSearch").disabled = false;
    document.getElementById("erTransferDestination").disabled = false;
    if (elements.studioWorkspace) elements.studioWorkspace.inert = false;
    syncActionButtons();
  }
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
      document.getElementById("duracionInput").value = 24;
      document.getElementById("duracionInput").dataset.durationMode = "auto";
      document.getElementById("numMisionesInput").value = 4;
      document.getElementById("preguntasPorSalaInput").value = 4;
      document.getElementById("ritmoSelect").value = "progresivo";
      document.getElementById("dificultadSelect").value = "equilibrada";
      document.getElementById("pistasSelect").value = "moderadas";
      if (elements.objetivoModeloSelect) elements.objetivoModeloSelect.value = TEXT_MODEL_DEFAULT;
    } finally {
      state.formPersistenceSuspended = false;
    }
    syncAcademicFields();
    syncNarrativaCustomField();
    syncImageStyleCustomField();
    syncPresentationModeUi();
  }
  state.project = null;
  state.selectedMissionId = null;
  state.selectedQuestionId = null;
  state.selectedBriefingMissionId = null;
  state.expandedMissionIds.clear();
  state.activeTab = "preview";
  state.generationNote = "";
  elements.jsonPreview.textContent = "";
  elements.previewFrame?.removeAttribute("srcdoc");
  renderGeneralContentEditor();
  renderMissionEditor();
  renderOutputsNow();
}

function getSessionAcademicFilterValue(session = {}, field = "") {
  const formField = field === "trimestre"
    ? "trimestreSelect"
    : field === "materia"
      ? "materiaSelect"
      : field === "nivel"
        ? "nivelSelect"
        : field === "grado"
          ? "gradoSelect"
          : "";
  return normalizeString(
    session?.[field]
      || session?.project?.[field]
      || (formField ? session?.formState?.[formField] : ""),
    ""
  );
}

function normalizeSessionTrimesterFilter(value = "") {
  const clean = String(value || "").trim().toLowerCase();
  const match = clean.match(/[123]/);
  return match?.[0] || "";
}

function normalizeSessionThemeNumber(value = "") {
  const match = String(value || "").trim().match(/(?:tema\s*)?(\d+)/i);
  const number = Number(match?.[1] || 0);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : "";
}

function getSessionThemeFilterValues(session = {}) {
  const topicNumbers = (Array.isArray(session?.topicSummaries) ? session.topicSummaries : [])
    .map((topic) => normalizeSessionThemeNumber(topic?.academicNumber))
    .filter(Boolean);
  if (topicNumbers.length) return [...new Set(topicNumbers)];
  const fallbackCandidates = [
    session?.tema,
    session?.project?.tema,
    session?.unidad,
    session?.project?.unidad,
    session?.formState?.unidadTemaSelect
  ];
  const fallbackNumbers = fallbackCandidates.map(normalizeSessionThemeNumber).filter(Boolean);
  return [...new Set(fallbackNumbers)];
}

function syncSessionFilterSelect(select, optionsMarkup, value) {
  if (!select) return;
  const modalEmptyLabels = {
    erSessionTrimesterFilterModal: "Todos los trimestres",
    erSessionSubjectFilterModal: "Todas las materias",
    erSessionThemeFilterModal: "Todos los temas",
    erSessionNivelFilterModal: "Todos los niveles",
    erSessionGradoFilterModal: "Todos los grados"
  };
  const emptyLabel = modalEmptyLabels[select.id];
  const resolvedOptionsMarkup = emptyLabel
    ? optionsMarkup.replace(/<option value="">[^<]*<\/option>/, `<option value="">${emptyLabel}</option>`)
    : optionsMarkup;
  if (select.innerHTML !== resolvedOptionsMarkup) select.innerHTML = resolvedOptionsMarkup;
  const normalizedValue = String(value || "");
  if (select.value !== normalizedValue) select.value = normalizedValue;
}

function syncSessionLevelFilterOptions(sessions = []) {
  sessions = sessions.flatMap(session => sessionTopicCandidates(session).map(topic => topicAcademic(topic, session)));
  if (!elements.sessionLevelFilters?.length) return;
  const levelByKey = new Map();
  sessions.forEach((session) => {
    const nivel = getSessionAcademicFilterValue(session, "nivel");
    const key = normalizeString(nivel, "").toLocaleLowerCase("es");
    if (nivel && !levelByKey.has(key)) levelByKey.set(key, nivel);
  });
  const selectedLevel = normalizeString(state.sessionLevelFilter, "");
  const selectedLevelKey = selectedLevel.toLocaleLowerCase("es");
  if (selectedLevel && !levelByKey.has(selectedLevelKey)) levelByKey.set(selectedLevelKey, selectedLevel);
  const levels = [...levelByKey.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  const optionsMarkup = [
    '<option value="">Nivel</option>',
    ...levels.map((nivel) => `<option value="${escapeHtmlAttr(nivel)}">${escapeHtml(nivel)}</option>`)
  ].join("");
  elements.sessionLevelFilters.forEach((select) => {
    syncSessionFilterSelect(select, optionsMarkup, state.sessionLevelFilter);
  });
}

function syncSessionGradoFilterOptions(sessions = []) {
  sessions = sessions.flatMap(session => sessionTopicCandidates(session).map(topic => topicAcademic(topic, session)));
  if (!elements.sessionGradeFilters?.length) return;
  const gradoByKey = new Map();
  const standardGrades = ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"];
  const selectedLevel = normalizeString(state.sessionLevelFilter, "").toLocaleLowerCase("es");
  const availableStandardGrades = selectedLevel.includes("secundaria") || selectedLevel.includes("secondary") || selectedLevel.includes("junior high")
    ? standardGrades.slice(0, 3)
    : standardGrades;
  availableStandardGrades.forEach((grado) => gradoByKey.set(grado.toLocaleLowerCase("es"), grado));
  sessions.forEach((session) => {
    const grado = getSessionAcademicFilterValue(session, "grado");
    const key = normalizeString(grado, "").toLocaleLowerCase("es");
    if (grado && !gradoByKey.has(key)) gradoByKey.set(key, grado);
  });
  const selectedGrade = normalizeString(state.sessionGradoFilter, "");
  const selectedGradeKey = selectedGrade.toLocaleLowerCase("es");
  if (selectedGrade && !gradoByKey.has(selectedGradeKey)) gradoByKey.set(selectedGradeKey, selectedGrade);
  const grados = [...gradoByKey.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  const optionsMarkup = [
    '<option value="">Grado</option>',
    ...grados.map((grado) => `<option value="${escapeHtmlAttr(grado)}">${escapeHtml(grado)}</option>`)
  ].join("");
  elements.sessionGradeFilters.forEach((select) => {
    syncSessionFilterSelect(select, optionsMarkup, state.sessionGradoFilter);
  });
}

function syncSessionSubjectFilterOptions(sessions = []) {
  sessions = sessions.flatMap(session => sessionTopicCandidates(session).map(topic => topicAcademic(topic, session)));
  if (!elements.sessionSubjectFilters?.length) return;
  const subjectsByKey = new Map();
  Array.from(elements.materiaSelect?.options || []).forEach((option) => {
    const subject = normalizeString(option.value || option.textContent, "");
    const key = subject.toLocaleLowerCase("es");
    if (subject && !subjectsByKey.has(key)) subjectsByKey.set(key, subject);
  });
  sessions.forEach((session) => {
    const subject = getSessionAcademicFilterValue(session, "materia");
    const key = subject.toLocaleLowerCase("es");
    if (subject && !subjectsByKey.has(key)) subjectsByKey.set(key, subject);
  });
  const selectedSubject = normalizeString(state.sessionSubjectFilter, "");
  const selectedSubjectKey = selectedSubject.toLocaleLowerCase("es");
  if (selectedSubject && !subjectsByKey.has(selectedSubjectKey)) subjectsByKey.set(selectedSubjectKey, selectedSubject);
  const subjects = [...subjectsByKey.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  const optionsMarkup = [
    '<option value="">Materia</option>',
    ...subjects.map((subject) => `<option value="${escapeHtmlAttr(subject)}">${escapeHtml(subject)}</option>`)
  ].join("");
  elements.sessionSubjectFilters.forEach((select) => {
    syncSessionFilterSelect(select, optionsMarkup, state.sessionSubjectFilter);
  });
}

function syncSessionThemeFilterOptions(sessions = []) {
  if (!elements.sessionThemeFilters?.length) return;
  const themes = [...new Set([
    ...Array.from({ length: 15 }, (_, index) => String(index + 1)),
    ...(state.sessionThemeFilter ? [String(state.sessionThemeFilter)] : []),
    ...sessions.flatMap(getSessionThemeFilterValues)
  ])]
    .sort((a, b) => Number(a) - Number(b));
  const optionsMarkup = [
    '<option value="">Tema</option>',
    ...themes.map((theme) => `<option value="${escapeHtmlAttr(theme)}">Tema ${escapeHtml(theme)}</option>`)
  ].join("");
  elements.sessionThemeFilters.forEach((select) => {
    syncSessionFilterSelect(select, optionsMarkup, state.sessionThemeFilter);
  });
}

function getCurrentSessionTopicFilters() {
  return { theme: normalizeSessionThemeNumber(state.sessionThemeFilter), trimestre: normalizeSessionTrimesterFilter(state.sessionTrimesterFilter),
    materia: state.sessionSubjectFilter, nivel: state.sessionLevelFilter, grado: state.sessionGradoFilter };
}

function getFilteredSessions(sessions = []) {
  const name = normalizeSessionNameSearch(state.sessionNameFilter);
  const filters = getCurrentSessionTopicFilters();
  return sessions.filter(session => (!name || normalizeSessionNameSearch(session.title || SESSION_TITLE_DEFAULT).includes(name))
    && matchingSessionTopics(session, filters).length > 0);
}

function getStructuralGroups() {
  return buildStructuralGroups(state.sessions || [], getCurrentSessionTopicFilters(), structuralView.search, normalizeSheetGrade);
}

function selectedStructuralGroup(groups = getStructuralGroups()) {
  return groups.find(group => group.key === structuralView.groupKey)
    || groups.find(group => group.topics.some(topic => topic.sessionId === state.activeSessionId && topic.topicId === state.activeTopicId))
    || groups[0];
}

function syncStructuralViewControls() {
  const toggle = document.getElementById('btnStructuralView');
  const label = structuralView.enabled ? 'Volver a sesiones' : 'Vista estructural';
  toggle?.setAttribute('aria-pressed', String(structuralView.enabled));
  toggle?.setAttribute('aria-label', label);
  toggle?.setAttribute('data-er-tooltip', label);
  const heading = document.getElementById('erSessionsViewHeading');
  if (heading) heading.textContent = structuralView.enabled ? 'Materia y grado' : 'Sesiones';
  const origin = document.getElementById('erRealSessionScope');
  if (origin) {
    origin.hidden = true;
    origin.textContent = `Sesión real: ${state.activeSessionMeta?.title || 'Ninguna seleccionada'} · ${state.topics.length} temas. Publicación y revisión se aplican a este origen. Copiar todas las respuestas incluye el grupo académico visible.`;
  }
  if (elements.sessionNameFilter) elements.sessionNameFilter.placeholder = structuralView.enabled ? 'Buscar nivel, materia o escape room' : 'Buscar por nombre';
}

function renderStructuralTopics() {
  if (!elements.topicList || !elements.topicEmpty) return;
  const group = selectedStructuralGroup();
  let lastSection = '';
  const activeKey = topicReferenceKey(state.activeSessionId, state.activeTopicId);
  elements.topicEmpty.classList.toggle('hidden', Boolean(group?.topics.length));
  elements.topicList.innerHTML = (group?.topics || []).map(topic => {
    const section = topic.trimestre ? `Trimestre ${topic.trimestre}` : 'Sin trimestre';
    const header = section !== lastSection ? `<h4 class="er-topic-trimester">${escapeHtml(section)}</h4>` : '';
    lastSection = section;
    return `${header}<div class="er-topic-item er-structural-topic"><button type="button" class="er-topic-button ${topic.referenceKey === activeKey ? 'is-active' : ''}"
      data-structural-session="${escapeHtmlAttr(topic.sessionId)}" data-structural-topic="${escapeHtmlAttr(topic.topicId)}" aria-pressed="${topic.referenceKey === activeKey}">
      <span class="er-topic-number">Tema ${escapeHtml(topic.academicNumber)}</span><span class="er-topic-copy"><span class="er-topic-title" title="${escapeHtmlAttr(topic.title)}">${escapeHtml(topic.title)}</span>
      <small class="er-topic-academic">Origen: ${escapeHtml(topic.sessionTitle)}</small></span></button>
      <details class="er-topic-actions"><summary class="er-studio-icon-button" aria-label="Acciones de ${escapeHtmlAttr(topic.title)}"><i class="fas fa-ellipsis-vertical" aria-hidden="true"></i></summary>
      <div class="er-topic-actions-menu"><button type="button" data-topic-copy-answers="${escapeHtmlAttr(topic.topicId)}" data-copy-session-id="${escapeHtmlAttr(topic.sessionId)}" ${state.answerCopyInFlight ? 'disabled' : ''}>Copiar respuestas</button>
      <button type="button" data-structural-transfer="copy" data-structural-session="${escapeHtmlAttr(topic.sessionId)}" data-structural-topic="${escapeHtmlAttr(topic.topicId)}">Copiar a otra sesión</button>
      <button type="button" data-structural-transfer="move" data-structural-session="${escapeHtmlAttr(topic.sessionId)}" data-structural-topic="${escapeHtmlAttr(topic.topicId)}" ${state.sessions.find(session => session.id === topic.sessionId)?.status === 'published' ? 'disabled' : ''}>Mover a otra sesión</button>
      <button type="button" data-delete-topic="${escapeHtmlAttr(topic.topicId)}" data-delete-session="${escapeHtmlAttr(topic.sessionId)}" ${state.sessions.find(session => session.id === topic.sessionId)?.status === 'published' ? 'disabled' : ''}><i class="fas fa-trash" aria-hidden="true"></i> Eliminar tema</button></div></details></div>`;
  }).join('');
  setupTopicTrimesterGroups();
}

function renderStructuralPanels() {
  const groups = getStructuralGroups();
  const selected = selectedStructuralGroup(groups);
  elements.sessionsLoading.classList.toggle('hidden', !state.sessionsLoading);
  elements.sessionsEmpty.classList.toggle('hidden', state.sessionsLoading || Boolean(state.sessions.length));
  elements.sessionsFilteredEmpty?.classList.toggle('hidden', state.sessionsLoading || Boolean(groups.length) || !state.sessions.length);
  elements.sessionList.classList.toggle('hidden', state.sessionsLoading || !groups.length);
  elements.sessionFilters?.classList.toggle('hidden', !state.sessions.length);
  if (elements.sessionNameFilter) elements.sessionNameFilter.value = structuralView.search;
  if (elements.sessionsCount) { elements.sessionsCount.textContent = state.sessionsLoading ? '…' : String(groups.length); elements.sessionsCount.setAttribute('aria-label', `${groups.length} grupos académicos`); }
  elements.sessionList.innerHTML = state.sessionsLoading ? '' : groups.map(group => `<article class="er-session-item ${group.key === selected?.key ? 'is-active' : ''}">
    <button type="button" class="er-session-title-button" data-structural-group="${escapeHtmlAttr(group.key)}" aria-pressed="${group.key === selected?.key}">
    <span class="er-session-title-text">${escapeHtml(`${group.materia} · ${group.grado}`)}</span><small class="er-session-item-meta">${group.topics.length} escape rooms</small></button></article>`).join('');
  renderStructuralTopics();
}

function readStructuralViewPreference() {
  try {
    return window.localStorage.getItem('PigPenCreator.structuralView.v1') === 'true';
  } catch (_) {
    return false;
  }
}

function toggleStructuralView() {
  if (isGenerationBusy() || structuralView.navigationBusy) return;
  structuralView.enabled = !structuralView.enabled;
  try {
    window.localStorage.setItem('PigPenCreator.structuralView.v1', String(structuralView.enabled));
  } catch (_) { /* Keep switching views when browser storage is unavailable. */ }
  structuralView.groupKey = '';
  structuralView.returnSessionId = structuralView.enabled ? '' : state.activeSessionId;
  state.sessionMenuId = null;
  renderSessionList();
  renderTopicList();
}

async function flushStructuralEdits() {
  if (isPublishedSession()) return;
  if (!state.sessionSaveHandle && !state.sessionSaveInFlight && !state.sessionSaveQueued && state.saveState !== 'error') return;
  await flushPendingTopicSave();
  if (state.saveState === 'error') throw new Error('No se guardaron tus cambios. Se conserva el escape room abierto.');
  if (state.sessionSaveQueued) {
    await persistActiveSession();
    if (state.saveState === 'error') throw new Error('No se guardaron tus últimos cambios. No se cambió de escape room.');
    state.sessionSaveQueued = false;
  }
}

async function openStructuralTopic(sessionId, topicId) {
  if (isGenerationBusy() || structuralView.navigationBusy) return false;
  const session = state.sessions.find(item => item.id === sessionId);
  if (!session) return false;
  structuralView.navigationBusy = true;
  const wasInert = elements.studioWorkspace?.inert;
  if (elements.studioWorkspace) elements.studioWorkspace.inert = true;
  syncActionButtons();
  try {
    if (state.activeSessionId !== sessionId || state.activeTopicId !== topicId) {
      await loadSessionIntoEditor(session, { topicId, readOnlyNavigation: true });
    }
    setInspectorTab('topics');
    renderSessionList();
    return true;
  } catch (error) {
    setStatus(error.message || 'No se pudo abrir el tema de origen.', 'bad');
    return false;
  } finally {
    structuralView.navigationBusy = false;
    if (elements.studioWorkspace) elements.studioWorkspace.inert = Boolean(wasInert);
    syncActionButtons();
  }
}

async function selectStructuralGroup(key) {
  if (structuralView.navigationBusy || isGenerationBusy()) return;
  const group = getStructuralGroups().find(item => item.key === key);
  if (!group) return;
  const target = group.topics.find(topic => topic.sessionId === state.activeSessionId && topic.topicId === state.activeTopicId) || group.topics[0];
  if (target && await openStructuralTopic(target.sessionId, target.topicId)) {
    structuralView.groupKey = key;
    renderSessionList();
  }
}

function confirmRealSessionAction(action) {
  if (!structuralView.enabled) return true;
  return window.confirm(`${action}\nSesión real: ${state.activeSessionMeta?.title || SESSION_TITLE_DEFAULT}\n${state.topics.length} temas. Puede incluir temas fuera del grupo académico visible. No se aplicará a otras sesiones.\n¿Continuar?`);
}

function normalizeSessionNameSearch(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

function syncSessionFiltersModalTheme() {
  if (!elements.sessionFiltersModal) return;
  const formData = getFormData();
  const palette = resolveRoomColorPalette({ index: 0, formData });
  const levelColor = normalizeHexColor(palette.levelColor, MISSION_LEVEL_COLORS[1]);
  const themeColor = normalizeHexColor(palette.themeColor, THEME_COMBINE_COLORS[1]);
  elements.sessionFiltersModal.style.setProperty("--room-level-color", levelColor);
  elements.sessionFiltersModal.style.setProperty("--room-theme-color", themeColor);
  elements.sessionFiltersModal.style.setProperty("--room-level-color-soft", `color-mix(in srgb, ${levelColor} 18%, transparent)`);
  elements.sessionFiltersModal.style.setProperty("--room-theme-color-soft", `color-mix(in srgb, ${themeColor} 18%, transparent)`);
  elements.sessionFiltersModal.style.setProperty("--er-studio-accent", themeColor);
  elements.sessionFiltersModal.style.setProperty("--er-studio-accent-soft", `color-mix(in srgb, ${themeColor} 12%, transparent)`);
}

function normalizeSessionFilterState(raw = {}) {
  return {
    // Conservar los espacios mientras el usuario escribe. La limpieza se aplica
    // únicamente en normalizeSessionNameSearch al comparar contra los nombres.
    sessionNameFilter: String(raw?.sessionNameFilter || ""),
    sessionTrimesterFilter: normalizeSessionTrimesterFilter(raw?.sessionTrimesterFilter),
    sessionSubjectFilter: String(raw?.sessionSubjectFilter || "").trim(),
    sessionThemeFilter: String(raw?.sessionThemeFilter || "").trim(),
    sessionLevelFilter: String(raw?.sessionLevelFilter || "").trim(),
    sessionGradoFilter: String(raw?.sessionGradoFilter || "").trim()
  };
}

function persistSessionFilters() {
  if (!isLocalStorageAvailable()) return;
  try {
    const payload = normalizeSessionFilterState({
      sessionNameFilter: state.sessionNameFilter,
      sessionTrimesterFilter: state.sessionTrimesterFilter,
      sessionSubjectFilter: state.sessionSubjectFilter,
      sessionThemeFilter: state.sessionThemeFilter,
      sessionLevelFilter: state.sessionLevelFilter,
      sessionGradoFilter: state.sessionGradoFilter
    });
    window.localStorage.setItem(SESSION_FILTERS_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    const isQuota = error?.name === "QuotaExceededError" || String(error?.message || "").toLowerCase().includes("quota");
    if (!isQuota) {
      console.warn("No se pudo guardar los filtros de sesiones:", error);
    }
  }
}

function restoreSessionFiltersFromStorage() {
  if (!isLocalStorageAvailable()) return;
  const raw = window.localStorage.getItem(SESSION_FILTERS_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return;
    const normalized = normalizeSessionFilterState(parsed);
    state.sessionNameFilter = normalized.sessionNameFilter;
    state.sessionTrimesterFilter = normalizeSessionTrimesterFilter(normalized.sessionTrimesterFilter);
    state.sessionSubjectFilter = normalized.sessionSubjectFilter;
    state.sessionThemeFilter = normalized.sessionThemeFilter;
    state.sessionLevelFilter = normalized.sessionLevelFilter;
    state.sessionGradoFilter = normalized.sessionGradoFilter;
  } catch (error) {
    console.warn("No se pudieron restaurar los filtros de sesiones:", error);
  }
}

function setSessionFilters(nextState = {}, { persist = true } = {}) {
  const normalized = normalizeSessionFilterState(nextState);
  if (!structuralView.enabled) state.sessionNameFilter = normalized.sessionNameFilter;
  structuralView.returnSessionId = '';
  state.sessionTrimesterFilter = normalized.sessionTrimesterFilter;
  state.sessionSubjectFilter = normalized.sessionSubjectFilter;
  state.sessionThemeFilter = normalized.sessionThemeFilter;
  state.sessionLevelFilter = normalized.sessionLevelFilter;
  state.sessionGradoFilter = normalized.sessionGradoFilter;
  if (persist) persistSessionFilters();
  renderSessionList();
}

function resetSessionFilters() {
  if (structuralView.enabled) structuralView.search = '';
  setSessionFilters({
    sessionNameFilter: "",
    sessionTrimesterFilter: "",
    sessionSubjectFilter: "",
    sessionThemeFilter: "",
    sessionLevelFilter: "",
    sessionGradoFilter: ""
  }, { persist: true });
}

function renderSessionList() {
  if (!elements.sessionList || !elements.sessionsLoading || !elements.sessionsEmpty) return;
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  elements.sessionIndexWarning?.classList.toggle("hidden", !state.sessionIndexFailures.length);
  if (elements.btnRetrySessionIndex) elements.btnRetrySessionIndex.disabled = state.sessionsLoading;
  if (!state.sessionsLoading) {
    syncSessionSubjectFilterOptions(sessions);
    syncSessionThemeFilterOptions(sessions);
    syncSessionLevelFilterOptions(sessions);
    syncSessionGradoFilterOptions(sessions);
  }
  syncStructuralViewControls();
  if (structuralView.enabled) { renderStructuralPanels(); return; }
  const filteredSessions = getFilteredSessions(sessions);
  const returnSession = sessions.find(session => session.id === structuralView.returnSessionId);
  if (returnSession && !filteredSessions.some(session => session.id === returnSession.id)) filteredSessions.unshift(returnSession);
  const hasSessions = sessions.length > 0;
  const hasFilteredSessions = filteredSessions.length > 0;
  if (elements.sessionsCount) {
    elements.sessionsCount.textContent = state.sessionsLoading
      ? "…"
      : (filteredSessions.length === sessions.length
        ? String(sessions.length)
        : `${filteredSessions.length}/${sessions.length}`);
    elements.sessionsCount.setAttribute(
      "aria-label",
      state.sessionsLoading
        ? "Cargando sesiones"
        : `${filteredSessions.length} de ${sessions.length} sesiones visibles`
    );
  }
  elements.sessionsLoading.classList.toggle("hidden", !state.sessionsLoading);
  elements.sessionsEmpty.classList.toggle("hidden", state.sessionsLoading || hasSessions);
  elements.sessionsFilteredEmpty?.classList.toggle("hidden", state.sessionsLoading || !hasSessions || hasFilteredSessions);
  elements.sessionFilters?.classList.toggle("hidden", state.sessionsLoading || !hasSessions);
  if (elements.sessionNameFilter && elements.sessionNameFilter.value !== state.sessionNameFilter) {
    elements.sessionNameFilter.value = state.sessionNameFilter;
  }
  elements.sessionTrimesterFilters?.forEach((select) => {
    if (!select) return;
    select.value = normalizeSessionTrimesterFilter(state.sessionTrimesterFilter);
  });
  elements.sessionList.classList.toggle("hidden", state.sessionsLoading || !hasFilteredSessions);
  if (state.sessionsLoading || !hasFilteredSessions) {
    elements.sessionList.innerHTML = "";
    return;
  }
  if (state.sessionMenuId && !filteredSessions.some((session) => session.id === state.sessionMenuId)) {
    state.sessionMenuId = null;
  }
  elements.sessionList.innerHTML = filteredSessions.map((session) => {
    const academics = sessionTopicCandidates(session).map(topic => topicAcademic(topic, session));
    const uniqueValues = field => [...new Set(academics.map(topic => topic[field]).filter(Boolean))];
    const trimester = uniqueValues("trimestre").sort().join(", ");
    const subjects = uniqueValues("materia");
    const subject = subjects.length > 1 ? "Varias materias" : subjects[0];
    const mixed = uniqueValues("nivel").length > 1 || uniqueValues("grado").length > 1;
    const themes = getSessionThemeFilterValues(session).sort((a, b) => Number(a) - Number(b));
    const metadata = [
      trimester ? `T${trimester}` : "",
      subject,
      mixed ? "Varios niveles/grados" : "",
      themes.length ? `${themes.length === 1 ? "Tema" : "Temas"} ${themes.join(", ")}` : ""
    ].filter(Boolean).join(" · ");
    return `
    <article class="er-session-item ${session.id === state.activeSessionId ? "is-active" : ""}" data-session-id="${escapeHtmlAttr(session.id)}">
      <button type="button" class="er-session-title-button" data-session-action="open" data-session-id="${escapeHtmlAttr(session.id)}" title="${escapeHtmlAttr(session.title || SESSION_TITLE_DEFAULT)}">
        <span class="er-session-title-text">${escapeHtml(session.title || SESSION_TITLE_DEFAULT)}</span>
        ${metadata ? `<small class="er-session-item-meta">${escapeHtml(metadata)}</small>` : ""}
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
  `;
  }).join("");
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

async function loadSessionIntoEditor(session, { topicId = '', readOnlyNavigation = structuralView.enabled } = {}) {
  closeSessionMenu();
  if (readOnlyNavigation && state.activeSessionId && !state.isHydratingFromRemote) await flushStructuralEdits();
  if (!readOnlyNavigation && state.activeSessionId && state.activeSessionId !== session.id && !state.isHydratingFromRemote) {
    await flushPendingTopicSave();
  }
  // Fetch before replacing the current editor identity: a read failure must not
  // leave the old project associated with another session's save path.
  const fetchedTopics = await fetchSessionTopics(session.id);
  if (topicId && !fetchedTopics.some(topic => topic.id === topicId)
    && !(topicId === 'legacy' && !fetchedTopics.length && (session.project || Object.keys(session.formState || {}).length))) throw new Error('El escape room ya no está en esa sesión. Actualiza el índice de temas.');
  state.isHydratingFromRemote = true;
  try {
    state.activeSessionId = session.id;
    state.activeTopicId = "";
    state.legacyTopicPending = false;
    state.topics = [];
    state.activeSessionMeta = {
      id: session.id,
      title: session.title || SESSION_TITLE_DEFAULT,
      status: session.status || "draft"
    };
    setActiveSessionStorage(session.id);
    state.topicsLoading = true;
    state.topics = fetchedTopics;
    if (!state.topics.length && (session.project || Object.keys(session.formState || {}).length)) {
      state.topics = session.status === "published" || readOnlyNavigation
        ? [{ id: "legacy", ...buildTopicPayload({ academicNumber: getCurrentAcademicNumber(session.project, session.formState), project: session.project, formState: session.formState, title: session.title }) }]
        : [await migrateLegacySessionTopic(session)];
      state.legacyTopicPending = state.topics[0]?.id === 'legacy';
    }
    state.topicsLoading = false;
    syncLocalSessionIndex(session.id, {
      topicCount: state.topics.length,
      topicSummaries: sortTopics(state.topics).map(buildTopicSummary)
    });
    const filters = getCurrentSessionTopicFilters();
    const matchingTopics = state.topics.filter(topic => topicMatchesFilters(topic, filters, session));
    if (Object.values(filters).some(Boolean) && !matchingTopics.length) {
      setStatus("Esta sesión ya no contiene un tema que cumpla todos los filtros. Se actualizó el índice de temas.", "warning");
    }
    if (topicId && !state.topics.some(topic => topic.id === topicId)) throw new Error("El escape room ya no está en esa sesión. Actualiza el índice de temas.");
    const activeTopic = state.topics.find(topic => topic.id === topicId) || matchingTopics.find(topic => topic.id === session.activeTopicId) || matchingTopics[0]
      || state.topics.find((topic) => topic.id === session.activeTopicId)
      || state.topics[0]
      || null;
    if (activeTopic) {
      await loadTopicIntoEditor(activeTopic, { updateParent: !readOnlyNavigation });
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
    state.selectedBriefingMissionId = null;
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
  if (!topicId || topicId === state.activeTopicId || isGenerationBusy()) return;
  const topic = state.topics.find((item) => item.id === topicId);
  if (!topic) return;
  if (structuralView.enabled) await flushStructuralEdits();
  else await flushPendingTopicSave();
  await loadTopicIntoEditor(topic, { updateParent: !structuralView.enabled });
  setStatus(`Tema ${topic.academicNumber} abierto.`, "success");
}

function getNewTopicModal() {
  if (!elements.newTopicModal || !window.bootstrap?.Modal) return null;
  newTopicModalInstance ||= window.bootstrap.Modal.getOrCreateInstance(elements.newTopicModal);
  return newTopicModalInstance;
}

function buildInheritedTopicFormState(academicNumber) {
  const inherited = serializeFormState();
  inherited.__experienceConfig = readQuestionPreferences(inherited.__experienceConfig);
  inherited.unidadTemaSelect = String(academicNumber);
  inherited.temaInput = "";
  inherited.objetivoInput = "";
  return inherited;
}

function buildInheritedSessionFormState() {
  const inherited = {
    ...serializeFormState(),
    ...(window.PigPenSheetsImport?.getLastFormState?.() || {})
  };
  inherited.__experienceConfig = readQuestionPreferences();
  inherited.__experienceConfirmationRequired = false;
  inherited.temaInput = "";
  inherited.objetivoInput = "";
  return inherited;
}

function getNewTopicAcademicLabel() {
  return String(elements.materiaSelect?.value || "").trim() === "Inglés" ? "Chapter" : "Tema";
}

function syncNewTopicNumberOptions() {
  const select = elements.newTopicNumber;
  if (!select) return;

  const academicLabel = getNewTopicAcademicLabel();
  const itemLabel = academicLabel === "Chapter" ? "chapter" : "tema";
  const usedNumbers = new Set(state.topics.map((topic) => Number(topic.academicNumber)));
  const sourceNumbers = Array.from(elements.unidadTemaSelect?.options || [])
    .map((option) => Number.parseInt(option.value, 10))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  const availableNumbers = sourceNumbers.length ? [...new Set(sourceNumbers)] : Array.from({ length: 9 }, (_, index) => index + 1);

  if (elements.newTopicNumberLabel) elements.newTopicNumberLabel.textContent = academicLabel;
  const modalTitle = document.getElementById("erNewTopicModalTitle");
  if (modalTitle) modalTitle.textContent = `Crear ${itemLabel}`;
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = `Selecciona ${academicLabel === "Chapter" ? "un chapter" : "un tema"}`;
  select.append(placeholder);

  availableNumbers.forEach((academicNumber) => {
    const option = document.createElement("option");
    const alreadyExists = usedNumbers.has(academicNumber);
    option.value = String(academicNumber);
    option.textContent = `${academicLabel} ${academicNumber}${alreadyExists ? " · Ya creado" : ""}`;
    option.disabled = false;
    select.append(option);
  });

  select.value = "";
  const createButton = document.getElementById("erCreateTopicButton");
  if (createButton) {
    const buttonLabel = createButton.querySelector("span");
    if (buttonLabel) buttonLabel.textContent = `Crear ${itemLabel}`;
    createButton.disabled = availableNumbers.length === 0;
  }
}

async function createBlankSession({ announce = true } = {}) {
  try {
    setRemoteSaveState("saving");
    const inheritedFormState = buildInheritedSessionFormState();
    const sessionId = await createRemoteSession({
      title: SESSION_TITLE_DEFAULT,
      project: null,
      formState: inheritedFormState,
      activate: true
    });
    if (announce) setStatus("Nueva sesión vacía creada.", "success");
    setRemoteSaveState("saved");
    return sessionId;
  } catch (error) {
    console.error("No se pudo crear la sesión:", error);
    setRemoteSaveState("error", "Error al crear");
    setStatus("No fue posible crear la sesión.", "bad");
    throw error;
  }
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
  syncNewTopicNumberOptions();
  getNewTopicModal()?.show();
  window.setTimeout(() => elements.newTopicNumber?.focus(), 160);
}

async function createNewTopicFromDialog(event) {
  event.preventDefault();
  const raw = String(elements.newTopicNumber?.value || "").trim();
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    const academicLabel = getNewTopicAcademicLabel();
    if (elements.newTopicError) elements.newTopicError.textContent = `Selecciona ${academicLabel === "Chapter" ? "un chapter" : "un tema"}.`;
    elements.newTopicNumber?.focus();
    return;
  }
  const academicNumber = Number(raw);
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
    const uid = state.currentUser.uid;
    const remoteSessions = await fetchRemoteSessions(uid);
    const indexed = await rebuildSessionTopicIndexes(remoteSessions);
    if (state.currentUser?.uid !== uid) return;
    state.sessions = indexed.sessions;
    state.sessionIndexFailures = indexed.failures;
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

const cloudAssetUploads = new Map();
const pendingAssetMemory = new Map();

class AssetUploadPendingError extends Error {
  constructor(path, directError = null, fallbackError = null) {
    const directMessage = normalizeString(directError?.message, "Firebase Storage no devolvió una URL HTTPS");
    const fallbackMessage = normalizeString(fallbackError?.message, "el respaldo del servidor no devolvió una URL HTTPS");
    const directCode = normalizeString(directError?.code, "storage_unknown");
    const fallbackCode = normalizeString(fallbackError?.code || fallbackError?.status, "fallback_unknown");
    super(`Imagen pendiente de guardar (${path}). Storage [${directCode}]: ${directMessage}. Respaldo [${fallbackCode}]: ${fallbackMessage}.`);
    this.name = "AssetUploadPendingError";
    this.code = "asset_upload_pending";
    this.path = path;
    this.directCode = directCode;
    this.fallbackCode = fallbackCode;
    this.directError = directError;
    this.fallbackError = fallbackError;
  }
}

function openPendingAssetDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(PENDING_ASSET_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PENDING_ASSET_STORE_NAME)) {
        request.result.createObjectStore(PENDING_ASSET_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function writePendingAsset(record) {
  pendingAssetMemory.set(record.id, record);
  const database = await openPendingAssetDatabase();
  if (!database) return;
  await new Promise((resolve) => {
    const transaction = database.transaction(PENDING_ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(PENDING_ASSET_STORE_NAME).put(record);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
  database.close();
}

async function readPendingAssets() {
  const database = await openPendingAssetDatabase();
  if (!database) return [...pendingAssetMemory.values()];
  const records = await new Promise((resolve) => {
    const request = database.transaction(PENDING_ASSET_STORE_NAME, "readonly")
      .objectStore(PENDING_ASSET_STORE_NAME).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => resolve([]);
  });
  database.close();
  records.forEach((record) => pendingAssetMemory.set(record.id, record));
  return records;
}

async function removePendingAsset(id) {
  pendingAssetMemory.delete(id);
  const database = await openPendingAssetDatabase();
  if (!database) return;
  await new Promise((resolve) => {
    const transaction = database.transaction(PENDING_ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(PENDING_ASSET_STORE_NAME).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
  database.close();
}

function replaceEmbeddedAsset(root, originalValue, remoteUrl, visited = new WeakSet()) {
  if (!root || typeof root !== "object" || visited.has(root)) return 0;
  visited.add(root);
  let replacements = 0;
  Object.keys(root).forEach((key) => {
    if (root[key] === originalValue) {
      root[key] = remoteUrl;
      replacements += 1;
    } else if (root[key] && typeof root[key] === "object") {
      replacements += replaceEmbeddedAsset(root[key], originalValue, remoteUrl, visited);
    }
  });
  return replacements;
}

function schedulePendingAssetRetry(delayMs = null) {
  if (!state.currentUser?.uid || state.pendingAssetRetryHandle) return;
  const retryDelays = [5_000, 15_000, 30_000, 60_000, 120_000];
  if (delayMs === null && state.pendingAssetRetryAttempt >= retryDelays.length) return;
  const nextDelay = delayMs ?? retryDelays[Math.min(state.pendingAssetRetryAttempt, retryDelays.length - 1)];
  state.pendingAssetRetryHandle = window.setTimeout(() => {
    state.pendingAssetRetryHandle = null;
    void retryPendingAssetUploads();
  }, Math.max(250, Number(nextDelay) || 5_000));
}

function showPendingAssetStatus(error = null) {
  setRemoteSaveState("error", "Imagen pendiente");
  setStatus(
    "Hay una imagen pendiente de guardar. El contenido permanece en el editor.",
    "warning",
    { actionLabel: "Reintentar guardado", onAction: () => void retryPendingAssetUploads({ manual: true }) }
  );
  if (error) console.warn("[PigPenCreator] Recurso pendiente", {
    code: error.code,
    path: error.path,
    directCode: error.directCode,
    fallbackCode: error.fallbackCode,
    message: error.message
  });
  schedulePendingAssetRetry();
}

async function queuePendingAsset(value, path, error) {
  const uid = state.currentUser?.uid || "";
  const existing = (await readPendingAssets()).find((record) => record.uid === uid && record.value === value);
  const id = existing?.id || `${uid}:${path}`;
  await writePendingAsset({
    id,
    uid,
    path: existing?.path || path,
    value,
    mimeType: parseDataUrl(value)?.contentType || "application/octet-stream",
    attempts: Number(existing?.attempts || pendingAssetMemory.get(id)?.attempts || 0) + 1,
    lastError: normalizeString(error?.message, "No se obtuvo una URL HTTPS"),
    directCode: normalizeString(error?.directCode, ""),
    fallbackCode: normalizeString(error?.fallbackCode, ""),
    updatedAt: Date.now()
  });
}

async function retryPendingAssetUploads({ manual = false } = {}) {
  if (!state.currentUser?.uid) return { completed: 0, pending: 0 };
  if (manual) state.pendingAssetRetryAttempt = 0;
  if (state.pendingAssetRetryHandle) {
    window.clearTimeout(state.pendingAssetRetryHandle);
    state.pendingAssetRetryHandle = null;
  }
  const records = (await readPendingAssets()).filter((record) => record.uid === state.currentUser.uid);
  if (!records.length) return { completed: 0, pending: 0 };
  if (manual) setStatus("Reintentando el guardado de imágenes…", "info");
  let completed = 0;
  for (const record of records) {
    try {
      const url = await uploadImageDataUrlToRemote(record.value, record.path);
      replaceEmbeddedAsset(state.project, record.value, url);
      replaceEmbeddedAsset(state.objectiveBlueprint, record.value, url);
      await removePendingAsset(record.id);
      completed += 1;
    } catch (error) {
      await queuePendingAsset(record.value, record.path, error);
    }
  }
  const remaining = (await readPendingAssets()).filter((record) => record.uid === state.currentUser.uid).length;
  if (remaining) {
    state.pendingAssetRetryAttempt += 1;
    showPendingAssetStatus();
  } else {
    state.pendingAssetRetryAttempt = 0;
    setStatus(completed ? "Las imágenes pendientes se guardaron correctamente." : "", completed ? "success" : "info");
    renderMissionEditor();
    renderOutputsNow();
    scheduleSessionSave();
  }
  return { completed, pending: remaining };
}

async function prepareRemoteDocument(ref, payload) {
  if (!ref.path.startsWith(`${ESCAPE_ROOM_COLLECTION}/`) || (!payload.project && !payload.formState)) return payload;
  const sessionId = ref.path.split("/")[1];
  return prepareEscapeRoomCloudPayload(payload, async (value) => {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const uid = state.currentUser?.uid;
    if (!uid) throw new Error("Inicia sesión para guardar los recursos del escape room.");
    const path = `escaperooms/${uid}/${sessionId}/assets/${hash}.bin`;
    if (!cloudAssetUploads.has(path)) {
      const pending = uploadImageIfDataUrl(value, path).then((url) => {
        if (!/^https:\/\//i.test(url || "")) throw new Error("El almacenamiento no devolvió una URL para el recurso. El contenido sigue en el editor; vuelve a guardar cuando se restablezca la conexión.");
        return url;
      }).catch((error) => {
        cloudAssetUploads.delete(path);
        throw error;
      });
      if (cloudAssetUploads.size >= 128) cloudAssetUploads.delete(cloudAssetUploads.keys().next().value);
      cloudAssetUploads.set(path, pending);
    }
    return cloudAssetUploads.get(path);
  });
}

async function setDoc(ref, payload, ...options) {
  return firestoreSetDoc(ref, await prepareRemoteDocument(ref, payload), ...options);
}

async function updateDoc(ref, payload) {
  return firestoreUpdateDoc(ref, await prepareRemoteDocument(ref, payload));
}

async function addDoc(ref, payload) {
  if (ref.path !== ESCAPE_ROOM_COLLECTION && !ref.path.startsWith(`${ESCAPE_ROOM_COLLECTION}/`)) return firestoreAddDoc(ref, payload);
  // Allocate the ID before uploading, without first writing an oversized document.
  const target = doc(ref);
  await setDoc(target, payload);
  return target;
}

async function uploadImageIfDataUrl(value, path) {
  if (!isDataUrl(value)) return value;
  if (!state.currentUser?.uid) throw new Error("Inicia sesión para guardar los recursos del escape room.");
  try {
    const url = await uploadImageDataUrlToRemote(value, path);
    await removePendingAsset(`${state.currentUser.uid}:${path}`);
    return url;
  } catch (error) {
    const pendingError = error instanceof AssetUploadPendingError
      ? error
      : new AssetUploadPendingError(String(path || "recurso"), error, null);
    await queuePendingAsset(value, String(path || "recurso"), pendingError);
    showPendingAssetStatus(pendingError);
    throw pendingError;
  }
}

async function uploadImageDataUrlToRemote(value, path) {
  const pathHint = String(path || "");
  const isLocalOrigin = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (isLocalOrigin) {
    try {
      const url = await uploadImageToBackendForFallback(value, pathHint, "replacement");
      if (/^https:\/\//i.test(url || "")) return url;
      throw new Error("El respaldo local no devolvió downloadUrl.");
    } catch (error) {
      throw new AssetUploadPendingError(pathHint, new Error("Firebase Storage no se usa en origen local"), error);
    }
  }
  let directError = null;
  try {
    const storageInstance = getStorage(app);
    const refInstance = storageRef(storageInstance, path);
    const parseResult = parseDataUrl(value);
    const contentType = parseResult?.contentType || "image/png";
    await uploadString(refInstance, value, "data_url", { contentType });
    const url = await getDownloadURL(refInstance);
    if (/^https:\/\//i.test(url || "")) return url;
    throw new Error("Firebase Storage no devolvió una URL HTTPS.");
  } catch (error) {
    directError = error;
    let fallbackError = null;
    try {
      const uploadedUrl = await uploadImageToBackendForFallback(value, pathHint, "replacement");
      if (/^https:\/\//i.test(uploadedUrl || "")) return uploadedUrl;
      fallbackError = new Error("El respaldo del servidor no devolvió downloadUrl.");
    } catch (errorFromFallback) {
      fallbackError = errorFromFallback;
    }
    throw new AssetUploadPendingError(pathHint, directError, fallbackError);
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

function normalizeBackendStorageOwner(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function toBackendStoragePath(path, uid) {
  const safePath = String(path || "").trim().replace(/^\/+/, "");
  const safeUid = String(uid || "").trim();
  const backendOwner = normalizeBackendStorageOwner(safeUid);
  if (!safePath || !safeUid || !backendOwner || safePath.includes("..")) return "";
  const backendRoot = "unidadesGeneradasAssets/";
  if (safePath.startsWith(backendRoot)) {
    const remainder = safePath.slice(backendRoot.length);
    const separatorIndex = remainder.indexOf("/");
    if (separatorIndex < 0 || !remainder.slice(separatorIndex + 1)) return "";
    return `${backendRoot}${backendOwner}/${remainder.slice(separatorIndex + 1)}`;
  }
  const escapedPrefix = `escaperooms/${safeUid}/`;
  if (safePath.startsWith(escapedPrefix)) {
    return `${backendRoot}${backendOwner}/${safePath.slice(escapedPrefix.length)}`;
  }
  if (safePath.startsWith(`escaperooms/${safeUid}`)) {
    return `${backendRoot}${backendOwner}/${safePath.slice(`escaperooms/${safeUid}`.length).replace(/^\/+/, "")}`;
  }
  return `${backendRoot}${backendOwner}/${safePath.replace(/^\/+/, "")}`;
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

async function resolveGeneratedImageStorageContext() {
  if (!state.currentUser?.uid) return null;
  try {
    const sessionId = await ensureActiveRemoteSession();
    if (!sessionId) return null;
    const topicId = await ensureActiveTopic(sessionId);
    if (!topicId) return null;
    return { uid: state.currentUser.uid, sessionId, topicId };
  } catch (error) {
    console.warn("Las imágenes se conservarán optimizadas en memoria porque Storage no está disponible:", error);
    return null;
  }
}

async function storeGeneratedImage(imageDataUrl, relativePath, storageContext = null) {
  if (!imageDataUrl || !storageContext) return imageDataUrl;
  await yieldToBrowser();
  try {
    return await uploadImageIfDataUrl(
      imageDataUrl,
      `escaperooms/${storageContext.uid}/${storageContext.sessionId}/${storageContext.topicId}/${relativePath}`
    );
  } catch (error) {
    if (error?.code === "asset_upload_pending") return imageDataUrl;
    throw error;
  }
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
  if (isDataUrl(project.endingImage)) {
    const downloadUrl = await uploadImageIfDataUrl(project.endingImage, `escaperooms/${uid}/${sessionId}/${topicId}/ending_${Date.now()}.webp`);
    if (downloadUrl) project.endingImage = downloadUrl;
  }
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
  const sessionId = await createRemoteSession({
    title: deriveSessionTitle(),
    project: state.project ? materializeProjectForExport() : null,
    formState: serializeFormState(),
    activate: true,
    reloadEditor: false
  });
  return sessionId;
}

async function ensureActiveTopic(sessionId) {
  if (state.activeTopicId && !state.legacyTopicPending) return state.activeTopicId;
  if (!sessionId) return "";
  const payload = buildTopicPayload({
    academicNumber: getCurrentAcademicNumber(),
    project: state.project ? materializeProjectForExport() : null,
    formState: serializeFormState()
  });
  const topic = await createTopicDocument(sessionId, payload);
  if (state.legacyTopicPending) state.topics = state.topics.filter(item => item.id !== 'legacy');
  state.legacyTopicPending = false;
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
      academicNumber: state.topics.find(topic => topic.id === topicId)?.academicNumber || getCurrentAcademicNumber(),
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
    if (error?.code === "asset_upload_pending") {
      showPendingAssetStatus(error);
    } else {
      setRemoteSaveState("error", "Error al guardar");
      setStatus(error?.message || "No se pudo guardar la sesión en Firebase.", "bad");
    }
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
  if (!confirmRealSessionAction('Cambiar la publicación de la sesión completa')) {
    if (elements.publishToggle) elements.publishToggle.checked = isPublishedSession();
    return;
  }
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
  if (isGenerationBusy()) {
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
    if (isGenerationBusy()) {
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

let topicDeleteBusy = false;
async function deleteTopicFromMenu(sessionId, topicId) {
  if (topicDeleteBusy || isGenerationBusy() || !sessionId || !topicId) return;
  const session = state.sessions.find(item => item.id === sessionId);
  if (!session || session.status === 'published' || session.ownerId !== state.currentUser?.uid) {
    setStatus('Solo puedes eliminar temas de tus sesiones en borrador.', 'warning'); return;
  }
  const topic = sessionId === state.activeSessionId ? state.topics.find(item => item.id === topicId) : session.topicSummaries?.find(item => item.id === topicId);
  if (!window.confirm(`¿Eliminar únicamente el tema "${topic ? getTopicTitle(topic) : topicId}" de "${session.title}"?\n\nLa sesión y los demás temas se conservarán. Esta acción no se puede deshacer desde PigPen.`)) return;
  topicDeleteBusy = true;
  const previousSuspension = state.suspendSessionSave;
  if (elements.studioWorkspace) elements.studioWorkspace.inert = true;
  try {
    const deletingActiveLegacy = sessionId === state.activeSessionId && topicId === 'legacy' && state.activeTopicId === topicId;
    await flushStructuralEdits();
    if (deletingActiveLegacy && state.activeTopicId && state.activeTopicId !== 'legacy') topicId = state.activeTopicId;
    state.suspendSessionSave = true;
    const snapshots = await getDocs(collection(db, ESCAPE_ROOM_COLLECTION, sessionId, TOPICS_SUBCOLLECTION));
    const result = await deleteTopicOnly({ uid:state.currentUser.uid, topicId,
      sessionRef:doc(db, ESCAPE_ROOM_COLLECTION, sessionId), topicRefs:snapshots.docs.map(snapshot => snapshot.ref),
      run:callback => runTransaction(db, callback), summarize:buildTopicSummary, timestamp:serverTimestamp, schemaVersion:SESSION_SCHEMA_VERSION });
    syncLocalSessionIndex(sessionId, result.patch);
    if (state.activeSessionId === sessionId) {
      const wasActive = state.activeTopicId === topicId;
      state.topics = sortTopics(result.topics);
      state.activeSessionMeta = {...state.activeSessionMeta, ...result.patch};
      state.legacyTopicPending = false;
      if (wasActive) {
        state.activeTopicId = '';
        const next = state.topics.find(item => item.id === result.patch.activeTopicId) || state.topics[0];
        if (next) await loadTopicIntoEditor(next, {updateParent:false});
        else {
          state.isHydratingFromRemote = true;
          try { resetEditorState({preserveForm:false}); renderMissionEditor(); renderOutputsNow(); }
          finally { state.isHydratingFromRemote = false; }
        }
      }
    }
    renderTopicList(); renderSessionList();
    setStatus('Tema eliminado. La sesión, los demás temas y los archivos de Storage se conservaron.', 'success');
  } catch (error) {
    console.error('No se pudo eliminar el tema:', error);
    setStatus(error.message || 'No se pudo eliminar el tema.', 'bad');
  } finally {
    state.suspendSessionSave = previousSuspension;
    topicDeleteBusy = false;
    if (elements.studioWorkspace) elements.studioWorkspace.inert = false;
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

function isSessionStorageAvailable() {
  try {
    const key = "__er_creator_tab_test__";
    window.sessionStorage.setItem(key, "1");
    window.sessionStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
}

function getTabWorkspaceStorage() {
  if (isSessionStorageAvailable()) return window.sessionStorage;
  return isLocalStorageAvailable() ? window.localStorage : null;
}

function getBriefSections() {
  return [...document.querySelectorAll("#escapeRoomForm details[data-er-brief-section]")];
}

function restoreBriefSectionState() {
  const sections = getBriefSections();
  if (!sections.length) return;
  let saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(BRIEF_SECTIONS_STORAGE_KEY) || "null");
  } catch (_) {
    saved = null;
  }
  sections.forEach((section) => {
    const key = normalizeString(section.dataset.erBriefSection, "");
    section.open = saved && typeof saved[key] === "boolean" ? saved[key] : true;
  });
}

function persistBriefSectionState() {
  try {
    const stateBySection = Object.fromEntries(getBriefSections().map((section) => [
      normalizeString(section.dataset.erBriefSection, ""),
      Boolean(section.open)
    ]).filter(([key]) => key));
    window.localStorage.setItem(BRIEF_SECTIONS_STORAGE_KEY, JSON.stringify(stateBySection));
  } catch (_) {
    // Es una preferencia visual; el formulario sigue funcionando sin Storage.
  }
}

function wireBriefSectionPersistence() {
  restoreBriefSectionState();
  getBriefSections().forEach((section) => {
    section.addEventListener("toggle", persistBriefSectionState);
  });
}

function parseTopicLines(value = "") {
  return String(value)
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function saveFormState() {
  updateOutputAcademicIndicators();
  const storage = getTabWorkspaceStorage();
  if (!elements.form || state.formPersistenceSuspended || !storage) return;
  try {
    const formState = serializeFormState();
    storage.removeItem(FORM_STORAGE_KEY);
    storage.setItem(FORM_STORAGE_KEY, JSON.stringify(formState));
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

const modalReturnFocusTargets = new WeakMap();
let accessibleModalFocusWired = false;

function initializeAccessibleModalFocus() {
  if (accessibleModalFocusWired) return;
  accessibleModalFocusWired = true;

  document.querySelectorAll(".modal").forEach((modal) => {
    if (!modal.classList.contains("show")) modal.inert = true;
    modal.addEventListener("show.bs.modal", (event) => {
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const relatedTarget = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
      const returnTarget = relatedTarget && !modal.contains(relatedTarget) ? relatedTarget : activeElement;
      if (returnTarget && !modal.contains(returnTarget)) modalReturnFocusTargets.set(modal, returnTarget);
      modal.inert = false;
    });

    modal.addEventListener("hide.bs.modal", () => {
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!activeElement || !modal.contains(activeElement)) return;
      activeElement.blur();
      const returnTarget = modalReturnFocusTargets.get(modal);
      if (returnTarget?.isConnected && !returnTarget.disabled) returnTarget.focus({ preventScroll: true });
    });

    modal.addEventListener("hidden.bs.modal", () => {
      modal.inert = true;
      const returnTarget = modalReturnFocusTargets.get(modal);
      if (returnTarget?.isConnected && !returnTarget.disabled && document.activeElement === document.body) {
        returnTarget.focus({ preventScroll: true });
      }
    });
  });
}

initializeAccessibleModalFocus();

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
    __experienceConfig: experience.config(project.experience_config),
    __experienceConfirmationRequired: false,
    temaInput: project.tema_curricular || project.titulo || "",
    objetivoInput: project.introduccion || "",
    duracionInput: String(Number(project.duracion_minutos) >= 1 ? project.duracion_minutos : calculateProjectEstimatedDuration(project)),
    __durationMode: "manual",
    numMisionesInput: String(Math.min(8, Math.max(1, missionCount))),
    preguntasPorSalaInput: String(questionCount),
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
    state.selectedBriefingMissionId = null;
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
  const storage = getTabWorkspaceStorage();
  if (!elements.form || !storage) return;
  const rawState = storage.getItem(FORM_STORAGE_KEY);
  if (!rawState) return;
  try {
    const formState = JSON.parse(rawState);
    applyFormState(formState);
  } catch (error) {
    console.warn("No se pudo restaurar el formulario:", error);
  }
}

function clearFormState() {
  getTabWorkspaceStorage()?.removeItem(FORM_STORAGE_KEY);
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
  if (isDataUrl(stripped.endingImage)) stripped.endingImage = "";

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
  const storage = getTabWorkspaceStorage();
  if (!state.project || state.formPersistenceSuspended || !storage) return;
  try {
    const projectToStore = containsEmbeddedDataUrl(state.project)
      ? stripHeavyAssetsFromProject(state.project)
      : state.project;
    storage.removeItem(PROJECT_STORAGE_KEY);
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projectToStore));
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
      storage.removeItem(PROJECT_STORAGE_KEY);
      storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(lightweightProject));
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
  const storage = getTabWorkspaceStorage();
  if (!storage) return;
  const rawState = storage.getItem(PROJECT_STORAGE_KEY);
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
  getTabWorkspaceStorage()?.removeItem(PROJECT_STORAGE_KEY);
}

function syncNarrativaCustomField() {
  const isCustom = elements.narrativaSelect?.value === "otro";
  elements.narrativaCustomField?.classList.toggle("hidden", !isCustom);
  if (elements.narrativaCustomInput) elements.narrativaCustomInput.required = Boolean(isCustom);
}

function syncImageStyleCustomField() {
  const isCustom = elements.estiloImagenSelect?.value === "otro";
  elements.estiloImagenCustomField?.classList.toggle("hidden", !isCustom);
  if (elements.estiloImagenCustomInput) elements.estiloImagenCustomInput.required = Boolean(isCustom);
}

function setStatus(message = "", type = "info", { actionLabel = "", onAction = null } = {}) {
  if (!elements.statusBanner) return;
  if (!message) {
    elements.statusBanner.className = "er-status-banner hidden";
    elements.statusBanner.textContent = "";
    syncActivityIndicator();
    return;
  }
  elements.statusBanner.className = `er-status-banner is-${type}`;
  const readable = userStatus(message, type);
  if (type === "success" && /^Escape room listo/i.test(readable.message)) {
    const wrap = document.createElement("div");
    wrap.className = "er-status-success-wrap";

    const header = document.createElement("div");
    header.className = "er-status-success-header";

    const icon = document.createElement("i");
    icon.className = "fas fa-circle-check er-status-success-icon";
    icon.setAttribute("aria-hidden", "true");

    const title = document.createElement("strong");
    title.className = "er-status-success-title";
    title.textContent = "Escape Room Listo";

    header.append(icon, title);

    const details = document.createElement("div");
    details.className = "er-status-success-details";
    details.textContent = readable.message.replace(/^Escape room listo:?\s*/i, "");

    wrap.append(header, details);
    elements.statusBanner.replaceChildren(wrap);
  } else if (type === "success") {
    const wrap = document.createElement("div");
    wrap.className = "er-status-success-inline";

    const icon = document.createElement("i");
    icon.className = "fas fa-circle-check er-status-success-icon";
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = readable.message;

    wrap.append(icon, text);
    elements.statusBanner.replaceChildren(wrap);
  } else {
    const text = document.createElement("span");
    text.textContent = readable.message;
    elements.statusBanner.replaceChildren(text);
  }
  if(readable.detail){
    const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('pre'),copy=document.createElement('button');
    summary.textContent='Detalles del error';body.textContent=readable.detail;body.style.whiteSpace='pre-wrap';body.style.overflowWrap='anywhere';
    copy.type='button';copy.textContent='Copiar detalles';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(readable.detail);copy.textContent='Copiado';}catch{copy.textContent='Selecciona y copia el texto';}});
    details.append(summary,body,copy);elements.statusBanner.append(details);
  }
  if (actionLabel && typeof onAction === "function") {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "er-status-action";
    action.textContent = actionLabel;
    action.addEventListener("click", onAction, { once: true });
    elements.statusBanner.append(action);
  }
  syncActivityIndicator();
}

function syncActivityIndicator() {
  if (!elements.loading) return;
  const hasMessage = Boolean(elements.statusBanner?.textContent?.trim());
  const isBusy = state.isLoading || state.isGeneratingImagesInBackground;
  elements.loading.classList.toggle("hidden", !isBusy && !hasMessage);
  elements.loading.classList.toggle("is-loading", isBusy);
  elements.loading.setAttribute("aria-busy", String(isBusy));
}

function hasCreatorWorkToProtect() {
  if (
    state.project
    || state.activeSessionId
    || state.isLoading
    || state.isGenerating
    || state.isGeneratingImagesInBackground
    || state.sessionSaveHandle
    || state.sessionSaveInFlight
    || state.sessionSaveQueued
  ) {
    return true;
  }

  return ["temaInput", "objetivoInput", "narrativaCustomInput", "estiloImagenCustomInput"]
    .some((id) => Boolean(document.getElementById(id)?.value?.trim()));
}

function confirmCreatorExit(event) {
  if (allowCreatorExitOnce || !hasCreatorWorkToProtect()) return;
  event.preventDefault();
  // Los navegadores actuales requieren un valor truthy para mostrar el aviso nativo.
  event.returnValue = true;
  return true;
}

function buildCreatorHistoryState(marker) {
  const currentState = window.history.state;
  const safeState = currentState && typeof currentState === "object" ? currentState : {};
  return { ...safeState, [CREATOR_HISTORY_GUARD_KEY]: marker };
}

function armCreatorHistoryGuard() {
  if (creatorHistoryGuardArmed) return;
  try {
    const marker = window.history.state?.[CREATOR_HISTORY_GUARD_KEY];
    if (marker !== "guard") {
      if (marker !== "base") {
        window.history.replaceState(buildCreatorHistoryState("base"), "", window.location.href);
      }
      window.history.pushState(buildCreatorHistoryState("guard"), "", window.location.href);
    }
    window.addEventListener("popstate", handleCreatorHistoryTraversal);
    creatorHistoryGuardArmed = true;
  } catch (error) {
    console.warn("No se pudo activar la protección del historial de PigPenCreator:", error);
  }
}

function leaveCreatorHistoryGuard() {
  allowCreatorExitOnce = true;
  creatorHistoryGuardArmed = false;
  window.removeEventListener("popstate", handleCreatorHistoryTraversal);
  window.history.back();
  window.setTimeout(() => {
    allowCreatorExitOnce = false;
    if (document.visibilityState === "visible") armCreatorHistoryGuard();
  }, 1500);
}

function handleCreatorHistoryTraversal(event) {
  if (restoringCreatorHistoryGuard) {
    restoringCreatorHistoryGuard = false;
    return;
  }
  if (event.state?.[CREATOR_HISTORY_GUARD_KEY] !== "base") return;

  const shouldLeave = !hasCreatorWorkToProtect()
    || window.confirm("Hay un escape room en edición. ¿Deseas salir de esta página?");
  if (shouldLeave) {
    leaveCreatorHistoryGuard();
    return;
  }

  restoringCreatorHistoryGuard = true;
  window.history.forward();
  window.setTimeout(() => {
    restoringCreatorHistoryGuard = false;
  }, 500);
}

function wireCreatorExitProtection() {
  window.addEventListener("beforeunload", confirmCreatorExit);
  window.addEventListener("pageshow", armCreatorHistoryGuard);
  armCreatorHistoryGuard();
}

function buildPigPenViewerUrl({ sessionId = "", shareToken = "", topicId = "" } = {}) {
  const url = new URL("PigPen-Visor.html", window.location.href);
  url.searchParams.set("session", sessionId);
  url.searchParams.set("token", shareToken);
  if (topicId) url.searchParams.set("topic", topicId);
  return url.href;
}

function renderShareMenuState() {
  if (!elements.shareMenu || !elements.btnShareEscapeRoom) return;
  elements.shareMenu.hidden = !state.shareMenuOpen;
  elements.btnShareEscapeRoom.setAttribute("aria-expanded", String(state.shareMenuOpen));
  elements.btnShareEscapeRoom.classList.toggle("is-active", state.shareMenuOpen);
  elements.btnShareEscapeRoom.classList.toggle("is-sharing", state.shareInFlight);
  const linkIsReady = Boolean(state.shareLink) && !state.shareInFlight;
  elements.shareMenuActions.forEach((button) => {
    button.disabled = !linkIsReady;
  });
  if (elements.shareMenuStatus) {
    elements.shareMenuStatus.textContent = state.shareInFlight
      ? "Guardando y preparando enlace…"
      : (linkIsReady ? "Enlace listo para compartir" : "No fue posible preparar el enlace");
    elements.shareMenuStatus.classList.toggle("is-error", !state.shareInFlight && !linkIsReady);
  }
}

function closeShareMenu({ restoreFocus = false } = {}) {
  if (!state.shareMenuOpen) return;
  state.shareMenuOpen = false;
  renderShareMenuState();
  if (restoreFocus) elements.btnShareEscapeRoom?.focus();
}

async function prepareShareLink() {
  if (!state.project || !state.currentUser?.uid || isGenerationBusy()) return;
  state.shareLink = "";
  state.shareInFlight = true;
  renderShareMenuState();
  syncActionButtons();
  try {
    if (state.activeSessionId && state.activeTopicId) {
      await flushPendingTopicSave();
    } else {
      await persistActiveSession();
    }
    if (!state.activeSessionId) throw new Error("No hay una sesión guardada para compartir.");
    const response = await authFetchJson("/api/pigpen/share", {
      method: "POST",
      sameOrigin: true,
      body: { sessionId: state.activeSessionId }
    });
    if (!response?.sessionId || !response?.shareToken) {
      throw new Error("El servidor no devolvió un enlace válido.");
    }
    state.shareLink = buildPigPenViewerUrl({
      sessionId: response.sessionId,
      shareToken: response.shareToken,
      topicId: state.activeTopicId || response.activeTopicId
    });
  } catch (error) {
    console.error("No se pudo preparar el enlace compartido de PigPen:", error);
    setStatus(`No se pudo compartir el escape room: ${error.message}`, "bad");
  } finally {
    state.shareInFlight = false;
    renderShareMenuState();
    syncActionButtons();
  }
}

async function toggleShareMenu() {
  if (state.shareMenuOpen) {
    closeShareMenu();
    return;
  }
  state.shareMenuOpen = true;
  await prepareShareLink();
}

async function handleShareMenuAction(action = "") {
  if (!state.shareLink) return;
  if (action === "copy") {
    const copied = await copyTextToClipboard(state.shareLink);
    setStatus(copied ? "Enlace del escape room copiado." : "No fue posible copiar el enlace.", copied ? "success" : "warning");
    if (copied) closeShareMenu({ restoreFocus: true });
    return;
  }
  if (action === "open") {
    window.open(state.shareLink, "_blank", "noopener,noreferrer");
    closeShareMenu({ restoreFocus: true });
  }
}

function isPublishedSession() {
  return normalizeString(state.activeSessionMeta?.status, "draft") === "published";
}

function isObjectiveBlueprintCurrent(formData = null) {
  if (!state.objectiveBlueprint) return false;
  const currentData = formData || getFormData();
  const currentKey = buildObjectiveBlueprintKey(
    currentData,
    state.objectiveBlueprint.source_contract
  );
  if (state.objectiveBlueprintKey === currentKey && state.objectiveBlueprint.plan_fingerprint) return true;
  if (objectiveBlueprintMatchesCurrentForm(state.objectiveBlueprint, currentData)) {
    state.objectiveBlueprint = upgradeObjectiveBlueprintForReuse(state.objectiveBlueprint, currentData);
    state.objectiveBlueprintKey = currentKey;
    persistObjectiveBlueprint(state.objectiveBlueprintKey, state.objectiveBlueprint);
    return true;
  }
  if (!state.objectiveBlueprintKey || !state.objectiveBlueprint.plan_fingerprint) return false;

  // Recover from storage/hydration bookkeeping drift only when both the applied
  // plan text and every dependency in the compiled configuration still match.
  // A genuine user edit continues to invalidate the plan.
  const sourceContract = state.objectiveBlueprint.source_contract || {};
  const objectiveMatches = normalizeString(currentData.objetivo, "")
    === normalizeString(sourceContract.applied_plan_text, "");
  const configurationMatches = stableObjectiveSerialization(getObjectiveSemanticConfiguration(currentData))
    === stableObjectiveSerialization(getObjectiveSemanticConfiguration(sourceContract.configuration || {}));
  if (!objectiveMatches || !configurationMatches) return false;
  state.objectiveBlueprintKey = currentKey;
  persistObjectiveBlueprint(currentKey, state.objectiveBlueprint);
  return true;
}

function syncObjectivePlanStatus({ requiresReview = false } = {}) {
  void requiresReview;
  return isObjectiveBlueprintCurrent();
}

function syncActionButtons() {
  const hasData = Boolean(state.project);
  const generationBusy = isGenerationBusy();
  const canPublish = Boolean(state.currentUser?.uid) && hasData && !generationBusy;
  syncObjectivePlanStatus();

  elements.btnGenerar.disabled = state.isLoading || generationBusy;
  if (elements.btnGenerarBottom) elements.btnGenerarBottom.disabled = state.isLoading || generationBusy;
  elements.btnLimpiar.disabled = state.isLoading || generationBusy;
  elements.btnAddMission.disabled = state.isLoading || generationBusy;
  if (elements.btnAddTopic) {
    elements.btnAddTopic.disabled = state.isLoading || generationBusy || !state.activeSessionId || isPublishedSession();
  }
  if (elements.modoPresentacionSelect) {
    elements.modoPresentacionSelect.disabled = state.isLoading || generationBusy;
  }
  elements.btnExportar.disabled = state.isLoading || !hasData || generationBusy || state.isExporting;
  if (elements.btnShareEscapeRoom) {
    elements.btnShareEscapeRoom.disabled = state.isLoading || !hasData || generationBusy || state.shareInFlight || !state.currentUser?.uid;
  }
  if (elements.btnCopyAllAnswers) {
    elements.btnCopyAllAnswers.disabled = state.isLoading || generationBusy || state.answerCopyInFlight || !state.activeSessionId || state.topics.length === 0;
  }
  if (elements.btnEditorialReview) {
    elements.btnEditorialReview.disabled = state.isLoading || generationBusy || state.editorialReviewInFlight || !state.activeSessionId || state.topics.length === 0;
  }
  if (elements.btnExportEditorialWorkbook) {
    elements.btnExportEditorialWorkbook.disabled = state.isLoading || generationBusy || state.editorialReviewInFlight || !state.activeSessionId || state.topics.length === 0;
  }
  if (elements.btnSelectEditorialWorkbook) {
    elements.btnSelectEditorialWorkbook.disabled = state.isLoading || generationBusy || state.editorialReviewInFlight || !state.activeSessionId;
  }
  if (elements.btnImportEditorialDrive) {
    elements.btnImportEditorialDrive.disabled = state.isLoading || generationBusy || state.editorialReviewInFlight || !state.activeSessionId;
  }
  elements.btnCopiarJson.disabled = state.isLoading || !hasData || generationBusy;
  if (elements.btnPreviewAutofill) {
    elements.btnPreviewAutofill.disabled = state.isLoading || !hasData || generationBusy;
  }
  if (elements.btnRegenerateCoverImage) {
    elements.btnRegenerateCoverImage.disabled = state.isLoading || !hasData || generationBusy;
  }
  if (elements.btnRegenerateSelectedMission) {
    const hasSelectedMission = Boolean(state.project?.misiones?.some((mission) => mission.id === state.selectedMissionId));
    elements.btnRegenerateSelectedMission.disabled = state.isLoading || generationBusy || !hasSelectedMission;
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
  syncActivityIndicator();
}

const previewGenerationSteps = [];
let geminiModelCatalogPromise = null;

function normalizeGeminiCatalogModelId(value = "") {
  return String(value || "").trim()
    .replace(/^.*\/models\//i, "")
    .replace(/^models\//i, "")
    .replace(/:(?:generateContent|streamGenerateContent)$/i, "");
}

function formatGeminiCatalogModelLabel(model = {}) {
  const id = normalizeGeminiCatalogModelId(model?.name || model?.model || model?.id || "");
  return normalizeString(model?.displayName, "") || id
    .replace(/^gemini-/i, "Gemini ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function geminiCatalogMethods(model = {}) {
  return [
    ...(Array.isArray(model?.supportedGenerationMethods) ? model.supportedGenerationMethods : []),
    ...(Array.isArray(model?.supportedActions) ? model.supportedActions : [])
  ].map((method) => String(method || "").toLowerCase());
}

function supportsGeminiContentGeneration(model = {}) {
  const methods = geminiCatalogMethods(model);
  const id = normalizeGeminiCatalogModelId(model?.name || model?.model || model?.id || "").toLowerCase();
  if (!isGeminiTextContentModel(id)) return false;
  return methods.length
    ? methods.some((method) => method === "generatecontent" || method.endsWith(":generatecontent"))
    : FALLBACK_TEXT_MODELS.includes(id);
}

function isGeminiImageContentModel(id = "") {
  const value = normalizeGeminiCatalogModelId(id).toLowerCase();
  return value.startsWith("gemini-") && (value.includes("-image") || value.includes("image-generation"));
}

function supportsGeminiImageGeneration(model = {}) {
  const id = normalizeGeminiCatalogModelId(model?.name || model?.model || model?.id || "");
  if (!isGeminiImageContentModel(id)) return false;
  const methods = geminiCatalogMethods(model);
  return methods.length
    ? methods.some((method) => method === "generatecontent" || method.endsWith(":generatecontent"))
    : FALLBACK_IMAGE_MODELS.includes(id);
}

function isGeminiTextContentModel(id = "") {
  const value = normalizeGeminiCatalogModelId(id).toLowerCase();
  if (!value || (!value.startsWith("gemini-") && !value.includes("learnlm"))) return false;
  return !/(?:image|imagen|omni|interactions?|tts|audio|live|veo|embedding|aqa|robotics|computer-use|deep-research)/i.test(value);
}

function sanitizeRestoredModelSelections() {
  let changed = false;
  const pendingContent = normalizeGeminiCatalogModelId(elements.objetivoModeloSelect?.dataset.pendingModelValue || "");
  if (pendingContent && !isGeminiTextContentModel(pendingContent)) {
    elements.objetivoModeloSelect.value = TEXT_MODEL_DEFAULT;
    delete elements.objetivoModeloSelect.dataset.pendingModelValue;
    changed = true;
  }
  const pendingImage = normalizeGeminiCatalogModelId(elements.imagenModeloSelect?.dataset.pendingModelValue || "");
  if (pendingImage && !isGeminiImageContentModel(pendingImage)) {
    elements.imagenModeloSelect.value = IMAGE_MODEL_DEFAULT;
    delete elements.imagenModeloSelect.dataset.pendingModelValue;
    changed = true;
  }
  if (changed) saveFormState();
  return changed;
}

function renderGeminiModelOptions(select, models = [], selectedValue = "", fallbackValue = "") {
  if (!select) return;
  const selected = normalizeGeminiCatalogModelId(selectedValue || fallbackValue);
  const catalog = new Map(models.map((model) => [model.id, model]));
  select.replaceChildren(...[...catalog.values()].map((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    return option;
  }));
  select.value = catalog.has(selected)
    ? selected
    : (catalog.has(fallbackValue) ? fallbackValue : (catalog.keys().next().value || ""));
  delete select.dataset.pendingModelValue;
}

async function loadGeminiModelCatalog() {
  const selectedObjectiveModel = normalizeGeminiCatalogModelId(elements.objetivoModeloSelect?.dataset.pendingModelValue || elements.objetivoModeloSelect?.value || TEXT_MODEL_DEFAULT);
  const selectedImageModel = normalizeGeminiCatalogModelId(elements.imagenModeloSelect?.dataset.pendingModelValue || elements.imagenModeloSelect?.value || IMAGE_MODEL_DEFAULT);
  if (elements.geminiModelCatalogStatus) elements.geminiModelCatalogStatus.textContent = "Consultando todos los modelos disponibles en la API…";
  if (elements.objetivoModeloSelect) elements.objetivoModeloSelect.disabled = true;
  if (elements.imagenModeloSelect) elements.imagenModeloSelect.disabled = true;
  try {
    geminiModelCatalogPromise ||= authFetchJson(buildGeminiApiUrl("/api/gemini/models"), { method: "GET" });
    const payload = await geminiModelCatalogPromise;
    const unique = new Map();
    (Array.isArray(payload?.models) ? payload.models : []).forEach((model) => {
      const id = normalizeGeminiCatalogModelId(model?.name || model?.model || "");
      if (!id || unique.has(id) || (!supportsGeminiContentGeneration(model) && !supportsGeminiImageGeneration(model))) return;
      unique.set(id, { id, label: formatGeminiCatalogModelLabel(model) });
    });
    const available = [...unique.values()].sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true, sensitivity: "base" }));
    const apiTextModels = available.filter((model) => isGeminiTextContentModel(model.id));
    const apiImageModels = available.filter((model) => isGeminiImageContentModel(model.id));
    const textModels = apiTextModels.length
      ? apiTextModels
      : FALLBACK_TEXT_MODELS.map((id) => ({ id, label: formatGeminiCatalogModelLabel({ name: id }) }));
    const imageModels = apiImageModels.length
      ? apiImageModels
      : FALLBACK_IMAGE_MODELS.map((id) => ({ id, label: formatGeminiCatalogModelLabel({ name: id }) }));

    ALLOWED_TEXT_MODELS.clear();
    textModels.forEach((model) => ALLOWED_TEXT_MODELS.add(model.id));
    ALLOWED_IMAGE_MODELS.clear();
    imageModels.forEach((model) => ALLOWED_IMAGE_MODELS.add(model.id));
    renderGeminiModelOptions(elements.objetivoModeloSelect, textModels, selectedObjectiveModel, TEXT_MODEL_DEFAULT);
    renderGeminiModelOptions(elements.imagenModeloSelect, imageModels, selectedImageModel, IMAGE_MODEL_DEFAULT);
    saveFormState();
    if (elements.geminiModelCatalogStatus) {
      const fallbackNote = !apiTextModels.length || !apiImageModels.length ? " Los tipos no publicados por Vertex usan el catálogo de respaldo." : "";
      elements.geminiModelCatalogStatus.textContent = `${apiTextModels.length} modelos de texto y ${apiImageModels.length} modelos de imagen disponibles desde la API.${fallbackNote}`;
    }
  } catch (error) {
    geminiModelCatalogPromise = null;
    const textModels = FALLBACK_TEXT_MODELS.map((id) => ({ id, label: formatGeminiCatalogModelLabel({ name: id }) }));
    const imageModels = FALLBACK_IMAGE_MODELS.map((id) => ({ id, label: formatGeminiCatalogModelLabel({ name: id }) }));
    ALLOWED_TEXT_MODELS.clear();
    textModels.forEach((model) => ALLOWED_TEXT_MODELS.add(model.id));
    ALLOWED_IMAGE_MODELS.clear();
    imageModels.forEach((model) => ALLOWED_IMAGE_MODELS.add(model.id));
    renderGeminiModelOptions(elements.objetivoModeloSelect, textModels, selectedObjectiveModel, TEXT_MODEL_DEFAULT);
    renderGeminiModelOptions(elements.imagenModeloSelect, imageModels, selectedImageModel, IMAGE_MODEL_DEFAULT);
    saveFormState();
    if (elements.geminiModelCatalogStatus) elements.geminiModelCatalogStatus.textContent = `No se pudo consultar la API. Se muestran modelos de respaldo: ${error?.message || "error de red"}.`;
  } finally {
    if (elements.objetivoModeloSelect) elements.objetivoModeloSelect.disabled = false;
    if (elements.imagenModeloSelect) elements.imagenModeloSelect.disabled = false;
  }
}

function updatePreviewGenerationProgress({ title = "Procesando el escape room", detail = "", current = 0, total = 0, reset = false } = {}) {
  const safeTitle = normalizeString(title, "Procesando el escape room");
  const safeDetail = normalizeString(detail, "");
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCurrent = Math.min(safeTotal || Number.MAX_SAFE_INTEGER, Math.max(0, Number(current) || 0));
  if (reset) previewGenerationSteps.length = 0;

  if (elements.previewSpinnerTitle) elements.previewSpinnerTitle.textContent = safeTitle;
  if (elements.previewSpinnerDetail) {
    elements.previewSpinnerDetail.textContent = safeTotal
      ? `${safeDetail}${safeDetail ? " · " : ""}Paso ${safeCurrent} de ${safeTotal}`
      : safeDetail;
  }
  if (elements.previewSpinner) elements.previewSpinner.setAttribute("aria-label", `${safeTitle}${safeDetail ? `. ${safeDetail}` : ""}`);

  const progress = safeTotal ? Math.round((safeCurrent / safeTotal) * 100) : 8;
  if (elements.previewProgressBar) elements.previewProgressBar.style.width = `${Math.max(8, Math.min(100, progress))}%`;
  const progressRoot = elements.previewProgressBar?.parentElement;
  if (progressRoot) {
    progressRoot.setAttribute("aria-valuemax", String(safeTotal || 1));
    progressRoot.setAttribute("aria-valuenow", String(safeTotal ? safeCurrent : 0));
  }

  if (!previewGenerationSteps.length || previewGenerationSteps.at(-1) !== safeTitle) {
    previewGenerationSteps.push(safeTitle);
    if (previewGenerationSteps.length > 4) previewGenerationSteps.shift();
  }
  if (elements.previewSpinnerLog) {
    elements.previewSpinnerLog.replaceChildren(...previewGenerationSteps.map((step, index) => {
      const item = document.createElement("li");
      item.textContent = step;
      if (index === previewGenerationSteps.length - 1) item.classList.add("is-current");
      return item;
    }));
  }
}

function setActiveTab(tabName = "preview") {
  const nextTab = tabName === "json" ? "json" : "preview";
  const changed = state.activeTab !== nextTab;
  state.activeTab = nextTab;
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.erTab === nextTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (state.project && changed) {
    if (nextTab === "json") renderJsonPreview();
    else renderPreview();
  }
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
    const blocksPreview = state.isGenerating && !state.isGeneratingImagesInBackground;
    elements.previewSpinner.classList.toggle("hidden", !blocksPreview);
  }
}

function normalizePositiveInteger(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 ? Math.floor(numeric) : fallback;
}

function calculateEstimatedDurationMinutes(totalQuestionCount = 0) {
  const questions = Math.max(0, Math.floor(Number(totalQuestionCount) || 0));
  return Math.max(1, questions * 1.5);
}

function getConfiguredQuestionCount(missionCount = 0, questionsPerMission = 0) {
  return Math.max(1, normalizePositiveInteger(missionCount, 1) * normalizePositiveInteger(questionsPerMission, 1));
}

function getQuestionTimeBudgetSeconds(data = {}) {
  const totalQuestions = getConfiguredQuestionCount(data.misiones, data.preguntasPorSala);
  const durationMinutes = Math.max(1, Number(data.duracion) || calculateEstimatedDurationMinutes(totalQuestions));
  return Math.max(30, Math.floor((durationMinutes * 60) / totalQuestions));
}

function calculateProjectEstimatedDuration(project = {}) {
  const missions = Array.isArray(project?.misiones) ? project.misiones : [];
  const totalQuestions = missions.reduce((total, mission) => (
    total + (Array.isArray(mission?.preguntas) ? mission.preguntas.length : 0)
  ), 0);
  return calculateEstimatedDurationMinutes(totalQuestions);
}

function setEstimatedDurationInput(minutes, { force = false } = {}) {
  const input = document.getElementById("duracionInput");
  if (!input || (!force && input.dataset.durationMode === "manual")) return;
  const numeric = Number(minutes);
  const value = String(Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 2) / 2 : 1);
  if (input.value !== value) input.value = value;
}

function syncConfiguredEstimatedDuration() {
  const missionCount = normalizePositiveInteger(document.getElementById("numMisionesInput")?.value, 4);
  const questionsPerMission = normalizePositiveInteger(document.getElementById("preguntasPorSalaInput")?.value, 4);
  setEstimatedDurationInput(calculateEstimatedDurationMinutes(missionCount * questionsPerMission));
}

function getFormData() {
  const temaLines = parseTopicLines(document.getElementById("temaInput")?.value || "");
  const narrativaBase = elements.narrativaSelect?.value || "";
  const narrativaPersonalizada = String(elements.narrativaCustomInput?.value || "").trim();
  const narrativa = narrativaBase === "otro" ? (narrativaPersonalizada || "Otro") : narrativaBase;
  const estiloImagenBase = String(elements.estiloImagenSelect?.value || "").trim();
  const estiloImagenPersonalizado = String(elements.estiloImagenCustomInput?.value || "").trim();
  const estiloImagen = estiloImagenBase === "otro" ? estiloImagenPersonalizado : estiloImagenBase;
  const unidadTemaModo = getAcademicFieldMode();
  const unidadTemaValor = String(document.getElementById("unidadTemaSelect")?.value || "").trim();
  const missionCount = normalizePositiveInteger(document.getElementById("numMisionesInput")?.value, 4);
  const questionsPerMission = normalizePositiveInteger(document.getElementById("preguntasPorSalaInput")?.value, 4);
  const calculatedDuration = calculateEstimatedDurationMinutes(missionCount * questionsPerMission);
  const durationInput = document.getElementById("duracionInput");
  const enteredDuration = Number(durationInput?.value);
  const usesManualDuration = durationInput?.dataset.durationMode === "manual"
    && Number.isFinite(enteredDuration)
    && enteredDuration >= 1;
  const estimatedDuration = usesManualDuration
    ? Math.round(enteredDuration * 2) / 2
    : calculatedDuration;
  setEstimatedDurationInput(estimatedDuration, { force: true });
  return {
    modoPresentacion: normalizePresentationMode(elements.modoPresentacionSelect?.value || PRESENTATION_MODE_ROOMS),
    idioma: elements.idiomaSelect?.value || "es-419",
    nivel: document.getElementById("nivelSelect")?.value || "Secundaria",
    grado: document.getElementById("gradoSelect")?.value || "Primero",
    trimestre: document.getElementById("trimestreSelect")?.value || "1",
    materia: document.getElementById("materiaSelect")?.value || "Español",
    unidad: unidadTemaModo === "Primaria" ? unidadTemaValor : "",
    temaSecundaria: unidadTemaModo === "Secundaria" ? unidadTemaValor : "",
    publico: document.getElementById("publicoSelect")?.value || "Grupo completo",
    duracion: estimatedDuration,
    tema: temaLines.join(" / "),
    temaPrincipal: temaLines[0] || "",
    temas: temaLines,
    estacion: unidadTemaModo === "Secundaria" ? (document.getElementById("estacionSelect")?.value || "Todas") : "",
    misiones: missionCount,
    preguntasPorSala: questionsPerMission,
    contentModel: ALLOWED_TEXT_MODELS.has(String(elements.objetivoModeloSelect?.value || "").trim())
      ? String(elements.objetivoModeloSelect.value).trim()
      : TEXT_MODEL_DEFAULT,
    modelo: ALLOWED_TEXT_MODELS.has(String(elements.objetivoModeloSelect?.value || "").trim())
      ? String(elements.objetivoModeloSelect.value).trim()
      : TEXT_MODEL_DEFAULT,
    modeloObjetivo: ALLOWED_TEXT_MODELS.has(String(elements.objetivoModeloSelect?.value || "").trim())
      ? String(elements.objetivoModeloSelect.value).trim()
      : TEXT_MODEL_DEFAULT,
    modeloImagen: ALLOWED_IMAGE_MODELS.has(String(elements.imagenModeloSelect?.value || "").trim())
      ? String(elements.imagenModeloSelect?.value || IMAGE_MODEL_DEFAULT).trim()
      : IMAGE_MODEL_DEFAULT,
    narrativa,
    narrativaBase,
    narrativaPersonalizada,
    estiloImagen,
    estiloImagenBase,
    estiloImagenPersonalizado,
    ritmo: document.getElementById("ritmoSelect")?.value || "progresivo",
    dificultad: document.getElementById("dificultadSelect")?.value || "equilibrada",
    pistas: document.getElementById("pistasSelect")?.value || "moderadas",
    experience_config: experience.config(experienceConfig),
    objetivo: String(document.getElementById("objetivoInput")?.value || "").trim()
  };
}

function resolveObjectiveSourceContract(data = {}, explicitContract = null) {
  const currentText = normalizeString(data.objetivo, "");
  if (explicitContract?.original_objective_hash
    && [explicitContract.applied_plan_text, explicitContract.original_objective].some((value) => normalizeString(value, "") === currentText)) {
    return explicitContract;
  }
  const activeContract = state.objectiveBlueprint?.source_contract;
  if (activeContract?.original_objective_hash
    && [activeContract.applied_plan_text, activeContract.original_objective].some((value) => normalizeString(value, "") === currentText)) {
    return activeContract;
  }
  return buildObjectiveSourceContract(data);
}

function buildObjectiveBlueprintKey(data = {}, explicitContract = null) {
  const contract = resolveObjectiveSourceContract(data, explicitContract);
  const configuration = getObjectiveSemanticConfiguration(data);
  return JSON.stringify({
    contractVersion: CONTENT_GENERATION_CONTRACT_VERSION,
    sourceHash: contract.original_objective_hash,
    configurationFingerprint: stableObjectiveFingerprint(JSON.stringify(configuration))
  });
}

function getObjectiveSemanticConfiguration(data = {}) {
  const source = data && typeof data === "object" && (
    Object.hasOwn(data, "modo_presentacion") || Object.hasOwn(data, "contract_version")
  ) ? data : getObjectiveConfigurationContract(data);
  const result = structuredClone(source || {});
  // La versión de serialización y el modelo elegido determinan cómo se procesa
  // el plan, no su significado pedagógico. Cambiarlos no invalida contenido.
  delete result.contract_version;
  delete result.modelo;
  return result;
}

function objectiveBlueprintMatchesCurrentForm(blueprint = {}, formData = {}) {
  if (!blueprint || !Array.isArray(blueprint.rooms) || !blueprint.rooms.length) return false;
  const sourceContract = blueprint.source_contract || {};
  const currentObjective = normalizeString(formData.objetivo, "");
  let formattedObjective = "";
  try {
    formattedObjective = formatObjectiveBrief(blueprint, formData.idioma);
  } catch (_) {
    formattedObjective = "";
  }
  const objectiveMatches = [
    sourceContract.applied_plan_text,
    sourceContract.original_objective,
    formattedObjective
  ].some((value) => normalizeString(value, "") === currentObjective);
  if (!objectiveMatches) return false;
  const storedConfiguration = sourceContract.configuration || {};
  if (!Object.keys(storedConfiguration).length) {
    const expectedRooms = Math.max(1, Math.min(8, Number(formData.misiones) || 4));
    const expectedQuestions = Math.max(1, Math.floor(Number(formData.preguntasPorSala) || 4));
    return blueprint.rooms.length === expectedRooms
      && blueprint.rooms.every((room) => Array.isArray(room?.question_plans) && room.question_plans.length === expectedQuestions);
  }
  return stableObjectiveSerialization(getObjectiveSemanticConfiguration(storedConfiguration))
    === stableObjectiveSerialization(getObjectiveSemanticConfiguration(formData));
}

function upgradeObjectiveBlueprintForReuse(rawBlueprint = {}, formData = {}) {
  const normalized = normalizeObjectiveBrief(
    materializeObjectiveBlueprintMechanics(normalizeObjectiveBrief(rawBlueprint))
  );
  const sourceContract = structuredClone(rawBlueprint?.source_contract || normalized.source_contract || {});
  const configuration = getObjectiveConfigurationContract(formData);
  normalized.source_contract = {
    ...sourceContract,
    contract_version: CONTENT_GENERATION_CONTRACT_VERSION,
    configuration,
    configuration_fingerprint: stableObjectiveFingerprint(JSON.stringify(configuration))
  };
  normalized.source_repairs = structuredClone(rawBlueprint?.source_repairs || normalized.source_repairs || []);
  normalized.verified_mechanics = buildVerifiedMechanics(normalized);
  normalized.verified_examples = normalized.verified_mechanics.filter((item) => item.kind !== "none").map((item) => ({
    room_number: item.room_number,
    question_number: item.question_number,
    kind: item.kind,
    prompt_value: item.generated_value || item.ordered_items.join(" → "),
    solution: item.kind === "cipher_assertion" ? String(item.expected_boolean) : (item.solution || item.ordered_items.join(" → ")),
    verified: item.verified
  }));
  normalized.quality_report = structuredClone(rawBlueprint?.quality_report || normalized.quality_report || {});
  normalized.plan_fingerprint = stableObjectiveFingerprint(stableObjectiveSerialization({
    configuration: getObjectiveSemanticConfiguration(configuration),
    original_objective_hash: normalized.source_contract.original_objective_hash,
    rooms: normalized.rooms,
    final_unlock: normalized.final_unlock
  }));
  return normalized;
}

function restoreCachedObjectiveBlueprint(formData = {}) {
  try {
    const cacheKeys = [
      OBJECTIVE_BLUEPRINT_STORAGE_KEY,
      ...Object.keys(localStorage).filter((key) => (
        key.startsWith("PigPenCreator.objectiveBlueprint.v") && key !== OBJECTIVE_BLUEPRINT_STORAGE_KEY
      )).sort().reverse()
    ];
    for (const cacheKey of cacheKeys) {
      let cached = null;
      try {
        cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      } catch (_) {
        continue;
      }
      if (!cached?.blueprint) continue;
      const blueprint = upgradeObjectiveBlueprintForReuse(cached.blueprint, formData);
      const key = buildObjectiveBlueprintKey(formData, blueprint.source_contract);
      if (cached.key !== key && !objectiveBlueprintMatchesCurrentForm(cached.blueprint, formData)) continue;
      persistObjectiveBlueprint(key, blueprint);
      return blueprint;
    }
    return null;
  } catch {
    return null;
  }
}

function persistObjectiveBlueprint(key = "", blueprint = null) {
  try {
    if (!key || !blueprint) {
      localStorage.removeItem(OBJECTIVE_BLUEPRINT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(OBJECTIVE_BLUEPRINT_STORAGE_KEY, JSON.stringify({ key, blueprint }));
  } catch {
    // La caché privada es una optimización; la generación sigue funcionando sin ella.
  }
}

async function ensureObjectiveBlueprint(formData = {}) {
  const key = buildObjectiveBlueprintKey(formData, state.objectiveBlueprint?.source_contract);
  if (state.objectiveBlueprint && (state.objectiveBlueprintKey === key || isObjectiveBlueprintCurrent(formData))) {
    return state.objectiveBlueprint;
  }
  const cachedBlueprint = restoreCachedObjectiveBlueprint(formData);
  if (cachedBlueprint) {
    state.objectiveBlueprint = cachedBlueprint;
    state.objectiveBlueprintKey = key;
    return cachedBlueprint;
  }
  updatePreviewGenerationProgress({
    title: "Compilando el objetivo",
    detail: "Separando el contrato pedagógico y el fragmento privado de cada sala"
  });
  setStatus("Creando el objetivo enriquecido y su blueprint por sala…", "info");
  const blueprint = await generateEnrichedObjectiveBrief(formData);
  state.objectiveBlueprint = blueprint;
  state.objectiveBlueprintKey = key;
  persistObjectiveBlueprint(key, blueprint);
  return blueprint;
}

function getObjectiveRoomContract(formData = {}, missionIndex = 0) {
  const blueprint = formData.objectiveBlueprint || state.objectiveBlueprint;
  const room = blueprint?.rooms?.[Number(missionIndex)] || null;
  return room ? structuredClone(room) : null;
}

function getObjectiveQuestionContract(formData = {}, missionIndex = 0) {
  const blueprint = formData.objectiveBlueprint || state.objectiveBlueprint;
  const room = blueprint?.rooms?.[Number(missionIndex)] || null;
  if (!room) return null;
  return {
    room_number: room.room_number,
    title: room.title,
    learning_focus: room.learning_focus,
    room_objective: room.room_objective,
    interaction_anchor: room.interaction_anchor,
    fixed_requirements: room.fixed_requirements,
    narrative_arc: blueprint?.narrative_arc || {},
    narrative_beat: room.narrative_beat,
    source_repairs: room.source_repairs,
    private_curriculum_material: {
      mandatory_anchors: room.mandatory_anchors,
      curriculum_inventory: room.curriculum_inventory
    },
    question_plans: room.question_plans,
    reserve_opportunity: room.reserve_opportunity
  };
}

function getObjectiveBlueprintPromptPayload(formData = {}) {
  const blueprint = formData.objectiveBlueprint || state.objectiveBlueprint;
  if (!blueprint) return null;
  return {
    plan_fingerprint: blueprint.plan_fingerprint,
    purpose: blueprint.purpose,
    experience_goal: blueprint.experience_goal,
    global_criteria: blueprint.global_criteria,
    curriculum_model: blueprint.curriculum_model,
    narrative_arc: blueprint.narrative_arc,
    rooms: blueprint.rooms,
    verified_mechanics: blueprint.verified_mechanics,
    verified_examples: blueprint.verified_examples,
    source_repairs: blueprint.source_repairs,
    source_contract: blueprint.source_contract ? {
      explicit_title: blueprint.source_contract.explicit_title,
      fixed_final_code: blueprint.source_contract.fixed_final_code,
      fixed_code_fragments: blueprint.source_contract.fixed_code_fragments,
      fixed_final_feedback: blueprint.source_contract.fixed_final_feedback,
      fixed_room_feedback: blueprint.source_contract.fixed_room_feedback,
      fixed_interactions: blueprint.source_contract.fixed_interactions,
      deterministic_repairs: blueprint.source_contract.deterministic_repairs,
      configuration_fingerprint: blueprint.source_contract.configuration_fingerprint
    } : null,
    final_unlock: blueprint.final_unlock
  };
}

function getRequiredBriefingEvidenceCount(data = {}, fallback = 4) {
  const requested = Number(data.preguntasPorSala ?? fallback);
  const questionCount = Number.isFinite(requested) ? Math.floor(requested) : fallback;
  return Math.min(5, Math.max(3, Math.ceil(Math.max(1, questionCount) / 2)));
}

function getRequiredTransferQuestionCount(questionCount = 1) {
  const total = Math.max(1, Math.floor(Number(questionCount) || 1));
  return total === 1 ? 1 : Math.ceil((total - 1) / 2);
}

function buildMissionChallengeIntroductionContract() {
  return [
    "CONTRATO DEL CHALLENGE DE SALA:",
    "mission.reto es una escena de transición entre el briefing y el bloque de preguntas.",
    "Redacta entre 25 y 45 palabras en una o dos frases declarativas: muestra el estado actual del mundo, qué está en riesgo y por qué superar esta sala hace avanzar la misión.",
    "Debe funcionar por su intención comunicativa como sinopsis narrativa. No debe dirigirse al estudiante, ordenar acciones, describir mecánicas, enumerar contenidos ni resolver casos."
  ].join(" ");
}

function buildUnifiedContentGenerationContract(data = {}, questionCount = 1) {
  const total = Math.max(1, Math.floor(Number(questionCount) || 1));
  const languageMode = resolvePromptLanguageDirective(data.idioma);
  const timeBudget = getQuestionTimeBudgetSeconds(data);
  return [
    "CONTRATO UNIVERSAL DE AUTORÍA DE SALA:",
    "Multimedia: recurso necesario y exactamente cuatro opciones distintas; respuesta_correcta coincide con una opción. Nunca pide escribir. Completar espacio: lectura con uno o varios marcadores literales ___ sin numerarlos en texto_con_hueco y una pareja privada por hueco (izquierda = número consecutivo desde 1; derecha = palabra o expresión breve). PigPen muestra destinos vacíos dentro del texto y las fichas mezcladas debajo para arrastrar; no pide escribir. Texto exige respuesta exacta, nunca opinión libre ni selección de opciones.",
    buildDifficultyInstruction(data),
    languageMode.directive,
    `Adapta contenido y dificultad a la configuración académica: nivel=${normalizeString(data.nivel, "configurado")}, grado=${normalizeString(data.grado, "configurado")}, bloque/trimestre=${normalizeString(data.trimestre, "configurado")}, materia=${normalizeString(data.materia, "configurada")} y público=${normalizeString(data.publico, "configurado")}; respeta además el perfil lingüístico explícito de inglés B1 cuando el idioma sea inglés; cada actividad dispone aproximadamente de ${timeBudget} segundos.`,
    "B1/B2 en campos de bloque o trimestre son etiquetas académicas; consérvalas sin confundirlas con el requisito independiente de inglés B1 del MCER.",
    "Usa oraciones claras y directas, apropiadas para la configuración académica. Define cualquier término técnico la primera vez que sea necesario y evita acumular jerga en una misma oración. No menciones al estudiante etiquetas internas como blueprint, contrato o plan.",
    "historia ambienta el problema de la sala; contexto y datos_clave enseñan; mission.reto conecta narrativamente con las actividades; preguntas[].reto contiene los únicos enunciados evaluables.",
    buildMissionChallengeIntroductionContract(),
    "El briefing tendrá entre 70 y 100 palabras y de 3 a 5 datos_clave. Enseñará conceptos, reglas o procedimientos con ejemplos distintos de los casos evaluados y sin exigir vocabulario técnico ajeno al nivel configurado.",
    "Respeta cada plan privado como una especificación pedagógica ejecutable. Cada pregunta debe materializar assessment_case_id, case_source, case_data, transfer_delta, reasoning_evidence, reasoning_steps, distractor_errors, integrates_knowledge_ids, conocimiento, aplicación, answer_target, interacción, dificultad y función narrativa. Conserva todos los valores y condiciones de case_data en el enunciado evaluable, integrados en prosa natural sin copiar etiquetas internas. answer_target es la respuesta concreta autoritativa: materialízala únicamente en los campos de respuesta compatibles. Conserva literalmente su _plan_id privado y redacta el caso descrito en application y transfer_delta sin sustituir las operaciones necesarias.",
    "Si el plan contiene mechanic_contract distinto de none, sus valores calculados son inmutables: incluye literalmente ciphertext o scrambled en el campo reto de esa pregunta; no basta colocarlo en pista, briefing o feedback. Esa pista calculada es un dato público necesario, no la solución: intégrala sin descifrarla ni ordenar sus letras. Usa solution únicamente como respuesta privada y conserva ordered_items como orden correcto. No recalcules ni sustituyas esos datos. Si mechanic_contract.kind es none, no inventes un cifrado, anagrama o secuencia calculable: desarrolla el plan mediante una interacción conceptual, de aplicación, interpretación o diagnóstico que no requiera datos mecánicos no declarados.",
    QUESTION_BRIEF_GROUNDING,
    "Cada pregunta será autosuficiente: aporta los datos mínimos del caso y, si hace falta, recuerda el principio ya enseñado sin resolver la aplicación. No añadas conocimientos curriculares nuevos en el enunciado.",
    "La variedad es semántica. No reutilices la misma solución, conjunto de relaciones, caso, regla aplicada o familia de respuestas cambiando solamente la interfaz.",
    "Sincroniza enunciado, solución, estructura activa, pista y feedback. Deja vacíos los campos de respuesta incompatibles con la interacción.",
    "En opción múltiple, la respuesta correcta debe existir literalmente en opciones. En relación y arrastre, cada pareja debe ser inequívoca. En secuencia, la posición de cada elemento debe derivarse de la regla o de los datos, pero reto nunca presenta esos elementos consecutivamente en el orden correcto mediante etiquetas A/B/C, números, conectores temporales ni paráfrasis; la interfaz ya muestra y mezcla las fichas. En completar espacio, el marcador y la solución deben coincidir. En verdadero/falso, el enunciado debe incluir la afirmación completa; la pista y el feedback incorrecto deben orientar al principio aplicable sin declarar por separado true, false o su equivalente en el idioma del juego. Una mención neutral conjunta a ambas opciones no revela el resultado.",
    "Para ordenar_secuencia, elementos es el único lugar que conserva el orden privado. Si application o case_data llegan redactados en orden, no copies su orden expositivo: conserva todos los datos, pero mézclalos en reto y formula el acertijo a partir de dependencias, consecuencias o evidencias que permitan reconstruir la secuencia.",
    "En verdadero/falso, la pista tampoco puede enunciar el hecho corregido, negar la afirmación ni declarar la relación que decide el resultado. Debe pedir comparar, revisar o comprobar una regla sin resolverla.",
    "En relación y arrastre, parejas es la clave privada. Los demás textos pueden presentar el criterio y los elementos por separado, pero no unir cada ficha con su destino correcto.",
    "Cada drag_drop debe tener exactamente 6 parejas completas: 6 fichas arrastrables diferentes y 6 destinos inequívocos. Cada ficha evalúa una correspondencia real; no añadas texto de relleno ni metadatos del plan para alcanzar la cantidad.",
    "En drag_drop y relacion_columnas, plantea una pregunta de aplicación con contexto suficiente para deducir las relaciones. Nunca enumeres asignaciones correctas como 'place MARKER into Bag Pen Slot' o 'coloca X en Y'. Aporta criterios y propiedades, no parejas resueltas. Tampoco reveles correspondencias en título, pista, feedback incorrecto ni campos visuales. Las soluciones quedan en parejas y en el feedback posterior al acierto.",
    "Cada ficha de relación debe contener una pista discriminante que conduzca a una sola pareja usando únicamente datos enseñados en el briefing o incluidos en la propia ficha. Prohíbe descripciones genéricas compatibles con varias respuestas.",
    "En emparejamiento y arrastre, todas las parejas deben aplicar un mismo criterio curricular enseñado en el briefing y anunciado en el enunciado. No mezcles palabra→significado con etiqueta→palabra ni repitas el mismo caso abreviado. Usa sólo fichas académicas reales, nunca knowledge, evidence, application o textos internos convertidos en 'Evidence 1'. El briefing enseña las reglas y significados con ejemplos distintos del caso evaluado; el enunciado aporta datos de aplicación, no conocimientos externos ni una tabla de respuestas para copiar.",
    QUESTION_DIVERSITY_INSTRUCTION,
    "Usa palabra para una o dos palabras, frase_corta para una frase exacta verificable, numero para números y codigo_corto para códigos. Nunca uses frase_libre.",
    "La pista orienta hacia el principio o el siguiente paso mental sin equivaler a la solución.",
    "El feedback correcto combina una explicación breve con el cambio narrativo asignado a esa pregunta y reutiliza al menos una palabra significativa de narrative_effect. El incorrecto mantiene la escena y ofrece una estrategia de revisión sin nombrar ni deletrear la solución. Evita feedback intercambiable entre preguntas.",
    "Los fragmentos y el feedback de finalización son privados y se muestran únicamente cuando se completan todas las preguntas de la sala. No los incluyas en preguntas, imágenes, texto alternativo ni feedback individual.",
    "El ensamblaje o ingreso de la clave final ocurre en la interfaz de desbloqueo después de completar todas las salas. Nunca lo conviertas en una pregunta activa o de reserva, ni siquiera en la última pregunta de la última sala.",
    "La clave final es metadato independiente y puede coincidir con vocabulario, ejemplos, opciones o respuestas académicas. No la presentes explícitamente como clave, código final, contraseña o instrucción de desbloqueo antes del cierre.",
    "Los ejercicios de palabras deben exigir comprensión o deducción apropiada para el nivel; valida internamente que cualquier conjunto de letras, longitud o pista sea compatible con la solución.",
    "No introduzcas nombres propios, hechos reales, excepciones o relaciones externas que no estén sustentados por el contrato curricular. Comprueba internamente la verdad de cada afirmación y la exactitud de cada cálculo antes de emitirla.",
    "Haz que cada acierto produzca una consecuencia narrativa concreta y distinta. Evita repetir como fórmula los mismos verbos, fallos, dispositivos o mensajes de éxito; la última pregunta debe cerrar la tensión local con una aplicación nueva, no repetir las respuestas anteriores.",
    "Toda síntesis debe incluir en su enunciado al menos dos datos concretos de case_data y exigir combinarlos para obtener una conclusión académica. Integra esos datos de forma natural en la situación elegida por el autor, sin imponer un formato documental. Nombrar un recurso narrativo sin aportar información útil no cuenta como dato; la decisión debe exigir razonamiento curricular.",
    "Usa requiere_imagen=true sólo cuando la imagen sea evidencia necesaria. El prompt y el texto alternativo describen la evidencia de forma neutral y nunca contienen la solución.",
    `Antes de emitir el JSON, revisa silenciosamente las ${total} preguntas como una matriz: conocimiento, operación, aplicación, firma de respuesta, interacción y cambio narrativo. Corrige en memoria cualquier repetición o incoherencia y devuelve únicamente la versión final.`
  ].join("\n");
}

function isGeminiInvalidArgument(error) {
  const detail = [
    error?.message,
    error?.code,
    error?.detail?.error,
    error?.detail?.error?.message
  ].filter(Boolean).join(" ");
  return Number(error?.status || error?.detail?.status || 0) === 400
    && /INVALID_ARGUMENT|invalid argument/i.test(detail);
}

function isGeminiQuotaExhausted(error) {
  const detail = [
    error?.message,
    error?.code,
    error?.detail?.error,
    error?.detail?.code,
    error?.detail?.error?.message
  ].filter(Boolean).join(" ");
  return Number(error?.status || error?.detail?.status || 0) === 429
    || /RESOURCE_EXHAUSTED|quota[_ ]exhausted|too many requests/i.test(detail);
}

function getGeminiQuotaRetryDelayMs(error, retryIndex = 0, randomUnit = Math.random()) {
  const advisedSeconds = Number(error?.detail?.retryAfterSeconds || error?.detail?.retryAfter || 0);
  const exponentialSeconds = Math.min(60, 8 * (2 ** Math.max(0, Number(retryIndex) || 0)));
  const baseMs = Math.max(1_000, (advisedSeconds > 0 ? advisedSeconds : exponentialSeconds) * 1_000);
  const jitterMs = Math.round(Math.max(0, Math.min(1, Number(randomUnit) || 0)) * 1_200);
  return Math.min(90_000, baseMs + jitterMs);
}

function isGeminiUpstreamTimeout(error) {
  return [
    error?.message,
    error?.code,
    error?.detail?.error,
    error?.detail?.code,
    error?.detail?.error?.message
  ].filter(Boolean).some((value) => String(value).trim() === "gemini_upstream_timeout");
}

function waitForGeminiRetry(delayMs = 2200) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
}

function cleanGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(cleanGeminiSchema);
  const sanitized = {};
  const unsupportedKeywords = new Set([
    "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum",
    "pattern", "uniqueItems", "$schema", "additionalProperties"
  ]);
  for (const [key, value] of Object.entries(schema)) {
    if (unsupportedKeywords.has(key)) continue;
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const sanitizedProps = {};
      for (const [propKey, propVal] of Object.entries(value)) {
        sanitizedProps[propKey] = cleanGeminiSchema(propVal);
      }
      sanitized[key] = sanitizedProps;
    } else if (key === "items" && value && typeof value === "object") {
      sanitized[key] = cleanGeminiSchema(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

async function requestQualityJson(prompt, formData, temperature = 0.25, { responseJsonSchema = null, singleAttempt = false, minimalPayload = false, textOnly = false, expectedContent = null, validateContent = null } = {}) {
  let activeModel = (textOnly && formData._quotaFallbackModel) || formData.modelo || TEXT_MODEL_DEFAULT;
  let modelFallbackUsed = false;
  const jsonDirective = textOnly ? "Devuelve exclusivamente los bloques de texto solicitados. No devuelvas JSON ni Markdown. Empieza directamente con el primer bloque <<<FIELD ...>>> y concluye con el último <<<END>>> sin bloques de código Markdown ni texto fuera de los bloques." : "Responde únicamente con JSON válido, sin Markdown ni comentarios. CONTRATO PIGPEN: seleccion_multiple no es opcion_multiple. En los tipos nuevos con interaction_data, las fichas están exclusivamente en interaction_data.options y las soluciones en interaction_data.solutions. El campo clásico opciones=[] es correcto y no es un error. seleccion_multiple muestra todo el banco (allowed=[]); incluye 4–8 fichas, al menos 2 correctas y 2 distractores. completar_patron necesita al menos 3 alternativas por hueco con 2 distractores; allowed nunca contiene sólo la solución.";
  const buildRequest = (schema = null, requestTemperature = temperature, { compatibilityMode = false } = {}) => ({
    method: "POST",
    body: {
      model: activeModel,
      ...(singleAttempt ? { singleAttempt: true } : {}),
      ...(textOnly ? { generationProfile: "pigpen-fixed-content" } : {}),
      payload: compatibilityMode
        ? {
            contents: [{ role: "user", parts: [{ text: `${jsonDirective}\n\n${prompt}` }] }]
          }
        : {
            systemInstruction: { parts: [{ text: jsonDirective }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              ...(schema ? { responseSchema: cleanGeminiSchema(schema), responseJsonSchema: cleanGeminiSchema(schema) } : {}),
              temperature: requestTemperature,
              maxOutputTokens: 16384
            }
          }
    }
  });
  minimalPayload = minimalPayload || textOnly;
  let activeSchema = minimalPayload ? null : responseJsonSchema;
  let compatibilityRetryUsed = minimalPayload;
  const performRequest = async () => {
    if (compatibilityRetryUsed) {
      return authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), buildRequest(null, temperature, { compatibilityMode: true }));
    }
    try {
      return await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), buildRequest(activeSchema));
    } catch (error) {
      if (singleAttempt || !isGeminiInvalidArgument(error)) throw error;
      console.warn("[PigPenCreator] Vertex rechazó la configuración de salida; se repetirá sin esquema ni parámetros opcionales y con validación local.");
      activeSchema = null;
      compatibilityRetryUsed = true;
      return authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), buildRequest(null, temperature, { compatibilityMode: true }));
    }
  };
  let response;
  let quotaRetries = 0;
  let timeoutRetries = 0;
  while (!response) {
    try {
      response = await performRequest();
      if (textOnly && expectedContent) {
        try {
          const candidates = response?.candidates || response?.response?.candidates || [];
          if (candidates.some(candidate => candidate.finishReason === 'MAX_TOKENS')) throw new Error('El modelo agotó su límite de salida antes de terminar los campos.');
          fillContentDocument(expectedContent, extractGeminiText(response));
          if(validateContent){const issues=validateContent(extractGeminiText(response));if(issues?.length)throw new Error(issues.join(' · '));}
        } catch (cause) {
          response = null;
          const invalidContent = new Error(cause.message);
          invalidContent.code = 'pigpen_invalid_text_content';
          invalidContent.cause = cause;
          throw invalidContent;
        }
      }
      if (modelFallbackUsed) formData._quotaFallbackModel = activeModel;
    } catch (error) {
      if (!error?.status && /failed to fetch|networkerror|network request failed|load failed/i.test(String(error?.message || ''))) {
        const disconnected = new Error("Se interrumpió la conexión con Gemini antes de recibir la respuesta. No se reintentó automáticamente y no podemos confirmar si el servidor terminó esa solicitud. Los avances guardados se conservan; cuando vuelva la conexión, pulsa Recrear y enriquecer objetivo para continuar.");
        disconnected.code = "gemini_network_interrupted";
        disconnected.cause = error;
        throw disconnected;
      }
      if (singleAttempt) {
        if (textOnly && (isGeminiQuotaExhausted(error) || error?.code === 'pigpen_invalid_text_content') && !modelFallbackUsed) {
          const cleanModel = String(activeModel).replace(/^.*\/models\//, '').replace(/^models\//, '');
          activeModel = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'].includes(cleanModel)
            ? 'gemini-3.6-flash' : 'gemini-3.5-flash-lite';
          modelFallbackUsed = true;
          setStatus(`${error?.code === 'pigpen_invalid_text_content' ? 'La respuesta del modelo no superó la revisión.' : 'El modelo anterior devolvió 429.'} Probando ${activeModel} para este mismo contenido…`, 'info');
          continue;
        }
        if (error?.code === 'pigpen_invalid_text_content') {
          error.message = `No se pudo obtener contenido válido tras dos intentos secuenciales. ${error.message} Las salas ya guardadas se conservan.`;
          throw error;
        }
        if (isGeminiUpstreamTimeout(error)) {
          error.message = "Gemini no terminó dentro del tiempo de espera del servidor. No se lanzó otra solicitud. Las salas terminadas están guardadas; vuelve a iniciar para continuar con la pendiente.";
          throw error;
        }
        if (isGeminiQuotaExhausted(error)) {
          error.modelFallbackUsed = modelFallbackUsed;
          error.message = modelFallbackUsed
            ? "El último modelo devolvió 429. El proceso se detuvo tras dos intentos secuenciales sin completar el contenido; los avances guardados se conservan. Intenta continuar más tarde."
            : "Gemini devolvió 429. El proceso se detuvo sin reintentos automáticos. Las salas terminadas se conservaron; vuelve a iniciar para continuar con la pendiente.";
        }
        throw error;
      }
      if (isGeminiQuotaExhausted(error)) {
        if (quotaRetries >= 2) {
          const persistentQuota = new Error("Gemini mantuvo agotada la cuota después de tres intentos. Las salas completadas permanecen guardadas en el borrador para continuar después.");
          persistentQuota.code = "gemini_quota_exhausted";
          persistentQuota.status = 429;
          persistentQuota.detail = error?.detail;
          persistentQuota.cause = error;
          throw persistentQuota;
        }
        const delayMs = getGeminiQuotaRetryDelayMs(error, quotaRetries);
        quotaRetries += 1;
        const waitSeconds = Math.max(1, Math.ceil(delayMs / 1_000));
        console.warn(`[PigPenCreator] Cuota temporal de Gemini agotada. Reintento ${quotaRetries} de 2 en ${waitSeconds} s.`);
        setStatus(`Gemini devolvió 429 (límite de solicitudes o capacidad temporal). Las salas listas están guardadas; se reintentará automáticamente en ${waitSeconds} s…`, "info");
        await waitForGeminiRetry(delayMs);
        continue;
      }
      if (!isGeminiUpstreamTimeout(error)) throw error;
      if (timeoutRetries >= 1) {
        const persistentTimeout = new Error("Gemini no respondió dentro del tiempo disponible después de dos intentos. El objetivo original y el último plan válido se conservaron; inténtalo nuevamente.");
        persistentTimeout.code = "gemini_upstream_timeout";
        persistentTimeout.cause = error;
        throw persistentTimeout;
      }
      timeoutRetries += 1;
      console.warn("[PigPenCreator] Gemini tardó más de lo esperado. Reintentando la generación una vez.");
      setStatus("Gemini tardó más de lo esperado. Reintentando la generación una vez…", "info");
      await waitForGeminiRetry();
    }
  }
  if (textOnly) {
    const candidates = response?.candidates || response?.response?.candidates || [];
    if (candidates.some(candidate => candidate.finishReason === "MAX_TOKENS")) throw new Error("Gemini no terminó los textos solicitados. La plantilla local y las salas terminadas se conservan.");
    return extractGeminiText(response);
  }
  try {
    return extractJsonFromGeminiResponse(response);
  } catch (parseError) {
    if (singleAttempt) throw parseError;
    const malformed = extractGeminiText(response);
    if (!malformed) throw parseError;
    return repairQualityJsonSyntax(malformed, formData, {
      responseJsonSchema: compatibilityRetryUsed ? null : activeSchema
    });
  }
}

function extractGeminiText(rawResponse = {}) {
  return (rawResponse?.candidates?.[0]?.content?.parts || [])
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .join("")
    .trim()
    || normalizeString(rawResponse?.text || rawResponse?.output_text, "");
}

async function repairQualityJsonSyntax(malformed, formData = {}, { responseJsonSchema = null } = {}) {
  const pendingText = String(malformed || "").trim();
  if (!pendingText) throw new Error("La IA no devolvió contenido JSON para reparar.");
  const repairInstruction = "Repara únicamente la sintaxis del JSON recibido: comas, comillas, escapes y cierres. No resumas, no elimines campos, no cambies valores y responde solo JSON válido.";
  const buildRepairRequest = ({ compatibilityMode = false } = {}) => ({
    method: "POST",
    body: {
      model: formData.modelo || TEXT_MODEL_DEFAULT,
      payload: compatibilityMode
        ? {
            contents: [{ role: "user", parts: [{ text: `${repairInstruction}\n\n${pendingText}` }] }]
          }
        : {
            systemInstruction: { parts: [{ text: repairInstruction }] },
            contents: [{ role: "user", parts: [{ text: pendingText }] }],
            generationConfig: {
              responseMimeType: "application/json",
              ...(responseJsonSchema ? { responseSchema: cleanGeminiSchema(responseJsonSchema), responseJsonSchema: cleanGeminiSchema(responseJsonSchema) } : {}),
              temperature: 0,
              maxOutputTokens: 16384
            }
          }
    }
  });
  let repairedResponse;
  try {
    repairedResponse = await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), buildRepairRequest());
  } catch (error) {
    if (!isGeminiInvalidArgument(error)) throw error;
    console.warn("[PigPenCreator] Vertex rechazó la configuración del reparador JSON; se repetirá en modo de compatibilidad.");
    repairedResponse = await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), buildRepairRequest({ compatibilityMode: true }));
  }
  return extractGeneratedJson(extractGeminiText(repairedResponse));
}

async function analyzeBriefingsBeforeRepair(project, formData) {
  const report = await requestQualityJson([
    "PRIMERA ETAPA OBLIGATORIA: analiza por separado el briefing de cada sala antes de evaluar o crear preguntas.",
    "Para cada sala revisa historia, contexto, datos_clave, reto, idioma, nivel, contradicciones, suficiencia y variedad de evidencias.",
    "Todavía no propongas preguntas. Indica qué definiciones, principios, reglas, procedimientos, condiciones y ejemplos enseña, y si permiten comprensión directa o transferencia sin conocimiento externo no explicado.",
    "No rechaces un briefing existente únicamente porque no permita transferencia: puede aprobarse si sustenta preguntas literales válidas. Nunca propongas ampliarlo automáticamente para justificar una pregunta nueva.",
    'Devuelve {"approved":true|false,"rooms":[{"roomIndex":0,"summary":"","evidence":[""],"approved":true|false}],"issues":[{"code":"","message":"","roomIndex":0,"questionIndex":null,"field":"contexto"}]}.',
    "Debe existir una entrada rooms para cada sala, usando índices base cero.",
    JSON.stringify(stripHeavyAssetsFromProject(project))
  ].join("\n"), formData, 0.1);
  const rooms = Array.isArray(report.rooms) ? report.rooms : [];
  const issues = normalizeAiAuditIssues(report);
  if (rooms.length !== (project.misiones || []).length) {
    issues.push({
      code: "incomplete_briefing_analysis",
      message: "Gemini no analizó individualmente todos los briefings.",
      roomIndex: null,
      questionIndex: null,
      field: "contexto"
    });
  }
  rooms.forEach((room) => {
    if (room?.approved !== false) return;
    const roomIndex = room.roomIndex !== null && room.roomIndex !== undefined && room.roomIndex !== "" && Number.isInteger(Number(room.roomIndex))
      ? Number(room.roomIndex)
      : null;
    if (issues.some((issue) => issue.roomIndex === roomIndex)) return;
    issues.push({
      code: "briefing_not_approved",
      message: normalizeString(room.summary, "El briefing no sustenta preguntas coherentes y variadas."),
      roomIndex,
      questionIndex: null,
      field: "contexto"
    });
  });
  return { approved: issues.length === 0, rooms, issues };
}

function assertEditorialRepairStructure(sourceProject = {}, correctedProject = {}) {
  const requiredProjectFields = [
    "modo_presentacion", "titulo", "subtitulo", "introduccion", "instrucciones",
    "ambientacion", "linea_visual_base", "clave_final", "misiones", "conclusion"
  ];
  const requiredMissionFields = [
    "id", "release", "titulo", "historia", "contexto", "datos_clave", "reto",
    "preguntas", "desbloquea", "bloqueada_inicial"
  ];
  const requiredQuestionFields = [
    "id", "titulo", "reto", "tipo_interaccion", "subtipo_respuesta",
    "respuesta_correcta", "respuestas_aceptadas", "opciones", "parejas", "elementos",
    "texto_con_hueco", "pista", "retroalimentacion_correcta",
    "retroalimentacion_incorrecta", "requiere_imagen", "imagen_prompt", "imagen_alt", "imagen"
  ];
  if (!correctedProject || typeof correctedProject !== "object" || Array.isArray(correctedProject)) {
    throw new Error("La reparación no devolvió un proyecto JSON completo.");
  }
  const missingProjectField = requiredProjectFields.find((field) => !Object.hasOwn(correctedProject, field));
  if (missingProjectField) {
    throw new Error(`La reparación omitió el campo obligatorio ${missingProjectField}.`);
  }
  const sourceMissions = Array.isArray(sourceProject.misiones) ? sourceProject.misiones : [];
  const correctedMissions = Array.isArray(correctedProject.misiones) ? correctedProject.misiones : [];
  if (correctedMissions.length !== sourceMissions.length) {
    throw new Error(`La reparación debe conservar exactamente ${sourceMissions.length} salas.`);
  }
  correctedMissions.forEach((mission, missionIndex) => {
    const missingMissionField = requiredMissionFields.find((field) => !Object.hasOwn(mission || {}, field));
    if (missingMissionField) {
      throw new Error(`La reparación omitió ${missingMissionField} en la sala ${missionIndex + 1}.`);
    }
    const sourceQuestions = Array.isArray(sourceMissions[missionIndex]?.preguntas)
      ? sourceMissions[missionIndex].preguntas
      : [];
    const correctedQuestions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
    if (correctedQuestions.length !== sourceQuestions.length) {
      throw new Error(`La reparación debe conservar exactamente ${sourceQuestions.length} preguntas en la sala ${missionIndex + 1}.`);
    }
    correctedQuestions.forEach((question, questionIndex) => {
      const missingQuestionField = requiredQuestionFields.find((field) => !Object.hasOwn(question || {}, field));
      if (missingQuestionField) {
        throw new Error(`La reparación omitió ${missingQuestionField} en la sala ${missionIndex + 1}, pregunta ${questionIndex + 1}.`);
      }
    });
  });
}

const QUESTION_EDITORIAL_REWRITE_FIELDS = Object.freeze([
  "titulo", "reto", "subtipo_respuesta", "respuesta_correcta", "respuestas_aceptadas",
  "opciones", "parejas", "elementos", "texto_con_hueco", "pista",
  "retroalimentacion_correcta", "retroalimentacion_incorrecta",
  "imagen_prompt", "imagen_alt", "media.alt"
]);

function buildEditorialRepairPatchSchema(issues = [], sourceProject = {}) {
  const stringField = { type: "string" };
  const stringArray = { type: "array", items: stringField };
  const pairArray = {
    type: "array",
    items: {
      type: "object",
      properties: {
        izquierda: stringField,
        derecha: stringField,
        pista: stringField
      },
      required: ["izquierda", "derecha", "pista"]
    }
  };
  const mediaField = {
    type: "object",
    properties: {
      tipo: stringField,
      url: stringField,
      alt: stringField,
      titulo: stringField,
      texto: stringField
    }
  };
  const changeProperties = {
      titulo: stringField,
      subtitulo: stringField,
      introduccion: stringField,
      instrucciones: stringField,
      ambientacion: stringField,
      linea_visual_base: stringField,
      estilo_visual: stringField,
      clave_final: stringField,
      conclusion: stringField,
      historia: stringField,
      contexto: stringField,
      datos_clave: stringArray,
      reto: stringField,
      pista: stringField,
      briefing_titulo: stringField,
      briefing_instruccion: stringField,
      briefing_evidencias_titulo: stringField,
      briefing_objetivo_titulo: stringField,
      briefing_boton_inicio: stringField,
      briefing_boton_revisar: stringField,
      briefing_mensaje_listo: stringField,
      tipo_interaccion: stringField,
      subtipo_respuesta: stringField,
      respuesta_correcta: stringField,
      respuestas_aceptadas: stringArray,
      opciones: stringArray,
      parejas: pairArray,
      elementos: stringArray,
      texto_con_hueco: stringField,
      retroalimentacion_correcta: stringField,
      retroalimentacion_incorrecta: stringField,
      imagen_prompt: stringField,
      imagen_alt: stringField,
      media: mediaField,
      "media.alt": stringField
  };
  const createChangesSchema = (requiredFields = []) => {
    const uniqueFields = [...new Set(requiredFields)].filter((field) => Object.hasOwn(changeProperties, field));
    return {
      type: "object",
      properties: Object.fromEntries(uniqueFields.map((field) => [field, changeProperties[field]])),
      ...(uniqueFields.length ? { required: uniqueFields } : {})
    };
  };
  const permissions = buildEditorialRepairPermissions(issues, sourceProject);
  const projectFields = [...permissions.project];
  const roomIndex = [...permissions.missions.keys()][0];
  const questionKey = [...permissions.questions.keys()][0];
  const [questionRoomIndex, questionIndex] = String(questionKey || "").split(":").map(Number);
  const hasQuestionTarget = Number.isInteger(questionRoomIndex) && Number.isInteger(questionIndex);
  const roomFields = Number.isInteger(roomIndex)
    ? [...(permissions.missions.get(roomIndex) || [])]
    : [];
  const questionFields = hasQuestionTarget
    ? [...(permissions.questions.get(`${questionRoomIndex}:${questionIndex}`) || [])]
    : [];
  const targetFields = questionFields.length ? questionFields : roomFields.length ? roomFields : projectFields;
  return {
    type: "object",
    properties: {
      changes: createChangesSchema(targetFields)
    },
    required: ["changes"]
  };
}

function expandSingleTargetEditorialPatch(patch = {}, issue = {}) {
  if (!patch?.changes || typeof patch.changes !== "object" || Array.isArray(patch.changes)) return patch;
  const roomIndex = Number(issue?.roomIndex);
  const questionIndex = Number(issue?.questionIndex);
  const hasRoom = issue?.roomIndex !== null && issue?.roomIndex !== undefined && Number.isInteger(roomIndex);
  const hasQuestion = issue?.questionIndex !== null && issue?.questionIndex !== undefined && Number.isInteger(questionIndex);
  if (!hasRoom) return { globalChanges: patch.changes, rooms: [] };
  return {
    globalChanges: {},
    rooms: [{
      roomIndex,
      changes: hasQuestion ? {} : patch.changes,
      questions: hasQuestion ? [{ questionIndex, changes: patch.changes }] : []
    }]
  };
}

function buildEditorialRepairPermissions(issues = [], sourceProject = {}) {
  const project = new Set();
  const missions = new Map();
  const questions = new Map();
  const add = (map, key, fields = []) => {
    if (!map.has(key)) map.set(key, new Set());
    fields.forEach((field) => map.get(key).add(field));
  };
  const answerFields = ["respuesta_correcta", "respuestas_aceptadas"];
  const interactionFields = [
    "tipo_interaccion", "subtipo_respuesta", ...answerFields,
    "opciones", "parejas", "elementos", "texto_con_hueco"
  ];

  (Array.isArray(issues) ? issues : []).forEach((issue) => {
    const field = normalizeString(issue?.field, "contenido");
    const roomIndex = Number(issue?.roomIndex);
    const questionIndex = Number(issue?.questionIndex);
    const hasRoom = issue?.roomIndex !== null && issue?.roomIndex !== undefined && Number.isInteger(roomIndex);
    const hasQuestion = issue?.questionIndex !== null && issue?.questionIndex !== undefined && Number.isInteger(questionIndex);
    if (!hasRoom) {
      project.add(field);
      return;
    }
    if (!hasQuestion) {
      add(missions, roomIndex, [field]);
      return;
    }

    const briefingFields = new Set([
      "historia", "contexto", "datos_clave",
      "briefing_titulo", "briefing_instruccion", "briefing_evidencias_titulo",
      "briefing_objetivo_titulo", "briefing_boton_inicio", "briefing_boton_revisar",
      "briefing_mensaje_listo"
    ]);
    if (briefingFields.has(field)) {
      add(missions, roomIndex, [field]);
      return;
    }

    const key = `${roomIndex}:${questionIndex}`;
    const targetQuestion = sourceProject?.misiones?.[roomIndex]?.preguntas?.[questionIndex] || null;
    const isMultipleChoice = normalizeString(targetQuestion?.tipo_interaccion, "") === "opcion_multiple";
    const isDuplicateAnswer = ["respuesta_correcta", "respuestas_aceptadas"].includes(field)
      && /\b(?:repeat|repeated|duplicate|duplicated)\b|\b(?:repite|repetida|repetido|duplicada|duplicado)\b/i.test(normalizeString(issue?.message, ""));
    const describesAltText = /\b(?:alt|alternative)\s+text\b|texto\s+alternativo/i.test(normalizeString(issue?.message, ""));
    if (field === "media.alt") add(questions, key, ["media.alt", "imagen_alt"]);
    else if (field === "imagen_alt") add(questions, key, ["imagen_alt", "media.alt"]);
    else if (field === "media" && describesAltText) add(questions, key, ["media", "media.alt", "imagen_alt"]);
    else if (field === "tipo_interaccion") add(questions, key, interactionFields);
    else if (isDuplicateAnswer) add(questions, key, [
      "reto", ...answerFields, "opciones", "texto_con_hueco", "pista",
      "retroalimentacion_correcta", "retroalimentacion_incorrecta"
    ]);
    else if (answerFields.includes(field)) add(questions, key, isMultipleChoice ? [...answerFields, "opciones"] : answerFields);
    else if (field === "preguntas") add(questions, key, QUESTION_EDITORIAL_REWRITE_FIELDS);
    else add(questions, key, [field]);
  });
  return { project, missions, questions };
}

function applyEditorialRepairPatch(sourceProject = {}, patch = {}, issues = []) {
  const projectFields = new Set([
    "titulo", "subtitulo", "introduccion", "instrucciones", "ambientacion",
    "linea_visual_base", "estilo_visual", "clave_final", "conclusion"
  ]);
  const missionFields = new Set([
    "titulo", "historia", "contexto", "datos_clave", "reto", "pista",
    "briefing_titulo", "briefing_instruccion", "briefing_evidencias_titulo",
    "briefing_objetivo_titulo", "briefing_boton_inicio", "briefing_boton_revisar",
    "briefing_mensaje_listo", "tipo_interaccion", "subtipo_respuesta",
    "respuesta_correcta", "respuestas_aceptadas", "opciones", "parejas", "elementos",
    "texto_con_hueco", "retroalimentacion_correcta", "retroalimentacion_incorrecta",
    "imagen_prompt", "imagen_alt", "media"
  ]);
  const questionFields = new Set([
    "titulo", "reto", "tipo_interaccion", "subtipo_respuesta", "respuesta_correcta",
    "respuestas_aceptadas", "opciones", "parejas", "elementos", "texto_con_hueco",
    "pista", "retroalimentacion_correcta", "retroalimentacion_incorrecta",
    "imagen_prompt", "imagen_alt", "media"
  ]);
  const permissions = buildEditorialRepairPermissions(issues, sourceProject);
  const nextProject = structuredClone(sourceProject);
  let applied = 0;
  const assignAllowed = (target, changes, allowed, permitted, preserveMediaUrl = false) => {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) return;
    Object.entries(changes).forEach(([field, value]) => {
      if (field === "media.alt" && allowed.has("media") && permitted.has("media.alt")) {
        target.media = { ...(target.media || {}), alt: value, url: target.media?.url || "" };
        if (allowed.has("imagen_alt") && permitted.has("imagen_alt")) target.imagen_alt = value;
        applied += 1;
        return;
      }
      if (!allowed.has(field) || !permitted.has(field)) return;
      if (field === "media" && value && typeof value === "object" && !Array.isArray(value)) {
        target.media = {
          ...(target.media || {}),
          ...value,
          ...(preserveMediaUrl ? { url: target.media?.url || "" } : {})
        };
        if (Object.hasOwn(value, "alt") && allowed.has("imagen_alt") && permitted.has("imagen_alt")) {
          target.imagen_alt = value.alt;
        }
      } else {
        const previousValue = field === "reto" ? normalizeString(target.reto, "") : "";
        if (field === "elementos") target[field] = normalizeSequenceItems(value);
        else if (field === "opciones" || field === "respuestas_aceptadas" || field === "datos_clave") target[field] = normalizeTextList(value);
        else if (field === "parejas") target[field] = normalizePairList(value);
        else target[field] = value;
        if (["respuesta_correcta", "respuestas_aceptadas"].includes(field)
          && ["texto", "multimedia", "completar_espacio"].includes(target.tipo_interaccion)) {
          const canonicalAnswer = normalizeString(
            target.respuesta_correcta || normalizeTextList(target.respuestas_aceptadas || [])[0],
            ""
          );
          target.subtipo_respuesta = resolveTextSubtypeForAnswer(target.subtipo_respuesta, canonicalAnswer);
        }
        if (field === "reto" && target.media && normalizeString(target.media.texto, "") === previousValue) {
          target.media = { ...target.media, texto: value, url: target.media.url || "" };
        }
        if (field === "reto" && target.tipo_interaccion === "completar_espacio"
          && normalizeString(target.texto_con_hueco, "") === previousValue) {
          target.texto_con_hueco = value;
        }
        if (field === "imagen_alt" && target.media && permitted.has("media.alt")) {
          target.media = { ...target.media, alt: value, url: target.media.url || "" };
        }
      }
      applied += 1;
    });
  };

  assignAllowed(
    nextProject,
    patch.globalChanges || patch.global || patch.projectChanges,
    projectFields,
    permissions.project
  );
  const roomPatches = Array.isArray(patch.rooms) ? patch.rooms : [];
  roomPatches.forEach((roomPatch) => {
    const missionIndex = Number(roomPatch?.roomIndex ?? roomPatch?.index);
    const mission = nextProject.misiones?.[missionIndex];
    if (!Number.isInteger(missionIndex) || !mission) return;
    assignAllowed(mission, roomPatch.changes, missionFields, permissions.missions.get(missionIndex) || new Set(), true);
    const questionPatches = Array.isArray(roomPatch.questions) ? roomPatch.questions : [];
    questionPatches.forEach((questionPatch) => {
      const questionIndex = Number(questionPatch?.questionIndex ?? questionPatch?.index);
      const question = mission.preguntas?.[questionIndex];
      if (!Number.isInteger(questionIndex) || !question) return;
      assignAllowed(
        question,
        questionPatch.changes,
        questionFields,
        permissions.questions.get(`${missionIndex}:${questionIndex}`) || new Set(),
        true
      );
    });
  });
  return nextProject;
}

function getEditorialIssueValue(project = {}, issue = {}) {
  const roomIndex = Number(issue?.roomIndex);
  const questionIndex = Number(issue?.questionIndex);
  const hasRoom = issue?.roomIndex !== null && issue?.roomIndex !== undefined && Number.isInteger(roomIndex);
  const hasQuestion = issue?.questionIndex !== null && issue?.questionIndex !== undefined && Number.isInteger(questionIndex);
  const target = hasQuestion
    ? project?.misiones?.[roomIndex]?.preguntas?.[questionIndex]
    : hasRoom
      ? project?.misiones?.[roomIndex]
      : project;
  if (!target || typeof target !== "object") return undefined;
  if (hasQuestion && issue.field === "preguntas") {
    return Object.fromEntries(QUESTION_EDITORIAL_REWRITE_FIELDS.map((field) => [field, target[field]]));
  }
  if (issue.field === "media.alt") return target.media?.alt;
  return target[issue.field];
}

function editorialIssueValueChanged(beforeProject = {}, afterProject = {}, issue = {}) {
  return JSON.stringify(getEditorialIssueValue(beforeProject, issue))
    !== JSON.stringify(getEditorialIssueValue(afterProject, issue));
}

function formatEditorialRepairTargets(issues = []) {
  const targets = issues.map((issue) => {
    const roomIndex = Number(issue?.roomIndex);
    const questionIndex = Number(issue?.questionIndex);
    const hasRoom = issue?.roomIndex !== null && issue?.roomIndex !== undefined && Number.isInteger(roomIndex);
    const hasQuestion = issue?.questionIndex !== null && issue?.questionIndex !== undefined && Number.isInteger(questionIndex);
    if (!hasRoom) return `globalChanges.${issue.field}`;
    if (!hasQuestion) return `rooms[roomIndex=${roomIndex}].changes.${issue.field}`;
    if (issue.field === "preguntas") {
      return `rooms[roomIndex=${roomIndex}].questions[questionIndex=${questionIndex}].changes { ${QUESTION_EDITORIAL_REWRITE_FIELDS.join(", ")} }`;
    }
    return `rooms[roomIndex=${roomIndex}].questions[questionIndex=${questionIndex}].changes.${issue.field}`;
  });
  return [...new Set(targets)].join("\n");
}

function mergeEditorialIssuesByTarget(issues = []) {
  const merged = new Map();
  issues.forEach((issue) => {
    const target = [issue?.roomIndex ?? "global", issue?.questionIndex ?? "room", issue?.field || "contenido"].join(":");
    if (!merged.has(target)) {
      merged.set(target, { ...issue, message: normalizeString(issue?.message, "El contenido necesita corrección editorial.") });
      return;
    }
    const current = merged.get(target);
    const messages = [current.message, normalizeString(issue?.message, "")].filter(Boolean);
    current.message = [...new Set(messages)].join(" Requisito adicional: ");
  });
  return [...merged.values()];
}

function normalizeEditorialRepairIssueTarget(issue = {}) {
  const field = normalizeString(issue?.field, "contenido");
  const roomIndex = Number(issue?.roomIndex);
  const questionIndex = Number(issue?.questionIndex);
  const hasRoom = issue?.roomIndex !== null && issue?.roomIndex !== undefined && Number.isInteger(roomIndex);
  const hasQuestion = issue?.questionIndex !== null && issue?.questionIndex !== undefined && Number.isInteger(questionIndex);
  const projectFields = new Set([
    "titulo", "subtitulo", "introduccion", "instrucciones", "ambientacion",
    "linea_visual_base", "estilo_visual", "clave_final", "conclusion"
  ]);
  const missionFields = new Set([
    "titulo", "historia", "contexto", "datos_clave", "reto", "pista",
    "briefing_titulo", "briefing_instruccion", "briefing_evidencias_titulo",
    "briefing_objetivo_titulo", "briefing_boton_inicio", "briefing_boton_revisar",
    "briefing_mensaje_listo", "imagen_prompt", "imagen_alt", "media"
  ]);
  const questionFields = new Set([
    "preguntas", "titulo", "reto", "tipo_interaccion", "subtipo_respuesta",
    "respuesta_correcta", "respuestas_aceptadas", "opciones", "parejas",
    "elementos", "texto_con_hueco", "pista", "retroalimentacion_correcta",
    "retroalimentacion_incorrecta", "imagen_prompt", "imagen_alt", "media", "media.alt"
  ]);
  if (!hasRoom) return { ...issue, field: projectFields.has(field) ? field : "instrucciones" };
  if (!hasQuestion) return { ...issue, field: missionFields.has(field) ? field : "contexto" };
  return { ...issue, field: questionFields.has(field) ? field : "preguntas" };
}

function buildEditorialDiversityExclusionContext(project = {}, issue = {}) {
  if (issue?.field !== "preguntas") return "";
  const roomIndex = Number(issue.roomIndex);
  const questionIndex = Number(issue.questionIndex);
  const mission = project?.misiones?.[roomIndex];
  const targetQuestion = mission?.preguntas?.[questionIndex];
  if (!mission || !targetQuestion) return "";
  const usedQuestionProfiles = (Array.isArray(project.misiones) ? project.misiones : [])
    .flatMap((item, itemRoomIndex) => (Array.isArray(item?.preguntas) ? item.preguntas : [])
      .map((question, itemQuestionIndex) => ({ question, itemRoomIndex, itemQuestionIndex })))
    .filter(({ itemRoomIndex, itemQuestionIndex }) => (
      itemRoomIndex !== roomIndex || itemQuestionIndex !== questionIndex
    ))
    .map(({ question, itemRoomIndex, itemQuestionIndex }) => ({
      roomIndex: itemRoomIndex,
      questionIndex: itemQuestionIndex,
      tipo_interaccion: question.tipo_interaccion,
      titulo: question.titulo,
      reto: question.reto,
      respuesta_correcta: question.respuesta_correcta,
      respuestas_aceptadas: question.respuestas_aceptadas,
      opciones: question.opciones,
      parejas: question.parejas,
      elementos: question.elementos,
      texto_con_hueco: question.texto_con_hueco,
      coverage_anchor: question._coverage_anchor
    }));
  return [
    "CONTRATO DE DIVERSIDAD DE LA PREGUNTA OBJETIVO:",
    `Conserva tipo_interaccion=${normalizeString(targetQuestion.tipo_interaccion, "texto")}.`,
    "No reutilices ni parafrasees el conocimiento central, las pistas posicionales, el caso, la operación cognitiva ni la familia semántica de respuestas de ninguno de los perfiles ya usados.",
    "Selecciona otra evidencia de contexto o datos_clave de la sala objetivo. Si debes reutilizar un principio general, crea un caso de aplicación con datos de entrada completos, otra operación cognitiva y una respuesta semánticamente distinta.",
    "La pregunta nueva debe poder distinguirse por su aprendizaje, no solamente por cambiar la mecánica, el título o el orden de las palabras.",
    `EVIDENCIAS DISPONIBLES EN LA SALA OBJETIVO:\n${JSON.stringify(normalizeTextList(mission.datos_clave || []))}`,
    `PERFILES QUE NO DEBES REPETIR:\n${JSON.stringify(usedQuestionProfiles)}`
  ].join("\n");
}

function buildEditorialRepairSourcePayload(project = {}, issue = {}) {
  const payload = buildContentAuditPayload(project);
  if (issue?.field !== "preguntas") return payload;
  const roomIndex = Number(issue.roomIndex);
  const questionIndex = Number(issue.questionIndex);
  const sourceQuestion = project?.misiones?.[roomIndex]?.preguntas?.[questionIndex];
  const targetQuestions = payload?.misiones?.[roomIndex]?.preguntas;
  if (!sourceQuestion || !Array.isArray(targetQuestions) || !targetQuestions[questionIndex]) return payload;
  // El contenido rechazado no se ofrece como plantilla: solo se conservan los
  // campos estructurales que la reparación no tiene permiso de cambiar.
  targetQuestions[questionIndex] = {
    id: sourceQuestion.id,
    tipo_interaccion: sourceQuestion.tipo_interaccion,
    requiere_imagen: sourceQuestion.requiere_imagen === true || sourceQuestion.requires_image === true,
    contenido_editorial_retirado: true
  };
  return payload;
}

function editorialVarietyIssueStillPresent(project = {}, issue = {}) {
  if (issue?.field !== "preguntas") return false;
  const describesRepetition = /\b(?:repeat|repeated|duplicate|duplicated|similar|same\s+knowledge)\b|\b(?:repite|repetida|repetido|duplicada|duplicado|similar|reutiliza)\b|parece\s+demasiado/iu
    .test(normalizeString(issue?.message, ""));
  if (!describesRepetition) return false;
  const roomIndex = Number(issue.roomIndex);
  const questionIndex = Number(issue.questionIndex);
  return auditEscapeRoomText(project).issues.some((candidate) => (
    Number(candidate.roomIndex) === roomIndex
    && Number(candidate.questionIndex) === questionIndex
    && candidate.field === "preguntas"
    && ["repeated_question", "repeated_activity_content", "repeated_learning_target"].includes(candidate.code)
  ));
}

async function replaceEditorialQuestionFromCleanSlate(project = {}, issue = {}, formData = {}) {
  const roomIndex = Number(issue?.roomIndex);
  const questionIndex = Number(issue?.questionIndex);
  const mission = project?.misiones?.[roomIndex];
  const sourceQuestion = mission?.preguntas?.[questionIndex];
  if (!Number.isInteger(roomIndex) || !Number.isInteger(questionIndex) || !mission || !sourceQuestion) {
    return null;
  }
  const excludedQuestions = (Array.isArray(project.misiones) ? project.misiones : [])
    .flatMap((item, itemRoomIndex) => (Array.isArray(item?.preguntas) ? item.preguntas : [])
      .filter((_, itemQuestionIndex) => itemRoomIndex !== roomIndex || itemQuestionIndex !== questionIndex));
  const basePrompt = buildQuestionRegenerationPrompt({
    formData,
    mission,
    missionIndex: roomIndex,
    questionIndex,
    sourceQuestion,
    excludedQuestions
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryInstruction = attempt
      ? "\nLa propuesta anterior seguía repitiendo una pregunta existente. Elige otra evidencia del briefing, otra operación cognitiva y otra familia semántica de respuesta; no reutilices el caso rechazado."
      : "";
    const response = await requestQualityJson(`${basePrompt}${retryInstruction}`, formData, attempt ? 0.65 : 0.5, {
      responseJsonSchema: buildQuestionsResponseSchema(1, 1, { singleQuestion: true })
    });
    const payload = pickQuestionFromGeminiPayload(response);
    const normalized = normalizeQuestion({
      ...payload,
      id: sourceQuestion.id,
      tipo_interaccion: sourceQuestion.tipo_interaccion,
      requiere_imagen: sourceQuestion.requiere_imagen === true || sourceQuestion.requires_image === true,
      imagen: sourceQuestion.imagen || "",
      media: payload.media
        ? { ...payload.media, url: sourceQuestion.media?.url || "" }
        : sourceQuestion.media
          ? { ...sourceQuestion.media, alt: payload.imagen_alt || sourceQuestion.media.alt || "" }
          : null
    }, roomIndex, questionIndex, formData.idioma || project.idioma || "es-419");
    const candidate = structuredClone(project);
    candidate.misiones[roomIndex].preguntas[questionIndex] = normalized;
    assignLocalCoverageAnchors(candidate.misiones[roomIndex]);
    const stillRepeated = editorialVarietyIssueStillPresent(candidate, issue)
      || excludedQuestions.some((existingQuestion) => (
        questionsAreTooSimilar(normalized, existingQuestion)
        || questionsReusePrimaryAnswer(normalized, existingQuestion)
      ));
    if (!stillRepeated) return candidate;
  }
  return null;
}

async function regenerateDraftQuestionNode(candidate = {}, issue = {}, formData = {}) {
  const roomIndex = Number(issue.roomIndex);
  const questionIndex = Number(issue.questionIndex);
  const mission = candidate.misiones?.[roomIndex];
  const sourceQuestion = mission?.preguntas?.[questionIndex];
  if (!mission || !sourceQuestion) return candidate;
  const excludedQuestions = (mission.preguntas || []).filter((_, index) => index !== questionIndex);
  const response = await requestQualityJson(buildQuestionRegenerationPrompt({
    formData,
    mission,
    missionIndex: roomIndex,
    questionIndex,
    sourceQuestion,
    excludedQuestions
  }), formData, 0.58, {
    responseJsonSchema: buildQuestionsResponseSchema(1, 1, { singleQuestion: true })
  });
  const replacement = pickQuestionFromGeminiPayload(response);
  const nextCandidate = structuredClone(candidate);
  nextCandidate.misiones[roomIndex].preguntas[questionIndex] = {
    ...replacement,
    id: sourceQuestion.id,
    tipo_interaccion: sourceQuestion.tipo_interaccion,
    imagen: sourceQuestion.imagen || replacement.imagen || "",
    media: sourceQuestion.media?.url
      ? { ...replacement.media, url: sourceQuestion.media.url }
      : replacement.media
  };
  nextCandidate.misiones[roomIndex] = assignLocalCoverageAnchors(nextCandidate.misiones[roomIndex]);
  return nextCandidate;
}

function inferStructuralAuditField(message = "") {
  const normalized = normalizeBaseText(message);
  if (normalized.includes("clavefinal")) return "clave_final";
  if (normalized.includes("retroalimentacioncorrecta")) return "retroalimentacion_correcta";
  if (normalized.includes("retroalimentacionincorrecta")) return "retroalimentacion_incorrecta";
  if (normalized.includes("tipopalabra") || normalized.includes("respuestacorrecta") || normalized.includes("respuestavalida") || normalized.includes("verdaderoofalso")) return "respuesta_correcta";
  if (normalized.includes("opcion")) return "opciones";
  if (normalized.includes("pareja")) return "parejas";
  if (normalized.includes("elemento")) return "elementos";
  if (normalized.includes("marcador")) return "texto_con_hueco";
  if (normalized.includes("multimedia") || normalized.includes("recurso")) return "media";
  return "contenido";
}

function structuralValidationMessagesToAuditIssues(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((rawMessage) => {
    const raw = normalizeString(rawMessage, "La estructura generada no es válida.");
    const match = raw.match(/^(?:Actividad\/Sala|Actividad|Sala|Misi[oó]n|Secci[oó]n)\s+(\d+)(?:\s*·\s*Pregunta\s+(\d+))?:\s*(.*)$/i);
    const message = normalizeString(match?.[3], raw);
    return {
      code: "structural_validation",
      message,
      roomIndex: match ? Math.max(0, Number(match[1]) - 1) : null,
      questionIndex: match?.[2] ? Math.max(0, Number(match[2]) - 1) : null,
      field: inferStructuralAuditField(message)
    };
  });
}

function auditInteractionPlan(project = {}, plan = []) {
  const issues = [];
  if (!Array.isArray(project?.misiones) || !Array.isArray(plan)) return issues;
  project.misiones.forEach((mission, roomIndex) => {
    const expectedTypes = Array.isArray(plan[roomIndex]) ? plan[roomIndex] : [];
    const questions = Array.isArray(mission?.preguntas) ? mission.preguntas : [];
    expectedTypes.forEach((expectedType, questionIndex) => {
      const actualType = normalizeString(questions[questionIndex]?.tipo_interaccion, "sin tipo");
      if (actualType === expectedType) return;
      issues.push({
        code: "interaction_plan_mismatch",
        message: `Debe usar ${expectedType}, pero la IA generó ${actualType}. Regenera esta pregunta con el tipo solicitado y con todos sus campos obligatorios.`,
        roomIndex,
        questionIndex,
        field: "tipo_interaccion"
      });
    });
  });
  return issues;
}

function auditGeneratedProjectStructure(project = {}, formData = {}) {
  const validation = validateProjectSetup(project);
  return [
    ...structuralValidationMessagesToAuditIssues(validation.issues),
    ...auditInteractionPlan(validation.project, formData.interactionPlan),
    ...auditPrivateBlueprintContracts(project, formData)
  ];
}

function auditPrivateBlueprintContracts(project = {}, formData = {}) {
  const blueprint = formData.objectiveBlueprint || state.objectiveBlueprint;
  if (!blueprint?.rooms?.length) return [];
  const issues = [];
  (project.misiones || []).forEach((mission, roomIndex) => {
    const contract = blueprint.rooms[roomIndex];
    if (!contract) return;
    if (contract.room_completion_feedback
      && normalizeObjectiveFixedText(mission?.retroalimentacion_correcta) !== normalizeObjectiveFixedText(contract.room_completion_feedback)) {
      issues.push({
        code: "room_completion_contract_mismatch",
        message: "El feedback de finalización no coincide con el contrato privado de esta sala.",
        roomIndex,
        questionIndex: null,
        field: "retroalimentacion_correcta"
      });
    }
    const completionText = normalizeBaseText(contract.room_completion_feedback || "");
    (mission?.preguntas || []).forEach((question, questionIndex) => {
      ["retroalimentacion_correcta", "retroalimentacion_incorrecta", "pista", "imagen_alt"].forEach((field) => {
        const value = normalizeBaseText(question?.[field] || "");
        if (!completionText || !value || value !== completionText) return;
        issues.push({
          code: "room_completion_feedback_leak",
          message: "Una pregunta reutiliza el mensaje reservado para completar la sala.",
          roomIndex,
          questionIndex,
          field
        });
      });
    });
  });
  return issues;
}

function prepareGeneratedProjectForPresentation(project, requestedMode = PRESENTATION_MODE_ROOMS) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return project;
  const mode = normalizePresentationMode(requestedMode);
  return {
    ...project,
    modo_presentacion: mode
  };
}

function buildFoundationResponseSchema(missionCount = 4, evidenceCount = 3) {
  const safeMissionCount = Math.max(1, Math.min(8, Number(missionCount) || 4));
  const safeEvidenceCount = Math.max(3, Math.floor(Number(evidenceCount) || 3));
  const stringField = { type: "string" };
  const stringArray = { type: "array", items: stringField };
  return {
    type: "object",
    properties: {
      modo_presentacion: { type: "string", enum: [PRESENTATION_MODE_ROOMS, PRESENTATION_MODE_MENU] },
      titulo: stringField,
      subtitulo: stringField,
      introduccion: stringField,
      instrucciones: stringField,
      ambientacion: stringField,
      linea_visual_base: stringField,
      misiones: {
        type: "array",
        minItems: safeMissionCount,
        maxItems: safeMissionCount,
        items: {
          type: "object",
          properties: {
            id: stringField,
            release: stringField,
            titulo: stringField,
            historia: stringField,
            contexto: stringField,
            datos_clave: {
              ...stringArray,
              minItems: safeEvidenceCount
            },
            reto: stringField,
            retroalimentacion_correcta: stringField,
            imagen_prompt: stringField,
            imagen_alt: stringField,
            imagen: stringField,
            desbloquea: stringArray,
            bloqueada_inicial: { type: "boolean" }
          },
          required: ["id", "release", "titulo", "historia", "contexto", "datos_clave", "reto", "retroalimentacion_correcta", "imagen_prompt", "imagen_alt", "imagen", "desbloquea", "bloqueada_inicial"]
        }
      },
      clave_final: stringField,
      conclusion: stringField
    },
    required: [
      "modo_presentacion", "titulo", "subtitulo", "introduccion", "instrucciones", "ambientacion",
      "linea_visual_base", "misiones", "clave_final", "conclusion"
    ]
  };
}

function buildRoomFoundationResponseSchema(evidenceCount = 3) {
  const safeEvidenceCount = Math.max(3, Math.floor(Number(evidenceCount) || 3));
  const stringField = { type: "string" };
  return {
    type: "object",
    properties: {
      mission: {
        type: "object",
        properties: {
          titulo: stringField,
          historia: stringField,
          contexto: stringField,
          datos_clave: {
            type: "array",
            items: stringField,
            minItems: safeEvidenceCount
          },
          reto: stringField,
          retroalimentacion_correcta: stringField,
          imagen_prompt: stringField,
          imagen_alt: stringField,
          imagen: stringField
        },
        required: ["titulo", "historia", "contexto", "datos_clave", "reto", "retroalimentacion_correcta", "imagen_prompt", "imagen_alt", "imagen"]
      }
    },
    required: ["mission"]
  };
}

function unwrapFoundationPayload(payload = {}) {
  return payload?.project && typeof payload.project === "object" && !Array.isArray(payload.project)
    ? payload.project
    : payload;
}

function getLearningFocusTokenSet(value = "") {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  return new Set(normalized.split(/\s+/).filter((token) => token.length > 3));
}

function getMissionLearningFocusTokens(mission = {}, formData = {}) {
  const topicTokens = getLearningFocusTokenSet(`${formData.temaPrincipal || ""} ${formData.tema || ""}`);
  return new Set([...getLearningFocusTokenSet([
    mission.titulo,
    ...(Array.isArray(mission.datos_clave) ? mission.datos_clave : [])
  ].filter(Boolean).join(" "))]
    .filter((token) => !topicTokens.has(token)));
}

function missionLearningFocusesOverlap(firstMission = {}, secondMission = {}, formData = {}) {
  const first = getMissionLearningFocusTokens(firstMission, formData);
  const second = getMissionLearningFocusTokens(secondMission, formData);
  if (!first.size || !second.size) return false;
  let shared = 0;
  first.forEach((token) => { if (second.has(token)) shared += 1; });
  return shared >= 3 && shared / Math.min(first.size, second.size) >= 0.72;
}

function getRoomFoundationQualityIssues(mission = {}, siblingMissions = [], formData = {}, roomIndex = 0) {
  const issues = auditMissionChallengeIntro(mission, roomIndex)
    .map((issue) => issue.message);
  const roomContract = getObjectiveRoomContract(formData, roomIndex);
  if (roomContract?.room_completion_feedback
    && normalizeObjectiveFixedText(mission?.retroalimentacion_correcta) !== normalizeObjectiveFixedText(roomContract.room_completion_feedback)) {
    issues.push("El feedback al completar la sala no coincide con su contrato privado.");
  }
  const duplicateSibling = (Array.isArray(siblingMissions) ? siblingMissions : [])
    .find((sibling) => missionLearningFocusesOverlap(mission, sibling, formData));
  if (duplicateSibling) {
    issues.push(`El enfoque de aprendizaje repite la sala "${normalizeString(duplicateSibling.titulo, "sin título")}".`);
  }
  return issues;
}

function getFoundationStructureIssues(foundation = {}, formData = {}) {
  const expectedCount = Math.max(1, Math.min(8, Number(formData.misiones) || 4));
  const requiredEvidenceCount = getRequiredBriefingEvidenceCount(formData);
  const issues = [];
  const requiredProjectFields = [
    "titulo", "subtitulo", "introduccion", "instrucciones", "ambientacion",
    "linea_visual_base", "clave_final", "conclusion"
  ];
  requiredProjectFields.forEach((field) => {
    if (!normalizeString(foundation?.[field], "")) issues.push(`${field}: valor vacío`);
  });
  const finalKey = normalizeEditableFinalKey(foundation?.clave_final || "");
  if (finalKey.length < 3 || finalKey.length > 12) {
    issues.push("clave_final: debe tener entre 3 y 12 caracteres alfanuméricos");
  }

  const missions = Array.isArray(foundation?.misiones) ? foundation.misiones : [];
  if (missions.length !== expectedCount) {
    issues.push(`misiones: se esperaban ${expectedCount} y se recibieron ${missions.length}`);
  }
  const missionIds = new Set();
  missions.forEach((mission, missionIndex) => {
    ["id", "release", "titulo", "historia", "contexto", "reto", "retroalimentacion_correcta", "imagen_prompt", "imagen_alt"].forEach((field) => {
      if (!normalizeString(mission?.[field], "")) issues.push(`sala ${missionIndex + 1} · ${field}: valor vacío`);
    });
    const roomContract = getObjectiveRoomContract(formData, missionIndex);
    if (roomContract?.room_completion_feedback
      && normalizeObjectiveFixedText(mission?.retroalimentacion_correcta) !== normalizeObjectiveFixedText(roomContract.room_completion_feedback)) {
      issues.push(`sala ${missionIndex + 1} · retroalimentacion_correcta: no conserva el feedback de finalización de su contrato privado`);
    }
    const missionId = normalizeString(mission?.id, "");
    if (missionId && missionIds.has(missionId)) issues.push(`sala ${missionIndex + 1} · id: duplicado`);
    if (missionId) missionIds.add(missionId);
    const evidence = normalizeTextList(mission?.datos_clave || []);
    if (evidence.length < requiredEvidenceCount) {
      issues.push(`sala ${missionIndex + 1} · datos_clave: se esperaban al menos ${requiredEvidenceCount} evidencias y se recibieron ${evidence.length}`);
    }
    auditMissionChallengeIntro(mission, missionIndex).forEach((issue) => {
      issues.push(`sala ${missionIndex + 1} · reto: ${issue.message}`);
    });
    const duplicateRoomIndex = missions.slice(0, missionIndex)
      .findIndex((previousMission) => missionLearningFocusesOverlap(mission, previousMission, formData));
    if (duplicateRoomIndex >= 0) {
      issues.push(`sala ${missionIndex + 1} · enfoque: repite el aprendizaje central de la sala ${duplicateRoomIndex + 1}`);
    }
  });
  return issues;
}

function buildQuestionsResponseSchema(missionCount = 4, questionsPerMission = 1, { singleQuestion = false, interaction = "" } = {}) {
  const safeMissionCount = Math.max(1, Math.min(8, Number(missionCount) || 4));
  const safeQuestionCount = Math.max(1, Math.floor(Number(questionsPerMission) || 1));
  const safeTotalQuestionCount = safeMissionCount * safeQuestionCount;
  const stringField = { type: "string" };
  const stringArray = { type: "array", items: stringField };
  const mediaSchema = {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["imagen", "audio", "video"] },
      url: stringField,
      alt: stringField,
      titulo: stringField,
      texto: stringField
    },
    required: ["tipo", "url", "alt"]
  };
  const questionProperties = {
    _plan_id: stringField,
    titulo: stringField,
    reto: stringField,
    subtipo_respuesta: { type: "string", enum: CLOSED_ANSWER_SUBTYPES },
    // Vertex rechaza en algunos modelos la unión string|boolean dentro de un
    // esquema grande. La salida estructurada usa texto y el normalizador de
    // PigPen convierte "true"/"false" al booleano interno correspondiente.
    respuesta_correcta: stringField,
    respuestas_aceptadas: stringArray,
    opciones: stringArray,
    parejas: {
      type: "array",
      minItems: interaction === "drag_drop" ? 6 : 0,
      maxItems: 6,
      items: {
        type: "object",
        properties: { izquierda: stringField, derecha: stringField, pista: stringField },
        required: ["izquierda", "derecha", "pista"]
      }
    },
    elementos: { type: "array", items: stringField, minItems: 0, maxItems: 6 },
    texto_con_hueco: stringField,
    pista: stringField,
    extra_hint: stringField,
    retroalimentacion_correcta: stringField,
    retroalimentacion_incorrecta: stringField,
    requiere_imagen: { type: "boolean" },
    imagen_prompt: stringField,
    imagen_alt: stringField,
    imagen: stringField
  };
  // Una regeneración individual es pequeña y puede conservar `media`. En la
  // generación completa y por sala se omite del transporte para reducir la
  // profundidad del schema; normalizeQuestion lo reconstruye localmente desde
  // imagen/imagen_alt sin alterar el JSON público.
  if (singleQuestion) questionProperties.media = mediaSchema;
  const questionSchema = {
    type: "object",
    properties: questionProperties,
    required: [
      "_plan_id", "titulo", "reto", "subtipo_respuesta", "respuesta_correcta",
      "respuestas_aceptadas", "opciones", "parejas", "elementos", "texto_con_hueco", "pista", "extra_hint", "retroalimentacion_correcta",
      "retroalimentacion_incorrecta", "requiere_imagen", "imagen_prompt", "imagen_alt", "imagen"
    ]
  };
  if (singleQuestion) {
    return {
      type: "object",
      properties: { question: questionSchema },
      required: ["question"]
    };
  }
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: safeTotalQuestionCount,
        maxItems: safeTotalQuestionCount,
        items: questionSchema
      }
    },
    required: ["questions"]
  };
}

function buildRoomBundleResponseSchema(questionCount = 1, evidenceCount = 3) {
  const safeQuestionCount = Math.max(1, Math.floor(Number(questionCount) || 1));
  const safeEvidenceCount = Math.max(3, Math.floor(Number(evidenceCount) || 3));
  const questionSchema = buildQuestionsResponseSchema(1, safeQuestionCount).properties.questions.items;
  const stringField = { type: "string" };
  return {
    type: "object",
    properties: {
      mission: {
        type: "object",
        properties: {
          titulo: stringField,
          historia: stringField,
          contexto: stringField,
          datos_clave: {
            type: "array",
            items: stringField,
            minItems: safeEvidenceCount
          },
          reto: stringField,
          imagen_prompt: stringField,
          imagen_alt: stringField,
          imagen: stringField,
          preguntas: {
            type: "array",
            minItems: safeQuestionCount,
            maxItems: safeQuestionCount,
            items: questionSchema
          }
        },
        required: ["titulo", "historia", "contexto", "datos_clave", "reto", "imagen_prompt", "imagen_alt", "imagen", "preguntas"]
      }
    },
    required: ["mission"]
  };
}

function buildQuestionOutputShape(interaction = "texto", requiresImage = false, planId = "") {
  const type = ESCAPE_ROOM_INTERACTION_CATALOG.includes(interaction) ? interaction : "texto";
  const shape = {
    _plan_id: normalizeString(planId, "identificador privado del plan"),
    titulo: "texto de título",
    reto: "enunciado autosuficiente",
    subtipo_respuesta: "palabra",
    respuesta_correcta: "respuesta correcta",
    respuestas_aceptadas: ["respuesta correcta"],
    opciones: [],
    parejas: [],
    elementos: [],
    texto_con_hueco: "",
    pista: "pista contextual sin revelar la respuesta",
    extra_hint: "segunda pista, más concreta pero sin dar la solución",
    retroalimentacion_correcta: "feedback de esta pregunta",
    retroalimentacion_incorrecta: "feedback de esta pregunta",
    requiere_imagen: false,
    imagen_prompt: "",
    imagen_alt: "",
    imagen: ""
  };
  if (experience.get(type)) {
    shape.respuesta_correcta = "";
    shape.respuestas_aceptadas = [];
    shape.subtipo_respuesta = "frase_corta";
  }
  if (type === "opcion_multiple" || type === "multimedia") {
    shape.opciones = ["opción correcta", "distractor 1", "distractor 2", "distractor 3"];
  } else if (["relacion_columnas", "drag_drop"].includes(type)) {
    if (type === "drag_drop") {
      shape.reto = "Contexto concreto con los datos necesarios, seguido de una pregunta de aplicación; no revelar las asignaciones ni explicar los controles de arrastre.";
      shape.pista = "Criterio para comparar propiedades sin identificar ninguna pareja correcta.";
    }
    shape.respuesta_correcta = "";
    shape.respuestas_aceptadas = [];
    shape.parejas = Array.from({ length: type === "drag_drop" ? 6 : 2 }, (_, index) => ({
      izquierda: `destino concreto ${index + 1}`, derecha: `ficha correspondiente ${index + 1}`, pista: ""
    }));
    if (type === "relacion_columnas") {
      shape.opciones = ["distractor plausible 1", "distractor plausible 2"];
    }
  } else if (type === "ordenar_secuencia") {
    shape.reto = "Contexto con evidencias y criterio para deducir el orden, seguido de la pregunta; no enumerar ni describir aquí los pasos en su secuencia correcta.";
    shape.respuesta_correcta = "";
    shape.respuestas_aceptadas = [];
    shape.elementos = ["primer elemento", "segundo elemento", "tercer elemento"];
  } else if (type === "completar_espacio") {
    shape.reto = "Contexto adicional opcional, sin repetir la lectura ni pedir escribir.";
    shape.texto_con_hueco = "Lectura curricular con ___ y, cuando sea pertinente, otro ___.";
    shape.parejas = [{ izquierda: "1", derecha: "respuesta breve del primer hueco", pista: "" }, { izquierda: "2", derecha: "respuesta breve del segundo hueco", pista: "" }];
    shape.respuesta_correcta = "";
    shape.respuestas_aceptadas = [];
  } else if (type === "verdadero_falso") {
    shape.subtipo_respuesta = "frase_corta";
    shape.respuesta_correcta = "true";
    shape.respuestas_aceptadas = [];
  }
  if (type === "multimedia" || requiresImage === true) {
    shape.requiere_imagen = true;
    shape.imagen_prompt = "prompt visual que no revela la respuesta";
    shape.imagen_alt = "descripción accesible que no revela la respuesta";
  }
  return shape;
}

function buildRoomBundleOutputShape(questionCount = 1, evidenceCount = 3, roomInteractionPlan = [], questionContracts = []) {
  const safeQuestionCount = Math.max(1, Math.floor(Number(questionCount) || 1));
  const safeEvidenceCount = Math.max(3, Math.floor(Number(evidenceCount) || 3));
  return JSON.stringify({
    mission: {
      titulo: "título de la sala",
      historia: "ambientación narrativa",
      contexto: "briefing pedagógico completo",
      datos_clave: Array.from({ length: safeEvidenceCount }, (_, index) => `dato pedagógico ${index + 1}`),
      reto: "puente narrativo declarativo, sin órdenes ni resumen de las preguntas",
      imagen_prompt: "prompt de la imagen del briefing",
      imagen_alt: "descripción accesible de la imagen del briefing",
      imagen: "",
      preguntas: Array.from({ length: safeQuestionCount }, (_, questionIndex) => (
        buildQuestionOutputShape(
          roomInteractionPlan[questionIndex] || "texto",
          questionContracts[questionIndex]?.requires_image === true,
          questionContracts[questionIndex]?.plan_id || ""
        )
      ))
    }
  });
}

function buildRoomQuestionContracts(roomContract = {}, roomInteractionPlan = [], questionCount = 1, { preferPlannedInteractions = true } = {}) {
  const plans = Array.isArray(roomContract?.question_plans) ? roomContract.question_plans : [];
  const reservePlan = roomContract?.reserve_opportunity || plans.at(-1) || {};
  return Array.from({ length: Math.max(1, Number(questionCount) || 1) }, (_, questionIndex) => {
    const plan = plans[questionIndex] || reservePlan;
    const plannedInteraction = preferPlannedInteractions && ESCAPE_ROOM_INTERACTION_CATALOG.includes(plan?.interaction)
      ? plan.interaction
      : roomInteractionPlan[questionIndex] || "texto";
    return {
      question_number: questionIndex + 1,
      ...plan,
      interaction: plannedInteraction,
      required_visible_clue: ['anagram', 'cipher', 'cipher_assertion'].includes(plan.mechanic_contract?.kind) ? {
        field: 'reto',
        literal: plan.mechanic_contract.kind === 'anagram' ? plan.mechanic_contract.scrambled : plan.mechanic_contract.ciphertext,
        instruction: 'Incluye esta pista calculada literalmente en reto, integrada en el caso. No basta ponerla en pista, briefing o feedback. No es la solución: no la descifres ni ordenes sus letras en el enunciado. La solución sólo va en los campos privados de respuesta.'
      } : null,
      authoring_template: buildQuestionAuthoringTemplate(plannedInteraction)
    };
  });
}

function buildRoomBundlePrompt({
  formData = {},
  missionIndex = 0,
  questionCount = 1,
  roomInteractionPlan = [],
  preserveInteractionPlan = false
}) {
  const safeIndex = Math.max(0, Number(missionIndex) || 0);
  const terms = getPresentationTerminology(formData.modoPresentacion);
  const roomContract = getObjectiveQuestionContract(formData, safeIndex);
  const questionContracts = buildRoomQuestionContracts(
    roomContract,
    roomInteractionPlan,
    questionCount,
    { preferPlannedInteractions: !preserveInteractionPlan }
  );
  const {
    question_plans: _privateQuestionPlans,
    reserve_opportunity: _privateReserveOpportunity,
    ...roomCurriculumContract
  } = roomContract || {};
  const visual = buildVisualDirection(formData);
  return [
    `Genera una única ${terms.itemSingular} completa para el escape room: briefing, introducción del Challenge y exactamente ${questionCount} preguntas.`,
    'Devuelve exclusivamente {"mission":{...}} con la forma y los nombres de campo indicados en este contrato.',
    `Esta es la ${terms.itemSingular} ${safeIndex + 1}. No generes ni menciones otras ${terms.itemPlural}.`,
    `CONTRATO CURRICULAR EXCLUSIVO DE ESTA SALA:\n${JSON.stringify(roomCurriculumContract)}`,
    "Cada pregunta incluye extra_hint: una segunda orientación más concreta, sin revelar la respuesta, en el idioma del juego.",
    `PLAN OBLIGATORIO POR PREGUNTA:\n${JSON.stringify(questionContracts)}`,
    "El objetivo original y sus instrucciones literales no forman parte de esta solicitud. El contrato contiene información ya clasificada; source_repairs describe defectos que deben evitarse, nunca textos que deban mostrarse.",
    "Redacta cada caso aprobado como una pregunta natural y autosuficiente. Conserva sus condiciones, pasos necesarios y solución; no sustituyas el caso por uno más sencillo. No conviertas sus metadatos en una oración copiada y coloca la solución exclusivamente en los campos de respuesta activos.",
    buildUnifiedContentGenerationContract(formData, questionCount),
    `Tema curricular: ${formData.temaPrincipal || formData.tema}. Narrativa: ${formData.narrativa || "general"}.`,
    `Dirección visual: ${visual.line}.`,
    "Redacta historia en 30 a 60 palabras como escena local conectada con narrative_arc y narrative_beat.",
    "El briefing debe enseñar explícitamente los principios y procedimientos necesarios para los planes, usando teaching_examples distintos de las aplicaciones evaluadas.",
    "Continúa exactamente desde narrative_beat.incoming_state y conduce la escena hacia next_state. No vuelvas a presentar el mundo ni repitas la amenaza global como si la sala anterior no hubiera ocurrido.",
    "No escribas minutos, segundos ni cuentas regresivas dentro de la narrativa salvo que sean una restricción fija del usuario; el temporizador real puede modificarse manualmente.",
    "Redacta cada título de pregunta de forma breve y cada enunciado con la extensión mínima necesaria para el tiempo asignado.",
    "Cada feedback correcto debe explicar el aprendizaje y materializar narrative_effect; el feedback incorrecto debe conservar la escena y orientar una revisión sin resolverla.",
    "No devuelvas id, release, tipo_interaccion, rutas, fragmentos ni feedback de finalización. PigPen conserva esos valores estructurales y privados por posición. Sí devuelve el _plan_id exacto suministrado para cada pregunta.",
    "Dentro de cada pregunta incluye solamente _plan_id, titulo, reto, subtipo_respuesta, respuesta_correcta, respuestas_aceptadas, opciones, parejas, elementos, texto_con_hueco, pista, retroalimentacion_correcta, retroalimentacion_incorrecta, requiere_imagen, imagen_prompt, imagen_alt e imagen.",
    "Conserva todas esas propiedades en cada pregunta aunque no se utilicen: usa cadena vacía para textos inactivos y [] para listas inactivas. No uses null, objetos en lugar de texto ni listas en lugar de texto.",
    "En parejas usa exclusivamente objetos {izquierda, derecha, pista}; pista puede ser cadena vacía. PigPen sustituirá localmente las parejas por solution_pairs del plan. En relacion_columnas conserva exactamente 2 distractores plausibles en opciones, distintos entre sí y de cada pareja.derecha. En verdadero/falso, conserva el tipo asignado y usa solamente true o false en respuesta_correcta; PigPen lo convierte al booleano interno.",
    "Deja imagen como cadena vacía. PigPen generará los archivos visuales después de construir el JSON público.",
    "La posición de cada pregunta corresponde a la posición de su plan obligatorio. No agregues, elimines ni reordenes preguntas.",
    `FORMA JSON OBLIGATORIA (reemplaza todos los textos ilustrativos por contenido real y conserva propiedades, tipos y cantidades):\n${buildRoomBundleOutputShape(questionCount, getRequiredBriefingEvidenceCount(formData), roomInteractionPlan, questionContracts)}`,
    "Revisa silenciosamente la sala completa antes de responder: confirma que el briefing sustenta cada plan, que ninguna aplicación repite sus ejemplos, que las firmas de respuesta son distintas, que cada feedback produce su cambio narrativo y que mission.reto funciona como escena. Devuelve directamente la versión definitiva."
  ].join("\n");
}

function normalizeQuestionTransportFields(question = {}, interaction = "texto") {
  const allowsEmptyAnswer = ["relacion_columnas", "drag_drop", "ordenar_secuencia", "completar_espacio"].includes(interaction);
  const rawCorrectAnswer = question?.respuesta_correcta ?? question?.correct_answer ?? question?.answer;
  const correctAnswer = interaction === "verdadero_falso" && typeof rawCorrectAnswer === "string"
    ? (/^(?:true|verdadero|vrai|verdadeiro|1)$/i.test(rawCorrectAnswer.trim()) ? true
      : /^(?:false|falso|faux|0)$/i.test(rawCorrectAnswer.trim()) ? false : rawCorrectAnswer)
    : rawCorrectAnswer;
  const requiresImageValue = question?.requiere_imagen ?? question?.requires_image;
  return closeGeneratedAnswer({
    ...question,
    _plan_id: question?._plan_id ?? question?.plan_id,
    titulo: question?.titulo ?? question?.title,
    reto: question?.reto ?? question?.prompt ?? question?.enunciado,
    subtipo_respuesta: question?.subtipo_respuesta ?? question?.answer_subtype ?? "palabra",
    respuesta_correcta: correctAnswer ?? (allowsEmptyAnswer ? "" : undefined),
    respuestas_aceptadas: question?.respuestas_aceptadas ?? question?.accepted_answers ?? [],
    opciones: question?.opciones ?? question?.options ?? [],
    parejas: normalizePairList(question?.parejas ?? question?.pairs ?? []),
    elementos: question?.elementos ?? question?.sequence ?? question?.items ?? [],
    texto_con_hueco: interaction === "completar_espacio"
      ? normalizeFillBlankMarkers(question?.texto_con_hueco ?? question?.fill_blank_text ?? "")
      : (question?.texto_con_hueco ?? question?.fill_blank_text ?? ""),
    pista: question?.pista ?? question?.hint,
    retroalimentacion_correcta: question?.retroalimentacion_correcta ?? question?.correct_feedback,
    retroalimentacion_incorrecta: question?.retroalimentacion_incorrecta ?? question?.incorrect_feedback,
    requiere_imagen: typeof requiresImageValue === "string"
      ? requiresImageValue.trim().toLowerCase() === "true"
      : requiresImageValue === true,
    imagen_prompt: question?.imagen_prompt ?? question?.image_prompt ?? "",
    imagen_alt: question?.imagen_alt ?? question?.image_alt ?? "",
    imagen: question?.imagen ?? question?.image ?? ""
  }, interaction);
}

function normalizeRoomBundleTransport(payload = {}, roomInteractionPlan = []) {
  const mission = pickMissionFromGeminiPayload(payload);
  const rawQuestions = Array.isArray(mission?.preguntas)
    ? mission.preguntas
    : (Array.isArray(mission?.questions) ? mission.questions : []);
  const questions = rawQuestions.map((question, questionIndex) => (
    normalizeQuestionTransportFields(question, roomInteractionPlan[questionIndex] || "texto")
  ));
  return {
    mission: {
      ...mission,
      titulo: mission?.titulo ?? mission?.title,
      historia: mission?.historia ?? mission?.story,
      contexto: mission?.contexto ?? mission?.briefing ?? mission?.context,
      datos_clave: mission?.datos_clave ?? mission?.key_points ?? mission?.key_facts,
      reto: mission?.reto ?? mission?.challenge,
      imagen_prompt: mission?.imagen_prompt ?? mission?.image_prompt,
      imagen_alt: mission?.imagen_alt ?? mission?.image_alt,
      imagen: mission?.imagen ?? mission?.image ?? "",
      preguntas: questions
    }
  };
}

function normalizeSingleQuestionTransport(payload = {}, interaction = "texto") {
  return {
    question: normalizeQuestionTransportFields(pickQuestionFromGeminiPayload(payload), interaction)
  };
}

function buildCoverageAnchorFromQuestionPlan(plan = {}, interaction = "texto") {
  return [
    `id de conocimiento: ${normalizeString(plan.knowledge_id, "")}`,
    `id del caso: ${normalizeString(plan.assessment_case_id, "")}`,
    `fuente del caso: ${normalizeString(plan.case_source, "")}`,
    `datos del caso: ${normalizeTextList(plan.case_data || []).join("; ")}`,
    `diferencia de transferencia: ${normalizeString(plan.transfer_delta, "")}`,
    `evidencia de razonamiento: ${normalizeString(plan.reasoning_evidence, "")}`,
    `conocimientos integrados: ${normalizeTextList(plan.integrates_knowledge_ids || []).join(", ")}`,
    `evidencia: ${normalizeString(plan.evidence, "")}`,
    `conocimiento: ${normalizeString(plan.knowledge, "")}`,
    `operación: ${normalizeString(plan.cognitive_operation, "")}`,
    `rol pedagógico: ${normalizeString(plan.pedagogical_role, "")}`,
    `familia de respuesta: ${normalizeString(plan.answer_family, interaction)}`,
    `firma de respuesta: ${normalizeString(plan.answer_signature, "")}`,
    `aplicación: ${normalizeString(plan.application, "")}`
  ].join(" | ");
}

function inspectThematicObjectiveUnlockContract(formData = {}, blueprint = {}) {
  const roomCount = Math.max(1, Math.min(8, Number(formData.misiones) || blueprint?.rooms?.length || 4));
  const rawCode = String(blueprint?.final_unlock?.code || "").trim();
  const finalCode = normalizeThematicFinalWord(rawCode, roomCount);
  const expectedFragments = finalCode ? partitionThematicFinalWord(finalCode, roomCount) : Array(roomCount).fill("");
  const rooms = Array.isArray(blueprint?.rooms) ? blueprint.rooms : [];
  const fragmentsMatch = rooms.length === roomCount && !rooms.some((room, index) => (
    normalizeObjectiveUnlockFragment(room?.fixed_code_fragment) !== expectedFragments[index]
  ));
  return {
    valid: Boolean(finalCode && rawCode === finalCode && fragmentsMatch),
    finalCode,
    expectedFragments,
    roomCount
  };
}

function assertThematicObjectiveUnlockContract(formData = {}, blueprint = {}) {
  const contract = inspectThematicObjectiveUnlockContract(formData, blueprint);
  if (!contract.valid) {
    throw new Error("PigPen no pudo configurar una palabra temática válida para la clave final.");
  }
  return contract.finalCode;
}

async function ensureThematicObjectiveUnlockContract(formData = {}, blueprint = {}) {
  const current = inspectThematicObjectiveUnlockContract(formData, blueprint);
  if (current.valid) return { blueprint, repaired: false };

  updatePreviewGenerationProgress({
    title: "Corrigiendo la clave final",
    detail: "Gemini está creando una palabra temática sin números"
  });
  setStatus("La clave guardada no es válida. PigPen está pidiendo a Gemini una nueva palabra temática…", "info");
  const repairedCode = await requestThematicObjectiveUnlockWord(
    formData,
    blueprint,
    current.roomCount,
    blueprint?.final_unlock?.code
  );
  const fragments = partitionThematicFinalWord(repairedCode, current.roomCount);
  const repairedBlueprint = structuredClone(blueprint);
  repairedBlueprint.final_unlock = {
    ...(repairedBlueprint.final_unlock || {}),
    code: repairedCode,
    feedback: buildDeterministicFinalUnlockFeedback(formData.idioma)
  };
  repairedBlueprint.rooms = (repairedBlueprint.rooms || []).map((room, roomIndex) => ({
    ...room,
    fixed_code_fragment: fragments[roomIndex],
    room_completion_feedback: buildDeterministicRoomCompletionFeedback(room, fragments[roomIndex], formData.idioma)
  }));
  repairedBlueprint.source_contract = {
    ...(repairedBlueprint.source_contract || {}),
    fixed_final_code: repairedCode,
    fixed_code_fragments: fragments,
    fixed_final_feedback: repairedBlueprint.final_unlock.feedback,
    fixed_room_feedback: repairedBlueprint.rooms.map((room) => room.room_completion_feedback),
    rejected_invalid_unlock: false
  };
  repairedBlueprint.quality_report = {
    ...(repairedBlueprint.quality_report || {}),
    status: "plan_created",
    structural: true,
    publication: false,
    issues: []
  };
  const repairedText = formatObjectiveBrief(repairedBlueprint, formData.idioma);
  const activeBlueprint = activateObjectiveBrief(repairedBlueprint, repairedText, {
    editedPlanText: repairedBlueprint.source_contract?.edited_plan_text || ""
  });
  if (elements.objectiveIdeaTextarea) elements.objectiveIdeaTextarea.value = repairedText;
  state.pendingGenerationDraft = null;
  state.pendingGenerationDraftKey = "";
  return { blueprint: activeBlueprint, repaired: true };
}

function buildPrivateProjectShell(formData = {}, blueprint = {}) {
  const copy = blueprint.project_copy || {};
  const finalCode = assertThematicObjectiveUnlockContract(formData, blueprint);
  return {
    idioma: formData.idioma || "es-419",
    modo_presentacion: normalizePresentationMode(formData.modoPresentacion),
    titulo: normalizeString(copy.title, ""),
    subtitulo: normalizeString(copy.subtitle, ""),
    introduccion: normalizeString(copy.introduction, ""),
    instrucciones: normalizeString(copy.instructions, ""),
    ambientacion: normalizeString(copy.setting, ""),
    linea_visual_base: normalizeString(copy.visual_line, ""),
    misiones: [],
    clave_final: finalCode,
    conclusion: normalizeString(blueprint.final_unlock?.feedback, "")
  };
}

function validateRawRoomBundlePayload(payload = {}, questionCount = 1, missionIndex = 0) {
  const mission = payload?.mission;
  const issues = [];
  if (!mission || typeof mission !== "object" || Array.isArray(mission)) {
    return [`Sala ${missionIndex + 1}: falta el objeto mission.`];
  }
  ["titulo", "historia", "contexto", "reto", "imagen_prompt", "imagen_alt", "imagen"].forEach((field) => {
    if (typeof mission[field] !== "string") issues.push(`Sala ${missionIndex + 1}: ${field} debe ser texto.`);
  });
  if (!Array.isArray(mission.datos_clave) || mission.datos_clave.some((item) => typeof item !== "string")) {
    issues.push(`Sala ${missionIndex + 1}: datos_clave debe ser una lista de textos.`);
  }
  const questions = mission.preguntas;
  if (!Array.isArray(questions) || questions.length !== questionCount) {
    issues.push(`Sala ${missionIndex + 1}: preguntas debe contener exactamente ${questionCount} elementos.`);
    return issues;
  }
  const textFields = [
    "_plan_id", "titulo", "reto", "subtipo_respuesta", "texto_con_hueco", "pista",
    "retroalimentacion_correcta", "retroalimentacion_incorrecta", "imagen_prompt", "imagen_alt", "imagen"
  ];
  const arrayFields = ["respuestas_aceptadas", "opciones", "parejas", "elementos"];
  questions.forEach((question, questionIndex) => {
    const label = `Sala ${missionIndex + 1} · Pregunta ${questionIndex + 1}`;
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      issues.push(`${label}: debe ser un objeto.`);
      return;
    }
    textFields.forEach((field) => {
      if (typeof question[field] !== "string") issues.push(`${label}: ${field} debe ser texto.`);
    });
    if (typeof question.respuesta_correcta !== "string" && typeof question.respuesta_correcta !== "boolean") {
      issues.push(`${label}: respuesta_correcta debe ser texto o booleano.`);
    }
    arrayFields.forEach((field) => {
      if (!Array.isArray(question[field])) issues.push(`${label}: ${field} debe ser una lista.`);
    });
    ["respuestas_aceptadas", "opciones", "elementos"].forEach((field) => {
      if (Array.isArray(question[field]) && question[field].some((item) => typeof item !== "string")) {
        issues.push(`${label}: ${field} solo admite textos.`);
      }
    });
    if (Array.isArray(question.parejas) && question.parejas.some((pair) => (
      !pair || typeof pair !== "object" || Array.isArray(pair)
      || typeof pair.izquierda !== "string"
      || typeof pair.derecha !== "string"
      || typeof pair.pista !== "string"
    ))) {
      issues.push(`${label}: parejas debe contener objetos izquierda, derecha y pista de texto.`);
    }
    if (typeof question.requiere_imagen !== "boolean") {
      issues.push(`${label}: requiere_imagen debe ser booleano.`);
    }
  });
  return issues;
}

function buildGeneratedQuestionMedia(question = {}, interaction = "texto", sourceMedia = null) {
  const generatedMedia = question?.media && typeof question.media === "object" && !Array.isArray(question.media)
    ? question.media
    : null;
  const preservedMedia = sourceMedia && typeof sourceMedia === "object" && !Array.isArray(sourceMedia)
    ? sourceMedia
    : null;
  if (interaction !== "multimedia" && !generatedMedia && !preservedMedia) return null;
  if (interaction !== "multimedia") return generatedMedia || preservedMedia;
  return {
    tipo: generatedMedia?.tipo || preservedMedia?.tipo || "imagen",
    url: preservedMedia?.url || generatedMedia?.url || normalizeString(question.imagen, ""),
    alt: normalizeString(question.imagen_alt, generatedMedia?.alt || preservedMedia?.alt || ""),
    titulo: normalizeString(question.titulo, generatedMedia?.titulo || preservedMedia?.titulo || ""),
    texto: normalizeString(question.imagen_prompt, generatedMedia?.texto || preservedMedia?.texto || "")
  };
}

function getGeneratedRoomTemplateCopy(locale = "es-419") {
  const language = normalizeString(locale, "es-419").toLowerCase();
  if (language.startsWith("en")) return {
    question: "Question",
    solve: "Use the information in this room to solve the activity.",
    hint: "Review the relevant evidence and apply the indicated procedure step by step.",
    correct: "Correct. Your reasoning moves the mission forward.",
    incorrect: "Review the evidence and try the procedure again.",
    alternative: "The evidence does not support this option.",
    story: "The next part of the mission is now active.",
    context: "Review the room information before answering.",
    challenge: "The system is ready for the planned activities.",
    imagePrompt: "Educational scene for this room without visible answers or interface text.",
    imageAlt: "Illustration supporting the room activity."
  };
  if (language.startsWith("fr")) return {
    question: "Question", solve: "Utilise les informations de la salle pour résoudre l’activité.",
    hint: "Relis les indices pertinents et applique la procédure étape par étape.",
    correct: "Correct. Ton raisonnement fait avancer la mission.", incorrect: "Relis les indices et recommence la procédure.",
    alternative: "Les indices ne soutiennent pas cette option.", story: "La prochaine étape de la mission est active.",
    context: "Lis les informations de la salle avant de répondre.", challenge: "Le système est prêt pour les activités prévues.",
    imagePrompt: "Scène éducative de la salle, sans réponses ni texte d’interface visibles.", imageAlt: "Illustration de l’activité de la salle."
  };
  if (language.startsWith("pt")) return {
    question: "Pergunta", solve: "Use as informações da sala para resolver a atividade.",
    hint: "Revise as evidências relevantes e aplique o procedimento passo a passo.",
    correct: "Correto. Seu raciocínio faz a missão avançar.", incorrect: "Revise as evidências e tente o procedimento novamente.",
    alternative: "As evidências não sustentam esta opção.", story: "A próxima etapa da missão está ativa.",
    context: "Revise as informações da sala antes de responder.", challenge: "O sistema está pronto para as atividades planejadas.",
    imagePrompt: "Cena educativa desta sala sem respostas nem texto de interface visível.", imageAlt: "Ilustração de apoio para a atividade da sala."
  };
  return {
    question: "Pregunta",
    solve: "Usa la información de esta sala para resolver la actividad.",
    hint: "Revisa la evidencia relevante y aplica el procedimiento indicado paso a paso.",
    correct: "Correcto. Tu razonamiento hace avanzar la misión.",
    incorrect: "Revisa la evidencia e intenta nuevamente el procedimiento.",
    alternative: "La evidencia no respalda esta opción.",
    story: "La siguiente parte de la misión está activa.",
    context: "Revisa la información de la sala antes de responder.",
    challenge: "El sistema está listo para las actividades planeadas.",
    imagePrompt: "Escena educativa para esta sala sin respuestas ni texto de interfaz visibles.",
    imageAlt: "Ilustración de apoyo para la actividad de la sala."
  };
}

function parseQuestionPlanPairStatements(value = "") {
  return String(value || "")
    .split(/\r?\n|[;|]/u)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      // La flecha es el separador canónico. Los dos puntos pueden pertenecer a
      // la etiqueta visible ("Log 1: Ancient theory") y sólo se interpretan
      // como separador en planes heredados que no contienen una flecha.
      const explicit = entry.match(/^(.{1,180}?)\s*(?:→|=>|->|—>)\s*(.{1,180})$/u);
      const equals = explicit ? null : entry.match(/^(.{1,180}?)\s+=\s+(.{1,180})$/u);
      const legacyColon = explicit || equals ? null : entry.match(/^(.{1,180})\s*:\s*(.{1,180})$/u);
      const match = explicit || equals || legacyColon;
      return match ? { izquierda: match[1].trim(), derecha: match[2].trim(), pista: "" } : null;
    })
    .filter(Boolean);
}

function normalizeQuestionPlanSolutionPairs(plan = {}) {
  const supplied = normalizePairList(plan?.solution_pairs || []).filter((pair) => (
    normalizeObjectiveFixedText(pair.izquierda) && normalizeObjectiveFixedText(pair.derecha)
  ));
  const parsed = supplied.length ? supplied : parseQuestionPlanPairStatements(plan?.answer_target);
  // Preserve every complete slot. Uniqueness belongs to contract validation:
  // deduplicating here hides the offending pairs and turns six slots into two.
  return parsed.filter((pair) => {
    const left = normalizeObjectiveFixedText(pair.izquierda);
    const right = normalizeObjectiveFixedText(pair.derecha);
    return Boolean(left && right);
  }).map((pair) => ({ izquierda: pair.izquierda, derecha: pair.derecha, pista: "" }));
}

function normalizeSolutionPairToken(value = "") {
  return normalizeObjectiveFixedText(value).toLocaleLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function buildDragDropPairRepairContext(plan = {}, slot = {}) {
  const interaction = normalizeString(slot.interaction, "").toLowerCase();
  if (!["drag_drop", "relacion_columnas"].includes(interaction)) return null;
  const rawPairs = normalizePairList(plan?.solution_pairs || []).map((pair) => ({
    izquierda: normalizeSolutionPairToken(pair?.izquierda),
    derecha: normalizeSolutionPairToken(pair?.derecha),
    raw: pair
  }));
  const duplicateIndexes = (values = []) => {
    const indexesByValue = {};
    values.forEach((value, index) => {
      if (!value) return;
      (indexesByValue[value] ||= []).push(index);
    });
    return {
      values: Object.entries(indexesByValue).filter(([,indexes]) => indexes.length > 1).map(([value]) => value),
      indices: Object.entries(indexesByValue).filter(([,indexes]) => indexes.length > 1).flatMap(([,indexes]) => indexes)
    };
  };
  const leftDup = duplicateIndexes(rawPairs.map(pair => pair.izquierda));
  const rightDup = duplicateIndexes(rawPairs.map(pair => pair.derecha));
  const invalidIndices = rawPairs
    .map((pair, index) => (pair.izquierda && pair.derecha ? -1 : index))
    .filter((index) => index >= 0);
  const conflictSet = new Set([...invalidIndices, ...leftDup.indices, ...rightDup.indices]);
  const validPairs = rawPairs.filter((pair, index) => !conflictSet.has(index)).map(pair => pair.raw);
  return {
    rawPairs: rawPairs.map(pair => pair.raw),
    validPairs,
    leftDuplicates: leftDup.values,
    rightDuplicates: rightDup.values,
    leftDuplicateIndices: [...new Set(leftDup.indices)],
    rightDuplicateIndices: [...new Set(rightDup.indices)],
    invalidIndices,
    duplicateOrInvalidIndices: [...new Set([...invalidIndices, ...leftDup.indices, ...rightDup.indices])],
    hasPairPayloadIssue: !!(invalidIndices.length || leftDup.values.length || rightDup.values.length)
  };
}

function formatQuestionPlanSolutionPairs(pairs = []) {
  return normalizePairList(pairs).map((pair) => `${pair.izquierda} → ${pair.derecha}`).join(" | ");
}

function normalizePlanBooleanAnswer(value) {
  if (typeof value === "boolean") return value;
  const token = normalizeObjectiveFixedText(value).toLowerCase();
  if (["true", "verdadero", "vrai", "verdadeiro", "1"].includes(token)) return true;
  if (["false", "falso", "faux", "0"].includes(token)) return false;
  return null;
}

function ensureBooleanEvaluationPrompt(value = "", plan = {}, locale = "en-US") {
  const source = normalizeString(value, "") || normalizeString(plan?.application, "");
  if (/[?？]\s*$/u.test(source)
    || /\b(?:true\s+or\s+false|verdadero\s+o\s+falso|vrai\s+ou\s+faux|verdadeiro\s+ou\s+falso)\b/iu.test(source)) return source;
  const language = normalizeString(locale, "en-US").toLowerCase();
  const instruction = language.startsWith("es") ? "¿Esta afirmación es verdadera o falsa?"
    : language.startsWith("fr") ? "Cette affirmation est-elle vraie ou fausse ?"
      : language.startsWith("pt") ? "Esta afirmação é verdadeira ou falsa?"
        : "Is this statement true or false?";
  return [source, instruction].filter(Boolean).join(" ");
}

function applyQuestionPlanAnswerContract(question = {}, plan = {}, interaction = "texto", locale = "en-US") {
  if (experience.get(interaction)) return { ...question, _plan_id: plan.plan_id, interaction_data: experience.normalizeContract(plan.interaction_data || question.interaction_data, interaction), respuesta_correcta: "", respuestas_aceptadas: [] };
  const result = { ...question };
  if (plan?.plan_id) result._plan_id = plan.plan_id;
  const pairs = normalizeQuestionPlanSolutionPairs(plan);
  if (["drag_drop", "relacion_columnas", "completar_espacio"].includes(interaction) && pairs.length) {
    result.parejas = structuredClone(pairs);
    result.respuesta_correcta = "";
    result.respuestas_aceptadas = [];
  }
  if (interaction === "verdadero_falso") {
    const answer = typeof plan?.mechanic_contract?.expected_boolean === "boolean"
      ? plan.mechanic_contract.expected_boolean
      : normalizePlanBooleanAnswer(plan?.answer_target);
    if (answer !== null) result.respuesta_correcta = answer;
    result.subtipo_respuesta = "frase_corta";
    result.respuestas_aceptadas = [];
    result.opciones = [];
    result.reto = ensureBooleanEvaluationPrompt(result.reto, plan, locale);
    return result;
  }
  return applyMechanicContractToQuestion(result, plan?.mechanic_contract || { kind: "none" });
}

function buildQuestionPlanFallbackPairs(questionPlan = {}, locale = "es-419") {
  // Only an explicit answer mapping is a fallback. Case observations such as
  // "System base: capital" and pedagogical metadata are not answer pairs.
  return normalizeQuestionPlanSolutionPairs(questionPlan);
}

function mergeGeneratedQuestionPairs(generatedPairs = [], questionPlan = {}, locale = "es-419") {
  const generated = normalizePairList(generatedPairs || []).filter((pair) => (
    normalizeObjectiveFixedText(pair.izquierda) && normalizeObjectiveFixedText(pair.derecha)
  ));
  // Preserve the authored activity as a set. Appending the plan to a complete
  // response used to duplicate concepts and inject unrelated Evidence cards.
  const planned = buildQuestionPlanFallbackPairs(questionPlan, locale);
  const candidates = planned.length ? planned : generated;
  const usedLeft = new Set();
  const usedRight = new Set();
  return candidates.filter((pair) => {
    const left = normalizeObjectiveFixedText(pair?.izquierda);
    const right = normalizeObjectiveFixedText(pair?.derecha);
    if (!left || !right || usedLeft.has(left) || usedRight.has(right)) return false;
    usedLeft.add(left);
    usedRight.add(right);
    return true;
  }).slice(0, 6);
}

function generatedQuestionPlanIssues(question = {}, plan = {}, interaction = "texto") {
  if (experience.get(interaction)) return [...experience.authoringIssues(interaction, question.interaction_data), ...["titulo", "reto", "pista", "retroalimentacion_correcta", "retroalimentacion_incorrecta"].filter(field => !String(question[field] || "").trim()).map(field => `Falta ${field}`), ...(plan.plan_id && question._plan_id !== plan.plan_id ? ["Identificador de plan incorrecto"] : [])];
  const issues = [];
  if (plan.plan_id && question._plan_id !== plan.plan_id) issues.push('El identificador de la pregunta no coincide con el espacio fijo del plan.');
  for (const field of ['titulo', 'pista', 'retroalimentacion_correcta', 'retroalimentacion_incorrecta']) {
    if (!normalizeString(question[field], '')) issues.push(`Falta el campo ${field} de la plantilla; no se inventará un sustituto.`);
  }
  if (interaction !== 'completar_espacio' && !normalizeString(question.reto, '')) issues.push('Falta el enunciado del acertijo.');
  const target = normalizeString(plan.answer_target, '');
  if (target && !['relacion_columnas', 'drag_drop', 'completar_espacio', 'ordenar_secuencia'].includes(interaction)) {
    const normalizedAnswer = value => interaction === 'verdadero_falso'
      ? (/^(true|verdadero|vrai|verdadeiro|1)$/i.test(String(value)) ? 'true' : /^(false|falso|faux|0)$/i.test(String(value)) ? 'false' : String(value))
      : normalizeObjectiveFixedText(value);
    if (normalizedAnswer(question.respuesta_correcta) !== normalizedAnswer(target)) issues.push('La solución generada no coincide con answer_target: corrige el acertijo completo, no sustituyas sólo la respuesta.');
  }
  if (['opcion_multiple', 'multimedia'].includes(interaction)) {
    const options = (question.opciones || []).map(value => normalizeString(value, ''));
    if (options.length !== 4 || options.some(value => !value) || new Set(options.map(normalizeObjectiveFixedText)).size !== 4
      || options.filter(value => value === question.respuesta_correcta).length !== 1) issues.push('La plantilla exige cuatro opciones distintas y una solución literal en una única opción; no se fabricarán distractores.');
  }
  if (target && ['relacion_columnas', 'drag_drop', 'completar_espacio'].includes(interaction)) {
    const expected = normalizeQuestionPlanSolutionPairs(plan);
    if (expected.length) {
      const signature = pairs => pairs.map(pair => JSON.stringify([normalizeObjectiveFixedText(pair.izquierda), normalizeObjectiveFixedText(pair.derecha)])).sort().join('|');
      if (signature(expected) !== signature(question.parejas || [])) issues.push(`Las correspondencias o huecos no coinciden con la solución privada del plan. Conserva exactamente estas relaciones, sin omitirlas ni sustituirlas: ${expected.map(pair => `${pair.izquierda} → ${pair.derecha}`).join(' | ')}.`);
    } else if (plan.difficulty_policy_version >= 3) issues.push('answer_target debe enumerar correspondencias inequívocas con el formato destino → solución | destino → solución.');
  }
  if (interaction === 'ordenar_secuencia' && plan.mechanic_contract?.items?.length) {
    const expected = [...plan.mechanic_contract.items].sort((a,b) => a.order_key-b.order_key).map(item => normalizeObjectiveFixedText(item.text));
    if (JSON.stringify(expected) !== JSON.stringify((question.elementos || []).map(normalizeObjectiveFixedText))) issues.push('La secuencia generada no coincide con el orden privado del plan.');
  } else if (interaction === 'ordenar_secuencia' && target && plan.difficulty_policy_version >= 3) {
    const expected = target.split(/\s*(?:→|\|)\s*/u).map(normalizeObjectiveFixedText);
    if (expected.length < 2 || JSON.stringify(expected) !== JSON.stringify((question.elementos || []).map(normalizeObjectiveFixedText))) issues.push('La secuencia debe coincidir con answer_target, expresado como elemento → elemento en el orden correcto.');
  }
  const mechanic = plan.mechanic_contract || {};
  if (mechanic.kind === 'cipher_assertion') {
    const expectedBoolean = typeof mechanic.expected_boolean === 'boolean'
      ? mechanic.expected_boolean
      : normalizePlanBooleanAnswer(target);
    if (interaction !== 'verdadero_falso') issues.push('El contrato cipher_assertion sólo puede materializarse como verdadero/falso.');
    if (expectedBoolean === null || question.respuesta_correcta !== expectedBoolean) issues.push('La respuesta booleana no coincide con la evaluación mecánica del plan.');
    const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
    if (mechanic.ciphertext && !compact(question.reto).includes(compact(mechanic.ciphertext))) {
      issues.push(`Falta el cifrado ${JSON.stringify(mechanic.ciphertext)} en la afirmación evaluable.`);
    }
  } else if (['cipher', 'anagram'].includes(mechanic.kind)) {
    if (normalizeObjectiveFixedText(question.respuesta_correcta) !== normalizeObjectiveFixedText(mechanic.solution)) issues.push('La solución no coincide con el contrato mecánico calculado.');
    const clue = mechanic.kind === 'anagram' ? mechanic.scrambled : mechanic.ciphertext;
    const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
    if (clue && !compact(question.reto).includes(compact(clue))) issues.push(`Falta la pista calculada (anagrama o cifrado) en el acertijo. Incluye literalmente ${JSON.stringify(clue)} en el campo reto de esta pregunta, sin resolverla. No basta incluirla en pista, briefing o feedback. Conserva la solución privada y las reglas del plan.`);
  }
  return issues;
}

function materializeGeneratedQuestionTemplate(question = {}, questionPlan = {}, interaction = "texto", {
  roomIndex = 0,
  questionIndex = 0,
  locale = "es-419"
} = {}) {
  const copy = getGeneratedRoomTemplateCopy(locale);
  const normalizedPlan = normalizeObjectiveQuestionPlan({ ...questionPlan, interaction }, interaction);
  const source = applyQuestionPlanAnswerContract(
    normalizeQuestionTransportFields(question, interaction),
    normalizedPlan,
    interaction,
    locale
  );
  const planIssues = generatedQuestionPlanIssues(source, normalizedPlan, interaction);
  if (planIssues.length) {
    const error = new Error(planIssues.join(' · '));
    error.questionIndexes = [questionIndex];
    throw error;
  }
  const requiresImage = interaction === "multimedia" || normalizedPlan?.requires_image === true;
  const fallbackTitle = normalizeString(normalizedPlan?.knowledge, "")
    || `${copy.question} ${questionIndex + 1}`;
  const fallbackPrompt = normalizeString(normalizedPlan?.application, "")
    || normalizeString(normalizedPlan?.instruction_outline, "")
    || normalizeString(normalizedPlan?.evidence, "")
    || copy.solve;
  const fallbackHint = normalizeString(normalizedPlan?.hint_strategy, "") || copy.hint;
  const fallbackFeedback = normalizeString(normalizedPlan?.feedback_strategy, "");
  const result = {
    ...source,
    _plan_id: normalizeString(normalizedPlan?.plan_id, `r${roomIndex + 1}_p${questionIndex + 1}`),
    titulo: normalizeString(source.titulo, fallbackTitle),
    reto: normalizeString(source.reto, fallbackPrompt),
    subtipo_respuesta: normalizeString(source.subtipo_respuesta, "palabra"),
    respuestas_aceptadas: Array.isArray(source.respuestas_aceptadas) ? source.respuestas_aceptadas : [],
    opciones: Array.isArray(source.opciones) ? source.opciones : [],
    parejas: normalizePairList(source.parejas || []),
    elementos: normalizeTextList(source.elementos || []),
    texto_con_hueco: normalizeString(source.texto_con_hueco, ""),
    pista: normalizeString(source.pista, fallbackHint),
    retroalimentacion_correcta: normalizeString(source.retroalimentacion_correcta, fallbackFeedback || copy.correct),
    retroalimentacion_incorrecta: normalizeString(source.retroalimentacion_incorrecta, fallbackFeedback || copy.incorrect),
    requiere_imagen: requiresImage,
    imagen_prompt: requiresImage ? normalizeString(source.imagen_prompt, copy.imagePrompt) : normalizeString(source.imagen_prompt, ""),
    imagen_alt: requiresImage ? normalizeString(source.imagen_alt, copy.imageAlt) : normalizeString(source.imagen_alt, ""),
    imagen: normalizeString(source.imagen, "")
  };
  if (["relacion_columnas", "drag_drop"].includes(interaction)) {
    result.parejas = normalizeQuestionPlanSolutionPairs(normalizedPlan);
    if (interaction === "drag_drop" && result.parejas.length !== 6) {
      throw new Error(`Sala ${roomIndex + 1} · Pregunta ${questionIndex + 1}: Drag & Drop necesita exactamente 6 fichas distintas con sus destinos; recibió ${result.parejas.length}.`);
    }
    result.respuesta_correcta = "";
    result.respuestas_aceptadas = [];
  }
  if (interaction === "verdadero_falso") {
    const answer = typeof normalizedPlan?.mechanic_contract?.expected_boolean === "boolean"
      ? normalizedPlan.mechanic_contract.expected_boolean
      : normalizePlanBooleanAnswer(normalizedPlan.answer_target);
    result.subtipo_respuesta = "frase_corta";
    result.respuesta_correcta = answer;
    result.respuestas_aceptadas = [];
    result.opciones = [];
    result.reto = ensureBooleanEvaluationPrompt(result.reto, normalizedPlan, locale);
  }
  const closed = closeGeneratedAnswer(result, interaction, true);
  const interactionIssues = questionInteractionIssues({ ...closed, tipo_interaccion: interaction }, { generated: true });
  if (interactionIssues.length) {
    const error = new Error(interactionIssues.join(" · "));
    error.questionIndexes = [questionIndex];
    throw error;
  }
  return closed;
}

function normalizeGeneratedRoomBundle(payload = {}, {
  formData = {},
  missionIndex = 0,
  questionCount = 1,
  roomInteractionPlan = [],
  sourceMission = null
} = {}) {
  const rawMission = pickMissionFromGeminiPayload(payload);
  const roomContract = getObjectiveRoomContract(formData, missionIndex);
  const rawQuestions = Array.isArray(rawMission?.preguntas) ? rawMission.preguntas : [];
  const questionPlans = Array.isArray(roomContract?.question_plans) ? roomContract.question_plans : [];
  const reservePlan = roomContract?.reserve_opportunity || questionPlans.at(-1) || {};
  const questions = Array.from({ length: questionCount }, (_, questionIndex) => {
    const question = rawQuestions[questionIndex] || {};
    const interaction = roomInteractionPlan[questionIndex] || "texto";
    const questionPlan = questionPlans[questionIndex] || reservePlan;
    const sourceQuestion = sourceMission?.preguntas?.[questionIndex] || null;
    const mechanicContract = structuredClone(questionPlan?.mechanic_contract || { kind: "none" });
    const questionWithStructure = {
      ...materializeGeneratedQuestionTemplate(question, questionPlan, interaction, {
        roomIndex: missionIndex,
        questionIndex,
        locale: formData.idioma
      }),
      id: sourceQuestion?.id || `question-${missionIndex + 1}-${questionIndex + 1}`,
      tipo_interaccion: interaction,
      requiere_imagen: interaction === "multimedia" || questionPlan?.requires_image === true,
      imagen: sourceQuestion?.imagen || "",
      _plan_id: normalizeString(question?._plan_id, ""),
      _assessment_case_id: normalizeString(questionPlan?.assessment_case_id, ""),
      _case_source: normalizeString(questionPlan?.case_source, ""),
      _case_data: normalizeTextList(questionPlan?.case_data || []),
      _transfer_delta: normalizeString(questionPlan?.transfer_delta, ""),
      _reasoning_evidence: normalizeString(questionPlan?.reasoning_evidence, ""),
      _integrates_knowledge_ids: normalizeTextList(questionPlan?.integrates_knowledge_ids || []),
      _mechanic_contract: mechanicContract,
      _narrative_effect: normalizeString(questionPlan?.narrative_effect, ""),
      _coverage_anchor: buildCoverageAnchorFromQuestionPlan(
        questionPlan,
        interaction
      )
    };
    questionWithStructure.media = buildGeneratedQuestionMedia(
      questionWithStructure,
      interaction,
      sourceQuestion?.media || null
    );
    return normalizeQuestion(questionWithStructure, missionIndex, questionIndex, formData.idioma || "es-419");
  });
  const copy = getGeneratedRoomTemplateCopy(formData.idioma);
  const curriculum = roomContract?.curriculum_inventory || {};
  const evidence = normalizeTextList(rawMission?.datos_clave || []);
  const fallbackEvidence = [
    ...normalizeTextList(curriculum?.knowledge || []),
    ...normalizeTextList(curriculum?.rules_or_procedures || []),
    ...normalizeTextList(curriculum?.teaching_examples || [])
  ];
  const requiredEvidenceCount = getRequiredBriefingEvidenceCount(formData);
  const materializedEvidence = [...new Map(evidence.map((value) => [normalizeObjectiveFixedText(value), value])).values()].filter(Boolean);
  // Existing public reminders are sufficient: do not append the entire lesson
  // and all examples a second time under "key evidence".
  for (const item of fallbackEvidence) {
    if (materializedEvidence.length >= requiredEvidenceCount) break;
    if (!materializedEvidence.some(value => normalizeObjectiveFixedText(value) === normalizeObjectiveFixedText(item))) materializedEvidence.push(item);
  }
  while (materializedEvidence.length < requiredEvidenceCount) {
    materializedEvidence.push(`${copy.context} ${materializedEvidence.length + 1}`);
  }
  return normalizeMission({
    ...rawMission,
    titulo: normalizeString(roomContract?.title, normalizeString(rawMission?.titulo, `${copy.question} ${missionIndex + 1}`)),
    historia: normalizeString(rawMission?.historia, normalizeString(roomContract?.narrative_beat?.obstacle, copy.story)),
    contexto: normalizeString(rawMission?.contexto, normalizeString(roomContract?.learning_focus, copy.context)),
    datos_clave: materializedEvidence,
    reto: normalizeString(rawMission?.reto, normalizeString(roomContract?.narrative_beat?.room_role, copy.challenge)),
    imagen_prompt: normalizeString(rawMission?.imagen_prompt, copy.imagePrompt),
    imagen_alt: normalizeString(rawMission?.imagen_alt, copy.imageAlt),
    id: sourceMission?.id || `mission-${missionIndex + 1}`,
    release: sourceMission?.release || getDefaultMissionRelease(missionIndex, formData.modoPresentacion),
    retroalimentacion_correcta: roomContract?.room_completion_feedback || "",
    desbloquea: sourceMission?.desbloquea || [],
    bloqueada_inicial: sourceMission?.bloqueada_inicial ?? missionIndex !== 0,
    imagen: sourceMission?.imagen || "",
    _narrative_contract: structuredClone(roomContract?.narrative_beat || {}),
    media: sourceMission?.media?.url
      ? { ...rawMission.media, url: sourceMission.media.url }
      : rawMission.media,
    preguntas: questions
  }, missionIndex, formData.modoPresentacion, formData.idioma || "es-419");
}

async function repairGeneratedDragQuestion(question, { formData, mission, missionIndex, questionIndex }) {
  const pair = {
    type: "object",
    properties: { izquierda: { type: "string" }, derecha: { type: "string" }, pista: { type: "string" } },
    required: ["izquierda", "derecha", "pista"]
  };
  const textFields = ["reto", "pista", "retroalimentacion_correcta", "retroalimentacion_incorrecta"];
  const slots = ["pair_1", "pair_2", "pair_3", "pair_4", "pair_5", "pair_6"];
  // Keep real correspondences across attempts. A blank feedback field must not
  // discard otherwise usable pairs and restart the entire activity.
  const pairs = mergeGeneratedQuestionPairs(question.parejas || question.pairs || []).slice(0, 6);
  const texts = Object.fromEntries(textFields.map((field) => [field, normalizeString(question[field], "")]));
  let issue = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const missingSlots = slots.slice(pairs.length);
    // Reword the instruction when expanding the set. Other existing feedback
    // stays intact unless it is missing; no generic filler is manufactured.
    const requestedTexts = textFields.filter((field) => !texts[field] || (field === "reto" && missingSlots.length));
    const required = [...requestedTexts, ...missingSlots];
    if (!required.length) return { ...question, ...texts, parejas: pairs };
    const schema = {
      type: "object",
      properties: {
        ...Object.fromEntries(requestedTexts.map((field) => [field, { type: "string", minLength: 1 }])),
        ...Object.fromEntries(missingSlots.map((slot) => [slot, pair]))
      },
      required
    };
    const filled = await requestQualityJson([
      `Completa los campos pendientes de una sola actividad Drag & Drop. Campos solicitados: ${required.join(", ")}. No devuelvas mission, question ni parejas.`,
      resolvePromptLanguageDirective(formData.idioma).directive,
      QUESTION_DIVERSITY_INSTRUCTION,
      buildDifficultyInstruction(formData),
      "Conserva el objetivo académico y completa exactamente seis correspondencias reales bajo el mismo criterio. izquierda es el destino visible; derecha es la ficha arrastrable. Cada destino y cada ficha deben ser distintos también respecto de las correspondencias conservadas. No repitas una categoría genérica como destino: utiliza casos concretos inequívocos. Nunca uses Evidence N, numeraciones artificiales ni metadatos para simular parejas distintas. Incluye en reto cualquier apoyo necesario no enseñado en el briefing, sin revelar las parejas correctas. El reto debe referirse al conjunto completo de seis correspondencias.",
      `Correspondencias conservadas que NO debes volver a emitir: ${JSON.stringify(pairs)}`,
      `Textos actuales: ${JSON.stringify(texts)}`,
      `Briefing disponible: ${JSON.stringify({ contexto: mission.contexto, datos_clave: mission.datos_clave })}`,
      `Pregunta que debes completar: ${JSON.stringify(question)}`,
      `Otras preguntas que no debes repetir: ${JSON.stringify((mission.preguntas || mission.questions || []).filter((_, index) => index !== questionIndex))}`,
      issue,
      "Devuelve exclusivamente el objeto JSON con los campos solicitados."
    ].join("\n"), formData, 0.32, { responseJsonSchema: schema });
    const rejected = [];
    for (const slot of missingSlots) {
      const candidate = normalizePairList([filled?.[slot]])[0];
      if (!candidate) {
        rejected.push(`${slot}: falta izquierda o derecha`);
        continue;
      }
      const duplicate = pairs.some((existing) =>
        normalizeObjectiveFixedText(existing.izquierda) === normalizeObjectiveFixedText(candidate.izquierda)
        || normalizeObjectiveFixedText(existing.derecha) === normalizeObjectiveFixedText(candidate.derecha));
      if (duplicate) rejected.push(`${slot}: repite destino o ficha: ${JSON.stringify(candidate)}`);
      else pairs.push(candidate);
    }
    for (const field of requestedTexts) {
      const value = normalizeString(filled?.[field], "");
      if (value) texts[field] = value;
      else {
        texts[field] = "";
        rejected.push(`${field}: texto vacío`);
      }
    }
    if (pairs.length === 6 && textFields.every((field) => texts[field])) return { ...question, ...texts, parejas: pairs };
    issue = `Corrige únicamente estos defectos de la respuesta anterior: ${rejected.join(" · ")}. Se conservaron ${pairs.length} correspondencias completas.`;
  }
  throw new Error(`Sala ${missionIndex + 1} · Pregunta ${questionIndex + 1}: no se pudo completar el arrastre. ${issue} Se conservó el borrador.`);
}

async function repairQuestionInteraction(raw, interaction, formData, questionPlan = {}, mission = {}) {
  const contractVersion = interaction === 'completar_espacio' ? 2 : 1;
  const normalizedPlan = normalizeObjectiveQuestionPlan({ ...questionPlan, interaction }, interaction);
  if (experience.get(interaction)) {
    const issues = experience.authoringIssues(interaction, normalizedPlan.interaction_data);
    if (issues.length) throw new Error(`El contrato del objetivo necesita regenerarse antes de reparar la pregunta: ${issues.join(' · ')}`);
  }
  const plannedFillBlankCount = interaction === 'completar_espacio'
    ? normalizeQuestionPlanSolutionPairs(normalizedPlan).length
    : 0;
  let candidate = {
    ...applyQuestionPlanAnswerContract(raw, normalizedPlan, interaction, formData.idioma),
    tipo_interaccion: interaction,
    interaction_contract_version: contractVersion
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const issues = [...questionInteractionIssues(candidate, { generated: true }), ...generatedQuestionPlanIssues(candidate, questionPlan, interaction)];
    if (!issues.length) return candidate;
    if (attempt === 2) throw new Error(issues.join(" · "));
    const repaired = await requestFixedSingleQuestion([
      `Corrige esta pregunta conservando su objetivo, idioma y datos. Devuelve el objeto completo de la pregunta. Multimedia: cuatro opciones y una solución literal, recurso necesario. Completar espacio: usa exactamente ${plannedFillBlankCount || "el mismo número de"} marcadores literales ___ sin numerarlos y exactamente una pareja numerada por marcador; derecha puede contener una palabra o expresión breve; el alumno arrastra, no escribe. Texto: respuesta exacta; nunca frase libre.`,
      buildDifficultyInstruction(formData),
      buildQuestionAuthoringTemplate(interaction),
      `Plan privado obligatorio: ${JSON.stringify(normalizedPlan)}. No cambies su solución para resolver una contradicción; reconstruye el acertijo coherentemente.`,
      `Briefing bloqueado: ${JSON.stringify({ contexto: mission.contexto, datos_clave: mission.datos_clave })}`,
      JSON.stringify({ question: candidate, issues })
    ].join("\n"), formData, interaction);
    candidate = {
      ...applyQuestionPlanAnswerContract(
        normalizeSingleQuestionTransport(repaired, interaction).question,
        normalizedPlan,
        interaction,
        formData.idioma
      ),
      tipo_interaccion: interaction,
      interaction_contract_version: contractVersion
    };
  }
}

async function analyzeAndRepairGeneratedRoom(response, error, { formData, missionIndex, questionCount, roomInteractionPlan, sourceMission }) {
  const original = pickMissionFromGeminiPayload(response);
  const indexes = Array.isArray(error.questionIndexes)
    ? [...new Set(error.questionIndexes)].filter(index => Number.isInteger(index) && index >= 0 && index < questionCount)
    : [];
  const scope = indexes.length ? indexes : Array.from({ length: questionCount }, (_, index) => index);
  const roomContract = getObjectiveRoomContract(formData, missionIndex);
  updatePreviewGenerationProgress({ title: `Analizando fallo de sala ${missionIndex + 1}`, detail: error.message });
  // The local validator already supplies the defect; avoid a second AI diagnosis.
  const analysis = { cause: error.message, corrections: scope.map(questionIndex => ({ questionIndex, instruction: error.message })) };
  updatePreviewGenerationProgress({ title: `Corrigiendo sala ${missionIndex + 1}`, detail: analysis.cause });
  const fixed = await requestQualityJson([
    buildRoomBundlePrompt({ formData, missionIndex, questionCount, roomInteractionPlan, preserveInteractionPlan: Boolean(sourceMission) }),
    "Aplica el diagnóstico a la sala rechazada. Devuelve el objeto completo con el mismo orden de preguntas. Corrige únicamente los índices indicados. Conserva los datos y las demás preguntas. En Multimedia incluye el answer_target aprobado literalmente en una única opción, con otras tres opciones distintas y un recurso pertinente. No cambies la clave final.",
    `VALIDACIÓN LOCAL OBLIGATORIA: ${error.message}. Corrige este defecto aunque el diagnóstico lo haya omitido. Para anagramas o cifrados, integra la pista calculada en reto, nunca la solución ni los resultados intermedios. Comprueba su presencia antes de responder.`,
    JSON.stringify({ questionIndexes: scope, analysis, rejectedRoom: original })
  ].join("\n"), formData, 0.25, { responseJsonSchema: buildRoomBundleResponseSchema(questionCount, getRequiredBriefingEvidenceCount(formData)) });
  const repaired = pickMissionFromGeminiPayload(fixed);
  const questions = repaired.preguntas || repaired.questions || [];
  if (scope.some(index => !questions[index] || typeof questions[index] !== "object")) {
    throw new Error(`Sala ${missionIndex + 1}: la corrección omitió preguntas requeridas. ${error.message}`);
  }
  return { mission: indexes.length
    ? { ...original, preguntas: Array.from({ length: questionCount }, (_, index) => indexes.includes(index) ? questions[index] : (original.preguntas || original.questions || [])[index]) }
    : { ...repaired, preguntas: questions } };
}

async function requestGeneratedRoomBundle(formData = {}, missionIndex = 0, {
  roomInteractionPlan = [],
  sourceMission = null,
  progressMode = "create",
  suppliedResponse = null
} = {}) {
  const questionCount = Math.max(1, Number(sourceMission?.preguntas?.length) || Number(formData.preguntasPorSala) || 1);
  const progressTitle = progressMode === "repair"
    ? `Corrigiendo sala ${missionIndex + 1}`
    : progressMode === "complete"
      ? `Completando sala ${missionIndex + 1}`
      : `Creando sala ${missionIndex + 1}`;
  const contract = getObjectiveRoomContract(formData, missionIndex);
  for (const plan of contract?.question_plans || []) {
    if (!experience.get(plan.interaction)) continue;
    const issues = experience.authoringIssues(plan.interaction, experience.normalizeContract(plan.interaction_data, plan.interaction));
    if (issues.length) throw new Error(`El objetivo de la sala ${missionIndex + 1}, ${plan.plan_id}, necesita regenerarse: ${issues.join(' · ')}. No se enviaron solicitudes para generar esta sala.`);
  }
  updatePreviewGenerationProgress({
    title: progressTitle,
    detail: "Gemini está rellenando la plantilla fija de la sala y sus preguntas"
  });
  let response = suppliedResponse || await requestQualityJson(
    buildRoomBundlePrompt({
      formData,
      missionIndex,
      questionCount,
      roomInteractionPlan,
      preserveInteractionPlan: Boolean(sourceMission)
    }),
    formData,
    0.42,
    { responseJsonSchema: buildRoomBundleResponseSchema(questionCount, getRequiredBriefingEvidenceCount(formData)), singleAttempt: true }
  );
  try {
    const rawMission = pickMissionFromGeminiPayload(response);
    const rawQuestions = rawMission.preguntas || rawMission.questions || [];
    const roomContract = getObjectiveRoomContract(formData, missionIndex) || {};
    const questionPlans = Array.isArray(roomContract.question_plans) ? roomContract.question_plans : [];
    const reservePlan = roomContract.reserve_opportunity || questionPlans.at(-1) || {};
    for (let index = 0; index < roomInteractionPlan.length; index += 1) {
      const interaction = roomInteractionPlan[index] || "texto";
      const plan = questionPlans[index] || reservePlan;
      rawQuestions[index] = applyQuestionPlanAnswerContract(
        normalizeQuestionTransportFields(rawQuestions[index] || {}, interaction),
        normalizeObjectiveQuestionPlan({ ...plan, interaction }, interaction),
        interaction,
        formData.idioma
      );
    }
    for (let index = 0; index < roomInteractionPlan.length; index += 1) {
      const interaction = roomInteractionPlan[index];
      const plan = questionPlans[index] || reservePlan;
      const issues = questionInteractionIssues({
        ...(rawQuestions[index] || {}),
        tipo_interaccion: interaction,
        interaction_contract_version: ["relacion_columnas", "completar_espacio"].includes(interaction) ? 2 : 1
      }, { generated: true });
      if (interaction === "completar_espacio") {
        const expectedCount = normalizeQuestionPlanSolutionPairs(
          normalizeObjectiveQuestionPlan({ ...plan, interaction }, interaction)
        ).length;
        const actualCount = (normalizeFillBlankMarkers(rawQuestions[index]?.texto_con_hueco).match(/___/g) || []).length;
        if (expectedCount && actualCount !== expectedCount) {
          issues.unshift(`Completar lectura debe usar exactamente ${expectedCount} marcadores literales ___, uno por cada solución privada; recibió ${actualCount}. No numeres los marcadores.`);
        }
      }
      if (issues.length) {
        const error = new Error(issues.join(" · "));
        error.questionIndexes = [index];
        throw error;
      }
    }
    for (let index = 0; index < roomInteractionPlan.length; index += 1) {
      if (roomInteractionPlan[index] !== "drag_drop") continue;
      const question = rawQuestions[index] || {};
      const pairs = normalizePairList(question.parejas || question.pairs || []);
      const leftCount = new Set(pairs.map((pair) => normalizeObjectiveFixedText(pair.izquierda))).size;
      const rightCount = new Set(pairs.map((pair) => normalizeObjectiveFixedText(pair.derecha))).size;
      if (pairs.length === 6 && leftCount === 6 && rightCount === 6) continue;
      const error = new Error(`Drag & Drop requiere exactamente 6 correspondencias completas y distintas; recibió ${pairs.length}.`);
      error.questionIndexes = [index];
      throw error;
    }
    response = { mission: { ...rawMission, preguntas: rawQuestions } };
    const transport = normalizeRoomBundleTransport(response, roomInteractionPlan);
    const mission = normalizeGeneratedRoomBundle(transport, {
      formData, missionIndex, questionCount, roomInteractionPlan, sourceMission
    });
    const repeated = findRepeatedQuestionPlans(mission.preguntas.map((question) => ({
      plan_id: question.id,
      application: question.reto,
      answer_target: ["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion)
        ? question.parejas.map((pair) => `${pair.izquierda} → ${pair.derecha}`).join(" | ")
        : question.tipo_interaccion === "ordenar_secuencia"
          ? question.elementos.join(" → ")
          : question.respuesta_correcta
    })));
    if (!repeated.length) return mission;
    const error = new Error(`Sala ${missionIndex + 1}: ${repeated.map((issue) => `pregunta ${issue.index + 1}: ${issue.message}`).join(" · ")}`);
    error.questionIndexes = repeated.map((issue) => issue.index);
    throw error;
    } catch (error) {
      error.generatedMission ||= pickMissionFromGeminiPayload(response);
      throw error;
  }
}
async function runWithConcurrency(items = [], limit = 2, worker, { stopOnFailure = false } = {}) {
  const queue = [...items];
  const failures = [];
  let halted = false;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), queue.length) }, async () => {
    while (queue.length && !halted) {
      const item = queue.shift();
      try {
        await worker(item);
      } catch (error) {
        failures.push({ item, error });
        if (stopOnFailure) halted = true;
      }
    }
  });
  await Promise.all(runners);
  return failures;
}

function createPrivateGenerationDraft(formData = {}, blueprint = {}, interactionPlan = []) {
  const missionCount = Math.max(1, Math.min(8, Number(formData.misiones) || 4));
  return {
    contractVersion: CONTENT_GENERATION_CONTRACT_VERSION,
    key: buildObjectiveBlueprintKey(formData),
    interactionPlan: structuredClone(interactionPlan),
    project: buildPrivateProjectShell(formData, blueprint),
    rooms: Array.from({ length: missionCount }, (_, missionIndex) => (
      getReusableObjectiveGeneratedMission(blueprint, missionIndex, formData, interactionPlan[missionIndex])
    )),
    rejectedRooms: Array.from({ length: missionCount }, () => null)
  };
}

function hydratePrivateGenerationDraftFromObjective(draft = {}, blueprint = {}, formData = {}, interactionPlan = []) {
  const result = structuredClone(draft);
  result.rooms = Array.from({ length: result.rooms.length }, (_, missionIndex) => (
    result.rooms[missionIndex]
      || getReusableObjectiveGeneratedMission(blueprint, missionIndex, formData, interactionPlan[missionIndex])
      || null
  ));
  return result;
}

function getReusablePrivateGenerationDraft(formData = {}) {
  const draft = state.pendingGenerationDraft;
  const expectedMissionCount = Math.max(1, Math.min(8, Number(formData.misiones) || 4));
  if (!draft || draft.contractVersion !== CONTENT_GENERATION_CONTRACT_VERSION) return null;
  if (state.pendingGenerationDraftKey !== buildObjectiveBlueprintKey(formData)) return null;
  if (!Array.isArray(draft.rooms) || draft.rooms.length !== expectedMissionCount) return null;
  if (!Array.isArray(draft.interactionPlan) || draft.interactionPlan.length !== expectedMissionCount) return null;
  return structuredClone(draft);
}

function assemblePrivateGenerationDraft(draft = {}, formData = {}, academicTheme = {}) {
  const missions = (draft.rooms || []).map((mission) => structuredClone(mission));
  return {
    ...(draft.project || {}),
    misiones: applySequentialMissionRoutes(missions),
    idioma: formData.idioma || "es-419",
    modo_presentacion: normalizePresentationMode(formData.modoPresentacion),
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
  };
}

function hasCompleteCoverageAnchor(anchor = "") {
  const normalized = normalizeBaseText(anchor);
  return ["evidencia", "conocimiento", "operacion", "familia de respuesta"]
    .every((label) => normalized.includes(normalizeBaseText(label)));
}

function getGeneratedStructureIssues(project = {}, formData = {}) {
  const expectedMissionCount = Math.max(1, Math.min(8, Number(formData.misiones) || 4));
  const expectedQuestionCount = Math.max(1, Number(formData.preguntasPorSala) || 1);
  const missions = Array.isArray(project?.misiones) ? project.misiones : [];
  const issues = [];
  if (missions.length !== expectedMissionCount) {
    issues.push(`misiones: se esperaban ${expectedMissionCount} y se recibieron ${missions.length}`);
  }
  missions.forEach((mission, missionIndex) => {
    const questions = Array.isArray(mission?.preguntas) ? mission.preguntas : [];
    if (questions.length !== expectedQuestionCount) {
      issues.push(`sala ${missionIndex + 1}: se esperaban ${expectedQuestionCount} preguntas y se recibieron ${questions.length}`);
      return;
    }
  });
  return issues;
}

function applyLocalQuestionStructure(generated = {}, formData = {}) {
  const interactionPlan = Array.isArray(formData.interactionPlan) ? formData.interactionPlan : [];
  const expectedMissionCount = Math.max(1, Math.min(8, Math.floor(Number(formData.misiones) || interactionPlan.length || 1)));
  const expectedQuestionCount = Math.max(1, Math.floor(Number(formData.preguntasPorSala) || interactionPlan[0]?.length || 1));
  const nestedMissions = Array.isArray(generated?.misiones) ? generated.misiones : [];
  const flatQuestions = Array.isArray(generated?.questions)
    ? generated.questions
    : Array.isArray(generated?.preguntas)
      ? generated.preguntas
      : [];
  const missions = nestedMissions.length
    ? nestedMissions
    : Array.from({ length: expectedMissionCount }, (_, missionIndex) => ({
        preguntas: flatQuestions.slice(
          missionIndex * expectedQuestionCount,
          (missionIndex + 1) * expectedQuestionCount
        )
      }));
  const hadExtraContent = missions.length > expectedMissionCount || missions.some((mission) => (
    Array.isArray(mission?.preguntas) && mission.preguntas.length > expectedQuestionCount
  )) || flatQuestions.length > expectedMissionCount * expectedQuestionCount;
  if (hadExtraContent) {
    console.info("[PigPenCreator] La salida de Gemini contenía elementos adicionales; PigPen conservó únicamente la estructura solicitada.", {
      expectedMissionCount,
      expectedQuestionCount,
      receivedQuestionCounts: missions.map((mission) => Array.isArray(mission?.preguntas) ? mission.preguntas.length : 0)
    });
  }
  return {
    misiones: missions.slice(0, expectedMissionCount).map((mission, missionIndex) => ({
      preguntas: (Array.isArray(mission?.preguntas) ? mission.preguntas : [])
        .slice(0, expectedQuestionCount)
        .map((question, questionIndex) => ({
        ...question,
        id: `question-${missionIndex + 1}-${questionIndex + 1}`,
        tipo_interaccion: interactionPlan[missionIndex]?.[questionIndex] || "texto"
        }))
    }))
  };
}

function assignLocalCoverageAnchors(mission = {}) {
  const questions = Array.isArray(mission?.preguntas) ? mission.preguntas : [];
  questions.forEach((question) => {
    if (question && typeof question === "object") delete question._coverage_anchor;
  });
  const result = assignBriefingCoverageAnchors(mission);
  if (result.issues.length) {
    throw new Error(result.issues.map((issue) => issue.message).join(" · "));
  }
  return mission;
}

function extractGeneratedJson(rawText = "") {
  const cleaned = String(rawText).replace(/```json/gi, "").replace(/```/g, "").trim();
  let parseError = null;
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    parseError = error;
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (nestedError) {
        parseError = nestedError;
      }
    }
  }
  // Only repair punctuation locally; all schema and educational checks still run.
  try { return repairJsonCommas(cleaned); } catch {}
  const error = new Error(`No se pudo interpretar el JSON devuelto por la IA${parseError?.message ? `: ${parseError.message}` : "."}`);
  error.cause = parseError;
  throw error;
}

async function repairGeneratedEscapeRoomJson(rawText, formData) {
  const malformed = String(rawText || "").trim();
  if (!malformed) throw new Error("La IA no devolvió contenido JSON para reparar.");
  const repairedResponse = await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), {
    method: "POST",
    body: {
      model: formData.modelo || TEXT_MODEL_DEFAULT,
      payload: {
        systemInstruction: {
          parts: [{
            text: "Eres un reparador de JSON. Corrige únicamente sintaxis, comas, comillas y cierres. Conserva todo el contenido, no inventes salas ni preguntas ausentes y responde solo JSON válido."
          }]
        },
        contents: [{
          role: "user",
          parts: [{ text: `Corrige únicamente la sintaxis de este JSON sin resumirlo, completar contenido faltante ni cambiar sus datos:\n${malformed}` }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 16384,
          temperature: 0
        }
      }
    }
  });
  const repairedText = (repairedResponse?.candidates?.[0]?.content?.parts || [])
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .join("")
    || normalizeString(repairedResponse?.text || repairedResponse?.output_text, "");
  return extractGeneratedJson(repairedText);
}

function extractJsonFromGeminiResponse(rawResponse = {}) {
  const finishReason = rawResponse?.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    const error = new Error("Gemini cortó la respuesta al alcanzar su límite de salida. No se aceptó contenido incompleto ni se reintentó automáticamente. Las salas guardadas se conservan; reduce las preguntas por sala antes de volver a generar.");
    error.code = 'gemini_output_truncated';
    throw error;
  }
  return extractGeneratedJson(extractGeminiText(rawResponse));
}

function extractGeminiImageData(imageData = {}) {
  const response = imageData?.response && typeof imageData.response === "object" ? imageData.response : imageData;
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    for (const part of (candidate?.content?.parts || [])) {
      const inline = part?.inlineData || part?.inline_data;
      const mime = String(inline?.mimeType || inline?.mime_type || "").trim();
      const base64 = String(inline?.data || "").trim();
      if (mime && base64 && /^image\//i.test(mime)) {
        return `data:${mime};base64,${base64}`;
      }
    }
  }
  const finishReason = candidates.map((candidate) => candidate?.finishReason || candidate?.finish_reason).filter(Boolean).join(", ");
  const blockReason = response?.promptFeedback?.blockReason || response?.prompt_feedback?.block_reason || "";
  throw new Error(`No se recibió una imagen válida${blockReason ? `: solicitud bloqueada (${blockReason})` : finishReason ? `: ${finishReason}` : ""}.`);
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

function buildCoverImagePromptSeed(data = {}) {
  const title = normalizeString(data.titulo, "el escape room");
  const setting = normalizeString(data.ambientacion, "su escenario principal");
  return `Escena panorámica de apertura para “${title}”, ambientada en ${setting}, que presente el mundo, el conflicto y la atmósfera de la aventura.`;
}

function buildCoverVisualPrompt(data = {}) {
  const visual = buildVisualDirection(data);
  const coverText = normalizeString(data.backgroundImageAlt ?? data.background_image_alt, "");
  const authoredPrompt = normalizeString(
    data.backgroundImagePrompt ?? data.background_image_prompt,
    buildCoverImagePromptSeed(data)
  );
  return [
    `Portada representativa del escape room ${normalizeString(data.titulo, "")}.`,
    `Tema principal: ${visual.temaResumen}.`,
    `Dirección visual: ${visual.line}.`,
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    authoredPrompt,
    coverText
      ? `TEXTO VISIBLE OBLIGATORIO EN LA PORTADA: ${JSON.stringify(coverText)}. Escríbelo literalmente, completo, legible y bien integrado en la composición, respetando idioma, mayúsculas y acentos, sin traducirlo ni añadir otros textos. Esta instrucción prevalece sobre cualquier indicación anterior de no incluir texto. Sin marcas de agua, acabado profesional.`
      : "Sin texto legible, sin marcas de agua, acabado profesional."
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
    buildImageTextPolicyLine({ allowOptionalText: true }),
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    `La imagen debe apoyar el briefing y su introducción a los ejercicios: ${normalizeString(mission.reto, `Explorar la ${terms.itemSingular}.`)}`,
    "REGLA ESTRICTA: La imagen ambienta y apoya la comprensión del briefing; no representa una pregunta adicional. Bajo ninguna circunstancia muestres o escribas respuestas, soluciones, equivalencias ni letras de la clave sobre el dibujo.",
    normalizeString(mission.imagen_prompt, "") || `Escena visual para contextualizar el briefing de la ${terms.itemSingular}.`,
    buildImageTextPolicyLine({ allowOptionalText: true })
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
    buildImageTextPolicyLine({ allowOptionalText: true }),
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    `La imagen debe apoyar el reto: ${normalizeString(question.reto, "Resolver la pregunta.")}`,
    `REGLA ESTRICTA: La imagen es un apoyo visual o pista para resolver el ejercicio. Bajo ninguna circunstancia muestres, dibujes o escribas la respuesta correcta o el valor de la solución final de forma explícita en la imagen. La solución debe quedar oculta para que el estudiante la deduzca.`,
    normalizeString(question.imagen_prompt, "") || normalizeString(question.media?.texto || question.media?.alt, "") || "Apoyo visual útil para resolver la pregunta.",
    buildImageTextPolicyLine({ allowOptionalText: true })
  ].filter(Boolean).join("\n");
}

async function generateGeminiImage(prompt, { aspectRatio = "16:9", imageSize = "2K", temperature = 0.58, model = IMAGE_MODEL_DEFAULT } = {}) {
  const imageModel = ALLOWED_IMAGE_MODELS.has(String(model || "").trim())
    ? String(model).trim()
    : IMAGE_MODEL_DEFAULT;
  const requestOptions = {
    method: "POST",
    body: {
      model: imageModel,
      payload: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio, imageSize },
          temperature
        }
      }
    }
  };
  // Una respuesta 429/5xx puede llegar después de que Vertex haya empezado a
  // producir la imagen. Repetir aquí la misma petición puede duplicar consumo;
  // el proxy ya gestiona su fallback de modelo antes de devolver la respuesta.
  return extractGeminiImageData(await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), requestOptions));
}

function yieldToBrowser() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo convertir la imagen optimizada."));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlobAsync(value = "") {
  const source = String(value || "").trim();
  const match = source.match(/^data:([^;,]*)(;base64)?,(.*)$/is);
  if (!match) return null;
  if (!match[2]) {
    await yieldToBrowser();
    return dataUrlToBlob(source);
  }
  const mimeType = String(match[1] || "application/octet-stream").split(";", 1)[0].trim()
    || "application/octet-stream";
  const base64 = match[3].replace(/\s/g, "");
  const chunkSize = 256 * 1024;
  const chunks = [];
  try {
    for (let offset = 0; offset < base64.length; offset += chunkSize) {
      const binary = atob(base64.slice(offset, offset + chunkSize));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      chunks.push(bytes);
      if (offset + chunkSize < base64.length) await yieldToBrowser();
    }
    return new Blob(chunks, { type: mimeType });
  } catch (_) {
    return null;
  }
}

async function imageBytesToDataUrl(bytesLike, mimeType = "image/webp") {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || 0);
  return blobToDataUrl(new Blob([bytes], { type: mimeType }));
}

async function optimizeGeneratedImageForProject(imageDataUrl = "") {
  const source = String(imageDataUrl || "");
  if (!isDataUrl(source)) return source;
  try {
    await yieldToBrowser();
    const blob = await dataUrlToBlobAsync(source);
    if (!blob) return source;
    const optimized = await optimizeRasterImage(blob, {
      maxDimension: 1280,
      quality: 0.8,
      outputMimeType: "image/webp"
    });
    if (optimized.status === "failed" || !optimized.bytes?.length) return source;
    const candidate = await imageBytesToDataUrl(optimized.bytes, optimized.mimeType || "image/webp");
    return candidate && candidate.length < source.length ? candidate : source;
  } catch (error) {
    console.warn("La imagen se conservará sin optimización:", error);
    return source;
  }
}

async function generateValidatedImage(prompt, imageOptions) {
  const image = await generateGeminiImage(prompt, imageOptions);
  return optimizeGeneratedImageForProject(image);
}

async function generateCoverImage(project, context) {
  try {
    updatePreviewGenerationProgress({
      title: "Creando imagen de portada",
      detail: "Preparando la identidad visual del escape room"
    });
    return await generateValidatedImage(buildCoverVisualPrompt({ ...project, ...context }), {
      aspectRatio: "16:9",
      imageSize: "1K",
      model: context?.modeloImagen
    });
  } catch (error) {
    console.warn("No se pudo generar la portada:", error);
    return "";
  }
}

async function ensureRewardImage(project, context) {
  if(project.experience_config?.primary_reward!=='imagen')return;
  project.reward_plan=rewardEngine.bindPlan(project.reward_plan,project);
  if(project.reward_plan.image)return;
  setStatus('Creando la imagen de recompensa…','info');
  const visual=buildVisualDirection({...project,...context});
  const generated=await generateValidatedImage([
    'Crea una ilustración de recompensa visual para el escape room descrito por el autor.',
    selectedExperienceInstruction(context),
    'Dirección visual: '+visual.line,
    'Tema: '+project.tema+'. Título: '+project.titulo,
    'Contenido de las salas: '+project.misiones.map(m=>m.titulo).join('; '),
    'Composición panorámica coherente con la narrativa elegida. Sin texto, códigos, letras, números, interfaces ni marcas de agua.'
  ].join('\n'),{aspectRatio:'16:9',imageSize:'1K',model:context.modeloImagen});
  if(!generated)throw new Error('No se recibió la imagen de recompensa.');
  const image=await storeGeneratedImage(generated, `reward_${Date.now()}.webp`, await resolveGeneratedImageStorageContext());
  if(state.project!==project)throw new Error('El tema abierto cambió antes de guardar la imagen de recompensa.');
  project.experience_config.reward_image=image || generated;
  project.experience_config.reward_image_alt=project.titulo;
  const dimensions=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth/img.naturalHeight);img.onerror=()=>resolve(16/9);img.src=generated;});
  project.experience_config.reward_image_aspect=dimensions;
  project.reward_plan=rewardEngine.buildPlan(project.experience_config,project.clave_final,project.reward_plan.rooms.map(r=>({id:r.room_id,titulo:r.title,fragment:r.fragment,learning:r.learning})));
  renderPreview();scheduleSessionSave();
}
async function retryRewardImage() {
  if(!state.project||state.isGenerating||state.isLoading)return;
  const project=state.project;state.isGenerating=true;syncActionButtons();
  try{await ensureRewardImage(project,getFormData());setStatus('Imagen de recompensa lista.','success');}
  catch(error){setStatus('Recompensa visual pendiente: '+error.message,'error',{actionLabel:'Reintentar imagen',onAction:retryRewardImage});}
  finally{state.isGenerating=false;syncActionButtons();}
}

async function generateEndingImage(project, context) {
  const visual = buildVisualDirection({ ...project, ...context });
  updatePreviewGenerationProgress({ title: "Creando imagen de finalización", detail: "Representando los retos completados y la misión cumplida" });
  return generateValidatedImage([
    `Ilustración de desenlace victorioso para ${project.titulo || "el escape room"}.`,
    `Tema: ${visual.temaResumen}. Dirección visual: ${visual.line}.`,
    visual.ambientacion ? `Ambientación: ${visual.ambientacion}.` : "",
    `Recorrido completado: ${(project.misiones || []).map(m => m.titulo).join("; ")}.`,
    `Resultado narrativo: ${project.conclusion || "Los desafíos han sido resueltos y la misión está cumplida."}`,
    "Crea una escena NUEVA del estado final: escenario restaurado, mecanismo activado o destino alcanzado, según el contexto. Sensación de logro y cierre. No es una portada ni una escena de inicio; cambia la composición y muestra el resultado de superar los retos. Mantén la ambientación y estilo del juego. Sin texto, letras de claves, interfaces ni marcas de agua."
  ].filter(Boolean).join("\n"), { aspectRatio: "16:9", imageSize: "1K", model: context?.modeloImagen });
}

async function regenerateEndingImageOnly() {
  if (!state.project || isGenerationBusy() || state.isLoading) return;
  const project = state.project;
  state.isGenerating = true;
  renderGeneralContentEditor();
  syncActionButtons();
  setStatus("Generando imagen de finalización…", "info");
  try {
    const generated = await generateEndingImage(project, getFormData());
    const image = await storeGeneratedImage(generated, `ending_${Date.now()}.webp`, await resolveGeneratedImageStorageContext());
    if (!image) throw new Error("El modelo no devolvió una imagen de finalización válida.");
    if (state.project !== project) throw new Error("El tema abierto cambió. Vuelve a intentar desde el tema de destino.");
    project.endingImage = image;
    renderOutputsNow();
    scheduleSessionSave();
    if (pendingAssetMemory.size) showPendingAssetStatus();
    else setStatus("Imagen de finalización lista. Las preguntas no cambiaron.", "success");
  } catch (error) {
    setStatus(error?.message || "No se pudo generar la imagen de finalización.", "bad");
  } finally {
    state.isGenerating = false;
    renderGeneralContentEditor();
    refreshPanels();
  }
}

async function regenerateCoverImageOnly() {
  if (!state.project || isGenerationBusy()) {
    if (!state.project) setStatus("Genera un escape room antes de regenerar la imagen de inicio.", "warning");
    return;
  }
  const formData = getFormData();
  state.isGenerating = true;
  renderGeneralContentEditor();
  syncActionButtons();
  setStatus("Regenerando la imagen de inicio…", "info");
  try {
    const generatedImage = await generateCoverImage(state.project, formData);
    const image = await storeGeneratedImage(
      generatedImage,
      `cover_${Date.now()}.webp`,
      await resolveGeneratedImageStorageContext()
    );
    if (!image) throw new Error("El modelo no devolvió una imagen de inicio válida.");
    state.project.backgroundImage = image;
    renderOutputsNow();
    setStatus("Imagen de inicio regenerada.", "success");
  } catch (error) {
    console.error("No se pudo regenerar la imagen de inicio:", error);
    setStatus(error?.auditIssues?.length ? error.message : "No se pudo regenerar la imagen de inicio. Intenta de nuevo.", "bad");
  } finally {
    state.isGenerating = false;
    renderGeneralContentEditor();
    refreshPanels();
  }
}

async function replaceCoverImage(file, kind = "cover") {
  if (isGenerationBusy() || state.isLoading) return;
  const isEnding = kind === "ending";
  const field = isEnding ? "endingImage" : "backgroundImage";
  const label = isEnding ? "del mensaje final" : "de inicio";
  if (!state.currentUser?.uid) {
    setStatus("Debes iniciar sesión para guardar la imagen de inicio en Firebase.", "warning");
    return;
  }
  if (!state.project) {
    setStatus("Genera un escape room antes de añadir una imagen de inicio.", "warning");
    return;
  }
  if (!file) {
    setStatus("Selecciona una imagen para la portada.", "warning");
    return;
  }
  if (!file.type.startsWith("image/")) {
    setStatus("El archivo seleccionado no parece ser una imagen.", "warning");
    return;
  }

  state.isGenerating = true;
  renderGeneralContentEditor();
  syncActionButtons();
  setStatus(`Subiendo imagen ${label}…`, "info");
  const project = state.project;
  try {
    const sessionId = await ensureActiveRemoteSession();
    if (!sessionId) throw new Error("No se pudo crear o recuperar la sesión activa.");
    const topicId = await ensureActiveTopic(sessionId);
    const imageDataUrl = await readImageFileAsDataUrl(file);
    if (state.project !== project) throw new Error("El tema abierto cambió.");
    project[field] = imageDataUrl;
    renderOutputsNow();
    const storagePath = `escaperooms/${state.currentUser.uid}/${sessionId}/${topicId}/${kind}_${Date.now()}.png`;
    const storageUrl = await uploadImageIfDataUrl(imageDataUrl, storagePath);
    if (!storageUrl) throw new Error("No se obtuvo una imagen válida.");
    project[field] = storageUrl;
    if (state.project !== project) return;
    renderOutputsNow();
    setStatus(
      isDataUrl(storageUrl)
        ? `Imagen ${label} añadida, pero no se pudo guardar en Storage en este entorno.`
        : `Imagen ${label} añadida y guardada.`,
      isDataUrl(storageUrl) ? "warning" : "success"
    );
  } catch (error) {
    console.error("No se pudo sustituir la imagen de inicio:", error);
    if (error?.code !== "asset_upload_pending") setStatus(`No fue posible guardar la imagen ${label}.`, "bad");
  } finally {
    state.isGenerating = false;
    renderGeneralContentEditor();
    refreshPanels();
  }
}

async function regenerateQuestionImageOnly(missionIndex, questionIndex) {
  if (!state.project || isGenerationBusy()) {
    if (!state.project) setStatus("Genera un escape room antes de regenerar una imagen.", "warning");
    return;
  }
  const roomIndex = Number(missionIndex);
  const qIndex = Number(questionIndex);
  const mission = state.project.misiones?.[roomIndex];
  const question = mission?.preguntas?.[qIndex];
  if (!mission || !question) {
    setStatus("Selecciona una pregunta válida para regenerar su imagen.", "warning");
    return;
  }

  const formData = getFormData();
  const terms = getPresentationTerminology();
  const actionButton = elements.missionEditorList?.querySelector(`[data-question-action="regenerate-question-image"][data-question-mission-index="${roomIndex}"][data-question-index="${qIndex}"]`);
  state.isGenerating = true;
  if (actionButton) {
    actionButton.disabled = true;
    actionButton.setAttribute("aria-busy", "true");
    const icon = actionButton.querySelector("i");
    if (icon) icon.className = "fas fa-spinner fa-spin";
  }
  setStatus(`Regenerando imagen de la pregunta ${qIndex + 1}…`, "info");
  refreshPanels();
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  try {
    const result = await generateMissionImages(state.project, formData, null, {
      missionIndexes: [roomIndex],
      includeMissionImage: false,
      includeQuestions: true,
      forceQuestionImages: true,
      questionScope: { missionIndex: roomIndex, questionIndex: qIndex }
    });
    if (!result.generated) throw result.error || new Error("El modelo no devolvió una imagen válida.");
    renderOutputsNow();
    setStatus(`Imagen de la pregunta ${qIndex + 1} de ${terms.itemSingular} ${roomIndex + 1} regenerada.`, "success");
  } catch (error) {
    console.error("No se pudo regenerar la imagen de la pregunta:", error);
    setStatus(error?.auditIssues?.length ? error.message : "No se pudo regenerar la imagen de la pregunta. Intenta de nuevo.", "bad");
  } finally {
    state.isGenerating = false;
    renderMissionEditor();
    refreshPanels();
  }
}

function removeQuestionImage(missionIndex, questionIndex) {
  const roomIndex = Number(missionIndex);
  const qIndex = Number(questionIndex);
  const question = state.project?.misiones?.[roomIndex]?.preguntas?.[qIndex];
  if (!Number.isInteger(roomIndex) || !Number.isInteger(qIndex) || !question) {
    setStatus("Selecciona una pregunta válida para eliminar su imagen.", "warning");
    return false;
  }
  const hasImage = Boolean(
    normalizeString(question.imagen, "")
    || (question.media?.tipo === "imagen" && normalizeString(question.media?.url, ""))
  );
  if (!hasImage) {
    setStatus(`La pregunta ${qIndex + 1} no tiene una imagen para eliminar.`, "info");
    return false;
  }
  question.imagen = "";
  if (question.media?.tipo === "imagen") {
    question.media = { ...question.media, url: "" };
  }
  renderMissionEditor();
  renderOutputsNow();
  setStatus(`Imagen de la pregunta ${qIndex + 1} eliminada.`, "success");
  return true;
}

async function regenerateMissionImageOnly(missionIndex) {
  if (!state.project || isGenerationBusy()) {
    if (!state.project) setStatus("Genera un escape room antes de regenerar una imagen.", "warning");
    return;
  }
  const roomIndex = Number(missionIndex);
  const mission = state.project.misiones?.[roomIndex];
  if (!Number.isInteger(roomIndex) || !mission) {
    setStatus("Selecciona una sala válida para regenerar su imagen.", "warning");
    return;
  }

  const formData = getFormData();
  const terms = getPresentationTerminology();
  const actionButton = elements.missionEditorList?.querySelector(
    `[data-action="regenerate-mission-image"][data-index="${roomIndex}"]`
  );
  state.isGenerating = true;
  if (actionButton) {
    actionButton.disabled = true;
    actionButton.setAttribute("aria-busy", "true");
    const icon = actionButton.querySelector("i");
    if (icon) icon.className = "fas fa-spinner fa-spin";
  }
  setStatus(`Regenerando imagen de la ${terms.itemSingular} ${roomIndex + 1}…`, "info");
  refreshPanels();
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

  try {
    const result = await generateMissionImages(state.project, formData, null, {
      missionIndexes: [roomIndex],
      includeMissionImage: true,
      includeQuestions: false,
      forceMissionImages: true
    });
    if (!result.generated) throw result.error || new Error("El modelo no devolvió una imagen válida.");
    renderOutputsNow();
    setStatus(`Imagen de la ${terms.itemSingular} ${roomIndex + 1} regenerada.`, "success");
  } catch (error) {
    console.error("No se pudo regenerar la imagen de la sala:", error);
    setStatus("No se pudo regenerar la imagen de la sala. Intenta de nuevo.", "bad");
  } finally {
    state.isGenerating = false;
    renderMissionEditor();
    refreshPanels();
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
    forceMissionImages: options.forceMissionImages === true,
    forceQuestionImages: options.forceQuestionImages === true
  };
}

function selectQuestionImageIndexes(mission = {}) {
  return new Set((Array.isArray(mission.preguntas) ? mission.preguntas : [])
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => {
      const requiresImage = question?.requiere_imagen === true || question?.requires_image === true
        || (question?.interaction_contract_version === 1 && question.tipo_interaccion === "multimedia"
          && (!question.media?.tipo || question.media.tipo === "imagen"));
      return requiresImage && !normalizeString(question.media?.url || question.imagen, "");
    })
    .map(({ index }) => index));
}

function preserveExistingProjectImages(nextProject = {}, previousProject = null) {
  if (!previousProject || typeof previousProject !== "object") return nextProject;
  if (!normalizeString(nextProject.backgroundImage, "") && normalizeString(previousProject.backgroundImage, "")) {
    nextProject.backgroundImage = previousProject.backgroundImage;
  }
  if (!normalizeString(nextProject.endingImage, "") && normalizeString(previousProject.endingImage, "")) {
    nextProject.endingImage = previousProject.endingImage;
  }
  const previousMissions = new Map((previousProject.misiones || [])
    .filter((mission) => normalizeString(mission?.id, ""))
    .map((mission) => [mission.id, mission]));
  (nextProject.misiones || []).forEach((mission) => {
    const previousMission = previousMissions.get(mission?.id);
    if (!previousMission) return;
    const previousMissionImage = normalizeString(
      previousMission.imagen || (previousMission.media?.tipo === "imagen" ? previousMission.media?.url : ""),
      ""
    );
    if (!normalizeString(mission.imagen, "") && previousMissionImage) {
      mission.imagen = previousMissionImage;
      mission.media = {
        ...(mission.media || {}),
        tipo: "imagen",
        url: previousMissionImage,
        alt: mission.imagen_alt || mission.media?.alt || previousMission.imagen_alt || previousMission.media?.alt || ""
      };
    }
    const previousQuestions = new Map((previousMission.preguntas || [])
      .filter((question) => normalizeString(question?.id, ""))
      .map((question) => [question.id, question]));
    (mission.preguntas || []).forEach((question) => {
      const previousQuestion = previousQuestions.get(question?.id);
      if (!previousQuestion) return;
      const previousQuestionImage = normalizeString(
        previousQuestion.imagen || (previousQuestion.media?.tipo === "imagen" ? previousQuestion.media?.url : ""),
        ""
      );
      if (!normalizeString(question.imagen || question.media?.url, "") && previousQuestionImage) {
        question.imagen = previousQuestionImage;
        question.media = {
          ...(question.media || {}),
          tipo: "imagen",
          url: previousQuestionImage,
          alt: question.imagen_alt || question.media?.alt || previousQuestion.imagen_alt || previousQuestion.media?.alt || ""
        };
      }
    });
  });
  return nextProject;
}

async function generateMissionImages(project, context, onProgress, options = {}) {
  const scope = resolveImageGenerationScope(project, options);
  const storageContext = Object.hasOwn(options, "storageContext")
    ? options.storageContext
    : await resolveGeneratedImageStorageContext();
  const terms = getPresentationTerminology(project?.modo_presentacion || context?.modoPresentacion);
  const selectedQuestionsByMission = new Map(project.misiones.map((mission, missionIndex) => [
    missionIndex,
    scope.forceQuestionImages
      ? new Set((mission.preguntas || []).map((_, questionIndex) => questionIndex))
      : selectQuestionImageIndexes(mission)
  ]));
  let generated = 0;
  let failed = 0;
  let firstError = null;
  let total = 0;

  // Calcular total de imágenes a generar de antemano
  for (const [index, mission] of project.misiones.entries()) {
    if (scope.missionIndexes && !scope.missionIndexes.has(index)) {
      continue;
    }
    if (scope.includeMissionImage && (scope.forceMissionImages || !normalizeString(mission.imagen || (mission.media?.tipo === "imagen" ? mission.media?.url : ""), ""))) {
      total += 1;
    }
    for (const [questionIndex, question] of (Array.isArray(mission.preguntas) ? mission.preguntas.entries() : [])) {
      if (!question) continue;
      if (scope.questionScope && (scope.questionScope.missionIndex !== index || scope.questionScope.questionIndex !== questionIndex)) {
        continue;
      }
      const needsImage = scope.includeQuestions && selectedQuestionsByMission.get(index)?.has(questionIndex);
      if (!needsImage) continue;
      total += 1;
    }
  }

  let processed = 0;

  for (const [index, mission] of project.misiones.entries()) {
    if (scope.missionIndexes && !scope.missionIndexes.has(index)) {
      continue;
    }
    if (scope.includeMissionImage && (scope.forceMissionImages || !normalizeString(mission.imagen || (mission.media?.tipo === "imagen" ? mission.media?.url : ""), ""))) {
      processed += 1;
      const progress = {
        type: "mission-image",
        missionIndex: index,
        title: `Creando imagen de ${terms.itemSingular} ${index + 1}`,
        detail: normalizeString(mission.titulo, `${terms.itemSingularTitle} ${index + 1}`)
      };
      updatePreviewGenerationProgress({ ...progress, current: processed, total });
      if (onProgress) onProgress(processed, total, progress);

      try {
        const generatedImage = await generateValidatedImage(buildRoomVisualPrompt({ data: { ...project, ...context }, mission, index }), {
          aspectRatio: "4:3",
          imageSize: "1K",
          model: context?.modeloImagen
        });
        const image = await storeGeneratedImage(
          generatedImage,
          `mission_${index}_${Date.now()}.webp`,
          storageContext
        );
        mission.imagen = image;
        mission.imagen_alt = normalizeString(mission.imagen_alt || mission.media?.alt, "");
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
        firstError ||= error;
        failed += 1;
      }
      await yieldToBrowser();
    }

    for (const [questionIndex, question] of (Array.isArray(mission.preguntas) ? mission.preguntas.entries() : [])) {
      if (!question) continue;
      if (scope.questionScope && (scope.questionScope.missionIndex !== index || scope.questionScope.questionIndex !== questionIndex)) {
        continue;
      }
      const needsImage = scope.includeQuestions && selectedQuestionsByMission.get(index)?.has(questionIndex);
      if (!needsImage) continue;

      processed += 1;
      const progress = {
        type: "question-image",
        missionIndex: index,
        questionIndex,
        title: `Creando imagen de la pregunta ${questionIndex + 1}`,
        detail: `${terms.itemSingularTitle} ${index + 1} · ${normalizeString(question.titulo, `Pregunta ${questionIndex + 1}`)}`
      };
      updatePreviewGenerationProgress({ ...progress, current: processed, total });
      if (onProgress) onProgress(processed, total, progress);

      try {
        const generatedImage = await generateValidatedImage(buildQuestionVisualPrompt({ data: { ...project, ...context }, mission, question, roomIndex: index, questionIndex }), {
          aspectRatio: "4:3",
          imageSize: "1K",
          model: context?.modeloImagen
        });
        const image = await storeGeneratedImage(
          generatedImage,
          `question_${index}_${questionIndex}_${Date.now()}.webp`,
          storageContext
        );
        question.imagen = image;
        question.imagen_alt = normalizeString(question.imagen_alt || question.media?.alt, "");
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
        firstError ||= error;
        failed += 1;
      }

      await yieldToBrowser();
    }
  }
  return { generated, failed, total, error: firstError };
}

function getQuestionComparisonText(question = {}) {
  return [question.titulo, question.pregunta, question.reto, question.enunciado, question.respuesta_correcta]
    .map((value) => normalizeString(value, ""))
    .filter(Boolean)
    .join(" ");
}

function getQuestionComparisonTokens(question = {}) {
  const normalized = getQuestionComparisonText(question)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  return new Set(normalized.split(/\s+/).filter((token) => token.length > 3));
}

function questionsAreTooSimilar(firstQuestion, secondQuestion) {
  const firstTokens = getQuestionComparisonTokens(firstQuestion);
  const secondTokens = getQuestionComparisonTokens(secondQuestion);
  if (!firstTokens.size || !secondTokens.size) return false;
  let sharedTokens = 0;
  firstTokens.forEach((token) => {
    if (secondTokens.has(token)) sharedTokens += 1;
  });
  return sharedTokens / Math.min(firstTokens.size, secondTokens.size) >= 0.72;
}

function questionsReusePrimaryAnswer(firstQuestion = {}, secondQuestion = {}) {
  const firstAnswer = normalizeBaseText(String(firstQuestion.respuesta_correcta ?? ""));
  const secondAnswer = normalizeBaseText(String(secondQuestion.respuesta_correcta ?? ""));
  return Boolean(firstAnswer && secondAnswer && firstAnswer === secondAnswer);
}

function assertQuestionVariety(candidateQuestions = [], excludedQuestions = []) {
  candidateQuestions.forEach((question, questionIndex) => {
    const repeatsExisting = excludedQuestions.some((existingQuestion) => questionsAreTooSimilar(question, existingQuestion));
    const repeatsGenerated = candidateQuestions.slice(0, questionIndex)
      .some((previousQuestion) => questionsAreTooSimilar(question, previousQuestion));
    if (repeatsExisting || repeatsGenerated) {
      throw new Error(`La pregunta ${questionIndex + 1} se parece demasiado a una pregunta existente. Vuelve a regenerar la sala.`);
    }
  });
}

function assertBriefingCoverageAnchors(mission = {}) {
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
  const anchors = questions.map((question) => normalizeString(question?._coverage_anchor, ""));
  const uniqueAnchors = new Set(anchors.map((anchor) => normalizeBaseText(anchor)).filter(Boolean));
  if (anchors.some((anchor) => !hasCompleteCoverageAnchor(anchor)) || uniqueAnchors.size !== questions.length) {
    throw new Error("No se pudo construir la trazabilidad pedagógica interna de las preguntas.");
  }
  return anchors;
}

function stripTemporaryCoverageAnchors(project = {}) {
  return stripPrivateGenerationFields(project);
}

function getQuestionRegenerationPlan(roomContract = {}, questionIndex = 0, interaction = "texto") {
  const original = roomContract?.question_plans?.[questionIndex] || {};
  const reserve = roomContract?.reserve_opportunity || null;
  if (!reserve) return original;
  // A transfer reserve must not downgrade a synthesis or a newer difficulty policy.
  if (reserve.pedagogical_role !== original.pedagogical_role
    || reserve.difficulty !== original.difficulty
    || reserve.difficulty_policy_version !== original.difficulty_policy_version) return original;
  const reserveMechanic = reserve?.mechanic_contract?.kind || "none";
  const sequenceCompatible = interaction === "ordenar_secuencia"
    ? reserveMechanic === "sequence"
    : reserveMechanic !== "sequence";
  return sequenceCompatible ? reserve : original;
}

function buildQuestionRegenerationPrompt({ formData = {}, mission = {}, missionIndex = 0, questionIndex = 0, sourceQuestion = {}, excludedQuestions = [], questionPlanOverride = null }) {
  const safeQuestionIndex = Math.max(0, Number(questionIndex) || 0);
  const terms = getPresentationTerminology(formData.modoPresentacion);
  const roomContract = getObjectiveQuestionContract(formData, missionIndex);
  const questionPlan = questionPlanOverride || getQuestionRegenerationPlan(
    roomContract,
    safeQuestionIndex,
    sourceQuestion.tipo_interaccion || "texto"
  );
  const {
    question_plans: _privateQuestionPlans,
    reserve_opportunity: _privateReserveOpportunity,
    ...roomCurriculumContract
  } = roomContract || {};
  return [
    `Regenera únicamente la pregunta ${safeQuestionIndex + 1} de la ${terms.itemSingular} ${Number(missionIndex) + 1}.`,
    'Devuelve exclusivamente {"question":{...}} como JSON válido.',
    `El tipo de interacción está bloqueado en ${sourceQuestion.tipo_interaccion || "texto"}; no devuelvas id ni tipo_interaccion porque PigPen los conserva localmente.`,
    `PLANTILLA DE AUTORÍA DEL TIPO:\n${buildQuestionAuthoringTemplate(sourceQuestion.tipo_interaccion || "texto")}`,
    `CONTRATO CURRICULAR EXCLUSIVO DE ESTA SALA:\n${JSON.stringify(roomCurriculumContract)}`,
    `PLAN OBLIGATORIO DE ESTA PREGUNTA:\n${JSON.stringify({
      question_number: safeQuestionIndex + 1,
      ...questionPlan,
      interaction: sourceQuestion.tipo_interaccion || "texto"
    })}`,
    "El objetivo original y sus instrucciones literales no forman parte de esta solicitud. El plan anterior es una especificación privada abstracta, no un enunciado listo para copiar. Interpreta su propósito y redacta una pregunta completamente nueva; coloca la solución exclusivamente en los campos de respuesta activos.",
    `BRIEFING BLOQUEADO:\n${JSON.stringify({
      historia: mission.historia,
      contexto: mission.contexto,
      datos_clave: mission.datos_clave,
      reto: mission.reto
    })}`,
    buildUnifiedContentGenerationContract(formData, mission.preguntas?.length || 1),
    "Sustituye por completo la redacción anterior; no intentes corregirla ni parafrasearla.",
    excludedQuestions.length
      ? `OTRAS PREGUNTAS DE LA SALA QUE NO DEBES DUPLICAR:\n${excludedQuestions.map((item, index) => `${index + 1}. ${getQuestionComparisonText(item)}`).join("\n")}`
      : "",
    "Incluye únicamente _plan_id, titulo, reto, subtipo_respuesta, respuesta_correcta, respuestas_aceptadas, opciones, parejas, elementos, texto_con_hueco, pista, retroalimentacion_correcta, retroalimentacion_incorrecta, requiere_imagen, imagen_prompt, imagen_alt e imagen. Conserva literalmente el _plan_id suministrado.",
    "Conserva todas esas propiedades aunque no se utilicen: usa cadena vacía para textos inactivos y [] para listas inactivas. No uses null. En parejas usa objetos {izquierda, derecha, pista}; en verdadero/falso transporta respuesta_correcta como texto true o false; PigPen lo convierte al booleano interno.",
    "Deja imagen vacía. No cambies el briefing ni incluyas fragmentos, códigos o feedback de finalización de sala.",
    `FORMA JSON OBLIGATORIA (sustituye los textos ilustrativos por contenido real):\n${JSON.stringify({
      question: buildQuestionOutputShape(
        sourceQuestion.tipo_interaccion || "texto",
        questionPlan.requires_image === true,
        questionPlan.plan_id || ""
      )
    })}`,
    "Revisa silenciosamente la pregunta completa antes de emitirla. Si es relacion_columnas o drag_drop, confirma que las correspondencias correctas estén exclusivamente en parejas y no en titulo, reto, pista, feedback previo ni campos visuales. Devuelve directamente la versión definitiva."
  ].filter(Boolean).join("\n");
}

function pickMissionFromGeminiPayload(parsed = {}) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("La IA no devolvió una misión válida.");
  }
  if (parsed.mission && typeof parsed.mission === "object") return parsed.mission;
  if (parsed.room && typeof parsed.room === "object") return parsed.room;
  if (parsed.misiones && Array.isArray(parsed.misiones) && parsed.misiones.length) return parsed.misiones[0];
  if ((parsed.titulo || parsed.title) && Array.isArray(parsed.preguntas || parsed.questions)) return parsed;
  throw new Error("La IA no devolvió una estructura de misión reconocible.");
}

function pickQuestionFromGeminiPayload(parsed = {}) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("La IA no devolvió una pregunta válida.");
  }
  if (parsed.question && typeof parsed.question === "object") return parsed.question;
  if (parsed.pregunta && typeof parsed.pregunta === "object") return parsed.pregunta;
  if (parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length) return parsed.questions[0];
  if ((parsed.titulo || parsed.title) && (parsed.reto || parsed.prompt || parsed.enunciado)) return parsed;
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
    if (targetQuestion === null) {
      mission.imagen = imageDataUrl;
      mission.media = { ...(mission.media || {}), tipo: "imagen", url: imageDataUrl };
    } else {
      const question = mission.preguntas[targetQuestion];
      question.imagen = imageDataUrl;
      question.media = { ...(question.media || {}), tipo: "imagen", url: imageDataUrl };
    }
    renderOutputsNow();
    const storageUrl = await uploadImageIfDataUrl(imageDataUrl, storagePath);

    if (targetQuestion === null) {
      mission.imagen = storageUrl;
      mission.imagen_alt = normalizeString(mission.imagen_alt || mission.media?.alt, "");
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
      question.imagen_alt = normalizeString(question.imagen_alt || question.media?.alt, "");
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
    if (error?.code !== "asset_upload_pending") setStatus(`No fue posible sustituir la imagen de ${activityLabel}.`, "bad");
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
  const currentInteractionPlan = Array.isArray(sourceMission.preguntas)
    && sourceMission.preguntas.length === questionCount
    && sourceMission.preguntas.every(q => experience.config(formData.experience_config).question_types.includes(q.tipo_interaccion))
    ? sourceMission.preguntas.map((question) => normalizeString(question?.tipo_interaccion, "texto"))
    : buildInteractionPlan(1, questionCount, `${Date.now()}-${missionIndex}-${Math.random()}`, experience.config(getFormData().experience_config).question_types)[0];
  let roomInteractionPlan = currentInteractionPlan;

  state.isGenerating = true;
  updatePreviewGenerationProgress({
    title: `Creando ${terms.itemSingular} ${missionIndex + 1}`,
    detail: "Generando briefing, Challenge y preguntas en una sola solicitud",
    reset: true
  });
  setStatus(`Regenerando ${terms.itemSingular} ${missionIndex + 1}...`, "info");
  renderMissionEditor();
  try {
    formData.objectiveBlueprint = await ensureObjectiveBlueprint(formData);
    roomInteractionPlan = applyObjectiveBlueprintInteractionRequirements(
      [currentInteractionPlan],
      { rooms: [formData.objectiveBlueprint.rooms?.[missionIndex]] },
      { preferQuestionPlans: false }
    )[0];
    updatePreviewGenerationProgress({
      title: `Creando ${terms.itemSingular} ${missionIndex + 1}`,
      detail: "Generando briefing, Challenge y preguntas en una sola solicitud"
    });
    const normalized = await requestGeneratedRoomBundle(formData, missionIndex, {
      roomInteractionPlan,
      sourceMission
    });

    const candidateProject = clonePlainObject(state.project);
    candidateProject.misiones[missionIndex] = normalized;
    const localIssues = [
      ...validateMissionSetup(normalized, missionIndex, terms.mode, formData.idioma),
      ...auditInteractionPlan({ misiones: [normalized] }, [roomInteractionPlan])
        .map((issue) => issue.message || String(issue))
    ];
    if (localIssues.length) throw new Error(localIssues.join(" · "));
    state.project = normalizeEscapeRoomProject(stripTemporaryCoverageAnchors(candidateProject));

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
      forceQuestionImages: false
    });

    renderMissionEditor();
    renderOutputsNow();
    setStatus(
      `${terms.itemSingularTitle} ${missionIndex + 1} regenerada · ${imageStats.generated}/${imageStats.total} imágenes listas${imageStats.failed ? ` · ${imageStats.failed} sin imagen` : ""}.`,
      imageStats.failed ? "warning" : "success"
    );
  } catch (error) {
    console.error(`No se pudo regenerar la ${terms.itemSingular}:`, error);
    setStatus(error?.message || `No se pudo regenerar la ${terms.itemSingular}. Intenta de nuevo.`, "bad");
  } finally {
    state.isGenerating = false;
    refreshPanels();
  }
}

function recoverQuestionRegenerationBlueprint(formData, project) {
  // Recovery is local and scoped to the active topic; never compile the global
  // objective just because its cache key or administrative version changed.
  const existing = state.objectiveBlueprint || restoreCachedObjectiveBlueprint(formData);
  const fallback = normalizeObjectiveBrief({
    source_contract: buildObjectiveSourceContract(formData),
    purpose: formData.tema || project.titulo,
    project_copy: { title: project.titulo, subtitle: project.subtitulo, introduction: project.introduccion, instructions: project.instrucciones },
    final_unlock: { code: project.clave_final, feedback: project.conclusion },
    rooms: project.misiones.map((mission, roomIndex) => ({
      room_number: roomIndex + 1, title: mission.titulo, learning_focus: mission.contexto,
      fixed_code_fragment: mission.fragmento_clave || mission.codigo_fragmento || '',
      question_plans: mission.preguntas.map((question, questionIndex) => ({
        plan_id: question._plan_id || `r${roomIndex + 1}_p${questionIndex + 1}`,
        interaction: question.tipo_interaccion, application: question.reto,
        interaction_data: experience.normalizeContract(question.interaction_data),
        answer_target: experience.get(question.tipo_interaccion) ? experience.answerText(question.tipo_interaccion, question.interaction_data) : String(question.respuesta_correcta ?? ''), solution_pairs: question.parejas,
        mechanic_contract: question._mechanic_contract || { kind: 'none' },
        hint_strategy: question.pista, feedback_strategy: question.retroalimentacion_correcta
      }))
    }))
  });
  const blueprint = existing ? structuredClone(existing) : fallback;
  blueprint.source_contract ||= fallback.source_contract;
  blueprint.rooms ||= [];
  project.misiones.forEach((mission, index) => {
    if (!blueprint.rooms[index]) blueprint.rooms[index] = fallback.rooms[index];
    // Never replace contracts from other questions with a generated replacement.
    blueprint.rooms[index].question_plans ||= fallback.rooms[index].question_plans;
    if (!blueprint.rooms[index].generated_room) setObjectiveGeneratedRoom(blueprint, index, mission, formData, mission.preguntas.map(q => q.tipo_interaccion));
  });
  return blueprint;
}

async function requestReplacementQuestionPlan(formData, mission, question, roomIndex, qIndex, excludedQuestions) {
  if (!experience.config(formData.experience_config).question_types.includes(question.tipo_interaccion)) throw new Error("Activa este tipo en Preguntas y recompensas antes de regenerarlo.");
  const previous = formData.objectiveBlueprint.rooms[roomIndex].question_plans[qIndex] || {};
  const difficulty = getQuestionDifficulty(formData, qIndex, mission.preguntas.length);
  const slot = {
    ...previous, ...difficulty,
    plan_id: previous.plan_id || question._plan_id || `r${roomIndex + 1}_p${qIndex + 1}`,
    interaction: question.tipo_interaccion,
    requires_image: question.tipo_interaccion === 'multimedia' || question.requiere_imagen === true || Boolean(question.imagen),
    assessment_case_id: previous.assessment_case_id || `r${roomIndex + 1}_case_${qIndex + 1}`
  };
  const fillSchema = buildObjectiveRoomFillResponseSchema({ question_plans: [slot] }).properties[slot.plan_id];
  const schema = { type: 'object', properties: { plan: fillSchema, briefing_addition: { type: 'string' } }, required: ['plan', 'briefing_addition'] };
  const prompt = [
    'Sustituye únicamente el plan privado de una pregunta por un acertijo nuevo. No compiles el objetivo completo ni otras salas.',
    buildUnifiedContentGenerationContract(formData, mission.preguntas.length),
    buildQuestionAuthoringTemplate(question.tipo_interaccion),
    `Datos académicos: ${JSON.stringify({tema:formData.tema,nivel:formData.nivel,grado:formData.grado,materia:formData.materia,idioma:formData.idioma})}`,
    `Contrato fijo (conservar ID, tipo y exigencia): ${JSON.stringify(slot)}`,
    `Pregunta que se retira: ${JSON.stringify({titulo:question.titulo,reto:question.reto,respuesta_correcta:question.respuesta_correcta,parejas:question.parejas,elementos:question.elementos})}`,
    `Briefing existente inmutable: ${JSON.stringify({historia:mission.historia,contexto:mission.contexto,datos_clave:mission.datos_clave})}`,
    `Preguntas que no debes repetir ni invalidar: ${JSON.stringify(excludedQuestions.map(q=>({titulo:q.titulo,reto:q.reto,respuesta:q.respuesta_correcta})))}`,
    'Puedes cambiar solución y caso curricular. solution_pairs exige seis parejas completas, con seis destinos y seis respuestas distintos en drag_drop; usa kind=none para emparejamientos y huecos. Completar espacio admite expresiones breves repetidas cuando sean necesarias. No reveles correspondencias ni resultados en el enunciado.',
    'briefing_addition debe ser vacío si el briefing ya contiene las evidencias necesarias. En otro caso devuelve solo un párrafo adicional, factual, del mismo currículo e idioma, que permita deducir la nueva respuesta sin revelarla ni contradecir el briefing. No reescribas ni elimines el briefing existente.',
    `Rellena exactamente: ${JSON.stringify(buildFixedObjectiveFillShape(schema))}`
  ].join('\n');
  let retry = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await requestQualityJson(prompt + retry, formData, 0.45, { responseJsonSchema: schema });
    const issues = validateFixedObjectiveFill(response, schema, 'replacement');
    if (!issues.length) issues.push(...objectivePlanContractIssues(response.plan, slot));
    if (!issues.length) {
      const plan = normalizeObjectiveQuestionPlan({ ...slot, ...response.plan,
        plan_id: slot.plan_id, interaction: slot.interaction, difficulty: slot.difficulty,
        difficulty_policy_version: slot.difficulty_policy_version, pedagogical_role: slot.pedagogical_role,
        requires_image: slot.requires_image
      }, slot.interaction);
      return { plan, addition: response.briefing_addition.trim() };
    }
    if (attempt === 2) throw new Error(issues.join(' · '));
    retry = `\nCorrige exclusivamente esta propuesta: ${JSON.stringify(response)}\nFallos: ${JSON.stringify(issues)}`;
  }
}

async function regenerateQuestionContent(missionIndex, questionIndex) {
  if (state.isGenerating) return;
  if (!state.project) {
    setStatus("Genera un escape room antes de regenerar una pregunta.", "warning");
    return;
  }
  const roomIndex = Number(missionIndex);
  const qIndex = Number(questionIndex);
  const mission = state.project.misiones?.[roomIndex];
  const question = mission?.preguntas?.[qIndex];
  const originalLocation = [state.activeSessionId, state.activeTopicId];
  const originalProjectSnapshot = JSON.stringify(state.project);
  const terms = getPresentationTerminology();
  if (!mission || !question) {
    setStatus("Selecciona una pregunta válida para regenerar.", "warning");
    return;
  }

  const formData = getFormData();
  const excludedQuestions = state.project.misiones.flatMap((room, index) => room.preguntas.filter((_, qi) => index !== roomIndex || qi !== qIndex));
  state.isGenerating = true;
  updatePreviewGenerationProgress({
    title: `Creando contenido de la pregunta ${qIndex + 1}`,
    detail: `${terms.itemSingularTitle} ${roomIndex + 1} · Generando reto y respuesta`,
    reset: true
  });
  setStatus(`Regenerando pregunta ${qIndex + 1} de la ${terms.itemSingular} ${roomIndex + 1}...`, "info");

  try {
    formData.objectiveBlueprint = recoverQuestionRegenerationBlueprint(formData, state.project);
    const replacement = await requestReplacementQuestionPlan(formData, mission, question, roomIndex, qIndex, excludedQuestions);
    const updatedMission = structuredClone(mission);
    if (replacement.addition) updatedMission.contexto = [mission.contexto || '', replacement.addition].filter(Boolean).join('\n\n');
    formData.objectiveBlueprint.rooms[roomIndex].question_plans[qIndex] = replacement.plan;
    const prompt = buildQuestionRegenerationPrompt({
      formData,
      mission: updatedMission,
      missionIndex: roomIndex,
      questionIndex: qIndex,
      sourceQuestion: question,
      excludedQuestions,
      questionPlanOverride: replacement.plan
    });
    const questionResponse = normalizeSingleQuestionTransport(
      await requestFixedSingleQuestion(prompt, formData, question.tipo_interaccion),
      question.tipo_interaccion
    );
    let questionPayload = {
      ...pickQuestionFromGeminiPayload(questionResponse),
      id: question.id,
      tipo_interaccion: question.tipo_interaccion,
      imagen: question.imagen || ""
    };
    if (question.tipo_interaccion === "drag_drop") {
      const pairs = mergeGeneratedQuestionPairs(questionPayload.parejas || []);
      if (pairs.length !== 6) {
        questionPayload = await repairGeneratedDragQuestion(questionPayload, {
          formData, mission: updatedMission, missionIndex: roomIndex, questionIndex: qIndex
        });
      }
    }
    questionPayload.media = buildGeneratedQuestionMedia(
      questionPayload,
      question.tipo_interaccion,
      question.media || null
    );
    const questionPlan = replacement.plan;
    questionPayload = await repairQuestionInteraction(questionPayload, question.tipo_interaccion, formData, questionPlan, updatedMission);
    const mechanicContract = structuredClone(questionPlan?.mechanic_contract || { kind: "none" });
    const questionWithStructure = {
      ...materializeGeneratedQuestionTemplate(
        questionPayload,
        questionPlan,
        question.tipo_interaccion,
        {
          roomIndex,
          questionIndex: qIndex,
          locale: formData.idioma || state.project.idioma || "es-419"
        }
      ),
      id: question.id,
      tipo_interaccion: question.tipo_interaccion,
      requiere_imagen: question.tipo_interaccion === "multimedia" || questionPlan?.requires_image === true,
      imagen: question.imagen || "",
      _plan_id: normalizeString(questionPlan?.plan_id, `r${roomIndex + 1}_p${qIndex + 1}`),
      _assessment_case_id: normalizeString(questionPlan?.assessment_case_id, ""),
      _case_source: normalizeString(questionPlan?.case_source, ""),
      _case_data: normalizeTextList(questionPlan?.case_data || []),
      _transfer_delta: normalizeString(questionPlan?.transfer_delta, ""),
      _reasoning_evidence: normalizeString(questionPlan?.reasoning_evidence, ""),
      _integrates_knowledge_ids: normalizeTextList(questionPlan?.integrates_knowledge_ids || []),
      _mechanic_contract: mechanicContract,
      _narrative_effect: normalizeString(questionPlan?.narrative_effect, ""),
      _coverage_anchor: buildCoverageAnchorFromQuestionPlan(questionPlan, question.tipo_interaccion)
    };
    questionWithStructure.media = buildGeneratedQuestionMedia(
      questionWithStructure,
      question.tipo_interaccion,
      question.media || null
    );
    const normalized = normalizeQuestion(
      questionWithStructure,
      roomIndex,
      qIndex,
      formData.idioma || state.project.idioma || "es-419"
    );
    const localIssues = validateQuestionSetup(
      normalized,
      roomIndex,
      qIndex,
      formData.modoPresentacion,
      formData.idioma
    );
    localIssues.push(...questionInteractionIssues(normalized, { generated: true }));
    if (normalized.tipo_interaccion !== question.tipo_interaccion) {
      localIssues.push(`La pregunta debe conservar el tipo ${question.tipo_interaccion}.`);
    }
    if (localIssues.length) throw new Error(localIssues.join(" · "));
    if ([question, ...excludedQuestions].some(existing => questionsAreTooSimilar(normalized, existing))) {
      throw new Error('La propuesta repite una pregunta existente. Se conservó la versión anterior; vuelve a regenerar esta pregunta.');
    }
    const candidateProject = clonePlainObject(state.project);
    candidateProject.misiones[roomIndex] = updatedMission;
    normalized.content_revision = (Number(question.content_revision) || 0) + 1;
    candidateProject.misiones[roomIndex].preguntas[qIndex] = normalized;
    delete normalized._coverage_anchor;
    const regeneratedProject = candidateProject;

    const approvedQuestion = regeneratedProject.misiones?.[roomIndex]?.preguntas?.[qIndex];
    const shouldGenerateQuestionImage = approvedQuestion?.requiere_imagen === true
      || approvedQuestion?.requires_image === true;
    const imageStats = shouldGenerateQuestionImage
      ? await generateMissionImages(regeneratedProject, formData, (current, total) => {
          setStatus(`Regenerando pregunta ${qIndex + 1} (${current}/${total})`, "info");
        }, {
          missionIndexes: [roomIndex],
          includeMissionImage: false,
          includeQuestions: true,
          forceQuestionImages: true,
          questionScope: { missionIndex: roomIndex, questionIndex: qIndex }
        })
      : { generated: 0, failed: 0, total: 0 };

    if (imageStats.failed) throw new Error("No se completó el recurso de la pregunta; se conservó la pregunta anterior.");
    const mediaIssues = questionInteractionIssues(regeneratedProject.misiones[roomIndex].preguntas[qIndex], { generated: true, requireMedia: true });
    if (mediaIssues.length) throw new Error(mediaIssues.join(" · "));
    if (state.activeSessionId !== originalLocation[0] || state.activeTopicId !== originalLocation[1]
      || JSON.stringify(state.project) !== originalProjectSnapshot) throw new Error('El tema o su contenido cambiaron durante la regeneración. No se sustituyó contenido.');
    const blueprint = formData.objectiveBlueprint;
    const finalMission = regeneratedProject.misiones[roomIndex];
    const finalQuestion = finalMission.preguntas[qIndex];
    Object.assign(blueprint.rooms[roomIndex].question_plans[qIndex], {
      application: finalQuestion.reto,
      hint_strategy: finalQuestion.pista,
      feedback_strategy: finalQuestion.retroalimentacion_correcta
    });
    setObjectiveGeneratedRoom(blueprint, roomIndex, finalMission, formData, finalMission.preguntas.map(q => q.tipo_interaccion));
    blueprint.verified_mechanics = buildVerifiedMechanics(blueprint);
    blueprint.verified_examples = blueprint.verified_mechanics.filter(item => item.kind !== 'none').map(item => ({
      room_number: item.room_number, question_number: item.question_number, kind: item.kind, verified: item.verified,
      prompt_value: item.generated_value || (item.ordered_items || []).join(' → '),
      solution: item.kind === 'cipher_assertion' ? String(item.expected_boolean) : (item.solution || (item.ordered_items || []).join(' → '))
    }));
    const objectiveText = formatObjectiveBrief(blueprint, formData.idioma);
    // Commit only after all text, contracts and required images passed validation.
    activateObjectiveBrief(blueprint, objectiveText);
    state.project = regeneratedProject;
    state.pendingGenerationDraft = null;
    state.pendingGenerationDraftKey = '';

    renderMissionEditor();
    renderOutputsNow();
    setStatus(
      `Pregunta ${qIndex + 1} de ${terms.itemSingular} ${roomIndex + 1} regenerada${imageStats.total ? ` · ${imageStats.generated}/${imageStats.total} imágenes listas${imageStats.failed ? ` · ${imageStats.failed} sin imagen` : ""}` : " · no requería una imagen nueva"}.`,
      imageStats.failed ? "warning" : "success"
    );
  } catch (error) {
    console.error("No se pudo regenerar la pregunta:", error);
    setStatus(error?.message || "No se pudo regenerar la pregunta. Intenta de nuevo.", "bad");
  } finally {
    state.isGenerating = false;
    refreshPanels();
  }
}

async function requestFixedSingleQuestion(prompt, formData, interaction) {
  const schema = buildQuestionsResponseSchema(1, 1, { singleQuestion: true, interaction });
  let pendingPrompt = prompt;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await requestQualityJson(pendingPrompt, formData, 0.42, { responseJsonSchema: schema });
    // Validate the transport before defaults can hide missing template fields.
    const issues = validateFixedObjectiveFill(response?.question, schema.properties.question, "question");
    if (!issues.length) return response;
    if (attempt === 2) throw new Error(`La pregunta no completó su plantilla: ${issues.join(" · ")}`);
    pendingPrompt = [prompt, `Corrige únicamente estos fallos de la plantilla: ${JSON.stringify(issues)}.`,
      `Respuesta anterior: ${JSON.stringify(response)}`, "Devuelve la pregunta completa con todos sus campos obligatorios."].join("\n");
  }
}

function createQuestionDraft(roomIndex = 0, questionIndex = 0, partial = {}, presentationMode = getPresentationMode()) {
  const hintLocale = normalizeGameLocale(partial.idioma || state.project?.idioma || elements.idiomaSelect?.value || "es-419");
  const provided = (field, fallback) => Object.hasOwn(partial, field) ? partial[field] : fallback;
  const draftQuestion = {
    id: partial.id || `question-${roomIndex + 1}-${questionIndex + 1}`,
    release: partial.release || "",
    titulo: partial.titulo || "",
    reto: partial.reto || "",
    tipo_interaccion: partial.tipo_interaccion || "texto",
    subtipo_respuesta: partial.subtipo_respuesta || "palabra",
    respuesta_correcta: partial.respuesta_correcta || "",
    respuestas_aceptadas: partial.respuestas_aceptadas || [],
    opciones: provided("opciones", []),
    parejas: provided("parejas", []),
    elementos: provided("elementos", []),
    texto_con_hueco: provided("texto_con_hueco", ""),
    media: partial.media || null,
    pista: partial.pista || "",
    retroalimentacion_correcta: partial.retroalimentacion_correcta || "",
    retroalimentacion_incorrecta: partial.retroalimentacion_incorrecta || "",
    requiere_imagen: partial.requiere_imagen === true || partial.requires_image === true,
    imagen_prompt: partial.imagen_prompt || "",
    imagen_alt: partial.imagen_alt || "",
    imagen: partial.imagen || "",
    bloqueada_inicial: partial.bloqueada_inicial ?? false
  };
  const question = normalizeQuestion(draftQuestion, roomIndex, questionIndex, hintLocale);

  question._correctOptionIndex = typeof partial._correctOptionIndex === "number"
    ? partial._correctOptionIndex
    : findCorrectOptionIndex(question);
  return question;
}

function createMissionDraft(index = 0, partial = {}, questionCount = 1, presentationMode = getPresentationMode()) {
  const mode = normalizePresentationMode(presentationMode);
  const hintLocale = normalizeGameLocale(partial.idioma || state.project?.idioma || elements.idiomaSelect?.value || "es-419");
  const title = normalizeMissionTitle(partial.titulo, "", mode);
  const preguntas = Array.isArray(partial.preguntas) && partial.preguntas.length
    ? normalizeQuestionList(partial.preguntas, index, hintLocale)
    : Array.from({ length: Math.max(1, questionCount) }, (_, questionIndex) => createQuestionDraft(index, questionIndex, {}, mode));

  const mission = normalizeMission({
    id: partial.id || buildMissionId(title, index),
    titulo: title,
    release: normalizeMissionRelease(partial.release, "", mode),
    historia: partial.historia || "",
    contexto: partial.contexto || "",
    datos_clave: partial.datos_clave || [],
    reto: partial.reto || "",
    tipo_interaccion: partial.tipo_interaccion || "texto",
    subtipo_respuesta: partial.subtipo_respuesta || "palabra",
    respuesta_correcta: partial.respuesta_correcta || "",
    respuestas_aceptadas: partial.respuestas_aceptadas || [],
    opciones: partial.opciones || [],
    parejas: partial.parejas || [],
    media: partial.media || null,
    pista: partial.pista || "",
    retroalimentacion_correcta: partial.retroalimentacion_correcta || "",
    retroalimentacion_incorrecta: partial.retroalimentacion_incorrecta || "",
    desbloquea: partial.desbloquea || [],
    bloqueada_inicial: partial.bloqueada_inicial ?? index !== 0,
    preguntas
  }, index, mode, hintLocale);

  const normalizedMission = {
    ...mission,
    ...partial,
    titulo: title,
    release: normalizeMissionRelease(partial.release, "", mode),
    preguntas
  };

  normalizedMission._correctOptionIndex = typeof partial._correctOptionIndex === "number"
    ? partial._correctOptionIndex
    : findCorrectOptionIndex(normalizedMission);
  return normalizedMission;
}

function getMissionLabel(index = 0, mission = {}) {
  return mission.titulo || getDefaultMissionTitle(index);
}

function getNormalizedAnswerToken(value = "") {
  return normalizeAcceptedAnswers(value)?.[0] || "";
}

function findCorrectOptionIndex(mission = {}) {
  return resolveOptionAnswerIndex(mission.opciones, mission.respuesta_correcta, mission.respuestas_aceptadas);
}

function validateQuestionSetup(question = {}, roomIndex = 0, questionIndex = 0, presentationMode = getPresentationMode(), locale = state.project?.idioma || "es-419") {
  const issues = questionInteractionIssues(question);
  const terms = getPresentationTerminology(presentationMode);
  const label = `${terms.itemSingularTitle} ${roomIndex + 1} · Pregunta ${questionIndex + 1}`;
  const accepted = normalizeAcceptedAnswers(question.respuestas_aceptadas || question.respuesta_correcta || []);
  const options = normalizeTextList(question.opciones || []);
  const pairs = normalizePairList(question.parejas || []);

  if (!normalizeString(question.retroalimentacion_correcta, "").trim()) {
    issues.push(`${label}: falta la retroalimentación correcta.`);
  }
  if (!normalizeString(question.retroalimentacion_incorrecta, "").trim()) {
    issues.push(`${label}: falta la retroalimentación incorrecta.`);
  }

  if (experience.get(question.tipo_interaccion)) return issues;

  if (["texto", "multimedia", "completar_espacio"].includes(question.tipo_interaccion) && !(question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2) && question.subtipo_respuesta === "palabra") {
    const wordAnswers = [question.respuesta_correcta, ...(question.respuestas_aceptadas || [])]
      .map((answer) => normalizeString(answer, ""))
      .filter(Boolean);
    if (!wordAnswers.length || wordAnswers.some((answer) => !isSingleWordAnswer(answer))) {
      issues.push(`${label}: una respuesta de tipo palabra admite una o dos palabras con letras Unicode y, si corresponde, guion o apóstrofo; no admite números ni mezclas alfanuméricas.`);
    }
  }

  if (question.tipo_interaccion === "verdadero_falso") {
    if (typeof question.respuesta_correcta !== "boolean") issues.push(`${label}: debe definir Verdadero o Falso.`);
  } else if (question.tipo_interaccion === "ordenar_secuencia") {
    const elements = normalizeSequenceItems(question.elementos || []);
    if (elements.length < 3 || elements.length > 6) issues.push(`${label}: necesita entre 3 y 6 elementos únicos.`);
  } else if (question.tipo_interaccion === "completar_espacio") {
    if (question.interaction_contract_version === 2) return issues;
    const markers = (String(question.texto_con_hueco || "").match(/___/g) || []).length;
    if (markers !== 1) issues.push(`${label}: el texto debe contener exactamente un marcador ___.`);
    if (!accepted.length) issues.push(`${label}: no tiene una respuesta correcta válida.`);
  } else if ((question.tipo_interaccion === "opcion_multiple" || (question.tipo_interaccion === "multimedia" && question.interaction_contract_version === 1))) {
    if (options.length < 2) issues.push(`${label}: necesita al menos 2 opciones.`);
    const optionIndex = findCorrectOptionIndex(question);
    if (optionIndex < 0) {
      issues.push(`${label}: la respuesta correcta no coincide con ninguna opción.`);
    }
  } else if (["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion)) {
    if (pairs.length < 2) issues.push(`${label}: necesita al menos 2 parejas para ser válida.`);
    if (pairs.length > 6) issues.push(`${label}: admite como máximo 6 parejas.`);
  } else if (question.subtipo_respuesta !== "frase_libre") {
    if (!accepted.length) {
      issues.push(`${label}: no tiene una respuesta correcta válida.`);
    }
  }

  if (question.tipo_interaccion === "multimedia"
    && !question.media?.url
    && !normalizeString(
      question.media?.texto
      || question.media?.alt
      || question.imagen_prompt
      || question.imagen_alt
      || question.imagen
      || "",
      ""
    ).trim()) {
    issues.push(`${label}: la pregunta multimedia necesita un recurso o una indicación textual.`);
  }

  return issues;
}

function validateMissionSetup(mission = {}, index = 0, presentationMode = getPresentationMode(), locale = state.project?.idioma || "es-419") {
  const issues = [];
  const terms = getPresentationTerminology(presentationMode);
  const label = getMissionLabel(index, mission);
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];

  if (questions.length) {
    questions.forEach((question, questionIndex) => {
      issues.push(...validateQuestionSetup(question, index, questionIndex, presentationMode, locale));
    });
    return issues;
  }

  const accepted = normalizeAcceptedAnswers(mission.respuestas_aceptadas || mission.respuesta_correcta || []);
  const options = normalizeTextList(mission.opciones || []);
  const pairs = normalizePairList(mission.parejas || []);

  if (!normalizeString(mission.retroalimentacion_correcta, "").trim()) {
    issues.push(`${label}: falta la retroalimentación correcta.`);
  }
  if (!normalizeString(mission.retroalimentacion_incorrecta, "").trim()) {
    issues.push(`${label}: falta la retroalimentación incorrecta.`);
  }

  if (mission.tipo_interaccion === "opcion_multiple") {
    if (options.length < 2) issues.push(`${label}: necesita al menos 2 opciones.`);
    const optionIndex = findCorrectOptionIndex(mission);
    if (optionIndex < 0) {
      issues.push(`${label}: la respuesta correcta no coincide con ninguna opción.`);
    }
  } else if (["relacion_columnas", "drag_drop"].includes(mission.tipo_interaccion)) {
    if (pairs.length < 2) issues.push(`${label}: necesita al menos 2 parejas para ser válida.`);
    if (pairs.length > 6) issues.push(`${label}: admite como máximo 6 parejas.`);
  } else if (mission.subtipo_respuesta !== "frase_libre") {
    if (!accepted.length) {
      issues.push(`${label}: no tiene una respuesta correcta válida.`);
    }
  }

  if (mission.tipo_interaccion === "multimedia" && !mission.media?.url && !normalizeString(mission.media?.texto || mission.media?.alt || "", "").trim()) {
    issues.push(`${label}: la ${terms.itemSingular} multimedia necesita un recurso o una indicación textual.`);
  }

  return issues;
}

function validateProjectSetup(project = null) {
  const sourceProject = project || state.project || {};
  const normalized = withDefaultRoutes(sourceProject);
  const issues = [];
  const mode = normalizePresentationMode(normalized.modo_presentacion);
  const rawFinalKey = normalizeEditableFinalKey(sourceProject.clave_final || "");
  if (rawFinalKey.length < 3) {
    issues.push("La clave final debe tener entre 3 y 12 caracteres alfanuméricos.");
  }
  if (rawFinalKey.length >= 3 && new Set(Array.from(rawFinalKey)).size < 2) {
    issues.push("La clave final debe contener al menos dos caracteres diferentes para poder desordenarla.");
  }

  normalized.misiones.forEach((mission, index) => {
    issues.push(...validateMissionSetup(mission, index, mode, normalized.idioma));
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
  hydrated.themeConfig = normalizePreviewThemeConfig(project?.themeConfig || state.previewTheme);
  hydrated.misiones = applySequentialMissionRoutes(hydrated.misiones);

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

function createProjectFromForm(seedCount = 1) {
  const formData = getFormData();
  const presentationMode = normalizePresentationMode(formData.modoPresentacion);
  const academicTheme = buildAcademicPreviewTheme(formData);
  const baseTitle = formData.temaPrincipal || formData.tema || "";
  const questionCount = Math.max(1, Number(formData.preguntasPorSala || 1));
  const misiones = Array.from({ length: Math.max(1, seedCount) }, (_, index) => createMissionDraft(index, {}, questionCount, presentationMode));
  return withDefaultRoutes({
    idioma: formData.idioma || "es-419",
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
    titulo: baseTitle,
    subtitulo: "",
    introduccion: formData.objetivo || "",
    instrucciones: "",
    ambientacion: formData.narrativa || "",
    linea_visual_base: "",
    misiones,
    conclusion: "",
    duracion_minutos: formData.duracion
  });
}

function materializeProjectForExport() {
  if (!state.project) return null;
  const formData = getFormData();
  const durationInput = document.getElementById("duracionInput");
  const configuredDuration = Number(formData.duracion);
  const durationMinutes = durationInput?.dataset.durationMode === "manual"
    && Number.isFinite(configuredDuration)
    && configuredDuration >= 1
      ? Math.round(configuredDuration * 2) / 2
      : calculateProjectEstimatedDuration(state.project);
  const sourceProject = clonePlainObject(state.project);
  return {
    ...sourceProject,
    duracion_minutos: durationMinutes,
    idioma: formData.idioma || state.project.idioma || "es-419",
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
    misiones: applySequentialMissionRoutes(sourceProject.misiones).map((mission) => ({
      ...mission,
      media: sanitizeMissionMedia(mission.media)
    }))
  };
}

function renderJsonPreview() {
  const project = materializeProjectForExport();
  elements.jsonPreview.textContent = project ? JSON.stringify(project, null, 2) : "";
}

function syncPreviewEditorialButton(action = "autofill", runtimeLabel = "") {
  if (!elements.btnPreviewAutofill) return;
  const shouldStart = action === "start";
  const shouldVerify = action === "verify";
  const fallbackLabel = shouldStart
    ? "Iniciar preview y saltar briefing"
    : (shouldVerify ? "Verificar respuestas" : "Autocompletar respuestas");
  const actionLabel = normalizeString(runtimeLabel, "").trim() || fallbackLabel;
  elements.btnPreviewAutofill.dataset.previewAction = shouldStart ? "start" : (shouldVerify ? "verify" : "autofill");
  elements.btnPreviewAutofill.dataset.erTooltip = actionLabel;
  elements.btnPreviewAutofill.setAttribute("aria-label", actionLabel);
  const icon = elements.btnPreviewAutofill.querySelector("i");
  if (icon) icon.className = shouldStart
    ? "fas fa-play"
    : (shouldVerify ? "fas fa-check" : "fas fa-wand-magic-sparkles");
}

function focusSelectedQuestionInPreview() {
  const frame = elements.previewFrame;
  const missionId = String(state.selectedMissionId || "").trim();
  const questionId = String(state.selectedQuestionId || "").trim();
  if (!frame?.contentWindow || !missionId || !questionId) return;
  frame.contentWindow.postMessage({
    type: "pigpen-preview-navigate",
    missionId,
    questionId
  }, "*");
}

function focusSelectedBriefingInPreview() {
  const frame = elements.previewFrame;
  const missionId = String(state.selectedMissionId || "").trim();
  if (!frame?.contentWindow || !missionId) return;
  frame.contentWindow.postMessage({
    type: "pigpen-preview-navigate",
    target: "briefing",
    missionId
  }, "*");
}

function getStudioFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isPreviewStudioFullscreenActive() {
  return getStudioFullscreenElement() === elements.studioWorkspace
    || elements.studioWorkspace?.classList.contains("is-preview-fullscreen") === true;
}

function syncPreviewStudioFullscreenState() {
  const active = isPreviewStudioFullscreenActive();
  state.previewStudioFullscreen = active;
  document.body.classList.toggle("er-preview-studio-fullscreen", active);
  syncStudioPanels();
  elements.previewFrame?.contentWindow?.postMessage({
    type: "pigpen-preview-fullscreen-state",
    active
  }, "*");
}

async function togglePreviewStudioFullscreen() {
  const workspace = elements.studioWorkspace;
  if (!workspace) return;
  const nativeFullscreen = getStudioFullscreenElement() === workspace;
  const fallbackFullscreen = workspace.classList.contains("is-preview-fullscreen");
  if (nativeFullscreen) {
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    if (exitFullscreen) await exitFullscreen.call(document);
    return;
  }
  if (fallbackFullscreen) {
    workspace.classList.remove("is-preview-fullscreen");
    syncPreviewStudioFullscreenState();
    return;
  }

  setInspectorTab("rooms");
  state.previewStudioFullscreen = true;
  syncStudioPanels();
  try {
    const requestFullscreen = workspace.requestFullscreen || workspace.webkitRequestFullscreen;
    if (!requestFullscreen) throw new Error("Fullscreen API unavailable");
    await requestFullscreen.call(workspace, { navigationUI: "hide" });
  } catch (error) {
    console.warn("No se pudo abrir la preview en pantalla completa nativa; se usará el modo inmersivo:", error);
    workspace.classList.add("is-preview-fullscreen");
  }
  syncPreviewStudioFullscreenState();
}

function renderPreview() {
  const project = materializeProjectForExport();
  if (!project || !elements.previewFrame) {
    elements.previewFrame?.removeAttribute("srcdoc");
    return;
  }
  syncPreviewEditorialButton("start");
  elements.previewFrame.srcdoc = buildPreviewDocument(project, {
    editorialReview: true,
    progressIdentity: JSON.stringify([state.currentUser?.uid || "local", state.activeSessionId || "local-draft", state.activeTopicId || "legacy"])
  });
}

function triggerPreviewEditorialAutofill() {
  const frame = elements.previewFrame;
  if (!frame || !state.project) {
    setStatus("Genera un escape room antes de usar la resolución automática del preview.", "warning");
    return;
  }

  try {
    if (!frame.contentWindow) {
      setStatus("El preview todavía no está listo para autocompletarse.", "warning");
      return;
    }
    const executedAction = ["start", "verify", "autofill"].includes(elements.btnPreviewAutofill?.dataset.previewAction)
      ? elements.btnPreviewAutofill.dataset.previewAction
      : "autofill";
    frame.contentWindow.postMessage({
      type: "pigpen-preview-editorial-action",
      action: executedAction
    }, "*");
    // El runtime del preview confirma la siguiente fase por postMessage. No se
    // anticipa localmente para evitar que "Autocompletar", "Verificar" y el
    // cambio de sala queden desincronizados cuando termina una sala.
    const statusByAction = {
      start: "Preview iniciado. Se omitió el briefing y ya puedes revisar las preguntas.",
      autofill: "Respuestas autocompletadas. Pulsa Verificar para validarlas.",
      verify: "Se ejecutó la verificación de las respuestas del preview."
    };
    setStatus(statusByAction[executedAction], "success");
  } catch (error) {
    console.error("No se pudo activar la resolución automática del preview:", error);
    setStatus("No fue posible resolver automáticamente el preview.", "bad");
  }
}

function updateSummaryStats() {
  updateOutputAcademicIndicators();
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
    if (state.activeTab === "json") renderJsonPreview();
    else renderPreview();
    refreshPanels();
    saveProjectState();
    scheduleSessionSave();
  }, 300);
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

function presentGeneratedEscapeRoom() {
  if (!state.project) return false;

  // Fijar la vista antes de renderizar evita que refreshPanels vuelva a ocultar
  // el iframe entre el ensamblado del proyecto y el cambio de pestaña.
  state.activeTab = "preview";
  setInspectorTab("rooms");
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.erTab === "preview";
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderMissionEditor();
  renderOutputsNow();
  refreshPanels();

  // srcdoc confirma que el proyecto llegó al runtime jugable. Si un render
  // intermedio lo retiró, reconstruirlo una sola vez desde el estado local.
  if (!elements.previewFrame?.srcdoc) renderPreview();
  return Boolean(elements.previewFrame?.srcdoc);
}

function getMissionTypeBadge(type) {
  const labels = {
    texto: "Texto",
    opcion_multiple: "Opción múltiple",
    relacion_columnas: "Relación",
    drag_drop: "Drag & Drop",
    verdadero_falso: "Verdadero / Falso",
    ordenar_secuencia: "Secuencia",
    completar_espacio: "Completar",
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
  if (question.imagen) {
    return `<img src="${escapeHtmlAttr(question.imagen)}" alt="${escapeHtmlAttr(question.imagen_alt || question.titulo)}">`;
  }
  return `<div class="er-question-image-empty"><i class="far fa-image" aria-hidden="true"></i><span>Esta pregunta todavía no tiene imagen.</span></div>`;
}

function renderFinalKeyEditorCard() {
  const editableCode = normalizeEditableFinalKey(state.project?.clave_final || "");
  const code = editableCode || resolveFinalPasscode(state.project || {}).code;
  return `<section class="er-routing-panel er-final-key-editor">
    <div class="er-label">Control final del escape room</div>
    <label class="er-field">
      <span>Clave final para desactivar el sistema</span>
      <input type="text" data-editor-final-key minlength="3" maxlength="12" autocomplete="off" spellcheck="false" value="${escapeHtmlAttr(code)}">
    </label>
    <p class="er-inline-note">Este campo está sincronizado con Contenido general. El jugador lo verá solo cuando termine todas las actividades.</p>
  </section>`;
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
  const canDeleteQuestion = (state.project?.misiones?.[missionIndex]?.preguntas?.length || 0) > 1;
  const hasQuestionImage = Boolean(
    normalizeString(question.imagen, "")
    || (question.media?.tipo === "imagen" && normalizeString(question.media?.url, ""))
  );
  const answerText = Array.isArray(question.respuestas_aceptadas) ? question.respuestas_aceptadas.join("\n") : "";
  const sequenceItems = normalizeSequenceItems(question.elementos || []);
  const optionRows = renderQuestionOptionRows(missionIndex, questionIndex, question);
  const pairRows = renderQuestionPairRows(missionIndex, questionIndex, question);
  return `
    <details class="er-question-accordion" open data-question-card data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
      <summary class="er-question-summary">
        <div class="er-question-summary-main">
          <h4 class="er-label">Pregunta ${questionIndex + 1}</h4>
        </div>
        <div class="er-question-summary-actions">
          <button type="button" class="er-question-actions-toggle er-studio-icon-button" data-question-actions-toggle aria-label="Opciones de la pregunta ${questionIndex + 1}" aria-haspopup="menu" aria-controls="erQuestionActionsMenu-${missionIndex}-${questionIndex}" aria-expanded="false">
            <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
          </button>
          <div class="er-question-actions-menu hidden" id="erQuestionActionsMenu-${missionIndex}-${questionIndex}" role="menu" aria-label="Acciones de la pregunta ${questionIndex + 1}">
            <button type="button" role="menuitem" data-question-action="regenerate-question" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}"><i class="fas fa-rotate-right" aria-hidden="true"></i><span>Regenerar pregunta</span></button>
            <button type="button" role="menuitem" class="is-danger" data-question-action="delete-question" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" aria-label="Eliminar pregunta y sus respuestas" ${canDeleteQuestion ? "" : "disabled"}><i class="fas fa-trash" aria-hidden="true"></i><span>${canDeleteQuestion ? "Eliminar pregunta" : "Debe conservarse una pregunta"}</span></button>
          </div>
        </div>
      </summary>
      <div class="er-question-body">
        <section class="er-type-panel er-question-section-card er-question-config-panel" aria-labelledby="erQuestionConfigTitle-${missionIndex}-${questionIndex}">
          <h5 class="er-label er-question-section-title" id="erQuestionConfigTitle-${missionIndex}-${questionIndex}">Configuración de la pregunta</h5>
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
                <option value="texto" ${question.tipo_interaccion === "texto" ? "selected" : ""}>Respuesta exacta</option>
                <option value="opcion_multiple" ${question.tipo_interaccion === "opcion_multiple" ? "selected" : ""}>Opción múltiple</option>
                <option value="relacion_columnas" ${question.tipo_interaccion === "relacion_columnas" ? "selected" : ""}>Relación de columnas</option>
                <option value="drag_drop" ${question.tipo_interaccion === "drag_drop" ? "selected" : ""}>Drag & Drop · Encaja parejas</option>
                <option value="verdadero_falso" ${question.tipo_interaccion === "verdadero_falso" ? "selected" : ""}>Verdadero / Falso</option>
                <option value="ordenar_secuencia" ${question.tipo_interaccion === "ordenar_secuencia" ? "selected" : ""}>Ordenar secuencia</option>
                <option value="completar_espacio" ${question.tipo_interaccion === "completar_espacio" ? "selected" : ""}>Completar lectura · Arrastrar palabras</option>
                <option value="multimedia" ${question.tipo_interaccion === "multimedia" ? "selected" : ""}>Multimedia · Opción múltiple</option>
                <optgroup label="Nuevos tipos">${experience.definitions.map(d => `<option value="${d.id}" ${question.tipo_interaccion === d.id ? 'selected' : ''} ${!experience.config(experienceConfig).question_types.includes(d.id) && question.tipo_interaccion !== d.id ? 'disabled' : ''}>${escapeHtml(d.label)}</option>`).join('')}</optgroup>
              </select>
            </label>
            ${question.subtipo_respuesta !== 'frase_libre' && (question.tipo_interaccion === 'texto' || (question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version !== 2)) ? `<label class="er-field">
              <span>Subtipo de respuesta</span>
              <select data-question-field="subtipo_respuesta" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
                ${TEXT_SUBTYPES.map((subtype) => `<option value="${subtype}" ${question.subtipo_respuesta === subtype ? "selected" : ""}>${TEXT_SUBTYPE_LABELS[subtype] || subtype}</option>`).join("")}
              </select>
            </label>` : ""}
            ${question.tipo_interaccion === "multimedia" && question.interaction_contract_version !== 1 ? '<p class="er-inline-note">Multimedia escrita antigua. Regenera esta pregunta para convertirla en recurso con opciones.</p>' : ""}
            <div class="er-field-row er-field-wide er-field-row--2">
              <label class="er-field">
                <span>Enunciado de la pregunta</span>
                <textarea rows="3" data-question-field="reto" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(question.reto)}</textarea>
              </label>
              <label class="er-field">
                <span>Pista</span>
                <textarea rows="2" data-question-field="pista" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(question.pista)}</textarea>
              </label>
            </div>
          </div>
          ${question.tipo_interaccion === "multimedia" ? `
            <div class="er-type-group er-question-specific-config">
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
        </section>

        <section class="er-type-panel er-question-section-card er-question-answer-panel" aria-labelledby="erQuestionAnswerTitle-${missionIndex}-${questionIndex}">
          <h5 class="er-label er-question-section-title" id="erQuestionAnswerTitle-${missionIndex}-${questionIndex}">Configuración de las respuestas</h5>
          <div class="er-type-layout">
            ${(question.tipo_interaccion === "texto" || (question.tipo_interaccion === "multimedia" && question.interaction_contract_version !== 1)) && question.subtipo_respuesta === "frase_libre" ? `
              <div class="er-type-group">
                <strong>Formato retirado · Regenerar pregunta</strong>
                <p class="er-inline-note">Esta pregunta antigua conserva su funcionamiento al abrirse. Regénérala para crear un acertijo con solución exacta verificable; ya no se ofrece como tipo de pregunta.</p>
              </div>
            ` : ""}

            ${(question.tipo_interaccion === "texto" || (question.tipo_interaccion === "multimedia" && question.interaction_contract_version !== 1)) && question.subtipo_respuesta !== "frase_libre" ? `
              <div class="er-type-group">
                <strong>Respuesta correcta</strong>
                <input class="er-inline-input" type="text" data-question-field="respuesta_correcta" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.respuesta_correcta)}">
              </div>
              <div class="er-type-group">
                <strong>Respuestas aceptadas</strong>
                <textarea rows="3" data-question-field="respuestas_aceptadas" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" placeholder="Una por línea">${escapeHtml(answerText)}</textarea>
              </div>
            ` : ""}

            ${(question.tipo_interaccion === "opcion_multiple" || (question.tipo_interaccion === "multimedia" && question.interaction_contract_version === 1)) ? `
              <div class="er-type-group">
                <strong>Opciones</strong>
                <div class="er-inline-list">${optionRows}</div>
                <button type="button" class="er-button er-studio-icon-button" data-question-action="add-option" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-er-tooltip="Añadir opción" aria-label="Añadir opción">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
            ` : ""}

            ${experience.get(question.tipo_interaccion) ? renderExperienceEditor(question, missionIndex, questionIndex) : ''}
            ${!experience.get(question.tipo_interaccion) ? `<label class="er-field"><span>Pista adicional · Premio opcional</span><textarea rows="2" data-question-field="extra_hint" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(question.extra_hint || '')}</textarea></label>` : ''}
            ${question.tipo_interaccion === "verdadero_falso" ? `
              <div class="er-type-group">
                <strong>Respuesta correcta</strong>
                <select data-question-field="respuesta_booleana" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
                  <option value="true" ${question.respuesta_correcta === true ? "selected" : ""}>Verdadero</option>
                  <option value="false" ${question.respuesta_correcta === false ? "selected" : ""}>Falso</option>
                </select>
              </div>
            ` : ""}

            ${question.tipo_interaccion === "ordenar_secuencia" ? `
              <div class="er-type-group">
                <strong>Secuencia correcta</strong>
                <p class="er-inline-note">Escribe de 3 a 6 elementos, uno por línea, en el orden correcto.</p>
                <textarea rows="6" data-question-field="elementos" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(sequenceItems.join("\n"))}</textarea>
              </div>
            ` : ""}

            ${question.tipo_interaccion === "completar_espacio" ? `
              <div class="er-type-group">
                <strong>${question.interaction_contract_version === 2 ? 'Lectura con huecos y palabras arrastrables' : 'Completar escrito (formato anterior)'}</strong>
                <p class="er-inline-note">${question.interaction_contract_version === 2 ? 'Añade ___ en cada hueco y una palabra por hueco, en el mismo orden. El juego mezclará el banco de palabras.' : 'Formato anterior: un único ___. Regenera para usar palabras arrastrables.'}</p>
                <div class="er-fill-preview" aria-label="Vista previa de los huecos">${escapeHtml(question.texto_con_hueco || "Frase con ___ para completar").replaceAll("___", '<span class="er-fill-preview-slot">…</span>')}</div>
                <textarea rows="3" data-question-field="texto_con_hueco" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(question.texto_con_hueco || "")}</textarea>
                ${question.interaction_contract_version === 2 ? `<label class="er-field"><span>Palabras correctas por hueco (una por línea)</span><textarea rows="4" data-question-field="word_bank_answers" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml((question.parejas || []).map(pair => pair.derecha).join('\n'))}</textarea></label><label class="er-field"><span>Palabras distractoras opcionales (una por línea)</span><textarea rows="2" data-question-field="word_bank_distractors" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml((question.opciones || []).join('\n'))}</textarea></label>` : `
                <label class="er-field"><span>Respuesta correcta</span><input type="text" data-question-field="respuesta_correcta" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.respuesta_correcta || "")}"></label>
                <label class="er-field"><span>Respuestas aceptadas</span><textarea rows="3" data-question-field="respuestas_aceptadas" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">${escapeHtml(answerText)}</textarea></label>
                `}
              </div>
            ` : ""}

            ${["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion) ? `
              <div class="er-type-group">
                <strong>${question.tipo_interaccion === "drag_drop" ? "Destinos y fichas" : "Parejas"}</strong>
                ${question.tipo_interaccion === "drag_drop" ? '<p class="er-inline-note">Izquierda = destino · Derecha = ficha arrastrable.</p>' : ""}
                <div class="er-inline-list">${pairRows}</div>
                <button type="button" class="er-button er-studio-icon-button" data-question-action="add-pair" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" data-er-tooltip="Añadir pareja" aria-label="Añadir pareja">
                  <i class="fas fa-plus"></i>
                </button>
                ${question.tipo_interaccion === "relacion_columnas" ? `<label class="er-field"><span>Distractores de la columna derecha (exactamente 2)</span><textarea rows="2" data-question-field="matching_distractors" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" placeholder="Uno por línea">${escapeHtml((question.opciones || []).join('\n'))}</textarea></label>` : ""}
              </div>
            ` : ""}

          </div>
        </section>

        <section class="er-type-panel er-question-section-card er-question-feedback-panel" aria-labelledby="erQuestionFeedbackTitle-${missionIndex}-${questionIndex}">
          <h5 class="er-label er-question-section-title" id="erQuestionFeedbackTitle-${missionIndex}-${questionIndex}">Configuración del feedback</h5>
          <div class="er-type-layout">
            <div class="er-type-group er-feedback-fields">
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

        <section class="er-preview-panel er-question-preview-panel" aria-labelledby="erQuestionImageTitle-${missionIndex}-${questionIndex}">
          <h5 class="er-label er-question-section-title" id="erQuestionImageTitle-${missionIndex}-${questionIndex}">Imagen de la pregunta</h5>
          <div class="er-question-image-editor">
            <div class="er-preview-poster er-question-image-preview">${getQuestionPreviewMedia(question)}</div>
            <label class="er-field">
              <span>Prompt de la imagen</span>
              <textarea rows="3" data-question-field="imagen_prompt" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" placeholder="Describe la imagen de apoyo que necesita esta pregunta.">${escapeHtml(question.imagen_prompt)}</textarea>
            </label>
            <label class="er-field">
              <span>Texto alternativo</span>
              <input type="text" data-question-field="imagen_alt" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" value="${escapeHtmlAttr(question.imagen_alt)}" placeholder="Describe brevemente lo que muestra la imagen">
            </label>
            <div class="er-question-image-actions" aria-label="Acciones de la imagen">
              <button type="button" class="er-button er-button-secondary er-question-image-action" data-question-action="replace-question-image" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
                <i class="fas fa-upload" aria-hidden="true"></i><span>Sustituir imagen</span>
              </button>
              <button type="button" class="er-button er-button-secondary er-question-image-action" data-question-action="regenerate-question-image" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}">
                <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Regenerar con este prompt</span>
              </button>
              <button type="button" class="er-button er-button-secondary er-question-image-action is-danger" data-question-action="delete-question-image" data-question-mission-index="${missionIndex}" data-question-index="${questionIndex}" aria-label="Eliminar imagen de la pregunta ${questionIndex + 1}" ${hasQuestionImage ? "" : "disabled"}>
                <i class="fas fa-trash" aria-hidden="true"></i><span>Eliminar imagen</span>
              </button>
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

function renderMissionNavigator() {
  if (!elements.missionNavigatorList) return;
  const missions = Array.isArray(state.project?.misiones) ? state.project.misiones : [];
  if (state.selectedMissionId && !missions.some((mission) => mission.id === state.selectedMissionId)) {
    state.selectedMissionId = null;
    state.selectedQuestionId = null;
    state.selectedBriefingMissionId = null;
  }
  const selectedMission = missions.find((mission) => mission.id === state.selectedMissionId) || null;
  if (state.selectedQuestionId && !selectedMission?.preguntas?.some((question) => question.id === state.selectedQuestionId)) {
    state.selectedQuestionId = null;
  }
  const formData = getFormData();
  elements.missionNavigatorList.innerHTML = missions.map((mission, index) => {
    const roomSelected = mission.id === state.selectedMissionId
      && !state.selectedQuestionId
      && state.selectedBriefingMissionId !== mission.id;
    const briefingSelected = mission.id === state.selectedMissionId
      && !state.selectedQuestionId
      && state.selectedBriefingMissionId === mission.id;
    const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
    const expanded = state.expandedMissionIds.has(mission.id);
    const palette = resolveRoomColorPalette({ index, formData });
    const paletteStyle = `--room-level-color:${palette.levelColor};--room-theme-color:${palette.themeColor};`;
    return `
      <article class="er-mission-nav-item ${roomSelected || briefingSelected ? "is-active" : ""}" data-mission-nav-item data-mission-id="${escapeHtmlAttr(mission.id)}" style="${escapeHtmlAttr(paletteStyle)}">
        <span class="er-mission-nav-drag" title="Arrastrar para reordenar" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
        <button type="button" class="er-mission-nav-select ${roomSelected ? "is-active" : ""}" data-mission-select="${escapeHtmlAttr(mission.id)}" aria-pressed="${roomSelected ? "true" : "false"}" title="Editar datos globales de ${escapeHtmlAttr(mission.titulo)}">
          <span class="er-mission-nav-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="er-mission-nav-copy"><strong>${escapeHtml(mission.titulo)}</strong><small title="${questions.length} ${questions.length === 1 ? "pregunta" : "preguntas"}" aria-label="${questions.length} ${questions.length === 1 ? "pregunta" : "preguntas"}">${questions.length}</small></span>
        </button>
        <button type="button" class="er-mission-nav-expand er-studio-icon-button" data-mission-expand="${escapeHtmlAttr(mission.id)}" data-er-tooltip="${expanded ? "Ocultar" : "Mostrar"} preguntas" aria-expanded="${expanded ? "true" : "false"}" aria-label="${expanded ? "Ocultar" : "Mostrar"} preguntas de ${escapeHtmlAttr(mission.titulo)}">
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="er-mission-nav-questions ${expanded ? "" : "hidden"}">
          <button type="button" class="er-mission-nav-question er-mission-nav-briefing ${briefingSelected ? "is-active" : ""}" data-mission-briefing="${escapeHtmlAttr(mission.id)}" aria-pressed="${briefingSelected ? "true" : "false"}" title="Editar el briefing de ${escapeHtmlAttr(mission.titulo)}">
            <span aria-hidden="true"><i class="fas fa-book-open"></i></span>
            <strong>Briefing</strong>
          </button>
          ${questions.map((question, questionIndex) => {
            const questionSelected = mission.id === state.selectedMissionId && question.id === state.selectedQuestionId;
            return `
              <div class="er-mission-nav-question-row">
                <button type="button" class="er-mission-nav-question ${questionSelected ? "is-active" : ""}" data-question-select="${escapeHtmlAttr(question.id)}" data-mission-id="${escapeHtmlAttr(mission.id)}" aria-pressed="${questionSelected ? "true" : "false"}" title="${escapeHtmlAttr(getQuestionQuestionText(question, questionIndex))}">
                  <span>${String(questionIndex + 1).padStart(2, "0")}</span>
                  <strong>${escapeHtml(getQuestionQuestionText(question, questionIndex))}</strong>
                </button>
                <button type="button" class="er-mission-nav-question-delete er-studio-icon-button" data-question-nav-action="delete-question" data-question-mission-index="${index}" data-question-index="${questionIndex}" data-er-tooltip="${questions.length > 1 ? "Eliminar pregunta" : "La sala debe conservar una pregunta"}" aria-label="Eliminar pregunta ${questionIndex + 1} y sus respuestas" ${questions.length > 1 ? "" : "disabled"}>
                  <i class="fas fa-trash" aria-hidden="true"></i>
                </button>
              </div>
            `;
          }).join("") || '<div class="er-mission-nav-no-questions">Sin preguntas</div>'}
          <button type="button" class="er-mission-nav-question er-mission-nav-add-question" data-mission-nav-action="add-question" data-mission-index="${index}" title="Añadir pregunta a ${escapeHtmlAttr(mission.titulo)}">
            <span aria-hidden="true"><i class="fas fa-plus"></i></span>
            <strong>Añadir pregunta</strong>
          </button>
        </div>
      </article>
    `;
  }).join("");
  ensureSortable();
}

function selectMissionById(missionId, { focusEditor = true } = {}) {
  if (!state.project?.misiones.some((mission) => mission.id === missionId)) return;
  const shouldHide = state.selectedMissionId === missionId
    && !state.selectedQuestionId
    && state.selectedBriefingMissionId !== missionId;
  state.selectedMissionId = shouldHide ? null : missionId;
  state.selectedQuestionId = null;
  state.selectedBriefingMissionId = null;
  if (shouldHide) state.expandedMissionIds.delete(missionId);
  else state.expandedMissionIds.add(missionId);
  setInspectorTab("rooms");
  renderMissionEditor();
  if (!isStudioDesktop() && state.activeDrawer === "inspector") {
    closeStudioPanel("inspector", { restoreFocus: false });
  }
  if (!shouldHide && focusEditor) window.requestAnimationFrame(() => elements.missionWorkspacePanel?.focus?.());
}

function selectQuestionById(missionId, questionId, { focusEditor = true } = {}) {
  const mission = state.project?.misiones.find((item) => item.id === missionId);
  if (!mission?.preguntas?.some((question) => question.id === questionId)) return;
  const shouldHide = state.selectedMissionId === missionId && state.selectedQuestionId === questionId;
  state.selectedMissionId = shouldHide ? null : missionId;
  state.selectedQuestionId = shouldHide ? null : questionId;
  state.selectedBriefingMissionId = null;
  state.expandedMissionIds.add(missionId);
  setInspectorTab("rooms");
  if (!shouldHide) setActiveTab("preview");
  renderMissionEditor();
  if (!shouldHide) window.requestAnimationFrame(focusSelectedQuestionInPreview);
  if (!isStudioDesktop() && state.activeDrawer === "inspector") {
    closeStudioPanel("inspector", { restoreFocus: false });
  }
  if (!shouldHide && focusEditor) window.requestAnimationFrame(() => elements.missionWorkspacePanel?.focus?.());
  if (shouldHide) {
    window.requestAnimationFrame(() => {
      elements.missionNavigatorList
        ?.querySelector(`[data-question-select="${CSS.escape(questionId)}"][data-mission-id="${CSS.escape(missionId)}"]`)
        ?.focus();
    });
  }
}

function selectMissionBriefingById(missionId) {
  if (!state.project?.misiones.some((mission) => mission.id === missionId)) return;
  state.selectedMissionId = missionId;
  state.selectedQuestionId = null;
  state.selectedBriefingMissionId = missionId;
  state.expandedMissionIds.add(missionId);
  setInspectorTab("rooms");
  renderMissionEditor();
  if (!isStudioDesktop() && state.activeDrawer === "inspector") {
    closeStudioPanel("inspector", { restoreFocus: false });
  }
  setActiveTab("preview");
  window.requestAnimationFrame(focusSelectedBriefingInPreview);
  window.requestAnimationFrame(() => {
    const missionIndex = getSelectedMissionIndex();
    const briefingField = elements.missionEditorList
      ?.querySelector(`[data-field="contexto"][data-index="${missionIndex}"]`);
    briefingField?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    briefingField?.focus?.({ preventScroll: true });
  });
}

function closeMissionWorkspace() {
  const selectedMissionId = state.selectedMissionId;
  state.selectedMissionId = null;
  state.selectedQuestionId = null;
  state.selectedBriefingMissionId = null;
  renderMissionEditor();
  const returnTarget = Array.from(elements.missionNavigatorList?.querySelectorAll("[data-mission-select]") || [])
    .find((button) => button.dataset.missionSelect === selectedMissionId);
  window.requestAnimationFrame(() => returnTarget?.focus?.());
}

function toggleMissionQuestions(missionId) {
  if (state.expandedMissionIds.has(missionId)) state.expandedMissionIds.delete(missionId);
  else state.expandedMissionIds.add(missionId);
  renderMissionNavigator();
  window.requestAnimationFrame(() => elements.missionNavigatorList?.querySelector(`[data-mission-expand="${CSS.escape(missionId)}"]`)?.focus());
}

function wireMissionNavigatorEvents() {
  elements.missionNavigatorList?.addEventListener("click", (event) => {
    const missionActionButton = event.target.closest("[data-mission-nav-action]");
    if (missionActionButton) {
      if (missionActionButton.dataset.missionNavAction === "add-question") {
        addQuestion(Number(missionActionButton.dataset.missionIndex));
      }
      return;
    }
    const questionActionButton = event.target.closest("[data-question-nav-action]");
    if (questionActionButton) {
      const missionIndex = Number(questionActionButton.dataset.questionMissionIndex);
      const questionIndex = Number(questionActionButton.dataset.questionIndex);
      if (questionActionButton.dataset.questionNavAction === "delete-question") {
        requestQuestionRemoval(missionIndex, questionIndex, questionActionButton);
      }
      return;
    }
    const questionButton = event.target.closest("[data-question-select]");
    if (questionButton) {
      selectQuestionById(questionButton.dataset.missionId, questionButton.dataset.questionSelect);
      return;
    }
    const briefingButton = event.target.closest("[data-mission-briefing]");
    if (briefingButton) {
      selectMissionBriefingById(briefingButton.dataset.missionBriefing);
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
        if ((question.tipo_interaccion === "opcion_multiple" || (question.tipo_interaccion === "multimedia" && question.interaction_contract_version === 1)) && (typeof question._correctOptionIndex !== "number" || question._correctOptionIndex < 0)) {
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
  if (selectedQuestionIndex >= 0) {
    elements.missionEditorList.innerHTML = `
      <div class="er-question-focus" data-question-focus>
        ${renderQuestionCard(selectedIndex, selectedQuestionIndex, selectedMission.preguntas[selectedQuestionIndex])}
      </div>
    `;
    refreshPanels();
    return;
  }
  if (state.selectedBriefingMissionId === selectedMission.id) {
    const formData = getFormData();
    const roomPalette = resolveRoomColorPalette({ index: selectedIndex, formData });
    const roomStyle = `--room-level-color: ${roomPalette.levelColor}; --room-theme-color: ${roomPalette.themeColor};`;
    const evidenceText = Array.isArray(selectedMission.datos_clave)
      ? selectedMission.datos_clave.join("\n")
      : "";
    elements.missionEditorList.innerHTML = `
      <article class="er-mission-card er-mission-section-editor" data-index="${selectedIndex}" style="${roomStyle}">
        <header class="er-mission-head er-mission-section-head">
          <div class="er-mission-meta">
            <div class="er-mission-index">Briefing · ${terms.itemSingularTitle} ${String(selectedIndex + 1).padStart(2, "0")}</div>
            <h3>${escapeHtml(selectedMission.titulo)}</h3>
          </div>
        </header>
        <div class="er-mission-body">
          <section class="er-type-panel" aria-label="Contenido del briefing">
            <div class="er-label">Contenido del briefing</div>
            <div class="er-mission-grid">
              <label class="er-field er-field-wide">
                <span>Expediente de contexto</span>
                <textarea rows="9" data-field="contexto" data-index="${selectedIndex}" placeholder="Lectura con toda la información necesaria para resolver las preguntas.">${escapeHtml(selectedMission.contexto)}</textarea>
                <small>Las preguntas pueden evaluar datos literales o aplicar las reglas de esta lectura a casos nuevos incluidos en el enunciado.</small>
              </label>
              <label class="er-field er-field-wide">
                <span>Evidencias clave · una por línea</span>
                <textarea rows="5" data-field="datos_clave" data-index="${selectedIndex}" placeholder="Dato o relación importante">${escapeHtml(evidenceText)}</textarea>
              </label>
            </div>
          </section>
          <section class="er-preview-panel er-briefing-image-editor" aria-label="Imagen del briefing">
            <div class="er-label">Imagen del briefing</div>
            <div class="er-question-image-editor">
              <div class="er-preview-poster er-mission-image-preview">${getMissionPreviewMedia(selectedMission)}</div>
              <label class="er-field">
                <span>Prompt de la imagen</span>
                <textarea rows="3" data-field="imagen_prompt" data-index="${selectedIndex}" placeholder="Describe la imagen de apoyo del briefing.">${escapeHtml(selectedMission.imagen_prompt)}</textarea>
              </label>
              <label class="er-field">
                <span>Texto alternativo</span>
                <input type="text" data-field="imagen_alt" data-index="${selectedIndex}" value="${escapeHtmlAttr(selectedMission.imagen_alt)}" placeholder="Describe brevemente lo que muestra la imagen">
              </label>
              <div class="er-question-image-actions" aria-label="Acciones de la imagen del briefing">
                <button type="button" class="er-button er-button-secondary er-question-image-action" data-action="replace-mission-image" data-index="${selectedIndex}">
                  <i class="fas fa-upload" aria-hidden="true"></i><span>Sustituir imagen</span>
                </button>
                <button type="button" class="er-button er-button-secondary er-question-image-action" data-action="regenerate-mission-image" data-index="${selectedIndex}">
                  <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Regenerar con este prompt</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </article>
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

    return `
      <article class="er-mission-card er-mission-section-editor ${mission.bloqueada_inicial ? "is-locked" : ""}" data-mission-card data-index="${index}" style="${roomStyle}">
        <header class="er-mission-head er-mission-section-head">
          <div class="er-drag-handle" title="Arrastrar para reordenar">
            <i class="fas fa-grip-vertical"></i>
          </div>
          <div class="er-mission-meta">
            <div class="er-mission-index">Datos globales · ${terms.itemSingularTitle} ${String(index + 1).padStart(2, "0")}</div>
            <h3>${escapeHtml(mission.titulo)}</h3>
            <p>${escapeHtml(mission.id)}</p>
          </div>
          <div class="er-mission-actions">
            <button type="button" class="er-mission-actions-toggle er-studio-icon-button" data-mission-actions-toggle aria-label="Opciones de ${terms.itemSingular}" aria-haspopup="menu" aria-controls="erMissionActionsMenu-${index}" aria-expanded="false">
              <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
            </button>
            <div class="er-mission-actions-menu hidden" id="erMissionActionsMenu-${index}" role="menu" aria-label="Acciones de ${terms.itemSingular}">
              <button type="button" role="menuitem" data-action="regenerate-mission" data-index="${index}"><i class="fas fa-rotate-right" aria-hidden="true"></i><span>Regenerar ${terms.itemSingular}</span></button>
              <button type="button" role="menuitem" class="is-danger" data-action="delete-mission" data-index="${index}"><i class="fas fa-trash" aria-hidden="true"></i><span>Eliminar ${terms.itemSingular}</span></button>
            </div>
          </div>
        </header>
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
            <label class="er-field er-field-wide">
              <span>Historia</span>
              <textarea rows="3" data-field="historia" data-index="${index}">${escapeHtml(mission.historia)}</textarea>
            </label>
            <div class="er-field-row er-field-wide er-field-row--2">
              <label class="er-field">
                <span>Challenge de la sala</span>
                <textarea rows="3" data-field="reto" data-index="${index}">${escapeHtml(mission.reto)}</textarea>
              </label>
              <label class="er-field">
                <span>Pista</span>
                <textarea rows="2" data-field="pista" data-index="${index}">${escapeHtml(mission.pista)}</textarea>
              </label>
            </div>
            <label class="er-field er-field-wide">
              <span>Feedback al completar la sala</span>
              <textarea rows="2" data-field="retroalimentacion_correcta" data-index="${index}" placeholder="Mensaje que se muestra una sola vez al resolver todas las preguntas.">${escapeHtml(mission.retroalimentacion_correcta)}</textarea>
            </label>
          </div>

          <section class="er-routing-panel">
            <div class="er-label">Rutas y desbloqueos</div>
            <p class="er-inline-note">El escape room usa desbloqueo secuencial: cada ${terms.itemSingular} abre solo la siguiente.</p>
            <div class="er-unlock-grid">
              ${unlockSummary}
            </div>
          </section>

          ${renderFinalKeyEditorCard()}
        </div>
      </article>
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
  state.selectedBriefingMissionId = null;
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
    state.selectedBriefingMissionId = null;
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

  if (fieldPath === "reto") {
    const previousValue = normalizeString(mission.reto, "");
    mission.reto = value;
    if (mission.media && normalizeString(mission.media.texto, "") === previousValue) {
      mission.media = { ...mission.media, texto: value };
    }
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "respuestas_aceptadas") {
    mission.respuestas_aceptadas = normalizeTextList(String(value || "").split(/\r?\n+/));
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "respuesta_booleana") {
    mission.respuesta_correcta = String(value) === "true";
    mission.respuestas_aceptadas = [];
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "elementos") {
    mission.elementos = normalizeSequenceItems(String(value || "").split(/\r?\n+/));
    mission.respuesta_correcta = "";
    mission.respuestas_aceptadas = [];
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "datos_clave") {
    mission.datos_clave = normalizeTextList(String(value || "").split(/\r?\n+/)).slice(0, 8);
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
    if (["relacion_columnas", "drag_drop", "ordenar_secuencia"].includes(value)) {
      mission.respuesta_correcta = "";
      mission.respuestas_aceptadas = [];
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
  if (fieldPath.startsWith('experience.')) {
    try { updateExperienceEditor(question, fieldPath.slice(11), value); }
    catch (error) { setStatus(error.message, 'warning'); return; }
    question.content_revision = (Number(question.content_revision) || 0) + 1;
    scheduleOutputRefresh(); return;
  }
  if (fieldPath === 'word_bank_answers') {
    question.parejas = String(value || '').split(/\r?\n/).map(word => word.trim()).filter(Boolean).map((word, index) => ({ izquierda: String(index + 1), derecha: word, pista: '' }));
    question.respuesta_correcta = '';
    question.respuestas_aceptadas = [];
    scheduleOutputRefresh();
    return;
  }
  if (fieldPath === 'word_bank_distractors') {
    question.opciones = String(value || '').split(/\r?\n/).map(word => word.trim()).filter(Boolean);
    scheduleOutputRefresh();
    return;
  }
  if (fieldPath === 'matching_distractors') {
    question.opciones = String(value || '').split(/\r?\n/).map(option => option.trim()).filter(Boolean);
    question.interaction_contract_version = 2;
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "reto") {
    const previousValue = normalizeString(question.reto, "");
    question.reto = value;
    if (question.media && normalizeString(question.media.texto, "") === previousValue) {
      question.media = { ...question.media, texto: value };
    }
    if (question.tipo_interaccion === "completar_espacio"
      && normalizeString(question.texto_con_hueco, "") === previousValue) {
      question.texto_con_hueco = value;
    }
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "respuestas_aceptadas") {
    const rawAcceptedAnswers = normalizeTextList(String(value || "").split(/\r?\n+/));
    if (["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "palabra"
      && rawAcceptedAnswers.some((answer) => !isSingleWordAnswer(answer))) {
      setStatus("Las respuestas de tipo palabra admiten una o dos palabras con letras y, si corresponde, guion o apóstrofo; no admiten números.", "warning");
      renderMissionEditor();
      return;
    }
    const acceptedAnswers = rawAcceptedAnswers;
    question.respuestas_aceptadas = acceptedAnswers;
    question.respuesta_correcta = acceptedAnswers[0] || "";
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "elementos") {
    question.elementos = normalizeSequenceItems(String(value || "").split(/\r?\n+/));
    question.respuesta_correcta = "";
    question.respuestas_aceptadas = [];
    scheduleOutputRefresh();
    return;
  }

  if (fieldPath === "respuesta_correcta") {
    const previousCorrect = normalizeString(question.respuesta_correcta, "").trim();
    const rawNextCorrect = normalizeString(value, "").trim();
    if (["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "palabra") {
      if (/^[-+]?\d+(?:[.,]\d+)?$/.test(rawNextCorrect)) {
        question.subtipo_respuesta = "numero";
      } else if (rawNextCorrect && !isSingleWordAnswer(rawNextCorrect)) {
        setStatus("La respuesta no se guardó: el tipo palabra admite una o dos palabras, pero no números ni combinaciones alfanuméricas.", "warning");
        renderMissionEditor();
        return;
      }
    }
    const nextCorrect = rawNextCorrect;
    question.respuesta_correcta = nextCorrect;
    question.respuestas_aceptadas = replacePrimaryAcceptedAnswer(
      question.respuestas_aceptadas,
      previousCorrect,
      nextCorrect
    );
    question.subtipo_respuesta = resolveTextSubtypeForAnswer(question.subtipo_respuesta, nextCorrect);

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
    if (!experience.config(experienceConfig).question_types.includes(value)) { setStatus('Activa ese tipo en Preguntas y recompensas antes de usarlo.', 'warning'); renderMissionEditor(); return; }
    question.tipo_interaccion = value;
    if (experience.get(value)) { question.interaction_data = null; question.respuesta_correcta = ''; question.respuestas_aceptadas = []; setStatus('Regenera esta pregunta para crear su nueva interacción.', 'info'); }
    question.interaction_contract_version = ['relacion_columnas', 'completar_espacio'].includes(value) ? 2 : 1;
    if (value === 'completar_espacio') {
      question.parejas = question.parejas?.length ? question.parejas.map((pair, index) => ({ ...pair, izquierda: String(index + 1) })) : [];
      question.respuesta_correcta = '';
      question.respuestas_aceptadas = [];
    }
    if (value === "multimedia") question.subtipo_respuesta = "frase_corta";
    if (["relacion_columnas", "drag_drop", "ordenar_secuencia"].includes(value)) {
      question.respuesta_correcta = "";
      question.respuestas_aceptadas = [];
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

      if (question.subtipo_respuesta === "palabra") {
        const currentAnswer = normalizeString(question.respuesta_correcta, "");
        if (/^[-+]?\d+(?:[.,]\d+)?$/.test(currentAnswer)) question.subtipo_respuesta = "numero";
        question.respuesta_correcta = currentAnswer;
        question.respuestas_aceptadas = [question.respuesta_correcta, ...(question.respuestas_aceptadas || [])]
          .filter((answer) => isSingleWordAnswer(answer))
          .filter(Boolean);
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

    if (["texto", "multimedia"].includes(question.tipo_interaccion) && question.subtipo_respuesta === "palabra") {
      const currentAnswer = normalizeString(question.respuesta_correcta, "");
      if (/^[-+]?\d+(?:[.,]\d+)?$/.test(currentAnswer)) {
        question.subtipo_respuesta = "numero";
      }
      question.respuesta_correcta = currentAnswer;
      question.respuestas_aceptadas = [question.respuesta_correcta, ...(question.respuestas_aceptadas || [])]
        .filter((answer) => isSingleWordAnswer(answer))
        .filter(Boolean);
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
  if (!mission || mission.parejas.length >= 6) return;
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
  const question = createQuestionDraft(missionIndex, questionIndex, {});
  mission.preguntas.push(question);
  state.selectedMissionId = mission.id;
  state.selectedQuestionId = question.id;
  state.selectedBriefingMissionId = null;
  state.expandedMissionIds.add(mission.id);
  renderMissionEditor();
  scheduleOutputRefresh();
}

function commitQuestionRemoval(missionIndex, questionIndex) {
  const mission = state.project?.misiones[missionIndex];
  if (!mission || !Array.isArray(mission.preguntas)) return false;
  if (mission.preguntas.length <= 1) {
    setStatus("Cada sala debe conservar al menos una pregunta.", "warning");
    return false;
  }
  const question = mission.preguntas[questionIndex];
  if (!question) return false;
  const deletingSelected = mission.id === state.selectedMissionId && mission.preguntas[questionIndex]?.id === state.selectedQuestionId;
  const fallbackQuestion = mission.preguntas[questionIndex + 1] || mission.preguntas[questionIndex - 1] || null;
  const removal = removeQuestionAtIndex(mission.preguntas, questionIndex, 1);
  if (!removal.removedQuestion) return false;
  mission.preguntas = removal.questions.map((remainingQuestion, index) => createQuestionDraft(missionIndex, index, remainingQuestion));
  if (deletingSelected) state.selectedQuestionId = fallbackQuestion?.id || null;
  renderMissionEditor();
  scheduleOutputRefresh();
  setStatus(`Pregunta eliminada de la sala ${missionIndex + 1}.`, "success");
  return true;
}

function requestQuestionRemoval(missionIndex, questionIndex, trigger = null) {
  const mission = state.project?.misiones[missionIndex];
  if (!mission || !Array.isArray(mission.preguntas)) return false;
  if (mission.preguntas.length <= 1) {
    setStatus("Cada sala debe conservar al menos una pregunta.", "warning");
    return false;
  }
  const question = mission.preguntas[questionIndex];
  if (!question || !elements.deleteQuestionDialog) return false;
  const questionLabel = getQuestionQuestionText(question, questionIndex);
  elements.deleteQuestionDescription.textContent = `Se eliminará “${questionLabel}” junto con sus respuestas, opciones, pistas, feedback e imagen. Esta acción no se puede deshacer.`;
  state.pendingQuestionRemoval = {
    missionIndex,
    questionIndex,
    returnFocus: trigger instanceof HTMLElement ? trigger : document.activeElement
  };
  if (typeof elements.deleteQuestionDialog.showModal === "function") {
    elements.deleteQuestionDialog.showModal();
  } else {
    elements.deleteQuestionDialog.setAttribute("open", "");
  }
  return true;
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
  if (question.parejas.length >= 6) return;
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

function closeEditorActionsMenu({ restoreFocus = false } = {}) {
  const toggleSelector = '[data-mission-actions-toggle], [data-question-actions-toggle]';
  const menuSelector = ".er-mission-actions-menu, .er-question-actions-menu";
  const openToggle = elements.missionEditorList?.querySelector('[data-mission-actions-toggle][aria-expanded="true"], [data-question-actions-toggle][aria-expanded="true"]');
  elements.missionEditorList?.querySelectorAll(toggleSelector).forEach((toggle) => {
    toggle.setAttribute("aria-expanded", "false");
  });
  elements.missionEditorList?.querySelectorAll(menuSelector).forEach((menu) => {
    menu.classList.add("hidden");
  });
  if (restoreFocus) openToggle?.focus();
}

function toggleEditorActionsMenu(toggle, { focusFirst = true } = {}) {
  const menuId = toggle?.getAttribute("aria-controls");
  const menu = menuId ? document.getElementById(menuId) : null;
  if (!menu || !elements.missionEditorList?.contains(menu)) return;
  const shouldOpen = toggle.getAttribute("aria-expanded") !== "true";
  closeEditorActionsMenu();
  if (!shouldOpen) {
    toggle.focus();
    return;
  }
  toggle.setAttribute("aria-expanded", "true");
  menu.classList.remove("hidden");
  if (focusFirst) menu.querySelector('[role="menuitem"]')?.focus();
}

function wireMissionEditorEvents() {
  elements.missionEditorList.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches('[data-editor-final-key]')) {
      const code = normalizeEditableFinalKey(target.value);
      target.value = code;
      state.project.clave_final = code;
      elements.generalContentInputs.forEach((field) => {
        if (field.dataset.projectField === "clave_final" && field.value !== code) field.value = code;
      });
      scheduleOutputRefresh();
      return;
    }
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
    const menuToggle = event.target.closest("[data-mission-actions-toggle], [data-question-actions-toggle]");
    if (menuToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleEditorActionsMenu(menuToggle);
      return;
    }
    const button = event.target.closest("[data-action], [data-question-action]");
    if (!button) return;
    const blockedWhileImagesGenerate = new Set([
      "delete-question",
      "delete-question-image",
      "replace-question-image",
      "regenerate-question-image",
      "regenerate-question",
      "delete-mission",
      "replace-mission-image",
      "regenerate-mission-image",
      "regenerate-mission"
    ]);
    const requestedAction = button.dataset.questionAction || button.dataset.action || "";
    if (state.isGeneratingImagesInBackground && blockedWhileImagesGenerate.has(requestedAction)) {
      setStatus("Las imágenes siguen generándose. Puedes revisar y editar el contenido; espera a que termine para eliminar o regenerar elementos.", "info");
      return;
    }
    if (button.closest(".er-mission-actions-menu, .er-question-actions-menu")) {
      event.preventDefault();
      event.stopPropagation();
      closeEditorActionsMenu();
    }
    const questionAction = button.dataset.questionAction;
    if (questionAction) {
      const missionIndex = Number(button.dataset.questionMissionIndex);
      const questionIndex = Number(button.dataset.questionIndex);
      if (Number.isNaN(missionIndex) || Number.isNaN(questionIndex)) return;
      if (questionAction === "delete-question") requestQuestionRemoval(missionIndex, questionIndex, button);
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
      if (questionAction === "regenerate-question-image") {
        void regenerateQuestionImageOnly(missionIndex, questionIndex);
      }
      if (questionAction === "delete-question-image") {
        removeQuestionImage(missionIndex, questionIndex);
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
    if (action === "regenerate-mission-image") {
      void regenerateMissionImageOnly(index);
    }
    if (action === "regenerate-mission") {
      void regenerateMissionContent(index);
    }
  });

  elements.missionEditorList.addEventListener("keydown", (event) => {
    const menuToggle = event.target.closest("[data-mission-actions-toggle], [data-question-actions-toggle]");
    if (menuToggle && event.key === "ArrowDown") {
      event.preventDefault();
      toggleEditorActionsMenu(menuToggle);
      return;
    }
    const menu = event.target.closest(".er-mission-actions-menu, .er-question-actions-menu");
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not(:disabled)'));
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditorActionsMenu({ restoreFocus: true });
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !items.length) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[nextIndex]?.focus();
  });

  elements.missionEditorList.addEventListener("focusout", () => {
    window.requestAnimationFrame(() => {
      if (!document.activeElement?.closest?.(".er-mission-actions, .er-question-summary-actions")) closeEditorActionsMenu();
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".er-mission-actions, .er-question-summary-actions")) closeEditorActionsMenu();
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
    if (target.type === "cover" || target.type === "ending") {
      void replaceCoverImage(file, target.type);
    } else {
      void replaceActivityImage({
        missionIndex: target.missionIndex,
        questionIndex: target.questionIndex,
        file
      });
    }
  });
}

function wireSessionEvents() {
  elements.sessionNameFilter?.addEventListener("input", (event) => {
    if (structuralView.enabled) {
      structuralView.search = String(event.currentTarget.value || '');
      renderSessionList();
      return;
    }
    setSessionFilters({
      sessionNameFilter: String(event.currentTarget.value || ""),
      sessionTrimesterFilter: state.sessionTrimesterFilter,
      sessionSubjectFilter: state.sessionSubjectFilter,
      sessionThemeFilter: state.sessionThemeFilter,
      sessionLevelFilter: state.sessionLevelFilter,
      sessionGradoFilter: state.sessionGradoFilter
    });
    closeSessionMenu();
  });

  elements.sessionTrimesterFilters?.forEach((select) => {
    select?.addEventListener("change", (event) => {
      setSessionFilters({ sessionNameFilter: state.sessionNameFilter, sessionTrimesterFilter: event.currentTarget.value, sessionSubjectFilter: state.sessionSubjectFilter, sessionThemeFilter: state.sessionThemeFilter, sessionLevelFilter: state.sessionLevelFilter, sessionGradoFilter: state.sessionGradoFilter });
      closeSessionMenu();
    });
  });

  elements.sessionSubjectFilters?.forEach((select) => {
    select?.addEventListener("change", (event) => {
      setSessionFilters({ sessionNameFilter: state.sessionNameFilter, sessionTrimesterFilter: state.sessionTrimesterFilter, sessionThemeFilter: state.sessionThemeFilter, sessionLevelFilter: state.sessionLevelFilter, sessionGradoFilter: state.sessionGradoFilter, sessionSubjectFilter: String(event.currentTarget.value || "").trim() });
      closeSessionMenu();
    });
  });

  elements.sessionThemeFilters?.forEach((select) => {
    select?.addEventListener("change", (event) => {
      setSessionFilters({ sessionNameFilter: state.sessionNameFilter, sessionTrimesterFilter: state.sessionTrimesterFilter, sessionSubjectFilter: state.sessionSubjectFilter, sessionLevelFilter: state.sessionLevelFilter, sessionGradoFilter: state.sessionGradoFilter, sessionThemeFilter: String(event.currentTarget.value || "").trim() });
      closeSessionMenu();
    });
  });

  elements.sessionLevelFilters?.forEach((select) => {
    select?.addEventListener("change", (event) => {
      setSessionFilters({ sessionNameFilter: state.sessionNameFilter, sessionTrimesterFilter: state.sessionTrimesterFilter, sessionSubjectFilter: state.sessionSubjectFilter, sessionThemeFilter: state.sessionThemeFilter, sessionGradoFilter: state.sessionGradoFilter, sessionLevelFilter: String(event.currentTarget.value || "").trim() });
      closeSessionMenu();
    });
  });

  elements.sessionGradeFilters?.forEach((select) => {
    select?.addEventListener("change", (event) => {
      setSessionFilters({ sessionNameFilter: state.sessionNameFilter, sessionTrimesterFilter: state.sessionTrimesterFilter, sessionSubjectFilter: state.sessionSubjectFilter, sessionThemeFilter: state.sessionThemeFilter, sessionLevelFilter: state.sessionLevelFilter, sessionGradoFilter: String(event.currentTarget.value || "").trim() });
      closeSessionMenu();
    });
  });

  elements.btnResetSessionFilters?.addEventListener("click", () => {
    resetSessionFilters();
  });
  elements.btnRetrySessionIndex?.addEventListener("click", retrySessionTopicIndexes);

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

  elements.btnCreateBlankSession?.addEventListener("click", async () => {
    const button = elements.btnCreateBlankSession;
    if (button) button.disabled = true;
    try {
      await createBlankSession();
      getNewSessionModal()?.hide();
    } catch (_) {
      // createBlankSession ya comunica el error en la interfaz.
    } finally {
      if (button) button.disabled = false;
    }
  });

  elements.btnImportZipSession?.addEventListener("click", () => {
    setImportZipStatus("Selecciona un ZIP exportado por PigPen.");
    elements.importZipInput?.click();
  });

  elements.btnCreateSheetsSession?.addEventListener("click", () => {
    createSessionFromSheetsPending = true;
    const openSheetsImporter = () => window.PigPenSheetsImport?.open?.();
    if (elements.newSessionModal?.classList.contains("show")) {
      elements.newSessionModal.addEventListener("hidden.bs.modal", openSheetsImporter, { once: true });
      getNewSessionModal()?.hide();
      return;
    }
    openSheetsImporter();
  });

  elements.sheetsImportModal?.addEventListener("hidden.bs.modal", () => {
    createSessionFromSheetsPending = false;
  });

  elements.sessionFiltersModal?.addEventListener("show.bs.modal", () => {
    syncSessionFiltersModalTheme();
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

function isFirebaseStorageDownloadUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim(), window.location.origin);
    const host = String(parsed.hostname || "").toLowerCase();
    if (host === "firebasestorage.googleapis.com") {
      return /^\/v0\/b\/[^/]+\/o\//i.test(parsed.pathname);
    }
    if (host === "storage.googleapis.com") {
      return parsed.pathname.split("/").filter(Boolean).length >= 2;
    }
    return host.endsWith(".firebasestorage.app") || host.endsWith("firebasestorage.app");
  } catch (_) {
    return false;
  }
}

function decodeStorageObjectPath(value = "") {
  let decoded = String(value || "").trim();
  for (let attempt = 0; attempt < 3 && /%[0-9a-f]{2}/i.test(decoded); attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (_) {
      break;
    }
  }
  return decoded.replace(/^\/+/, "").trim();
}

function deriveFirebaseStoragePathFromUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim(), window.location.origin);
    const host = String(parsed.hostname || "").toLowerCase();
    const pathname = String(parsed.pathname || "");
    if (pathname.includes("/api/assets/proxy-media") || pathname.includes("/api/assets/proxy-image")) {
      const directStoragePath = decodeStorageObjectPath(parsed.searchParams.get("storagePath") || "");
      if (directStoragePath) return directStoragePath;
      return deriveFirebaseStoragePathFromUrl(parsed.searchParams.get("url") || "");
    }
    if (host === "firebasestorage.googleapis.com") {
      const match = pathname.match(/^\/(?:v0\/)?b\/[^/]+\/o\/(.+)$/i);
      return match ? decodeStorageObjectPath(match[1]) : "";
    }
    if (host === "storage.googleapis.com") {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length < 2) return "";
      parts.shift();
      return decodeStorageObjectPath(parts.join("/"));
    }
    if (host.endsWith(".firebasestorage.app") || host.endsWith("firebasestorage.app")) {
      return decodeStorageObjectPath(pathname.replace(/^\/?o\//i, ""));
    }
  } catch (_) {
    return "";
  }
  return "";
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
    const storagePath = deriveFirebaseStoragePathFromUrl(parsed.toString());
    if (storagePath) {
      return buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`);
    }
    return buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
  } catch (_) {
    return clean;
  }
}

function isAssetProxyUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim(), window.location.origin);
    return /\/api\/assets\/proxy-(?:media|image)\?/i.test(`${parsed.pathname}${parsed.search}`);
  } catch (_) {
    return false;
  }
}

/** Fetch an exportable resource while preserving its real MIME type. */
async function fetchBinaryAsset(url) {
  try {
    const rawUrl = String(url || "").trim();
    if (isDataUrl(rawUrl)) return dataUrlToBlob(rawUrl);
    // Los assets locales del Creator (por ejemplo logo.png) deben descargarse
    // directamente. Enviarlos al proxy remoto los convierte erróneamente en un
    // recurso externo cuando hay una API configurada.
    const isRemote = isRemoteUrl(rawUrl);
    const resolvedUrl = isRemote
      ? resolveRemoteAssetDownloadUrl(rawUrl)
      : new URL(rawUrl, window.location.href).toString();
    // Las URLs firmadas de Google Storage no siempre exponen CORS al navegador.
    // Si podemos derivar el storagePath, probamos primero el proxy autenticado.
    const candidates = isRemote && isFirebaseStorageDownloadUrl(rawUrl)
      ? [resolvedUrl, rawUrl]
      : [resolvedUrl];
    for (const candidateUrl of [...new Set(candidates.filter(Boolean))]) {
      try {
        const response = isAssetProxyUrl(candidateUrl)
          ? await authFetch(candidateUrl)
          : await fetch(candidateUrl, { mode: "cors" });
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "application/octet-stream";
        return new Blob([buffer], { type: contentType });
      } catch (_) {
        // Intenta el siguiente candidato; el caller reporta el fallo definitivo.
      }
    }
    return null;
  } catch (e) {
    console.warn(`No se pudo descargar el recurso remoto para empaquetarlo: ${url}`, e);
    return null;
  }
}

function hasPngSignature(buffer) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

async function fetchRequiredCreatorLogo() {
  const response = await fetch(CREATOR_LOGO_URL, {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`logo.png respondió HTTP ${response.status}.`);
  }
  const buffer = await response.arrayBuffer();
  if (!hasPngSignature(buffer)) {
    throw new Error("La respuesta de logo.png no contiene un archivo PNG válido.");
  }
  return new Uint8Array(buffer);
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

function isExportableAssetSource(value = "") {
  const source = String(value || "").trim();
  return isRemoteUrl(source) || isDataUrl(source) || /^blob:/i.test(source);
}

function countExportableImages(project = {}) {
  const sources = new Set();
  const addImage = (value) => {
    const source = String(value || "").trim();
    if (isExportableAssetSource(source)) sources.add(source);
  };
  addImage(project.backgroundImage);
  addImage(project.endingImage);
  for (const mission of Array.isArray(project.misiones) ? project.misiones : []) {
    const missionImage = String(mission?.imagen || "").trim();
    addImage(missionImage);
    if (mission?.media?.tipo === "imagen"
      && String(mission.media.url).trim() !== missionImage) addImage(mission.media.url);
    for (const question of Array.isArray(mission?.preguntas) ? mission.preguntas : []) {
      const questionImage = String(question?.imagen || "").trim();
      addImage(questionImage);
      if (question?.media?.tipo === "imagen"
        && String(question.media.url).trim() !== questionImage) addImage(question.media.url);
    }
  }
  return sources.size;
}

async function downloadRemoteAssets(project, remoteFiles, mediaFolder, { onImageProgress } = {}) {
  const stats = {
    downloaded: 0,
    failed: 0,
    imagesProcessed: 0,
    imagesOptimized: 0,
    imagesUnchanged: 0,
    originalBytes: 0,
    finalBytes: 0,
    failedSources: []
  };
  const totalImages = countExportableImages(project);
  let currentImage = 0;
  const packagedAssets = new Map();

  async function packageAsset(source, basePath, { image = false, fallbackExtension = "bin" } = {}) {
    if (!isExportableAssetSource(source)) return "";
    const normalizedSource = String(source || "").trim();
    const cacheKey = `${image ? "image" : "media"}:${normalizedSource}`;
    if (packagedAssets.has(cacheKey)) return packagedAssets.get(cacheKey);
    if (image) {
      currentImage += 1;
      onImageProgress?.(currentImage, totalImages);
    }
    const blob = await fetchBinaryAsset(normalizedSource);
    if (!blob) {
      stats.failed += 1;
      stats.failedSources.push(normalizedSource);
      packagedAssets.set(cacheKey, "");
      return "";
    }

    let bytes;
    let mimeType;
    let extension;
    if (image) {
      stats.imagesProcessed += 1;
      const result = await optimizeRasterImage(blob);
      bytes = result.bytes;
      mimeType = result.mimeType;
      extension = result.extension || fallbackExtension;
      if (result.status === "failed") {
        stats.failed += 1;
        stats.failedSources.push(normalizedSource);
        packagedAssets.set(cacheKey, "");
        return "";
      }
      stats.originalBytes += result.originalBytes;
      stats.finalBytes += result.optimizedBytes;
      if (result.status === "optimized" || result.status === "sanitized") stats.imagesOptimized += 1;
      else {
        stats.imagesUnchanged += 1;
      }
    } else {
      bytes = new Uint8Array(await blob.arrayBuffer());
      mimeType = detectAssetMimeType(bytes, blob.type);
      extension = extensionForMimeType(mimeType, fallbackExtension);
    }

    const fileName = `${basePath}.${extension}`;
    remoteFiles[fileName] = bytes;
    stats.downloaded += 1;
    packagedAssets.set(cacheKey, fileName);
    return fileName;
  }

  // 1. Background Image
  if (isExportableAssetSource(project.backgroundImage)) {
    const fileName = await packageAsset(
      project.backgroundImage,
      `${mediaFolder}/${sanitizeFileNameForAssets(project.titulo, "escape-room")}-background`,
      { image: true, fallbackExtension: "png" }
    );
    if (fileName) {
      project.backgroundImage = fileName;
    }
  }

  if (project.reward_plan?.type === "imagen" && isExportableAssetSource(project.reward_plan.image)) {
    const rewardFile = await packageAsset(project.reward_plan.image, `${mediaFolder}/reward-image`, { image: true, fallbackExtension: "png" });
    if (!rewardFile) throw new Error('No se pudo incluir la imagen de recompensa en el ZIP. Comprueba la conexión e inténtalo de nuevo.');
    project.reward_plan.image = rewardFile;
    if(project.experience_config)project.experience_config.reward_image=rewardFile;
  }
  // 2. Misiones
  if (isExportableAssetSource(project.endingImage)) {
    const fileName = await packageAsset(project.endingImage,
      `${mediaFolder}/${sanitizeFileNameForAssets(project.titulo, "escape-room")}-ending`,
      { image: true, fallbackExtension: "png" });
    if (fileName) project.endingImage = fileName;
  }
  if (Array.isArray(project.misiones)) {
    for (const [index, mission] of project.misiones.entries()) {
      const missionBase = sanitizeFileNameForAssets(mission.id || `mission-${index + 1}`, "mission");
      const missionImageSource = String(mission.imagen || "").trim();
      const missionMediaMirrorsImage = mission.media?.tipo === "imagen"
        && String(mission.media.url || "").trim() === missionImageSource;

      // Mission imagen
      if (isExportableAssetSource(missionImageSource)) {
        const originalSource = missionImageSource;
        const fileName = await packageAsset(
          originalSource,
          `${mediaFolder}/${missionBase}-reference`,
          { image: true, fallbackExtension: "png" }
        );
        if (fileName) {
          mission.imagen = fileName;
          if (mission.media?.tipo === "imagen" && mission.media.url === originalSource) {
            mission.media.url = fileName;
          }
        }
      }

      // Mission media
      if (!missionMediaMirrorsImage && isExportableAssetSource(mission.media?.url)) {
        const mediaIsImage = mission.media.tipo === "imagen";
        const fallbackExtension = mission.media.tipo === "audio" ? "mp3" : mission.media.tipo === "video" ? "mp4" : "png";
        const fileName = await packageAsset(
          mission.media.url,
          `${mediaFolder}/${missionBase}-media`,
          { image: mediaIsImage, fallbackExtension }
        );
        if (fileName) {
          mission.media.url = fileName;
        }
      }

      // 3. Preguntas
      if (Array.isArray(mission.preguntas)) {
        for (const [questionIndex, question] of mission.preguntas.entries()) {
          const questionBase = `${missionBase}-${sanitizeFileNameForAssets(question.id || `question-${questionIndex + 1}`, "question")}`;
          const questionImageSource = String(question.imagen || "").trim();
          const questionMediaMirrorsImage = question.media?.tipo === "imagen"
            && String(question.media.url || "").trim() === questionImageSource;

          // Question imagen
          if (isExportableAssetSource(questionImageSource)) {
            const originalSource = questionImageSource;
            const fileName = await packageAsset(
              originalSource,
              `${mediaFolder}/${questionBase}-question`,
              { image: true, fallbackExtension: "png" }
            );
            if (fileName) {
              question.imagen = fileName;
              if (question.media?.tipo === "imagen" && question.media.url === originalSource) {
                question.media.url = fileName;
              }
            }
          }

          // Question media
          if (!questionMediaMirrorsImage && isExportableAssetSource(question.media?.url)) {
            const mediaIsImage = question.media.tipo === "imagen";
            const fallbackExtension = question.media.tipo === "audio" ? "mp3" : question.media.tipo === "video" ? "mp4" : "png";
            const fileName = await packageAsset(
              question.media.url,
              `${mediaFolder}/${questionBase}-${question.media.tipo || "media"}`,
              { image: mediaIsImage, fallbackExtension }
            );
            if (fileName) {
              question.media.url = fileName;
            }
          }
        }
      }
    }
  }

  return stats;
}

function formatCompactBytes(value = 0) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
}

function buildImageOptimizationSummary(stats = {}) {
  const originalBytes = Number(stats.originalBytes) || 0;
  const finalBytes = Number(stats.finalBytes) || 0;
  const savedPercent = originalBytes > 0
    ? Math.max(0, Math.round((1 - (finalBytes / originalBytes)) * 100))
    : 0;
  return `${stats.imagesOptimized || 0} imágenes optimizadas · ${formatCompactBytes(originalBytes)} → ${formatCompactBytes(finalBytes)} · ${savedPercent}% menos · ${stats.imagesUnchanged || 0} sin cambios`;
}

function assertExportPackageHasNoEmbeddedImages(files = {}) {
  const residualPaths = Object.entries(files)
    .filter(([, content]) => typeof content === "string" && /(?:data:image\/|blob:)/i.test(content))
    .map(([path]) => path);
  if (residualPaths.length) {
    throw new Error(`Quedaron imágenes embebidas sin empaquetar en: ${residualPaths.join(", ")}`);
  }
}

function updateZipExportProgress(message = "Preparando los archivos del tema…") {
  if (elements.zipExportStatus) elements.zipExportStatus.textContent = message;
}

function trapZipExportModalFocus(event) {
  if (!state.isExporting || !["Tab", "Escape"].includes(event.key)) return;
  event.preventDefault();
  elements.zipExportModal?.focus({ preventScroll: true });
}

function showZipExportProgress() {
  if (state.isExporting) return false;
  state.isExporting = true;
  state.exportReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : elements.btnExportar;
  syncActionButtons();
  updateZipExportProgress();
  document.body.classList.add("er-zip-export-in-progress");
  elements.zipExportModal?.classList.remove("hidden");
  elements.zipExportModal?.setAttribute("aria-hidden", "false");
  document.addEventListener("keydown", trapZipExportModalFocus, true);
  window.requestAnimationFrame(() => elements.zipExportModal?.focus({ preventScroll: true }));
  return true;
}

function hideZipExportProgress() {
  elements.zipExportModal?.classList.add("hidden");
  elements.zipExportModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("er-zip-export-in-progress");
  document.removeEventListener("keydown", trapZipExportModalFocus, true);
  state.isExporting = false;
  syncActionButtons();
  const returnFocus = state.exportReturnFocus;
  state.exportReturnFocus = null;
  if (returnFocus instanceof HTMLElement && returnFocus.isConnected && !returnFocus.disabled) {
    returnFocus.focus({ preventScroll: true });
  }
}

async function ensureExportQuestionMedia() {
  const project = state.project;
  if (!project) return;
  const context = getFormData();
  for (const [missionIndex, mission] of (project.misiones || []).entries()) {
    for (const [questionIndex, question] of (mission.preguntas || []).entries()) {
      const location = `Sala ${missionIndex + 1} · Pregunta ${questionIndex + 1}`;
      const contentIssues = questionInteractionIssues(question);
      if (contentIssues.length) throw new Error(`${location}: ${contentIssues.join(" · ")}`);
      if (question.interaction_contract_version !== 1 || question.tipo_interaccion !== "multimedia"
        || normalizeString(question.media?.url || question.imagen, "")) continue;
      if (question.media?.tipo && question.media.tipo !== "imagen") {
        throw new Error(`${location}: añade el recurso de ${question.media.tipo} en el editor de Multimedia antes de exportar`);
      }
      updateZipExportProgress(`${location}: generando la imagen multimedia faltante…`);
      const result = await generateMissionImages(project, context, null, {
        missionIndexes: [missionIndex],
        includeMissionImage: false,
        includeQuestions: true,
        forceQuestionImages: true,
        questionScope: { missionIndex, questionIndex }
      });
      if (!result.generated || questionInteractionIssues(question, { requireMedia: true }).length) {
        throw new Error(`${location}: no se pudo completar la imagen multimedia. ${result.error?.message || "Reintenta la descarga o añade una imagen desde el editor"}`);
      }
      scheduleSessionSave();
      renderMissionEditor();
      renderOutputsNow();
    }
  }
}

async function copyExportedTopicAnswers(project, topic = {}) {
  try {
    const result = buildMoodleAnswerKeyHtml({ topics: [{ ...topic, project }] });
    if (!result.questionCount) return { warning: true, message: 'El tema no tiene preguntas para copiar.' };
    await writeHtmlToClipboard(result.html);
    return { warning: false, message: 'Respuestas del tema copiadas al portapapeles.' };
  } catch (error) {
    console.warn('El ZIP está listo, pero no se pudieron copiar las respuestas:', error);
    return { warning: true, message: 'No se pudieron copiar las respuestas. Usa «Copiar respuestas» en el menú del tema.' };
  }
}

async function buildAndDownloadExportPackage() {
  if(state.project?.experience_config?.primary_reward==='imagen') {
    state.project.reward_plan=rewardEngine.bindPlan(state.project.reward_plan,state.project);
    if(!state.project.reward_plan.image){setStatus('Recompensa visual pendiente. Genera la imagen o cambia la recompensa antes de exportar.','warning',{actionLabel:'Generar imagen de recompensa',onAction:retryRewardImage});return;}
  }
  await ensureExportQuestionMedia();
  const originalProject = materializeProjectForExport();
  if (!originalProject) return;
  const exportedTopic = { ...state.topics.find(topic => topic.id === state.activeTopicId) };
  const validation = validateProjectSetup(originalProject);
  if (validation.issues.length) {
    console.warn("El paquete se exportará como borrador con incidencias pendientes:", validation.issues);
    setStatus(`Exportando borrador con advertencias: ${validation.issues.join(" · ")}`, "warning");
  }
  const JSZipCtor = window.htmlDocx?.JSZip || window.JSZip;
  if (!JSZipCtor) {
    setStatus("JSZip no está disponible en esta pantalla.", "warning");
    return;
  }

  updateZipExportProgress("Descargando los recursos del tema…");
  setStatus("Descargando recursos remotos para empaquetado...", "info");

  const projectClone = clonePlainObject(originalProject);
  const remoteFiles = {};
  const mediaFolder = "assets/media";

  const remoteAssetStats = await downloadRemoteAssets(projectClone, remoteFiles, mediaFolder, {
    onImageProgress: (current, total) => {
      const message = `Optimizando imagen ${current} de ${total}…`;
      updateZipExportProgress(message);
      setStatus(message, "info");
    }
  });

  updateZipExportProgress("Preparando los recursos del paquete…");
  try {
    remoteFiles["logo.png"] = await fetchRequiredCreatorLogo();
  } catch (error) {
    console.error("No se pudo incorporar logo.png al paquete:", error);
    setStatus("No se pudo incluir logo.png. El paquete ZIP no fue generado; recarga la página e inténtalo de nuevo.", "bad");
    return;
  }

  updateZipExportProgress("Organizando los archivos del juego…");
  const pkg = buildEscapeRoomPackage(projectClone);
  assertExportPackageHasNoEmbeddedImages(pkg.files);
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

  updateZipExportProgress("Comprimiendo el paquete ZIP…");
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  updateZipExportProgress("Copiando las respuestas del tema exportado…");
  const answerCopy = await copyExportedTopicAnswers(originalProject, exportedTopic);

  let editorialFileName = "";
  let editorialDownloadError = null;
  updateZipExportProgress("Preparando el archivo editorial de correcciones…");
  try {
    editorialFileName = await downloadEditorialWorkbook({
      flushPendingSave: false,
      projectTitle: originalProject.titulo,
      fallbackProject: originalProject
    });
  } catch (error) {
    editorialDownloadError = error;
    console.error("El ZIP se descargó, pero no se pudo crear el archivo editorial:", error);
  }

  updateZipExportProgress(editorialDownloadError
    ? "El ZIP está listo; el archivo editorial no pudo descargarse."
    : "El ZIP y el archivo editorial están listos.");
  const optimizationSummary = `${buildImageOptimizationSummary(remoteAssetStats)} · ${answerCopy.message}`;
  if (editorialDownloadError) {
    setStatus(
      `ZIP generado · ${optimizationSummary} · No se pudo descargar el XLSX editorial: ${editorialDownloadError?.message || "error inesperado"}.`,
      "warning"
    );
    return;
  }
  if (remoteAssetStats.failed > 0) {
    setStatus(
      `ZIP y ${editorialFileName} generados · ${optimizationSummary} · ${remoteAssetStats.failed} recursos no pudieron optimizarse o descargarse.`,
      "warning"
    );
    return;
  }
  if (validation.issues.length) {
    setStatus(`ZIP de borrador y ${editorialFileName} generados · ${optimizationSummary} · ${validation.issues.length} advertencia(s) pendientes de revisión.`, "warning");
    return;
  }
  setStatus(`ZIP y ${editorialFileName} generados · ${optimizationSummary}`, answerCopy.warning ? "warning" : "success");
}

async function exportPackage() {
  if (!showZipExportProgress()) return;
  try {
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await buildAndDownloadExportPackage();
  } catch (error) {
    console.error("No se pudo generar el paquete ZIP:", error);
    setStatus(`No se pudo generar el paquete ZIP: ${error?.message || "error inesperado"}`, "bad");
  } finally {
    hideZipExportProgress();
  }
}

async function generateEscapeRoomFromBrief(event = null, { throwOnError = false } = {}) {
  event?.preventDefault();
  if (experienceConfirmationRequired && !(await experienceModal.open())) return null;
  event?.preventDefault?.();
  let generationCompleted = false;
  let objectivePreflightComplete = false;
  if (isGenerationBusy()) {
    setStatus("Ya hay una generación en curso. Espera a que termine antes de iniciar otra.", "info");
    return;
  }
  setStatus("", "info");

  const formData = getFormData();
  const interactionSeed = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2))).join("-")
    : `${Date.now()}-${Math.random()}`;
  formData.interactionPlanSeed = interactionSeed;
  // La selección de interacciones se resuelve al compilar el objetivo. La fase
  // de generación ejecuta ese plan y no vuelve a sortear tipos de actividad.
  formData.interactionPlan = [];
  const terms = getPresentationTerminology(formData.modoPresentacion);
  if (!formData.tema) {
    setStatus("Escribe un tema curricular antes de generar el escape room.", "warning");
    document.getElementById("temaInput")?.focus();
    return;
  }

  if (formData.estiloImagenBase === "otro" && !formData.estiloImagenPersonalizado) {
    setStatus("Describe el tipo de ilustración personalizado antes de generar el escape room.", "warning");
    elements.estiloImagenCustomInput?.focus();
    return;
  }

  if (!Number.isInteger(formData.misiones) || formData.misiones < 1 || formData.misiones > 8) {
    setStatus(`El número de ${terms.itemPlural} debe estar entre 1 y 8.`, "warning");
    document.getElementById("numMisionesInput")?.focus();
    return;
  }

  if (!Number.isInteger(formData.preguntasPorSala) || formData.preguntasPorSala < 1) {
    setStatus(`Las preguntas por ${terms.itemSingular} deben ser un número entero mayor que cero.`, "warning");
    document.getElementById("preguntasPorSalaInput")?.focus();
    return;
  }

  elements.btnGenerar.classList.add("is-generating");
  elements.btnGenerar.setAttribute("aria-busy", "true");
  elements.btnGenerar.dataset.erTooltip = "Generando escape room";
  elements.btnGenerarBottom?.classList.add("is-generating");
  elements.btnGenerarBottom?.setAttribute("aria-busy", "true");
  setLoading(true);
  state.isGenerating = true;
  state.isGeneratingImagesInBackground = false;
  state.generationNote = "";
  updatePreviewGenerationProgress({
    title: "Preparando el escape room",
    detail: `Comprobando el contenido materializado de ${formData.misiones} ${terms.itemPlural}`,
    reset: true
  });
  renderGeneralContentEditor();
  refreshPanels();

  try {
    let objectiveBlueprint = await prepareObjectiveBlueprintForGeneration(formData);
    const unlockContract = await ensureThematicObjectiveUnlockContract(formData, objectiveBlueprint);
    objectiveBlueprint = unlockContract.blueprint;
    if (unlockContract.repaired) {
      formData.objetivo = String(document.getElementById("objetivoInput")?.value || "").trim();
    }
    syncObjectivePlanStatus();
    formData.objectiveBlueprint = objectiveBlueprint;
    objectivePreflightComplete = true;
    let privateDraft = getReusablePrivateGenerationDraft(formData);
    if (privateDraft) {
      formData.interactionPlan = structuredClone(privateDraft.interactionPlan);
      privateDraft = hydratePrivateGenerationDraftFromObjective(
        privateDraft,
        objectiveBlueprint,
        formData,
        formData.interactionPlan
      );
      updatePreviewGenerationProgress({
        title: "Retomando el borrador privado",
        detail: "Se solicitarán únicamente las salas que todavía faltan"
      });
    } else {
      formData.interactionPlan = buildInteractionPlanFromObjectiveBlueprint(
        objectiveBlueprint,
        formData.misiones,
        formData.preguntasPorSala
      );
      privateDraft = createPrivateGenerationDraft(formData, objectiveBlueprint, formData.interactionPlan);
    }
    state.objectiveBlueprint = structuredClone(objectiveBlueprint);
    state.objectiveBlueprintKey = buildObjectiveBlueprintKey(formData, objectiveBlueprint.source_contract);
    persistObjectiveBlueprint(state.objectiveBlueprintKey, state.objectiveBlueprint);
    saveFormState();
    state.pendingGenerationDraft = structuredClone(privateDraft);
    state.pendingGenerationDraftKey = buildObjectiveBlueprintKey(formData);

    const missingMissionIndexes = privateDraft.rooms
      .map((mission, missionIndex) => mission ? null : missionIndex)
      .filter((missionIndex) => missionIndex !== null);
    const pendingMaterialization = missingMissionIndexes.map((missionIndex) => ({
      missionIndex,
      kind: objectiveBlueprint?.rooms?.[missionIndex]?.generated_room?.mission ? "incompatible" : "missing"
    }));
    const missingCount = pendingMaterialization.filter((item) => item.kind === "missing").length;
    const incompatibleCount = pendingMaterialization.length - missingCount;
    const pendingTitle = incompatibleCount && missingCount
      ? "Completando contenido pendiente"
      : incompatibleCount
        ? "Corrigiendo contenido incompatible"
        : missingCount
          ? "Completando contenido faltante"
          : "Reutilizando el objetivo enriquecido";
    const pendingDetail = incompatibleCount && missingCount
      ? `${missingCount} ${missingCount === 1 ? "sala no estaba materializada" : "salas no estaban materializadas"} y ${incompatibleCount} ${incompatibleCount === 1 ? "requiere actualización" : "requieren actualización"}; las demás se conservarán`
      : incompatibleCount
        ? `${incompatibleCount} ${incompatibleCount === 1 ? "sala materializada requiere" : "salas materializadas requieren"} actualización; las demás se conservarán`
        : missingCount
          ? `${missingCount} ${missingCount === 1 ? "sala no tenía" : "salas no tenían"} contenido materializado; las demás se conservarán`
          : "Todas las salas están listas; no se solicitará texto adicional a Gemini";
    updatePreviewGenerationProgress({
      title: pendingTitle,
      detail: pendingDetail
    });
    // Las salas son solicitudes editoriales grandes. Ejecutarlas en serie evita
    // ráfagas de TPM/RPM justo después de enriquecer el objetivo desde Sheets.
    const roomFailures = await runWithConcurrency(missingMissionIndexes, 1, async (missionIndex) => {
      const roomInteractionPlan = formData.interactionPlan[missionIndex];
      const pendingKind = pendingMaterialization.find((item) => item.missionIndex === missionIndex)?.kind || "missing";
      const sourceMission = pendingKind === "incompatible"
        ? objectiveBlueprint?.rooms?.[missionIndex]?.generated_room?.mission || null
        : null;
      updatePreviewGenerationProgress({
        title: `${pendingKind === "incompatible" ? "Corrigiendo" : "Completando"} la ${terms.itemSingular} ${missionIndex + 1}`,
        detail: pendingKind === "incompatible"
          ? "Actualizando únicamente el contenido que ya no cumple el contrato"
          : "Creando el contenido que no quedó materializado en el objetivo"
      });
      const mission = await requestGeneratedRoomBundle(formData, missionIndex, {
        roomInteractionPlan,
        sourceMission,
        progressMode: pendingKind === "incompatible" ? "repair" : "complete"
      });
      privateDraft.rooms[missionIndex] = mission;
      setObjectiveGeneratedRoom(objectiveBlueprint, missionIndex, mission, formData, roomInteractionPlan);
      formData.objectiveBlueprint = objectiveBlueprint;
      state.objectiveBlueprint = structuredClone(objectiveBlueprint);
      persistObjectiveBlueprint(state.objectiveBlueprintKey, state.objectiveBlueprint);
      saveFormState();
      if (!Array.isArray(privateDraft.rejectedRooms)) {
        privateDraft.rejectedRooms = Array.from({ length: privateDraft.rooms.length }, () => null);
      }
      privateDraft.rejectedRooms[missionIndex] = null;
      state.pendingGenerationDraft = structuredClone(privateDraft);
    }, { stopOnFailure: true });
    if (roomFailures.length) {
      if (!Array.isArray(privateDraft.rejectedRooms)) {
        privateDraft.rejectedRooms = Array.from({ length: privateDraft.rooms.length }, () => null);
      }
      roomFailures.forEach(({ item, error }) => {
        if (error?.generatedMission) privateDraft.rejectedRooms[item] = error.generatedMission;
      });
      state.pendingGenerationDraft = structuredClone(privateDraft);
      const details = roomFailures
        .sort((left, right) => left.item - right.item)
        .map(({ item, error }) => `Sala ${item + 1}: ${error?.message || "respuesta inválida"}`)
        .join(" · ");
      throw new Error(`No se completaron todas las salas. El borrador válido quedó conservado. ${details}`);
    }

    const academicTheme = buildAcademicPreviewTheme(formData);
    updatePreviewGenerationProgress({
      title: "Construyendo el escape room",
      detail: "Aplicando la plantilla, las respuestas y las mecánicas definidas en el objetivo enriquecido"
    });
    const generationDraft = assemblePrivateGenerationDraft(privateDraft, formData, academicTheme);
    const approvedProject = normalizeEscapeRoomProject(stripTemporaryCoverageAnchors(generationDraft));
    const project = applyAcademicMissionPalettes({
      ...approvedProject,
      idioma: formData.idioma || "es-419",
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
    preserveExistingProjectImages(project, state.project);
    // Los juegos anteriores conservan su portada en el cierre. Solo los nuevos
    // adoptan la generación automática; una imagen elegida explícitamente prevalece.
    project.dedicatedEndingImage = state.project?.misiones?.length
      ? state.project.dedicatedEndingImage === true : true;
    // Establecer proyecto en el estado y renderizar texto/preview inmediatamente
    project.experience_config = experience.config(formData.experience_config);
    project.reward_plan = rewardEngine.bindPlan(objectiveBlueprint.reward_plan, project);
    state.project = project;
    generationCompleted = true;
    state.objectiveBlueprint.quality_report = {
      ...(state.objectiveBlueprint.quality_report || {}),
      status: "escape_room_created",
      structural: true,
      deterministic: true,
      publication: false,
      issues: [],
      audits: []
    };
    persistObjectiveBlueprint(state.objectiveBlueprintKey, state.objectiveBlueprint);
    state.pendingGenerationDraft = null;
    state.pendingGenerationDraftKey = "";
    applyPreviewTheme(academicTheme, { persist: true, syncProject: true, refresh: false });
    state.selectedMissionId = null;
    state.selectedQuestionId = null;
    state.selectedBriefingMissionId = null;
    state.expandedMissionIds.clear();
    state.generationNote = "Contenido y mecánicas aplicados desde la plantilla · Preparando portada e imágenes...";
    state.isGeneratingImagesInBackground = true;
    state.isGenerating = false;

    presentGeneratedEscapeRoom();
    syncObjectivePlanStatus();
    setLoading(false);
    setStatus(
      `Generado: "${state.project.titulo}" · ${state.project.misiones.length} ${terms.itemPlural} · ${formData.duracion} min · ${state.generationNote}`,
      "success"
    );

    // La preview permanece disponible, pero el submit espera esta fase para que
    // las imágenes no se pierdan al terminar, cerrar o recargar silenciosamente.
    try {
      const imageStorageContext = await resolveGeneratedImageStorageContext();
      setStatus(`Contenido listo: "${project.titulo}" · generando imagen de portada…`, "info");
      const needsCoverImage = !project.backgroundImage;
      const generatedCoverImage = needsCoverImage ? await generateCoverImage(project, formData) : "";
      const coverImage = project.backgroundImage || await storeGeneratedImage(
        generatedCoverImage,
        `cover_${Date.now()}.webp`,
        imageStorageContext
      );
      if (coverImage) project.backgroundImage = coverImage;

      const needsEndingImage = project.dedicatedEndingImage && !project.endingImage;
      if (needsEndingImage) {
        setStatus(`Contenido listo: "${project.titulo}" · generando imagen de finalización…`, "info");
        try {
          const generatedEnding = await generateEndingImage(project, formData);
          const endingImage = await storeGeneratedImage(generatedEnding, `ending_${Date.now()}.webp`, imageStorageContext);
          if (endingImage) project.endingImage = endingImage;
        } catch (error) {
          console.warn("No se pudo generar la imagen de finalización:", error);
        }
      }

      let rewardImageError=null;
      try{await ensureRewardImage(project,formData);}catch(error){rewardImageError=error;console.warn('Imagen de recompensa pendiente',error);}
      const imageStats = await generateMissionImages(project, formData, (current, total) => {
        const progressNote = `Generando imágenes de briefings y preguntas (${current}/${total})…`;
        state.generationNote = `${coverImage ? "Portada lista · " : "Portada no disponible · "}${progressNote}`;
        setStatus(`Generando: "${project.titulo}" · ${state.generationNote}`, "info");
      }, { storageContext: imageStorageContext });

      const coverRequested = needsCoverImage;
      const totalImages = imageStats.total + (coverRequested ? 1 : 0) + (needsEndingImage ? 1 : 0);
      const generatedImages = imageStats.generated + (coverRequested && coverImage ? 1 : 0) + (needsEndingImage && project.endingImage ? 1 : 0);
      const failedImages = imageStats.failed + (coverRequested && !coverImage ? 1 : 0) + (needsEndingImage && !project.endingImage ? 1 : 0);
      state.generationNote = `${generatedImages}/${totalImages} imágenes listas${failedImages ? ` · ${failedImages} sin imagen` : ""}`;
      state.isGenerating = false;
      state.isGeneratingImagesInBackground = false;
      presentGeneratedEscapeRoom();
      if (pendingAssetMemory.size) showPendingAssetStatus();
      else setStatus(
        `Escape room listo: "${state.project.titulo}" · ${state.project.misiones.length} ${terms.itemPlural} · ${state.generationNote}`,
        "success"
      );
      if(rewardImageError)setStatus('Recompensa visual pendiente: '+rewardImageError.message,'error',{actionLabel:'Reintentar imagen',onAction:retryRewardImage});
      scheduleSessionSave();
    } catch (imageError) {
      console.error("Error en la generación de imágenes:", imageError);
      state.generationNote = `El contenido quedó listo, pero la fase de imágenes se interrumpió: ${imageError?.message || "error inesperado"}.`;
      state.isGenerating = false;
      state.isGeneratingImagesInBackground = false;
      presentGeneratedEscapeRoom();
      setStatus(state.generationNote, "bad");
      scheduleSessionSave();
    }
    return true;
  } catch (error) {
    console.error(error);
    const isUpstreamTimeout = isGeminiUpstreamTimeout(error);
    const isQuotaExhausted = isGeminiQuotaExhausted(error);
    if (!isUpstreamTimeout && !isQuotaExhausted && state.objectiveBlueprint?.quality_report) {
      state.objectiveBlueprint.quality_report = {
        ...state.objectiveBlueprint.quality_report,
        status: "requires_review",
        publication: false,
        issues: [normalizeString(error?.message, "La generación no superó la validación.")]
      };
      persistObjectiveBlueprint(state.objectiveBlueprintKey, state.objectiveBlueprint);
    }
    syncObjectivePlanStatus({ requiresReview: !isUpstreamTimeout && !isQuotaExhausted });
    const objectiveNeedsAttention = !objectivePreflightComplete && !isUpstreamTimeout && !isQuotaExhausted;
    const message = isUpstreamTimeout
      ? "Gemini no terminó la solicitud afectada dentro del tiempo disponible. Las salas completadas permanecen en el borrador privado para el siguiente intento."
      : isQuotaExhausted
        ? "Gemini mantiene agotada su cuota temporal. Las salas completadas permanecen guardadas; vuelve a generar más tarde para continuar únicamente con las pendientes."
        : objectiveNeedsAttention
          ? `El objetivo final no pudo quedar listo: ${error.message}`
          : `No se pudo generar el escape room: ${error.message}`;
    setStatus(message, "bad", objectiveNeedsAttention ? {
      actionLabel: "Regenerar objetivo final",
      onAction: () => void sugerirObjetivoFinal()
    } : {});
    state.isGenerating = false;
    state.isGeneratingImagesInBackground = false;
    renderMissionEditor();
    refreshPanels();
    if (throwOnError) throw error;
    return false;
  } finally {
    state.isGenerating = false;
    state.isGeneratingImagesInBackground = false;
    elements.btnGenerar.classList.remove("is-generating");
    elements.btnGenerar.removeAttribute("aria-busy");
    elements.btnGenerar.dataset.erTooltip = "Generar escape room";
    elements.btnGenerarBottom?.classList.remove("is-generating");
    elements.btnGenerarBottom?.removeAttribute("aria-busy");
    setLoading(false);
    if (generationCompleted) {
      const previewReady = presentGeneratedEscapeRoom();
      if (!previewReady) {
        setStatus("El escape room quedó generado, pero la vista previa no pudo montarse. Recarga la página para recuperarlo desde el guardado local.", "warning");
      }
    }
  }
  return generationCompleted;
}

elements.form.addEventListener("submit", generateEscapeRoomFromBrief);

elements.btnAddMission.addEventListener("click", addMission);
elements.btnRegenerateSelectedMission?.addEventListener("click", () => {
  const missionIndex = state.project?.misiones?.findIndex((mission) => mission.id === state.selectedMissionId) ?? -1;
  if (missionIndex >= 0) void regenerateMissionContent(missionIndex);
});
elements.btnCloseMissionWorkspace?.addEventListener("click", () => {
  state.selectedMissionId = null;
  state.selectedQuestionId = null;
  state.selectedBriefingMissionId = null;
  renderMissionEditor();
  refreshPanels();
});
elements.btnAddTopic?.addEventListener("click", openNewTopicDialog);
elements.newTopicForm?.addEventListener("submit", createNewTopicFromDialog);
elements.topicList?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest('[data-delete-topic]');
  if (deleteButton) {
    if (deleteButton.disabled) return;
    const menu = deleteButton.closest('details'); if (menu) menu.open = false;
    void deleteTopicFromMenu(deleteButton.dataset.deleteSession, deleteButton.dataset.deleteTopic);
    return;
  }
  const structuralButton = event.target.closest('[data-structural-topic]');
  if (structuralButton) {
    const { structuralSession, structuralTopic, structuralTransfer } = structuralButton.dataset;
    void openStructuralTopic(structuralSession, structuralTopic).then(opened => {
      if (opened && structuralTransfer) openTopicTransfer(structuralTopic, structuralTransfer);
    });
    return;
  }
  const transferButton = event.target.closest("[data-topic-transfer]");
  if (transferButton) {
    transferButton.closest("details").open = false;
    openTopicTransfer(transferButton.dataset.transferTopicId, transferButton.dataset.topicTransfer);
    return;
  }
  const copyButton = event.target.closest("[data-topic-copy-answers]");
  if (copyButton) {
    const menu = copyButton.closest('.er-topic-actions');
    if (menu) menu.open = false;
    void copyTopicAnswers(copyButton.dataset.topicCopyAnswers, copyButton.dataset.copySessionId || state.activeSessionId);
    return;
  }
  const button = event.target.closest("[data-topic-id]");
  if (button) void selectTopic(button.dataset.topicId);
});
document.getElementById("erTopicTransferForm")?.addEventListener("submit", submitTopicTransfer);
document.getElementById('btnStructuralView')?.addEventListener('click', toggleStructuralView);
elements.sessionList?.addEventListener('click', event => {
  const button = event.target.closest('[data-structural-group]');
  if (button) void selectStructuralGroup(button.dataset.structuralGroup);
});
document.getElementById("erTransferSearch")?.addEventListener("input", renderTopicTransferDestinations);
document.getElementById("erTopicTransferModal")?.addEventListener("hide.bs.modal", event => {
  if (topicTransferUi?.busy) event.preventDefault();
});
document.getElementById("erTopicTransferModal")?.addEventListener("hidden.bs.modal", () => {
  try { if (topicTransferUi?.result && topicTransferUi.journalKey) localStorage.removeItem(topicTransferUi.journalKey); } catch (_) { /* A completed journal can safely be replayed. */ }
  elements.topicList?.querySelector(`[data-topic-id="${CSS.escape(state.activeTopicId || "")}"]`)?.focus();
});
document.getElementById("erTransferOpenDestination")?.addEventListener("click", async () => {
  const result = topicTransferUi?.result;
  if (!result) return;
  window.bootstrap.Modal.getOrCreateInstance(document.getElementById("erTopicTransferModal")).hide();
  const session = state.sessions.find(item => item.id === result.destinationId);
  if (session) {
    await loadSessionIntoEditor(session);
    await selectTopic(result.topicId);
    setInspectorTab("topics");
  }
});
elements.btnExportar.addEventListener("click", exportPackage);
elements.btnShareEscapeRoom?.addEventListener("click", (event) => {
  event.stopPropagation();
  void toggleShareMenu();
});
elements.shareMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  const button = event.target.closest("[data-er-share-action]");
  if (button && !button.disabled) void handleShareMenuAction(button.dataset.erShareAction);
});
document.addEventListener("click", (event) => {
  if (state.shareMenuOpen && !event.target.closest(".er-share-menu-wrap")) closeShareMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.shareMenuOpen) {
    event.preventDefault();
    closeShareMenu({ restoreFocus: true });
  }
});
elements.btnCopyAllAnswers?.addEventListener("click", copyAllTopicAnswers);
elements.btnExportEditorialWorkbook?.addEventListener("click", exportEditorialWorkbook);
elements.btnSelectEditorialWorkbook?.addEventListener("click", () => elements.editorialWorkbookInput?.click());
elements.btnImportEditorialDrive?.addEventListener("click", loadEditorialWorkbookFromDrive);
elements.editorialDriveUrl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void loadEditorialWorkbookFromDrive();
});
elements.editorialWorkbookInput?.addEventListener("change", (event) => {
  const file = event.target.files?.[0] || null;
  event.target.value = "";
  if (file) void loadEditorialWorkbook(file);
});
elements.btnApplyEditorialWorkbook?.addEventListener("click", applyEditorialWorkbook);
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

function setObjectiveEnrichmentLoading(isLoading) {
  const loader = elements.objectiveEnrichmentLoader;
  const objectiveInput = document.getElementById("objetivoInput");
  const stage = objectiveInput?.closest(".er-objective-input-stage");
  if (loader) loader.hidden = true;
  if (isLoading) setStatus("Preparando el objetivo y las preguntas…", "info");
  stage?.classList.remove("is-enriching");
  if (objectiveInput) {
    objectiveInput.readOnly = Boolean(isLoading);
    objectiveInput.setAttribute("aria-busy", String(Boolean(isLoading)));
  }
}

function getObjectiveBriefLabels(locale = "es-419") {
  const language = normalizeGameLocale(locale).split("-")[0];
  const labels = {
    es: {
      title: "TÍTULO", purpose: "PROPÓSITO PEDAGÓGICO", experience: "META DE LA EXPERIENCIA", criteria: "CRITERIOS GLOBALES",
      room: "SALA", focus: "Enfoque", roomObjective: "Objetivo de aprendizaje", interaction: "Tipo de experiencia", requirements: "Requisitos fijos", anchors: "Anclas obligatorias", teaching: "Contenido que debe enseñarse",
      examples: "Ejemplos ampliados", opportunities: "Oportunidades de evaluación", fragment: "Fragmento fijo", roomFeedback: "Feedback al completar la sala",
      final: "DESBLOQUEO FINAL", code: "Código final", feedback: "Feedback final"
    },
    en: {
      title: "TITLE", purpose: "LEARNING PURPOSE", experience: "EXPERIENCE GOAL", criteria: "GLOBAL CRITERIA",
      room: "ROOM", focus: "Focus", roomObjective: "Learning objective", interaction: "Experience type", requirements: "Fixed requirements", anchors: "Required anchors", teaching: "Content to teach",
      examples: "Expanded examples", opportunities: "Assessment opportunities", fragment: "Fixed fragment", roomFeedback: "Room completion feedback",
      final: "FINAL UNLOCK", code: "Final code", feedback: "Final feedback"
    },
    fr: {
      title: "TITRE", purpose: "OBJECTIF PÉDAGOGIQUE", experience: "BUT DE L’EXPÉRIENCE", criteria: "CRITÈRES GLOBAUX",
      room: "SALLE", focus: "Axe", roomObjective: "Objectif d’apprentissage", interaction: "Type d’expérience", requirements: "Exigences fixes", anchors: "Éléments obligatoires", teaching: "Contenu à enseigner",
      examples: "Exemples enrichis", opportunities: "Possibilités d’évaluation", fragment: "Fragment fixe", roomFeedback: "Retour de fin de salle",
      final: "DÉVERROUILLAGE FINAL", code: "Code final", feedback: "Retour final"
    },
    pt: {
      title: "TÍTULO", purpose: "OBJETIVO PEDAGÓGICO", experience: "META DA EXPERIÊNCIA", criteria: "CRITÉRIOS GLOBAIS",
      room: "SALA", focus: "Foco", roomObjective: "Objetivo de aprendizagem", interaction: "Tipo de experiência", requirements: "Requisitos fixos", anchors: "Âncoras obrigatórias", teaching: "Conteúdo a ensinar",
      examples: "Exemplos ampliados", opportunities: "Oportunidades de avaliação", fragment: "Fragmento fixo", roomFeedback: "Feedback ao concluir a sala",
      final: "DESBLOQUEIO FINAL", code: "Código final", feedback: "Feedback final"
    }
  };
  return labels[language] || labels.es;
}

function normalizeObjectiveQuestionPlan(plan = {}, fallbackInteraction = "") {
  const interaction = normalizeString(plan?.interaction, fallbackInteraction).toLowerCase();
  const suppliedTarget = normalizeString(plan?.answer_target, "");
  const solutionPairs = normalizeQuestionPlanSolutionPairs({
    answer_target: suppliedTarget,
    solution_pairs: plan?.solution_pairs
  });
  const usesStructuredPairs = ["drag_drop", "relacion_columnas", "completar_espacio"].includes(interaction)
    && solutionPairs.length;
  const normalized = {
    ...(plan.interaction_data ? { interaction_data: experience.normalizeContract(plan.interaction_data, interaction) } : {}),
    plan_id: normalizeString(plan?.plan_id, ""),
    knowledge_id: normalizeString(plan?.knowledge_id, ""),
    assessment_case_id: normalizeString(plan?.assessment_case_id, ""),
    case_source: normalizeString(plan?.case_source, "").toLowerCase(),
    case_data: normalizeTextList(plan?.case_data || []),
    transfer_delta: normalizeString(plan?.transfer_delta, ""),
    reasoning_evidence: normalizeString(plan?.reasoning_evidence, ""),
    reasoning_steps: normalizeTextList(plan?.reasoning_steps || []),
    distractor_errors: normalizeTextList(plan?.distractor_errors || []),
    difficulty_policy_version: Math.max(0, Math.floor(Number(plan?.difficulty_policy_version) || 0)),
    integrates_knowledge_ids: normalizeTextList(plan?.integrates_knowledge_ids || []),
    evidence: normalizeString(plan?.evidence, ""),
    knowledge: normalizeString(plan?.knowledge, ""),
    teaching_example: normalizeString(plan?.teaching_example, ""),
    cognitive_operation: normalizeString(plan?.cognitive_operation, ""),
    pedagogical_role: normalizeString(plan?.pedagogical_role, "").toLowerCase(),
    answer_family: normalizeString(plan?.answer_family, ""),
    answer_signature: normalizeString(plan?.answer_signature, ""),
    answer_target: usesStructuredPairs ? formatQuestionPlanSolutionPairs(solutionPairs) : suppliedTarget,
    solution_pairs: usesStructuredPairs ? structuredClone(solutionPairs) : [],
    application: normalizeString(plan?.application, ""),
    instruction_outline: normalizeString(plan?.instruction_outline, ""),
    hint_strategy: normalizeString(plan?.hint_strategy, ""),
    feedback_strategy: normalizeString(plan?.feedback_strategy, ""),
    editorial_constraints: normalizeTextList(plan?.editorial_constraints || []),
    interaction,
    difficulty: normalizeString(plan?.difficulty, "").toLowerCase(),
    estimated_seconds: Math.max(0, Math.floor(Number(plan?.estimated_seconds) || 0)),
    narrative_effect: normalizeString(plan?.narrative_effect, ""),
    support_source: normalizeString(plan?.support_source, "").toLowerCase(),
    requires_image: plan?.requires_image === true || String(plan?.requires_image).toLowerCase() === "true",
    mechanic_contract: plan?.mechanic_contract && typeof plan.mechanic_contract === "object" && !Array.isArray(plan.mechanic_contract)
      ? structuredClone(plan.mechanic_contract)
      : { kind: "none" }
  };
  normalized.mechanic_contract = reconcileObjectiveMechanicContract(normalized);
  if (interaction === "verdadero_falso" && normalized.mechanic_contract.kind === "cipher_assertion"
    && typeof normalized.mechanic_contract.expected_boolean === "boolean") {
    normalized.answer_target = String(normalized.mechanic_contract.expected_boolean);
  }
  return normalized;
}

function materializeObjectivePlanCaseEvidence(plan = {}) {
  const result = structuredClone(plan || {});
  if (result.difficulty_policy_version >= 1) {
    result.case_data = normalizeTextList(result.case_data || []);
    return result;
  }
  const role = normalizeString(result.pedagogical_role, "").toLowerCase();
  if (role === "direct") return result;
  const minimumItems = role === "synthesis" ? 2 : 1;
  const caseData = normalizeTextList(result.case_data || []).map((datum, index) => (
    /[:=→]/u.test(datum) ? datum : `Case datum ${index + 1}: ${datum}`
  ));
  const fallbackValues = [result.transfer_delta, result.evidence, result.knowledge]
    .map((value) => normalizeString(value, ""))
    .filter((value) => value && !caseData.some((datum) => normalizeBaseText(datum).includes(normalizeBaseText(value))));
  while (caseData.length < minimumItems && fallbackValues.length) {
    const value = fallbackValues.shift();
    caseData.push(`Case datum ${caseData.length + 1}: ${value}`);
  }
  result.case_data = caseData;
  const application = normalizeString(result.application, "");
  const missingData = caseData.filter((datum) => !normalizeBaseText(application).includes(normalizeBaseText(datum)));
  result.application = missingData.length
    ? [application, `Case evidence: ${missingData.join(" | ")}`].filter(Boolean).join(" ")
    : application;
  return result;
}

function stableObjectiveSerialization(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableObjectiveSerialization(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableObjectiveSerialization(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function buildObjectiveGeneratedRoomFingerprint(room = {}, formData = {}, roomInteractionPlan = []) {
  return stableObjectiveFingerprint(stableObjectiveSerialization({
    contractVersion: OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION,
    presentationMode: normalizePresentationMode(formData.modoPresentacion),
    locale: normalizeString(formData.idioma, "es-419"),
    interactions: roomInteractionPlan,
    room: {
      room_number: Number(room?.room_number) || 0,
      title: normalizeString(room?.title, ""),
      learning_focus: normalizeString(room?.learning_focus, ""),
      room_objective: normalizeString(room?.room_objective, ""),
      fixed_code_fragment: normalizeString(room?.fixed_code_fragment, ""),
      room_completion_feedback: normalizeString(room?.room_completion_feedback, ""),
      narrative_beat: room?.narrative_beat || {},
      curriculum_inventory: room?.curriculum_inventory || {},
      question_plans: room?.question_plans || []
    }
  }));
}

function normalizeObjectiveGeneratedRoom(room = {}, roomIndex = 0) {
  const generated = room?.generated_room;
  if (!generated || typeof generated !== "object" || Array.isArray(generated)) return null;
  const meta = generated.meta && typeof generated.meta === "object" && !Array.isArray(generated.meta)
    ? generated.meta
    : {};
  if (!generated.mission || typeof generated.mission !== "object" || Array.isArray(generated.mission)) return null;
  const presentationMode = normalizePresentationMode(meta.presentationMode || PRESENTATION_MODE_ROOMS);
  const locale = normalizeString(meta.locale, "es-419");
  const mission = normalizeMission(generated.mission, roomIndex, presentationMode, locale);
  return {
    mission: structuredClone(mission),
    meta: {
      contractVersion: Math.floor(Number(meta.contractVersion) || 0),
      questionCount: Math.max(0, Math.floor(Number(meta.questionCount) || 0)),
      generatedAt: Math.max(0, Number(meta.generatedAt) || 0),
      interactions: Array.isArray(meta.interactions || meta.interactionPlan)
        ? (meta.interactions || meta.interactionPlan).map((interaction) => normalizeString(interaction, "").toLowerCase())
        : [],
      contractFingerprint: normalizeString(meta.contractFingerprint, ""),
      presentationMode,
      locale
    }
  };
}

function setObjectiveGeneratedRoom(blueprint = {}, missionIndex = 0, mission = {}, formData = {}, roomInteractionPlan = []) {
  const room = blueprint?.rooms?.[missionIndex];
  if (!room) return null;
  const normalizedInteractions = roomInteractionPlan.map((interaction) => normalizeString(interaction, "").toLowerCase());
  const generatedRoom = {
    mission: structuredClone(mission),
    meta: {
      contractVersion: OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION,
      questionCount: Number(mission?.preguntas?.length) || 0,
      generatedAt: Date.now(),
      interactions: normalizedInteractions,
      contractFingerprint: buildObjectiveGeneratedRoomFingerprint(room, formData, normalizedInteractions),
      presentationMode: normalizePresentationMode(formData.modoPresentacion),
      locale: normalizeString(formData.idioma, "es-419")
    }
  };
  room.generated_room = generatedRoom;
  if (blueprint.materialization_report && typeof blueprint.materialization_report === "object") {
    const failures = Array.isArray(blueprint.materialization_report.failures)
      ? blueprint.materialization_report.failures.filter((failure) => Number(failure?.roomIndex) !== missionIndex)
      : [];
    blueprint.materialization_report = {
      ...blueprint.materialization_report,
      contractVersion: OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION,
      completedRooms: (blueprint.rooms || []).filter((candidate) => candidate?.generated_room?.mission).length,
      totalRooms: (blueprint.rooms || []).length,
      failures
    };
  }
  return generatedRoom;
}

function getReusableObjectiveGeneratedMission(blueprint = {}, missionIndex = 0, formData = {}, roomInteractionPlan = []) {
  const room = blueprint?.rooms?.[missionIndex];
  if (!room) return null;
  const generated = normalizeObjectiveGeneratedRoom(room, missionIndex);
  if (!generated) return null;
  const expectedInteractions = roomInteractionPlan.map((interaction) => normalizeString(interaction, "").toLowerCase());
  const expectedQuestionCount = Math.max(1, Number(formData.preguntasPorSala) || expectedInteractions.length || 1);
  const actualQuestions = Array.isArray(generated.mission?.preguntas) ? generated.mission.preguntas : [];
  const declaredMeta = room?.generated_room?.meta || {};
  if ((generated.meta.questionCount && generated.meta.questionCount !== expectedQuestionCount)
    || actualQuestions.length !== expectedQuestionCount
    || (generated.meta.interactions.length && JSON.stringify(generated.meta.interactions) !== JSON.stringify(expectedInteractions))
    || (declaredMeta.presentationMode && generated.meta.presentationMode !== normalizePresentationMode(formData.modoPresentacion))
    || (declaredMeta.locale && generated.meta.locale !== normalizeString(formData.idioma, "es-419"))) {
    return null;
  }
  const questionPlans = Array.isArray(room.question_plans) ? room.question_plans : [];
  const reservePlan = room.reserve_opportunity || questionPlans.at(-1) || {};
  const migratedQuestions = actualQuestions.map((question, questionIndex) => {
    const interaction = expectedInteractions[questionIndex] || "texto";
    const plan = normalizeObjectiveQuestionPlan({ ...(questionPlans[questionIndex] || reservePlan), interaction }, interaction);
    const contracted = applyQuestionPlanAnswerContract(question, plan, interaction, formData.idioma);
    const candidate = normalizeQuestion({
      ...contracted,
      tipo_interaccion: interaction,
      interaction_contract_version: interaction === "completar_espacio" ? 2 : 1,
      _plan_id: plan.plan_id
    }, missionIndex, questionIndex, formData.idioma || "es-419");
    const issues = [
      ...questionInteractionIssues(candidate, { generated: true }),
      ...generatedQuestionPlanIssues(candidate, plan, interaction)
    ];
    return issues.length ? null : candidate;
  });
  if (migratedQuestions.some((question) => !question)) return null;
  const actualInteractions = migratedQuestions.map((question) => normalizeString(question?.tipo_interaccion, "").toLowerCase());
  if (JSON.stringify(actualInteractions) !== JSON.stringify(expectedInteractions)) return null;
  const mission = { ...structuredClone(generated.mission), preguntas: migratedQuestions };
  room.generated_room = {
    mission: structuredClone(mission),
    meta: {
      ...generated.meta,
      contractVersion: OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION,
      questionCount: expectedQuestionCount,
      interactions: expectedInteractions,
      contractFingerprint: buildObjectiveGeneratedRoomFingerprint(room, formData, expectedInteractions)
    }
  };
  return mission;
}

function normalizeObjectiveBrief(payload = {}) {
  return {
    ...(payload?.experience_config ? { experience_config: experience.config(payload.experience_config) } : {}),
    ...(payload?.reward_plan ? { reward_plan: structuredClone(payload.reward_plan) } : {}),
    materialization_report: payload?.materialization_report && typeof payload.materialization_report === "object"
      ? structuredClone(payload.materialization_report)
      : null,
    source_contract: payload?.source_contract && typeof payload.source_contract === "object"
      ? structuredClone(payload.source_contract)
      : null,
    source_repairs: Array.isArray(payload?.source_repairs) ? structuredClone(payload.source_repairs) : [],
    verified_mechanics: Array.isArray(payload?.verified_mechanics) ? structuredClone(payload.verified_mechanics) : [],
    verified_examples: Array.isArray(payload?.verified_examples) ? structuredClone(payload.verified_examples) : [],
    quality_report: payload?.quality_report && typeof payload.quality_report === "object"
      ? structuredClone(payload.quality_report)
      : null,
    plan_fingerprint: normalizeString(payload?.plan_fingerprint, ""),
    purpose: normalizeString(payload?.purpose, ""),
    experience_goal: normalizeString(payload?.experience_goal, ""),
    global_criteria: normalizeTextList(payload?.global_criteria || []),
    source_analysis: {
      fixed_constraints: normalizeTextList(payload?.source_analysis?.fixed_constraints || []),
      pedagogical_intent: normalizeTextList(payload?.source_analysis?.pedagogical_intent || []),
      reference_material: normalizeTextList(payload?.source_analysis?.reference_material || []),
      editorial_specifications: normalizeTextList(payload?.source_analysis?.editorial_specifications || []),
      repairable_contradictions: normalizeTextList(payload?.source_analysis?.repairable_contradictions || [])
    },
    curriculum_model: {
      essential_knowledge: normalizeTextList(payload?.curriculum_model?.essential_knowledge || []),
      transferable_skills: normalizeTextList(payload?.curriculum_model?.transferable_skills || []),
      prerequisites: normalizeTextList(payload?.curriculum_model?.prerequisites || []),
      likely_misconceptions: normalizeTextList(payload?.curriculum_model?.likely_misconceptions || [])
    },
    narrative_arc: {
      global_problem: normalizeString(payload?.narrative_arc?.global_problem, ""),
      stakes: normalizeString(payload?.narrative_arc?.stakes, ""),
      escalation: normalizeString(payload?.narrative_arc?.escalation, ""),
      finale: normalizeString(payload?.narrative_arc?.finale, "")
    },
    project_copy: {
      title: normalizeString(payload?.project_copy?.title, ""),
      subtitle: normalizeString(payload?.project_copy?.subtitle, ""),
      introduction: normalizeString(payload?.project_copy?.introduction, ""),
      instructions: normalizeString(payload?.project_copy?.instructions, ""),
      setting: normalizeString(payload?.project_copy?.setting, ""),
      visual_line: normalizeString(payload?.project_copy?.visual_line, "")
    },
    rooms: (Array.isArray(payload?.rooms) ? payload.rooms : []).map((room, index) => ({
      room_number: Number(room?.room_number),
      title: normalizeString(room?.title, ""),
      learning_focus: normalizeString(room?.learning_focus, ""),
      room_objective: normalizeString(room?.room_objective, ""),
      interaction_anchor: normalizeString(room?.interaction_anchor ?? room?.required_interaction, "").toLowerCase(),
      fixed_requirements: normalizeTextList(room?.fixed_requirements || []),
      mandatory_anchors: normalizeTextList(room?.mandatory_anchors || []),
      source_repairs: (Array.isArray(room?.source_repairs) ? room.source_repairs : []).map((repair) => ({
        issue: normalizeString(repair?.issue, ""),
        preserved_intent: normalizeString(repair?.preserved_intent, ""),
        repair_instruction: normalizeString(repair?.repair_instruction, "")
      })).filter((repair) => repair.issue || repair.preserved_intent || repair.repair_instruction),
      curriculum_inventory: {
        knowledge: normalizeTextList(room?.curriculum_inventory?.knowledge || room?.teaching_expansion || []),
        rules_or_procedures: normalizeTextList(room?.curriculum_inventory?.rules_or_procedures || []),
        skills: normalizeTextList(room?.curriculum_inventory?.skills || []),
        misconceptions: normalizeTextList(room?.curriculum_inventory?.misconceptions || []),
        teaching_examples: normalizeTextList(room?.curriculum_inventory?.teaching_examples || room?.expanded_examples || [])
      },
      narrative_beat: {
        incoming_state: normalizeString(room?.narrative_beat?.incoming_state, ""),
        room_role: normalizeString(room?.narrative_beat?.room_role, ""),
        obstacle: normalizeString(room?.narrative_beat?.obstacle, ""),
        stakes: normalizeString(room?.narrative_beat?.stakes, ""),
        success_change: normalizeString(room?.narrative_beat?.success_change, ""),
        next_state: normalizeString(room?.narrative_beat?.next_state, "")
      },
      question_plans: (Array.isArray(room?.question_plans) ? room.question_plans : [])
        .map((plan) => normalizeObjectiveQuestionPlan(plan)),
      reserve_opportunity: normalizeObjectiveQuestionPlan(room?.reserve_opportunity),
      fixed_code_fragment: normalizeString(room?.fixed_code_fragment, ""),
      room_completion_feedback: normalizeString(room?.room_completion_feedback, ""),
      generated_room: normalizeObjectiveGeneratedRoom(room, index)
    })),
    final_unlock: {
      code: normalizeString(payload?.final_unlock?.code, ""),
      feedback: normalizeString(payload?.final_unlock?.feedback, "")
    }
  };
}

function unwrapObjectiveBriefPayload(payload = {}) {
  const queue = Array.isArray(payload) ? [...payload] : [payload];
  const visited = new Set();
  const wrapperKeys = [
    "objective_blueprint", "objectiveBlueprint", "blueprint", "objective_brief",
    "objectiveBrief", "brief", "objective", "result", "data", "project"
  ];
  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) continue;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      queue.push(...candidate);
      continue;
    }
    if (Array.isArray(candidate.rooms)
      && (candidate.purpose || candidate.experience_goal || candidate.project_copy || candidate.final_unlock)) {
      return candidate;
    }
    wrapperKeys.forEach((key) => {
      const nested = candidate[key];
      if (nested && typeof nested === "object") queue.push(nested);
    });
  }
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function normalizeObjectiveCode(value = "") {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function objectiveFeedbackContainsFragment(feedback = "", fragment = "") {
  const expected = normalizeObjectiveCode(fragment);
  if (!expected) return true;
  return (String(feedback ?? "").toUpperCase().match(/[A-Z0-9]+/g) || []).includes(expected);
}

function objectiveFeedbackContainsNumericUnlock(feedback = "") {
  const source = String(feedback ?? "");
  const marker = "(?:clave|c[oó]digo|fragmento|code|key|chave)";
  return new RegExp(`${marker}[^\\r\\n]{0,48}\\d|\\d[^\\r\\n]{0,48}${marker}`, "iu").test(source);
}

function extractObjectiveCodesAfterMarkers(text = "", markerPattern, windowLength = 80, minimumLength = 1) {
  const source = String(text ?? "");
  const pattern = new RegExp(markerPattern.source, markerPattern.flags.includes("g") ? markerPattern.flags : `${markerPattern.flags}g`);
  return [...source.matchAll(pattern)].map((match) => {
    const windowText = source.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + windowLength);
    return (windowText.match(/\b[A-Z0-9]{1,12}\b/g) || [])
      .find((value) => value.length >= minimumLength) || "";
  }).filter(Boolean);
}

function extractObjectiveFinalCode(text = "") {
  const candidates = extractObjectiveCodesAfterMarkers(
    text,
    /(?:salida\s+final|c[oó]digo\s+final|final[_\s]+code|code\s+final|code\s+de\s+sortie|c[oó]digo\s+final)\s*:/iu,
    180,
    2
  );
  return normalizeObjectiveCode(candidates.at(-1) || "");
}

function extractObjectiveProjectTitle(text = "") {
  const source = String(text ?? "");
  const inlineMatch = source.match(/^\s*(?:t[ií]tulo(?:\s+del\s+tema)?|title(?:\s+of\s+the\s+topic)?|titre(?:\s+du\s+th[eè]me)?|t[ií]tulo(?:\s+do\s+tema)?)\s*:\s*(?:["“']([^"”'\r\n]+)["”']|([^\r\n]+))\s*$/imu);
  if (inlineMatch) return normalizeObjectiveFixedText(inlineMatch[1] || inlineMatch[2]);
  const headingMatch = source.match(/^\s*(?:T[IÍ]TULO|TITLE|TITRE)\s*\r?\n\s*([^\r\n]+)\s*$/mu);
  return normalizeObjectiveFixedText(headingMatch?.[1] || "");
}

function extractObjectiveCodeFragments(text = "") {
  return extractObjectiveCodesAfterMarkers(
    text,
    /(?:fragmento\s+(?:de\s+c[oó]digo|fijo)|code[_\s]+fragment|fixed[_\s]+(?:code[_\s]+)?fragment|fragment\s+(?:de\s+code|fixe)|fragmento\s+fixo)\s*:/iu,
    28,
    1
  ).map(normalizeObjectiveCode).filter(Boolean);
}

function extractObjectiveFinalFeedback(text = "") {
  const source = String(text ?? "");
  const match = source.match(/(?:feedback\s+final|final[_\s]+feedback|retour\s+final|feedback\s+final)\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/iu);
  return normalizeString(match?.[1] || match?.[2] || match?.[3], "").replace(/^[“”"']+|[“”"']+$/g, "").trim();
}

function extractObjectiveRoomCompletionFeedbacks(text = "", roomCount = 4) {
  const source = String(text ?? "");
  const results = Array(Math.max(1, Number(roomCount) || 1)).fill("");
  const roomMarkers = [...source.matchAll(/\b(?:sala|room|salle)\s+(\d+)\b/giu)];
  roomMarkers.forEach((match, markerIndex) => {
    const roomIndex = Number(match[1]) - 1;
    if (roomIndex < 0 || roomIndex >= results.length) return;
    const start = (match.index || 0) + match[0].length;
    const end = roomMarkers[markerIndex + 1]?.index ?? source.length;
    const block = source.slice(start, end);
    const feedbackMatch = block.match(/(?:feedback\s+correcto|feedback\s+al\s+completar\s+la\s+sala|correct\s+feedback|room[_\s]+completion[_\s]+feedback|retour\s+correct|retour\s+de\s+fin\s+de\s+salle|feedback\s+correto|feedback\s+ao\s+concluir\s+a\s+sala)\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/iu)
      || block.match(/\bfeedback\s*:\s*correct\s*=\s*(?:"([^"]+)"|'([^']+)'|([^|\r\n]+))/iu);
    results[roomIndex] = normalizeObjectiveFixedText(feedbackMatch?.[1] || feedbackMatch?.[2] || feedbackMatch?.[3] || "");
  });
  return results;
}

function normalizeObjectiveFixedText(value = "") {
  return normalizeString(value, "").replace(/^[“”"']+|[“”"']+$/g, "").replace(/\s+/g, " ").trim();
}

function stableObjectiveFingerprint(value = "") {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function getObjectiveConfigurationContract(data = {}) {
  const { reward_image, ...configuration } = experience.config(data.experience_config);
  return {
    experience_config: { ...configuration, reward_image_signature: reward_image ? Array.from(reward_image).reduce((h,c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) : null },
    contract_version: CONTENT_GENERATION_CONTRACT_VERSION,
    tema: normalizeString(data.tema, ""),
    tema_secundaria: normalizeString(data.temaSecundaria, ""),
    unidad: normalizeString(data.unidad, ""),
    estacion: normalizeString(data.estacion, ""),
    idioma: normalizeString(data.idioma, ""),
    nivel: normalizeString(data.nivel, ""),
    grado: normalizeString(data.grado, ""),
    trimestre: normalizeString(data.trimestre, ""),
    materia: normalizeString(data.materia, ""),
    narrativa: normalizeString(data.narrativa, ""),
    dificultad: normalizeString(data.dificultad, ""),
    ritmo: normalizeString(data.ritmo, ""),
    pistas: normalizeString(data.pistas, ""),
    publico: normalizeString(data.publico, ""),
    modo_presentacion: normalizePresentationMode(data.modoPresentacion),
    duracion: Number(data.duracion) || 0,
    estilo_imagen: normalizeString(data.estiloImagen, ""),
    salas: Number(data.misiones) || 0,
    preguntas_por_sala: Number(data.preguntasPorSala) || 0,
    modelo: normalizeString(data.contentModel || data.modeloObjetivo || data.modelo, TEXT_MODEL_DEFAULT)
  };
}

function collectDeterministicSourceRepairs(text = "", roomCount = 4) {
  return collectDeterministicObjectiveSourceRepairs(text, roomCount);
}

function isFormattedPigPenObjectivePlan(value = "") {
  return /^\s*\[PIGPEN_PLAN_V\d+\]/u.test(String(value ?? ""));
}

function recoverLegacyObjectiveSeed(value = "") {
  const source = normalizeString(value, "");
  if (!isFormattedPigPenObjectivePlan(source)) return source;
  const globalFields = new Set([
    "TITLE", "TÍTULO", "TITRE",
    "LEARNING PURPOSE", "PROPÓSITO PEDAGÓGICO", "OBJECTIF PÉDAGOGIQUE", "OBJETIVO PEDAGÓGICO",
    "EXPERIENCE GOAL", "META DE LA EXPERIENCIA", "OBJECTIF DE L’EXPÉRIENCE", "OBJECTIF DE L'EXPÉRIENCE", "META DA EXPERIÊNCIA"
  ]);
  const roomFields = new Set([
    "TITLE", "LEARNING_FOCUS", "LEARNING_OBJECTIVE", "INTERACTION_ANCHOR",
    "FIXED_REQUIREMENTS", "MANDATORY_ANCHORS", "FIXED_CODE_FRAGMENT", "ROOM_COMPLETION_FEEDBACK"
  ]);
  const finalFields = new Set(["FINAL_CODE", "FINAL_FEEDBACK"]);
  const recovered = [];
  let scope = "global";
  String(value ?? "").split(/\r?\n/u).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || /^\[PIGPEN_PLAN_V\d+\]$/u.test(line)) return;
    if (/^(?:ROOM|SALA|SALLE)\s+\d+$/iu.test(line)) {
      scope = "room";
      recovered.push("", line);
      return;
    }
    if (/^(?:QUESTION|PREGUNTA|QUESTÃO)\s+\d+$/iu.test(line)) {
      scope = "question";
      return;
    }
    if (/^(?:FINAL UNLOCK|DESBLOQUEO FINAL|DÉVERROUILLAGE FINAL|DESBLOQUEIO FINAL)$/iu.test(line)) {
      scope = "final";
      recovered.push("", line);
      return;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) return;
    const field = line.slice(0, separator).trim();
    if (/^SOURCE_REPAIR\s+\d+$/u.test(field)) return;
    if (scope === "question" && ["FIXED_CODE_FRAGMENT", "ROOM_COMPLETION_FEEDBACK"].includes(field)) {
      scope = "room";
    }
    if (scope === "question") return;
    const allowed = scope === "global"
      ? globalFields
      : scope === "room"
        ? roomFields
        : finalFields;
    if (allowed.has(field)) recovered.push(line);
  });
  const seed = recovered.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
  return seed || source;
}

function buildObjectiveSourceContract(context = {}, { editedPlanText = "" } = {}) {
  const rawOriginalObjective = normalizeString(
    context.sourceContract?.original_objective ?? context.objetivo,
    ""
  );
  const recoveredLegacyPlan = !context.sourceContract && isFormattedPigPenObjectivePlan(rawOriginalObjective);
  const originalObjective = recoveredLegacyPlan
    ? recoverLegacyObjectiveSeed(rawOriginalObjective)
    : rawOriginalObjective;
  const normalizedEditedPlan = normalizeString(editedPlanText, "");
  const constraintText = normalizedEditedPlan || originalObjective;
  const configuration = getObjectiveConfigurationContract(context);
  const roomCount = Math.max(1, Math.min(8, Number(context.misiones) || 4));
  const extractedFinalCode = extractObjectiveFinalCode(constraintText) || extractObjectiveFinalCode(originalObjective);
  const extractedFragments = extractObjectiveCodeFragments(constraintText).length
    ? extractObjectiveCodeFragments(constraintText)
    : extractObjectiveCodeFragments(originalObjective);
  const { fixedFinalCode, fixedCodeFragments, rejectedInvalidUnlock } = resolveFixedThematicUnlock({
    finalCode: extractedFinalCode,
    fragments: extractedFragments,
    roomCount
  });
  const extractedRoomFeedback = extractObjectiveRoomCompletionFeedbacks(constraintText, roomCount).some(Boolean)
    ? extractObjectiveRoomCompletionFeedbacks(constraintText, roomCount)
    : extractObjectiveRoomCompletionFeedbacks(originalObjective, roomCount);
  const extractedFinalFeedback = extractObjectiveFinalFeedback(constraintText) || extractObjectiveFinalFeedback(originalObjective);
  return {
    contract_version: CONTENT_GENERATION_CONTRACT_VERSION,
    recovered_legacy_plan: recoveredLegacyPlan,
    original_objective: originalObjective,
    original_objective_hash: stableObjectiveFingerprint(originalObjective),
    edited_plan_text: normalizedEditedPlan,
    constraint_text_hash: stableObjectiveFingerprint(constraintText),
    applied_plan_text: "",
    configuration,
    configuration_fingerprint: stableObjectiveFingerprint(JSON.stringify(configuration)),
    explicit_title: extractObjectiveProjectTitle(constraintText) || extractObjectiveProjectTitle(originalObjective),
    fixed_final_code: fixedFinalCode,
    fixed_code_fragments: fixedCodeFragments,
    rejected_invalid_unlock: rejectedInvalidUnlock,
    fixed_final_feedback: rejectedInvalidUnlock ? "" : extractedFinalFeedback,
    fixed_room_feedback: rejectedInvalidUnlock ? Array(roomCount).fill("") : extractedRoomFeedback,
    fixed_interactions: extractObjectiveInteractionRequirements(constraintText, context.misiones).some(Boolean)
      ? extractObjectiveInteractionRequirements(constraintText, context.misiones)
      : extractObjectiveInteractionRequirements(originalObjective, context.misiones),
    deterministic_repairs: collectDeterministicSourceRepairs(originalObjective, context.misiones)
  };
}

function buildVerifiedMechanics(brief = {}) {
  return (Array.isArray(brief.rooms) ? brief.rooms : []).flatMap((room, roomIndex) => (
    [
      ...(Array.isArray(room.question_plans) ? room.question_plans : []).map((plan, questionIndex) => ({ plan, questionIndex, reserve: false })),
      ...(room.reserve_opportunity ? [{ plan: room.reserve_opportunity, questionIndex: null, reserve: true }] : [])
    ].map(({ plan, questionIndex, reserve }) => {
      const contract = plan?.mechanic_contract || { kind: "none" };
      return {
        room_number: roomIndex + 1,
        question_number: questionIndex === null ? null : questionIndex + 1,
        reserve,
        plan_id: normalizeString(plan?.plan_id, ""),
        kind: normalizeString(contract.kind, "none"),
        solution: normalizeString(contract.solution, ""),
        generated_value: normalizeString(contract.ciphertext || contract.scrambled, ""),
        computed_value: normalizeString(contract.computed_value, ""),
        claimed_value: normalizeString(contract.claimed_value, ""),
        expected_boolean: typeof contract.expected_boolean === "boolean" ? contract.expected_boolean : null,
        ordered_items: normalizeTextList(contract.ordered_items || []),
        verified: contract.kind === "none" || Boolean(
          (contract.kind === "cipher" && contract.solution && contract.ciphertext && contract.shift)
          || (contract.kind === "cipher_assertion" && contract.ciphertext && contract.computed_value
            && contract.claimed_value && typeof contract.expected_boolean === "boolean" && contract.shift)
          || (contract.kind === "anagram" && contract.solution && contract.scrambled)
          || (contract.kind === "sequence" && contract.ordering_rule && contract.ordered_items?.length > 1)
        )
      };
    })
  ));
}

function attachObjectiveCompilationMetadata(brief = {}, context = {}, sourceContract = null) {
  const contract = structuredClone(sourceContract || buildObjectiveSourceContract(context));
  const result = structuredClone(brief);
  const deterministicRepairs = Array.isArray(contract.deterministic_repairs) ? contract.deterministic_repairs : [];
  result.rooms = (result.rooms || []).map((room) => ({
    ...room,
    // Los diagnósticos de anagramas sólo son autoritativos cuando proceden del
    // verificador determinista. El modelo no puede heredarlos ni inventarlos.
    source_repairs: (room.source_repairs || []).filter((repair) => !/(?:anagram|anagrama|same\s+letters?|mismas\s+letras|multiconjunto\s+de\s+letras)/iu.test([
      repair?.issue,
      repair?.preserved_intent,
      repair?.repair_instruction
    ].join(" ")))
  }));
  deterministicRepairs.forEach((repair) => {
    const room = result.rooms?.[repair.room_index];
    if (!room) return;
    const alreadyRecorded = room.source_repairs?.some((item) => normalizeObjectiveFixedText(item.issue) === normalizeObjectiveFixedText(repair.issue));
    if (!alreadyRecorded) room.source_repairs = [...(room.source_repairs || []), {
      issue: repair.issue,
      preserved_intent: repair.preserved_intent,
      repair_instruction: repair.repair_instruction
    }];
  });
  result.source_contract = contract;
  result.source_repairs = result.rooms.flatMap((room, roomIndex) => (
    (room.source_repairs || []).map((repair) => ({ room_number: roomIndex + 1, ...repair }))
  ));
  result.verified_mechanics = buildVerifiedMechanics(result);
  result.verified_examples = result.verified_mechanics.filter((item) => item.kind !== "none").map((item) => ({
    room_number: item.room_number,
    question_number: item.question_number,
    kind: item.kind,
    prompt_value: item.generated_value || item.ordered_items.join(" → "),
      solution: item.kind === "cipher_assertion"
        ? String(item.expected_boolean)
        : (item.solution || item.ordered_items.join(" → ")),
    verified: item.verified
  }));
  result.quality_report = {
    status: "plan_created",
    structural: true,
    deterministic: result.verified_mechanics.every((item) => item.verified),
    publication: false,
    issues: []
  };
  const fingerprintPayload = {
    configuration_fingerprint: contract.configuration_fingerprint,
    original_objective_hash: contract.original_objective_hash,
    rooms: result.rooms,
    final_unlock: result.final_unlock
  };
  result.plan_fingerprint = stableObjectiveFingerprint(JSON.stringify(fingerprintPayload));
  return result;
}

function formatObjectiveBrief(brief = {}, locale = "es-419") {
  const labels = getObjectiveBriefLabels(locale);
  const lines = [
    `[PIGPEN_PLAN_V${CONTENT_GENERATION_CONTRACT_VERSION}]`,
    `${labels.title}: ${brief.project_copy.title}`,
    `SUBTITLE: ${brief.project_copy.subtitle}`,
    "",
    `${labels.purpose}: ${brief.purpose}`,
    `${labels.experience}: ${brief.experience_goal}`,
    `INTRODUCTION: ${brief.project_copy.introduction}`,
    `INSTRUCTIONS: ${brief.project_copy.instructions}`,
    `SETTING: ${brief.project_copy.setting}`,
    `VISUAL_LINE: ${brief.project_copy.visual_line}`,
    "",
    `${labels.criteria}:`
  ];
  brief.global_criteria.forEach((item) => lines.push(`- ${item}`));
  lines.push(
    "",
    "NARRATIVE_ARC:",
    `GLOBAL_PROBLEM: ${brief.narrative_arc.global_problem}`,
    `STAKES: ${brief.narrative_arc.stakes}`,
    `ESCALATION: ${brief.narrative_arc.escalation}`,
    `FINALE: ${brief.narrative_arc.finale}`
  );
  brief.rooms.forEach((room, index) => {
    lines.push(
      "",
      `${labels.room} ${index + 1}`,
      `TITLE: ${room.title}`,
      `LEARNING_FOCUS: ${room.learning_focus}`,
      `LEARNING_OBJECTIVE: ${room.room_objective}`,
      ...(room.generated_room?.mission ? [`BRIEFING_CONTEXT: ${JSON.stringify(room.generated_room.mission.contexto || '')}`] : []),
      `EVIDENCE_EXPECTED: ${room.question_plans.map((plan) => plan.evidence).join(" | ")}`,
      `INTERACTION_ANCHOR: ${room.interaction_anchor || "AUTO"}`,
      `FIXED_REQUIREMENTS: ${(room.fixed_requirements || []).join(" | ") || "NONE"}`,
      `MANDATORY_ANCHORS: ${(room.mandatory_anchors || []).join(" | ")}`,
      `KNOWLEDGE_TO_TEACH: ${(room.curriculum_inventory?.knowledge || []).join(" | ")}`,
      `RULES_OR_PROCEDURES: ${(room.curriculum_inventory?.rules_or_procedures || []).join(" | ")}`,
      `TEACHING_EXAMPLES: ${(room.curriculum_inventory?.teaching_examples || []).join(" | ")}`,
      `NARRATIVE_INCOMING_STATE: ${room.narrative_beat.incoming_state}`,
      `NARRATIVE_ROLE: ${room.narrative_beat.room_role}`,
      `NARRATIVE_OBSTACLE: ${room.narrative_beat.obstacle}`,
      `NARRATIVE_STAKES: ${room.narrative_beat.stakes}`,
      `NARRATIVE_SUCCESS_CHANGE: ${room.narrative_beat.success_change}`,
      `NARRATIVE_NEXT_STATE: ${room.narrative_beat.next_state}`
    );
    (room.source_repairs || []).forEach((repair, repairIndex) => lines.push(
      `SOURCE_REPAIR ${repairIndex + 1}: ${repair.issue} | PRESERVED_INTENT: ${repair.preserved_intent} | REPAIR: ${repair.repair_instruction}`
    ));
    room.question_plans.forEach((plan, questionIndex) => {
      const mechanic = plan.mechanic_contract || { kind: "none" };
      const mechanicValue = mechanic.kind === "cipher"
        ? `solution=${mechanic.solution}; shift=${mechanic.shift}; ciphertext=${mechanic.ciphertext}`
        : mechanic.kind === "cipher_assertion"
          ? `computed_value=${mechanic.computed_value}; claimed_value=${mechanic.claimed_value}; expected_boolean=${mechanic.expected_boolean}; shift=${mechanic.shift}; ciphertext=${mechanic.ciphertext}`
        : mechanic.kind === "anagram"
          ? `solution=${mechanic.solution}; scrambled=${mechanic.scrambled}`
          : mechanic.kind === "sequence"
            ? `rule=${mechanic.ordering_rule}; order=${(mechanic.ordered_items || []).join(" → ")}`
            : "none";
      lines.push(
        "",
        `QUESTION ${questionIndex + 1}`,
        `PLAN_ID: ${plan.plan_id}`,
        `KNOWLEDGE_ID: ${plan.knowledge_id}`,
        `ASSESSMENT_CASE_ID: ${plan.assessment_case_id}`,
        `CASE_SOURCE: ${plan.case_source}`,
        `CASE_DATA: ${(plan.case_data || []).join(" | ")}`,
        `TRANSFER_DELTA: ${plan.transfer_delta}`,
        `REASONING_EVIDENCE: ${plan.reasoning_evidence}`,
        `REASONING_STEPS: ${JSON.stringify(plan.reasoning_steps || [])}`,
        `DISTRACTOR_ERRORS: ${JSON.stringify(plan.distractor_errors || [])}`,
        `DIFFICULTY_POLICY_VERSION: ${plan.difficulty_policy_version || 0}`,
        `INTEGRATES_KNOWLEDGE_IDS: ${(plan.integrates_knowledge_ids || []).join(" | ")}`,
        `INTERACTION: ${plan.interaction}`,
        `PEDAGOGICAL_ROLE: ${plan.pedagogical_role}`,
        `DIFFICULTY: ${plan.difficulty}`,
        `KNOWLEDGE: ${plan.knowledge}`,
        `VISIBLE_TEACHING_EXAMPLE: ${plan.teaching_example || ""}`,
        `VISIBLE_CASE_DATA: ${(plan.case_data || []).join(" | ")}`,
        `EVIDENCE: ${plan.evidence}`,
        `COGNITIVE_OPERATION: ${plan.cognitive_operation}`,
        `APPLICATION: ${plan.application}`,
        `INSTRUCTION_OUTLINE: ${plan.instruction_outline}`,
        `ANSWER_FAMILY: ${plan.answer_family}`,
        `ANSWER_SIGNATURE: ${plan.answer_signature}`,
        `ANSWER_TARGET: ${plan.answer_target}`,
        `HINT_STRATEGY: ${plan.hint_strategy}`,
        `FEEDBACK_STRATEGY: ${plan.feedback_strategy}`,
        `EDITORIAL_CONSTRAINTS: ${(plan.editorial_constraints || []).join(" | ")}`,
        `SUPPORT_SOURCE: ${plan.support_source}`,
        `ESTIMATED_SECONDS: ${plan.estimated_seconds}`,
        `NARRATIVE_EFFECT: ${plan.narrative_effect}`,
        `VERIFIED_MECHANIC: ${mechanic.kind} | ${mechanicValue}`
      );
    });
    lines.push(
      "",
      `FIXED_CODE_FRAGMENT: ${room.fixed_code_fragment}`,
      `ROOM_COMPLETION_FEEDBACK: ${room.room_completion_feedback}`
    );
  });
  lines.push(
    "",
    labels.final,
    ...(brief.experience_config ? [`EXPERIENCE_CONFIG: ${JSON.stringify(brief.experience_config, (key,value) => key === 'reward_image' ? undefined : value)}`, `REWARD_PLAN: ${JSON.stringify(brief.reward_plan || {}, (key,value) => key === 'image' ? undefined : value)}`] : []),
    `FINAL_CODE: ${brief.final_unlock.code}`,
    `FINAL_FEEDBACK: ${brief.final_unlock.feedback}`
  );
  return lines.join("\n").trim();
}

function inferObjectiveInteractionType(text = "") {
  const value = String(text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(?:arrastr\w*|drag(?:ging)?|drag[_ -]?and[_ -]?drop)\b/.test(value)) return "drag_drop";
  if (/\b(?:logic\s+grid|cuadricula\s+logica|grille\s+logique|grade\s+logica|ordenar|order(?:ing)?|sequence|secuencia)\b/.test(value)) return "ordenar_secuencia";
  if (/\b(?:matching|match\s+each|emparejar|relacionar|relacion\s+de\s+columnas|association)\b/.test(value)) return "relacion_columnas";
  if (/\b(?:multiple\s+choice|opcion\s+multiple|choix\s+multiple|multipla\s+escolha)\b/.test(value)) return "opcion_multiple";
  if (/\b(?:true\s*(?:or|\/)\s*false|verdadero\s*(?:o|\/)\s*falso|vrai\s*(?:ou|\/)\s*faux|verdadeiro\s*(?:ou|\/)\s*falso)\b/.test(value)) return "verdadero_falso";
  if (/\b(?:fill\s+in\s+the\s+blank|completar\s+(?:el\s+)?espacio|texte\s+a\s+trous|preencher\s+(?:a\s+)?lacuna)\b/.test(value)) return "completar_espacio";
  if (/\bmultimedia\b/.test(value)) return "multimedia";
  if (/\b(?:written\s+response|short\s+answer|respuesta\s+(?:escrita|corta)|reponse\s+(?:ecrite|courte)|resposta\s+(?:escrita|curta))\b/.test(value)) return "texto";
  return "";
}

function extractObjectiveInteractionRequirements(objective = "", roomCount = 4) {
  const safeRoomCount = Math.max(1, Math.min(8, Number(roomCount) || 4));
  const source = String(objective ?? "");
  const requirements = Array(safeRoomCount).fill("");
  const canonicalPattern = /(?:interacci[oó]n\s+obligatoria|required\s+interaction|interaction[_\s]+anchor|interaction\s+requise|intera[cç][aã]o\s+obrigat[oó]ria)\s*:\s*([a-z_]+)/giu;
  [...source.matchAll(canonicalPattern)].slice(0, safeRoomCount).forEach((match, index) => {
    const candidate = normalizeString(match[1], "").toLowerCase();
    if (ESCAPE_ROOM_INTERACTION_CATALOG.includes(candidate)) requirements[index] = candidate;
  });
  const roomMarkers = [...source.matchAll(/\b(?:sala|room|salle)\s+(\d+)\b/giu)];
  roomMarkers.forEach((match, markerIndex) => {
    const roomIndex = Number(match[1]) - 1;
    if (roomIndex < 0 || roomIndex >= safeRoomCount || requirements[roomIndex]) return;
    const start = (match.index || 0) + match[0].length;
    const end = roomMarkers[markerIndex + 1]?.index ?? source.length;
    const block = source.slice(start, end);
    const explicitType = block.match(/(?:tipo\s+de\s+actividad|tipo\s+de\s+interacci[oó]n|activity\s+type|interaction\s+type|experience\s+type|type\s+d['’]activit[eé]|tipo\s+de\s+atividade)\s*:\s*([^\r\n]+)/iu)?.[1]
      || block.match(/\bH5P\s+([^\r\n.]+)/iu)?.[1]
      || "";
    requirements[roomIndex] = inferObjectiveInteractionType(explicitType);
  });
  return requirements;
}

function applyObjectiveBlueprintInteractionRequirements(plan = [], blueprint = null, { preferQuestionPlans = true } = {}) {
  return plan.map((types, roomIndex) => {
    const roomBlueprint = blueprint?.rooms?.[roomIndex] || {};
    const roomPlan = Array.isArray(types) ? [...types] : [];
    if (preferQuestionPlans && Array.isArray(roomBlueprint.question_plans)) {
      roomBlueprint.question_plans.slice(0, roomPlan.length).forEach((questionPlan, questionIndex) => {
        if (ESCAPE_ROOM_INTERACTION_CATALOG.includes(questionPlan?.interaction)) {
          roomPlan[questionIndex] = questionPlan.interaction;
        }
      });
    }
    const requiredType = normalizeString(roomBlueprint.interaction_anchor ?? roomBlueprint.required_interaction, "");
    if (!requiredType || !roomPlan.length || !ESCAPE_ROOM_INTERACTION_CATALOG.includes(requiredType)) return roomPlan;
    const existingIndex = roomPlan.indexOf(requiredType);
    if (existingIndex < 0) {
      roomPlan[0] = requiredType;
    }
    return roomPlan;
  });
}

function buildInteractionPlanFromObjectiveBlueprint(blueprint = {}, roomCount = 0, questionsPerRoom = 0) {
  const rooms = Array.isArray(blueprint?.rooms) ? blueprint.rooms : [];
  const expectedRooms = Math.max(0, Number(roomCount) || rooms.length);
  const expectedQuestions = Math.max(0, Number(questionsPerRoom) || 0);
  return Array.from({ length: expectedRooms }, (_, roomIndex) => {
    const questionPlans = Array.isArray(rooms[roomIndex]?.question_plans) ? rooms[roomIndex].question_plans : [];
    if (questionPlans.length !== expectedQuestions) {
      throw new Error(`El plan de la sala ${roomIndex + 1} no contiene exactamente ${expectedQuestions} interacciones.`);
    }
    const interactions = questionPlans.map((plan) => normalizeString(plan?.interaction, "").toLowerCase());
    if (interactions.some((interaction) => !ESCAPE_ROOM_INTERACTION_CATALOG.includes(interaction))) {
      throw new Error(`El plan de la sala ${roomIndex + 1} contiene una interacción fuera del catálogo.`);
    }
    return interactions;
  });
}

function validateObjectiveBlueprintForGeneration(formData = {}, blueprint = {}) {
  const issues = [];
  const expectedRooms = Math.max(1, Math.min(8, Number(formData.misiones) || 4));
  const expectedQuestions = Math.max(1, Math.floor(Number(formData.preguntasPorSala) || 4));
  const allowedTypes = experience.config(formData.experience_config).question_types;
  if (!allowedTypes.length) issues.push("Selecciona al menos un tipo de pregunta.");
  if ((blueprint.rooms || []).some(room => (room.question_plans || []).some(q => !allowedTypes.includes(q.interaction)))) issues.push("El plan contiene tipos no permitidos; vuelve a crear el objetivo.");
  const rooms = Array.isArray(blueprint?.rooms) ? blueprint.rooms : [];
  const objectiveText = normalizeString(formData.objetivo, "");
  const visibleVersion = Number(objectiveText.match(/^\s*\[PIGPEN_PLAN_V(\d+)\]/u)?.[1] || 0);
  const visibleRoomCount = (objectiveText.match(/^\s*(?:ROOM|SALA|SALLE)\s+\d+\s*$/gimu) || []).length;
  const visibleQuestionCount = (objectiveText.match(/^\s*(?:QUESTION|PREGUNTA|QUESTÃO)\s+\d+\s*$/gimu) || []).length;
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) {
    return ["El objetivo no contiene un blueprint estructurado."];
  }
  if (!visibleVersion || visibleVersion > CONTENT_GENERATION_CONTRACT_VERSION) {
    issues.push("El texto del objetivo no usa una plantilla compatible.");
  }
  if (visibleRoomCount !== expectedRooms || visibleQuestionCount !== expectedRooms * expectedQuestions) {
    issues.push("El texto visible del objetivo no contiene todas las salas y preguntas de la plantilla.");
  }
  if (!normalizeString(blueprint.plan_fingerprint, "")) {
    issues.push("Falta la firma de validación del objetivo.");
  }
  if (Number(blueprint?.source_contract?.contract_version) !== CONTENT_GENERATION_CONTRACT_VERSION) {
    issues.push("El objetivo usa una versión anterior de la plantilla.");
  }
  if (!normalizeString(blueprint?.project_copy?.title, "")) {
    issues.push("Falta el título del escape room.");
  }
  if (rooms.length !== expectedRooms) {
    issues.push(`El objetivo contiene ${rooms.length} salas y se requieren ${expectedRooms}.`);
  }
  rooms.slice(0, expectedRooms).forEach((room, roomIndex) => {
    const roomLabel = `Sala ${roomIndex + 1}`;
    const plans = Array.isArray(room?.question_plans) ? room.question_plans : [];
    if (!normalizeString(room?.title, "")
      || !normalizeString(room?.learning_focus, "")
      || !normalizeString(room?.room_objective, "")) {
      issues.push(`${roomLabel} no contiene título, enfoque y objetivo completos.`);
    }
    if (plans.length !== expectedQuestions) {
      issues.push(`${roomLabel} contiene ${plans.length} preguntas y se requieren ${expectedQuestions}.`);
      return;
    }
    plans.forEach((plan, questionIndex) => {
      const interaction = normalizeString(plan?.interaction, "").toLowerCase();
      if (!normalizeString(plan?.plan_id, "")
        || !ESCAPE_ROOM_INTERACTION_CATALOG.includes(interaction)
        || !normalizeString(plan?.application, "")
        || !normalizeString(plan?.answer_target, "")) {
        issues.push(`${roomLabel}, pregunta ${questionIndex + 1}, no cumple la plantilla fija de contenido.`);
      }
    });
  });
  try {
    buildInteractionPlanFromObjectiveBlueprint(blueprint, expectedRooms, expectedQuestions);
  } catch (error) {
    issues.push(normalizeString(error?.message, "El plan de interacciones no es válido."));
  }
  try {
    assertThematicObjectiveUnlockContract(formData, blueprint);
  } catch (error) {
    issues.push(normalizeString(error?.message, "La clave final del objetivo no es válida."));
  }
  return [...new Set(issues)];
}

async function prepareObjectiveBlueprintForGeneration(formData = {}) {
  updatePreviewGenerationProgress({
    title: "Analizando el objetivo final",
    detail: "Verificando plantilla, salas, preguntas, interacciones y clave antes de crear imágenes"
  });

  const wasCurrent = isObjectiveBlueprintCurrent(formData);
  let blueprint = structuredClone(
    wasCurrent ? state.objectiveBlueprint : await ensureObjectiveBlueprint(formData)
  );

  // Cuando el preflight tuvo que compilar un objetivo ausente o desactualizado,
  // materializa también su representación visible para que el textarea y el
  // blueprint vuelvan a describir exactamente el mismo plan.
  if (!wasCurrent) {
    const correctedText = formatObjectiveBrief(blueprint, formData.idioma);
    blueprint = activateObjectiveBrief(blueprint, correctedText, {
      editedPlanText: blueprint?.source_contract?.edited_plan_text || ""
    });
    formData.objetivo = correctedText;
  }

  let issues = validateObjectiveBlueprintForGeneration(formData, blueprint);
  if (!issues.length) return structuredClone(blueprint);

  updatePreviewGenerationProgress({
    title: "Corrigiendo el objetivo final",
    detail: "La estructura no superó la revisión; PigPen la reconstruirá antes de continuar"
  });
  setStatus(`El objetivo necesita corrección: ${issues[0]} PigPen lo está reconstruyendo…`, "warning");

  const sourceContract = blueprint?.source_contract || buildObjectiveSourceContract(formData);
  const repaired = await generateEnrichedObjectiveBrief({
    ...formData,
    sourceContract,
    editedPlanText: sourceContract.edited_plan_text || "",
    preservedProjectTitle: normalizeString(blueprint?.project_copy?.title, "")
  });
  const correctedText = formatObjectiveBrief(repaired, formData.idioma);
  blueprint = activateObjectiveBrief(repaired, correctedText, {
    editedPlanText: sourceContract.edited_plan_text || ""
  });
  formData.objetivo = correctedText;
  issues = validateObjectiveBlueprintForGeneration(formData, blueprint);
  if (issues.length) {
    const error = new Error(`El objetivo final todavía no cumple la plantilla: ${issues.slice(0, 3).join(" · ")}`);
    error.code = "OBJECTIVE_BLUEPRINT_INVALID";
    error.validationIssues = issues;
    throw error;
  }
  setStatus("Objetivo final corregido y validado. Preparando el escape room…", "success");
  return structuredClone(blueprint);
}

async function requestThematicObjectiveUnlockWord(context = {}, foundation = {}, roomCount = 4, rejectedCode = "") {
  const contentModel = context.contentModel || context.modeloObjetivo || context.modelo || TEXT_MODEL_DEFAULT;
  context = { ...context, contentModel, modeloObjetivo: contentModel, modelo: contentModel };
  const minimumLength = Math.max(3, Number(roomCount) || 4);
  const rejectedCandidates = [normalizeString(rejectedCode, "")].filter(Boolean);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = await requestQualityJson([
      "<OBJECTIVE>Corrige exclusivamente la palabra de desbloqueo final del Escape Room.</OBJECTIVE>",
      `<LANGUAGE>${resolvePromptLanguageDirective(context.idioma).directive}</LANGUAGE>`,
      `<ACADEMIC_TOPIC>${JSON.stringify({
        tema: context.temaPrincipal || context.tema,
        materia: context.materia,
        nivel: context.nivel,
        grado: context.grado,
        curriculum: foundation.curriculum_model,
        room_focus: (foundation.rooms || []).map((room) => room.learning_focus)
      })}</ACADEMIC_TOPIC>`,
      `<REJECTED_CODES>${JSON.stringify(rejectedCandidates)}</REJECTED_CODES>`,
      `<RULES>Devuelve una palabra nueva, distinta de REJECTED_CODES, temática, natural y reconocible, relacionada directamente con ACADEMIC_TOPIC. Usa únicamente letras A-Z en mayúsculas: ningún número, espacio, guion, símbolo ni sigla inventada. La palabra debe tener entre ${minimumLength} y 12 letras. Prioriza exactamente ${roomCount} letras para entregar una letra por sala; si no existe una palabra natural de esa longitud, conserva una palabra temática completa más larga. No uses CLAVE, CODIGO ni ESCAPE salvo que sean el tema curricular.</RULES>`,
      '<OUTPUT_FORMAT>{"code":"PALABRA"}</OUTPUT_FORMAT>',
    "Multimedia requiere cuatro opciones y un recurso necesario para elegir la solución. Completar espacio requiere una lectura con marcadores literales ___ sin numerarlos y fichas arrastrables: answer_target enumera '1 → respuesta breve | 2 → respuesta breve' en orden de huecos. El número de marcadores ___ debe coincidir exactamente con el número de soluciones; cada solución puede ser una palabra o expresión curricular breve. No pide escribir ni repite la lectura en reto.",
    "Devuelve únicamente JSON."
    ].join("\n"), context, 0.18 + (attempt * 0.06), {
      responseJsonSchema: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"]
      }
    });
    const rawCandidate = normalizeString(payload?.code, "");
    const candidate = normalizeThematicFinalWord(rawCandidate, roomCount);
    if (candidate && !rejectedCandidates.includes(candidate)) return candidate;
    if (rawCandidate) rejectedCandidates.push(rawCandidate);
  }
  throw new Error(`Gemini no pudo crear una palabra temática válida de ${minimumLength} a 12 letras después de tres intentos.`);
}

function buildDeterministicQuestionPlanTemplate(context = {}, sourceContract = null) {
  const roomCount = Math.max(1, Math.min(8, Number(context.misiones) || 4));
  const questionCount = Math.max(1, Math.floor(Number(context.preguntasPorSala) || 4));
  const allowedTypes = experience.config(context.experience_config).question_types;
  const interactionPlan = buildInteractionPlan(roomCount, questionCount, `${context.tema}|${context.grado}|${questionCount}`, allowedTypes);
  const fixedInteractions = Array.isArray(sourceContract?.fixed_interactions) ? sourceContract.fixed_interactions : [];
  const roleFor = (questionIndex) => {
    return getQuestionDifficulty(context, questionIndex, questionCount).pedagogical_role;
  };
  return Array.from({ length: roomCount }, (_, roomIndex) => {
    const interactions = [...interactionPlan[roomIndex]];
    const anchor = allowedTypes.includes(fixedInteractions[roomIndex]) ? fixedInteractions[roomIndex] : "";
    if (ESCAPE_ROOM_INTERACTION_CATALOG.includes(anchor) && interactions.length) {
      const existingIndex = interactions.indexOf(anchor);
      if (existingIndex > 0) [interactions[0], interactions[existingIndex]] = [interactions[existingIndex], interactions[0]];
      else interactions[0] = anchor;
    }
    if (questionCount >= 3 && interactions.at(-1) === "verdadero_falso") {
      const swapIndex = interactions.findIndex((type, index) => index < questionCount - 1 && type !== "verdadero_falso");
      if (swapIndex >= 0) [interactions[swapIndex], interactions[questionCount - 1]] = [interactions[questionCount - 1], interactions[swapIndex]];
    }
    const knowledgeIds = Array.from({ length: questionCount }, (_, questionIndex) => `r${roomIndex + 1}_k${questionIndex + 1}`);
    const plans = Array.from({ length: questionCount }, (_, questionIndex) => {
      const role = roleFor(questionIndex);
      return {
        plan_id: `r${roomIndex + 1}_p${questionIndex + 1}`,
        knowledge_id: knowledgeIds[questionIndex],
        assessment_case_id: `r${roomIndex + 1}_case_${questionIndex + 1}`,
        case_source: "new_case_in_prompt",
        pedagogical_role: role,
        difficulty: getQuestionDifficulty(context, questionIndex, questionCount).difficulty,
        difficulty_policy_version: getQuestionDifficulty(context, questionIndex, questionCount).difficulty_policy_version,
        interaction: interactions[questionIndex],
        integrates_knowledge_ids: role === "synthesis" ? knowledgeIds.slice(0, Math.min(2, knowledgeIds.length)) : [knowledgeIds[questionIndex]],
        support_source: role === "synthesis" ? "briefing_and_prompt" : "prompt",
        requires_image: interactions[questionIndex] === "multimedia",
        estimated_seconds: getQuestionTimeBudgetSeconds(context)
      };
    });
    return {
      room_number: roomIndex + 1,
      interaction_anchor: ESCAPE_ROOM_INTERACTION_CATALOG.includes(anchor) ? anchor : "",
      question_plans: plans,
      reserve_opportunity: {
        plan_id: `r${roomIndex + 1}_reserve`,
        knowledge_id: `r${roomIndex + 1}_reserve_k`,
        assessment_case_id: `r${roomIndex + 1}_reserve_case`,
        case_source: "new_case_in_prompt",
        pedagogical_role: "transfer",
        difficulty: getQuestionDifficulty(context).difficulty,
        difficulty_policy_version: getQuestionDifficulty(context).difficulty_policy_version,
        interaction: allowedTypes.find((type) => !interactions.includes(type)) || allowedTypes[0],
        integrates_knowledge_ids: [knowledgeIds[0]],
        support_source: "prompt",
        requires_image: false,
        estimated_seconds: getQuestionTimeBudgetSeconds(context)
      }
    };
  });
}

function buildObjectiveFoundationPrompt(context = {}, sourceContract = null, roomCount = 4) {
  const roomShape = {
    room_number: 1, title: "", learning_focus: "", room_objective: "", fixed_requirements: [], mandatory_anchors: [], source_repairs: [],
    curriculum_inventory: { knowledge: [], rules_or_procedures: [], skills: [], misconceptions: [], teaching_examples: [] },
    narrative_beat: { incoming_state: "", room_role: "", obstacle: "", stakes: "", success_change: "", next_state: "" },
    room_completion_feedback: ""
  };
  return [
    "<OBJECTIVE>Completa sólo los campos globales y de sala de un blueprint pedagógico. No crees preguntas.</OBJECTIVE>",
    buildDifficultyInstruction(context),
    QUESTION_DIVERSITY_INSTRUCTION,
    "Distribuye conceptos específicos diferentes entre salas y suficientes subtemas para todas las preguntas configuradas. El currículo compartido sirve de base, no de banco de respuestas repetidas.",
    `<LANGUAGE>${resolvePromptLanguageDirective(context.idioma).directive}</LANGUAGE>`,
    `<ACADEMIC_CONFIGURATION>${JSON.stringify(getObjectiveConfigurationContract(context))}</ACADEMIC_CONFIGURATION>`,
    `Recompensa principal: ${experience.config(context.experience_config).primary_reward}. El sistema entrega la recompensa al terminar cada sala. No escribas letras ni fragmentos del código final en el feedback, las preguntas o las pistas; usa un mensaje curricular de logro.`,
    `<SOURCE_CONTRACT>${JSON.stringify({
      explicit_title: sourceContract?.explicit_title,
      fixed_final_code: sourceContract?.fixed_final_code,
      fixed_code_fragments: sourceContract?.fixed_code_fragments,
      rejected_invalid_unlock: sourceContract?.rejected_invalid_unlock,
      fixed_final_feedback: sourceContract?.fixed_final_feedback,
      fixed_room_feedback: sourceContract?.fixed_room_feedback,
      fixed_interactions: sourceContract?.fixed_interactions,
      deterministic_repairs: sourceContract?.deterministic_repairs
    })}</SOURCE_CONTRACT>`,
    `<USER_OBJECTIVE>${sourceContract?.edited_plan_text || sourceContract?.original_objective || ""}</USER_OBJECTIVE>`,
    `<CONSTRAINTS>Devuelve exactamente ${roomCount} salas en orden. Conserva título, currículo, orden, clave, feedback y fragmentos explícitos que sean válidos. final_unlock.code debe ser una sola palabra temática natural vinculada directamente con el tema curricular, escrita únicamente con letras A-Z en mayúsculas, sin números, espacios, guiones, siglas inventadas ni símbolos. Debe tener entre ${Math.max(3, roomCount)} y 12 letras. Prioriza exactamente ${roomCount} letras; si no existe una palabra temática natural de esa longitud, usa una palabra completa más larga. No uses palabras genéricas como CLAVE, CODIGO o ESCAPE salvo que sean realmente el contenido curricular. Si rejected_invalid_unlock es true, sustituye la antigua clave y no reutilices sus números en ningún feedback. La continuidad es exacta: cada incoming_state posterior debe ser idéntico al next_state anterior. Los ejemplos enseñan principios, no resuelven casos evaluables. B1/B2 en bloque/trimestre son etiquetas académicas; el perfil explícito de inglés B1 del MCER se aplica independientemente.</CONSTRAINTS>`,
    `<OUTPUT_FORMAT>${JSON.stringify({
      purpose: "", experience_goal: "", global_criteria: ["", "", ""],
      source_analysis: { fixed_constraints: [], pedagogical_intent: [""], reference_material: [], editorial_specifications: [], repairable_contradictions: [] },
      curriculum_model: { essential_knowledge: [""], transferable_skills: [""], prerequisites: [], likely_misconceptions: [""] },
      narrative_arc: { global_problem: "", stakes: "", escalation: "", finale: "" },
      project_copy: { title: "", subtitle: "", introduction: "", instructions: "", setting: "", visual_line: "" },
      rooms: Array.from({ length: roomCount }, (_, index) => ({ ...structuredClone(roomShape), room_number: index + 1 })),
      final_unlock: { code: "", feedback: "" }
    })}</OUTPUT_FORMAT>`,
    "Multimedia requiere cuatro opciones y un recurso necesario para elegir la solución. Completar espacio requiere una lectura con marcadores literales ___ sin numerarlos y fichas arrastrables: answer_target enumera '1 → respuesta breve | 2 → respuesta breve' en orden de huecos. Debe haber exactamente un marcador ___ por solución; la solución puede ser una palabra o expresión curricular breve. No pide escribir ni repite la lectura en reto. Para relación de columnas y drag_drop, answer_target enumera exactamente 'destino → ficha | destino → ficha', sin comentarios extra; para ordenar_secuencia enumera los elementos exactos como 'primero → segundo → tercero'. Esta clave privada fija la solución que deberá respetar la generación.",
    "Devuelve únicamente JSON."
  ].join("\n");
}

function buildObjectiveFoundationResponseSchema(roomCount = 4) {
  const stringField = { type: "string" };
  const stringList = { type: "array", items: stringField };
  const roomSchema = {
    type: "object",
    properties: {
      room_number: { type: "integer" }, title: stringField, learning_focus: stringField, room_objective: stringField,
      fixed_requirements: stringList, mandatory_anchors: stringList,
      source_repairs: {
        type: "array",
        items: {
          type: "object",
          properties: { issue: stringField, preserved_intent: stringField, repair_instruction: stringField },
          required: ["issue", "preserved_intent", "repair_instruction"]
        }
      },
      curriculum_inventory: {
        type: "object",
        properties: { knowledge: stringList, rules_or_procedures: stringList, skills: stringList, misconceptions: stringList, teaching_examples: stringList },
        required: ["knowledge", "rules_or_procedures", "skills", "misconceptions", "teaching_examples"]
      },
      narrative_beat: {
        type: "object",
        properties: { incoming_state: stringField, room_role: stringField, obstacle: stringField, stakes: stringField, success_change: stringField, next_state: stringField },
        required: ["incoming_state", "room_role", "obstacle", "stakes", "success_change", "next_state"]
      },
      room_completion_feedback: stringField
    },
    required: ["room_number", "title", "learning_focus", "room_objective", "fixed_requirements", "mandatory_anchors", "source_repairs", "curriculum_inventory", "narrative_beat", "room_completion_feedback"]
  };
  return {
    type: "object",
    properties: {
      purpose: stringField, experience_goal: stringField, global_criteria: stringList,
      source_analysis: {
        type: "object",
        properties: { fixed_constraints: stringList, pedagogical_intent: stringList, reference_material: stringList, editorial_specifications: stringList, repairable_contradictions: stringList },
        required: ["fixed_constraints", "pedagogical_intent", "reference_material", "editorial_specifications", "repairable_contradictions"]
      },
      curriculum_model: {
        type: "object",
        properties: { essential_knowledge: stringList, transferable_skills: stringList, prerequisites: stringList, likely_misconceptions: stringList },
        required: ["essential_knowledge", "transferable_skills", "prerequisites", "likely_misconceptions"]
      },
      narrative_arc: {
        type: "object",
        properties: { global_problem: stringField, stakes: stringField, escalation: stringField, finale: stringField },
        required: ["global_problem", "stakes", "escalation", "finale"]
      },
      project_copy: {
        type: "object",
        properties: { title: stringField, subtitle: stringField, introduction: stringField, instructions: stringField, setting: stringField, visual_line: stringField },
        required: ["title", "subtitle", "introduction", "instructions", "setting", "visual_line"]
      },
      rooms: { type: "array", minItems: roomCount, maxItems: roomCount, items: roomSchema },
      final_unlock: {
        type: "object",
        properties: { code: stringField, feedback: stringField },
        required: ["code", "feedback"]
      }
    },
    required: ["purpose", "experience_goal", "global_criteria", "source_analysis", "curriculum_model", "narrative_arc", "project_copy", "rooms", "final_unlock"]
  };
}

function buildObjectiveRoomFillPrompt(context = {}, sourceContract = null, foundation = {}, room = {}, template = {}) {
  const roomCurriculum = {
    room_number: room.room_number,
    title: room.title,
    learning_focus: room.learning_focus,
    room_objective: room.room_objective,
    mandatory_anchors: room.mandatory_anchors,
    curriculum_inventory: room.curriculum_inventory,
    narrative_beat: room.narrative_beat,
    fixed_requirements: normalizeTextList(room.fixed_requirements || [])
  };
  return [
    "<OBJECTIVE>Rellena únicamente los campos editables de la plantilla de preguntas de esta sala.</OBJECTIVE>",
    QUESTION_BRIEF_GROUNDING,
    `PLANTILLAS POR TIPO (aplica únicamente la del interaction asignado; no son contenido del alumno):\n${JSON.stringify(QUESTION_AUTHORING_TEMPLATES)}`,
    buildDifficultyInstruction(context),
    "En relacion_columnas y drag_drop declara las correspondencias completas en answer_target con flechas →. Todas deben usar el mismo criterio, sin repetir un caso con etiquetas abreviadas. Usa únicamente reglas y significados del curriculum_inventory que el briefing enseñará; si falta un principio indispensable, elige otro caso sustentado por el inventario, no lo inventes en application. Los campos knowledge y evidence son metadatos privados, nunca fichas de emparejamiento.",
    "En cada relacion_columnas, la materialización debe añadir exactamente 2 distractores plausibles en opciones. Deben pertenecer a la misma categoría curricular que las respuestas derechas, reflejar errores creíbles y no coincidir con ninguna solución. No incluyas los distractores en answer_target ni solution_pairs.",
    "Para cada plan con interaction=drag_drop, define exactamente 6 correspondencias concretas diferentes en answer_target usando 'destino → ficha | destino → ficha'. Describe las 6 fichas en application. Si el material original tiene menos, amplía con correspondencias nuevas del mismo objetivo y nivel. No reutilices relaciones evaluadas por otra pregunta ni añadas relleno. Si detectas pares repetidos o incompletos, conserva las relaciones válidas ya únicas y reemplaza sólo las repetidas por relaciones curriculares nuevas y verificables (sin numeración artificial).",
    "CONTRATO DE MECÁNICAS: en texto, opción múltiple o multimedia usa cipher/anagram cuando corresponda y solution=answer_target. En verdadero_falso que evalúe una afirmación sobre un cifrado usa exclusivamente cipher_assertion: ciphertext es el código público, computed_value es su descifrado real, claimed_value es el resultado que afirma el enunciado y expected_boolean coincide con answer_target. No compares la palabra descifrada con el booleano. En drag_drop, relacion_columnas y completar_espacio usa kind=none: sus soluciones viven en solution_pairs/answer_target.",
    QUESTION_DIVERSITY_INSTRUCTION,
    `<ALREADY_ASSESSED>${JSON.stringify((foundation.rooms || []).filter((item) => item.room_number < room.room_number).flatMap((item) => item.question_plans || []).map(({ plan_id, knowledge, application, answer_target, solution_pairs }) => ({
      plan_id,
      knowledge,
      application,
      answer_target,
      solution_pairs: (solution_pairs || []).map(pair => ({ izquierda: pair.izquierda, derecha: pair.derecha }))
    })))}</ALREADY_ASSESSED>`,
    `<ACADEMIC_CONFIGURATION>${JSON.stringify(getObjectiveConfigurationContract(context))}</ACADEMIC_CONFIGURATION>`,
    `Recompensa principal: ${experience.config(context.experience_config).primary_reward}. El sistema entrega la recompensa al terminar cada sala. No escribas letras ni fragmentos del código final en el feedback, las preguntas o las pistas; usa un mensaje curricular de logro.`,
    `<GLOBAL_PEDAGOGY>${JSON.stringify({ purpose: foundation.purpose, experience_goal: foundation.experience_goal, curriculum_model: foundation.curriculum_model })}</GLOBAL_PEDAGOGY>`,
    `<ROOM_CURRICULUM>${JSON.stringify(roomCurriculum)}</ROOM_CURRICULUM>`,
    `<IMMUTABLE_TEMPLATE>${JSON.stringify(template)}</IMMUTABLE_TEMPLATE>`,
    "<RULES>No cambies plan_id, knowledge_id, assessment_case_id, case_source, pedagogical_role, difficulty, interaction, integrates_knowledge_ids, support_source, requires_image ni estimated_seconds. Completa todos los demás campos. Cada knowledge_id, answer_signature y answer_target debe ser distinto dentro de la sala. Una respuesta fija del currículo sólo puede ser answer_target de una pregunta; las demás pueden usar esa palabra como contexto sin volver a evaluarla. Cada knowledge_id identifica el aprendizaje evaluado. Una regla curricular puede compartirse en varios planes si cambian los datos concretos del caso, el razonamiento exigido y la solución; cambiar sólo la interfaz o la redacción no crea un ejercicio nuevo. En synthesis puedes integrar conocimientos anteriores indicados por integrates_knowledge_ids, pero debes plantear un caso y una solución nuevos que requieran combinarlos; redacta knowledge como el aprendizaje integrado, no como copia literal de un solo concepto anterior. En planes no directos, case_data usa 'fuente o variable: observación o valor concreto' y application incluye literalmente cada entrada. En synthesis, ambos datos son indispensables, cada knowledge_id integrado se aplica realmente y ninguno de los datos permite obtener answer_target por sí solo. Las pistas explican un procedimiento sin escribir la respuesta ni la relación decisiva. Puedes usar palabras como código, clave o fragmento cuando sean parte real del contenido académico; únicamente evita identificar una respuesta como la clave final o anunciar la entrega del fragmento de sala dentro de una pregunta. PigPen añade la recompensa fuera de las preguntas. Una reserva con mechanic_contract.kind=none no puede pedir cifrar, descifrar, reordenar letras ni ordenar una secuencia; si la operación es necesaria, incluye el contrato determinista completo.</RULES>",
    ...template.question_plans.filter(slot => experience.get(slot.interaction)).map(slot => `${slot.plan_id}: ${experienceAuthoringInstruction(slot.interaction)}`),
    ...(experience.get(template.reserve_opportunity?.interaction) ? [experienceAuthoringInstruction(template.reserve_opportunity.interaction)] : []),
    "<REQUIRED_FILLABLE_FIELDS>case_data, transfer_delta, reasoning_evidence, reasoning_steps, distractor_errors, evidence, knowledge, cognitive_operation, answer_family, answer_signature, answer_target, solution_pairs, application, instruction_outline, hint_strategy, feedback_strategy, editorial_constraints, narrative_effect y mechanic_contract.</REQUIRED_FILLABLE_FIELDS>",
    "Para difficulty_policy_version>=1, la fuente y observación de case_data se redactan como oraciones naturales completas, no como etiquetas 'fuente: valor'. Esta regla sustituye el formato antiguo de las reglas anteriores; application conserva literalmente las oraciones y los datos. La exigencia pedagógica se mantiene.",
    ...(sourceContract?.edited_plan_text ? [
      `<AUTHOR_EDITED_PLAN>${sourceContract.edited_plan_text}</AUTHOR_EDITED_PLAN>`,
      "Conserva las especificaciones de razonamiento y errores plausibles editadas por el autor para los PLAN_ID de esta sala, manteniendo la configuración académica actual."
    ] : []),
    "CIPHER_ASSERTION: primero descifra ciphertext con -shift para obtener computed_value. expected_boolean es true únicamente si claimed_value coincide con computed_value, ignorando mayúsculas; de lo contrario es false. answer_target debe ser ese mismo booleano como texto. Ejemplo: GBMTF, shift=1, computed_value=FALSE, claimed_value=TRUE → expected_boolean=false y answer_target=\"false\". La palabra FALSE descifrada no es por sí sola la respuesta booleana. Redacta razonamiento y feedback de acuerdo con esa comparación.",
    "<MECHANIC_CONTRACT_SHAPE>{\"kind\":\"none|cipher|cipher_assertion|anagram|sequence\",\"solution\":\"\",\"ciphertext\":\"\",\"computed_value\":\"\",\"claimed_value\":\"\",\"expected_boolean\":false,\"scrambled\":\"\",\"shift\":0,\"alphabet\":\"ABCDEFGHIJKLMNOPQRSTUVWXYZ\",\"ordering_rule\":\"\",\"items\":[{\"text\":\"\",\"order_key\":1,\"evidence\":\"\"}]}</MECHANIC_CONTRACT_SHAPE>",
    `<OUTPUT_FORMAT>${JSON.stringify(buildFixedObjectiveFillShape(buildObjectiveRoomFillResponseSchema(template)))}</OUTPUT_FORMAT>`,
    "Rellena exactamente las claves y campos de OUTPUT_FORMAT. Cada clave raíz es un espacio fijo identificado por PigPen, incluida la reserva. No devuelvas listas question_plans ni reserve_opportunity, no añadas ni omitas campos. Los identificadores, el tipo, la dificultad y otros datos inmutables ya están en IMMUTABLE_TEMPLATE: úsalos como contexto, no los devuelvas. Sustituye únicamente los valores de contenido; las listas internas contienen datos del caso, no preguntas nuevas.",
    "Para drag_drop, completa obligatoriamente los 6 objetos fijos de solution_pairs con {izquierda,derecha}; no reduzcas, unas ni resumas relaciones. Para relacion_columnas completa de 2 a 6 y para completar_espacio una relación por hueco. En esos tipos, solution_pairs es la clave privada autoritativa y answer_target debe ser su representación equivalente con flechas → y separadores |. Para los demás tipos devuelve solution_pairs=[].",
    "Drag & Drop es un emparejamiento uno a uno: redacta SEIS destinos distintos y SEIS respuestas distintas. No construyas seis casos que se clasifican en solo dos categorías repetidas. Si el caso parte de dos categorías, diseña seis relaciones curriculares específicas y deducibles del briefing, sin limitarte a numerar respuestas idénticas. Comprueba los seis objetos antes de devolverlos. Las lecturas con huecos sí pueden repetir una palabra cuando el contexto lo requiera.",
    "Multimedia requiere cuatro opciones y un recurso necesario para elegir la solución. Completar espacio requiere una lectura con uno o varios marcadores literales ___, siempre sin numerarlos, y fichas arrastrables: answer_target enumera '1 → respuesta breve | 2 → respuesta breve' en orden de huecos. Cada respuesta puede ser una palabra o expresión curricular breve. No pide escribir ni repite la lectura en reto.",
    "Devuelve únicamente JSON."
  ].join("\n");
}

function mergeFilledQuestionPlanWithTemplate(rawPlan = {}, template = {}) {
  const filled = normalizeObjectiveQuestionPlan(rawPlan);
  return normalizeObjectiveQuestionPlan(materializeObjectivePlanCaseEvidence({
    ...filled,
    plan_id: template.plan_id,
    knowledge_id: template.knowledge_id,
    assessment_case_id: template.assessment_case_id,
    case_source: template.case_source,
    pedagogical_role: template.pedagogical_role,
    difficulty: template.difficulty,
    difficulty_policy_version: template.difficulty_policy_version || 0,
    interaction: template.interaction,
    integrates_knowledge_ids: [...template.integrates_knowledge_ids],
    support_source: template.support_source,
    requires_image: template.requires_image,
    estimated_seconds: template.estimated_seconds
  }), template.interaction);
}

function buildObjectiveRoomFillResponseSchema(template) {
  const stringField = { type: "string" };
  const stringList = { type: "array", items: stringField };
  const solutionPairItem = {
    type: "object",
    properties: {
      izquierda: { type: "string", minLength: 1 },
      derecha: { type: "string", minLength: 1 }
    },
    required: ["izquierda", "derecha"]
  };
  const mechanicSchema = {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["none", "cipher", "cipher_assertion", "anagram", "sequence"] },
      solution: stringField,
      ciphertext: stringField,
      computed_value: stringField,
      claimed_value: stringField,
      expected_boolean: { type: "boolean" },
      scrambled: stringField,
      shift: { type: "integer" },
      alphabet: stringField,
      ordering_rule: stringField,
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { text: stringField, order_key: { type: "integer" }, evidence: stringField },
          required: ["text", "order_key", "evidence"]
        }
      }
    },
    required: ["kind", "solution", "ciphertext", "computed_value", "claimed_value", "expected_boolean", "scrambled", "shift", "alphabet", "ordering_rule", "items"]
  };
  const planProperties = {
    reasoning_steps: { type: "array", minItems: 1, items: stringField },
    distractor_errors: stringList,
    case_data: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } }, transfer_delta: stringField, reasoning_evidence: stringField,
    evidence: stringField, knowledge: stringField, teaching_example: { type: "string", minLength: 1 }, cognitive_operation: stringField,
    answer_family: stringField, answer_signature: stringField, answer_target: stringField,
    solution_pairs: { type: "array", minItems: 0, maxItems: 0, items: solutionPairItem },
    application: stringField,
    instruction_outline: stringField, hint_strategy: stringField, feedback_strategy: stringField,
    editorial_constraints: stringList,
    narrative_effect: stringField,
    mechanic_contract: mechanicSchema
  };
  const planSchema = { type: "object", properties: planProperties, required: Object.keys(planProperties) };
  const slots = [...template.question_plans, ...(template.reserve_opportunity ? [template.reserve_opportunity] : [])];
  const properties = Object.fromEntries(slots.map(slot => {
    const solutionPairLimits = slot.interaction === "drag_drop"
      ? { minItems: 6, maxItems: 6 }
      : slot.interaction === "relacion_columnas"
        ? { minItems: 2, maxItems: 6 }
        : slot.interaction === "completar_espacio"
          ? { minItems: 1, maxItems: 6 }
          : { minItems: 0, maxItems: 0 };
    return [slot.plan_id, {
      ...planSchema,
      required: [...planSchema.required, ...(experience.get(slot.interaction) ? ["interaction_data"] : [])],
      properties: { ...planProperties,
      ...(experience.get(slot.interaction) ? { interaction_data: experienceContractSchema(slot.interaction), mechanic_contract: { ...mechanicSchema, required: ["kind"], properties: { ...mechanicSchema.properties, kind: { type: "string", enum: ["none"] } } } } : {}),
      reasoning_steps: { type: "array", minItems: slot.difficulty === "desafiante" ? (slot.pedagogical_role === "synthesis" ? 3 : 2) : 1, items: slot.difficulty_policy_version >= 2 ? { type: "string", minLength: 1 } : stringField },
      distractor_errors: slot.difficulty_policy_version >= 2 && ["opcion_multiple", "multimedia", "verdadero_falso"].includes(slot.interaction)
        ? { type: "array", minItems: 1, items: { type: "string", minLength: 1 } }
        : stringList,
      solution_pairs: { type: "array", ...solutionPairLimits, items: solutionPairItem }
      }
    }];
  }));
  return { type: "object", properties, required: Object.keys(properties) };
}

// The internal catalog is complete; the AI transport contains only active fields.
function requiredRoomSchema(schema) {
  if (schema.type === 'object') {
    const required = schema.required || [];
    return { ...schema, properties: Object.fromEntries(required.map(key => [key, requiredRoomSchema(schema.properties[key])])) };
  }
  if (schema.type === 'array') return { ...schema, items: requiredRoomSchema(schema.items) };
  return { ...schema };
}

function buildFilteredRoomSchema(fullSchema, template) {
  const schema = requiredRoomSchema(fullSchema);
  const remove = (object, key) => {
    delete object.properties[key];
    object.required = object.required.filter(name => name !== key);
  };
  for (const slot of [...template.question_plans, ...(template.reserve_opportunity ? [template.reserve_opportunity] : [])]) {
    const plan = schema.properties.plans.properties[slot.plan_id];
    if (plan.properties.solution_pairs.maxItems === 0) remove(plan, 'solution_pairs');
    if (experience.get(slot.interaction)) {
      remove(plan, 'mechanic_contract');
      // Separate banks are meaningful even though allowed is optional internally.
      if (slot.interaction !== 'seleccion_multiple') {
        const targets = plan.properties.interaction_data.properties.targets.items;
        targets.properties.allowed = { type: 'array', items: { type: 'string' } };
        targets.required = [...targets.required, 'allowed'];
      }
    }
  }
  const mission = schema.properties.mission;
  const question = mission.properties.preguntas.items;
  const properties = Object.fromEntries(template.question_plans.map(slot => {
    const active = new Set(['titulo', 'reto', 'pista', 'extra_hint', 'retroalimentacion_correcta', 'retroalimentacion_incorrecta']);
    if (['texto', 'opcion_multiple', 'multimedia', 'verdadero_falso'].includes(slot.interaction)) {
      ['subtipo_respuesta', 'respuesta_correcta', 'respuestas_aceptadas'].forEach(key => active.add(key));
    }
    if (['opcion_multiple', 'multimedia', 'relacion_columnas', 'completar_espacio'].includes(slot.interaction)) active.add('opciones');
    if (experience.get(slot.interaction)) active.delete('extra_hint');
    if (slot.interaction === 'ordenar_secuencia') active.add('elementos');
    if (slot.interaction === 'completar_espacio') active.add('texto_con_hueco');
    if (slot.requires_image || slot.interaction === 'multimedia') ['imagen_prompt', 'imagen_alt'].forEach(key => active.add(key));
    return [slot.plan_id, { type: 'object', properties: Object.fromEntries([...active].map(key => [key, question.properties[key]])), required: [...active] }];
  }));
  mission.properties.preguntas = { type: 'object', properties, required: Object.keys(properties) };
  remove(mission, 'imagen');
  return schema;
}

function hydrateFilteredRoomResponse(payload, fullSchema, template) {
  const result = structuredClone(payload);
  for (const slot of [...template.question_plans, ...(template.reserve_opportunity ? [template.reserve_opportunity] : [])]) {
    const plan = result.plans[slot.plan_id];
    if (fullSchema.properties.plans.properties[slot.plan_id].properties.solution_pairs.maxItems === 0) plan.solution_pairs = [];
    if (experience.get(slot.interaction)) {
      plan.mechanic_contract = { kind: 'none' };
      plan.interaction_data = experience.normalizeContract(plan.interaction_data, slot.interaction);
    }
  }
  const questionSchema = fullSchema.properties.mission.properties.preguntas.items;
  result.mission.imagen = '';
  result.mission.preguntas = template.question_plans.map(slot => ({
    ...buildFixedObjectiveFillShape(questionSchema),
    ...result.mission.preguntas[slot.plan_id],
    _plan_id: slot.plan_id,
    ...(experience.get(slot.interaction) ? { extra_hint: result.plans[slot.plan_id].interaction_data.extra_hint } : {}),
    requiere_imagen: slot.requires_image === true || slot.interaction === 'multimedia',
    parejas: (result.plans[slot.plan_id].solution_pairs || []).map(pair => ({ ...pair, pista: '' }))
  }));
  return result;
}

function buildFilteredRoomPrompt(context, sourceContract, foundation, room, template, schema) {
  const slots = [...template.question_plans, ...(template.reserve_opportunity ? [template.reserve_opportunity] : [])];
  const types = [...new Set(slots.map(slot => slot.interaction))];
  const { question_plans, reserve_opportunity, ...curriculum } = room;
  return [
    'Genera en UNA respuesta JSON los textos privados de plans y la sala jugable de mission. No habrá otra llamada para completar esta sala. No uses Markdown. Escapa comillas y saltos de línea dentro de las cadenas JSON.',
    QUESTION_BRIEF_GROUNDING,
    QUESTION_DIVERSITY_INSTRUCTION,
    buildDifficultyInstruction(context),
    resolvePromptLanguageDirective(context.idioma).directive,
    `Tiempo aproximado por pregunta: ${getQuestionTimeBudgetSeconds(context)} segundos.`,
    `CONFIGURACIÓN: ${JSON.stringify(getObjectiveConfigurationContract(context))}`,
    `PEDAGOGÍA GLOBAL: ${JSON.stringify({ purpose: foundation.purpose, experience_goal: foundation.experience_goal, curriculum_model: foundation.curriculum_model })}`,
    `CURRÍCULO DE ESTA SALA: ${JSON.stringify(curriculum)}`,
    `ASIGNACIÓN INMUTABLE: ${JSON.stringify(slots.map(({ plan_id, interaction, difficulty, difficulty_policy_version, pedagogical_role, knowledge_id, assessment_case_id, case_source, support_source, integrates_knowledge_ids, requires_image, estimated_seconds }) => ({ plan_id, interaction, difficulty, difficulty_policy_version, pedagogical_role, knowledge_id, assessment_case_id, case_source, support_source, integrates_knowledge_ids, requires_image, estimated_seconds })))}`,
    `TIPOS ACTIVOS: ${JSON.stringify(Object.fromEntries(types.map(type => [type, experience.get(type)
      ? experienceAuthoringInstruction(type, { filteredTransport: true })
      : buildQuestionAuthoringTemplate(type)])))}`,
    ...(types.some(type => !experience.get(type)) ? [
      'Mecánicas clásicas: kind=none si no hay cálculo mecánico. Cipher/anagram guardan solution=answer_target y la pista pública en ciphertext/scrambled; el reto incluye esa pista literalmente sin resolverla. Cipher_assertion descifra ciphertext con -shift para obtener computed_value y compara con claimed_value; expected_boolean es el resultado de esa comparación y answer_target es ese booleano como texto. Sequence guarda items con order_key y evidencia que permite deducir su orden. Emparejamiento y huecos usan kind=none y solution_pairs. Los valores de texto de mechanic_contract siempre son strings, incluso claimed_value; los campos inactivos del contrato clásico se dejan vacíos.'
    ] : []),
    'En verdadero_falso transporta respuesta_correcta como texto "true" o "false". En las instrucciones de emparejamiento, parejas se refiere a plans.solution_pairs: no devuelvas una segunda copia. Para campos inactivos prevalece su omisión del esquema sobre cualquier ejemplo genérico.',
    `YA EVALUADO (PROHIBIDO REPETIR): ${JSON.stringify((foundation.rooms || []).filter(item => item.room_number < room.room_number).flatMap(item => item.question_plans || []).map(({ knowledge, application, answer_target }) => ({ knowledge, application, answer_target })))}`,
    'DIVERSIDAD ESTRICTA ENTRE SALAS: Queda terminantemente prohibido reutilizar conceptos, casos o soluciones de YA EVALUADO; cada plan debe evaluar contenidos nuevos y no repetidos.',
    ...(sourceContract?.edited_plan_text ? [`ESPECIFICACIONES DEL AUTOR: ${sourceContract.edited_plan_text}`] : []),
    'El siguiente esquema es el ÚNICO formato de salida. Respeta required, minItems, maxItems y los tipos. Cada clave de preguntas identifica su plan; no devuelvas preguntas como array. La reserva tiene sólo plan privado. Omite los campos que no están en el esquema, aunque una descripción general los mencione. PigPen aporta identificadores y valores estructurales.',
    'Para tipos nuevos, interaction_data se escribe UNA vez en plans: incluye el banco completo de opciones, distractores, destinos y soluciones. No lo repitas en mission. Para emparejamientos y huecos, solution_pairs es la única copia de las parejas. No inventes otro contrato ni escribas instrucciones de entrada que revelen la respuesta.',
    'Redacta application con los datos concretos de case_data. reasoning_steps contiene pasos distintos y suficientes para la dificultad; evidence y reasoning_evidence justifican la solución. No rellenes listas con pasos repetidos. En synthesis integra los conocimientos asignados mediante datos que sean todos necesarios. Conserva las soluciones sólo en campos privados y explica el aprendizaje en el feedback correcto.',
    'El briefing contexto enseña los procedimientos con ejemplos distintos de los ejercicios. historia continúa la escena y mission.reto es un puente narrativo declarativo. Incluye datos_clave suficientes. Las pistas orientan sin resolver. No anuncies códigos ni recompensas dentro del feedback: PigPen los entrega después de la sala.',
    `DIRECCIÓN VISUAL: ${buildVisualDirection(context).line}`,
    `ESQUEMA ÚNICO: ${JSON.stringify(schema)}`
  ].join('\n');
}

function buildFixedRoomContent(fullSchema, template) {
  const wireSchema = buildFilteredRoomSchema(fullSchema, template);
  const value = fixedSchemaValue(wireSchema);
  if (value.room_context?.curriculum_inventory) {
    // These exact lists are derived from the accepted plans, never authored twice.
    value.room_context.curriculum_inventory.knowledge = [];
    value.room_context.curriculum_inventory.teaching_examples = [];
  }
  for (const slot of [...template.question_plans, ...(template.reserve_opportunity ? [template.reserve_opportunity] : [])]) {
    const plan = value.plans[slot.plan_id];
    if (experience.get(slot.interaction)) plan.interaction_data = fixedInteraction(slot.interaction, experience, [...slot.plan_id].reduce((sum,char)=>sum*31+char.charCodeAt(0),0) >>> 0);
    else plan.mechanic_contract = buildFixedObjectiveFillShape(fullSchema.properties.plans.properties[slot.plan_id].properties.mechanic_contract);
    if (plan.solution_pairs) {
      if (slot.interaction === 'completar_espacio') plan.solution_pairs.forEach((pair,i)=>{pair.izquierda=String(i+1);});
      plan.answer_target = '';
    }
    plan.evidence = '';
    plan.editorial_constraints = [];
    const question = value.mission.preguntas[slot.plan_id];
    if (!question) continue;
    question.reto = '';
    plan.instruction_outline = '';
    plan.hint_strategy = '';
    plan.feedback_strategy = '';
    if (['opcion_multiple','multimedia'].includes(slot.interaction)) {
      question.opciones=Array(4).fill(CONTENT_SLOT);question.respuesta_correcta='';plan.answer_target='';
    } else if (slot.interaction === 'verdadero_falso') {
      question.respuesta_correcta='true';plan.answer_target='true';plan.mechanic_contract.expected_boolean=true;
    } else if (slot.interaction === 'texto') question.respuesta_correcta='';
    if ('respuestas_aceptadas' in question) question.respuestas_aceptadas=[];
    if (slot.interaction==='relacion_columnas') question.opciones=Array(2).fill(CONTENT_SLOT);
    if (slot.interaction==='ordenar_secuencia') plan.answer_target='';
  }
  // Validate the entire local JSON topology before contacting the model.
  const preview=hydrateFilteredRoomResponse(value,fullSchema,template);
  const issues=validateFixedObjectiveFill(preview,fullSchema,'Plantilla local');
  if(issues.length)throw Error(issues.join(' · '));
  return contentDocument(value);
}

function materializeFixedRoomContent(document, response, fullSchema, template) {
  const value=fillContentDocument(document,response);
  if (value.room_context?.curriculum_inventory) {
    value.room_context.curriculum_inventory.knowledge = [...new Set(template.question_plans.map(slot=>value.plans[slot.plan_id].knowledge))];
    value.room_context.curriculum_inventory.teaching_examples = [...new Set(template.question_plans.map(slot=>value.plans[slot.plan_id].teaching_example))];
  }
  for(const slot of [...template.question_plans, ...(template.reserve_opportunity ? [template.reserve_opportunity] : [])]) {
    const plan=value.plans[slot.plan_id],question=value.mission.preguntas[slot.plan_id];
    if(plan.solution_pairs?.length)plan.answer_target=plan.solution_pairs.map(p=>`${p.izquierda} → ${p.derecha}`).join(' | ');
    plan.evidence=plan.reasoning_evidence;
    if(!question)continue;
    question.reto=plan.application;
    plan.instruction_outline=plan.application;
    plan.hint_strategy=question.pista;
    plan.feedback_strategy=question.retroalimentacion_correcta;
    if(['opcion_multiple','multimedia'].includes(slot.interaction))plan.answer_target=question.respuesta_correcta=question.opciones[0];
    if(slot.interaction==='texto')question.respuesta_correcta=plan.answer_target;
    if(slot.interaction==='ordenar_secuencia')plan.answer_target=question.elementos.join(' → ');
  }
  return composePedagogicalRoom(hydrateFilteredRoomResponse(value,fullSchema,template), template.question_plans);
}

function buildFixedRoomTextPrompt(context, sourceContract, foundation, room, template, document) {
  const types=[...new Set([...template.question_plans, ...(template.reserve_opportunity ? [template.reserve_opportunity] : [])].map(slot=>slot.interaction))];
  const {question_plans,reserve_opportunity,...curriculum}=room;
  return [
    'Redacta contenido curricular para una sala cuya estructura ya está construida por PigPen. No generes ni modifiques JSON.',
    QUESTION_BRIEF_GROUNDING,PEDAGOGY_INSTRUCTION,BRIEFING_NARRATIVE_INSTRUCTION,MECHANIC_COHERENCE_INSTRUCTION,selectedExperienceInstruction(context),buildDifficultyInstruction(context),resolvePromptLanguageDirective(context.idioma).directive,
    `CONFIGURACIÓN: ${JSON.stringify(getObjectiveConfigurationContract(context))}`,
    `CONTEXTO DE ENTRADA: ${JSON.stringify(curriculum)}`,
    `FUENTE CURRICULAR: ${sourceContract?.original_objective || context.objetivo || ''}`,
    `ARCO GLOBAL: ${JSON.stringify(foundation.narrative_arc || {})}`,
    'Completa primero room_context para ESTA sala: su aprendizaje, inventario curricular y continuidad. Después redacta plans y mission usando ese contexto en la misma respuesta. El esquema numera la sala localmente. No generes otras salas. Adapta las referencias de la fuente al número de salas configurado; no copies su estructura antigua. Si hay un incoming_state previo, consérvalo.',
    `PEDAGOGÍA: ${JSON.stringify({purpose:foundation.purpose,curriculum_model:foundation.curriculum_model})}`,
    `NARRATIVA ELEGIDA: ${context.narrativa || 'la definida en el proyecto'}. ESCENARIO: ${foundation.project_copy?.setting || ''}`,
    `PLANES INMUTABLES: ${JSON.stringify(template)}`,
    `TIPOS SELECCIONADOS: ${types.map(type=>experience.get(type) ? experienceAuthoringInstruction(type,{filteredTransport:true}) : buildQuestionAuthoringTemplate(type)).join('\n')}`,
    `CASOS YA USADOS (PROHIBIDO REPETIR O REUTILIZAR): ${JSON.stringify((foundation.rooms||[]).filter(r=>r.room_number<room.room_number).flatMap(r=>(r.question_plans||[]).map(({knowledge,application,answer_target})=>({knowledge,application,answer_target}))))}`,
    'PROHIBICIÓN ESTRICTA DE REPETICIÓN ENTRE SALAS: La lista CASOS YA USADOS contiene conceptos (knowledge), casos o enunciados (application, case_data) y soluciones (answer_target) de las salas previas. Está estrictamente prohibido reutilizar, copiar o parafrasear cualquiera de estos elementos en esta sala. Cada pregunta de esta sala debe ser completamente original y evaluar conceptos, situaciones, ejemplos, relaciones y soluciones inéditos y no evaluados anteriormente.',
    ...(sourceContract?.edited_plan_text?[`ESPECIFICACIONES DEL AUTOR: ${sourceContract.edited_plan_text}`]:[]),
    'Application será el enunciado público autosuficiente: datos concretos y una pregunta sin revelar la solución. PigPen lo copia a reto e instruction_outline; copia pista a hint_strategy, feedback correcto a feedback_strategy y reasoning_evidence a evidence. No redactes esas copias. Cada campo de reasoning_steps es un paso distinto. case_data contiene los datos necesarios y application los incorpora literalmente una sola vez, sin una segunda paráfrasis del mismo dato. Evita prefijos administrativos: escribe los hechos como parte de la situación. Usa casos diferentes entre preguntas; un cambio de interfaz no cuenta como caso nuevo. En synthesis combina todos los conocimientos asignados. Evidence y reasoning_evidence justifican la solución.',
    'mission.contexto es la introducción a la lectura. PigPen añadirá knowledge y teaching_example de cada pregunta al briefing visible; por eso esos campos deben enseñar en lenguaje del alumno y no contener metadatos. No los dupliques en mission.contexto. El reto y las pistas no revelan la respuesta; sólo el feedback correcto explica la solución. No incluyas fragmentos del código final ni anuncios de recompensas: PigPen controla su entrega.',
    'En opción múltiple clásica la primera opción privada es correcta y las otras tres son distractores plausibles; PigPen baraja las opciones. En verdadero/falso redacta una afirmación verdadera. En tipos nuevos, las soluciones y reglas ya fijadas indican cuáles etiquetas debes redactar como correctas y cuáles como distractores. Para parejas usa sólo solution_pairs. En drag_drop y relacion_columnas, cada destino (izquierda) y cada ficha (derecha) deben ser estrictamente únicos y distintos entre sí: no agrupes elementos en categorías repetidas (por ejemplo, nunca repitas destinos como "religious power" o "civic power"); formula relaciones curriculares 1 a 1 específicas. Los campos vacíos sin marcador no se rellenan: PigPen los deriva de la solución. Si hay fichas numéricas fijas, redacta un caso compatible con esas cantidades.',
    contentInstructions(document)
  ].join('\n');
}

function buildFixedObjectiveFillShape(schema) {
  if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => [key, buildFixedObjectiveFillShape(child)]));
  if (schema.type === 'array') return Array.from({ length: schema.minItems || 0 }, () => buildFixedObjectiveFillShape(schema.items));
  if (schema.type === 'integer' || schema.type === 'number') return schema.enum?.[0] ?? schema.default ?? schema.minimum ?? 0;
  if (schema.type === 'boolean') return false;
  return schema.enum?.[0] || '';
}

// Transport aliases and scalar representations do not change the authored answer.
function normalizeCombinedRoomResponse(payload = {}, schema = {}) {
  const result = structuredClone(payload);
  const normalizeRules = contract => {
    if (!Array.isArray(contract?.rules)) return;
    for (const rule of contract.rules) {
      if (!rule || typeof rule !== 'object' || !Object.hasOwn(rule, 'type')) continue;
      if (!Object.hasOwn(rule, 'kind')) { rule.kind = rule.type; delete rule.type; }
      else if (rule.kind === rule.type) delete rule.type;
      // Conflicting aliases remain rejected rather than silently choosing one.
    }
  };
  const mission = result?.mission;
  if (Array.isArray(mission?.preguntas)) mission.preguntas.forEach(question => normalizeRules(question?.interaction_data));
  if (mission && typeof mission === 'object' && !Array.isArray(mission) && Object.hasOwn(mission, 'context')) {
    if (!Object.hasOwn(mission, 'contexto')) { mission.contexto = mission.context; delete mission.context; }
    else if (mission.contexto === mission.context) delete mission.context;
  }
  for (const [id, plan] of Object.entries(result?.plans || {})) {
    if (!plan || typeof plan !== 'object') continue;
    // Evidence is private traceability. Recover an omitted summary from the
    // model's own reasoning evidence; never invent evidence or replace a value.
    if (!Object.hasOwn(plan, 'evidence')
      && schema.properties?.plans?.properties?.[id]?.properties?.evidence
      && typeof plan.reasoning_evidence === 'string' && plan.reasoning_evidence.trim()) {
      plan.evidence = plan.reasoning_evidence.trim();
    }
    normalizeRules(plan.interaction_data);
    const mechanic = plan.mechanic_contract;
    if (mechanic && typeof mechanic === 'object') {
      if (mechanic.kind !== 'cipher_assertion' && ['none','cipher','anagram','sequence'].includes(mechanic.kind)) {
        mechanic.claimed_value = '';
      } else if (typeof mechanic.claimed_value === 'boolean' || (typeof mechanic.claimed_value === 'number' && Number.isFinite(mechanic.claimed_value))) {
        mechanic.claimed_value = String(mechanic.claimed_value);
      }
    }
    const minimum = schema.properties?.plans?.properties?.[id]?.properties?.reasoning_steps?.minItems || 1;
    const steps = typeof plan.reasoning_steps === 'string' ? [plan.reasoning_steps] : plan.reasoning_steps;
    if (Array.isArray(steps) && steps.every(step => typeof step === 'string')) {
      // Only separate explicit numbered/bulleted steps already present in the answer.
      const separated = steps.flatMap(step => {
        const text = step.trim();
        // Handle explicit inline numbering as well as numbered lines. Require
        // consecutive numbers so decimal values and incidental numbers stay intact.
        if (/^1[.)]\s+/.test(text)) {
          const parts = text.split(/\s+(?=\d+[.)]\s+)/);
          if (parts.length > 1 && parts.every((part,index) => Number(part.match(/^([0-9]+)[.)]\s+/)?.[1]) === index+1)) return parts;
        }
        return text.split(/\r?\n(?=\s*(?:\d+[.)]|[-*•])\s+)/);
      }).map(part => part.trim()).filter(Boolean);
      if (steps.length < minimum && separated.length >= minimum) plan.reasoning_steps = separated;
      else if (typeof plan.reasoning_steps === 'string') plan.reasoning_steps = steps;
    }
  }
  return result;
}

function buildCombinedRoomFieldRequirements(schema = {}) {
  return Object.entries(schema.properties?.plans?.properties || {}).map(([id, plan]) => {
    const minimum = plan.properties?.reasoning_steps?.minItems || 1;
    const pairRule = plan.properties?.solution_pairs?.minItems ? ` En plans.${id}.solution_pairs cada objeto {izquierda, derecha} debe tener un destino (izquierda) único y una ficha (derecha) única; queda estrictamente prohibido repetir destinos bajo una misma categoría.` : '';
    return `plans.${id}: incluye TODAS las claves obligatorias ${JSON.stringify(plan.required || [])}.${pairRule} evidence es la evidencia evaluable del aprendizaje; reasoning_evidence explica por qué los datos permiten deducir la respuesta. Ambos campos son obligatorios, también en la reserva. plans.${id}.reasoning_steps: lista de al menos ${minimum} pasos de razonamiento distintos y sustantivos, cada paso en un elemento separado. No juntes varios pasos en un único texto. Antes de emitir el JSON verifica la cantidad real de elementos, también cuando hay muchas preguntas en la sala. En interaction_data.rules usa kind (nunca type): cada regla es {kind,a,b,value}; conserva IDs válidos. case_data contiene una o más observaciones completas (sin límite de cuatro): incluye todos los datos necesarios. distractor_errors explica los errores conceptuales de los distractores; una explicación puede abarcar varias opciones. No omitas distractores jugables por agrupar sus explicaciones. mechanic_contract.claimed_value siempre es texto: usa "" cuando kind no sea cipher_assertion; nunca null ni booleanos.`;
  }).concat('mission.contexto es el nombre exacto del briefing (no context). Conserva los nombres de las claves en español aunque redactes su contenido en inglés.').join('\n');
}

function validateFixedObjectiveFill(value, schema, path = '') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path}: debe ser objeto`];
    const issues = Object.keys(value).filter(key => !Object.hasOwn(schema.properties, key)).map(key => `${path}.${key}: campo no permitido`);
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) issues.push(`${path}.${key}: campo obligatorio ausente`);
    }
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(schema.properties, key)) issues.push(...validateFixedObjectiveFill(value[key], schema.properties[key], `${path}.${key}`));
    }
    return issues;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}: debe ser lista`];
    const issues = value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? Infinity) ? [`${path}: se requieren entre ${schema.minItems || 0} y ${schema.maxItems ?? "sin límite"} elementos; se recibieron ${value.length}`] : [];
    return issues.concat(value.flatMap((item, index) => validateFixedObjectiveFill(item, schema.items, `${path}[${index}]`)));
  }
  if (schema.type === 'integer' ? !Number.isInteger(value) : typeof value !== schema.type) return [`${path}: tipo inválido`];
  if (['integer','number'].includes(schema.type) && (!Number.isFinite(value)
    || (Number.isFinite(schema.minimum) && value < schema.minimum)
    || (Number.isFinite(schema.maximum) && value > schema.maximum))) return [`${path}: valor numérico fuera de rango`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: valor no permitido`];
  if (schema.type === 'string' && schema.minLength && value.trim().length < schema.minLength) return [`${path}: no puede estar vacío`];
  return [];
}

function objectivePlanContractIssues(plan = {}, slot = {}) {
  if (experience.get(slot.interaction)) return experience.authoringIssues(slot.interaction, plan.interaction_data).map(issue => `${slot.plan_id || "pregunta"} (${slot.interaction}): ${issue}`);
  const issues = [];
  const interaction = normalizeString(slot.interaction, '').toLowerCase();
  plan = normalizeObjectiveQuestionPlan({ ...plan, interaction }, interaction);
  const pairs = normalizeQuestionPlanSolutionPairs(plan);
  const pairToken = value => normalizeSolutionPairToken(value);
  const pairContext = ['drag_drop', 'relacion_columnas'].includes(interaction) ? buildDragDropPairRepairContext(plan, slot) : null;
  if (interaction === 'drag_drop') {
    if (pairs.length !== 6) issues.push(`${slot.plan_id}: Drag & Drop exige exactamente 6 correspondencias completas en solution_pairs; recibió ${pairs.length}. Completa los seis objetos fijos con relaciones distintas del mismo caso curricular y deriva answer_target de ellos, sin añadir relleno.`);
  } else if (interaction === 'relacion_columnas' && (pairs.length < 2 || pairs.length > 6)) {
    issues.push(`${slot.plan_id}: relación de columnas exige entre 2 y 6 correspondencias completas; recibió ${pairs.length}.`);
  } else if (interaction === 'completar_espacio' && !pairs.length) {
    issues.push(`${slot.plan_id}: completar espacio exige una solución numerada por cada hueco.`);
  }
  if (['drag_drop', 'relacion_columnas'].includes(interaction) && pairs.length) {
    const left = pairs.map(pair => pairToken(pair.izquierda));
    const right = pairs.map(pair => pairToken(pair.derecha));
    if (left.some(value => !value) || right.some(value => !value)
      || pairContext?.hasPairPayloadIssue
      || new Set(left).size !== pairs.length || new Set(right).size !== pairs.length) {
      const duplicates = values => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
      issues.push(`${slot.plan_id}: cada destino y cada ficha deben ser completos y distintos. Destinos repetidos: ${JSON.stringify(duplicates(left))}; respuestas repetidas: ${JSON.stringify(duplicates(right))}. Conserva las relaciones válidas y sustituye las repetidas por relaciones curriculares específicas, no por copias numeradas.`);
    }
  }
  if (interaction === 'completar_espacio' && pairs.some((pair, index) => String(pair.izquierda).trim() !== String(index + 1))) {
    issues.push(`${slot.plan_id}: numera los huecos 1, 2, 3… en answer_target, en el mismo orden de la lectura.`);
  }

  const mechanic = plan.mechanic_contract || {kind:'none'};
  const kind = normalizeString(mechanic.kind, 'none').toLowerCase();
  if (['drag_drop', 'relacion_columnas', 'completar_espacio'].includes(interaction) && kind !== 'none') {
    issues.push(`${slot.plan_id}: ${interaction} ya tiene una solución estructurada en answer_target; usa mechanic_contract.kind="none". Explica el cifrado o la regla en case_data, pero no cifres la lista completa de parejas o huecos.`);
    return issues;
  }
  const inferredKind = inferRequiredObjectiveMechanic({...plan, interaction});
  const publicText = [plan.application, ...(plan.case_data || [])].join(' ');
  const compact = value => pairToken(value).replace(/\s+/g, '');
  const satisfiesInferredMechanic = inferredKind === 'cipher' && interaction === 'verdadero_falso'
    ? kind === 'cipher_assertion'
    : kind === inferredKind;
  if (['cipher', 'anagram'].includes(inferredKind) && !satisfiesInferredMechanic) {
    issues.push(`${slot.plan_id}: la actividad exige ${inferredKind}; declara un mechanic_contract ${inferredKind} completo y coherente con application y answer_target.`);
  }
  if (kind === 'cipher_assertion') {
    const ciphertext = normalizeObjectiveFixedText(mechanic.ciphertext);
    const shift = Math.trunc(Number(mechanic.shift) || 0);
    const alphabet = normalizeObjectiveFixedText(mechanic.alphabet) || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const calculated = ciphertext && shift ? shiftCipherText(ciphertext, -shift, alphabet) : '';
    const computed = normalizeObjectiveFixedText(mechanic.computed_value);
    const claimed = normalizeObjectiveFixedText(mechanic.claimed_value);
    const expectedBoolean = typeof mechanic.expected_boolean === 'boolean'
      ? mechanic.expected_boolean
      : normalizePlanBooleanAnswer(plan.answer_target);
    if (interaction !== 'verdadero_falso') issues.push(`${slot.plan_id}: cipher_assertion sólo es válido para verdadero_falso.`);
    if (!ciphertext || !shift || !computed || compact(calculated) !== compact(computed)) {
      issues.push(`${slot.plan_id}: ciphertext y shift deben producir exactamente computed_value.`);
    }
    if (!claimed) issues.push(`${slot.plan_id}: cipher_assertion requiere claimed_value, el resultado afirmado públicamente.`);
    if (expectedBoolean === null || expectedBoolean !== (compact(computed) === compact(claimed))) {
      issues.push(`${slot.plan_id}: expected_boolean debe indicar si claimed_value coincide con computed_value.`);
    }
    if (normalizePlanBooleanAnswer(plan.answer_target) !== expectedBoolean) {
      issues.push(`${slot.plan_id}: answer_target debe coincidir con expected_boolean.`);
    }
    if (ciphertext && !compact(publicText).includes(compact(ciphertext))) {
      issues.push(`${slot.plan_id}: application o case_data debe contener literalmente el ciphertext ${JSON.stringify(ciphertext)}.`);
    }
    if (claimed && !compact(publicText).includes(compact(claimed))) {
      issues.push(`${slot.plan_id}: application debe contener la afirmación que declara ${JSON.stringify(claimed)}.`);
    }
  }
  if (kind === 'cipher' && !['drag_drop', 'relacion_columnas', 'completar_espacio'].includes(interaction)) {
    const solution = normalizeObjectiveFixedText(mechanic.solution);
    const ciphertext = normalizeObjectiveFixedText(mechanic.ciphertext);
    const shift = Math.trunc(Number(mechanic.shift) || 0);
    const alphabet = normalizeObjectiveFixedText(mechanic.alphabet) || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (!objectiveAnswerTargetsEquivalent(mechanic.solution, plan.answer_target)) issues.push(`${slot.plan_id}: mechanic_contract.solution debe coincidir con answer_target.`);
    if (!ciphertext || !shift || compact(shiftCipherText(ciphertext, -shift, alphabet)) !== compact(solution)) {
      issues.push(`${slot.plan_id}: ciphertext y shift son incompatibles con solution. shift representa el desplazamiento usado para CIFRAR solution; al aplicar -shift a ciphertext debe recuperarse answer_target.`);
    } else if (!compact(publicText).includes(compact(ciphertext))) {
      issues.push(`${slot.plan_id}: application o case_data debe contener literalmente el ciphertext ${JSON.stringify(ciphertext)} que verá el estudiante.`);
    }
  }
  if (kind === 'anagram' && !['drag_drop', 'relacion_columnas', 'completar_espacio'].includes(interaction)) {
    const solution = compact(mechanic.solution);
    const scrambled = compact(mechanic.scrambled);
    const sorted = value => [...value].sort().join('');
    if (!objectiveAnswerTargetsEquivalent(mechanic.solution, plan.answer_target)) issues.push(`${slot.plan_id}: mechanic_contract.solution debe coincidir con answer_target.`);
    if (!scrambled || scrambled === solution || sorted(scrambled) !== sorted(solution)) {
      issues.push(`${slot.plan_id}: scrambled debe contener exactamente las letras de solution, en otro orden.`);
    } else if (!compact(publicText).includes(scrambled)) {
      issues.push(`${slot.plan_id}: application o case_data debe contener literalmente el anagrama ${JSON.stringify(mechanic.scrambled)} que verá el estudiante.`);
    }
  }
  return issues;
}

async function requestFixedObjectiveRoomFill(prompt, context, template, suppliedResponse = null) {
  const schema = buildObjectiveRoomFillResponseSchema(template);
  const accepted = {};
  const allSlots = [...template.question_plans, ...(template.reserve_opportunity ? [template.reserve_opportunity] : [])];
  let pending = schema;
  let requestPrompt = prompt;

  const buildDragDropPairRepairSchema = (planId = "", minItems = 6, maxItems = 6) => ({
    type: "object",
    properties: {
      [planId]: {
        type: "object",
        properties: {
          solution_pairs: {
            type: "array",
            minItems,
            maxItems,
            items: {
              type: "object",
              properties: {
                izquierda: { type: "string", minLength: 1 },
                derecha: { type: "string", minLength: 1 }
              },
              required: ["izquierda", "derecha"]
            }
          }
        },
        required: ["solution_pairs"]
      }
    },
    required: [planId]
  });

  const validateSlotPlan = (plan = {}, slotId = "", slot = {}, slotSchema = {}) => {
    const issues = validateFixedObjectiveFill(plan, slotSchema, slotId);
    if (!issues.length && slot?.interaction === "verdadero_falso") {
      const normalized = normalizeObjectiveQuestionPlan({ ...plan, interaction: slot.interaction });
      if (normalized.mechanic_contract.kind === "cipher_assertion") {
        plan.mechanic_contract = normalized.mechanic_contract;
        plan.answer_target = normalized.answer_target;
      }
    }
    if (!issues.length && slot?.difficulty_policy_version >= 2) {
      const steps = plan.reasoning_steps.map(step => step.trim().toLowerCase());
      if (new Set(steps).size !== steps.length) issues.push(`${slotId}: los pasos de razonamiento no pueden repetirse para alcanzar el mínimo`);
    }
    if (!issues.length && slot?.difficulty_policy_version >= 3) {
      for (const field of ['knowledge','evidence','application','answer_target','reasoning_evidence','cognitive_operation','instruction_outline','hint_strategy','feedback_strategy']) {
        if (!String(plan[field] || '').trim()) issues.push(`${slotId}.${field}: la especificación del acertijo no puede quedar vacía`);
      }
      // Repair only explicit terminal answer-entry instructions when a real
      // case is present. Do not invent clues or alter the private answer.
      if (['texto', 'multimedia', 'opcion_multiple'].includes(slot.interaction) && plan.case_data.some(value => String(value).trim())) {
        for (const field of ['application', 'instruction_outline', 'hint_strategy']) {
          plan[field] = repairAnswerEntryInstruction(plan[field], [plan.answer_target]);
        }
      }
      const pairs = normalizeQuestionPlanSolutionPairs(plan);
      if (['relacion_columnas','drag_drop','completar_espacio'].includes(slot.interaction) && !pairs.length) issues.push(`${slotId}: define answer_target como destino → solución | destino → solución`);
      issues.push(...answerDisclosureIssues({tipo_interaccion:slot.interaction,respuesta_correcta:plan.answer_target,
        reto:[plan.application, plan.instruction_outline, ...plan.case_data].join('\n'),pista:plan.hint_strategy,parejas:pairs}).map(issue => `${slotId}: ${issue}`));
      issues.push(...matchingPromptIssues({tipo_interaccion:slot.interaction,parejas:pairs,reto:plan.application,pista:plan.hint_strategy}).map(issue => `${slotId}: ${issue}`));
    }
    if (!issues.length && slot) issues.push(...objectivePlanContractIssues(plan, slot));
    if (!issues.length && slot && experience.get(slot.interaction)) plan.interaction_data = experience.normalizeContract(plan.interaction_data, slot.interaction);
    return { plan, issues };
  };

  const buildPairRepairPrompt = (slot = {}, base = {}, pairContext = null, expectedCount = 6) => {
    const categoryGuidance = pairContext?.leftDuplicates?.length
      ? `Conflicto de categorías repetidas: detectados destinos repetidos ${JSON.stringify(pairContext.leftDuplicates)}. Cada destino (izquierda) debe ser una entidad, función o concepto curricular específico y único, NO una categoría compartida. Desglosa cada uno en destinos diferenciados.`
      : '';
    return [
      `REPARACIÓN DIRIGIDA: conserva relaciones válidas y regenera solo las parejas repetidas/incompletas del plan ${slot.plan_id}.`,
      `Regla: mantiene un solo criterio curricular común, conserva las pares únicas ya válidas y sustituye solo los conflictos por relaciones nuevas, sin numeración ni copias.`,
      categoryGuidance,
      `Pares válidos ya aceptados para este plan (no las modifiques): ${JSON.stringify(pairContext?.validPairs || [])}`,
      `Posiciones conflictivas detectadas (0-based): ${JSON.stringify(pairContext?.duplicateOrInvalidIndices || [])}`,
      `Devuelve exactamente ${expectedCount} objetos solution_pairs con llaves izquierda y derecha; deben ser ${expectedCount} destinos y ${expectedCount} fichas distintos entre sí.`,
      `Usa como base de la pregunta: ${JSON.stringify({ knowledge: base.knowledge, application: base.application, case_data: base.case_data })}.`,
      `Mantén unchanged: knowledge y case_data; sustituye y devuelve únicamente solution_pairs corregidas.`
    ].filter(Boolean).join('\n');
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = suppliedResponse || await requestQualityJson(requestPrompt, context, 0.24, { responseJsonSchema: pending });
    const failures = [];
    for (const [id, slotSchema] of Object.entries(pending.properties)) {
      const slot = allSlots.find(item => item.plan_id === id);
      if (!slot) {
        failures.push(`No existe un plan mapeado para ${id} en template.`);
        continue;
      }
      let basePlan = response[id] || {};
      let { plan: validatedPlan, issues } = validateSlotPlan(basePlan, id, slot, slotSchema);
      if (issues.length && ["drag_drop", "relacion_columnas"].includes(slot.interaction)) {
        const pairContext = buildDragDropPairRepairContext(validatedPlan, slot);
        const onlyPairProblem = issues.length === 1
          && issues.every(issue => issue.includes("cada destino y cada ficha deben ser completos y distintos."))
          && pairContext?.hasPairPayloadIssue;
        const expectedCount = slot.interaction === "drag_drop"
          ? 6
          : Math.max(2, Math.min(6, validatedPlan.solution_pairs?.length || 4));
        if (onlyPairProblem && pairContext?.duplicateOrInvalidIndices?.length) {
          for (let repairAttempt = 0; repairAttempt < 2; repairAttempt += 1) {
            const pairResponse = await requestQualityJson(buildPairRepairPrompt(slot, validatedPlan, pairContext, expectedCount), context, 0.22, {
              responseJsonSchema: buildDragDropPairRepairSchema(id, expectedCount, expectedCount)
            });
            const replacementPairs = normalizePairList(pairResponse?.[id]?.solution_pairs || []);
            if (replacementPairs.length !== expectedCount) continue;
            const pairFormatter = typeof formatQuestionPlanSolutionPairs === 'function'
              ? formatQuestionPlanSolutionPairs
              : pairs => pairs.map(p => `${p.izquierda} → ${p.derecha}`).join(' | ');
            basePlan = {
              ...validatedPlan,
              ...pairResponse?.[id],
              solution_pairs: replacementPairs,
              answer_target: pairFormatter(replacementPairs)
            };
            ({ plan: validatedPlan, issues } = validateSlotPlan(basePlan, id, slot, slotSchema));
            if (!issues.length) {
              break;
            }
          }
        }
      }
      response[id] = validatedPlan;
      if (issues.length) {
        failures.push(...issues);
      } else accepted[id] = validatedPlan;
    }
    const missing = schema.required.filter(id => !Object.hasOwn(accepted, id));
    if (!missing.length) return accepted;
    if (attempt === 2) throw new Error(`No se pudieron completar los campos fijos: ${failures.join(' · ')}`);
    suppliedResponse = null;
    pending = { type: 'object', properties: Object.fromEntries(missing.map(id => [id, schema.properties[id]])), required: missing };
    requestPrompt = [requestPrompt,
      `RECUPERACIÓN PARCIAL: los espacios aceptados no se deben generar de nuevo. Devuelve únicamente estas claves: ${JSON.stringify(missing)}.`,
      `Errores a corregir: ${JSON.stringify(failures)}.`,
      `Contenido rechazado que debes corregir (únicamente los espacios pendientes): ${JSON.stringify(Object.fromEntries(missing.map(id => [id, response?.[id] ?? null])))}. No copies su error: devuelve cada espacio pendiente completo con sus seis parejas cuando sea drag_drop.`,
      `Contenido válido ya conservado (sólo contexto para evitar repeticiones): ${JSON.stringify(accepted)}`,
      `Esta forma sustituye OUTPUT_FORMAT anterior: ${typeof buildFixedObjectiveFillShape === 'function' ? JSON.stringify(buildFixedObjectiveFillShape(pending)) : ''}`
    ].join('\n');
  }
}

function buildDeterministicRoomCompletionFeedback(room = {}, fragment = "", locale = "en-US") {
  const effect = normalizeString(room?.narrative_beat?.success_change, "");
  const language = normalizeString(locale, "en-US").toLowerCase();
  if (language.startsWith("es")) return `${effect || "La sala queda estabilizada."} Toma ${fragment}.`;
  if (language.startsWith("fr")) return `${effect || "La salle est stabilisée."} Prends ${fragment}.`;
  if (language.startsWith("pt")) return `${effect || "A sala foi estabilizada."} Pegue ${fragment}.`;
  return `${effect || "The room is stable."} Take ${fragment}.`;
}

function buildDeterministicFinalUnlockFeedback(locale = "en-US") {
  const language = normalizeString(locale, "en-US").toLowerCase();
  if (language.startsWith("es")) return "Acceso final desbloqueado. Has completado la misión.";
  if (language.startsWith("fr")) return "Accès final déverrouillé. Tu as terminé la mission.";
  if (language.startsWith("pt")) return "Acesso final desbloqueado. Você concluiu a missão.";
  return "Final access unlocked. You completed the mission.";
}

async function requestFixedFoundationContent(context, sourceContract, roomCount) {
  const fullSchema=buildObjectiveFoundationResponseSchema(roomCount);
  const schema=structuredClone(fullSchema);
  delete schema.properties.rooms;
  schema.required=schema.required.filter(key=>key!=='rooms');
  const value=fixedSchemaValue(schema);
  const document=contentDocument(value);
  const prompt=buildObjectiveFoundationPrompt(context,sourceContract,roomCount)
    .replace(/<OUTPUT_FORMAT>[\s\S]*?<\/OUTPUT_FORMAT>/g,'')
    .replace('Completa sólo los campos globales y de sala de un blueprint pedagógico. No crees preguntas.', 'Completa únicamente el marco global del proyecto. No redactes salas ni preguntas.')
    .replace(`Devuelve exactamente ${roomCount} salas en orden.`, `El proyecto tendrá ${roomCount} salas, que se completarán posteriormente una por una. No devuelvas rooms ni contenido particular de las salas.`)
    .replace('Devuelve únicamente JSON.','Devuelve únicamente los bloques de texto indicados abajo.');
  let response;
  try {
    response=await requestQualityJson(prompt+'\n'+PEDAGOGY_INSTRUCTION+'\n'+selectedExperienceInstruction(context)+'\n'+contentInstructions(document),context,0.32,{singleAttempt:true,minimalPayload:true,textOnly:true,expectedContent:document});
  } catch (error) {
    if (isGeminiQuotaExhausted(error)) {
      error.message = error.modelFallbackUsed
        ? "La solicitud inicial del objetivo no se completó tras dos intentos secuenciales; el último modelo devolvió 429. Este proceso no llegó a generar salas. Espera antes de volver a iniciar."
        : "Vertex rechazó la solicitud inicial del objetivo (429: cuota o capacidad temporal). Este intento no llegó a generar salas. No se reintentó automáticamente. Espera antes de volver a iniciar; el proveedor no ha confirmado cuándo estará disponible.";
    }
    throw error;
  }
  const foundation=fillContentDocument(document,response);
  const issues=validateFixedObjectiveFill(foundation,schema,'Plantilla global');
  if(issues.length)throw Error(issues.join(' · '));
  // Reserve the exact number locally. Room prose is filled in that room's call.
  foundation.rooms=Array.from({length:roomCount},(_,index)=>({
    ...buildFixedObjectiveFillShape(fullSchema.properties.rooms.items),room_number:index+1
  }));
  return foundation;
}

async function compileObjectiveBlueprintFromTemplate(context = {}, sourceContract = null) {
  const contentModel = context.contentModel || context.modeloObjetivo || context.modelo || TEXT_MODEL_DEFAULT;
  context = { ...context, contentModel, modeloObjetivo: contentModel, modelo: contentModel };
  const roomCount = Math.max(1, Math.min(8, Number(context.misiones) || 4));
  const templates = buildDeterministicQuestionPlanTemplate(context, sourceContract);
  const checkpointKey = 'pigpen.objectiveRoomCheckpoint.v1';
  const fingerprint = JSON.stringify(["room-context-spatial-v2", PEDAGOGY_VERSION, buildObjectiveBlueprintKey(context, sourceContract), sourceContract?.edited_plan_text || '', sourceContract?.explicit_title || '', sourceContract?.fixed_final_code || '']);
  let checkpoint = null;
  try { const saved = await objectiveCheckpointStore.load(checkpointKey); if (saved?.fingerprint === fingerprint) checkpoint = saved; } catch {}
  setStatus("Preparando el objetivo…", "info");
  const foundationPayload = checkpoint?.foundation || await requestFixedFoundationContent(context, sourceContract, roomCount);
  let foundation = checkpoint ? structuredClone(checkpoint.foundation) : normalizeObjectiveBrief(foundationPayload);
  foundation.rooms = foundation.rooms.slice(0, roomCount);
  if (foundation.rooms.length !== roomCount) {
    throw new Error(`La plantilla global debía llenar ${roomCount} salas y devolvió ${foundation.rooms.length}.`);
  }
  if (sourceContract?.explicit_title) foundation.project_copy.title = sourceContract.explicit_title;
  if (sourceContract?.fixed_final_feedback) foundation.final_unlock.feedback = sourceContract.fixed_final_feedback;
  const fixedFragments = normalizeTextList(sourceContract?.fixed_code_fragments || []).map(normalizeObjectiveUnlockFragment).filter(Boolean);
  const fixedFragmentsWord = fixedFragments.length === roomCount
    ? normalizeThematicFinalWord(fixedFragments.join(""), roomCount)
    : "";
  const initialCode = sourceContract?.fixed_final_code
    || fixedFragmentsWord
    || foundation.final_unlock.code;
  const normalizedInitialCode = normalizeThematicFinalWord(initialCode, roomCount);
  const repairedUnlockCode = !normalizedInitialCode;
  const finalCode = normalizedInitialCode
    || await requestThematicObjectiveUnlockWord(context, foundation, roomCount, initialCode);
  foundation.final_unlock.code = finalCode;
  if (sourceContract?.rejected_invalid_unlock
    || repairedUnlockCode
    || objectiveFeedbackContainsNumericUnlock(foundation.final_unlock.feedback)) {
    foundation.final_unlock.feedback = buildDeterministicFinalUnlockFeedback(context.idioma);
  }
  const fragments = fixedFragments.length === roomCount && fixedFragments.join("") === finalCode
    ? fixedFragments
    : partitionThematicFinalWord(finalCode, roomCount);

  const saveCheckpoint = async nextRoom => {
    await objectiveCheckpointStore.save(checkpointKey, { fingerprint, foundation, nextRoom });
  };
  await saveCheckpoint(checkpoint?.nextRoom || 0);
  for (let roomIndex = checkpoint?.nextRoom || 0; roomIndex < roomCount; roomIndex += 1) {
    const room = foundation.rooms[roomIndex];
    const template = templates[roomIndex];
    room.room_number = roomIndex + 1;
    room.interaction_anchor = template.interaction_anchor;
    if (roomIndex > 0) room.narrative_beat.incoming_state = foundation.rooms[roomIndex - 1].narrative_beat.next_state;
    setStatus(`Completando la sala ${roomIndex + 1} de ${roomCount} …`, "info");
    room.fixed_code_fragment = fragments[roomIndex] || "";
    room.question_plans = structuredClone(template.question_plans);
    const questionCount = template.question_plans.length;
    const roomInteractionPlan = template.question_plans.map(slot => slot.interaction);
    const combinedSchema = { type: 'object', properties: {
      plans: buildObjectiveRoomFillResponseSchema(template),
      room_context: (() => {
        const schema=structuredClone(buildObjectiveFoundationResponseSchema(roomCount).properties.rooms.items);
        schema.properties.room_number={type:'integer',enum:[roomIndex+1]};
        return schema;
      })(),
      ...buildRoomBundleResponseSchema(questionCount, getRequiredBriefingEvidenceCount(context)).properties
    }, required: ['plans','room_context','mission'] };
    const fixedContent = buildFixedRoomContent(combinedSchema, template);
    if (roomIndex > 0) {
      const field = fixedContent.fields.find(item => item.path.join('.') === 'room_context.narrative_beat.incoming_state');
      fixedContent.template.room_context.narrative_beat.incoming_state = foundation.rooms[roomIndex - 1].narrative_beat.next_state;
      if (field) fixedContent.fields = fixedContent.fields.filter(item => item.id !== field.id);
    }
    const previousPlans = foundation.rooms.slice(0, roomIndex).flatMap((previousRoom) => previousRoom.question_plans || []);
    let combined = null;
    let filled = null;
    let remainingRepeats = [];
    for (let roomAttempt = 0; roomAttempt < 2; roomAttempt += 1) {
      const roomText = await requestQualityJson(
        buildFixedRoomTextPrompt(context, sourceContract, foundation, room, template, fixedContent),
        context, 0.32, { singleAttempt: true, minimalPayload: true, textOnly: true, expectedContent: fixedContent, validateContent: text => {
          const preview = materializeFixedRoomContent(fixedContent, text, combinedSchema, template);
          const issues = template.question_plans.flatMap((slot, index) => expressionRiddleIssues(preview.mission.preguntas[index], { ...preview.plans[slot.plan_id], interaction: slot.interaction }));
          const previewPlans = template.question_plans.map((slot) => mergeFilledQuestionPlanWithTemplate(preview.plans[slot.plan_id], slot));
          const repeats = findRepeatedQuestionPlans(previewPlans, previousPlans);
          if (repeats.length) issues.push(...repeats.map(issue => `pregunta ${issue.index + 1}: ${issue.message}`));
          return issues;
        } });
      combined = materializeFixedRoomContent(fixedContent, roomText, combinedSchema, template);
      const combinedIssues = validateFixedObjectiveFill(combined, combinedSchema, `Sala ${roomIndex + 1}`);
      if (combinedIssues.length) throw new Error(combinedIssues.join(' · '));
      Object.assign(room, combined.room_context);
      if (roomIndex > 0) room.narrative_beat.incoming_state = foundation.rooms[roomIndex - 1].narrative_beat.next_state;
      const fillPrompt = buildObjectiveRoomFillPrompt(context, sourceContract, foundation, room, template);
      filled = await requestFixedObjectiveRoomFill(fillPrompt, context, template, combined.plans || {});
      for (const [index, question] of (combined.mission.preguntas || []).entries()) {
        const slot = template.question_plans[index];
        const plan = filled[slot?.plan_id];
        if (plan && ['texto', 'multimedia', 'opcion_multiple'].includes(slot.interaction)) {
          for (const field of ['reto', 'pista', 'retroalimentacion_incorrecta']) {
            if (typeof question[field] === 'string') question[field] = repairAnswerEntryInstruction(question[field], [plan.answer_target]);
          }
        }
      }
      room.question_plans = template.question_plans.map((slot) => (
        mergeFilledQuestionPlanWithTemplate(filled[slot.plan_id], slot)
      ));
      remainingRepeats = findRepeatedQuestionPlans(room.question_plans, previousPlans);
      if (!remainingRepeats.length) break;
      if (roomAttempt === 0) {
        setStatus(`Detectadas preguntas repetidas en la sala ${roomIndex + 1}. Regenerando con conceptos alternativos…`, "info");
      }
    }
    if (remainingRepeats.length) throw new Error(`Sala ${roomIndex + 1}: ${remainingRepeats.map((issue) => `pregunta ${issue.index + 1}: ${issue.message}`).join(" · ")}`);
    room.curriculum_inventory = {
      ...room.curriculum_inventory,
      knowledge: [...new Set(room.question_plans.map(plan => plan.knowledge))],
      teaching_examples: [...new Set(room.question_plans.map(plan => plan.teaching_example))]
    };
    room.reserve_opportunity = mergeFilledQuestionPlanWithTemplate(filled[template.reserve_opportunity.plan_id], template.reserve_opportunity);
    room.fixed_code_fragment = fragments[roomIndex] || "";
    const fixedFeedback = sourceContract?.fixed_room_feedback?.[roomIndex];
    if (sourceContract?.rejected_invalid_unlock
      || repairedUnlockCode
      || objectiveFeedbackContainsNumericUnlock(room.room_completion_feedback)) {
      room.room_completion_feedback = buildDeterministicRoomCompletionFeedback(room, room.fixed_code_fragment, context.idioma);
    } else if (fixedFeedback) room.room_completion_feedback = fixedFeedback;
    else if (!objectiveFeedbackContainsFragment(room.room_completion_feedback, room.fixed_code_fragment)) {
      room.room_completion_feedback = buildDeterministicRoomCompletionFeedback(room, room.fixed_code_fragment, context.idioma);
    }
    foundation = materializeObjectiveBlueprintMechanics(foundation);
    const materializationContext = { ...context, objectiveBlueprint: foundation };
    const mission = await requestGeneratedRoomBundle(materializationContext, roomIndex, { roomInteractionPlan, suppliedResponse: { mission: combined.mission } });
    setStatus(`Comprobando las preguntas de la sala ${roomIndex + 1} de ${roomCount}…`, "info");
    const pedagogyIssues = [
      ...pedagogicalRoomIssues(mission, room.question_plans),
      ...room.question_plans.flatMap((plan,index)=>[...coordinateRiddleIssues(mission.preguntas[index],plan),...expressionRiddleIssues(mission.preguntas[index],plan)].map(issue=>`${plan.plan_id}: ${issue}`))
    ];
    if (pedagogyIssues.length) throw new Error(`Revisión pedagógica: ${pedagogyIssues.join(' · ')}`);
    setObjectiveGeneratedRoom(foundation, roomIndex, mission, materializationContext, roomInteractionPlan);
    await saveCheckpoint(roomIndex + 1);

  }
  const blueprint = materializeObjectiveBlueprintMechanics(foundation);
  blueprint.experience_config = experience.config(context.experience_config);
  blueprint.reward_plan = rewardEngine.buildPlan(blueprint.experience_config, foundation.final_unlock.code, foundation.rooms.map((room, i) => ({ id: String(i), titulo: room.title, fragment: fragments[i], learning: room.learning_focus })));
  blueprint.materialization_report = {
    contractVersion: OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION,
    completedRooms: roomCount, totalRooms: roomCount, failures: []
  };
  await objectiveCheckpointStore.remove(checkpointKey);
  return blueprint;
}

async function generateEnrichedObjectiveBrief(context = {}) {
  const sourceContract = context.sourceContract || buildObjectiveSourceContract(context, {
    editedPlanText: context.editedPlanText || ""
  });
  const compilationContext = {
    ...context,
    objetivo: sourceContract.edited_plan_text || sourceContract.original_objective,
    sourceContract
  };
  const generatedBrief = await compileObjectiveBlueprintFromTemplate(compilationContext, sourceContract);
  const brief = attachObjectiveCompilationMetadata(generatedBrief, compilationContext, sourceContract);
  brief.quality_report = {
    ...brief.quality_report,
    status: "plan_created",
    structural: true,
    deterministic: brief.verified_mechanics.every((item) => item.verified),
    publication: false,
    issues: []
  };
  return brief;
}

function activateObjectiveBrief(brief = {}, planText = "", { editedPlanText = "" } = {}) {
  const finalText = normalizeString(planText, "");
  if (!finalText || !brief?.source_contract) {
    throw new Error("El plan creado no contiene su texto o contrato de origen.");
  }
  const activeBrief = structuredClone(brief);
  activeBrief.source_contract = {
    ...activeBrief.source_contract,
    applied_plan_text: finalText,
    edited_plan_text: normalizeString(editedPlanText, "")
  };
  activeBrief.plan_fingerprint = stableObjectiveFingerprint(JSON.stringify({
    previous: activeBrief.plan_fingerprint,
    plan_text: finalText,
    configuration: activeBrief.source_contract.configuration_fingerprint
  }));
  const objectiveInput = document.getElementById("objetivoInput");
  if (objectiveInput) objectiveInput.value = finalText;
  const nextContext = { ...getFormData(), objetivo: finalText };
  const activeConfiguration = getObjectiveConfigurationContract(nextContext);
  activeBrief.source_contract.configuration = activeConfiguration;
  activeBrief.source_contract.configuration_fingerprint = stableObjectiveFingerprint(JSON.stringify(activeConfiguration));
  state.objectiveBlueprint = activeBrief;
  state.objectiveBlueprintKey = buildObjectiveBlueprintKey(nextContext, activeBrief.source_contract);
  persistObjectiveBlueprint(state.objectiveBlueprintKey, activeBrief);
  saveFormState();
  syncActionButtons();
  return activeBrief;
}

function getObjectiveSuggestionContext() {
  const formData = getFormData();
  if (!formData.tema) {
    setStatus("Por favor, ingresa primero un tema curricular para poder sugerir un objetivo.", "warning");
    document.getElementById("temaInput")?.focus();
    return null;
  }
  return {
    ...formData,
    misiones: normalizePositiveInteger(formData.misiones, 4),
    preguntasPorSala: normalizePositiveInteger(formData.preguntasPorSala, 4)
  };
}

async function sugerirObjetivoFinal({ showModal = true, throwOnError = false } = {}) {
  if (experienceConfirmationRequired && !(await experienceModal.open())) { if (throwOnError) throw new Error("Configura preguntas y recompensas antes de continuar."); return null; }
  const context = getObjectiveSuggestionContext();
  if (!context) {
    if (throwOnError) throw new Error("El brief necesita un tema curricular antes de enriquecer el objetivo.");
    return null;
  }

  const existingContract = state.objectiveBlueprint?.source_contract || null;
  const objectiveKey = buildObjectiveBlueprintKey(context, existingContract);
  const reusableBlueprint = state.objectiveBlueprintKey === objectiveKey
    ? state.objectiveBlueprint
    : restoreCachedObjectiveBlueprint(context);
  const previousContract = reusableBlueprint?.source_contract || state.objectiveBlueprint?.source_contract || null;
  const objectiveWasEdited = previousContract?.applied_plan_text
    && normalizeString(previousContract.applied_plan_text, "") !== normalizeString(context.objetivo, "");
  const sourceContract = previousContract
    ? buildObjectiveSourceContract({ ...context, sourceContract: previousContract }, {
      editedPlanText: objectiveWasEdited ? context.objetivo : ""
    })
    : buildObjectiveSourceContract(context);
  const enrichmentContext = {
    ...context,
    sourceContract,
    editedPlanText: sourceContract.edited_plan_text,
    preservedProjectTitle: normalizeString(reusableBlueprint?.project_copy?.title, "")
      || sourceContract.explicit_title
  };

  const btn = elements.btnSugerirObjetivo;
  const originalText = btn ? btn.innerHTML : "";
  setButtonLoading(btn, true, context.objetivo ? "Recreando objetivo..." : "Creando objetivo...", originalText);
  setObjectiveEnrichmentLoading(true);
  try {
    const brief = await generateEnrichedObjectiveBrief(enrichmentContext);
    const proposedText = formatObjectiveBrief(brief, context.idioma);
    if (!proposedText) {
      const error = new Error("No se recibió un brief pedagógico claro. Intenta de nuevo.");
      setStatus(error.message, "warning");
      if (throwOnError) throw error;
      return null;
    }
    if (elements.objectiveIdeaTextarea) {
      elements.objectiveIdeaTextarea.value = proposedText;
    }
    const activeBrief = activateObjectiveBrief(brief, proposedText);
    if (showModal) {
      state.pendingObjectiveBrief = {
        brief: activeBrief,
        proposedText,
        sourceContract: activeBrief.source_contract
      };
      const modal = getObjectiveIdeaModal();
      if (modal) {
        modal.show();
        window.setTimeout(() => elements.objectiveIdeaTextarea?.focus(), 180);
      }
    } else {
      state.pendingObjectiveBrief = null;
    }
    const materialization = activeBrief.materialization_report || {};
    const pendingRoomCount = Math.max(0, Number(materialization.totalRooms || 0) - Number(materialization.completedRooms || 0));
    const completionNote = pendingRoomCount
      ? ` ${pendingRoomCount} sala${pendingRoomCount === 1 ? "" : "s"} quedó pendiente y se completará al generar.`
      : " Las salas ya contienen el contenido final; al generar sólo faltará preparar las imágenes.";
    setStatus((showModal
      ? (context.objetivo
          ? "Objetivo recreado, enriquecido y aplicado. Puedes revisarlo o editarlo."
          : "Objetivo creado y aplicado. Puedes revisarlo o editarlo.")
      : "Objetivo enriquecido y aceptado automáticamente.") + completionNote, pendingRoomCount ? "warning" : "success");
    return activeBrief;
  } catch (err) {
    console.error("Error al sugerir objetivo final:", err);
    setStatus(err?.message || "Error al crear o enriquecer el objetivo. Intenta de nuevo.", "bad");
    if (throwOnError) throw err;
    return null;
  } finally {
    setObjectiveEnrichmentLoading(false);
    setButtonLoading(btn, false, "Creando objetivo...", originalText);
  }
}

async function applyObjectiveBriefDraft() {
  const proposedText = String(elements.objectiveIdeaTextarea?.value || "").trim();
  if (!proposedText) {
    setStatus("El brief pedagógico está vacío.", "warning");
    elements.objectiveIdeaTextarea?.focus();
    return;
  }
  const pending = state.pendingObjectiveBrief;
  if (!pending?.brief || !pending?.sourceContract) {
    setStatus("El plan perdió su contrato de origen. Vuelve a recrearlo antes de aplicarlo.", "warning");
    return;
  }
  const button = elements.btnObjectiveIdeaGenerate;
  const idleHtml = button?.innerHTML || "";
  setButtonLoading(button, true, "Aplicando plan...", idleHtml);
  try {
    if (pending.proposedText === proposedText) {
      state.pendingObjectiveBrief = null;
      getObjectiveIdeaModal()?.hide();
      syncActionButtons();
      setStatus("El plan ya estaba aplicado y está listo para generar el escape room.", "success");
      return;
    }
    let brief = structuredClone(pending.brief);
    let finalText = proposedText;
    const currentContext = getObjectiveSuggestionContext();
    if (!currentContext) return;
    const sourceContract = buildObjectiveSourceContract({
      ...currentContext,
      sourceContract: pending.sourceContract
    }, { editedPlanText: proposedText });
    setStatus("Recreando el objetivo con los cambios manuales…", "info");
    brief = await generateEnrichedObjectiveBrief({
      ...currentContext,
      objetivo: sourceContract.original_objective,
      sourceContract,
      editedPlanText: proposedText,
      preservedProjectTitle: sourceContract.explicit_title || brief.project_copy?.title
    });
    finalText = formatObjectiveBrief(brief, currentContext.idioma);
    activateObjectiveBrief(brief, finalText, { editedPlanText: proposedText });
    state.pendingObjectiveBrief = null;
    getObjectiveIdeaModal()?.hide();
    setStatus("Plan pedagógico creado y aplicado. Ya puedes generar el escape room.", "success");
  } catch (error) {
    console.error("No se pudo recompilar el plan pedagógico:", error);
    syncObjectivePlanStatus({ requiresReview: true });
    setStatus(`El plan requiere revisión: ${error?.message || "no superó su contrato estructural"}`, "bad");
  } finally {
    setButtonLoading(button, false, "Aplicando plan...", idleHtml);
  }
}

elements.btnSugerirObjetivo?.addEventListener("click", () => void sugerirObjetivoFinal());
elements.btnObjectiveIdeaGenerate?.addEventListener("click", () => void applyObjectiveBriefDraft());

elements.btnLimpiar.addEventListener("click", () => {
  state.formPersistenceSuspended = true;
  try {
    clearFormState();
    clearProjectState();
    elements.form.reset();
    experienceConfig = readQuestionPreferences();
    experienceConfirmationRequired = false;
    document.getElementById("duracionInput").value = 24;
    document.getElementById("duracionInput").dataset.durationMode = "auto";
    document.getElementById("numMisionesInput").value = 4;
    document.getElementById("preguntasPorSalaInput").value = 4;
    document.getElementById("ritmoSelect").value = "progresivo";
    document.getElementById("dificultadSelect").value = "equilibrada";
    document.getElementById("pistasSelect").value = "moderadas";
    if (elements.objetivoModeloSelect) elements.objetivoModeloSelect.value = TEXT_MODEL_DEFAULT;
    if (elements.imagenModeloSelect) elements.imagenModeloSelect.value = IMAGE_MODEL_DEFAULT;
    state.project = null;
    state.selectedMissionId = null;
    state.selectedQuestionId = null;
    state.selectedBriefingMissionId = null;
    state.expandedMissionIds.clear();
    state.activeTab = "preview";
    state.generationNote = "";
    state.objectiveBlueprint = null;
    state.objectiveBlueprintKey = "";
    state.pendingObjectiveBrief = null;
    state.pendingGenerationDraft = null;
    state.pendingGenerationDraftKey = "";
    persistObjectiveBlueprint();
    elements.jsonPreview.textContent = "";
    elements.previewFrame.removeAttribute("srcdoc");
    renderMissionEditor();
    renderOutputsNow();
    setStatus("Formulario y editor listos para un nuevo escape room.", "info");
  } finally {
    state.formPersistenceSuspended = false;
    syncAcademicFields();
    syncNarrativaCustomField();
    syncImageStyleCustomField();
  }
});

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.erTab || "preview"));
});

elements.deleteQuestionDialog?.addEventListener("close", () => {
  const pendingRemoval = state.pendingQuestionRemoval;
  const shouldDelete = elements.deleteQuestionDialog.returnValue === "confirm";
  state.pendingQuestionRemoval = null;
  elements.deleteQuestionDialog.returnValue = "";
  if (!pendingRemoval) return;
  if (shouldDelete) {
    commitQuestionRemoval(pendingRemoval.missionIndex, pendingRemoval.questionIndex);
    return;
  }
  window.requestAnimationFrame(() => pendingRemoval.returnFocus?.focus?.());
});

window.addEventListener("message", (event) => {
  if (event.source !== elements.previewFrame?.contentWindow) return;
  // Un iframe srcdoc sin allow-same-origin tiene un origen opaco por diseño.
  if (event.origin !== "null") return;
  const payload = event.data;
  if (!payload || typeof payload !== "object") return;
  if (payload.type === "pigpen-preview-fullscreen-toggle") {
    togglePreviewStudioFullscreen().catch((error) => {
      console.warn("No se pudo cambiar la preview a pantalla completa:", error);
      syncPreviewStudioFullscreenState();
    });
    return;
  }
  if (payload.type !== "pigpen-editorial-action") return;
  if (!["start", "verify", "autofill"].includes(payload.action)) return;
  syncPreviewEditorialButton(payload.action, typeof payload.label === "string" ? payload.label.slice(0, 160) : "");
});

elements.previewFrame?.addEventListener("load", () => {
  focusSelectedQuestionInPreview();
  syncPreviewStudioFullscreenState();
});

document.addEventListener("fullscreenchange", syncPreviewStudioFullscreenState);
document.addEventListener("webkitfullscreenchange", syncPreviewStudioFullscreenState);
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !elements.studioWorkspace?.classList.contains("is-preview-fullscreen")) return;
  elements.studioWorkspace.classList.remove("is-preview-fullscreen");
  syncPreviewStudioFullscreenState();
});

wireCreatorExitProtection();

if (elements.form) {
  const durationInput = document.getElementById("duracionInput");
  const markDurationAsManual = () => {
    if (!durationInput || state.formPersistenceSuspended) return;
    durationInput.dataset.durationMode = "manual";
    if (state.project) scheduleOutputRefresh();
  };
  durationInput?.addEventListener("input", markDurationAsManual);
  durationInput?.addEventListener("change", markDurationAsManual);
  [document.getElementById("numMisionesInput"), elements.preguntasPorSalaInput].forEach((input) => {
    const syncDurationFromConfiguration = () => {
      syncConfiguredEstimatedDuration();
      if (state.project) scheduleOutputRefresh();
    };
    input?.addEventListener("input", syncDurationFromConfiguration);
    input?.addEventListener("change", syncDurationFromConfiguration);
  });
  elements.form.addEventListener("input", saveFormState);
  document.getElementById("objetivoInput")?.addEventListener("input", (event) => {
    const currentObjective = String(event.currentTarget?.value || "").trim();
    if (state.objectiveBlueprintKey === buildObjectiveBlueprintKey({ ...getFormData(), objetivo: currentObjective })) return;
    state.pendingGenerationDraft = null;
    state.pendingGenerationDraftKey = "";
    syncActionButtons();
  });
  elements.form.addEventListener("change", saveFormState);
  const objectivePlanDependencyIds = new Set([
    "temaInput", "objetivoInput", "nivelSelect", "gradoSelect", "trimestreSelect", "materiaSelect",
    "unidadTemaSelect", "estacionSelect", "idiomaSelect", "numMisionesInput", "preguntasPorSalaInput",
    "objetivoModeloSelect", "modoPresentacionSelect", "narrativaSelect", "narrativaCustomInput", "ritmoSelect",
    "dificultadSelect", "pistasSelect", "publicoSelect", "duracionInput", "estiloImagenSelect", "estiloImagenCustomInput"
  ]);
  const markObjectivePlanStaleWhenNeeded = (event) => {
    if (!objectivePlanDependencyIds.has(event.target?.id)) return;
    if (!isObjectiveBlueprintCurrent()) {
      state.pendingGenerationDraft = null;
      state.pendingGenerationDraftKey = "";
    }
    syncActionButtons();
  };
  elements.form.addEventListener("input", markObjectivePlanStaleWhenNeeded);
  elements.form.addEventListener("change", markObjectivePlanStaleWhenNeeded);
}

[elements.objetivoModeloSelect, elements.imagenModeloSelect].forEach((select) => {
  select?.addEventListener("change", () => {
    delete select.dataset.pendingModelValue;
    saveFormState();
  });
});
elements.modelConfigModal?.addEventListener("show.bs.modal", () => {
  void loadGeminiModelCatalog();
});

function normalizeSheetImportToken(value = "") { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase(); }
function selectSheetImportOption(select, value, customInput = null) {
  const raw = String(value || "").trim(); if (!select || !raw) return false; const token = normalizeSheetImportToken(raw);
  const option = Array.from(select.options).find((item) => { const label = normalizeSheetImportToken(item.textContent || ""), optionValue = normalizeSheetImportToken(item.value || ""); return label === token || optionValue === token || label.includes(token) || token.includes(label); });
  if (option) { select.value = option.value; return true; }
  if (Array.from(select.options).some((item) => item.value === "otro") && customInput) { select.value = "otro"; customInput.value = raw; return true; }
  return false;
}
function normalizeSheetLevel(value = "") { const token = normalizeSheetImportToken(value); return /primary|primaria/.test(token) ? "Primaria" : /junior high|secondary|secundaria/.test(token) ? "Secundaria" : String(value || "").trim(); }
function normalizeSheetGrade(value = "") { const token = normalizeSheetImportToken(value), words = { first:1,primero:1,second:2,segundo:2,third:3,tercero:3,fourth:4,cuarto:4,fifth:5,quinto:5,sixth:6,sexto:6 }, number = Number(token.match(/\d+/)?.[0] || words[token] || 0); return ["","Primero","Segundo","Tercero","Cuarto","Quinto","Sexto"][number] || String(value || "").trim(); }
function normalizeSheetSubject(value = "") { const token = normalizeSheetImportToken(value); return token === "english" ? "Inglés" : token === "spanish" ? "Español" : String(value || "").trim(); }
async function applyImportedSheetRow(row = {}) {
  if (createSessionFromSheetsPending) {
    await createBlankSession({ announce: false });
    createSessionFromSheetsPending = false;
  }
  let count = 0;
  const applySelect = (select,value) => { if (!String(value || "").trim()) return false; const applied = selectSheetImportOption(select,value); if (applied) count += 1; return applied; };
  const applyInput = (input,value) => { const clean = String(value || "").trim(); if (!input || !clean) return false; input.value = clean; count += 1; return true; };
  if (String(row.level || "").trim()) { applySelect(elements.nivelSelect,normalizeSheetLevel(row.level)); syncAcademicFields(); }
  applySelect(elements.gradoSelect,normalizeSheetGrade(row.grade)); applySelect(elements.trimestreSelect,String(row.trimester || "").replace(/[^0-9]/g,"")); applySelect(elements.materiaSelect,normalizeSheetSubject(row.subject)); applySelect(elements.unidadTemaSelect,String(row.unit || "").match(/\d+/)?.[0] || row.unit);
  applyInput(document.getElementById("temaInput"),row.curricularTopic); applyInput(document.getElementById("objetivoInput"),row.objective);
  if (String(row.narrative || "").trim() && selectSheetImportOption(elements.narrativaSelect,row.narrative,elements.narrativaCustomInput)) count += 1; syncNarrativaCustomField();
  if (String(row.illustrationStyle || "").trim() && selectSheetImportOption(elements.estiloImagenSelect,row.illustrationStyle,elements.estiloImagenCustomInput)) count += 1; syncImageStyleCustomField();
  // The user owns room/question counts; importing curriculum must not replace them.
  // Sheets briefs start with multi-step reasoning before the objective is compiled.
  document.getElementById("dificultadSelect").value = "desafiante";
  syncConfiguredEstimatedDuration(); syncAcademicFields();
  state.pendingGenerationDraft = null; state.pendingGenerationDraftKey = "";
  saveFormState(); syncActionButtons(); scheduleSessionSave(); return count;
}
experienceModal = mountExperienceModal({
  getConfig: () => experienceConfig,
  getStructure: () => ({ rooms: Number(document.getElementById("numMisionesInput").value), questionsPerRoom: Number(elements.preguntasPorSalaInput.value) }),
  isBusy: () => state.isGenerating || state.isGeneratingImagesInBackground,
  onSave: async (config, structure) => {
    const roomsInput = document.getElementById("numMisionesInput");
    const changed = JSON.stringify(experienceConfig) !== JSON.stringify(config)
      || Number(roomsInput.value) !== structure.rooms || Number(elements.preguntasPorSalaInput.value) !== structure.questionsPerRoom;
    roomsInput.value = structure.rooms;
    elements.preguntasPorSalaInput.value = structure.questionsPerRoom;
    syncConfiguredEstimatedDuration();
    experienceConfig = config;
    if (!saveQuestionPreferences(config)) console.warn("No se pudieron guardar los tipos de preguntas en localStorage.");
    experienceConfirmationRequired = false;
    if (changed) { state.pendingGenerationDraft = null; state.pendingGenerationDraftKey = ""; }
    saveFormState(); syncActionButtons(); scheduleSessionSave();
    syncObjectivePlanStatus({ requiresReview: changed });
  }
});
document.getElementById('btnExperienceConfig')?.addEventListener('click', () => void experienceModal.open());
window.PigPenSheetsImport?.init({
  getUser: () => state.currentUser,
  getFormState: serializeFormState,
  onApply: async row => { const count = await applyImportedSheetRow(row); experienceConfirmationRequired = true; saveFormState(); return count; },
  onConfigure: () => experienceModal.open(),
  onEnrich: () => sugerirObjetivoFinal({ showModal: false, throwOnError: true }),
  onGenerate: () => generateEscapeRoomFromBrief(null, { throwOnError: true }),
  onStatus: setStatus
});

elements.nivelSelect?.addEventListener("change", syncAcademicFields);
elements.narrativaSelect?.addEventListener("change", syncNarrativaCustomField);
elements.estiloImagenSelect?.addEventListener("change", syncImageStyleCustomField);
elements.modoPresentacionSelect?.addEventListener("change", handlePresentationModeChange);
elements.idiomaSelect?.addEventListener("change", () => {
  if (!state.project) return;
  state.project = normalizeEscapeRoomProject({
    ...state.project,
    idioma: elements.idiomaSelect?.value || "es-419"
  });
  renderMissionEditor();
  renderOutputsNow();
});
elements.generalContentInputs.forEach((field) => {
  field.addEventListener("input", (event) => updateGeneralProjectField(event.currentTarget, event.currentTarget.value));
});
elements.btnReplaceCoverImage?.addEventListener("click", () => {
  if (!state.project || isGenerationBusy()) return;
  const fileInput = getActivityImageFileInput();
  if (!fileInput) return;
  state.pendingImageReplacementTarget = { type: "cover" };
  fileInput.value = "";
  fileInput.click();
});
elements.btnRegenerateEndingImage?.addEventListener("click", regenerateEndingImageOnly);
elements.btnReplaceEndingImage?.addEventListener("click", () => {
  if (!state.project || isGenerationBusy() || state.isLoading) return;
  const fileInput = getActivityImageFileInput();
  if (!fileInput) return;
  state.pendingImageReplacementTarget = { type: "ending" };
  fileInput.value = "";
  fileInput.click();
});
elements.btnRegenerateCoverImage?.addEventListener("click", () => {
  void regenerateCoverImageOnly();
});

mountStudioPanels();
wireBriefSectionPersistence();
wireSummaryBarMeasurements();
restoreSessionsWidth();
restoreBriefWidth();
restoreInspectorWidth();
restoreMissionWorkspaceWidth();
setInspectorTab("topics");
syncStudioPanels();
wireStudioShell();
wireMissionNavigatorEvents();
restoreFormState();
sanitizeRestoredModelSelections();
restoreProjectState();
restoreSessionFiltersFromStorage();
restoreTheme();
restorePreviewTheme({ preferProject: true });
syncAcademicFields();
syncNarrativaCustomField();
syncImageStyleCustomField();
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
