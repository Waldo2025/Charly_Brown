import { createEmptySession, createStore } from "./state.js";
import { saveSession, listSessions, deleteSession, duplicateSession } from "./sessions-store.js";
import { filterSessionsByAcademicMeta, getAcademicFilterOptions, renderSessionSidebar } from "./session-sidebar.js";
import { renderAcceptedPanel } from "./accepted-panel.js";
import { normalizeActivitySubtopicTitle } from "./activity-label.js";
const chatControllerVersion = encodeURIComponent(window.__CHARLY_CACHE_VERSION__ || Date.now());
const { createChatController, renderProposalMessage } = await import(`./chat-controller.js?v=${chatControllerVersion}`);
import { generateActivities, refineActivities } from "./unit-generator.js";
import { getStaticGeminiTextModels, listGeminiModels, sendCharlyChat } from "./gemini-client.js";
import { loadSyaForMeta, getCompleteSyaGroupedByCategory, getSyaGroupedByCategory } from "./sya-service.js";
import { listReadingsForUnit, saveGeneratedReading } from "./reading-service.js";
import { ALL_OPTION, getCategoriesForGrade, getGradesForLevel, getWorkModeLabel, isProjectSelection } from "./unit-contracts.js";
import { routeUserIntent } from "./user-intent.js";
import { createId, toast, stripHtml, setBusy } from "./ui-components.js";
import { ensureApprovedUserAccess } from "./auth-guard.js";
import { DEFAULT_ACTIVITY_SECTIONS, getNextWorkflowStep } from "./workflow.js";
import { createActivitySection, listActivitySections, restoreActivitySection, updateActivitySection } from "./activity-section-service.js";
import { downloadApprovedFiles } from "./export-service.js";
import { AUTOMATED_RESOURCE_SELECTIONS, buildAutomatedActivityQueue, pickExactReadingForMeta } from "./unit-automation.js";

const root = document;
const store = createStore(createEmptySession());
let currentReadingOptions = [];
let readingFilter = "";
let geminiModelOptions = getStaticGeminiTextModels();
let readingLoadTimer = null;
let readingLoadSeq = 0;
let readingsModalLoadSeq = 0;
let syaLoadTimer = null;
let syaLoadSeq = 0;
let transientNoticeTimer = null;
let pendingSyaModalResolver = null;
let syaEditorDraft = null;
let syaEditorOriginal = null;
let syaEditorMeta = null;
let activeSyaEditorSection = null;
let pendingResourcesModalResolver = null;
let pendingActivitySectionsModalResolver = null;
let pendingActivitySections = [];
let activitySectionCatalog = [];
let activitySectionCanManageGlobal = false;
let editingActivitySection = null;
let activitySectionModalContext = "selection";
let activitySectionsReturnFocus = null;
let settingsModalReturnFocus = null;
let exportModalReturnFocus = null;
let selectedExportFormat = "docx";
let unitAutomationRun = null;
let sessionFilters = { level: "", grade: "", trimester: "", category: "" };
let pendingResourceSelections = {
  fichas: false,
  anexos: false,
  recortables: false,
  videos: false
};
const DEFAULT_ACCEPTED_WIDTH = 360;
const MIN_ACCEPTED_WIDTH = 280;
const MAX_ACCEPTED_WIDTH = 760;
const MIN_CHAT_WIDTH = 280;
const DEFAULT_SESSIONS_WIDTH = 280;
const MIN_SESSIONS_WIDTH = 220;
const MAX_SESSIONS_WIDTH = 420;
const SETUP_PANEL_COLLAPSED_KEY = "cbSetupPanelCollapsed";
const SYA_SUBTOPIC_META_KEY = "__subtopics";
let chatController = null;

export async function boot() {
  const access = await ensureApprovedUserAccess();
  if (!access.allowed) return;
  const defaultMeta = syncMetaForLevelAndGrade(createEmptySession().meta);
  renderGradeOptions(defaultMeta.level, defaultMeta.grade);
  renderCategoryAndSubtopicControls(defaultMeta);
  renderEditionOptions(defaultMeta.edition);
  bindMetaControls();
  bindSessionsPanelControls();
  bindSessionFilterModalControls();
  bindAcceptedPanelControls();
  bindExportControls();
  bindSetupPanelToggle();
  bindComposerFooterLayout();
  bindSyaEditingControls();
  bindResourcesModalControls();
  bindActivitySectionsModalControls();
  bindWorkflowControls();
  bindReadingsModalControls();
  bindSettingsModalControls();
  bindSyaModalOpenButton();
  bindUnitDataModalControls();
  renderGeminiModelOptions();
  chatController = createChatController({ root, store, onAction: handleAction, onUserMessage: handleUserMessage });
  bindProposalActions();
  store.subscribe(renderAll);
  await refreshSessions();
  if (!store.getState().sessions.length) {
    await createNewSession();
  } else {
    await persist();
  }
  loadGeminiModelOptions();
  if (store.getState().session.activeUnitId) {
    scheduleReadingsReload({ silent: true, delay: 0 });
    scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
  }
  flashWorkingStatus();
}

async function loadGeminiModelOptions() {
  const models = await listGeminiModels().catch(() => getStaticGeminiTextModels());
  geminiModelOptions = models.length ? models : getStaticGeminiTextModels();
  renderGeminiModelOptions(store.getState().session.meta?.model);
}

function renderGeminiModelOptions(selectedModel = "") {
  const current = selectedModel || store.getState().session.meta?.model || "gemini-3.8-flash";
  const hasCurrent = geminiModelOptions.some((model) => model.id === current);
  const models = hasCurrent ? geminiModelOptions : [{ id: current, label: current, source: "session" }, ...geminiModelOptions];
  renderComposerModelMenu(current, models);
  syncComposerModelButton(current);
}

function renderComposerModelMenu(current = "", models = geminiModelOptions) {
  const menu = document.getElementById("cbComposerModelMenu");
  if (!menu) return;
  menu.innerHTML = models.map((model) => {
    const selected = model.id === current;
    return `<button type="button" class="cb-composer-model-option${selected ? " is-selected" : ""}" role="menuitemradio" aria-checked="${selected ? "true" : "false"}" data-composer-model="${escapeAttr(model.id)}"><i class="fas ${selected ? "fa-check" : "fa-brain"}" aria-hidden="true"></i><span>${escapeHtmlText(model.label || model.id)}</span></button>`;
  }).join("");
}

function toggleComposerModelMenu(force) {
  const button = document.getElementById("cbComposerModelBtn");
  const menu = document.getElementById("cbComposerModelMenu");
  if (!button || !menu) return;
  const open = typeof force === "boolean" ? force : menu.hidden;
  menu.hidden = !open;
  button.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) menu.querySelector(".is-selected, .cb-composer-model-option")?.focus();
}

function syncComposerModelButton(modelId = "") {
  const button = document.getElementById("cbComposerModelBtn");
  const label = document.getElementById("cbComposerModelLabel");
  if (!button || !label) return;
  const current = String(modelId || "gemini-3.8-flash").trim() || "gemini-3.8-flash";
  const text = geminiModelOptions.find((model) => model.id === current)?.label || current;
  label.textContent = text;
  button.title = `Cambiar modelo de Gemini · ${text}`;
}

function renderAll(state) {
  updateProjectModeUi(state.session?.meta || {});
  syncComposerModelButton(state.session?.meta?.model);
  const allSessions = Array.isArray(state.sessions) ? state.sessions : [];
  const filtersActive = hasActiveSessionFilters();
  const visibleSessions = filterSessionsByAcademicMeta(allSessions, sessionFilters);
  renderSessionSidebar({
    root,
    sessions: visibleSessions,
    totalCount: allSessions.length,
    filtersActive,
    activeId: state.session.id,
    onNew: createNewSession,
    onSelect: selectSession,
    onRename: renameSession,
    onDuplicate: duplicateSelectedSession,
    onDelete: deleteSelectedSession
  });
  syncSessionFilterButton();
  renderAcceptedPanel({
    root,
    session: state.session,
    readingOptions: currentReadingOptions,
    readingFilter,
    onNewSession: openNewUnitModal,
    onFilterReadings: (value) => {
      readingFilter = value;
      renderAll(store.getState());
    },
    onUseReading: useReadingById,
    onOpenReadingsPanel: openReadingsModal,
    onRemoveReading: removeReading,
    onEditReadingSection: (part, unitId) => withUnit(unitId, () => editReadingSection(part)),
    onEditActivity: (id, unitId) => withUnit(unitId, () => editActivity(id)),
    onEditResource: (id, unitId) => withUnit(unitId, () => editResource(id)),
    onRegenerateActivity: (id, unitId) => withUnit(unitId, () => regenerateActivity(id)),
    onRegenerateResource: (id, unitId) => withUnit(unitId, () => regenerateResource(id)),
    onOpenUnit: openArchivedUnit,
    onEditUnit: editUnit,
    onRemoveUnit: removeUnit,
    onRemoveActivity: (id, unitId) => withUnit(unitId, () => {
      store.removeActivity(id);
      persist();
    }),
    onRemoveResource: (id, unitId) => withUnit(unitId, () => {
      store.removeResource(id);
      persist();
    }),
    onGenerateNotesForActivity: (id, unitId) => withUnit(unitId, () => handleGenerateTeacherNotes(id)),
    onGenerateNotesForResource: (id, unitId) => withUnit(unitId, () => handleGenerateResourceNotes(id)),
    onGenerateGlobalNotes: () => handleGenerateTeacherNotes(""),
    onEditTeacherNotes: (id, text, unitId) => withUnit(unitId, () => {
      store.editTeacherNotes(id, text);
      persist();
    }),
    onDeleteTeacherNotes: (id, unitId) => withUnit(unitId, () => {
      store.removeTeacherNotes(id);
      persist();
    })
  });
  const newUnitButton = document.getElementById("cbNewUnitBtn");
  if (newUnitButton) newUnitButton.onclick = openNewUnitModal;
  syncComposerFooterLayout();
}

function hasActiveSessionFilters() {
  return Object.values(sessionFilters).some((value) => String(value || "").trim());
}

function syncSessionFilterButton() {
  const button = document.getElementById("cbSessionFilterBtn");
  if (!button) return;
  const active = hasActiveSessionFilters();
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.title = active ? "Cambiar filtros de libros" : "Filtrar libros";
}

function bindSessionFilterModalControls() {
  const modal = document.getElementById("cbSessionFilterModal");
  document.getElementById("cbSessionFilterBtn")?.addEventListener("click", openSessionFilterModal);
  modal?.addEventListener("click", (event) => {
    if (event.target?.dataset?.modalClose === "session-filter" || event.target.closest?.("[data-modal-close='session-filter']")) {
      closeSessionFilterModal();
    }
  });
  document.getElementById("cbSessionFilterApply")?.addEventListener("click", () => {
    sessionFilters = readSessionFilterDraft();
    closeSessionFilterModal();
    renderAll(store.getState());
  });
  document.getElementById("cbSessionFilterClear")?.addEventListener("click", () => {
    sessionFilters = { level: "", grade: "", trimester: "", category: "" };
    populateSessionFilterControls();
    closeSessionFilterModal();
    renderAll(store.getState());
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSessionFilterModal();
  });
}

function openSessionFilterModal() {
  const modal = document.getElementById("cbSessionFilterModal");
  if (!modal) return;
  populateSessionFilterControls();
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  modal.querySelector("select")?.focus();
}

function closeSessionFilterModal() {
  const modal = document.getElementById("cbSessionFilterModal");
  if (!modal || modal.hidden) return;
  if (modal.contains(document.activeElement)) document.activeElement?.blur?.();
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  modal.inert = true;
  document.getElementById("cbSessionFilterBtn")?.focus();
}

