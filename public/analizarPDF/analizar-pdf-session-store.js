import {
  deleteAnalizarPdfSession,
  getAnalizarPdfSessionDetail,
  getAnalizarPdfAnalysisStatus,
  listAnalizarPdfSessions,
  queueAnalizarPdfUpload,
  saveAnalizarPdfSession
} from "./analizar-pdf-api.js?v=2026-1.0.10.590";
import { createAnalizarPdfSaveCoordinator } from "./analizar-pdf-save-coordinator.js";

const EMPTY_RESULT = Object.freeze({
  paginationIssues: [],
  sectionIssues: [],
  spellingIssues: [],
  orthotypographyIssues: [],
  redactionIssues: [],
  noteIssues: [],
  noteHistoryIssues: [],
  trackedChangeIssues: [],
  customRuleIssues: [],
  colorIssues: [],
  recortableIssues: [],
  stats: null
});

const ALLOWED_ANALYSIS_STATUSES = new Set([
  "idle",
  "uploading",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled"
]);

const EMPTY_BIBLIOGRAPHIC_INFO = Object.freeze({
  bookType: "",
  nivel: "",
  grado: "",
  trimestre: "",
  unidad: "",
  edicionNumero: "",
  revisionNumero: "",
  recortableRole: "source"
});

const saveCoordinator = createAnalizarPdfSaveCoordinator({
  saveImpl: async (session) => {
    const normalized = normalizeAnalizarPdfSession(session);
    const payload = await saveAnalizarPdfSession(
      stripAnalysisResultsFromSession(normalized),
      collectAnalysisResultsForRemoteStorage(normalized)
    );
    return normalizeAnalizarPdfSession(payload?.session || session);
  }
});

function normalizeBibliographicInfo(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalizedRole = String(source.recortableRole || "").trim().toLowerCase();
  return {
    bookType: String(source.bookType || "").trim(),
    nivel: String(source.nivel || "").trim(),
    grado: String(source.grado || "").trim(),
    trimestre: String(source.trimestre || "").trim(),
    unidad: String(source.unidad || "").trim(),
    edicionNumero: String(source.edicionNumero || "").trim(),
    revisionNumero: String(source.revisionNumero || "").trim(),
    recortableRole: ["source", "destination", "both"].includes(normalizedRole) ? normalizedRole : "source"
  };
}

function normalizeColorEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const swatchName = String(source.swatchName || source.name || "").trim();
  return {
    id: String(source.id || `color_${index + 1}`).trim() || `color_${index + 1}`,
    name: swatchName,
    swatchName,
    cmyk: String(source.cmyk || "").trim(),
    hex: String(source.hex || "").trim(),
    usageCount: Math.max(0, Number(source.usageCount || 0) || 0),
    pageCount: Math.max(0, Number(source.pageCount || 0) || 0)
  };
}

function normalizeAnalysisStatus(value = "") {
  const normalized = String(value || "").trim();
  return ALLOWED_ANALYSIS_STATUSES.has(normalized) ? normalized : "idle";
}

function normalizeResult(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const stats = source.stats && typeof source.stats === "object"
    ? {
      ...source.stats,
      swatchInventory: Array.isArray(source.stats.swatchInventory)
        ? source.stats.swatchInventory.map((entry, index) => normalizeColorEntry(entry, index))
        : [],
    }
    : null;
  return {
    paginationIssues: Array.isArray(source.paginationIssues) ? source.paginationIssues : [],
    sectionIssues: Array.isArray(source.sectionIssues) ? source.sectionIssues : [],
    spellingIssues: Array.isArray(source.spellingIssues) ? source.spellingIssues : [],
    orthotypographyIssues: Array.isArray(source.orthotypographyIssues) ? source.orthotypographyIssues : [],
    redactionIssues: Array.isArray(source.redactionIssues) ? source.redactionIssues : [],
    noteIssues: Array.isArray(source.noteIssues) ? source.noteIssues : [],
    noteHistoryIssues: Array.isArray(source.noteHistoryIssues) ? source.noteHistoryIssues : [],
    trackedChangeIssues: Array.isArray(source.trackedChangeIssues) ? source.trackedChangeIssues : [],
    customRuleIssues: Array.isArray(source.customRuleIssues) ? source.customRuleIssues : [],
    colorIssues: Array.isArray(source.colorIssues) ? source.colorIssues : [],
    recortableIssues: Array.isArray(source.recortableIssues) ? source.recortableIssues : [],
    stats
  };
}

