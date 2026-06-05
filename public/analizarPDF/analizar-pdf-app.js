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
import { queueAnalizarPdfUpload } from "./analizar-pdf-api.js";

const state = {
  sessions: [],
  activeSessionId: "",
  currentUser: null,
  selectedFile: null,
  analysisPollTimer: 0
};

const els = {
  authState: document.getElementById("analizarPdfAuthState"),
  sessionList: document.getElementById("analizarPdfSessionList"),
  createSessionBtn: document.querySelector('[data-action="create-session"]'),
  sessionTitleLabel: document.getElementById("analizarPdfSessionTitleLabel"),
  sessionTitleInput: document.getElementById("analizarPdfSessionTitleInput"),
  sourceType: document.getElementById("analizarPdfSourceType"),
  indexPageInput: document.getElementById("analizarPdfIndexPageInput"),
  nivelInput: document.getElementById("analizarPdfNivelInput"),
  gradoInput: document.getElementById("analizarPdfGradoInput"),
  trimestreInput: document.getElementById("analizarPdfTrimestreInput"),
  unidadInput: document.getElementById("analizarPdfUnidadInput"),
  edicionNumeroInput: document.getElementById("analizarPdfEdicionNumeroInput"),
  revisionNumeroInput: document.getElementById("analizarPdfRevisionNumeroInput"),
  addSectionBtn: document.getElementById("analizarPdfAddSectionBtn"),
  addSectionButtons: document.querySelectorAll('[data-action="add-section"]'),
  sectionsList: document.getElementById("analizarPdfSectionsList"),
  paletteList: document.getElementById("analizarPdfPaletteList"),
  addPaletteColorBtn: document.getElementById("analizarPdfAddPaletteColorBtn"),
  fileInput: document.getElementById("analizarPdfFileInput"),
  fileLabel: document.getElementById("analizarPdfFileLabel"),
  analyzeBtn: document.getElementById("analizarPdfAnalyzeBtn"),
  saveBtn: document.getElementById("analizarPdfSaveBtn"),
  copyJobMetaBtn: document.getElementById("analizarPdfCopyJobMetaBtn"),
  statusBadge: document.getElementById("analizarPdfStatusBadge"),
  results: document.getElementById("analizarPdfResults"),
  jobMeta: document.getElementById("analizarPdfJobMeta")
};

const store = createAnalizarPdfSessionStore({ state });
const resultsRenderer = createAnalizarPdfResultsRenderer({ el: els.results });
const sidepanelApi = createAnalizarPdfSidepanelApi({
  els,
  state,
  onCreateSession: handleCreateSession,
  onSelectSession: handleSelectSession,
  onRenameSession: handleRenameSession,
  onDeleteSession: handleDeleteSession
});