function populateSessionFilterControls() {
  const options = getAcademicFilterOptions(store.getState().sessions || []);
  const labels = { level: "Todos los niveles", grade: "Todos los grados", trimester: "Todos los trimestres", category: "Todas las áreas" };
  document.querySelectorAll("[data-session-filter]").forEach((select) => {
    const key = select.dataset.sessionFilter;
    const values = options[key] || [];
    select.innerHTML = `<option value="">${labels[key]}</option>${values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtmlText(key === "trimester" ? `Trimestre ${value}` : value)}</option>`).join("")}`;
    select.value = sessionFilters[key] || "";
  });
}

function readSessionFilterDraft() {
  return Array.from(document.querySelectorAll("[data-session-filter]")).reduce((filters, select) => {
    filters[select.dataset.sessionFilter] = select.value;
    return filters;
  }, { level: "", grade: "", trimester: "", category: "" });
}

function bindMetaControls() {
  const map = {
    cbLevelSelect: "level",
    cbModeSelect: "mode",
    cbGradeSelect: "grade",
    cbTrimesterSelect: "trimester",
    cbUnitSelect: "unit",
    cbCategorySelect: "category",
    cbSubtopicSelect: "subtopic",
    cbEditionInput: "edition"
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    el?.addEventListener("change", () => {
      if (key === "level") {
        const nextMeta = syncMetaForLevelAndGrade({ ...store.getState().session.meta, level: el.value });
        renderGradeOptions(nextMeta.level, nextMeta.grade);
        renderCategoryAndSubtopicControls(nextMeta);
        store.updateMeta(nextMeta);
      } else if (key === "grade") {
        const nextMeta = syncCategorySubtopicForGrade({ ...store.getState().session.meta, grade: el.value });
        renderCategoryAndSubtopicControls(nextMeta);
        store.updateMeta(nextMeta);
      } else if (key === "category") {
        const nextMeta = syncCategorySubtopicForGrade({ ...store.getState().session.meta, category: el.value });
        renderCategoryAndSubtopicControls(nextMeta);
        store.updateMeta(nextMeta);
      } else if (key === "subtopic") {
        store.updateMeta({ [key]: el.value });
      } else {
        store.updateMeta({ [key]: el.value });
      }
      if (["level", "grade", "trimester", "unit", "edition", "category", "subtopic"].includes(key)) {
        scheduleReadingsReload({ silent: true });
        scheduleSyaReload({ silent: true, replaceExisting: true });
      }
      persist();
    });
    el?.addEventListener("input", () => {
      if (key === "edition") {
        store.updateMeta({ [key]: el.value });
        scheduleReadingsReload({ silent: true });
        scheduleSyaReload({ silent: true, replaceExisting: true });
        persistDebounced();
      }
    });
  });
}

async function refreshSessions() {
  const sessions = await listSessions().catch((error) => {
    toast(`No se pudieron cargar sesiones: ${error.message}`);
    console.error("[charly-brown] listSessions failed", error);
    return [];
  });
  store.setSessions(sessions);
  if (sessions.length) {
    store.setSession(sessions[0]);
    syncMetaControls(sessions[0]);
  }
  scheduleReadingsReload({ silent: true, delay: 0 });
  scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
}

async function newUnit({ unit = "", title = "", readingMode = "existing", readingRef = "" } = {}) {
  const nextUnit = String(unit || "1");
  const reading = readingMode === "existing" ? findReadingByReference(readingRef) : null;
  store.createUnit({ unit: nextUnit, title: String(title || "").trim(), readingMode, reading });
  syncMetaControls(store.getState().session);
  flashWorkingStatus("Working");
  await persist();
  scheduleReadingsReload({ silent: true, delay: 0 });
  scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
  proposeNextWorkflowStep();
}

function editUnit(unitId = "") {
  const unit = (store.getState().session.units || []).find((item) => item.id === unitId);
  if (!unit) return;
  openUnitDataModal({
    mode: "edit-unit",
    editingUnit: unit,
    onSave: async ({ unit: unitNumber = "", title = "" } = {}) => {
      if (!store.updateUnit(unitId, { unit: unitNumber, title })) return;
      syncMetaControls(store.getState().session);
      await persist();
    }
  });
}

async function removeUnit(unitId = "") {
  const session = store.getState().session;
  const unit = (session.units || []).find((item) => item.id === unitId);
  if (!unit) return;
  const unitLabel = unit.meta?.unit === "proyecto" ? "Proyecto" : `Unidad ${unit.meta?.unit || ""}`.trim();
  const title = String(unit.title || "").trim();
  const label = title && !normalizeForLocalIntent(title).startsWith(normalizeForLocalIntent(unitLabel))
    ? `${unitLabel}. ${title}`
    : (title || unitLabel);
  if (!window.confirm(`¿Eliminar ${label}? Esta acción quitará su chat y todo el contenido asociado.`)) return;
  if (!store.removeUnit(unitId)) return;
  syncMetaControls(store.getState().session);
  await persist();
  scheduleReadingsReload({ silent: true, delay: 0 });
  scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
}

async function createAutomatedUnit() {
  if (unitAutomationRun) {
    unitAutomationRun.cancelled = true;
    syncAutomatedUnitButton({ label: "Cancelando...", running: true });
    return;
  }

  const session = store.getState().session;
  const selectedUnit = (session.units || []).find((item) => item.id === session.activeUnitId);
  if (!selectedUnit) {
    toast("Selecciona o crea una unidad en el panel derecho antes de iniciar la automatización.");
    return;
  }
  const academicMeta = session.academicMeta || {};
  const missing = ["level", "grade", "trimester"].filter((key) => !String(academicMeta[key] || "").trim());
  if (missing.length) {
    toast("Completa nivel, grado y trimestre antes de automatizar la unidad.");
    openUnitDataModal({ mode: "academic" });
    return;
  }

  const unit = String(selectedUnit.meta?.unit || "").trim();
  if (!unit) {
    toast("La unidad seleccionada no tiene un número asignado.");
    return;
  }

  const run = { cancelled: false, unit, completed: 0, resourcesCompleted: 0, total: 0 };
  unitAutomationRun = run;
  setComposerBusy(true);
  syncAutomatedUnitButton({ label: "Buscando lectura...", running: true });
  chatController?.showTransientStatus(`Preparando Unidad ${unit}...`);

  try {
    const targetMeta = { ...academicMeta, unit };
    const readings = await listReadingsForUnit({ meta: targetMeta, limit: 500, includeAll: true });
    const reading = pickExactReadingForMeta(readings, targetMeta);
    if (!reading) {
      throw new Error(`No encontré una lectura que coincida exactamente con ${targetMeta.level}, ${targetMeta.grade}, trimestre ${targetMeta.trimester}, unidad ${unit}.`);
    }
    if (run.cancelled) return;

    const acceptedReading = toAcceptedReading(reading);
    store.useReading(acceptedReading);
    const createdUnit = selectedUnit;
    syncMetaControls(store.getState().session);
    store.addMessage({
      role: "assistant",
      text: `Automatización iniciada para la Unidad ${unit} seleccionada. Elegí la lectura “${reading.title}” por coincidencia exacta de nivel, grado, trimestre y unidad.`
    });
    await persist({ silent: true });

    syncAutomatedUnitButton({ label: "Cargando secuencia...", running: true });
    const sya = await loadSyaForMeta(targetMeta);
    if (run.cancelled) return;
    const current = store.getState().session;
    const contextKey = buildSyaContextKey(targetMeta);
    store.patchSession({
      sya,
      syaOriginal: sya,
      syaContextKey: contextKey,
      accepted: { ...(current.accepted || {}), reading: acceptedReading, sya, syaOriginal: sya }
    });

    const groups = getCompleteSyaGroupedByCategory({ ...targetMeta, category: ALL_OPTION, subtopic: ALL_OPTION }, sya);
    const queue = buildAutomatedActivityQueue(groups, { unit });
    if (!queue.length) throw new Error("La secuencia y alcance no contiene subtemas utilizables para esta unidad.");
    store.setActivitySections(queue);
    run.total = queue.length;
    await persist({ silent: true });

    const failures = [];
    for (let index = 0; index < queue.length; index += 1) {
      if (run.cancelled) break;
      const item = queue[index];
      syncAutomatedUnitButton({ label: `${index + 1}/${queue.length}`, running: true });
      chatController?.showTransientStatus(`Creando ${item.section} · ${index + 1} de ${queue.length}`);
      try {
        const activeSession = store.getState().session;
        const generationSession = {
          ...activeSession,
          meta: {
            ...activeSession.meta,
            category: item.category,
            subtopic: item.subtopic
          }
        };
        const result = await generateAutomatedActivity({
          run,
          session: generationSession,
          item
        });
        if (run.cancelled) break;
        const activityHtml = stripResourceBlocks(result.html);
        const generatedResources = extractResourceBlocks(result.html);
        store.acceptActivity({
          title: item.section,
          section: item.section,
          sectionId: item.sectionId,
          category: item.category,
          subtopic: item.subtopic,
          html: activityHtml,
          validation: result.validation,
          automated: true,
          sourceUnitId: createdUnit.id
        });
        const acceptedActivity = store.getState().session.accepted?.activities?.at(-1);
        store.acceptResources(generatedResources.map((resource) => ({
          ...resource,
          activityId: acceptedActivity?.id || "",
          section: item.section,
          context: buildResourceContextLabel(resource.type),
          automated: true,
          sourceUnitId: createdUnit.id
        })));
        run.resourcesCompleted += generatedResources.length;
        run.completed += 1;
        await persist({ silent: true });
        if (index < queue.length - 1) await waitForAutomation(900, run);
      } catch (error) {
        failures.push(`${item.section}: ${error.message}`);
        console.error("[charly-brown] automated activity failed", item, error);
      }
    }

    const cancelled = run.cancelled;
    const summary = cancelled
      ? `Automatización detenida. Se conservaron ${run.completed} de ${run.total} actividades y ${run.resourcesCompleted} recursos creados.`
      : failures.length
        ? `Unidad ${unit} completada con la lectura seleccionada, ${run.completed} de ${run.total} actividades y ${run.resourcesCompleted} recursos. ${failures.length} secciones no pudieron generarse.`
        : `Unidad ${unit} completada automáticamente con su lectura, ${run.completed} actividades y ${run.resourcesCompleted} recursos ordenados por sección y subtema.`;
    store.addMessage({ role: "assistant", text: summary });
    await persist({ silent: true });
    toast(summary);
  } catch (error) {
    console.error("[charly-brown] automated unit failed", error);
    const message = `No pude crear la unidad automatizada: ${error.message}`;
    if (store.getState().session.activeUnitId) store.addMessage({ role: "assistant", text: message });
    toast(message);
    await persist({ silent: true });
  } finally {
    unitAutomationRun = null;
    setComposerBusy(false);
    syncAutomatedUnitButton();
    chatController?.clearTransientStatus();
  }
}

async function generateAutomatedActivity({ run, session, item } = {}) {
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (run?.cancelled) throw new Error("Automatización cancelada.");
    try {
      const result = await generateActivities({
        session,
        model: session?.meta?.model || "gemini-3.8-flash",
        userText: `Genera la actividad correspondiente a ${item.category}, subtema ${item.subtopic}. Cubre únicamente este subtema y sigue sus campos T, AE, C y P. Incluye una ficha, un anexo, un recortable y un video, cada uno vinculado pedagógicamente a esta actividad.`,
        resourceSelections: { ...AUTOMATED_RESOURCE_SELECTIONS }
      });
      if (result.validation?.ok === false) {
        const error = new Error(`La actividad o sus recursos quedaron incompletos: ${(result.validation.errors || []).join(" ")}`);
        error.code = "AUTOMATED_CONTENT_INVALID";
        throw error;
      }
      return result;
    } catch (error) {
      lastError = error;
      const structuralRetry = error?.code === "AUTOMATED_CONTENT_INVALID";
      if ((!isTransientAutomationError(error) && !structuralRetry) || attempt === maxAttempts) throw error;
      if (structuralRetry) {
        syncAutomatedUnitButton({ label: `Corrigiendo ${attempt}/${maxAttempts}`, running: true });
        chatController?.showTransientStatus(`Completando la actividad y sus cuatro recursos para ${item.section}...`);
        continue;
      }
      const seconds = Math.min(20, Math.max(4, Number(error?.retryAfterSeconds || 0), attempt * 5));
      syncAutomatedUnitButton({ label: `Reintentando en ${seconds}s`, running: true });
      chatController?.showTransientStatus(`La capacidad del modelo está ocupada. Reintentando ${item.section} sin omitirla...`);
      await waitForAutomation(seconds * 1000, run);
    }
  }
  throw lastError || new Error("No fue posible generar la actividad.");
}

function isTransientAutomationError(error) {
  const status = Number(error?.status || error?.code || 0);
  const message = String(error?.message || "");
  return [408, 429, 500, 502, 503, 504].includes(status)
    || /RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|overloaded|temporar|rate.?limit|quota/i.test(message);
}

async function waitForAutomation(milliseconds = 0, run = null) {
  let remaining = Math.max(0, Number(milliseconds || 0));
  while (remaining > 0 && !run?.cancelled) {
    const step = Math.min(250, remaining);
    await new Promise((resolve) => window.setTimeout(resolve, step));
    remaining -= step;
  }
}

function syncAutomatedUnitButton({ label = "Unidad automática", running = false } = {}) {
  const button = document.getElementById("cbAutomateUnitBtn");
  if (!button) return;
  button.classList.toggle("is-running", running);
  button.setAttribute("aria-busy", running ? "true" : "false");
  button.title = running ? "Detener al terminar la actividad actual" : "Crear unidad automatizada";
  button.setAttribute("aria-label", button.title);
  const icon = button.querySelector("i");
  const text = button.querySelector("span");
  if (icon) icon.className = running ? "fas fa-stop" : "fas fa-bolt";
  if (text) text.textContent = label;
}

async function createNewSession() {
  const state = store.getState();
  if (state.sessions.some((session) => session.id === state.session.id)) await persist();
  const draft = createEmptySession({ title: "Nueva sesión" });
  openUnitDataModal({
    mode: "new-session",
    initialMeta: draft.academicMeta,
    onSave: async (data) => {
      const next = createEmptySession({
        id: draft.id,
        title: draft.title,
        createdAt: draft.createdAt,
        academicMeta: { ...draft.academicMeta, ...data }
      });
      const saved = await saveSession(next).catch((error) => {
        toast(`No se creó el libro: ${error.message}`);
        console.error("[charly-brown] create session failed", error);
        return null;
      });
      if (!saved) return;
      store.setSession(saved);
      const initialReading = await createInitialUnitForNewBook(saved);
      const initializedSession = store.getState().session;
      const initializedSaved = await saveSession({ ...initializedSession, title: buildTitle(initializedSession) }).catch((error) => {
        toast(`El libro se creó, pero no se guardó su Unidad 1: ${error.message}`);
        console.error("[charly-brown] initialize first unit failed", error);
        return initializedSession;
      });
      await refreshSessions();
      store.setSession(initializedSaved);
      syncMetaControls(initializedSaved);
      scheduleReadingsReload({ silent: true, delay: 0 });
      scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
      toast(initialReading
        ? `Libro creado con la Unidad 1 y la lectura “${initialReading.title}”.`
        : "Libro creado con la Unidad 1. No encontré una lectura exacta; puedes elegirla desde el panel.");
    }
  });
}

async function createInitialUnitForNewBook(session = {}) {
  const targetMeta = { ...(session.academicMeta || {}), unit: "1" };
  const readings = await listReadingsForUnit({ meta: targetMeta, limit: 500, includeAll: true }).catch((error) => {
    console.error("[charly-brown] initial reading lookup failed", error);
    return [];
  });
  currentReadingOptions = readings;
  const reading = pickExactReadingForMeta(readings, targetMeta);
  store.createUnit({
    unit: "1",
    title: "Unidad 1",
    readingMode: reading ? "existing" : "none",
    reading: reading ? toAcceptedReading(reading) : null
  });
  return reading;
}

async function openNewUnitModal(initialReadingMode = "") {
  const session = store.getState().session;
  currentReadingOptions = await listReadingsForUnit({ meta: session.meta, limit: 400, includeAll: true }).catch(() => currentReadingOptions);
  openUnitDataModal({
    mode: "new-unit",
    initialReadingMode,
    onSave: (data) => newUnit(data)
  });
}

function openUnitDataModal({ mode = "academic", initialReadingMode = "", initialMeta = null, editingUnit = null, onSave } = {}) {
  const modal = document.getElementById("cbUnitDataModal");
  const editor = document.getElementById("cbUnitDataModalEditor");
  const title = document.getElementById("cbUnitDataModalTitle");
  const kicker = modal?.querySelector(".cb-panel-kicker");
  const subtitle = modal?.querySelector(".cb-modal-subtitle");
  const saveBtn = document.getElementById("cbUnitDataModalSave");
  const cancelBtn = document.getElementById("cbUnitDataModalCancel");
  if (!modal || !editor || !saveBtn) return;
  const session = store.getState().session;
  const isNewUnit = mode === "new-unit";
  const isEditUnit = mode === "edit-unit";
  const isNewSession = mode === "new-session";
  const isUnitForm = isNewUnit || isEditUnit;
  const meta = initialMeta || (isUnitForm ? (session.meta || {}) : (session.academicMeta || session.meta || {}));
  modal.dataset.mode = mode;
  editor.innerHTML = isNewUnit
    ? buildNewUnitEditor(meta, session.units || [], currentReadingOptions, initialReadingMode)
    : isEditUnit
      ? buildEditUnitEditor(editingUnit)
      : buildUnitDataEditor(meta);
  if (isNewUnit) bindNewUnitReadingControls(editor);
  editor.onchange = isNewUnit ? (event) => {
    if (event.target?.name === "cb-reading-mode") syncNewUnitReadingMode(editor);
  } : isEditUnit ? null : (event) => {
    const fieldName = event.target?.dataset?.unitField || "";
    if (!["level", "grade"].includes(fieldName)) return;
    const draft = { ...meta, ...readUnitDataEditor(editor) };
    const normalized = fieldName === "level"
      ? syncMetaForLevelAndGrade(draft)
      : syncCategorySubtopicForGrade(draft);
    editor.innerHTML = buildUnitDataEditor(normalized);
    editor.querySelector(`[data-unit-field="${fieldName}"]`)?.focus();
  };
  if (kicker) kicker.textContent = isUnitForm ? "Unidad" : "Sesión";
  if (title) title.textContent = isNewUnit ? "Crear nueva unidad" : isEditUnit ? "Editar unidad" : "Datos académicos";
  if (subtitle) {
    subtitle.textContent = isNewUnit
      ? "Asigna la unidad y decide qué lectura se usará antes de iniciar su chat."
      : isEditUnit
        ? "Actualiza el número o título sin cambiar el chat ni el contenido aprobado."
        : "Configura los datos académicos que se usarán en esta sesión.";
  }
  if (saveBtn) saveBtn.textContent = isNewUnit ? "Crear unidad" : isEditUnit ? "Guardar unidad" : "Guardar datos";
  if (cancelBtn) cancelBtn.textContent = isNewSession ? "Cancelar creación" : "Cancelar";
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  editor.querySelector("select, input")?.focus();
  saveBtn.onclick = async () => {
    const data = readUnitDataEditor(editor);
    if (isNewUnit) {
      if (data.readingMode === "existing" && !data.readingRef) {
        toast("Selecciona una lectura o elige crearla con el chat o continuar sin lectura.");
        editor.querySelector("[data-new-unit-reading-picker]")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      closeUnitDataModal();
      await onSave?.(data);
      return;
    }
    if (isEditUnit) {
      closeUnitDataModal();
      await onSave?.(data);
      return;
    }
    if (isNewSession) {
      closeUnitDataModal();
      await onSave?.(data);
      return;
    }
    store.updateMeta(data);
    syncMetaControls(store.getState().session);
    closeUnitDataModal();
    persist();
    scheduleReadingsReload({ silent: true, delay: 0 });
    scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
  };
}

function openActivityEditorModal(activity = {}, onSave) {
  const originalHtml = String(activity.html || "");
  openRichTextEditorModal({
    title: `Editar actividad${activity.title ? ": " + activity.title : ""}`,
    kicker: "Actividad",
    label: "Contenido de la actividad",
    ariaLabel: "Editor de texto enriquecido para actividad",
    html: getActivityEditorContent(originalHtml),
    onSave: (nextHtml) => onSave?.(wrapActivityEditorContent(nextHtml))
  });
}

function openResourceEditorModal(resource = {}, onSave) {
  const originalHtml = String(resource.html || "");
  const resourceLabel = buildResourceContextLabel(resource.type);
  openRichTextEditorModal({
    title: `Editar ${resourceLabel.toLowerCase()}${resource.code || resource.title ? `: ${resource.code || resource.title}` : ""}`,
    kicker: resourceLabel,
    label: "Contenido del recurso",
    ariaLabel: `Editor de texto enriquecido para ${resourceLabel.toLowerCase()}`,
    html: getResourceEditorContent(originalHtml),
    onSave: (nextHtml) => onSave?.(wrapResourceEditorContent(originalHtml, nextHtml, resource.type))
  });
}

function openRichTextEditorModal({ title = "Editar contenido", kicker = "Contenido", label = "Contenido", ariaLabel = "Editor de texto enriquecido", html = "", onSave } = {}) {
  const modal = document.getElementById("cbSyaModal");
  const editor = document.getElementById("cbSyaModalEditor");
  const titleEl = modal?.querySelector("#cbSyaModalTitle");
  if (!modal || !editor) return;

  if (titleEl) titleEl.textContent = title;
  editor.setAttribute("aria-label", ariaLabel);
  modal.classList.add("cb-modal--rich-editor");
  editor.innerHTML = `
    <div class="cb-rich-text-field">
      <label for="cbActivityEditorTextarea">${escapeHtmlText(label)}</label>
      <textarea id="cbActivityEditorTextarea">${escapeHtmlText(html)}</textarea>
    </div>
  `;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  const textarea = document.getElementById("cbActivityEditorTextarea");
  initializeActivityRichTextEditor(textarea);
  editor.querySelector(".trumbowyg-editor")?.focus();

  pendingSyaModalResolver = ({ action }) => {
    if (action === "save") {
      const nextHtml = getActivityRichTextHtml(textarea);
      if (stripHtml(nextHtml).trim()) onSave?.(nextHtml);
    }
    pendingSyaModalResolver = null;
    closeSyaEditorModal();
  };
}

function initializeActivityRichTextEditor(textarea) {
  const jq = window.jQuery;
  if (!textarea || !jq?.fn?.trumbowyg) return;
  registerSpanishTrumbowygLanguage(jq);
  jq(textarea).trumbowyg({
    svgPath: "vendor/trumbowyg/icons.svg",
    lang: "es",
    semantic: true,
    semanticKeepAttributes: true,
    removeformatPasted: true,
    btns: [
      ["undo", "redo"],
      ["formatting"],
      ["strong", "em", "underline"],
      ["unorderedList", "orderedList"],
      ["justifyLeft", "justifyCenter", "justifyRight"],
      ["createLink", "unlink"],
      ["removeformat"],
      ["viewHTML", "fullscreen"]
    ]
  });
}

function getActivityRichTextHtml(textarea) {
  const jq = window.jQuery;
  const html = textarea && jq?.fn?.trumbowyg && jq(textarea).data("trumbowyg")
    ? jq(textarea).trumbowyg("html")
    : textarea?.value || "";
  return sanitizeActivityEditorHtml(html);
}

function getActivityEditorContent(html = "") {
  const source = String(html || "").trim();
  if (!source || typeof DOMParser === "undefined") return source;
  const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
  return doc.querySelector(".activity")?.innerHTML || source;
}

function wrapActivityEditorContent(html = "") {
  return `<div class="activity">${String(html || "").trim()}</div>`;
}

function getResourceEditorContent(html = "") {
  const source = String(html || "").trim();
  if (!source || typeof DOMParser === "undefined") return source;
  const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
  return findResourceEditorNode(doc)?.innerHTML || source;
}

function wrapResourceEditorContent(originalHtml = "", html = "", type = "") {
  const nextHtml = String(html || "").trim();
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div>${String(originalHtml || "")}</div>`, "text/html");
    const resourceNode = findResourceEditorNode(doc);
    if (resourceNode) {
      resourceNode.innerHTML = nextHtml;
      return resourceNode.outerHTML;
    }
  }
  const safeType = escapeAttr(String(type || "resource").toLowerCase());
  return `<div class="resource-${safeType}" data-resource-type="${safeType}">${nextHtml}</div>`;
}

function findResourceEditorNode(doc) {
  return doc?.querySelector("[data-resource-type], [data-resource-section='true'], .resource-ficha, .resource-anexo, .resource-recortable, .resource-video, .guion-video") || null;
}

function sanitizeActivityEditorHtml(html = "") {
  const source = String(html || "").trim();
  if (!source || typeof DOMParser === "undefined") return source;
  const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  root.querySelectorAll("script, style, iframe, object, embed, form, input, button").forEach((node) => node.remove());
  root.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || "").trim();
      if (name.startsWith("on") || ((name === "href" || name === "src") && /^javascript:/i.test(value))) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return root.innerHTML.trim();
}