function normalizeResultSummary(raw = {}, result = EMPTY_RESULT) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    paginationIssueCount: Number(source.paginationIssueCount) >= 0
      ? Number(source.paginationIssueCount)
      : result.paginationIssues.length,
    sectionIssueCount: Number(source.sectionIssueCount) >= 0
      ? Number(source.sectionIssueCount)
      : result.sectionIssues.length,
    spellingIssueCount: Number(source.spellingIssueCount) >= 0
      ? Number(source.spellingIssueCount)
      : result.spellingIssues.length,
    orthotypographyIssueCount: Number(source.orthotypographyIssueCount) >= 0
      ? Number(source.orthotypographyIssueCount)
      : result.orthotypographyIssues.length,
    redactionIssueCount: Number(source.redactionIssueCount) >= 0
      ? Number(source.redactionIssueCount)
      : result.redactionIssues.length,
    noteIssueCount: Number(source.noteIssueCount) >= 0 ? Number(source.noteIssueCount) : (Array.isArray(result?.noteIssues) ? result.noteIssues.length : 0),
    trackedChangeIssueCount: Number(source.trackedChangeIssueCount) >= 0 ? Number(source.trackedChangeIssueCount) : (Array.isArray(result?.trackedChangeIssues) ? result.trackedChangeIssues.length : 0),
    customRuleIssueCount: Number(source.customRuleIssueCount) >= 0 ? Number(source.customRuleIssueCount) : (Array.isArray(result?.customRuleIssues) ? result.customRuleIssues.length : 0),
    colorIssueCount: Number(source.colorIssueCount) >= 0
      ? Number(source.colorIssueCount)
      : result.colorIssues.length,
    recortableIssueCount: Number(source.recortableIssueCount) >= 0
      ? Number(source.recortableIssueCount)
      : result.recortableIssues.length,
    pageCount: Number(source.pageCount) >= 0
      ? Number(source.pageCount)
      : Math.max(0, Number(result?.stats?.pageCount || 0) || 0),
    analyzedAt: String(source.analyzedAt || "").trim()
  };
}

function normalizeQuickAnalysisIssue(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    pageName: String(source.pageName || "").trim(),
    storyId: String(source.storyId || "").trim(),
    styleName: String(source.styleName || "").trim(),
    paragraphText: String(source.paragraphText || "").trim(),
    excerpt: String(source.excerpt || "").trim(),
    suggestion: String(source.suggestion || "").trim(),
    message: String(source.message || "").trim(),
    context: String(source.context || "").trim(),
  };
}

function normalizeQuickAnalysis(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const pages = Array.isArray(raw.pages)
    ? raw.pages.map((page) => ({
      pageName: String(page?.pageName || "").trim(),
      issues: Array.isArray(page?.issues) ? page.issues.map((issue) => normalizeQuickAnalysisIssue(issue)) : [],
    })).filter((page) => page.pageName && page.issues.length)
    : [];
  return {
    status: String(raw.status || "").trim() || "idle",
    analyzedAt: String(raw.analyzedAt || "").trim(),
    orthotypographyIssueCount: Number(raw.orthotypographyIssueCount) >= 0
      ? Number(raw.orthotypographyIssueCount)
      : pages.reduce((total, page) => total + page.issues.length, 0),
    pageCount: Number(raw.pageCount || 0) || 0,
    pages,
  };
}

