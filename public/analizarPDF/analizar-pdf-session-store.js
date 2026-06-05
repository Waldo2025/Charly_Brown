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
    pageCount: Number(source.pageCount) >= 0
      ? Number(source.pageCount)
      : Math.max(0, Number(result?.stats?.pageCount || 0) || 0),
    analyzedAt: String(source.analyzedAt || "").trim()
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
  return {
    id: String(source.id || "").trim(),
    title: String(source.title || "").trim() || "Sesión sin título",
    ownerId: String(source.ownerId || "").trim(),
    createdAt: String(source.createdAt || "").trim(),
    updatedAt: String(source.updatedAt || "").trim(),
    sourceType: source.sourceType === "idml" ? "idml" : "pdf",
    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisJobId: String(source.analysisJobId || "").trim(),
    bibliographicInfo: normalizeBibliographicInfo(source.bibliographicInfo || EMPTY_BIBLIOGRAPHIC_INFO),
    colorConfig: {
      palette: Array.isArray(source?.colorConfig?.palette)
        ? source.colorConfig.palette.map((entry, index) => normalizeColorEntry(entry, index))
        : []
    },
    indexConfig: {
      indexPageNumber: Number(source?.indexConfig?.indexPageNumber || 0) || 0,
      sections
    },
    resultSummary: normalizeResultSummary(source.resultSummary, result),
    result
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
      sections: []
    },
    result: { ...EMPTY_RESULT }
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

  function setActiveSession(sessionId = "") {
    state.activeSessionId = String(sessionId || "").trim();
    return getActiveSession();
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
    setActiveSession,
    upsertSession
  };
}