function registerSpanishTrumbowygLanguage(jq) {
  if (jq.trumbowyg.langs.es) return;
  jq.trumbowyg.langs.es = {
    ...jq.trumbowyg.langs.en,
    viewHTML: "Ver HTML",
    undo: "Deshacer",
    redo: "Rehacer",
    formatting: "Formato",
    p: "Párrafo",
    blockquote: "Cita",
    header: "Encabezado",
    bold: "Negrita",
    italic: "Cursiva",
    underline: "Subrayado",
    strong: "Negrita",
    em: "Cursiva",
    unorderedList: "Lista con viñetas",
    orderedList: "Lista numerada",
    createLink: "Insertar enlace",
    unlink: "Quitar enlace",
    justifyLeft: "Alinear a la izquierda",
    justifyCenter: "Centrar",
    justifyRight: "Alinear a la derecha",
    removeformat: "Limpiar formato",
    fullscreen: "Pantalla completa",
    close: "Cerrar",
    submit: "Aceptar",
    reset: "Cancelar",
    required: "Obligatorio",
    text: "Texto",
    title: "Título"
  };
}

async function openReadingsModal() {
  const modal = document.getElementById("cbReadingsModal");
  const search = document.getElementById("cbReadingSearchModal");
  const list = document.getElementById("cbReadingModalList");
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  if (search) search.value = readingFilter || "";
  if (list) list.innerHTML = `<div class="cb-empty">Cargando lecturas ASC y Lecturas nuevas...</div>`;
  search?.focus();
  const seq = ++readingsModalLoadSeq;
  const session = store.getState().session;
  const readings = await listReadingsForUnit({ meta: session.meta, limit: 0, includeAll: true }).catch((error) => {
    console.error("[charly-brown] complete readings list failed", error);
    toast(`No se pudieron cargar todas las lecturas: ${error.message}`);
    return currentReadingOptions;
  });
  if (seq !== readingsModalLoadSeq || modal.hidden) return;
  currentReadingOptions = readings;
  renderReadingsModal();
}

function closeReadingsModal() {
  const modal = document.getElementById("cbReadingsModal");
  if (!modal || modal.hidden) return;
  const active = document.activeElement;
  if (active && modal.contains(active) && typeof active.blur === "function") active.blur();
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  modal.inert = true;
  readingsModalLoadSeq += 1;
}

async function openSettingsModal() {
  const modal = document.getElementById("cbSettingsModal");
  if (!modal) return;
  settingsModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderGeminiModelOptions(store.getState().session.meta?.model);
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  modal.querySelector("#cbSettingsSectionCreate, .cb-modal-close")?.focus();
  await refreshSettingsSectionCatalog();
}

function closeSettingsModal() {
  const modal = document.getElementById("cbSettingsModal");
  if (!modal || modal.hidden) return;
  const active = document.activeElement;
  if (active && modal.contains(active) && typeof active.blur === "function") active.blur();
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  modal.inert = true;
  (settingsModalReturnFocus || document.getElementById("cbSettingsBtn"))?.focus();
  settingsModalReturnFocus = null;
}

function openArchivedUnit(unitId = "") {
  if (!store.selectUnit(unitId)) return;
  syncMetaControls(store.getState().session);
  scheduleReadingsReload({ silent: true, delay: 0 });
  scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
  persist();
}

function withUnit(unitId = "", callback) {
  if (unitId && unitId !== store.getState().session.activeUnitId) openArchivedUnit(unitId);
  return callback?.();
}

function selectSession(session) {
  if (!session) return;
  store.setSession(session);
  syncMetaControls(session);
  scheduleReadingsReload({ silent: true, delay: 0 });
  scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
}

async function renameSession(session) {
  const title = prompt("Nombre de la sesión", session?.title || "Unidad");
  if (!title || !session) return;
  store.setSession({ ...session, title });
  await persist();
  await refreshSessions();
}

async function duplicateSelectedSession(session) {
  if (!session) return;
  const copy = await duplicateSession(session);
  store.setSession(copy);
  await refreshSessions();
}

async function deleteSelectedSession(session) {
  if (!session || !confirm("¿Eliminar esta sesión?")) return;
  await deleteSession(session.id);
  await refreshSessions();
  if (!store.getState().sessions.length) await createNewSession();
}

async function handleUserMessage(text, { replaceMessageId = "" } = {}) {
  if (!ensureActiveUnit()) return;
  if (replaceMessageId) store.updateMessage(replaceMessageId, { role: "user", text });
  else store.addMessage({ role: "user", text });
  await persist();
  const intent = routeUserIntent(text);
  if (intent === "chat") return handleFreeChat(text);
  await handleAction(intent, text);
}

async function handleAction(action, userText = "") {
  if (action === "start-select-reading") return openNewUnitModal("existing");
  if (action === "start-create-reading") return openNewUnitModal("chat");
  if (!ensureActiveUnit()) return;
  if (action === "reading") return handleGenerateReading(userText);
  if (action === "select-reading") return handleSelectReading();
  if (action === "sya") return handleLoadSya({ silent: false, replaceExisting: true });
  if (action === "activities") return handleGenerateActivities(userText);
  if (action === "teacher-notes") return handleGenerateTeacherNotes("");
}

function ensureActiveUnit() {
  if (store.getState().session.activeUnitId) return true;
  toast("Crea una unidad antes de comenzar el chat.");
  openNewUnitModal();
  return false;
}

async function handleFreeChat(text = "") {
  return runMcpChatAgent(text, { status: "Generando..." });
}

async function runMcpChatAgent(text = "", { status = "Generando..." } = {}) {
  setComposerBusy(true);
  chatController?.showTransientStatus(status);
  try {
    const session = store.getState().session;
    const proposalIds = new Set((session.proposals || []).map((proposal) => proposal.id));
    const result = await sendCharlyChat({
      sessionId: session.id,
      targetUnitId: session.activeUnitId,
      text,
      model: session.meta?.model
    }).catch((error) => ({ error }));
    if (result.error) return store.addMessage({ role: "assistant", text: `No pude responder el chat: ${result.error.message}` });
    if (result.session) store.setSession(result.session);
    const newProposals = (store.getState().session.proposals || []).filter((proposal) => !proposalIds.has(proposal.id));
    newProposals.reverse().forEach((proposal) => store.addMessage({ role: "assistant", html: renderProposalMessage(proposal), proposalId: proposal.id }));
    await persist();
    return result;
  } finally {
    chatController?.clearTransientStatus();
    setComposerBusy(false);
  }
}

async function handleGenerateReading(userText = "") {
  const current = store.getState().session;
  const activeUnit = current.units?.find((unit) => unit.id === current.activeUnitId);
  const next = getNextWorkflowStep(activeUnit?.workflow || {});
  const readingStage = ["reading", "synonyms", "comprehension"].includes(next.kind) ? next.kind : "reading";
  const brief = String(userText || "").trim();
  const prompt = `Consulta get_unit_workflow y usa design_reading_stage para crear una propuesta de ${readingStage}. Usa sessionId=${current.id}, targetUnitId=${current.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)} y readingStage=${readingStage}.${brief ? ` Instrucción adicional: ${brief}` : ""} No apruebes el contenido.`;
  return runMcpChatAgent(prompt, { status: `Diseñando ${readingStage === "synonyms" ? "sinónimos" : readingStage === "comprehension" ? "comprensión" : "lectura"}...` });
}

async function handleSelectReading() {
  return loadReadingsForCurrentSession({ silent: false });
}

async function loadReadingsForCurrentSession({ silent = true } = {}) {
  const session = store.getState().session;
  const seq = ++readingLoadSeq;
  const readings = await listReadingsForUnit({ meta: session.meta, limit: 80 }).catch((error) => {
    if (!silent) store.addMessage({ role: "assistant", text: `No pude cargar lecturas: ${error.message}` });
    console.error("[charly-brown] listReadingsForUnit failed", error);
    return [];
  });
  if (seq !== readingLoadSeq) return;
  currentReadingOptions = readings;
  if (!currentReadingOptions.length) {
    if (!silent) flashWorkingStatus();
    renderAll(store.getState());
    return;
  }
  if (!silent) toast(`${currentReadingOptions.length} lecturas listas para elegir`);
  renderAll(store.getState());
}

function scheduleReadingsReload({ silent = true, delay = 450 } = {}) {
  clearTimeout(readingLoadTimer);
  readingLoadTimer = setTimeout(() => {
    loadReadingsForCurrentSession({ silent });
  }, delay);
}

function scheduleSyaReload({ silent = true, delay = 450, replaceExisting = false } = {}) {
  clearTimeout(syaLoadTimer);
  syaLoadTimer = setTimeout(() => {
    handleLoadSya({ silent, replaceExisting });
  }, delay);
}

async function handleLoadSya({ silent = false, replaceExisting = false } = {}) {
  const session = store.getState().session;
  const expectedContextKey = buildSyaContextKey(session.meta);
  const hasCurrentContext = session.syaContextKey === expectedContextKey;
  if (!replaceExisting && hasCurrentContext && (session.accepted?.sya || session.sya)) {
    if (!silent) flashWorkingStatus();
    return;
  }
  const seq = ++syaLoadSeq;
  const sya = await loadSyaForMeta(session.meta).catch((error) => {
    if (!silent) {
      store.addMessage({ role: "assistant", text: `No pude cargar la secuencia: ${error.message}` });
    }
    console.error("[charly-brown] loadSyaForMeta failed", error);
    return null;
  });
  if (seq !== syaLoadSeq || !sya) return;
  const current = store.getState().session;
  const contextKey = buildSyaContextKey(current.meta);
  const currentOriginal = current.accepted?.syaOriginal || current.syaOriginal || null;
  const currentActive = current.accepted?.sya || current.sya || null;
  const sameContext = current.syaContextKey === contextKey;
  const shouldKeepEditedVersion = sameContext && currentOriginal && currentActive && !sameSerializedObject(currentOriginal, currentActive);
  if (sameContext && sameSerializedObject(currentOriginal, sya) && (shouldKeepEditedVersion || sameSerializedObject(currentActive, sya))) return;

  const nextActive = shouldKeepEditedVersion ? currentActive : sya;
  store.patchSession({
    sya: nextActive,
    syaOriginal: sya,
    syaContextKey: contextKey,
    accepted: { ...(current.accepted || {}), sya: nextActive, syaOriginal: sya }
  });
  if (!silent) flashWorkingStatus();
  await persist();
}

async function handleGenerateActivities(userText = "", forcedSection = "", forcedSectionId = "", forcedSubtopic = "") {
  await ensureSyaReadyForGeneration();
  let session = store.getState().session;
  const workflow = session.units?.find((unit) => unit.id === session.activeUnitId)?.workflow || {};
  let nextSection = getNextWorkflowStep(workflow);
  let section = forcedSection || nextSection.section || "";
  let sectionId = forcedSectionId || nextSection.sectionId || "";
  let requestedSubtopic = forcedSubtopic || nextSection.subtopic || "";
  if (!section) {
    const selected = await openActivitySectionsModal();
    if (!selected) return;
    store.setActivitySections(selected);
    await persist();
    session = store.getState().session;
    nextSection = getNextWorkflowStep(session.units?.find((unit) => unit.id === session.activeUnitId)?.workflow || {});
    section = nextSection.section || selected[0]?.section || "";
    sectionId = nextSection.sectionId || selected[0]?.sectionId || "";
    requestedSubtopic = nextSection.subtopic || selected[0]?.subtopic || "";
  }
  const workflowItems = session.units?.find((unit) => unit.id === session.activeUnitId)?.workflow?.activitySections || [];
  const workflowItem = workflowItems.find((item) => {
    const sameSection = (sectionId && item.sectionId === sectionId) || (!sectionId && item.section === section);
    return sameSection && (!requestedSubtopic || item.subtopic === requestedSubtopic);
  }) || workflowItems.find((item) => {
    const sameSection = (sectionId && item.sectionId === sectionId) || (!sectionId && item.section === section);
    return sameSection && !["approved", "skipped"].includes(item.status);
  });
  const subtopic = String(workflowItem?.subtopic || session.meta?.subtopic || "").trim();
  const category = String(workflowItem?.category || session.meta?.category || "").trim();
  let resourceSelections = workflowItem?.resourceSelections || null;
  if (workflowItem?.resourcesConfigured !== true) {
    resourceSelections = await openResourcesModal(resourceSelections || {});
    if (!resourceSelections) return;
  }
  const catalogResult = await listActivitySections(session.meta || {}).catch(() => ({ sections: activitySectionCatalog }));
  const effectiveSection = catalogResult.sections?.find((item) => item.id === sectionId) || catalogResult.sections?.find((item) => item.name === section);
  if (effectiveSection) {
    section = subtopic && subtopic !== ALL_OPTION ? `${effectiveSection.name} · ${formatSubtopicLabel(subtopic)}` : effectiveSection.name;
    sectionId = effectiveSection.id;
  }
  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId);
  const brief = String(userText || "").trim();
  const resourceTypes = selectedResourceContentTypes(resourceSelections);
  const prompt = `Usa design_activity para crear una sola propuesta de la sección ${section}. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}, section=${section}${sectionId ? `, sectionId=${sectionId}` : ""}${category ? `, category=${category}` : ""}${subtopic ? `, subtopic=${subtopic}` : ""} y resourceTypes=${JSON.stringify(resourceTypes)}.${brief ? ` Instrucción adicional: ${brief}` : ""} Consulta la definición vigente, la lectura completa y la memoria editorial. Genera la actividad y cada recurso seleccionado dentro de la misma propuesta, como bloques separados para aprobarlos independientemente. La consigna de la actividad debe nombrar cada recurso y explicar exactamente en qué paso se usa. No apruebes el contenido.`;
  return runMcpChatAgent(prompt, { status: `Diseñando ${section}...` });
}

function selectedResourceContentTypes(selections = {}) {
  return [
    selections.fichas && "worksheet",
    selections.anexos && "annex",
    selections.recortables && "cutout",
    selections.videos && "video-script"
  ].filter(Boolean);
}

function bindProposalActions() {
  document.addEventListener("click", async (event) => {
    const resourceButton = event.target.closest?.("[data-resource-proposal-action]");
    if (resourceButton) {
      const resourceCard = resourceButton.closest("[data-resource-proposal-index]");
      const proposalId = resourceCard?.closest("[data-proposal-id]")?.dataset.proposalId || "";
      const proposal = (store.getState().session.proposals || []).find((item) => item.id === proposalId);
      if (!proposal) return;
      const resources = extractResourceBlocks(proposal.html);
      const index = Number(resourceCard?.dataset.resourceProposalIndex || -1);
      const resource = Number.isInteger(index) && index >= 0 ? resources[index] : null;
      if (!resource) return;
      const action = resourceButton.dataset.resourceProposalAction;
      if (action === "accept") {
        const linkedActivity = store.getState().session.accepted?.activities?.find((item) => item.sourceProposalId === proposal.id);
        store.acceptResources([{
          ...resource,
          sourceProposalId: proposal.id,
          activityId: linkedActivity?.id || resource.activityId || "",
          context: buildResourceContextLabel(resource.type)
        }]);
        flashWorkingStatus();
        await persist();
      }
      if (action === "reject") {
        store.addPreference(`No repetir el recurso ${buildResourceContextLabel(resource.type)} rechazado; corrige el diseño del material en la siguiente generación.`);
        flashWorkingStatus();
        await persist();
      }
      return;
    }

    const button = event.target.closest?.("[data-proposal-action]");
    if (!button) return;
    const proposalId = button.closest("[data-proposal-id]")?.dataset.proposalId || "";
    const action = button.dataset.proposalAction;
    const session = store.getState().session;
    const proposal = (session.proposals || []).find((item) => item.id === proposalId);
    if (!proposal) return;

    if (action === "accept") {
      if (proposal.validation?.ok === false) {
        store.addMessage({ role: "assistant", text: "Esa propuesta todavía no cumple la estructura mínima. Pídeme corregirla antes de aceptarla." });
        return;
      }
      if (proposal.targetUnitId && proposal.targetUnitId !== session.activeUnitId) {
        store.addMessage({ role: "assistant", text: "La propuesta pertenece a otra unidad. Abre esa unidad antes de aprobarla." });
        return;
      }
      if (proposal.createdBy === "charly-mcp" || ["create", "update", "delete", "regenerate"].includes(proposal.action)) {
        const proposalSubtopic = resolveProposalSubtopic(session, proposal);
        const acceptedProposal = proposal.contentType === "activity"
          ? { ...proposal, html: stripResourceBlocks(proposal.html), subtopic: proposalSubtopic, category: proposal.category || session.meta?.category || "" }
          : proposal;
        const outcome = store.applyContentProposal(acceptedProposal);
        if (!outcome?.ok) {
          store.addMessage({ role: "assistant", text: outcome?.error || "No pude aprobar la propuesta." });
          return;
        }
        if (proposal.contentType === "reading" && proposal.readingStage === "comprehension") {
          const approvedSession = store.getState().session;
          const approvedReading = approvedSession.accepted?.reading;
          const saved = await saveGeneratedReading({ reading: approvedReading, session: approvedSession }).catch(() => ({ saved: false }));
          if (saved?.saved) {
            const withSource = { ...approvedReading, id: saved.id, readingId: saved.id, collection: saved.collection, sourceLabel: "Lecturas nuevas" };
            store.patchSession({ reading: withSource, accepted: { ...approvedSession.accepted, reading: withSource } });
          }
        }
        if (proposal.contentType === "activity") {
          const activity = store.getState().session.accepted?.activities?.find((item) => item.sourceProposalId === proposal.id)
            || store.getState().session.accepted?.activities?.at(-1);
          if (activity?.id) store.linkProposalResources(proposal.id, activity.id);
        }
        proposeNextWorkflowStep();
        flashWorkingStatus();
        await persist();
        return;
      }
      if (proposal.contentType === "reading") {
        const reading = { ...(proposal.reading || {}), title: proposal.title, html: proposal.html };
        const saved = await saveGeneratedReading({ reading, session }).catch(() => ({ saved: false }));
        if (saved?.saved) Object.assign(reading, { id: saved.id, collection: saved.collection, sourceLabel: "Lecturas nuevas" });
        store.patchSession({ reading, accepted: { ...session.accepted, reading } });
        flashWorkingStatus();
        await persist();
        return;
      }
      const workMode = getWorkModeLabel(store.getState().session.meta || {});
      const activityHtml = stripResourceBlocks(proposal.html);
      store.acceptActivity({
        title: proposal.title || (workMode === "proyecto" ? "Proyecto aprobado" : "Actividad aprobada"),
        section: proposal.section || store.getState().session.meta?.category || "",
        subtopic: resolveProposalSubtopic(session, proposal),
        category: proposal.category || session.meta?.category || "",
        sourceProposalId: proposal.id,
        html: activityHtml
      });
      flashWorkingStatus();
      await persist();
      proposeNextWorkflowStep();
    }

    if (action === "reject") {
      store.addPreference("No repetir la propuesta rechazada; corregir enfoque y estructura en la siguiente generación.");
      flashWorkingStatus();
      await persist();
    }

    if (action === "regenerate" && proposal.contentType !== "reading") {
      await handleRegenerateProposal(proposal);
    }

    if (action === "easier") {
      store.updateMeta({ difficulty: "easy" });
      await handleRefineProposal(proposal, {
        difficulty: "easy",
        userText: "Haz esta misma propuesta más fácil, más guiada y más concreta para niños pequeños, sin cambiar el tema ni el aprendizaje."
      });
    }

    if (action === "harder") {
      store.updateMeta({ difficulty: "challenging" });
      await handleRefineProposal(proposal, {
        difficulty: "challenging",
        userText: "Haz esta misma propuesta más difícil sin cambiar el tema ni el subtema. Añade distractores plausibles, opciones múltiples con una sola correcta, inferencias, comparación de respuestas cercanas y evidencias más exigentes."
      });
    }

    if (action === "teacher-notes") {
      await handleGenerateTeacherNotes("");
    }
  });
}