function stripAnalysisResultFromFileEntry(file = {}) {
  return {
    ...file,
    analysisStatus: "idle",
    analysisJobId: "",
    resultSummary: normalizeResultSummary({}, EMPTY_RESULT),
    result: { ...EMPTY_RESULT },
    quickAnalysis: null
  };
}

export function stripAnalysisResultsFromSession(session = null) {
  const normalized = normalizeAnalizarPdfSession(session || {});
  return normalizeAnalizarPdfSession({
    ...normalized,
    analysisStatus: "idle",
    analysisJobId: "",
    resultSummary: normalizeResultSummary({}, EMPTY_RESULT),
    result: { ...EMPTY_RESULT },
    revisions: (Array.isArray(normalized.revisions) ? normalized.revisions : []).map((revision) => ({
      ...revision,
      latestAnalysisAt: "",
      summary: {
        paginationIssueCount: 0,
        sectionIssueCount: 0,
        spellingIssueCount: 0,
        orthotypographyIssueCount: 0,
        redactionIssueCount: 0,
        colorIssueCount: 0,
        recortableIssueCount: 0,
      },
      files: (Array.isArray(revision.files) ? revision.files : []).map((file) => stripAnalysisResultFromFileEntry(file))
    }))
  });
}

export function collectAnalysisResultsForRemoteStorage(session = null) {
  const normalized = normalizeAnalizarPdfSession(session || {});
  const results = [];
  for (const revision of Array.isArray(normalized.revisions) ? normalized.revisions : []) {
    for (const file of Array.isArray(revision.files) ? revision.files : []) {
      const hasResult = Boolean(file?.result?.stats || file?.resultSummary?.pageCount || file?.resultSummary?.analyzedAt);
      const hasQuickAnalysis = Boolean(file?.quickAnalysis);
      if (!hasResult && !hasQuickAnalysis) continue;
      results.push({
        revisionId: revision.id,
        fileId: file.id,
        documentName: file.documentName || "",
        sourceType: file.sourceType || normalized.sourceType || "",
        analysisStatus: file.analysisStatus || "completed",
        updatedAt: file.updatedAt || "",
        resultSummary: file.resultSummary || normalizeResultSummary({}, EMPTY_RESULT),
        result: hasResult ? file.result : { ...EMPTY_RESULT },
        quickAnalysis: file.quickAnalysis || null,
      });
    }
  }
  return results;
}

function buildSessionKey(info = {}) {
  return [
    String(info?.nivel || "").trim().toLowerCase(),
    String(info?.grado || "").trim().toLowerCase(),
    String(info?.trimestre || "").trim().toLowerCase(),
    String(info?.edicionNumero || "").trim().toLowerCase(),
  ].filter(Boolean).join("|");
}

function buildRevisionKey(raw = {}) {
  return [
    String(raw?.unidad || "").trim().toLowerCase(),
    String(raw?.revisionNumero || "").trim().toLowerCase(),
  ].filter(Boolean).join("|");
}

function buildRevisionTitle(raw = {}) {
  const parts = [
    String(raw?.unidad || "").trim(),
    String(raw?.revisionNumero || "").trim(),
  ].filter(Boolean);
  return parts.join(" · ") || "Revisión sin título";
}

function buildFileKey(name = "") {
  return String(name || "").trim().toLowerCase();
}

function normalizeFileEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const documentName = String(source.documentName || source.fileName || "").trim();
  const railTintHex = String(source.railTintHex || "").trim();
  const result = normalizeResult(source.result);
  const sourceReference = [
    documentName,
    source.sourceAssetPath,
    source.sourceStoragePath,
    source.sourceDownloadUrl
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
  const sourceType = source.sourceType === "idml" || /\.idml(?:\?|#|$)/i.test(sourceReference) ? "idml" : "pdf";
  return {
    id: String(source.id || `file_${index + 1}`).trim() || `file_${index + 1}`,
    fileKey: String(source.fileKey || buildFileKey(documentName) || `file_${index + 1}`).trim() || `file_${index + 1}`,
    documentName,
    mappingId: String(source.mappingId || "").trim(),
    mappingTitle: String(source.mappingTitle || "").trim(),
    mappingUpdatedAt: String(source.mappingUpdatedAt || "").trim(),
    sourceAssetPath: String(source.sourceAssetPath || "").trim(),
    localBlobKey: String(source.localBlobKey || "").trim(),
    hasLocalSource: source.hasLocalSource === true,
    fileSize: Number(source.fileSize || 0) || 0,
    fileLastModified: Number(source.fileLastModified || 0) || 0,
    fileMimeType: String(source.fileMimeType || "").trim(),
    workflowRole: ["source", "destination", "both"].includes(String(source.workflowRole || "").trim().toLowerCase())
      ? String(source.workflowRole || "").trim().toLowerCase()
      : "source",
    linkedAssetKind: ["recortable", "ficha", "anexo", "video"].includes(String(source.linkedAssetKind || "").trim().toLowerCase()) ? String(source.linkedAssetKind).trim().toLowerCase() : "",
    analysisSelected: source.analysisSelected !== false,
    detectedLanguageCode: String(source.detectedLanguageCode || result?.stats?.language?.resolvedCode || "").trim(),
    languageConfidence: Math.max(0, Math.min(1, Number(source.languageConfidence || result?.stats?.language?.confidence || 0) || 0)),
    sourceStoragePath: String(source.sourceStoragePath || "").trim(),
    sourceDownloadUrl: String(source.sourceDownloadUrl || "").trim(),
    correctedStoragePath: String(source.correctedStoragePath || "").trim(),
    correctedDownloadUrl: String(source.correctedDownloadUrl || "").trim(),
    correctedExportedAt: String(source.correctedExportedAt || "").trim(),
    sourceType,
    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisJobId: String(source.analysisJobId || "").trim(),
    createdAt: String(source.createdAt || "").trim(),
    updatedAt: String(source.updatedAt || "").trim(),
    railTintHex: /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(railTintHex) ? railTintHex : "",
    resultSummary: normalizeResultSummary(source.resultSummary, result),
    result,
    quickAnalysis: normalizeQuickAnalysis(source.quickAnalysis)
  };
}

function normalizeRevisionEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const files = Array.isArray(source.files) ? source.files.map((entry, fileIndex) => normalizeFileEntry(entry, fileIndex)) : [];
  const summarySource = source.summary && typeof source.summary === "object" ? source.summary : {};
  const unidad = String(source.unidad || "").trim();
  const normalizedRole = String(source.recortableRole || "").trim().toLowerCase();
  return {
    id: String(source.id || `revision_${index + 1}`).trim() || `revision_${index + 1}`,
    revisionKey: String(source.revisionKey || buildRevisionKey(source) || `revision_${index + 1}`).trim() || `revision_${index + 1}`,
    title: String(source.title || buildRevisionTitle(source)).trim() || buildRevisionTitle(source),
    unidad: String(source.unidad || "").trim(),
    revisionNumero: String(source.revisionNumero || "").trim(),
    workflowRole: ["source", "destination", "both"].includes(String(source.workflowRole || "").trim().toLowerCase())
      ? String(source.workflowRole || "").trim().toLowerCase()
      : "source",
    linkedAssetKind: ["recortable", "ficha", "anexo", "video"].includes(String(source.linkedAssetKind || "").trim().toLowerCase()) ? String(source.linkedAssetKind).trim().toLowerCase() : "",
    detectedStructure: source.detectedStructure && typeof source.detectedStructure === "object" ? source.detectedStructure : { type: "", label: "", ordinal: null, source: "" },
    recortableRole: /^recortables$/i.test(unidad)
      ? (["source", "destination", "both"].includes(normalizedRole) ? normalizedRole : "source")
      : "",
    mappingId: String(source.mappingId || "").trim(),
    mappingTitle: String(source.mappingTitle || "").trim(),
    mappingUpdatedAt: String(source.mappingUpdatedAt || "").trim(),
    createdAt: String(source.createdAt || "").trim(),
    updatedAt: String(source.updatedAt || "").trim(),
    latestAnalysisAt: String(source.latestAnalysisAt || "").trim(),
    fileCount: Number(source.fileCount) >= 0 ? Number(source.fileCount) : files.length,
    summary: {
      paginationIssueCount: Number(summarySource.paginationIssueCount || 0) || 0,
      sectionIssueCount: Number(summarySource.sectionIssueCount || 0) || 0,
      spellingIssueCount: Number(summarySource.spellingIssueCount || 0) || 0,
      orthotypographyIssueCount: Number(summarySource.orthotypographyIssueCount || 0) || 0,
      redactionIssueCount: Number(summarySource.redactionIssueCount || 0) || 0,
      noteIssueCount: Number(summarySource.noteIssueCount || 0) || 0,
      trackedChangeIssueCount: Number(summarySource.trackedChangeIssueCount || 0) || 0,
      colorIssueCount: Number(summarySource.colorIssueCount || 0) || 0,
      recortableIssueCount: Number(summarySource.recortableIssueCount || 0) || 0,
    },
    files
  };
}

