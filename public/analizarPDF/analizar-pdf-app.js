import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { auth } from "../js/firebase-instance.js";
import {
  createAnalizarPdfSessionStore,
  createEmptyAnalizarPdfSession,
  loadSessions,
  pollAnalysisStatus,
  saveSession
} from "./analizar-pdf-session-store.js?v=2026-1.0.10.466";
import { createAnalizarPdfSidepanelApi } from "./analizar-pdf-sidepanel.js?v=2026-1.0.10.452";
import { createAnalizarPdfResultsRenderer } from "./analizar-pdf-results.js?v=2026-1.0.10.469";
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
} from "./analizar-pdf-api.js?v=2026-1.0.10.452";
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
  ensureActivePointers,
  getEffectiveRecortableRole,
  hasRenderableAnalysis,
  mergeRenderableFileResults,
  normalizeRecortableRole,
  prioritizeRevisionsForRecortablesDestinations,
  recortableRoleSupportsDestination,
  shouldShowRecortableRole,
  upsertRevisionInSession,
} from "./analizar-pdf-session-logic.js?v=2026-1.0.10.466";

const state = {
  sessions: [],
  activeSessionId: "",
  activeRevisionId: "",
  activeFileId: "",
  draggedRevisionId: "",
  busyOverlayLabel: "",
  isSavingSession: false,
  isAnalyzingAll: false,
  isAnalyzingCurrent: false,
  isQuickAnalyzingAll: false,
  isCreatingTemplateFromFile: false,
  isCreatingTemplatesFromAll: false,
  defaultRevisionsModalOpen: false,
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
};

let exportConfigRestoreFocusEl = null;
const ANALYZE_BTN_DEFAULT_LABEL = String(document.getElementById("analizarPdfAnalyzeBtn")?.textContent || "Analizar ficha editorial").trim() || "Analizar ficha editorial";
const LOCAL_ANALYSIS_SESSION_STORAGE_PREFIX = "cb_analizar_pdf_local_session:";
const MAPPING_GROUPS_STORAGE_KEY = "cb_analizar_pdf_mapping_groups";
const UNGROUPED_MAPPING_GROUP_ID = "__ungrouped__";
const LEGACY_DEFAULT_MAPPING_IDS = new Set([
  "default_la_proyecto",
  "default_la_recortables",
  "default_la_primero_unidad",
]);