function useReadingById(reference = "") {
  const reading = currentReadingOptions.find((item) => readingReference(item) === reference || item.id === reference);
  if (!reading) return;
  const acceptedReading = toAcceptedReading(reading);
  store.useReading(acceptedReading);
  toast(`Lectura seleccionada: ${reading.title}`);
  persist();
  proposeNextWorkflowStep();
}

function removeReading(unitId = "") {
  const unit = (store.getState().session.units || []).find((item) => item.id === unitId);
  if (!unit?.accepted?.reading) return;
  const title = String(unit.accepted.reading.title || "la lectura seleccionada").trim();
  if (!window.confirm(`¿Eliminar “${title}” de esta unidad? Después podrás elegir otra lectura.`)) return;
  withUnit(unitId, () => {
    store.useReading(null);
    persist();
  });
  toast("Lectura eliminada. Puedes elegir otra desde el panel de lecturas.");
}

function toAcceptedReading(reading = {}) {
  return {
    id: reading.id,
    readingId: reading.id,
    collection: reading.collection,
    type: reading.type,
    sourceLabel: reading.sourceLabel,
    title: reading.title,
    html: reading.html,
    text: reading.text,
    questions: reading.questions,
    sections: reading.sections || null,
    meta: reading.meta,
    raw: reading.raw || null
  };
}

function resolveProposalSubtopic(session = {}, proposal = {}) {
  const candidates = [proposal.subtopic, session.meta?.subtopic, proposal.title, proposal.section];
  const value = candidates.map(normalizeActivitySubtopicTitle).find(Boolean);
  return formatSubtopicLabel(value || "Actividad");
}

async function handleGenerateTeacherNotes(activityId = "") {
  const session = store.getState().session;
  const activities = activityId
    ? session.accepted.activities.filter((item) => item.id === activityId)
    : session.accepted.activities;
  if (!activities.length) {
    store.addMessage({ role: "assistant", text: "No hay actividades aprobadas para generar notas. Acepta al menos una actividad primero." });
    return;
  }
  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId);
  const mode = activityId ? "single" : "global";
  const prompt = `Usa create_teacher_notes para crear y guardar las notas del maestro. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}, mode=${mode}${activityId ? ` y targetActivityId=${activityId}` : ""}. Usa las actividades aprobadas, la lectura y la secuencia vigentes. No uses design_activity.`;
  return runMcpChatAgent(prompt, { status: "Generando notas del maestro..." });
}

async function handleGenerateResourceNotes(resourceId = "") {
  const session = store.getState().session;
  const resource = session.accepted.resources.find((item) => item.id === resourceId);
  if (!resource) return;
  const resourceLabel = buildResourceContextLabel(resource.type);
  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId);
  const prompt = `Usa create_teacher_notes para crear y guardar notas del maestro para el recurso aprobado ${resourceLabel}. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}, mode=resource y targetResourceId=${resourceId}. Usa la lectura y la secuencia vigentes.`;
  return runMcpChatAgent(prompt, { status: `Generando notas para ${resourceLabel.toLowerCase()}...` });
}

function editActivity(activityId = "") {
  const session = store.getState().session;
  const activity = session.accepted.activities.find((item) => item.id === activityId);
  if (!activity) return;
  openActivityEditorModal(activity, (nextHtml) => {
    store.updateActivity(activityId, { html: nextHtml });
    persist();
  });
}

function editReadingSection(part = "narrative") {
  const session = store.getState().session;
  const reading = session.accepted?.reading;
  if (!reading) return;
  const sections = reading.sections || {};
  const structuredQuestions = sections.questions || reading.questions || [];
  const source = part === "synonyms"
    ? sections.synonymsHtml || readingSynonymsEditorHtml(sections.synonyms)
    : part === "questions"
      ? structuredQuestions.length ? readingQuestionsEditorHtml(structuredQuestions) : sections.questionsHtml || ""
      : sections.narrativeHtml || reading.html || "";
  const labels = { narrative: "Lectura", synonyms: "Tabla de sinónimos", questions: "Preguntas de comprensión" };
  const label = labels[part] || labels.narrative;
  openRichTextEditorModal({
    title: `Editar ${label.toLowerCase()}`,
    kicker: "Lectura",
    label,
    ariaLabel: `Editor de texto enriquecido para ${label.toLowerCase()}`,
    html: source,
    onSave: (nextHtml) => {
      const next = { ...reading, revision: Math.max(1, Number(reading.revision || 0) + 1), sections: { ...sections } };
      if (part === "synonyms") {
        next.sections.synonymsHtml = nextHtml;
        next.sections.synonyms = [];
      } else if (part === "questions") {
        const questions = parseReadingQuestionsEditorHtml(nextHtml);
        next.sections.questionsHtml = nextHtml;
        next.sections.questions = questions;
        next.questions = questions;
      } else {
        next.html = nextHtml;
        next.sections.narrativeHtml = nextHtml;
      }
      store.patchSession({ reading: next, accepted: { ...session.accepted, reading: next } });
      persist();
    }
  });
}