function normalizeAnalysisRuleConfig(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const ids = Array.isArray(source.customRuleIds)
    ? [...new Set(source.customRuleIds.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 20)
    : [];
  return {
    customRuleIds: ids,
    catalogVersion: String(source.catalogVersion || "").trim(),
    customRules: Array.isArray(source.customRules)
      ? source.customRules.filter((rule) => rule && typeof rule === "object" && ids.includes(String(rule.id || ""))).slice(0, 20)
      : []
  };
}

export function normalizeAnalizarPdfSession(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sections = Array.isArray(source?.indexConfig?.sections)
    ? source.indexConfig.sections.map((entry, index) => ({
      id: String(entry?.id || `section_${index + 1}`).trim() || `section_${index + 1}`,
      title: String(entry?.title || "").trim(),
      expectedPageNumber: Number(entry?.expectedPageNumber || 0) || 0
    }))
    : [];
  const result = normalizeResult(source.result);
  const bibliographicInfo = normalizeBibliographicInfo(source.bibliographicInfo || EMPTY_BIBLIOGRAPHIC_INFO);
  const revisions = Array.isArray(source.revisions)
    ? source.revisions.map((entry, index) => normalizeRevisionEntry(entry, index))
    : [];
  return {
    id: String(source.id || "").trim(),
    title: String(source.title || "").trim() || "Sesión sin título",
    customTitle: String(source.customTitle || "").trim(),
    ownerId: String(source.ownerId || "").trim(),
    createdAt: String(source.createdAt || "").trim(),
    updatedAt: String(source.updatedAt || "").trim(),
    sessionKey: String(source.sessionKey || buildSessionKey(bibliographicInfo)).trim(),
    sourceType: source.sourceType === "idml" ? "idml" : "pdf",
    workflowFormat: source.workflowFormat === "libre" ? "libre" : "en_forma",
    analysisRuleConfig: normalizeAnalysisRuleConfig(source.analysisRuleConfig),
    languageCode: ["auto", "es-MX", "en-US", "fr-FR", "pt-BR", "de-DE", "it-IT", "ca-ES"].includes(String(source.languageCode || "")) ? String(source.languageCode) : "es-MX",
    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisJobId: String(source.analysisJobId || "").trim(),
    bibliographicInfo,
    colorConfig: {
      palette: Array.isArray(source?.colorConfig?.palette)
        ? source.colorConfig.palette.map((entry, index) => normalizeColorEntry(entry, index))
        : []
    },
    indexConfig: {
      indexPageNumber: Number(source?.indexConfig?.indexPageNumber || 0) || 0,
      temarioPageNumber: Number(source?.indexConfig?.temarioPageNumber || 0) || 0,
      sections
    },
    resultSummary: normalizeResultSummary(source.resultSummary, result),
    result,
    revisions,
    comparisons: Array.isArray(source.comparisons) ? source.comparisons : []
  };
}

export function createEmptyAnalizarPdfSession() {
  return normalizeAnalizarPdfSession({
    title: "Nuevo análisis",
    sourceType: "pdf",
    analysisStatus: "idle",
    bibliographicInfo: { ...EMPTY_BIBLIOGRAPHIC_INFO },
    colorConfig: { palette: [] },
    indexConfig: {
      indexPageNumber: 0,
      temarioPageNumber: 0,
      sections: []
    },
    result: { ...EMPTY_RESULT },
    revisions: [],
    comparisons: []
  });
}

export async function loadSessions() {
  const payload = await listAnalizarPdfSessions();
  return Array.isArray(payload?.sessions) ? payload.sessions.map((item) => normalizeAnalizarPdfSession(item)) : [];
}

export async function loadSessionDetail(sessionId = "") {
  const payload = await getAnalizarPdfSessionDetail(sessionId);
  return payload?.session ? normalizeAnalizarPdfSession(payload.session) : null;
}

export async function saveSession(session = null, options = {}) {
  const includeAnalysis = options?.includeAnalysis === true;
  const saved = await saveCoordinator.save(normalizeAnalizarPdfSession(session));
  return includeAnalysis ? normalizeAnalizarPdfSession({
    ...session,
    id: saved?.id || session?.id || "",
    ownerId: saved?.ownerId || session?.ownerId || "",
    createdAt: saved?.createdAt || session?.createdAt || "",
    updatedAt: saved?.updatedAt || session?.updatedAt || "",
  }) : normalizeAnalizarPdfSession({
    ...session,
    id: saved?.id || session?.id || "",
    ownerId: saved?.ownerId || session?.ownerId || "",
    createdAt: saved?.createdAt || session?.createdAt || "",
    updatedAt: saved?.updatedAt || session?.updatedAt || "",
  });
}

export async function deleteSession(sessionId = "") {
  await deleteAnalizarPdfSession(sessionId);
}

export async function queuePdfAnalysis(sessionId = "", file = null) {
  return queueAnalizarPdfUpload(sessionId, file);
}

export async function pollAnalysisStatus(jobId = "") {
  return getAnalizarPdfAnalysisStatus(jobId);
}

export function createAnalizarPdfSessionStore(deps = {}) {
  const state = deps.state || {
    sessions: [],
    activeSessionId: ""
  };

  function getSessions() {
    return Array.isArray(state.sessions) ? state.sessions : [];
  }

  function setSessions(next = []) {
    state.sessions = Array.isArray(next) ? next.map((item) => normalizeAnalizarPdfSession(item)) : [];
    return getSessions();
  }

  function getActiveSession() {
    return getSessions().find((session) => session.id === state.activeSessionId) || null;
  }

  function getActiveRevision() {
    const session = getActiveSession();
    if (!session) return null;
    const activeRevisionId = String(state.activeRevisionId || "").trim();
    return session.revisions.find((revision) => revision.id === activeRevisionId) || session.revisions[0] || null;
  }

  function setActiveSession(sessionId = "") {
    state.activeSessionId = String(sessionId || "").trim();
    return getActiveSession();
  }

  function setActiveRevision(revisionId = "") {
    state.activeRevisionId = String(revisionId || "").trim();
    return getActiveRevision();
  }

  function upsertSession(session = null) {
    const normalized = normalizeAnalizarPdfSession(session);
    const current = getSessions();
    const index = current.findIndex((item) => item.id === normalized.id);
    if (index === -1) {
      state.sessions = [normalized, ...current];
    } else {
      const next = current.slice();
      next.splice(index, 1, normalized);
      state.sessions = next;
    }
    if (!state.activeSessionId && normalized.id) state.activeSessionId = normalized.id;
    return normalized;
  }

  return {
    getSessions,
    setSessions,
    getActiveSession,
    getActiveRevision,
    setActiveSession,
    setActiveRevision,
    upsertSession
  };
}