function logAnalizarPdfFlow(step = "", payload = null) {
  const label = `[analizar-pdf][flow] ${String(step || "").trim()}`;
  if (!payload || typeof payload !== "object") {
    console.log(label);
    return;
  }
  console.log(label, payload);
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

const els = {
  sessionList: document.getElementById("analizarPdfSessionList"),
  createSessionBtn: document.querySelector('[data-action="create-session"]'),
  sessionTitleLabel: document.getElementById("analizarPdfSessionTitleLabel"),
  sourceType: document.getElementById("analizarPdfSourceType"),
  indexPageInput: document.getElementById("analizarPdfIndexPageInput"),
  temarioPageInput: document.getElementById("analizarPdfTemarioPageInput"),
  bookTypeInput: document.getElementById("analizarPdfBookTypeInput"),
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
  fileList: document.getElementById("analizarPdfFileList"),
  addSectionBtn: document.getElementById("analizarPdfAddSectionBtn"),
  addSectionButtons: document.querySelectorAll('[data-action="add-section"]'),
  sectionsList: document.getElementById("analizarPdfSectionsList"),
  paletteList: document.getElementById("analizarPdfPaletteList"),
  addPaletteColorBtn: document.getElementById("analizarPdfAddPaletteColorBtn"),
  fileInput: document.getElementById("analizarPdfFileInput"),
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
  toggleEditorialBtn: document.getElementById("analizarPdfToggleEditorialBtn"),
  editorialSpinner: document.getElementById("analizarPdfEditorialSpinner"),
  editorialSpinnerLabel: document.getElementById("analizarPdfEditorialSpinnerLabel"),
  results: document.getElementById("analizarPdfResults"),
  pageReports: document.getElementById("analizarPdfPageReports"),
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
  defaultBookTypeInput: document.getElementById("analizarPdfDefaultBookTypeInput"),
  defaultNivelInput: document.getElementById("analizarPdfDefaultNivelInput"),
  defaultGradoInput: document.getElementById("analizarPdfDefaultGradoInput"),
  defaultTrimestreInput: document.getElementById("analizarPdfDefaultTrimestreInput"),
  defaultEdicionNumeroInput: document.getElementById("analizarPdfDefaultEdicionNumeroInput"),
  defaultRevisionNumeroInput: document.getElementById("analizarPdfDefaultRevisionNumeroInput"),
  defaultRevisionsSummary: document.getElementById("analizarPdfDefaultRevisionsSummary"),
  defaultRevisionsConfirmBtn: document.getElementById("analizarPdfDefaultRevisionsConfirmBtn"),
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
const resultsRenderer = createAnalizarPdfResultsRenderer({
  el: els.results,
  pageReportsEl: els.pageReports,
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
  return ["uploading", "queued", "processing"].includes(String(status || "").trim().toLowerCase());
}

function updateEditorialSpinner(status = "idle") {
  if (!els.editorialSpinner || !els.editorialPanel) return;
  const overlayLabel = String(state.busyOverlayLabel || "").trim();
  if (overlayLabel) {
    els.editorialSpinner.hidden = false;
    els.editorialPanel.classList.add("is-generating");
    if (els.editorialSpinnerLabel) {
      els.editorialSpinnerLabel.textContent = overlayLabel;
    }
    return;
  }
  const cleanStatus = String(status || "idle").trim().toLowerCase() || "idle";
  const isBusy = isBusyAnalysisStatus(cleanStatus);
  els.editorialSpinner.hidden = !isBusy;
  els.editorialPanel.classList.toggle("is-generating", isBusy);
  if (els.editorialSpinnerLabel) {
    els.editorialSpinnerLabel.textContent = cleanStatus === "uploading"
      ? "Subiendo archivo"
      : cleanStatus === "queued"
        ? "En cola de análisis"
        : "Generando análisis";
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
  renderAll();
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
  const blockAll = state.isAnalyzingAll || state.isAnalyzingCurrent || state.isSavingSession || state.isQuickAnalyzingAll || state.isCreatingTemplateFromFile || state.isCreatingTemplatesFromAll;
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
    els.analyzeBtn.textContent = fileBusy ? "Detener análisis" : ANALYZE_BTN_DEFAULT_LABEL;
  }
  if (els.analyzeAllBtn) {
    els.analyzeAllBtn.disabled = blockAll;
  }
  if (els.createDefaultRevisionsBtn) {
    els.createDefaultRevisionsBtn.disabled = blockAll || !session;
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
}

async function flushUiFrame() {
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function hideBootSpinner() {
  if (!els.bootSpinner) return;
  els.bootSpinner.classList.add("is-hidden");
  window.setTimeout(() => {
    els.bootSpinner?.setAttribute("hidden", "");
  }, 260);
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

function getLocalAnalysisSessionStorageKey(sessionId = "") {
  const cleanSessionId = String(sessionId || "").trim();
  return cleanSessionId ? `${LOCAL_ANALYSIS_SESSION_STORAGE_PREFIX}${cleanSessionId}` : "";
}

function persistLocalAnalysisSession(session = null) {
  const sessionId = String(session?.id || "").trim();
  const key = getLocalAnalysisSessionStorageKey(sessionId);
  if (!key || !session) return;
  putAnalizarPdfCachedAnalysisSession(session).catch(() => {
    try {
      safeLocalStorageSet(key, JSON.stringify(session));
    } catch (_) {
      // noop
    }
  });
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
  if (key) {
    safeLocalStorageRemove(key);
  }
  deleteAnalizarPdfCachedAnalysisSession(sessionId).catch(() => {});
}

function buildSessionTitleFromBibliographicInfo(info = {}) {
  const parts = [
    String(info?.nivel || "").trim(),
    String(info?.grado || "").trim(),
    String(info?.trimestre || "").trim(),
    String(info?.edicionNumero || "").trim(),
  ].filter(Boolean);
  return parts.join(" · ") || "Nueva sesión";
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
        documentName: file?.documentName || file?.fileName || "Archivo",
        sourceType: file?.sourceType || session?.sourceType || "",
        resultSummary: file?.resultSummary || null,
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
      title: revision?.title || "",
      unidad: revision?.unidad || "",
      revisionNumero: revision?.revisionNumero || "",
      recortableRole: revision?.recortableRole || "",
      files: contextFiles,
    });
  }
  return contextRevisions.length ? { revisions: contextRevisions } : null;
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

async function rehydrateSelectedFilesForActiveContext() {
  const session = store.getActiveSession();
  const revision = getActiveRevision(session);
  const activeFile = getActiveFile(session, revision);
  if (!els.fileInput) {
    return;
  }
  if (!activeFile) {
    state.selectedFiles = [];
    els.fileInput.value = "";
    renderActiveSession();
    return;
  }
  const currentMatch = Array.isArray(state.selectedFiles)
    && state.selectedFiles.length === 1
    && buildFileKey(state.selectedFiles[0]?.name || "") === buildFileKey(activeFile.documentName || "");
  if (currentMatch) {
    renderActiveSession();
    return;
  }
  state.selectedFiles = [];
  els.fileInput.value = "";
  if (!activeFile.hasLocalSource || !activeFile.localBlobKey) {
    renderActiveSession();
    return;
  }
  const cachedFile = await resolveCachedFileForEntry(activeFile);
  if (!cachedFile) {
    renderActiveSession();
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
  renderActiveSession();
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
  targets.push(...activeTargets);
  targets.push(...destinationTargetsToAnalyzeLast);
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

async function buildAnalysisTargetsForAll(session = null, selectedFiles = state.selectedFiles) {
  return buildAnalysisTargetsForAllPure({
    session,
    activeRevisionId: String(getActiveRevision(session)?.id || "").trim(),
    selectedFiles,
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

async function runAnalysisForTargets(session = null, targets = [], emptyMessage = "") {
  const savedSessionId = String(session?.id || "").trim();
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
    });
    logAnalizarPdfFlow("runAnalysisForTargets:persist-before-upload", {
      fileId: targetFile?.id || "",
    });
    setBusyOverlay(buildEditorialProcessLabel(session, revision, targetFile || selectedFile, {
      ...targetProgress,
      step: "Guardando estado de la ficha",
    }));
    await flushUiFrame();
    await saveActiveSessionSnapshot();
    let upload = null;
    try {
      setBusyOverlay(buildEditorialProcessLabel(session, revision, targetFile || selectedFile, {
        ...targetProgress,
        step: useStoredSource ? "Creando job con copia guardada" : "Subiendo IDML al backend",
      }));
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
        });
        await saveActiveSessionSnapshot();
        continue;
      }
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
    });
    setJobMetaText(formatJobMeta(queued, buildRenderableSession(store.getActiveSession())));
    try {
      await startPolling(queued.jobId || "", {
        session,
        revision,
        file: targetFile || selectedFile,
        action: targetProgress.action,
        index: targetProgress.index,
        total: targetProgress.total,
      });
    } catch (error) {
      const targetLabel = targetFile?.documentName || selectedFile?.name || "archivo";
      nonBlockingMessages.push(`${targetLabel}: ${String(error?.message || error)}`);
      continue;
    }
  }
  if (nonBlockingMessages.length) {
    setJobMetaText(nonBlockingMessages.join(" "));
  }
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

function renderRevisionList(session = null) {
  if (!els.revisionList) return;
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  const activeRevisionId = String(getActiveRevision(session)?.id || "").trim();
  if (!revisions.length) {
    els.revisionList.innerHTML = `<div class="analizar-pdf-empty-state">No hay fichas editoriales todavía.</div>`;
    return;
  }
  els.revisionList.innerHTML = revisions.map((revision, index) => {
    const isBusy = isRevisionBusy(revision);
    return `
    <article
      id="analizarPdfEditorialPanel-${escapeAttr(revision.id)}"
      class="analizar-pdf-subrecord-card${revision.id === activeRevisionId ? " is-active" : ""}${isBusy ? " is-processing" : ""}"
      data-revision-id="${escapeAttr(revision.id)}"
      draggable="true"
    >
      <div class="analizar-pdf-subrecord-card-row">
        <button type="button" class="analizar-pdf-subrecord-card-select" data-action="select-revision" data-revision-id="${escapeAttr(revision.id)}">
          <span class="analizar-pdf-subrecord-card-title">
            <span>${escapeHtml(revision.title || "Nueva ficha editorial")}</span>
            ${isBusy ? '<span class="analizar-pdf-subrecord-spinner" aria-label="Ficha en proceso" title="Ficha en proceso"></span>' : ""}
          </span>
          <small>${escapeHtml([
            revision.unidad || "Unidad pendiente",
            revision.revisionNumero || "Revisión pendiente",
            `${revision.fileCount || revision.files?.length || 0} archivo(s)`
          ].join(" · "))}</small>
        </button>
        <div class="analizar-pdf-subrecord-actions">
          <button
            type="button"
            class="analizar-pdf-icon-btn analizar-pdf-subrecord-order-btn"
            data-action="move-revision-up"
            data-revision-id="${escapeAttr(revision.id)}"
            aria-label="Subir ficha editorial"
            title="Subir ficha editorial"
            ${index === 0 ? "disabled" : ""}
          >
            <i class="fas fa-chevron-up" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="analizar-pdf-icon-btn analizar-pdf-subrecord-order-btn"
            data-action="move-revision-down"
            data-revision-id="${escapeAttr(revision.id)}"
            aria-label="Bajar ficha editorial"
            title="Bajar ficha editorial"
            ${index === revisions.length - 1 ? "disabled" : ""}
          >
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="analizar-pdf-icon-btn analizar-pdf-subrecord-delete-btn"
            data-action="delete-revision"
            data-revision-id="${escapeAttr(revision.id)}"
            aria-label="Eliminar ficha editorial"
            title="Eliminar ficha editorial"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </article>
  `;
  }).join("");
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

function renderActiveSession() {
  const session = store.getActiveSession();
  ensureActiveRevisionAndFile(session);
  const sessionId = String(session?.id || "").trim();
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
  resultsRenderer.render(buildRenderableSession(session));
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

function renderAll() {
  sidepanelApi.renderSessions();
  renderActiveSession();
  renderDefaultRevisionsModal();
  renderMappingsModal();
  renderExportConfigModal();
  const jobMeta = getLiveJobMetaElement();
  if (state.jobMetaText && jobMeta) {
    jobMeta.textContent = state.jobMetaText;
  }
}

async function refreshSessions(preferredSessionId = "") {
  const sessions = await loadSessions();
  const sessionsWithLocalAnalysis = await Promise.all(sessions.map((session) => restoreLocalAnalysisSession(session)));
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
  renderAll();
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

async function attachSelectedFilesToRevision(session = null, revisionId = "", selectedFiles = []) {
  const cleanRevisionId = String(revisionId || "").trim();
  const files = Array.isArray(selectedFiles) ? selectedFiles.filter(Boolean) : [];
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
  const fileEntriesByName = new Map();
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
      resetFileAnalysisState(fileEntry);
    }
    revision.files = [fileEntry];
    fileEntriesByName.set(documentName, fileEntry);
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

function resolveDefaultRevisionUnitCountByTrimester(trimestre = "") {
  const cleanTrimestre = String(trimestre || "").trim().toLowerCase();
  if (cleanTrimestre === "trimestre 2") return 6;
  if (cleanTrimestre === "trimestre 1" || cleanTrimestre === "trimestre 3") return 7;
  return 7;
}

function buildDefaultRevisionBlueprints(config = {}) {
  const unitCount = resolveDefaultRevisionUnitCountByTrimester(config.trimestre);
  const revisionNumero = String(config.revisionNumero || "F1").trim() || "F1";
  const units = [
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
  if (!config.bookType) missing.push("Tipo");
  if (!config.nivel) missing.push("Nivel");
  if (!config.grado) missing.push("Grado");
  if (!config.trimestre) missing.push("Trimestre");
  if (!config.edicionNumero) missing.push("Edición");
  if (!config.revisionNumero) missing.push("Revisión");
  return missing;
}

function buildDefaultRevisionsSummaryText(config = {}) {
  const unitCount = resolveDefaultRevisionUnitCountByTrimester(config.trimestre);
  if (!config.trimestre) {
    return "Selecciona un trimestre para calcular las fichas base.";
  }
  return `${config.trimestre}: Proyecto + ${unitCount} unidad(es) + Lecturas + Recortables.`;
}

function seedDefaultRevisionsModalFromSession(session = null) {
  const info = session?.bibliographicInfo || {};
  if (els.defaultSourceTypeInput) els.defaultSourceTypeInput.value = "idml";
  if (els.defaultBookTypeInput) els.defaultBookTypeInput.value = info.bookType || els.bookTypeInput?.value || "";
  if (els.defaultNivelInput) els.defaultNivelInput.value = info.nivel || els.nivelInput?.value || "";
  if (els.defaultGradoInput) els.defaultGradoInput.value = info.grado || els.gradoInput?.value || "";
  if (els.defaultTrimestreInput) els.defaultTrimestreInput.value = info.trimestre || els.trimestreInput?.value || "";
  if (els.defaultEdicionNumeroInput) els.defaultEdicionNumeroInput.value = info.edicionNumero || els.edicionNumeroInput?.value || "";
  if (els.defaultRevisionNumeroInput) els.defaultRevisionNumeroInput.value = info.revisionNumero || els.revisionNumeroInput?.value || "F1";
}

function renderDefaultRevisionsModal() {
  if (!els.defaultRevisionsModal) return;
  els.defaultRevisionsModal.hidden = !state.defaultRevisionsModalOpen;
  if (!state.defaultRevisionsModalOpen) return;
  const config = collectDefaultRevisionsConfigFromDom();
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
  const session = store.getActiveSession();
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
  renderDefaultRevisionsModal();
}

async function handleCreateDefaultRevisions(config = null) {
  const session = store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea una sesión antes de generar fichas base.");
    return;
  }
  const normalizedConfig = config || collectDefaultRevisionsConfigFromDom();
  const missing = validateDefaultRevisionsConfig(normalizedConfig);
  if (missing.length) {
    setJobMetaText(`Faltan datos para crear fichas base: ${missing.join(", ")}.`);
    return;
  }
  const blueprints = buildDefaultRevisionBlueprints(normalizedConfig);
  const added = [];
  const nextSession = mutateActiveSession((draft) => {
    draft.sourceType = "idml";
    draft.bibliographicInfo = {
      ...(draft.bibliographicInfo || {}),
      bookType: normalizedConfig.bookType,
      nivel: normalizedConfig.nivel,
      grado: normalizedConfig.grado,
      trimestre: normalizedConfig.trimestre,
      edicionNumero: normalizedConfig.edicionNumero,
      revisionNumero: normalizedConfig.revisionNumero,
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
  draft.title = derivedTitle;
  draft.sessionKey = buildSessionKey(getSessionBaseInfo(draft));
  const currentId = String(draft?.id || "").trim();
  const savedTitleForCurrentId = String(state.persistedTitlesBySessionId[currentId] || "").trim();
  if (savedTitleForCurrentId && savedTitleForCurrentId !== derivedTitle) {
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
  renderAll();
  return saved;
}

async function saveActiveSessionSnapshot(options = {}) {
  const session = store.getActiveSession();
  if (!session) throw new Error("No hay sesión activa.");
  persistLocalAnalysisSession(session);
  const saved = session;
  if (options.render === true) {
    renderAll();
  }
  return saved;
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

async function handleCreateTemplatesFromAll() {
  if (state.isCreatingTemplatesFromAll) return;
  let session = store.getActiveSession();
  if (!session) {
    setJobMetaText("Crea una sesión antes de crear plantillas.");
    return;
  }
  session = await persistActiveSession([]);
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
    renderAll();
  } finally {
    state.isCreatingTemplatesFromAll = false;
    setBusyOverlay("");
    renderActionButtonState();
    renderAll();
  }
}

async function buildQuickAnalysisTargets(session = null) {
  const targets = [];
  for (const revision of Array.isArray(session?.revisions) ? session.revisions : []) {
    for (const file of Array.isArray(revision?.files) ? revision.files : []) {
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

async function handleQuickAnalyzeAll() {
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
  const targets = await buildQuickAnalysisTargets(session);
  const missing = buildMissingLocalSourceNoticeFromSession(session);
  if (!targets.length) {
    setJobMetaText(missing || "No hay copias backend de IDML disponibles para análisis rápido.");
    return;
  }
  const failures = [];
  try {
    state.isQuickAnalyzingAll = true;
    setBusyOverlay("Preparando análisis rápido ortotipográfico");
    renderActionButtonState();
    await flushUiFrame();
    for (let index = 0; index < targets.length; index += 1) {
      const { revision, file, selectedFile, useStoredSource } = targets[index];
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
        const payload = await runAnalizarPdfQuickOrthotypography(session.id, revision.id, file.id, {
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
          persistLocalAnalysisSession(next);
        }
        renderAll();
      } catch (error) {
        failures.push(`${revision.title || revision.unidad || "Ficha editorial"}: ${formatIdmlToolError(error)}`);
      }
    }
    const analyzedCount = targets.length - failures.length;
    setJobMetaText([
      `Análisis rápido finalizado: ${analyzedCount}/${targets.length} ficha(s).`,
      failures.length ? `Fallos: ${failures.slice(0, 6).join(" ")}` : "",
      missing ? `Omitidas: ${missing}` : "",
    ].filter(Boolean).join(" "));
  } finally {
    state.isQuickAnalyzingAll = false;
    setBusyOverlay("");
    renderActionButtonState();
    renderAll();
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
  const draftRevision = createDraftRevision(session);
  session.revisions = [draftRevision];
  const saved = await saveSession(session);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  state.activeRevisionId = String(saved.revisions?.[0]?.id || draftRevision.id || "").trim();
  state.activeFileId = "";
  ensureActiveRevisionAndFile(saved);
  renderAll();
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
}

async function handleRenameSession() {}

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
  const saved = await saveSession(nextSession);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  state.activeRevisionId = cleanRevisionId;
  ensureActiveRevisionAndFile(saved);
  syncPersistedTitleMap();
  renderAll();
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
  const saved = await saveSession(nextSession);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  state.activeRevisionId = sourceId;
  ensureActiveRevisionAndFile(saved);
  syncPersistedTitleMap();
  renderAll();
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

function bindEditorEvents() {
  if (els.toggleEditorialBtn && els.editorialPanel) {
    els.toggleEditorialBtn.addEventListener("click", () => {
      const isCollapsed = els.editorialPanel.classList.toggle("is-collapsed");
      els.toggleEditorialBtn.setAttribute("aria-expanded", !isCollapsed ? "true" : "false");
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
        session.title = buildDerivedSessionTitle(session);
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

  els.revisionList?.addEventListener("click", (event) => {
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
    state.activeRevisionId = String(button.dataset.revisionId || "").trim();
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
      });
      rehydrateSelectedFilesForActiveContext().catch(() => {});
      return;
    }
    renderAll();
    rehydrateSelectedFilesForActiveContext().catch(() => {});
  });

  els.revisionList?.addEventListener("dragstart", (event) => {
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

  els.defaultRevisionsModal?.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="close-default-revisions-modal"]')) {
      closeDefaultRevisionsModal();
    }
  });

  [
    els.defaultSourceTypeInput,
    els.defaultBookTypeInput,
    els.defaultNivelInput,
    els.defaultGradoInput,
    els.defaultTrimestreInput,
    els.defaultEdicionNumeroInput,
    els.defaultRevisionNumeroInput,
  ].forEach((element) => {
    element?.addEventListener("change", () => renderDefaultRevisionsModal());
  });

  els.defaultRevisionsConfirmBtn?.addEventListener("click", () => {
    handleCreateDefaultRevisions(collectDefaultRevisionsConfigFromDom()).catch((error) => {
      setJobMetaText(String(error?.message || error));
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

  els.saveBtn.addEventListener("click", async () => {
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

  els.analyzeBtn.addEventListener("click", async () => {
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
    try {
      state.isAnalyzingCurrent = true;
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
      let saved = await persistActiveSession(filesToMerge);
      restoreAnalysisTargetPointers(saved, targetRevisionId, targetFileId, uploadState.files);
      saved = await restoreCachedFilesForRecortableDestinations(saved, getActiveRevision(saved));
      saved = await clearStaleLocalSourceMetadata(saved);
      restoreAnalysisTargetPointers(saved, targetRevisionId, targetFileId, uploadState.files);
      setBusyOverlay(buildEditorialProcessLabel(saved, getActiveRevision(saved), getActiveFile(saved, getActiveRevision(saved)), {
        action: "Analizando",
        step: "Construyendo objetivos de análisis",
      }));
      renderActionButtonState();
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
      await runAnalysisForTargets(
        saved,
        targets,
        uploadState.files.length
          ? "No se pudieron resolver los archivos seleccionados en la ficha editorial activa."
          : "No hay archivo local disponible en esta ficha editorial. Selecciónalo de nuevo para recargarlo."
      );
      state.selectedFiles = [];
      els.fileInput.value = "";
      renderAll();
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
      state.isAnalyzingCurrent = false;
      setBusyOverlay("");
      renderActionButtonState();
      renderAll();
    }
  });

  els.analyzeAllBtn?.addEventListener("click", async () => {
    if (state.isAnalyzingAll) {
      return;
    }
    const session = store.getActiveSession();
    const uploadState = getUploadUiState(session);
    if (!session) {
      setJobMetaText("Crea una sesión antes de analizar.");
      return;
    }
    const targetRevisionId = String(getActiveRevision(session)?.id || state.activeRevisionId || "").trim();
    const targetFileId = String(getActiveFile(session, getActiveRevision(session))?.id || state.activeFileId || "").trim();
    try {
      state.isAnalyzingAll = true;
      setBusyOverlay(buildEditorialProcessLabel(session, getActiveRevision(session), getActiveFile(session, getActiveRevision(session)), {
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
      let saved = await persistActiveSession(filesToMerge);
      saved = await attachUnmatchedSelectedFilesToEmptyRevisions(saved, uploadState.files);
      restoreAnalysisTargetPointers(saved, targetRevisionId, targetFileId, uploadState.files);
      saved = await restoreCachedFilesForRecortableDestinations(saved, getActiveRevision(saved));
      saved = await clearStaleLocalSourceMetadata(saved);
      restoreAnalysisTargetPointers(saved, targetRevisionId, targetFileId, uploadState.files);
      setBusyOverlay(buildEditorialProcessLabel(saved, getActiveRevision(saved), getActiveFile(saved, getActiveRevision(saved)), {
        action: "Analizar todo",
        step: "Construyendo cola de fichas",
      }));
      renderActionButtonState();
      await flushUiFrame();
      const targets = await buildAnalysisTargetsForAll(saved, uploadState.files.length ? uploadState.files : []);
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
          : (missingLocalSourceNotice || "No hay archivos locales disponibles en las fichas editoriales para un análisis completo.")
      );
      if (missingLocalSourceNotice) {
        setJobMetaText(missingLocalSourceNotice);
      }
      state.selectedFiles = [];
      els.fileInput.value = "";
      renderAll();
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
      state.isAnalyzingAll = false;
      setBusyOverlay("");
      renderActionButtonState();
      renderAll();
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
        const renderSession = applyAnalysisStatusPayloadToLocalSession(payload) || store.getActiveSession();
        ensureActiveRevisionAndFile(store.getActiveSession());
        setJobMetaText(formatJobMeta(payload, buildRenderableSession(renderSession)));
        renderAll();
        if (payload?.status === "queued" || payload?.status === "processing") {
          state.analysisPollTimer = window.setTimeout(tick, 2500);
          logAnalizarPdfFlow("startPolling:scheduled-next", { jobId: cleanJobId });
          return;
        }
        clearBusyAnalysisStateForJob(cleanJobId, payload?.status || "completed", {
          revisionId: payload?.revisionId || "",
          fileId: payload?.fileId || "",
          keepBatchOverlay: state.isAnalyzingAll === true,
        });
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
        setJobMetaText(String(error?.message || error));
        rejectAnalysisPoll(error);
      }
    };
    void tick();
  });
}

async function bootstrap() {
  sidepanelApi.bindEvents();
  bindEditorEvents();
  loadMappingGroupsFromStorage();
  const isCollapsed = safeLocalStorageGet("cb_editorial_panel_collapsed") === "true";
  if (isCollapsed && els.editorialPanel && els.toggleEditorialBtn) {
    els.editorialPanel.classList.add("is-collapsed");
    els.toggleEditorialBtn.setAttribute("aria-expanded", "false");
  }
  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user || null;
      if (!user) {
        state.sessions = [];
        state.styleMappings = [];
        state.activeSessionId = "";
        renderAll();
        hideBootSpinner();
        return;
      }
    try {
      await refreshStyleMappings();
      await refreshSessions();
      if (!state.sessions.length) {
        const session = createEmptyAnalizarPdfSession();
        const draft = restoreBibliographicDraft();
        if (draft && typeof draft === "object") {
          session.bibliographicInfo = { ...session.bibliographicInfo, ...draft };
          session.title = buildDerivedSessionTitle(session);
        }
        const saved = await saveSession(session);
        store.upsertSession(saved);
        store.setActiveSession(saved.id);
        syncPersistedTitleMap();
        renderAll();
      }
      await rehydrateSelectedFilesForActiveContext().catch(() => {});
    } catch (error) {
      setJobMetaText(String(error?.message || error));
    } finally {
      hideBootSpinner();
    }
  });
}

bootstrap();
