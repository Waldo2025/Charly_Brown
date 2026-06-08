import {
  deleteAnalizarPdfSession,
  getAnalizarPdfAnalysisStatus,
  listAnalizarPdfSessions,
  queueAnalizarPdfUpload,
  saveAnalizarPdfSession
} from "./analizar-pdf-api.js";

const EMPTY_RESULT = Object.freeze({
  paginationIssues: [],
  sectionIssues: [],
  spellingIssues: [],
  orthotypographyIssues: [],
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
  "failed"
]);

const EMPTY_BIBLIOGRAPHIC_INFO = Object.freeze({
  bookType: "",
  nivel: "",
  grado: "",
  trimestre: "",
  unidad: "",
  edicionNumero: "",
  revisionNumero: ""
});

function normalizeBibliographicInfo(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    bookType: String(source.bookType || "").trim(),
    nivel: String(source.nivel || "").trim(),
    grado: String(source.grado || "").trim(),
    trimestre: String(source.trimestre || "").trim(),
    unidad: String(source.unidad || "").trim(),
    edicionNumero: String(source.edicionNumero || "").trim(),
    revisionNumero: String(source.revisionNumero || "").trim()
  };
}

function normalizeColorEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(source.id || `color_${index + 1}`).trim() || `color_${index + 1}`,
    swatchName: String(source.swatchName || "").trim(),
    cmyk: String(source.cmyk || "").trim(),
    hex: String(source.hex || "").trim()
  };
}

function normalizeAnalysisStatus(value = "") {
  const normalized = String(value || "").trim();
  return ALLOWED_ANALYSIS_STATUSES.has(normalized) ? normalized : "idle";
}

function normalizeResult(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    paginationIssues: Array.isArray(source.paginationIssues) ? source.paginationIssues : [],
    sectionIssues: Array.isArray(source.sectionIssues) ? source.sectionIssues : [],
    spellingIssues: Array.isArray(source.spellingIssues) ? source.spellingIssues : [],
    orthotypographyIssues: Array.isArray(source.orthotypographyIssues) ? source.orthotypographyIssues : [],
    colorIssues: Array.isArray(source.colorIssues) ? source.colorIssues : [],
    recortableIssues: Array.isArray(source.recortableIssues) ? source.recortableIssues : [],
    stats: source.stats && typeof source.stats === "object" ? source.stats : null
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
  const result = normalizeResult(source.result);
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
    sourceStoragePath: String(source.sourceStoragePath || "").trim(),
    sourceDownloadUrl: String(source.sourceDownloadUrl || "").trim(),
    correctedStoragePath: String(source.correctedStoragePath || "").trim(),
    correctedDownloadUrl: String(source.correctedDownloadUrl || "").trim(),
    correctedExportedAt: String(source.correctedExportedAt || "").trim(),
    sourceType: source.sourceType === "idml" ? "idml" : "pdf",
    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisJobId: String(source.analysisJobId || "").trim(),
    createdAt: String(source.createdAt || "").trim(),
    updatedAt: String(source.updatedAt || "").trim(),
    resultSummary: normalizeResultSummary(source.resultSummary, result),
    result
  };
}

function normalizeRevisionEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const files = Array.isArray(source.files) ? source.files.map((entry, fileIndex) => normalizeFileEntry(entry, fileIndex)) : [];
  const summarySource = source.summary && typeof source.summary === "object" ? source.summary : {};
  return {
    id: String(source.id || `revision_${index + 1}`).trim() || `revision_${index + 1}`,
    revisionKey: String(source.revisionKey || buildRevisionKey(source) || `revision_${index + 1}`).trim() || `revision_${index + 1}`,
    title: String(source.title || buildRevisionTitle(source)).trim() || buildRevisionTitle(source),
    unidad: String(source.unidad || "").trim(),
    revisionNumero: String(source.revisionNumero || "").trim(),
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
      colorIssueCount: Number(summarySource.colorIssueCount || 0) || 0,
      recortableIssueCount: Number(summarySource.recortableIssueCount || 0) || 0,
    },
    files
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
    ownerId: String(source.ownerId || "").trim(),
    createdAt: String(source.createdAt || "").trim(),
    updatedAt: String(source.updatedAt || "").trim(),
    sessionKey: String(source.sessionKey || buildSessionKey(bibliographicInfo)).trim(),
    sourceType: source.sourceType === "idml" ? "idml" : "pdf",
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
    title: "Nueva sesión",
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

export async function saveSession(session = null) {
  const payload = await saveAnalizarPdfSession(normalizeAnalizarPdfSession(session));
  return normalizeAnalizarPdfSession(payload?.session || session);
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
