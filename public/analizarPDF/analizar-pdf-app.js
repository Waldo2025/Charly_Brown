import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { auth } from "../js/firebase-instance.js";
import {
  createAnalizarPdfSessionStore,
  createEmptyAnalizarPdfSession,
  loadSessions,
  pollAnalysisStatus,
  saveSession
} from "./analizar-pdf-session-store.js";
import { createAnalizarPdfSidepanelApi } from "./analizar-pdf-sidepanel.js";
import { createAnalizarPdfResultsRenderer } from "./analizar-pdf-results.js";
import {
  activateAnalizarPdfStyleMapping,
  deleteAnalizarPdfStyleMapping,
  exportAnalizarPdfCorrectedIdml,
  listAnalizarPdfStyleMappings,
  queueAnalizarPdfUpload,
  saveAnalizarPdfStyleMapping
} from "./analizar-pdf-api.js";
import {
  buildAnalizarPdfLocalBlobKey,
  deleteAnalizarPdfCachedFile,
  deleteAnalizarPdfCachedFilesBySession,
  getAnalizarPdfCachedFile,
  putAnalizarPdfCachedFile
} from "./analizar-pdf-file-cache.js";

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
  currentUser: null,
  selectedFiles: [],
  analysisPollTimer: 0,
  persistedTitlesBySessionId: {},
  styleMappings: [],
  activeMappingId: "",
  mappingsModalOpen: false,
  correctionSelectionsByScopeKey: {},
  isExportingCorrectedIdml: false,
  exportConfigModalOpen: false,
  exportCleanupOptions: createDefaultExportCleanupOptions(),
  exportCleanupOptionsByScopeKey: {},
};

let exportConfigRestoreFocusEl = null;

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
  revisionMappingSelect: document.getElementById("analizarPdfRevisionMappingSelect"),
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
  onToggleCorrectionIssue: handleToggleCorrectionIssue
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

