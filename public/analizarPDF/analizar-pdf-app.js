import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { auth } from "../js/firebase-instance.js";
import { animate as animeAnimate, remove as animeRemove, spring, stagger } from "../vendor/animejs/anime.esm.min.js";
import {
  createAnalizarPdfSessionStore,
  createEmptyAnalizarPdfSession,
  loadSessionDetail,
  loadSessions,
  pollAnalysisStatus,
  saveSession
} from "./analizar-pdf-session-store.js?v=2026-1.0.10.746";
import { createAnalizarPdfSidepanelApi } from "./analizar-pdf-sidepanel.js?v=2026-1.0.10.617";
import {
  createAnalizarPdfResultsRenderer,
  getAnalizarPdfAnalysisCategories,
} from "./analizar-pdf-results.js?v=2026-1.0.10.790";
import {
  activateAnalizarPdfStyleMapping,
  cancelAnalizarPdfAnalysis,
  createAnalizarPdfIdmlTemplateFromFile,
  deleteAnalizarPdfStyleMapping,
  exportAnalizarPdfCorrectedIdml,
  listAnalizarPdfStyleMappings,
  queueAnalizarPdfUpload,
  queueAnalizarPdfStoredSourceAnalysis,
  runAnalizarPdfQuickOrthotypography,
  saveAnalizarPdfStyleMapping
} from "./analizar-pdf-api.js?v=2026-1.0.10.789";
import { createAnalizarPdfAnalysisRulesUi } from "./analizar-pdf-analysis-rules.js?v=2026-1.0.10.2";
import {
  buildAnalizarPdfLocalBlobKey,
  deleteAnalizarPdfCachedAnalysisSession,
  deleteAnalizarPdfCachedFile,
  deleteAnalizarPdfCachedFilesBySession,
  getAnalizarPdfCachedAnalysisSession,
  getAnalizarPdfCachedFile,
  listAnalizarPdfCachedFilesByRevision,
  listAnalizarPdfCachedFilesBySession,
  putAnalizarPdfCachedAnalysisSession,
  putAnalizarPdfCachedFile
} from "./analizar-pdf-file-cache.js?v=2026-1.0.10.463";
import {
  buildAnalysisTargetsForAll as buildAnalysisTargetsForAllPure,
  documentNameMatchesRevision,
  inferUnidadFromDocumentName,
  ensureActivePointers,
  getEffectiveRecortableRole,
  hasRenderableAnalysis,
  mergeRenderableFileResults,
  normalizeRecortableRole,
  prioritizeRevisionsForRecortablesDestinations,
  recortableRoleSupportsDestination,
  shouldShowRecortableRole,
  upsertRevisionInSession,
} from "./analizar-pdf-session-logic.js?v=2026-1.0.10.805";

const state = {
  sessions: [],
  activeSessionId: "",
  activeRevisionId: "",
  activeFileId: "",
  draggedRevisionId: "",
  busyOverlayLabel: "",
  isSavingSession: false,
  isImportingCollectFolder: false,
  isAnalyzingAll: false,
  isAnalyzingCurrent: false,
  isQuickAnalyzingAll: false,
  importWarnings: [],
  isCreatingTemplateFromFile: false,
  isCreatingTemplatesFromAll: false,
  isInsertingRevision: false,
  insertRevisionIndex: -1,
  defaultRevisionsModalOpen: false,
  pendingNewSession: null,
  pendingNewSessionFiles: [],
  pendingCreateFolderSelection: false,
  globalTemplateModalOpen: false,
  currentUser: null,
  selectedFiles: [],
  analysisPollTimer: 0,
  analysisPollController: null,
  persistedTitlesBySessionId: {},
  styleMappings: [],
  mappingGroups: [],
  activeMappingGroupId: "",
  activeMappingId: "",
  mappingsModalOpen: false,
  correctionSelectionsByScopeKey: {},
  isExportingCorrectedIdml: false,
  exportConfigModalOpen: false,
  exportCleanupOptions: createDefaultExportCleanupOptions(),
  exportCleanupOptionsByScopeKey: {},
  clearedRailSessionIds: {},
  isRehydratingFileSelection: false,
  jobMetaText: "",
  jobMetaSessionId: "",
  revisionTimelineSignature: "",
  completedRevisionAnimationIds: new Set(),
  bootSpinnerDismissed: false,
  revisionTimelineRevealPending: false,
  revisionTimelineRevealInProgress: false,
  revisionTimelineRevealSignature: "",
  deferredRevisionTimelineSession: null,
};

let exportConfigRestoreFocusEl = null;
let bootSpinnerFallbackTimer = 0;
let revisionTimelineRevealTimer = 0;
let sessionRailRevealFrame = 0;
let coloredActionRevealFrame = 0;
let completedRailGroupRevealFrame = 0;
let inlineRailActionRevealFrame = 0;
let collectFolderImportPromise = null;
let analysisSpriteAnchorObserver = null;
const activeAnalysisSprites = new Map();
const animatedSessionRailIds = new Set();
const animatedCompletedRailGroupKeys = new Set();
const animatedInlineRailActionKeys = new Set();
let coloredActionsRevealComplete = false;
let completedRailInitialRevealInProgress = false;
let completedRailInitialRevealFinished = false;
let resultsRailRenderSignature = "";
let pendingResultsRailEntrySession = null;
let sessionRailInitialRevealInProgress = false;
let sessionRailInitialRevealFinished = false;
let deferredSessionRailRender = false;
let activeRailActionTooltipTrigger = null;
const ANALYZE_BTN_DEFAULT_LABEL = String(document.getElementById("analizarPdfAnalyzeBtn")?.textContent || "Analizar ficha editorial").trim() || "Analizar ficha editorial";
const LOCAL_ANALYSIS_SESSION_STORAGE_PREFIX = "cb_analizar_pdf_local_session:";
const SESSION_CATALOG_STORAGE_PREFIX = "cb_analizar_pdf_catalog_v1:";
const loadedSessionDetailIds = new Set();
const sessionDetailPromises = new Map();
const catalogOnlySessionIds = new Set();
const localAnalysisPersistenceChains = new Map();
const localAnalysisPersistenceGenerations = new Map();
const MAPPING_GROUPS_STORAGE_KEY = "cb_analizar_pdf_mapping_groups";
const UNGROUPED_MAPPING_GROUP_ID = "__ungrouped__";
const LEGACY_DEFAULT_MAPPING_IDS = new Set([
  "default_la_proyecto",
  "default_la_recortables",
  "default_la_primero_unidad",
]);

let activeAnalysisFlowStartedAt = 0;

function logAnalizarPdfFlow(step = "", payload = null) {
  const label = `[analizar-pdf][flow] ${String(step || "").trim()}`;
  const elapsedMs = activeAnalysisFlowStartedAt > 0
    ? Math.round(performance.now() - activeAnalysisFlowStartedAt)
    : null;
  if (!payload || typeof payload !== "object") {
    console.log(label, elapsedMs === null ? undefined : { elapsedMs });
    return;
  }
  console.log(label, elapsedMs === null ? payload : { elapsedMs, ...payload });
}

const PROYECTO_IDML_MAPPING_TEMPLATE = Object.freeze([
  { alias: "campo_formativo", styleKind: "paragraph", styleName: "01_04_CAMPO FORMATIVO" },
  { alias: "nombre_seccion", styleKind: "paragraph", styleName: "01_05 TITULO SECCION Y COMPETENCIA" },
  { alias: "titulo_literaturas", styleKind: "paragraph", styleName: "01_00_TITULO LITERATURAS Y EJERCICIOS" },
  { alias: "recortable_indicator", styleKind: "paragraph", styleName: "08_01_COMPETENCIA" },
  { alias: "recortable_destination", styleKind: "paragraph", styleName: "01_00_TITULO LITERATURAS Y EJERCICIOS" },
  { alias: "recortable_footer", styleKind: "paragraph", styleName: "12_01 PIE DE PAGINA DERCHO" },
  { alias: "folio_unidad", styleKind: "character", styleName: "Z_FOLIO_UNIDAD" },
  { alias: "folio_trimestre", styleKind: "character", styleName: "Z_FOLIO_TIRMESTRE" },
  { alias: "folio_nivel", styleKind: "character", styleName: "Z_FOLIO_NIVEL" },
  { alias: "folio_numero", styleKind: "character", styleName: "Z_FOLIOS" },
  { alias: "folio_numero", styleKind: "character", styleName: "Z_FOLIOS RECORTABLES" },
  { alias: "respuesta_alumno", styleKind: "paragraph", styleName: "08_04_00 RESPUESTA ALUMNO" }
]);

const LA_PROYECTO_MAPPING_TEMPLATE = Object.freeze([
  ...PROYECTO_IDML_MAPPING_TEMPLATE,
  { alias: "titulo_seccion", styleKind: "paragraph", styleName: "01_00_TITULO" },
  { alias: "habilidad", styleKind: "paragraph", styleName: "08_05_02 HABILIDADES" }
]);

const LA_UNIDAD_PRIMERO_MAPPING_TEMPLATE = Object.freeze([
  { alias: "titulo_unidad", styleKind: "paragraph", styleName: "TITULO UNIDAD 10 ED" },
  { alias: "temario", styleKind: "paragraph", styleName: "PRESEF COL 2 TABLA DE CONTENIDOS" },
  { alias: "titulo_seccion", styleKind: "paragraph", styleName: "TITULO" },
  { alias: "titulo_lectura", styleKind: "paragraph", styleName: "PRESEF COL2 cajas basicas literatura" },
  { alias: "instruccion", styleKind: "paragraph", styleName: "INSTRUCCION" },
  { alias: "subinstruccion", styleKind: "paragraph", styleName: "SUBINSTRUCCION" },
  { alias: "texto", styleKind: "paragraph", styleName: "TEXTO" },
  { alias: "caja_amarilla_texto", styleKind: "paragraph", styleName: "PRESEF COL2 cajas basicas texto" },
  { alias: "caja_amarilla_literatura", styleKind: "paragraph", styleName: "PRESEF COL2 cajas basicas literatura" },
  { alias: "trazos_gris", styleKind: "paragraph", styleName: "ASC CURSIVE GRIS" },
  { alias: "trazos_letras", styleKind: "paragraph", styleName: "CURSIVA TEXTO TRAZOS Y LETRAS" },
  { alias: "habilidad_verso", styleKind: "paragraph", styleName: "PRESEF COL 2 HABILIDADES VERSO" },
  { alias: "habilidad_recto", styleKind: "paragraph", styleName: "PRESEF COL 2 HABILIDAD RECTO" },
  { alias: "pie_pagina", styleKind: "paragraph", styleName: "PRESEF COL2 PIE DE PAGINA VERSO" },
  { alias: "habilidad_caracter", styleKind: "character", styleName: "PRESEF COL2 HABILIDADES" }
]);

const BIBLIO_DRAFT_STORAGE_KEY = "cb_analizar_pdf_biblio_draft_v1";
const ACTIVE_SESSION_STORAGE_KEY = "cb_analizar_pdf_active_session_v1";
const ANALIZAR_PDF_THEME_STORAGE_KEY = "cb_analizar_pdf_theme_v1";
const ANALIZAR_PDF_THEMES = Object.freeze(["light", "medium", "dark"]);
const ANALIZAR_PDF_THEME_META = Object.freeze({
  light: { label: "claro", icon: "fa-sun" },
  medium: { label: "medio", icon: "fa-circle-half-stroke" },
  dark: { label: "oscuro", icon: "fa-moon" },
});

function hasAnimeTargets(targets = null) {
  if (!targets) return false;
  if (typeof targets === "string") return Boolean(document.querySelector(targets));
  if (targets instanceof Element || targets === window || targets === document) return true;
  if (Array.isArray(targets) || targets instanceof NodeList || targets instanceof HTMLCollection) {
    return Array.from(targets).some(Boolean);
  }
  return true;
}

function animate(targets, parameters = {}) {
  if (!hasAnimeTargets(targets)) return null;
  return animeAnimate(targets, parameters);
}

function removeAnimeAnimation(targets) {
  if (!hasAnimeTargets(targets)) return;
  animeRemove(targets);
}

const els = {
  sessionList: document.getElementById("analizarPdfSessionList"),
  createSessionBtn: document.querySelector('[data-action="create-session"]'),
  sessionSearchBtn: document.getElementById("analizarPdfSessionSearchBtn"),
  sessionSearchModal: document.getElementById("analizarPdfSessionSearchModal"),
  sessionSearchInput: document.getElementById("analizarPdfSessionSearchInput"),
  sessionSearchResults: document.getElementById("analizarPdfSessionSearchResults"),
  sessionTitleLabel: document.getElementById("analizarPdfSessionTitleLabel"),
  heroSessionTitleContainer: document.querySelector(".analizar-pdf-hero-session-title"),
  heroSessionTitle: document.getElementById("analizarPdfHeroSessionTitle"),
  heroSessionTitleText: document.querySelector("#analizarPdfHeroSessionTitle .analizar-pdf-hero-session-title-text"),
  heroSessionTitleInput: document.getElementById("analizarPdfHeroSessionTitleInput"),
  sourceType: document.getElementById("analizarPdfSourceType"),
  indexPageInput: document.getElementById("analizarPdfIndexPageInput"),
  temarioPageInput: document.getElementById("analizarPdfTemarioPageInput"),
  bookTypeInput: document.getElementById("analizarPdfBookTypeInput"),
  libreWorkflowField: document.getElementById("analizarPdfLibreWorkflowField"),
  libreWorkflowInput: document.getElementById("analizarPdfLibreWorkflowInput"),
  libreLanguageField: document.getElementById("analizarPdfLibreLanguageField"),
  libreLanguageInput: document.getElementById("analizarPdfLibreLanguageInput"),
  nivelInput: document.getElementById("analizarPdfNivelInput"),
  gradoInput: document.getElementById("analizarPdfGradoInput"),
  trimestreInput: document.getElementById("analizarPdfTrimestreInput"),
  unidadInput: document.getElementById("analizarPdfUnidadInput"),
  edicionNumeroInput: document.getElementById("analizarPdfEdicionNumeroInput"),
  revisionNumeroInput: document.getElementById("analizarPdfRevisionNumeroInput"),
  recortableRoleField: document.getElementById("analizarPdfRecortableRoleField"),
  recortableRoleInput: document.getElementById("analizarPdfRecortableRoleInput"),
  revisionMappingSelect: document.getElementById("analizarPdfRevisionMappingSelect"),
  createDefaultRevisionsBtn: document.getElementById("analizarPdfCreateDefaultRevisionsBtn"),
  addRevisionBtn: document.getElementById("analizarPdfAddRevisionBtn"),
  revisionList: document.getElementById("analizarPdfRevisionList"),
  toggleCardSelectionBtn: document.getElementById("analizarPdfToggleCardSelectionBtn"),
  selectedCardsCount: document.getElementById("analizarPdfSelectedCardsCount"),
  selectAllCardsBtn: document.getElementById("analizarPdfSelectAllCardsBtn"),
  fileList: document.getElementById("analizarPdfFileList"),
  addSectionBtn: document.getElementById("analizarPdfAddSectionBtn"),
  addSectionButtons: document.querySelectorAll('[data-action="add-section"]'),
  sectionsList: document.getElementById("analizarPdfSectionsList"),
  paletteList: document.getElementById("analizarPdfPaletteList"),
  addPaletteColorBtn: document.getElementById("analizarPdfAddPaletteColorBtn"),
  fileInput: document.getElementById("analizarPdfFileInput"),
  folderInput: document.getElementById("analizarPdfFolderInput"),
  chooseFolderBtn: document.getElementById("analizarPdfChooseFolderBtn"),
  themeToggleBtn: document.getElementById("analizarPdfThemeToggleBtn"),
  editGlobalTemplateBtn: document.getElementById("analizarPdfEditGlobalTemplateBtn"),
  fileLabel: document.getElementById("analizarPdfFileLabel"),
  analyzeBtn: document.getElementById("analizarPdfAnalyzeBtn"),
  analyzeAllBtn: document.getElementById("analizarPdfAnalyzeAllBtn"),
  createTemplateFromFileBtn: document.getElementById("analizarPdfCreateTemplateFromFileBtn"),
  createTemplatesFromAllBtn: document.getElementById("analizarPdfCreateTemplatesFromAllBtn"),
  quickAnalyzeAllBtn: document.getElementById("analizarPdfQuickAnalyzeAllBtn"),
  saveBtn: document.getElementById("analizarPdfSaveBtn"),
  copyJobMetaBtn: document.getElementById("analizarPdfCopyJobMetaBtn"),
  exportCorrectedBtn: document.getElementById("analizarPdfExportCorrectedBtn"),
  mappingsBtn: document.getElementById("analizarPdfMappingsBtn"),
  bootSpinner: document.getElementById("analizarPdfBootSpinner"),
  editorialPanel: document.getElementById("analizarPdfEditorialPanel"),
  biblioGrid: document.querySelector(".analizar-pdf-biblio-grid"),
  toggleEditorialBtn: document.getElementById("analizarPdfToggleEditorialBtn"),
  editorialSpinner: document.getElementById("analizarPdfEditorialSpinner"),
  editorialSpinnerLabel: document.getElementById("analizarPdfEditorialSpinnerLabel"),
  results: document.getElementById("analizarPdfResults"),
  pageReports: document.getElementById("analizarPdfPageReports"),
  quickDetailPanel: document.getElementById("analizarPdfQuickDetailPanel"),
  quickDetailResizeHandle: document.getElementById("analizarPdfQuickDetailResizeHandle"),
  quickRailHost: document.getElementById("analizarPdfQuickRailHost"),
  jobMeta: document.getElementById("analizarPdfJobMeta"),
  mappingsModal: document.getElementById("analizarPdfMappingsModal"),
  mappingsList: document.getElementById("analizarPdfMappingsList"),
  mappingsBookTypeFilter: document.getElementById("analizarPdfMappingsBookTypeFilter"),
  mappingsNivelFilter: document.getElementById("analizarPdfMappingsNivelFilter"),
  mappingsGradoFilter: document.getElementById("analizarPdfMappingsGradoFilter"),
  mappingsUnidadFilter: document.getElementById("analizarPdfMappingsUnidadFilter"),
  newMappingBtn: document.getElementById("analizarPdfNewMappingBtn"),
  createMappingGroupBtn: document.getElementById("analizarPdfCreateMappingGroupBtn"),
  deleteMappingGroupBtn: document.getElementById("analizarPdfDeleteMappingGroupBtn"),
  mappingGroupTitleInput: document.getElementById("analizarPdfMappingGroupTitleInput"),
  mappingGroupsList: document.getElementById("analizarPdfMappingGroupsList"),
  selectedMappingGroupLabel: document.getElementById("analizarPdfSelectedMappingGroupLabel"),
  mappingEditorEmpty: document.getElementById("analizarPdfMappingEditorEmpty"),
  mappingTitleInput: document.getElementById("analizarPdfMappingTitleInput"),
  mappingBookTypeInput: document.getElementById("analizarPdfMappingBookTypeInput"),
  mappingNivelInput: document.getElementById("analizarPdfMappingNivelInput"),
  mappingGradoInput: document.getElementById("analizarPdfMappingGradoInput"),
  mappingUnidadInput: document.getElementById("analizarPdfMappingUnidadInput"),
  activateMappingBtn: document.getElementById("analizarPdfActivateMappingBtn"),
  duplicateMappingBtn: document.getElementById("analizarPdfDuplicateMappingBtn"),
  deleteMappingBtn: document.getElementById("analizarPdfDeleteMappingBtn"),
  saveMappingBtn: document.getElementById("analizarPdfSaveMappingBtn"),
  addMappingEntryBtn: document.getElementById("analizarPdfAddMappingEntryBtn"),
  mappingEntriesList: document.getElementById("analizarPdfMappingEntriesList"),
  defaultRevisionsModal: document.getElementById("analizarPdfDefaultRevisionsModal"),
  defaultSourceTypeInput: document.getElementById("analizarPdfDefaultSourceTypeInput"),
  defaultWorkflowFormatInput: document.getElementById("analizarPdfDefaultWorkflowFormatInput"),
  defaultLanguageInput: document.getElementById("analizarPdfDefaultLanguageInput"),
  defaultBookNameInput: document.getElementById("analizarPdfDefaultBookNameInput"),
  defaultFolderBtn: document.getElementById("analizarPdfDefaultFolderBtn"),
  defaultFolderSummary: document.getElementById("analizarPdfDefaultFolderSummary"),
  defaultBookTypeInput: document.getElementById("analizarPdfDefaultBookTypeInput"),
  defaultNivelInput: document.getElementById("analizarPdfDefaultNivelInput"),
  defaultGradoInput: document.getElementById("analizarPdfDefaultGradoInput"),
  defaultTrimestreInput: document.getElementById("analizarPdfDefaultTrimestreInput"),
  defaultEdicionNumeroInput: document.getElementById("analizarPdfDefaultEdicionNumeroInput"),
  defaultRevisionNumeroInput: document.getElementById("analizarPdfDefaultRevisionNumeroInput"),
  defaultUnitCountInput: document.getElementById("analizarPdfDefaultUnitCountInput"),
  defaultRevisionsSummary: document.getElementById("analizarPdfDefaultRevisionsSummary"),
  defaultRevisionsConfirmBtn: document.getElementById("analizarPdfDefaultRevisionsConfirmBtn"),
  globalTemplateModal: document.getElementById("analizarPdfGlobalTemplateModal"),
  globalTemplateForm: document.getElementById("analizarPdfGlobalTemplateForm"),
  globalSourceTypeInput: document.getElementById("analizarPdfGlobalSourceTypeInput"),
  globalWorkflowFormatInput: document.getElementById("analizarPdfGlobalWorkflowFormatInput"),
  globalLanguageInput: document.getElementById("analizarPdfGlobalLanguageInput"),
  globalBookNameInput: document.getElementById("analizarPdfGlobalBookNameInput"),
  globalLibreFolderField: document.getElementById("analizarPdfGlobalLibreFolderField"),
  globalLibreFolderBtn: document.getElementById("analizarPdfGlobalLibreFolderBtn"),
  globalLibreFolderSummary: document.getElementById("analizarPdfGlobalLibreFolderSummary"),
  globalBookTypeInput: document.getElementById("analizarPdfGlobalBookTypeInput"),
  globalNivelInput: document.getElementById("analizarPdfGlobalNivelInput"),
  globalGradoInput: document.getElementById("analizarPdfGlobalGradoInput"),
  globalTrimestreInput: document.getElementById("analizarPdfGlobalTrimestreInput"),
  globalEdicionInput: document.getElementById("analizarPdfGlobalEdicionInput"),
  globalRevisionInput: document.getElementById("analizarPdfGlobalRevisionInput"),
  globalTemplateSaveBtn: document.getElementById("analizarPdfGlobalTemplateSaveBtn"),
  insertRevisionModal: document.getElementById("analizarPdfInsertRevisionModal"),
  insertRevisionForm: document.getElementById("analizarPdfInsertRevisionForm"),
  insertRevisionUnit: document.getElementById("analizarPdfInsertRevisionUnit"),
  insertRevisionNumber: document.getElementById("analizarPdfInsertRevisionNumber"),
  insertRevisionRole: document.getElementById("analizarPdfInsertRevisionRole"),
  insertRevisionFile: document.getElementById("analizarPdfInsertRevisionFile"),
  insertRevisionFileName: document.getElementById("analizarPdfInsertRevisionFileName"),
  insertRevisionError: document.getElementById("analizarPdfInsertRevisionError"),
  insertRevisionSubmit: document.getElementById("analizarPdfInsertRevisionSubmit"),
  exportConfigModal: document.getElementById("analizarPdfExportConfigModal"),
  exportConfigCloseBtn: document.getElementById("analizarPdfExportConfigCloseBtn"),
  exportConfigCancelBtn: document.getElementById("analizarPdfExportConfigCancelBtn"),
  exportConfigConfirmBtn: document.getElementById("analizarPdfExportConfigConfirmBtn"),
  cleanupOldNotesInput: document.getElementById("analizarPdfCleanupOldNotes"),
  cleanupUnusedParagraphStylesInput: document.getElementById("analizarPdfCleanupUnusedParagraphStyles"),
  cleanupUnusedCharacterStylesInput: document.getElementById("analizarPdfCleanupUnusedCharacterStyles"),
  cleanupUnusedSwatchesInput: document.getElementById("analizarPdfCleanupUnusedSwatches"),
  cleanupOffPageObjectsInput: document.getElementById("analizarPdfCleanupOffPageObjects"),
  cleanupOffPageTextInput: document.getElementById("analizarPdfCleanupOffPageText"),
  applySelectedCorrectionsInput: document.getElementById("analizarPdfApplySelectedCorrections"),
  exportConfigSummary: document.getElementById("analizarPdfExportConfigSummary")
};

const store = createAnalizarPdfSessionStore({ state });
createAnalizarPdfAnalysisRulesUi({
  getActiveSession: () => store.getActiveSession(),
  getAnalysisCategories: () => getAnalizarPdfAnalysisCategories(),
  saveSessionConfig: async (analysisRuleConfig) => {
    const next = mutateActiveSession((draft) => {
      draft.analysisRuleConfig = analysisRuleConfig;
      return draft;
    }, { render: false });
    if (!next) return null;
    const saved = await saveSession(next);
    store.upsertSession(saved);
    renderAll({ preserveScroll: true });
    return saved;
  }
});
const resultsRenderer = createAnalizarPdfResultsRenderer({
  el: els.results,
  pageReportsEl: els.pageReports,
  railHostEl: els.quickRailHost,
  onToggleCorrectionMode: handleToggleCorrectionMode,
  onToggleCorrectionPage: handleToggleCorrectionPage,
  onToggleCorrectionIssue: handleToggleCorrectionIssue,
  onClearRailAnalysis: handleClearRailAnalysis,
  isRailCleared: (session) => Boolean(state.clearedRailSessionIds[String(session?.id || "").trim()])
});
const sidepanelApi = createAnalizarPdfSidepanelApi({
  els,
  state,
  onCreateSession: handleCreateSession,
  onSelectSession: handleSelectSession,
  onRenameSession: handleRenameSession,
  onDeleteSession: handleDeleteSession
});

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isBusyAnalysisStatus(status = "idle") {
  return ["uploading", "queued", "processing", "delivering"].includes(String(status || "").trim().toLowerCase());
}

function hasFinishedAnalysisPayload(file = null) {
  const summary = file?.resultSummary && typeof file.resultSummary === "object" ? file.resultSummary : {};
  const result = file?.result && typeof file.result === "object" ? file.result : {};
  const stats = result?.stats && typeof result.stats === "object" ? result.stats : null;
  return Boolean(
    String(summary?.analyzedAt || "").trim()
    || Number(summary?.pageCount || stats?.pageCount || 0) > 0
    || (Array.isArray(stats?.pageReports) && stats.pageReports.length > 0)
  );
}

function clearInterruptedAnalysisStatuses(session = null) {
  if (!session || typeof session !== "object") return false;
  const liveJobId = String(state.analysisPollController?.jobId || "").trim();
  let changed = false;
  for (const revision of Array.isArray(session.revisions) ? session.revisions : []) {
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      if (!isBusyAnalysisStatus(file?.analysisStatus || "")) continue;
      const fileJobId = String(file?.analysisJobId || "").trim();
      if (liveJobId && fileJobId === liveJobId) continue;
      file.analysisStatus = hasFinishedAnalysisPayload(file) ? "completed" : "cancelled";
      file.analysisJobId = "";
      changed = true;
    }
  }
  if (isBusyAnalysisStatus(session.analysisStatus || "") && (!liveJobId || String(session.analysisJobId || "").trim() !== liveJobId)) {
    session.analysisStatus = "idle";
    session.analysisJobId = "";
    changed = true;
  }
  return changed;
}

function updateEditorialSpinner(status = "idle") {
  if (!els.editorialSpinner || !els.editorialPanel) return;
  const overlayLabel = String(state.busyOverlayLabel || "").trim();
  if (overlayLabel) {
    els.editorialSpinner.hidden = false;
    els.editorialPanel.classList.add("is-generating");
    if (els.editorialSpinnerLabel) {
      const friendlyLabel = /backend|servidor|cloud|api|job|cola|polling/i.test(overlayLabel)
        ? "Preparando tu análisis"
        : /subiend|upload|cargando archivo/i.test(overlayLabel)
          ? "Preparando tu archivo"
          : /guard|persist|snapshot/i.test(overlayLabel)
            ? "Guardando tus avances"
            : /recortable|ficha|anexo|video|referencia/i.test(overlayLabel)
              ? "Comprobando las referencias"
              : /ortograf|ortotipograf/i.test(overlayLabel)
                ? "Revisando la escritura y presentación"
                : overlayLabel;
      els.editorialSpinnerLabel.textContent = friendlyLabel;
    }
    return;
  }
  const cleanStatus = String(status || "idle").trim().toLowerCase() || "idle";
  const isBusy = isBusyAnalysisStatus(cleanStatus);
  els.editorialSpinner.hidden = !isBusy;
  els.editorialPanel.classList.toggle("is-generating", isBusy);
  if (els.editorialSpinnerLabel) {
    els.editorialSpinnerLabel.textContent = cleanStatus === "uploading"
      ? "Preparando tu archivo"
      : cleanStatus === "queued"
        ? "Todo listo, comenzamos enseguida"
        : cleanStatus === "processing"
          ? "Revisando el contenido"
          : "Preparando el análisis";
  }
}

function setBusyOverlay(label = "") {
  state.busyOverlayLabel = String(label || "").trim();
  updateEditorialSpinner(getActiveFile(store.getActiveSession())?.analysisStatus || store.getActiveSession()?.analysisStatus || "idle");
}

function settleAnalysisPoll(result = null) {
  const controller = state.analysisPollController;
  if (!controller) {
    return false;
  }
  const resultJobId = String(result?.jobId || "").trim();
  if (resultJobId && resultJobId !== controller.jobId) {
    return false;
  }
  window.clearTimeout(state.analysisPollTimer);
  state.analysisPollTimer = 0;
  state.analysisPollController = null;
  controller.resolve(result);
  return true;
}

function rejectAnalysisPoll(error) {
  const controller = state.analysisPollController;
  if (!controller) {
    return false;
  }
  window.clearTimeout(state.analysisPollTimer);
  state.analysisPollTimer = 0;
  state.analysisPollController = null;
  controller.reject(error);
  return true;
}

function isAuthAnalysisError(error = null) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").trim().toUpperCase();
  return status === 401 || status === 403 || message.includes("AUTH_REQUIRED") || message.includes("AUTH_INVALID") || message.includes("AUTH_FORBIDDEN");
}

function clearBusyAnalysisStateForJob(jobId = "", nextStatus = "failed", options = {}) {
  const cleanJobId = String(jobId || "").trim();
  const normalizedStatus = String(nextStatus || "failed").trim().toLowerCase() || "failed";
  const targetRevisionId = String(options?.revisionId || "").trim();
  const targetFileId = String(options?.fileId || "").trim();
  const hasExactTarget = Boolean(targetRevisionId && targetFileId);
  const keepBatchOverlay = options?.keepBatchOverlay === true;
  const updateTargetRailOnly = options?.updateTargetRailOnly === true && hasExactTarget;
  let changed = false;
  mutateActiveSession((draft) => {
    if (!draft || typeof draft !== "object") {
      return draft;
    }
    if (!cleanJobId || String(draft.analysisJobId || "").trim() === cleanJobId) {
      if (isBusyAnalysisStatus(draft.analysisStatus || "") || String(draft.analysisJobId || "").trim()) {
        draft.analysisStatus = normalizedStatus;
        draft.analysisJobId = "";
        changed = true;
      }
    }
    for (const revision of Array.isArray(draft.revisions) ? draft.revisions : []) {
      for (const file of Array.isArray(revision?.files) ? revision.files : []) {
        const matchesExactTarget = hasExactTarget
          && String(revision?.id || "").trim() === targetRevisionId
          && String(file?.id || "").trim() === targetFileId;
        const matchesJob = cleanJobId && String(file?.analysisJobId || "").trim() === cleanJobId;
        if (hasExactTarget ? !matchesExactTarget : cleanJobId ? !matchesJob : !isBusyAnalysisStatus(file?.analysisStatus || "")) {
          continue;
        }
        file.analysisStatus = normalizedStatus;
        file.analysisJobId = "";
        file.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    return draft;
  }, { render: false });
  window.clearTimeout(state.analysisPollTimer);
  state.analysisPollTimer = 0;
  if (!keepBatchOverlay) {
    state.isAnalyzingCurrent = false;
    state.isAnalyzingAll = false;
    setBusyOverlay("");
  } else {
    setBusyOverlay(state.busyOverlayLabel || "Analizando todas las fichas editoriales");
  }
  renderActionButtonState();
  renderAll({ preserveResultsRail: updateTargetRailOnly });
  if (updateTargetRailOnly) {
    const activeSession = store.getActiveSession();
    resultsRenderer.updateRailEntry(
      buildRenderableSession(activeSession),
      targetRevisionId,
      targetFileId
    );
    resultsRailRenderSignature = buildResultsRailRenderSignature(activeSession);
  }
  return changed;
}

function applyAnalysisStatusPayloadToLocalSession(payload = null) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const cleanJobId = String(payload.jobId || "").trim();
  const revisionId = String(payload.revisionId || "").trim();
  const fileId = String(payload.fileId || "").trim();
  const hasResult = payload.result && typeof payload.result === "object";
  const hasSummary = payload.resultSummary && typeof payload.resultSummary === "object";
  const status = String(payload.status || "").trim().toLowerCase();
  const session = store.getActiveSession();
  if (!session || (!cleanJobId && (!revisionId || !fileId))) {
    return session;
  }
  const next = mutateActiveSession((draft) => {
    let targetRevision = null;
    let targetFile = null;
    if (revisionId && fileId) {
      targetRevision = (Array.isArray(draft.revisions) ? draft.revisions : [])
        .find((revision) => String(revision?.id || "").trim() === revisionId) || null;
      targetFile = (Array.isArray(targetRevision?.files) ? targetRevision.files : [])
        .find((file) => String(file?.id || "").trim() === fileId) || null;
    }
    if (!targetFile || !targetRevision) {
      for (const revision of Array.isArray(draft.revisions) ? draft.revisions : []) {
        for (const file of Array.isArray(revision?.files) ? revision.files : []) {
          const matchesJob = cleanJobId && String(file?.analysisJobId || "").trim() === cleanJobId;
          if (matchesJob) {
            targetRevision = revision;
            targetFile = file;
            break;
          }
        }
        if (targetFile) break;
      }
    }
    if (!targetFile || !targetRevision) {
      return draft;
    }
    const wasBusy = isBusyAnalysisStatus(targetFile.analysisStatus || "");
    targetFile.analysisStatus = status || targetFile.analysisStatus || "idle";
    targetFile.analysisJobId = ["queued", "processing", "uploading"].includes(status) ? cleanJobId : "";
    if (hasResult) {
      targetFile.result = payload.result;
    }
    if (hasSummary) {
      targetFile.resultSummary = payload.resultSummary;
      targetRevision.latestAnalysisAt = String(payload.resultSummary?.analyzedAt || targetRevision.latestAnalysisAt || "").trim();
    }
    targetFile.updatedAt = new Date().toISOString();
    targetRevision.summary = buildRevisionSummary(targetRevision.files || []);
    targetRevision.updatedAt = new Date().toISOString();
    if (status === "completed" && (wasBusy || hasResult)) {
      state.completedRevisionAnimationIds.add(String(targetRevision.id || "").trim());
    }
    draft.analysisStatus = ["queued", "processing", "uploading"].includes(status) ? status : "idle";
    draft.analysisJobId = ["queued", "processing", "uploading"].includes(status) ? cleanJobId : "";
    return draft;
  }, { render: false });
  if (next) {
    persistLocalAnalysisSession(next);
  }
  return next || session;
}

function hasAvailableIdmlSource(file = null) {
  return Boolean(
    file
    && (
      String(file?.sourceAssetPath || "").trim()
      || String(file?.localBlobKey || "").trim()
      || file?.hasLocalSource === true
    )
  );
}

function isIdmlFileEntry(file = null, session = null) {
  const sourceReference = [
    file?.documentName,
    file?.fileName,
    file?.sourceAssetPath,
    file?.sourceStoragePath,
    file?.sourceDownloadUrl
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
  return getNormalizedSourceType(file?.sourceType || session?.sourceType || "") === "idml"
    || /\.idml(?:\?|#|$)/i.test(sourceReference);
}

function renderActionButtonState() {
  const blockAll = state.isImportingCollectFolder || state.isAnalyzingAll || state.isAnalyzingCurrent || state.isSavingSession || state.isQuickAnalyzingAll || state.isCreatingTemplateFromFile || state.isCreatingTemplatesFromAll || state.isInsertingRevision;
  const selectionLocked = state.isAnalyzingAll || state.isAnalyzingCurrent || state.isQuickAnalyzingAll;
  const session = store.getActiveSession();
  const revision = getActiveRevision(session);
  const file = getActiveFile(session, revision);
  const fileBusy = isBusyAnalysisStatus(file?.analysisStatus || "");
  const isIdmlSession = getNormalizedSourceType(session?.sourceType || file?.sourceType || "") === "idml" || isIdmlFileEntry(file, session);
  const activeHasSource = isIdmlSession && isIdmlFileEntry(file, session) && hasAvailableIdmlSource(file);
  const anyQuickSource = (Array.isArray(session?.revisions) ? session.revisions : []).some((entry) => {
    return (Array.isArray(entry?.files) ? entry.files : []).some((item) => isIdmlFileEntry(item, session) && hasAvailableIdmlSource(item));
  });
  if (els.analyzeBtn) {
    els.analyzeBtn.disabled = blockAll && !fileBusy;
    const actionLabel = fileBusy ? "Detener análisis de esta ficha" : "Analizar esta ficha editorial";
    els.analyzeBtn.setAttribute("aria-label", actionLabel);
    els.analyzeBtn.setAttribute("data-tooltip", actionLabel);
    els.analyzeBtn.removeAttribute("title");
  }
  if (els.analyzeAllBtn) {
    els.analyzeAllBtn.disabled = blockAll;
  }
  if (els.chooseFolderBtn) {
    els.chooseFolderBtn.disabled = blockAll;
  }
  if (els.folderInput) {
    els.folderInput.disabled = blockAll;
  }
  if (els.createDefaultRevisionsBtn) {
    els.createDefaultRevisionsBtn.disabled = blockAll || !session;
  }
  if (els.editGlobalTemplateBtn) {
    els.editGlobalTemplateBtn.disabled = blockAll || !session;
  }
  if (els.createTemplateFromFileBtn) {
    els.createTemplateFromFileBtn.disabled = blockAll || !activeHasSource;
  }
  if (els.createTemplatesFromAllBtn) {
    els.createTemplatesFromAllBtn.disabled = blockAll || !anyQuickSource;
  }
  if (els.quickAnalyzeAllBtn) {
    els.quickAnalyzeAllBtn.disabled = blockAll || !anyQuickSource;
  }
  if (els.saveBtn) {
    els.saveBtn.disabled = blockAll;
  }
  if (els.exportCorrectedBtn) {
    els.exportCorrectedBtn.disabled = blockAll || state.isExportingCorrectedIdml || !canExportCurrentFileAsIdml(session, revision, file);
  }
  for (const control of [els.toggleCardSelectionBtn, els.selectAllCardsBtn]) {
    if (!control) continue;
    control.disabled = selectionLocked;
    control.setAttribute("aria-disabled", String(selectionLocked));
  }
}

async function flushUiFrame() {
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function hideBootSpinner() {
  if (!els.bootSpinner || state.bootSpinnerDismissed) return;
  state.bootSpinnerDismissed = true;
  window.clearTimeout(bootSpinnerFallbackTimer);
  els.bootSpinner.classList.add("is-hidden");
  window.setTimeout(() => {
    els.bootSpinner?.setAttribute("hidden", "");
    // La entrada de archivos empieza cuando el spinner ya dejó ver el contenido.
    scheduleRevisionTimelineReveal();
    scheduleSessionRailReveal();
    scheduleColoredActionReveal();
    scheduleCompletedRailGroupReveal();
    scheduleInlineRailActionReveal();
  }, 180);
}

function scheduleInlineRailActionReveal() {
  if (
    !state.bootSpinnerDismissed
    || !els.quickRailHost
  ) return;
  window.cancelAnimationFrame(inlineRailActionRevealFrame);
  inlineRailActionRevealFrame = window.requestAnimationFrame(() => {
    inlineRailActionRevealFrame = 0;
    const buttons = [...els.quickRailHost.querySelectorAll(
      ".analizar-pdf-ortho-rail-head .analizar-pdf-inline-actions .analizar-pdf-rail-selection-toggle[data-action]"
    )].filter((button) => !animatedInlineRailActionKeys.has(String(button.dataset.action || "").trim()));
    const icons = buttons.map((button) => button.querySelector(":scope > i")).filter(Boolean);
    if (!icons.length) return;
    buttons.forEach((button) => animatedInlineRailActionKeys.add(String(button.dataset.action || "").trim()));
    if (prefersReducedRevisionMotion()) {
      els.quickRailHost.classList.remove("is-initial-inline-actions-reveal-pending");
      return;
    }
    removeAnimeAnimation(icons);
    icons.forEach((icon, index) => {
      icon.style.opacity = "0";
      icon.style.transform = `translateY(8px) scale(.12) rotate(${index % 2 ? 16 : -16}deg)`;
      icon.style.transformOrigin = "50% 50%";
    });
    els.quickRailHost.classList.remove("is-initial-inline-actions-reveal-pending");
    animate(icons, {
      opacity: [0, 1],
      y: [8, 0],
      scale: [.12, 1],
      rotate: (icon, index) => [index % 2 ? 16 : -16, 0],
      delay: stagger(52, { start: 18 }),
      ease: spring({ bounce: .44, duration: 280 }),
      onComplete: () => {
        icons.filter((icon) => icon.isConnected).forEach((icon) => {
          icon.style.removeProperty("opacity");
          icon.style.removeProperty("transform");
          icon.style.removeProperty("transform-origin");
        });
      },
    });
  });
}

function scheduleCompletedRailGroupReveal() {
  if (!state.bootSpinnerDismissed || !els.quickRailHost || completedRailInitialRevealInProgress) return;
  window.cancelAnimationFrame(completedRailGroupRevealFrame);
  completedRailGroupRevealFrame = window.requestAnimationFrame(() => {
    completedRailGroupRevealFrame = 0;
    const groups = [...els.quickRailHost.querySelectorAll(
      ".analizar-pdf-ortho-rail-body > .analizar-pdf-ortho-rail-group.is-complete"
    )].filter((group) => {
      const key = String(group.dataset.railGroupKey || "").trim();
      return key && !animatedCompletedRailGroupKeys.has(key);
    });
    if (!groups.length) {
      if (!completedRailInitialRevealFinished) {
        completedRailInitialRevealFinished = true;
        els.quickRailHost.classList.remove("is-initial-rail-reveal-pending");
        scheduleInlineRailActionReveal();
      }
      return;
    }
    const isInitialReveal = !completedRailInitialRevealFinished;
    const summaries = groups.map((group) => group.querySelector(":scope > summary")).filter(Boolean);
    groups.forEach((group) => animatedCompletedRailGroupKeys.add(String(group.dataset.railGroupKey || "").trim()));
    if (prefersReducedRevisionMotion()) {
      completedRailInitialRevealFinished = true;
      els.quickRailHost.classList.remove("is-initial-rail-reveal-pending");
      scheduleInlineRailActionReveal();
      return;
    }
    if (isInitialReveal) completedRailInitialRevealInProgress = true;
    removeAnimeAnimation([...groups, ...summaries]);
    groups.forEach((group) => {
      group.style.opacity = "0";
    });
    summaries.forEach((summary, index) => {
      summary.style.opacity = "0";
      summary.style.transform = `translateX(20px) scale(.22) rotate(${index % 2 ? 3 : -3}deg)`;
      summary.style.transformOrigin = "82% 50%";
    });
    if (isInitialReveal) els.quickRailHost.classList.remove("is-initial-rail-reveal-pending");
    animate(groups, {
      opacity: [0, 1],
      delay: stagger(40),
      duration: 280,
      ease: "out(3)",
    });
    animate(summaries, {
      opacity: [0, 1],
      x: [20, 0],
      scale: [.22, 1],
      rotate: (summary, index) => [index % 2 ? 3 : -3, 0],
      delay: stagger(40),
      ease: spring({ bounce: .42, duration: 360 }),
      onComplete: () => {
        const revealNodesRemainConnected = summaries.every((summary) => summary.isConnected);
        if (revealNodesRemainConnected) {
          groups.forEach((group) => {
            group.style.removeProperty("opacity");
          });
          summaries.forEach((summary) => {
            summary.style.removeProperty("opacity");
            summary.style.removeProperty("transform");
            summary.style.removeProperty("transform-origin");
          });
        }
        if (isInitialReveal) {
          completedRailInitialRevealInProgress = false;
          completedRailInitialRevealFinished = true;
          if (pendingResultsRailEntrySession) {
            updateResultsRailEntriesForSession(pendingResultsRailEntrySession);
            pendingResultsRailEntrySession = null;
          }
          scheduleInlineRailActionReveal();
        }
      },
    });
  });
}

function buildResultsRailRenderSignature(session = null) {
  if (!session) return "empty";
  return JSON.stringify((Array.isArray(session.revisions) ? session.revisions : []).map((revision) => ({
    id: String(revision?.id || "").trim(),
    unidad: String(revision?.unidad || "").trim(),
    revisionNumero: String(revision?.revisionNumero || "").trim(),
    updatedAt: String(revision?.updatedAt || "").trim(),
    tint: resolveRevisionAccentColor(revision, session?.workflowFormat),
    files: (Array.isArray(revision?.files) ? revision.files : []).map((file) => ({
      id: String(file?.id || "").trim(),
      updatedAt: String(file?.updatedAt || "").trim(),
      status: String(file?.analysisStatus || "").trim(),
      tint: String(file?.railTintHex || "").trim(),
      quickUpdatedAt: String(file?.quickAnalysis?.updatedAt || file?.quickAnalysis?.generatedAt || "").trim(),
      hasResult: hasRenderableAnalysis(file),
    })),
  })));
}

function updateResultsRailEntriesForSession(session = null) {
  if (!session) return;
  const renderableSession = buildRenderableSession(session);
  resultsRenderer.updateSessionReference(renderableSession);
  for (const revision of Array.isArray(session.revisions) ? session.revisions : []) {
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      resultsRenderer.updateRailEntry(
        renderableSession,
        String(revision?.id || "").trim(),
        String(file?.id || "").trim()
      );
    }
  }
  resultsRailRenderSignature = buildResultsRailRenderSignature(session);
}

function renderResultsWithRailAnimations(session = null) {
  const nextSignature = buildResultsRailRenderSignature(session);
  if (resultsRailRenderSignature === nextSignature && els.quickRailHost?.querySelector(".analizar-pdf-ortho-rail")) {
    resultsRenderer.updateSessionReference(session);
    return;
  }
  if (completedRailInitialRevealInProgress) {
    // La hidratación puede llegar mientras los items brotan. Actualizar únicamente
    // la referencia de datos evita sustituir el rail completo al terminar la animación.
    resultsRenderer.updateSessionReference(session);
    pendingResultsRailEntrySession = session;
    return;
  }
  resultsRenderer.render(session);
  resultsRailRenderSignature = nextSignature;
  scheduleCompletedRailGroupReveal();
  scheduleInlineRailActionReveal();
}

function scheduleColoredActionReveal() {
  if (!state.bootSpinnerDismissed || coloredActionsRevealComplete) return;
  window.cancelAnimationFrame(coloredActionRevealFrame);
  coloredActionRevealFrame = window.requestAnimationFrame(() => {
    coloredActionRevealFrame = 0;
    const actionHost = document.querySelector(".analizar-pdf-hero-actions");
    const actions = [...(actionHost?.querySelectorAll(":scope > .analizar-pdf-metal-action") || [])];
    if (!actions.length) return;
    coloredActionsRevealComplete = true;
    if (prefersReducedRevisionMotion()) {
      document.documentElement.classList.add("ap-hero-actions-reveal-ready");
      return;
    }
    removeAnimeAnimation(actions);
    actions.forEach((action, index) => {
      action.style.opacity = "0";
      action.style.transform = `translateY(12px) scale(.16) rotate(${index % 2 ? 9 : -9}deg)`;
      action.style.transformOrigin = "50% 50%";
    });
    document.documentElement.classList.add("ap-hero-actions-reveal-ready");
    animate(actions, {
      opacity: [0, 1],
      y: [12, 0],
      scale: [.16, 1],
      rotate: (action, index) => [index % 2 ? 9 : -9, 0],
      delay: stagger(130, { start: 45 }),
      ease: spring({ bounce: .46, duration: 620 }),
      onComplete: () => actions.forEach((action) => {
        action.style.removeProperty("opacity");
        action.style.removeProperty("transform");
        action.style.removeProperty("transform-origin");
      }),
    });
  });
}

function scheduleSessionRailReveal() {
  if (!state.bootSpinnerDismissed || !els.sessionList || sessionRailInitialRevealInProgress) return;
  window.cancelAnimationFrame(sessionRailRevealFrame);
  sessionRailRevealFrame = window.requestAnimationFrame(() => {
    sessionRailRevealFrame = 0;
    const cards = [...els.sessionList.querySelectorAll(".analizar-pdf-session-card[data-session-id]")]
      .filter((card) => !animatedSessionRailIds.has(String(card.dataset.sessionId || "").trim()));
    if (!cards.length) {
      if (!sessionRailInitialRevealFinished) {
        sessionRailInitialRevealFinished = true;
        els.sessionList.classList.remove("is-initial-session-reveal-pending");
      }
      return;
    }
    const isInitialReveal = !sessionRailInitialRevealFinished;
    cards.forEach((card) => animatedSessionRailIds.add(String(card.dataset.sessionId || "").trim()));
    if (prefersReducedRevisionMotion()) {
      sessionRailInitialRevealFinished = true;
      els.sessionList.classList.remove("is-initial-session-reveal-pending");
      return;
    }
    if (isInitialReveal) sessionRailInitialRevealInProgress = true;
    removeAnimeAnimation(cards);
    cards.forEach((card) => {
      card.style.opacity = "0";
      card.style.transform = "translateX(-18px) scale(.72)";
      card.style.transformOrigin = "18% 50%";
    });
    if (isInitialReveal) els.sessionList.classList.remove("is-initial-session-reveal-pending");
    animate(cards, {
      opacity: [0, 1],
      x: [-18, 0],
      scale: [.72, 1],
      delay: stagger(32),
      ease: spring({ bounce: .38, duration: 320 }),
      onComplete: () => {
        cards.filter((card) => card.isConnected).forEach((card) => {
          card.style.removeProperty("opacity");
          card.style.removeProperty("transform");
          card.style.removeProperty("transform-origin");
        });
        if (isInitialReveal) {
          sessionRailInitialRevealInProgress = false;
          sessionRailInitialRevealFinished = true;
          if (deferredSessionRailRender) {
            deferredSessionRailRender = false;
            sidepanelApi.renderSessions();
            scheduleSessionRailReveal();
          }
        }
      },
    });
  });
}

function renderSessionRailWithAnimation() {
  if (sessionRailInitialRevealInProgress) {
    deferredSessionRailRender = true;
    return;
  }
  sidepanelApi.renderSessions();
  scheduleSessionRailReveal();
}

function getLiveJobMetaElement() {
  return document.getElementById("analizarPdfJobMeta") || els.jobMeta || null;
}

function setJobMetaText(value = "") {
  state.jobMetaText = String(value || "");
  state.jobMetaSessionId = String(store.getActiveSession()?.id || state.activeSessionId || "").trim();
  const jobMeta = getLiveJobMetaElement();
  if (!jobMeta) return;
  jobMeta.textContent = state.jobMetaText;
}

function getJobMetaText() {
  return String(getLiveJobMetaElement()?.textContent || "").trim();
}

function safeLocalStorageGet(key = "") {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeLocalStorageSet(key = "", value = "") {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {
    // noop
  }
}

function safeLocalStorageRemove(key = "") {
  try {
    window.localStorage.removeItem(key);
  } catch (_) {
    // noop
  }
}

function normalizeAnalizarPdfTheme(value = "") {
  const theme = String(value || "").trim().toLowerCase();
  return ANALIZAR_PDF_THEMES.includes(theme) ? theme : "light";
}

function applyAnalizarPdfTheme(value = "light", { persist = true } = {}) {
  const theme = normalizeAnalizarPdfTheme(value);
  const meta = ANALIZAR_PDF_THEME_META[theme];
  document.documentElement.dataset.apTheme = theme;
  if (els.themeToggleBtn) {
    const label = `Tema: ${meta.label}. Cambiar tema`;
    els.themeToggleBtn.dataset.theme = theme;
    els.themeToggleBtn.dataset.tooltip = label;
    els.themeToggleBtn.setAttribute("aria-label", label);
    const icon = els.themeToggleBtn.querySelector("i");
    if (icon) icon.className = `fas ${meta.icon}`;
  }
  if (persist) safeLocalStorageSet(ANALIZAR_PDF_THEME_STORAGE_KEY, theme);
  return theme;
}

function cycleAnalizarPdfTheme() {
  const currentTheme = normalizeAnalizarPdfTheme(document.documentElement.dataset.apTheme);
  const nextIndex = (ANALIZAR_PDF_THEMES.indexOf(currentTheme) + 1) % ANALIZAR_PDF_THEMES.length;
  applyAnalizarPdfTheme(ANALIZAR_PDF_THEMES[nextIndex]);
}

function getSessionCatalogStorageKey(user = null) {
  const uid = String(user?.uid || "").trim();
  return uid ? `${SESSION_CATALOG_STORAGE_PREFIX}${uid}` : "";
}

function buildSessionCatalogSnapshot(sessions = []) {
  return (Array.isArray(sessions) ? sessions : []).map((session) => {
    const snapshot = structuredClone(session);
    snapshot.result = null;
    snapshot.revisions = (Array.isArray(snapshot.revisions) ? snapshot.revisions : []).map((revision) => {
      const revisionTintHex = resolveRevisionAccentColor(revision, snapshot?.workflowFormat);
      return {
        ...revision,
        files: (Array.isArray(revision.files) ? revision.files : []).map((file) => ({
          ...file,
          railTintHex: String(snapshot?.workflowFormat === "libre"
            ? (revisionTintHex || file?.railTintHex || "")
            : (file?.railTintHex || revisionTintHex || "")).trim(),
          result: null,
          quickAnalysis: null
        }))
      };
    });
    return snapshot;
  });
}

function persistSessionCatalog(user = null, sessions = []) {
  const key = getSessionCatalogStorageKey(user);
  if (!key) return;
  safeLocalStorageSet(key, JSON.stringify(buildSessionCatalogSnapshot(sessions)));
}

function restoreSessionCatalog(user = null) {
  const key = getSessionCatalogStorageKey(user);
  if (!key) return [];
  try {
    const parsed = JSON.parse(safeLocalStorageGet(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    parsed.forEach((session) => clearInterruptedAnalysisStatuses(session));
    return parsed;
  } catch (_) {
    safeLocalStorageRemove(key);
    return [];
  }
}

function getLocalAnalysisSessionStorageKey(sessionId = "") {
  const cleanSessionId = String(sessionId || "").trim();
  return cleanSessionId ? `${LOCAL_ANALYSIS_SESSION_STORAGE_PREFIX}${cleanSessionId}` : "";
}

function persistLocalAnalysisSession(session = null) {
  const sessionId = String(session?.id || "").trim();
  const key = getLocalAnalysisSessionStorageKey(sessionId);
  if (!key || !session || catalogOnlySessionIds.has(sessionId)) return Promise.resolve(null);
  const snapshot = structuredClone(session);
  const generation = Number(localAnalysisPersistenceGenerations.get(sessionId) || 0);
  const previous = localAnalysisPersistenceChains.get(sessionId) || Promise.resolve();
  const task = previous
    .catch(() => null)
    .then(async () => {
      if (Number(localAnalysisPersistenceGenerations.get(sessionId) || 0) !== generation) return null;
      try {
        return await putAnalizarPdfCachedAnalysisSession(snapshot);
      } catch (_) {
        try {
          safeLocalStorageSet(key, JSON.stringify(snapshot));
        } catch (_) {
          // IndexedDB y localStorage pueden rechazar payloads grandes; el guardado remoto sigue disponible.
        }
        return null;
      }
    });
  const trackedTask = task.finally(() => {
    if (localAnalysisPersistenceChains.get(sessionId) === trackedTask) {
      localAnalysisPersistenceChains.delete(sessionId);
    }
  });
  localAnalysisPersistenceChains.set(sessionId, trackedTask);
  return trackedTask;
}

function mergeLocalAnalysisIntoSession(session = null, local = null) {
  if (!session || !local || typeof local !== "object") return session;
  const next = structuredClone(session);
  const localRevisions = Array.isArray(local.revisions) ? local.revisions : [];
  const localRevisionById = new Map(
    localRevisions
      .map((revision) => [String(revision?.id || "").trim(), revision])
      .filter(([id]) => id)
  );
  next.revisions = Array.isArray(next.revisions) ? next.revisions : [];
  for (const revision of next.revisions) {
    const revisionId = String(revision?.id || "").trim();
    const localRevision = localRevisionById.get(revisionId);
    if (!localRevision) continue;
    const localFilesById = new Map(
      (Array.isArray(localRevision.files) ? localRevision.files : [])
        .map((file) => [String(file?.id || "").trim(), file])
        .filter(([id]) => id)
    );
    revision.files = Array.isArray(revision.files) ? revision.files : [];
    for (const file of revision.files) {
      const localFile = localFilesById.get(String(file?.id || "").trim());
      if (!localFile || (!hasRenderableAnalysis(localFile) && !localFile.quickAnalysis)) continue;
      if (hasRenderableAnalysis(localFile)) {
        file.analysisStatus = localFile.analysisStatus || file.analysisStatus || "completed";
        file.analysisJobId = isBusyAnalysisStatus(localFile.analysisStatus || "") ? (localFile.analysisJobId || "") : "";
        file.result = localFile.result || file.result || createEmptyResultPayload();
        file.resultSummary = localFile.resultSummary || file.resultSummary || createEmptyResultSummary();
      }
      if (localFile.quickAnalysis) {
        file.quickAnalysis = localFile.quickAnalysis;
      }
      file.updatedAt = localFile.updatedAt || file.updatedAt || "";
    }
    const existingFileIds = new Set(revision.files.map((file) => String(file?.id || "").trim()).filter(Boolean));
    for (const localFile of Array.isArray(localRevision.files) ? localRevision.files : []) {
      const localFileId = String(localFile?.id || "").trim();
      if (!localFileId || existingFileIds.has(localFileId) || (!hasRenderableAnalysis(localFile) && !localFile.quickAnalysis)) continue;
      revision.files.push(structuredClone(localFile));
    }
    revision.summary = buildRevisionSummary(revision.files);
    revision.latestAnalysisAt = revision.files.reduce((latest, file) => {
      const analyzedAt = String(file?.resultSummary?.analyzedAt || "").trim();
      return analyzedAt && analyzedAt > latest ? analyzedAt : latest;
    }, String(revision.latestAnalysisAt || "").trim());
  }
  const existingRevisionIds = new Set(next.revisions.map((revision) => String(revision?.id || "").trim()).filter(Boolean));
  for (const localRevision of localRevisions) {
    const localRevisionId = String(localRevision?.id || "").trim();
    const renderableFiles = (Array.isArray(localRevision?.files) ? localRevision.files : []).filter((file) => hasRenderableAnalysis(file) || file?.quickAnalysis);
    if (!localRevisionId || existingRevisionIds.has(localRevisionId) || !renderableFiles.length) continue;
    next.revisions.push({
      ...structuredClone(localRevision),
      files: renderableFiles.map((file) => structuredClone(file)),
      summary: buildRevisionSummary(renderableFiles),
    });
  }
  return next;
}

async function restoreLocalAnalysisSession(session = null) {
  const sessionId = String(session?.id || "").trim();
  const key = getLocalAnalysisSessionStorageKey(sessionId);
  if (!key) return session;
  const cached = await getAnalizarPdfCachedAnalysisSession(sessionId).catch(() => null);
  if (cached && typeof cached === "object") {
    return mergeLocalAnalysisIntoSession(session, cached);
  }
  try {
    const raw = safeLocalStorageGet(key);
    if (!raw) return session;
    const local = JSON.parse(raw);
    if (!local || typeof local !== "object") return session;
    const merged = mergeLocalAnalysisIntoSession(session, local);
    putAnalizarPdfCachedAnalysisSession(merged).catch(() => {});
    return merged;
  } catch (_) {
    return session;
  }
}

function removeLocalAnalysisSession(sessionId = "") {
  const key = getLocalAnalysisSessionStorageKey(sessionId);
  const cleanSessionId = String(sessionId || "").trim();
  const pendingWrite = localAnalysisPersistenceChains.get(cleanSessionId) || Promise.resolve();
  localAnalysisPersistenceGenerations.set(
    cleanSessionId,
    Number(localAnalysisPersistenceGenerations.get(cleanSessionId) || 0) + 1
  );
  localAnalysisPersistenceChains.delete(cleanSessionId);
  catalogOnlySessionIds.delete(cleanSessionId);
  if (key) {
    safeLocalStorageRemove(key);
  }
  Promise.resolve(pendingWrite)
    .catch(() => null)
    .then(() => deleteAnalizarPdfCachedAnalysisSession(cleanSessionId))
    .catch(() => {});
}

function buildSessionTitleFromBibliographicInfo(info = {}) {
  const parts = [
    String(info?.nivel || "").trim(),
    String(info?.grado || "").trim(),
    String(info?.trimestre || "").trim(),
    String(info?.edicionNumero || "").trim(),
  ].filter(Boolean);
  return parts.join(" · ") || "Nuevo análisis";
}

function buildDerivedSessionTitle(session = null) {
  return buildSessionTitleFromBibliographicInfo(session?.bibliographicInfo || {});
}

function buildSessionKey(info = {}) {
  return [
    String(info?.nivel || "").trim().toLowerCase(),
    String(info?.grado || "").trim().toLowerCase(),
    String(info?.trimestre || "").trim().toLowerCase(),
    String(info?.edicionNumero || "").trim().toLowerCase(),
  ].filter(Boolean).join("|");
}

function buildRevisionKey(info = {}) {
  return [
    String(info?.unidad || "").trim().toLowerCase(),
    String(info?.revisionNumero || "").trim().toLowerCase(),
  ].filter(Boolean).join("|");
}

function buildRevisionTitle(info = {}) {
  return [
    String(info?.unidad || "").trim(),
    String(info?.revisionNumero || "").trim(),
  ].filter(Boolean).join(" · ") || "Revisión sin título";
}

function buildDraftRevisionKey() {
  return `__draft__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultExportCleanupOptions() {
  return {
    removeOldNotes: false,
    removeUnusedParagraphStyles: false,
    removeUnusedCharacterStyles: false,
    removeUnusedSwatches: false,
    removeOffPageObjects: false,
    removeOffPageText: false,
    applySelectedCorrections: false,
  };
}

function hasAnyExportActionSelected(options = {}) {
  return Object.values(options || {}).some((value) => value === true);
}

function normalizeExportCleanupOptions(rawOptions = {}) {
  return {
    removeOldNotes: rawOptions.removeOldNotes === true,
    removeUnusedParagraphStyles: rawOptions.removeUnusedParagraphStyles === true,
    removeUnusedCharacterStyles: rawOptions.removeUnusedCharacterStyles === true,
    removeUnusedSwatches: rawOptions.removeUnusedSwatches === true,
    removeOffPageObjects: rawOptions.removeOffPageObjects === true,
    removeOffPageText: rawOptions.removeOffPageText === true,
    applySelectedCorrections: rawOptions.applySelectedCorrections === true,
  };
}

function buildFileKey(fileName = "") {
  return String(fileName || "").trim().toLowerCase();
}

function buildMappingScopeKey(info = {}) {
  return [
    String(info?.bookType || "").trim().toLowerCase(),
    String(info?.nivel || "").trim().toLowerCase(),
    String(info?.grado || "").trim().toLowerCase(),
    String(info?.unidad || "").trim().toLowerCase(),
  ].filter(Boolean).join("|");
}

function buildMappingLookupScopeKeys(info = {}) {
  const keys = [];
  const exactKey = buildMappingScopeKey(info);
  if (exactKey) {
    keys.push(exactKey);
  }
  const wildcardGradeKey = buildMappingScopeKey({
    ...info,
    grado: "",
  });
  if (wildcardGradeKey && !keys.includes(wildcardGradeKey)) {
    keys.push(wildcardGradeKey);
  }
  return keys;
}

function buildCorrectionScopeKey(sessionId = "", revisionId = "", fileId = "") {
  return [
    String(sessionId || "").trim(),
    String(revisionId || "").trim(),
    String(fileId || "").trim(),
  ].filter(Boolean).join("::");
}

function buildCorrectionIssueId(kind = "", issue = {}) {
  const cleanKind = String(kind || "").trim().toLowerCase();
  const storyId = String(issue?.storyId || "").trim();
  const pageName = String(issue?.pageName || "").trim();
  if (cleanKind === "spelling") {
    const token = String(issue?.token || "").trim().toLowerCase();
    const suggestion = String((Array.isArray(issue?.replacements) ? issue.replacements[0] : issue?.suggestion) || "").trim().toLowerCase();
    return [cleanKind, pageName, storyId, token, suggestion].join("::");
  }
  const excerpt = String(issue?.excerpt || "").trim().toLowerCase();
  const suggestion = String(issue?.suggestion || "").trim().toLowerCase();
  return [cleanKind, pageName, storyId, excerpt, suggestion].join("::");
}

function buildCorrectionIssuePayload(kind = "", issue = {}) {
  const cleanKind = String(kind || "").trim().toLowerCase();
  const replacements = Array.isArray(issue?.replacements) ? issue.replacements.filter(Boolean) : [];
  const target = cleanKind === "spelling"
    ? String(replacements[0] || "").trim()
    : String(issue?.suggestion || "").trim();
  const source = cleanKind === "spelling"
    ? String(issue?.token || "").trim()
    : String(issue?.excerpt || "").trim();
  return {
    id: buildCorrectionIssueId(cleanKind, issue),
    kind: cleanKind,
    pageName: String(issue?.pageName || "").trim(),
    storyId: String(issue?.storyId || "").trim(),
    storyTitle: String(issue?.storyTitle || "").trim(),
    storySource: String(issue?.storySource || "").trim(),
    source,
    target,
    context: String(issue?.context || "").trim(),
    message: String(issue?.message || "").trim(),
    replacements,
  };
}

function createEmptyCorrectionSelection() {
  return {
    checkboxesVisible: false,
    selectedPages: [],
    selectedIssueIds: [],
  };
}

function getActiveCorrectionContext(session = store.getActiveSession()) {
  const revision = getActiveRevision(session);
  const file = getActiveFile(session, revision);
  const sessionId = String(session?.id || "").trim();
  const revisionId = String(revision?.id || "").trim();
  const fileId = String(file?.id || "").trim();
  return {
    sessionId,
    revisionId,
    fileId,
    key: buildCorrectionScopeKey(sessionId, revisionId, fileId),
  };
}

function getStoredExportCleanupOptions(session = store.getActiveSession()) {
  const { key } = getActiveCorrectionContext(session);
  if (!key) {
    return null;
  }
  const stored = state.exportCleanupOptionsByScopeKey[key];
  if (!stored || typeof stored !== "object") {
    return null;
  }
  return normalizeExportCleanupOptions(stored);
}

function setExportCleanupOptions(nextOptions = {}, session = store.getActiveSession()) {
  const normalized = normalizeExportCleanupOptions(nextOptions);
  state.exportCleanupOptions = normalized;
  const { key } = getActiveCorrectionContext(session);
  if (key) {
    state.exportCleanupOptionsByScopeKey = {
      ...state.exportCleanupOptionsByScopeKey,
      [key]: normalized,
    };
  }
  return normalized;
}

function getCorrectionSelection(scopeKey = "") {
  const key = String(scopeKey || "").trim();
  if (!key) {
    return createEmptyCorrectionSelection();
  }
  const current = state.correctionSelectionsByScopeKey[key];
  if (current && typeof current === "object") {
    return {
      checkboxesVisible: current.checkboxesVisible === true,
      selectedPages: Array.isArray(current.selectedPages) ? [...new Set(current.selectedPages.map((value) => String(value || "").trim()).filter(Boolean))] : [],
      selectedIssueIds: Array.isArray(current.selectedIssueIds) ? [...new Set(current.selectedIssueIds.map((value) => String(value || "").trim()).filter(Boolean))] : [],
    };
  }
  return createEmptyCorrectionSelection();
}

function setCorrectionSelection(scopeKey = "", updater = null) {
  const key = String(scopeKey || "").trim();
  if (!key || typeof updater !== "function") {
    return createEmptyCorrectionSelection();
  }
  const current = getCorrectionSelection(key);
  const next = updater(current) || current;
  state.correctionSelectionsByScopeKey[key] = {
    checkboxesVisible: next.checkboxesVisible === true,
    selectedPages: Array.isArray(next.selectedPages) ? [...new Set(next.selectedPages.map((value) => String(value || "").trim()).filter(Boolean))] : [],
    selectedIssueIds: Array.isArray(next.selectedIssueIds) ? [...new Set(next.selectedIssueIds.map((value) => String(value || "").trim()).filter(Boolean))] : [],
  };
  return state.correctionSelectionsByScopeKey[key];
}

function collectCorrectionIssuesFromFile(file = null) {
  const pageReports = Array.isArray(file?.result?.stats?.pageReports) ? file.result.stats.pageReports : [];
  const items = [];
  for (const page of pageReports) {
    for (const issue of Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues : []) {
      const payload = buildCorrectionIssuePayload("orthotypography", issue);
      if (payload.source && payload.target) {
        items.push(payload);
      }
    }
    for (const issue of Array.isArray(page?.spellingIssues) ? page.spellingIssues : []) {
      const payload = buildCorrectionIssuePayload("spelling", issue);
      if (payload.source && payload.target) {
        items.push(payload);
      }
    }
  }
  return items;
}

function collectSelectedCorrectionPayload(session = store.getActiveSession()) {
  const revision = getActiveRevision(session);
  const file = getActiveFile(session, revision);
  const context = getActiveCorrectionContext(session);
  const selection = getCorrectionSelection(context.key);
  const selectedPages = new Set(selection.selectedPages);
  const selectedIssueIds = new Set(selection.selectedIssueIds);
  const issues = collectCorrectionIssuesFromFile(file).filter((issue) => {
    return selectedPages.has(issue.pageName) && selectedIssueIds.has(issue.id);
  });
  const autoApplicable = issues.filter((issue) => Boolean(issue.storyId)).length;
  const editorialFallback = issues.length - autoApplicable;
  return {
    context,
    selection,
    issues,
    summary: {
      selectedPageCount: selectedPages.size,
      selectedIssueCount: issues.length,
      autoApplicableCount: autoApplicable,
      editorialFallbackCount: editorialFallback,
    }
  };
}

function seedExportCleanupOptions(session = store.getActiveSession()) {
  const correctionPayload = collectSelectedCorrectionPayload(session);
  const nextOptions = createDefaultExportCleanupOptions();
  if (correctionPayload.issues.length) {
    nextOptions.applySelectedCorrections = true;
  }
  return setExportCleanupOptions(nextOptions, session);
}

function buildExportConfigSummaryLines(session = store.getActiveSession()) {
  const correctionPayload = collectSelectedCorrectionPayload(session);
  const cleanupOptions = state.exportCleanupOptions && typeof state.exportCleanupOptions === "object"
    ? state.exportCleanupOptions
    : createDefaultExportCleanupOptions();
  const activeCleanupCount = Object.entries(cleanupOptions).filter(([key, value]) => key !== "applySelectedCorrections" && value === true).length;
  return [
    `Páginas seleccionadas: ${correctionPayload.summary.selectedPageCount}`,
    `Hallazgos seleccionados: ${correctionPayload.summary.selectedIssueCount}`,
    `Autocorrecciones directas: ${correctionPayload.summary.autoApplicableCount}`,
    `Notas editoriales por fallback: ${correctionPayload.summary.editorialFallbackCount}`,
    `Limpiezas activas: ${activeCleanupCount}`,
  ];
}

function renderExportConfigModal() {
  if (!els.exportConfigModal) return;
  els.exportConfigModal.hidden = !state.exportConfigModalOpen;
  if (!state.exportConfigModalOpen) {
    return;
  }
  const options = state.exportCleanupOptions && typeof state.exportCleanupOptions === "object"
    ? state.exportCleanupOptions
    : createDefaultExportCleanupOptions();
  if (els.cleanupOldNotesInput) {
    els.cleanupOldNotesInput.checked = options.removeOldNotes === true;
  }
  if (els.cleanupUnusedParagraphStylesInput) {
    els.cleanupUnusedParagraphStylesInput.checked = options.removeUnusedParagraphStyles === true;
  }
  if (els.cleanupUnusedCharacterStylesInput) {
    els.cleanupUnusedCharacterStylesInput.checked = options.removeUnusedCharacterStyles === true;
  }
  if (els.cleanupUnusedSwatchesInput) {
    els.cleanupUnusedSwatchesInput.checked = options.removeUnusedSwatches === true;
  }
  if (els.cleanupOffPageObjectsInput) {
    els.cleanupOffPageObjectsInput.checked = options.removeOffPageObjects === true;
  }
  if (els.cleanupOffPageTextInput) {
    els.cleanupOffPageTextInput.checked = options.removeOffPageText === true;
  }
  if (els.applySelectedCorrectionsInput) {
    els.applySelectedCorrectionsInput.checked = options.applySelectedCorrections === true;
  }
  if (els.exportConfigSummary) {
    els.exportConfigSummary.innerHTML = buildExportConfigSummaryLines().map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  }
  if (els.exportConfigConfirmBtn) {
    els.exportConfigConfirmBtn.disabled = state.isExportingCorrectedIdml
      || !canExportCurrentFileAsIdml()
      || !hasAnyExportActionSelected(options);
  }
}

function openExportConfigModal(session = store.getActiveSession()) {
  const storedOptions = getStoredExportCleanupOptions(session);
  if (storedOptions) {
    setExportCleanupOptions(storedOptions, session);
  } else {
    seedExportCleanupOptions(session);
  }
  exportConfigRestoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : els.exportCorrectedBtn;
  state.exportConfigModalOpen = true;
  renderExportConfigModal();
  focusExportConfigModal();
}

function closeExportConfigModal({ restoreFocus = true } = {}) {
  state.exportConfigModalOpen = false;
  renderExportConfigModal();
  if (restoreFocus) {
    restoreExportConfigFocus();
  }
}

function focusExportConfigModal() {
  if (!state.exportConfigModalOpen || !els.exportConfigModal) return;
  if (!els.exportConfigModal.hasAttribute("tabindex")) {
    els.exportConfigModal.setAttribute("tabindex", "-1");
  }
  const target = [
    els.applySelectedCorrectionsInput,
    els.cleanupOldNotesInput,
    els.cleanupUnusedParagraphStylesInput,
    els.cleanupUnusedCharacterStylesInput,
    els.cleanupUnusedSwatchesInput,
    els.cleanupOffPageObjectsInput,
    els.cleanupOffPageTextInput,
    els.exportConfigConfirmBtn,
    els.exportConfigCancelBtn,
    els.exportConfigCloseBtn,
  ].find((element) => element && element.disabled !== true && typeof element.focus === "function");
  window.requestAnimationFrame(() => {
    if (!state.exportConfigModalOpen) return;
    const focusTarget = target || els.exportConfigModal;
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (_) {
      focusTarget.focus();
    }
  });
}

function restoreExportConfigFocus() {
  const target = exportConfigRestoreFocusEl && exportConfigRestoreFocusEl.isConnected
    ? exportConfigRestoreFocusEl
    : els.exportCorrectedBtn;
  exportConfigRestoreFocusEl = null;
  if (!target || typeof target.focus !== "function") {
    return;
  }
  window.requestAnimationFrame(() => {
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      target.focus();
    }
  });
}

function normalizeMappingEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalizedKind = String(source.styleKind || "paragraph").trim();
  const normalizedScope = String(source.pageScope || "both").trim().toLowerCase();
  const normalizedTargetPage = normalizeMappingPageList(source.targetPage || "", { zeroMeansEmpty: true });
  const normalizedExcludeTargetPage = normalizeMappingPageList(source.excludeTargetPage || "0", { zeroMeansEmpty: true, fallbackZero: true });
  return {
    id: String(source.id || `mapping_entry_${index + 1}`).trim() || `mapping_entry_${index + 1}`,
    alias: String(source.alias || "").trim(),
    styleKind: normalizedKind === "character" || normalizedKind === "swatch" ? normalizedKind : "paragraph",
    styleName: String(source.styleName || "").trim(),
    pageScope: normalizedScope === "even" || normalizedScope === "odd" ? normalizedScope : "both",
    targetPage: normalizedTargetPage,
    excludeTargetPage: normalizedExcludeTargetPage,
    enabled: source.enabled !== false,
    notes: String(source.notes || "").trim(),
  };
}

function normalizeMappingPageList(value = "", options = {}) {
  const zeroMeansEmpty = options?.zeroMeansEmpty === true;
  const fallbackZero = options?.fallbackZero === true;
  const tokens = String(value || "")
    .split(",")
    .map((token) => Number.parseInt(String(token || "").trim(), 10))
    .filter((token) => Number.isFinite(token) && token >= 0 && token <= 999);
  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (zeroMeansEmpty && token === 0) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }
  if (!unique.length) {
    return fallbackZero ? "0" : "";
  }
  return unique.join(", ");
}

function normalizeStyleMapping(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bookType = String(source.bookType || "").trim();
  const nivel = String(source.nivel || "").trim();
  const grado = String(source.grado || "").trim();
  const unidad = String(source.unidad || "").trim();
  const fallbackId = `mapping_${index + 1}`;
  const hasExplicitId = Object.prototype.hasOwnProperty.call(source, "id");
  const explicitId = hasExplicitId
    ? String(source.id || "").trim()
    : "";
  const resolvedId = hasExplicitId ? explicitId : fallbackId;
  const explicitMappingSlug = Object.prototype.hasOwnProperty.call(source, "mappingSlug")
    ? String(source.mappingSlug || "").trim()
    : "";
  const resolvedMappingSlug = explicitMappingSlug || resolvedId;
  return {
    id: resolvedId,
    title: String(source.title || "Mapeo sin título").trim() || "Mapeo sin título",
    mappingSlug: resolvedMappingSlug,
    scopeKey: String(source.scopeKey || buildMappingScopeKey({ bookType, nivel, grado, unidad })).trim(),
    bookType,
    nivel,
    grado,
    unidad,
    groupId: String(source.groupId || "").trim(),
    groupTitle: String(source.groupTitle || "").trim(),
    isActive: source.isActive === true,
    updatedAt: String(source.updatedAt || "").trim(),
    entries: Array.isArray(source.entries) ? source.entries.map((entry, entryIndex) => normalizeMappingEntry(entry, entryIndex)) : [],
  };
}

function isLegacyDefaultStyleMapping(mapping = null) {
  const id = String(mapping?.id || "").trim();
  if (LEGACY_DEFAULT_MAPPING_IDS.has(id)) return true;
  const slug = String(mapping?.mappingSlug || "").trim();
  if (LEGACY_DEFAULT_MAPPING_IDS.has(slug)) return true;
  const title = String(mapping?.title || "").trim().toLowerCase();
  return title === "la · proyecto" || title === "la · recortables" || title === "la · primero · unidad normal";
}

function slugifyMappingGroupPart(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeMappingGroup(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const title = String(source.title || source.groupTitle || "").trim() || `Grupo ${index + 1}`;
  const id = String(source.id || source.groupId || `mapping_group_${slugifyMappingGroupPart(title) || index + 1}`).trim();
  return {
    id,
    title,
    createdAt: String(source.createdAt || new Date().toISOString()).trim(),
  };
}

function loadMappingGroupsFromStorage() {
  try {
    const raw = window.localStorage.getItem(MAPPING_GROUPS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.mappingGroups = Array.isArray(parsed) ? parsed.map((entry, index) => normalizeMappingGroup(entry, index)) : [];
  } catch (_) {
    state.mappingGroups = [];
  }
}

function persistMappingGroupsToStorage() {
  try {
    window.localStorage.setItem(MAPPING_GROUPS_STORAGE_KEY, JSON.stringify(state.mappingGroups || []));
  } catch (_) {
    // best-effort
  }
}

function getMappingGroups() {
  const groupsById = new Map();
  for (const group of Array.isArray(state.mappingGroups) ? state.mappingGroups : []) {
    const normalized = normalizeMappingGroup(group, groupsById.size);
    if (normalized.id) groupsById.set(normalized.id, normalized);
  }
  for (const mapping of Array.isArray(state.styleMappings) ? state.styleMappings : []) {
    const groupId = String(mapping?.groupId || "").trim();
    const groupTitle = String(mapping?.groupTitle || "").trim();
    if (!groupId || groupsById.has(groupId)) continue;
    groupsById.set(groupId, normalizeMappingGroup({ id: groupId, title: groupTitle || groupId }, groupsById.size));
  }
  state.mappingGroups = [...groupsById.values()];
  persistMappingGroupsToStorage();
  return state.mappingGroups;
}

function createMappingGroup(title = "") {
  const cleanTitle = String(title || "").trim() || "Grupo de plantillas";
  const baseId = `mapping_group_${slugifyMappingGroupPart(cleanTitle) || Date.now()}`;
  const existingIds = new Set(getMappingGroups().map((group) => group.id));
  let id = baseId;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }
  const group = normalizeMappingGroup({ id, title: cleanTitle, createdAt: new Date().toISOString() });
  state.mappingGroups = [...getMappingGroups(), group];
  persistMappingGroupsToStorage();
  return group;
}

function findMappingGroupByTitle(title = "") {
  const targetSlug = slugifyMappingGroupPart(title);
  if (!targetSlug) return null;
  return getMappingGroups().find((group) => slugifyMappingGroupPart(group?.title || "") === targetSlug) || null;
}

function getOrCreateMappingGroup(title = "") {
  const existing = findMappingGroupByTitle(title);
  if (existing) {
    return existing;
  }
  return createMappingGroup(title);
}

function removeMappingGroupFromStorage(groupId = "") {
  const cleanGroupId = String(groupId || "").trim();
  if (!cleanGroupId || cleanGroupId === UNGROUPED_MAPPING_GROUP_ID) return false;
  const currentGroups = getMappingGroups();
  const nextGroups = currentGroups.filter((group) => group.id !== cleanGroupId);
  if (nextGroups.length === currentGroups.length) return false;
  state.mappingGroups = nextGroups;
  persistMappingGroupsToStorage();
  return true;
}

function getMappingGroupIdForMapping(mapping = null) {
  return String(mapping?.groupId || "").trim() || UNGROUPED_MAPPING_GROUP_ID;
}

function getMappingGroupTitleById(groupId = "") {
  const cleanGroupId = String(groupId || "").trim();
  if (!cleanGroupId || cleanGroupId === UNGROUPED_MAPPING_GROUP_ID) {
    return "Sin grupo";
  }
  const group = getMappingGroups().find((entry) => entry.id === cleanGroupId) || null;
  return group?.title || cleanGroupId;
}

function getVisibleMappingGroupsForMappings(mappings = []) {
  const filteredMappings = Array.isArray(mappings) ? mappings : [];
  const countsByGroupId = new Map();
  for (const mapping of filteredMappings) {
    const groupId = getMappingGroupIdForMapping(mapping);
    countsByGroupId.set(groupId, (countsByGroupId.get(groupId) || 0) + 1);
  }
  const groups = getMappingGroups().map((group) => ({
    ...group,
    count: countsByGroupId.get(group.id) || 0,
  }));
  if (countsByGroupId.has(UNGROUPED_MAPPING_GROUP_ID)) {
    groups.unshift({
      id: UNGROUPED_MAPPING_GROUP_ID,
      title: "Sin grupo",
      count: countsByGroupId.get(UNGROUPED_MAPPING_GROUP_ID) || 0,
      isVirtual: true,
    });
  }
  return groups.filter((group) => group.count > 0 || !group.isVirtual);
}

function ensureActiveMappingGroupSelection(filteredMappings = []) {
  const visibleGroups = getVisibleMappingGroupsForMappings(filteredMappings);
  const visibleGroupIds = new Set(visibleGroups.map((group) => group.id));
  const activeMapping = getActiveMapping();
  const draft = state.__mappingDraft ? normalizeStyleMapping(state.__mappingDraft) : null;
  const selectedFromMapping = draft
    ? getMappingGroupIdForMapping(draft)
    : activeMapping
      ? getMappingGroupIdForMapping(activeMapping)
      : "";
  if (selectedFromMapping && visibleGroupIds.has(selectedFromMapping)) {
    state.activeMappingGroupId = selectedFromMapping;
    return visibleGroups;
  }
  if (!state.activeMappingGroupId || !visibleGroupIds.has(state.activeMappingGroupId)) {
    state.activeMappingGroupId = visibleGroups[0]?.id || "";
  }
  if (state.activeMappingId) {
    const selectedGroupId = state.activeMappingGroupId;
    const activeGroupId = activeMapping ? getMappingGroupIdForMapping(activeMapping) : "";
    if (selectedGroupId && activeGroupId && selectedGroupId !== activeGroupId) {
      state.activeMappingId = "";
      state.__mappingDraft = null;
    }
  }
  return visibleGroups;
}

function getMappingsForActiveGroup(filteredMappings = []) {
  const selectedGroupId = String(state.activeMappingGroupId || "").trim();
  if (!selectedGroupId) return [];
  return (Array.isArray(filteredMappings) ? filteredMappings : [])
    .filter((mapping) => getMappingGroupIdForMapping(mapping) === selectedGroupId);
}

function buildTemplateGroupTitle(session = null) {
  const info = session?.bibliographicInfo || {};
  return [
    "Plantillas",
    info.nivel,
    info.grado,
    info.trimestre,
    info.edicionNumero ? `${info.edicionNumero}` : "",
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" · ") || "Plantillas de fichas editoriales";
}

function buildTemplateMappingIdentity(session = null, revision = null) {
  const info = session?.bibliographicInfo || {};
  return [
    info.bookType,
    info.nivel,
    info.grado,
    String(revision?.unidad || info.unidad || "").trim(),
    String(revision?.revisionNumero || "").trim(),
  ].map((value) => slugifyMappingGroupPart(value)).filter(Boolean).join("::");
}

function findExistingTemplateMappingForRevision(session = null, revision = null, group = null) {
  const groupId = String(group?.id || "").trim();
  const identity = buildTemplateMappingIdentity(session, revision);
  if (!groupId || !identity) return null;
  return (Array.isArray(state.styleMappings) ? state.styleMappings : []).find((mapping) => {
    if (String(mapping?.groupId || "").trim() !== groupId) return false;
    return buildTemplateMappingIdentity({
      bibliographicInfo: {
        bookType: mapping.bookType,
        nivel: mapping.nivel,
        grado: mapping.grado,
        unidad: mapping.unidad,
      },
    }, {
      unidad: mapping.unidad,
      revisionNumero: String(revision?.revisionNumero || "").trim(),
    }) === identity;
  }) || null;
}

function buildMappingTemplateEntries(template = []) {
  return template.map((entry, index) => normalizeMappingEntry({
    id: entry.id || `mapping_entry_${index + 1}`,
    alias: entry.alias || "",
    styleKind: entry.styleKind || "paragraph",
    styleName: entry.styleName || "",
    pageScope: entry.pageScope || "both",
    targetPage: entry.targetPage || "",
    excludeTargetPage: entry.excludeTargetPage || "0",
    enabled: entry.enabled !== false,
    notes: entry.notes || "",
  }, index));
}

function resolveSuggestedMappingEntries(info = {}) {
  const unidad = String(info?.unidad || "").trim();
  const grado = String(info?.grado || "").trim().toLowerCase();
  const bookType = String(info?.bookType || "").trim().toUpperCase();
  if (bookType === "LA" && unidad === "Proyecto") {
    return buildMappingTemplateEntries(LA_PROYECTO_MAPPING_TEMPLATE);
  }
  if (/^recortables?$/i.test(unidad)) {
    return buildMappingTemplateEntries(bookType === "LA" ? LA_PROYECTO_MAPPING_TEMPLATE : PROYECTO_IDML_MAPPING_TEMPLATE);
  }
  if (bookType === "LA" && /^unidad\s+\d+/i.test(unidad) && grado === "primero") {
    return buildMappingTemplateEntries(LA_UNIDAD_PRIMERO_MAPPING_TEMPLATE);
  }
  return [];
}

function getFilteredMappings() {
  const filters = {
    bookType: String(els.mappingsBookTypeFilter?.value || "").trim(),
    nivel: String(els.mappingsNivelFilter?.value || "").trim(),
    grado: String(els.mappingsGradoFilter?.value || "").trim(),
    unidad: String(els.mappingsUnidadFilter?.value || "").trim(),
  };
  return (Array.isArray(state.styleMappings) ? state.styleMappings : []).filter((mapping) => {
    if (filters.bookType && mapping.bookType !== filters.bookType) return false;
    if (filters.nivel && mapping.nivel !== filters.nivel) return false;
    if (filters.grado && mapping.grado !== filters.grado) return false;
    if (filters.unidad && mapping.unidad !== filters.unidad) return false;
    return true;
  });
}

function getActiveMapping() {
  return (Array.isArray(state.styleMappings) ? state.styleMappings : []).find((mapping) => mapping.id === state.activeMappingId) || null;
}

function resolveDefaultMappingForSession(session = null) {
  if (!session?.bibliographicInfo) return null;
  const rawUnidad = String(session.bibliographicInfo.unidad || "").trim();
  const candidates = [rawUnidad];
  if (/^Unidad\s+\d+/i.test(rawUnidad)) {
    candidates.push("Unidad normal");
  }
  for (const unidad of candidates.filter(Boolean)) {
    const scopeKeys = buildMappingLookupScopeKeys({
      bookType: session.bibliographicInfo.bookType,
      nivel: session.bibliographicInfo.nivel,
      grado: session.bibliographicInfo.grado,
      unidad,
    });
    for (const scopeKey of scopeKeys) {
      const match = (Array.isArray(state.styleMappings) ? state.styleMappings : []).find((mapping) => mapping.scopeKey === scopeKey && mapping.isActive);
      if (match) {
        return match;
      }
    }
  }
  return null;
}

function createEmptyMappingDraft() {
  const session = store.getActiveSession();
  return normalizeStyleMapping({
    id: "",
    title: "",
    bookType: String(session?.bibliographicInfo?.bookType || "").trim(),
    nivel: String(session?.bibliographicInfo?.nivel || "").trim(),
    grado: String(session?.bibliographicInfo?.grado || "").trim(),
    unidad: String(session?.bibliographicInfo?.unidad || "").trim(),
    isActive: false,
    entries: resolveSuggestedMappingEntries(session?.bibliographicInfo || {})
  });
}

function getSessionBaseInfo(session = null) {
  return {
    nivel: String(session?.bibliographicInfo?.nivel || "").trim(),
    grado: String(session?.bibliographicInfo?.grado || "").trim(),
    trimestre: String(session?.bibliographicInfo?.trimestre || "").trim(),
    edicionNumero: String(session?.bibliographicInfo?.edicionNumero || "").trim(),
  };
}

function resolveBibliographicRecortableRole(session = null, revision = getActiveRevision(session)) {
  const unidad = String(revision?.unidad || session?.bibliographicInfo?.unidad || "").trim();
  if (shouldShowRecortableRole(unidad)) {
    const revisionRole = normalizeRecortableRole(revision?.recortableRole, unidad);
    if (revisionRole) {
      return revisionRole;
    }
    const storedRole = normalizeRecortableRole(session?.bibliographicInfo?.recortableRole, unidad);
    if (storedRole) {
      return storedRole;
    }
  }
  return "source";
}

function getRevisionDraftInfo(session = null) {
  const activeRevision = getActiveRevision(session);
  const unidad = String(activeRevision?.unidad || session?.bibliographicInfo?.unidad || "").trim();
  return {
    unidad,
    revisionNumero: String(activeRevision?.revisionNumero || session?.bibliographicInfo?.revisionNumero || "").trim(),
    recortableRole: shouldShowRecortableRole(unidad)
      ? normalizeRecortableRole(
        activeRevision?.recortableRole || session?.bibliographicInfo?.recortableRole || "source",
        unidad
      )
      : "",
  };
}

function getActiveRevision(session = null) {
  if (!session) return null;
  const revisionId = String(state.activeRevisionId || "").trim();
  return session.revisions?.find((entry) => entry.id === revisionId) || session.revisions?.[0] || null;
}

function getActiveFile(session = null, revision = getActiveRevision(session)) {
  const fileId = String(state.activeFileId || "").trim();
  return revision?.files?.find((entry) => entry.id === fileId) || revision?.files?.[0] || null;
}

function getFileEntryKey(file = null) {
  return String(file?.fileKey || buildFileKey(file?.documentName || file?.fileName || "")).trim();
}

function buildNonRecortableFileKeySet(session = null) {
  const keys = new Set();
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    if (shouldShowRecortableRole(revision?.unidad || "")) {
      continue;
    }
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      const fileKey = getFileEntryKey(file);
      if (fileKey) {
        keys.add(fileKey);
      }
    }
  }
  return keys;
}

function isRecortableFileContaminatedBySource(session = null, revision = null, file = null) {
  if (!shouldShowRecortableRole(revision?.unidad || "")) {
    return false;
  }
  const fileKey = getFileEntryKey(file);
  if (!fileKey) {
    return false;
  }
  return buildNonRecortableFileKeySet(session).has(fileKey);
}

function isRecortableDestinationCandidate(activeRevision = null, candidateRevision = null) {
  if (!candidateRevision || !shouldShowRecortableRole(candidateRevision?.unidad || "")) {
    return false;
  }
  if (String(activeRevision?.id || "").trim() === String(candidateRevision?.id || "").trim()) {
    return false;
  }
  if (!shouldShowRecortableRole(activeRevision?.unidad || "")) {
    return true;
  }
  return recortableRoleSupportsDestination(candidateRevision);
}

function buildMissingRecortableDestinationIssues(session = null, activeRevision = null, targets = []) {
  if (!session || !activeRevision || recortableRoleSupportsDestination(activeRevision)) {
    return [];
  }
  const targetRevisionIds = new Set(
    (Array.isArray(targets) ? targets : [])
      .map((target) => String(target?.revision?.id || "").trim())
      .filter(Boolean)
  );
  return (Array.isArray(session?.revisions) ? session.revisions : [])
    .filter((revision) => isRecortableDestinationCandidate(activeRevision, revision))
    .filter((revision) => !targetRevisionIds.has(String(revision?.id || "").trim()))
    .map((revision) => {
      const files = Array.isArray(revision?.files) ? revision.files : [];
      const cleanFiles = files.filter((file) => !isRecortableFileContaminatedBySource(session, revision, file));
      if (cleanFiles.some((file) => hasRenderableAnalysis(file))) {
        return null;
      }
      const title = String(revision?.title || revision?.unidad || "Recortables").trim();
      const message = !cleanFiles.length
        ? `${title}: falta el archivo recortable destino; vuelve a seleccionar el IDML REC en esa ficha.`
        : `${title}: no hay copia local ni fuente guardada disponible; vuelve a seleccionar el IDML REC en esa ficha.`;
      return {
        revisionId: String(revision?.id || "").trim(),
        fileId: String(cleanFiles[0]?.id || "").trim(),
        message,
      };
    })
    .filter(Boolean);
}

function createMissingRecortableDestinationError(prefix = "", issues = []) {
  const messages = (Array.isArray(issues) ? issues : []).map((issue) => String(issue?.message || "").trim()).filter(Boolean);
  const error = new Error(`${prefix} ${messages.join(" ")}`.trim());
  error.code = "RECORTABLE_DESTINATION_MISSING";
  error.missingRecortableDestinationIssues = Array.isArray(issues) ? issues : [];
  return error;
}

function focusMissingRecortableDestination(error = null) {
  const issue = Array.isArray(error?.missingRecortableDestinationIssues)
    ? error.missingRecortableDestinationIssues.find((entry) => String(entry?.revisionId || "").trim())
    : null;
  if (!issue) {
    return false;
  }
  state.activeRevisionId = String(issue.revisionId || "").trim();
  state.activeFileId = String(issue.fileId || "").trim();
  state.selectedFiles = [];
  if (els.fileInput) {
    els.fileInput.value = "";
  }
  const session = store.getActiveSession();
  const revision = getActiveRevision(session);
  if (revision) {
    mutateActiveSession((draft) => {
      draft.analysisStatus = "idle";
      draft.analysisJobId = "";
      draft.bibliographicInfo.unidad = revision.unidad || "";
      draft.bibliographicInfo.revisionNumero = revision.revisionNumero || "";
      draft.bibliographicInfo.recortableRole = resolveBibliographicRecortableRole(draft, revision);
      return draft;
    }, { render: false });
  }
  return true;
}

function isMissingRecortableDestinationError(error = null) {
  return String(error?.code || "").trim() === "RECORTABLE_DESTINATION_MISSING";
}

function removeRecortableSourceFileContamination(session = null) {
  if (!session || typeof session !== "object") {
    return session;
  }
  for (const revision of Array.isArray(session.revisions) ? session.revisions : []) {
    if (shouldShowRecortableRole(revision?.unidad || "")) {
      continue;
    }
    const files = Array.isArray(revision.files) ? revision.files : [];
    const cleanFiles = files.filter((file) => !isRecortableDocumentMisassignedToSource(revision, file));
    if (cleanFiles.length === files.length) {
      continue;
    }
    revision.files = cleanFiles;
    revision.fileCount = revision.files.length;
    revision.summary = buildRevisionSummary(revision.files);
    revision.updatedAt = new Date().toISOString();
  }
  const sourceFileKeys = buildNonRecortableFileKeySet(session);
  if (!sourceFileKeys.size) {
    return session;
  }
  for (const revision of Array.isArray(session.revisions) ? session.revisions : []) {
    if (!shouldShowRecortableRole(revision?.unidad || "")) {
      continue;
    }
    const files = Array.isArray(revision.files) ? revision.files : [];
    const cleanFiles = files.filter((file) => !sourceFileKeys.has(getFileEntryKey(file)));
    if (!cleanFiles.length) {
      continue;
    }
    revision.files = cleanFiles;
    revision.fileCount = revision.files.length;
    revision.summary = buildRevisionSummary(revision.files);
  }
  return session;
}

async function restoreCachedFilesForRevision(session = null, revision = null) {
  const sessionId = String(session?.id || "").trim();
  const revisionId = String(revision?.id || "").trim();
  if (!sessionId || !revisionId) {
    return false;
  }
  const cachedRecords = await listAnalizarPdfCachedFilesByRevision(sessionId, revisionId);
  return restoreCachedFileRecordsIntoRevision(session, revision, cachedRecords);
}

function looksLikeRecortableDocumentName(value = "") {
  const name = String(value || "").trim();
  if (!name) return false;
  return /(?:^|[_\-\s])REC(?:[_\-\s.]|$)/i.test(name) || /recortable/i.test(name);
}

function isRecortableDocumentMisassignedToSource(revision = null, file = null) {
  return !shouldShowRecortableRole(revision?.unidad || "")
    && looksLikeRecortableDocumentName(file?.documentName || file?.fileName || file?.name || "");
}

function restoreCachedFileRecordsIntoRevision(session = null, revision = null, cachedRecords = []) {
  const sessionId = String(session?.id || "").trim();
  const revisionId = String(revision?.id || "").trim();
  if (!sessionId || !revisionId || !revision) {
    return false;
  }
  const existingFileIds = new Set((Array.isArray(revision.files) ? revision.files : []).map((file) => String(file?.id || "").trim()).filter(Boolean));
  const existingFileKeys = new Set((Array.isArray(revision.files) ? revision.files : []).map((file) => getFileEntryKey(file)).filter(Boolean));
  let changed = false;
  revision.files = Array.isArray(revision.files) ? revision.files : [];
  for (const record of cachedRecords) {
    const fileId = String(record?.fileId || "").trim();
    const fileName = String(record?.fileName || record?.file?.name || "").trim();
    const fileKey = buildFileKey(fileName);
    if (!fileId || !fileName || existingFileIds.has(fileId) || existingFileKeys.has(fileKey)) {
      continue;
    }
    revision.files.push({
      id: fileId,
      fileKey,
      documentName: fileName,
      mappingId: String(revision.mappingId || "").trim(),
      mappingTitle: String(revision.mappingTitle || "").trim(),
      mappingUpdatedAt: String(revision.mappingUpdatedAt || "").trim(),
      sourceAssetPath: "",
      localBlobKey: String(record.id || buildAnalizarPdfLocalBlobKey(sessionId, revisionId, fileId)).trim(),
      hasLocalSource: true,
      fileSize: Number(record.size || record.file?.size || 0) || 0,
      fileLastModified: Number(record.lastModified || record.file?.lastModified || 0) || 0,
      fileMimeType: String(record.type || record.file?.type || "").trim(),
      sourceType: getNormalizedSourceType(session.sourceType),
      analysisStatus: "idle",
      analysisJobId: "",
      createdAt: String(record.updatedAt || new Date().toISOString()).trim(),
      updatedAt: new Date().toISOString(),
      resultSummary: createEmptyResultSummary(),
      result: createEmptyResultPayload(),
    });
    existingFileIds.add(fileId);
    existingFileKeys.add(fileKey);
    changed = true;
  }
  if (changed) {
    normalizeSingleFilePerRevision(session);
    revision.fileCount = revision.files.length;
    revision.summary = buildRevisionSummary(revision.files);
    revision.updatedAt = new Date().toISOString();
  }
  return changed;
}

async function restoreCachedFilesForRecortableDestinations(session = null, activeRevision = null) {
  if (!session || typeof session !== "object") {
    return session;
  }
  let changed = false;
  const sessionId = String(session?.id || "").trim();
  const sessionCachedRecords = sessionId ? await listAnalizarPdfCachedFilesBySession(sessionId) : [];
  for (const revision of Array.isArray(session.revisions) ? session.revisions : []) {
    if (!isRecortableDestinationCandidate(activeRevision, revision)) {
      continue;
    }
    const exactRestored = await restoreCachedFilesForRevision(session, revision);
    const revisionFiles = Array.isArray(revision.files) ? revision.files : [];
    const needsRecFallback = !revisionFiles.some((file) => !isRecortableFileContaminatedBySource(session, revision, file));
    const fallbackRecords = needsRecFallback
      ? sessionCachedRecords.filter((record) => {
        const recordRevisionId = String(record?.revisionId || "").trim();
        const recordFileName = String(record?.fileName || record?.file?.name || "").trim();
        return recordRevisionId !== String(revision.id || "").trim() && looksLikeRecortableDocumentName(recordFileName);
      })
      : [];
    const fallbackRestored = fallbackRecords.length
      ? restoreCachedFileRecordsIntoRevision(session, revision, fallbackRecords)
      : false;
    logAnalizarPdfFlow("restoreRecortableDestinationCache:revision", {
      sessionId,
      activeRevisionId: activeRevision?.id || "",
      revisionId: revision?.id || "",
      exactRestored,
      fallbackRecordCount: fallbackRecords.length,
      fallbackRestored,
      fileCount: Array.isArray(revision.files) ? revision.files.length : 0,
    });
    if (exactRestored || fallbackRestored) {
      changed = true;
    }
  }
  if (!changed) {
    return session;
  }
  const saved = await saveSession(session);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  return saved;
}

function isRevisionBusy(revision = null) {
  const revisionStatus = String(revision?.analysisStatus || "").trim().toLowerCase();
  if (isBusyAnalysisStatus(revisionStatus)) {
    return true;
  }
  return Array.isArray(revision?.files) && revision.files.some((file) => isBusyAnalysisStatus(file?.analysisStatus || ""));
}

function resolveMappingEntriesForRevision(revision = null) {
  const mappingId = String(revision?.mappingId || "").trim();
  if (!mappingId) return [];
  const mapping = (Array.isArray(state.styleMappings) ? state.styleMappings : []).find((entry) => String(entry?.id || "").trim() === mappingId) || null;
  return Array.isArray(mapping?.entries) ? mapping.entries.filter((entry) => entry?.enabled !== false && String(entry?.alias || "").trim()) : [];
}

function formatRailTrimesterLabel(value = "") {
  const cleanValue = String(value || "").trim();
  const match = cleanValue.match(/(\d+)/);
  if (match) return `Trim ${match[1]}`;
  return cleanValue;
}

function buildEditorialRailTitle(session = null, revision = null) {
  const info = session?.bibliographicInfo || {};
  const parts = [
    info.grado,
    formatRailTrimesterLabel(info.trimestre),
    revision?.unidad || info.unidad,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return parts.join(" · ") || String(revision?.title || "Ficha editorial").trim() || "Ficha editorial";
}

function buildEditorialProcessLabel(session = null, revision = null, file = null, options = {}) {
  const action = String(options?.action || "Analizando").trim() || "Analizando";
  const step = String(options?.step || "").trim();
  const index = Number(options?.index || 0);
  const total = Number(options?.total || 0);
  const progress = Number.isFinite(index) && index > 0 && Number.isFinite(total) && total > 0
    ? `${index}/${total}`
    : "";
  const target = buildEditorialRailTitle(session, revision);
  const fileName = String(file?.documentName || file?.name || "").trim();
  return [
    [action, progress].filter(Boolean).join(" "),
    target,
    step,
    fileName ? `Archivo: ${fileName}` : "",
  ].filter(Boolean).join(" · ");
}

function buildRenderableSession(session = null) {
  if (!session) return null;
  const revision = getActiveRevision(session);
  const file = getActiveFile(session, revision);
  const correctionContext = getActiveCorrectionContext(session);
  const correctionSelection = getCorrectionSelection(correctionContext.key);
  const activeMappingEntries = resolveMappingEntriesForRevision(revision);
  const fallbackFileResults = (Array.isArray(session?.revisions) ? session.revisions : []).flatMap((revisionEntry, revisionIndex) => {
    const mappingEntries = resolveMappingEntriesForRevision(revisionEntry);
    const revisionFiles = Array.isArray(revisionEntry?.files) ? revisionEntry.files : [];
    return revisionFiles
      .filter((entry) => hasRenderableAnalysis(entry) || entry?.quickAnalysis)
      .map((entry, fileIndex) => ({
        ...session,
        revisionId: revisionEntry?.id || "",
        fileId: entry?.id || "",
        revisionIndex,
        fileIndex,
        title: `${session.title} · ${revisionEntry?.title || "Revisión"} · ${entry.documentName || "Archivo"}`,
        fileTitle: entry.documentName || "Archivo",
        railTitle: buildEditorialRailTitle(session, revisionEntry),
        railTooltip: entry.documentName || `${revisionEntry?.title || "Revisión"} · ${entry.documentName || "Archivo"}`,
        revisionTitle: revisionEntry?.title || "Revisión",
        unidad: revisionEntry?.unidad || "",
        recortableRole: revisionEntry?.recortableRole || "",
        sourceType: entry.sourceType || session.sourceType,
        analysisStatus: entry.analysisStatus || "idle",
        analysisJobId: entry.analysisJobId || "",
        workflowFormat: session.workflowFormat || "en_forma",
        railTintHex: String(entry.railTintHex || "").trim(),
        result: entry.result || createEmptyResultPayload(),
        resultSummary: entry.resultSummary || createEmptyResultSummary(),
        quickAnalysis: entry.quickAnalysis || null,
        fileUpdatedAt: String(entry.updatedAt || "").trim(),
        fileCreatedAt: String(entry.createdAt || "").trim(),
        correctionSelection: String(revisionEntry?.id || "").trim() === String(revision?.id || "").trim()
          && String(entry?.id || "").trim() === String(file?.id || "").trim()
          ? correctionSelection
          : {},
        mappingEntries,
      }));
  });
  const fileResults = mergeRenderableFileResults({
    activeEntry: null,
    fallbackEntries: fallbackFileResults,
  });
  logAnalizarPdfFlow("buildRenderableSession", {
    sessionId: session?.id || "",
    activeRevisionId: revision?.id || "",
    activeFileId: file?.id || "",
    mappingEntryCount: activeMappingEntries.length,
    fileResultsCount: fileResults.length,
  });
  if (!file) {
    return {
      ...session,
      sourceType: fileResults[0]?.sourceType || revision?.files?.[0]?.sourceType || session.sourceType,
      activeRevisionId: revision?.id || "",
      activeFileId: "",
      result: fileResults[0]?.result || session.result,
      resultSummary: fileResults[0]?.resultSummary || session.resultSummary,
      fileResults,
      revisionSummary: revision?.summary || null,
      correctionSelection,
      mappingEntries: activeMappingEntries,
    };
  }
  return {
    ...session,
    activeRevisionId: revision?.id || "",
    activeFileId: file?.id || "",
    sourceType: file.sourceType || session.sourceType,
    analysisStatus: file.analysisStatus || "idle",
    analysisJobId: file.analysisJobId || "",
    title: `${session.title} · ${revision?.title || "Revisión"} · ${file.documentName || "Archivo"}`,
    unidad: revision?.unidad || "",
    recortableRole: revision?.recortableRole || "",
    result: file.result || createEmptyResultPayload(),
    resultSummary: file.resultSummary || createEmptyResultSummary(),
    quickAnalysis: file.quickAnalysis || null,
    fileResults,
    revisionSummary: revision?.summary || null,
    correctionSelection,
    mappingEntries: activeMappingEntries,
  };
}

function buildLocalAnalysisContextForJob(session = null, targetRevisionId = "", targetFileId = "") {
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  const contextRevisions = [];
  const clampContextText = (value = "", max = 120) => String(value || "").trim().slice(0, max);
  const compactStringList = (items = [], maxItems = 24, maxText = 120) => {
    const seen = new Set();
    const output = [];
    for (const item of Array.isArray(items) ? items : []) {
      const text = clampContextText(item, maxText);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      output.push(text);
      if (output.length >= maxItems) break;
    }
    return output;
  };
  const compactResolvedDestinations = (items = []) => {
    const seen = new Set();
    const output = [];
    for (const item of Array.isArray(items) ? items : []) {
      const entry = {
        code: clampContextText(item?.code || "", 120),
        kind: clampContextText(item?.kind || "", 40),
        destination: clampContextText(item?.destination || "", 80),
        status: clampContextText(item?.status || "", 40),
      };
      const key = `${entry.kind.toLowerCase()}::${entry.code.toLowerCase()}::${entry.destination.toLowerCase()}`;
      if (!entry.code || !entry.destination || seen.has(key)) continue;
      seen.add(key);
      output.push(entry);
      if (output.length >= 24) break;
    }
    return output;
  };
  for (const revision of revisions) {
    const contextFiles = [];
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      if (String(revision?.id || "").trim() === String(targetRevisionId || "").trim()
        && String(file?.id || "").trim() === String(targetFileId || "").trim()) {
        continue;
      }
      const pageReports = Array.isArray(file?.result?.stats?.pageReports) ? file.result.stats.pageReports : [];
      const recortablePages = pageReports
        .map((page) => {
          const summary = page?.recortableSummary || {};
          const originCodes = compactStringList(summary.originCodes);
          const destinationCodes = compactStringList(summary.destinationCodes);
          const resolvedDestinations = compactResolvedDestinations(summary.resolvedDestinations);
          const hasRecortableData = originCodes.length || destinationCodes.length || resolvedDestinations.length;
          if (!hasRecortableData) return null;
          return {
            pageName: clampContextText(page?.pageName || "", 80),
            recortableSummary: {
              originCodes,
              destinationCodes,
              resolvedDestinations,
            },
          };
        })
        .filter(Boolean);
      if (!recortablePages.length) continue;
      contextFiles.push({
        id: file?.id || "",
        result: {
          stats: {
            pageReports: recortablePages,
          },
        },
      });
    }
    if (!contextFiles.length) continue;
    contextRevisions.push({
      id: revision?.id || "",
      files: contextFiles,
    });
  }
  return {
    analysisCategories: getAnalizarPdfAnalysisCategories(),
    revisions: contextRevisions,
  };
}

function syncPersistedTitleMap() {
  state.persistedTitlesBySessionId = Object.fromEntries(
    (Array.isArray(state.sessions) ? state.sessions : []).map((session) => [
      String(session?.id || "").trim(),
      String(session?.title || "").trim(),
    ]).filter(([id]) => id)
  );
}

function persistBibliographicDraft(session = null) {
  if (!session?.bibliographicInfo) return;
  safeLocalStorageSet(BIBLIO_DRAFT_STORAGE_KEY, JSON.stringify(session.bibliographicInfo));
}

function restoreBibliographicDraft() {
  try {
    const raw = safeLocalStorageGet(BIBLIO_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function persistActiveSessionId(sessionId = "") {
  safeLocalStorageSet(ACTIVE_SESSION_STORAGE_KEY, String(sessionId || "").trim());
}

function restoreActiveSessionId() {
  return String(safeLocalStorageGet(ACTIVE_SESSION_STORAGE_KEY) || "").trim();
}

function formatStructuredList(items = [], emptyLabel = "Sin datos") {
  if (!Array.isArray(items) || !items.length) {
    return [`- ${emptyLabel}`];
  }
  return items.map((item) => {
    if (typeof item === "string") {
      return `- ${item}`;
    }
    return `- ${String(item?.message || item?.reason || JSON.stringify(item)).trim()}`;
  });
}

function formatJobMeta(payload = {}, session = null) {
  const cleanPayload = payload && typeof payload === "object" ? payload : {};
  const currentSession = cleanPayload.session && typeof cleanPayload.session === "object"
    ? cleanPayload.session
    : session;
  const stats = currentSession?.result?.stats && typeof currentSession.result.stats === "object"
    ? currentSession.result.stats
    : {};
  const summary = currentSession?.resultSummary && typeof currentSession.resultSummary === "object"
    ? currentSession.resultSummary
    : {};
  const status = String(cleanPayload.status || currentSession?.analysisStatus || "idle").trim() || "idle";
  const lines = [
    `Estado: ${status}`,
    currentSession?.title ? `Sesión: ${currentSession.title}` : "",
    stats.documentName ? `Archivo: ${stats.documentName}` : "",
    stats.sourceType ? `Tipo: ${stats.sourceType.toUpperCase()}` : "",
    Number(summary.pageCount || stats.pageCount || 0) ? `Páginas: ${Number(summary.pageCount || stats.pageCount || 0)}` : "",
    Number(stats.spreadCount || 0) ? `Spreads: ${Number(stats.spreadCount || 0)}` : "",
    Number(stats.durationMs || 0) ? `Duración: ${Number(stats.durationMs || 0)} ms` : "",
    ""
  ].filter(Boolean);

  const configurationWarnings = Array.isArray(stats.configurationWarnings) ? stats.configurationWarnings : [];
  const paginationIssues = Array.isArray(currentSession?.result?.paginationIssues) ? currentSession.result.paginationIssues : [];
  const sectionIssues = Array.isArray(currentSession?.result?.sectionIssues) ? currentSession.result.sectionIssues : [];
  const spellingIssues = Array.isArray(currentSession?.result?.spellingIssues) ? currentSession.result.spellingIssues : [];
  const orthotypographyIssues = Array.isArray(currentSession?.result?.orthotypographyIssues) ? currentSession.result.orthotypographyIssues : [];
  const colorIssues = Array.isArray(currentSession?.result?.colorIssues) ? currentSession.result.colorIssues : [];

  if (configurationWarnings.length) {
    lines.push("Configuración:");
    lines.push(...formatStructuredList(configurationWarnings));
    lines.push("");
  }

  lines.push("Resumen de hallazgos:");
  lines.push(`- Paginación: ${paginationIssues.length}`);
  lines.push(`- Secciones: ${sectionIssues.length}`);
  lines.push(`- Ortografía: ${spellingIssues.length}`);
  lines.push(`- Ortotipografía: ${orthotypographyIssues.length}`);
  lines.push(`- Colores: ${colorIssues.length}`);

  if (status === "failed" && cleanPayload.error) {
    lines.push("");
    lines.push("Error:");
    lines.push(`- ${String(cleanPayload.error).trim()}`);
  }

  return lines.join("\n").trim();
}

function getNormalizedSourceType(value = "") {
  return String(value || "").trim() === "idml" ? "idml" : "pdf";
}

function getCurrentFileSourceType(session = store.getActiveSession(), revision = getActiveRevision(session), file = getActiveFile(session, revision)) {
  return getNormalizedSourceType(file?.sourceType || session?.sourceType);
}

function canExportCurrentFileAsIdml(session = store.getActiveSession(), revision = getActiveRevision(session), file = getActiveFile(session, revision)) {
  return Boolean(session?.id && revision?.id && file?.id) && getCurrentFileSourceType(session, revision, file) === "idml";
}

function getExpectedFileAccept(sourceType = "pdf") {
  return getNormalizedSourceType(sourceType) === "idml" ? ".idml" : "application/pdf,.pdf";
}

function getExpectedFileExtension(sourceType = "pdf") {
  return getNormalizedSourceType(sourceType) === "idml" ? ".idml" : ".pdf";
}

function getUploadUiState(session = null, files = state.selectedFiles) {
  const sourceType = getNormalizedSourceType(session?.sourceType);
  const expectedExtension = getExpectedFileExtension(sourceType);
  const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  return {
    sourceType,
    expectedExtension,
    accept: getExpectedFileAccept(sourceType),
    files: normalizedFiles,
    missingFileMessage: `Selecciona un archivo ${expectedExtension}.`
  };
}

async function cacheSelectedFileForRevision(sessionId = "", revisionId = "", fileEntry = null, file = null) {
  const fileId = String(fileEntry?.id || "").trim();
  if (!sessionId || !revisionId || !fileId || !(file instanceof File)) {
    return null;
  }
  const record = await putAnalizarPdfCachedFile({
    sessionId,
    revisionId,
    fileId,
    file
  });
  return {
    localBlobKey: String(record?.id || buildAnalizarPdfLocalBlobKey(sessionId, revisionId, fileId)).trim(),
    hasLocalSource: true,
    fileSize: Number(record?.size || file.size || 0) || 0,
    fileLastModified: Number(record?.lastModified || file.lastModified || 0) || 0,
    fileMimeType: String(record?.type || file.type || "").trim()
  };
}

async function resolveCachedFileForEntry(fileEntry = null) {
  const localBlobKey = String(fileEntry?.localBlobKey || "").trim();
  if (!localBlobKey) {
    return null;
  }
  const cached = await getAnalizarPdfCachedFile(localBlobKey);
  return cached?.file instanceof File ? cached.file : null;
}

async function resolveIdmlSourceForTool(fileEntry = null) {
  const cachedFile = await resolveCachedFileForEntry(fileEntry);
  if (cachedFile) {
    return { file: cachedFile, useStoredSource: false };
  }
  if (String(fileEntry?.sourceAssetPath || "").trim()) {
    return { file: null, useStoredSource: true };
  }
  return { file: null, useStoredSource: false };
}

function formatIdmlToolError(error = null) {
  const message = String(error?.message || error || "").trim();
  if (
    !message
    || /^HTTP\s+404$/i.test(message)
    || /copia local|source|IDML original|archivo original|not found/i.test(message)
  ) {
    return "No se encontró la copia local/backend del IDML; vuelve a seleccionar el archivo en esa ficha.";
  }
  return message;
}

async function clearStaleLocalSourceMetadata(session = null) {
  if (!session || typeof session !== "object") {
    return session;
  }
  let changed = false;
  const draft = structuredClone(session);
  for (const revision of Array.isArray(draft.revisions) ? draft.revisions : []) {
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      if (!file?.hasLocalSource && !String(file?.localBlobKey || "").trim()) {
        continue;
      }
      const cachedFile = await resolveCachedFileForEntry(file);
      if (cachedFile) {
        continue;
      }
      file.hasLocalSource = false;
      file.localBlobKey = "";
      file.fileSize = 0;
      file.fileLastModified = 0;
      file.fileMimeType = "";
      file.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (!changed) {
    return session;
  }
  const saved = await saveSession(draft);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  return saved;
}

async function rehydrateSelectedFilesForActiveContext(options = {}) {
  const session = store.getActiveSession();
  const revision = getActiveRevision(session);
  const activeFile = getActiveFile(session, revision);
  if (!els.fileInput) {
    return;
  }
  if (!activeFile) {
    state.selectedFiles = [];
    els.fileInput.value = "";
    renderActiveSession(options);
    return;
  }
  const currentMatch = Array.isArray(state.selectedFiles)
    && state.selectedFiles.length === 1
    && buildFileKey(state.selectedFiles[0]?.name || "") === buildFileKey(activeFile.documentName || "");
  if (currentMatch) {
    renderActiveSession(options);
    return;
  }
  state.selectedFiles = [];
  els.fileInput.value = "";
  if (!activeFile.hasLocalSource || !activeFile.localBlobKey) {
    renderActiveSession(options);
    return;
  }
  const cachedFile = await resolveCachedFileForEntry(activeFile);
  if (!cachedFile) {
    renderActiveSession(options);
    return;
  }
  state.selectedFiles = [cachedFile];
  try {
    const transfer = new DataTransfer();
    transfer.items.add(cachedFile);
    state.isRehydratingFileSelection = true;
    els.fileInput.files = transfer.files;
  } catch (_) {
    // Algunos navegadores no permiten reasignar files; el label igual se rehidrata.
  } finally {
    queueMicrotask(() => {
      state.isRehydratingFileSelection = false;
    });
  }
  renderActiveSession(options);
}

async function persistSelectedFilesToActiveRevision() {
  const session = store.getActiveSession();
  const selectedFiles = Array.isArray(state.selectedFiles) ? state.selectedFiles.filter(Boolean) : [];
  if (!session || !selectedFiles.length) {
    return;
  }
  const targetSessionId = String(session?.id || "").trim();
  const targetRevisionId = String(state.activeRevisionId || "").trim();
  const sourceType = getNormalizedSourceType(session?.sourceType);
  const filesToMerge = selectedFiles.map((file) => ({
    name: file.name,
    sourceType
  }));
  const saved = await persistActiveSession(filesToMerge);
  if (String(saved?.id || "").trim() !== targetSessionId) {
    return;
  }
  const revision = (Array.isArray(saved?.revisions) ? saved.revisions : []).find((entry) => String(entry?.id || "").trim() === targetRevisionId) || null;
  if (!saved?.id || !revision?.id) {
    return;
  }
  const metadataByFileId = new Map();
  for (const selectedFile of selectedFiles) {
    const targetFile = (revision.files || []).find((entry) => String(entry.fileKey || "").trim() === buildFileKey(selectedFile.name));
    if (!targetFile) continue;
    const localMetadata = await cacheSelectedFileForRevision(saved.id, revision.id, targetFile, selectedFile);
    if (localMetadata) {
      metadataByFileId.set(targetFile.id, localMetadata);
    }
  }
  if (!metadataByFileId.size) {
    return;
  }
  mutateActiveSession((draft) => {
    const draftRevision = (draft.revisions || []).find((entry) => entry.id === revision.id);
    for (const file of draftRevision?.files || []) {
      const localMetadata = metadataByFileId.get(file.id);
      if (localMetadata) {
        Object.assign(file, localMetadata);
      }
    }
    return draft;
  }, { render: false });
  await persistActiveSession([]);
}

function getFilesToMergeForActiveRevision(session = null, activeRevision = null, selectedFiles = []) {
  const files = Array.isArray(selectedFiles) ? selectedFiles.filter(Boolean) : [];
  if (!files.length || !session || !activeRevision) {
    return [];
  }
  const allFileKeys = new Set();
  const activeFileKeys = new Set();
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    const isActiveRevision = String(revision?.id || "").trim() === String(activeRevision?.id || "").trim();
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      const fileKey = getFileEntryKey(file);
      if (!fileKey) continue;
      allFileKeys.add(fileKey);
      if (isActiveRevision) {
        activeFileKeys.add(fileKey);
      }
    }
  }
  return files.filter((file) => {
    const fileKey = buildFileKey(file?.name || "");
    if (!fileKey) return false;
    if (!shouldShowRecortableRole(activeRevision?.unidad || "") && looksLikeRecortableDocumentName(file?.name || "")) {
      return false;
    }
    if (documentNameMatchesRevision(file?.name || "", activeRevision)) {
      return true;
    }
    return activeFileKeys.has(fileKey) || !allFileKeys.has(fileKey);
  });
}

async function buildAnalysisTargets(session = null, selectedFiles = state.selectedFiles) {
  const revision = getActiveRevision(session);
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  logAnalizarPdfFlow("buildAnalysisTargets:start", {
    sessionId: session?.id || "",
    revisionId: revision?.id || "",
    selectedFiles: Array.isArray(selectedFiles) ? selectedFiles.map((file) => file?.name || "") : [],
    revisionCount: revisions.length,
  });
  if (!revision) {
    logAnalizarPdfFlow("buildAnalysisTargets:no-revision");
    return [];
  }
  const resolveTargetsForRevision = async (targetRevision, revisionSelectedFiles = []) => {
    if (!targetRevision) return [];
    const revisionFiles = (Array.isArray(targetRevision.files) ? targetRevision.files : [])
      .filter((entry) => !isRecortableFileContaminatedBySource(session, targetRevision, entry));
    if (Array.isArray(revisionSelectedFiles) && revisionSelectedFiles.length) {
      const resolvedTargets = revisionSelectedFiles.map((selectedFile) => {
        const selectedFileKey = buildFileKey(selectedFile.name);
        const directTargetFile = revisionFiles.find((entry) => String(entry.fileKey || "").trim() === selectedFileKey) || null;
        if (directTargetFile) {
          return { selectedFile, targetFile: directTargetFile, revision: targetRevision };
        }
        return null;
      }).filter(Boolean);
      if (resolvedTargets.length) {
        return resolvedTargets;
      }
    }
    const targets = [];
    for (const targetFile of revisionFiles) {
      const cachedFile = await resolveCachedFileForEntry(targetFile);
      if (cachedFile) {
        targets.push({ selectedFile: cachedFile, targetFile, revision: targetRevision });
        continue;
      }
      if (String(targetFile?.sourceAssetPath || "").trim()) {
        targets.push({ selectedFile: null, targetFile, revision: targetRevision, useStoredSource: true });
      }
    }
    return targets;
  };
  const activeTargets = await resolveTargetsForRevision(revision, selectedFiles);
  if (Array.isArray(selectedFiles) && selectedFiles.length && !activeTargets.some((target) => target.selectedFile)) {
    logAnalizarPdfFlow("buildAnalysisTargets:selected-miss-fallback", {
      activeRevisionId: revision?.id || "",
      selectedFiles: selectedFiles.map((file) => file?.name || ""),
    });
  }
  const targets = [];
  const destinationTargetsToAnalyzeLast = [];
  if (!recortableRoleSupportsDestination(revision)) {
    const prioritizedDestinationRevisions = prioritizeRevisionsForRecortablesDestinations(revisions, {
      excludeRevisionIds: [revision.id]
    }).filter((entry) => isRecortableDestinationCandidate(revision, entry));
    for (const destinationRevision of prioritizedDestinationRevisions) {
      const destinationFiles = (Array.isArray(destinationRevision.files) ? destinationRevision.files : [])
        .filter((entry) => !isRecortableFileContaminatedBySource(session, destinationRevision, entry));
      if (destinationFiles.some((entry) => hasRenderableAnalysis(entry))) {
        continue;
      }
      const destinationTargets = await resolveTargetsForRevision(destinationRevision);
      destinationTargetsToAnalyzeLast.push(...destinationTargets.map((target) => ({
        ...target,
        requiresSuccessBeforeActive: false,
      })));
    }
  }
  targets.push(...destinationTargetsToAnalyzeLast);
  targets.push(...activeTargets);
  logAnalizarPdfFlow("buildAnalysisTargets:resolved-cached", {
    resolvedCount: targets.length,
      targets: targets.map((target) => ({
        revisionId: target.revision?.id || "",
        fileId: target.targetFile?.id || "",
        fileName: target.selectedFile?.name || target.targetFile?.documentName || "",
        mappingId: target.targetFile?.mappingId || target.revision?.mappingId || "",
      })),
  });
  return targets;
}

async function buildAnalysisTargetsForAll(session = null, selectedFiles = state.selectedFiles, options = {}) {
  return buildAnalysisTargetsForAllPure({
    session,
    activeRevisionId: String(getActiveRevision(session)?.id || "").trim(),
    selectedFiles,
    selectedRevisionIds: Array.isArray(options?.selectedRevisionIds) ? options.selectedRevisionIds : null,
    resolveCachedFileForEntry,
    buildFileKey,
  });
}

async function buildMissingLocalSourceMessagesForAll(session = null, selectedFiles = [], targets = []) {
  const selectedFilesByKey = new Map();
  for (const selectedFile of Array.isArray(selectedFiles) ? selectedFiles.filter(Boolean) : []) {
    const fileKey = buildFileKey(selectedFile?.name || "");
    if (fileKey && !selectedFilesByKey.has(fileKey)) {
      selectedFilesByKey.set(fileKey, selectedFile);
    }
  }
  const targetKeys = new Set(
    (Array.isArray(targets) ? targets : [])
      .map((target) => `${String(target?.revision?.id || "").trim()}::${String(target?.targetFile?.id || "").trim()}`)
      .filter((key) => key !== "::")
  );
  const messages = [];
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    const revisionId = String(revision?.id || "").trim();
    if (!revisionId) continue;
    const revisionLabel = revision?.title || revision?.unidad || "Ficha editorial";
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      const fileId = String(file?.id || "").trim();
      if (!fileId || targetKeys.has(`${revisionId}::${fileId}`) || hasRenderableAnalysis(file)) {
        continue;
      }
      const fileKey = String(file?.fileKey || "").trim();
      if ((fileKey && selectedFilesByKey.has(fileKey)) || String(file?.sourceAssetPath || "").trim()) {
        continue;
      }
      const cachedFile = await resolveCachedFileForEntry(file);
      if (cachedFile) {
        continue;
      }
      messages.push(`${revisionLabel}: ${file?.documentName || "archivo sin nombre"}`);
    }
  }
  return messages;
}

function buildMissingLocalSourceNoticeFromSession(session = null) {
  const missing = [];
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    const revisionLabel = revision?.title || revision?.unidad || "Ficha editorial";
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      if (
        hasRenderableAnalysis(file)
        || String(file?.sourceAssetPath || "").trim()
        || file?.hasLocalSource === true
        || String(file?.localBlobKey || "").trim()
      ) {
        continue;
      }
      missing.push(`${revisionLabel}: ${file?.documentName || "archivo sin nombre"}`);
    }
  }
  if (!missing.length) return "";
  return [
    `No se analizaron ${missing.length} ficha(s) porque no hay IDML local ni copia guardada disponible. Vuelve a seleccionar esos IDML y ejecuta Analizar todo.`,
    ...missing.slice(0, 8),
    missing.length > 8 ? `... y ${missing.length - 8} ficha(s) más.` : "",
  ].filter(Boolean).join(" ");
}

async function clearBusyStatusesWithoutLocalFiles(session = null, options = {}) {
  const scope = String(options?.scope || "active").trim().toLowerCase() || "active";
  const targetFileIds = new Set(
    Array.isArray(options?.targetFileIds)
      ? options.targetFileIds.map((value) => String(value || "").trim()).filter(Boolean)
      : []
  );
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  let changed = false;

  for (const revision of revisions) {
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      const fileId = String(file?.id || "").trim();
      if (scope === "targets" && targetFileIds.size && !targetFileIds.has(fileId)) {
        continue;
      }
      if (!isBusyAnalysisStatus(file?.analysisStatus || "")) {
        continue;
      }
      const cachedFile = await resolveCachedFileForEntry(file);
      if (cachedFile) {
        continue;
      }
      file.analysisStatus = "failed";
      file.analysisJobId = "";
      file.hasLocalSource = false;
      file.localBlobKey = "";
      file.updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  mutateActiveSession((draft) => {
    draft.analysisStatus = "failed";
    draft.analysisJobId = "";
    return draft;
  }, { render: false });
  await persistActiveSession([]);
  renderAll();
  return true;
}

function isRecoverableStoredSourceAnalysisError(error = null) {
  const message = String(error?.message || error || "").trim().toLowerCase();
  return (
    message.includes("no se encontró la copia local del archivo original") ||
    message.includes("archivo de revisión no encontrado") ||
    message.includes("http 404")
  );
}

function buildFinalLinkedAssetReconciliationTargets(targets = []) {
  const linkedDestinationUnits = new Set(["recortables", "fichas", "anexos"]);
  const destinationTargets = [];
  const sourceTargets = [];

  for (const target of Array.isArray(targets) ? targets : []) {
    const unidad = String(target?.revision?.unidad || "").trim().toLowerCase();
    if (linkedDestinationUnits.has(unidad)) {
      destinationTargets.push(target);
    } else {
      sourceTargets.push(target);
    }
  }

  if (!destinationTargets.length || !sourceTargets.length) {
    return [];
  }
  return [...destinationTargets, ...sourceTargets];
}

async function runAnalysisForTargets(session = null, targets = [], emptyMessage = "", options = {}) {
  const savedSessionId = String(session?.id || "").trim();
  const initialMagicSpriteToken = String(options?.initialMagicSpriteToken || "").trim();
  let persistentMagicSpriteToken = activeAnalysisSprites.has(initialMagicSpriteToken)
    ? initialMagicSpriteToken
    : "";
  if (savedSessionId) {
    delete state.clearedRailSessionIds[savedSessionId];
  }
  logAnalizarPdfFlow("runAnalysisForTargets:start", {
    sessionId: savedSessionId,
    targetCount: Array.isArray(targets) ? targets.length : 0,
  });
  if (!savedSessionId) {
    throw new Error("No hay sesión activa.");
  }
  if (!targets.length) {
    stopAnalysisSprite(initialMagicSpriteToken);
    await clearBusyStatusesWithoutLocalFiles(session, {
      scope: "targets"
    });
    logAnalizarPdfFlow("runAnalysisForTargets:no-targets", { emptyMessage });
    setJobMetaText(emptyMessage || "No hay archivos disponibles para analizar.");
    return;
  }
  const nonBlockingMessages = [];
  for (const [targetIndex, target] of targets.entries()) {
    const { selectedFile, targetFile, revision, useStoredSource, requiresSuccessBeforeActive } = target;
    const targetProgress = {
      action: targets.length > 1 ? "Analizando ficha" : "Analizando",
      index: targetIndex + 1,
      total: targets.length,
    };
    setBusyOverlay(buildEditorialProcessLabel(session, revision, targetFile || selectedFile, {
      ...targetProgress,
      step: "Preparando archivo",
    }));
    const spriteContext = {
      revisionId: revision?.id || "",
      fileId: targetFile?.id || "",
      revision,
      file: targetFile || selectedFile,
    };
    const reusableSpriteToken = state.isAnalyzingAll && activeAnalysisSprites.has(persistentMagicSpriteToken)
      ? persistentMagicSpriteToken
      : (targetIndex === 0 && activeAnalysisSprites.has(initialMagicSpriteToken) ? initialMagicSpriteToken : "");
    const magicSpriteToken = reusableSpriteToken
      ? retargetAnalysisSprite(reusableSpriteToken, spriteContext)
      : startAnalysisSprite(spriteContext);
    if (state.isAnalyzingAll) persistentMagicSpriteToken = magicSpriteToken;
    primeAnalysisSpriteWords(magicSpriteToken, selectedFile);
    startProgressiveAnalysisWords(activeAnalysisSprites.get(magicSpriteToken), {
      phase: "preparing-file",
      maxProgress: .28,
      increment: .018,
      interval: 1320,
      startDelay: 40,
    });
    await flushUiFrame();
    logAnalizarPdfFlow("runAnalysisForTargets:target", {
      revisionId: revision?.id || "",
      fileId: targetFile?.id || "",
      fileName: selectedFile?.name || targetFile?.documentName || "",
      mappingId: targetFile?.mappingId || revision?.mappingId || "",
      useStoredSource: useStoredSource === true,
    });
    const localMetadata = selectedFile
      ? await cacheSelectedFileForRevision(savedSessionId, revision.id, targetFile, selectedFile)
      : null;
    startProgressiveAnalysisWords(activeAnalysisSprites.get(magicSpriteToken), {
      phase: "reading-source",
      maxProgress: .36,
      increment: .022,
      interval: 1240,
      startDelay: 20,
    });
    setBusyOverlay(buildEditorialProcessLabel(session, revision, targetFile || selectedFile, {
      ...targetProgress,
      step: selectedFile ? "Guardando copia local del IDML" : "Usando copia guardada del IDML",
    }));
    await flushUiFrame();
    logAnalizarPdfFlow("runAnalysisForTargets:cached", {
      fileId: targetFile?.id || "",
      localBlobKey: localMetadata?.localBlobKey || "",
      hasLocalSource: localMetadata?.hasLocalSource === true,
    });
    mutateActiveSession((draft) => {
      const draftRevision = (draft.revisions || []).find((entry) => entry.id === revision.id);
      const draftFile = draftRevision?.files?.find((entry) => entry.id === targetFile.id);
      if (draftFile) {
        draftFile.analysisStatus = "uploading";
        if (localMetadata) {
          Object.assign(draftFile, localMetadata);
        }
      }
      return draft;
    }, { render: false });
    renderAll({ preserveResultsRail: true });
    logAnalizarPdfFlow("runAnalysisForTargets:persist-before-upload", {
      fileId: targetFile?.id || "",
    });
    setBusyOverlay(buildEditorialProcessLabel(session, revision, targetFile || selectedFile, {
      ...targetProgress,
      step: "Guardando estado de la ficha",
    }));
    startProgressiveAnalysisWords(activeAnalysisSprites.get(magicSpriteToken), {
      phase: "saving-file-state",
      maxProgress: .42,
      increment: .02,
      interval: 1200,
      startDelay: 20,
    });
    await flushUiFrame();
    await saveActiveSessionSnapshot();
    let upload = null;
    try {
      setBusyOverlay(buildEditorialProcessLabel(session, revision, targetFile || selectedFile, {
        ...targetProgress,
        step: useStoredSource ? "Creando job con copia guardada" : "Subiendo IDML al backend",
      }));
      startProgressiveAnalysisWords(activeAnalysisSprites.get(magicSpriteToken), {
        phase: "uploading-source",
        maxProgress: .48,
        increment: .024,
        interval: 1160,
        startDelay: 20,
      });
      await flushUiFrame();
      const activeSessionForJob = store.getActiveSession();
      const localAnalysisContext = buildLocalAnalysisContextForJob(activeSessionForJob, revision.id, targetFile.id);
      upload = useStoredSource
        ? await queueStoredSourceAnalysisForSession(activeSessionForJob, savedSessionId, targetFile, {
          revisionId: revision.id,
          fileId: targetFile.id,
          mappingId: targetFile.mappingId || revision.mappingId || "",
          localAnalysisContext,
        })
        : await queueUploadForSession(activeSessionForJob, savedSessionId, selectedFile, {
          revisionId: revision.id,
          fileId: targetFile.id,
          mappingId: targetFile.mappingId || revision.mappingId || "",
          localAnalysisContext,
        });
    } catch (error) {
      if (useStoredSource && isRecoverableStoredSourceAnalysisError(error)) {
        if (requiresSuccessBeforeActive) {
          stopAnalysisSprite(magicSpriteToken);
          throw createMissingRecortableDestinationError(
            "No se analizó la unidad origen porque primero debe analizarse el recortable destino.",
            [{
              revisionId: String(revision?.id || "").trim(),
              fileId: String(targetFile?.id || "").trim(),
              message: `${revision?.title || revision?.unidad || "Recortables"}: no hay copia local ni fuente guardada disponible; vuelve a seleccionar el IDML REC en esa ficha.`,
            }]
          );
        }
        const warningMessage = `Se omitió ${targetFile?.documentName || "archivo"} porque ya no existe la copia local para reanalizar; vuelve a seleccionar ese IDML para generar la ficha.`;
        logAnalizarPdfFlow("runAnalysisForTargets:skip-stored-source", {
          revisionId: revision?.id || "",
          fileId: targetFile?.id || "",
          message: String(error?.message || error || ""),
        });
        nonBlockingMessages.push(warningMessage);
        mutateActiveSession((draft) => {
          const draftRevision = (draft.revisions || []).find((entry) => entry.id === revision.id);
          const draftFile = draftRevision?.files?.find((entry) => entry.id === targetFile.id);
          if (draftFile) {
            draftFile.analysisStatus = "failed";
            draftFile.analysisJobId = "";
            draftFile.sourceAssetPath = "";
            draftFile.hasLocalSource = false;
            draftFile.localBlobKey = "";
            draftFile.updatedAt = new Date().toISOString();
          }
          draft.analysisJobId = "";
          if (draft.analysisStatus === "uploading") {
            draft.analysisStatus = "idle";
          }
          return draft;
        }, { render: false });
        renderAll({ preserveResultsRail: true });
        await saveActiveSessionSnapshot();
        stopAnalysisSprite(magicSpriteToken);
        continue;
      }
      stopAnalysisSprite(magicSpriteToken);
      throw error;
    }
    const queued = upload.response || {};
    setBusyOverlay(buildEditorialProcessLabel(session, revision, targetFile || selectedFile, {
      ...targetProgress,
      step: `Job ${queued.status || "en cola"}`,
    }));
    logAnalizarPdfFlow("runAnalysisForTargets:queued", {
      fileId: targetFile?.id || "",
      jobId: queued.jobId || "",
      status: queued.status || "",
    });
    mutateActiveSession((draft) => {
      const draftRevision = (draft.revisions || []).find((entry) => entry.id === revision.id);
      const draftFile = draftRevision?.files?.find((entry) => entry.id === targetFile.id);
      if (draftFile) {
        draftFile.analysisStatus = queued.status || "queued";
        draftFile.analysisJobId = queued.jobId || "";
      }
      draft.analysisStatus = queued.status || "queued";
      draft.analysisJobId = queued.jobId || "";
      return draft;
    }, { render: false });
    renderAll({ preserveResultsRail: true });
    syncAnalysisSpriteProgressStage(magicSpriteToken, queued.status || "queued");
    setJobMetaText(formatJobMeta(queued, buildRenderableSession(store.getActiveSession())));
    try {
      await startPolling(queued.jobId || "", {
        session,
        revision,
        file: targetFile || selectedFile,
        action: targetProgress.action,
        index: targetProgress.index,
        total: targetProgress.total,
        magicSpriteToken,
        keepMagicSpriteAlive: state.isAnalyzingAll === true,
      });
    } catch (error) {
      stopAnalysisSprite(magicSpriteToken);
      const targetLabel = targetFile?.documentName || selectedFile?.name || "archivo";
      nonBlockingMessages.push(`${targetLabel}: ${String(error?.message || error)}`);
      continue;
    }
  }
  if (nonBlockingMessages.length) {
    setJobMetaText(nonBlockingMessages.join(" "));
  }
  return activeAnalysisSprites.has(persistentMagicSpriteToken) ? persistentMagicSpriteToken : "";
}

function syncFileInputForSession(session = null) {
  const uploadState = getUploadUiState(session);
  els.fileInput.accept = uploadState.accept;
  if (state.selectedFiles.some((file) => !String(file?.name || "").toLowerCase().endsWith(uploadState.expectedExtension))) {
    state.selectedFiles = [];
    els.fileInput.value = "";
  }
  return uploadState;
}

async function queueUploadForSession(session = null, sessionId = "", file = null, fileContext = null) {
  const uploadState = getUploadUiState(session, file ? [file] : state.selectedFiles);
  logAnalizarPdfFlow("queueUploadForSession", {
    sessionId,
    sourceType: uploadState.sourceType,
    expectedExtension: uploadState.expectedExtension,
    fileName: file?.name || "",
    fileContext: fileContext || null,
  });
  return {
    ...uploadState,
    response: await queueAnalizarPdfUpload(sessionId, file, uploadState.sourceType, fileContext)
  };
}

async function queueStoredSourceAnalysisForSession(session = null, sessionId = "", targetFile = null, fileContext = null) {
  const uploadState = getUploadUiState(session);
  logAnalizarPdfFlow("queueStoredSourceAnalysisForSession", {
    sessionId,
    sourceType: uploadState.sourceType,
    fileName: targetFile?.documentName || "",
    fileContext: fileContext || null,
  });
  return {
    ...uploadState,
    response: await queueAnalizarPdfStoredSourceAnalysis(sessionId, uploadState.sourceType, {
      ...fileContext,
      fileName: targetFile?.documentName || fileContext?.fileName || "",
      documentName: targetFile?.documentName || "",
    }),
  };
}

function restoreAnalysisTargetPointers(session = null, revisionId = "", fileId = "", selectedFiles = []) {
  const cleanRevisionId = String(revisionId || "").trim();
  const cleanFileId = String(fileId || "").trim();
  const revision = (Array.isArray(session?.revisions) ? session.revisions : [])
    .find((entry) => String(entry?.id || "").trim() === cleanRevisionId) || null;
  if (!revision) {
    return;
  }
  state.activeRevisionId = cleanRevisionId;
  if (cleanFileId && (revision.files || []).some((entry) => String(entry?.id || "").trim() === cleanFileId)) {
    state.activeFileId = cleanFileId;
    return;
  }
  const selectedFileName = Array.isArray(selectedFiles) && selectedFiles.length
    ? String(selectedFiles[0]?.name || "").trim()
    : "";
  const selectedFileKey = selectedFileName ? buildFileKey(selectedFileName) : "";
  const selectedFileEntry = selectedFileKey
    ? (revision.files || []).find((entry) => String(entry?.fileKey || "").trim() === selectedFileKey) || null
    : null;
  state.activeFileId = String(selectedFileEntry?.id || revision.files?.[0]?.id || "").trim();
}

function renderSectionsEditor(session = null) {
  if (!els.sectionsList) {
    return;
  }
  if (!session) {
    els.sectionsList.innerHTML = "";
    return;
  }
  const sections = Array.isArray(session.indexConfig?.sections) ? session.indexConfig.sections : [];
  if (!sections.length) {
    els.sectionsList.innerHTML = `<div class="analizar-pdf-empty-state">No hay secciones configuradas.</div>`;
    return;
  }
  els.sectionsList.innerHTML = sections.map((section) => `
    <div class="analizar-pdf-section-row" data-section-id="${section.id}">
      <input type="text" data-field="title" value="${escapeAttr(section.title || "")}" placeholder="Título de sección">
      <input type="number" data-field="expectedPageNumber" min="1" step="1" value="${section.expectedPageNumber || ""}" placeholder="Página">
      <button type="button" class="analizar-pdf-icon-btn" data-action="remove-section" aria-label="Eliminar sección">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join("");
}

function renderBibliographicInfo(session = null) {
  const bibliographicInfo = session?.bibliographicInfo || {};
  const activeRevision = getActiveRevision(session);
  const isLibre = session?.workflowFormat === "libre";
  els.biblioGrid?.classList.toggle("is-libre", isLibre);
  if (els.libreWorkflowField) els.libreWorkflowField.hidden = !isLibre;
  if (els.libreWorkflowInput) els.libreWorkflowInput.value = isLibre ? "Libre" : "En Forma";
  if (els.libreLanguageField) els.libreLanguageField.hidden = !isLibre;
  if (els.libreLanguageInput) els.libreLanguageInput.value = String(session?.languageCode || "es-MX");
  [
    els.bookTypeInput,
    els.nivelInput,
    els.gradoInput,
    els.trimestreInput,
    els.unidadInput,
  ].forEach((input) => input?.closest("label")?.toggleAttribute("hidden", isLibre));
  if (els.recortableRoleField) els.recortableRoleField.hidden = isLibre;
  els.revisionMappingSelect?.closest("label")?.toggleAttribute("hidden", isLibre);
  els.sessionTitleLabel?.closest("label")?.toggleAttribute("hidden", isLibre);
  const inferredRevisionMappingId = String(
    activeRevision?.mappingId ||
    activeRevision?.files?.[0]?.mappingId ||
    resolveDefaultMappingForSession(session)?.id ||
    ""
  ).trim();
  const sourceType = getNormalizedSourceType(session?.sourceType);
  if (els.bookTypeInput) {
    els.bookTypeInput.value = bibliographicInfo.bookType || "";
  }
  if (els.sourceType) {
    els.sourceType.value = sourceType;
  }
  syncFileInputForSession(session);
  if (els.nivelInput) {
    els.nivelInput.value = bibliographicInfo.nivel || "";
  }
  if (els.gradoInput) {
    els.gradoInput.value = bibliographicInfo.grado || "";
  }
  if (els.trimestreInput) {
    els.trimestreInput.value = bibliographicInfo.trimestre || "";
  }
  if (els.unidadInput) {
    els.unidadInput.value = activeRevision?.unidad || bibliographicInfo.unidad || "";
  }
  if (els.edicionNumeroInput) {
    els.edicionNumeroInput.value = bibliographicInfo.edicionNumero || "";
  }
  if (els.revisionNumeroInput) {
    els.revisionNumeroInput.value = activeRevision?.revisionNumero || bibliographicInfo.revisionNumero || "";
  }
  const currentUnidad = String(activeRevision?.unidad || bibliographicInfo.unidad || "").trim();
  const showRecortableRole = shouldShowRecortableRole(currentUnidad);
  if (els.recortableRoleField) {
    els.recortableRoleField.classList.toggle("is-disabled", !showRecortableRole);
  }
  if (els.recortableRoleInput) {
    els.recortableRoleInput.value = resolveBibliographicRecortableRole(session, activeRevision);
  }
  if (els.revisionMappingSelect) {
    els.revisionMappingSelect.innerHTML = renderRevisionMappingOptions(inferredRevisionMappingId);
  }
}

function renderSavedAnalysisSelector(session = null) {
  if (!els.sessionTitleLabel) return;
  const options = [];
  const activeRevision = getActiveRevision(session);
  const activeFile = getActiveFile(session, activeRevision);
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      const value = `${revision.id}::${file.id}`;
      const selected = revision.id === activeRevision?.id && file.id === activeFile?.id ? " selected" : "";
      options.push(`<option value="${escapeAttr(value)}"${selected}>${escapeAttr(`${revision.title || "Revisión"} · ${file.documentName || "Archivo"}`)}</option>`);
    }
  }
  els.sessionTitleLabel.innerHTML = options.length
    ? options.join("")
    : `<option value="">Sin análisis guardados</option>`;
}

function resolveRevisionAccentColor(revision = null, workflowFormat = "") {
  const isHex = (value) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim());
  if (String(workflowFormat || "").trim().toLowerCase() === "libre") {
    const dominantColor = (Array.isArray(revision?.files) ? revision.files : [])
      .map((file) => String(file?.result?.stats?.dominantPageSwatch?.hex || "").trim())
      .find(isHex) || "";
    if (dominantColor) return dominantColor;
  }
  const unit = String(revision?.unidad || revision?.title || "").trim();
  const unitNumber = String(unit.match(/^unidad\s+(\d{1,2})$/i)?.[1] || "").trim();
  const targetSwatch = /^proyecto$/i.test(unit)
    ? "10ED PROYECTO"
    : /^lecturas?$/i.test(unit)
      ? "COLOR DE LA SEMANA"
      : /^recortables?$/i.test(unit)
        ? "LEVEL COLOR"
        : unitNumber ? `U${unitNumber}` : "";
  const swatches = (Array.isArray(revision?.files) ? revision.files : [])
    .flatMap((file) => Array.isArray(file?.result?.stats?.swatchInventory) ? file.result.stats.swatchInventory : []);
  const isNeutral = (value) => /^(?:BLACK|PAPER|NONE|\[NONE\]|\[PAPER\]|REGISTRATION)$/i.test(String(value || "").trim());
  const normalizedTarget = targetSwatch.toUpperCase();
  const matchingSwatch = targetSwatch
    ? swatches.find((swatch) => {
      const name = String(swatch?.name || swatch?.swatchName || "").trim().toUpperCase();
      return name === normalizedTarget || name.includes(normalizedTarget);
    })
    : null;
  const extractedSwatch = matchingSwatch || swatches.find((swatch) => {
    const name = String(swatch?.name || swatch?.swatchName || "").trim();
    return !isNeutral(name) && isHex(swatch?.hex);
  });
  const color = String(extractedSwatch?.hex || "").trim();
  if (isHex(color)) return color;
  const cachedColor = (Array.isArray(revision?.files) ? revision.files : [])
    .map((file) => String(file?.railTintHex || "").trim())
    .find(isHex) || "";
  return cachedColor;
}

function renderRevisionInsertSlot(index = 0) {
  const safeIndex = Math.max(0, Number(index) || 0);
  return `
    <div class="analizar-pdf-revision-insert-slot" data-insert-index="${safeIndex}" role="presentation">
      <button
        type="button"
        class="analizar-pdf-revision-insert-btn"
        data-action="open-insert-revision"
        data-insert-index="${safeIndex}"
        aria-label="Añadir ficha editorial en esta posición"
        title="Añadir ficha editorial aquí"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

const ANALYSIS_WORD_FALLBACK = Object.freeze(["Texto", "Estilos", "Color", "Página", "Folio", "IDML", "Listo"]);
const ANALYSIS_WORD_STOPWORDS = new Set([
  "para", "como", "esta", "este", "estos", "estas", "desde", "hasta", "entre",
  "sobre", "también", "porque", "cuando", "donde", "cada", "todo", "toda", "todos", "todas",
]);

function collectIdmlAnimationWords(result = null, limit = 8) {
  const maxWords = Math.max(1, Math.min(32, Number(limit) || 8));
  const pages = Array.isArray(result?.stats?.pageReports) ? result.stats.pageReports : [];
  const textParts = [];
  for (const page of pages) {
    const pageText = String(page?.pageText || "").trim();
    if (pageText) {
      textParts.push(pageText);
      continue;
    }
    for (const entries of Object.values(page?.content || {})) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        const text = String(entry?.text || "").trim();
        if (text) textParts.push(text);
      }
    }
  }
  const unique = [];
  const seen = new Set();
  const tokens = textParts.join(" ").match(/\p{L}[\p{L}\p{M}’'-]{2,}/gu) || [];
  for (const token of tokens) {
    const clean = String(token || "").replace(/^[’'-]+|[’'-]+$/g, "").trim();
    const normalized = clean.toLocaleLowerCase("es-MX");
    if (clean.length < 4 || clean.length > 18 || ANALYSIS_WORD_STOPWORDS.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(clean);
  }
  if (!unique.length) return ANALYSIS_WORD_FALLBACK.slice(0, maxWords);
  if (unique.length <= maxWords) return unique;
  const selected = [];
  const step = unique.length / maxWords;
  for (let index = 0; index < maxWords; index += 1) {
    selected.push(unique[Math.min(unique.length - 1, Math.floor(index * step))]);
  }
  return selected;
}

async function extractIdmlAnimationWordsFromFile(file = null, limit = 32) {
  if (!(file instanceof Blob) || !String(file?.name || "").toLowerCase().endsWith(".idml")) return [];
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocdOffset = -1;
    for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 22; offset += 1) {
      if (view.getUint32(offset, true) === 0x06054b50) eocdOffset = offset;
    }
    if (eocdOffset < 0) return [];
    const entryCount = view.getUint16(eocdOffset + 10, true);
    let cursor = view.getUint32(eocdOffset + 16, true);
    const decoder = new TextDecoder("utf-8");
    const xmlTexts = [];
    for (let index = 0; index < entryCount && cursor + 46 <= bytes.length; index += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const fileNameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength));
      cursor += 46 + fileNameLength + extraLength + commentLength;
      if (!/^Stories\/Story_.*\.xml$/i.test(name) || localOffset + 30 > bytes.length) continue;
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      let raw = compressed;
      if (method === 8 && typeof DecompressionStream === "function") {
        raw = new Uint8Array(await new Response(
          new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
        ).arrayBuffer());
      } else if (method !== 0) {
        continue;
      }
      xmlTexts.push(decoder.decode(raw));
      if (xmlTexts.length >= 36) break;
    }
    const parser = new DOMParser();
    const textParts = [];
    for (const xmlText of xmlTexts) {
      const xml = parser.parseFromString(xmlText, "application/xml");
      xml.querySelectorAll("Content").forEach((node) => {
        if (!node.closest("Note") && String(node.textContent || "").trim()) textParts.push(node.textContent);
      });
    }
    return collectIdmlAnimationWords({ stats: { pageReports: [{ pageText: textParts.join(" ") }] } }, limit);
  } catch (_) {
    return [];
  }
}

function primeAnalysisSpriteWords(token = "", file = null) {
  const cleanToken = String(token || "").trim();
  const record = activeAnalysisSprites.get(cleanToken) || null;
  if (!record) return;
  extractIdmlAnimationWordsFromFile(file, 32).then((words) => {
    const liveRecord = activeAnalysisSprites.get(cleanToken) || null;
    if (liveRecord && words.length) liveRecord.animationWords = words;
  }).catch(() => {});
}

function resolveRevisionAnimationWords(revision = null, limit = 8) {
  const files = Array.isArray(revision?.files) ? revision.files : [];
  const analyzedFile = files.find((file) => file?.result?.stats?.pageReports?.length) || files[0] || null;
  return collectIdmlAnimationWords(analyzedFile?.result || null, limit);
}

function resolveAnalysisAnimationWords(revisionId = "", fileId = "", limit = 8) {
  const session = store.getActiveSession();
  const revision = (Array.isArray(session?.revisions) ? session.revisions : [])
    .find((entry) => String(entry?.id || "").trim() === String(revisionId || "").trim()) || null;
  const files = Array.isArray(revision?.files) ? revision.files : [];
  const file = files.find((entry) => String(entry?.id || "").trim() === String(fileId || "").trim())
    || files.find((entry) => entry?.result?.stats?.pageReports?.length)
    || files[0]
    || null;
  return collectIdmlAnimationWords(file?.result || null, limit);
}

function renderRevisionList(session = null) {
  if (!els.revisionList) return;
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  const totalSelectable = revisions.reduce((count, revision) => count + ((revision.files || []).length ? 1 : 0), 0);
  const selectedCount = revisions.reduce((count, revision) => {
    const files = Array.isArray(revision?.files) ? revision.files : [];
    return count + (files.length && files.every((file) => file?.analysisSelected !== false) ? 1 : 0);
  }, 0);
  const selectionLocked = state.isAnalyzingAll || state.isAnalyzingCurrent || state.isQuickAnalyzingAll;
  if (els.selectedCardsCount) els.selectedCardsCount.textContent = `${selectedCount}/${totalSelectable}`;
  if (els.selectAllCardsBtn) {
    els.selectAllCardsBtn.hidden = !state.cardAnalysisSelectionMode;
    els.selectAllCardsBtn.disabled = selectionLocked;
    els.selectAllCardsBtn.setAttribute("aria-disabled", String(selectionLocked));
  }
  if (els.toggleCardSelectionBtn) {
    els.toggleCardSelectionBtn.disabled = selectionLocked;
    els.toggleCardSelectionBtn.setAttribute("aria-disabled", String(selectionLocked));
  }
  const activeRevisionId = String(getActiveRevision(session)?.id || "").trim();
  if (!revisions.length) {
    els.revisionList.innerHTML = `<div class="analizar-pdf-empty-state">No hay fichas editoriales todavía.</div>`;
    return;
  }
  const timelineSignature = revisions.map((revision) => String(revision?.id || "")).join("|");
  if (state.revisionTimelineRevealInProgress) {
    if (state.revisionTimelineRevealSignature === timelineSignature) {
      // Firebase y la rehidratación local pueden pedir otro render durante la entrada.
      // Conservamos los nodos que Anime.js está moviendo y aplicamos el último estado al terminar.
      state.deferredRevisionTimelineSession = session;
      return;
    }
    removeAnimeAnimation(els.revisionList.querySelectorAll(".analizar-pdf-revision-timeline-card"));
    state.revisionTimelineRevealInProgress = false;
    state.revisionTimelineRevealSignature = "";
    state.deferredRevisionTimelineSession = null;
  }
  const shouldRevealTimeline = state.revisionTimelineSignature !== timelineSignature;
  state.revisionTimelineSignature = timelineSignature;
  if (shouldRevealTimeline) {
    state.revisionTimelineRevealPending = true;
  }
  els.revisionList.classList.toggle(
    "is-reveal-pending",
    state.revisionTimelineRevealPending && !prefersReducedRevisionMotion()
  );
  const completedRevisionIds = new Set(state.completedRevisionAnimationIds);
  state.completedRevisionAnimationIds.clear();
  removeAnimeAnimation(els.revisionList.querySelectorAll([
    ".analizar-pdf-revision-machine *",
    ".analizar-pdf-revision-eruption *",
    ".analizar-pdf-revision-timeline-card.is-processing .analizar-pdf-subrecord-card-row",
  ].join(",")));
  els.revisionList.setAttribute("role", "list");
  els.revisionList.setAttribute("aria-label", "Línea de tiempo de fichas editoriales");
  els.revisionList.innerHTML = revisions.map((revision, index) => {
    const isBusy = isRevisionBusy(revision);
    const accentColor = resolveRevisionAccentColor(revision, session?.workflowFormat);
    const isCompleted = !isBusy
      && Array.isArray(revision.files)
      && revision.files.length > 0
      && revision.files.every((file) => String(file?.analysisStatus || "").toLowerCase() === "completed");
    const machineWords = resolveRevisionAnimationWords(revision, 14);
    const revisionFiles = Array.isArray(revision?.files) ? revision.files : [];
    const analysisSelected = Boolean(revisionFiles.length) && revisionFiles.every((file) => file?.analysisSelected !== false);
    const resolvedLanguage = String((revision.files || [])[0]?.result?.stats?.language?.resolvedCode || "").trim();
    const analyzedStructure = (revision.files || [])[0]?.result?.stats?.detectedStructure || null;
    const visibleStructure = analyzedStructure?.label ? analyzedStructure : revision.detectedStructure;
    const displayRevisionTitle = session?.workflowFormat === "libre" ? `Archivo ${index + 1}` : (revision.title || "Nueva ficha editorial");
    return `${index === 0 ? renderRevisionInsertSlot(0) : ""}
    <article
      id="analizarPdfEditorialPanel-${escapeAttr(revision.id)}"
      class="analizar-pdf-subrecord-card analizar-pdf-revision-timeline-card${revision.id === activeRevisionId ? " is-active" : ""}${isBusy ? " is-processing" : ""}${isCompleted ? " is-complete" : ""}"
      data-revision-id="${escapeAttr(revision.id)}"
      data-timeline-index="${index + 1}"
      ${accentColor ? `style="--revision-accent:${escapeAttr(accentColor)}"` : ""}
      role="listitem"
      draggable="true"
    >
      ${isBusy ? `
        <div class="analizar-pdf-revision-machine" aria-hidden="true">
          <span class="analizar-pdf-revision-machine-vent"></span>
          <span class="analizar-pdf-revision-machine-smoke" style="--smoke-x:-24px"></span>
          <span class="analizar-pdf-revision-machine-smoke" style="--smoke-x:4px"></span>
          <span class="analizar-pdf-revision-machine-smoke" style="--smoke-x:26px"></span>
          ${machineWords.map((word, wordIndex) => {
            const spread = machineWords.length > 1 ? wordIndex / (machineWords.length - 1) : .5;
            const wordX = Math.round(-54 + (spread * 108));
            return `<span class="analizar-pdf-revision-machine-word" style="--word-x:${wordX}px">${escapeHtml(word)}</span>`;
          }).join("")}
        </div>
      ` : ""}
      ${state.cardAnalysisSelectionMode ? `<button type="button" class="analizar-pdf-card-analysis-check" data-action="toggle-analysis-selection" data-revision-id="${escapeAttr(revision.id)}" role="checkbox" aria-checked="${analysisSelected ? "true" : "false"}" aria-label="${analysisSelected ? "Omitir esta ficha del análisis masivo" : "Incluir esta ficha en el análisis masivo"}" title="${selectionLocked ? "La selección está bloqueada mientras se realiza el análisis" : (analysisSelected ? "Omitir del análisis masivo" : "Incluir en el análisis masivo")}" ${selectionLocked ? 'disabled aria-disabled="true"' : ""}><span><i class="fas fa-check" aria-hidden="true"></i></span></button>` : ""}
      <span class="analizar-pdf-revision-file-tab" aria-hidden="true"><i class="fas fa-folder" aria-hidden="true"></i> Archivo ${index + 1}</span>
      <div class="analizar-pdf-subrecord-card-row">
        <button type="button" class="analizar-pdf-subrecord-card-select" data-action="select-revision" data-revision-id="${escapeAttr(revision.id)}">
          <span class="analizar-pdf-subrecord-card-title">
            <span>${escapeHtml(displayRevisionTitle)}</span>
            ${isCompleted ? '<span class="analizar-pdf-revision-complete-mark" aria-label="Análisis terminado" title="Análisis terminado"><i class="fas fa-check" aria-hidden="true"></i></span>' : ""}
          </span>
          <small>${escapeHtml(`${revision.fileCount || revision.files?.length || 0} ${(revision.fileCount || revision.files?.length || 0) === 1 ? "archivo" : "archivos"}`)}</small>
          ${visibleStructure?.label ? `<small class="analizar-pdf-card-structure">${escapeHtml(visibleStructure.label)}</small>` : ""}
          ${session?.languageCode === "auto" && resolvedLanguage ? `<small class="analizar-pdf-card-language">${escapeHtml(resolvedLanguage)}</small>` : ""}
        </button>
      </div>
      <button
        type="button"
        class="analizar-pdf-icon-btn analizar-pdf-revision-analyze-btn"
        data-action="analyze-revision"
        data-revision-id="${escapeAttr(revision.id)}"
        aria-label="Analizar esta ficha editorial"
        title="Analizar esta ficha editorial"
        ${isBusy ? 'disabled aria-disabled="true"' : ""}
      >
        <i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="analizar-pdf-icon-btn analizar-pdf-subrecord-delete-btn analizar-pdf-revision-delete-btn"
        data-action="delete-revision"
        data-revision-id="${escapeAttr(revision.id)}"
        aria-label="Eliminar ficha editorial"
        title="Eliminar ficha editorial"
      >
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
    </article>
    ${renderRevisionInsertSlot(index + 1)}
  `;
  }).join("");
  if (state.revisionTimelineRevealPending) {
    scheduleRevisionTimelineReveal();
  }
  window.requestAnimationFrame(() => {
    repositionActiveAnalysisSprites();
    animateRevisionTimeline({ completedRevisionIds });
  });
}

function prefersReducedRevisionMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function scheduleRevisionTimelineReveal() {
  if (!state.revisionTimelineRevealPending || !state.bootSpinnerDismissed) return;
  window.clearTimeout(revisionTimelineRevealTimer);
  // Un debounce corto evita animar nodos que Firebase reemplace en la misma ráfaga.
  revisionTimelineRevealTimer = window.setTimeout(() => {
    revisionTimelineRevealTimer = 0;
    const cards = els.revisionList?.querySelectorAll(".analizar-pdf-revision-timeline-card") || [];
    if (!cards.length) return;
    state.revisionTimelineRevealPending = false;
    animateRevisionTimeline({ shouldRevealTimeline: true });
  }, 72);
}

function finishRevisionTimelineReveal(revealSignature = "") {
  if (state.revisionTimelineRevealSignature !== revealSignature) return;
  state.revisionTimelineRevealInProgress = false;
  state.revisionTimelineRevealSignature = "";
  const deferredSession = state.deferredRevisionTimelineSession;
  state.deferredRevisionTimelineSession = null;
  if (deferredSession) {
    renderRevisionList(deferredSession);
  }
}

function animateRevisionTimeline({ shouldRevealTimeline = false, completedRevisionIds = new Set() } = {}) {
  if (!els.revisionList) return;
  const cards = [...els.revisionList.querySelectorAll(".analizar-pdf-revision-timeline-card")];
  if (prefersReducedRevisionMotion()) {
    els.revisionList.classList.remove("is-reveal-pending");
    cards.forEach((card) => {
      card.style.removeProperty("opacity");
      card.style.removeProperty("transform");
    });
    return;
  }
  if (shouldRevealTimeline && cards.length) {
    const revealSignature = state.revisionTimelineSignature;
    state.revisionTimelineRevealInProgress = true;
    state.revisionTimelineRevealSignature = revealSignature;
    state.deferredRevisionTimelineSession = null;
    removeAnimeAnimation(cards);
    cards.forEach((card, index) => {
      card.style.opacity = "0";
      card.style.transform = `translateY(42px) scale(.08) rotate(${index % 2 ? 5 : -5}deg)`;
      card.style.transformOrigin = "50% 86%";
    });
    els.revisionList.classList.remove("is-reveal-pending");
    animate(cards, {
      opacity: [0, 1],
      y: [42, 0],
      scale: [.08, 1],
      rotate: (card, index) => [index % 2 ? 5 : -5, 0],
      // Mantiene la entrada secuencial sin dejar una pausa larga entre archivos.
      delay: stagger(135, { start: 25 }),
      ease: spring({ bounce: .48, duration: 720 }),
      onComplete: () => {
        animate(cards, {
          y: (card, index) => [0, index % 2 ? -3 : -5, 0],
          rotate: (card, index) => [0, index % 2 ? .55 : -.55, 0],
          delay: stagger(42),
          duration: 390,
          ease: "inOut(2)",
          onComplete: () => {
            cards.forEach((card) => {
              card.style.removeProperty("transform-origin");
            });
            finishRevisionTimelineReveal(revealSignature);
          },
        });
      },
    });
  }
  animateProcessingRevisionMachines(cards.filter((card) => card.classList.contains("is-processing")));
  for (const revisionId of completedRevisionIds) {
    const card = cards.find((item) => String(item.dataset.revisionId || "") === revisionId);
    if (!card) continue;
    card.classList.add("is-analysis-finished");
    removeAnimeAnimation(card);
    animate(card, {
      scale: [1, 1.035, 1],
      y: [0, -8, 0],
      duration: 760,
      ease: "out(5)",
    });
    window.setTimeout(() => card.classList.remove("is-analysis-finished"), 1400);
  }
}

function animateProcessingRevisionMachines(cards = []) {
  for (const card of Array.isArray(cards) ? cards : [...cards]) {
    const vent = card.querySelector(".analizar-pdf-revision-machine-vent");
    const smokes = card.querySelectorAll(".analizar-pdf-revision-machine-smoke");
    const words = card.querySelectorAll(".analizar-pdf-revision-machine-word");
    const content = card.querySelector(".analizar-pdf-subrecord-card-row");
    animate(vent, {
      opacity: [.35, 1, .35],
      scaleX: [.72, 1.08, .72],
      duration: 760,
      alternate: true,
      loop: true,
      ease: "inOut(2)",
    });
    animate(content, {
      x: [0, .8, -.7, .45, 0],
      y: [0, -.45, .35, 0],
      duration: 920,
      loop: true,
      ease: "inOut(2)",
    });
    animate(smokes, {
      opacity: [0, .72, .42, 0],
      x: (particle) => [0, Number.parseFloat(getComputedStyle(particle).getPropertyValue("--smoke-x")) || 0],
      y: [8, -24, -54],
      scale: [.35, 1.15, 1.65],
      delay: stagger(430),
      duration: 2600,
      loop: true,
      ease: "out(3)",
    });
  animate(words, {
      opacity: [0, .95, .72, 0],
      x: (word) => [0, Number.parseFloat(getComputedStyle(word).getPropertyValue("--word-x")) || 0],
      y: [9, -30, -66],
      rotate: (word, index) => [0, index % 2 ? 12 : -12],
      scale: [.45, 1.04, .82],
      delay: stagger(310),
      duration: 6800,
      loop: true,
      ease: "out(3)",
    });
  }
}

function eruptProcessingRevisionCard(revisionId = "", context = {}) {
  if (prefersReducedRevisionMotion()) return Promise.resolve();
  const cleanRevisionId = String(revisionId || "").trim();
  const card = [...document.querySelectorAll(".analizar-pdf-revision-timeline-card[data-revision-id]")]
    .find((item) => String(item.dataset.revisionId || "").trim() === cleanRevisionId) || null;
  if (!card) return Promise.resolve();
  card.classList.add("is-machine-erupting");
  removeAnimeAnimation(card.querySelectorAll(".analizar-pdf-revision-machine *"));
  const eruption = document.createElement("div");
  eruption.className = "analizar-pdf-revision-eruption";
  eruption.setAttribute("aria-hidden", "true");
  const eruptionWords = Array.isArray(context?.words) && context.words.length
    ? context.words.slice(0, 24)
    : resolveAnalysisAnimationWords(cleanRevisionId, String(context?.fileId || "").trim(), 20);
  eruption.innerHTML = `
    ${Array.from({ length: 14 }, (_, index) => `<span class="analizar-pdf-revision-eruption-spark${index % 3 === 0 ? " is-star" : ""}"></span>`).join("")}
    ${Array.from({ length: 7 }, () => '<span class="analizar-pdf-revision-eruption-cloud"></span>').join("")}
  `;
  card.appendChild(eruption);
  const vent = card.querySelector(".analizar-pdf-revision-machine-vent");
  const sparks = [...eruption.querySelectorAll(".analizar-pdf-revision-eruption-spark")];
  const clouds = [...eruption.querySelectorAll(".analizar-pdf-revision-eruption-cloud")];
  const landingTarget = findAnalysisRailLandingTarget(null, {
    revisionId: cleanRevisionId,
    fileId: String(context?.fileId || "").trim(),
  });
  const cardRect = card.getBoundingClientRect();
  const targetRect = landingTarget?.getBoundingClientRect?.() || cardRect;
  const baseFillProgress = getRailWordColorProgress(landingTarget);
  const eruptionFillLimit = Math.max(baseFillProgress, Math.min(1, Number(context?.fillLimit ?? .8) || .8));
  const revisionAccent = String(getComputedStyle(card).getPropertyValue("--revision-accent") || "").trim();
  const startX = cardRect.left + (cardRect.width * .5);
  const startY = cardRect.top - 3;
  const endX = targetRect.left + (targetRect.width * .5);
  const endY = targetRect.top + Math.min(targetRect.height * .5, 34);
  const words = eruptionWords.map((label, index) => {
    const word = document.createElement("span");
    word.className = "analizar-pdf-revision-eruption-word is-flying-to-rail";
    word.textContent = label;
    if (revisionAccent) word.style.setProperty("--revision-accent", revisionAccent);
    word.style.left = `${Math.round(startX + ((index % 2 ? 1 : -1) * (index + 1) * 2))}px`;
    word.style.top = `${Math.round(startY)}px`;
    document.body.appendChild(word);
    return word;
  });
  animate(vent, {
    scale: [1, 1.45, .75, 1.2],
    opacity: [.5, 1, .3],
    duration: 980,
    ease: "out(4)",
  });
  animate(sparks, {
    opacity: [0, 1, .9, 0],
    x: (spark, index) => [0, ((index % 7) - 3) * 27 + (index % 2 ? 11 : -11)],
    y: (spark, index) => [8, -48 - ((index % 5) * 18), -72 - ((index % 4) * 24)],
    scale: [.15, 1.45, .2],
    rotate: (spark, index) => [0, index % 2 ? 240 : -240],
    delay: stagger(34),
    duration: 1380,
    ease: "out(4)",
  });
  animate(clouds, {
    opacity: [0, .82, .38, 0],
    x: (cloud, index) => [0, ((index - 3) * 17)],
    y: [4, -40, -78],
    scale: [.2, 1.3, 2],
    delay: stagger(72),
    duration: 1650,
    ease: "out(3)",
  });
  animate(card.querySelector(".analizar-pdf-subrecord-card-row"), {
    y: [0, 5, -9, 4, -3, 0],
    rotate: [0, -.8, 1.1, -.5, .25, 0],
    duration: 1450,
    ease: "out(4)",
  });
  return new Promise((resolve) => {
    let arrivedWords = 0;
    words.forEach((word, index) => {
      const fanX = ((index - ((words.length - 1) / 2)) * 13) + (index % 2 ? 8 : -8);
      const destinationX = endX - Number.parseFloat(word.style.left || "0");
      const destinationY = endY - startY;
      animate(word, {
        opacity: [0, 1, 1, 1, .92, 0],
        x: [0, fanX, fanX * .72, destinationX * .5, destinationX],
        y: [8, -76 - ((index % 3) * 9), -92, destinationY * .42, destinationY],
        rotate: [0, index % 2 ? 18 : -18, index % 2 ? -8 : 8, 0],
        scale: [.18, 1.18, 1, .9, .68],
        delay: index * 145,
        duration: 1840 + (index * 34),
        ease: "inOut(3)",
        onComplete: () => {
          arrivedWords += 1;
          const revealedTarget = typeof context?.onWordArrive === "function"
            ? context.onWordArrive({ index, total: words.length, word: word.textContent || "" })
            : findAnalysisRailTarget(null, context);
          const progressiveFill = baseFillProgress + ((eruptionFillLimit - baseFillProgress) * (arrivedWords / words.length));
          advanceRailWordColorFill(revealedTarget, progressiveFill, {
            ownerToken: context?.magicSpriteToken || "",
            wordIndex: index,
          });
          word.remove();
          if (arrivedWords < words.length) return;
          eruption.remove();
          card.classList.remove("is-machine-erupting");
          resolve(revealedTarget);
        },
      });
    });
  });
}

function createAnalysisSpriteToken() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `analysis-sprite-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function positionAnalysisSpriteOverRevision(record = null) {
  if (!record?.host) return false;
  const revisionId = String(record.revisionId || "").trim();
  const card = [...document.querySelectorAll(".analizar-pdf-revision-timeline-card[data-revision-id]")]
    .find((item) => String(item.dataset.revisionId || "").trim() === revisionId) || null;
  if (!card) {
    // Un render de estado puede sustituir brevemente las cards. Conservamos el
    // último fotograma del personaje y reintentamos el anclaje sin hacerlo parpadear.
    record.anchorRetryCount = Number(record.anchorRetryCount || 0) + 1;
    if (record.anchorRetryCount <= 12 && !record.anchorRetryFrame) {
      record.anchorRetryFrame = window.requestAnimationFrame(() => {
        record.anchorRetryFrame = 0;
        if (activeAnalysisSprites.has(record.token)) positionAnalysisSpriteOverRevision(record);
      });
    }
    return false;
  }
  record.anchorRetryCount = 0;
  const cardRect = card.getBoundingClientRect();
  const workerWidth = record.host.offsetWidth || 96;
  const workerHeight = record.host.offsetHeight || 114;
  const cardInset = 28;
  const left = Math.max(8, Math.min(
    window.innerWidth - workerWidth - 8,
    cardRect.left - workerWidth + cardInset
  ));
  const top = Math.max(8, Math.min(
    window.innerHeight - workerHeight - 34,
    cardRect.top + ((cardRect.height - workerHeight) / 2)
  ));
  record.host.style.left = `${Math.round(left)}px`;
  record.host.style.top = `${Math.round(top)}px`;
  record.host.style.visibility = "visible";
  return true;
}

function repositionActiveAnalysisSprites() {
  activeAnalysisSprites.forEach((record) => positionAnalysisSpriteOverRevision(record));
}

function emitMagicTrailParticle({ x = 0, y = 0, ownerToken = "", variant = "character" } = {}) {
  const particle = document.createElement("span");
  particle.className = `analizar-pdf-magic-trail-particle analizar-pdf-magic-trail-particle--${variant}`;
  particle.dataset.magicOwner = String(ownerToken || "");
  if (variant === "orb") {
    const colors = ["#fff58d", "#70f0d4", "#ad94ff", "#ff91c8", "#71c7ff"];
    particle.style.setProperty("--trail-color", colors[Math.floor(Math.random() * colors.length)]);
  }
  particle.style.left = `${Math.round(x + ((Math.random() - .5) * 8))}px`;
  particle.style.top = `${Math.round(y + ((Math.random() - .5) * 8))}px`;
  document.body.appendChild(particle);
  const travelX = variant === "orb" ? -18 - (Math.random() * 18) : -5 - (Math.random() * 10);
  const travelY = (Math.random() - .5) * (variant === "orb" ? 22 : 14);
  animate(particle, {
    x: [0, travelX],
    y: [0, travelY],
    scale: variant === "orb" ? [1.25, .15] : [1, .1],
    opacity: [0, 1, 0],
    rotate: [0, Math.random() > .5 ? 150 : -150],
    duration: variant === "orb" ? 560 : 760,
    ease: "out(3)",
    onComplete: () => particle.remove(),
  });
}

function startMagicTrailEmitter(element = null, {
  ownerToken = "",
  variant = "character",
  interval = 170,
  locate = null,
} = {}) {
  if (!element || prefersReducedRevisionMotion()) return () => {};
  const emit = () => {
    if (!element.isConnected) return;
    const rect = element.getBoundingClientRect();
    const point = typeof locate === "function"
      ? locate(rect)
      : { x: rect.left + (rect.width * .32), y: rect.top + (rect.height * .68) };
    emitMagicTrailParticle({ ...point, ownerToken, variant });
  };
  emit();
  const timer = window.setInterval(emit, interval);
  return () => window.clearInterval(timer);
}

function startAnalysisSprite(context = {}) {
  const token = createAnalysisSpriteToken();
  const host = document.createElement("div");
  host.className = "analizar-pdf-magic-worker";
  host.dataset.analysisSpriteToken = token;
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `
    <div class="analizar-pdf-magic-wizard">
      <div class="analizar-pdf-magic-particle-orbit analizar-pdf-magic-particle-orbit--inner" aria-hidden="true">
        <span class="analizar-pdf-magic-orbit-particle" style="--particle-angle: 0deg; --particle-radius: 42px"></span>
        <span class="analizar-pdf-magic-orbit-particle" style="--particle-angle: 90deg; --particle-radius: 38px"></span>
        <span class="analizar-pdf-magic-orbit-particle" style="--particle-angle: 180deg; --particle-radius: 42px"></span>
        <span class="analizar-pdf-magic-orbit-particle" style="--particle-angle: 270deg; --particle-radius: 38px"></span>
      </div>
      <div class="analizar-pdf-magic-particle-orbit analizar-pdf-magic-particle-orbit--outer" aria-hidden="true">
        <span class="analizar-pdf-magic-orbit-particle" style="--particle-angle: 35deg; --particle-radius: 51px"></span>
        <span class="analizar-pdf-magic-orbit-particle" style="--particle-angle: 155deg; --particle-radius: 48px"></span>
        <span class="analizar-pdf-magic-orbit-particle" style="--particle-angle: 275deg; --particle-radius: 51px"></span>
      </div>
      <span class="analizar-pdf-magic-spark analizar-pdf-magic-spark--one">✦</span>
      <span class="analizar-pdf-magic-spark analizar-pdf-magic-spark--two">✧</span>
      <picture class="analizar-pdf-magic-mage-picture">
        <source srcset="/analizarPDF/assets/peppermint-magic-v1.webp" type="image/webp">
        <img
          class="analizar-pdf-magic-mage-art"
          src="/analizarPDF/assets/peppermint-magic-v1.png"
          alt=""
          width="367"
          height="480"
          decoding="async"
        >
      </picture>
      <span class="analizar-pdf-magic-casting-arm" aria-hidden="true">
        <img src="/analizarPDF/assets/peppermint-magic-v1.webp" alt="" width="367" height="480" decoding="async">
      </span>
      <span class="analizar-pdf-magic-cast-ring" aria-hidden="true"></span>
    </div>
  `;
  document.body.appendChild(host);
  const wizard = host.querySelector(".analizar-pdf-magic-wizard");
  const wand = host.querySelector(".analizar-pdf-magic-wand");
  const feet = host.querySelector(".analizar-pdf-magic-feet");
  const mageArt = host.querySelector(".analizar-pdf-magic-mage-art");
  const castingArm = host.querySelector(".analizar-pdf-magic-casting-arm");
  const castRing = host.querySelector(".analizar-pdf-magic-cast-ring");
  const particleOrbits = host.querySelectorAll(".analizar-pdf-magic-particle-orbit");
  const orbitParticles = host.querySelectorAll(".analizar-pdf-magic-orbit-particle");
  mageArt?.addEventListener("error", () => {
    const picture = mageArt.closest("picture");
    picture?.querySelector("source")?.remove();
    if (!String(mageArt.currentSrc || mageArt.src || "").endsWith("peppermint-magic-v1.png")) {
      mageArt.src = "/analizarPDF/assets/peppermint-magic-v1.png";
    }
  }, { once: true });
  const sparks = host.querySelectorAll(".analizar-pdf-magic-spark");
  const record = {
    token,
    host,
    wizard,
    revisionId: String(context?.revisionId || context?.revision?.id || "").trim(),
    fileId: String(context?.fileId || context?.file?.id || "").trim(),
    animationWords: resolveAnalysisAnimationWords(
      context?.revisionId || context?.revision?.id || "",
      context?.fileId || context?.file?.id || "",
      32
    ),
  };
  activeAnalysisSprites.set(token, record);
  positionAnalysisSpriteOverRevision(record);

  if (prefersReducedRevisionMotion()) {
    host.classList.add("is-reduced-motion");
    return token;
  }
  animate(host, { opacity: [0, 1], duration: 180, ease: "out(2)" });
  record.stopTrail = startMagicTrailEmitter(wizard, { ownerToken: token, variant: "character", interval: 180 });
  animate(wizard, {
    x: [0, 6, -5, 0],
    y: [0, -5, 3, -2, 0],
    rotate: [0, -1.2, 1, 0],
    duration: 5200,
    alternate: true,
    loop: true,
    ease: "inOut(2)",
  });
  animate(mageArt, {
    y: [0, -1.5, 0],
    rotate: [-.35, .35, -.35],
    scaleY: [1, .99, 1],
    duration: 820,
    alternate: true,
    loop: true,
    ease: "inOut(2)",
  });
  animate(castingArm, {
    rotate: [0, -4.5, 2.5, 0],
    scale: [1, 1.012, 1],
    duration: 1080,
    delay: 180,
    loop: true,
    ease: "inOut(3)",
  });
  animate(castRing, {
    opacity: [0, .95, 0],
    scale: [.35, 1.45],
    duration: 1080,
    delay: 180,
    loop: true,
    ease: "out(3)",
  });
  if (wand) {
    animate(wand, {
      rotate: [-8, 24, -12],
      transformOrigin: "82px 82px",
      duration: 620,
      alternate: true,
      loop: true,
      ease: "inOut(3)",
    });
  }
  if (feet) {
    animate(feet, {
      y: [0, -3, 0],
      duration: 260,
      alternate: true,
      loop: true,
      ease: "inOut(2)",
    });
  }
  animate(sparks, {
    opacity: [.15, 1, .15],
    scale: [.55, 1.25, .55],
    rotate: [0, 120],
    delay: stagger(170),
    duration: 1080,
    loop: true,
    ease: "inOut(2)",
  });
  particleOrbits.forEach((orbit, index) => {
    animate(orbit, {
      rotate: index ? [360, 0] : [0, 360],
      duration: index ? 5200 : 3900,
      loop: true,
      ease: "linear",
    });
  });
  animate(orbitParticles, {
    opacity: [.25, 1, .35],
    delay: stagger(110),
    duration: 980,
    alternate: true,
    loop: true,
    ease: "inOut(2)",
  });
  return token;
}

function retargetAnalysisSprite(token = "", context = {}) {
  const cleanToken = String(token || "").trim();
  const record = activeAnalysisSprites.get(cleanToken) || null;
  if (!record) return startAnalysisSprite(context);
  const nextRevisionId = String(context?.revisionId || context?.revision?.id || record.revisionId || "").trim();
  const nextFileId = String(context?.fileId || context?.file?.id || record.fileId || "").trim();
  const isSameTarget = nextRevisionId === String(record.revisionId || "").trim()
    && nextFileId === String(record.fileId || "").trim();
  record.revisionId = nextRevisionId;
  record.fileId = nextFileId;
  record.anchorRetryCount = 0;
  stopProgressiveAnalysisWords(record);
  if (!isSameTarget) {
    record.railFillProgress = 0;
    record.progressWordCount = 0;
    record.progressWordsInFlight = 0;
  }
  positionAnalysisSpriteOverRevision(record);
  return cleanToken;
}

function resumeAnalysisSpriteIdle(record = null) {
  if (!record?.wizard || prefersReducedRevisionMotion()) return;
  removeAnimeAnimation(record.wizard);
  animate(record.wizard, {
    x: [0, 4, -3, 0],
    y: [0, -3, 2, 0],
    rotate: [0, -0.8, 0.7, 0],
    duration: 3600,
    loop: true,
    ease: "inOut(2)",
  });
}

function findAnalysisRailTarget(record = null, context = {}) {
  const revisionId = String(context?.revisionId || record?.revisionId || "").trim();
  const fileId = String(context?.fileId || record?.fileId || "").trim();
  const groups = [...document.querySelectorAll(".analizar-pdf-ortho-rail-group[data-rail-group-key]")];
  const exactPrefix = ["file", revisionId, fileId].join("::");
  return groups.find((group) => String(group.dataset.railGroupKey || "").startsWith(exactPrefix))
    || groups.find((group) => revisionId && String(group.dataset.railGroupKey || "").includes(`::${revisionId}::`))
    || null;
}

function findAnalysisRailLandingTarget(record = null, context = {}) {
  return findAnalysisRailTarget(record, context)
    || document.querySelector("#analizarPdfQuickRailHost .analizar-pdf-ortho-rail-body")
    || document.querySelector("#analizarPdfQuickRailHost .analizar-pdf-ortho-rail")
    || document.getElementById("analizarPdfQuickRailHost")
    || null;
}

function resolveSpriteAnimationWord(ownerToken = "", index = 0) {
  const record = activeAnalysisSprites.get(String(ownerToken || "")) || null;
  const words = Array.isArray(record?.animationWords) && record.animationWords.length
    ? record.animationWords
    : ANALYSIS_WORD_FALLBACK;
  return String(words[Math.abs(Number(index) || 0) % words.length] || "Texto");
}

function emitRailWordSplash(target = null, ownerToken = "", options = {}) {
  const summary = target?.querySelector(":scope > summary") || target;
  if (!summary || prefersReducedRevisionMotion()) return;
  const rect = summary.getBoundingClientRect();
  const isFinal = options?.isFinal === true;
  const wordCount = isFinal ? 12 : Math.max(2, Number(options?.count || 4) || 4);
  const baseIndex = Number(options?.wordIndex || 0) || 0;
  const targetStyle = getComputedStyle(target);
  const railTint = String(targetStyle.getPropertyValue("--analizar-pdf-rail-tint") || "").trim();
  const railInk = String(targetStyle.getPropertyValue("--analizar-pdf-rail-ink") || "").trim();
  const words = Array.from({ length: wordCount }, (_, index) => {
    const word = document.createElement("span");
    word.className = `analizar-pdf-rail-word-splash${isFinal ? " is-final-word" : ""}`;
    word.dataset.railSplashOwner = String(ownerToken || "");
    word.textContent = resolveSpriteAnimationWord(ownerToken, baseIndex + index);
    if (railTint) word.style.setProperty("--analizar-pdf-rail-tint", railTint);
    if (railInk) word.style.setProperty("--analizar-pdf-rail-ink", railInk);
    word.style.left = `${rect.left + (rect.width * (.08 + (Math.random() * .84)))}px`;
    word.style.top = `${rect.top + (rect.height * (.25 + (Math.random() * .5)))}px`;
    document.body.appendChild(word);
    return word;
  });
  animate(words, {
    x: () => (Math.random() - .5) * (isFinal ? 34 : 18),
    y: () => (isFinal ? 34 : 18) + (Math.random() * (isFinal ? 58 : 28)),
    opacity: [0, 1, .95, .72, 0],
    scale: () => [.45, .88 + (Math.random() * .32), .72, .25],
    rotate: () => [0, (Math.random() > .5 ? 1 : -1) * (8 + (Math.random() * 18))],
    delay: stagger(isFinal ? 48 : 62),
    duration: () => (isFinal ? 1250 : 780) + (Math.random() * 420),
    ease: "in(2.4)",
    onComplete: () => words.forEach((word) => word.remove()),
  });
}

function advanceRailWordColorFill(target = null, progress = 0, options = {}) {
  const summary = target?.querySelector?.(":scope > summary") || null;
  if (!target || !summary) return null;
  const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  target.classList.add("is-magic-arrival", "is-magic-color-filling", "is-word-color-loading");
  let fill = summary.querySelector(":scope > .analizar-pdf-rail-color-fill");
  if (!fill) {
    fill = document.createElement("span");
    fill.className = "analizar-pdf-rail-color-fill is-word-driven";
    fill.setAttribute("aria-hidden", "true");
    fill.dataset.progress = "0";
    summary.prepend(fill);
  }
  if (prefersReducedRevisionMotion()) {
    fill.style.transform = `scaleY(${safeProgress})`;
    fill.dataset.progress = String(safeProgress);
    if (safeProgress >= 1) {
      fill.remove();
      target.classList.remove("is-magic-arrival", "is-magic-color-filling", "is-word-color-loading");
    }
    return target;
  }

  const previousProgress = Math.max(0, Math.min(safeProgress, Number(fill.dataset.progress || 0) || 0));
  fill.dataset.progress = String(safeProgress);
  removeAnimeAnimation(fill);
  fill.style.transform = `scaleY(${previousProgress})`;
  animate(fill, {
    scaleY: [previousProgress, safeProgress],
    opacity: [.78, 1],
    duration: 210,
    ease: "out(3)",
  });
  removeAnimeAnimation(summary);
  const isFinalFill = safeProgress >= 1;
  animate(summary, isFinalFill ? {
    x: [0, -4, 4.5, -3.8, 3.6, -3, 2.8, -2.2, 1.8, -1.2, .8, 0],
    y: [0, -1.8, 1.5, -1.3, 1.2, -.9, .8, -.6, .45, -.25, 0],
    rotate: [0, -.9, 1, -.82, .76, -.62, .56, -.42, .32, -.2, .1, 0],
    scale: [1, 1.018, .994, 1.014, .996, 1.011, .998, 1.007, 1],
    duration: 2420,
    ease: "inOut(2.2)",
  } : {
    x: [0, -2.5, 3, -1.8, 1.2, 0],
    y: [0, -1, 1.4, -.6, 0],
    rotate: [0, -.55, .65, -.32, .18, 0],
    scale: [1, 1.012, .996, 1.008, 1],
    duration: 420,
    ease: "out(4)",
  });
  emitRailWordSplash(target, options?.ownerToken || "", {
    count: safeProgress >= 1 ? 12 : 3,
    isFinal: safeProgress >= 1,
    wordIndex: options?.wordIndex || 0,
  });
  if (safeProgress >= 1) {
    window.setTimeout(() => {
      fill.remove();
      target.classList.remove("is-magic-arrival", "is-magic-color-filling", "is-word-color-loading");
    }, 2480);
  }
  return target;
}

function getRailWordColorProgress(target = null) {
  const fill = target?.querySelector?.(":scope > summary > .analizar-pdf-rail-color-fill") || null;
  return Math.max(0, Math.min(1, Number(fill?.dataset?.progress || 0) || 0));
}

function stopProgressiveAnalysisWords(record = null) {
  if (!record) return;
  if (record.progressWordTimer) window.clearInterval(record.progressWordTimer);
  if (record.progressWordStartTimer) window.clearTimeout(record.progressWordStartTimer);
  record.progressWordTimer = 0;
  record.progressWordStartTimer = 0;
  record.progressWordsActive = false;
}

function waitForProgressiveAnalysisWords(record = null, timeout = 1800) {
  if (!record?.progressWordsInFlight) return Promise.resolve();
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (!record.progressWordsInFlight || performance.now() - startedAt >= timeout) {
        resolve();
        return;
      }
      window.requestAnimationFrame(check);
    };
    check();
  });
}

function launchProgressiveAnalysisWord(record = null) {
  if (!record?.wizard || Number(record.progressWordsInFlight || 0) >= 3 || prefersReducedRevisionMotion()) return false;
  const target = findAnalysisRailTarget(record, record);
  const card = [...document.querySelectorAll(".analizar-pdf-revision-timeline-card[data-revision-id]")]
    .find((item) => String(item.dataset.revisionId || "").trim() === String(record.revisionId || "").trim()) || null;
  if (!target?.isConnected || !card?.isConnected) return false;
  const cardRect = card.getBoundingClientRect();
  const targetRect = (target.querySelector(":scope > summary") || target).getBoundingClientRect();
  if (!cardRect.width || !targetRect.width) return false;

  const wordIndex = Number(record.progressWordCount || 0);
  record.progressWordCount = wordIndex + 1;
  record.progressWordsInFlight = Number(record.progressWordsInFlight || 0) + 1;
  const startX = cardRect.left + (cardRect.width * (.42 + (Math.random() * .16)));
  const startY = cardRect.top + 2;
  const endX = targetRect.left + Math.min(targetRect.width * .5, 82);
  const endY = targetRect.top + Math.min(targetRect.height * .5, 34);
  const word = document.createElement("span");
  word.className = "analizar-pdf-revision-eruption-word is-flying-to-rail is-progress-word";
  word.dataset.magicOwner = record.token;
  word.textContent = resolveSpriteAnimationWord(record.token, wordIndex);
  word.style.left = `${startX}px`;
  word.style.top = `${startY}px`;
  const accent = String(getComputedStyle(card).getPropertyValue("--revision-accent") || "").trim();
  if (accent) word.style.setProperty("--revision-accent", accent);
  document.body.appendChild(word);
  const castingArm = record.host?.querySelector(".analizar-pdf-magic-casting-arm");
  if (castingArm) {
    animate(castingArm, { rotate: [0, -8, 3, 0], duration: 420, ease: "out(4)" });
  }
  animate(word, {
    x: [0, (endX - startX) * .18, (endX - startX) * .52, endX - startX],
    y: [8, -48 - (Math.random() * 28), -66, endY - startY],
    scale: [.35, 1.08, .92, .68],
    rotate: [0, wordIndex % 2 ? 12 : -12, wordIndex % 2 ? -5 : 5, 0],
    opacity: [0, 1, 1, .92, 0],
    duration: 1120,
    ease: "inOut(3)",
    onComplete: () => {
      word.remove();
      record.progressWordsInFlight = Math.max(0, Number(record.progressWordsInFlight || 1) - 1);
      const liveTarget = findAnalysisRailTarget(record, record) || target;
      const current = Math.max(Number(record.railFillProgress || 0), getRailWordColorProgress(liveTarget));
      const maxProgress = Math.max(0, Math.min(.98, Number(record.progressWordMaxProgress ?? .6) || .6));
      const increment = Math.max(.01, Math.min(.12, Number(record.progressWordIncrement || .045) || .045));
      record.railFillProgress = Math.min(maxProgress, current + increment);
      advanceRailWordColorFill(liveTarget, record.railFillProgress, {
        ownerToken: record.token,
        wordIndex,
      });
    },
  });
  return true;
}

function startProgressiveAnalysisWords(record = null, options = {}) {
  if (!record || prefersReducedRevisionMotion()) return;
  const phase = String(options?.phase || "processing").trim() || "processing";
  if (record.progressWordsActive && record.progressWordPhase === phase && options?.reset !== true) return;
  stopProgressiveAnalysisWords(record);
  if (options?.reset === true) {
    record.railFillProgress = 0;
    record.progressWordCount = 0;
    record.progressWordsInFlight = 0;
  }
  record.progressWordPhase = phase;
  const currentProgress = Math.max(
    Number(record.railFillProgress || 0) || 0,
    getRailWordColorProgress(findAnalysisRailTarget(record, record))
  );
  const requestedMaxProgress = Math.max(0, Math.min(.98, Number(options?.maxProgress ?? .6) || .6));
  record.progressWordMaxProgress = Math.max(currentProgress, requestedMaxProgress);
  record.progressWordIncrement = Math.max(.01, Math.min(.12, Number(options?.increment || .045) || .045));
  record.progressWordsActive = true;
  const emit = () => launchProgressiveAnalysisWord(record);
  record.progressWordStartTimer = window.setTimeout(emit, Math.max(0, Number(options?.startDelay ?? 80) || 0));
  const cadence = Math.min(760, Math.max(420, Number(options?.interval || 720) || 720));
  record.progressWordTimer = window.setInterval(emit, cadence);
}

function syncAnalysisSpriteProgressStage(token = "", status = "") {
  const record = activeAnalysisSprites.get(String(token || "")) || null;
  if (!record) return;
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "queued") {
    startProgressiveAnalysisWords(record, {
      phase: "extracting",
      maxProgress: .58,
      increment: .028,
      interval: 1280,
      startDelay: 80,
    });
    return;
  }
  if (normalized === "processing") {
    startProgressiveAnalysisWords(record, {
      phase: "analyzing",
      maxProgress: .76,
      increment: .034,
      interval: 1120,
      startDelay: 40,
    });
    return;
  }
  stopProgressiveAnalysisWords(record);
}

function animateRailMagicImpact(target = null, ownerToken = "") {
  const summary = target?.querySelector?.(":scope > summary") || null;
  if (!target || !summary || prefersReducedRevisionMotion()) return Promise.resolve(target);
  target.classList.add("is-magic-arrival");
  emitRailWordSplash(target, ownerToken);
  removeAnimeAnimation(summary);
  return new Promise((resolve) => {
    animate(summary, {
      scale: [1, 1.09, .98, 1.035, 1],
      x: [0, -3, 3, -1, 0],
      rotate: [0, -.8, .6, -.2, 0],
      duration: 620,
      ease: "out(4)",
      onComplete: () => {
        target.classList.remove("is-magic-arrival");
        resolve(target);
      },
    });
  });
}

function animateRailColorFill(target = null, ownerToken = "") {
  const summary = target?.querySelector(":scope > summary") || null;
  if (!target || !summary) return Promise.resolve(target);
  target.classList.add("is-magic-arrival", "is-magic-color-filling");
  if (prefersReducedRevisionMotion()) {
    target.classList.remove("is-magic-arrival", "is-magic-color-filling");
    return Promise.resolve(target);
  }

  const fill = document.createElement("span");
  fill.className = "analizar-pdf-rail-color-fill";
  fill.setAttribute("aria-hidden", "true");
  summary.prepend(fill);
  emitRailWordSplash(target, ownerToken);
  removeAnimeAnimation(summary);
  return new Promise((resolve) => {
    animate(fill, {
      scaleY: [0, .22, .54, .82, 1],
      opacity: [.28, .72, .9, 1],
      duration: 1700,
      ease: "inOut(3)",
    });
    animate(summary, {
      x: [0, -3, 4, -2, 2, 0],
      y: [0, -2, 1, -1, 0],
      scale: [1, 1.035, .99, 1.02, 1],
      rotate: [0, -.8, .7, -.35, .18, 0],
      duration: 1900,
      ease: "inOut(3)",
      onComplete: () => {
        emitRailWordSplash(target, ownerToken, { isFinal: true });
        fill.remove();
        target.classList.remove("is-magic-arrival", "is-magic-color-filling");
        resolve(target);
      },
    });
  });
}

function stopAnalysisSprite(token = "", { immediate = false } = {}) {
  const record = activeAnalysisSprites.get(String(token || ""));
  if (!record) return;
  activeAnalysisSprites.delete(record.token);
  stopProgressiveAnalysisWords(record);
  if (record.anchorRetryFrame) window.cancelAnimationFrame(record.anchorRetryFrame);
  record.stopTrail?.();
  document.querySelectorAll(`[data-magic-owner="${CSS.escape(record.token)}"]`).forEach((particle) => particle.remove());
  removeAnimeAnimation(record.host.querySelectorAll("*"));
  removeAnimeAnimation(record.host);
  if (immediate || prefersReducedRevisionMotion()) {
    record.host.remove();
    return;
  }
  animate(record.host, {
    opacity: [1, 0],
    scale: [1, .7],
    duration: 220,
    ease: "in(3)",
    onComplete: () => record.host.remove(),
  });
}

function completeAnalysisSprite(token = "", context = {}) {
  const record = activeAnalysisSprites.get(String(token || ""));
  if (!record) return Promise.resolve(null);
  const keepAlive = context?.keepAlive === true;
  const materializingTarget = findAnalysisRailTarget(record, context);
  const landingTarget = findAnalysisRailLandingTarget(record, context);
  const revealRailTarget = () => {
    if (typeof context?.onArrive === "function") {
      context.onArrive();
    }
    return findAnalysisRailTarget(record, context) || materializingTarget || null;
  };
  const animateRevealedTarget = (target = null) => context?.skipColorFill === true
    ? (context?.finalizeVerticalFill === true
      ? new Promise((resolve) => {
        advanceRailWordColorFill(target, 1, { ownerToken: record.token, wordIndex: 99 });
        window.setTimeout(() => resolve(target), 2500);
      })
      : animateRailMagicImpact(target, record.token))
    : animateRailColorFill(target, record.token);
  if (!landingTarget || prefersReducedRevisionMotion()) {
    const revealedTarget = revealRailTarget();
    if (revealedTarget) animateRevealedTarget(revealedTarget);
    if (keepAlive) {
      resumeAnalysisSpriteIdle(record);
    } else {
      stopAnalysisSprite(record.token);
    }
    return Promise.resolve(revealedTarget);
  }

  materializingTarget?.classList.add("is-magic-materializing");
  removeAnimeAnimation(record.wizard);
  animate(record.wizard, {
    rotate: [0, -4, 3, 0],
    scale: [1, 1.035, 1],
    duration: 430,
    ease: "out(4)",
  });
  const wand = record.host.querySelector(".analizar-pdf-magic-wand");
  if (wand) {
    animate(wand, {
      rotate: [-8, 58, 8],
      transformOrigin: "82px 82px",
      duration: 390,
      ease: "out(4)",
    });
  }
  const revealedTarget = revealRailTarget();
  return Promise.resolve(revealedTarget ? animateRevealedTarget(revealedTarget) : revealedTarget)
    .then(() => {
      materializingTarget?.classList.remove("is-magic-materializing");
      if (keepAlive) {
        resumeAnalysisSpriteIdle(record);
        positionAnalysisSpriteOverRevision(record);
      } else {
        stopAnalysisSprite(record.token);
      }
      return revealedTarget;
    });
}

function renderFileList(session = null) {
  if (!els.fileList) return;
  const revision = getActiveRevision(session);
  const files = Array.isArray(revision?.files) ? revision.files : [];
  const activeFileId = String(getActiveFile(session, revision)?.id || "").trim();
  if (!files.length) {
    els.fileList.innerHTML = `<div class="analizar-pdf-empty-state">No hay archivos en esta revisión.</div>`;
    return;
  }
  els.fileList.innerHTML = files.map((file) => `
    <article class="analizar-pdf-subrecord-card${file.id === activeFileId ? " is-active" : ""}">
      <button type="button" class="analizar-pdf-subrecord-card-select" data-action="select-file" data-file-id="${escapeAttr(file.id)}">
        <span>${escapeHtml(file.documentName || "Archivo sin nombre")}</span>
        <small>${escapeHtml([file.analysisStatus || "idle", file.hasLocalSource ? "local" : ""].filter(Boolean).join(" · "))}</small>
      </button>
    </article>
  `).join("");
}

function renderRevisionMappingOptions(selectedMappingId = "") {
  const options = ['<option value="">Sin mapeo</option>'];
  const mappings = Array.isArray(state.styleMappings) ? state.styleMappings : [];
  const groups = getVisibleMappingGroupsForMappings(mappings);
  const groupIds = new Set(groups.map((group) => group.id));
  if (!groupIds.has(UNGROUPED_MAPPING_GROUP_ID) && mappings.some((mapping) => getMappingGroupIdForMapping(mapping) === UNGROUPED_MAPPING_GROUP_ID)) {
    groups.unshift({ id: UNGROUPED_MAPPING_GROUP_ID, title: "Sin grupo", count: 0, isVirtual: true });
  }
  for (const group of groups) {
    const groupMappings = mappings.filter((mapping) => getMappingGroupIdForMapping(mapping) === group.id);
    if (!groupMappings.length) continue;
    options.push(`<optgroup label="${escapeAttr(group.title || "Grupo")}">`);
    for (const mapping of groupMappings) {
      const selected = mapping.id === selectedMappingId ? " selected" : "";
      options.push(`<option value="${escapeAttr(mapping.id)}"${selected}>${escapeHtml(mapping.title || "Mapeo")}</option>`);
    }
    options.push("</optgroup>");
  }
  return options.join("");
}

function ensureActiveRevisionAndFile(session = null) {
  const pointers = ensureActivePointers(session, state.activeRevisionId, state.activeFileId);
  state.activeRevisionId = pointers.activeRevisionId;
  state.activeFileId = pointers.activeFileId;
}

function renderPaletteShell(session = null) {
  if (!els.paletteList) {
    return;
  }
  const palette = Array.isArray(session?.colorConfig?.palette) ? session.colorConfig.palette : [];
  if (!palette.length) {
    els.paletteList.innerHTML = `<div class="analizar-pdf-empty-state">No hay colores configurados.</div>`;
    return;
  }
  els.paletteList.innerHTML = palette.map((entry) => `
    <div class="analizar-pdf-palette-row" data-palette-id="${escapeAttr(entry.id || "")}">
      <input type="text" value="${escapeAttr(entry.swatchName || "")}" placeholder="Swatch">
      <input type="text" value="${escapeAttr(entry.cmyk || "")}" placeholder="CMYK">
      <input type="text" value="${escapeAttr(entry.hex || "")}" placeholder="HEX">
    </div>
  `).join("");
}

function renderMappingsModal() {
  if (!els.mappingsModal) return;
  els.mappingsModal.hidden = !state.mappingsModalOpen;
  if (!state.mappingsModalOpen) {
    return;
  }
  const filteredMappings = getFilteredMappings();
  const groups = ensureActiveMappingGroupSelection(filteredMappings);
  const mappings = getMappingsForActiveGroup(filteredMappings);
  const selectedGroupTitle = getMappingGroupTitleById(state.activeMappingGroupId);
  if (els.mappingGroupsList) {
    els.mappingGroupsList.innerHTML = groups.length
      ? groups.map((group) => {
        const isActive = group.id === state.activeMappingGroupId;
        return `
          <button type="button" class="analizar-pdf-template-group-card${isActive ? " is-active" : ""}" data-mapping-group-id="${escapeAttr(group.id)}">
            <strong>${escapeHtml(group.title)}</strong>
            <small>${escapeHtml(String(group.count || 0))} plantilla(s)</small>
          </button>
        `;
      }).join("")
      : `<div class="analizar-pdf-empty-state">Crea un grupo o una plantilla desde archivo.</div>`;
  }
  if (els.selectedMappingGroupLabel) {
    els.selectedMappingGroupLabel.textContent = state.activeMappingGroupId
      ? `${selectedGroupTitle} · ${mappings.length} plantilla(s)`
      : "Selecciona un grupo";
  }
  if (els.deleteMappingGroupBtn) {
    const canDeleteGroup = Boolean(state.activeMappingGroupId && state.activeMappingGroupId !== UNGROUPED_MAPPING_GROUP_ID);
    els.deleteMappingGroupBtn.disabled = !canDeleteGroup;
  }
  els.mappingsList.innerHTML = mappings.length
    ? mappings.map((mapping) => `
      <button type="button" class="analizar-pdf-subrecord-card${mapping.id === state.activeMappingId ? " is-active" : ""}" data-action="select-mapping" data-mapping-id="${escapeAttr(mapping.id)}" draggable="true">
        <span>${escapeHtml(mapping.title || "Mapeo sin título")}</span>
        <small>${escapeHtml([mapping.bookType, mapping.nivel, mapping.grado, mapping.unidad].filter(Boolean).join(" · "))}${mapping.isActive ? " · activo" : ""}</small>
      </button>
    `).join("")
    : state.activeMappingGroupId
      ? `<div class="analizar-pdf-empty-state">No hay plantillas en este grupo para el filtro actual.</div>`
      : `<div class="analizar-pdf-empty-state">Selecciona un grupo para ver sus plantillas.</div>`;

  const mapping = getCurrentMappingDraft();
  const hasSelectedMapping = Boolean(state.__mappingDraft || getActiveMapping());
  const editorEl = els.mappingEditorEmpty?.closest(".analizar-pdf-mapping-editor") || null;
  editorEl?.classList.toggle("is-empty", !hasSelectedMapping);
  [els.mappingTitleInput, els.mappingBookTypeInput, els.mappingNivelInput, els.mappingGradoInput, els.mappingUnidadInput, els.addMappingEntryBtn, els.activateMappingBtn, els.duplicateMappingBtn, els.deleteMappingBtn, els.saveMappingBtn].forEach((element) => {
    if (element) element.disabled = !hasSelectedMapping;
  });
  els.mappingTitleInput.value = hasSelectedMapping ? mapping.title || "" : "";
  els.mappingBookTypeInput.value = hasSelectedMapping ? mapping.bookType || "" : "";
  els.mappingNivelInput.value = hasSelectedMapping ? mapping.nivel || "" : "";
  els.mappingGradoInput.value = hasSelectedMapping ? mapping.grado || "" : "";
  els.mappingUnidadInput.value = hasSelectedMapping ? mapping.unidad || "" : "";
  if (!hasSelectedMapping) {
    els.mappingEntriesList.innerHTML = "";
    return;
  }
  els.mappingEntriesList.innerHTML = Array.isArray(mapping.entries) && mapping.entries.length
    ? `
      <table class="analizar-pdf-mapping-table">
        <colgroup>
          <col>
          <col>
          <col>
          <col>
          <col>
          <col>
          <col>
          <col>
        </colgroup>
        <thead>
          <tr class="analizar-pdf-mapping-entry-header">
            <th>Alias</th>
            <th>Tipo</th>
            <th>Estilo</th>
            <th>Paridad</th>
            <th>Página</th>
            <th>Excluir</th>
            <th>On</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${mapping.entries.map((entry, entryIndex, entries) => `
          <tr class="analizar-pdf-mapping-entry-row" data-entry-id="${escapeAttr(entry.id)}">
            <td><input type="text" data-field="alias" value="${escapeAttr(entry.alias || "")}"></td>
            <td>
              <select data-field="styleKind">
                <option value="paragraph"${entry.styleKind === "paragraph" ? " selected" : ""}>Párrafo</option>
                <option value="character"${entry.styleKind === "character" ? " selected" : ""}>Carácter</option>
                <option value="swatch"${entry.styleKind === "swatch" ? " selected" : ""}>Swatch</option>
              </select>
            </td>
            <td><input type="text" data-field="styleName" value="${escapeAttr(entry.styleName || "")}"></td>
            <td>
              <select data-field="pageScope">
                <option value="both"${entry.pageScope === "both" ? " selected" : ""}>Ambas</option>
                <option value="even"${entry.pageScope === "even" ? " selected" : ""}>Par</option>
                <option value="odd"${entry.pageScope === "odd" ? " selected" : ""}>Impar</option>
              </select>
            </td>
            <td><input type="text" inputmode="numeric" data-field="targetPage" value="${escapeAttr(entry.targetPage || "")}"></td>
            <td><input type="text" inputmode="numeric" data-field="excludeTargetPage" value="${escapeAttr(entry.excludeTargetPage || "0")}"></td>
            <td>
              <label class="analizar-pdf-mapping-entry-toggle" aria-label="Activo" title="Activo">
                <input type="checkbox" data-field="enabled" aria-label="Activo"${entry.enabled ? " checked" : ""}>
              </label>
            </td>
            <td>
              <div class="analizar-pdf-mapping-entry-actions">
                <button
                  type="button"
                  class="analizar-pdf-icon-btn"
                  data-action="move-mapping-entry-up"
                  aria-label="Subir estilo"
                  title="Subir estilo"
                  ${entryIndex === 0 ? "disabled" : ""}
                >
                  <i class="fas fa-chevron-up" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  class="analizar-pdf-icon-btn"
                  data-action="move-mapping-entry-down"
                  aria-label="Bajar estilo"
                  title="Bajar estilo"
                  ${entryIndex === entries.length - 1 ? "disabled" : ""}
                >
                  <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
                <button type="button" class="analizar-pdf-icon-btn" data-action="remove-mapping-entry" aria-label="Eliminar estilo" title="Eliminar estilo">
                  <i class="fas fa-times" aria-hidden="true"></i>
                </button>
              </div>
            </td>
          </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : `<div class="analizar-pdf-empty-state">Agrega estilos para este mapeo.</div>`;
  const helper = `<div class="analizar-pdf-empty-state">Los aliases de Proyecto como campo_formativo, folios, recortables y respuesta_alumno siguen siendo editables, pero ya no se agregan por default fuera de plantillas de Proyecto.</div>`;
  els.mappingEntriesList.insertAdjacentHTML("beforeend", helper);
}

function renderActiveSession(options = {}) {
  const session = store.getActiveSession();
  ensureActiveRevisionAndFile(session);
  const sessionId = String(session?.id || "").trim();
  if (els.heroSessionTitle && els.heroSessionTitleInput?.hidden !== false) {
    const title = String(session?.title || "Sesión sin título").trim() || "Sesión sin título";
    if (els.heroSessionTitleText) els.heroSessionTitleText.textContent = title;
  }
  if (state.jobMetaSessionId && state.jobMetaSessionId !== sessionId) {
    state.jobMetaText = "";
    state.jobMetaSessionId = sessionId;
  }
  const uploadState = getUploadUiState(session);
  els.indexPageInput.value = session?.indexConfig?.indexPageNumber || "";
  if (els.temarioPageInput) {
    els.temarioPageInput.value = session?.indexConfig?.temarioPageNumber || "";
  }
  const activeRevision = getActiveRevision(session);
  const activeFile = getActiveFile(session, activeRevision);
  const fileLabelText = uploadState.files.length
    ? (uploadState.files.length === 1 ? uploadState.files[0].name : `${uploadState.files.length} archivos seleccionados`)
    : activeFile?.documentName
      ? `${activeFile.documentName}${activeFile.hasLocalSource ? " · local" : ""}`
      : uploadState.missingFileMessage;
  els.fileLabel.textContent = fileLabelText;
  els.fileLabel.setAttribute("data-tooltip", fileLabelText);
  els.fileLabel.setAttribute("title", fileLabelText);
  updateEditorialSpinner(getActiveFile(session)?.analysisStatus || session?.analysisStatus || "idle");
  renderActionButtonState();
  renderBibliographicInfo(session);
  renderSavedAnalysisSelector(session);
  renderRevisionList(session);
  renderFileList(session);
  renderSectionsEditor(session);
  renderPaletteShell(session);
  if (options?.preserveResultsRail !== true) {
    renderResultsWithRailAnimations(buildRenderableSession(session));
  }
  if (!state.jobMetaText && !isBusyAnalysisStatus(session?.analysisStatus || "")) {
    const missingLocalSourceNotice = buildMissingLocalSourceNoticeFromSession(session);
    if (missingLocalSourceNotice) {
      setJobMetaText(missingLocalSourceNotice);
    }
  }
  persistBibliographicDraft(session);
  persistActiveSessionId(session?.id || "");
  persistLocalAnalysisSession(session);
}

function handleToggleCorrectionMode() {
  const session = store.getActiveSession();
  const context = getActiveCorrectionContext(session);
  if (!context.key) return;
  setCorrectionSelection(context.key, (current) => ({
    ...current,
    checkboxesVisible: !current.checkboxesVisible,
  }));
  renderAll();
}

async function handleClearRailAnalysis() {
  const session = store.getActiveSession();
  if (!session) return;
  logAnalizarPdfFlow("clearRailAnalysis:start", {
    sessionId: session?.id || "",
    revisionCount: Array.isArray(session?.revisions) ? session.revisions.length : 0,
  });
  const confirmed = window.confirm("Se borrarán los análisis visibles del panel de accesos rápidos de esta sesión. Los archivos fuente se conservarán. ¿Continuar?");
  if (!confirmed) return;
  let clearedCount = 0;
  mutateActiveSession((draft) => {
    if (!draft || typeof draft !== "object") return draft;
    for (const revision of Array.isArray(draft.revisions) ? draft.revisions : []) {
      for (const file of Array.isArray(revision?.files) ? revision.files : []) {
        if (!hasRenderableAnalysis(file)) continue;
        resetFileAnalysisState(file);
        clearedCount += 1;
      }
      revision.summary = buildRevisionSummary(revision.files || []);
      revision.latestAnalysisAt = "";
      revision.updatedAt = new Date().toISOString();
    }
    draft.analysisStatus = "idle";
    draft.analysisJobId = "";
    draft.resultSummary = createEmptyResultSummary();
    draft.result = createEmptyResultPayload();
    return draft;
  }, { render: false });
  if (!clearedCount) {
    logAnalizarPdfFlow("clearRailAnalysis:no-op", { sessionId: session?.id || "" });
    renderAll();
    return;
  }
  state.clearedRailSessionIds[String(session.id || "").trim()] = true;
  await persistActiveSession([]);
  logAnalizarPdfFlow("clearRailAnalysis:done", {
    sessionId: store.getActiveSession()?.id || "",
    clearedCount,
  });
  setJobMetaText("Análisis previos limpiados del panel.");
  renderAll();
}

function handleToggleCorrectionPage(pageName = "") {
  const cleanPageName = String(pageName || "").trim();
  const session = store.getActiveSession();
  const context = getActiveCorrectionContext(session);
  if (!context.key || !cleanPageName) return;
  setCorrectionSelection(context.key, (current) => {
    const selectedPages = new Set(current.selectedPages);
    const selectedIssueIds = new Set(current.selectedIssueIds);
    if (selectedPages.has(cleanPageName)) {
      selectedPages.delete(cleanPageName);
      const file = getActiveFile(session, getActiveRevision(session));
      for (const issue of collectCorrectionIssuesFromFile(file)) {
        if (issue.pageName === cleanPageName) {
          selectedIssueIds.delete(issue.id);
        }
      }
    } else {
      selectedPages.add(cleanPageName);
    }
    return {
      ...current,
      selectedPages: [...selectedPages],
      selectedIssueIds: [...selectedIssueIds],
    };
  });
  renderAll();
}

function handleToggleCorrectionIssue(payload = {}) {
  const cleanIssueId = String(payload?.issueId || "").trim();
  const cleanPageName = String(payload?.pageName || "").trim();
  const session = store.getActiveSession();
  const context = getActiveCorrectionContext(session);
  if (!context.key || !cleanIssueId || !cleanPageName) return;
  setCorrectionSelection(context.key, (current) => {
    const selectedPages = new Set(current.selectedPages);
    if (!selectedPages.has(cleanPageName)) {
      return current;
    }
    const selectedIssueIds = new Set(current.selectedIssueIds);
    if (selectedIssueIds.has(cleanIssueId)) {
      selectedIssueIds.delete(cleanIssueId);
    } else {
      selectedIssueIds.add(cleanIssueId);
    }
    return {
      ...current,
      selectedPages: [...selectedPages],
      selectedIssueIds: [...selectedIssueIds],
    };
  });
  renderAll();
}

function renderAll(options = {}) {
  renderSessionRailWithAnimation();
  renderActiveSession(options);
  renderDefaultRevisionsModal();
  renderGlobalTemplateModal();
  renderMappingsModal();
  renderExportConfigModal();
  const jobMeta = getLiveJobMetaElement();
  if (state.jobMetaText && jobMeta) {
    jobMeta.textContent = state.jobMetaText;
  }
}

async function refreshActiveSessionDetail(sessionId = "", options = {}) {
  const cleanSessionId = String(sessionId || state.activeSessionId || "").trim();
  if (!cleanSessionId) return null;
  const localSession = state.sessions.find((session) => String(session?.id || "").trim() === cleanSessionId) || null;
  const hasCompleteLocalSession = Boolean(
    localSession
    && !catalogOnlySessionIds.has(cleanSessionId)
    && (Array.isArray(localSession.revisions) ? localSession.revisions.length : 0) > 0
  );
  if (hasCompleteLocalSession && options.force !== true) {
    loadedSessionDetailIds.add(cleanSessionId);
    return localSession;
  }
  if (loadedSessionDetailIds.has(cleanSessionId)) {
    return state.sessions.find((session) => session.id === cleanSessionId) || null;
  }
  if (sessionDetailPromises.has(cleanSessionId)) {
    return sessionDetailPromises.get(cleanSessionId);
  }
  const request = (async () => {
    try {
      const remoteSession = await loadSessionDetail(cleanSessionId);
      if (!remoteSession) return null;
      const restoredSession = await restoreLocalAnalysisSession(remoteSession);
      catalogOnlySessionIds.delete(cleanSessionId);
      const clearedInterruptedState = clearInterruptedAnalysisStatuses(restoredSession);
      store.upsertSession(restoredSession);
      if (clearedInterruptedState) {
        persistLocalAnalysisSession(restoredSession);
      }
      loadedSessionDetailIds.add(cleanSessionId);
      if (state.activeSessionId === cleanSessionId) {
        ensureActiveRevisionAndFile(restoredSession);
        if (options.render !== false) {
          renderAll();
          rehydrateSelectedFilesForActiveContext().catch(() => {});
        }
        void clearBusyStatusesWithoutLocalFiles(restoredSession, { scope: "all" }).catch(() => {});
      }
      return restoredSession;
    } catch (error) {
      if (state.activeSessionId === cleanSessionId) {
        setJobMetaText(String(error?.message || error));
      }
      return null;
    } finally {
      sessionDetailPromises.delete(cleanSessionId);
    }
  })();
  sessionDetailPromises.set(cleanSessionId, request);
  return request;
}

async function refreshSessions(preferredSessionId = "") {
  const sessions = await loadSessions();
  const sessionsWithLocalAnalysis = await Promise.all(sessions.map((session) => restoreLocalAnalysisSession(session)));
  sessionsWithLocalAnalysis.forEach((session) => {
    catalogOnlySessionIds.delete(String(session?.id || "").trim());
    if (clearInterruptedAnalysisStatuses(session)) {
      persistLocalAnalysisSession(session);
    }
  });
  const normalizedSessions = [];
  for (const session of sessionsWithLocalAnalysis) {
    if (normalizeSingleFilePerRevision(session)) {
      normalizedSessions.push(session);
    }
  }
  store.setSessions(sessionsWithLocalAnalysis);
  syncPersistedTitleMap();
  const fallbackId = preferredSessionId || state.activeSessionId || restoreActiveSessionId() || sessionsWithLocalAnalysis[0]?.id || "";
  store.setActiveSession(fallbackId);
  ensureActiveRevisionAndFile(store.getActiveSession());
  await clearBusyStatusesWithoutLocalFiles(store.getActiveSession(), { scope: "all" });
  persistSessionCatalog(state.currentUser, sessionsWithLocalAnalysis);
  renderAll();
  void refreshActiveSessionDetail(fallbackId);
  if (normalizedSessions.length) {
    Promise.allSettled(normalizedSessions.map((session) => saveSession(session))).catch(() => {});
  }
}

async function refreshStyleMappings(preferredMappingId = "") {
  const payload = await listAnalizarPdfStyleMappings();
  const allMappings = Array.isArray(payload?.mappings) ? payload.mappings.map((entry, index) => normalizeStyleMapping(entry, index)) : [];
  const legacyMappings = allMappings.filter((entry) => isLegacyDefaultStyleMapping(entry));
  state.styleMappings = allMappings.filter((entry) => !isLegacyDefaultStyleMapping(entry));
  if (legacyMappings.length) {
    Promise.allSettled(legacyMappings.map((entry) => deleteAnalizarPdfStyleMapping(entry.id))).catch(() => {});
  }
  getMappingGroups();
  const preferred = isLegacyDefaultStyleMapping({ id: preferredMappingId }) ? "" : preferredMappingId;
  state.activeMappingId = preferred || (isLegacyDefaultStyleMapping({ id: state.activeMappingId }) ? "" : state.activeMappingId) || state.styleMappings[0]?.id || "";
  renderMappingsModal();
}

function buildRevisionSummary(files = []) {
  return files.reduce((acc, file) => {
    const summary = file?.resultSummary || {};
    acc.paginationIssueCount += Number(summary.paginationIssueCount || 0) || 0;
    acc.sectionIssueCount += Number(summary.sectionIssueCount || 0) || 0;
    acc.spellingIssueCount += Number(summary.spellingIssueCount || 0) || 0;
    acc.orthotypographyIssueCount += Number(summary.orthotypographyIssueCount || 0) || 0;
    acc.colorIssueCount += Number(summary.colorIssueCount || 0) || 0;
    acc.recortableIssueCount += Number(summary.recortableIssueCount || 0) || 0;
    return acc;
  }, {
    paginationIssueCount: 0,
    sectionIssueCount: 0,
    spellingIssueCount: 0,
    orthotypographyIssueCount: 0,
    colorIssueCount: 0,
    recortableIssueCount: 0,
  });
}

function createEmptyResultSummary() {
  return {
    paginationIssueCount: 0,
    sectionIssueCount: 0,
    spellingIssueCount: 0,
    orthotypographyIssueCount: 0,
    colorIssueCount: 0,
    recortableIssueCount: 0,
    pageCount: 0,
    analyzedAt: "",
  };
}

function createEmptyResultPayload() {
  return {
    paginationIssues: [],
    sectionIssues: [],
    spellingIssues: [],
    orthotypographyIssues: [],
    colorIssues: [],
    recortableIssues: [],
    stats: null,
  };
}

function resetFileAnalysisState(file = null) {
  if (!file || typeof file !== "object") return;
  file.analysisStatus = "idle";
  file.analysisJobId = "";
  file.resultSummary = createEmptyResultSummary();
  file.result = createEmptyResultPayload();
  file.updatedAt = new Date().toISOString();
}

function normalizeSingleFilePerRevision(session = null) {
  if (!session || typeof session !== "object") return false;
  let changed = false;
  const pickFileForRevision = (revision = {}) => {
    const files = Array.isArray(revision?.files) ? revision.files.filter(Boolean) : [];
    if (files.length <= 1) return files[0] || null;
    const matching = files.filter((file) => documentNameMatchesRevision(file?.documentName || file?.name || "", revision));
    const candidates = matching.length ? matching : files;
    return candidates
      .slice()
      .sort((left, right) => {
        const leftRenderable = hasRenderableAnalysis(left) ? 1 : 0;
        const rightRenderable = hasRenderableAnalysis(right) ? 1 : 0;
        if (leftRenderable !== rightRenderable) return rightRenderable - leftRenderable;
        return String(right?.updatedAt || right?.createdAt || "").localeCompare(String(left?.updatedAt || left?.createdAt || ""));
      })[0] || null;
  };
  for (const revision of Array.isArray(session.revisions) ? session.revisions : []) {
    const files = Array.isArray(revision?.files) ? revision.files.filter(Boolean) : [];
    if (files.length <= 1) {
      revision.fileCount = files.length;
      continue;
    }
    const selected = pickFileForRevision(revision);
    revision.files = selected ? [selected] : [];
    revision.fileCount = revision.files.length;
    revision.summary = buildRevisionSummary(revision.files);
    revision.updatedAt = new Date().toISOString();
    changed = true;
  }
  return changed;
}

async function attachSelectedFilesToRevision(session = null, revisionId = "", selectedFiles = [], options = {}) {
  const cleanRevisionId = String(revisionId || "").trim();
  const files = Array.isArray(selectedFiles) ? selectedFiles.filter(Boolean) : [];
  const replaceExisting = options?.replaceExisting === true;
  if (!session || !cleanRevisionId || !files.length) {
    return session;
  }
  let draft = structuredClone(session);
  const revision = (Array.isArray(draft.revisions) ? draft.revisions : [])
    .find((entry) => String(entry?.id || "").trim() === cleanRevisionId) || null;
  if (!revision) {
    return session;
  }
  revision.files = Array.isArray(revision.files) ? revision.files : [];
  const currentRevisionBlobKeyPrefix = `${String(session.id || "").trim()}::${cleanRevisionId}::`;
  const replacedLocalBlobKeys = replaceExisting
    ? revision.files
      .map((entry) => String(entry?.localBlobKey || "").trim())
      .filter((localBlobKey) => localBlobKey && localBlobKey.startsWith(currentRevisionBlobKeyPrefix))
    : [];
  if (replaceExisting) {
    // Un ID nuevo distingue una nueva selección de Collect del archivo ya
    // analizado. Así el backend no restaura resultados de la versión anterior.
    revision.files = [];
  }
  const matchingFiles = files.filter((file) => documentNameMatchesRevision(file?.name || "", revision));
  const selectedFilesForRevision = matchingFiles.length
    ? [matchingFiles[matchingFiles.length - 1]]
    : [files[files.length - 1]].filter(Boolean);
  for (const selectedFile of selectedFilesForRevision) {
    const documentName = String(selectedFile?.name || "").trim();
    const fileKey = buildFileKey(documentName);
    if (!documentName || !fileKey) {
      continue;
    }
    let fileEntry = revision.files.find((entry) => String(entry?.fileKey || "").trim() === fileKey) || null;
    if (!fileEntry) {
      fileEntry = {
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileKey,
        documentName,
        mappingId: String(revision.mappingId || "").trim(),
        mappingTitle: String(revision.mappingTitle || "").trim(),
        mappingUpdatedAt: String(revision.mappingUpdatedAt || "").trim(),
        sourceAssetPath: "",
        localBlobKey: "",
        hasLocalSource: false,
        fileSize: 0,
        fileLastModified: 0,
        fileMimeType: "",
        workflowRole: String(revision.workflowRole || revision.recortableRole || "source").trim().toLowerCase() || "source",
        sourceType: getNormalizedSourceType(session.sourceType),
        analysisStatus: "idle",
        analysisJobId: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resultSummary: createEmptyResultSummary(),
        result: createEmptyResultPayload(),
      };
      revision.files.push(fileEntry);
    } else {
      fileEntry.documentName = documentName;
      fileEntry.sourceType = getNormalizedSourceType(session.sourceType);
      fileEntry.mappingId = String(fileEntry.mappingId || revision.mappingId || "").trim();
      fileEntry.mappingTitle = String(fileEntry.mappingTitle || revision.mappingTitle || "").trim();
      fileEntry.mappingUpdatedAt = String(fileEntry.mappingUpdatedAt || revision.mappingUpdatedAt || "").trim();
      fileEntry.workflowRole = String(revision.workflowRole || revision.recortableRole || fileEntry.workflowRole || "source").trim().toLowerCase() || "source";
      resetFileAnalysisState(fileEntry);
    }
    revision.files = [fileEntry];
  }
  revision.fileCount = revision.files.length;
  revision.summary = buildRevisionSummary(revision.files);
  revision.updatedAt = new Date().toISOString();
  let saved = await saveSession(draft);
  const metadataByFileId = new Map();
  const savedRevision = (Array.isArray(saved.revisions) ? saved.revisions : [])
    .find((entry) => String(entry?.id || "").trim() === cleanRevisionId) || null;
  for (const selectedFile of files) {
    const fileKey = buildFileKey(selectedFile?.name || "");
    const targetFile = (Array.isArray(savedRevision?.files) ? savedRevision.files : [])
      .find((entry) => String(entry?.fileKey || "").trim() === fileKey) || null;
    const localMetadata = targetFile
      ? await cacheSelectedFileForRevision(saved.id, cleanRevisionId, targetFile, selectedFile)
      : null;
    if (targetFile && localMetadata) {
      metadataByFileId.set(targetFile.id, localMetadata);
    }
  }
  if (metadataByFileId.size) {
    draft = structuredClone(saved);
    const draftRevision = (Array.isArray(draft.revisions) ? draft.revisions : [])
      .find((entry) => String(entry?.id || "").trim() === cleanRevisionId) || null;
    for (const file of Array.isArray(draftRevision?.files) ? draftRevision.files : []) {
      const metadata = metadataByFileId.get(file.id);
      if (metadata) {
        Object.assign(file, metadata);
      }
    }
    saved = await saveSession(draft);
  }
  if (replaceExisting && replacedLocalBlobKeys.length) {
    const finalSavedRevision = (Array.isArray(saved?.revisions) ? saved.revisions : [])
      .find((entry) => String(entry?.id || "").trim() === cleanRevisionId) || null;
    const activeLocalBlobKeys = new Set(
      (Array.isArray(finalSavedRevision?.files) ? finalSavedRevision.files : [])
        .map((entry) => String(entry?.localBlobKey || "").trim())
        .filter(Boolean)
    );
    await Promise.all(replacedLocalBlobKeys
      .filter((localBlobKey) => !activeLocalBlobKeys.has(localBlobKey))
      .map((localBlobKey) => deleteAnalizarPdfCachedFile(localBlobKey).catch(() => {})));
  }
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  logAnalizarPdfFlow("attachSelectedFilesToRevision:done", {
    sessionId: saved?.id || "",
    revisionId: cleanRevisionId,
    files: files.map((file) => file?.name || ""),
  });
  return saved;
}

async function revisionNeedsSelectedFileAssignment(session = null, revision = null, selectedFileKeys = new Set()) {
  const files = (Array.isArray(revision?.files) ? revision.files : [])
    .filter((entry) => !isRecortableFileContaminatedBySource(session, revision, entry));
  if (!files.length) {
    return true;
  }
  if (files.some((entry) => selectedFileKeys.has(getFileEntryKey(entry)))) {
    return false;
  }
  for (const file of files) {
    const cachedFile = await resolveCachedFileForEntry(file);
    if (cachedFile) {
      return false;
    }
  }
  return true;
}

async function attachUnmatchedSelectedFilesToEmptyRevisions(session = null, selectedFiles = []) {
  const files = Array.isArray(selectedFiles) ? selectedFiles.filter(Boolean) : [];
  if (!session || !files.length) {
    return session;
  }
  const selectedFileKeys = new Set(
    files.map((file) => buildFileKey(file?.name || "")).filter(Boolean)
  );
  const existingFileKeys = new Set();
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      const fileKey = getFileEntryKey(file);
      if (fileKey) existingFileKeys.add(fileKey);
    }
  }
  const unmatchedFiles = files.filter((file) => {
    const fileKey = buildFileKey(file?.name || "");
    return fileKey && !existingFileKeys.has(fileKey);
  });
  if (!unmatchedFiles.length) {
    return session;
  }
  const regularTargetRevisions = [];
  const recortableTargetRevisions = [];
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    if (!(await revisionNeedsSelectedFileAssignment(session, revision, selectedFileKeys))) {
      continue;
    }
    if (shouldShowRecortableRole(revision?.unidad || "")) {
      recortableTargetRevisions.push(revision);
    } else {
      regularTargetRevisions.push(revision);
    }
  }
  if (!regularTargetRevisions.length && !recortableTargetRevisions.length) {
    logAnalizarPdfFlow("attachUnmatchedSelectedFilesToEmptyRevisions:no-target-revisions", {
      sessionId: session?.id || "",
      unmatchedFiles: unmatchedFiles.map((file) => file?.name || ""),
    });
    return session;
  }
  let saved = session;
  const assignments = [];
  const skippedFiles = [];
  for (const file of unmatchedFiles) {
    const isRecortableFile = looksLikeRecortableDocumentName(file?.name || "");
    const targetBucket = isRecortableFile ? recortableTargetRevisions : regularTargetRevisions;
    const matchingIndex = targetBucket.findIndex((revision) => documentNameMatchesRevision(file?.name || "", revision));
    const revision = matchingIndex >= 0
      ? targetBucket.splice(matchingIndex, 1)[0]
      : targetBucket.shift();
    if (!revision) {
      skippedFiles.push(file);
      continue;
    }
    saved = await attachSelectedFilesToRevision(saved, revision.id, [file]);
    assignments.push({
      revisionId: revision.id,
      revisionTitle: revision.title || "",
      fileName: file?.name || "",
    });
  }
  logAnalizarPdfFlow("attachUnmatchedSelectedFilesToEmptyRevisions:done", {
    sessionId: saved?.id || "",
    assignments,
    skippedFileCount: skippedFiles.length,
    skippedFiles: skippedFiles.map((file) => file?.name || ""),
  });
  return saved;
}

function isRootCollectFile(file = null) {
  const relativePath = String(file?.webkitRelativePath || "").trim();
  return !relativePath || relativePath.split("/").filter(Boolean).length <= 2;
}

async function importCollectFolder(files = []) {
  let session = store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea una sesión antes de elegir la carpeta Collect.");
    return;
  }
  const idmlFiles = Array.from(files || []).filter((file) => {
    return /\.idml$/i.test(String(file?.name || "")) && isRootCollectFile(file);
  });
  if (!idmlFiles.length) {
    setJobMetaText("No se encontraron IDML en la raíz de la carpeta Collect.");
    return;
  }
  const importSessionId = String(session.id || "").trim();
  const warnings = [];
  const assignmentsByRevisionId = new Map();
  for (const file of idmlFiles) {
    const unidad = inferUnidadFromDocumentName(file.name);
    const revision = (session.revisions || []).find((entry) => String(entry?.unidad || "").toLowerCase() === String(unidad || "").toLowerCase());
    if (!unidad || !revision) {
      warnings.push(`${file.name}: no coincide con una ficha de esta sesión.`);
      continue;
    }
    const previous = assignmentsByRevisionId.get(revision.id);
    if (previous) {
      warnings.push(`${previous.name}: se sustituyó por ${file.name} para ${revision.title || unidad}.`);
    }
    assignmentsByRevisionId.set(revision.id, file);
  }
  let assignedCount = 0;
  for (const [revisionId, file] of assignmentsByRevisionId) {
    if (String(store.getActiveSession()?.id || "").trim() !== importSessionId) {
      throw new Error("La sesión activa cambió durante la importación. Vuelve a elegir la carpeta Collect.");
    }
    session = await attachSelectedFilesToRevision(session, revisionId, [file], {
      replaceExisting: true,
    });
    assignedCount += 1;
  }
  state.selectedFiles = [];
  state.importWarnings = warnings;
  const pointers = ensureActivePointers(session, state.activeRevisionId, state.activeFileId);
  state.activeRevisionId = pointers.activeRevisionId;
  state.activeFileId = pointers.activeFileId;
  renderAll();
  setJobMetaText([
    `${assignedCount}/${idmlFiles.length} IDML actualizado(s) en esta sesión.`,
    warnings.length ? `Pendientes: ${warnings.join(" ")}` : "",
  ].filter(Boolean).join(" "));
}

function createDraftRevision(session = null) {
  const defaultMapping = resolveDefaultMappingForSession(session);
  const timestamp = new Date().toISOString();
  return {
    id: `revision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    revisionKey: buildDraftRevisionKey(),
    title: "Nueva ficha editorial",
    unidad: "",
    revisionNumero: "",
    recortableRole: "source",
    workflowRole: "source",
    mappingId: String(defaultMapping?.id || "").trim(),
    mappingTitle: String(defaultMapping?.title || "").trim(),
    mappingUpdatedAt: String(defaultMapping?.updatedAt || "").trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    latestAnalysisAt: "",
    fileCount: 0,
    summary: {
      paginationIssueCount: 0,
      sectionIssueCount: 0,
      spellingIssueCount: 0,
      orthotypographyIssueCount: 0,
      colorIssueCount: 0,
      recortableIssueCount: 0,
    },
    files: []
  };
}

function setInsertRevisionError(message = "") {
  if (!els.insertRevisionError) return;
  const cleanMessage = String(message || "").trim();
  els.insertRevisionError.textContent = cleanMessage;
  els.insertRevisionError.hidden = !cleanMessage;
}

function openInsertRevisionModal(index = 0) {
  const session = store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea una sesión antes de añadir una ficha editorial.");
    return;
  }
  if (state.isInsertingRevision || state.isAnalyzingCurrent || state.isAnalyzingAll) return;
  const revisionCount = Array.isArray(session.revisions) ? session.revisions.length : 0;
  state.insertRevisionIndex = Math.max(0, Math.min(revisionCount, Number(index) || 0));
  const activeRevision = getActiveRevision(session);
  if (els.insertRevisionUnit) els.insertRevisionUnit.value = "";
  if (els.insertRevisionNumber) els.insertRevisionNumber.value = String(activeRevision?.revisionNumero || "F2").trim() || "F2";
  if (els.insertRevisionRole) els.insertRevisionRole.value = "source";
  if (els.insertRevisionFile) els.insertRevisionFile.value = "";
  if (els.insertRevisionFileName) els.insertRevisionFileName.textContent = "Ningún archivo seleccionado";
  setInsertRevisionError("");
  if (els.insertRevisionModal) els.insertRevisionModal.hidden = false;
  window.requestAnimationFrame(() => els.insertRevisionUnit?.focus());
}

function closeInsertRevisionModal() {
  if (state.isInsertingRevision) return;
  if (els.insertRevisionModal) els.insertRevisionModal.hidden = true;
  state.insertRevisionIndex = -1;
  setInsertRevisionError("");
}

async function createTemplateForInsertedRevision(session = null, revisionId = "", fileId = "") {
  const revision = (Array.isArray(session?.revisions) ? session.revisions : [])
    .find((entry) => String(entry?.id || "").trim() === String(revisionId || "").trim()) || null;
  const file = (Array.isArray(revision?.files) ? revision.files : [])
    .find((entry) => String(entry?.id || "").trim() === String(fileId || "").trim()) || null;
  if (!revision || !file) return session;
  const { payload, savedMapping } = await createTemplateMappingForRevisionFile(session, revision, file);
  const draft = structuredClone(session);
  applyTemplateMappingToRevisionFile(draft, revision.id, file.id, savedMapping, payload?.sourceAssetPath || "");
  const saved = await saveSession(draft);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  return saved;
}

async function handleInsertRevisionSubmit(event = null) {
  event?.preventDefault?.();
  if (state.isInsertingRevision) return;
  const session = store.getActiveSession();
  const unidad = String(els.insertRevisionUnit?.value || "").trim();
  const revisionNumero = String(els.insertRevisionNumber?.value || "").trim();
  const workflowRole = String(els.insertRevisionRole?.value || "source").trim().toLowerCase();
  const selectedFile = els.insertRevisionFile?.files?.[0] || null;
  if (!session) {
    setInsertRevisionError("No hay una sesión activa.");
    return;
  }
  if (!unidad || !revisionNumero) {
    setInsertRevisionError("Selecciona la unidad y la revisión de la nueva ficha.");
    return;
  }
  if (!selectedFile || !/\.idml$/i.test(String(selectedFile.name || ""))) {
    setInsertRevisionError("Selecciona un archivo IDML válido del dispositivo.");
    return;
  }

  const insertionIndex = Math.max(0, Math.min(session.revisions?.length || 0, Number(state.insertRevisionIndex) || 0));
  const draftRevision = createDraftRevision(session);
  draftRevision.unidad = unidad;
  draftRevision.revisionNumero = revisionNumero;
  draftRevision.revisionKey = buildRevisionKey(draftRevision) || buildDraftRevisionKey();
  draftRevision.title = buildRevisionTitle(draftRevision);
  draftRevision.workflowRole = ["source", "destination", "both"].includes(workflowRole) ? workflowRole : "source";
  draftRevision.recortableRole = normalizeRecortableRole(draftRevision.workflowRole, unidad);
  const revisionId = draftRevision.id;
  let fileId = "";
  let templateWarning = "";

  try {
    state.isInsertingRevision = true;
    state.isAnalyzingCurrent = true;
    if (els.insertRevisionSubmit) els.insertRevisionSubmit.disabled = true;
    if (els.insertRevisionModal) els.insertRevisionModal.hidden = true;
    setBusyOverlay(`Preparando ${draftRevision.title}`);
    renderActionButtonState();
    await flushUiFrame();

    const draft = structuredClone(session);
    draft.sourceType = "idml";
    draft.revisions = Array.isArray(draft.revisions) ? draft.revisions : [];
    draft.revisions.splice(insertionIndex, 0, draftRevision);
    draft.bibliographicInfo = draft.bibliographicInfo || {};
    draft.bibliographicInfo.unidad = unidad;
    draft.bibliographicInfo.revisionNumero = revisionNumero;
    if (shouldShowRecortableRole(unidad)) {
      draft.bibliographicInfo.recortableRole = draftRevision.recortableRole || "source";
    }
    let saved = await saveSession(draft);
    store.upsertSession(saved);
    store.setActiveSession(saved.id);
    state.activeRevisionId = revisionId;
    state.activeFileId = "";
    ensureActiveRevisionAndFile(saved);
    renderAll();

    saved = await attachSelectedFilesToRevision(saved, revisionId, [selectedFile]);
    let insertedRevision = (saved.revisions || []).find((entry) => entry.id === revisionId) || null;
    let insertedFile = insertedRevision?.files?.[0] || null;
    fileId = String(insertedFile?.id || "").trim();
    if (!insertedRevision || !insertedFile) {
      throw new Error("No se pudo adjuntar el IDML a la nueva ficha editorial.");
    }
    state.activeRevisionId = revisionId;
    state.activeFileId = fileId;
    ensureActiveRevisionAndFile(saved);
    renderAll();

    try {
      saved = await createTemplateForInsertedRevision(saved, revisionId, fileId);
    } catch (error) {
      templateWarning = formatIdmlToolError(error);
      logAnalizarPdfFlow("insertRevision:template-warning", { revisionId, fileId, message: templateWarning });
    }

    insertedRevision = (saved.revisions || []).find((entry) => entry.id === revisionId) || null;
    insertedFile = insertedRevision?.files?.find((entry) => entry.id === fileId) || insertedRevision?.files?.[0] || null;
    if (!insertedRevision || !insertedFile) {
      throw new Error("La ficha se creó, pero no se pudo preparar su objetivo de análisis.");
    }
    state.activeRevisionId = revisionId;
    state.activeFileId = insertedFile.id;
    await runAnalysisForTargets(saved, [{
      selectedFile,
      targetFile: insertedFile,
      revision: insertedRevision,
    }], "No se pudo preparar el archivo seleccionado para el análisis.");
    setJobMetaText([
      `${draftRevision.title} se añadió y terminó de analizarse.`,
      templateWarning ? `Aviso de plantilla: ${templateWarning}` : "",
    ].filter(Boolean).join(" "));
  } catch (error) {
    logAnalizarPdfFlow("insertRevision:error", {
      revisionId,
      fileId,
      message: String(error?.message || error),
      stack: String(error?.stack || ""),
    });
    mutateActiveSession((draft) => {
      const revision = (draft.revisions || []).find((entry) => entry.id === revisionId);
      const file = revision?.files?.find((entry) => entry.id === fileId) || revision?.files?.[0];
      if (file) file.analysisStatus = "failed";
      return draft;
    }, { render: false });
    setJobMetaText(`La ficha se añadió, pero el proceso no terminó: ${String(error?.message || error)}`);
  } finally {
    state.isInsertingRevision = false;
    state.isAnalyzingCurrent = false;
    state.insertRevisionIndex = -1;
    if (els.insertRevisionSubmit) els.insertRevisionSubmit.disabled = false;
    if (els.insertRevisionFile) els.insertRevisionFile.value = "";
    setBusyOverlay("");
    renderActionButtonState();
    renderAll();
  }
}

function resolveDefaultRevisionUnitCount(config = {}) {
  const requested = Number(config?.unitCount || 7);
  return Math.max(1, Math.min(10, Number.isFinite(requested) ? Math.round(requested) : 7));
}

function buildDefaultRevisionBlueprints(config = {}) {
  const unitCount = resolveDefaultRevisionUnitCount(config);
  const revisionNumero = String(config.revisionNumero || "F1").trim() || "F1";
  const units = [
    { unidad: "Intro", recortableRole: "source" },
    { unidad: "Proyecto", recortableRole: "source" },
    ...Array.from({ length: unitCount }, (_, index) => ({
      unidad: `Unidad ${index + 1}`,
      recortableRole: "source",
    })),
    { unidad: "Lecturas", recortableRole: "source" },
    { unidad: "Recortables", recortableRole: "destination" },
  ];
  return units.map((entry) => ({
    ...entry,
    revisionNumero,
  }));
}

function collectDefaultRevisionsConfigFromDom() {
  return {
    unitCount: Number(els.defaultUnitCountInput?.value || 7),
    workflowFormat: els.defaultWorkflowFormatInput?.value === "libre" ? "libre" : "en_forma",
    languageCode: String(els.defaultLanguageInput?.value || "es-MX").trim(),
    bookName: String(els.defaultBookNameInput?.value || "").trim(),
    folderFileCount: Array.isArray(state.pendingNewSessionFiles) ? state.pendingNewSessionFiles.filter((file) => /\.idml$/i.test(String(file?.name || ""))).length : 0,
    sourceType: String(els.defaultSourceTypeInput?.value || "idml").trim() || "idml",
    bookType: String(els.defaultBookTypeInput?.value || "").trim(),
    nivel: String(els.defaultNivelInput?.value || "").trim(),
    grado: String(els.defaultGradoInput?.value || "").trim(),
    trimestre: String(els.defaultTrimestreInput?.value || "").trim(),
    edicionNumero: String(els.defaultEdicionNumeroInput?.value || "").trim(),
    revisionNumero: String(els.defaultRevisionNumeroInput?.value || "").trim(),
  };
}

function validateDefaultRevisionsConfig(config = {}) {
  const missing = [];
  if (config.workflowFormat !== "libre" && resolveDefaultRevisionUnitCount(config) !== Number(config.unitCount || 7)) missing.push("Número de unidades válido (1–10)");
  if (config.workflowFormat === "libre" && Number(config.folderFileCount || 0) < 1) missing.push("Carpeta con archivos IDML");
  return missing;
}

function buildDefaultRevisionsSummaryText(config = {}) {
  if (config.workflowFormat === "libre") return "Se creará una sesión Libre y después elegirás la carpeta con archivos IDML.";
  const unitCount = resolveDefaultRevisionUnitCount(config);
  return `Se crearán Intro + Proyecto + ${unitCount} unidad(es) + Lecturas + Recortables.`;
}

function seedDefaultRevisionsModalFromSession(session = null) {
  const info = session?.bibliographicInfo || {};
  if (els.defaultWorkflowFormatInput) els.defaultWorkflowFormatInput.value = session?.workflowFormat === "libre" ? "libre" : "en_forma";
  if (els.defaultLanguageInput) els.defaultLanguageInput.value = String(session?.languageCode || "es-MX");
  if (els.defaultBookNameInput) els.defaultBookNameInput.value = String(session?.customTitle || "").trim();
  if (els.defaultSourceTypeInput) els.defaultSourceTypeInput.value = "idml";
  if (els.defaultBookTypeInput) els.defaultBookTypeInput.value = info.bookType || "LA";
  if (els.defaultNivelInput) els.defaultNivelInput.value = info.nivel || "Primaria";
  if (els.defaultGradoInput) els.defaultGradoInput.value = info.grado || "";
  if (els.defaultTrimestreInput) els.defaultTrimestreInput.value = info.trimestre || "Trimestre 1";
  if (els.defaultEdicionNumeroInput) els.defaultEdicionNumeroInput.value = info.edicionNumero || "10rev";
  if (els.defaultRevisionNumeroInput) els.defaultRevisionNumeroInput.value = info.revisionNumero || "F1";
  if (els.defaultUnitCountInput) els.defaultUnitCountInput.value = "7";
  if (els.defaultFolderSummary) els.defaultFolderSummary.textContent = "Ninguna carpeta seleccionada.";
}

function renderDefaultRevisionsModal() {
  if (!els.defaultRevisionsModal) return;
  els.defaultRevisionsModal.hidden = !state.defaultRevisionsModalOpen;
  if (!state.defaultRevisionsModalOpen) return;
  const fieldsGrid = els.defaultWorkflowFormatInput?.closest(".analizar-pdf-default-revisions-grid");
  const workflowField = els.defaultWorkflowFormatInput?.closest("label");
  const unitCountField = els.defaultUnitCountInput?.closest("label");
  if (fieldsGrid && workflowField && unitCountField) {
    fieldsGrid.prepend(workflowField);
    workflowField.after(unitCountField);
  }
  const config = collectDefaultRevisionsConfigFromDom();
  const libre = config.workflowFormat === "libre";
  if (els.defaultUnitCountInput) els.defaultUnitCountInput.closest("label")?.toggleAttribute("hidden", libre);
  [
    els.defaultBookTypeInput,
    els.defaultNivelInput,
    els.defaultGradoInput,
    els.defaultTrimestreInput,
  ].forEach((input) => input?.closest("label")?.toggleAttribute("hidden", libre));
  const missing = validateDefaultRevisionsConfig(config);
  if (els.defaultRevisionsSummary) {
    els.defaultRevisionsSummary.textContent = missing.length
      ? `${buildDefaultRevisionsSummaryText(config)} Faltan: ${missing.join(", ")}.`
      : buildDefaultRevisionsSummaryText(config);
  }
  if (els.defaultRevisionsConfirmBtn) {
    els.defaultRevisionsConfirmBtn.disabled = missing.length > 0;
  }
}

function openDefaultRevisionsModal() {
  const session = state.pendingNewSession || store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea una sesión antes de generar fichas base.");
    return;
  }
  state.defaultRevisionsModalOpen = true;
  seedDefaultRevisionsModalFromSession(session);
  renderDefaultRevisionsModal();
}

function closeDefaultRevisionsModal() {
  state.defaultRevisionsModalOpen = false;
  state.pendingNewSession = null;
  state.pendingNewSessionFiles = [];
  state.pendingCreateFolderSelection = false;
  renderDefaultRevisionsModal();
}

function collectGlobalTemplateConfigFromDom() {
  return {
    sourceType: getNormalizedSourceType(els.globalSourceTypeInput?.value || "idml"),
    workflowFormat: els.globalWorkflowFormatInput?.value === "libre" ? "libre" : "en_forma",
    languageCode: String(els.globalLanguageInput?.value || "es-MX").trim(),
    bookName: String(els.globalBookNameInput?.value || "").trim(),
    bookType: String(els.globalBookTypeInput?.value || "").trim(),
    nivel: String(els.globalNivelInput?.value || "").trim(),
    grado: String(els.globalGradoInput?.value || "").trim(),
    trimestre: String(els.globalTrimestreInput?.value || "").trim(),
    edicionNumero: String(els.globalEdicionInput?.value || "").trim(),
    revisionNumero: String(els.globalRevisionInput?.value || "").trim(),
  };
}

function detectLibreStructure(fileName = "") {
  const name = String(fileName || "").replace(/\.idml$/i, "");
  const patterns = [
    ["chapter", /(?:cap(?:i|í)tulo|chapter|chap)[ _.-]*(\d+)/i],
    ["topic", /(?:tema|topic)[ _.-]*(\d+)/i],
    ["unit", /(?:unidad|unit|u)[ _.-]*(\d+)/i],
    ["section", /(?:secci(?:o|ó)n|section|sec)[ _.-]*(\d+)/i],
  ];
  for (const [type, pattern] of patterns) {
    const match = name.match(pattern);
    if (match) return { type, label: match[0], ordinal: Number(match[1]), source: "filename" };
  }
  return { type: "", label: "", ordinal: null, source: "" };
}

async function importLibreFolder(folderFiles = []) {
  const isUsable = (file) => {
    const path = String(file?.webkitRelativePath || file?.name || "");
    return /\.idml$/i.test(path) && !path.split("/").some((part) => part.startsWith(".") || /^~\$/.test(part));
  };
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const seen = new Set();
  const files = folderFiles.filter(isUsable).sort((a, b) => collator.compare(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name)).filter((file) => {
    const key = `${String(file.webkitRelativePath || file.name).toLowerCase()}::${file.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!files.length) throw new Error("La carpeta no contiene archivos IDML válidos.");
  const now = Date.now();
  const structures = files.map((file) => detectLibreStructure(file.name));
  const sequenceWarnings = [];
  const ordinalsByType = new Map();
  for (const structure of structures) {
    if (!structure.type || !Number.isFinite(structure.ordinal)) continue;
    const values = ordinalsByType.get(structure.type) || [];
    values.push(structure.ordinal);
    ordinalsByType.set(structure.type, values);
  }
  for (const [type, values] of ordinalsByType) {
    const ordered = [...values].sort((a, b) => a - b);
    const duplicates = ordered.filter((value, index) => index > 0 && value === ordered[index - 1]);
    const missing = [];
    for (let value = ordered[0]; value <= ordered[ordered.length - 1]; value += 1) if (!ordered.includes(value)) missing.push(value);
    if (duplicates.length) sequenceWarnings.push(`${type}: secuencias duplicadas ${[...new Set(duplicates)].join(", ")}`);
    if (missing.length) sequenceWarnings.push(`${type}: faltan ${missing.join(", ")}`);
  }
  const nextSession = mutateActiveSession((draft) => {
    draft.sourceType = "idml";
    draft.workflowFormat = "libre";
    draft.importWarnings = sequenceWarnings;
    draft.revisions = files.map((file, index) => {
      const documentName = String(file.name || `archivo-${index + 1}.idml`);
      const title = `Archivo ${index + 1}`;
      const fileId = `file_${now}_${index + 1}`;
      return {
        id: `revision_${now}_${index + 1}`,
        revisionKey: `libre_${now}_${index + 1}`,
        title,
        unidad: title,
        revisionNumero: String(index + 1),
        workflowRole: "source",
        detectedStructure: structures[index],
        files: [{ id: fileId, fileKey: buildFileKey(documentName), documentName, sourceType: "idml", workflowRole: "source", analysisSelected: true, fileSize: file.size, fileLastModified: file.lastModified, fileMimeType: file.type, analysisStatus: "idle" }],
        fileCount: 1,
      };
    });
    draft.activeRevisionId = draft.revisions[0]?.id || "";
    draft.activeFileId = draft.revisions[0]?.files?.[0]?.id || "";
    draft.updatedAt = new Date().toISOString();
    return draft;
  }, { render: false });
  if (!nextSession) {
    throw new Error("No fue posible preparar las fichas editoriales del modo Libre.");
  }
  state.selectedFiles = files;
  const saved = await saveSession(nextSession);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  ensureActiveRevisionAndFile(saved);
  renderAll();
  const cacheFailures = [];
  for (let index = 0; index < files.length; index += 1) {
    const revision = saved.revisions[index];
    const fileEntry = revision?.files?.[0];
    if (!revision || !fileEntry) continue;
    try {
      const localMetadata = await cacheSelectedFileForRevision(saved.id, revision.id, fileEntry, files[index]);
      if (!localMetadata) {
        throw new Error("IndexedDB no devolvió metadata local.");
      }
      Object.assign(fileEntry, localMetadata);
      fileEntry.documentName = String(files[index]?.name || fileEntry.documentName || "").trim();
      fileEntry.fileKey = buildFileKey(fileEntry.documentName);
      fileEntry.sourceType = "idml";
      fileEntry.analysisSelected = true;
    } catch (error) {
      cacheFailures.push(`${files[index]?.name || `Archivo ${index + 1}`}: ${String(error?.message || error)}`);
    }
  }
  const persisted = await saveSession(saved);
  store.upsertSession(persisted);
  store.setActiveSession(persisted.id);
  ensureActiveRevisionAndFile(persisted);
  renderAll();
  if (els.globalLibreFolderSummary) els.globalLibreFolderSummary.textContent = `${files.length} IDML detectados${sequenceWarnings.length ? ` · ${sequenceWarnings.length} advertencias` : ""}`;
  setJobMetaText(`${files.length} fichas Libre creadas; ${files.length - cacheFailures.length} archivo(s) cargados.${cacheFailures.length ? ` No cargados: ${cacheFailures.slice(0, 4).join("; ")}` : ""}${sequenceWarnings.length ? ` ${sequenceWarnings.join("; ")}` : ""}`);
  return persisted;
}

function seedGlobalTemplateModalFromSession(session = null) {
  const info = session?.bibliographicInfo || {};
  if (els.globalSourceTypeInput) els.globalSourceTypeInput.value = getNormalizedSourceType(session?.sourceType || "idml");
  if (els.globalWorkflowFormatInput) {
    els.globalWorkflowFormatInput.value = session?.workflowFormat === "libre" ? "libre" : "en_forma";
    els.globalWorkflowFormatInput.disabled = (session?.revisions || []).length > 0;
  }
  if (els.globalLanguageInput) els.globalLanguageInput.value = String(session?.languageCode || "es-MX");
  if (els.globalBookNameInput) els.globalBookNameInput.value = String(session?.customTitle || session?.title || "").trim();
  if (els.globalBookTypeInput) els.globalBookTypeInput.value = String(info.bookType || "").trim();
  if (els.globalNivelInput) els.globalNivelInput.value = String(info.nivel || "").trim();
  if (els.globalGradoInput) els.globalGradoInput.value = String(info.grado || "").trim();
  if (els.globalTrimestreInput) els.globalTrimestreInput.value = String(info.trimestre || "").trim();
  if (els.globalEdicionInput) els.globalEdicionInput.value = String(info.edicionNumero || "").trim();
  if (els.globalRevisionInput) els.globalRevisionInput.value = String(info.revisionNumero || getActiveRevision(session)?.revisionNumero || "F1").trim();
}

function renderGlobalTemplateModal() {
  if (!els.globalTemplateModal) return;
  els.globalTemplateModal.hidden = !state.globalTemplateModalOpen;
  const libre = els.globalWorkflowFormatInput?.value === "libre";
  if (els.globalLibreFolderField) els.globalLibreFolderField.hidden = !libre;
  [
    els.globalBookTypeInput,
    els.globalNivelInput,
    els.globalGradoInput,
    els.globalTrimestreInput,
  ].forEach((input) => input?.closest("label")?.toggleAttribute("hidden", libre));
  els.globalTemplateModal.dataset.workflowFormat = libre ? "libre" : "en_forma";
}

function openGlobalTemplateModal() {
  const session = store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea un análisis antes de editar los datos globales.");
    return;
  }
  seedGlobalTemplateModalFromSession(session);
  state.globalTemplateModalOpen = true;
  renderGlobalTemplateModal();
  window.requestAnimationFrame(() => els.globalBookTypeInput?.focus());
}

function closeGlobalTemplateModal() {
  state.globalTemplateModalOpen = false;
  renderGlobalTemplateModal();
}

async function handleSaveGlobalTemplateData() {
  const currentSession = store.getActiveSession();
  if (!currentSession) return;
  const config = collectGlobalTemplateConfigFromDom();
  const nextSession = mutateActiveSession((draft) => {
    const currentInfo = draft.bibliographicInfo || {};
    draft.sourceType = config.sourceType;
    draft.workflowFormat = config.workflowFormat;
    draft.languageCode = config.languageCode;
    if (config.bookName) draft.customTitle = config.bookName;
    draft.bibliographicInfo = {
      ...currentInfo,
      bookType: config.bookType,
      nivel: config.nivel,
      grado: config.grado,
      trimestre: config.trimestre,
      edicionNumero: config.edicionNumero,
      revisionNumero: config.revisionNumero,
      // Unidad y rol son deliberadamente individuales y nunca se pisan aquí.
      unidad: currentInfo.unidad || "",
      recortableRole: currentInfo.recortableRole || "source",
    };
    for (const revision of Array.isArray(draft.revisions) ? draft.revisions : []) {
      if (config.revisionNumero) revision.revisionNumero = config.revisionNumero;
      revision.title = buildRevisionTitle(revision);
      revision.revisionKey = buildRevisionKey(revision);
      revision.updatedAt = new Date().toISOString();
    }
    draft.title = draft.customTitle || buildDerivedSessionTitle(draft);
    draft.sessionKey = buildSessionKey(getSessionBaseInfo(draft));
    draft.updatedAt = new Date().toISOString();
    return draft;
  }, { render: false });
  if (!nextSession) return;

  if (els.globalTemplateSaveBtn) els.globalTemplateSaveBtn.disabled = true;
  try {
    const saved = await saveSession(nextSession);
    store.upsertSession(saved);
    store.setActiveSession(saved.id);
    syncPersistedTitleMap();
    closeGlobalTemplateModal();
    renderAll({ preserveResultsRail: true });
    updateResultsRailEntriesForSession(saved);
    setJobMetaText("Datos globales actualizados en todas las fichas editoriales.");
  } finally {
    if (els.globalTemplateSaveBtn) els.globalTemplateSaveBtn.disabled = false;
  }
}

async function handleCreateDefaultRevisions(config = null) {
  let session = state.pendingNewSession || store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea una sesión antes de generar fichas base.");
    return;
  }
  const normalizedConfig = config || collectDefaultRevisionsConfigFromDom();
  const pendingFolderFiles = Array.from(state.pendingNewSessionFiles || []);
  const missing = validateDefaultRevisionsConfig(normalizedConfig);
  if (missing.length) {
    setJobMetaText(`Faltan datos para crear fichas base: ${missing.join(", ")}.`);
    return;
  }
  if (state.pendingNewSession) {
    const pending = structuredClone(state.pendingNewSession);
    pending.sourceType = "idml";
    pending.workflowFormat = normalizedConfig.workflowFormat;
    pending.languageCode = normalizedConfig.languageCode;
    pending.customTitle = normalizedConfig.bookName;
    pending.title = normalizedConfig.bookName || pending.title;
    pending.bibliographicInfo = {
      ...(pending.bibliographicInfo || {}),
      bookType: normalizedConfig.bookType || "",
      nivel: normalizedConfig.nivel || "",
      grado: normalizedConfig.grado || "",
      trimestre: normalizedConfig.trimestre || "",
      edicionNumero: normalizedConfig.edicionNumero || "",
      revisionNumero: normalizedConfig.revisionNumero || "F1",
    };
    session = await saveSession(pending);
    store.upsertSession(session);
    store.setActiveSession(session.id);
    state.pendingNewSession = null;
    if (normalizedConfig.workflowFormat === "libre") {
      closeDefaultRevisionsModal();
      renderAll();
      setJobMetaText("Sesión Libre creada. Importando los archivos IDML seleccionados...");
      await importLibreFolder(pendingFolderFiles);
      return;
    }
  }
  const blueprints = buildDefaultRevisionBlueprints(normalizedConfig);
  const added = [];
  const nextSession = mutateActiveSession((draft) => {
    draft.sourceType = "idml";
    draft.bibliographicInfo = {
      ...(draft.bibliographicInfo || {}),
      bookType: normalizedConfig.bookType || "",
      nivel: normalizedConfig.nivel || "",
      grado: normalizedConfig.grado || "",
      trimestre: normalizedConfig.trimestre || "",
      edicionNumero: normalizedConfig.edicionNumero || "",
      revisionNumero: normalizedConfig.revisionNumero || "F1",
      unidad: draft.bibliographicInfo?.unidad || "Proyecto",
      recortableRole: draft.bibliographicInfo?.recortableRole || "source",
    };
    draft.revisions = Array.isArray(draft.revisions) ? draft.revisions : [];
    const existingKeys = new Set(draft.revisions.map((revision) => buildRevisionKey(revision)).filter(Boolean));
    for (const blueprint of blueprints) {
      const revisionKey = buildRevisionKey(blueprint);
      if (existingKeys.has(revisionKey)) {
        continue;
      }
      const revision = createDraftRevision(draft);
      revision.revisionKey = revisionKey;
      revision.unidad = blueprint.unidad;
      revision.revisionNumero = blueprint.revisionNumero;
      revision.recortableRole = shouldShowRecortableRole(blueprint.unidad)
        ? normalizeRecortableRole(blueprint.recortableRole, blueprint.unidad)
        : "source";
      revision.title = buildRevisionTitle(revision);
      revision.updatedAt = new Date().toISOString();
      draft.revisions.push(revision);
      existingKeys.add(revisionKey);
      added.push(revision);
    }
    if (added.length) {
      draft.bibliographicInfo.unidad = added[0].unidad || draft.bibliographicInfo.unidad || "";
      draft.bibliographicInfo.revisionNumero = added[0].revisionNumero || draft.bibliographicInfo.revisionNumero || "";
      draft.bibliographicInfo.recortableRole = added[0].recortableRole || draft.bibliographicInfo.recortableRole || "source";
    }
    return draft;
  }, { render: false });
  if (!nextSession) return;
  if (added.length) {
    state.activeRevisionId = String(added[0]?.id || "").trim();
    state.activeFileId = "";
  }
  const saved = await saveSession(nextSession);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  syncPersistedTitleMap();
  closeDefaultRevisionsModal();
  renderAll();
  setJobMetaText(added.length
    ? `Fichas base creadas: ${added.length}.`
    : "Las fichas base ya existían; no se duplicaron.");
  if (pendingFolderFiles.length) {
    setJobMetaText("Fichas base creadas. Asignando los IDML de la carpeta Collect...");
    await importCollectFolder(pendingFolderFiles);
  }
}

function upsertRevisionIntoSession(session = null, filesToMerge = []) {
  const draft = structuredClone(session || {});
  const defaultMapping = resolveDefaultMappingForSession(draft);
  const { session: nextSession, revision, addedFiles, activeFileId } = upsertRevisionInSession({
    session: draft,
    activeRevisionId: state.activeRevisionId,
    revisionInfo: getRevisionDraftInfo(draft),
    filesToMerge,
    defaultMapping,
    getNormalizedSourceType,
    buildRevisionKey,
    buildRevisionTitle,
    buildFileKey,
    buildRevisionSummary,
  });
  state.activeRevisionId = String(revision?.id || "").trim();
  state.activeFileId = activeFileId;
  return { session: nextSession, revision, addedFiles };
}

function resolveSessionForPersistence(session = null, filesToMerge = []) {
  const draft = structuredClone(session || {});
  removeRecortableSourceFileContamination(draft);
  normalizeSingleFilePerRevision(draft);
  const derivedTitle = buildDerivedSessionTitle(draft);
  draft.title = String(draft.customTitle || "").trim() || derivedTitle;
  draft.sessionKey = buildSessionKey(getSessionBaseInfo(draft));
  const currentId = String(draft?.id || "").trim();
  const savedTitleForCurrentId = String(state.persistedTitlesBySessionId[currentId] || "").trim();
  if (!String(draft.customTitle || "").trim() && savedTitleForCurrentId && savedTitleForCurrentId !== derivedTitle) {
    draft.id = "";
    draft.createdAt = "";
    draft.analysisStatus = "idle";
    draft.analysisJobId = "";
  }
  const nextSession = upsertRevisionIntoSession(draft, filesToMerge).session;
  normalizeSingleFilePerRevision(nextSession);
  return nextSession;
}

async function persistActiveSession(filesToMerge = [], options = {}) {
  const session = store.getActiveSession();
  if (!session) throw new Error("No hay sesión activa.");
  const includeAnalysis = options?.includeAnalysis === true;
  logAnalizarPdfFlow("persistActiveSession:start", {
    sessionId: session?.id || "",
    activeRevisionId: state.activeRevisionId || "",
    activeFileId: state.activeFileId || "",
    filesToMerge: Array.isArray(filesToMerge) ? filesToMerge : [],
  });
  const candidate = resolveSessionForPersistence(session, filesToMerge);
  const previousId = String(session.id || "").trim();
  logAnalizarPdfFlow("persistActiveSession:candidate", {
    previousId,
    candidateId: candidate?.id || "",
    revisionCount: Array.isArray(candidate?.revisions) ? candidate.revisions.length : 0,
  });
  const saved = await saveSession(candidate, { includeAnalysis });
  logAnalizarPdfFlow("persistActiveSession:saved", {
    previousId,
    savedId: saved?.id || "",
    revisionCount: Array.isArray(saved?.revisions) ? saved.revisions.length : 0,
  });
  if (previousId && previousId !== saved.id) {
    state.sessions = state.sessions.filter((entry) => String(entry?.id || "").trim() !== previousId);
    removeLocalAnalysisSession(previousId);
  }
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  ensureActiveRevisionAndFile(saved);
  syncPersistedTitleMap();
  renderAll({ preserveResultsRail: options?.preserveResultsRail === true });
  return saved;
}

async function saveActiveSessionSnapshot(options = {}) {
  const session = store.getActiveSession();
  if (!session) throw new Error("No hay sesión activa.");
  await persistLocalAnalysisSession(session);
  const saved = session;
  if (options.render === true) {
    renderAll();
  }
  return saved;
}

async function persistDurableAnalysisSnapshot(options = {}) {
  const session = store.getActiveSession();
  if (!session) return { session: null, remoteSaved: false };
  await persistLocalAnalysisSession(session);
  if (options.remote === false) return { session, remoteSaved: false };
  try {
    const saved = await saveSession(session, { includeAnalysis: true });
    catalogOnlySessionIds.delete(String(saved?.id || session.id || "").trim());
    store.upsertSession(saved);
    store.setActiveSession(saved.id);
    ensureActiveRevisionAndFile(saved);
    syncPersistedTitleMap();
    persistSessionCatalog(state.currentUser, state.sessions);
    await persistLocalAnalysisSession(saved);
    return { session: saved, remoteSaved: true };
  } catch (error) {
    logAnalizarPdfFlow("analysisSnapshot:remote-save-failed", {
      sessionId: session?.id || "",
      reason: String(options?.reason || "analysis-completed"),
      message: String(error?.message || error),
    });
    return { session, remoteSaved: false, error };
  }
}

function buildTemplateMappingTitle(revision = null) {
  return [
    "Plantilla",
    String(revision?.unidad || "").trim(),
    String(revision?.revisionNumero || "").trim(),
  ].filter(Boolean).join(" · ") || "Plantilla desde archivo";
}

async function createTemplateMappingForRevisionFile(session = null, revision = null, file = null, options = {}) {
  if (!session || !revision || !file) {
    throw new Error("Selecciona una ficha editorial con archivo IDML.");
  }
  if (!isIdmlFileEntry(file, session)) {
    throw new Error("La creación de plantilla solo aplica a sesiones IDML.");
  }
  if (!hasAvailableIdmlSource(file)) {
    throw new Error("No hay copia local/backend del IDML; vuelve a seleccionar el archivo en esa ficha.");
  }
  setBusyOverlay(buildEditorialProcessLabel(session, revision, file, {
    action: "Creando plantilla",
    step: "Resolviendo fuente IDML",
    index: options?.index || 0,
    total: options?.total || 0,
  }));
  await flushUiFrame();
  const source = await resolveIdmlSourceForTool(file);
  if (!source.file && !source.useStoredSource) {
    throw new Error("No se encontró la copia local/backend del IDML; vuelve a seleccionar el archivo en esa ficha.");
  }
  setBusyOverlay(buildEditorialProcessLabel(session, revision, file, {
    action: "Creando plantilla",
    step: "Extrayendo estilos usados",
    index: options?.index || 0,
    total: options?.total || 0,
  }));
  await flushUiFrame();
  const payload = await createAnalizarPdfIdmlTemplateFromFile(session.id, revision.id, file.id, {
    file: source.file,
    useStoredSource: source.useStoredSource,
    fileName: file.documentName || source.file?.name || "documento.idml",
    mappingId: file.mappingId || revision.mappingId || "",
  });
  const template = payload?.template || {};
  const entries = buildMappingTemplateEntries(Array.isArray(template.entries) ? template.entries : []);
  if (!entries.length) {
    throw new Error("No se encontraron estilos usados en el IDML seleccionado.");
  }
  const group = options?.group || null;
  const existingMapping = options?.existingMapping ? normalizeStyleMapping(options.existingMapping) : null;
  setBusyOverlay(buildEditorialProcessLabel(session, revision, file, {
    action: "Creando plantilla",
    step: existingMapping?.id ? "Actualizando mapeo existente" : "Guardando mapeo nuevo",
    index: options?.index || 0,
    total: options?.total || 0,
  }));
  await flushUiFrame();
  const mappingDraft = normalizeStyleMapping({
    ...(existingMapping || {}),
    id: existingMapping?.id || "",
    mappingSlug: existingMapping?.mappingSlug || "",
    title: buildTemplateMappingTitle(revision),
    bookType: session?.bibliographicInfo?.bookType || "",
    nivel: session?.bibliographicInfo?.nivel || "",
    grado: session?.bibliographicInfo?.grado || "",
    unidad: revision?.unidad || session?.bibliographicInfo?.unidad || "",
    groupId: group?.id || "",
    groupTitle: group?.title || "",
    isActive: false,
    entries,
  });
  const savedMappingPayload = await saveAnalizarPdfStyleMapping(mappingDraft);
  const savedMapping = mergeSavedMappingWithDraft(savedMappingPayload?.mapping || savedMappingPayload || {}, mappingDraft);
  upsertStyleMappingInState(savedMapping);
  return {
    payload,
    entries,
    savedMapping,
  };
}

function applyTemplateMappingToRevisionFile(draft = null, revisionId = "", fileId = "", savedMapping = null, sourceAssetPath = "") {
  const draftRevision = (draft?.revisions || []).find((entry) => entry.id === revisionId);
  if (!draftRevision) return;
  draftRevision.mappingId = savedMapping?.id || "";
  draftRevision.mappingTitle = savedMapping?.title || "";
  draftRevision.mappingUpdatedAt = savedMapping?.updatedAt || "";
  for (const draftFile of Array.isArray(draftRevision.files) ? draftRevision.files : []) {
    draftFile.mappingId = savedMapping?.id || "";
    draftFile.mappingTitle = savedMapping?.title || "";
    draftFile.mappingUpdatedAt = savedMapping?.updatedAt || "";
    if (draftFile.id === fileId && sourceAssetPath) {
      draftFile.sourceAssetPath = sourceAssetPath;
    }
    if (draftFile.id === fileId) {
      draftFile.updatedAt = new Date().toISOString();
    }
  }
}

async function handleCreateTemplateFromFile() {
  let session = store.getActiveSession();
  if (session) {
    session = await persistActiveSession([]);
  }
  const revision = getActiveRevision(session);
  const file = getActiveFile(session, revision);
  if (!session || !revision || !file) {
    setJobMetaText("Selecciona una ficha editorial con archivo IDML.");
    return;
  }
  if (!isIdmlFileEntry(file, session)) {
    setJobMetaText("La creación de plantilla solo aplica a sesiones IDML.");
    return;
  }
  if (!hasAvailableIdmlSource(file)) {
    setJobMetaText("No hay copia backend del IDML para crear plantilla. Vuelve a seleccionar y analiza esa ficha para guardar la fuente local.");
    return;
  }
  try {
    state.isCreatingTemplateFromFile = true;
    setBusyOverlay(buildEditorialProcessLabel(session, revision, file, {
      action: "Creando plantilla",
      step: "Preparando extracción de estilos",
    }));
    renderActionButtonState();
    await flushUiFrame();
    const { payload, entries, savedMapping } = await createTemplateMappingForRevisionFile(session, revision, file);
    const nextSession = mutateActiveSession((draft) => {
      applyTemplateMappingToRevisionFile(draft, revision.id, file.id, savedMapping, payload?.sourceAssetPath || "");
      return draft;
    }, { render: false });
    if (nextSession) {
      const savedSession = await saveSession(nextSession);
      store.upsertSession(savedSession);
      store.setActiveSession(savedSession.id);
      ensureActiveRevisionAndFile(savedSession);
    }
    setJobMetaText(`Plantilla creada: ${savedMapping.title || "Plantilla"} (${entries.length} estilos usados).`);
    renderAll();
  } catch (error) {
    setJobMetaText(formatIdmlToolError(error));
  } finally {
    state.isCreatingTemplateFromFile = false;
    setBusyOverlay("");
    renderActionButtonState();
    renderAll();
  }
}

async function buildTemplateCreationTargets(session = null) {
  const targets = [];
  const skipped = [];
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      if (!isIdmlFileEntry(file, session)) {
        skipped.push({ revisionId: revision?.id || "", fileId: file?.id || "", unidad: revision?.unidad || "", documentName: file?.documentName || "", reason: "not-idml" });
        continue;
      }
      if (!hasAvailableIdmlSource(file)) {
        skipped.push({ revisionId: revision?.id || "", fileId: file?.id || "", unidad: revision?.unidad || "", documentName: file?.documentName || "", reason: "missing-source" });
        continue;
      }
      const source = await resolveIdmlSourceForTool(file);
      if (source.file || source.useStoredSource) {
        targets.push({ revision, file });
      } else {
        skipped.push({ revisionId: revision?.id || "", fileId: file?.id || "", unidad: revision?.unidad || "", documentName: file?.documentName || "", reason: "unresolved-source" });
      }
    }
  }
  logAnalizarPdfFlow("buildTemplateCreationTargets:resolved", {
    targetCount: targets.length,
    targets: targets.map((target) => ({
      revisionId: target.revision?.id || "",
      fileId: target.file?.id || "",
      unidad: target.revision?.unidad || "",
      documentName: target.file?.documentName || "",
    })),
    skipped,
  });
  return targets;
}

async function handleCreateTemplatesFromAll(options = {}) {
  if (state.isCreatingTemplatesFromAll) return;
  let session = store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea una sesión antes de crear plantillas.");
    return;
  }
  const preserveResultsRail = options?.preserveResultsRail === true;
  session = await persistActiveSession([], { preserveResultsRail });
  const targets = await buildTemplateCreationTargets(session);
  if (!targets.length) {
    setJobMetaText("No hay fichas editoriales con IDML local/backend disponible para crear plantillas.");
    return;
  }
  await refreshStyleMappings(state.activeMappingId);
  const group = getOrCreateMappingGroup(buildTemplateGroupTitle(session));
  const failures = [];
  const created = [];
  const updated = [];
  try {
    state.isCreatingTemplatesFromAll = true;
    setBusyOverlay("Creando plantillas desde todas las fichas");
    renderActionButtonState();
    await flushUiFrame();
    let workingSession = session;
    for (let index = 0; index < targets.length; index += 1) {
      const { revision, file } = targets[index];
      setBusyOverlay(buildEditorialProcessLabel(workingSession, revision, file, {
        action: "Creando plantilla",
        step: "Preparando ficha",
        index: index + 1,
        total: targets.length,
      }));
      setJobMetaText(`Creando plantilla ${index + 1}/${targets.length}: ${revision.title || revision.unidad || "Ficha editorial"}`);
      await flushUiFrame();
      try {
        const existingMapping = findExistingTemplateMappingForRevision(workingSession, revision, group);
        const { payload, entries, savedMapping } = await createTemplateMappingForRevisionFile(workingSession, revision, file, {
          group,
          existingMapping,
          index: index + 1,
          total: targets.length,
        });
        if (existingMapping?.id) {
          updated.push(savedMapping);
        } else {
          created.push(savedMapping);
        }
        const nextSession = mutateActiveSession((draft) => {
          applyTemplateMappingToRevisionFile(draft, revision.id, file.id, savedMapping, payload?.sourceAssetPath || "");
          return draft;
        }, { render: false });
        if (nextSession) {
          workingSession = nextSession;
          persistLocalAnalysisSession(nextSession);
        }
        logAnalizarPdfFlow("createTemplatesFromAll:created", {
          revisionId: revision.id,
          fileId: file.id,
          mappingId: savedMapping.id,
          entryCount: entries.length,
          groupId: group.id,
        });
      } catch (error) {
        failures.push(`${revision.title || revision.unidad || "Ficha editorial"}: ${formatIdmlToolError(error)}`);
      }
    }
    if (workingSession) {
      const savedSession = await saveSession(workingSession);
      store.upsertSession(savedSession);
      store.setActiveSession(savedSession.id);
      ensureActiveRevisionAndFile(savedSession);
    }
    await refreshStyleMappings(created[0]?.id || updated[0]?.id || state.activeMappingId);
    setJobMetaText([
      `Plantillas creadas: ${created.length}. Actualizadas: ${updated.length}/${targets.length}.`,
      `Grupo: ${group.title}.`,
      failures.length ? `Fallos: ${failures.slice(0, 6).join(" ")}` : "",
    ].filter(Boolean).join(" "));
    renderAll({ preserveResultsRail });
  } finally {
    state.isCreatingTemplatesFromAll = false;
    setBusyOverlay("");
    renderActionButtonState();
    renderAll({ preserveResultsRail });
  }
}

async function buildQuickAnalysisTargets(session = null, selectedRevisionIds = null) {
  const targets = [];
  const frozenSelectedRevisionIds = Array.isArray(selectedRevisionIds)
    ? new Set(selectedRevisionIds.map((value) => String(value || "").trim()).filter(Boolean))
    : null;
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    const revisionId = String(revision?.id || "").trim();
    if (frozenSelectedRevisionIds && !frozenSelectedRevisionIds.has(revisionId)) continue;
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
      if (!frozenSelectedRevisionIds && file?.analysisSelected === false) continue;
      if (!hasAvailableIdmlSource(file)) {
        continue;
      }
      if (!isIdmlFileEntry(file, session)) {
        continue;
      }
      const source = await resolveIdmlSourceForTool(file);
      if (source.file || source.useStoredSource) {
        targets.push({
          revision,
          file,
          selectedFile: source.file,
          useStoredSource: source.useStoredSource,
        });
      }
    }
  }
  return targets;
}

function buildQuickAnalysisFromFullResult(file = null) {
  const pageReports = Array.isArray(file?.result?.stats?.pageReports) ? file.result.stats.pageReports : [];
  const executedCategories = file?.result?.stats?.analysisCategories;
  if (!pageReports.length || executedCategories?.orthotypography === false) return null;
  const pages = pageReports
    .map((page) => ({
      pageName: String(page?.pageName || "").trim(),
      issues: (Array.isArray(page?.orthotypographyIssues) ? page.orthotypographyIssues : []).map((issue) => ({
        ...issue,
        pageName: String(issue?.pageName || page?.pageName || "").trim(),
        paragraphText: String(issue?.paragraphText || issue?.context || "").trim(),
      })),
    }))
    .filter((page) => page.pageName && page.issues.length);
  return {
    ok: true,
    status: "completed",
    sourceType: "idml",
    source: "full-analysis-reuse",
    orthotypographyIssueCount: pages.reduce((total, page) => total + page.issues.length, 0),
    pageCount: pageReports.length,
    pages,
    generatedAt: new Date().toISOString(),
    durationMs: 0,
  };
}

async function handleQuickAnalyzeAll(options = {}) {
  if (state.isQuickAnalyzingAll) return;
  const session = store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea una sesión antes de ejecutar el análisis rápido.");
    return;
  }
  const hasIdmlFile = (Array.isArray(session?.revisions) ? session.revisions : []).some((revision) => {
    return (Array.isArray(revision?.files) ? revision.files : []).some((file) => isIdmlFileEntry(file, session));
  });
  if (!hasIdmlFile) {
    setJobMetaText("El análisis rápido ortotipográfico solo aplica a sesiones IDML.");
    return;
  }
  const requestedRevisionId = String(options?.revisionId || "").trim();
  const requestedFileId = String(options?.fileId || "").trim();
  const selectedRevisionIds = Array.isArray(options?.selectedRevisionIds)
    ? options.selectedRevisionIds
    : (Array.isArray(session?.revisions) ? session.revisions : []).filter((revision) => {
      const files = Array.isArray(revision?.files) ? revision.files : [];
      return files.length && files.every((file) => file?.analysisSelected !== false);
    }).map((revision) => String(revision?.id || "").trim()).filter(Boolean);
  const allTargets = await buildQuickAnalysisTargets(session, selectedRevisionIds);
  const targets = allTargets.filter(({ revision, file }) => (
    (!requestedRevisionId || String(revision?.id || "").trim() === requestedRevisionId)
    && (!requestedFileId || String(file?.id || "").trim() === requestedFileId)
  ));
  const missing = buildMissingLocalSourceNoticeFromSession(session);
  if (!targets.length) {
    setJobMetaText(missing || "No hay copias backend de IDML disponibles para análisis rápido.");
    return;
  }
  const failures = [];
  const keepMagicSpriteAlive = options?.keepMagicSpriteAlive === true;
  let magicSpriteToken = String(options?.magicSpriteToken || "").trim();
  try {
    state.isQuickAnalyzingAll = true;
    setBusyOverlay("Preparando análisis rápido ortotipográfico");
    renderActionButtonState();
    await flushUiFrame();
    for (let index = 0; index < targets.length; index += 1) {
      const { revision, file, selectedFile, useStoredSource } = targets[index];
      const spriteContext = {
        revisionId: revision?.id || "",
        fileId: file?.id || "",
        revision,
        file,
      };
      magicSpriteToken = activeAnalysisSprites.has(magicSpriteToken)
        ? retargetAnalysisSprite(magicSpriteToken, spriteContext)
        : startAnalysisSprite(spriteContext);
      setBusyOverlay(buildEditorialProcessLabel(session, revision, file, {
        action: "Análisis rápido",
        step: useStoredSource ? "Leyendo copia guardada" : "Preparando IDML local",
        index: index + 1,
        total: targets.length,
      }));
      setJobMetaText(`Analizando rápido ${index + 1}/${targets.length}: ${revision.title || revision.unidad || "Ficha editorial"}`);
      await flushUiFrame();
      try {
        setBusyOverlay(buildEditorialProcessLabel(session, revision, file, {
          action: "Análisis rápido",
          step: "Buscando hallazgos ortotipográficos",
          index: index + 1,
          total: targets.length,
        }));
        await flushUiFrame();
        const reusedQuickAnalysis = buildQuickAnalysisFromFullResult(file);
        const payload = reusedQuickAnalysis ? { quickAnalysis: reusedQuickAnalysis } : await runAnalizarPdfQuickOrthotypography(session.id, revision.id, file.id, {
          file: selectedFile,
          useStoredSource,
          fileName: file.documentName || selectedFile?.name || "documento.idml",
          mappingId: file.mappingId || revision.mappingId || "",
        });
        const quickAnalysis = payload?.quickAnalysis || null;
        if (!quickAnalysis) {
          throw new Error("Respuesta rápida vacía.");
        }
        setBusyOverlay(buildEditorialProcessLabel(session, revision, file, {
          action: "Análisis rápido",
          step: "Guardando reporte rápido en la ficha",
          index: index + 1,
          total: targets.length,
        }));
        await flushUiFrame();
        const next = mutateActiveSession((draft) => {
          const draftRevision = (draft.revisions || []).find((entry) => entry.id === revision.id);
          const draftFile = draftRevision?.files?.find((entry) => entry.id === file.id);
          if (draftFile) {
            draftFile.quickAnalysis = quickAnalysis;
            if (payload?.sourceAssetPath) {
              draftFile.sourceAssetPath = payload.sourceAssetPath;
            }
            draftFile.updatedAt = new Date().toISOString();
          }
          return draft;
        }, { render: false });
        if (next) {
          await persistLocalAnalysisSession(next);
          resultsRenderer.updateRailEntry(
            buildRenderableSession(next),
            String(revision?.id || "").trim(),
            String(file?.id || "").trim()
          );
          resultsRailRenderSignature = buildResultsRailRenderSignature(next);
        }
        // La ficha y el rail se actualizan al finalizar la fase. Evitar un render
        // global por archivo conserva el mismo personaje durante búsqueda y guardado.
        renderActionButtonState();
      } catch (error) {
        failures.push(`${revision.title || revision.unidad || "Ficha editorial"}: ${formatIdmlToolError(error)}`);
      }
    }
    const analyzedCount = targets.length - failures.length;
    const durableSnapshot = await persistDurableAnalysisSnapshot({ reason: "quick-analysis-completed" });
    setJobMetaText([
      `Análisis rápido finalizado: ${analyzedCount}/${targets.length} ficha(s).`,
      durableSnapshot.remoteSaved ? "Resultados guardados." : "Resultados conservados localmente; el guardado remoto queda pendiente.",
      failures.length ? `Fallos: ${failures.slice(0, 6).join(" ")}` : "",
      missing ? `Omitidas: ${missing}` : "",
    ].filter(Boolean).join(" "));
  } finally {
    state.isQuickAnalyzingAll = false;
    setBusyOverlay("");
    renderActionButtonState();
    renderAll({ preserveResultsRail: true });
    if (!keepMagicSpriteAlive) stopAnalysisSprite(magicSpriteToken);
  }
}

async function handleCreateSession() {
  state.selectedFiles = [];
  state.activeRevisionId = "";
  state.activeFileId = "";
  state.busyOverlayLabel = "";
  window.clearTimeout(state.analysisPollTimer);
  state.analysisPollTimer = 0;
  if (els.fileInput) {
    els.fileInput.value = "";
  }
  state.jobMetaText = "";
  state.jobMetaSessionId = "";
  setJobMetaText("");
  const session = createEmptyAnalizarPdfSession();
  session.revisions = [];
  state.pendingNewSession = session;
  state.pendingNewSessionFiles = [];
  state.pendingCreateFolderSelection = false;
  state.activeRevisionId = "";
  state.activeFileId = "";
  openDefaultRevisionsModal();
}

async function handleCreateRevision() {
  const session = store.getActiveSession();
  if (!session) {
    return;
  }
  state.selectedFiles = [];
  if (els.fileInput) {
    els.fileInput.value = "";
  }
  const nextSession = mutateActiveSession((draft) => {
    draft.revisions = Array.isArray(draft.revisions) ? draft.revisions : [];
    const draftRevision = createDraftRevision(draft);
    draft.revisions.push(draftRevision);
    draft.bibliographicInfo.unidad = "";
    draft.bibliographicInfo.revisionNumero = "";
    return draft;
  }, { render: false });
  if (!nextSession) {
    return;
  }
  state.activeRevisionId = String(nextSession.revisions?.[nextSession.revisions.length - 1]?.id || "").trim();
  state.activeFileId = "";
  const saved = await saveSession(nextSession);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  ensureActiveRevisionAndFile(saved);
  syncPersistedTitleMap();
  renderAll();
}

function handleSelectSession(sessionId = "") {
  store.setActiveSession(sessionId);
  ensureActiveRevisionAndFile(store.getActiveSession());
  renderAll();
  void refreshActiveSessionDetail(sessionId);
}

async function handleRenameSession(sessionId = "", requestedTitle = "") {
  const cleanSessionId = String(sessionId || "").trim();
  const cleanTitle = String(requestedTitle || "").trim();
  const current = state.sessions.find((session) => String(session?.id || "").trim() === cleanSessionId) || null;
  if (!current || !cleanTitle || cleanTitle === String(current.title || "").trim()) return current;
  const previous = structuredClone(current);
  const next = structuredClone(current);
  next.title = cleanTitle;
  next.customTitle = cleanTitle;
  next.updatedAt = new Date().toISOString();
  store.upsertSession(next);
  syncPersistedTitleMap();
  renderAll();
  try {
    const saved = await saveSession(next);
    store.upsertSession(saved);
    syncPersistedTitleMap();
    persistSessionCatalog(state.currentUser, state.sessions);
    persistLocalAnalysisSession(saved);
    renderAll();
    return saved;
  } catch (error) {
    store.upsertSession(previous);
    syncPersistedTitleMap();
    renderAll();
    setJobMetaText(String(error?.message || error));
    return previous;
  }
}

async function handleDeleteSession(sessionId = "") {
  if (!window.confirm("¿Eliminar esta sesión?")) return;
  await import("./analizar-pdf-api.js").then(({ deleteAnalizarPdfSession }) => deleteAnalizarPdfSession(sessionId));
  await deleteAnalizarPdfCachedFilesBySession(sessionId).catch(() => {});
  removeLocalAnalysisSession(sessionId);
  store.setSessions(state.sessions.filter((session) => session.id !== sessionId));
  if (state.activeSessionId === sessionId) {
    state.activeSessionId = state.sessions[0]?.id || "";
  }
  renderAll();
}

async function handleDeleteRevision(revisionId = "") {
  const cleanRevisionId = String(revisionId || "").trim();
  const session = store.getActiveSession();
  if (!cleanRevisionId || !session) return;
  const revision = (Array.isArray(session.revisions) ? session.revisions : []).find((entry) => entry.id === cleanRevisionId) || null;
  if (!revision) return;
  if (!window.confirm("¿Eliminar esta ficha editorial?")) return;
  for (const file of Array.isArray(revision.files) ? revision.files : []) {
    const localBlobKey = String(file?.localBlobKey || "").trim();
    if (localBlobKey) {
      await deleteAnalizarPdfCachedFile(localBlobKey).catch(() => {});
    }
  }
  const nextSession = structuredClone(session);
  nextSession.revisions = (nextSession.revisions || []).filter((entry) => entry.id !== cleanRevisionId);
  const nextActiveRevision = nextSession.revisions[0] || null;
  state.activeRevisionId = String(nextActiveRevision?.id || "").trim();
  state.activeFileId = String(nextActiveRevision?.files?.[0]?.id || "").trim();
  if (!nextActiveRevision) {
    state.selectedFiles = [];
    if (els.fileInput) {
      els.fileInput.value = "";
    }
  }
  const saved = await saveSession(nextSession);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  ensureActiveRevisionAndFile(saved);
  syncPersistedTitleMap();
  renderAll();
}

function collectRevisionTimelineRects() {
  if (!els.revisionList) return new Map();
  return new Map([...els.revisionList.querySelectorAll(".analizar-pdf-revision-timeline-card[data-revision-id]")]
    .map((card) => [String(card.dataset.revisionId || "").trim(), card.getBoundingClientRect()]));
}

function updateRevisionFileTab(card = null, index = 0) {
  const tab = card?.querySelector?.(".analizar-pdf-revision-file-tab");
  if (!tab) return;
  const textNode = [...tab.childNodes].find((node) => node.nodeType === 3);
  if (textNode) {
    textNode.nodeValue = ` Archivo ${index + 1}`;
    return;
  }
  tab.append(document.createTextNode(` Archivo ${index + 1}`));
}

function syncRevisionTimelineDomOrder(revisions = []) {
  if (!els.revisionList) return false;
  const orderedRevisions = Array.isArray(revisions) ? revisions : [];
  const cardsById = new Map([...els.revisionList.querySelectorAll(".analizar-pdf-revision-timeline-card[data-revision-id]")]
    .map((card) => [String(card.dataset.revisionId || "").trim(), card]));
  const slots = [...els.revisionList.querySelectorAll(".analizar-pdf-revision-insert-slot")];
  if (cardsById.size !== orderedRevisions.length || slots.length !== orderedRevisions.length + 1) return false;

  const desiredNodes = [];
  orderedRevisions.forEach((revision, index) => {
    const revisionId = String(revision?.id || "").trim();
    const card = cardsById.get(revisionId);
    const slot = slots[index];
    if (!card || !slot) return;
    slot.dataset.insertIndex = String(index);
    slot.querySelector("[data-insert-index]")?.setAttribute("data-insert-index", String(index));
    card.dataset.timelineIndex = String(index + 1);
    updateRevisionFileTab(card, index);
    desiredNodes.push(slot, card);
  });
  const finalSlot = slots[orderedRevisions.length];
  if (desiredNodes.length !== orderedRevisions.length * 2 || !finalSlot) return false;
  finalSlot.dataset.insertIndex = String(orderedRevisions.length);
  finalSlot.querySelector("[data-insert-index]")?.setAttribute("data-insert-index", String(orderedRevisions.length));
  desiredNodes.push(finalSlot);

  let cursor = els.revisionList.firstElementChild;
  for (const node of desiredNodes) {
    if (node === cursor) {
      cursor = cursor.nextElementSibling;
      continue;
    }
    els.revisionList.insertBefore(node, cursor);
  }
  state.revisionTimelineSignature = orderedRevisions.map((revision) => String(revision?.id || "")).join("|");
  state.revisionTimelineRevealPending = false;
  return true;
}

function animateRevisionTimelineReorder(previousRects = new Map()) {
  if (!els.revisionList || prefersReducedRevisionMotion() || typeof Element.prototype.animate !== "function") return;
  window.requestAnimationFrame(() => {
    for (const card of els.revisionList.querySelectorAll(".analizar-pdf-revision-timeline-card[data-revision-id]")) {
      const previousRect = previousRects.get(String(card.dataset.revisionId || "").trim());
      if (!previousRect) continue;
      const nextRect = card.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;
      card.animate([
        { translate: `${deltaX}px ${deltaY}px` },
        { translate: "0 0" },
      ], {
        duration: 320,
        easing: "cubic-bezier(.2,.85,.25,1)",
      });
    }
  });
}

function refreshRevisionOrderViews(session = null, options = {}) {
  const previousRects = options.animate === false ? new Map() : collectRevisionTimelineRects();
  if (!syncRevisionTimelineDomOrder(session?.revisions || [])) {
    renderRevisionList(session);
    return false;
  }
  renderSavedAnalysisSelector(session);
  renderResultsWithRailAnimations(buildRenderableSession(session));
  persistLocalAnalysisSession(session);
  if (options.animate !== false) animateRevisionTimelineReorder(previousRects);
  return true;
}

async function persistRevisionOrderWithoutFullRender(nextSession = null, previousSession = null, activeRevisionId = "") {
  store.upsertSession(nextSession);
  store.setActiveSession(nextSession.id);
  state.activeRevisionId = String(activeRevisionId || "").trim();
  ensureActiveRevisionAndFile(nextSession);
  syncPersistedTitleMap();
  refreshRevisionOrderViews(nextSession);
  try {
    const saved = await saveSession(nextSession);
    store.upsertSession(saved);
    store.setActiveSession(saved.id);
    ensureActiveRevisionAndFile(saved);
    syncPersistedTitleMap();
    refreshRevisionOrderViews(saved, { animate: false });
    return saved;
  } catch (error) {
    if (previousSession) {
      store.upsertSession(previousSession);
      store.setActiveSession(previousSession.id);
      ensureActiveRevisionAndFile(previousSession);
      syncPersistedTitleMap();
      refreshRevisionOrderViews(previousSession);
    }
    throw error;
  }
}

async function handleMoveRevision(revisionId = "", direction = "") {
  const cleanRevisionId = String(revisionId || "").trim();
  const cleanDirection = String(direction || "").trim();
  const session = store.getActiveSession();
  if (!cleanRevisionId || !session || !Array.isArray(session.revisions)) return;
  const currentIndex = session.revisions.findIndex((entry) => entry.id === cleanRevisionId);
  if (currentIndex < 0) return;
  const targetIndex = cleanDirection === "up"
    ? currentIndex - 1
    : cleanDirection === "down"
      ? currentIndex + 1
      : -1;
  if (targetIndex < 0 || targetIndex >= session.revisions.length) return;
  const nextSession = structuredClone(session);
  const [movedRevision] = nextSession.revisions.splice(currentIndex, 1);
  nextSession.revisions.splice(targetIndex, 0, movedRevision);
  await persistRevisionOrderWithoutFullRender(nextSession, session, cleanRevisionId);
}

async function handleReorderRevision(draggedRevisionId = "", targetRevisionId = "") {
  const sourceId = String(draggedRevisionId || "").trim();
  const targetId = String(targetRevisionId || "").trim();
  const session = store.getActiveSession();
  if (!sourceId || !targetId || sourceId === targetId || !session || !Array.isArray(session.revisions)) return;
  const sourceIndex = session.revisions.findIndex((entry) => entry.id === sourceId);
  const targetIndex = session.revisions.findIndex((entry) => entry.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const nextSession = structuredClone(session);
  const [movedRevision] = nextSession.revisions.splice(sourceIndex, 1);
  nextSession.revisions.splice(targetIndex, 0, movedRevision);
  await persistRevisionOrderWithoutFullRender(nextSession, session, sourceId);
}

function clearRevisionDragState() {
  state.draggedRevisionId = "";
  if (!els.revisionList) return;
  for (const node of els.revisionList.querySelectorAll(".analizar-pdf-subrecord-card.is-dragging, .analizar-pdf-subrecord-card.is-drop-target")) {
    node.classList.remove("is-dragging", "is-drop-target");
  }
}

function mutateActiveSession(mutator, options = {}) {
  const session = store.getActiveSession();
  if (!session) return null;
  const next = typeof mutator === "function" ? mutator(structuredClone(session)) : session;
  store.upsertSession(next);
  if (options.render !== false) {
    renderAll();
  }
  return next;
}

async function persistEditorialSelectionChange(mutator) {
  const nextSession = mutateActiveSession(mutator, { render: false });
  if (nextSession) {
    renderBibliographicInfo(nextSession);
  }
  try {
    await persistActiveSession([]);
  } catch (error) {
    setJobMetaText(String(error?.message || error));
    renderAll();
  }
}

function upsertStyleMappingInState(raw = {}) {
  const next = normalizeStyleMapping(raw);
  const mappings = Array.isArray(state.styleMappings) ? [...state.styleMappings] : [];
  const existingIndex = mappings.findIndex((entry) => entry.id === next.id && next.id);
  if (existingIndex >= 0) {
    mappings.splice(existingIndex, 1, next);
  } else if (next.id) {
    mappings.push(next);
  }
  state.styleMappings = mappings.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  state.activeMappingId = String(next.id || state.activeMappingId || "").trim();
  state.activeMappingGroupId = getMappingGroupIdForMapping(next);
  return next;
}

function mergeSavedMappingWithDraft(savedRaw = {}, draftRaw = {}) {
  const saved = normalizeStyleMapping(savedRaw);
  const draft = normalizeStyleMapping(draftRaw);
  const draftEntriesById = new Map((draft.entries || []).map((entry) => [entry.id, entry]));
  return normalizeStyleMapping({
    ...saved,
    groupId: saved.groupId || draft.groupId || "",
    groupTitle: saved.groupTitle || draft.groupTitle || "",
    entries: (saved.entries || []).map((entry) => {
      const draftEntry = draftEntriesById.get(entry.id);
      if (!draftEntry) return entry;
      return {
        ...entry,
        pageScope: entry.pageScope || draftEntry.pageScope || "both",
        targetPage: String(entry.targetPage || "").trim() || String(draftEntry.targetPage || "").trim(),
        excludeTargetPage: String(entry.excludeTargetPage || "").trim() || String(draftEntry.excludeTargetPage || "0").trim() || "0",
      };
    }),
  });
}

function getCurrentMappingDraft() {
  if (state.__mappingDraft && (!state.activeMappingId || state.__mappingDraft.id === state.activeMappingId)) {
    return normalizeStyleMapping(state.__mappingDraft);
  }
  return getActiveMapping() || createEmptyMappingDraft();
}

function collectCurrentMappingDraftFromDom() {
  const base = getCurrentMappingDraft();
  if (!els.mappingsModal || els.mappingsModal.hidden) {
    return normalizeStyleMapping(base);
  }
  const entries = Array.from(els.mappingEntriesList?.querySelectorAll("[data-entry-id]") || []).map((row, entryIndex) => normalizeMappingEntry({
    id: String(row.dataset.entryId || "").trim() || `mapping_entry_${entryIndex + 1}`,
    alias: row.querySelector('[data-field="alias"]')?.value || "",
    styleKind: row.querySelector('[data-field="styleKind"]')?.value || "paragraph",
    styleName: row.querySelector('[data-field="styleName"]')?.value || "",
    pageScope: row.querySelector('[data-field="pageScope"]')?.value || "both",
    targetPage: row.querySelector('[data-field="targetPage"]')?.value || "",
    excludeTargetPage: row.querySelector('[data-field="excludeTargetPage"]')?.value || "0",
    enabled: row.querySelector('[data-field="enabled"]')?.checked === true,
  }, entryIndex));
  return normalizeStyleMapping({
    ...base,
    title: String(els.mappingTitleInput?.value || base.title || "").trim(),
    bookType: String(els.mappingBookTypeInput?.value || base.bookType || "").trim(),
    nivel: String(els.mappingNivelInput?.value || base.nivel || "").trim(),
    grado: String(els.mappingGradoInput?.value || base.grado || "").trim(),
    unidad: String(els.mappingUnidadInput?.value || base.unidad || "").trim(),
    entries,
  });
}

function updateCurrentMappingEntryDraftFromEvent(event) {
  const row = event.target.closest("[data-entry-id]");
  if (!row) return;
  const field = String(event.target.dataset.field || "").trim();
  const entryId = String(row.dataset.entryId || "").trim();
  if (!field || !entryId) return;
  const next = getCurrentMappingDraft();
  next.entries = (next.entries || []).map((entry) => {
    if (entry.id !== entryId) return entry;
    if (field === "enabled") {
      return { ...entry, enabled: event.target.checked };
    }
    return { ...entry, [field]: String(event.target.value || "").trim() };
  });
  state.__mappingDraft = normalizeStyleMapping(next);
}

function getRailActionTooltipElement() {
  let tooltip = document.getElementById("analizarPdfRailActionTooltip");
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = "analizarPdfRailActionTooltip";
  tooltip.className = "analizar-pdf-global-action-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("popover", "manual");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function hideRailActionTooltip() {
  const tooltip = document.getElementById("analizarPdfRailActionTooltip");
  activeRailActionTooltipTrigger?.removeAttribute("aria-describedby");
  activeRailActionTooltipTrigger = null;
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  if (typeof tooltip.hidePopover === "function" && tooltip.matches(":popover-open")) {
    tooltip.hidePopover();
  }
  tooltip.hidden = true;
}

function showRailActionTooltip(trigger = null) {
  if (!(trigger instanceof Element) || !trigger.matches([
    ".analizar-pdf-ortho-rail-head .analizar-pdf-rail-selection-toggle[data-tooltip]",
    ".analizar-pdf-ortho-rail .analizar-pdf-rail-file-title[data-tooltip]",
  ].join(", "))) return;
  const label = String(trigger.getAttribute("data-tooltip") || "").trim();
  if (!label) return;
  const tooltip = getRailActionTooltipElement();
  activeRailActionTooltipTrigger?.removeAttribute("aria-describedby");
  activeRailActionTooltipTrigger = trigger;
  trigger.setAttribute("aria-describedby", tooltip.id);
  tooltip.textContent = label;
  tooltip.hidden = false;
  if (typeof tooltip.showPopover === "function" && !tooltip.matches(":popover-open")) {
    tooltip.showPopover();
  }
  tooltip.classList.remove("is-visible");
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportPadding = 8;
  const centeredLeft = triggerRect.left + ((triggerRect.width - tooltipRect.width) / 2);
  const left = Math.min(
    window.innerWidth - tooltipRect.width - viewportPadding,
    Math.max(viewportPadding, centeredLeft)
  );
  const belowTop = triggerRect.bottom + 8;
  const aboveTop = triggerRect.top - tooltipRect.height - 8;
  const preferAbove = trigger.matches(".analizar-pdf-rail-file-title");
  const top = preferAbove && aboveTop >= viewportPadding
    ? aboveTop
    : belowTop + tooltipRect.height <= window.innerHeight - viewportPadding
      ? belowTop
      : Math.max(viewportPadding, aboveTop);
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.classList.add("is-visible");
}

function bindRailActionTooltips() {
  const findTrigger = (target) => target instanceof Element
    ? target.closest([
      ".analizar-pdf-ortho-rail-head .analizar-pdf-rail-selection-toggle[data-tooltip]",
      ".analizar-pdf-ortho-rail .analizar-pdf-rail-file-title[data-tooltip]",
    ].join(", "))
    : null;
  document.addEventListener("pointerover", (event) => {
    const trigger = findTrigger(event.target);
    if (!trigger || (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget))) return;
    showRailActionTooltip(trigger);
  });
  document.addEventListener("pointerout", (event) => {
    const trigger = findTrigger(event.target);
    if (!trigger || (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget))) return;
    hideRailActionTooltip();
  });
  document.addEventListener("focusin", (event) => showRailActionTooltip(findTrigger(event.target)));
  document.addEventListener("focusout", (event) => {
    if (findTrigger(event.target)) hideRailActionTooltip();
  });
  document.addEventListener("click", hideRailActionTooltip, { capture: true });
  window.addEventListener("resize", hideRailActionTooltip, { passive: true });
}

function bindQuickDetailPanelResize() {
  const panel = els.quickDetailPanel;
  const handle = els.quickDetailResizeHandle;
  if (!panel || !handle) return;
  const storageKey = "analizar-pdf-quick-detail-size-v2";
  const clampSize = (width, height) => {
    const rect = panel.getBoundingClientRect();
    const maxWidth = Math.max(320, Math.min(760, window.innerWidth - 48));
    const maxHeight = Math.max(260, window.innerHeight - rect.top - 12);
    return {
      width: Math.min(maxWidth, Math.max(320, Math.round(width))),
      height: Math.min(maxHeight, Math.max(260, Math.round(height))),
    };
  };
  const applySize = (width, height, persist = false) => {
    const next = clampSize(width, height);
    panel.style.setProperty("--ap-quick-detail-width", `${next.width}px`);
    panel.style.setProperty("--ap-quick-detail-height", `${next.height}px`);
    if (persist) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (_) {}
    }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (Number.isFinite(saved?.width) && Number.isFinite(saved?.height)) applySize(saved.width, saved.height);
  } catch (_) {}

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startRect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    panel.classList.add("is-resizing");
    handle.setPointerCapture?.(event.pointerId);
    const onPointerMove = (moveEvent) => {
      applySize(startRect.width + (startX - moveEvent.clientX), startRect.height + (moveEvent.clientY - startY));
    };
    const onPointerUp = () => {
      panel.classList.remove("is-resizing");
      const finalRect = panel.getBoundingClientRect();
      applySize(finalRect.width, finalRect.height, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
  });

  handle.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const step = event.shiftKey ? 48 : 16;
    const width = rect.width + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0);
    const height = rect.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0);
    applySize(width, height, true);
  });
}

function bindEditorEvents() {
  bindRailActionTooltips();
  bindQuickDetailPanelResize();
  document.addEventListener("click", (event) => {
    if (!els.quickDetailPanel?.classList.contains("is-visible")) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || els.quickDetailPanel.contains(target) || target.closest(".analizar-pdf-ortho-link") || target.closest("#analizarPdfFullPageTextModal") || target.closest("#analizarPdfAnalysisRulesModal")) return;
    resultsRenderer.closeQuickDetail();
  });
  els.themeToggleBtn?.addEventListener("click", cycleAnalizarPdfTheme);
  if (els.heroSessionTitle && els.heroSessionTitleInput) {
    const beginSessionTitleEdit = () => {
      const session = store.getActiveSession();
      if (!session) return;
      const visibleTitleWidth = Math.ceil(els.heroSessionTitle.getBoundingClientRect().width);
      if (els.heroSessionTitleContainer && visibleTitleWidth > 0) {
        els.heroSessionTitleContainer.style.setProperty("--ap-hero-session-edit-width", `${visibleTitleWidth}px`);
        els.heroSessionTitleContainer.classList.add("is-editing");
      }
      els.heroSessionTitleInput.value = String(session.title || "").trim();
      els.heroSessionTitleInput.dataset.originalTitle = String(session.title || "").trim();
      els.heroSessionTitle.hidden = true;
      els.heroSessionTitleInput.hidden = false;
      els.heroSessionTitleInput.focus();
      els.heroSessionTitleInput.select();
    };
    const finishSessionTitleEdit = () => {
      if (els.heroSessionTitleInput.hidden) return;
      const cancelled = els.heroSessionTitleInput.dataset.cancelEdit === "true";
      const originalTitle = String(els.heroSessionTitleInput.dataset.originalTitle || "").trim();
      const nextTitle = String(els.heroSessionTitleInput.value || "").trim() || originalTitle || "Sesión sin título";
      delete els.heroSessionTitleInput.dataset.cancelEdit;
      delete els.heroSessionTitleInput.dataset.originalTitle;
      els.heroSessionTitleInput.hidden = true;
      els.heroSessionTitle.hidden = false;
      if (els.heroSessionTitleContainer) {
        els.heroSessionTitleContainer.classList.remove("is-editing");
        els.heroSessionTitleContainer.style.removeProperty("--ap-hero-session-edit-width");
      }
      if (els.heroSessionTitleText) {
        els.heroSessionTitleText.textContent = cancelled ? originalTitle : nextTitle;
      }
      if (!cancelled && nextTitle !== originalTitle) {
        void handleRenameSession(state.activeSessionId, nextTitle);
      }
    };
    els.heroSessionTitle.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".analizar-pdf-hero-session-edit-icon")) return;
      event.preventDefault();
      event.stopPropagation();
      beginSessionTitleEdit();
    });
    els.heroSessionTitle.addEventListener("dblclick", beginSessionTitleEdit);
    els.heroSessionTitle.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      beginSessionTitleEdit();
    });
    els.heroSessionTitleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        els.heroSessionTitleInput.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        els.heroSessionTitleInput.dataset.cancelEdit = "true";
        els.heroSessionTitleInput.blur();
      }
    });
    els.heroSessionTitleInput.addEventListener("blur", finishSessionTitleEdit);
  }
  if (els.toggleEditorialBtn && els.editorialPanel) {
    els.toggleEditorialBtn.addEventListener("click", () => {
      const isCollapsed = els.editorialPanel.classList.toggle("is-collapsed");
      els.toggleEditorialBtn.classList.toggle("is-collapsed", isCollapsed);
      els.toggleEditorialBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      const label = isCollapsed ? "Mostrar ficha editorial" : "Ocultar ficha editorial";
      els.toggleEditorialBtn.setAttribute("aria-label", label);
      els.toggleEditorialBtn.setAttribute("title", label);
      safeLocalStorageSet("cb_editorial_panel_collapsed", isCollapsed ? "true" : "false");
    });
  }

  els.indexPageInput.addEventListener("change", () => {
    mutateActiveSession((session) => {
      session.indexConfig.indexPageNumber = Number(els.indexPageInput.value || 0) || 0;
      return session;
    });
  });

  if (els.temarioPageInput) {
    els.temarioPageInput.addEventListener("change", () => {
      mutateActiveSession((session) => {
        session.indexConfig.temarioPageNumber = Number(els.temarioPageInput.value || 0) || 0;
        return session;
      });
    });
  }

  if (els.sourceType) {
    els.sourceType.addEventListener("change", () => {
      const sourceType = getNormalizedSourceType(els.sourceType.value);
      const nextSession = mutateActiveSession((session) => {
        session.sourceType = sourceType;
        return session;
      });
      syncFileInputForSession(nextSession);
      renderAll();
    });
  }

  const bibliographicFieldMap = [
    ["bookType", els.bookTypeInput],
    ["nivel", els.nivelInput],
    ["grado", els.gradoInput],
    ["trimestre", els.trimestreInput],
    ["unidad", els.unidadInput],
    ["edicionNumero", els.edicionNumeroInput],
    ["revisionNumero", els.revisionNumeroInput]
  ];

  bibliographicFieldMap.forEach(([field, element]) => {
    if (!element) return;
    element.addEventListener("change", async () => {
      const shouldPersistImmediately = field === "unidad" || field === "revisionNumero";
      const runner = shouldPersistImmediately ? persistEditorialSelectionChange : async (mutator) => {
        const nextSession = mutateActiveSession(mutator);
        renderBibliographicInfo(nextSession || store.getActiveSession());
      };
      await runner((session) => {
        const activeRevision = getActiveRevision(session);
        const nextValue = String(element.value || "").trim();
        if (field === "unidad" || field === "revisionNumero") {
          if (activeRevision) {
            if (field === "unidad") {
              activeRevision.unidad = nextValue;
              const currentUnidad = String(activeRevision.unidad || "").trim();
              if (shouldShowRecortableRole(currentUnidad)) {
                const nextRole = resolveBibliographicRecortableRole(session, activeRevision);
                activeRevision.recortableRole = normalizeRecortableRole(nextRole, currentUnidad);
                session.bibliographicInfo.recortableRole = activeRevision.recortableRole;
              } else {
                delete activeRevision.recortableRole;
                session.bibliographicInfo.recortableRole = "source";
              }
            } else {
              activeRevision.revisionNumero = nextValue;
            }
            activeRevision.title = buildRevisionTitle({
              unidad: activeRevision.unidad,
              revisionNumero: activeRevision.revisionNumero,
            });
          }
          session.bibliographicInfo[field] = nextValue;
        } else {
          session.bibliographicInfo[field] = nextValue;
        }
        session.title = session.customTitle || buildDerivedSessionTitle(session);
        session.sessionKey = buildSessionKey(getSessionBaseInfo(session));
        return session;
      });
    });
  });

  if (els.recortableRoleInput) {
    els.recortableRoleInput.addEventListener("change", async () => {
      await persistEditorialSelectionChange((session) => {
        const activeRevision = getActiveRevision(session);
        const unidad = String(activeRevision?.unidad || session?.bibliographicInfo?.unidad || "").trim();
        const nextRole = normalizeRecortableRole(els.recortableRoleInput.value, unidad);
        session.bibliographicInfo.recortableRole = nextRole || "source";
        if (!activeRevision || !shouldShowRecortableRole(unidad)) {
          return session;
        }
        activeRevision.recortableRole = nextRole;
        return session;
      });
    });
  }

  if (els.sessionTitleLabel) {
    els.sessionTitleLabel.addEventListener("change", () => {
      const value = String(els.sessionTitleLabel.value || "").trim();
      if (!value) return;
      const [revisionId, fileId] = value.split("::");
      state.activeRevisionId = String(revisionId || "").trim();
      state.activeFileId = String(fileId || "").trim();
      const revision = getActiveRevision(store.getActiveSession());
      if (revision) {
        mutateActiveSession((session) => {
          session.bibliographicInfo.unidad = revision.unidad || session.bibliographicInfo.unidad;
          session.bibliographicInfo.revisionNumero = revision.revisionNumero || session.bibliographicInfo.revisionNumero;
          session.bibliographicInfo.recortableRole = resolveBibliographicRecortableRole(session, revision);
          return session;
        });
        rehydrateSelectedFilesForActiveContext().catch(() => {});
        return;
      }
      renderAll();
      rehydrateSelectedFilesForActiveContext().catch(() => {});
    });
  }

  els.revisionList?.addEventListener("click", async (event) => {
    const analysisSelectionButton = event.target.closest('button[data-action="toggle-analysis-selection"]');
    if (analysisSelectionButton) {
      event.preventDefault();
      event.stopPropagation();
      if (analysisSelectionButton.disabled || state.isAnalyzingAll || state.isAnalyzingCurrent || state.isQuickAnalyzingAll) return;
      const revisionId = String(analysisSelectionButton.dataset.revisionId || "").trim();
      const analysisSelected = analysisSelectionButton.getAttribute("aria-checked") !== "true";
      const selectionVersion = (Number(state.cardAnalysisSelectionVersion) || 0) + 1;
      state.cardAnalysisSelectionVersion = selectionVersion;
      const nextSession = mutateActiveSession((draft) => {
        const revision = (draft.revisions || []).find((entry) => String(entry?.id || "") === revisionId);
        for (const file of revision?.files || []) file.analysisSelected = analysisSelected;
        draft.updatedAt = new Date().toISOString();
        return draft;
      });
      if (nextSession) saveSession(nextSession).then((saved) => {
        if (state.cardAnalysisSelectionVersion !== selectionVersion) return;
        store.upsertSession(saved);
        renderAll({ preserveResultsRail: true });
      }).catch((error) => setJobMetaText(String(error?.message || error)));
      return;
    }
    const insertButton = event.target.closest('[data-action="open-insert-revision"]');
    if (insertButton) {
      openInsertRevisionModal(Number(insertButton.dataset.insertIndex || 0));
      return;
    }
    const moveUpButton = event.target.closest('[data-action="move-revision-up"]');
    if (moveUpButton) {
      const revisionId = String(moveUpButton.dataset.revisionId || "").trim();
      handleMoveRevision(revisionId, "up").catch((error) => {
        setJobMetaText(String(error?.message || error));
      });
      return;
    }
    const moveDownButton = event.target.closest('[data-action="move-revision-down"]');
    if (moveDownButton) {
      const revisionId = String(moveDownButton.dataset.revisionId || "").trim();
      handleMoveRevision(revisionId, "down").catch((error) => {
        setJobMetaText(String(error?.message || error));
      });
      return;
    }
    const analyzeRevisionButton = event.target.closest('[data-action="analyze-revision"]');
    if (analyzeRevisionButton) {
      event.preventDefault();
      event.stopPropagation();
      if (analyzeRevisionButton.disabled || state.isAnalyzingCurrent || state.isAnalyzingAll || state.isSavingSession) {
        return;
      }
      const revisionId = String(analyzeRevisionButton.dataset.revisionId || "").trim();
      const currentSession = store.getActiveSession();
      const selectedRevision = (Array.isArray(currentSession?.revisions) ? currentSession.revisions : [])
        .find((entry) => String(entry?.id || "").trim() === revisionId) || null;
      if (!selectedRevision) return;
      const selectedFile = (Array.isArray(selectedRevision.files) ? selectedRevision.files : [])
        .find((file) => String(file?.id || "").trim() === String(state.activeFileId || "").trim())
        || selectedRevision.files?.[0]
        || null;
      state.activeRevisionId = revisionId;
      state.activeFileId = String(selectedFile?.id || "").trim();
      state.selectedFiles = [];
      if (els.fileInput) {
        els.fileInput.value = "";
      }
      mutateActiveSession((session) => {
        session.bibliographicInfo.unidad = selectedRevision.unidad || "";
        session.bibliographicInfo.revisionNumero = selectedRevision.revisionNumero || "";
        session.bibliographicInfo.recortableRole = resolveBibliographicRecortableRole(session, selectedRevision);
        return session;
      }, { render: false });
      renderActiveSession({ preserveResultsRail: true });
      try {
        await rehydrateSelectedFilesForActiveContext({ preserveResultsRail: true });
        els.analyzeBtn?.click();
      } catch (error) {
        setJobMetaText(String(error?.message || error));
      }
      return;
    }
    const deleteButton = event.target.closest('[data-action="delete-revision"]');
    if (deleteButton) {
      const revisionId = String(deleteButton.dataset.revisionId || "").trim();
      handleDeleteRevision(revisionId).catch((error) => {
        setJobMetaText(String(error?.message || error));
      });
      return;
    }
    const button = event.target.closest("[data-revision-id]");
    if (!button) return;
    const revisionId = String(button.dataset.revisionId || "").trim();
    if (!revisionId) return;
    const currentSession = store.getActiveSession();
    const selectedRevision = (Array.isArray(currentSession?.revisions) ? currentSession.revisions : [])
      .find((entry) => String(entry?.id || "").trim() === revisionId) || null;
    const selectedFile = (Array.isArray(selectedRevision?.files) ? selectedRevision.files : [])
      .find((file) => String(file?.id || "").trim() === String(state.activeFileId || "").trim())
      || selectedRevision?.files?.[0]
      || null;
    const selectedFileId = String(selectedFile?.id || "").trim();
    state.activeRevisionId = revisionId;
    state.activeFileId = selectedFileId;
    state.selectedFiles = [];
    if (els.fileInput) {
      els.fileInput.value = "";
    }
    const revision = getActiveRevision(store.getActiveSession());
    if (revision) {
      mutateActiveSession((session) => {
        session.bibliographicInfo.unidad = revision.unidad || "";
        session.bibliographicInfo.revisionNumero = revision.revisionNumero || "";
        session.bibliographicInfo.recortableRole = resolveBibliographicRecortableRole(session, revision);
        return session;
      }, { render: false });
      renderActiveSession({ preserveResultsRail: true });
      resultsRenderer.toggleFileRailGroup(revisionId, selectedFileId);
      rehydrateSelectedFilesForActiveContext({ preserveResultsRail: true }).catch(() => {});
      return;
    }
    renderActiveSession({ preserveResultsRail: true });
    resultsRenderer.toggleFileRailGroup(revisionId, selectedFileId);
    rehydrateSelectedFilesForActiveContext({ preserveResultsRail: true }).catch(() => {});
  });

  els.revisionList?.addEventListener("dragstart", (event) => {
    if (event.target.closest('.analizar-pdf-card-analysis-check')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const card = event.target.closest(".analizar-pdf-subrecord-card[data-revision-id]");
    if (!card) return;
    const revisionId = String(card.dataset.revisionId || "").trim();
    if (!revisionId) return;
    state.draggedRevisionId = revisionId;
    card.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", revisionId);
    }
  });

  els.revisionList?.addEventListener("dragover", (event) => {
    const card = event.target.closest(".analizar-pdf-subrecord-card[data-revision-id]");
    if (!card) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    const targetRevisionId = String(card.dataset.revisionId || "").trim();
    const draggedRevisionId = String(state.draggedRevisionId || "").trim();
    for (const node of els.revisionList.querySelectorAll(".analizar-pdf-subrecord-card.is-drop-target")) {
      node.classList.remove("is-drop-target");
    }
    if (targetRevisionId && draggedRevisionId && targetRevisionId !== draggedRevisionId) {
      card.classList.add("is-drop-target");
    }
  });

  els.revisionList?.addEventListener("drop", (event) => {
    const card = event.target.closest(".analizar-pdf-subrecord-card[data-revision-id]");
    if (!card) return;
    event.preventDefault();
    const targetRevisionId = String(card.dataset.revisionId || "").trim();
    const draggedRevisionId = String(state.draggedRevisionId || "").trim();
    clearRevisionDragState();
    handleReorderRevision(draggedRevisionId, targetRevisionId).catch((error) => {
      setJobMetaText(String(error?.message || error));
    });
  });

  els.revisionList?.addEventListener("dragend", () => {
    clearRevisionDragState();
  });

  els.addRevisionBtn?.addEventListener("click", async () => {
    await handleCreateRevision();
  });

  els.createDefaultRevisionsBtn?.addEventListener("click", () => {
    openDefaultRevisionsModal();
  });

  els.editGlobalTemplateBtn?.addEventListener("click", () => {
    openGlobalTemplateModal();
  });

  els.globalTemplateModal?.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="close-global-template-modal"]')) {
      closeGlobalTemplateModal();
    }
  });

  els.globalTemplateModal?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.globalTemplateModalOpen) {
      event.preventDefault();
      closeGlobalTemplateModal();
      els.editGlobalTemplateBtn?.focus();
    }
  });

  els.globalTemplateForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSaveGlobalTemplateData().catch((error) => {
      setJobMetaText(String(error?.message || error));
    });
  });

  els.defaultRevisionsModal?.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="close-default-revisions-modal"]')) {
      closeDefaultRevisionsModal();
    }
  });
  els.defaultFolderBtn?.addEventListener("click", () => {
    state.pendingCreateFolderSelection = true;
    els.folderInput?.click();
  });

  [
    els.defaultSourceTypeInput,
    els.defaultWorkflowFormatInput,
    els.defaultLanguageInput,
    els.defaultBookNameInput,
    els.defaultBookTypeInput,
    els.defaultNivelInput,
    els.defaultGradoInput,
    els.defaultTrimestreInput,
    els.defaultEdicionNumeroInput,
    els.defaultRevisionNumeroInput,
    els.defaultUnitCountInput,
  ].forEach((element) => {
    element?.addEventListener("change", () => renderDefaultRevisionsModal());
  });

  els.defaultRevisionsConfirmBtn?.addEventListener("click", () => {
    handleCreateDefaultRevisions(collectDefaultRevisionsConfigFromDom()).catch((error) => {
      setJobMetaText(String(error?.message || error));
    });
  });

  els.insertRevisionModal?.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="close-insert-revision-modal"]')) {
      closeInsertRevisionModal();
    }
  });

  els.insertRevisionForm?.addEventListener("submit", (event) => {
    handleInsertRevisionSubmit(event).catch((error) => {
      setInsertRevisionError(String(error?.message || error));
    });
  });

  els.insertRevisionFile?.addEventListener("change", () => {
    const file = els.insertRevisionFile?.files?.[0] || null;
    if (els.insertRevisionFileName) {
      els.insertRevisionFileName.textContent = file?.name || "Ningún archivo seleccionado";
    }
    setInsertRevisionError(file && !/\.idml$/i.test(String(file.name || ""))
      ? "El archivo debe tener extensión .idml."
      : "");
  });

  els.chooseFolderBtn?.addEventListener("click", () => {
    if (state.isImportingCollectFolder || state.isAnalyzingCurrent || state.isAnalyzingAll) {
      return;
    }
    if (!store.getActiveSession()) {
      setJobMetaText("Crea una sesión antes de elegir la carpeta Collect.");
      return;
    }
    els.folderInput?.click();
  });

  els.toggleCardSelectionBtn?.addEventListener("click", () => {
    if (state.isAnalyzingAll || state.isAnalyzingCurrent || state.isQuickAnalyzingAll) return;
    state.cardAnalysisSelectionMode = !state.cardAnalysisSelectionMode;
    els.toggleCardSelectionBtn.setAttribute("aria-pressed", String(state.cardAnalysisSelectionMode));
    renderAll({ preserveResultsRail: true });
  });
  els.selectAllCardsBtn?.addEventListener("click", () => {
    if (state.isAnalyzingAll || state.isAnalyzingCurrent || state.isQuickAnalyzingAll) return;
    const session = store.getActiveSession();
    const allSelected = (session?.revisions || []).every((revision) => (revision.files || []).every((file) => file?.analysisSelected !== false));
    const nextSession = mutateActiveSession((draft) => {
      for (const revision of draft.revisions || []) for (const file of revision.files || []) file.analysisSelected = !allSelected;
      draft.updatedAt = new Date().toISOString();
      return draft;
    });
    if (nextSession) saveSession(nextSession).then((saved) => { store.upsertSession(saved); renderAll({ preserveResultsRail: true }); }).catch((error) => setJobMetaText(String(error?.message || error)));
  });
  els.globalWorkflowFormatInput?.addEventListener("change", renderGlobalTemplateModal);
  els.globalLibreFolderBtn?.addEventListener("click", () => {
    if (els.globalWorkflowFormatInput) els.globalWorkflowFormatInput.value = "libre";
    handleSaveGlobalTemplateData().then(() => els.folderInput?.click()).catch((error) => setJobMetaText(String(error?.message || error)));
  });

  els.folderInput?.addEventListener("change", () => {
    if (collectFolderImportPromise) return;
    const selectedFolderFiles = Array.from(els.folderInput?.files || []);
    if (state.pendingCreateFolderSelection && state.defaultRevisionsModalOpen) {
      state.pendingCreateFolderSelection = false;
      state.pendingNewSessionFiles = selectedFolderFiles;
      const idmlCount = selectedFolderFiles.filter((file) => /\.idml$/i.test(String(file?.name || ""))).length;
      if (els.defaultFolderSummary) els.defaultFolderSummary.textContent = idmlCount ? `${idmlCount} archivo(s) IDML listos para cargar.` : "La carpeta no contiene archivos IDML.";
      if (els.folderInput) els.folderInput.value = "";
      renderDefaultRevisionsModal();
      return;
    }
    state.isImportingCollectFolder = true;
    setBusyOverlay("Asignando todos los IDML de la carpeta Collect");
    setJobMetaText("Preparando fichas. Analizar todo comenzará cuando termine la asignación.");
    renderActionButtonState();
    const activeSession = store.getActiveSession();
    const importPromise = activeSession?.workflowFormat === "libre"
      ? importLibreFolder(selectedFolderFiles)
      : importCollectFolder(selectedFolderFiles);
    collectFolderImportPromise = importPromise;
    importPromise.catch((error) => {
      setJobMetaText(String(error?.message || error));
    }).finally(() => {
      if (collectFolderImportPromise === importPromise) {
        collectFolderImportPromise = null;
      }
      state.isImportingCollectFolder = false;
      setBusyOverlay("");
      if (els.folderInput) els.folderInput.value = "";
      renderActionButtonState();
      renderAll({ preserveResultsRail: true });
    });
  });

  els.createTemplateFromFileBtn?.addEventListener("click", () => {
    handleCreateTemplateFromFile().catch((error) => {
      setJobMetaText(String(error?.message || error));
    });
  });

  els.createTemplatesFromAllBtn?.addEventListener("click", () => {
    handleCreateTemplatesFromAll().catch((error) => {
      setJobMetaText(String(error?.message || error));
    });
  });

  els.quickAnalyzeAllBtn?.addEventListener("click", () => {
    handleQuickAnalyzeAll().catch((error) => {
      setJobMetaText(String(error?.message || error));
    });
  });

  els.fileList?.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="select-file"]');
    if (!button) return;
    state.activeFileId = String(button.dataset.fileId || "").trim();
    state.selectedFiles = [];
    if (els.fileInput) {
      els.fileInput.value = "";
    }
    renderAll();
    rehydrateSelectedFilesForActiveContext().catch(() => {});
  });

  els.revisionMappingSelect?.addEventListener("change", (event) => {
    const select = event.target.closest("#analizarPdfRevisionMappingSelect");
    if (!select) return;
    const mappingId = String(select.value || "").trim();
    const mapping = (Array.isArray(state.styleMappings) ? state.styleMappings : []).find((entry) => entry.id === mappingId) || null;
    mutateActiveSession((session) => {
      const revision = getActiveRevision(session);
      if (!revision) {
        return session;
      }
      revision.mappingId = mappingId;
      revision.mappingTitle = mapping?.title || "";
      revision.mappingUpdatedAt = mapping?.updatedAt || "";
      for (const file of revision.files || []) {
        file.mappingId = mappingId;
        file.mappingTitle = mapping?.title || "";
        file.mappingUpdatedAt = mapping?.updatedAt || "";
      }
      return session;
    });
  });

  const handleAddSection = () => {
    mutateActiveSession((session) => {
      const nextIndex = (session.indexConfig.sections?.length || 0) + 1;
      session.indexConfig.sections = [
        ...(session.indexConfig.sections || []),
        { id: `section_${Date.now()}_${nextIndex}`, title: "", expectedPageNumber: 0 }
      ];
      return session;
    });
  };

  els.addSectionButtons.forEach((button) => {
    button.addEventListener("click", handleAddSection);
  });

  els.sectionsList?.addEventListener("input", (event) => {
    const row = event.target.closest("[data-section-id]");
    if (!row) return;
    const sectionId = row.dataset.sectionId;
    const field = event.target.dataset.field;
    mutateActiveSession((session) => {
      session.indexConfig.sections = (session.indexConfig.sections || []).map((entry) => {
        if (entry.id !== sectionId) return entry;
        return {
          ...entry,
          [field]: field === "expectedPageNumber"
            ? Number(event.target.value || 0) || 0
            : String(event.target.value || "")
        };
      });
      return session;
    }, { render: false });
  });

  els.sectionsList?.addEventListener("click", (event) => {
    const removeBtn = event.target.closest('[data-action="remove-section"]');
    if (!removeBtn) return;
    const row = removeBtn.closest("[data-section-id]");
    if (!row) return;
    mutateActiveSession((session) => {
      session.indexConfig.sections = (session.indexConfig.sections || []).filter((entry) => entry.id !== row.dataset.sectionId);
      return session;
    });
  });

  els.fileInput.addEventListener("change", () => {
    if (state.isRehydratingFileSelection) {
      return;
    }
    state.selectedFiles = Array.from(els.fileInput.files || []);
    renderActiveSession();
    persistSelectedFilesToActiveRevision().catch((error) => {
      setJobMetaText(String(error?.message || error));
    });
  });

  if (els.mappingsBtn) {
    els.mappingsBtn.addEventListener("click", async () => {
      state.mappingsModalOpen = true;
      if (!state.styleMappings.length) {
        await refreshStyleMappings();
      }
      renderMappingsModal();
    });
  }

  els.mappingsModal?.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="close-mappings-modal"]')) {
      state.mappingsModalOpen = false;
      renderMappingsModal();
    }
  });

  els.exportConfigModal?.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="close-export-config-modal"]')) {
      closeExportConfigModal();
    }
  });

  els.exportConfigModal?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.exportConfigModalOpen) {
      event.preventDefault();
      closeExportConfigModal();
    }
  });

  [els.mappingsBookTypeFilter, els.mappingsNivelFilter, els.mappingsGradoFilter, els.mappingsUnidadFilter].forEach((element) => {
    element?.addEventListener("change", () => renderMappingsModal());
  });

  els.newMappingBtn?.addEventListener("click", () => {
    state.activeMappingId = "";
    const selectedGroupId = String(state.activeMappingGroupId || "").trim();
    const selectedGroupTitle = getMappingGroupTitleById(selectedGroupId);
    state.__mappingDraft = normalizeStyleMapping({
      ...createEmptyMappingDraft(),
      groupId: selectedGroupId && selectedGroupId !== UNGROUPED_MAPPING_GROUP_ID ? selectedGroupId : "",
      groupTitle: selectedGroupId && selectedGroupId !== UNGROUPED_MAPPING_GROUP_ID ? selectedGroupTitle : "",
    });
    renderMappingsModal();
  });

  els.createMappingGroupBtn?.addEventListener("click", () => {
    const group = createMappingGroup(els.mappingGroupTitleInput?.value || "");
    if (els.mappingGroupTitleInput) {
      els.mappingGroupTitleInput.value = "";
    }
    state.activeMappingGroupId = group.id;
    state.activeMappingId = "";
    state.__mappingDraft = null;
    setJobMetaText(`Grupo de plantillas creado: ${group.title}.`);
    renderMappingsModal();
  });

  els.deleteMappingGroupBtn?.addEventListener("click", async () => {
    const groupId = String(state.activeMappingGroupId || "").trim();
    if (!groupId || groupId === UNGROUPED_MAPPING_GROUP_ID) return;
    const group = getMappingGroups().find((entry) => entry.id === groupId) || null;
    if (!group) return;
    const mappingsInGroup = (Array.isArray(state.styleMappings) ? state.styleMappings : [])
      .filter((mapping) => String(mapping?.groupId || "").trim() === groupId);
    const message = mappingsInGroup.length
      ? `¿Eliminar el grupo "${group.title}" y sus ${mappingsInGroup.length} plantilla(s)? Esta acción no se puede deshacer.`
      : `¿Eliminar el grupo "${group.title}"?`;
    if (!window.confirm(message)) return;
    for (const mapping of mappingsInGroup) {
      if (mapping?.id) {
        await deleteAnalizarPdfStyleMapping(mapping.id);
      }
    }
    state.styleMappings = (Array.isArray(state.styleMappings) ? state.styleMappings : [])
      .filter((mapping) => String(mapping?.groupId || "").trim() !== groupId);
    removeMappingGroupFromStorage(groupId);
    state.activeMappingGroupId = "";
    state.activeMappingId = "";
    state.__mappingDraft = null;
    await refreshStyleMappings();
    setJobMetaText(`Grupo de plantillas eliminado: ${group.title}. Plantillas eliminadas: ${mappingsInGroup.length}.`);
  });

  els.mappingGroupsList?.addEventListener("click", (event) => {
    const groupCard = event.target.closest("[data-mapping-group-id]");
    if (!groupCard) return;
    state.activeMappingGroupId = String(groupCard.dataset.mappingGroupId || "").trim();
    state.activeMappingId = "";
    state.__mappingDraft = null;
    renderMappingsModal();
  });

  els.mappingsList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mapping-id]");
    if (!button) return;
    state.activeMappingId = String(button.dataset.mappingId || "").trim();
    state.__mappingDraft = normalizeStyleMapping(getActiveMapping() || {});
    renderMappingsModal();
  });

  els.mappingsList?.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-mapping-id]");
    if (!item) return;
    event.dataTransfer?.setData("text/plain", String(item.dataset.mappingId || "").trim());
    event.dataTransfer?.setData("application/x-analizar-pdf-mapping-id", String(item.dataset.mappingId || "").trim());
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  });

  els.mappingGroupsList?.addEventListener("dragover", (event) => {
    const groupCard = event.target.closest("[data-mapping-group-id]");
    if (!groupCard) return;
    event.preventDefault();
    groupCard.classList.add("is-drag-over");
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });

  els.mappingGroupsList?.addEventListener("dragleave", (event) => {
    const groupCard = event.target.closest("[data-mapping-group-id]");
    if (groupCard) {
      groupCard.classList.remove("is-drag-over");
    }
  });

  els.mappingGroupsList?.addEventListener("drop", async (event) => {
    const groupCard = event.target.closest("[data-mapping-group-id]");
    if (!groupCard) return;
    event.preventDefault();
    groupCard.classList.remove("is-drag-over");
    const mappingId = String(
      event.dataTransfer?.getData("application/x-analizar-pdf-mapping-id")
      || event.dataTransfer?.getData("text/plain")
      || ""
    ).trim();
    const groupId = String(groupCard.dataset.mappingGroupId || "").trim();
    const group = getMappingGroups().find((entry) => entry.id === groupId) || null;
    const mapping = (Array.isArray(state.styleMappings) ? state.styleMappings : []).find((entry) => entry.id === mappingId) || null;
    if (!mapping || !group) return;
    const draft = normalizeStyleMapping({
      ...mapping,
      groupId: group.id,
      groupTitle: group.title,
    });
    const saved = await saveAnalizarPdfStyleMapping(draft);
    const mergedSaved = mergeSavedMappingWithDraft(saved?.mapping || saved || {}, draft);
    upsertStyleMappingInState(mergedSaved);
    state.activeMappingGroupId = group.id;
    setJobMetaText(`Plantilla "${mergedSaved.title}" agregada a ${group.title}.`);
    renderMappingsModal();
  });

  [els.mappingTitleInput, els.mappingBookTypeInput, els.mappingNivelInput, els.mappingGradoInput, els.mappingUnidadInput].forEach((element) => {
    element?.addEventListener("input", () => {
      const next = getCurrentMappingDraft();
      next.title = String(els.mappingTitleInput?.value || "").trim();
      next.bookType = String(els.mappingBookTypeInput?.value || "").trim();
      next.nivel = String(els.mappingNivelInput?.value || "").trim();
      next.grado = String(els.mappingGradoInput?.value || "").trim();
      next.unidad = String(els.mappingUnidadInput?.value || "").trim();
      next.scopeKey = buildMappingScopeKey(next);
      state.__mappingDraft = next;
    });
  });

  els.addMappingEntryBtn?.addEventListener("click", () => {
    const next = getCurrentMappingDraft();
    next.entries = [...(next.entries || []), normalizeMappingEntry({
      id: `mapping_entry_${Date.now()}`,
      alias: "",
      styleKind: "paragraph",
      styleName: "",
      pageScope: "both",
      targetPage: "",
      excludeTargetPage: "0",
      enabled: true
    }, (next.entries || []).length)];
    state.__mappingDraft = next;
    renderMappingsModal();
  });

  els.mappingEntriesList?.addEventListener("input", updateCurrentMappingEntryDraftFromEvent);
  els.mappingEntriesList?.addEventListener("change", updateCurrentMappingEntryDraftFromEvent);

  els.mappingEntriesList?.addEventListener("click", (event) => {
    const moveUpBtn = event.target.closest('[data-action="move-mapping-entry-up"]');
    if (moveUpBtn) {
      const row = moveUpBtn.closest("[data-entry-id]");
      if (!row) return;
      const entryId = String(row.dataset.entryId || "").trim();
      const next = getCurrentMappingDraft();
      const currentIndex = (next.entries || []).findIndex((entry) => entry.id === entryId);
      if (currentIndex <= 0) return;
      const entries = [...(next.entries || [])];
      const [entry] = entries.splice(currentIndex, 1);
      entries.splice(currentIndex - 1, 0, entry);
      next.entries = entries;
      state.__mappingDraft = normalizeStyleMapping(next);
      renderMappingsModal();
      return;
    }
    const moveDownBtn = event.target.closest('[data-action="move-mapping-entry-down"]');
    if (moveDownBtn) {
      const row = moveDownBtn.closest("[data-entry-id]");
      if (!row) return;
      const entryId = String(row.dataset.entryId || "").trim();
      const next = getCurrentMappingDraft();
      const currentIndex = (next.entries || []).findIndex((entry) => entry.id === entryId);
      const entries = [...(next.entries || [])];
      if (currentIndex < 0 || currentIndex >= entries.length - 1) return;
      const [entry] = entries.splice(currentIndex, 1);
      entries.splice(currentIndex + 1, 0, entry);
      next.entries = entries;
      state.__mappingDraft = normalizeStyleMapping(next);
      renderMappingsModal();
      return;
    }
    const removeBtn = event.target.closest('[data-action="remove-mapping-entry"]');
    if (!removeBtn) return;
    const row = removeBtn.closest("[data-entry-id]");
    if (!row) return;
    const next = getCurrentMappingDraft();
    next.entries = (next.entries || []).filter((entry) => entry.id !== String(row.dataset.entryId || "").trim());
    state.__mappingDraft = next;
    renderMappingsModal();
  });

  els.saveMappingBtn?.addEventListener("click", async () => {
    const draft = collectCurrentMappingDraftFromDom();
    state.__mappingDraft = draft;
    const saved = await saveAnalizarPdfStyleMapping(draft);
    const mergedSaved = mergeSavedMappingWithDraft(saved?.mapping || saved || {}, draft);
    upsertStyleMappingInState(mergedSaved);
    state.activeMappingGroupId = getMappingGroupIdForMapping(mergedSaved);
    state.__mappingDraft = null;
    renderMappingsModal();
  });

  els.activateMappingBtn?.addEventListener("click", async () => {
    const mapping = getActiveMapping();
    if (!mapping?.id) return;
    await activateAnalizarPdfStyleMapping(mapping.id);
    await refreshStyleMappings(mapping.id);
  });

  els.duplicateMappingBtn?.addEventListener("click", () => {
    const mapping = collectCurrentMappingDraftFromDom();
    if (!mapping) return;
    state.activeMappingId = "";
    state.__mappingDraft = normalizeStyleMapping({
      ...mapping,
      id: "",
      mappingSlug: "",
      title: `${mapping.title || "Mapeo"} (copia)`,
      isActive: false
    });
    renderMappingsModal();
  });

  els.deleteMappingBtn?.addEventListener("click", async () => {
    const mapping = getActiveMapping();
    if (!mapping?.id) return;
    if (!window.confirm("¿Eliminar este mapeo?")) return;
    await deleteAnalizarPdfStyleMapping(mapping.id);
    state.activeMappingId = "";
    await refreshStyleMappings();
  });

  els.exportConfigCloseBtn?.addEventListener("click", () => {
    closeExportConfigModal();
  });

  els.exportConfigCancelBtn?.addEventListener("click", () => {
    closeExportConfigModal();
  });

  [
    ["removeOldNotes", els.cleanupOldNotesInput],
    ["removeUnusedParagraphStyles", els.cleanupUnusedParagraphStylesInput],
    ["removeUnusedCharacterStyles", els.cleanupUnusedCharacterStylesInput],
    ["removeUnusedSwatches", els.cleanupUnusedSwatchesInput],
    ["removeOffPageObjects", els.cleanupOffPageObjectsInput],
    ["removeOffPageText", els.cleanupOffPageTextInput],
    ["applySelectedCorrections", els.applySelectedCorrectionsInput],
  ].forEach(([key, element]) => {
    element?.addEventListener("change", () => {
      setExportCleanupOptions({
        ...(state.exportCleanupOptions || createDefaultExportCleanupOptions()),
        [key]: element.checked === true,
      });
      renderExportConfigModal();
    });
  });

  els.saveBtn?.addEventListener("click", async () => {
    if (state.isSavingSession) {
      return;
    }
    try {
      state.isSavingSession = true;
      setBusyOverlay("Guardando ficha editorial");
      renderActionButtonState();
      await flushUiFrame();
      persistLocalAnalysisSession(store.getActiveSession());
      await persistActiveSession([]);
      setJobMetaText("Sesión guardada.");
    } catch (error) {
      setJobMetaText(String(error?.message || error));
    } finally {
      state.isSavingSession = false;
      setBusyOverlay("");
      renderActionButtonState();
      renderAll();
    }
  });

  if (els.copyJobMetaBtn && els.jobMeta) {
    els.copyJobMetaBtn.addEventListener("click", async () => {
      const text = getJobMetaText();
      if (!text) {
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        els.copyJobMetaBtn.classList.add("is-copied");
        window.setTimeout(() => {
          els.copyJobMetaBtn.classList.remove("is-copied");
        }, 1200);
      } catch (_) {
        // noop
      }
    });
  }

  els.exportCorrectedBtn?.addEventListener("click", async () => {
    if (state.isExportingCorrectedIdml) {
      setJobMetaText("La exportación corregida ya está en curso.");
      return;
    }
    const session = store.getActiveSession();
    const revision = getActiveRevision(session);
    const file = getActiveFile(session, revision);
    if (!canExportCurrentFileAsIdml(session, revision, file)) {
      setJobMetaText("Selecciona un archivo IDML para exportar.");
      return;
    }
    openExportConfigModal(session);
  });

  els.exportConfigConfirmBtn?.addEventListener("click", async () => {
    if (state.isExportingCorrectedIdml) {
      return;
    }
    const session = store.getActiveSession();
    const revision = getActiveRevision(session);
    const file = getActiveFile(session, revision);
    if (!canExportCurrentFileAsIdml(session, revision, file)) {
      closeExportConfigModal();
      setJobMetaText("Selecciona un archivo IDML para exportar.");
      return;
    }
    const correctionPayload = collectSelectedCorrectionPayload(session);
    const cleanupOptions = { ...(state.exportCleanupOptions || createDefaultExportCleanupOptions()) };
    if (!hasAnyExportActionSelected(cleanupOptions)) {
      setJobMetaText("Activa al menos una corrección o limpieza antes de exportar.");
      renderExportConfigModal();
      return;
    }
    if (cleanupOptions.applySelectedCorrections && !correctionPayload.issues.length) {
      setJobMetaText("Selecciona páginas y hallazgos individuales antes de activar la corrección y exportar el IDML.");
      renderExportConfigModal();
      return;
    }
    const exportRequest = cleanupOptions.applySelectedCorrections
      ? {
          selectedPages: correctionPayload.selection.selectedPages,
          selectedIssueIds: correctionPayload.selection.selectedIssueIds,
          selectedIssues: correctionPayload.issues,
        }
      : null;
    const confirmationLines = [
      `Páginas seleccionadas: ${correctionPayload.summary.selectedPageCount}`,
      `Hallazgos seleccionados: ${correctionPayload.summary.selectedIssueCount}`,
      `Autocorrecciones directas: ${correctionPayload.summary.autoApplicableCount}`,
      `Notas editoriales por fallback: ${correctionPayload.summary.editorialFallbackCount}`,
      `Limpiezas activas: ${Object.entries(cleanupOptions).filter(([key, value]) => key !== "applySelectedCorrections" && value === true).length}`,
      "",
      "¿Continuar con la exportación corregida?"
    ];
    if (!window.confirm(confirmationLines.join("\n"))) {
      return;
    }
    try {
      state.isExportingCorrectedIdml = true;
      renderActionButtonState();
      closeExportConfigModal({ restoreFocus: false });
      const payload = await exportAnalizarPdfCorrectedIdml(session.id, revision.id, file.id, exportRequest, cleanupOptions, file.result || null);
      const objectUrl = String(payload?.objectUrl || "").trim();
      if (objectUrl) {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = String(payload?.fileName || `${file.documentName || "documento"}.corrected.idml`);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      }
      const result = payload?.exportResult || {};
      setJobMetaText([
        String(payload?.message || "IDML corregido generado."),
        `Páginas: ${Array.isArray(exportRequest?.selectedPages) ? exportRequest.selectedPages.length : 0}`,
        `Hallazgos: ${Array.isArray(exportRequest?.selectedIssues) ? exportRequest.selectedIssues.length : 0}`,
        `Aplicados: ${Number(result?.appliedCount || 0) || 0}`,
        `Notas editoriales: ${Number(result?.editorialNoteCount || 0) || 0}`,
        `Omitidos: ${Number(result?.omittedCount || 0) || 0}`,
      ].join("\n"));
    } catch (error) {
      setJobMetaText(String(error?.message || error));
    } finally {
      state.isExportingCorrectedIdml = false;
      renderActionButtonState();
      renderExportConfigModal();
      restoreExportConfigFocus();
    }
  });

  els.analyzeBtn?.addEventListener("click", async () => {
    const session = store.getActiveSession();
    const revision = getActiveRevision(session);
    const activeFile = getActiveFile(session, revision);
    const activeJobId = String(activeFile?.analysisJobId || session?.analysisJobId || "").trim();
    if (isBusyAnalysisStatus(activeFile?.analysisStatus || "") && activeJobId) {
      try {
        const payload = await cancelAnalizarPdfAnalysis(activeJobId);
        if (payload?.session) {
          store.upsertSession(payload.session);
        } else {
          mutateActiveSession((draft) => {
            draft.analysisStatus = "cancelled";
            draft.analysisJobId = "";
            const draftRevision = (draft.revisions || []).find((entry) => entry.id === String(state.activeRevisionId || "").trim());
            const draftFile = draftRevision?.files?.find((entry) => entry.id === String(state.activeFileId || "").trim());
            if (draftFile) {
              draftFile.analysisStatus = "cancelled";
              draftFile.analysisJobId = "";
            }
            return draft;
          });
        }
        window.clearTimeout(state.analysisPollTimer);
        state.analysisPollTimer = 0;
        settleAnalysisPoll({ jobId: activeJobId, status: "cancelled", cancelled: true });
        state.isAnalyzingCurrent = false;
        state.isAnalyzingAll = false;
        setBusyOverlay("");
        setJobMetaText("Análisis cancelado.");
        renderActionButtonState();
        renderAll();
      } catch (error) {
        setJobMetaText(String(error?.message || error));
      }
      return;
    }
    if (state.isAnalyzingCurrent || state.isAnalyzingAll || state.isSavingSession) {
      return;
    }
    const uploadState = getUploadUiState(session);
    if (!session) {
      setJobMetaText("Crea una sesión antes de analizar.");
      return;
    }
    const targetRevisionId = String(revision?.id || state.activeRevisionId || "").trim();
    const targetFileId = String(activeFile?.id || state.activeFileId || "").trim();
    let initialMagicSpriteToken = "";
    try {
      state.isAnalyzingCurrent = true;
      activeAnalysisFlowStartedAt = performance.now();
      initialMagicSpriteToken = startAnalysisSprite({
        revisionId: targetRevisionId,
        fileId: targetFileId,
        revision,
        file: activeFile,
      });
      primeAnalysisSpriteWords(initialMagicSpriteToken, uploadState.files[0] || null);
      startProgressiveAnalysisWords(activeAnalysisSprites.get(initialMagicSpriteToken), {
        phase: "preparing-session",
        maxProgress: .12,
        increment: .016,
        interval: 1360,
        startDelay: 40,
      });
      logAnalizarPdfFlow("analyzeBtn:start", {
        sessionId: session?.id || "",
        selectedFiles: uploadState.files.map((file) => file?.name || ""),
        sourceType: uploadState.sourceType,
      });
      setBusyOverlay(buildEditorialProcessLabel(session, revision, activeFile, {
        action: "Analizando",
        step: "Preparando ficha activa",
      }));
      renderActionButtonState();
      await flushUiFrame();
      const filesToMerge = uploadState.files.map((file) => ({
        name: file.name,
        sourceType: uploadState.sourceType
      }));
      logAnalizarPdfFlow("analyzeBtn:files-to-merge", { filesToMerge });
      let saved = await persistActiveSession(filesToMerge, { preserveResultsRail: true });
      restoreAnalysisTargetPointers(saved, targetRevisionId, targetFileId, uploadState.files);
      saved = await restoreCachedFilesForRecortableDestinations(saved, getActiveRevision(saved));
      saved = await clearStaleLocalSourceMetadata(saved);
      restoreAnalysisTargetPointers(saved, targetRevisionId, targetFileId, uploadState.files);
      // El pipeline IDML del archivo activo ya extrae estilos, swatches y texto.
      // No ejecutar aquí la herramienta independiente para *todas* las fichas:
      // convertía "Analizar archivo" en 10–12 extracciones y guardados seriales.
      setBusyOverlay("Preparando extracción integrada de estilos y texto");
      startProgressiveAnalysisWords(activeAnalysisSprites.get(initialMagicSpriteToken), {
        phase: "extracting-styles",
        maxProgress: .2,
        increment: .018,
        interval: 1280,
        startDelay: 20,
      });
      await flushUiFrame();
      setBusyOverlay(buildEditorialProcessLabel(saved, getActiveRevision(saved), getActiveFile(saved, getActiveRevision(saved)), {
        action: "Analizando",
        step: "Construyendo objetivos de análisis",
      }));
      renderActionButtonState();
      startProgressiveAnalysisWords(activeAnalysisSprites.get(initialMagicSpriteToken), {
        phase: "building-targets",
        maxProgress: .24,
        increment: .016,
        interval: 1260,
        startDelay: 20,
      });
      await flushUiFrame();
      const targets = await buildAnalysisTargets(saved, uploadState.files.length ? uploadState.files : []);
      logAnalizarPdfFlow("analyzeBtn:targets", {
        targetCount: targets.length,
        targets: targets.map((target) => ({
          revisionId: target.revision?.id || "",
          fileId: target.targetFile?.id || "",
          fileName: target.selectedFile?.name || target.targetFile?.documentName || "",
        })),
      });
      const missingRecortableDestinationIssues = buildMissingRecortableDestinationIssues(
        saved,
        getActiveRevision(saved),
        targets
      );
      if (missingRecortableDestinationIssues.length) {
        logAnalizarPdfFlow("analyzeBtn:missing-recortable-destination", {
          issues: missingRecortableDestinationIssues,
        });
        throw createMissingRecortableDestinationError(
          "No se analizó la unidad origen porque primero debe analizarse el recortable destino.",
          missingRecortableDestinationIssues
        );
      }
      initialMagicSpriteToken = await runAnalysisForTargets(
        saved,
        targets,
        uploadState.files.length
          ? "No se pudieron resolver los archivos seleccionados en la ficha editorial activa."
          : "No hay archivo local disponible en esta ficha editorial. Selecciónalo de nuevo para recargarlo.",
        { initialMagicSpriteToken }
      );
      const analysisCategories = getAnalizarPdfAnalysisCategories();
      if (analysisCategories["quick-orthotypography"] !== false) {
        await handleQuickAnalyzeAll({
          revisionId: targetRevisionId,
          fileId: targetFileId,
          magicSpriteToken: initialMagicSpriteToken,
          keepMagicSpriteAlive: true,
        });
      }
      state.selectedFiles = [];
      els.fileInput.value = "";
      renderAll({ preserveResultsRail: true });
      rehydrateSelectedFilesForActiveContext().catch(() => {});
    } catch (error) {
      logAnalizarPdfFlow("analyzeBtn:error", {
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
      });
      if (isMissingRecortableDestinationError(error)) {
        focusMissingRecortableDestination(error);
        setJobMetaText(String(error?.message || error));
        return;
      }
      mutateActiveSession((draft) => {
        draft.analysisStatus = "failed";
        const activeRevision = (draft.revisions || []).find((entry) => entry.id === String(state.activeRevisionId || "").trim());
        const activeFile = activeRevision?.files?.find((entry) => entry.id === String(state.activeFileId || "").trim());
        if (activeFile) {
          activeFile.analysisStatus = "failed";
        }
        return draft;
      });
      setJobMetaText(String(error?.message || error));
    } finally {
      logAnalizarPdfFlow("analyzeBtn:finally");
      activeAnalysisFlowStartedAt = 0;
      stopAnalysisSprite(initialMagicSpriteToken);
      state.isAnalyzingCurrent = false;
      setBusyOverlay("");
      renderActionButtonState();
      renderAll({ preserveResultsRail: true });
    }
  });

  els.analyzeAllBtn?.addEventListener("click", async () => {
    if (state.isAnalyzingAll) {
      return;
    }
    if (collectFolderImportPromise) {
      setJobMetaText("Esperando a que termine la asignación de todos los IDML...");
      try {
        await collectFolderImportPromise;
      } catch (_) {
        return;
      }
    }
    const session = store.getActiveSession();
    const uploadState = getUploadUiState(session);
    if (!session) {
      setJobMetaText("Crea una sesión antes de analizar.");
      return;
    }
    const selectedRevisionIds = (Array.isArray(session.revisions) ? session.revisions : []).filter((revision) => {
      const files = Array.isArray(revision?.files) ? revision.files : [];
      return files.length && files.every((file) => file?.analysisSelected !== false);
    }).map((revision) => String(revision?.id || "").trim()).filter(Boolean);
    if (!selectedRevisionIds.length) {
      setJobMetaText("Selecciona al menos una ficha editorial antes de iniciar el análisis.");
      return;
    }
    const targetRevisionId = String(getActiveRevision(session)?.id || state.activeRevisionId || "").trim();
    const targetFileId = String(getActiveFile(session, getActiveRevision(session))?.id || state.activeFileId || "").trim();
    let initialMagicSpriteToken = "";
    try {
      state.isAnalyzingAll = true;
      renderActionButtonState();
      renderRevisionList(session);
      activeAnalysisFlowStartedAt = performance.now();
      logAnalizarPdfFlow("analyzeAllBtn:start", {
        sessionId: session?.id || "",
        selectedRevisionIds,
        selectedFiles: uploadState.files.map((file) => file?.name || ""),
      });
      const initialRevision = Array.isArray(session.revisions) ? session.revisions[0] : null;
      const initialFile = Array.isArray(initialRevision?.files) ? initialRevision.files[0] : null;
      initialMagicSpriteToken = startAnalysisSprite({
        revisionId: initialRevision?.id || targetRevisionId,
        fileId: initialFile?.id || targetFileId,
        revision: initialRevision,
        file: initialFile,
      });
      primeAnalysisSpriteWords(initialMagicSpriteToken, uploadState.files[0] || null);
      startProgressiveAnalysisWords(activeAnalysisSprites.get(initialMagicSpriteToken), {
        phase: "preparing-session",
        maxProgress: .12,
        increment: .016,
        interval: 1360,
        startDelay: 40,
      });
      await flushUiFrame();
      setBusyOverlay(buildEditorialProcessLabel(session, initialRevision, initialFile, {
        action: "Analizar todo",
        step: "Preparando fichas editoriales",
      }));
      renderActionButtonState();
      await flushUiFrame();
      const activeRevisionForMerge = getActiveRevision(session);
      const filesToMerge = getFilesToMergeForActiveRevision(session, activeRevisionForMerge, uploadState.files).map((file) => ({
        name: file.name,
        sourceType: uploadState.sourceType
      }));
      logAnalizarPdfFlow("analyzeAllBtn:files-to-merge", {
        filesToMerge,
        selectedFiles: uploadState.files.map((file) => file?.name || ""),
      });
      let saved = await persistActiveSession(filesToMerge, { preserveResultsRail: true });
      saved = await attachUnmatchedSelectedFilesToEmptyRevisions(saved, uploadState.files);
      restoreAnalysisTargetPointers(saved, targetRevisionId, targetFileId, uploadState.files);
      saved = await restoreCachedFilesForRecortableDestinations(saved, getActiveRevision(saved));
      saved = await clearStaleLocalSourceMetadata(saved);
      restoreAnalysisTargetPointers(saved, targetRevisionId, targetFileId, uploadState.files);
      setBusyOverlay(buildEditorialProcessLabel(saved, getActiveRevision(saved), getActiveFile(saved, getActiveRevision(saved)), {
        action: "Analizar todo",
        step: "Construyendo cola de fichas",
      }));
      startProgressiveAnalysisWords(activeAnalysisSprites.get(initialMagicSpriteToken), {
        phase: "building-analysis-queue",
        maxProgress: .24,
        increment: .018,
        interval: 1280,
        startDelay: 20,
      });
      renderActionButtonState();
      await flushUiFrame();
      const targets = await buildAnalysisTargetsForAll(saved, uploadState.files.length ? uploadState.files : [], {
        selectedRevisionIds,
      });
      const missingLocalSourceMessages = await buildMissingLocalSourceMessagesForAll(saved, uploadState.files, targets);
      const missingLocalSourceNotice = missingLocalSourceMessages.length
        ? [
          `No se analizaron ${missingLocalSourceMessages.length} ficha(s) porque no hay IDML local ni copia guardada disponible. Vuelve a seleccionar esos IDML y ejecuta Analizar todo.`,
          ...missingLocalSourceMessages.slice(0, 8),
          missingLocalSourceMessages.length > 8 ? `... y ${missingLocalSourceMessages.length - 8} ficha(s) más.` : "",
        ].filter(Boolean).join(" ")
        : "";
      if (missingLocalSourceMessages.length) {
        logAnalizarPdfFlow("analyzeAllBtn:missing-local-sources", {
          count: missingLocalSourceMessages.length,
          messages: missingLocalSourceMessages,
        });
      }
      const missingRecortableDestinationIssues = buildMissingRecortableDestinationIssues(
        saved,
        getActiveRevision(saved),
        targets
      );
      if (missingRecortableDestinationIssues.length) {
        logAnalizarPdfFlow("analyzeAllBtn:missing-recortable-destination", {
          issues: missingRecortableDestinationIssues,
        });
        setJobMetaText([
          "Se analizarán las fichas disponibles. El recortable destino queda pendiente porque falta cargar su IDML en la ficha Recortables.",
          ...missingRecortableDestinationIssues.map((issue) => issue.message),
        ].join(" "));
      }
      await runAnalysisForTargets(
        saved,
        targets,
        uploadState.files.length
          ? "No se pudieron resolver los archivos seleccionados para el análisis completo."
          : (missingLocalSourceNotice || "No hay archivos locales disponibles en las fichas editoriales para un análisis completo."),
        { initialMagicSpriteToken }
      ) || initialMagicSpriteToken;
      // Los destinos ya fueron procesados primero; la reconciliación usa los resultados persistidos y no crea jobs.
      const reconciliationTargets = [];
      if (reconciliationTargets.length) {
        const completedSession = store.getActiveSession();
        setBusyOverlay(buildEditorialProcessLabel(
          completedSession,
          getActiveRevision(completedSession),
          getActiveFile(completedSession, getActiveRevision(completedSession)),
          {
            action: "Validación final",
            step: "Revisando destinos de recortables, fichas y anexos",
          }
        ));
        setJobMetaText("Revisando nuevamente las referencias y sus archivos destino...");
        logAnalizarPdfFlow("analyzeAllBtn:linked-assets-reconciliation", {
          targetCount: reconciliationTargets.length,
          order: reconciliationTargets.map((target) => ({
            revisionId: target?.revision?.id || "",
            fileId: target?.targetFile?.id || "",
            unidad: target?.revision?.unidad || "",
          })),
        });
        await flushUiFrame();
        await runAnalysisForTargets(
          completedSession,
          reconciliationTargets,
          "No hay archivos disponibles para la validación final de referencias.",
          { initialMagicSpriteToken }
        );
      }
      if (missingLocalSourceNotice) {
        setJobMetaText(missingLocalSourceNotice);
      }
      const analysisCategories = getAnalizarPdfAnalysisCategories();
      if (analysisCategories["quick-orthotypography"] !== false) {
        await handleQuickAnalyzeAll({
          magicSpriteToken: initialMagicSpriteToken,
          keepMagicSpriteAlive: true,
          selectedRevisionIds,
        });
      }
      state.selectedFiles = [];
      els.fileInput.value = "";
      renderAll({ preserveResultsRail: true });
      rehydrateSelectedFilesForActiveContext().catch(() => {});
    } catch (error) {
      if (isMissingRecortableDestinationError(error)) {
        focusMissingRecortableDestination(error);
        setJobMetaText(String(error?.message || error));
        return;
      }
      mutateActiveSession((draft) => {
        draft.analysisStatus = "failed";
        return draft;
      });
      setJobMetaText(String(error?.message || error));
    } finally {
      logAnalizarPdfFlow("analyzeAllBtn:finally");
      activeAnalysisFlowStartedAt = 0;
      stopAnalysisSprite(initialMagicSpriteToken);
      state.isAnalyzingAll = false;
      setBusyOverlay("");
      renderActionButtonState();
      renderAll({ preserveResultsRail: true });
    }
  });
}

function getPollingStageLabel(status = "") {
  const cleanStatus = String(status || "").trim().toLowerCase();
  if (cleanStatus === "queued") return "En cola de procesamiento";
  if (cleanStatus === "processing") return "Procesando estructura, estilos y hallazgos";
  if (cleanStatus === "completed") return "Integrando resultados en la ficha";
  if (cleanStatus === "failed") return "Falló el análisis";
  return "Consultando avance del análisis";
}

async function startPolling(jobId = "", context = {}) {
  window.clearTimeout(state.analysisPollTimer);
  const cleanJobId = String(jobId || "").trim();
  logAnalizarPdfFlow("startPolling:start", { jobId: cleanJobId });
  if (!cleanJobId) return null;
  if (state.analysisPollController && state.analysisPollController.jobId !== cleanJobId) {
    rejectAnalysisPoll(new Error("ANALYSIS_POLL_REPLACED"));
  }
  return new Promise((resolve, reject) => {
    state.analysisPollController = {
      jobId: cleanJobId,
      resolve,
      reject,
    };
    const tick = async () => {
      try {
        const payload = await pollAnalysisStatus(cleanJobId);
        setBusyOverlay(buildEditorialProcessLabel(context?.session || store.getActiveSession(), context?.revision || null, context?.file || null, {
          action: context?.action || "Analizando",
          index: context?.index || 0,
          total: context?.total || 0,
          step: getPollingStageLabel(payload?.status || ""),
        }));
        logAnalizarPdfFlow("startPolling:tick", {
          jobId: cleanJobId,
          status: payload?.status || "",
          hasSession: Boolean(payload?.session),
          hasResult: Boolean(payload?.result),
          error: payload?.error || "",
        });
        let renderSession = applyAnalysisStatusPayloadToLocalSession(payload) || store.getActiveSession();
        const magicSpriteToken = String(context?.magicSpriteToken || "").trim();
        syncAnalysisSpriteProgressStage(magicSpriteToken, payload?.status || "");
        const shouldDeliverToRail = payload?.status === "completed" && activeAnalysisSprites.has(magicSpriteToken);
        if (shouldDeliverToRail) {
          const deliveryRevisionId = String(payload?.revisionId || context?.revision?.id || "").trim();
          state.completedRevisionAnimationIds.delete(deliveryRevisionId);
          renderSession = mutateActiveSession((draft) => {
            const revisionId = deliveryRevisionId;
            const fileId = String(payload?.fileId || context?.file?.id || "").trim();
            const revision = (Array.isArray(draft?.revisions) ? draft.revisions : [])
              .find((entry) => String(entry?.id || "").trim() === revisionId) || null;
            const file = (Array.isArray(revision?.files) ? revision.files : [])
              .find((entry) => String(entry?.id || "").trim() === fileId) || null;
            if (file) {
              file.analysisStatus = "delivering";
              file.analysisJobId = cleanJobId;
            }
            draft.analysisStatus = "delivering";
            draft.analysisJobId = cleanJobId;
            return draft;
          }, { render: false }) || renderSession;
        }
        ensureActiveRevisionAndFile(store.getActiveSession());
        setJobMetaText(formatJobMeta(payload, buildRenderableSession(renderSession)));
        // Los cambios queued/processing solo afectan la ficha y los controles.
        // Mantener los nodos del rail evita cortar trayectorias y progresos Anime.js.
        renderAll({ preserveResultsRail: true });
        if (payload?.status === "queued" || payload?.status === "processing") {
          // Un intervalo de 2.5 s añadía varios segundos de latencia visible aun
          // cuando el worker ya había terminado. 900 ms mantiene un sondeo
          // moderado (un único job activo) y entrega el resultado oportunamente.
          state.analysisPollTimer = window.setTimeout(tick, 900);
          logAnalizarPdfFlow("startPolling:scheduled-next", { jobId: cleanJobId });
          return;
        }
        let durableSnapshotHandled = false;
        if (payload?.status === "completed") {
          const deliveryContext = {
            revisionId: payload?.revisionId || context?.revision?.id || "",
            fileId: payload?.fileId || context?.file?.id || "",
          };
          if (shouldDeliverToRail) {
            stopProgressiveAnalysisWords(activeAnalysisSprites.get(magicSpriteToken));
            let railResultCommitted = false;
            const commitRailResultOnce = () => {
              if (!railResultCommitted) {
                railResultCommitted = true;
                state.completedRevisionAnimationIds.add(String(deliveryContext.revisionId || "").trim());
                clearBusyAnalysisStateForJob(cleanJobId, "completed", {
                  ...deliveryContext,
                  keepBatchOverlay: state.isAnalyzingAll === true,
                  updateTargetRailOnly: true,
                });
              }
              return findAnalysisRailTarget(activeAnalysisSprites.get(magicSpriteToken) || null, deliveryContext);
            };
            // La persistencia y la animación final son independientes. Antes se
            // ejecutaban en serie (erupción -> guardado remoto -> relleno), lo que
            // agregaba su duración completa al tiempo del análisis.
            const durableSnapshotPromise = persistDurableAnalysisSnapshot({ reason: "analysis-job-completed" });
            const eruptionPromise = eruptProcessingRevisionCard(deliveryContext.revisionId, {
              ...deliveryContext,
              magicSpriteToken,
              words: payload?.result?.stats?.pageReports?.length
                ? collectIdmlAnimationWords(payload.result, 20)
                : resolveAnalysisAnimationWords(deliveryContext.revisionId, deliveryContext.fileId, 20),
              onWordArrive: commitRailResultOnce,
              fillLimit: .84,
            });
            const [durableSnapshot] = await Promise.all([durableSnapshotPromise, eruptionPromise]);
            durableSnapshotHandled = true;
            if (!durableSnapshot.remoteSaved) {
              setJobMetaText(`${getJobMetaText()} Resultados conservados localmente; el guardado remoto queda pendiente.`.trim());
            }
            const spriteRecord = activeAnalysisSprites.get(magicSpriteToken) || null;
            if (spriteRecord && payload?.result) {
              spriteRecord.animationWords = collectIdmlAnimationWords(payload.result, 32);
            }
            startProgressiveAnalysisWords(spriteRecord, {
              phase: "saving",
              maxProgress: .96,
              increment: .028,
              interval: 1050,
              startDelay: 0,
            });
            setBusyOverlay(buildEditorialProcessLabel(context?.session || store.getActiveSession(), context?.revision || null, context?.file || null, {
              action: context?.action || "Analizando",
              index: context?.index || 0,
              total: context?.total || 0,
              step: "Guardando y sincronizando resultados",
            }));
            stopProgressiveAnalysisWords(spriteRecord);
            await waitForProgressiveAnalysisWords(spriteRecord);
            const completionPromise = completeAnalysisSprite(magicSpriteToken, {
              ...deliveryContext,
              onArrive: commitRailResultOnce,
              skipColorFill: true,
              finalizeVerticalFill: true,
              keepAlive: context?.keepMagicSpriteAlive === true,
            });
            // En una ficha individual el resultado ya está integrado y guardado:
            // dejamos que el acabado visual continúe sin bloquear el botón. En un
            // lote sí esperamos para no retargetear el mismo personaje a mitad de
            // la transición.
            if (context?.keepMagicSpriteAlive === true) {
              await completionPromise;
            } else {
              void completionPromise.catch(() => stopAnalysisSprite(magicSpriteToken));
            }
          } else {
            stopAnalysisSprite(magicSpriteToken);
            clearBusyAnalysisStateForJob(cleanJobId, "completed", {
              ...deliveryContext,
              keepBatchOverlay: state.isAnalyzingAll === true,
              updateTargetRailOnly: true,
            });
          }
        } else {
          stopAnalysisSprite(magicSpriteToken);
          clearBusyAnalysisStateForJob(cleanJobId, payload?.status || "failed", {
            revisionId: payload?.revisionId || "",
            fileId: payload?.fileId || "",
            keepBatchOverlay: state.isAnalyzingAll === true,
          });
        }
        if (payload?.status === "completed" && !durableSnapshotHandled) {
          const durableSnapshot = await persistDurableAnalysisSnapshot({ reason: "analysis-job-completed" });
          if (!durableSnapshot.remoteSaved) {
            setJobMetaText(`${getJobMetaText()} Resultados conservados localmente; el guardado remoto queda pendiente.`.trim());
          }
        }
        settleAnalysisPoll(payload);
      } catch (error) {
        const clearStatus = isAuthAnalysisError(error)
          ? "failed"
          : /job no encontrado/i.test(String(error?.message || ""))
            ? "failed"
            : "";
        logAnalizarPdfFlow("startPolling:error", {
          jobId: cleanJobId,
          status: Number(error?.status || 0) || "",
          message: String(error?.message || error),
        });
        if (clearStatus) {
          stopAnalysisSprite(context?.magicSpriteToken || "");
          clearBusyAnalysisStateForJob(cleanJobId, clearStatus, {
            keepBatchOverlay: state.isAnalyzingAll === true,
          });
          setJobMetaText(
            isAuthAnalysisError(error)
              ? "La sesión expiró o perdió autorización para consultar el análisis. Vuelve a cargar la página."
              : String(error?.message || error)
          );
          settleAnalysisPoll({ jobId: cleanJobId, status: clearStatus, error: String(error?.message || error) });
          return;
        }
        stopAnalysisSprite(context?.magicSpriteToken || "");
        setJobMetaText(String(error?.message || error));
        rejectAnalysisPoll(error);
      }
    };
    void tick();
  });
}

async function bootstrap() {
  applyAnalizarPdfTheme(safeLocalStorageGet(ANALIZAR_PDF_THEME_STORAGE_KEY) || document.documentElement.dataset.apTheme || "light", { persist: false });
  sidepanelApi.bindEvents();
  bindEditorEvents();
  loadMappingGroupsFromStorage();
  renderAll();
  if (typeof ResizeObserver === "function" && els.revisionList) {
    analysisSpriteAnchorObserver?.disconnect();
    analysisSpriteAnchorObserver = new ResizeObserver(() => repositionActiveAnalysisSprites());
    analysisSpriteAnchorObserver.observe(els.revisionList);
  }
  window.addEventListener("resize", repositionActiveAnalysisSprites, { passive: true });
  window.addEventListener("scroll", repositionActiveAnalysisSprites, { passive: true, capture: true });
  // No bloquear la interfaz si Firebase tarda en restaurar la sesión.
  bootSpinnerFallbackTimer = window.setTimeout(hideBootSpinner, 900);
  const isCollapsed = safeLocalStorageGet("cb_editorial_panel_collapsed") === "true";
  if (isCollapsed && els.editorialPanel && els.toggleEditorialBtn) {
    els.editorialPanel.classList.add("is-collapsed");
    els.toggleEditorialBtn.classList.add("is-collapsed");
    els.toggleEditorialBtn.setAttribute("aria-expanded", "false");
    els.toggleEditorialBtn.setAttribute("aria-label", "Mostrar ficha editorial");
    els.toggleEditorialBtn.setAttribute("title", "Mostrar ficha editorial");
  }
  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user || null;
      if (!user) {
        loadedSessionDetailIds.clear();
        sessionDetailPromises.clear();
        state.sessions = [];
        state.styleMappings = [];
        state.activeSessionId = "";
        renderAll();
        hideBootSpinner();
        return;
      }
    const cachedSessions = restoreSessionCatalog(user);
    if (cachedSessions.length) {
      cachedSessions.forEach((session) => {
        const sessionId = String(session?.id || "").trim();
        if (sessionId) catalogOnlySessionIds.add(sessionId);
      });
      store.setSessions(cachedSessions);
      const cachedActiveId = restoreActiveSessionId() || cachedSessions[0]?.id || "";
        store.setActiveSession(cachedActiveId);
        ensureActiveRevisionAndFile(store.getActiveSession());
        const locallyHydratedSession = await restoreLocalAnalysisSession(store.getActiveSession());
        if (locallyHydratedSession) {
          store.upsertSession(locallyHydratedSession);
          store.setActiveSession(cachedActiveId);
          ensureActiveRevisionAndFile(locallyHydratedSession);
        }
        renderAll();
      hideBootSpinner();
    }
    try {
      const styleMappingsPromise = refreshStyleMappings().catch((error) => {
        setJobMetaText(String(error?.message || error));
      });
      await refreshSessions();
      await refreshActiveSessionDetail(state.activeSessionId).catch(() => null);
      if (!state.sessions.length) {
        const session = createEmptyAnalizarPdfSession();
        const draft = restoreBibliographicDraft();
        if (draft && typeof draft === "object") {
          session.bibliographicInfo = { ...session.bibliographicInfo, ...draft };
          session.title = session.customTitle || buildDerivedSessionTitle(session);
        }
        const saved = await saveSession(session);
        store.upsertSession(saved);
        store.setActiveSession(saved.id);
        loadedSessionDetailIds.add(saved.id);
        syncPersistedTitleMap();
        persistSessionCatalog(user, state.sessions);
        renderAll();
      }
      void styleMappingsPromise;
      await rehydrateSelectedFilesForActiveContext().catch(() => {});
    } catch (error) {
      setJobMetaText(String(error?.message || error));
    } finally {
      scheduleSessionRailReveal();
      scheduleCompletedRailGroupReveal();
      scheduleInlineRailActionReveal();
      hideBootSpinner();
    }
  });
}

bootstrap();