function escapeAttr(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function updateStatusBadge(status = "idle") {
  els.statusBadge.textContent = status;
  els.statusBadge.className = `analizar-pdf-status-badge is-${status}`;
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

function getExpectedFileAccept(sourceType = "pdf") {
  return getNormalizedSourceType(sourceType) === "idml" ? ".idml" : "application/pdf,.pdf";
}

function getExpectedFileExtension(sourceType = "pdf") {
  return getNormalizedSourceType(sourceType) === "idml" ? ".idml" : ".pdf";
}

function getUploadUiState(session = null, file = state.selectedFile) {
  const sourceType = getNormalizedSourceType(session?.sourceType);
  const expectedExtension = getExpectedFileExtension(sourceType);
  return {
    sourceType,
    expectedExtension,
    accept: getExpectedFileAccept(sourceType),
    file: file || null,
    missingFileMessage: `Selecciona un archivo ${expectedExtension}.`
  };
}

function syncFileInputForSession(session = null) {
  const uploadState = getUploadUiState(session);
  els.fileInput.accept = uploadState.accept;
  if (state.selectedFile && !String(state.selectedFile.name || "").toLowerCase().endsWith(uploadState.expectedExtension)) {
    state.selectedFile = null;
    els.fileInput.value = "";
  }
  return uploadState;
}

async function queueUploadForSession(session = null, sessionId = "", file = state.selectedFile) {
  const uploadState = getUploadUiState(session, file);
  return {
    ...uploadState,
    response: await queueAnalizarPdfUpload(sessionId, uploadState.file, uploadState.sourceType)
  };
}

function renderSectionsEditor(session = null) {
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
  const sourceType = getNormalizedSourceType(session?.sourceType);
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
}

function renderPaletteShell(session = null) {
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

function renderActiveSession() {
  const session = store.getActiveSession();
  const uploadState = getUploadUiState(session);
  els.sessionTitleLabel.textContent = session?.title || "Sin sesión activa";
  els.sessionTitleInput.value = session?.title || "";
  els.indexPageInput.value = session?.indexConfig?.indexPageNumber || "";
  els.fileLabel.textContent = uploadState.file?.name || uploadState.missingFileMessage;
  updateStatusBadge(session?.analysisStatus || "idle");
  renderBibliographicInfo(session);
  renderSectionsEditor(session);
  renderPaletteShell(session);
  resultsRenderer.render(session);
}

function renderAll() {
  sidepanelApi.renderSessions();
  renderActiveSession();
}

async function refreshSessions(preferredSessionId = "") {
  const sessions = await loadSessions();
  store.setSessions(sessions);
  const fallbackId = preferredSessionId || state.activeSessionId || sessions[0]?.id || "";
  store.setActiveSession(fallbackId);
  renderAll();
}

async function persistActiveSession() {
  const session = store.getActiveSession();
  if (!session) throw new Error("No hay sesión activa.");
  const saved = await saveSession(session);
  store.upsertSession(saved);
  renderAll();
  return saved;
}

async function handleCreateSession() {
  const session = createEmptyAnalizarPdfSession();
  const saved = await saveSession(session);
  store.upsertSession(saved);
  store.setActiveSession(saved.id);
  renderAll();
}

function handleSelectSession(sessionId = "") {
  store.setActiveSession(sessionId);
  renderAll();
}

async function handleRenameSession(sessionId = "") {
  const current = state.sessions.find((entry) => entry.id === sessionId);
  if (!current) return;
  const nextTitle = window.prompt("Nuevo nombre de la sesión", current.title || "Sesión sin título");
  if (typeof nextTitle !== "string") return;
  const saved = await saveSession({ ...current, title: nextTitle.trim() || current.title });
  store.upsertSession(saved);
  renderAll();
}

async function handleDeleteSession(sessionId = "") {
  if (!window.confirm("¿Eliminar esta sesión?")) return;
  await import("./analizar-pdf-api.js").then(({ deleteAnalizarPdfSession }) => deleteAnalizarPdfSession(sessionId));
  store.setSessions(state.sessions.filter((session) => session.id !== sessionId));
  if (state.activeSessionId === sessionId) {
    state.activeSessionId = state.sessions[0]?.id || "";
  }
  renderAll();
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

function bindEditorEvents() {
  els.sessionTitleInput.addEventListener("input", () => {
    mutateActiveSession((session) => {
      session.title = els.sessionTitleInput.value.trim() || "Sesión sin título";
      return session;
    }, { render: false });
    els.sessionTitleLabel.textContent = els.sessionTitleInput.value.trim() || "Sesión sin título";
  });

  els.indexPageInput.addEventListener("change", () => {
    mutateActiveSession((session) => {
      session.indexConfig.indexPageNumber = Number(els.indexPageInput.value || 0) || 0;
      return session;
    });
  });

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
        return session;
      }, { render: false });
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

  els.sectionsList.addEventListener("input", (event) => {
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

  els.sectionsList.addEventListener("click", (event) => {
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
    state.selectedFile = els.fileInput.files?.[0] || null;
    renderActiveSession();
  });

  els.saveBtn.addEventListener("click", async () => {
    try {
      await persistActiveSession();
      els.jobMeta.textContent = "Sesión guardada.";
    } catch (error) {
      els.jobMeta.textContent = String(error?.message || error);
    }
  });

  if (els.copyJobMetaBtn && els.jobMeta) {
    els.copyJobMetaBtn.addEventListener("click", async () => {
      const text = String(els.jobMeta.textContent || "").trim();
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

  els.analyzeBtn.addEventListener("click", async () => {
    const session = store.getActiveSession();
    const uploadState = getUploadUiState(session);
    if (!session) {
      els.jobMeta.textContent = "Crea una sesión antes de analizar.";
      return;
    }
    if (!uploadState.file) {
      els.jobMeta.textContent = uploadState.missingFileMessage;
      return;
    }
    try {
      mutateActiveSession((draft) => {
        draft.analysisStatus = "uploading";
        return draft;
      });
      const saved = await persistActiveSession();
      const upload = await queueUploadForSession(session, saved.id, uploadState.file);
      const queued = upload.response || {};
      mutateActiveSession((draft) => {
        draft.analysisStatus = queued.status || "queued";
        draft.analysisJobId = queued.jobId || "";
        return draft;
      });
      els.jobMeta.textContent = formatJobMeta(queued, saved);
      await startPolling(queued.jobId || "");
    } catch (error) {
      mutateActiveSession((draft) => {
        draft.analysisStatus = "failed";
        return draft;
      });
      els.jobMeta.textContent = String(error?.message || error);
    }
  });
}

async function startPolling(jobId = "") {
  window.clearTimeout(state.analysisPollTimer);
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return;
  const tick = async () => {
    try {
      const payload = await pollAnalysisStatus(cleanJobId);
      const session = payload?.session || null;
      if (session) {
        store.upsertSession(session);
      }
      els.jobMeta.textContent = formatJobMeta(payload, session);
      renderAll();
      if (payload?.status === "queued" || payload?.status === "processing") {
        state.analysisPollTimer = window.setTimeout(tick, 2500);
      }
    } catch (error) {
      els.jobMeta.textContent = String(error?.message || error);
    }
  };
  await tick();
}

async function bootstrap() {
  sidepanelApi.bindEvents();
  bindEditorEvents();
  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user || null;
    els.authState.textContent = user?.email
      ? `Sesión iniciada como ${user.email}`
      : "Inicia sesión para guardar y analizar PDFs.";
    if (!user) {
      state.sessions = [];
      state.activeSessionId = "";
      renderAll();
      return;
    }
    try {
      await refreshSessions();
    } catch (error) {
      els.jobMeta.textContent = String(error?.message || error);
    }
  });
}

bootstrap();