function renderActionButtonState() {
  const blockAll = state.isAnalyzingAll || state.isAnalyzingCurrent || state.isSavingSession;
  const session = store.getActiveSession();
  const revision = getActiveRevision(session);
  const file = getActiveFile(session, revision);
  if (els.analyzeBtn) {
    els.analyzeBtn.disabled = blockAll;
  }
  if (els.analyzeAllBtn) {
    els.analyzeAllBtn.disabled = blockAll;
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

function setJobMetaText(value = "") {
  if (!els.jobMeta) return;
  els.jobMeta.textContent = String(value || "");
}

function getJobMetaText() {
  return String(els.jobMeta?.textContent || "").trim();
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
    isActive: source.isActive === true,
    updatedAt: String(source.updatedAt || "").trim(),
    entries: Array.isArray(source.entries) ? source.entries.map((entry, entryIndex) => normalizeMappingEntry(entry, entryIndex)) : [],
  };
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
    const scopeKey = buildMappingScopeKey({
      bookType: session.bibliographicInfo.bookType,
      nivel: session.bibliographicInfo.nivel,
      grado: session.bibliographicInfo.grado,
      unidad,
    });
    if (!scopeKey) continue;
    const match = (Array.isArray(state.styleMappings) ? state.styleMappings : []).find((mapping) => mapping.scopeKey === scopeKey && mapping.isActive);
    if (match) {
      return match;
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

function getRevisionDraftInfo(session = null) {
  return {
    unidad: String(session?.bibliographicInfo?.unidad || "").trim(),
    revisionNumero: String(session?.bibliographicInfo?.revisionNumero || "").trim(),
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

function buildRenderableSession(session = null) {
  if (!session) return null;
  const revision = getActiveRevision(session);
  const file = getActiveFile(session, revision);
  const correctionContext = getActiveCorrectionContext(session);
  const correctionSelection = getCorrectionSelection(correctionContext.key);
  const activeMappingEntries = resolveMappingEntriesForRevision(revision);
  const activeFileResult = file && revision
    ? [{
      ...session,
      title: `${session.title} · ${revision?.title || "Revisión"} · ${file.documentName || "Archivo"}`,
      fileTitle: file.documentName || "Archivo",
      revisionTitle: revision?.title || "Revisión",
      sourceType: file.sourceType || session.sourceType,
      analysisStatus: file.analysisStatus || session.analysisStatus,
      analysisJobId: file.analysisJobId || session.analysisJobId,
      result: file.result || session.result,
      resultSummary: file.resultSummary || session.resultSummary,
      correctionSelection,
      mappingEntries: activeMappingEntries,
    }]
    : [];
  const fallbackFileResults = (Array.isArray(session?.revisions) ? session.revisions : []).flatMap((revisionEntry) => {
    const mappingEntries = resolveMappingEntriesForRevision(revisionEntry);
    const revisionFiles = Array.isArray(revisionEntry?.files) ? revisionEntry.files : [];
    return revisionFiles
      .filter((entry) => entry?.result || entry?.resultSummary)
      .map((entry) => ({
        ...session,
        title: `${session.title} · ${revisionEntry?.title || "Revisión"} · ${entry.documentName || "Archivo"}`,
        fileTitle: entry.documentName || "Archivo",
        revisionTitle: revisionEntry?.title || "Revisión",
        sourceType: entry.sourceType || session.sourceType,
        analysisStatus: entry.analysisStatus || session.analysisStatus,
        analysisJobId: entry.analysisJobId || session.analysisJobId,
        result: entry.result || session.result,
        resultSummary: entry.resultSummary || session.resultSummary,
        mappingEntries,
      }));
  });
  const fileResults = activeFileResult.length ? activeFileResult : fallbackFileResults;
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
    sourceType: file.sourceType || session.sourceType,
    analysisStatus: file.analysisStatus || session.analysisStatus,
    analysisJobId: file.analysisJobId || session.analysisJobId,
    title: `${session.title} · ${revision?.title || "Revisión"} · ${file.documentName || "Archivo"}`,
    result: file.result || session.result,
    resultSummary: file.resultSummary || session.resultSummary,
    fileResults,
    revisionSummary: revision?.summary || null,
    correctionSelection,
    mappingEntries: activeMappingEntries,
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
    els.fileInput.files = transfer.files;
  } catch (_) {
    // Algunos navegadores no permiten reasignar files; el label igual se rehidrata.
  }
  renderActiveSession();
}

async function persistSelectedFilesToActiveRevision() {
  const session = store.getActiveSession();
  const selectedFiles = Array.isArray(state.selectedFiles) ? state.selectedFiles.filter(Boolean) : [];
  if (!session || !selectedFiles.length) {
    return;
  }
  const sourceType = getNormalizedSourceType(session?.sourceType);
  const filesToMerge = selectedFiles.map((file) => ({
    name: file.name,
    sourceType
  }));
  const saved = await persistActiveSession(filesToMerge);
  const revision = getActiveRevision(saved);
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
  if (Array.isArray(selectedFiles) && selectedFiles.length) {
    const resolvedTargets = selectedFiles.map((selectedFile) => {
      const selectedFileKey = buildFileKey(selectedFile.name);
      const directTargetFile = (revision.files || []).find((entry) => String(entry.fileKey || "").trim() === selectedFileKey) || null;
      if (directTargetFile) {
        return { selectedFile, targetFile: directTargetFile, revision };
      }
      for (const candidateRevision of revisions) {
        const targetFile = (candidateRevision?.files || []).find((entry) => String(entry.fileKey || "").trim() === selectedFileKey) || null;
        if (targetFile) {
          return { selectedFile, targetFile, revision: candidateRevision };
        }
      }
      return null;
    }).filter(Boolean);
    logAnalizarPdfFlow("buildAnalysisTargets:resolved-selected", {
      resolvedCount: resolvedTargets.length,
      targets: resolvedTargets.map((target) => ({
        revisionId: target.revision?.id || "",
        fileId: target.targetFile?.id || "",
        fileName: target.selectedFile?.name || "",
        mappingId: target.targetFile?.mappingId || "",
      })),
    });
    return resolvedTargets;
  }
  const targets = [];
  for (const targetFile of Array.isArray(revision.files) ? revision.files : []) {
    const cachedFile = await resolveCachedFileForEntry(targetFile);
    if (!cachedFile) continue;
    targets.push({ selectedFile: cachedFile, targetFile, revision });
  }
  logAnalizarPdfFlow("buildAnalysisTargets:resolved-cached", {
    resolvedCount: targets.length,
    targets: targets.map((target) => ({
      revisionId: target.revision?.id || "",
      fileId: target.targetFile?.id || "",
      fileName: target.selectedFile?.name || "",
      mappingId: target.targetFile?.mappingId || "",
    })),
  });
  return targets;
}

async function buildAnalysisTargetsForAll(session = null, selectedFiles = state.selectedFiles) {
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  const activeRevision = getActiveRevision(session);
  const activeRevisionId = String(activeRevision?.id || "").trim();
  const targets = [];
  for (const revision of revisions) {
    const revisionId = String(revision?.id || "").trim();
    if (!revisionId) continue;
    const revisionSelectedFiles = revisionId === activeRevisionId ? selectedFiles : [];
    if (Array.isArray(revisionSelectedFiles) && revisionSelectedFiles.length) {
      for (const selectedFile of revisionSelectedFiles) {
        const targetFile = (revision.files || []).find((entry) => String(entry.fileKey || "").trim() === buildFileKey(selectedFile.name));
        if (!targetFile) continue;
        targets.push({ selectedFile, targetFile, revision });
      }
      continue;
    }
    for (const targetFile of Array.isArray(revision.files) ? revision.files : []) {
      const cachedFile = await resolveCachedFileForEntry(targetFile);
      if (!cachedFile) continue;
      targets.push({ selectedFile: cachedFile, targetFile, revision });
    }
  }
  return targets;
}

async function runAnalysisForTargets(session = null, targets = [], emptyMessage = "") {
  const savedSessionId = String(session?.id || "").trim();
  logAnalizarPdfFlow("runAnalysisForTargets:start", {
    sessionId: savedSessionId,
    targetCount: Array.isArray(targets) ? targets.length : 0,
  });
  if (!savedSessionId) {
    throw new Error("No hay sesión activa.");
  }
  if (!targets.length) {
    logAnalizarPdfFlow("runAnalysisForTargets:no-targets", { emptyMessage });
    setJobMetaText(emptyMessage || "No hay archivos disponibles para analizar.");
    return;
  }
  for (const { selectedFile, targetFile, revision } of targets) {
    logAnalizarPdfFlow("runAnalysisForTargets:target", {
      revisionId: revision?.id || "",
      fileId: targetFile?.id || "",
      fileName: selectedFile?.name || "",
      mappingId: targetFile?.mappingId || "",
    });
    const localMetadata = await cacheSelectedFileForRevision(savedSessionId, revision.id, targetFile, selectedFile);
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
    await persistActiveSession([]);
    const upload = await queueUploadForSession(store.getActiveSession(), savedSessionId, selectedFile, {
      revisionId: revision.id,
      fileId: targetFile.id,
      mappingId: targetFile.mappingId
    });
    const queued = upload.response || {};
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
    await startPolling(queued.jobId || "");
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
    els.unidadInput.value = bibliographicInfo.unidad || "";
  }
  if (els.edicionNumeroInput) {
    els.edicionNumeroInput.value = bibliographicInfo.edicionNumero || "";
  }
  if (els.revisionNumeroInput) {
    els.revisionNumeroInput.value = bibliographicInfo.revisionNumero || "";
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
  for (const mapping of Array.isArray(state.styleMappings) ? state.styleMappings : []) {
    const selected = mapping.id === selectedMappingId ? " selected" : "";
    options.push(`<option value="${escapeAttr(mapping.id)}"${selected}>${escapeHtml(mapping.title || "Mapeo")}</option>`);
  }
  return options.join("");
}

function ensureActiveRevisionAndFile(session = null) {
  const revision = getActiveRevision(session);
  state.activeRevisionId = String(revision?.id || "").trim();
  const file = getActiveFile(session, revision);
  state.activeFileId = String(file?.id || "").trim();
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
  const mappings = getFilteredMappings();
  els.mappingsList.innerHTML = mappings.length
    ? mappings.map((mapping) => `
      <button type="button" class="analizar-pdf-subrecord-card${mapping.id === state.activeMappingId ? " is-active" : ""}" data-action="select-mapping" data-mapping-id="${escapeAttr(mapping.id)}">
        <span>${escapeHtml(mapping.title || "Mapeo sin título")}</span>
        <small>${escapeHtml([mapping.bookType, mapping.nivel, mapping.grado, mapping.unidad].filter(Boolean).join(" · "))}${mapping.isActive ? " · activo" : ""}</small>
      </button>
    `).join("")
    : `<div class="analizar-pdf-empty-state">No hay mapeos para ese filtro.</div>`;

  const mapping = getCurrentMappingDraft();
  els.mappingTitleInput.value = mapping.title || "";
  els.mappingBookTypeInput.value = mapping.bookType || "";
  els.mappingNivelInput.value = mapping.nivel || "";
  els.mappingGradoInput.value = mapping.grado || "";
  els.mappingUnidadInput.value = mapping.unidad || "";
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
  persistBibliographicDraft(session);
  persistActiveSessionId(session?.id || "");
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
  renderMappingsModal();
  renderExportConfigModal();
}

async function refreshSessions(preferredSessionId = "") {
  const sessions = await loadSessions();
  store.setSessions(sessions);
  syncPersistedTitleMap();
  const fallbackId = preferredSessionId || state.activeSessionId || restoreActiveSessionId() || sessions[0]?.id || "";
  store.setActiveSession(fallbackId);
  ensureActiveRevisionAndFile(store.getActiveSession());
  renderAll();
}

async function refreshStyleMappings(preferredMappingId = "") {
  const payload = await listAnalizarPdfStyleMappings();
  state.styleMappings = Array.isArray(payload?.mappings) ? payload.mappings.map((entry, index) => normalizeStyleMapping(entry, index)) : [];
  state.activeMappingId = preferredMappingId || state.activeMappingId || state.styleMappings[0]?.id || "";
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

function createDraftRevision(session = null) {
  const defaultMapping = resolveDefaultMappingForSession(session);
  const timestamp = new Date().toISOString();
  return {
    id: `revision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    revisionKey: buildDraftRevisionKey(),
    title: "Nueva ficha editorial",
    unidad: "",
    revisionNumero: "",
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

function upsertRevisionIntoSession(session = null, filesToMerge = []) {
  const draft = structuredClone(session || {});
  const defaultMapping = resolveDefaultMappingForSession(draft);
  draft.revisions = Array.isArray(draft.revisions) ? draft.revisions : [];
  const revisionInfo = getRevisionDraftInfo(draft);
  const revisionKey = buildRevisionKey(revisionInfo);
  const activeRevisionId = String(state.activeRevisionId || "").trim();
  const activeRevision = activeRevisionId
    ? draft.revisions.find((entry) => String(entry?.id || "").trim() === activeRevisionId) || null
    : null;
  const isActiveDraft = Boolean(activeRevision && String(activeRevision.revisionKey || "").startsWith("__draft__"));
  if (!revisionKey && !isActiveDraft) {
    return { session: draft, revision: null, addedFiles: [] };
  }
  const revisionTitle = revisionKey ? buildRevisionTitle(revisionInfo) : String(activeRevision?.title || "Nueva ficha editorial").trim();
  let revision = null;
  const existingByKey = draft.revisions.find((entry) => String(entry?.revisionKey || "").trim() === revisionKey) || null;
  if (isActiveDraft) {
    if (existingByKey && existingByKey.id !== activeRevision.id && !(activeRevision.files || []).length) {
      draft.revisions = draft.revisions.filter((entry) => entry.id !== activeRevision.id);
      revision = existingByKey;
    } else {
      revision = activeRevision;
    }
  } else {
    revision = existingByKey;
  }
  if (!revision) {
    revision = {
      id: `revision_${Date.now()}`,
      revisionKey,
      title: revisionTitle,
      unidad: revisionInfo.unidad,
      revisionNumero: revisionInfo.revisionNumero,
      mappingId: String(defaultMapping?.id || "").trim(),
      mappingTitle: String(defaultMapping?.title || "").trim(),
      mappingUpdatedAt: String(defaultMapping?.updatedAt || "").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    draft.revisions.push(revision);
  } else {
    revision.title = revisionTitle;
    if (revisionKey) {
      revision.revisionKey = revisionKey;
      revision.unidad = revisionInfo.unidad;
      revision.revisionNumero = revisionInfo.revisionNumero;
    }
    revision.mappingId = String(revision.mappingId || defaultMapping?.id || "").trim();
    revision.mappingTitle = String(revision.mappingTitle || defaultMapping?.title || "").trim();
    revision.mappingUpdatedAt = String(revision.mappingUpdatedAt || defaultMapping?.updatedAt || "").trim();
    revision.updatedAt = new Date().toISOString();
  }
  revision.files = Array.isArray(revision.files) ? revision.files : [];
  const addedFiles = [];
  for (const candidate of filesToMerge) {
    const documentName = String(candidate?.name || candidate?.documentName || "").trim();
    if (!documentName) continue;
    const fileKey = buildFileKey(documentName);
    const existing = revision.files.find((entry) => String(entry?.fileKey || "").trim() === fileKey);
    if (existing) {
      existing.documentName = documentName;
      existing.sourceType = getNormalizedSourceType(candidate?.sourceType || draft.sourceType);
      existing.mappingId = String(existing.mappingId || revision.mappingId || defaultMapping?.id || "").trim();
      existing.mappingTitle = String(existing.mappingTitle || revision.mappingTitle || defaultMapping?.title || "").trim();
      existing.mappingUpdatedAt = String(existing.mappingUpdatedAt || revision.mappingUpdatedAt || defaultMapping?.updatedAt || "").trim();
      existing.updatedAt = new Date().toISOString();
      addedFiles.push(existing);
      continue;
    }
  const fileEntry = {
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fileKey,
      documentName,
      mappingId: String(revision.mappingId || defaultMapping?.id || "").trim(),
      mappingTitle: String(revision.mappingTitle || defaultMapping?.title || "").trim(),
      mappingUpdatedAt: String(revision.mappingUpdatedAt || defaultMapping?.updatedAt || "").trim(),
      sourceAssetPath: "",
      localBlobKey: "",
      hasLocalSource: false,
      fileSize: 0,
      fileLastModified: 0,
      fileMimeType: "",
      sourceType: getNormalizedSourceType(candidate?.sourceType || draft.sourceType),
      analysisStatus: "idle",
      analysisJobId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resultSummary: {
        paginationIssueCount: 0,
        sectionIssueCount: 0,
        spellingIssueCount: 0,
        orthotypographyIssueCount: 0,
        colorIssueCount: 0,
        recortableIssueCount: 0,
        pageCount: 0,
        analyzedAt: ""
      },
      result: {
        paginationIssues: [],
        sectionIssues: [],
        spellingIssues: [],
        orthotypographyIssues: [],
        colorIssues: [],
        recortableIssues: [],
        stats: null
      }
    };
    revision.files.push(fileEntry);
    addedFiles.push(fileEntry);
  }
  revision.fileCount = revision.files.length;
  revision.summary = buildRevisionSummary(revision.files);
  if (revisionKey) {
    revision.revisionKey = revisionKey;
    revision.title = revisionTitle;
    revision.unidad = revisionInfo.unidad;
    revision.revisionNumero = revisionInfo.revisionNumero;
  }
  state.activeRevisionId = revision.id;
  if (addedFiles.length) {
    state.activeFileId = addedFiles[addedFiles.length - 1].id;
  } else {
    state.activeFileId = String(revision.files?.[0]?.id || "").trim();
  }
  return { session: draft, revision, addedFiles };
}

function resolveSessionForPersistence(session = null, filesToMerge = []) {
  const draft = structuredClone(session || {});
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
  return upsertRevisionIntoSession(draft, filesToMerge).session;
}

async function persistActiveSession(filesToMerge = []) {
  const session = store.getActiveSession();
  if (!session) throw new Error("No hay sesión activa.");
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
  const saved = await saveSession(candidate);
  logAnalizarPdfFlow("persistActiveSession:saved", {
    previousId,
    savedId: saved?.id || "",
    revisionCount: Array.isArray(saved?.revisions) ? saved.revisions.length : 0,
  });
  if (previousId && previousId !== saved.id) {
    state.sessions = state.sessions.filter((entry) => String(entry?.id || "").trim() !== previousId);
  }
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  ensureActiveRevisionAndFile(saved);
  syncPersistedTitleMap();
  renderAll();
  return saved;
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

function mutateActiveMapping(mutator) {
  const active = getActiveMapping() || createEmptyMappingDraft();
  const next = typeof mutator === "function" ? normalizeStyleMapping(mutator(structuredClone(active)) || active) : active;
  const mappings = Array.isArray(state.styleMappings) ? [...state.styleMappings] : [];
  const existingIndex = mappings.findIndex((entry) => entry.id === next.id && next.id);
  if (existingIndex >= 0) {
    mappings.splice(existingIndex, 1, next);
  } else if (next.id) {
    mappings.unshift(next);
  } else {
    state.activeMappingId = "";
    state.__mappingDraft = next;
    renderMappingsModal();
    return next;
  }
  state.styleMappings = mappings;
  state.activeMappingId = next.id;
  renderMappingsModal();
  return next;
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
  return next;
}

function mergeSavedMappingWithDraft(savedRaw = {}, draftRaw = {}) {
  const saved = normalizeStyleMapping(savedRaw);
  const draft = normalizeStyleMapping(draftRaw);
  const draftEntriesById = new Map((draft.entries || []).map((entry) => [entry.id, entry]));
  return normalizeStyleMapping({
    ...saved,
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
    element.addEventListener("change", () => {
      mutateActiveSession((session) => {
        session.bibliographicInfo[field] = String(element.value || "").trim();
        session.title = buildDerivedSessionTitle(session);
        session.sessionKey = buildSessionKey(getSessionBaseInfo(session));
        return session;
      });
    });
  });

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
    const revision = getActiveRevision(store.getActiveSession());
    if (revision) {
      mutateActiveSession((session) => {
        session.bibliographicInfo.unidad = revision.unidad || "";
        session.bibliographicInfo.revisionNumero = revision.revisionNumero || "";
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

  els.fileList?.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="select-file"]');
    if (!button) return;
    state.activeFileId = String(button.dataset.fileId || "").trim();
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
    state.__mappingDraft = createEmptyMappingDraft();
    renderMappingsModal();
  });

  els.mappingsList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mapping-id]");
    if (!button) return;
    state.activeMappingId = String(button.dataset.mappingId || "").trim();
    state.__mappingDraft = normalizeStyleMapping(getActiveMapping() || {});
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
      await persistActiveSession();
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
      const payload = await exportAnalizarPdfCorrectedIdml(session.id, revision.id, file.id, exportRequest, cleanupOptions);
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
    if (state.isAnalyzingCurrent || state.isAnalyzingAll || state.isSavingSession) {
      return;
    }
    const session = store.getActiveSession();
    const uploadState = getUploadUiState(session);
    if (!session) {
      setJobMetaText("Crea una sesión antes de analizar.");
      return;
    }
    try {
      state.isAnalyzingCurrent = true;
      logAnalizarPdfFlow("analyzeBtn:start", {
        sessionId: session?.id || "",
        selectedFiles: uploadState.files.map((file) => file?.name || ""),
        sourceType: uploadState.sourceType,
      });
      setBusyOverlay("Preparando análisis de la ficha editorial");
      renderActionButtonState();
      await flushUiFrame();
      const filesToMerge = uploadState.files.map((file) => ({
        name: file.name,
        sourceType: uploadState.sourceType
      }));
      logAnalizarPdfFlow("analyzeBtn:files-to-merge", { filesToMerge });
      const saved = await persistActiveSession(filesToMerge);
      setBusyOverlay("Analizando ficha editorial");
      renderActionButtonState();
      await flushUiFrame();
      const targets = await buildAnalysisTargets(saved, uploadState.files.length ? uploadState.files : []);
      logAnalizarPdfFlow("analyzeBtn:targets", {
        targetCount: targets.length,
        targets: targets.map((target) => ({
          revisionId: target.revision?.id || "",
          fileId: target.targetFile?.id || "",
          fileName: target.selectedFile?.name || "",
        })),
      });
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
    try {
      state.isAnalyzingAll = true;
      setBusyOverlay("Preparando análisis completo");
      renderActionButtonState();
      await flushUiFrame();
      const filesToMerge = uploadState.files.map((file) => ({
        name: file.name,
        sourceType: uploadState.sourceType
      }));
      const saved = await persistActiveSession(filesToMerge);
      setBusyOverlay("Analizando todas las fichas editoriales");
      renderActionButtonState();
      await flushUiFrame();
      const targets = await buildAnalysisTargetsForAll(saved, uploadState.files.length ? uploadState.files : []);
      await runAnalysisForTargets(
        saved,
        targets,
        uploadState.files.length
          ? "No se pudieron resolver los archivos seleccionados para el análisis completo."
          : "No hay archivos locales disponibles en las fichas editoriales para un análisis completo."
      );
      state.selectedFiles = [];
      els.fileInput.value = "";
      renderAll();
      rehydrateSelectedFilesForActiveContext().catch(() => {});
    } catch (error) {
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

async function startPolling(jobId = "") {
  window.clearTimeout(state.analysisPollTimer);
  const cleanJobId = String(jobId || "").trim();
  logAnalizarPdfFlow("startPolling:start", { jobId: cleanJobId });
  if (!cleanJobId) return;
  const tick = async () => {
    try {
      const payload = await pollAnalysisStatus(cleanJobId);
      logAnalizarPdfFlow("startPolling:tick", {
        jobId: cleanJobId,
        status: payload?.status || "",
        hasSession: Boolean(payload?.session),
        error: payload?.error || "",
      });
      const session = payload?.session || null;
      if (session) {
        store.upsertSession(session);
      }
      setJobMetaText(formatJobMeta(payload, buildRenderableSession(session)));
      renderAll();
      if (payload?.status === "queued" || payload?.status === "processing") {
        state.analysisPollTimer = window.setTimeout(tick, 2500);
        logAnalizarPdfFlow("startPolling:scheduled-next", { jobId: cleanJobId });
      }
    } catch (error) {
      logAnalizarPdfFlow("startPolling:error", {
        jobId: cleanJobId,
        message: String(error?.message || error),
      });
      setJobMetaText(String(error?.message || error));
    }
  };
  await tick();
}

async function bootstrap() {
  sidepanelApi.bindEvents();
  bindEditorEvents();
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