function readingSynonymsEditorHtml(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return `<table><thead><tr><th>Palabra</th><th>Sinónimo simple</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtmlText(row.palabra || row.word || "")}</td><td>${escapeHtmlText(row.sinonimos || row.sinonimo || row.synonym || "")}</td></tr>`).join("")}</tbody></table>`;
}

function readingQuestionsEditorHtml(questions = []) {
  if (!Array.isArray(questions) || !questions.length) return "";
  return `<ol>${questions.map((question) => {
    const item = typeof question === "string" ? { texto: question } : question || {};
    const text = item.texto || item.prompt || item.pregunta || item.text || "";
    const level = item.nivel || item.level || "";
    const criteria = item.criterio || item.criteria || "";
    const answer = item.respuesta || item.answer || "";
    return `<li>
      <p data-question-field="texto"><strong>Pregunta:</strong> ${escapeHtmlText(text)}</p>
      <p data-question-field="nivel"><strong>Nivel taxonómico:</strong> ${escapeHtmlText(level)}</p>
      <p data-question-field="criterio"><strong>Criterio:</strong> ${escapeHtmlText(criteria)}</p>
      <p data-question-field="respuesta"><strong>Respuesta esperada:</strong> ${escapeHtmlText(answer)}</p>
    </li>`;
  }).join("")}</ol>`;
}

function parseReadingQuestionsEditorHtml(html = "") {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  return Array.from(doc.querySelectorAll("li")).map((item) => ({
    texto: readQuestionEditorField(item, "texto", /^pregunta\s*:/i),
    nivel: readQuestionEditorField(item, "nivel", /^nivel taxon[oó]mico\s*:/i),
    criterio: readQuestionEditorField(item, "criterio", /^criterio\s*:/i),
    respuesta: readQuestionEditorField(item, "respuesta", /^respuesta esperada\s*:/i)
  })).filter((item) => item.texto || item.nivel || item.criterio || item.respuesta);
}

function readQuestionEditorField(item, field, labelPattern) {
  const node = item.querySelector(`[data-question-field="${field}"]`);
  if (!node) return "";
  return String(node.textContent || "").replace(labelPattern, "").replace(/\s+/g, " ").trim();
}

function editResource(resourceId = "") {
  const session = store.getState().session;
  const resource = session.accepted.resources.find((item) => item.id === resourceId);
  if (!resource) return;
  openResourceEditorModal(resource, (nextHtml) => {
    store.updateResource(resourceId, { html: nextHtml });
    persist();
  });
}

async function regenerateActivity(activityId = "") {
  const session = store.getState().session;
  const activity = session.accepted.activities.find((item) => item.id === activityId);
  if (!activity) return;
  const regenerationSession = buildActivityRegenerationSession(session, activity);
  const isTracingLetters = regenerationSession.meta?.subtopic === "TrazosDeLetras";
  setActivityRegenerationBusy(activityId, true);
  chatController?.showTransientStatus("Regenerando actividad...");
  try {
    const result = await refineActivities({
      session: regenerationSession,
      currentHtml: activity.html,
      difficulty: regenerationSession.meta?.difficulty || "normal",
      userText: isTracingLetters
        ? "Regenera Trazos de letras conservando exactamente cuatro actividades: direccionalidad de mayúscula y minúscula, repetición en renglón y dos frases breves para leer y trazar. Cada bloque debe usar .trace-model y una respuesta modelo en magenta, sin listas internas."
        : "Regenera esta actividad aprobada mejorando claridad y estructura sin cambiar su aprendizaje.",
      model: regenerationSession.meta?.model
    }).catch((error) => ({ error }));
    if (result.error) return store.addMessage({ role: "assistant", text: `No pude regenerar la actividad: ${result.error.message}` });
    const proposal = { id: createId("proposal"), title: activity.title || "Actividad regenerada", section: activity.section, html: result.html, validation: result.validation, styleReview: result.styleReview, action: "regenerate", contentType: "activity", targetUnitId: session.activeUnitId, targetContentId: activity.id, baseRevision: Number((session.units || []).find((unit) => unit.id === session.activeUnitId)?.revision || 0) };
    store.addProposal(proposal);
    store.addMessage({ role: "assistant", html: renderProposalMessage(proposal) });
    await persist();
  } finally {
    setActivityRegenerationBusy(activityId, false);
    chatController?.clearTransientStatus();
  }
}

function buildActivityRegenerationSession(session = {}, activity = {}) {
  const section = String(activity.section || activity.title || "");
  const normalizedSection = normalizeForLocalIntent(section).replace(/[^a-z0-9]+/g, "");
  const storedSubtopic = String(activity.subtopic || "").trim();
  const subtopic = storedSubtopic || (normalizedSection.includes("trazosdeletras") ? "TrazosDeLetras" : String(session.meta?.subtopic || "").trim());
  const category = String(activity.category || "").trim()
    || (section.includes("·") ? section.split("·")[0].trim() : "")
    || String(session.meta?.category || "").trim();
  return {
    ...session,
    meta: {
      ...(session.meta || {}),
      category,
      subtopic
    }
  };
}

function setActivityRegenerationBusy(activityId = "", busy = false) {
  const card = Array.from(document.querySelectorAll("[data-activity-id]")).find((item) => item.dataset.activityId === activityId);
  const body = card?.querySelector(".cb-approved-card-body");
  if (!card || !body) return;
  card.classList.toggle("is-regenerating", busy);
  body.setAttribute("aria-busy", busy ? "true" : "false");
  body.querySelector(".cb-approved-card-spinner")?.remove();
  if (!busy) return;
  body.insertAdjacentHTML("afterbegin", `
    <div class="cb-approved-card-spinner" role="status" aria-live="polite">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Regenerando subtema...</span>
    </div>
  `);
}

async function regenerateResource(resourceId = "") {
  const session = store.getState().session;
  const resource = session.accepted.resources.find((item) => item.id === resourceId);
  if (!resource) return;
  chatController?.showTransientStatus("Working");
  try {
    const result = await generateActivities({
      session,
      userText: `Regenera solo el recurso ${buildResourceContextLabel(resource.type)} con el mismo contexto, la misma unidad y la misma secuencia, pero redactado nuevamente.`,
      model: session.meta?.model,
      resourceSelections: resourceSelectionsForType(resource.type)
    }).catch((error) => ({ error }));
    if (result.error) return store.addMessage({ role: "assistant", text: `No pude regenerar el recurso: ${result.error.message}` });
    const refreshed = extractResourceBlocks(result.html).find((item) => item.type === resource.type);
    if (!refreshed) {
      store.addMessage({ role: "assistant", text: "La regeneración no devolvió el recurso esperado." });
      return;
    }
    const proposal = { id: createId("proposal"), title: resource.title || resource.code || "Recurso regenerado", section: resource.section || session.meta?.category, html: refreshed.html, action: "regenerate", contentType: contentTypeForResource(resource.type), targetUnitId: session.activeUnitId, targetContentId: resource.id, baseRevision: Number((session.units || []).find((unit) => unit.id === session.activeUnitId)?.revision || 0), styleReview: result.styleReview };
    store.addProposal(proposal);
    store.addMessage({ role: "assistant", html: renderProposalMessage(proposal) });
    await persist();
  } finally {
    chatController?.clearTransientStatus();
  }
}

function contentTypeForResource(type = "") {
  const value = String(type || "").toLowerCase();
  if (value.includes("ficha")) return "worksheet";
  if (value.includes("recort")) return "cutout";
  if (value.includes("video") || value.includes("guion")) return "video-script";
  return "annex";
}

async function handleRefineProposal(proposal = {}, { difficulty = "normal", userText = "" } = {}) {
  await ensureSyaReadyForGeneration();
  const session = store.getState().session;
  const titlePrefix = buildGeneratedActivityTitle(session.meta || {}, difficulty);
  chatController?.showTransientStatus("Working");
  try {
    const result = await refineActivities({
      session,
      currentHtml: proposal.html || "",
      difficulty,
      userText,
      model: session.meta?.model
    }).catch((error) => ({ error }));
    if (result.error) return store.addMessage({ role: "assistant", text: `No pude refinar activities: ${result.error.message}` });
    const nextProposal = {
      id: createId("proposal"),
      title: titlePrefix,
      html: result.html,
      validation: result.validation
    };
    store.addProposal(nextProposal);
    store.addMessage({ role: "assistant", html: renderProposalMessage(nextProposal) });
    await persist();
  } finally {
    chatController?.clearTransientStatus();
  }
}

async function handleRegenerateProposal(proposal = {}) {
  await ensureSyaReadyForGeneration();
  const session = store.getState().session;
  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId);
  const section = String(proposal.section || session.meta?.category || "").trim();
  const sectionId = String(proposal.sectionId || "").trim();
  const targetContentId = String(proposal.targetContentId || "").trim();
  const prompt = `Usa design_activity para regenerar una sola propuesta de actividad de la sección ${section || "activa"}. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}${section ? `, section=${section}` : ""}${sectionId ? `, sectionId=${sectionId}` : ""}${targetContentId ? ` y targetContentId=${targetContentId}` : ""}. Vuelve a leer completa la lectura narrativa aprobada y diseña nuevamente la actividad basándote principalmente en esa narración: sus hechos, personajes, ideas, situaciones y vocabulario contextualizado. Toma la secuencia y alcance completa como marco curricular. La tabla de sinónimos y las preguntas existentes son solo apoyo secundario y no deben definir el ejercicio. Conserva el propósito y el subtema de esta propuesta, pero crea consignas y respuestas nuevas. No generes recursos, no apruebes el contenido y no uses otra herramienta de creación.`;
  return runMcpChatAgent(prompt, { status: "Releyendo la lectura y regenerando la actividad..." });
}

function bindAcceptedPanelControls() {
  const shell = document.querySelector(".cb-unit-shell");
  const toggle = document.getElementById("cbToggleAcceptedBtn");
  const handle = document.getElementById("cbAcceptedResizeHandle");
  const savedWidth = Number(localStorage.getItem("cbAcceptedPanelWidth") || DEFAULT_ACCEPTED_WIDTH);
  setAcceptedPanelWidth(savedWidth);
  const clampAcceptedPanel = () => setAcceptedPanelWidth(getAcceptedPanelWidth());
  window.addEventListener("resize", clampAcceptedPanel, { passive: true });
  if (shell && typeof ResizeObserver === "function") new ResizeObserver(clampAcceptedPanel).observe(shell);

  document.getElementById("cbAutomateUnitBtn")?.addEventListener("click", createAutomatedUnit);

  toggle?.addEventListener("click", () => {
    const hidden = !shell?.classList.contains("is-accepted-hidden");
    shell?.classList.toggle("is-accepted-hidden", hidden);
    setIconButtonLabel(toggle, hidden ? "Mostrar panel listo para usar" : "Ocultar panel listo para usar");
    toggle.setAttribute("aria-pressed", hidden ? "true" : "false");
    syncComposerFooterLayout();
  });

  handle?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = Number(getComputedStyle(document.documentElement).getPropertyValue("--cb-accepted-width").replace("px", "")) || DEFAULT_ACCEPTED_WIDTH;
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("cb-is-resizing-panel");

    const move = (moveEvent) => {
      const nextWidth = startWidth + (startX - moveEvent.clientX);
      setAcceptedPanelWidth(nextWidth);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.classList.remove("cb-is-resizing-panel");
      localStorage.setItem("cbAcceptedPanelWidth", String(getAcceptedPanelWidth()));
      syncComposerFooterLayout();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
}

function bindExportControls() {
  const modal = document.getElementById("cbExportModal");
  const openButton = document.getElementById("cbOpenExportBtn");
  openButton?.addEventListener("click", openExportModal);
  modal?.addEventListener("click", (event) => {
    const formatCard = event.target.closest?.("[data-export-format]");
    if (formatCard) selectExportFormat(formatCard.dataset.exportFormat);
    if (event.target.matches?.("[data-export-close]") || event.target.closest?.("[data-export-close]")) closeExportModal();
  });
  document.getElementById("cbExportDownloadBtn")?.addEventListener("click", downloadSelectedExport);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal?.hidden) closeExportModal();
  });
}

function openExportModal() {
  const modal = document.getElementById("cbExportModal");
  if (!modal) return;
  exportModalReturnFocus = document.activeElement;
  selectedExportFormat = "docx";
  selectExportFormat(selectedExportFormat);
  const status = document.getElementById("cbExportStatus");
  if (status) status.textContent = "";
  modal.hidden = false;
  modal.inert = false;
  modal.setAttribute("aria-hidden", "false");
  modal.querySelector("[data-export-format]")?.focus();
}

function closeExportModal() {
  const modal = document.getElementById("cbExportModal");
  if (!modal || modal.hidden) return;
  if (modal.contains(document.activeElement)) document.activeElement?.blur?.();
  modal.hidden = true;
  modal.inert = true;
  modal.setAttribute("aria-hidden", "true");
  exportModalReturnFocus?.focus?.();
  exportModalReturnFocus = null;
}

function selectExportFormat(format = "docx") {
  selectedExportFormat = ["docx", "pdf", "idml"].includes(format) ? format : "docx";
  document.querySelectorAll("[data-export-format]").forEach((card) => {
    const selected = card.dataset.exportFormat === selectedExportFormat;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-checked", selected ? "true" : "false");
  });
  const label = document.querySelector("#cbExportDownloadBtn span");
  if (label) label.textContent = `Descargar archivos ${selectedExportFormat.toUpperCase()}`;
}

async function downloadSelectedExport() {
  const button = document.getElementById("cbExportDownloadBtn");
  const status = document.getElementById("cbExportStatus");
  const sessionId = store.getState().session?.id;
  if (!sessionId || !button) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  if (status) status.textContent = `Preparando ${selectedExportFormat.toUpperCase()}...`;
  try {
    const files = await downloadApprovedFiles({ sessionId, format: selectedExportFormat });
    if (status) status.textContent = files.notesFilename
      ? "Contenido y notas del maestro descargados por separado."
      : `${files.contentFilename} está listo. No hay notas del maestro aprobadas.`;
    window.setTimeout(closeExportModal, 650);
  } catch (error) {
    if (status) status.textContent = String(error?.message || "No fue posible preparar la descarga.");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function bindSessionsPanelControls() {
  const handle = document.getElementById("cbSessionsResizeHandle");
  const savedWidth = Number(localStorage.getItem("cbSessionsPanelWidth") || DEFAULT_SESSIONS_WIDTH);
  setSessionsPanelWidth(savedWidth);

  handle?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = Number(getComputedStyle(document.documentElement).getPropertyValue("--cb-sessions-width").replace("px", "")) || DEFAULT_SESSIONS_WIDTH;
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("cb-is-resizing-panel");

    const move = (moveEvent) => {
      const nextWidth = startWidth + (moveEvent.clientX - startX);
      setSessionsPanelWidth(nextWidth);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.classList.remove("cb-is-resizing-panel");
      localStorage.setItem("cbSessionsPanelWidth", String(getSessionsPanelWidth()));
      syncComposerFooterLayout();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });

  // Close open overflow menus when clicking outside them.
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".cb-session-menu, .cb-card-menu")) {
      document.querySelectorAll(".cb-session-menu[open], .cb-card-menu[open]").forEach((el) => el.removeAttribute("open"));
    }
  });
}

function bindSyaEditingControls() {
  root.addEventListener("cb:sya-edit", () => {
    editSyaForCurrentSession();
  });
  root.addEventListener("cb:sya-restore", () => {
    restoreOriginalSyaForCurrentSession();
  });
  const modal = document.getElementById("cbSyaModal");
  const editor = document.getElementById("cbSyaModalEditor");
  const saveBtn = document.getElementById("cbSyaModalSave");
  const sectionModal = document.getElementById("cbSyaSectionModal");

  modal?.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-modal-close='sya']")) {
      pendingSyaModalResolver?.({ action: "cancel" });
      return;
    }
    const sectionButton = event.target?.closest?.("[data-sya-section]");
    if (sectionButton) openSyaSectionEditor(sectionButton.dataset.syaCategory || "", sectionButton.dataset.syaSubtopic || "");
  });
  sectionModal?.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-modal-close='sya-section']")) closeSyaSectionEditor();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (sectionModal && !sectionModal.hidden) {
      closeSyaSectionEditor();
      return;
    }
    if (pendingResourcesModalResolver) {
      pendingResourcesModalResolver?.({ action: "cancel" });
      return;
    }
    pendingSyaModalResolver?.({ action: "cancel" });
  });
  saveBtn?.addEventListener("click", () => {
    const richEditor = document.getElementById("cbSyaModal")?.classList.contains("cb-modal--rich-editor");
    pendingSyaModalResolver?.({ action: "save", value: richEditor ? serializeSyaEditor(editor) : copyValue(syaEditorDraft || {}) });
  });
  document.getElementById("cbSyaSectionSave")?.addEventListener("click", saveSyaSectionEditor);
  document.getElementById("cbSyaSectionRestore")?.addEventListener("click", restoreSyaSectionEditor);
  document.getElementById("cbSyaSectionCreate")?.addEventListener("click", () => openSyaSectionEditor("", "", { create: true }));
}

function bindUnitDataModalControls() {
  const modal = document.getElementById("cbUnitDataModal");
  document.getElementById("cbEditAcademicDataBtn")?.addEventListener("click", () => openUnitDataModal());
  modal?.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-modal-close='unit-data']")) {
      closeUnitDataModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeUnitDataModal();
  });
}

function bindResourcesModalControls() {
  const modal = document.getElementById("cbResourcesModal");
  const continueBtn = document.getElementById("cbResourcesModalContinue");
  modal?.addEventListener("click", (event) => {
    const close = event.target?.dataset?.modalClose === "resources" || event.target.closest?.("[data-modal-close='resources']");
    if (close) pendingResourcesModalResolver?.({ action: "cancel" });
    const toggle = event.target.closest?.("[data-resource-toggle]");
    if (!toggle) return;
    const key = String(toggle.dataset.resourceToggle || "").trim();
    if (!key || !(key in pendingResourceSelections)) return;
    pendingResourceSelections = {
      ...pendingResourceSelections,
      [key]: !pendingResourceSelections[key]
    };
    syncResourceModalUi();
  });
  continueBtn?.addEventListener("click", () => {
    pendingResourcesModalResolver?.({ action: "save", value: { ...pendingResourceSelections } });
  });
}

function bindActivitySectionsModalControls() {
  const modal = document.getElementById("cbActivitySectionsModal");
  const continueBtn = document.getElementById("cbActivitySectionsContinue");
  modal?.addEventListener("click", (event) => {
    const close = event.target?.dataset?.modalClose === "activity-sections" || event.target.closest?.("[data-modal-close='activity-sections']");
    if (close) closeActivitySectionsModal();
    const editButton = event.target.closest?.("[data-activity-section-edit]");
    if (editButton) {
      capturePendingActivitySectionSelection();
      openActivitySectionForm(activitySectionCatalog.find((section) => section.id === editButton.dataset.activitySectionEdit));
    }
  });
  modal?.addEventListener("change", async (event) => {
    const input = event.target.closest?.("input[data-activity-section]");
    if (input) {
      if (input.checked) await configureActivitySectionResources(input.value);
      else updatePendingActivitySectionOrder(input.value, false);
      renderActivitySectionCatalog();
    }
  });
  document.getElementById("cbActivitySectionCreate")?.addEventListener("click", () => {
    capturePendingActivitySectionSelection();
    openActivitySectionForm(null);
  });
  document.getElementById("cbActivitySectionFormBack")?.addEventListener("click", leaveActivitySectionForm);
  document.getElementById("cbActivitySectionFormCancel")?.addEventListener("click", leaveActivitySectionForm);
  document.getElementById("cbActivitySectionForm")?.addEventListener("submit", saveActivitySectionForm);
  document.getElementById("cbActivitySectionRestore")?.addEventListener("click", restoreActivitySectionForm);
  continueBtn?.addEventListener("click", async () => {
    capturePendingActivitySectionSelection();
    const selected = refreshPendingActivitySections();
    if (!selected.length) {
      toast("Selecciona al menos una sección.");
      return;
    }
    pendingActivitySectionsModalResolver?.(selected);
  });
}

async function openActivitySectionsModal() {
  const modal = document.getElementById("cbActivitySectionsModal");
  const list = document.getElementById("cbActivitySectionsList");
  if (!modal || !list) return Promise.resolve(null);
  activitySectionsReturnFocus = document.activeElement instanceof HTMLElement && !modal.contains(document.activeElement)
    ? document.activeElement
    : null;
  const session = store.getState().session;
  activitySectionModalContext = "selection";
  const existing = session.units?.find((unit) => unit.id === session.activeUnitId)?.workflow?.activitySections || [];
  pendingActivitySections = existing;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  showActivitySectionBrowse();
  setActivitySectionStatus("Cargando secciones...");
  list.innerHTML = "";
  await loadActivitySectionCatalog();
  return new Promise((resolve) => {
    pendingActivitySectionsModalResolver = (value) => {
      pendingActivitySectionsModalResolver = null;
      hideActivitySectionsModal(modal, { restoreFocus: true });
      resolve(value);
    };
  });
}

async function loadActivitySectionCatalog() {
  try {
    const result = await listActivitySections(store.getState().session.meta || {});
    activitySectionCatalog = result.sections;
    activitySectionCanManageGlobal = result.canManageGlobal === true;
    if (activitySectionModalContext === "selection") pendingActivitySections = refreshPendingActivitySections();
    renderActivitySectionCatalog();
    setActivitySectionStatus(`${activitySectionCatalog.length} secciones disponibles`);
    return true;
  } catch (error) {
    activitySectionCatalog = DEFAULT_ACTIVITY_SECTIONS.map((name) => ({ id: name, name, description: "Actividad alineada con la secuencia y alcance.", objective: "Aplicar los aprendizajes de la unidad.", agentInstructions: "Crea una actividad clara y verificable.", scope: "base", customized: false }));
    renderActivitySectionCatalog();
    setActivitySectionStatus("No se pudieron sincronizar las personalizaciones.");
    console.error("[charly-brown] activity sections failed", error);
    return false;
  }
}

async function openActivitySectionSettingsEditor(sectionId = "") {
  activitySectionModalContext = "settings";
  activitySectionsReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  closeSettingsModal();
  const modal = document.getElementById("cbActivitySectionsModal");
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  setActivitySectionStatus("Cargando secciones...");
  await loadActivitySectionCatalog();
  openActivitySectionForm(activitySectionCatalog.find((section) => section.id === sectionId) || null);
}

function closeActivitySectionsModal() {
  if (pendingActivitySectionsModalResolver) {
    pendingActivitySectionsModalResolver(null);
    return;
  }
  const modal = document.getElementById("cbActivitySectionsModal");
  if (modal) {
    modal.classList.remove("cb-modal--section-editor");
    hideActivitySectionsModal(modal, { restoreFocus: activitySectionModalContext !== "settings" });
  }
  if (activitySectionModalContext === "settings") openSettingsModal();
}

function hideActivitySectionsModal(modal, { restoreFocus = false } = {}) {
  if (!modal || modal.hidden) return;
  const active = document.activeElement;
  if (active && modal.contains(active) && typeof active.blur === "function") active.blur();
  modal.inert = true;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  if (restoreFocus && activitySectionsReturnFocus?.isConnected && typeof activitySectionsReturnFocus.focus === "function") {
    activitySectionsReturnFocus.focus();
  }
  activitySectionsReturnFocus = null;
}

function leaveActivitySectionForm() {
  if (activitySectionModalContext === "settings") closeActivitySectionsModal();
  else showActivitySectionBrowse();
}

function renderActivitySectionCatalog() {
  const list = document.getElementById("cbActivitySectionsList");
  if (!list) return;
  const selectedIds = Array.from(new Set((pendingActivitySections || []).map((item) => typeof item === "string" ? item : item.sectionId || item.id || item.section)));
  const selectedOrder = new Map(selectedIds.map((id, index) => [id, index + 1]));
  list.innerHTML = activitySectionCatalog.map((section) => {
    const order = selectedOrder.get(section.id) || selectedOrder.get(section.name) || 0;
    const checked = order > 0;
    const scopeLabel = section.scope === "personal" ? "Solo para mí" : section.scope === "global" ? "Para todos" : "Base";
    const selectedItem = (pendingActivitySections || []).find((item) => item.sectionId === section.id || item.section === section.name);
    const resourceBadges = checked ? renderActivitySectionResourceBadges(selectedItem?.resourceSelections) : "";
    return `<div class="cb-activity-section-item${checked ? " is-selected" : ""}">
      <label class="cb-activity-section-option">
        <input type="checkbox" data-activity-section value="${escapeAttr(section.id)}"${checked ? " checked" : ""}>
        <span><strong>${escapeHtmlText(section.name)}</strong><small>${escapeHtmlText(section.description)}</small><em>${escapeHtmlText(scopeLabel)}</em>${resourceBadges}</span>
      </label>
      ${checked ? `<span class="cb-activity-section-order" aria-label="Orden ${order}">${order}</span>` : ""}
      <button type="button" class="cb-icon-btn cb-activity-section-edit" data-activity-section-edit="${escapeAttr(section.id)}" aria-label="Editar ${escapeAttr(section.name)}" title="Editar sección"><i class="fas fa-pen" aria-hidden="true"></i></button>
    </div>`;
  }).join("");
}

function renderActivitySectionResourceBadges(selections = {}) {
  const resources = [
    ["fichas", "Ficha", "fa-file-alt"],
    ["anexos", "Anexo", "fa-paperclip"],
    ["recortables", "Recortable", "fa-cut"],
    ["videos", "Video", "fa-play-circle"]
  ].filter(([key]) => Boolean(selections?.[key]));
  if (!resources.length) return "";
  return `<span class="cb-activity-section-resource-badges" aria-label="Recursos seleccionados">
    ${resources.map(([key, label, icon]) => `<span class="cb-activity-section-resource-badge" data-resource-badge="${key}"><i class="fas ${icon}" aria-hidden="true"></i>${label}</span>`).join("")}
  </span>`;
}

function capturePendingActivitySectionSelection() {
  const modal = document.getElementById("cbActivitySectionsModal");
  const checkedIds = new Set(Array.from(modal?.querySelectorAll("input[data-activity-section]:checked") || []).map((input) => input.value));
  pendingActivitySections = (pendingActivitySections || []).filter((item) => {
    const id = typeof item === "string" ? item : item.sectionId || item.id || item.section;
    const catalogId = activitySectionCatalog.find((section) => section.name === id)?.id || id;
    return checkedIds.has(catalogId);
  });
}

function updatePendingActivitySectionOrder(sectionId = "", checked = false) {
  const section = activitySectionCatalog.find((item) => item.id === sectionId);
  if (!section) return;
  pendingActivitySections = (pendingActivitySections || []).filter((item) => {
    const id = typeof item === "string" ? item : item.sectionId || item.id || item.section;
    return id !== section.id && id !== section.name;
  });
}

async function configureActivitySectionResources(sectionId = "") {
  const section = activitySectionCatalog.find((item) => item.id === sectionId);
  const modal = document.getElementById("cbActivitySectionsModal");
  if (!section || !modal) return false;
  const existing = (pendingActivitySections || []).find((item) => item.sectionId === sectionId);
  document.activeElement?.blur?.();
  modal.inert = true;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  const resources = await openResourcesModal(existing?.resourceSelections || {});
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  updatePendingActivitySectionOrder(sectionId, false);
  if (!resources) return false;
  const subtopics = getActivitySectionSubtopics(section);
  if (!subtopics.length) {
    toast(`No hay subtemas disponibles para ${section.name}.`);
    return false;
  }
  pendingActivitySections.push(...subtopics.map((subtopic) => ({
    ...toWorkflowActivitySection(section, subtopic),
    resourceSelections: { ...resources },
    resourcesConfigured: true
  })));
  return true;
}

function refreshPendingActivitySections() {
  const groups = new Map();
  (pendingActivitySections || []).forEach((item) => {
    const id = typeof item === "string" ? item : item.sectionId || item.id || item.section;
    const section = activitySectionCatalog.find((entry) => entry.id === id || entry.name === id);
    if (!section || groups.has(section.id)) return;
    const resources = typeof item === "string" ? {} : item.resourceSelections || {};
    const configured = typeof item !== "string" && item.resourcesConfigured === true;
    groups.set(section.id, getActivitySectionSubtopics(section).map((subtopic) => ({
      ...toWorkflowActivitySection(section, subtopic),
      resourceSelections: { ...resources },
      resourcesConfigured: configured
    })));
  });
  pendingActivitySections = Array.from(groups.values()).flat();
  return pendingActivitySections;
}

function getActivitySectionSubtopics(section = {}) {
  const meta = store.getState().session.meta || {};
  const categoryMap = getCategoriesForGrade(meta.grade || "Primaria");
  const category = Object.keys(categoryMap).find((key) => normalizeForLocalIntent(key) === normalizeForLocalIntent(section.name));
  const values = category && Array.isArray(categoryMap[category])
    ? categoryMap[category]
    : Array.from(new Set(Object.values(categoryMap).flat()));
  return values.filter((value) => value && value !== ALL_OPTION);
}

function openActivitySectionForm(section = null) {
  editingActivitySection = section || null;
  document.getElementById("cbActivitySectionsModal")?.classList.add("cb-modal--section-editor");
  document.getElementById("cbActivitySectionsModalTitle").textContent = section ? "Editar sección" : "Crear sección";
  document.querySelector("#cbActivitySectionsModal .cb-modal-subtitle").textContent = "Define el propósito y el prompt que usará el agente para crear actividades de esta sección.";
  document.getElementById("cbActivitySectionsBrowse").hidden = true;
  document.getElementById("cbActivitySectionsFooter").hidden = true;
  const form = document.getElementById("cbActivitySectionForm");
  form.hidden = false;
  document.getElementById("cbActivitySectionId").value = section?.id || "";
  document.getElementById("cbActivitySectionName").value = section?.name || "";
  document.getElementById("cbActivitySectionDescription").value = section?.description || "";
  document.getElementById("cbActivitySectionObjective").value = section?.objective || "";
  document.getElementById("cbActivitySectionInstructions").value = section?.agentInstructions || "";
  document.getElementById("cbActivitySectionLevels").value = (section?.levels || []).join(", ");
  document.getElementById("cbActivitySectionGrades").value = (section?.grades || []).join(", ");
  document.getElementById("cbActivitySectionFormKicker").textContent = section ? "Editar sección" : "Nueva sección";
  document.getElementById("cbActivitySectionFormTitle").textContent = section?.name || "Configurar sección";
  const scope = section?.scope === "global" ? "global" : "personal";
  form.querySelector(`input[name='cbActivitySectionScope'][value='${scope}']`).checked = true;
  const globalInput = form.querySelector("input[name='cbActivitySectionScope'][value='global']");
  globalInput.disabled = !activitySectionCanManageGlobal;
  globalInput.closest("label").title = activitySectionCanManageGlobal ? "Visible para todos los usuarios aprobados" : "Disponible para editores";
  const restore = document.getElementById("cbActivitySectionRestore");
  restore.hidden = !section?.customized || !["personal", "global"].includes(section?.scope);
  document.getElementById("cbActivitySectionName").focus();
}

function showActivitySectionBrowse() {
  editingActivitySection = null;
  document.getElementById("cbActivitySectionsModal")?.classList.remove("cb-modal--section-editor");
  document.getElementById("cbActivitySectionsModalTitle").textContent = "Elegir secciones";
  document.querySelector("#cbActivitySectionsModal .cb-modal-subtitle").textContent = "Selecciona cada sección y elige sus recursos. Se generarán todos sus subtemas.";
  document.getElementById("cbActivitySectionForm").hidden = true;
  document.getElementById("cbActivitySectionsBrowse").hidden = false;
  document.getElementById("cbActivitySectionsFooter").hidden = false;
}

async function saveActivitySectionForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const section = {
    name: document.getElementById("cbActivitySectionName").value.trim(),
    description: document.getElementById("cbActivitySectionDescription").value.trim(),
    objective: document.getElementById("cbActivitySectionObjective").value.trim(),
    agentInstructions: document.getElementById("cbActivitySectionInstructions").value.trim(),
    levels: splitActivitySectionList(document.getElementById("cbActivitySectionLevels").value),
    grades: splitActivitySectionList(document.getElementById("cbActivitySectionGrades").value)
  };
  if (!form.reportValidity()) return;
  const scope = form.querySelector("input[name='cbActivitySectionScope']:checked")?.value || "personal";
  const meta = store.getState().session.meta || {};
  setBusy(document.getElementById("cbActivitySectionSave"), true);
  try {
    const result = editingActivitySection
      ? await updateActivitySection({ targetId: editingActivitySection.id, section, scope, meta })
      : await createActivitySection({ section, scope, meta });
    activitySectionCatalog = result.sections;
    renderActivitySectionCatalog();
    if (activitySectionModalContext === "settings") {
      closeActivitySectionsModal();
      toast("Sección guardada en Firebase.");
    } else {
      showActivitySectionBrowse();
      setActivitySectionStatus("Sección guardada en Firebase.");
    }
  } catch (error) {
    toast(error.message || "No se pudo guardar la sección.");
  } finally {
    setBusy(document.getElementById("cbActivitySectionSave"), false);
  }
}

async function restoreActivitySectionForm() {
  if (!editingActivitySection?.id) return;
  const meta = store.getState().session.meta || {};
  const button = document.getElementById("cbActivitySectionRestore");
  setBusy(button, true);
  try {
    const result = await restoreActivitySection({ targetId: editingActivitySection.id, scope: editingActivitySection.scope, meta });
    activitySectionCatalog = result.sections;
    renderActivitySectionCatalog();
    if (activitySectionModalContext === "settings") {
      closeActivitySectionsModal();
      toast("Sección restablecida a su versión original.");
    } else {
      showActivitySectionBrowse();
      setActivitySectionStatus("Sección restablecida a su versión original.");
    }
  } catch (error) {
    toast(error.message || "No se pudo restablecer la sección.");
  } finally {
    setBusy(button, false);
  }
}

function toWorkflowActivitySection(section = null, subtopic = "") {
  if (!section?.id || !section?.name) return null;
  return {
    sectionId: section.id,
    section: section.name,
    category: section.name,
    subtopic: String(subtopic || "").trim(),
    description: section.description || "",
    objective: section.objective || "",
    agentInstructions: section.agentInstructions || "",
    resourceSelections: { fichas: false, anexos: false, recortables: false, videos: false },
    resourcesConfigured: false
  };
}

function splitActivitySectionList(value = "") {
  const items = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.some((item) => /^todos?$/i.test(item)) ? [] : Array.from(new Set(items));
}

function setActivitySectionStatus(message = "") {
  const status = document.getElementById("cbActivitySectionsStatus");
  if (status) status.textContent = message;
}

function bindWorkflowControls() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-workflow-action]");
    if (!button) return;
    const action = button.dataset.workflowAction;
    if (action === "generate-reading") await handleGenerateReading("");
    if (action === "skip-stage") {
      store.markWorkflowStage(button.dataset.workflowStage || "", "skipped", { skippedAt: new Date().toISOString() });
      await persist();
      proposeNextWorkflowStep();
    }
    if (action === "select-activities") {
      const selected = await openActivitySectionsModal();
      if (!selected) return;
      store.setActivitySections(selected);
      await persist();
      proposeNextWorkflowStep();
    }
    if (action === "generate-activity") await handleGenerateActivities("", button.dataset.workflowSection || "", button.dataset.workflowSectionId || "", button.dataset.workflowSubtopic || "");
    if (action === "generate-resources") await handleGenerateResourcesForActivity(button.dataset.activityId || "");
  });
}

function bindReadingsModalControls() {
  const modal = document.getElementById("cbReadingsModal");
  const openBtn = document.getElementById("cbOpenReadingsBtn");
  const search = document.getElementById("cbReadingSearchModal");
  const list = document.getElementById("cbReadingModalList");

  openBtn?.addEventListener("click", openReadingsModal);
  modal?.addEventListener("click", (event) => {
    const close = event.target?.dataset?.modalClose === "readings" || event.target.closest?.("[data-modal-close='readings']");
    if (close) closeReadingsModal();
  });
  search?.addEventListener("input", (event) => {
    readingFilter = event.target.value;
    renderReadingsModal();
  });
  list?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-reading-action='use']");
    if (!button) return;
    const reference = button.closest("[data-reading-ref]")?.dataset.readingRef || "";
    if (!reference) return;
    useReadingById(reference);
    closeReadingsModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeReadingsModal();
  });
}

function bindSettingsModalControls() {
  const modal = document.getElementById("cbSettingsModal");
  const openBtn = document.getElementById("cbSettingsBtn");
  const composerModelBtn = document.getElementById("cbComposerModelBtn");
  const composerModelMenu = document.getElementById("cbComposerModelMenu");

  openBtn?.addEventListener("click", openSettingsModal);
  composerModelBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleComposerModelMenu();
  });
  composerModelMenu?.addEventListener("click", (event) => {
    const option = event.target.closest?.("[data-composer-model]");
    if (!option) return;
    const model = String(option.dataset.composerModel || "").trim();
    if (!model) return;
    store.updateMeta({ model });
    renderGeminiModelOptions(model);
    toggleComposerModelMenu(false);
    persist();
    composerModelBtn?.focus();
  });
  modal?.addEventListener("click", (event) => {
    const close = event.target?.dataset?.modalClose === "settings" || event.target.closest?.("[data-modal-close='settings']");
    if (close) closeSettingsModal();
    const editButton = event.target.closest?.("[data-settings-section-edit]");
    if (editButton) openActivitySectionSettingsEditor(editButton.dataset.settingsSectionEdit);
  });
  document.getElementById("cbSettingsSectionCreate")?.addEventListener("click", () => openActivitySectionSettingsEditor());
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("#cbComposerModelBtn, #cbComposerModelMenu")) toggleComposerModelMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleComposerModelMenu(false);
      closeSettingsModal();
    }
  });
}

async function refreshSettingsSectionCatalog() {
  const list = document.getElementById("cbSettingsSectionsList");
  const status = document.getElementById("cbSettingsSectionsStatus");
  if (!list) return;
  status.textContent = "Cargando secciones...";
  list.innerHTML = "";
  const synced = await loadActivitySectionCatalog();
  renderSettingsSectionCatalog();
  status.textContent = synced
    ? `${activitySectionCatalog.length} secciones disponibles`
    : "No se pudieron sincronizar las personalizaciones.";
}

function renderSettingsSectionCatalog() {
  const list = document.getElementById("cbSettingsSectionsList");
  if (!list) return;
  list.innerHTML = activitySectionCatalog.map((section) => {
    const scopeLabel = section.scope === "personal" ? "Solo para mí" : section.scope === "global" ? "Para todos" : "Base";
    return `<article class="cb-settings-section-row">
      <div><strong>${escapeHtmlText(section.name)}</strong><p>${escapeHtmlText(section.agentInstructions || section.description || "Sin instrucciones configuradas.")}</p><small>${escapeHtmlText(scopeLabel)}${section.customized ? " · Editada" : ""}</small></div>
      <button type="button" class="cb-icon-btn" data-settings-section-edit="${escapeAttr(section.id)}" aria-label="Editar prompt de ${escapeAttr(section.name)}" title="Editar sección"><i class="fas fa-pen" aria-hidden="true"></i></button>
    </article>`;
  }).join("");
}

function bindSyaModalOpenButton() {
  const openBtn = document.getElementById("cbOpenSyaBtn");
  openBtn?.addEventListener("click", openSyaPanel);
}

function openSyaPanel() {
  editSyaForCurrentSession();
}

function updateProjectModeUi(meta = {}) {
  const isProject = isProjectSelection(meta);
  const notesBtn = document.getElementById("cbGenerateGlobalNotesBtn");
  setIconButtonLabel(notesBtn, isProject ? "Crear notas del proyecto" : "Crear notas del maestro");
  document.body.classList.toggle("cb-project-mode", isProject);
}

function setIconButtonLabel(button, label) {
  if (!button) return;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function bindSetupPanelToggle() {
  const shell = document.querySelector(".cb-setup-panel-shell");
  const button = document.getElementById("cbToggleSetupPanelBtn");
  if (!shell || !button) return;

  const collapsed = localStorage.getItem(SETUP_PANEL_COLLAPSED_KEY) === "1";
  shell.classList.toggle("is-collapsed", collapsed);
  button.setAttribute("aria-expanded", collapsed ? "false" : "true");

  button.addEventListener("click", () => {
    const nextCollapsed = !shell.classList.contains("is-collapsed");
    shell.classList.toggle("is-collapsed", nextCollapsed);
    button.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
    localStorage.setItem(SETUP_PANEL_COLLAPSED_KEY, nextCollapsed ? "1" : "0");
  });
}

function setAcceptedPanelWidth(width = DEFAULT_ACCEPTED_WIDTH) {
  const dynamicMaximum = getAcceptedPanelMaximumWidth();
  const safe = Math.min(dynamicMaximum, Math.max(MIN_ACCEPTED_WIDTH, Number(width) || DEFAULT_ACCEPTED_WIDTH));
  document.documentElement.style.setProperty("--cb-accepted-width", `${safe}px`);
  syncComposerFooterLayout();
}

function getAcceptedPanelMaximumWidth() {
  if (window.matchMedia?.("(max-width: 1180px)").matches) return MAX_ACCEPTED_WIDTH;
  const shell = document.querySelector(".cb-unit-shell");
  if (!shell) return MAX_ACCEPTED_WIDTH;
  const style = getComputedStyle(shell);
  const horizontalPadding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const available = shell.clientWidth - horizontalPadding - getSessionsPanelWidth() - MIN_CHAT_WIDTH;
  return Math.max(MIN_ACCEPTED_WIDTH, Math.min(MAX_ACCEPTED_WIDTH, available));
}

function setSessionsPanelWidth(width = DEFAULT_SESSIONS_WIDTH) {
  const safe = Math.min(MAX_SESSIONS_WIDTH, Math.max(MIN_SESSIONS_WIDTH, Number(width) || DEFAULT_SESSIONS_WIDTH));
  document.documentElement.style.setProperty("--cb-sessions-width", `${safe}px`);
  syncComposerFooterLayout();
}

function getAcceptedPanelWidth() {
  return Number(getComputedStyle(document.documentElement).getPropertyValue("--cb-accepted-width").replace("px", "")) || DEFAULT_ACCEPTED_WIDTH;
}

function getSessionsPanelWidth() {
  return Number(getComputedStyle(document.documentElement).getPropertyValue("--cb-sessions-width").replace("px", "")) || DEFAULT_SESSIONS_WIDTH;
}

function normalizeForLocalIntent(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function syncMetaControls(session) {
  const meta = syncMetaForLevelAndGrade(session?.meta || {});
  setValue("cbLevelSelect", meta.level);
  renderGradeOptions(meta.level, meta.grade);
  setValue("cbModeSelect", meta.mode);
  setValue("cbGradeSelect", meta.grade);
  setValue("cbTrimesterSelect", meta.trimester);
  setValue("cbUnitSelect", meta.unit);
  renderCategoryAndSubtopicControls(meta);
  renderEditionOptions(meta.edition);
  renderGeminiModelOptions(meta.model);
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el && value != null) el.value = value;
}

let persistTimer = null;
function persistDebounced() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persist(), 450);
}

function setComposerBusy(busy = false) {
  const input = document.getElementById("cbComposerInput");
  const sendBtn = document.querySelector(".cb-send-button");
  const modelBtn = document.getElementById("cbComposerModelBtn");
  const notesBtn = document.getElementById("cbGenerateGlobalNotesBtn");
  if (input) input.disabled = !!busy;
  if (sendBtn) sendBtn.disabled = !!busy;
  if (modelBtn) modelBtn.disabled = !!busy;
  if (notesBtn) notesBtn.disabled = !!busy;
}


async function persist({ silent = false } = {}) {
  const session = store.getState().session;
  const saved = await saveSession({ ...session, title: buildTitle(session) }).catch((error) => {
    toast(`No se guardó en Firebase: ${error.message}`);
    console.error("[charly-brown] saveSession failed", error);
    return null;
  });
  if (saved && !silent) toast("Sesión guardada");
}

function buildTitle(session) {
  const meta = session.meta || {};
  const readingTitle = stripHtml(session.accepted?.reading?.title || session.reading?.title || "");
  return readingTitle || `${meta.grade || "Primaria"} · ${formatSubtopicLabel(meta.subtopic || meta.category || "Unidad")} · U${meta.unit || ""}`;
}

async function ensureSyaReadyForGeneration() {
  const session = store.getState().session;
  const activeSya = session.accepted?.sya || session.sya;
  if (activeSya) return activeSya;
  await handleLoadSya({ silent: true, replaceExisting: true });
  const updated = store.getState().session;
  return updated.accepted?.sya || updated.sya || null;
}

function bindComposerFooterLayout() {
  const update = () => syncComposerFooterLayout();
  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, { passive: true });
  requestAnimationFrame(update);
}

function syncComposerFooterLayout() {
  const footer = document.querySelector(".cb-composer-footer");
  const chat = document.querySelector(".cb-unit-chat");
  if (!footer || !chat) return;
  const rect = chat.getBoundingClientRect();
  const horizontalInset = 18;
  const left = Math.max(0, rect.left + horizontalInset);
  const maxWidth = Math.max(260, window.innerWidth - left - 10);
  const width = Math.min(maxWidth, Math.max(260, rect.width - (horizontalInset * 2)));
  footer.style.left = `${left}px`;
  footer.style.width = `${width}px`;
}

function renderCategoryAndSubtopicControls(meta = {}) {
  const safeMeta = syncMetaForLevelAndGrade(meta);
  renderCategoryOptions(safeMeta.grade, safeMeta.category);
  renderSubtopicOptions(safeMeta.grade, safeMeta.category, safeMeta.subtopic);
}

function renderGradeOptions(level = "Primaria", selectedGrade = "") {
  const select = document.getElementById("cbGradeSelect");
  if (!select) return;
  const grades = getGradesForLevel(level);
  const current = grades.includes(selectedGrade) ? selectedGrade : grades[0] || "";
  select.innerHTML = grades.map((grade) => `
    <option value="${escapeAttr(grade)}"${grade === current ? " selected" : ""}>${escapeHtmlText(grade)}</option>
  `).join("");
}

function renderEditionOptions(selectedEdition = "") {
  const select = document.getElementById("cbEditionInput");
  if (!select) return;
  const options = buildEditionOptions();
  const current = options.includes(selectedEdition) ? selectedEdition : "10va";
  select.innerHTML = options.map((edition) => `
    <option value="${escapeAttr(edition)}"${edition === current ? " selected" : ""}>${escapeHtmlText(edition)}</option>
  `).join("");
}

function buildEditionOptions() {
  const base = ["1ra", "2da", "3ra", "4ta", "5ta", "6ta", "7ma", "8va", "9na"];
  const out = [];
  for (let index = 1; index <= 30; index += 1) {
    out.push(index <= base.length ? base[index - 1] : `${index}va`);
  }
  return out;
}

function renderCategoryOptions(grade = "", selectedCategory = "") {
  const select = document.getElementById("cbCategorySelect");
  if (!select) return;
  const categories = Object.keys(getCategoriesForGrade(grade));
  const options = [ALL_OPTION, ...categories];
  const current = options.includes(selectedCategory) ? selectedCategory : ALL_OPTION;
  select.innerHTML = options.map((category) => `
    <option value="${escapeAttr(category)}"${category === current ? " selected" : ""}>${escapeHtmlText(category)}</option>
  `).join("");
}

function renderSubtopicOptions(grade = "", category = "", selectedSubtopic = "") {
  const select = document.getElementById("cbSubtopicSelect");
  if (!select) return;
  const categoryMap = getCategoriesForGrade(grade);
  const categoryKey = category && category !== ALL_OPTION && categoryMap[category] ? category : ALL_OPTION;
  const subtopics = categoryKey === ALL_OPTION
    ? Array.from(new Set(Object.values(categoryMap).flat()))
    : (Array.isArray(categoryMap[categoryKey]) ? categoryMap[categoryKey] : []);
  const options = [ALL_OPTION, ...subtopics];
  const current = options.includes(selectedSubtopic) ? selectedSubtopic : ALL_OPTION;
  select.innerHTML = options.map((subtopic) => `
    <option value="${escapeAttr(subtopic)}"${subtopic === current ? " selected" : ""}>${escapeHtmlText(formatSubtopicLabel(subtopic))}</option>
  `).join("");
}

function syncCategorySubtopicForGrade(meta = {}) {
  const categoryMap = getCategoriesForGrade(meta.grade);
  const categories = Object.keys(categoryMap);
  const category = meta.category === ALL_OPTION || categories.includes(meta.category) ? meta.category : ALL_OPTION;
  const allSubtopics = Array.from(new Set(Object.values(categoryMap).flat()));
  const availableSubtopics = category === ALL_OPTION ? allSubtopics : (Array.isArray(categoryMap[category]) ? categoryMap[category] : []);
  const subtopic = meta.subtopic === ALL_OPTION || availableSubtopics.includes(meta.subtopic) ? meta.subtopic : ALL_OPTION;
  return { ...meta, category, subtopic };
}

function syncMetaForLevelAndGrade(meta = {}) {
  const grades = getGradesForLevel(meta.level);
  const grade = grades.includes(meta.grade) ? meta.grade : grades[0] || "";
  return syncCategorySubtopicForGrade({ ...meta, grade, category: meta.category || ALL_OPTION, subtopic: meta.subtopic || ALL_OPTION });
}

function formatSubtopicLabel(value = "") {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bDeLetras\b/g, "de Letras")
    .trim();
}

function sameSerializedObject(a, b) {
  try {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  } catch (_) {
    return false;
  }
}

function buildSyaContextKey(meta = {}) {
  return [
    String(meta.level || ""),
    String(meta.grade || ""),
    String(meta.trimester || ""),
    String(meta.unit || "")
  ].join("|");
}

async function editSyaForCurrentSession() {
  await handleLoadSya({ silent: false, replaceExisting: true });
  const session = store.getState().session;
  const activeSya = session.accepted?.sya || session.sya || null;
  const originalSya = session.accepted?.syaOriginal || session.syaOriginal || activeSya;
  if (!activeSya) {
    toast("Primero carga la secuencia y alcance.");
    return;
  }

  const raw = await openSyaEditorModal(activeSya, session.meta || {});
  if (raw == null) return;

  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      store.addMessage({ role: "assistant", text: `No pude guardar la secuencia editada: JSON inválido. ${error.message}` });
      return;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    store.addMessage({ role: "assistant", text: "La secuencia editada debe ser un objeto JSON con claves y valores de S&A." });
    return;
  }

  store.patchSession({
    sya: parsed,
    accepted: {
      ...(session.accepted || {}),
      sya: parsed,
      syaOriginal: originalSya
    },
    syaOriginal: originalSya
  });
  store.addPreference("Usar la secuencia y alcance editada por el usuario como fuente principal para generar activities y notas.");
  flashWorkingStatus();
  await persist();
}

async function restoreOriginalSyaForCurrentSession() {
  const session = store.getState().session;
  const originalSya = session.accepted?.syaOriginal || session.syaOriginal || null;
  if (!originalSya) {
    toast("No hay una secuencia original para restaurar.");
    return;
  }
  store.patchSession({
    sya: originalSya,
    accepted: {
      ...(session.accepted || {}),
      sya: originalSya,
      syaOriginal: originalSya
    }
  });
  flashWorkingStatus();
  await persist();
}

function flashWorkingStatus(label = "Working", duration = 900) {
  clearTimeout(transientNoticeTimer);
  chatController?.showTransientStatus(label);
  transientNoticeTimer = setTimeout(() => {
    chatController?.clearTransientStatus();
  }, duration);
}

function proposeNextWorkflowStep() {
  const session = store.getState().session;
  const unit = session.units?.find((item) => item.id === session.activeUnitId);
  if (!unit) return;
  const next = getNextWorkflowStep(unit.workflow || {});
  const labels = {
    reading: ["Lectura", "Redactar la lectura narrativa de la unidad."],
    synonyms: ["Sinónimos", "Preparar la tabla con palabras tomadas de la lectura aprobada."],
    comprehension: ["Comprensión", "Crear las preguntas y respuestas esperadas sin duplicar la lectura."]
  };
  if (labels[next.kind]) {
    const [title, description] = labels[next.kind];
    store.addMessage({
      role: "assistant",
      workflowKind: next.kind,
      html: `<section class="cb-workflow-suggestion"><p class="cb-panel-kicker">Siguiente sección</p><h3>${escapeHtmlText(title)}</h3><p>${escapeHtmlText(description)}</p><div><button type="button" data-workflow-action="generate-reading">Generar propuesta</button><button type="button" class="cb-text-button" data-workflow-action="skip-stage" data-workflow-stage="${escapeAttr(next.kind)}">Omitir</button></div></section>`
    });
    return;
  }
  if (next.kind === "activity-selection") {
    store.addMessage({ role: "assistant", workflowKind: next.kind, html: `<section class="cb-workflow-suggestion"><p class="cb-panel-kicker">Siguiente sección</p><h3>Actividades</h3><p>Elige las áreas que se trabajarán. Prepararé una propuesta a la vez.</p><div><button type="button" data-workflow-action="select-activities">Elegir secciones</button></div></section>` });
    return;
  }
  if (next.kind === "activity") {
    store.addMessage({ role: "assistant", workflowKind: `activity:${next.sectionId || next.section}:${next.subtopic || ""}`, html: `<section class="cb-workflow-suggestion"><p class="cb-panel-kicker">Siguiente actividad</p><h3>${escapeHtmlText(formatSubtopicLabel(next.subtopic || next.section))}</h3><p>${escapeHtmlText(next.description || "La propuesta se alineará con la lectura disponible y la secuencia y alcance.")}</p><div><button type="button" data-workflow-action="generate-activity" data-workflow-section="${escapeAttr(next.section)}" data-workflow-section-id="${escapeAttr(next.sectionId || "")}" data-workflow-subtopic="${escapeAttr(next.subtopic || "")}">Generar actividad</button></div></section>` });
  }
}

function proposeResourcesForActivity(activity = null) {
  if (!activity?.id) {
    proposeNextWorkflowStep();
    return;
  }
  store.addMessage({
    role: "assistant",
    workflowKind: `resources:${activity.id}`,
    html: `<section class="cb-workflow-suggestion"><p class="cb-panel-kicker">Recursos para la actividad</p><h3>${escapeHtmlText(activity.section || activity.title || "Actividad")}</h3><p>Puedo preparar fichas, anexos, recortables o un video vinculados únicamente a esta actividad.</p><div><button type="button" data-workflow-action="generate-resources" data-activity-id="${escapeAttr(activity.id)}">Elegir recursos</button><button type="button" class="cb-text-button" data-workflow-action="generate-activity">Continuar</button></div></section>`
  });
}

async function handleGenerateResourcesForActivity(activityId = "") {
  const session = store.getState().session;
  const activity = session.accepted?.activities?.find((item) => item.id === activityId);
  if (!activity) return toast("La actividad vinculada ya no existe.");
  const selected = await openResourcesModal();
  if (!selected) return;
  const labels = Object.entries(selected).filter(([, enabled]) => enabled).map(([key]) => ({ fichas: "ficha", anexos: "anexo", recortables: "recortable", videos: "video como producto final" }[key])).filter(Boolean);
  if (!labels.length) {
    proposeNextWorkflowStep();
    return;
  }
  const prompt = `Diseña ${labels.join(", ")} para la actividad con id ${activity.id}, sección ${activity.section || ""}. Crea cada recurso como propuesta independiente, conserva targetActivityId=${activity.id} y no modifiques la actividad.`;
  store.addMessage({ role: "user", text: prompt });
  setComposerBusy(true);
  chatController?.showTransientStatus("Diseñando recursos...");
  try {
    const proposalIds = new Set((session.proposals || []).map((item) => item.id));
    const result = await sendCharlyChat({ sessionId: session.id, targetUnitId: session.activeUnitId, text: prompt, model: session.meta?.model }).catch((error) => ({ error }));
    if (result.error) {
      store.addMessage({ role: "assistant", text: `No pude preparar los recursos: ${result.error.message}` });
      return;
    }
    if (result.session) store.setSession(result.session);
    const proposals = (store.getState().session.proposals || []).filter((proposal) => !proposalIds.has(proposal.id));
    proposals.reverse().forEach((proposal) => store.addMessage({ role: "assistant", html: renderProposalMessage(proposal), proposalId: proposal.id }));
    await persist();
  } finally {
    chatController?.clearTransientStatus();
    setComposerBusy(false);
  }
}

function openSyaEditorModal(initialValue = "", meta = {}) {
  const modal = document.getElementById("cbSyaModal");
  const editor = document.getElementById("cbSyaModalEditor");
  if (!modal || !editor) return Promise.resolve(null);
  destroyActivityRichTextEditor();
  modal.classList.remove("cb-modal--rich-editor");
  const titleEl = modal.querySelector("#cbSyaModalTitle");
  if (titleEl) titleEl.textContent = "Editar secuencia y alcance";
  editor.setAttribute("aria-label", "Secciones de secuencia y alcance");
  syaEditorDraft = copyValue(parseSyaEditorSource(initialValue));
  const session = store.getState().session;
  syaEditorOriginal = copyValue(session.accepted?.syaOriginal || session.syaOriginal || syaEditorDraft);
  syaEditorMeta = { ...meta };
  renderSyaEditor(editor, syaEditorDraft, syaEditorMeta);
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  editor.querySelector("[data-sya-section]")?.focus();
  return new Promise((resolve) => {
    pendingSyaModalResolver = (result) => {
      pendingSyaModalResolver = null;
      closeSyaEditorModal();
      if (!result || result.action !== "save") return resolve(null);
      return resolve(result.value);
    };
  });
}

function openResourcesModal(initialValue = pendingResourceSelections) {
  const modal = document.getElementById("cbResourcesModal");
  if (!modal) return Promise.resolve(null);
  pendingResourceSelections = {
    fichas: Boolean(initialValue?.fichas),
    anexos: Boolean(initialValue?.anexos),
    recortables: Boolean(initialValue?.recortables),
    videos: Boolean(initialValue?.videos)
  };
  syncResourceModalUi();
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  return new Promise((resolve) => {
    pendingResourcesModalResolver = (result) => {
      pendingResourcesModalResolver = null;
      closeResourcesModal();
      if (!result || result.action !== "save") return resolve(null);
      return resolve(result.value);
    };
  });
}

function syncResourceModalUi() {
  const modal = document.getElementById("cbResourcesModal");
  if (!modal) return;
  modal.querySelectorAll("[data-resource-toggle]").forEach((button) => {
    const key = String(button.dataset.resourceToggle || "").trim();
    const selected = Boolean(pendingResourceSelections[key]);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function closeResourcesModal() {
  const modal = document.getElementById("cbResourcesModal");
  if (modal && !modal.hidden) {
    const active = document.activeElement;
    if (active && modal.contains(active) && typeof active.blur === "function") active.blur();
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.inert = true;
  }
}

function renderReadingsModal() {
  const list = document.getElementById("cbReadingModalList");
  if (!list) return;
  const readings = filterReadingsForModal(currentReadingOptions, readingFilter);
  const groups = [
    { id: "lecturasASC", label: "Lecturas ASC" },
    { id: "lecturasNuevas", label: "Lecturas nuevas" }
  ];
  list.innerHTML = groups.map((group) => {
    const items = readings.filter((reading) => reading.collection === group.id);
    return `<section class="cb-reading-modal-group" data-reading-collection="${escapeAttr(group.id)}">
      <header><strong>${escapeHtmlText(group.label)}</strong><span>${items.length}</span></header>
      <div class="cb-reading-modal-group-list">
        ${items.length ? items.map(renderReadingCardForModal).join("") : `<div class="cb-empty">No hay lecturas en esta colección${readingFilter ? " con este filtro" : ""}.</div>`}
      </div>
    </section>`;
  }).join("");
}

function filterReadingsForModal(readings = [], filter = "") {
  const needle = normalizeForLocalIntent(filter);
  if (!needle) return readings;
  return readings.filter((reading) => normalizeForLocalIntent([
    reading.title,
    reading.text,
    reading.collection,
    reading.sourceLabel,
    reading.meta?.nivel,
    reading.meta?.grado,
    reading.meta?.trimestre,
    reading.meta?.unidad
  ].join(" ")).includes(needle));
}

function renderReadingCardForModal(reading = {}) {
  const questionsCount = Array.isArray(reading.questions) ? reading.questions.length : 0;
  const synonymsCount = Array.isArray(reading.sections?.synonyms) ? reading.sections.synonyms.length : 0;
  return `
    <article class="cb-reading-option cb-reading-option--panel" data-reading-ref="${escapeAttr(readingReference(reading))}">
      <div>
        <p class="cb-panel-kicker">${escapeHtmlText(reading.sourceLabel || reading.collection || "Lectura")}</p>
        <h3>${escapeHtmlText(reading.title || "Lectura sin título")}</h3>
        <span>${escapeHtmlText([reading.meta?.nivel, reading.meta?.grado, reading.meta?.trimestre ? `T${reading.meta.trimestre}` : "", reading.meta?.unidad ? `U${reading.meta.unidad}` : ""].filter(Boolean).join(" · "))}</span>
        <p>${escapeHtmlText(String(reading.text || "").slice(0, 160))}</p>
        <span>${escapeHtmlText([
          questionsCount ? `${questionsCount} preguntas` : "Sin preguntas",
          synonymsCount ? `${synonymsCount} sinónimos` : ""
        ].filter(Boolean).join(" · "))}</span>
      </div>
      <button type="button" data-reading-action="use">Usar</button>
    </article>
  `;
}

function closeSyaEditorModal() {
  const modal = document.getElementById("cbSyaModal");
  if (modal && !modal.hidden) {
    const active = document.activeElement;
    if (active && modal.contains(active) && typeof active.blur === "function") active.blur();
    destroyActivityRichTextEditor();
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.inert = true;
  }
  closeSyaSectionEditor();
  syaEditorDraft = null;
  syaEditorOriginal = null;
  syaEditorMeta = null;
  activeSyaEditorSection = null;
}

function destroyActivityRichTextEditor() {
  const textarea = document.getElementById("cbActivityEditorTextarea");
  const jq = window.jQuery;
  if (textarea && jq?.fn?.trumbowyg && jq(textarea).data("trumbowyg")) {
    jq(textarea).trumbowyg("destroy");
  }
}

function closeUnitDataModal() {
  const modal = document.getElementById("cbUnitDataModal");
  if (!modal || modal.hidden) return;
  const active = document.activeElement;
  if (active && modal.contains(active) && typeof active.blur === "function") active.blur();
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  modal.inert = true;
  delete modal.dataset.mode;
}

function parseSyaEditorSource(source = "") {
  if (!source) return {};
  if (typeof source === "object") return source;
  try {
    return JSON.parse(String(source));
  } catch (_) {
    return {};
  }
}

function renderSyaEditor(container, data = {}, meta = {}) {
  if (!container) return;
  const groups = buildEditableSyaGroups(data, meta);
  const sections = groups.flatMap((group) => group.items.map((item) => ({ ...item, category: group.category || "" })));
  if (!sections.length) {
    container.innerHTML = `<div class="cb-empty">No hay campos visibles para editar.</div>`;
    return;
  }
  container.innerHTML = `<div class="cb-sya-section-grid cb-sya-section-grid--continuous">
    ${sections.map((item) => {
      const completed = Object.values(item.fields || {}).filter((value) => String(value || "").trim()).length;
      const detail = [item.category, `${completed} de 4 campos`].filter(Boolean).join(" · ");
      return `<button type="button" class="cb-sya-section-card" data-sya-section data-sya-category="${escapeAttr(item.category)}" data-sya-subtopic="${escapeAttr(item.subtopic || "")}">
        <span><strong>${escapeHtmlText(formatSubtopicLabel(item.subtopic || "Subtema"))}</strong><small>${escapeHtmlText(detail)}</small></span>
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>`;
    }).join("")}
  </div>`;
}

function openSyaSectionEditor(category = "", subtopic = "", { create = false } = {}) {
  const section = create
    ? { category: "", subtopic: "", fields: { T: "", AE: "", C: "", P: "" }, keys: {}, isNew: true }
    : findEditableSyaSection(syaEditorDraft, syaEditorMeta, category, subtopic);
  const modal = document.getElementById("cbSyaSectionModal");
  const form = document.getElementById("cbSyaSectionForm");
  if (!section || !modal || !form) return;
  activeSyaEditorSection = section;
  document.getElementById("cbSyaSectionModalKicker").textContent = create ? "Nuevo subtema" : category || "Secuencia y alcance";
  document.getElementById("cbSyaSectionModalTitle").textContent = create ? "Crear subtema" : formatSubtopicLabel(subtopic || "Editar subtema");
  document.getElementById("cbSyaSectionName").value = subtopic || "";
  populateSyaCategorySelect(category);
  form.querySelectorAll("[data-sya-section-field]").forEach((field) => {
    field.value = section.fields[field.dataset.syaSectionField] || "";
  });
  const original = create ? null : findEditableSyaSection(syaEditorOriginal, syaEditorMeta, category, subtopic);
  document.getElementById("cbSyaSectionRestore").hidden = create || !original;
  const browserModal = document.getElementById("cbSyaModal");
  if (browserModal) browserModal.inert = true;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  document.getElementById("cbSyaSectionName")?.focus();
}

function closeSyaSectionEditor() {
  const modal = document.getElementById("cbSyaSectionModal");
  if (!modal || modal.hidden) return;
  const active = document.activeElement;
  if (active && modal.contains(active) && typeof active.blur === "function") active.blur();
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  modal.inert = true;
  const browserModal = document.getElementById("cbSyaModal");
  if (browserModal && !browserModal.hidden) browserModal.inert = false;
  activeSyaEditorSection = null;
}

function saveSyaSectionEditor() {
  const form = document.getElementById("cbSyaSectionForm");
  if (!form || !activeSyaEditorSection || !syaEditorDraft) return;
  if (!form.reportValidity()) return;
  const subtopic = String(document.getElementById("cbSyaSectionName")?.value || "").trim();
  const category = String(document.getElementById("cbSyaSectionCategory")?.value || "").trim();
  const baseKey = resolveSyaBaseKeyForSubtopic(subtopic);
  if (!subtopic || !category || !baseKey) return;
  const duplicate = buildEditableSyaGroups(syaEditorDraft, syaEditorMeta)
    .flatMap((group) => group.items)
    .find((item) => resolveSyaBaseKeyForSubtopic(item.subtopic) === baseKey && item.keys?.T !== activeSyaEditorSection.keys?.T);
  if (duplicate) {
    toast("Ya existe un subtema con ese nombre.");
    return;
  }
  const previousKeys = activeSyaEditorSection.keys || {};
  const nextKeys = { T: `${baseKey}_T`, AE: `${baseKey}_AE`, C: `${baseKey}_C`, P: `${baseKey}_P` };
  if (!activeSyaEditorSection.isNew && previousKeys.T !== nextKeys.T) {
    Object.values(previousKeys).forEach((key) => delete syaEditorDraft[key]);
  }
  form.querySelectorAll("[data-sya-section-field]").forEach((field) => {
    syaEditorDraft[nextKeys[field.dataset.syaSectionField]] = String(field.value || "").trim();
  });
  const metadata = normalizeSyaSubtopicMetadata(syaEditorDraft[SYA_SUBTOPIC_META_KEY]);
  const previousBaseKey = String(previousKeys.T || "").replace(/_T$/, "");
  if (previousBaseKey && previousBaseKey !== baseKey) delete metadata[previousBaseKey];
  metadata[baseKey] = { name: subtopic, category };
  syaEditorDraft[SYA_SUBTOPIC_META_KEY] = metadata;
  closeSyaSectionEditor();
  renderSyaEditor(document.getElementById("cbSyaModalEditor"), syaEditorDraft, syaEditorMeta);
}

function restoreSyaSectionEditor() {
  if (!activeSyaEditorSection) return;
  const original = findEditableSyaSection(syaEditorOriginal, syaEditorMeta, activeSyaEditorSection.category, activeSyaEditorSection.subtopic);
  const form = document.getElementById("cbSyaSectionForm");
  if (original) {
    document.getElementById("cbSyaSectionName").value = original.subtopic || "";
    populateSyaCategorySelect(original.category || "");
  }
  form?.querySelectorAll("[data-sya-section-field]").forEach((field) => {
    field.value = original?.fields?.[field.dataset.syaSectionField] || "";
  });
}

function findEditableSyaSection(source = {}, meta = {}, category = "", subtopic = "") {
  const group = buildEditableSyaGroups(source || {}, meta || {}).find((item) => item.category === category);
  const section = group?.items.find((item) => item.subtopic === subtopic);
  return section ? { ...section, category } : null;
}

function copyValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function buildUnitDataEditor(meta = {}) {
  const level = String(meta.level || "Primaria");
  const grades = getGradesForLevel(level);
  const categories = Object.keys(getCategoriesForGrade(meta.grade || grades[0] || ""));
  return `
    <div class="cb-unit-data-grid">
      ${field("Nivel", `
        <select data-unit-field="level">
          ${["Preescolar", "Primaria", "Secundaria"].map((item) => `<option value="${escapeAttr(item)}"${item === level ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
        </select>
      `)}
      ${field("Voy a crear", `
        <select data-unit-field="mode">
          ${["Alumno", "Maestro"].map((item) => `<option value="${escapeAttr(item)}"${item === meta.mode ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
        </select>
      `)}
      ${field("Grado", `
        <select data-unit-field="grade">
          ${grades.map((item) => `<option value="${escapeAttr(item)}"${item === meta.grade ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
        </select>
      `)}
      ${field("Trimestre", `
        <select data-unit-field="trimester">
          ${["1", "2", "3"].map((item) => `<option value="${escapeAttr(item)}"${item === String(meta.trimester || "") ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
        </select>
      `)}
      ${field("Edición", `
        <select data-unit-field="edition">
          ${buildEditionOptions().map((item) => `<option value="${escapeAttr(item)}"${item === meta.edition ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
        </select>
      `)}
      ${field("Categoría", `
        <select data-unit-field="category">
          ${[ALL_OPTION, ...categories].map((item) => `<option value="${escapeAttr(item)}"${item === meta.category ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
        </select>
      `)}
    </div>
  `;
}

function buildNewUnitEditor(meta = {}, units = [], readings = [], initialReadingMode = "existing") {
  const current = Number.parseInt(String(meta.unit || ""), 10);
  const suggested = Number.isFinite(current) && current < 10
    ? String(current + 1)
    : String(Math.min((Array.isArray(units) ? units.length : 0) + 1, 10));
  return `
    <div class="cb-unit-data-grid cb-unit-data-grid--new-unit">
      ${field("Unidad", `
        <select data-unit-field="unit">
          ${["proyecto", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((item) => `<option value="${escapeAttr(item)}"${item === suggested ? " selected" : ""}>${escapeHtmlText(item === "proyecto" ? "Proyecto" : `Unidad ${item}`)}</option>`).join("")}
        </select>
      `)}
      ${field("Título", `<input type="text" data-unit-field="title" maxlength="120" placeholder="Tema o título de la unidad">`)}
      <fieldset class="cb-reading-mode-fieldset">
        <legend>Lectura de la unidad</legend>
        <div class="cb-reading-mode-control" role="radiogroup" aria-label="Modo de lectura">
          ${readingModeOption("existing", "Elegir existente", initialReadingMode === "existing", "Selecciona una lectura de ASC o de Lecturas nuevas.")}
          ${readingModeOption("chat", "Crear con el chat", initialReadingMode === "chat", "El agente te ayudará a construirla y aprobarla por etapas.")}
          ${readingModeOption("none", "No usar lectura", initialReadingMode === "none", "La unidad comenzará con la selección de actividades.")}
        </div>
      </fieldset>
      <section class="cb-new-unit-reading-picker" data-new-unit-reading-picker>
        <div class="cb-new-unit-reading-toolbar">
          <label class="cb-field-group"><span>Buscar</span><input type="search" data-new-unit-reading-search placeholder="Título, tema o texto"></label>
          <label class="cb-field-group"><span>Grado</span><select data-new-unit-reading-filter="grade">${buildReadingFilterOptions(readings, "grado", "Todos los grados")}</select></label>
          <label class="cb-field-group"><span>Trimestre</span><select data-new-unit-reading-filter="trimester">${buildReadingFilterOptions(readings, "trimestre", "Todos los trimestres")}</select></label>
        </div>
        <div class="cb-new-unit-reading-lists" data-new-unit-reading-lists>
          ${renderNewUnitReadingLists(readings)}
        </div>
      </section>
    </div>
  `;
}

function buildEditUnitEditor(unit = {}) {
  const currentUnit = String(unit?.meta?.unit || "1");
  return `
    <div class="cb-unit-data-grid cb-unit-data-grid--edit-unit">
      ${field("Unidad", `
        <select data-unit-field="unit">
          ${["proyecto", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((item) => `<option value="${escapeAttr(item)}"${item === currentUnit ? " selected" : ""}>${escapeHtmlText(item === "proyecto" ? "Proyecto" : `Unidad ${item}`)}</option>`).join("")}
        </select>
      `)}
      ${field("Título", `<input type="text" data-unit-field="title" maxlength="120" value="${escapeAttr(unit?.title || "")}" placeholder="Tema o título de la unidad">`)}
    </div>
  `;
}

function readingModeOption(value, title, checked, description) {
  return `<label class="cb-reading-mode-option"><input type="radio" name="cb-reading-mode" data-unit-field="readingMode" value="${escapeAttr(value)}"${checked ? " checked" : ""}><span><strong>${escapeHtmlText(title)}</strong><small>${escapeHtmlText(description)}</small></span></label>`;
}

function renderNewUnitReadingLists(readings = [], filters = {}) {
  const filtered = filterNewUnitReadings(readings, filters);
  return [
    ["lecturasNuevas", "Lecturas nuevas"],
    ["lecturasASC", "Lecturas ASC"]
  ].map(([collection, label]) => {
    const items = filtered.filter((reading) => reading.collection === collection);
    return `<section class="cb-new-unit-reading-group" data-reading-collection="${escapeAttr(collection)}">
      <header><strong>${escapeHtmlText(label)}</strong><span>${items.length}</span></header>
      <div>${items.length ? items.map(renderNewUnitReadingChoice).join("") : `<p class="cb-empty">No hay lecturas con estos filtros.</p>`}</div>
    </section>`;
  }).join("");
}

function renderNewUnitReadingChoice(reading = {}, index = 0) {
  const reference = readingReference(reading);
  const questions = reading.sections?.questions?.length || reading.questions?.length || 0;
  const synonyms = reading.sections?.synonyms?.length || 0;
  return `<label class="cb-new-unit-reading-choice" data-reading-search-text="${escapeAttr([reading.title, reading.text, reading.meta?.nivel, reading.meta?.grado, reading.meta?.trimestre].join(" "))}">
    <input type="radio" name="cb-new-unit-reading" data-unit-field="readingRef" value="${escapeAttr(reference)}"${index === 0 ? "" : ""}>
    <span>
      <strong>${escapeHtmlText(reading.title || "Lectura sin título")}</strong>
      <small>${escapeHtmlText([reading.meta?.nivel || "Sin nivel", reading.meta?.grado || "Sin grado", reading.meta?.trimestre ? `Trimestre ${reading.meta.trimestre}` : "Sin trimestre"].join(" · "))}</small>
      <em>${escapeHtmlText(String(reading.text || "").slice(0, 120))}</em>
      <small>${synonyms ? `${synonyms} sinónimos` : "Sin sinónimos"} · ${questions ? `${questions} preguntas` : "Sin preguntas"}</small>
    </span>
  </label>`;
}

function buildReadingFilterOptions(readings = [], key = "grado", allLabel = "Todos") {
  const values = [...new Set(readings.map((reading) => String(reading.meta?.[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return [`<option value="">${escapeHtmlText(allLabel)}</option>`, ...values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtmlText(value)}</option>`)].join("");
}

function bindNewUnitReadingControls(editor) {
  const refresh = () => {
    const search = editor.querySelector("[data-new-unit-reading-search]")?.value || "";
    const grade = editor.querySelector("[data-new-unit-reading-filter='grade']")?.value || "";
    const trimester = editor.querySelector("[data-new-unit-reading-filter='trimester']")?.value || "";
    const lists = editor.querySelector("[data-new-unit-reading-lists]");
    if (lists) lists.innerHTML = renderNewUnitReadingLists(currentReadingOptions, { search, grade, trimester });
  };
  editor.querySelector("[data-new-unit-reading-search]")?.addEventListener("input", refresh);
  editor.querySelectorAll("[data-new-unit-reading-filter]").forEach((control) => control.addEventListener("change", refresh));
  syncNewUnitReadingMode(editor);
}

function syncNewUnitReadingMode(editor) {
  const mode = editor.querySelector("input[name='cb-reading-mode']:checked")?.value || "existing";
  const picker = editor.querySelector("[data-new-unit-reading-picker]");
  if (picker) picker.hidden = mode !== "existing";
}

function filterNewUnitReadings(readings = [], { search = "", grade = "", trimester = "" } = {}) {
  const needle = normalizeForLocalIntent(search);
  return readings.filter((reading) => {
    if (grade && String(reading.meta?.grado || "") !== grade) return false;
    if (trimester && String(reading.meta?.trimestre || "") !== trimester) return false;
    if (!needle) return true;
    return normalizeForLocalIntent([reading.title, reading.text, reading.meta?.nivel, reading.meta?.grado, reading.meta?.trimestre, reading.meta?.unidad].join(" ")).includes(needle);
  });
}

function readingReference(reading = {}) {
  return `${reading.collection || ""}::${reading.id || ""}`;
}

function findReadingByReference(reference = "") {
  return currentReadingOptions.find((reading) => readingReference(reading) === reference) || null;
}

function field(label, control) {
  return `
    <label class="cb-field-group">
      <span>${escapeHtmlText(label)}</span>
      ${control}
    </label>
  `;
}

function buildSubtopicOptions(meta = {}) {
  const categoryMap = getCategoriesForGrade(meta.grade || "Primaria");
  const category = String(meta.category || "");
  const options = category && category !== ALL_OPTION && Array.isArray(categoryMap[category])
    ? categoryMap[category]
    : Array.from(new Set(Object.values(categoryMap).flat()));
  return [ALL_OPTION, ...options].map((value) => ({ value, label: formatSubtopicLabel(value) }));
}

function readUnitDataEditor(editor = null) {
  const data = {};
  editor?.querySelectorAll("[data-unit-field]").forEach((field) => {
    if ((field.type === "radio" || field.type === "checkbox") && !field.checked) return;
    data[field.dataset.unitField] = field.value;
  });
  return data;
}

function serializeSyaEditor(container) {
  const out = {};
  container?.querySelectorAll("[data-sya-key]").forEach((field) => {
    const key = String(field.dataset.syaKey || "").trim();
    const value = String(field.value || "").trim();
    if (!key) return;
    out[key] = value;
  });
  return out;
}

function formatSyaEditorLabel(key = "") {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .trim();
}

function getSyaFieldLabel(key = "") {
  if (key === "T") return "Tema (T)";
  if (key === "AE") return "Aprendizaje esperado (AE)";
  if (key === "C") return "Contenido (C)";
  if (key === "P") return "Proceso o práctica (P)";
  return formatSyaEditorLabel(key);
}

function buildEditableSyaGroups(source = {}, meta = {}) {
  const allMeta = { ...meta, category: ALL_OPTION, subtopic: ALL_OPTION };
  const groups = getSyaGroupedByCategory(allMeta, source).map((group) => ({
    category: group.category,
    items: group.items.map((item) => {
      const baseKey = resolveSyaBaseKeyForSubtopic(item.subtopic);
      return {
        subtopic: item.subtopic,
        fields: item.fields || { T: "", AE: "", C: "", P: "" },
        keys: { T: `${baseKey}_T`, AE: `${baseKey}_AE`, C: `${baseKey}_C`, P: `${baseKey}_P` }
      };
    })
  })).filter((group) => group.items.length);
  const metadata = normalizeSyaSubtopicMetadata(source?.[SYA_SUBTOPIC_META_KEY]);
  Object.entries(metadata).forEach(([baseKey, definition]) => {
    groups.forEach((group) => {
      group.items = group.items.filter((item) => resolveSyaBaseKeyForSubtopic(item.subtopic) !== baseKey);
    });
    let target = groups.find((group) => group.category === definition.category);
    if (!target) {
      target = { category: definition.category, items: [] };
      groups.push(target);
    }
    const keys = { T: `${baseKey}_T`, AE: `${baseKey}_AE`, C: `${baseKey}_C`, P: `${baseKey}_P` };
    target.items.push({
      subtopic: definition.name,
      fields: Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, String(source?.[key] || "").trim()])),
      keys
    });
  });
  return groups.filter((group) => group.items.length);
}

function populateSyaCategorySelect(selectedCategory = "") {
  const select = document.getElementById("cbSyaSectionCategory");
  if (!select) return;
  const categories = Array.from(new Set([
    ...Object.keys(getCategoriesForGrade(syaEditorMeta?.grade || "")),
    ...buildEditableSyaGroups(syaEditorDraft || {}, syaEditorMeta || {}).map((group) => group.category)
  ].filter((category) => category && category !== ALL_OPTION)));
  select.innerHTML = `<option value="">Selecciona una sección</option>${categories.map((category) => `<option value="${escapeAttr(category)}"${category === selectedCategory ? " selected" : ""}>${escapeHtmlText(category)}</option>`).join("")}`;
}

function normalizeSyaSubtopicMetadata(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([baseKey, definition]) => [String(baseKey || "").trim(), {
    name: String(definition?.name || "").trim(),
    category: String(definition?.category || "").trim()
  }]).filter(([baseKey, definition]) => baseKey && definition.name && definition.category));
}

function resolveSyaBaseKeyForSubtopic(subtopic = "") {
  const safe = String(subtopic || "").trim();
  if (!safe) return "";
  if (safe === "Comprensión lectora") return "Lectura";
  if (safe === "ComprensionLectora") return "Lectura";
  if (safe === "Ortografía") return "Ortografia";
  if (safe === "Expresión escrita") return "ExpresionEscrita";
  if (safe === "Expresión oral") return "ExpresionOral";
  if (safe === "Conocimiento del medio") return "ConocimientoDelMedio";
  return safe.replace(/\s+/g, "");
}

function buildGeneratedActivityTitle(meta = {}, difficulty = "") {
  const category = String(meta.category || "").trim();
  const subtopic = String(meta.subtopic || "").trim();
  const mode = getWorkModeLabel(meta);
  const focus = [category, subtopic].filter(Boolean).join(" · ");
  const difficultyLabel = difficulty === "challenging" || difficulty === "expert" ? "más difícil" : difficulty === "easy" ? "más fácil" : "";
  const suffix = difficultyLabel ? ` · ${difficultyLabel}` : "";
  if (mode === "proyecto") return `proyecto generado${focus ? ` · ${focus}` : ""}${suffix}`;
  return `actividades generadas${focus ? ` · ${focus}` : ""}${suffix}`;
}

function resourceSelectionsForType(type = "") {
  const safe = String(type || "").trim();
  return {
    fichas: safe === "ficha",
    anexos: safe === "anexo",
    recortables: safe === "recortable",
    videos: safe === "video"
  };
}

function buildResourceContextLabel(type = "") {
  if (type === "ficha") return "Ficha";
  if (type === "anexo") return "Anexo";
  if (type === "recortable") return "Recortable";
  if (type === "video") return "Video";
  return "Recurso";
}

function extractResourceCode(title = "", type = "") {
  const text = String(title || "").trim();
  const match = text.match(/\b(Ficha|Anexo|Recortable|Video)\s+([0-9]+[a-z]?)/i);
  if (match) return `${match[1]} ${match[2]}`;
  return buildResourceContextLabel(type);
}

function normalizeResourceType(value = "") {
  const text = String(value || "").toLowerCase();
  if (text.includes("ficha")) return "ficha";
  if (text.includes("anexo")) return "anexo";
  if (text.includes("recortable")) return "recortable";
  if (text.includes("video") || text.includes("guion")) return "video";
  return "";
}

function extractResourceBlocks(html = "") {
  if (typeof DOMParser === "undefined") return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  const nodes = Array.from(doc.querySelectorAll("[data-resource-type], [data-resource-section='true'], .resource-ficha, .resource-anexo, .resource-recortable, .resource-video, .guion-video"));
  return nodes.map((node) => {
    const type = normalizeResourceType(node.getAttribute("data-resource-type") || node.className || node.textContent || "");
    const title = String(node.querySelector("h1,h2,h3,h4,strong")?.textContent || node.textContent || buildResourceContextLabel(type)).trim();
    return {
      type,
      title,
      html: node.outerHTML,
      code: extractResourceCode(title, type)
    };
  }).filter((item) => item.type);
}

function stripResourceBlocks(html = "") {
  if (typeof DOMParser === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  doc.querySelectorAll("[data-resource-type], [data-resource-section='true'], .resource-ficha, .resource-anexo, .resource-recortable, .resource-video, .guion-video").forEach((node) => node.remove());
  return doc.body.innerHTML.replace(/^<div>|<\/div>$/g, "");
}

function escapeHtmlText(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value = "") {
  return escapeHtmlText(value);
}

boot().catch((error) => {
  console.error("[charly-brown] boot failed", error);
  toast("No se pudo iniciar Charly Brown.");
});
